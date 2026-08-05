# 📲 Onboarding automático por Telegram

Automatización completa: cuando un alumno rellena una oferta en Kajabi, recibe un email con su enlace personal de Telegram, el bot le hace el onboarding privado, acepta las condiciones del curso (con evidencia legal registrada) y recibe su acceso de un solo uso al grupo del curso.

## 🔄 Flujo completo

```
Alumno compra/rellena oferta en Kajabi
     ↓ (webhook de Kajabi)
POST /api/kajabi-webhook
     ↓
Se crea registro en Airtable ("Onboarding Telegram") con token único
     ↓
Email al alumno con enlace mágico → https://t.me/TuBot?start=TOKEN
     ↓ (el alumno pulsa el enlace y le da a "Start")
POST /api/telegram-webhook
     ↓
El bot le da la bienvenida + envía las condiciones del curso
     ↓ (el alumno pulsa "✅ He leído y acepto las condiciones")
Se registra la evidencia del consentimiento en Airtable
+ email de confirmación al alumno (justificante)
     ↓
El bot le envía un enlace de invitación de UN SOLO USO al grupo del curso
     ↓
Alumno dentro del grupo ✅
```

Si el alumno no completa el alta, un cron diario (9:00 UTC) le reenvía el email hasta 3 veces (uno cada 2 días).

## ⚠️ Importante: por qué el email es el primer paso

**Un bot de Telegram no puede escribir primero a un usuario.** Telegram lo prohíbe (anti-spam): el bot solo puede hablar con quien haya pulsado "Start" antes, y no se puede buscar a un usuario por email o teléfono. Por eso el onboarding empieza con un email que contiene el enlace `t.me/TuBot?start=TOKEN`:

- **Si el alumno tiene Telegram:** el enlace abre la app directamente y el onboarding es automático.
- **Si NO tiene Telegram:** no le llega nada por Telegram. El email le indica cómo instalarlo (1 minuto, gratis) y volver a pulsar el enlace. El token no caduca, así que puede completar el alta cuando quiera.

## 🤖 Configuración del bot

