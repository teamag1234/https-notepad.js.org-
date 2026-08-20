import { q, dbConfigurada, ensureSchema } from './db.js';
import { getMorososDetallado, patchAlumno } from './airtable-live.js';

// Conciliación automática: cruza las transferencias recibidas en el banco con
// los alumnos morosos. Si el concepto contiene el nombre del alumno y el
// importe coincide con su deuda, se marca como pagado en Airtable (meses
// ABIERTO → CERRADO), se le quita de morosos y con ello dejan de enviársele
// recordatorios. Si el nombre cuadra pero el importe no, queda "PARA REVISAR".

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'da', 'do']);

function nombreEnTexto(nombre, texto) {
  const tokens = normalizar(nombre).split(' ').filter((t) => t.length >= 2 && !PALABRAS_VACIAS.has(t));
  if (tokens.length < 2) return false;
  const t = ` ${normalizar(texto)} `;
  return tokens.every((token) => t.includes(` ${token} `) || t.includes(` ${token}`));
}

export async function conciliarPagosMorosos() {
  if (!dbConfigurada()) return { conciliados: 0, paraRevisar: 0 };
  await ensureSchema();

  // Ingresos del banco de los últimos 21 días aún sin conciliar
  const ingresos = await q(`
    SELECT m.id, to_char(m.fecha, 'YYYY-MM-DD') AS fecha, m.importe::float AS importe, m.concepto, m.contacto
    FROM movimientos m
    LEFT JOIN conciliaciones c ON c.movimiento_id = m.id
    WHERE m.tipo = 'INGRESO' AND m.fuente = 'BANCO'
      AND m.fecha > now() - interval '21 days'
      AND c.id IS NULL
  `);
  if (!ingresos.length) return { conciliados: 0, paraRevisar: 0 };

  const morosos = await getMorososDetallado();
  let conciliados = 0;
  let paraRevisar = 0;

  for (const ingreso of ingresos) {
    const textoPago = `${ingreso.concepto} ${ingreso.contacto || ''}`;
    const candidato = morosos.find((m) => m.nombre && nombreEnTexto(m.nombre, textoPago));
    if (!candidato) continue;

    const importeCuadra = Math.abs(ingreso.importe - candidato.debe) <= 0.01;
    if (importeCuadra) {
      // 1) Cerrar en Airtable los meses pendientes (conservando importes).
      //    Si un mes ABIERTO no tenía importe (cobro fallido), se anota la parte
      //    del pago que le corresponde.
      const anotado = candidato.abiertos.reduce((s, a) => s + (a.importe || 0), 0);
      const sinImporte = candidato.abiertos.filter((a) => a.importe == null);
      const restante = Math.round((ingreso.importe - anotado) * 100) / 100;
      const fields = {};
      for (const abierto of candidato.abiertos) {
        fields[abierto.estado] = 'CERRADO ';
        if (abierto.importe == null && sinImporte.length === 1 && restante > 0) {
          fields[abierto.mes] = restante;
        }
      }
      // 2) Quitarlo de morosos → los recordatorios se desactivan solos
      fields['Morosoo'] = false;
      fields['MOROSO'] = '';
      fields['Notas Morosos'] =
        `PAGADO ✅ transferencia de ${ingreso.importe}€ recibida el ${ingreso.fecha} (conciliado automáticamente). ` +
        (candidato.notas || '');
      await patchAlumno(candidato.id, fields);
      await q(
        `INSERT INTO conciliaciones (movimiento_id, alumno_airtable_id, nombre, importe, estado)
         VALUES ($1, $2, $3, $4, 'CONCILIADO') ON CONFLICT (movimiento_id) DO NOTHING`,
        [ingreso.id, candidato.id, candidato.nombre, ingreso.importe],
      );
      // 3) El ingreso del banco es venta de curso recuperada: categorizarlo bien
      await q(`UPDATE movimientos SET categoria = 'Cursos', revisado = true WHERE id = $1`, [ingreso.id]);
      // Quitarlo de la lista en memoria para no reutilizarlo en este mismo lote
      morosos.splice(morosos.indexOf(candidato), 1);
      conciliados += 1;
    } else {
      await q(
        `INSERT INTO conciliaciones (movimiento_id, alumno_airtable_id, nombre, importe, estado)
         VALUES ($1, $2, $3, $4, 'REVISAR') ON CONFLICT (movimiento_id) DO NOTHING`,
        [ingreso.id, candidato.id, `${candidato.nombre} (debe ${candidato.debe}€)`, ingreso.importe],
      );
      paraRevisar += 1;
    }
  }
  return { conciliados, paraRevisar };
}

export async function historialConciliacion() {
  if (!dbConfigurada()) return { conciliados: [], paraRevisar: [] };
  await ensureSchema();
  const filas = await q(`
    SELECT c.id, c.nombre, c.importe::float AS importe, c.estado,
           to_char(c.creado_el, 'YYYY-MM-DD HH24:MI') AS fecha,
           m.concepto, to_char(m.fecha, 'YYYY-MM-DD') AS fecha_pago
    FROM conciliaciones c LEFT JOIN movimientos m ON m.id = c.movimiento_id
    ORDER BY c.creado_el DESC LIMIT 50
  `);
  return {
    conciliados: filas.filter((f) => f.estado === 'CONCILIADO'),
    paraRevisar: filas.filter((f) => f.estado === 'REVISAR'),
  };
}
