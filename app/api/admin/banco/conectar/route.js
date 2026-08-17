import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../../lib/admin/auth.js';
import { bancoConfigurado, iniciarConexion, buscarBancos } from '../../../../../lib/admin/banco.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  if (!bancoConfigurado()) {
    return NextResponse.json(
      { success: false, error: 'Faltan ENABLE_BANKING_APP_ID y ENABLE_BANKING_PRIVATE_KEY en las variables de entorno' },
      { status: 500 },
    );
  }
  try {
    const body = await request.json().catch(() => ({}));
    // Busca el nombre exacto del banco en la red de Enable Banking
    const nombreBuscado = body.banco || process.env.BANCO_NOMBRE || 'Cajamar';
    const candidatos = await buscarBancos(nombreBuscado);
    if (!candidatos.length) {
      return NextResponse.json(
        { success: false, error: `No se encontró "${nombreBuscado}" en la red de bancos. Prueba con otro nombre.` },
        { status: 404 },
      );
    }
    const origen = new URL(request.url).origin;
    const urlRetorno = `${process.env.ADMIN_BASE_URL || origen}/api/admin/banco/callback`;
    const { url } = await iniciarConexion({ nombreBanco: candidatos[0].nombre, urlRetorno });
    return NextResponse.json({ success: true, data: { url, banco: candidatos[0].nombre } });
  } catch (error) {
    const detalle = error.response?.data ? JSON.stringify(error.response.data).substring(0, 300) : error.message;
    console.error('Error iniciando conexión bancaria:', detalle);
    return NextResponse.json({ success: false, error: detalle }, { status: 500 });
  }
}