1. En Telegram, habla con [@BotFather](https://t.me/BotFather) → `/newbot` → elige nombre y username (ej: `TuAcademiaBot`).
2. Guarda el token que te da (es el `TELEGRAM_BOT_TOKEN`).
3. Añade el bot como **administrador** a cada grupo de curso (necesita permiso de "Invitar usuarios mediante enlaces").
4. Obtén el Chat ID de cada grupo: añade [@RawDataBot](https://t.me/RawDataBot) temporalmente al grupo, copia el `chat.id` (es negativo, ej: `-1001234567890`) y expúlsalo.
5. Registra el webhook (una sola vez, tras el deploy):

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://TU-PROYECTO.vercel.app/api/telegram-webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

## 🔗 Configuración del webhook de Kajabi

En Kajabi → Settings → Webhooks → New Webhook:

- **Evento:** Offer Purchased (o Form Submitted, según tu embudo)
- **URL:** `https://TU-PROYECTO.vercel.app/api/kajabi-webhook?secret=TU_CRON_SECRET`

El endpoint extrae email, nombre y título de la oferta del payload. El título de la oferta debe coincidir con el campo `Curso` de la tabla "Cursos Telegram" de Airtable.

## 📊 Tablas nuevas en Airtable

### Tabla "Cursos Telegram" (una fila por curso)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| Curso | Text | Debe coincidir con el título de la oferta en Kajabi |
| Chat ID | Text | ID del grupo de Telegram (ej: -1001234567890) |
| Condiciones URL | URL | Enlace público al PDF/página de condiciones del curso |
| Versión Condiciones | Text | Ej: "v1 — 2026-08" (cámbiala cada vez que edites el documento) |

### Tabla "Onboarding Telegram" (una fila por alumno y curso)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| Nombre | Text | Nombre del alumno |
| Email | Email | Email del alumno (de Kajabi) |
| Curso | Text | Curso al que se ha inscrito |
| Token | Text | Token único del enlace mágico |
| Estado | Single Select | Pendiente / Iniciado / Condiciones aceptadas / En grupo |
| Fecha Alta | Date (con hora) | Cuándo llegó el webhook de Kajabi |
| Telegram ID | Text | ID de la cuenta de Telegram vinculada |
| Telegram Username | Text | @username del alumno |
| Telegram Nombre | Text | Nombre que muestra en Telegram |
| Fecha Aceptación | Date (con hora) | Cuándo aceptó las condiciones |
| Versión Condiciones | Text | Versión del documento que aceptó |
| Evidencia Consentimiento | Long text | JSON con toda la evidencia del clic |
| Enlace Invitación | URL | Enlace de un solo uso que se le generó |
| Recordatorios | Number | Recordatorios por email enviados |
| Último Recordatorio | Date (con hora) | Fecha del último recordatorio |

## 🔐 Variables de entorno nuevas

```env
TELEGRAM_BOT_TOKEN=          # Token de @BotFather
TELEGRAM_BOT_USERNAME=       # Username del bot SIN @ (ej: TuAcademiaBot)
TELEGRAM_WEBHOOK_SECRET=     # Cadena aleatoria para autenticar el webhook de Telegram
```

(Se reutilizan `CRON_SECRET`, `AIRTABLE_*` y `EMAIL_*` que ya existen.)

## ⚖️ Validez legal de la aceptación (España / UE)

No necesitas una plataforma de firma para esto. Para la venta de infoproductos, la aceptación de condiciones mediante un clic expreso ("clickwrap") es una **firma electrónica simple**, válida y admisible como prueba:

- **Reglamento eIDAS (UE 910/2014, art. 25):** a una firma electrónica no se le pueden negar efectos jurídicos solo por ser electrónica o simple.
- **Ley 34/2002 (LSSI-CE, arts. 23-24):** los contratos celebrados por vía electrónica producen todos los efectos del ordenamiento y el soporte electrónico es admisible como prueba documental.
- Lo que da fuerza probatoria no es el "tipo de firma" sino la **evidencia** que conserves. Este sistema guarda: quién (email + cuenta de Telegram vinculada al token personal enviado a ese email), qué (versión concreta del documento y texto exacto del botón), cuándo (timestamp ISO) y el justificante duplicado por email al alumno.

Requisitos que debes cumplir tú en el documento de condiciones (esto el sistema no lo puede hacer por ti):

1. **Condiciones accesibles ANTES de aceptar:** el bot enlaza el documento antes del botón — mantén la URL pública y estable, y no edites versiones antiguas (crea "v2" en lugar de sobrescribir "v1").
2. **Derecho de desistimiento (14 días):** para contenido digital, el art. 103.m de la Ley General de Consumidores permite que el alumno **renuncie al desistimiento si consiente expresamente el acceso inmediato al contenido**. Incluye en las condiciones una cláusula tipo: *"Al aceptar, solicitas el acceso inmediato al contenido digital y consientes que, una vez iniciado el acceso, pierdes el derecho de desistimiento de 14 días"*. Sin esa cláusula, el alumno podría pedir el reembolso hasta 14 días después incluso habiendo consumido el curso.
3. **RGPD:** las condiciones (o un enlace desde ellas) deben informar del tratamiento de datos: responsable, finalidad (gestión del curso y comunicaciones por Telegram), base legal (ejecución de contrato), conservación y derechos ARSOPOL. Menciona expresamente que el curso se imparte por Telegram y que su ID de Telegram se vincula a su ficha de alumno.
4. **Contenido mínimo de las condiciones:** identificación fiscal de la academia, descripción del curso, precio y forma de pago, duración del acceso, normas del grupo, propiedad intelectual (prohibición de compartir contenido), y la cláusula de desistimiento anterior.

> ⚠️ Este sistema te da el mecanismo y la evidencia. El **texto** de las condiciones conviene que lo revise un abogado una vez — es una revisión pequeña y te cubre para todos los cursos.

## 🧪 Probar el flujo

```bash
# Simular el webhook de Kajabi (te llegará el email de onboarding)
curl -X POST "https://TU-PROYECTO.vercel.app/api/kajabi-webhook?secret=TU_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"member": {"email": "tu-email@gmail.com", "name": "Alumno Prueba"}, "offer_title": "Curso Prueba"}'
```

Antes crea en Airtable el curso "Curso Prueba" en la tabla "Cursos Telegram" con un grupo de pruebas.
