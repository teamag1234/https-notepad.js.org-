import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { listarMovimientos, crearMovimiento, borrarMovimiento, cambiarCategoria, CATEGORIAS_GASTO, CATEGORIAS_INGRESO } from '../../../../lib/admin/finanzas.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  try {
    const { searchParams } = new URL(request.url);
    const movimientos = await listarMovimientos({
      tipo: searchParams.get('tipo') || undefined,
      mes: searchParams.get('mes') || undefined,
      limite: searchParams.get('limite') || undefined,
    });
    return NextResponse.json({ success: true, data: movimientos });
  } catch (error) {
    console.error('Error listando movimientos:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  try {
    const body = await request.json();
    if (!body.tipo || !['INGRESO', 'GASTO'].includes(body.tipo)) {
      return NextResponse.json({ success: false, error: 'tipo debe ser INGRESO o GASTO' }, { status: 400 });
    }
    if (!body.concepto || !body.fecha || body.importe == null || isNaN(Number(body.importe))) {
      return NextResponse.json(
        { success: false, error: 'Concepto, fecha e importe son obligatorios' },
        { status: 400 },
      );
    }
    const creado = await crearMovimiento({
      tipo: body.tipo,
      fecha: body.fecha,
      importe: Number(body.importe),
      concepto: body.concepto,
      categoria: body.categoria,
      contacto: body.contacto,
      email: body.email,
      fuente: 'MANUAL',
      notas: body.notas,
    });
    return NextResponse.json({ success: true, data: creado });
  } catch (error) {
    console.error('Error creando movimiento:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  try {
    const body = await request.json();
    if (!body.id || !body.categoria) {
      return NextResponse.json({ success: false, error: 'Faltan id o categoria' }, { status: 400 });
    }
    if (![...CATEGORIAS_GASTO, ...CATEGORIAS_INGRESO, 'Traspaso Kajabi'].includes(body.categoria)) {
      return NextResponse.json({ success: false, error: 'Categoría no válida' }, { status: 400 });
    }
    await cambiarCategoria(Number(body.id), body.categoria);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error cambiando categoría:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'Falta el id' }, { status: 400 });
    }
    await borrarMovimiento(Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error borrando movimiento:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
