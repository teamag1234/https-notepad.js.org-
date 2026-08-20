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

  const [conciliacion, setConciliacion] = useState(null);

  const cargar = useCallback(() => {
    apiFetch('/api/admin/recordatorios').then(setDatos).catch((e) => setError(e.message));
    apiFetch('/api/admin/conciliacion').then(setConciliacion).catch(() => {});
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

  const enviarUno = async (m) => {
    const previo = m.envio ? `\n(Ya se le envió el ${new Date(m.envio.ultimo).toLocaleDateString('es-ES')} — esto le enviará otro)` : '';
    if (!confirm(`¿Enviar AHORA el recordatorio de ${eur(m.debe)} a ${m.nombre} <${m.email}>?${previo}\n\nDespués recibirá seguimiento automático (cada 2 días, y diario si sigue sin pagar) hasta que llegue su pago.`)) return;
    setTrabajando(true);
    setError('');
    try {
      const r = await apiFetch('/api/admin/recordatorios', { method: 'POST', body: JSON.stringify({ accion: 'enviar-uno', id: m.id }) });
      setAviso(`✅ Recordatorio enviado a ${r.enviado} <${r.email}>. Seguimiento automático activado hasta que pague.`);
      cargar();
    } catch (e) { setError(e.message); }
    setTrabajando(false);
  };

  const comprobarPagos = async () => {
    setTrabajando(true);
    setError('');
    try {
      const r = await apiFetch('/api/admin/conciliacion', { method: 'POST' });
      setAviso(`✅ Comprobación hecha: ${r.conciliados} pagos conciliados (marcados como pagados en Airtable) y ${r.paraRevisar} para revisar.`);
      cargar();
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

      {/* Cómo funciona */}
      <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '14px 18px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '22px' }}>👆</span>
        <div style={{ flex: 1, minWidth: '260px' }}>
          <strong>Revisión uno a uno</strong>
          <div style={{ fontSize: '13px', color: '#374151' }}>
            Revisa cada email con "👁 Ver email" y dispara el primero con <strong>"📤 Enviar email"</strong>.
            A partir de ahí, ese alumno recibe recordatorios automáticos: <strong>cada 2 días</strong> los primeros,
            y <strong>cada día</strong> si sigue sin pagar — hasta que su transferencia aparezca en el banco
            (entonces se marca pagado y se corta solo). Los alumnos a los que no envíes nada, no reciben nada.
          </div>
        </div>
        <button onClick={prueba} disabled={trabajando} style={boton('#2563eb')}>📧 Enviarme una prueba</button>
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
                <th style={{ padding: '8px 6px' }}>Seguimiento</th>
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
                    <td style={{ padding: '8px 6px', fontSize: '12px' }}>
                      {m.envio ? (
                        <span style={{ color: '#059669' }}>🟢 activo · {m.envio.enviados} enviado{m.envio.enviados > 1 ? 's' : ''}, último {new Date(m.envio.ultimo).toLocaleDateString('es-ES')}</span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>— sin enviar</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => setAbierto(abierto === m.id ? null : m.id)} style={{ border: '1px solid #d1d5db', background: 'white', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px', marginRight: '6px' }}>
                        {abierto === m.id ? 'Cerrar' : '👁 Ver email'}
                      </button>
                      <button onClick={() => enviarUno(m)} disabled={trabajando} style={{ border: 'none', backgroundColor: m.envio ? '#6b7280' : '#059669', color: 'white', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', opacity: trabajando ? 0.5 : 1 }}>
                        📤 {m.envio ? 'Reenviar' : 'Enviar email'}
                      </button>
                    </td>
                  </tr>
                  {abierto === m.id && (
                    <tr key={`${m.id}-preview`}>
                      <td colSpan={5} style={{ padding: '10px', backgroundColor: '#f9fafb' }}>
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

      {/* Conciliación automática de pagos recibidos */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ margin: 0 }}>🔄 Pagos recibidos (conciliación automática)</h3>
          <button onClick={comprobarPagos} disabled={trabajando} style={boton('#059669')}>Comprobar ahora</button>
        </div>
        <p style={{ fontSize: '13px', color: '#6b7280' }}>
          Cada mañana, tras leer el banco, la app busca transferencias cuyo concepto contenga el nombre del alumno moroso.
          Si el importe coincide con su deuda: se marcan sus meses como CERRADO en Airtable, deja de ser moroso y
          se le desactivan los recordatorios — todo solo. Si el nombre cuadra pero el importe no, aparece aquí para que lo revises.
        </p>
        {conciliacion && conciliacion.paraRevisar.length > 0 && (
          <div style={{ backgroundColor: '#fef3c7', borderRadius: '8px', padding: '12px 16px', marginBottom: '10px' }}>
            <strong>⚠️ Para revisar (nombre cuadra, importe no):</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: '20px', fontSize: '14px' }}>
              {conciliacion.paraRevisar.map((c) => (
                <li key={c.id}>{c.fecha_pago}: transferencia de {eur(c.importe)} — parece de <strong>{c.nombre}</strong></li>
              ))}
            </ul>
          </div>
        )}
        {conciliacion && conciliacion.conciliados.length > 0 ? (
          <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
            <tbody>
              {conciliacion.conciliados.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 6px', whiteSpace: 'nowrap', color: '#6b7280' }}>{c.fecha_pago}</td>
                  <td style={{ padding: '8px 6px' }}>✅ <strong>{c.nombre}</strong> pagó por transferencia — marcado como pagado en Airtable y fuera de morosos</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 'bold', color: '#059669', whiteSpace: 'nowrap' }}>{eur(c.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          conciliacion && conciliacion.paraRevisar.length === 0 && (
            <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>Todavía no se ha detectado ningún pago de morosos en el banco.</p>
          )
        )}
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
