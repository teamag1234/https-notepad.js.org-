import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { dbConfigurada, ensureSchema } from '../../../../lib/admin/db.js';
import { getResumenFinanzas, importarMovimientos } from '../../../../lib/admin/finanzas.js';
import { getMorosos } from '../../../../lib/admin/airtable-live.js';

export const dynamic = 'force-dynamic';

async function cargarResumenCompleto(periodo) {
  const [finanzas, morosos] = await Promise.all([getResumenFinanzas(periodo), getMorosos()]);
  return { ...finanzas, morosos: morosos.morosos, totalMorosos: morosos.totalDeuda };
}

export async function GET(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  const { searchParams } = new URL(request.url);
  const periodo = {
    desde: searchParams.get('desde') || undefined,
    hasta: searchParams.get('hasta') || undefined,
  };
  try {
    if (!dbConfigurada()) {
      // Sin base de datos aún: devolvemos al menos los morosos en vivo de Airtable
      const morosos = await getMorosos();
      return NextResponse.json({
        success: true,
        data: { sinBaseDeDatos: true, morosos: morosos.morosos, totalMorosos: morosos.totalDeuda },
      });
    }
    try {
      return NextResponse.json({ success: true, data: await cargarResumenCompleto(periodo) });
    } catch (error) {
      // Primera visita con la base de datos recién conectada: las tablas aún no
      // existen. Las creamos e importamos el histórico de Kajabi automáticamente.
      if (!/does not exist/i.test(error.message)) throw error;
      console.log('Base de datos vacía: creando esquema e importando histórico…');
      await ensureSchema();
      const seedPath = path.join(process.cwd(), 'data', 'movimientos-seed.json');
      const seed = JSON.parse(await readFile(seedPath, 'utf8'));
      await importarMovimientos(seed);
      return NextResponse.json({ success: true, data: await cargarResumenCompleto(periodo) });
    }
  } catch (error) {
    console.error('Error en /api/admin/resumen:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
