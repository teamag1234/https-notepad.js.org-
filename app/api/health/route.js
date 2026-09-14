export const dynamic = 'force-dynamic';

export async function GET(request) {
  const respuesta = {
    status: 'ok',
    message: 'Kajabi-Airtable Sync Service is running',
    version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'local',
    timestamp: new Date().toISOString(),
  };

  // Diagnóstico de la sincronización de ingresos de Kajabi (?diag=kajabi):
  // no expone ningún valor de las claves, solo su estado, y ejecuta la misma
  // sincronización idempotente que el cron nocturno para poder ver el error.
  const { searchParams } = new URL(request.url);
  if (searchParams.get('diag') === 'kajabi') {
    try {
      const { diagnosticoKajabi } = await import('../../../lib/kajabi.js');
      const { syncKajabiToAirtable } = await import('../../../lib/sync-logic.js');
      respuesta.kajabiVars = diagnosticoKajabi();
      respuesta.kajabiSync = await syncKajabiToAirtable();
    } catch (error) {
      respuesta.kajabiSync = { success: false, error: error.message };
    }
  }

  return new Response(JSON.stringify(respuesta), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
