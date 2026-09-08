import { NextResponse } from 'next/server';
import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned } from '@vercel/blob/client';
import { comprobarAdmin } from '../../../../../lib/admin/auth.js';

export const dynamic = 'force-dynamic';

// Autoriza subidas DIRECTAS del navegador a Vercel Blob (modo privado).
// Las peticiones a las funciones de Vercel están limitadas a 4,5 MB, así que
// los archivos grandes (contratos/nóminas escaneados) no pueden pasar por el
// servidor: aquí solo se firma un permiso temporal de subida y el archivo
// viaja del navegador al almacén sin tocar la función.
export async function POST(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { success: false, error: 'Falta el almacenamiento de archivos: en Vercel → Storage crea un "Blob store" y conéctalo al proyecto.' },
      { status: 500 },
    );
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
    console.error('Error autorizando subida directa:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
