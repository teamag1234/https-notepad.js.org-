import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { q, ensureSchema } from './db.js';
import { resumenHorasAgapp, sesionesDePerfil } from './agapp.js';

// RRHH: trabajadores, documentos/nóminas y vacaciones. Las horas y fichajes
// se leen de la app de productividad del equipo (app.ag-app.es / Supabase)
// cuando la integración está configurada.

// Da de alta automáticamente en el panel a los miembros del equipo de la app
// que aún no tengan ficha aquí (emparejados por email)
async function sincronizarEquipo(agapp) {
  if (!agapp.configurado || !agapp.perfiles.length) return;
  const existentes = await q(`SELECT LOWER(COALESCE(email, '')) AS email FROM trabajadores`);
  const emails = new Set(existentes.map((e) => e.email).filter(Boolean));
  for (const p of agapp.perfiles) {
    const email = (p.email || p.google_email || '').trim().toLowerCase();
    const nombre = p.name || p.full_name;
    if (!email || !nombre || emails.has(email)) continue;
    await q(`INSERT INTO trabajadores (nombre, email) VALUES ($1, $2)`, [nombre, email]);
    emails.add(email);
  }
}

export async function listarTrabajadores() {
  await ensureSchema();
  const agapp = await resumenHorasAgapp().catch((e) => {
    console.error('Aviso: no se pudo leer app.ag-app.es:', e.message);
    return { configurado: false, porEmail: {}, perfiles: [] };
  });
  await sincronizarEquipo(agapp).catch(() => {});
  const trabajadores = await q(`
    SELECT t.id, t.nombre, t.email, t.puesto, to_char(t.fecha_alta, 'YYYY-MM-DD') AS fecha_alta,
           t.dias_vacaciones, t.activo, t.notas, (t.pin IS NOT NULL AND t.pin <> '') AS tiene_pin
    FROM trabajadores t ORDER BY t.activo DESC, t.nombre
  `);
  if (!trabajadores.length) return [];
  const anio = new Date().getFullYear();
  const [vacas, horas, abiertos, docs] = await Promise.all([
    q(`
      SELECT trabajador_id, COALESCE(SUM(dias), 0)::int AS usados
      FROM vacaciones WHERE estado = 'APROBADA' AND EXTRACT(YEAR FROM desde) = $1
      GROUP BY trabajador_id
    `, [anio]),
    q(`
      SELECT trabajador_id,
        COALESCE(SUM(CASE WHEN entrada >= date_trunc('day', now()) THEN EXTRACT(EPOCH FROM (COALESCE(salida, now()) - entrada)) END), 0)::float / 3600 AS horas_hoy,
        COALESCE(SUM(CASE WHEN entrada >= date_trunc('week', now()) THEN EXTRACT(EPOCH FROM (COALESCE(salida, now()) - entrada)) END), 0)::float / 3600 AS horas_semana,
        COALESCE(SUM(CASE WHEN entrada >= date_trunc('month', now()) THEN EXTRACT(EPOCH FROM (COALESCE(salida, now()) - entrada)) END), 0)::float / 3600 AS horas_mes
      FROM fichajes GROUP BY trabajador_id
    `),
    q(`SELECT DISTINCT trabajador_id FROM fichajes WHERE salida IS NULL`),
    q(`SELECT trabajador_id, COUNT(*)::int AS num FROM documentos_rrhh GROUP BY trabajador_id`),
  ]);
  const mapaVacas = Object.fromEntries(vacas.map((v) => [v.trabajador_id, v.usados]));
  const mapaHoras = Object.fromEntries(horas.map((h) => [h.trabajador_id, h]));
  const trabajando = new Set(abiertos.map((a) => a.trabajador_id));
  const mapaDocs = Object.fromEntries(docs.map((d) => [d.trabajador_id, d.num]));
  return trabajadores.map((t) => {
    const enlaceAgapp = agapp.porEmail[(t.email || '').trim().toLowerCase()] || null;
    return {
      ...t,
      vacacionesUsadas: mapaVacas[t.id] || 0,
      vacacionesRestantes: t.dias_vacaciones - (mapaVacas[t.id] || 0),
      // Horas: de la app del equipo si está conectada; si no, de los fichajes locales
      horasHoy: enlaceAgapp ? enlaceAgapp.horasHoy : Math.round((mapaHoras[t.id]?.horas_hoy || 0) * 10) / 10,
      horasSemana: enlaceAgapp ? enlaceAgapp.horasSemana : Math.round((mapaHoras[t.id]?.horas_semana || 0) * 10) / 10,
      horasMes: enlaceAgapp ? enlaceAgapp.horasMes : Math.round((mapaHoras[t.id]?.horas_mes || 0) * 10) / 10,
      trabajandoAhora: enlaceAgapp ? enlaceAgapp.trabajandoAhora : trabajando.has(t.id),
      numDocumentos: mapaDocs[t.id] || 0,
      perfilAgapp: enlaceAgapp ? enlaceAgapp.perfilId : null,
      fichajeIntegrado: agapp.configurado,
    };
  });
}

