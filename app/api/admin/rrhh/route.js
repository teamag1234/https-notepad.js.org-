import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { dbConfigurada } from '../../../../lib/admin/db.js';
import {
  listarTrabajadores, crearTrabajador, actualizarTrabajador, detalleTrabajador,
  crearDocumento, borrarDocumento, crearVacaciones, cambiarEstadoVacaciones, borrarVacaciones,
} from '../../../../lib/admin/rrhh.js';
import { diagnosticoAgapp } from '../../../../lib/admin/agapp.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  if (!dbConfigurada()) return NextResponse.json({ success: false, error: 'Falta la base de datos (DATABASE_URL)' }, { status: 500 });
  try {
    const params = new URL(request.url).searchParams;
    const id = params.get('trabajador');
    if (id) {
      const detalle = await detalleTrabajador(Number(id), params.get('perfil') || null);
      return NextResponse.json({ success: true, data: detalle });
    }
    const [trabajadores, diagAgapp] = await Promise.all([listarTrabajadores(), diagnosticoAgapp()]);
    return NextResponse.json({
      success: true,
      data: {
        trabajadores,
        blobConfigurado: !!process.env.BLOB_READ_WRITE_TOKEN,
        fichajeIntegrado: diagAgapp.definida && diagAgapp.ok === true,
        diagAgapp,
      },
    });
  } catch (error) {
    console.error('Error en /api/admin/rrhh:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    switch (body.accion) {
      case 'crear-trabajador': {
        if (!body.nombre) return NextResponse.json({ success: false, error: 'Falta el nombre' }, { status: 400 });
        const creado = await crearTrabajador(body);
        return NextResponse.json({ success: true, data: creado });
      }
      case 'editar-trabajador': {
        await actualizarTrabajador(Number(body.id), body.campos || {});
        return NextResponse.json({ success: true });
      }
      case 'crear-documento': {
        if (!body.trabajador_id || !body.titulo || !body.url) {
          return NextResponse.json({ success: false, error: 'Faltan datos del documento' }, { status: 400 });
        }
        const origen = process.env.ADMIN_BASE_URL || new URL(request.url).origin;
        const creado = await crearDocumento({ ...body, origen });
        return NextResponse.json({ success: true, data: creado });
      }
      case 'borrar-documento': {
        await borrarDocumento(Number(body.id));
        return NextResponse.json({ success: true });
      }
      case 'crear-vacaciones': {
        if (!body.trabajador_id || !body.desde || !body.hasta) {
          return NextResponse.json({ success: false, error: 'Faltan las fechas' }, { status: 400 });
        }
        const creado = await crearVacaciones(body);
        return NextResponse.json({ success: true, data: creado });
      }
      case 'estado-vacaciones': {
        if (!['PENDIENTE', 'APROBADA', 'RECHAZADA'].includes(body.estado)) {
          return NextResponse.json({ success: false, error: 'Estado no válido' }, { status: 400 });
        }
        await cambiarEstadoVacaciones(Number(body.id), body.estado);
        return NextResponse.json({ success: true });
      }
      case 'borrar-vacaciones': {
        await borrarVacaciones(Number(body.id));
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ success: false, error: 'Acción no válida' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error en /api/admin/rrhh:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
