import { NextResponse } from 'next/server';
import { dbConfigurada } from '../../../lib/admin/db.js';
import { documentoPorToken, firmarDocumento } from '../../../lib/admin/rrhh.js';

export const dynamic = 'force-dynamic';

// Página pública de firma de documentos: cada trabajador accede con su enlace
// personal (token aleatorio del email). El archivo solo se entrega tras firmar.
export async function GET(request) {
  if (!dbConfigurada()) return NextResponse.json({ success: false, error: 'Servicio no disponible' }, { status: 500 });
  try {
    const token = new URL(request.url).searchParams.get('t');
    if (!token) return NextResponse.json({ success: false, error: 'Enlace no válido' }, { status: 400 });
    const doc = await documentoPorToken(token);
    if (!doc) return NextResponse.json({ success: false, error: 'Este enlace no existe o ha sido retirado' }, { status: 404 });
    return NextResponse.json({ success: true, data: doc });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body.token) return NextResponse.json({ success: false, error: 'Enlace no válido' }, { status: 400 });
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const resultado = await firmarDocumento(body.token, body.nombre, ip);
    // Los archivos en almacenamiento privado se sirven por nuestra ruta segura
    if (/\.private\.blob\.vercel-storage\.com\//.test(resultado.url || '')) {
      resultado.url = `/api/documento/archivo?t=${encodeURIComponent(body.token)}`;
    }
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
