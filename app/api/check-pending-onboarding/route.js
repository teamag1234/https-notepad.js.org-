import { checkPendingOnboardings } from '../../../lib/onboarding.js';
import { checkPendingWhatsAppOnboardings } from '../../../lib/whatsapp-onboarding.js';

// Cron diario: reenvia el enlace de onboarding a alumnos que aun no han
// entrado en Telegram.
export async function GET(req) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      if (process.env.CRON_SECRET) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    console.log('🔄 Revisando onboardings pendientes de Telegram y WhatsApp');
    const telegram = await checkPendingOnboardings();
    const whatsapp = await checkPendingWhatsAppOnboardings();

    return new Response(
      JSON.stringify({
        success: true,
        telegram,
        whatsapp,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error en /api/check-pending-onboarding:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
