import { NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { comprobarAdmin } from '../../../../../lib/admin/auth.js';
import { q } from '../../../../../lib/admin/db.js';

export const dynamic = 'force-dynamic';

// Entrega un documento al ADMINISTRADOR (autenticado con x-admin-key),
// firme o no firme el trabajador. Para archivos en almacenamiento privado.
export async function GET(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return new NextResponse('Falta el id', { status: 400 });
    const filas = await q(`SELECT url, titulo FROM documentos_rrhh WHERE id = $1`, [Number(id)]);
    if (!filas.length) return new NextResponse('No existe', { status: 404 });
    const doc = filas[0];
    if (!/\.private\.blob\.vercel-storage\.com\//.test(doc.url)) {
      return NextResponse.json({ success: true, redirect: doc.url });
    }
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
    console.error('Error sirviendo documento admin:', error.message);
    return new NextResponse('Error interno', { status: 500 });
  }
}
