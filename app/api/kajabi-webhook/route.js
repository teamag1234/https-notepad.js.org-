import { startOnboarding } from '../../../lib/onboarding.js';
import { createRecord } from '../../../lib/airtable.js';

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

    const record = await startOnboarding({ name, email, courseName });

    return new Response(
      JSON.stringify({
        success: !!record,
        message: record ? `Onboarding iniciado para ${email}` : 'Error creando el onboarding',
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
