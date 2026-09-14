import axios from 'axios';
import { q } from './db.js';

// ROAS / ROI por fuente del lead: cruza los ingresos del panel (por email del
// alumno) con la columna FUENTE DEL LEAD de Airtable, y la inversión real en
// publicidad (gastos del banco con categoría "Publicidad / Ads") repartida por
// plataforma según el concepto del cargo.
const BASE = process.env.AIRTABLE_CURSOS_BASE_ID || 'appN0vx5OPGi81zB5';
const TABLA = 'CURSOS KAJABI';

// Plataforma de inversión a la que pertenece una fuente de lead
export function plataformaDeFuente(fuente) {
  const f = String(fuente || '').toUpperCase();
  if (/META|FACEBOOK|INSTAGRAM/.test(f)) return 'Meta';
  if (/GOOGLE|ADWORDS|YOUTUBE/.test(f)) return 'Google';
  if (/TIK\s*TOK/.test(f)) return 'TikTok';
  return null; // fuente sin inversión publicitaria (orgánico, recomendación…)
}

function plataformaDeGasto(concepto) {
  const c = String(concepto || '').toUpperCase();
  if (/FACEBK|FACEBOOK|META/.test(c)) return 'Meta';
  if (/GOOGLE|ADWORDS/.test(c)) return 'Google';
  if (/TIK\s*TOK/.test(c)) return 'TikTok';
  return 'Otras plataformas';
}

// email (minúsculas) → fuente del lead, leyendo toda la tabla de alumnos
async function mapaFuentes() {
  const api = axios.create({
    baseURL: `https://api.airtable.com/v0/${BASE}`,
    headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` },
  });
  const mapa = {};
  let offset = null;
  do {
    const { data } = await api.get(`/${encodeURIComponent(TABLA)}`, {
      params: {
        pageSize: 100,
        'fields[]': ['Email', 'FUENTE DEL LEAD'],
        ...(offset ? { offset } : {}),
      },
      paramsSerializer: {
        serialize: (p) => Object.entries(p).flatMap(([k, v]) =>
          Array.isArray(v) ? v.map((x) => `${encodeURIComponent(k + '[]')}=${encodeURIComponent(x)}`) : [`${encodeURIComponent(k)}=${encodeURIComponent(v)}`],
        ).join('&'),
      },
    });
    for (const r of data.records || []) {
      const email = String(r.fields['Email'] || '').trim().toLowerCase();
      if (email && !(email in mapa)) mapa[email] = String(r.fields['FUENTE DEL LEAD'] || '').trim();
    }
    offset = data.offset;
  } while (offset);
  return mapa;
}

export async function getRoas({ desde, hasta } = {}) {
  const hoy = new Date().toISOString().slice(0, 7);
  const d = desde || hoy;
  const h = hasta || d;

  const [fuentesPorEmail, ingresos, gastosAds] = await Promise.all([
    mapaFuentes(),
    q(`
      SELECT COALESCE(LOWER(TRIM(email)), '') AS email, SUM(importe)::float AS total, COUNT(*)::int AS cobros
      FROM movimientos
      WHERE tipo = 'INGRESO' AND categoria <> 'Traspaso Kajabi' AND to_char(fecha, 'YYYY-MM') BETWEEN $1 AND $2
      GROUP BY 1
    `, [d, h]),
    q(`
      SELECT concepto, SUM(importe)::float AS total
      FROM movimientos
      WHERE tipo = 'GASTO' AND categoria = 'Publicidad / Ads' AND to_char(fecha, 'YYYY-MM') BETWEEN $1 AND $2
      GROUP BY concepto
    `, [d, h]),
  ]);

  // Facturación por fuente del lead
  const porFuente = {};
  let facturacionTotal = 0;
  for (const fila of ingresos) {
    const fuente = (fila.email && fuentesPorEmail[fila.email]) || 'SIN FUENTE';
    porFuente[fuente] = porFuente[fuente] || { facturado: 0, cobros: 0 };
    porFuente[fuente].facturado += fila.total;
    porFuente[fuente].cobros += fila.cobros;
    facturacionTotal += fila.total;
  }

  // Inversión por plataforma
  const inversion = {};
  let inversionTotal = 0;
  for (const gasto of gastosAds) {
    const plat = plataformaDeGasto(gasto.concepto);
    inversion[plat] = (inversion[plat] || 0) + gasto.total;
    inversionTotal += gasto.total;
  }

  // Bloques por plataforma con inversión: facturado = suma de sus fuentes
  const r2 = (x) => Math.round(x * 100) / 100;
  const plataformas = [];
  for (const plat of ['Meta', 'Google', 'TikTok', 'Otras plataformas']) {
    const invertido = inversion[plat] || 0;
    const fuentes = Object.entries(porFuente)
      .filter(([f]) => plataformaDeFuente(f) === plat)
      .map(([f, v]) => ({ fuente: f, facturado: r2(v.facturado), cobros: v.cobros }))
      .sort((a, b) => b.facturado - a.facturado);
    const facturado = fuentes.reduce((s, f) => s + f.facturado, 0);
    if (!invertido && !facturado) continue;
    plataformas.push({
      plataforma: plat,
      invertido: r2(invertido),
      facturado: r2(facturado),
      roas: invertido > 0 ? r2(facturado / invertido) : null,
      roi: invertido > 0 ? r2(((facturado - invertido) / invertido) * 100) : null,
      fuentes,
    });
  }

  // Fuentes sin inversión (orgánico, recomendación, afiliados…)
  const organicas = Object.entries(porFuente)
    .filter(([f]) => !plataformaDeFuente(f))
    .map(([f, v]) => ({ fuente: f, facturado: r2(v.facturado), cobros: v.cobros }))
    .sort((a, b) => b.facturado - a.facturado);
  const facturadoOrganico = r2(organicas.reduce((s, f) => s + f.facturado, 0));

  return {
    periodo: { desde: d, hasta: h },
    plataformas,
    organicas,
    facturadoOrganico,
    totales: {
      invertido: r2(inversionTotal),
      facturado: r2(facturacionTotal),
      roas: inversionTotal > 0 ? r2(facturacionTotal / inversionTotal) : null,
      roi: inversionTotal > 0 ? r2(((facturacionTotal - inversionTotal) / inversionTotal) * 100) : null,
    },
  };
}
