import { NextResponse } from 'next/server';
import axios from 'axios';

// RUTA TEMPORAL (se elimina tras la restauración del campo TIPO DE CURSO):
// devuelve una página del histórico de transacciones/compras de Kajabi en
// formato compacto, para reconstruir el curso de cada alumno en Airtable.
const CLAVE = '8850bc11e82b5c46f394ad1590fa471d';
const KAJABI_API = 'https://api.kajabi.com';

let tokenCache = { token: null, caducaEl: 0 };
async function token() {
  if (tokenCache.token && Date.now() < tokenCache.caducaEl - 60000) return tokenCache.token;
  const { data } = await axios.post(
    `${KAJABI_API}/v1/oauth/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.KAJABI_CLIENT_ID,
      client_secret: process.env.KAJABI_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  tokenCache = { token: data.access_token, caducaEl: Date.now() + (data.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

async function siteId(tk) {
  if (process.env.KAJABI_SITE_ID) return process.env.KAJABI_SITE_ID;
  const { data } = await axios.get(`${KAJABI_API}/v1/sites`, {
    headers: { Authorization: `Bearer ${tk}`, Accept: 'application/vnd.api+json' },
  });
  const sitios = data.data || [];
  const academia = sitios.find((s) => /AG\s*ACADEMY/i.test(s.attributes?.title || ''));
  return (academia || sitios[0]).id;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('clave') !== CLAVE) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const recurso = searchParams.get('recurso') === 'purchases' ? 'purchases' : 'transactions';
  const pagina = Math.max(1, Number(searchParams.get('pagina')) || 1);
  const paginas = Math.min(5, Math.max(1, Number(searchParams.get('paginas')) || 3));
  try {
    const tk = await token();
    const site = await siteId(tk);
    const filas = [];
    let p = pagina;
    let fin = false;
    for (let i = 0; i < paginas && !fin; i += 1, p += 1) {
      const { data } = await axios.get(`${KAJABI_API}/v1/${recurso}`, {
        params: {
          'page[number]': p,
          'page[size]': 100,
          include: 'customer,offer',
          'filter[site_id]': site,
        },
        headers: { Authorization: `Bearer ${tk}`, Accept: 'application/vnd.api+json' },
      });
      const inc = {};
      for (const x of data.included || []) inc[`${x.type}/${x.id}`] = x;
      for (const t of data.data || []) {
        const a = t.attributes || {};
        const cliente = inc[`customers/${t.relationships?.customer?.data?.id}`] || inc[`contacts/${t.relationships?.contact?.data?.id}`];
        const oferta = inc[`offers/${t.relationships?.offer?.data?.id}`];
        filas.push({
          e: cliente?.attributes?.email || null,
          n: cliente?.attributes?.name || null,
          o: oferta?.attributes?.title || a.offer_title || null,
          f: (a.created_at || '').slice(0, 10),
          s: a.state || a.status || null,
        });
      }
      if ((data.data || []).length < 100) fin = true;
    }
    return NextResponse.json({ recurso, desdePagina: pagina, leidas: filas.length, fin, siguiente: fin ? null : p, filas });
  } catch (error) {
    const detalle = error.response?.status
      ? `${error.response.status} ${JSON.stringify(error.response.data || {}).substring(0, 300)}`
      : error.message;
    return NextResponse.json({ error: detalle }, { status: 500 });
  }
}
