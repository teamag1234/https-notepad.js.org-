import { NextResponse } from 'next/server';
import { q, ensureSchema } from '../../../../lib/admin/db.js';

// RUTA TEMPORAL (se elimina tras la estimación de gastos fijos): devuelve los
// GASTOS del banco de los últimos meses para analizar los costes recurrentes.
const CLAVE = 'df328fb0e232c6d61c54fd7d';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('clave') !== CLAVE) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    await ensureSchema();
    const filas = await q(`
      SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, importe::float AS importe,
             concepto, categoria, contacto
      FROM movimientos
      WHERE tipo = 'GASTO' AND fecha >= '2026-05-01'
      ORDER BY fecha
    `);
    return NextResponse.json({ total: filas.length, filas });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
