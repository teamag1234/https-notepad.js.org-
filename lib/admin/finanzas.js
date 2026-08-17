import { q } from './db.js';

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

export async function getResumenFinanzas() {
  const [porMes, categoriasMes, ultimos, kpisMes] = await Promise.all([
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
      WHERE to_char(fecha, 'YYYY-MM') = $1
      GROUP BY tipo, categoria ORDER BY total DESC
    `, [mesActual()]),
    q(`
      SELECT id, tipo, to_char(fecha, 'YYYY-MM-DD') AS fecha, importe::float AS importe,
             concepto, categoria, contacto, fuente
      FROM movimientos ORDER BY fecha DESC, id DESC LIMIT 15
    `),
    q(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo = 'INGRESO' AND categoria <> 'Traspaso Kajabi' THEN importe END), 0)::float AS ingresos,
        COALESCE(SUM(CASE WHEN tipo = 'GASTO' THEN importe END), 0)::float AS gastos,
        COUNT(*) FILTER (WHERE tipo = 'INGRESO' AND categoria <> 'Traspaso Kajabi') AS num_cobros
      FROM movimientos
      WHERE to_char(fecha, 'YYYY-MM') = $1
    `, [mesActual()]),
  ]);

  const kpi = kpisMes[0] || { ingresos: 0, gastos: 0, num_cobros: 0 };
  const beneficio = Math.round((kpi.ingresos - kpi.gastos) * 100) / 100;
  const margen = kpi.ingresos > 0 ? Math.round((beneficio / kpi.ingresos) * 1000) / 10 : null;

  // Comparativa con el mes anterior
  const mes = mesActual();
  const idx = porMes.findIndex((m) => m.mes === mes);
  const anterior = idx > 0 ? porMes[idx - 1] : null;
  const delta = (actual, previo) =>
    previo > 0 ? Math.round(((actual - previo) / previo) * 1000) / 10 : null;

  // Gastos pendientes de clasificar (para revisarlos a mano)
  const sinClasificar = await q(`
    SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(importe), 0)::float AS total
    FROM movimientos WHERE tipo = 'GASTO' AND categoria = 'Sin clasificar'
  `);

  return {
    actualizadoEl: new Date().toISOString(),
    mesActual: {
      mes,
      ingresos: kpi.ingresos,
      gastos: kpi.gastos,
      beneficio,
      margen,
      numCobros: Number(kpi.num_cobros),
      deltaIngresos: anterior ? delta(kpi.ingresos, anterior.ingresos) : null,
      deltaGastos: anterior ? delta(kpi.gastos, anterior.gastos) : null,
      deltaBeneficio: anterior ? delta(kpi.ingresos - kpi.gastos, anterior.ingresos - anterior.gastos) : null,
    },
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
           concepto, categoria, contacto, email, fuente, referencia, notas
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
