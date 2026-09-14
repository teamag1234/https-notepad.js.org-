import { getTransacciones, kajabiConfigurado } from './kajabi.js';
import { getAllRecords } from './airtable.js';
import { sendPaymentReminder, sendFailedPaymentNotification, sendSyncReport } from './email.js';
import { dbConfigurada, q } from './admin/db.js';
import { crearMovimiento, categorizarIngreso } from './admin/finanzas.js';

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
  const resumen = { nuevos: 0, errores: 0 };
  if (!dbConfigurada()) return resumen;
  for (const t of transacciones) {
    try {
      if (String(t.estado).toLowerCase() !== 'succeeded') continue;
      if (String(t.accion || t.tipoPago || '').toLowerCase().includes('refund')) continue;
      if (!t.importe || isNaN(t.importe)) continue;
      const fecha = String(t.fecha || new Date().toISOString()).slice(0, 10);
      const concepto = t.oferta || 'Pago Kajabi';
      const yaExiste = await q(
        `SELECT 1 FROM movimientos
         WHERE fuente = 'KAJABI' AND tipo = 'INGRESO' AND fecha = $1 AND importe = $2 AND COALESCE(email, '') = $3 LIMIT 1`,
        [fecha, t.importe, t.email || ''],
      );
      if (yaExiste.length) continue;
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
      if (creado) resumen.nuevos += 1;
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
      await marcarEstadoSync('error: faltan KAJABI_CLIENT_ID y KAJABI_CLIENT_SECRET en Vercel');
      return {
        success: false,
        message: 'Faltan KAJABI_CLIENT_ID y KAJABI_CLIENT_SECRET en Vercel (Kajabi → Settings → Public API)',
      };
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
    const detalle = error.response?.status
      ? `${error.response.status} ${JSON.stringify(error.response.data || {}).substring(0, 200)}`
      : error.message;
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
