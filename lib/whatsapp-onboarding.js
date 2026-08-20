import crypto from 'crypto';
import { getAllRecords, createRecord, updateRecord } from './airtable';
import { normalizeCourseName } from './onboarding';
import { sendWhatsAppOnboardingEmail, sendWhatsAppConsentConfirmationEmail } from './email';

const ONBOARDING_TABLE = 'Onboarding WhatsApp';
const COURSES_TABLE = 'Cursos WhatsApp';

export const ESTADO_WA = {
  PENDIENTE: 'Pendiente',
  ACEPTADO: 'Condiciones aceptadas',
};

const BASE_URL = process.env.PUBLIC_BASE_URL || 'https://https-notepad-js-org.vercel.app';

function getAcceptUrl(token) {
  return `${BASE_URL}/aceptar?token=${token}`;
}

async function findWhatsAppCourse(courseName) {
  const courses = await getAllRecords(COURSES_TABLE);
  const target = normalizeCourseName(courseName);
  if (!target) return null;
  return courses.find(c => normalizeCourseName(c.fields['Curso']) === target) || null;
}

// Paso 1: pago en Kajabi de una oferta con curso de WhatsApp configurado.
// Creamos la ficha y enviamos el email con el enlace a la pagina de aceptacion.
export async function startWhatsAppOnboarding({ name, email, courseName }) {
  const course = await findWhatsAppCourse(courseName);
  if (!course) return { ignored: true };
  const canonicalName = course.fields['Curso'];
  // Nombre limpio que ve el alumno (sin precios ni pagos); el canonico se
  // conserva para el cruce con Kajabi.
  const displayName = course.fields['Nombre Público'] || canonicalName;
  const aviso = course.fields['Aviso Email'] || '';

  const existing = (await getAllRecords(ONBOARDING_TABLE)).find(
    r => r.fields['Email'] === email && normalizeCourseName(r.fields['Curso']) === normalizeCourseName(canonicalName)
  );
  if (existing) {
    if (existing.fields['Estado'] === ESTADO_WA.PENDIENTE) {
      console.log(`WhatsApp onboarding pending for ${email} / ${canonicalName}, resending email`);
      await sendWhatsAppOnboardingEmail(email, name, displayName, getAcceptUrl(existing.fields['Token']), aviso);
    } else {
      console.log(`WhatsApp onboarding already completed for ${email} / ${canonicalName}, ignoring event`);
    }
    return existing;
  }

  const token = crypto.randomBytes(16).toString('hex');
  const record = await createRecord(ONBOARDING_TABLE, {
    'Nombre': name,
    'Email': email,
    'Curso': canonicalName,
    'Token': token,
    'Estado': ESTADO_WA.PENDIENTE,
    'Fecha Alta': new Date().toISOString(),
    'Recordatorios': 0,
  });
  if (!record) return null;

  await sendWhatsAppOnboardingEmail(email, name, displayName, getAcceptUrl(token), aviso);
  return record;
}

// Convierte un enlace de Google Drive .../view en .../preview para poder
// incrustar el PDF en un iframe dentro de la pagina de aceptacion.
function toPreviewUrl(driveUrl) {
  if (!driveUrl) return null;
  return driveUrl.replace('/view', '/preview').split('?')[0];
}

// Datos que necesita la pagina de aceptacion para pintarse.
export async function getAcceptanceInfo(token) {
  if (!token) return null;
  const records = await getAllRecords(ONBOARDING_TABLE);
  const record = records.find(r => r.fields['Token'] === token);
  if (!record) return null;

  const course = await findWhatsAppCourse(record.fields['Curso']);
  if (!course) return null;

  const aceptado = record.fields['Estado'] === ESTADO_WA.ACEPTADO;
  return {
    nombre: record.fields['Nombre'],
    curso: course.fields['Nombre Público'] || record.fields['Curso'],
    condicionesUrl: course.fields['Condiciones URL'],
    condicionesPreview: toPreviewUrl(course.fields['Condiciones URL']),
    version: course.fields['Versión Condiciones'] || 'v1',
    aceptado,
    // El enlace de WhatsApp y el video solo se exponen cuando ya ha aceptado
    whatsappLink: aceptado ? course.fields['Enlace WhatsApp'] : null,
    videoUrl: aceptado ? course.fields['Vídeo Onboarding'] || null : null,
  };
}

