import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { getTransacciones } from '../../../../lib/kajabi.js';
import { backfillMesKajabi } from '../../../../lib/admin/airtable-pagos.js';
import { cuotasDeOferta, esPrimerPago } from '../../../../lib/sync-logic.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Vuelca en Airtable todos los cobros de Kajabi de un mes (?mes=2026-09):
// crea las fichas que falten y anota los pagos en la columna del mes, sin
// tocar los importes ya anotados a mano (esos vuelven en "saltados").
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const auth = comprobarAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  const mes = String(body.mes || '').match(/^\d{4}-\d{2}$/) ? body.mes : null;
  if (!mes) return NextResponse.json({ success: false, error: 'Falta mes (formato 2026-09)' }, { status: 400 });
  try {
    const transacciones = await getTransacciones({ desde: `${mes}-01` });
    const delMes = transacciones.filter((t) =>
      String(t.fecha || '').startsWith(mes)
      && String(t.estado).toLowerCase() === 'succeeded'
      && !String(t.accion || t.tipoPago || '').toLowerCase().includes('refund')
      && t.importe > 0,
    );
    const pagos = [];
    for (const t of delMes) {
      const fecha = String(t.fecha).slice(0, 10);
      pagos.push({
        nombre: t.nombre,
        email: t.email,
        oferta: t.oferta,
        importe: t.importe,
        fecha,
        cuotas: cuotasDeOferta(t),
        esPrimera: await esPrimerPago(t, fecha).catch(() => false),
      });
    }
    pagos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const informe = await backfillMesKajabi(pagos);
    return NextResponse.json({ success: true, data: { mes, cobrosDelMes: pagos.length, ...informe } });
  } catch (error) {
    console.error('Error en backfill-mes:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
