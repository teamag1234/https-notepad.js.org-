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

// Morosos con el detalle de qué meses tienen estado ABIERTO (para conciliar)
export async function getMorososDetallado() {
  const campos = ['Name', 'MOROSO', 'Notas Morosos', 'Teléfono', 'Email', 'TIPO DE CURSO'];
  for (const [mes, estado] of MESES_PARES) campos.push(mes, estado);
  const records = await fetchAll(TABLA_ALUMNOS, {
    view: VISTA_MOROSOS,
    fields: [...new Set(campos)],
    pageSize: 100,
  });
  return records.map((r) => {
    const abiertos = [];
    for (const [mes, estado] of MESES_PARES) {
      if ((r.fields[estado] || '').trim() === 'ABIERTO') {
        abiertos.push({ mes, estado, importe: r.fields[mes] ?? null });
      }
    }
    const texto = r.fields['MOROSO'] || '';
    const match = texto.match(/([\d]+(?:[.,]\d+)?)\s*€/);
    return {
      id: r.id,
      nombre: (r.fields['Name'] || '').trim(),
      curso: r.fields['TIPO DE CURSO'] || '',
      debe: match ? parseFloat(match[1].replace(',', '.')) : 0,
      notas: r.fields['Notas Morosos'] || '',
      abiertos,
    };
  });
}

// Escritura puntual sobre un alumno (conciliación de pagos)
export async function patchAlumno(recordId, fields) {
  const response = await api.patch(`/${encodeURIComponent(TABLA_ALUMNOS)}/${recordId}`, { fields });
  return response.data;
}

export async function getMorosos() {
  const records = await fetchAll(TABLA_ALUMNOS, {
    view: VISTA_MOROSOS,
    fields: ['Name', 'MOROSO', 'Notas Morosos', 'Teléfono', 'Email', 'TIPO DE CURSO'],
    pageSize: 100,
  });
  const morosos = records.map((r) => {
    const texto = r.fields['MOROSO'] || '';
    const match = texto.match(/([\d]+(?:[.,]\d+)?)\s*€/);
    return {
      id: r.id,
      nombre: (r.fields['Name'] || 'SIN NOMBRE').trim(),
      debe: match ? parseFloat(match[1].replace(',', '.')) : 0,
      detalle: r.fields['Notas Morosos'] || '',
      telefono: String(r.fields['Teléfono'] || ''),
      email: r.fields['Email'] || '',
      curso: r.fields['TIPO DE CURSO'] || '',
    };
  }).sort((a, b) => b.debe - a.debe);

  return {
    morosos,
    totalDeuda: Math.round(morosos.reduce((suma, m) => suma + m.debe, 0) * 100) / 100,
  };
}
