import axios from 'axios';

// Integración con la app de productividad del equipo (app.ag-app.es), que
// guarda sus datos en Supabase. El fichaje se hace ALLÍ; este panel solo lee:
//   profiles      → el equipo (nombre, email)
//   work_sessions → los fichajes (clock_in / clock_out)
// Necesita la clave secreta del proyecto Supabase en AGAPP_SUPABASE_KEY
// (Supabase → Project Settings → API Keys → service_role/secret).

const URL_SUPABASE = process.env.AGAPP_SUPABASE_URL || 'https://ulrqxttoxkqeztsrueji.supabase.co';

export function agappConfigurado() {
  return !!process.env.AGAPP_SUPABASE_KEY;
}

function api() {
  const key = process.env.AGAPP_SUPABASE_KEY;
  return axios.create({
    baseURL: `${URL_SUPABASE}/rest/v1`,
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    timeout: 20000,
  });
}

function emailsDePerfil(p) {
  return [p.email, p.google_email].filter(Boolean).map((e) => String(e).trim().toLowerCase());
}

function horas(ms) {
  return Math.round((ms / 3600000) * 10) / 10;
}

// Diagnóstico de la conexión (sin exponer la clave): ¿está definida? ¿funciona?
export async function diagnosticoAgapp() {
  if (!agappConfigurado()) return { definida: false };
  const clave = process.env.AGAPP_SUPABASE_KEY;
  const resultado = { definida: true, caracteres: clave.length, prefijo: clave.substring(0, 10) };
  try {
    const { data } = await api().get('/profiles', { params: { select: 'id', limit: 1 } });
    resultado.ok = true;
    resultado.hayPerfiles = (data || []).length > 0;
  } catch (error) {
    resultado.ok = false;
    resultado.error = error.response
      ? `${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 200)}`
      : error.message;
  }
  return resultado;
}

// Horas por persona (hoy / semana / mes) a partir de los fichajes de la app
export async function resumenHorasAgapp() {
  if (!agappConfigurado()) return { configurado: false, porEmail: {}, perfiles: [] };
  const ahora = new Date();
  const inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const diaSemana = (ahora.getDay() + 6) % 7; // lunes = 0
  const inicioSemana = new Date(inicioDia.getTime() - diaSemana * 86400000);
  const desde = new Date(Math.min(inicioMes, inicioSemana)).toISOString();

  const [perfilesRes, sesionesRes] = await Promise.all([
    api().get('/profiles', { params: { select: '*', order: 'name' } }),
    api().get('/work_sessions', {
      params: { select: 'user_id,clock_in,clock_out', clock_in: `gte.${desde}`, order: 'clock_in' },
    }),
  ]);
  const perfiles = perfilesRes.data || [];
  const sesiones = sesionesRes.data || [];

  const porUsuario = {};
  for (const s of sesiones) {
    const inicio = new Date(s.clock_in);
    const fin = s.clock_out ? new Date(s.clock_out) : ahora;
    const acumulado = porUsuario[s.user_id] || { hoy: 0, semana: 0, mes: 0, trabajando: false };
    const dur = Math.max(0, fin - inicio);
    if (inicio >= inicioDia) acumulado.hoy += dur;
    if (inicio >= inicioSemana) acumulado.semana += dur;
    if (inicio >= inicioMes) acumulado.mes += dur;
    if (!s.clock_out) acumulado.trabajando = true;
    porUsuario[s.user_id] = acumulado;
  }

  const porEmail = {};
  for (const p of perfiles) {
    const acumulado = porUsuario[p.id] || { hoy: 0, semana: 0, mes: 0, trabajando: false };
    const datos = {
      perfilId: p.id,
      nombre: p.name || p.full_name || '',
      horasHoy: horas(acumulado.hoy),
      horasSemana: horas(acumulado.semana),
      horasMes: horas(acumulado.mes),
      trabajandoAhora: acumulado.trabajando,
    };
    for (const email of emailsDePerfil(p)) porEmail[email] = datos;
  }
  return { configurado: true, porEmail, perfiles };
}

// Últimos fichajes de una persona (por su id de perfil en la app)
export async function sesionesDePerfil(perfilId, limite = 30) {
  if (!agappConfigurado()) return [];
  const { data } = await api().get('/work_sessions', {
    params: { select: 'id,clock_in,clock_out', user_id: `eq.${perfilId}`, order: 'clock_in.desc', limit: limite },
  });
  const formatear = (iso) =>
    new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return (data || []).map((s) => ({
    id: s.id,
    entrada: formatear(s.clock_in),
    salida: s.clock_out ? formatear(s.clock_out) : null,
    horas: Math.round(((s.clock_out ? new Date(s.clock_out) : new Date()) - new Date(s.clock_in)) / 360000) / 10,
    abierto: !s.clock_out,
  }));
}
