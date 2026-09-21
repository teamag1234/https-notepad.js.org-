import { q, ensureSchema } from './db.js';

export const CATEGORIAS_GASTO = [
  'Nóminas',
  'Seguridad Social',
  'Impuestos',
  'Publicidad / Ads',
  'Software y herramientas',
  'Afiliados y comisiones',
  'Pasarela de pago',
  'Formación',
  'Equipo / Material',
  'Gastos Jesu',
  'Devolución de cursos',
  'Otros gastos',
  'Sin clasificar',
];

export const CATEGORIAS_INGRESO = [
  'Cursos',
  'Renovaciones',
  'Membresías y talleres',
  'Otros ingresos',
];

// Clasifica un ingreso de Kajabi por el título de la oferta
export function categorizarIngreso(offerTitle) {
  const titulo = String(offerTitle || '').toLowerCase();
  if (titulo.includes('renovaci')) return 'Renovaciones';
  const membresias = ['taller', 'directos con', 'ag social', 'biblia', 'level up', 'asistente ia', 'folios', 'mega oferta', 'clases individuales', '5 clases'];
  if (membresias.some((k) => titulo.includes(k))) return 'Membresías y talleres';
  return 'Cursos';
}

function mesActual() {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
}

function sumarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const fecha = new Date(a, m - 1 + n, 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function mesesEntre(desde, hasta) {
  const [a1, m1] = desde.split('-').map(Number);
  const [a2, m2] = hasta.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1) + 1;
}

// Resumen financiero de un periodo [desde, hasta]: acepta meses (YYYY-MM) o
// días exactos (YYYY-MM-DD). Sin parámetros: el mes en curso.
export async function getResumenFinanzas({ desde, hasta } = {}) {
  const esMes = (s) => /^\d{4}-\d{2}$/.test(s || '');
  const esDia = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const finDeMes = (m) => {
    const [a, mm] = m.split('-').map(Number);
    return new Date(Date.UTC(a, mm, 0)).toISOString().slice(0, 10);
  };
  const mes = mesActual();
  let dDia = esDia(desde) ? desde : esMes(desde) ? `${desde}-01` : `${mes}-01`;
  let hDia = esDia(hasta) ? hasta
    : esMes(hasta) ? finDeMes(hasta)
      : esDia(desde) ? dDia
        : esMes(desde) ? finDeMes(desde) : finDeMes(mes);
  if (hDia < dDia) [dDia, hDia] = [hDia, dDia];
  const d = dDia.slice(0, 7);
  const h = hDia.slice(0, 7);
  const mesExacto = dDia === `${d}-01` && hDia === finDeMes(h);

  // Periodo anterior de la misma duración en DÍAS, para la comparativa
  const duracion = mesesEntre(d, h);
  const dias = Math.round((Date.parse(hDia) - Date.parse(dDia)) / 86400000) + 1;
  const antHastaDia = new Date(Date.parse(dDia) - 86400000).toISOString().slice(0, 10);
  const antDesdeDia = mesExacto
    ? `${sumarMeses(sumarMeses(d, -1), -(duracion - 1))}-01`
    : new Date(Date.parse(antHastaDia) - (dias - 1) * 86400000).toISOString().slice(0, 10);

  const kpiSql = `
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'INGRESO' AND categoria <> 'Traspaso Kajabi' THEN importe END), 0)::float AS ingresos,
      COALESCE(SUM(CASE WHEN tipo = 'GASTO' THEN importe END), 0)::float AS gastos,
      COUNT(*) FILTER (WHERE tipo = 'INGRESO' AND categoria <> 'Traspaso Kajabi') AS num_cobros
    FROM movimientos
    WHERE fecha BETWEEN $1::date AND $2::date
  `;
  // Real bancario: lo que de verdad ha entrado y salido del banco en el
  // periodo (incluye los traspasos de Kajabi/Stripe, que llegan días después
  // de la facturación — por eso nunca cuadra con los ingresos facturados).
  const bancoSql = `
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'INGRESO' THEN importe END), 0)::float AS entradas,
      COALESCE(SUM(CASE WHEN tipo = 'GASTO' THEN importe END), 0)::float AS salidas
    FROM movimientos
    WHERE fuente = 'BANCO' AND fecha BETWEEN $1::date AND $2::date
  `;

  const [porMes, categoriasMes, ultimos, kpisPeriodo, kpisAnterior, bancoPeriodo, bancoAnterior] = await Promise.all([
    // Los "Traspaso Kajabi" son abonos del banco que ya están contados como
    // ingresos individuales de Kajabi: se excluyen para no duplicar.
    q(`
      SELECT to_char(fecha, 'YYYY-MM') AS mes,
             SUM(CASE WHEN tipo = 'INGRESO' AND categoria <> 'Traspaso Kajabi' THEN importe ELSE 0 END)::float AS ingresos,
             SUM(CASE WHEN tipo = 'GASTO' THEN importe ELSE 0 END)::float AS gastos
      FROM movimientos
      WHERE fecha >= (date_trunc('month', now()) - interval '11 months')
      GROUP BY 1 ORDER BY 1
    `),
    q(`
      SELECT tipo, categoria, SUM(importe)::float AS total
      FROM movimientos
      WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY tipo, categoria ORDER BY total DESC
    `, [dDia, hDia]),
    q(`
      SELECT id, tipo, to_char(fecha, 'YYYY-MM-DD') AS fecha, importe::float AS importe,
             concepto, categoria, contacto, fuente
      FROM movimientos
      WHERE fecha BETWEEN $1::date AND $2::date
      ORDER BY fecha DESC, id DESC LIMIT 15
    `, [dDia, hDia]),
    q(kpiSql, [dDia, hDia]),
    q(kpiSql, [antDesdeDia, antHastaDia]),
    q(bancoSql, [dDia, hDia]),
    q(bancoSql, [antDesdeDia, antHastaDia]),
  ]);

  const kpi = kpisPeriodo[0] || { ingresos: 0, gastos: 0, num_cobros: 0 };
  const beneficio = Math.round((kpi.ingresos - kpi.gastos) * 100) / 100;
  const margen = kpi.ingresos > 0 ? Math.round((beneficio / kpi.ingresos) * 1000) / 10 : null;

  const anterior = kpisAnterior[0] || null;
  const delta = (actual, previo) =>
    previo > 0 ? Math.round(((actual - previo) / previo) * 1000) / 10 : null;

  // Gastos pendientes de clasificar (para revisarlos a mano)
  const sinClasificar = await q(`
    SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(importe), 0)::float AS total
    FROM movimientos WHERE tipo = 'GASTO' AND categoria = 'Sin clasificar'
  `);

  return {
    actualizadoEl: new Date().toISOString(),
    periodo: {
      desde: d, hasta: h, duracion,
      desdeDia: dDia, hastaDia: hDia, dias, mesExacto,
      esMesActual: mesExacto && d === mes && h === mes,
    },
    mesActual: {
      mes,
      desde: d,
      hasta: h,
      ingresos: kpi.ingresos,
      gastos: kpi.gastos,
      beneficio,
      margen,
      numCobros: Number(kpi.num_cobros),
      deltaIngresos: anterior ? delta(kpi.ingresos, anterior.ingresos) : null,
      deltaGastos: anterior ? delta(kpi.gastos, anterior.gastos) : null,
      deltaBeneficio: anterior ? delta(kpi.ingresos - kpi.gastos, anterior.ingresos - anterior.gastos) : null,
    },
    banco: (() => {
      const b = bancoPeriodo[0] || { entradas: 0, salidas: 0 };
      const prev = bancoAnterior[0] || null;
      const neto = Math.round((b.entradas - b.salidas) * 100) / 100;
      return {
        entradas: b.entradas,
        salidas: b.salidas,
        neto,
        margen: b.entradas > 0 ? Math.round((neto / b.entradas) * 1000) / 10 : null,
        deltaEntradas: prev ? delta(b.entradas, prev.entradas) : null,
        deltaSalidas: prev ? delta(b.salidas, prev.salidas) : null,
      };
    })(),
    porMes,
    categoriasMes,
    ultimosMovimientos: ultimos,
    sinClasificar: sinClasificar[0] || { cantidad: 0, total: 0 },
  };
}

