# 🎓 AG Academy · Panel de Administración

Módulo de administración y dinero de AG Academy, integrado en esta misma app de Vercel.
Vive en **`/admin`** y tiene su propia base de datos (Postgres) — Airtable sigue siendo
solo la base de alumnos y se lee en vivo, sin escribir nada en ella.

## Qué incluye (Fase 1: administración y dinero)

- **Dashboard** (`/admin`): ingresos, gastos y beneficio del mes al momento, gráfico de
  los últimos 12 meses, desglose de gastos por categoría y últimos movimientos.
- **Gastos** (`/admin/gastos`): apuntar y clasificar gastos (nóminas, publicidad, software,
  impuestos…), listado y borrado.
- **Ingresos** (`/admin/ingresos`): todos los cobros con filtro por mes. Entran **solos**:
  - Histórico: importado desde las transacciones reales de Kajabi (jul–ago 2026).
  - En adelante: cada pago que Kajabi manda al webhook `/api/kajabi-webhook` se registra
    automáticamente como ingreso (sin tocar el flujo de onboarding).
- **Morosos** (`/admin/morosos`): lista en vivo desde la vista "MOROSOS ⚠️" de Airtable,
  con deuda total, detalle por meses y datos de contacto.

## Puesta en marcha (una sola vez)

1. **Base de datos**: en Vercel → proyecto → **Storage** → *Create Database* → **Neon
   (Postgres)**. Vercel crea sola la variable `DATABASE_URL`.
2. **Clave del panel**: en Vercel → Settings → Environment Variables añade
   `ADMIN_PASSWORD` con la clave que queráis usar para entrar.
3. Redeploy y entra en `https://<tu-app>.vercel.app/admin` con esa clave.
4. Pulsa **"Inicializar base de datos"**: crea las tablas e importa el histórico de
   Kajabi (238 movimientos, sin duplicar aunque lo pulses dos veces).

Variables opcionales:

| Variable | Para qué | Por defecto |
|---|---|---|
| `AIRTABLE_CURSOS_BASE_ID` | Base de Airtable de alumnos | `appN0vx5OPGi81zB5` (CURSOS ONLINE) |

## Cómo unirlo a app.ag-app.es

Dos opciones (cualquiera vale, no hay que tocar este código):

- **Subdominio** (recomendado): en Vercel → Settings → Domains de este proyecto añade
  `admin.ag-app.es` y crea el CNAME en vuestro DNS. El panel queda en
  `https://admin.ag-app.es/admin`.
- **Misma URL con ruta**: en el proyecto principal de `app.ag-app.es`, añade un rewrite
  para que `/administracion/*` apunte a este proyecto:

  ```json
  { "rewrites": [{ "source": "/administracion/:path*", "destination": "https://<esta-app>.vercel.app/:path*" }] }
  ```

## Próximas fases

- **Fase 2 · Pagos pendientes y fallidos**: detección automática desde Kajabi y
  recordatorios por email/WhatsApp a los alumnos (la app ya envía emails con Gmail).
- **Fase 3 · Banco**: conexión PSD2 (GoCardless Bank Account Data / Tink) para conciliar
  gastos e ingresos bancarios reales y clasificarlos automáticamente.
- **Fase 4 · RRHH**: ficha por trabajador con documentos, nóminas, vacaciones y fichaje.

## Seguridad

- Todas las rutas `/api/admin/*` exigen la cabecera `x-admin-key` con `ADMIN_PASSWORD`.
- El token de Airtable y `DATABASE_URL` solo se usan en el servidor, nunca llegan al navegador.
