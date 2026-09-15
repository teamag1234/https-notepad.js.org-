import { NextResponse } from 'next/server';
import { comprobarFacturas } from '../../../../lib/admin/auth.js';

export const dynamic = 'force-dynamic';

// Identifica el rol de la clave introducida en el login del panel:
// 'admin' (acceso completo) o 'facturas' (solo la sección de facturas).
export async function GET(request) {
  const auth = comprobarFacturas(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  return NextResponse.json({ success: true, data: { rol: auth.rol } });
}
