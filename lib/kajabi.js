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

// Describe el estado de cada variable SIN revelar su contenido, para poder
// diagnosticar desde el panel: si falta, si está vacía o si se pegó el texto
// oculto (puntitos) en vez de la clave real.
export function diagnosticoKajabi() {
  const describir = (nombre, valor, mostrarPrefijo) => {
    if (valor === undefined) return `${nombre}: NO existe en Vercel (revisa el nombre exacto y que esté marcada para Production)`;
    const v = String(valor).trim();
    if (!v) return `${nombre}: existe pero está VACÍA`;
    if (/[•·•·●…]/.test(v) || /[^\x21-\x7E]/.test(v)) {
      return `${nombre}: parece pegada desde el texto oculto (puntitos) — vuelve a Kajabi y usa el BOTÓN de copiar, no selecciones los puntos`;
    }
    return `${nombre}: definida (${v.length} caracteres${mostrarPrefijo ? `, empieza por "${v.slice(0, 4)}…"` : ''})`;
  };
  return [
    describir('KAJABI_CLIENT_ID', process.env.KAJABI_CLIENT_ID, true),
    describir('KAJABI_CLIENT_SECRET', process.env.KAJABI_CLIENT_SECRET, false),
  ].join(' · ');
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

// El listado de transacciones exige filter[site_id]. Se resuelve solo
// leyendo los sitios de la cuenta (o con KAJABI_SITE_ID si algún día hay
// más de uno y se quiere fijar).
let siteIdCache = null;
async function siteId(token) {
  if (process.env.KAJABI_SITE_ID) return process.env.KAJABI_SITE_ID;
  if (siteIdCache) return siteIdCache;
  const { data } = await axios.get(`${KAJABI_API}/v1/sites`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.api+json' },
  });
  const sitios = data.data || [];
  if (!sitios.length) throw new Error('La cuenta de Kajabi no devuelve ningún sitio');
  // La cuenta tiene varios sitios (Euneiz, ACADEMIA, Partner…): el de la
  // academia es "AG ACADEMY". Si no aparece, se usa el primero.
  const academia = sitios.find((s) => /AG\s*ACADEMY/i.test(s.attributes?.title || ''));
  siteIdCache = (academia || sitios[0]).id;
  return siteIdCache;
}

// Lista de sitios de la cuenta (para el diagnóstico y para elegir el correcto)
export async function listarSitios() {
  const token = await tokenKajabi();
  const { data } = await axios.get(`${KAJABI_API}/v1/sites`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.api+json' },
  });
  return (data.data || []).map((s) => ({
    id: s.id,
    titulo: s.attributes?.title || s.attributes?.name || s.attributes?.subdomain || '',
  }));
}

// Transacciones (cobros y devoluciones reales, con importe) desde una fecha,
// con el cliente y la oferta resueltos. Formato JSON:API paginado.
export async function getTransacciones({ desde } = {}) {
  const token = await tokenKajabi();
  const site = await siteId(token);
  const transacciones = [];
  let pagina = 1;
  for (;;) {
    const { data } = await axios.get(`${KAJABI_API}/v1/transactions`, {
      params: {
        'page[number]': pagina,
        'page[size]': 100,
        include: 'customer,offer',
        'filter[site_id]': site,
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
        ofertaTipoPago: oferta?.attributes?.payment_type || null,
        ofertaPrecioDesc: oferta?.attributes?.price_description || null,
        ofertaPrecioTotal: oferta?.attributes?.price_in_cents != null ? Number(oferta.attributes.price_in_cents) / 100 : null,
      });
    }
    if ((data.data || []).length < 100 || pagina >= 30) break;
    pagina += 1;
  }
  return transacciones;
}

// Datos del contacto por email (dirección, teléfono, DNI si está en los
// campos personalizados) — para autocompletar facturas.
export async function getContactoPorEmail(email) {
  if (!email) return null;
  const token = await tokenKajabi();
  const site = await siteId(token);
  const { data } = await axios.get(`${KAJABI_API}/v1/contacts`, {
    params: { 'filter[email_contains]': String(email).toLowerCase().trim(), 'filter[site_id]': site, 'page[size]': 5 },
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.api+json' },
  });
  const contacto = (data.data || [])
    .map((c) => c.attributes || {})
    .find((a) => String(a.email || '').toLowerCase().trim() === String(email).toLowerCase().trim());
  if (!contacto) return null;
  // DNI/NIE: puede venir en cualquiera de los campos personalizados
  const esDni = (v) => /^[XYZ]?\d{7,8}[A-Z]$/i.test(String(v || '').replace(/[\s.-]/g, ''));
  const dni = [contacto.custom_1, contacto.custom_2, contacto.custom_3].find(esDni) || null;
  const direccion = [
    contacto.address_line_1, contacto.address_line_2,
    [contacto.address_zip, contacto.address_city].filter(Boolean).join(' '),
    contacto.address_state, contacto.address_country,
  ].filter((x) => String(x || '').trim()).join(', ');
  return {
    nombre: contacto.name || null,
    email: contacto.email || null,
    telefono: contacto.phone_number || contacto.business_number || null,
    dni: dni ? String(dni).replace(/[\s.-]/g, '').toUpperCase() : null,
    direccion: direccion || null,
    personalizados: [contacto.custom_1, contacto.custom_2, contacto.custom_3].filter(Boolean),
  };
}

// ── Compatibilidad con el código antiguo ─────────────────────────────────────
// Las funciones siguientes apuntaban a endpoints /v4 que no existen en la API
// de Kajabi y siempre devolvían vacío. Se mantienen como stubs inofensivos.
export async function getPayments() { return []; }
export async function getCustomers() { return []; }
export async function getOrders() { return []; }
export async function updatePaymentInKajabi() { return null; }
