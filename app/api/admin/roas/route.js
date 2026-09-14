import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { dbConfigurada } from '../../../../lib/admin/db.js';
import { getRoas } from '../../../../lib/admin/roas.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  if (!dbConfigurada()) return NextResponse.json({ success: false, error: 'Falta la base de datos (DATABASE_URL)' }, { status: 500 });
  try {
    const params = new URL(request.url).searchParams;
    const data = await getRoas({
      desde: params.get('desde') || undefined,
      hasta: params.get('hasta') || undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error en /api/admin/roas:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
