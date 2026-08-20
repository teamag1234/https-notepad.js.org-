import { q, ensureSchema } from './db.js';

// RRHH: trabajadores, documentos/nóminas, vacaciones y fichajes.

export async function listarTrabajadores() {
  await ensureSchema();
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
  return trabajadores.map((t) => ({
    ...t,
    vacacionesUsadas: mapaVacas[t.id] || 0,
    vacacionesRestantes: t.dias_vacaciones - (mapaVacas[t.id] || 0),
    horasHoy: Math.round((mapaHoras[t.id]?.horas_hoy || 0) * 10) / 10,
    horasSemana: Math.round((mapaHoras[t.id]?.horas_semana || 0) * 10) / 10,
    horasMes: Math.round((mapaHoras[t.id]?.horas_mes || 0) * 10) / 10,
    trabajandoAhora: trabajando.has(t.id),
    numDocumentos: mapaDocs[t.id] || 0,
  }));
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

export async function detalleTrabajador(id) {
  const [documentos, vacas, fichajes] = await Promise.all([
    q(`
      SELECT id, tipo, titulo, mes, url, to_char(subido_el, 'YYYY-MM-DD') AS subido
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

export async function crearDocumento({ trabajador_id, tipo, titulo, mes, url }) {
  const filas = await q(`
    INSERT INTO documentos_rrhh (trabajador_id, tipo, titulo, mes, url)
    VALUES ($1, $2, $3, $4, $5) RETURNING id
  `, [trabajador_id, tipo || 'OTRO', titulo, mes || null, url]);
  return filas[0];
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
