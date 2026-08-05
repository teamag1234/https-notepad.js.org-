import { processTelegramUpdate } from '../../../lib/onboarding.js';

// Webhook que recibe todos los updates del bot de Telegram.
// Telegram lo llama con el header secreto configurado en setWebhook.
export async function POST(req) {
  try {
    const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
    if (process.env.TELEGRAM_WEBHOOK_SECRET && secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    const update = await req.json();
    await processTelegramUpdate(update);

    // Telegram reintenta si no respondemos 200, asi que siempre respondemos OK
    // aunque un paso interno haya fallado (ya queda registrado en los logs).
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Error en /api/telegram-webhook:', error);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