export async function cambiarCategoria(id, categoria) {
  await q(`UPDATE movimientos SET categoria = $2, revisado = true WHERE id = $1`, [id, categoria]);
}

export async function listarMovimientos({ tipo, mes, limite = 200 } = {}) {
  await ensureSchema(); // garantiza las columnas nuevas (doc_url, etc.)
  const condiciones = [];
  const params = [];
  if (tipo) {
    params.push(tipo);
    condiciones.push(`tipo = $${params.length}`);
  }
  if (mes) {
    params.push(mes);
    condiciones.push(`to_char(fecha, 'YYYY-MM') = $${params.length}`);
  }
  params.push(Math.min(Number(limite) || 200, 1000));
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  return q(`
    SELECT id, tipo, to_char(fecha, 'YYYY-MM-DD') AS fecha, importe::float AS importe,
           concepto, categoria, contacto, email, fuente, referencia, notas,
           (doc_url IS NOT NULL) AS tiene_doc, doc_nombre
    FROM movimientos ${where}
    ORDER BY fecha DESC, id DESC
    LIMIT $${params.length}
  `, params);
}

export async function crearMovimiento({ tipo, fecha, importe, concepto, categoria, contacto, email, fuente, referencia, notas }) {
  const rows = await q(`
    INSERT INTO movimientos (tipo, fecha, importe, concepto, categoria, contacto, email, fuente, referencia, notas)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (referencia) DO NOTHING
    RETURNING id
  `, [
    tipo,
    fecha,
    importe,
    concepto,
    categoria || 'Otros',
    contacto || null,
    email || null,
    fuente || 'MANUAL',
    referencia || null,
    notas || null,
  ]);
  return rows[0] || null;
}

export async function borrarMovimiento(id) {
  await q(`DELETE FROM movimientos WHERE id = $1`, [id]);
}

// Importa movimientos (p. ej. el seed de transacciones de Kajabi) sin duplicar:
// la columna referencia es única y los ya existentes se ignoran.
export async function importarMovimientos(movimientos) {
  let importados = 0;
  for (const movimiento of movimientos) {
    const creado = await crearMovimiento(movimiento);
    if (creado) importados += 1;
  }
  return { total: movimientos.length, importados, yaExistian: movimientos.length - importados };
}
