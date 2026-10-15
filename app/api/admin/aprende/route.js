import { NextResponse } from 'next/server';
import axios from 'axios';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';
import { getContactoPorEmail } from '../../../../lib/kajabi.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Pasada puntual: apuntados de una oferta gratuita de Kajabi en un mes dado.
const CLAVE_PUNTUAL = 'ap-oct-7d4f2c9b8e1a3065';
const KAJABI_API = 'https://api.kajabi.com';
const SITE_ID = '167072';

async function token() {
  const { data } = await axios.post(`${KAJABI_API}/v1/oauth/token`, new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.KAJABI_CLIENT_ID,
    client_secret: process.env.KAJABI_CLIENT_SECRET,
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return data.access_token;
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const auth = comprobarAdmin(request);
  if (!auth.ok && params.get('clave') !== CLAVE_PUNTUAL) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  const tokenOferta = params.get('oferta') || 'Fg7tqFE6';
  const desde = params.get('desde') || '2026-10-01';
  try {
    const tk = await token();
    const cab = { Authorization: `Bearer ${tk}`, Accept: 'application/vnd.api+json' };

    // 1) Localizar la oferta por su token de checkout
    let oferta = null;
    for (let pagina = 1; pagina <= 10 && !oferta; pagina += 1) {
      const { data } = await axios.get(`${KAJABI_API}/v1/offers`, {
        params: { 'filter[site_id]': SITE_ID, 'page[size]': 100, 'page[number]': pagina }, headers: cab,
      });
      oferta = (data.data || []).find((o) =>
        o.attributes?.token === tokenOferta || String(o.attributes?.checkout_url || '').includes(tokenOferta));
      if ((data.data || []).length < 100) break;
    }
    if (!oferta) return NextResponse.json({ success: false, error: `No encuentro la oferta ${tokenOferta}` }, { status: 404 });

    // 2) Apuntados del mes: purchases de la oferta (si el filtro existe) o
    //    transacciones (las gratuitas generan transacción de 0€)
    const apuntados = new Map(); // email → {nombre, fecha}
    let via = null;
    try {
      let pagina = 1;
      for (;;) {
        const { data } = await axios.get(`${KAJABI_API}/v1/purchases`, {
          params: { 'filter[site_id]': SITE_ID, 'filter[offer_id]': oferta.id, include: 'customer', 'page[size]': 100, 'page[number]': pagina },
          headers: cab,
        });
        const inc = {};
        for (const c of data.included || []) inc[`${c.type}/${c.id}`] = c.attributes || {};
        for (const p of data.data || []) {
          const fecha = String(p.attributes?.created_at || '').slice(0, 10);
          if (fecha < desde) continue;
          const cli = inc[`customers/${p.relationships?.customer?.data?.id}`] || {};
          if (cli.email) apuntados.set(cli.email.toLowerCase(), { nombre: cli.name || '', fecha });
        }
        if ((data.data || []).length < 100 || pagina >= 30) break;
        pagina += 1;
      }
      via = 'purchases';
    } catch (e) {
      // Fallback: transacciones del mes (incluidas las de 0€) de esa oferta
      let pagina = 1;
      for (;;) {
        const { data } = await axios.get(`${KAJABI_API}/v1/transactions`, {
          params: { 'filter[site_id]': SITE_ID, 'filter[start_date]': desde, include: 'customer,offer', 'page[size]': 100, 'page[number]': pagina },
          headers: cab,
        });
        const inc = {};
        for (const c of data.included || []) inc[`${c.type}/${c.id}`] = c;
        for (const t of data.data || []) {
          if (String(t.relationships?.offer?.data?.id) !== String(oferta.id)) continue;
          if (String(t.attributes?.state).toLowerCase() !== 'succeeded') continue;
          const cli = inc[`customers/${t.relationships?.customer?.data?.id}`]?.attributes || {};
          if (cli.email) apuntados.set(cli.email.toLowerCase(), { nombre: cli.name || '', fecha: String(t.attributes?.created_at || '').slice(0, 10) });
        }
        if ((data.data || []).length < 100 || pagina >= 30) break;
        pagina += 1;
      }
      via = 'transactions';
    }

    // 3) Datos de contacto (teléfono, DNI, dirección) de cada apuntado
    const lista = [];
    for (const [email, v] of apuntados) {
      const contacto = await getContactoPorEmail(email).catch(() => null);
      lista.push({
        email, nombre: contacto?.nombre || v.nombre, fecha: v.fecha,
        telefono: contacto?.telefono || null, dni: contacto?.dni || null, direccion: contacto?.direccion || null,
      });
      await new Promise((r) => setTimeout(r, 120));
    }
    lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return NextResponse.json({
      success: true,
      data: { oferta: { id: oferta.id, titulo: oferta.attributes?.title }, via, total: lista.length, apuntados: lista },
    });
  } catch (error) {
    const detalle = error.response?.status ? `${error.response.status} ${JSON.stringify(error.response.data || {}).substring(0, 200)}` : error.message;
    return NextResponse.json({ success: false, error: detalle }, { status: 500 });
  }
}
