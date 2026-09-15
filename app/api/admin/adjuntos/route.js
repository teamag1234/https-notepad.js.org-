import { NextResponse } from 'next/server';
import { issueSignedToken, get } from '@vercel/blob';
import { handleUploadPresigned } from '@vercel/blob/client';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { q } from '../../../../lib/admin/db.js';

export const dynamic = 'force-dynamic';

// Documentos adjuntos de los movimientos (facturas de compra de los gastos).
// POST: autoriza la subida directa navegador → Blob privado (sin el límite de
// 4,5 MB). GET ?id=<movimiento>: entrega el documento al administrador.
export async function POST(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ success: false, error: 'Falta el almacenamiento de archivos (Blob) en Vercel' }, { status: 500 });
  }
  try {
    const body = await request.json();
    const respuesta = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => ({
        token: await issueSignedToken({
          pathname,
          operations: ['put'],
          maximumSizeInBytes: 200 * 1024 * 1024,
          validUntil: Date.now() + 15 * 60 * 1000,
        }),
      }),
    });
    return NextResponse.json(respuesta);
  } catch (error) {
    console.error('Error autorizando subida de adjunto:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return new NextResponse('Falta el id', { status: 400 });
    const filas = await q(`SELECT doc_url, doc_nombre, concepto FROM movimientos WHERE id = $1`, [Number(id)]);
    if (!filas.length || !filas[0].doc_url) return new NextResponse('Sin documento', { status: 404 });
    const doc = filas[0];
    const resultado = await get(doc.doc_url, { access: 'private' });
    if (!resultado || resultado.statusCode !== 200) return new NextResponse('Archivo no encontrado', { status: 404 });
    return new NextResponse(resultado.stream, {
      headers: {
        'Content-Type': resultado.blob?.contentType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.doc_nombre || doc.concepto || 'factura')}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Error sirviendo adjunto:', error.message);
    return new NextResponse('Error interno', { status: 500 });
  }
}
