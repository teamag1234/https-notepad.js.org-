import { getAcceptanceInfo, acceptConditions } from '../../../lib/whatsapp-onboarding.js';

// GET: datos para pintar la pagina de aceptacion (identificada por token).
export async function GET(req) {
  try {
    const token = new URL(req.url).searchParams.get('token');
    const info = await getAcceptanceInfo(token);
    if (!info) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, ...info }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Error en GET /api/aceptar:', error);
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// POST: registra la aceptacion de condiciones con IP y dispositivo.
export async function POST(req) {
  try {
    const { token } = await req.json();
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const userAgent = req.headers.get('user-agent') || '';

    const result = await acceptConditions(token, ip, userAgent);
    if (!result) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, whatsappLink: result.whatsappLink }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Error en POST /api/aceptar:', error);
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
