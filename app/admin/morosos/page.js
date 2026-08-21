'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shell, Card, useAdmin, eur } from '../ui.js';

function Morosos() {
  const { apiFetch, clave } = useAdmin();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [actualizado, setActualizado] = useState(null);

  const cargar = useCallback(() => {
    setCargando(true);
    setError('');
    apiFetch('/api/admin/morosos')
      .then((d) => { setDatos(d); setActualizado(new Date()); })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [apiFetch]);

  useEffect(() => { if (clave) cargar(); }, [clave, cargar]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0 }}>Morosos</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {actualizado && <span style={{ fontSize: '12px', color: '#9ca3af' }}>Actualizado a las {actualizado.toLocaleTimeString('es-ES')}</span>}
          <button onClick={cargar} disabled={cargando}
                  style={{ padding: '8px 16px', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', opacity: cargando ? 0.5 : 1 }}>
            {cargando ? '⏳ Actualizando…' : '🔄 Actualizar desde Airtable'}
          </button>
        </div>
      </div>
      <p style={{ color: '#6b7280' }}>Lista en vivo desde Airtable (vista "MOROSOS ⚠️" de CURSOS KAJABI). Si marcas o desmarcas morosos en Airtable, pulsa Actualizar para verlo aquí.</p>
      {error && <p style={{ backgroundColor: '#fee2e2', padding: '10px', borderRadius: '6px' }}>{error}</p>}
      {!datos && !error && <p>Cargando…</p>}
      {datos && (
        <>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <Card titulo="Deuda total" valor={eur(datos.totalDeuda)} color="#d97706" />
            <Card titulo="Alumnos morosos" valor={datos.morosos.length} />
          </div>
          <div style={{ backgroundColor: 'white', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: '12px' }}>
                  <th style={{ padding: '8px 6px' }}>Alumno</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Debe</th>
                  <th style={{ padding: '8px 6px' }}>Detalle</th>
                  <th style={{ padding: '8px 6px' }}>Contacto</th>
                </tr>
              </thead>
              <tbody>
                {datos.morosos.map((m) => (
                  <tr key={m.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 6px', fontWeight: 'bold' }}>{m.nombre}<div style={{ fontWeight: 'normal', fontSize: '12px', color: '#9ca3af' }}>{m.curso}</div></td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626', whiteSpace: 'nowrap' }}>{eur(m.debe)}</td>
                    <td style={{ padding: '8px 6px', color: '#6b7280', fontSize: '13px', maxWidth: '340px' }}>{m.detalle}</td>
                    <td style={{ padding: '8px 6px', fontSize: '13px' }}>
                      {m.telefono && <div>📞 {m.telefono}</div>}
                      {m.email && <div>✉️ {m.email}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function PaginaMorosos() {
  return (
    <Shell activo="morosos">
      <Morosos />
    </Shell>
  );
}
