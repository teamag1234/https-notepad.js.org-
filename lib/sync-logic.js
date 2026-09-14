import { getTransacciones, kajabiConfigurado, diagnosticoKajabi } from './kajabi.js';
import { getAllRecords } from './airtable.js';
import { sendPaymentReminder, sendFailedPaymentNotification, sendSyncReport } from './email.js';
import { dbConfigurada, q } from './admin/db.js';
import { crearMovimiento, categorizarIngreso } from './admin/finanzas.js';
import { aplicarPagoKajabi, aplicarFallidoKajabi } from './admin/airtable-pagos.js';

// Número de cuotas de la oferta (compras a plazos), deducido de la descripción
// del precio ("3 payments of €215.66") o del precio total frente a la cuota.
function cuotasDeOferta(t) {
  const desc = String(t.ofertaPrecioDesc || '');
  const m = desc.match(/(\d+)\s*(pagos?|payments?|cuotas?|plazos?)/i);
  if (m) return Number(m[1]);
  if (String(t.ofertaTipoPago || '').toLowerCase().includes('multiple') && t.ofertaPrecioTotal && t.importe) {
    const n = Math.round(t.ofertaPrecioTotal / t.importe);
    if (n >= 2 && n <= 24) return n;
  }
  return 1;
}

// ¿Es el primer pago de este alumno para esta oferta? (si ya hay un ingreso
// anterior con el mismo email y concepto, es una cuota o renovación)
async function esPrimerPago(t, fecha) {
  const filas = await q(
    `SELECT 1 FROM movimientos
     WHERE fuente = 'KAJABI' AND tipo = 'INGRESO' AND COALESCE(email, '') = $1 AND concepto = $2 AND fecha < $3 LIMIT 1`,
    [t.email || '', t.oferta || 'Pago Kajabi', fecha],
  );
  return filas.length === 0;
}

// Deja constancia del estado de la sincronización de ingresos Kajabi para que
// el dashboard pueda avisar si se para o falla.
async function marcarEstadoSync(valor) {
  if (!dbConfigurada()) return;
  await q(`
    INSERT INTO banco_config (clave, valor, actualizado_el) VALUES ('kajabi_ingresos_sync', $1, now())
    ON CONFLICT (clave) DO UPDATE SET valor = $1, actualizado_el = now()
  `, [String(valor).substring(0, 300)]).catch(() => {});
}

// Registra los cobros reales de Kajabi (API /v1/transactions, con importe)
// como INGRESOS en la base de datos del panel de administración. Idempotente:
// referencia única kajabi-<id> + comprobación por contenido (por si el seed o
// el webhook ya guardaron ese cobro con otra referencia).
async function registrarIngresosAdmin(transacciones) {
  const resumen = { nuevos: 0, errores: 0, fichasCreadas: 0, pagosAnotados: 0, plazosProgramados: 0, fallidosAnotados: 0 };
  if (!dbConfigurada()) return resumen;
  for (const t of transacciones) {
    try {
      const estado = String(t.estado).toLowerCase();
      if (String(t.accion || t.tipoPago || '').toLowerCase().includes('refund')) continue;
      if (!t.importe || isNaN(t.importe)) continue;
      const fecha = String(t.fecha || new Date().toISOString()).slice(0, 10);
      const concepto = t.oferta || 'Pago Kajabi';

      // Cobro FALLIDO: se anota en Airtable como pendiente (ABIERTO) y listo.
      // Solo fallos recientes: los meses pasados ya se gestionaron a mano.
      if (estado === 'failed') {
        const haceUnaSemana = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        if (fecha < haceUnaSemana) continue;
        const anotFallo = await aplicarFallidoKajabi({ email: t.email, importe: t.importe, fecha }).catch((e) => {
          console.error(`Error anotando fallido ${t.id} en Airtable:`, e.message);
          return { anotado: false };
        });
        if (anotFallo.anotado) resumen.fallidosAnotados += 1;
        continue;
      }
      if (estado !== 'succeeded') continue;

      const yaExiste = await q(
        `SELECT 1 FROM movimientos
         WHERE fuente = 'KAJABI' AND tipo = 'INGRESO' AND fecha = $1 AND importe = $2 AND COALESCE(email, '') = $3 LIMIT 1`,
        [fecha, t.importe, t.email || ''],
      );
      if (yaExiste.length) continue;
      const esPrimera = await esPrimerPago(t, fecha);
      const creado = await crearMovimiento({
        tipo: 'INGRESO',
        fecha,
        importe: t.importe,
        concepto,
        categoria: categorizarIngreso(concepto),
        contacto: t.nombre || null,
        email: t.email || null,
        fuente: 'KAJABI',
        referencia: `kajabi-${t.id}`,
      });
      if (!creado) continue;
      resumen.nuevos += 1;

      // Ficha y pago del mes en Airtable (solo para cobros vistos por primera
      // vez, así nunca se anota dos veces el mismo cobro)
      try {
        const anot = await aplicarPagoKajabi({
          nombre: t.nombre,
          email: t.email,
          oferta: t.oferta,
          importe: t.importe,
          fecha,
          cuotas: cuotasDeOferta(t),
          esPrimera,
        });
        if (anot.fichaCreada) resumen.fichasCreadas += 1;
        if (anot.anotado) resumen.pagosAnotados += 1;
        resumen.plazosProgramados += anot.plazosProgramados;
      } catch (error) {
        resumen.errores += 1;
        console.error(`Error anotando el cobro ${t.id} en Airtable:`, error.message);
      }
    } catch (error) {
      resumen.errores += 1;
      console.error(`Error registrando ingreso del cobro ${t.id}:`, error.message);
    }
  }
  return resumen;
}

