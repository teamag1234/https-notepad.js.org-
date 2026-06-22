import { checkFailedPayments } from '../../lib/sync-logic.js';

export async function GET(req) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      if (process.env.CRON_SECRET) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    console.log('⚠️ Verificando pagos fallidos desde /api/check-failed-payments');
    const result = await checkFailedPayments();

    return new Response(
      JSON.stringify({
        success: result.success,
        message: result.message,
        data: result.data,
        timestamp: new Date().toISOString(),
      }),
      {
        status: result.success ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Error en /api/check-failed-payments:', error);

    return new Response(
      JSON.stringify({
        success: false,
        message: 'Error verificando pagos',
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
