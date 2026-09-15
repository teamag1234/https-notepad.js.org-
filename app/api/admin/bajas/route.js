import { NextResponse } from 'next/server';
import { comprobarFacturas, comprobarAdmin } from '../../../../lib/admin/auth.js';
import { dbConfigurada, q } from '../../../../lib/admin/db.js';
import { listarBajas, iniciarBaja, enviarFormularioAlumno, marcarTransferida, cancelarBaja } from '../../../../lib/admin/bajas.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Bajas y devoluciones: accesible para el equipo (clave de facturación) salvo
// marcar la transferencia como hecha, que es cosa de administración.
export async function GET(request) {
  const auth = comprobarFacturas(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  if (!dbConfigurada()) return NextResponse.json({ success: false, error: 'Falta la base de datos (DATABASE_URL)' }, { status: 500 });
  try {
    const [bajas, cobros] = await Promise.all([
      listarBajas(),
      q(`
        SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, importe::float AS importe,
               concepto, contacto, email, referencia,
               (CURRENT_DATE - fecha)::int AS dias
        FROM movimientos
        WHERE tipo = 'INGRESO' AND categoria <> 'Traspaso Kajabi' AND fecha >= CURRENT_DATE - 60
        ORDER BY fecha DESC, id DESC LIMIT 200
      `),
    ]);
    return NextResponse.json({ success: true, data: { bajas, cobros, rol: auth.rol } });
  } catch (error) {
    console.error('Error en /api/admin/bajas:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = comprobarFacturas(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    const origen = process.env.ADMIN_BASE_URL || new URL(request.url).origin;
    switch (body.accion) {
      case 'iniciar': {
        const r = await iniciarBaja(body, origen);
        return NextResponse.json({ success: true, data: r });
      }
      case 'reenviar-formulario': {
        const r = await enviarFormularioAlumno(Number(body.id), origen);
        return NextResponse.json({ success: true, data: r });
      }
      case 'transferida': {
        const admin = comprobarAdmin(request);
        if (!admin.ok) return NextResponse.json({ success: false, error: 'Marcar la transferencia es solo de administración' }, { status: 403 });
        const r = await marcarTransferida(Number(body.id));
        return NextResponse.json({ success: true, data: r });
      }
      case 'cancelar': {
        await cancelarBaja(Number(body.id));
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ success: false, error: 'Acción no válida' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error en bajas:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
