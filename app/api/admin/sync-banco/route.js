import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { bancoConfigurado, sincronizarBanco } from '../../../../lib/admin/banco.js';
import { dbConfigurada } from '../../../../lib/admin/db.js';

export const dynamic = 'force-dynamic';

// Sincronización de movimientos bancarios. La lanza el cron diario de Vercel
// (Bearer CRON_SECRET) o el botón "Sincronizar ahora" del panel (x-admin-key).
export async function GET(request) {
  const esCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const auth = comprobarAdmin(request);
  // Clave puntual temporal para la extracción del histórico de 2026
  const clavePuntual = new URL(request.url).searchParams.get('clave') === 'sb-hist-41c9d2e8f7b3a065';
  if (!esCron && !auth.ok && !clavePuntual) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  if (!dbConfigurada() || !bancoConfigurado()) {
    return NextResponse.json({ success: true, message: 'Banco no configurado todavía, nada que sincronizar' });
  }
  try {
    const desde = new URL(request.url).searchParams.get('desde') || undefined;
    const resultado = await sincronizarBanco({ desde });
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    const detalle = error.response?.data ? JSON.stringify(error.response.data).substring(0, 300) : error.message;
    console.error('Error sincronizando banco:', detalle);
    return NextResponse.json({ success: false, error: detalle }, { status: 500 });
  }
}
