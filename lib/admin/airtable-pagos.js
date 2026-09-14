import axios from 'axios';

// Anotación automática de los cobros de Kajabi en la tabla CURSOS KAJABI de
// Airtable: crea la ficha del alumno en su primer pago, apunta cada cobro en
// la columna del mes correspondiente (CERRADO = cobrado) y, en compras a
// plazos, deja programadas las cuotas siguientes en sus meses con ABIERTO
// (pendiente). Si una cuota programada se cobra, su mes pasa a CERRADO; si
// falla, se anota en ABIERTO — y de ahí ya tira el circuito de morosos.
const BASE = process.env.AIRTABLE_CURSOS_BASE_ID || 'appN0vx5OPGi81zB5';
const TABLA = 'CURSOS KAJABI';

const rest = axios.create({
  baseURL: `https://api.airtable.com/v0/${BASE}`,
  headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` },
});
const meta = axios.create({
  baseURL: `https://api.airtable.com/v0/meta/bases/${BASE}`,
  headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` },
});

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

// ── Esquema de la tabla (con caché) ─────────────────────────────────────────
let esquemaCache = null;

function normalizar(nombre) {
  return String(nombre).replace(/\s+/g, ' ').trim().toUpperCase();
}

async function esquema(refrescar = false) {
  if (esquemaCache && !refrescar) return esquemaCache;
  const { data } = await meta.get('/tables');
  const tabla = data.tables.find((t) => t.name === TABLA);
  if (!tabla) throw new Error(`No encuentro la tabla ${TABLA} en Airtable`);
  const porNombre = new Map();
  for (const campo of tabla.fields) porNombre.set(normalizar(campo.name), campo);
  esquemaCache = { tablaId: tabla.id, porNombre };
  return esquemaCache;
}

// Nombre real del campo en Airtable (tolera espacios dobles/finales), o null
async function campoReal(nombre) {
  const s = await esquema();
  return s.porNombre.get(normalizar(nombre))?.name || null;
}

// Devuelve el nombre EXACTO de la opción del select cuyo texto (sin espacios)
// coincide, p. ej. "CERRADO" → "CERRADO " (las opciones históricas llevan
// espacio final). Si no existe, devuelve el deseado tal cual (typecast lo crea).
async function opcionEstado(nombreCampoEstado, deseado) {
  const s = await esquema();
  const campo = s.porNombre.get(normalizar(nombreCampoEstado));
  const opciones = campo?.options?.choices || [];
  const encontrada = opciones.find((o) => o.name.trim().toUpperCase() === deseado.toUpperCase());
  return encontrada ? encontrada.name : deseado;
}

// ── Columnas de mes ──────────────────────────────────────────────────────────
export function columnasDeFecha(fechaISO) {
  const [anio, mes] = String(fechaISO).split('-').map(Number);
  return columnasDe(anio, mes);
}

function columnasDe(anio, mes) {
  const nombre = `${MESES[mes - 1]} ${String(anio).slice(2)}`;
  return { importeCol: nombre, estadoCol: `ESTADO ${nombre}`, anio, mes };
}

function mesesDespues(anio, mes, n) {
  const total = (anio * 12 + (mes - 1)) + n;
  return columnasDe(Math.floor(total / 12), (total % 12) + 1);
}

// Crea las columnas del mes si no existen todavía (importe + estado)
async function asegurarColumnas({ importeCol, estadoCol }) {
  const s = await esquema();
  let creado = false;
  if (!s.porNombre.has(normalizar(importeCol))) {
    await meta.post(`/tables/${s.tablaId}/fields`, {
      name: importeCol,
      type: 'currency',
      options: { precision: 2, symbol: '€' },
    });
    creado = true;
  }
  if (!s.porNombre.has(normalizar(estadoCol))) {
    await meta.post(`/tables/${s.tablaId}/fields`, {
      name: estadoCol,
      type: 'singleSelect',
      options: { choices: [{ name: 'ABIERTO ' }, { name: 'EN MARCHA ' }, { name: 'CERRADO ' }] },
    });
    creado = true;
  }
  if (creado) await esquema(true);
}

// ── Curso a partir del título de la oferta de Kajabi ────────────────────────
const REGLAS_CURSO = [
  // "Grammar Expert" es un EXTRA para alumnos de Accelerator, no el curso
  // Aptis Expert: se deja sin curso (la ficha del alumno ya tiene el suyo)
  [/grammar/i, null],
  [/accelerator\s*plus/i, 'Aptis Accelerator Plus'],
  [/accelerator\s*lite/i, 'Aptis Accelerator Lite'],
  [/accelerator/i, 'Aptis Accelerator'],
  [/expert\s*express/i, 'Aptis Expert Express'],
  [/expert/i, 'Aptis Expert'],
  [/express\s*tutorizado/i, 'Directo al Aptis Express Tutorizado'],
  [/directo\s*al\s*aptis\s*express/i, 'Directo al Aptis Express'],
  [/english\s*summer\s*chance/i, 'Directo al Aptis Express'],
  [/directo\s*al\s*aptis\s*tutorizado/i, 'Directo al Aptis Tutorizado'],
  [/turbo/i, 'Directo al Aptis Turbo Pro'],
  [/directo\s*al\s*aptis/i, 'Directo al Aptis'],
  [/level\s*express/i, 'Aptis Level Express'],
  [/polic[ií]a/i, 'APTIS LEVEL - POLICÍA NACIONAL'],
  [/aptis\s*level/i, 'APTIS LEVEL'],
  [/ten\s*tu\s*aptis/i, 'TEN TU APTIS'],
  [/biblia/i, 'Biblia Aptis'],
  [/trinity/i, 'TRINITY B2'],
  [/infinity/i, 'APTIS INFINITY'],
  [/adif/i, 'ADIF - Inglés a alta velocidad'],
  [/renovaci/i, 'RENOVACIÓN + SEGUIMIENTO'],
];

export function cursoDesdeOferta(titulo) {
  for (const [regla, curso] of REGLAS_CURSO) {
    if (regla.test(String(titulo || ''))) return curso; // null = extra/sin curso
  }
  return null; // talleres/membresías u ofertas nuevas: se deja sin curso
}

// ── Alumnos ──────────────────────────────────────────────────────────────────
async function buscarAlumno(email, nombre) {
  const esc = (s) => String(s).toLowerCase().trim().replace(/'/g, "\\'");
  const { data } = await rest.get(`/${encodeURIComponent(TABLA)}`, {
    params: { filterByFormula: `LOWER(TRIM({Email})) = '${esc(email)}'`, pageSize: 10 },
  });
  const records = data.records || [];
  if (records.length) {
    return records.find((r) => String(r.fields['TIPO DE CURSO'] || '').trim().toUpperCase() !== 'BAJA') || records[0];
  }
  // Sin coincidencia por email: fichas antiguas sin email — solo si hay
  // EXACTAMENTE una con el mismo nombre y sin email (evita confundir tocayos)
  if (nombre && String(nombre).trim()) {
    const { data: porNombre } = await rest.get(`/${encodeURIComponent(TABLA)}`, {
      params: { filterByFormula: `LOWER(TRIM({Name})) = '${esc(nombre)}'`, pageSize: 10 },
    });
    const sinEmail = (porNombre.records || []).filter((r) => !String(r.fields['Email'] || '').trim());
    if (sinEmail.length === 1) return sinEmail[0];
  }
  return null;
}

async function crearAlumno({ nombre, email, curso }) {
  const fields = { 'Name': nombre || email, 'Email': email };
  if (curso) fields['TIPO DE CURSO'] = curso;
  const { data } = await rest.post(`/${encodeURIComponent(TABLA)}?typecast=true`, { fields });
  return data;
}

// ── Anotación de un cobro ────────────────────────────────────────────────────
// pago: { nombre, email, oferta, importe, fecha (YYYY-MM-DD), cuotas, esPrimera }
export async function aplicarPagoKajabi(pago) {
  const resultado = { fichaCreada: false, anotado: false, plazosProgramados: 0 };
  if (!pago.email || !pago.importe) return resultado;

  const cols = columnasDeFecha(pago.fecha);
  await asegurarColumnas(cols);

  let alumno = await buscarAlumno(pago.email, pago.nombre);
  if (!alumno) {
    alumno = await crearAlumno({ nombre: pago.nombre, email: pago.email, curso: cursoDesdeOferta(pago.oferta) });
    resultado.fichaCreada = true;
  }

  const fields = {};
  // Ficha antigua encontrada por nombre y sin email: se completa
  if (!String(alumno.fields?.['Email'] || '').trim()) fields['Email'] = pago.email;
  const importeCampo = await campoReal(cols.importeCol);
  const estadoCampo = await campoReal(cols.estadoCol);
  const actual = alumno.fields?.[importeCampo];
  const estadoActual = String(alumno.fields?.[estadoCampo] || '').trim().toUpperCase();

  if (typeof actual === 'number' && estadoActual !== 'ABIERTO') {
    // Ya había un cobro anotado este mes (otro curso/membresía): se suma
    fields[importeCampo] = Math.round((actual + pago.importe) * 100) / 100;
  } else {
    // Mes vacío o cuota programada en ABIERTO: se anota lo cobrado
    fields[importeCampo] = pago.importe;
  }
  fields[estadoCampo] = await opcionEstado(cols.estadoCol, 'CERRADO');
  resultado.anotado = true;

  // Compra a plazos: en el PRIMER pago se dejan programadas las cuotas de los
  // meses siguientes con estado ABIERTO (solo en celdas vacías)
  if (pago.esPrimera && Number(pago.cuotas) >= 2) {
    for (let k = 1; k < Number(pago.cuotas); k += 1) {
      const colsK = mesesDespues(cols.anio, cols.mes, k);
      await asegurarColumnas(colsK);
      const impK = await campoReal(colsK.importeCol);
      const estK = await campoReal(colsK.estadoCol);
      if (alumno.fields?.[impK] == null && fields[impK] == null) {
        fields[impK] = pago.importe;
        fields[estK] = await opcionEstado(colsK.estadoCol, 'ABIERTO');
        resultado.plazosProgramados += 1;
      }
    }
  }

  await rest.patch(`/${encodeURIComponent(TABLA)}/${alumno.id}?typecast=true`, { fields });
  return resultado;
}

// ── Backfill de un mes completo ──────────────────────────────────────────────
// Aplica de golpe los cobros de un mes (p. ej. todo septiembre) respetando lo
// anotado a mano: si el mes del alumno ya tenía un importe (que no venga de
// esta misma pasada ni fuera una cuota en ABIERTO), NO se toca y se devuelve
// en "saltados" para revisarlo. Dos cobros del mismo alumno en la pasada sí
// se suman (compró curso + taller).
export async function backfillMesKajabi(pagos) {
  const informe = { anotados: 0, fichasCreadas: 0, plazosProgramados: 0, saltados: [], errores: [] };
  const alumnos = new Map(); // email → { record, fields (pendientes), escritos:Set }

  for (const pago of pagos) {
    try {
      if (!pago.email || !pago.importe) continue;
      const clave = pago.email.toLowerCase();
      let a = alumnos.get(clave);
      if (!a) {
        let record = await buscarAlumno(pago.email, pago.nombre);
        if (!record) {
          record = await crearAlumno({ nombre: pago.nombre, email: pago.email, curso: cursoDesdeOferta(pago.oferta) });
          informe.fichasCreadas += 1;
        }
        a = { record, fields: {}, escritos: new Set() };
        // Ficha antigua encontrada por nombre y sin email: se completa
        if (!String(record.fields?.['Email'] || '').trim()) a.fields['Email'] = pago.email;
        alumnos.set(clave, a);
      }
      const cols = columnasDeFecha(pago.fecha);
      await asegurarColumnas(cols);
      const imp = await campoReal(cols.importeCol);
      const est = await campoReal(cols.estadoCol);
      const valor = a.fields[imp] ?? a.record.fields?.[imp];
      const estado = String(a.fields[est] ?? a.record.fields?.[est] ?? '').trim().toUpperCase();

      if (valor == null) {
        a.fields[imp] = pago.importe;
      } else if (a.escritos.has(imp)) {
        a.fields[imp] = Math.round((valor + pago.importe) * 100) / 100; // dos cobros en esta pasada
      } else if (estado === 'ABIERTO') {
        a.fields[imp] = pago.importe; // cuota que estaba pendiente: se cierra
      } else {
        informe.saltados.push({ nombre: pago.nombre || pago.email, importe: pago.importe, oferta: pago.oferta || '', motivo: `ya había ${valor}€ anotados en ${cols.importeCol}` });
        continue;
      }
      a.fields[est] = await opcionEstado(cols.estadoCol, 'CERRADO');
      a.escritos.add(imp);
      informe.anotados += 1;

      if (pago.esPrimera && Number(pago.cuotas) >= 2) {
        for (let k = 1; k < Number(pago.cuotas); k += 1) {
          const colsK = mesesDespues(cols.anio, cols.mes, k);
          await asegurarColumnas(colsK);
          const impK = await campoReal(colsK.importeCol);
          const estK = await campoReal(colsK.estadoCol);
          if ((a.fields[impK] ?? a.record.fields?.[impK]) == null) {
            a.fields[impK] = pago.importe;
            a.fields[estK] = await opcionEstado(colsK.estadoCol, 'ABIERTO');
            informe.plazosProgramados += 1;
          }
        }
      }
    } catch (error) {
      informe.errores.push(`${pago.nombre || pago.email}: ${error.message}`);
    }
  }

  for (const a of alumnos.values()) {
    if (!Object.keys(a.fields).length) continue;
    try {
      await rest.patch(`/${encodeURIComponent(TABLA)}/${a.record.id}?typecast=true`, { fields: a.fields });
    } catch (error) {
      informe.errores.push(`${a.record.fields?.Name || a.record.id}: ${error.message}`);
    }
  }
  return informe;
}

// Cobro FALLIDO: se anota el importe con ABIERTO (pendiente de cobro) solo si
// el mes está vacío — así entra en el circuito de morosos/recordatorios.
export async function aplicarFallidoKajabi(pago) {
  const resultado = { anotado: false };
  if (!pago.email || !pago.importe) return resultado;
  const alumno = await buscarAlumno(pago.email, pago.nombre);
  if (!alumno) return resultado; // sin ficha no hay dónde anotarlo (no creamos fichas por fallos)
  const cols = columnasDeFecha(pago.fecha);
  await asegurarColumnas(cols);
  const importeCampo = await campoReal(cols.importeCol);
  const estadoCampo = await campoReal(cols.estadoCol);
  if (alumno.fields?.[importeCampo] != null) return resultado; // ya hay algo anotado: no tocar
  await rest.patch(`/${encodeURIComponent(TABLA)}/${alumno.id}?typecast=true`, {
    fields: {
      [importeCampo]: pago.importe,
      [estadoCampo]: await opcionEstado(cols.estadoCol, 'ABIERTO'),
    },
  });
  resultado.anotado = true;
  return resultado;
}
