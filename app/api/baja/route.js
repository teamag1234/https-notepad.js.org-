import { NextResponse } from 'next/server';
import { bajaPorToken, responderFormulario } from '../../../lib/admin/bajas.js';

export const dynamic = 'force-dynamic';

// Formulario PÚBLICO de baja/devolución: el alumno accede con su token
// personal desde el email. Solo expone lo mínimo para pintar el formulario.
export async function GET(request) {
  const token = new URL(request.url).searchParams.get('t');
  if (!token) return NextResponse.json({ success: false, error: 'Falta el enlace' }, { status: 400 });
  try {
    const baja = await bajaPorToken(token);
    if (!baja) return NextResponse.json({ success: false, error: 'Enlace no válido' }, { status: 404 });
    return NextResponse.json({ success: true, data: baja });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'No se pudo cargar el formulario' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body.token) return NextResponse.json({ success: false, error: 'Falta el enlace' }, { status: 400 });
    const r = await responderFormulario(body.token, body);
    return NextResponse.json({ success: true, data: r });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
