# 🔄 Kajabi-Airtable Sync - Sistema Automático de Sincronización de Pagos

Sistema completo de sincronización automática de pagos desde Kajabi a Airtable con detección de cuotas fallidas, emails automáticos y dashboard web para control manual.

## ✨ Características

- ✅ **Sincronización automática diaria** de pagos desde Kajabi a Airtable
- ✅ **Verificación automática** de pagos pendientes y fallidos
- ✅ **Recordatorios por email** automáticos para cuotas pendientes
- ✅ **Notificaciones de fallos** para transacciones rechazadas
- ✅ **Dashboard web** para control manual y monitoreo
- ✅ **Cron jobs automáticos** en Vercel
- ✅ **Historial completo** de pagos y estados
- ✅ **Reportes detallados** de cada sincronización
- ✅ **Onboarding automático por Telegram** con aceptación de condiciones y acceso al grupo del curso — ver [TELEGRAM_ONBOARDING.md](TELEGRAM_ONBOARDING.md)

## 🚀 Requisitos

- Node.js 18+ (incluido en Vercel)
- Cuenta en Kajabi con API access
- Cuenta en Airtable con base de datos
- Cuenta de Gmail o servicio de email SMTP
- Cuenta en Vercel (gratis)

## 📋 Configuración Rápida

### 1. Clonar o descargar el repositorio
```bash
git clone <repo-url>
cd kajabi-airtable-sync
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno local (.env.local)
```env
# Kajabi
KAJABI_API_KEY=tu_clave_api_kajabi

# Airtable
AIRTABLE_TOKEN=tu_token_airtable
AIRTABLE_BASE_ID=tu_base_id_airtable

# Email (Gmail)
EMAIL_USER=tu_email@gmail.com
EMAIL_PASSWORD=tu_app_password_gmail
EMAIL_FROM=noreply@tudominio.com

# Seguridad
CRON_SECRET=tu_clave_secreta_aleatoria
```

### 4. Deploy a Vercel
1. Ve a https://vercel.com
2. Importa este repositorio
3. En Settings → Environment Variables, añade todas las variables anteriores
4. Deploy automático

## 🔧 Obtener Credenciales

### Kajabi API Key
1. Ve a Kajabi.com → Settings → API Keys
2. Crea una nueva clave
3. Copia el API Key

### Airtable Token
1. Ve a https://airtable.com/account/tokens
2. Crea un nuevo token con permisos de lectura/escritura
3. Copia el token

### Base ID de Airtable
1. Abre tu base en Airtable
2. En la URL verás: `https://airtable.com/APP_ID/`
3. El APP_ID es tu Base ID

### Gmail App Password
1. Ve a https://myaccount.google.com
2. Security → App Passwords
3. Selecciona Mail y Windows Computer
4. Genera una contraseña (es una cadena de 16 caracteres)
5. Usa esta contraseña como EMAIL_PASSWORD

## 📊 Estructura de Airtable

Crea una tabla llamada **"Pagos"** con estos campos:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| Nombre | Text | Nombre del estudiante |
| Email | Email | Email del estudiante |
| Teléfono | Phone | Teléfono del estudiante |
| Monto | Number | Monto del pago |
| Mes | Text | Fecha/mes del pago |
| Estado | Single Select | Pagado / En marcha / Sin pagar / Fallido |
| ID Kajabi | Text | ID único del pago en Kajabi |
| Fecha | Date | Fecha del pago |

## 📞 Endpoints Disponibles

### Dashboard
- `GET /` - Interfaz web de control

### API
- `GET /api/health` - Verificar que el servicio está en línea
- `GET /api/sync-kajabi` - Sincronizar manualmente pagos desde Kajabi
- `GET /api/check-failed-payments` - Verificar pagos pendientes
- `GET /api/check-transactions` - Verificar transacciones fallidas

Todos los endpoints de API requieren header de autenticación:
```
Authorization: Bearer CRON_SECRET
```

