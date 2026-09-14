import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { syncKajabiToAirtable } from '../../../../lib/sync-logic.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Sincronización de ingresos de Kajabi lanzada a mano desde el panel
// (el cron nocturno hace lo mismo cada día).
export async function POST(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  const resultado = await syncKajabiToAirtable();
  if (!resultado.success) {
    return NextResponse.json({ success: false, error: resultado.error || resultado.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: resultado.data });
}
