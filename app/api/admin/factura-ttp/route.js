import { NextResponse } from 'next/server';
import { q, ensureSchema } from '../../../../lib/admin/db.js';

// RUTA TEMPORAL (se elimina tras usarla): actualiza el concepto de la factura
// F250955 al nuevo texto exento de IVA (servicio de enseñanza).
const CLAVE = '91a6cd133bac39b2ea3b042e';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('clave') !== CLAVE) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    await ensureSchema();
    const filas = await q(`
      UPDATE facturas
      SET concepto = 'Servicio de clases de inglés en directo a alumnos de ADIF (enseñanza impartida por AG Academy)'
      WHERE numero = 'F250955'
      RETURNING id, numero, concepto, importe::float AS importe
    `);
    return NextResponse.json(filas[0] || { error: 'No encontrada' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
