import crypto from 'crypto';
import { getAllRecords, createRecord, updateRecord } from './airtable';
import {
  sendMessage,
  answerCallbackQuery,
  editMessageReplyMarkup,
  createOneTimeInviteLink,
  getDeepLink,
} from './telegram';
import { sendTelegramOnboardingEmail, sendConsentConfirmationEmail } from './email';

const ONBOARDING_TABLE = 'Onboarding Telegram';
const COURSES_TABLE = 'Cursos Telegram';

export const ESTADO = {
  PENDIENTE: 'Pendiente',
  INICIADO: 'Iniciado',
  ACEPTADO: 'Condiciones aceptadas',
  EN_GRUPO: 'En grupo',
};

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

async function findCourse(courseName) {
  const courses = await getAllRecords(COURSES_TABLE);
  return courses.find(c => c.fields['Curso'] === courseName) || null;
}

async function findOnboardingByToken(token) {
  const records = await getAllRecords(ONBOARDING_TABLE);
  return records.find(r => r.fields['Token'] === token) || null;
}

async function findOnboardingByTelegramId(telegramId) {
  const records = await getAllRecords(ONBOARDING_TABLE);
  return records.find(r => String(r.fields['Telegram ID']) === String(telegramId)) || null;
}

// Paso 1: el alumno compra/rellena la oferta en Kajabi.
// Creamos el registro de onboarding y le enviamos por email el enlace
// magico t.me/Bot?start=TOKEN (un bot no puede escribir primero al alumno).
export async function startOnboarding({ name, email, courseName }) {
  const existing = (await getAllRecords(ONBOARDING_TABLE)).find(
    r => r.fields['Email'] === email && r.fields['Curso'] === courseName
  );
  if (existing) {
    // Kajabi dispara payment.succeeded tambien con las cuotas mensuales:
    // solo reenviamos el email a quien aun no ha empezado el onboarding.
    if (existing.fields['Estado'] === ESTADO.PENDIENTE) {
      console.log(`Onboarding pending for ${email} / ${courseName}, resending email`);
      const deepLink = getDeepLink(existing.fields['Token']);
      await sendTelegramOnboardingEmail(email, name, courseName, deepLink);
    } else {
      console.log(`Onboarding already completed for ${email} / ${courseName}, ignoring event`);
    }
    return existing;
  }

  const token = generateToken();
  const record = await createRecord(ONBOARDING_TABLE, {
    'Nombre': name,
    'Email': email,
    'Curso': courseName,
    'Token': token,
    'Estado': ESTADO.PENDIENTE,
    'Fecha Alta': new Date().toISOString(),
    'Recordatorios': 0,
  });
  if (!record) return null;

  const deepLink = getDeepLink(token);
  await sendTelegramOnboardingEmail(email, name, courseName, deepLink);
  return record;
}

