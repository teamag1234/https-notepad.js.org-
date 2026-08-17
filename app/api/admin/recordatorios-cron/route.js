import { NextResponse } from 'next/server';
import { recordatoriosActivos, enviarRecordatorios } from '../../../../lib/admin/recordatorios.js';

export const dynamic = 'force-dynamic';

// Cron semanal de recordatorios (lunes 9:00 UTC). No hace NADA salvo que
// RECORDATORIOS_ACTIVOS=si — así se puede desplegar sin riesgo de enviar
// emails antes de que el equipo lo active conscientemente.
export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  }
  if (!recordatoriosActivos()) {
    return NextResponse.json({ success: true, message: 'Recordatorios desactivados (RECORDATORIOS_ACTIVOS != si): no se envía nada' });
  }
  try {
    const resultado = await enviarRecordatorios();
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    console.error('Error en cron de recordatorios:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