// Sincronización diaria de ingresos: lee los cobros de los últimos 60 días de
// la API de Kajabi y los registra en el panel. (El volcado a la tabla "Pagos"
// de Airtable del código original se eliminó: apuntaba a endpoints /v4 que no
// existen y nunca llegó a funcionar.)
export async function syncKajabiToAirtable() {
  try {
    console.log('=== SINCRONIZANDO INGRESOS DE KAJABI ===');
    if (!kajabiConfigurado()) {
      const diag = diagnosticoKajabi();
      await marcarEstadoSync(`error: ${diag}`);
      return { success: false, message: diag };
    }
    const desde = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const transacciones = await getTransacciones({ desde });
    console.log(`Cobros leídos de Kajabi desde ${desde}: ${transacciones.length}`);
    const ingresos = await registrarIngresosAdmin(transacciones);
    await marcarEstadoSync('ok');
    console.log(`Ingresos nuevos en el panel: ${ingresos.nuevos} (errores: ${ingresos.errores})`);
    return {
      success: true,
      message: 'Sincronización completada',
      data: { transaccionesLeidas: transacciones.length, ...ingresos },
    };
  } catch (error) {
    let detalle = error.response?.status
      ? `${error.response.status} ${JSON.stringify(error.response.data || {}).substring(0, 200)}`
      : error.message;
    if (error.response?.status === 400 || error.response?.status === 401) {
      detalle += ` — Kajabi rechaza las credenciales. Comprueba: ${diagnosticoKajabi()}`;
    }
    console.error('Error en syncKajabiToAirtable:', detalle);
    await marcarEstadoSync(`error: ${detalle}`);
    return { success: false, message: 'Error en la sincronización', error: detalle };
  }
}

export async function checkFailedPayments() {
  const report = {
    checked: 0,
    reminders: 0,
    errors: 0,
    details: [],
  };

  try {
    console.log('=== VERIFICANDO PAGOS FALLIDOS ===');

    const airtableRecords = await getAllRecords('Pagos');
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    for (const record of airtableRecords) {
      try {
        report.checked++;
        const fields = record.fields;

        if (fields['Estado'] === 'En marcha') {
          const recordDate = new Date(fields['Fecha']);

          if (recordDate < threeDaysAgo) {
            const sent = await sendPaymentReminder(
              fields['Email'],
              fields['Nombre'],
              fields['Monto'],
              fields['Fecha']
            );

            if (sent) {
              report.reminders++;
              report.details.push(`📧 Recordatorio enviado: ${fields['Nombre']}`);
            }
          }
        }
      } catch (error) {
        report.errors++;
        report.details.push(`❌ Error verificando registro: ${error.message}`);
        console.error('Error checking payment:', error);
      }
    }

    console.log('=== VERIFICACIÓN COMPLETADA ===');
    console.log(`Verificados: ${report.checked}, Recordatorios: ${report.reminders}`);

    return {
      success: true,
      message: 'Verificación de pagos completada',
      data: report,
    };
  } catch (error) {
    console.error('Error en checkFailedPayments:', error);
    report.errors++;
    return {
      success: false,
      message: 'Error verificando pagos',
      error: error.message,
      data: report,
    };
  }
}

export async function checkFailedTransactions() {
  const report = {
    checked: 0,
    notified: 0,
    errors: 0,
    details: [],
  };

  try {
    console.log('=== VERIFICANDO TRANSACCIONES FALLIDAS ===');

    const airtableRecords = await getAllRecords('Pagos');

    for (const record of airtableRecords) {
      try {
        report.checked++;
        const fields = record.fields;

        if (fields['Estado'] === 'Sin pagar') {
          const sent = await sendFailedPaymentNotification(
            fields['Email'],
            fields['Nombre'],
            fields['Monto']
          );

          if (sent) {
            report.notified++;
            report.details.push(`❌ Notificación de fallo: ${fields['Nombre']}`);
          }
        }
      } catch (error) {
        report.errors++;
        report.details.push(`❌ Error notificando: ${error.message}`);
        console.error('Error notifying failed transaction:', error);
      }
    }

    console.log('=== VERIFICACIÓN DE TRANSACCIONES COMPLETADA ===');
    console.log(`Verificadas: ${report.checked}, Notificadas: ${report.notified}`);

    return {
      success: true,
      message: 'Verificación de transacciones completada',
      data: report,
    };
  } catch (error) {
    console.error('Error en checkFailedTransactions:', error);
    report.errors++;
    return {
      success: false,
      message: 'Error verificando transacciones',
      error: error.message,
      data: report,
    };
  }
}

function mapPaymentStatus(kajabiStatus) {
  const statusMap = {
    'pending': 'En marcha',
    'active': 'Pagado',
    'inactive': 'Sin pagar',
    'failed': 'Fallido',
    'completed': 'Completado',
  };
  return statusMap[kajabiStatus] || kajabiStatus;
}
