import crypto from 'crypto';
import axios from 'axios';
import { q, ensureSchema } from './db.js';
import { crearMovimiento } from './finanzas.js';
import { conciliarPagosMorosos } from './conciliacion.js';

// Conexión bancaria vía Enable Banking (PSD2, solo lectura).
// Variables de entorno necesarias:
//   ENABLE_BANKING_APP_ID      → ID de la aplicación creada en enablebanking.com
//   ENABLE_BANKING_PRIVATE_KEY → clave privada (PEM) que descarga el portal al crear la app
// Opcionales:
//   BANCO_NOMBRE (por defecto "Cajamar"), BANCO_PSU_TYPE ("business" o "personal")
//   ADMIN_BASE_URL → URL pública de la app para el retorno de la autorización

const API = 'https://api.enablebanking.com';

export function bancoConfigurado() {
  return !!(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_PRIVATE_KEY);
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

// Extrae el cuerpo base64 de la clave aunque al pegarla en la variable de
// entorno se hayan perdido los saltos de línea, venga en una sola línea, con
// comillas, con \n escapados o con caracteres invisibles del portapapeles.
function extraerClave(bruto) {
  const s = String(bruto || '').trim().replace(/\\n/g, '\n').replace(/^["']+|["']+$/g, '').trim();
  const etiqueta = /RSA PRIVATE KEY/.test(s) ? 'RSA PRIVATE KEY' : 'PRIVATE KEY';
  // Solo conservamos caracteres base64 válidos: fuera espacios, guiones raros,
  // caracteres de ancho cero y cualquier otra cosa que cuele el portapapeles.
  const cuerpo = s
    .replace(/-----(BEGIN|END)[^-]*-----/g, '')
    .replace(/[^A-Za-z0-9+/=]/g, '')
    // Si las cabeceras llegaron con guiones tipográficos, sus palabras se cuelan
    // en el cuerpo como caracteres base64 válidos: fuera también.
    .replace(/(BEGIN|END)(RSA)?PRIVATEKEY/g, '');
  return { etiqueta, cuerpo };
}

function clavePrivada() {
  const { etiqueta, cuerpo } = extraerClave(process.env.ENABLE_BANKING_PRIVATE_KEY);
  // Vía 1: PEM reconstruido
  const lineas = cuerpo.match(/.{1,64}/g) || [];
  const pem = `-----BEGIN ${etiqueta}-----\n${lineas.join('\n')}\n-----END ${etiqueta}-----\n`;
  try {
    return crypto.createPrivateKey(pem);
  } catch (e1) {
    // Vía 2: decodificar el base64 a DER directamente (evita el parser de PEM)
    const der = Buffer.from(cuerpo, 'base64');
    const type = etiqueta === 'RSA PRIVATE KEY' ? 'pkcs1' : 'pkcs8';
    return crypto.createPrivateKey({ key: der, format: 'der', type });
  }
}

// Diagnóstico seguro de la clave (no expone su contenido): confirma si la
// clave guardada en la variable de entorno sirve para firmar.
export function diagnosticoClave() {
  const bruto = process.env.ENABLE_BANKING_PRIVATE_KEY;
  if (!bruto) return { definida: false };
  const { cuerpo } = extraerClave(bruto);
  const resultado = {
    definida: true,
    caracteresPegados: String(bruto).length,
    caracteresBase64: cuerpo.length,
    huella: crypto.createHash('sha256').update(cuerpo).digest('hex').substring(0, 12),
  };
  try {
    crypto.createSign('RSA-SHA256').update('diagnostico').sign(clavePrivada(), 'base64url');
    resultado.claveValida = true;
  } catch (error) {
    resultado.claveValida = false;
    resultado.error = error.message;
  }
  return resultado;
}

function jwtEnableBanking() {
  const ahora = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: process.env.ENABLE_BANKING_APP_ID }));
  const payload = b64url(JSON.stringify({
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: ahora,
    exp: ahora + 3600,
  }));
  const firma = crypto.createSign('RSA-SHA256').update(`${header}.${payload}`).sign(clavePrivada(), 'base64url');
  return `${header}.${payload}.${firma}`;
}

function api() {
  return axios.create({
    baseURL: API,
    headers: { 'Authorization': `Bearer ${jwtEnableBanking()}` },
    timeout: 30000,
  });
}

// Lista de bancos disponibles en España (para comprobar el nombre exacto de Cajamar)
export async function buscarBancos(texto = '') {
  const { data } = await api().get('/aspsps', { params: { country: 'ES' } });
  const bancos = (data.aspsps || []).map((a) => ({ nombre: a.name, pais: a.country }));
  if (!texto) return bancos;
  const t = texto.toLowerCase();
  return bancos.filter((b) => b.nombre.toLowerCase().includes(t));
}

