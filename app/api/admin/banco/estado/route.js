import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../../lib/admin/auth.js';
import { estadoBanco, buscarBancos, bancoConfigurado } from '../../../../../lib/admin/banco.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  try {
    const estado = await estadoBanco();
    let bancos = [];
    const buscar = new URL(request.url).searchParams.get('buscar');
    if (buscar && bancoConfigurado()) {
      bancos = await buscarBancos(buscar);
    }
    return NextResponse.json({ success: true, data: { ...estado, bancos } });
  } catch (error) {
    console.error('Error en /api/admin/banco/estado:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
