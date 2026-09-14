import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { dbConfigurada, ensureSchema, q } from '../../../../lib/admin/db.js';
import { getResumenFinanzas, importarMovimientos } from '../../../../lib/admin/finanzas.js';
import { getMorosos } from '../../../../lib/admin/airtable-live.js';

export const dynamic = 'force-dynamic';

// Salud de las fuentes de datos: cuándo se sincronizaron banco y Kajabi por
// última vez, para avisar en el dashboard si alguna se queda parada.
async function saludFuentes() {
  try {
    const filas = await q(`
      SELECT
        (SELECT MAX(ultima_sync) FROM banco_cuentas) AS banco_sync,
        (SELECT COUNT(*)::int FROM banco_cuentas) AS banco_cuentas,
        (SELECT actualizado_el FROM banco_config WHERE clave = 'kajabi_ingresos_sync') AS kajabi_sync,
        (SELECT MAX(creado_el) FROM movimientos WHERE fuente = 'KAJABI') AS kajabi_ultimo_ingreso
    `);
    return filas[0] || null;
  } catch {
    return null;
  }
}

async function cargarResumenCompleto(periodo) {
  const [finanzas, morosos, salud] = await Promise.all([getResumenFinanzas(periodo), getMorosos(), saludFuentes()]);
  return { ...finanzas, morosos: morosos.morosos, totalMorosos: morosos.totalDeuda, salud };
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