// Paso 1: iniciar la autorización → devuelve la URL del banco a la que ir
export async function iniciarConexion({ nombreBanco, urlRetorno }) {
  await ensureSchema();
  const state = crypto.randomUUID();
  await q(
    `INSERT INTO banco_config (clave, valor, actualizado_el) VALUES ('auth_state', $1, now())
     ON CONFLICT (clave) DO UPDATE SET valor = $1, actualizado_el = now()`,
    [state],
  );
  const validUntil = new Date(Date.now() + 89 * 24 * 3600 * 1000).toISOString();
  const { data } = await api().post('/auth', {
    access: { valid_until: validUntil },
    aspsp: { name: nombreBanco, country: 'ES' },
    state,
    redirect_url: urlRetorno,
    psu_type: process.env.BANCO_PSU_TYPE || 'business',
  });
  return { url: data.url, state };
}

// Paso 2: al volver del banco, canjear el código por la sesión y guardar las cuentas
export async function completarConexion({ code, state }) {
  const filas = await q(`SELECT valor FROM banco_config WHERE clave = 'auth_state'`);
  if (!filas.length || filas[0].valor !== state) {
    throw new Error('Estado de autorización no válido (reinicia la conexión)');
  }
  const { data } = await api().post('/sessions', { code });
  const validaHasta = data.access?.valid_until || null;
  for (const cuenta of data.accounts || []) {
    await q(
      `INSERT INTO banco_cuentas (uid, nombre, iban, session_id, valida_hasta)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (uid) DO UPDATE SET session_id = $4, valida_hasta = $5`,
      [
        cuenta.uid,
        cuenta.name || cuenta.product || 'Cuenta',
        cuenta.account_id?.iban || null,
        data.session_id,
        validaHasta,
      ],
    );
  }
  return { cuentas: (data.accounts || []).length };
}

// Elimina movimientos del banco duplicados (mismo tipo, fecha, importe y
// concepto exacto), conservando uno de cada grupo — con preferencia por el que
// esté vinculado a una conciliación de morosos. Devuelve también los casos
// "sospechosos" (misma fecha e importe pero concepto distinto) para revisión.
export async function limpiarDuplicadosBanco() {
  await ensureSchema();
  const eliminados = await q(`
    WITH grupos AS (
      SELECT tipo, fecha, importe, concepto
      FROM movimientos WHERE fuente = 'BANCO'
      GROUP BY 1, 2, 3, 4 HAVING COUNT(*) > 1
    ), candidatos AS (
      SELECT m.id, m.tipo, m.fecha, m.importe, m.concepto, (c.id IS NOT NULL) AS conciliado
      FROM movimientos m
      JOIN grupos g ON g.tipo = m.tipo AND g.fecha = m.fecha AND g.importe = m.importe AND g.concepto = m.concepto
      LEFT JOIN conciliaciones c ON c.movimiento_id = m.id
      WHERE m.fuente = 'BANCO'
    ), conservar AS (
      SELECT DISTINCT ON (tipo, fecha, importe, concepto) id
      FROM candidatos ORDER BY tipo, fecha, importe, concepto, conciliado DESC, id
    )
    DELETE FROM movimientos
    WHERE id IN (SELECT id FROM candidatos WHERE id NOT IN (SELECT id FROM conservar))
    RETURNING id, to_char(fecha, 'YYYY-MM-DD') AS fecha, importe::float AS importe, concepto
  `);
  await q(`DELETE FROM conciliaciones WHERE movimiento_id IS NOT NULL AND movimiento_id NOT IN (SELECT id FROM movimientos)`);
  const sospechosos = await q(`
    SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, tipo, importe::float AS importe,
           COUNT(*)::int AS veces, STRING_AGG(DISTINCT LEFT(concepto, 60), ' ‖ ') AS conceptos
    FROM movimientos WHERE fuente = 'BANCO'
    GROUP BY fecha, tipo, importe HAVING COUNT(*) > 1
    ORDER BY fecha DESC LIMIT 20
  `);
  return { eliminados, sospechosos };
}

export async function estadoBanco() {
  await ensureSchema();
  const cuentas = await q(`
    SELECT uid, nombre, iban, valida_hasta, ultima_sync FROM banco_cuentas ORDER BY creada_el
  `);
  return { configurado: bancoConfigurado(), cuentas };
}

