import axios from 'axios';

// Lectura en vivo (solo lectura) de la base CURSOS ONLINE de Airtable.
// No escribe nada: los datos maestros de alumnos siguen viviendo en Airtable.
const BASE_ALUMNOS = process.env.AIRTABLE_CURSOS_BASE_ID || 'appN0vx5OPGi81zB5';
const TABLA_ALUMNOS = 'CURSOS KAJABI';
const VISTA_MOROSOS = 'MOROSOS ⚠️';

const api = axios.create({
  baseURL: `https://api.airtable.com/v0/${BASE_ALUMNOS}`,
  headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` },
});

async function fetchAll(tableName, params = {}) {
  let all = [];
  let offset = null;
  do {
    const response = await api.get(`/${encodeURIComponent(tableName)}`, {
      params: { ...params, ...(offset ? { offset } : {}) },
      paramsSerializer: {
        serialize: (p) => {
          const parts = [];
          for (const [key, value] of Object.entries(p)) {
            if (Array.isArray(value)) {
              for (const v of value) parts.push(`${encodeURIComponent(key + '[]')}=${encodeURIComponent(v)}`);
            } else if (value !== undefined && value !== null) {
              parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
            }
          }
          return parts.join('&');
        },
      },
    });
    all = all.concat(response.data?.records || []);
    offset = response.data?.offset;
  } while (offset);
  return all;
}

// Pares columna-de-mes / columna-de-estado del curso (los meses con estado
// ABIERTO son los pendientes de cobro)
export const MESES_PARES = [
  ['SEPTIEMBRE 25', 'ESTADO SEPTIEMBRE 25'], ['OCTUBRE 25', 'ESTADO OCTUBRE 25'],
  ['NOVIEMBRE 2025', 'ESTADO NOVIEMBRE 2025'], ['NOVIEMBRE 25', 'ESTADO NOVIEMBRE 25'],
  ['DICIEMBRE 2025', 'ESTADO DICIEMBRE 2025'], ['DICIEMBRE 25', 'ESTADO DICIEMBRE 25'],
  ['ENERO 26', 'ESTADO ENERO 26'], ['FEBRERO 26', 'ESTADO FEBRERO 26'],
  ['MARZO 26', 'ESTADO MARZO 26'], ['ABRIL 26', 'ESTADO ABRIL 25'],
  ['MAYO 25', 'ESTADO MAYO 25'], ['JUNIO 25', 'ESTADO JUNIO 25'],
  ['JULIO 25', 'ESTADO JULIO 25'], ['AGOSTO 25', 'ESTADO AGOSTO 25'],
  ['JULIO 26', 'ESTADO JULIO 26'], ['AGOSTO 26', 'ESTADO AGOSTO 26'],
];

// Morosos con el detalle de qué meses tienen estado ABIERTO (para conciliar).
// Usa el mismo análisis dinámico de columnas que getMorosos; la deuda se
// calcula en vivo de los importes en ABIERTO (sin contar meses futuros).
export async function getMorososDetallado() {
  const records = await fetchAll(TABLA_ALUMNOS, { view: VISTA_MOROSOS, pageSize: 100 });
  return records.map((r) => {
    const abiertos = analizarAbiertos(r.fields).filter((a) => !a.futuro);
    const suma = Math.round(abiertos.reduce((s, a) => s + (a.importe || 0), 0) * 100) / 100;
    const texto = (r.fields['MOROSO'] || '').match(/([\d]+(?:[.,]\d+)?)\s*€/);
    return {
      id: r.id,
      nombre: (r.fields['Name'] || '').trim(),
      curso: r.fields['TIPO DE CURSO'] || '',
      debe: suma > 0 ? suma : (texto ? parseFloat(texto[1].replace(',', '.')) : 0),
      notas: r.fields['Notas Morosos'] || '',
      abiertos,
    };
  }).filter((m) => m.abiertos.length > 0);
}

// Escritura puntual sobre un alumno (conciliación de pagos)
export async function patchAlumno(recordId, fields) {
  const response = await api.patch(`/${encodeURIComponent(TABLA_ALUMNOS)}/${recordId}`, { fields });
  return response.data;
}

const MES_NUM = { ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12 };

// Analiza los campos de un alumno y devuelve sus meses en estado ABIERTO,
// detectando dinámicamente cualquier columna "ESTADO <MES> <AÑO>" (también las
// que se creen en el futuro) y emparejándola con su columna de importe.
// Los meses de fechas futuras (pagos programados) no cuentan como deuda.
export function analizarAbiertos(fields) {
  const ahora = new Date();
  const ymActual = ahora.getFullYear() * 100 + (ahora.getMonth() + 1);
  const abiertos = [];
  for (const [campo, valor] of Object.entries(fields)) {
    if (!campo.startsWith('ESTADO ')) continue;
    if (String(valor).trim() !== 'ABIERTO') continue;
    const base = campo.substring(7).trim();
    // Columna de importe: mismo nombre; si no existe, prueba con el año siguiente
    // (hay pares históricos desparejados como "ESTADO ABRIL 25" ↔ "ABRIL 26")
    let importeCampo = null;
    const candidatos = [base, base.replace(/(\d{2,4})$/, (a) => String(Number(a) + 1))];
    for (const cand of candidatos) {
      const clave = Object.keys(fields).find(
        (k) => !k.startsWith('ESTADO') && k.trim().toUpperCase() === cand.toUpperCase(),
      );
      if (clave) { importeCampo = clave; break; }
    }
    const importe = importeCampo != null && typeof fields[importeCampo] === 'number' ? fields[importeCampo] : null;
    // ¿Es un mes futuro? (pago programado, no deuda)
    let futuro = false;
    const m = base.toUpperCase().match(/^([A-ZÁÉÍÓÚÜÑ]+)\s*(\d{2,4})?$/);
    if (m && MES_NUM[m[1]] && m[2]) {
      const anio = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
      futuro = anio * 100 + MES_NUM[m[1]] > ymActual;
    }
    abiertos.push({ mes: base, estadoCampo: campo, importeCampo: importeCampo || base, importe, futuro });
  }
  return abiertos;
}

export async function getMorosos() {
  const records = await fetchAll(TABLA_ALUMNOS, { view: VISTA_MOROSOS, pageSize: 100 });
  const morosos = [];
  for (const r of records) {
    const abiertos = analizarAbiertos(r.fields).filter((a) => !a.futuro);
    // Sin meses pendientes reales → está al día: fuera de la lista (y de los
    // recordatorios) aunque siga con la casilla de moroso marcada en Airtable
    if (!abiertos.length) continue;
    const suma = Math.round(abiertos.reduce((s, a) => s + (a.importe || 0), 0) * 100) / 100;
    const textoDebe = (r.fields['MOROSO'] || '').match(/([\d]+(?:[.,]\d+)?)\s*€/);
    morosos.push({
      id: r.id,
      nombre: (r.fields['Name'] || 'SIN NOMBRE').trim(),
      debe: suma > 0 ? suma : (textoDebe ? parseFloat(textoDebe[1].replace(',', '.')) : 0),
      detalle: abiertos.map((a) => `${a.mes} ${a.importe != null ? a.importe + '€' : '(cobro fallido)'}`).join('; '),
      telefono: String(r.fields['Teléfono'] || ''),
      email: r.fields['Email'] || '',
      curso: r.fields['TIPO DE CURSO'] || '',
    });
  }
  morosos.sort((a, b) => b.debe - a.debe);
  return {
    morosos,
    totalDeuda: Math.round(morosos.reduce((suma, m) => suma + m.debe, 0) * 100) / 100,
  };
}
