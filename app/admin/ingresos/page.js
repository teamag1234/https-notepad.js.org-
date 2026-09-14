'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shell, useAdmin, eur } from '../ui.js';

function Ingresos() {
  const { apiFetch, clave } = useAdmin();
  const [ingresos, setIngresos] = useState(null);
  const [mes, setMes] = useState('');
  const [error, setError] = useState('');
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState('');

  const sincronizarKajabi = async () => {
    setSincronizando(true);
    setError('');
    setAviso('');
    try {
      const r = await apiFetch('/api/admin/sync-kajabi-ingresos', { method: 'POST' });
      setAviso(`✅ Sincronizado con Kajabi: ${r.transaccionesLeidas ?? 0} cobros leídos, ${r.nuevos ?? 0} ingresos nuevos registrados.`);
      cargar();
    } catch (e) {
      setError(`No se pudo sincronizar con Kajabi: ${e.message}`);
    }
    setSincronizando(false);
  };

  const cargar = useCallback(() => {
    const filtro = mes ? `&mes=${mes}` : '';
    apiFetch(`/api/admin/movimientos?tipo=INGRESO&limite=500${filtro}`).then(setIngresos).catch((e) => setError(e.message));
  }, [apiFetch, mes]);

  useEffect(() => { if (clave) cargar(); }, [clave, cargar]);

  const total = (ingresos || []).reduce((s, i) => s + i.importe, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h2 style={{ marginTop: 0 }}>Ingresos</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
          {mes && <button onClick={() => setMes('')} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer' }}>quitar filtro</button>}
          <button onClick={sincronizarKajabi} disabled={sincronizando} style={{ padding: '8px 14px', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            {sincronizando ? 'Sincronizando…' : '🔄 Sincronizar Kajabi ahora'}
          </button>
        </div>
      </div>
      <p style={{ color: '#6b7280' }}>
        Los cobros de Kajabi se sincronizan solos cada noche desde la API de Kajabi; el botón fuerza la sincronización ahora mismo.{' '}
        {ingresos && <strong>Mostrando {ingresos.length} cobros · {eur(total)}</strong>}
      </p>
      {aviso && <p style={{ backgroundColor: '#dcfce7', padding: '10px', borderRadius: '6px' }}>{aviso}</p>}
      {error && <p style={{ backgroundColor: '#fee2e2', padding: '10px', borderRadius: '6px' }}>{error}</p>}

      <div style={{ backgroundColor: 'white', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        {!ingresos && <p>Cargando…</p>}
        {ingresos && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: '12px' }}>
                  <th style={{ padding: '8px 6px' }}>Fecha</th>
                  <th style={{ padding: '8px 6px' }}>Alumno</th>
                  <th style={{ padding: '8px 6px' }}>Concepto</th>
                  <th style={{ padding: '8px 6px' }}>Categoría</th>
                  <th style={{ padding: '8px 6px' }}>Fuente</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {ingresos.map((i) => (
                  <tr key={i.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{i.fecha}</td>
                    <td style={{ padding: '8px 6px' }}>{i.contacto || '—'}</td>
                    <td style={{ padding: '8px 6px', color: '#6b7280', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.concepto}>{i.concepto}</td>
                    <td style={{ padding: '8px 6px', color: '#6b7280' }}>{i.categoria}</td>
                    <td style={{ padding: '8px 6px', color: '#9ca3af', fontSize: '12px' }}>{i.fuente}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 'bold', color: i.importe >= 0 ? '#059669' : '#dc2626', whiteSpace: 'nowrap' }}>{eur(i.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaginaIngresos() {
  return (
    <Shell activo="ingresos">
      <Ingresos />
    </Shell>
  );
}
