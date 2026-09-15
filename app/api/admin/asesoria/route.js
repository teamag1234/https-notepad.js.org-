import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { dbConfigurada } from '../../../../lib/admin/db.js';
import { enviarMesAsesoria, emailAsesoriaGuardado } from '../../../../lib/admin/asesoria.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  return NextResponse.json({ success: true, data: { email: await emailAsesoriaGuardado() } });
}

export async function POST(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  if (!dbConfigurada()) return NextResponse.json({ success: false, error: 'Falta la base de datos' }, { status: 500 });
  try {
    const body = await request.json();
    const resultado = await enviarMesAsesoria(body);
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    console.error('Error enviando a la asesoría:', error.message);
    const msg = /message size exceeds|too large/i.test(error.message)
      ? 'El paquete supera el tamaño máximo del email (25 MB). Dímelo y lo enviamos por partes.'
      : error.message;
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
