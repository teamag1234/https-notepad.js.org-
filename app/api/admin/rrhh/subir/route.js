import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { comprobarAdmin } from '../../../../../lib/admin/auth.js';
import { crearDocumento } from '../../../../../lib/admin/rrhh.js';

export const dynamic = 'force-dynamic';

// Subida de archivos (nóminas, contratos…) a Vercel Blob en modo PRIVADO:
// el archivo no es accesible públicamente; solo se sirve tras la firma de
// recepción (o al administrador desde el panel). Requiere un Blob store
// conectado al proyecto (crea BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN solo).
export async function POST(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { success: false, error: 'Falta el almacenamiento de archivos: en Vercel → Storage crea un "Blob store", conéctalo al proyecto y redespliega. Mientras tanto puedes adjuntar documentos por enlace (Drive, etc.).' },
      { status: 500 },
    );
  }
  try {
    const form = await request.formData();
    const archivo = form.get('archivo');
    const trabajadorId = Number(form.get('trabajador_id'));
    const tipo = form.get('tipo') || 'OTRO';
    const titulo = form.get('titulo') || archivo?.name || 'Documento';
    const mes = form.get('mes') || null;
    if (!archivo || !trabajadorId) {
      return NextResponse.json({ success: false, error: 'Faltan el archivo o el trabajador' }, { status: 400 });
    }
    const blob = await put(`rrhh/${trabajadorId}/${Date.now()}-${archivo.name}`, archivo, {
      access: 'private',
      addRandomSuffix: true,
    });
    const origen = process.env.ADMIN_BASE_URL || new URL(request.url).origin;
    const creado = await crearDocumento({ trabajador_id: trabajadorId, tipo, titulo, mes, url: blob.url, origen });
    return NextResponse.json({ success: true, data: { ...creado, url: blob.url } });
  } catch (error) {
    console.error('Error subiendo documento:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