// Paso 2: el alumno pulsa el enlace y le da a Start en Telegram.
// Vinculamos su cuenta de Telegram al registro y le mandamos las
// condiciones del curso con el boton de aceptacion.
export async function handleStart(message, token) {
  const chatId = message.chat.id;
  const from = message.from;

  if (!token) {
    await sendMessage(
      chatId,
      '👋 ¡Hola! Para empezar tu onboarding necesitas usar el enlace personal que te hemos enviado por email al inscribirte en el curso.\n\nSi no lo encuentras, revisa tu carpeta de spam o escríbenos.'
    );
    return;
  }

  const record = await findOnboardingByToken(token);
  if (!record) {
    await sendMessage(
      chatId,
      '❌ Este enlace no es válido o ya ha caducado. Revisa el último email que te hemos enviado o contacta con nosotros.'
    );
    return;
  }

  const fields = record.fields;
  const course = await findCourse(fields['Curso']);
  if (!course) {
    console.error(`Course not found in ${COURSES_TABLE}: ${fields['Curso']}`);
    await sendMessage(chatId, '❌ Ha habido un problema con la configuración de tu curso. Escríbenos y lo solucionamos enseguida.');
    return;
  }

  await updateRecord(ONBOARDING_TABLE, record.id, {
    'Estado': fields['Estado'] === ESTADO.PENDIENTE ? ESTADO.INICIADO : fields['Estado'],
    'Telegram ID': String(from.id),
    'Telegram Username': from.username || '',
    'Telegram Nombre': [from.first_name, from.last_name].filter(Boolean).join(' '),
  });

  const conditionsUrl = course.fields['Condiciones URL'];
  const conditionsVersion = course.fields['Versión Condiciones'] || 'v1';

  await sendMessage(
    chatId,
    `👋 ¡Bienvenido/a <b>${fields['Nombre']}</b>!\n\nYa casi estás dentro de <b>${fields['Curso']}</b>. Solo queda un paso.\n\n📄 Estas son las <a href="${conditionsUrl}">condiciones del curso</a> (${conditionsVersion}). Léelas con calma: incluyen las condiciones de acceso, uso del contenido y la política de desistimiento.\n\nCuando las hayas leído, pulsa el botón de abajo para confirmar. Al pulsarlo quedará registrada tu aceptación (fecha, hora y cuenta de Telegram) y recibirás una copia por email.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ He leído y acepto las condiciones', callback_data: `accept:${record.id}` }],
        ],
      },
    }
  );
}

// Paso 3: el alumno pulsa "Acepto". Guardamos la evidencia del
// consentimiento, le enviamos copia por email y le damos el acceso al grupo.
export async function handleAccept(callbackQuery) {
  const recordId = callbackQuery.data.split(':')[1];
  const chatId = callbackQuery.message.chat.id;
  const from = callbackQuery.from;

  const records = await getAllRecords(ONBOARDING_TABLE);
  const record = records.find(r => r.id === recordId);
  if (!record) {
    await answerCallbackQuery(callbackQuery.id, 'Registro no encontrado, contacta con nosotros.');
    return;
  }

  const fields = record.fields;
  const course = await findCourse(fields['Curso']);
  if (!course) {
    await answerCallbackQuery(callbackQuery.id, 'Error de configuración del curso.');
    return;
  }

  if (fields['Estado'] === ESTADO.ACEPTADO || fields['Estado'] === ESTADO.EN_GRUPO) {
    await answerCallbackQuery(callbackQuery.id, 'Ya habías aceptado las condiciones ✅');
    return;
  }

  const acceptedAt = new Date().toISOString();
  const conditionsUrl = course.fields['Condiciones URL'];
  const conditionsVersion = course.fields['Versión Condiciones'] || 'v1';

  // Evidencia del consentimiento (clickwrap): quien, cuando, que version
  // del documento y desde que cuenta. Se guarda en Airtable y se duplica
  // en el email de confirmacion al alumno.
  const evidence = {
    accion: 'Aceptación de condiciones del curso',
    texto_boton: '✅ He leído y acepto las condiciones',
    curso: fields['Curso'],
    version_condiciones: conditionsVersion,
    condiciones_url: conditionsUrl,
    fecha_iso: acceptedAt,
    telegram_id: from.id,
    telegram_username: from.username || null,
    telegram_nombre: [from.first_name, from.last_name].filter(Boolean).join(' '),
    email: fields['Email'],
    token_onboarding: fields['Token'],
  };

  await updateRecord(ONBOARDING_TABLE, record.id, {
    'Estado': ESTADO.ACEPTADO,
    'Fecha Aceptación': acceptedAt,
    'Versión Condiciones': conditionsVersion,
    'Evidencia Consentimiento': JSON.stringify(evidence, null, 2),
  });

  await answerCallbackQuery(callbackQuery.id, '¡Condiciones aceptadas! ✅');
  await editMessageReplyMarkup(chatId, callbackQuery.message.message_id);

  await sendConsentConfirmationEmail(
    fields['Email'],
    fields['Nombre'],
    fields['Curso'],
    conditionsUrl,
    conditionsVersion,
    acceptedAt
  );

  const inviteLink = await createOneTimeInviteLink(course.fields['Chat ID'], fields['Nombre']);
  if (!inviteLink) {
    await sendMessage(chatId, '✅ Condiciones aceptadas y registradas. Te hemos enviado una copia por email.\n\n⚠️ No hemos podido generar tu enlace de acceso al grupo automáticamente, te lo enviaremos enseguida.');
    return;
  }

  await updateRecord(ONBOARDING_TABLE, record.id, {
    'Estado': ESTADO.EN_GRUPO,
    'Enlace Invitación': inviteLink,
  });

  await sendMessage(
    chatId,
    `🎉 ¡Perfecto, <b>${fields['Nombre']}</b>! Tu aceptación ha quedado registrada y te hemos enviado una copia de las condiciones por email.\n\n👇 Este es tu acceso personal al grupo del curso. Es de un solo uso, no lo compartas:\n\n${inviteLink}\n\n¡Nos vemos dentro! 🚀`
  );
}

// Cron diario: reenvia el email del enlace magico a los alumnos que aun no
// han empezado el onboarding en Telegram (maximo 3 recordatorios, uno cada 2 dias).
export async function checkPendingOnboardings() {
  const records = await getAllRecords(ONBOARDING_TABLE);
  const now = Date.now();
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
  let sent = 0;

  for (const record of records) {
    const fields = record.fields;
    if (fields['Estado'] !== ESTADO.PENDIENTE) continue;

    const reminders = fields['Recordatorios'] || 0;
    if (reminders >= 3) continue;

    const lastContact = new Date(fields['Último Recordatorio'] || fields['Fecha Alta']).getTime();
    if (now - lastContact < TWO_DAYS) continue;

    const deepLink = getDeepLink(fields['Token']);
    const ok = await sendTelegramOnboardingEmail(fields['Email'], fields['Nombre'], fields['Curso'], deepLink);
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

// Procesa cualquier update que llegue del webhook de Telegram.
export async function processTelegramUpdate(update) {
  if (update.callback_query?.data?.startsWith('accept:')) {
    await handleAccept(update.callback_query);
    return;
  }

  const message = update.message;
  if (!message?.text || message.chat.type !== 'private') return;

  if (message.text.startsWith('/start')) {
    const token = message.text.split(' ')[1]?.trim();
    await handleStart(message, token);
    return;
  }

  const linked = await findOnboardingByTelegramId(message.from.id);
  if (!linked) {
    await sendMessage(
      message.chat.id,
      'Para empezar, usa el enlace personal que te enviamos por email al inscribirte en tu curso. 😊'
    );
  }
}
