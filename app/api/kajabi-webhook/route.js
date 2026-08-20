import { startOnboarding } from '../../../lib/onboarding.js';
import { startWhatsAppOnboarding } from '../../../lib/whatsapp-onboarding.js';
import { createRecord } from '../../../lib/airtable.js';
import { dbConfigurada } from '../../../lib/admin/db.js';
import { crearMovimiento, categorizarIngreso } from '../../../lib/admin/finanzas.js';

// Registra el pago como INGRESO en la base de datos del panel de administración.
// Nunca rompe el flujo del webhook: si falla o no hay base de datos, se ignora.
async function registrarIngresoAdmin({ payload, data, name, email, courseName }) {
  try {
    if (!dbConfigurada()) return;
    const importe = Number(
      data.amount ?? data.price ?? data.total ?? data.amount_paid ?? data.payment_amount ?? NaN,
    );
    if (!importe || isNaN(importe)) return;
    const idExterno = data.transaction_id || data.payment_id || data.id || payload.id;
    await crearMovimiento({
      tipo: 'INGRESO',
      fecha: new Date().toISOString().slice(0, 10),
      importe,
      concepto: courseName || 'Pago Kajabi',
      categoria: categorizarIngreso(courseName),
      contacto: name,
      email,
      fuente: 'KAJABI',
      referencia: idExterno ? `kajabi-${idExterno}` : null,
    });
    console.log(`💰 Ingreso registrado en el panel de administración: ${importe}€ de ${email}`);
  } catch (error) {
    console.error('Aviso: no se pudo registrar el ingreso en el panel de administración:', error.message);
  }
}

// Webhook que Kajabi llama cuando un alumno compra/rellena una oferta
// (evento "Offer purchased" / "Form submitted" en Kajabi → Settings → Webhooks).
// Crea el registro de onboarding y envia al alumno el email con su enlace
// personal de Telegram.
export async function POST(req) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get('secret');
    const authHeader = req.headers.get('authorization');
    const authorized =
      secret === process.env.CRON_SECRET || authHeader === `Bearer ${process.env.CRON_SECRET}`;
    if (process.env.CRON_SECRET && !authorized) {
      return new Response('Unauthorized', { status: 401 });
    }

    const payload = await req.json();
    console.log('📩 Webhook de Kajabi recibido:', JSON.stringify(payload));

    // Kajabi varia el formato segun el evento; extraemos los campos de forma tolerante
    const data = payload.payload || payload.data || payload;
    const member = data.member || data.contact || data;
    const email = member.email || data.member_email || null;
    const name = member.name || [member.first_name, member.last_name].filter(Boolean).join(' ') || 'Alumno/a';
    const courseName = data.offer_title || data.offer?.title || data.product_title || null;

    if (!email || !courseName) {
      console.error('Webhook de Kajabi sin email o curso identificable');
      // Guardamos el payload en Airtable para poder diagnosticar formatos
      // de evento no contemplados sin acceso a los logs de Vercel.
      await createRecord('Webhooks Log', {
        'Fecha': new Date().toISOString(),
        'Motivo': `Sin ${!email ? 'email' : 'curso'} identificable`,
        'Payload': JSON.stringify(payload, null, 2).substring(0, 90000),
      });
      return new Response(
        JSON.stringify({ success: false, message: 'Payload sin email o curso' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    await registrarIngresoAdmin({ payload, data, name, email, courseName });

    // Primero probamos el canal Telegram; si la oferta no esta ahi,
    // probamos el canal WhatsApp. Si no esta en ninguno, se ignora.
    let record = await startOnboarding({ name, email, courseName });
    if (record?.ignored) {
      record = await startWhatsAppOnboarding({ name, email, courseName });
    }

    const message = record?.ignored
      ? `Oferta sin curso de Telegram configurado, ignorada: ${courseName}`
      : record
        ? `Onboarding iniciado para ${email}`
        : 'Error creando el onboarding';
    return new Response(
      JSON.stringify({
        success: !!record,
        ignored: !!record?.ignored,
        message,
        timestamp: new Date().toISOString(),
      }),
      { status: record ? 200 : 500, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error en /api/kajabi-webhook:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