export async function crearTrabajador({ nombre, email, puesto, fecha_alta, dias_vacaciones, pin, notas }) {
  await ensureSchema();
  const filas = await q(`
    INSERT INTO trabajadores (nombre, email, puesto, fecha_alta, dias_vacaciones, pin, notas)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `, [nombre, email || null, puesto || null, fecha_alta || null, dias_vacaciones || 23, pin || null, notas || null]);
  return filas[0];
}

export async function actualizarTrabajador(id, campos) {
  const permitidos = ['nombre', 'email', 'puesto', 'fecha_alta', 'dias_vacaciones', 'pin', 'activo', 'notas'];
  const sets = [];
  const valores = [];
  for (const [clave, valor] of Object.entries(campos)) {
    if (!permitidos.includes(clave)) continue;
    valores.push(valor === '' ? null : valor);
    sets.push(`${clave} = $${valores.length}`);
  }
  if (!sets.length) return;
  valores.push(id);
  await q(`UPDATE trabajadores SET ${sets.join(', ')} WHERE id = $${valores.length}`, valores);
}

export async function detalleTrabajador(id, perfilAgapp = null) {
  if (perfilAgapp) {
    const [documentos, vacas, fichajes] = await Promise.all([
      q(`SELECT id, tipo, titulo, mes, url, to_char(subido_el, 'YYYY-MM-DD') AS subido,
                notificado_el IS NOT NULL AS avisado, to_char(firmado_el, 'DD/MM/YYYY HH24:MI') AS firmado, firma_nombre
         FROM documentos_rrhh WHERE trabajador_id = $1 ORDER BY subido_el DESC`, [id]),
      q(`SELECT id, to_char(desde, 'YYYY-MM-DD') AS desde, to_char(hasta, 'YYYY-MM-DD') AS hasta, dias, estado, notas
         FROM vacaciones WHERE trabajador_id = $1 ORDER BY desde DESC`, [id]),
      sesionesDePerfil(perfilAgapp).catch(() => []),
    ]);
    return { documentos, vacaciones: vacas, fichajes };
  }
  const [documentos, vacas, fichajes] = await Promise.all([
    q(`
      SELECT id, tipo, titulo, mes, url, to_char(subido_el, 'YYYY-MM-DD') AS subido,
             notificado_el IS NOT NULL AS avisado, to_char(firmado_el, 'DD/MM/YYYY HH24:MI') AS firmado, firma_nombre
      FROM documentos_rrhh WHERE trabajador_id = $1 ORDER BY subido_el DESC
    `, [id]),
    q(`
      SELECT id, to_char(desde, 'YYYY-MM-DD') AS desde, to_char(hasta, 'YYYY-MM-DD') AS hasta, dias, estado, notas
      FROM vacaciones WHERE trabajador_id = $1 ORDER BY desde DESC
    `, [id]),
    q(`
      SELECT id, to_char(entrada, 'DD/MM HH24:MI') AS entrada, to_char(salida, 'DD/MM HH24:MI') AS salida,
             ROUND((EXTRACT(EPOCH FROM (COALESCE(salida, now()) - entrada)) / 3600)::numeric, 1)::float AS horas,
             (salida IS NULL) AS abierto
      FROM fichajes WHERE trabajador_id = $1 ORDER BY entrada DESC LIMIT 30
    `, [id]),
  ]);
  return { documentos, vacaciones: vacas, fichajes };
}

// Crea el documento y avisa por email al trabajador con su enlace personal de
// firma: primero confirma la recepción y después ve el documento.
export async function crearDocumento({ trabajador_id, tipo, titulo, mes, url, origen }) {
  const token = crypto.randomBytes(20).toString('hex');
  const filas = await q(`
    INSERT INTO documentos_rrhh (trabajador_id, tipo, titulo, mes, url, token)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, token
  `, [trabajador_id, tipo || 'OTRO', titulo, mes || null, url, token]);
  const doc = filas[0];

  let avisado = false;
  try {
    const t = await q(`SELECT nombre, email FROM trabajadores WHERE id = $1`, [trabajador_id]);
    const trabajador = t[0];
    if (trabajador?.email && process.env.EMAIL_USER && origen) {
      const enlace = `${origen}/documento?t=${token}`;
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
      });
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: trabajador.email,
        subject: `📄 Tienes un documento nuevo de AG Academy: ${titulo}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 540px;">
            <h2>Hola ${trabajador.nombre},</h2>
            <p>Tienes un documento nuevo disponible de AG Academy:</p>
            <p style="background:#f3f4f6;border-radius:8px;padding:12px 16px;font-size:16px;">
              <strong>${titulo}</strong>${mes ? ` · ${mes}` : ''}${tipo === 'NÓMINA' ? ' (nómina)' : ''}
            </p>
            <p>Para verlo, primero confirma su recepción con tu firma en tu enlace personal (no lo compartas):</p>
            <p style="margin:24px 0;">
              <a href="${enlace}" style="background:#111827;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">
                ✍️ Firmar recepción y ver mi documento
              </a>
            </p>
            <p>Si tienes cualquier duda, responde a este email.</p>
            <p>Un saludo,<br>El equipo de AG Academy</p>
          </div>
        `,
      });
      await q(`UPDATE documentos_rrhh SET notificado_el = now() WHERE id = $1`, [doc.id]);
      avisado = true;
    }
  } catch (error) {
    console.error('Aviso: no se pudo enviar el email del documento:', error.message);
  }
  return { ...doc, avisado };
}

