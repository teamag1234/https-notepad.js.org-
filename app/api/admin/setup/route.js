import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { dbConfigurada, ensureSchema } from '../../../../lib/admin/db.js';
import { importarMovimientos } from '../../../../lib/admin/finanzas.js';

export const dynamic = 'force-dynamic';

// Inicializa la base de datos del panel: crea las tablas si no existen e
// importa el histórico de transacciones de Kajabi (jul-ago 2026) sin duplicar.
// Se lanza desde el botón "Inicializar" del panel /admin.
export async function POST(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  if (!dbConfigurada()) {
    return NextResponse.json(
      { success: false, error: 'Falta DATABASE_URL. Añade una base de datos Postgres (Neon) en Vercel → Storage.' },
      { status: 500 },
    );
  }
  try {
    await ensureSchema();
    const seedPath = path.join(process.cwd(), 'data', 'movimientos-seed.json');
    const seed = JSON.parse(await readFile(seedPath, 'utf8'));
    const resultado = await importarMovimientos(seed);
    return NextResponse.json({ success: true, message: 'Base de datos lista', seed: resultado });
  } catch (error) {
    console.error('Error en /api/admin/setup:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
