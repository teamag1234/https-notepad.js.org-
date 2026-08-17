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
  if (!esCron && !auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  if (!dbConfigurada() || !bancoConfigurado()) {
    return NextResponse.json({ success: true, message: 'Banco no configurado todavía, nada que sincronizar' });
  }
  try {
    const resultado = await sincronizarBanco();
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    const detalle = error.response?.data ? JSON.stringify(error.response.data).substring(0, 300) : error.message;
    console.error('Error sincronizando banco:', detalle);
    return NextResponse.json({ success: false, error: detalle }, { status: 500 });
  }
}
