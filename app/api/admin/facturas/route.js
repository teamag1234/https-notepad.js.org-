import { NextResponse } from 'next/server';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { dbConfigurada } from '../../../../lib/admin/db.js';
import {
  listarFacturas, cobrosSinFactura, crearFactura, actualizarFactura, borrarFactura,
  pdfFactura, enviarFactura, EMISOR,
} from '../../../../lib/admin/facturas.js';
import { getContactoPorEmail, kajabiConfigurado } from '../../../../lib/kajabi.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  if (!dbConfigurada()) return NextResponse.json({ success: false, error: 'Falta la base de datos (DATABASE_URL)' }, { status: 500 });
  try {
    const params = new URL(request.url).searchParams;
    // Descarga del PDF
    const pdfId = params.get('pdf');
    if (pdfId) {
      const { buffer, factura } = await pdfFactura(Number(pdfId));
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${factura.numero}-AGAcademy.pdf"`,
        },
      });
    }
    // Autocompletar datos del cliente desde Kajabi
    const email = params.get('contacto');
    if (email) {
      if (!kajabiConfigurado()) return NextResponse.json({ success: true, data: null });
      const contacto = await getContactoPorEmail(email).catch(() => null);
      return NextResponse.json({ success: true, data: contacto });
    }
    const [facturas, cobros] = await Promise.all([listarFacturas(), cobrosSinFactura()]);
    return NextResponse.json({ success: true, data: { facturas, cobros, emisor: EMISOR } });
  } catch (error) {
    console.error('Error en /api/admin/facturas:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = comprobarAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    switch (body.accion) {
      case 'crear': {
        const creada = await crearFactura(body);
        return NextResponse.json({ success: true, data: creada });
      }
      case 'crear-y-enviar': {
        const creada = await crearFactura(body);
        const envio = await enviarFactura(creada.id);
        return NextResponse.json({ success: true, data: { ...creada, ...envio } });
      }
      case 'editar': {
        await actualizarFactura(Number(body.id), body.campos || {});
        return NextResponse.json({ success: true });
      }
      case 'enviar': {
        const envio = await enviarFactura(Number(body.id));
        return NextResponse.json({ success: true, data: envio });
      }
      case 'borrar': {
        await borrarFactura(Number(body.id));
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ success: false, error: 'Acción no válida' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error en facturas:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
