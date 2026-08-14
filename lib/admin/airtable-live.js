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
