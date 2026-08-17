'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shell, Card, useAdmin, eur } from '../ui.js';

function Pagos() {
  const { apiFetch, clave } = useAdmin();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [abierto, setAbierto] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(() => {
    apiFetch('/api/admin/recordatorios').then(setDatos).catch((e) => setError(e.message));
  }, [apiFetch]);

  useEffect(() => { if (clave) cargar(); }, [clave, cargar]);

  const prueba = async () => {
    setTrabajando(true);
    setError('');
    try {
      const r = await apiFetch('/api/admin/recordatorios', { method: 'POST', body: JSON.stringify({ accion: 'prueba' }) });
      setAviso(`✅ Prueba enviada a ${r.enviadoA} (ejemplo con los datos de ${r.ejemploDe}). Ningún alumno ha recibido nada.`);
    } catch (e) { setError(e.message); }
    setTrabajando(false);
  };

  const enviarTodos = async () => {
    if (!confirm(`¿Enviar el recordatorio de pago a ${datos.conEmail.length} alumnos morosos AHORA?`)) return;
    setTrabajando(true);
    setError('');
    try {
      const r = await apiFetch('/api/admin/recordatorios', { method: 'POST', body: JSON.stringify({ accion: 'enviar-todos' }) });
      setAviso(`✅ Enviados ${r.enviados} recordatorios (${r.omitidos} omitidos por haberse avisado hace menos de 7 días).`);
    } catch (e) { setError(e.message); }
    setTrabajando(false);
  };

  const boton = (bg) => ({ padding: '10px 18px', backgroundColor: bg, color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', opacity: trabajando ? 0.5 : 1 });

  if (error && !datos) return <p style={{ backgroundColor: '#fee2e2', padding: '12px', borderRadius: '6px' }}>{error}</p>;
  if (!datos) return <p>Cargando…</p>;

  const totalAvisar = datos.conEmail.reduce((s, m) => s + m.debe, 0);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Recordatorios de pago</h2>
      {aviso && <p style={{ backgroundColor: '#dcfce7', padding: '12px', borderRadius: '6px' }}>{aviso}</p>}
      {error && <p style={{ backgroundColor: '#fee2e2', padding: '12px', borderRadius: '6px' }}>{error}</p>}

      {/* Estado del sistema */}
      <div style={{ backgroundColor: datos.activos ? '#dcfce7' : '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 18px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '22px' }}>{datos.activos ? '🟢' : '🔒'}</span>
        <div style={{ flex: 1, minWidth: '260px' }}>
          <strong>{datos.activos ? 'Envíos automáticos ACTIVADOS' : 'Envíos DESACTIVADOS — modo revisión'}</strong>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            {datos.activos
              ? 'Cada lunes a las 9:00 se envía el recordatorio a los morosos (máximo uno por semana a cada alumno).'
              : 'Nadie recibirá ningún email. Para activar los envíos: en Vercel añade la variable RECORDATORIOS_ACTIVOS con valor "si" y haz Redeploy.'}
          </div>
        </div>
        <button onClick={prueba} disabled={trabajando} style={boton('#2563eb')}>📧 Enviarme una prueba</button>
        {datos.activos && (
          <button onClick={enviarTodos} disabled={trabajando} style={boton('#dc2626')}>🚀 Enviar a todos ahora</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <Card titulo="Alumnos que recibirán aviso" valor={datos.conEmail.length} pie={`Reclamando ${eur(totalAvisar)}`} />
        <Card titulo="Cuenta de cobro (en el email)" valor={datos.iban.replace(/(.{4})/g, '$1 ').trim().substring(0, 14) + '…'} pie="Concepto: nombre completo del alumno" />
        <Card titulo="Sin email (no se les puede avisar)" valor={datos.sinEmail.length} color="#d97706" />
      </div>

      {/* Lista con previsualización */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '18px' }}>
        <h3 style={{ marginTop: 0 }}>Emails preparados <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: 'normal' }}>(haz clic en "Ver email" para revisar cada uno)</span></h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: '12px' }}>
                <th style={{ padding: '8px 6px' }}>Alumno</th>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Debe</th>
                <th style={{ padding: '8px 6px' }}>Email</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {datos.conEmail.map((m) => (
                <>
                  <tr key={m.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 6px', fontWeight: 'bold' }}>{m.nombre}<div style={{ fontWeight: 'normal', fontSize: '12px', color: '#9ca3af' }}>{m.curso}</div></td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626', whiteSpace: 'nowrap' }}>{eur(m.debe)}</td>
                    <td style={{ padding: '8px 6px', fontSize: '13px' }}>{m.email}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <button onClick={() => setAbierto(abierto === m.id ? null : m.id)} style={{ border: '1px solid #d1d5db', background: 'white', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px' }}>
                        {abierto === m.id ? 'Cerrar' : '👁 Ver email'}
                      </button>
                    </td>
                  </tr>
                  {abierto === m.id && (
                    <tr key={`${m.id}-preview`}>
                      <td colSpan={4} style={{ padding: '10px', backgroundColor: '#f9fafb' }}>
                        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}><strong>Asunto:</strong> {m.preview.asunto}</div>
                        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', backgroundColor: 'white' }}
                             dangerouslySetInnerHTML={{ __html: m.preview.html }} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {datos.sinEmail.length > 0 && (
        <div style={{ backgroundColor: '#fef3c7', borderRadius: '10px', padding: '16px 18px' }}>
          <strong>⚠️ Sin email — hay que contactarlos por teléfono/WhatsApp:</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
            {datos.sinEmail.map((m) => (
              <li key={m.id}>{m.nombre} — {eur(m.debe)}{m.telefono ? ` — 📞 ${m.telefono}` : ' (tampoco hay teléfono en Airtable)'}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function PaginaPagos() {
  return (
    <Shell activo="pagos">
      <Pagos />
    </Shell>
  );
}
