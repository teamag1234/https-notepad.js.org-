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
    if (regla.test(String(titulo || ''))) return curso;
  }
  return null; // talleres/membresías u ofertas nuevas: se deja sin curso
}

// ── Alumnos ──────────────────────────────────────────────────────────────────
async function buscarAlumno(email) {
  const formula = `LOWER({Email}) = '${String(email).toLowerCase().replace(/'/g, "\\'")}'`;
  const { data } = await rest.get(`/${encodeURIComponent(TABLA)}`, {
    params: { filterByFormula: formula, pageSize: 10 },
  });
  const records = data.records || [];
  if (!records.length) return null;
  return records.find((r) => String(r.fields['TIPO DE CURSO'] || '').trim().toUpperCase() !== 'BAJA') || records[0];
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

  let alumno = await buscarAlumno(pago.email);
  if (!alumno) {
    alumno = await crearAlumno({ nombre: pago.nombre, email: pago.email, curso: cursoDesdeOferta(pago.oferta) });
    resultado.fichaCreada = true;
  }

  const fields = {};
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

// Cobro FALLIDO: se anota el importe con ABIERTO (pendiente de cobro) solo si
// el mes está vacío — así entra en el circuito de morosos/recordatorios.
export async function aplicarFallidoKajabi(pago) {
  const resultado = { anotado: false };
  if (!pago.email || !pago.importe) return resultado;
  const alumno = await buscarAlumno(pago.email);
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