// ── Firma de documentos (página pública por token) ───────────────────────────

export async function documentoPorToken(token) {
  await ensureSchema();
  const filas = await q(`
    SELECT d.id, d.tipo, d.titulo, d.mes, d.firmado_el, t.nombre AS trabajador
    FROM documentos_rrhh d JOIN trabajadores t ON t.id = d.trabajador_id
    WHERE d.token = $1
  `, [token]);
  if (!filas.length) return null;
  const d = filas[0];
  return {
    titulo: d.titulo,
    tipo: d.tipo,
    mes: d.mes,
    trabajador: d.trabajador,
    firmado: !!d.firmado_el,
  };
}

export async function firmarDocumento(token, nombreFirma, ip) {
  const filas = await q(`
    SELECT d.id, d.url, d.firmado_el FROM documentos_rrhh d WHERE d.token = $1
  `, [token]);
  if (!filas.length) throw new Error('Enlace no válido');
  const doc = filas[0];
  if (!doc.firmado_el) {
    if (!nombreFirma || nombreFirma.trim().length < 5) {
      throw new Error('Escribe tu nombre completo para firmar la recepción');
    }
    await q(`UPDATE documentos_rrhh SET firmado_el = now(), firma_nombre = $2, firma_ip = $3 WHERE id = $1`,
      [doc.id, nombreFirma.trim(), ip || null]);
  }
  return { url: doc.url };
}

export async function borrarDocumento(id) {
  await q(`DELETE FROM documentos_rrhh WHERE id = $1`, [id]);
}

export async function crearVacaciones({ trabajador_id, desde, hasta, dias, estado, notas }) {
  const numDias = dias || Math.round((new Date(hasta) - new Date(desde)) / 86400000) + 1;
  const filas = await q(`
    INSERT INTO vacaciones (trabajador_id, desde, hasta, dias, estado, notas)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
  `, [trabajador_id, desde, hasta, numDias, estado || 'APROBADA', notas || null]);
  return filas[0];
}

export async function cambiarEstadoVacaciones(id, estado) {
  await q(`UPDATE vacaciones SET estado = $2 WHERE id = $1`, [id, estado]);
}

export async function borrarVacaciones(id) {
  await q(`DELETE FROM vacaciones WHERE id = $1`, [id]);
}

// ── Fichaje (página pública con PIN) ─────────────────────────────────────────

export async function trabajadoresParaFichar() {
  await ensureSchema();
  const filas = await q(`
    SELECT t.id, t.nombre, EXISTS (SELECT 1 FROM fichajes f WHERE f.trabajador_id = t.id AND f.salida IS NULL) AS trabajando
    FROM trabajadores t WHERE t.activo = true AND t.pin IS NOT NULL AND t.pin <> ''
    ORDER BY t.nombre
  `);
  return filas;
}

export async function fichar({ trabajador_id, pin }) {
  await ensureSchema();
  const filas = await q(`SELECT id, nombre, pin FROM trabajadores WHERE id = $1 AND activo = true`, [trabajador_id]);
  if (!filas.length || !filas[0].pin || filas[0].pin !== String(pin)) {
    throw new Error('PIN incorrecto');
  }
  const abierto = await q(`SELECT id FROM fichajes WHERE trabajador_id = $1 AND salida IS NULL ORDER BY entrada DESC LIMIT 1`, [trabajador_id]);
  if (abierto.length) {
    await q(`UPDATE fichajes SET salida = now() WHERE id = $1`, [abierto[0].id]);
    return { accion: 'salida', nombre: filas[0].nombre };
  }
  await q(`INSERT INTO fichajes (trabajador_id) VALUES ($1)`, [trabajador_id]);
  return { accion: 'entrada', nombre: filas[0].nombre };
}
