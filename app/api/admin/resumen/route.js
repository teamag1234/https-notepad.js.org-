import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { dbConfigurada } from '../../../../lib/admin/db.js';
import { getResumenFinanzas } from '../../../../lib/admin/finanzas.js';
import { getMorosos } from '../../../../lib/admin/airtable-live.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  try {
    if (!dbConfigurada()) {
      // Sin base de datos aún: devolvemos al menos los morosos en vivo de Airtable
      const morosos = await getMorosos();
      return NextResponse.json({
        success: true,
        data: { sinBaseDeDatos: true, morosos: morosos.morosos, totalMorosos: morosos.totalDeuda },
      });
    }
    const [finanzas, morosos] = await Promise.all([getResumenFinanzas(), getMorosos()]);
    return NextResponse.json({
      success: true,
      data: {
        ...finanzas,
        morosos: morosos.morosos,
        totalMorosos: morosos.totalDeuda,
      },
    });
  } catch (error) {
    console.error('Error en /api/admin/resumen:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
