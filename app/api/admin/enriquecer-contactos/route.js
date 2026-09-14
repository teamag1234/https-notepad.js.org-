import { NextResponse } from 'next/server';
import axios from 'axios';
import { comprobarAdmin } from '../../../../lib/admin/auth.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Pasada puntual: completa Email y Teléfono vacíos en CURSOS KAJABI cruzando
// con los contactos de Kajabi. Por email exacto (teléfono) o, si la ficha no
// tiene email, por nombre exacto y único. Nunca sobreescribe datos existentes.
const CLAVE_PUNTUAL = 'ec-9f4b7d2c81a3e650';
const BASE = process.env.AIRTABLE_CURSOS_BASE_ID || 'appN0vx5OPGi81zB5';
const KAJABI_API = 'https://api.kajabi.com';
const SITE_ID = '167072'; // AG ACADEMY

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

async function tokenKajabi() {
  const { data } = await axios.post(`${KAJABI_API}/v1/oauth/token`, new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.KAJABI_CLIENT_ID,
    client_secret: process.env.KAJABI_CLIENT_SECRET,
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return data.access_token;
}

async function buscarContactos(token, filtro, valor) {
  const { data } = await axios.get(`${KAJABI_API}/v1/contacts`, {
    params: { [`filter[${filtro}]`]: valor, 'filter[site_id]': SITE_ID, 'page[size]': 10 },
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.api+json' },
  });
  return (data.data || []).map((c) => c.attributes || {});
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const auth = comprobarAdmin(request);
  if (!auth.ok && body.clave !== CLAVE_PUNTUAL) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  const empezado = Date.now();
  const presupuestoMs = 240000;
  try {
    const rest = axios.create({
      baseURL: `https://api.airtable.com/v0/${BASE}`,
      headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` },
    });
    const token = await tokenKajabi();
    const resumen = { procesadas: 0, emails: 0, telefonos: 0, sinCoincidencia: 0, quedan: null };
    let offset = body.offset || null;

    while (Date.now() - empezado < presupuestoMs) {
      const { data } = await rest.get('/CURSOS%20KAJABI', {
        params: {
          filterByFormula: `OR(TRIM({Email}) = '', TRIM({Teléfono}) = '')`,
          pageSize: 25,
          ...(offset ? { offset } : {}),
        },
      });
      const fichas = data.records || [];
      for (const ficha of fichas) {
        if (Date.now() - empezado > presupuestoMs) break;
        resumen.procesadas += 1;
        const email = String(ficha.fields['Email'] || '').trim();
        const telefono = String(ficha.fields['Teléfono'] || '').trim();
        const nombre = String(ficha.fields['Name'] || '').trim();
        const campos = {};
        try {
          if (email && !telefono) {
            const contactos = await buscarContactos(token, 'email_contains', email.toLowerCase());
            const c = contactos.find((x) => normalizar(x.email) === normalizar(email));
            const tel = c?.phone_number || c?.business_number;
            if (tel) { campos['Teléfono'] = String(tel); resumen.telefonos += 1; }
            else resumen.sinCoincidencia += 1;
          } else if (!email && nombre) {
            const contactos = await buscarContactos(token, 'name_contains', nombre);
            const exactos = contactos.filter((x) => normalizar(x.name) === normalizar(nombre));
            if (exactos.length === 1) {
              const c = exactos[0];
              if (c.email) { campos['Email'] = c.email; resumen.emails += 1; }
              const tel = c.phone_number || c.business_number;
              if (!telefono && tel) { campos['Teléfono'] = String(tel); resumen.telefonos += 1; }
              if (!Object.keys(campos).length) resumen.sinCoincidencia += 1;
            } else resumen.sinCoincidencia += 1;
          }
        } catch (error) {
          resumen.sinCoincidencia += 1;
        }
        if (Object.keys(campos).length) {
          await rest.patch(`/CURSOS%20KAJABI/${ficha.id}?typecast=true`, { fields: campos }).catch(() => {});
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      offset = data.offset || null;
      if (!offset) break;
    }
    resumen.quedan = offset; // null = tabla recorrida entera
    return NextResponse.json({ success: true, data: resumen });
  } catch (error) {
    console.error('Error en enriquecer-contactos:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
