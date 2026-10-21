import { NextResponse } from 'next/server';
import { q, ensureSchema } from '../../../../lib/admin/db.js';

// RUTA TEMPORAL (se elimina tras la revisión): ingresos que han entrado
// DIRECTAMENTE en el banco (sin pasar por Kajabi) en un mes dado, para
// cruzarlos con los alumnos de Airtable.
const CLAVE = 'c1f95109d86bc252ed35ef3efba3e05d';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('clave') !== CLAVE) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const mes = /^\d{4}-\d{2}$/.test(searchParams.get('mes') || '') ? searchParams.get('mes') : '2026-10';
  try {
    await ensureSchema();
    const filas = await q(`
      SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, importe::float AS importe,
             concepto, categoria, contacto, email, referencia
      FROM movimientos
      WHERE fuente = 'BANCO' AND tipo = 'INGRESO'
        AND to_char(fecha, 'YYYY-MM') = $1
      ORDER BY fecha, id
    `, [mes]);
    return NextResponse.json({ mes, total: filas.length, filas });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
