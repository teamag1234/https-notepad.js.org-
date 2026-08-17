import { NextResponse } from 'next/server';
import { enviarSeguimientos } from '../../../../lib/admin/recordatorios.js';

export const dynamic = 'force-dynamic';

// Cron semanal de seguimientos (lunes 9:00 UTC). Solo escribe a los alumnos a
// los que ya se les envió el primer recordatorio a mano desde el panel y que
// sigan debiendo dinero; cuando su pago se concilia, salen de morosos y el
// seguimiento se corta solo. Se puede apagar todo con RECORDATORIOS_PAUSADOS=si.
export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  }
  if (process.env.RECORDATORIOS_PAUSADOS === 'si') {
    return NextResponse.json({ success: true, message: 'Seguimientos en pausa (RECORDATORIOS_PAUSADOS=si)' });
  }
  try {
    const resultado = await enviarSeguimientos();
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    console.error('Error en cron de recordatorios:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
