import { NextResponse } from 'next/server';
import { dbConfigurada } from '../../../lib/admin/db.js';
import { trabajadoresParaFichar, fichar } from '../../../lib/admin/rrhh.js';

export const dynamic = 'force-dynamic';

// Página pública de fichaje: lista de trabajadores activos con PIN configurado
// (solo nombre e id; la acción de fichar exige el PIN personal).
export async function GET() {
  if (!dbConfigurada()) return NextResponse.json({ success: false, error: 'Sin base de datos' }, { status: 500 });
  try {
    const trabajadores = await trabajadoresParaFichar();
    return NextResponse.json({ success: true, data: trabajadores });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body.trabajador_id || !body.pin) {
      return NextResponse.json({ success: false, error: 'Faltan trabajador o PIN' }, { status: 400 });
    }
    const resultado = await fichar({ trabajador_id: Number(body.trabajador_id), pin: body.pin });
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    const estado = error.message === 'PIN incorrecto' ? 401 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status: estado });
  }
}
