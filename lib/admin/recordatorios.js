import nodemailer from 'nodemailer';
import { getMorosos } from './airtable-live.js';
import { q, ensureSchema, dbConfigurada } from './db.js';

// Recordatorios de pago a morosos.
// SEGURIDAD: los envíos reales están bloqueados salvo que la variable de
// entorno RECORDATORIOS_ACTIVOS valga exactamente "si". Sin ella, todo
// funciona en modo revisión (previsualizar y enviar pruebas al email propio).

const IBAN_PAGOS = process.env.PAGOS_IBAN || 'ES70 3058 0221 0127 2001 7857';
const DIAS_ENTRE_RECORDATORIOS = 7;

export function recordatoriosActivos() {
  return process.env.RECORDATORIOS_ACTIVOS === 'si';
}

export async function getMorososParaAvisar() {
  const { morosos } = await getMorosos();
  const validos = morosos.filter(
    (m) => (m.curso || '').trim().toUpperCase() !== 'BAJA' && m.debe > 0,
  );
  return {
    conEmail: validos.filter((m) => m.email),
    sinEmail: validos.filter((m) => !m.email),
    iban: IBAN_PAGOS,
  };
}

export function plantillaRecordatorio(moroso) {
  const detalle = (moroso.detalle || '').replace(/^Pendiente:\s*/i, '');
  const importe = moroso.debe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const asunto = 'Recordatorio de pago pendiente — AG Academy';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 560px;">
      <h2>Hola ${moroso.nombre},</h2>
      <p>Al revisar nuestros registros hemos detectado que tienes un pago pendiente con AG Academy:</p>
      <div style="background: #fef3c7; border-radius: 8px; padding: 14px 18px; margin: 16px 0;">
        <p style="margin: 0; font-size: 22px;"><strong>Importe pendiente: ${importe}</strong></p>
        ${detalle ? `<p style="margin: 8px 0 0; font-size: 14px; color: #92400e;">Detalle: ${detalle}</p>` : ''}
      </div>
      <p><strong>Cómo regularizarlo</strong> — transferencia bancaria a:</p>
      <div style="background: #f3f4f6; border-radius: 8px; padding: 14px 18px; margin: 16px 0;">
        <p style="margin: 0;"><strong>IBAN:</strong> ${IBAN_PAGOS}</p>
        <p style="margin: 6px 0 0;"><strong>Titular:</strong> AG Academy</p>
        <p style="margin: 6px 0 0;"><strong>Concepto:</strong> ${moroso.nombre}</p>
      </div>
      <p style="background: #fee2e2; border-radius: 8px; padding: 10px 14px;">⚠️ <strong>Muy importante:</strong> en el <strong>concepto</strong> de la transferencia escribe tu <strong>nombre completo</strong> tal y como aparece arriba, para que podamos identificar tu pago correctamente.</p>
      <p>Si ya has realizado este pago, crees que se trata de un error, o estás pasando por dificultades para hacer frente al importe, <strong>responde a este email</strong> y lo revisamos contigo — siempre buscamos la mejor solución.</p>
      <p>Un saludo,<br>El equipo de AG Academy</p>
    </div>
  `;
  return { asunto, html };
}

function transporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
  });
}

async function yaAvisadoHacePoco(morosoId) {
  if (!dbConfigurada()) return false;
  const filas = await q(
    `SELECT 1 FROM recordatorios_log WHERE alumno_airtable_id = $1 AND enviado_el > now() - interval '${DIAS_ENTRE_RECORDATORIOS} days' LIMIT 1`,
    [morosoId],
  );
  return filas.length > 0;
}

async function registrarEnvio(moroso, destinatario, modo) {
  if (!dbConfigurada()) return;
  await q(
    `INSERT INTO recordatorios_log (alumno_airtable_id, nombre, email, modo) VALUES ($1, $2, $3, $4)`,
    [moroso.id, moroso.nombre, destinatario, modo],
  );
}

// Envía UNA prueba del recordatorio (con los datos reales del primer moroso)
// al email de administración — nunca al alumno.
export async function enviarPrueba() {
  const oficina = process.env.EMAIL_USER;
  if (!oficina) throw new Error('Falta EMAIL_USER en las variables de entorno');
  const { conEmail } = await getMorososParaAvisar();
  if (!conEmail.length) throw new Error('No hay morosos con email para generar la prueba');
  const moroso = conEmail[0];
  const { asunto, html } = plantillaRecordatorio(moroso);
  await transporter().sendMail({
    from: process.env.EMAIL_FROM || oficina,
    to: oficina,
    subject: `[PRUEBA — no enviado al alumno] ${asunto}`,
    html: `<p style="background:#dbeafe;padding:10px;border-radius:6px;">🧪 <strong>PRUEBA</strong>: así vería el email ${moroso.nombre} &lt;${moroso.email}&gt;. Este mensaje solo se ha enviado a ${oficina}.</p>` + html,
  });
  await registrarEnvio(moroso, oficina, 'PRUEBA').catch(() => {});
  return { enviadoA: oficina, ejemploDe: moroso.nombre };
}

// Envío real a todos los morosos con email (requiere RECORDATORIOS_ACTIVOS=si).
// Respeta un mínimo de 7 días entre recordatorios al mismo alumno.
export async function enviarRecordatorios() {
  if (!recordatoriosActivos()) {
    throw new Error('Los envíos están desactivados. Para activarlos: variable RECORDATORIOS_ACTIVOS=si en Vercel y Redeploy.');
  }
  await ensureSchema();
  const { conEmail } = await getMorososParaAvisar();
  const t = transporter();
  let enviados = 0;
  let omitidos = 0;
  const detalles = [];
  for (const moroso of conEmail) {
    if (await yaAvisadoHacePoco(moroso.id)) {
      omitidos += 1;
      continue;
    }
    const { asunto, html } = plantillaRecordatorio(moroso);
    try {
      await t.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: moroso.email,
        subject: asunto,
        html,
      });
      await registrarEnvio(moroso, moroso.email, 'REAL');
      enviados += 1;
      detalles.push(`${moroso.nombre} <${moroso.email}>`);
    } catch (error) {
      detalles.push(`ERROR con ${moroso.nombre}: ${error.message}`);
    }
  }
  return { enviados, omitidos, detalles };
}
