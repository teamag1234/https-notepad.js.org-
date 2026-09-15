'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shell, useAdmin, eur } from '../ui.js';

const inputStyle = { padding: '9px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', width: '100%', boxSizing: 'border-box' };
const label = { fontSize: '12px', color: '#6b7280' };
const campo = (flex = '1 1 160px') => ({ display: 'flex', flexDirection: 'column', gap: '4px', flex });

function Bajas() {
  const { apiFetch, clave, rol } = useAdmin();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(() => {
    apiFetch('/api/admin/bajas').then(setDatos).catch((e) => setError(e.message));
  }, [apiFetch]);

  useEffect(() => { if (clave) cargar(); }, [clave, cargar]);

  const iniciarDesdeCobro = (c) => {
    setAviso('');
    setForm({
      alumno: c.contacto || '', email: c.email || '', concepto: c.concepto || '',
      tipo: 'BAJA', importe: c.importe, fechaCompra: c.fecha, referencia: c.referencia,
      iban: '', titular: '', dniTitular: '', dias: c.dias,
    });
  };

  const enviar = async () => {
    setTrabajando(true);
    setError('');
    try {
      const r = await apiFetch('/api/admin/bajas', {
        method: 'POST',
        body: JSON.stringify({ accion: 'iniciar', ...form, importe: Number(form.importe) || null }),
      });
      setAviso(r.estado === 'PENDIENTE_TRANSFERENCIA'
        ? '✅ Baja tramitada: marcada en Airtable y pendiente de transferencia.'
        : `✅ Formulario enviado a ${form.email} — cuando el alumno lo rellene, pasará a pendiente de transferencia.`);
      setForm(null);
      cargar();
    } catch (e) { setError(e.message); }
    setTrabajando(false);
  };

  const accion = async (cuerpo, mensaje) => {
    setTrabajando(true);
    setError('');
    try {
      await apiFetch('/api/admin/bajas', { method: 'POST', body: JSON.stringify(cuerpo) });
      if (mensaje) setAviso(mensaje);
      cargar();
    } catch (e) { setError(e.message); }
    setTrabajando(false);
  };

  if (error && !datos) return <p style={{ backgroundColor: '#fee2e2', padding: '12px', borderRadius: '6px' }}>{error}</p>;
  if (!datos) return <p>Cargando…</p>;

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(busqueda.trim());
  const coincide = (...cs) => !q || cs.some((c) => norm(c).includes(q));
  const cobros = datos.cobros.filter((c) => coincide(c.contacto, c.email, c.concepto));

  const esperando = datos.bajas.filter((b) => b.estado === 'ESPERANDO_ALUMNO');
  const pendientes = datos.bajas.filter((b) => b.estado === 'PENDIENTE_TRANSFERENCIA');
  const hechas = datos.bajas.filter((b) => b.estado === 'TRANSFERIDA');
  const esAdmin = rol !== 'facturas';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'baseline', gap: '10px' }}>
        <h2 style={{ marginTop: 0 }}>🚪 Bajas y devoluciones</h2>
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="🔍 Buscar alumno…"
               style={{ padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', width: '220px' }} />
      </div>
      <p style={{ color: '#6b7280', fontSize: '14px' }}>
        Busca el cobro del alumno y pulsa «Dar de baja»: si tienes su IBAN se tramita al momento; si no, le llega un formulario por email y no hay que hacer nada más.
      </p>
      {aviso && <p style={{ backgroundColor: '#dcfce7', padding: '10px', borderRadius: '6px' }}>{aviso}</p>}
      {error && <p style={{ backgroundColor: '#fee2e2', padding: '10px', borderRadius: '6px' }}>{error}</p>}

      {/* FORMULARIO DE INICIO */}
      {form && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '20px', borderTop: '4px solid #dc2626' }}>
          <h3 style={{ marginTop: 0 }}>Tramitar baja o devolución
            {form.dias != null && <span style={{ fontSize: '13px', fontWeight: 'normal', color: form.dias <= 15 ? '#059669' : '#dc2626' }}> · compra hace {form.dias} días {form.dias <= 15 ? '(dentro de los 15 de prueba)' : '(FUERA de los 15 de prueba)'}</span>}
          </h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <div style={campo('2 1 220px')}><label style={label}>Alumno *</label><input value={form.alumno} onChange={(e) => setForm({ ...form, alumno: e.target.value })} style={inputStyle} /></div>
            <div style={campo('1 1 200px')}><label style={label}>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} /></div>
            <div style={campo('0 1 150px')}>
              <label style={label}>Tipo</label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={inputStyle}>
                <option value="BAJA">Baja total del curso</option>
                <option value="DEVOLUCION">Devolución de una compra</option>
              </select>
            </div>
            <div style={campo('0 1 130px')}><label style={label}>Importe a devolver (€)</label><input type="number" step="0.01" value={form.importe} onChange={(e) => setForm({ ...form, importe: e.target.value })} style={inputStyle} /></div>
          </div>
          <div style={campo('1 1 auto')}><label style={label}>Curso / compra</label><input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} style={inputStyle} /></div>

          <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '12px', margin: '14px 0' }}>
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#6b7280' }}>
              <strong>¿Tienes ya el IBAN del alumno?</strong> Rellénalo y se tramita al momento. Si lo dejas vacío, el alumno recibirá un formulario por email para ponerlo él.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={campo('2 1 240px')}><label style={label}>IBAN (opcional)</label><input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} style={inputStyle} placeholder="ES00 0000 0000 0000 0000 0000" /></div>
              <div style={campo('1 1 200px')}><label style={label}>Titular</label><input value={form.titular} onChange={(e) => setForm({ ...form, titular: e.target.value })} style={inputStyle} /></div>
              <div style={campo('0 1 140px')}><label style={label}>DNI titular</label><input value={form.dniTitular} onChange={(e) => setForm({ ...form, dniTitular: e.target.value })} style={inputStyle} /></div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={enviar} disabled={trabajando} style={{ padding: '10px 20px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
              {trabajando ? 'Tramitando…' : form.iban ? '🚪 Tramitar baja AHORA' : '📧 Enviar formulario al alumno'}
            </button>
            <button onClick={() => setForm(null)} style={{ padding: '10px 16px', border: '1px solid #d1d5db', background: 'white', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* PENDIENTES DE TRANSFERENCIA */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '20px', borderLeft: '4px solid #dc2626' }}>
        <h3 style={{ marginTop: 0 }}>💸 Pendientes de transferencia <span style={{ color: '#9ca3af', fontSize: '13px' }}>({pendientes.length})</span></h3>
        {!pendientes.length && <p style={{ color: '#9ca3af' }}>No hay devoluciones pendientes. 🎉</p>}
        {pendientes.map((b) => (
          <div key={b.id} style={{ borderTop: '1px solid #f3f4f6', padding: '10px 0', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <div style={{ flex: '2 1 220px' }}>
              <strong>{b.alumno}</strong> <span style={{ fontSize: '12px', color: b.tipo === 'BAJA' ? '#dc2626' : '#d97706', fontWeight: 'bold' }}>{b.tipo === 'BAJA' ? '🚪 BAJA' : '↩️ DEVOLUCIÓN'}</span>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>{b.concepto || '—'} · solicitada {b.respondida || b.creada}</div>
            </div>
            <div style={{ flex: '1 1 120px', fontWeight: 'bold', fontSize: '17px' }}>{b.importe ? eur(b.importe) : '—'}</div>
            <div style={{ flex: '2 1 260px', fontSize: '13px' }}>
              <div style={{ fontFamily: 'monospace' }}>{b.iban} <button onClick={() => { navigator.clipboard?.writeText(b.iban || ''); setAviso('IBAN copiado 📋'); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>📋</button></div>
              <div style={{ color: '#6b7280' }}>{b.titular}{b.dni_titular ? ` · ${b.dni_titular}` : ''}</div>
            </div>
            {esAdmin && (
              <button onClick={() => accion({ accion: 'transferida', id: b.id }, `✅ Transferencia de ${b.alumno} marcada como hecha`)} disabled={trabajando}
                      style={{ padding: '8px 14px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                ✓ Transferencia hecha
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ESPERANDO AL ALUMNO */}
      {esperando.length > 0 && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0 }}>⏳ Esperando los datos del alumno <span style={{ color: '#9ca3af', fontSize: '13px' }}>({esperando.length})</span></h3>
          {esperando.map((b) => (
            <div key={b.id} style={{ borderTop: '1px solid #f3f4f6', padding: '8px 0', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', fontSize: '14px' }}>
              <div style={{ flex: '2 1 240px' }}><strong>{b.alumno}</strong> <span style={{ color: '#9ca3af', fontSize: '12px' }}>{b.email}</span>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{b.concepto || '—'} · formulario enviado {b.creada}</div>
              </div>
              <div>{b.importe ? eur(b.importe) : ''}</div>
              <button onClick={() => accion({ accion: 'reenviar-formulario', id: b.id }, `📧 Formulario reenviado a ${b.email}`)} style={{ padding: '5px 12px', border: '1px solid #d1d5db', background: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Reenviar email</button>
              <button onClick={() => accion({ accion: 'cancelar', id: b.id }, '🗑️ Solicitud cancelada')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}>🗑️</button>
            </div>
          ))}
        </div>
      )}

      {/* COBROS RECIENTES PARA INICIAR BAJA */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0 }}>🧑‍🎓 Cobros recientes <span style={{ color: '#9ca3af', fontSize: '13px' }}>(últimos 60 días · busca al alumno y dale a «Dar de baja»)</span></h3>
        <div style={{ overflowX: 'auto', maxHeight: '360px', overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
            <tbody>
              {cobros.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '7px 6px', whiteSpace: 'nowrap' }}>{c.fecha} <span style={{ fontSize: '11px', color: c.dias <= 15 ? '#059669' : '#9ca3af' }}>({c.dias}d)</span></td>
                  <td style={{ padding: '7px 6px' }}>{c.contacto || <span style={{ color: '#9ca3af' }}>sin nombre</span>}</td>
                  <td style={{ padding: '7px 6px', color: '#6b7280', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.concepto}>{c.concepto}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{eur(c.importe)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right' }}>
                    <button onClick={() => iniciarDesdeCobro(c)} style={{ padding: '5px 12px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>🚪 Dar de baja</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* HISTORIAL */}
      {hechas.length > 0 && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ marginTop: 0 }}>📚 Transferencias hechas <span style={{ color: '#9ca3af', fontSize: '13px' }}>({hechas.length})</span></h3>
          {hechas.map((b) => (
            <div key={b.id} style={{ borderTop: '1px solid #f3f4f6', padding: '7px 0', display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '13px', color: '#6b7280' }}>
              <span style={{ flex: '2 1 220px' }}><strong style={{ color: '#111827' }}>{b.alumno}</strong> · {b.tipo === 'BAJA' ? 'baja' : 'devolución'}</span>
              <span>{b.importe ? eur(b.importe) : '—'}</span>
              <span>✅ transferida {b.transferida}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PaginaBajas() {
  return (
    <Shell activo="bajas">
      <Bajas />
    </Shell>
  );
}