// Paso 2: el alumno pulsa "He leido y acepto" en la pagina.
// Guardamos la evidencia (con IP y dispositivo), enviamos el justificante
// por email y devolvemos el enlace de la comunidad de WhatsApp.
export async function acceptConditions(token, ip, userAgent) {
  if (!token) return null;
  const records = await getAllRecords(ONBOARDING_TABLE);
  const record = records.find(r => r.fields['Token'] === token);
  if (!record) return null;

  const fields = record.fields;
  const course = await findWhatsAppCourse(fields['Curso']);
  if (!course) return null;

  const whatsappLink = course.fields['Enlace WhatsApp'];
  const videoUrl = course.fields['Vídeo Onboarding'] || null;

  if (fields['Estado'] === ESTADO_WA.ACEPTADO) {
    return { whatsappLink, videoUrl, alreadyAccepted: true };
  }

  const acceptedAt = new Date().toISOString();
  const conditionsUrl = course.fields['Condiciones URL'];
  const conditionsVersion = course.fields['Versión Condiciones'] || 'v1';

  const evidence = {
    accion: 'Aceptación de condiciones del curso',
    texto_boton: 'He leído y acepto las condiciones',
    medio: 'Página web de aceptación (clickwrap)',
    curso: fields['Curso'],
    version_condiciones: conditionsVersion,
    condiciones_url: conditionsUrl,
    fecha_iso: acceptedAt,
    email: fields['Email'],
    token_onboarding: fields['Token'],
    ip: ip || null,
    dispositivo: userAgent || null,
  };

  await updateRecord(ONBOARDING_TABLE, record.id, {
    'Estado': ESTADO_WA.ACEPTADO,
    'Fecha Aceptación': acceptedAt,
    'Versión Condiciones': conditionsVersion,
    'Evidencia Consentimiento': JSON.stringify(evidence, null, 2),
    'IP': (ip || '').substring(0, 100),
    'Dispositivo': (userAgent || '').substring(0, 255),
  });

  await sendWhatsAppConsentConfirmationEmail(
    fields['Email'],
    fields['Nombre'],
    course.fields['Nombre Público'] || fields['Curso'],
    conditionsUrl,
    conditionsVersion,
    acceptedAt,
    whatsappLink,
    videoUrl
  );

  return { whatsappLink, videoUrl, alreadyAccepted: false };
}

// Cron diario: recordatorios a quien no ha aceptado (max 3, uno cada 2 dias).
export async function checkPendingWhatsAppOnboardings() {
  const records = await getAllRecords(ONBOARDING_TABLE);
  const courses = await getAllRecords(COURSES_TABLE);
  const now = Date.now();
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
  let sent = 0;

  for (const record of records) {
    const fields = record.fields;
    if (fields['Estado'] !== ESTADO_WA.PENDIENTE) continue;

    const reminders = fields['Recordatorios'] || 0;
    if (reminders >= 3) continue;

    const lastContact = new Date(fields['Último Recordatorio'] || fields['Fecha Alta']).getTime();
    if (now - lastContact < TWO_DAYS) continue;

    const course = courses.find(c => normalizeCourseName(c.fields['Curso']) === normalizeCourseName(fields['Curso']));
    const aviso = course?.fields['Aviso Email'] || '';
    const ok = await sendWhatsAppOnboardingEmail(fields['Email'], fields['Nombre'], course?.fields['Nombre Público'] || fields['Curso'], getAcceptUrl(fields['Token']), aviso);
    if (ok) {
      await updateRecord(ONBOARDING_TABLE, record.id, {
        'Recordatorios': reminders + 1,
        'Último Recordatorio': new Date().toISOString(),
      });
      sent++;
    }
  }

  return { total: records.length, remindersSent: sent };
}