## ⏰ Cron Jobs Automáticos

El sistema ejecuta automáticamente (solo en Vercel deplorado):

| Hora | Acción | Descripción |
|------|--------|-------------|
| **2:00 AM UTC** | Sincronización | Sincroniza todos los pagos de Kajabi a Airtable |
| **10:00 AM UTC** | Verificación | Verifica pagos pendientes y envía recordatorios |

**Nota**: Los cron jobs solo funcionan en Vercel, no localmente.

## 🔄 Flujo de Datos

```
Kajabi (Pagos)
     ↓
API Kajabi → Fetch todos los pagos
     ↓
Procesar datos + Cliente + Estado
     ↓
Airtable (Tabla Pagos)
     ↓
Verificar pagos pendientes (>3 días)
     ↓
Gmail → Email reminders/notificaciones
```

## 🛠️ Desarrollo Local

```bash
# Instalar dependencias
npm install

# Ejecutar servidor de desarrollo
npm run dev

# Abrir en navegador
# http://localhost:3000
```

Para probar los endpoints localmente:
```bash
curl -H "Authorization: Bearer tu_CRON_SECRET" \
  http://localhost:3000/api/sync-kajabi
```

## 📧 Emails Automáticos

### Recordatorio de Pago Pendiente
Se envía cuando:
- Estado = "En marcha"
- Más de 3 días sin actualización
- Una vez cada 3 días

### Notificación de Fallo
Se envía cuando:
- Estado = "Sin pagar"
- Al detectar la transacción fallida

## 🔐 Seguridad

- ✅ Variables de entorno para credenciales
- ✅ Bearer token para endpoints de API
- ✅ HTTPS obligatorio en Vercel
- ✅ No se guardan contraseñas en el código
- ✅ Tokens con permisos limitados en Airtable

## 🚨 Troubleshooting

### "No me sale nada cuando verifico"
1. Verifica que las credenciales estén correctas en Vercel
2. Abre la consola de Vercel (logs) para ver errores
3. Comprueba que la tabla "Pagos" existe en Airtable
4. Verifica que hay pagos en Kajabi

### "Los emails no llegan"
1. Comprueba que EMAIL_PASSWORD es un App Password (no tu contraseña normal)
2. Verifica que el email no esté en spam
3. Abre los logs de Vercel para ver si hay errores de envío

### "Error de autorización en API"
1. Verifica el header `Authorization: Bearer CRON_SECRET`
2. Asegúrate de que CRON_SECRET está configurado en Vercel

## 📝 Variables de Entorno Requeridas

```env
KAJABI_API_KEY=              # API Key de Kajabi
AIRTABLE_TOKEN=              # Token de Airtable con permisos
AIRTABLE_BASE_ID=            # Base ID de Airtable
EMAIL_USER=                  # Tu email de Gmail
EMAIL_PASSWORD=              # App Password de Gmail
EMAIL_FROM=                  # Email que aparece como remitente
CRON_SECRET=                 # Clave secreta para cron jobs
TELEGRAM_BOT_TOKEN=          # Token del bot (@BotFather)
TELEGRAM_BOT_USERNAME=       # Username del bot sin @
TELEGRAM_WEBHOOK_SECRET=     # Secreto del webhook de Telegram
```

## 📈 Próximas Mejoras

- [ ] Dashboard con gráficos de pagos
- [ ] Reportes semanales/mensuales
- [ ] Múltiples métodos de pago
- [ ] Historial de intentos de pago
- [ ] Webhooks para eventos en tiempo real

## 📄 Licencia

Este proyecto está bajo licencia MIT.

## 📞 Soporte

Para problemas o preguntas, revisa los logs en Vercel:
1. Ve a tu proyecto en vercel.com
2. Función → Logs
3. Busca errores en tus últimas ejecuciones

---

Creado con ❤️ para automatizar el seguimiento de pagos de tu academia.
