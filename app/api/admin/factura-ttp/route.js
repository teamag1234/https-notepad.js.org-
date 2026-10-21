import { NextResponse } from 'next/server';
import { crearFactura } from '../../../../lib/admin/facturas.js';

// RUTA TEMPORAL (se elimina tras usarla una vez): registra en la serie oficial
// la factura de liquidación a TEN TU PLAZA para reservar su número.
const CLAVE = '91a6cd133bac39b2ea3b042e';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('clave') !== CLAVE) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const creada = await crearFactura({
      alumno: 'TEN TU PLAZA',
      concepto: 'Liquidación: servicios de teacher personal curso de inglés (20.000,00 €) − 25% comisión ventas cursos a sus alumnos pdte. de abono (−3.612,00 €) + curso de Tenerife abonado por AG (720,00 €)',
      cantidad: 1,
      importe: 17108,
      referencia: 'ttp-liquidacion-oct-2026',
      pagada: false,
    });
    return NextResponse.json(creada);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
