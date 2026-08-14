import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { getMorosos } from '../../../../lib/admin/airtable-live.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  try {
    const data = await getMorosos();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error en /api/admin/morosos:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
