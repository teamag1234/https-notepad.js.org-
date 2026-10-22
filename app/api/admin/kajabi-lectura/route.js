import { NextResponse } from 'next/server';
import axios from 'axios';

// RUTA TEMPORAL DE SOLO LECTURA (se elimina tras el informe OPOSDEPORT/ANPE):
// reenvía una consulta GET a la API de Kajabi (transacciones, formularios,
// ofertas…) y devuelve la respuesta tal cual.
const CLAVE = 'ef256ba4293766dab5ea4903b42775af';
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('clave') !== CLAVE) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const ruta = String(searchParams.get('ruta') || '');
  if (!/^\/v1\/[a-z0-9_/-]+$/i.test(ruta)) {
    return NextResponse.json({ error: 'Ruta no válida (solo GET /v1/...)' }, { status: 400 });
  }
  const params = {};
  for (const [k, v] of searchParams.entries()) {
    if (k !== 'clave' && k !== 'ruta') params[k] = v;
  }
  try {
    const tk = await token();
    const { data } = await axios.get(`${KAJABI_API}${ruta}`, {
      params,
      headers: { Authorization: `Bearer ${tk}`, Accept: 'application/vnd.api+json' },
    });
    return NextResponse.json(data);
  } catch (error) {
    const detalle = error.response?.status
      ? `${error.response.status} ${JSON.stringify(error.response.data || {}).substring(0, 400)}`
      : error.message;
    return NextResponse.json({ error: detalle }, { status: 500 });
  }
}
