import { Pool } from 'pg';

// Base de datos propia del panel de administración (Postgres).
// En Vercel: añade la integración Neon/Vercel Postgres o define DATABASE_URL.
let pool = null;

export function dbConfigurada() {
  return !!process.env.DATABASE_URL;
}

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('Falta configurar DATABASE_URL (base de datos Postgres)');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function q(text, params = []) {
  const result = await getPool().query(text, params);
  return result.rows;
}

export async function ensureSchema() {
  await q(`
    CREATE TABLE IF NOT EXISTS movimientos (
      id SERIAL PRIMARY KEY,
      tipo TEXT NOT NULL CHECK (tipo IN ('INGRESO', 'GASTO')),
      fecha DATE NOT NULL,
      importe NUMERIC(12,2) NOT NULL,
      concepto TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'Otros',
      contacto TEXT,
      email TEXT,
      fuente TEXT NOT NULL DEFAULT 'MANUAL',
      referencia TEXT UNIQUE,
      notas TEXT,
      creado_el TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS movimientos_fecha_idx ON movimientos (fecha)`);
  await q(`CREATE INDEX IF NOT EXISTS movimientos_tipo_idx ON movimientos (tipo, fecha)`);
  // revisado = la categoría la confirmó una persona (no se toca en resincronizaciones)
  await q(`ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS revisado BOOLEAN NOT NULL DEFAULT false`);
  // Los gastos del banco que la clasificación automática no reconoció pasan a
  // "Sin clasificar" para que se revisen a mano (solo los no revisados).
  await q(`
    UPDATE movimientos SET categoria = 'Sin clasificar'
    WHERE fuente = 'BANCO' AND categoria = 'Otros gastos' AND revisado = false
  `);
  await q(`
    CREATE TABLE IF NOT EXISTS banco_cuentas (
      uid TEXT PRIMARY KEY,
      nombre TEXT,
      iban TEXT,
      session_id TEXT,
      valida_hasta TIMESTAMPTZ,
      ultima_sync TIMESTAMPTZ,
      creada_el TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await q(`
    CREATE TABLE IF NOT EXISTS banco_config (
      clave TEXT PRIMARY KEY,
      valor TEXT,
      actualizado_el TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await q(`
    CREATE TABLE IF NOT EXISTS conciliaciones (
      id SERIAL PRIMARY KEY,
      movimiento_id INTEGER UNIQUE,
      alumno_airtable_id TEXT,
      nombre TEXT,
      importe NUMERIC(12,2),
      estado TEXT NOT NULL CHECK (estado IN ('CONCILIADO', 'REVISAR')),
      creado_el TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await q(`
    CREATE TABLE IF NOT EXISTS recordatorios_log (
      id SERIAL PRIMARY KEY,
      alumno_airtable_id TEXT NOT NULL,
      nombre TEXT,
      email TEXT,
      modo TEXT NOT NULL DEFAULT 'REAL',
      enviado_el TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}
