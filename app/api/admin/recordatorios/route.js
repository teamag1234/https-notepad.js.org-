import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import {
  getMorososParaAvisar, plantillaRecordatorio, recordatoriosActivos, enviarPrueba, enviarRecordatorios,
} from '../../../../lib/admin/recordatorios.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  try {
    const { conEmail, sinEmail, iban } = await getMorososParaAvisar();
    return NextResponse.json({
      success: true,
      data: {
        activos: recordatoriosActivos(),
        iban,
        conEmail: conEmail.map((m) => ({ ...m, preview: plantillaRecordatorio(m) })),
        sinEmail,
      },
    });
  } catch (error) {
    console.error('Error en /api/admin/recordatorios:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  try {
    const body = await request.json().catch(() => ({}));
    if (body.accion === 'prueba') {
      const resultado = await enviarPrueba();
      return NextResponse.json({ success: true, data: resultado });
    }
    if (body.accion === 'enviar-todos') {
      const resultado = await enviarRecordatorios();
      return NextResponse.json({ success: true, data: resultado });
    }
    return NextResponse.json({ success: false, error: 'Acción no válida' }, { status: 400 });
  } catch (error) {
    console.error('Error en recordatorios:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
