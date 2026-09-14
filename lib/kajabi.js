import axios from 'axios';

// Cliente de la API pública de Kajabi (https://api.kajabi.com/v1).
// Autenticación OAuth: client_credentials con KAJABI_CLIENT_ID y
// KAJABI_CLIENT_SECRET (Kajabi → Settings → Public API). La API pública
// requiere el plan Pro o el add-on de API de Kajabi.
const KAJABI_API = 'https://api.kajabi.com';

let tokenCache = { token: null, caducaEl: 0 };

export function kajabiConfigurado() {
  return !!(process.env.KAJABI_CLIENT_ID && process.env.KAJABI_CLIENT_SECRET);
}

async function tokenKajabi() {
  if (!kajabiConfigurado()) {
    throw new Error('Faltan KAJABI_CLIENT_ID y KAJABI_CLIENT_SECRET en Vercel (Kajabi → Settings → Public API)');
  }
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

// Transacciones (cobros y devoluciones reales, con importe) desde una fecha,
// con el cliente y la oferta resueltos. Formato JSON:API paginado.
export async function getTransacciones({ desde } = {}) {
  const token = await tokenKajabi();
  const transacciones = [];
  let pagina = 1;
  for (;;) {
    const { data } = await axios.get(`${KAJABI_API}/v1/transactions`, {
      params: {
        'page[number]': pagina,
        'page[size]': 100,
        include: 'customer,offer',
        ...(desde ? { 'filter[start_date]': desde } : {}),
      },
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.api+json' },
    });
    const incluidos = {};
    for (const inc of data.included || []) incluidos[`${inc.type}/${inc.id}`] = inc;
    for (const t of data.data || []) {
      const attrs = t.attributes || {};
      const cliente = incluidos[`customers/${t.relationships?.customer?.data?.id}`];
      const oferta = incluidos[`offers/${t.relationships?.offer?.data?.id}`];
      transacciones.push({
        id: t.id,
        estado: attrs.state,
        accion: attrs.action,
        tipoPago: attrs.payment_type,
        importe: (Number(attrs.amount_in_cents) || 0) / 100,
        moneda: attrs.currency,
        fecha: attrs.created_at,
        nombre: cliente?.attributes?.name || null,
        email: cliente?.attributes?.email || null,
        oferta: oferta?.attributes?.title || null,
      });
    }
    if ((data.data || []).length < 100 || pagina >= 30) break;
    pagina += 1;
  }
  return transacciones;
}

// ── Compatibilidad con el código antiguo ─────────────────────────────────────
// Las funciones siguientes apuntaban a endpoints /v4 que no existen en la API
// de Kajabi y siempre devolvían vacío. Se mantienen como stubs inofensivos.
export async function getPayments() { return []; }
export async function getCustomers() { return []; }
export async function getOrders() { return []; }
export async function updatePaymentInKajabi() { return null; }
