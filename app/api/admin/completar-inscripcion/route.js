import { NextResponse } from 'next/server';
import axios from 'axios';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { getTransacciones } from '../../../../lib/kajabi.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Pasada puntual: rellena FECHA INSCRIPCIÓN (fecha del primer cobro de
// septiembre) en las fichas creadas por el volcado de hoy que la tienen vacía.
const CLAVE_PUNTUAL = 'fi-sept-8c2d4a91e7b3f605';
const BASE = process.env.AIRTABLE_CURSOS_BASE_ID || 'appN0vx5OPGi81zB5';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const auth = comprobarAdmin(request);
  if (!auth.ok && body.clave !== CLAVE_PUNTUAL) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  try {
    const rest = axios.create({
      baseURL: `https://api.airtable.com/v0/${BASE}`,
      headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` },
    });
    const { data } = await rest.get('/CURSOS%20KAJABI', {
      params: {
        filterByFormula: `AND(IS_AFTER(CREATED_TIME(), '2026-09-14T13:00:00.000Z'), {FECHA INSCRIPCIÓN } = BLANK())`,
        pageSize: 100,
      },
    });
    const fichas = data.records || [];
    const transacciones = await getTransacciones({ desde: '2026-09-01' });
    const primeraFecha = {};
    for (const t of transacciones) {
      if (String(t.estado).toLowerCase() !== 'succeeded' || !t.email) continue;
      const clave = t.email.toLowerCase().trim();
      const fecha = String(t.fecha).slice(0, 10);
      if (!primeraFecha[clave] || fecha < primeraFecha[clave]) primeraFecha[clave] = fecha;
    }
    let actualizadas = 0;
    const sinFecha = [];
    for (const ficha of fichas) {
      const email = String(ficha.fields['Email'] || '').toLowerCase().trim();
      const fecha = primeraFecha[email];
      if (!fecha) { sinFecha.push(ficha.fields['Name'] || email); continue; }
      await rest.patch(`/CURSOS%20KAJABI/${ficha.id}?typecast=true`, { fields: { 'FECHA INSCRIPCIÓN ': fecha } });
      actualizadas += 1;
    }
    return NextResponse.json({ success: true, data: { fichasSinFecha: fichas.length, actualizadas, sinFecha } });
  } catch (error) {
    console.error('Error en completar-inscripcion:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
