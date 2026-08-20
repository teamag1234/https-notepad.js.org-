import { NextResponse } from 'next/server';
import { completarConexion, sincronizarBanco } from '../../../../../lib/admin/banco.js';

export const dynamic = 'force-dynamic';

// Retorno del banco tras autorizar el acceso. Llega como redirección del
// navegador con ?code y ?state; el state se valida contra el guardado al
// iniciar la conexión desde el panel.
export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const destino = new URL('/admin/banco', url.origin);
  if (!code || !state) {
    destino.searchParams.set('error', url.searchParams.get('error') || 'Autorización cancelada');
    return NextResponse.redirect(destino);
  }
  try {
    const resultado = await completarConexion({ code, state });
    // Primera sincronización en el momento (últimos 90 días)
    const sync = await sincronizarBanco().catch((e) => ({ error: e.message }));
    destino.searchParams.set('ok', '1');
    destino.searchParams.set('cuentas', String(resultado.cuentas));
    if (sync.nuevos != null) destino.searchParams.set('nuevos', String(sync.nuevos));
    return NextResponse.redirect(destino);
  } catch (error) {
    console.error('Error completando conexión bancaria:', error.message);
    destino.searchParams.set('error', error.message);
    return NextResponse.redirect(destino);
  }
}
