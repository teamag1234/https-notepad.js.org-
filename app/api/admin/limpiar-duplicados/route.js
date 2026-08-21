import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { limpiarDuplicadosBanco } from '../../../../lib/admin/banco.js';

export const dynamic = 'force-dynamic';

// Limpieza manual de movimientos bancarios duplicados desde el panel.
export async function POST(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  try {
    const resultado = await limpiarDuplicadosBanco();
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    console.error('Error limpiando duplicados:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