// Clasificación automática de movimientos bancarios por el concepto
export function categorizarBancario(texto, esIngreso) {
  const t = String(texto || '').toUpperCase();
  if (esIngreso) {
    if (/KAJABI|STRIPE|PAYPAL/.test(t)) return 'Traspaso Kajabi';
    return 'Otros ingresos';
  }
  if (/DEVOLUCI|REEMBOLSO|REFUND/.test(t)) return 'Devolución de cursos';
  if (/NOMINA|NÓMINA/.test(t)) return 'Nóminas';
  if (/TGSS|SEG\.? ?SOC|SEGURIDAD SOCIAL/.test(t)) return 'Seguridad Social';
  if (/AEAT|AGENCIA TRIBUTARIA|HACIENDA|IMPUESTO|MOD\.? ?[0-9]{3}/.test(t)) return 'Impuestos';
  if (/FACEBK|FACEBOOK|META ?PLATFORMS|GOOGLE ?ADS|ADWORDS|TIKTOK|INSTAGRAM/.test(t)) return 'Publicidad / Ads';
  if (/KAJABI|VERCEL|AIRTABLE|ZOOM|CANVA|OPENAI|ANTHROPIC|NOTION|SLACK|ADOBE|GOOGLE|MICROSOFT|DROPBOX|TELEGRAM/.test(t)) return 'Software y herramientas';
  if (/COMISION|COMISIÓN|MANTENIMIENTO/.test(t)) return 'Pasarela de pago';
  if (/AFILIAD/.test(t)) return 'Afiliados y comisiones';
  return 'Sin clasificar';
}

// Paso 3: sincronizar transacciones de todas las cuentas conectadas
export async function sincronizarBanco() {
  await ensureSchema();
  const cuentas = await q(`SELECT uid, nombre, ultima_sync FROM banco_cuentas`);
  if (!cuentas.length) return { cuentas: 0, nuevos: 0 };

  let nuevos = 0;
  for (const cuenta of cuentas) {
    // Primera vez: 90 días atrás; después: desde la última sync con 5 días de margen
    const desde = cuenta.ultima_sync
      ? new Date(new Date(cuenta.ultima_sync).getTime() - 5 * 24 * 3600 * 1000)
      : new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const dateFrom = desde.toISOString().slice(0, 10);

    let continuationKey = null;
    do {
      const params = { date_from: dateFrom };
      if (continuationKey) params.continuation_key = continuationKey;
      const { data } = await api().get(`/accounts/${cuenta.uid}/transactions`, { params });
      for (const tx of data.transactions || []) {
        if (tx.status && !['BOOK', 'BOOKED'].includes(String(tx.status).toUpperCase())) continue;
        const esIngreso = tx.credit_debit_indicator === 'CRDT';
        const importe = Math.abs(parseFloat(tx.transaction_amount?.amount || '0'));
        if (!importe) continue;
        const concepto = [
          ...(Array.isArray(tx.remittance_information) ? tx.remittance_information : [tx.remittance_information]),
          esIngreso ? tx.debtor?.name : tx.creditor?.name,
        ].filter(Boolean).join(' · ') || 'Movimiento bancario';
        const referencia = tx.entry_reference
          ? `banco-${tx.entry_reference}`
          : `banco-${crypto.createHash('sha1').update(`${cuenta.uid}|${tx.booking_date}|${tx.transaction_amount?.amount}|${concepto}`).digest('hex')}`;
        // Algunos bancos cambian la referencia del mismo movimiento entre
        // lecturas (pendiente → contabilizado): además de la referencia,
        // comprobamos por contenido para no duplicar.
        const yaExiste = await q(
          `SELECT 1 FROM movimientos
           WHERE fuente = 'BANCO' AND tipo = $1 AND fecha = $2 AND importe = $3 AND concepto = $4 LIMIT 1`,
          [esIngreso ? 'INGRESO' : 'GASTO', tx.booking_date || tx.value_date, importe, concepto.substring(0, 500)],
        );
        if (yaExiste.length) continue;
        const creado = await crearMovimiento({
          tipo: esIngreso ? 'INGRESO' : 'GASTO',
          fecha: tx.booking_date || tx.value_date || new Date().toISOString().slice(0, 10),
          importe,
          concepto: concepto.substring(0, 500),
          categoria: categorizarBancario(concepto, esIngreso),
          contacto: (esIngreso ? tx.debtor?.name : tx.creditor?.name) || null,
          fuente: 'BANCO',
          referencia,
        });
        if (creado) nuevos += 1;
      }
      continuationKey = data.continuation_key || null;
    } while (continuationKey);

    await q(`UPDATE banco_cuentas SET ultima_sync = now() WHERE uid = $1`, [cuenta.uid]);
  }

  // Limpieza de duplicados que hayan podido colarse por referencias inestables
  try {
    await limpiarDuplicadosBanco();
  } catch (error) {
    console.error('Aviso: la limpieza de duplicados falló:', error.message);
  }

  // Tras importar, cruzar las transferencias recibidas con los morosos:
  // si nombre e importe cuadran, se marca pagado en Airtable y deja de ser moroso.
  let conciliacion = { conciliados: 0, paraRevisar: 0 };
  try {
    conciliacion = await conciliarPagosMorosos();
  } catch (error) {
    console.error('Aviso: la conciliación de morosos falló:', error.message);
  }
  return { cuentas: cuentas.length, nuevos, ...conciliacion };
}
