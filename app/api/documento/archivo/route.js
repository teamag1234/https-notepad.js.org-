import { NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { q, dbConfigurada } from '../../../../lib/admin/db.js';

export const dynamic = 'force-dynamic';

function esBlobPrivado(url) {
  return /\.private\.blob\.vercel-storage\.com\//.test(url || '');
}

// Entrega el archivo de un documento YA FIRMADO, identificado por el token
// personal del trabajador. Los archivos viven en almacenamiento privado y solo
// salen por esta ruta.
export async function GET(request) {
  if (!dbConfigurada()) return new NextResponse('Servicio no disponible', { status: 500 });
  try {
    const token = new URL(request.url).searchParams.get('t');
    if (!token) return new NextResponse('Enlace no válido', { status: 400 });
    const filas = await q(`SELECT url, titulo, firmado_el FROM documentos_rrhh WHERE token = $1`, [token]);
    if (!filas.length) return new NextResponse('Este enlace no existe', { status: 404 });
    const doc = filas[0];
    if (!doc.firmado_el) return new NextResponse('Primero hay que firmar la recepción', { status: 403 });
    if (!esBlobPrivado(doc.url)) return NextResponse.redirect(doc.url);
    const resultado = await get(doc.url, { access: 'private' });
    if (!resultado || resultado.statusCode !== 200) return new NextResponse('Archivo no encontrado', { status: 404 });
    return new NextResponse(resultado.stream, {
      headers: {
        'Content-Type': resultado.blob?.contentType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.titulo || 'documento')}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Error sirviendo documento:', error.message);
    return new NextResponse('Error interno', { status: 500 });
  }
}
