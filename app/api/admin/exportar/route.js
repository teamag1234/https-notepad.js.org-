import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { dbConfigurada } from '../../../../lib/admin/db.js';
import { excelAnualBanco } from '../../../../lib/admin/exportar.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Excel anual de movimientos del banco (?anio=2026).
// Clave puntual temporal para la extracción inicial de 2026.
const CLAVE_PUNTUAL = 'ex-2026-b83f19d4c7a2e650';

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const auth = comprobarAdmin(request);
  if (!auth.ok && params.get('clave') !== CLAVE_PUNTUAL) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  if (!dbConfigurada()) return NextResponse.json({ success: false, error: 'Falta la base de datos' }, { status: 500 });
  try {
    const anio = Number(params.get('anio')) || new Date().getFullYear();
    const { buffer } = await excelAnualBanco(anio);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="banco-AG-${anio}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Error exportando año:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
