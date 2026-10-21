import { NextResponse } from 'next/server';
import { q, ensureSchema } from '../../../../lib/admin/db.js';

// RUTA TEMPORAL (segunda fase, se elimina tras usarla): completa los datos
// fiscales de TenTuPlaza SLU en la factura F250955 ya registrada.
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
      SET alumno = 'TENTUPLAZA SLU', dni = 'B56903222',
          direccion = 'C/ Gómez de Mora 1, 2º B · 28005 Madrid'
      WHERE numero = 'F250955'
      RETURNING id, numero, alumno, dni, direccion
    `);
    return NextResponse.json(filas[0] || { error: 'No encontrada' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
