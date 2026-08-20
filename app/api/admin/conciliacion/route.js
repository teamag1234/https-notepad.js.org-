import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { conciliarPagosMorosos, historialConciliacion } from '../../../../lib/admin/conciliacion.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  try {
    const data = await historialConciliacion();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error en /api/admin/conciliacion:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Ejecutar la conciliación a mano ("¿ha pagado ya alguien?")
export async function POST(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  try {
    const resultado = await conciliarPagosMorosos();
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    console.error('Error conciliando:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
