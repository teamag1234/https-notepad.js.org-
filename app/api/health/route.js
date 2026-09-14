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
      const { diagnosticoKajabi, listarSitios, getTransacciones } = await import('../../../lib/kajabi.js');
      const { syncKajabiToAirtable } = await import('../../../lib/sync-logic.js');
      respuesta.kajabiVars = diagnosticoKajabi();
      respuesta.kajabiSitios = await listarSitios().catch((e) => `error: ${e.message}`);
      if (searchParams.get('sinfecha') === '1') {
        const todas = await getTransacciones({}).catch((e) => `error: ${e.message}`);
        // Solo datos agregados: nada de nombres ni emails en un endpoint público
        const resumen = (t) => (t ? { fecha: t.fecha, importe: t.importe, estado: t.estado, accion: t.accion } : null);
        respuesta.kajabiSinFecha = Array.isArray(todas)
          ? { total: todas.length, primera: resumen(todas[0]), ultima: resumen(todas[todas.length - 1]) }
          : todas;
      }
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
