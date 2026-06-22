import { syncKajabiToAirtable } from '../../lib/sync-logic.js';

export async function GET(req) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      if (process.env.CRON_SECRET) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    console.log('🔄 Iniciando sincronización desde /api/sync-kajabi');
    const result = await syncKajabiToAirtable();

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
    console.error('❌ Error en /api/sync-kajabi:', error);

    return new Response(
      JSON.stringify({
        success: false,
        message: 'Error en la sincronización',
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
