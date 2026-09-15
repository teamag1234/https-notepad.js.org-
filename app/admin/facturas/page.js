'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shell, useAdmin, eur } from '../ui.js';

const inputStyle = { padding: '9px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', width: '100%', boxSizing: 'border-box' };
const label = { fontSize: '12px', color: '#6b7280' };
const campo = (flex = '1 1 160px') => ({ display: 'flex', flexDirection: 'column', gap: '4px', flex });

const FORM_VACIO = { fecha: new Date().toISOString().slice(0, 10), alumno: '', dni: '', direccion: '', email: '', concepto: '', cantidad: 1, importe: '', referencia: null, pagada: true };

function Facturas() {
  const { apiFetch, clave } = useAdmin();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [form, setForm] = useState(null); // null = formulario cerrado
  const [busqueda, setBusqueda] = useState('');
  const [buscandoContacto, setBuscandoContacto] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(() => {
    apiFetch('/api/admin/facturas').then(setDatos).catch((e) => setError(e.message));
  }, [apiFetch]);

  useEffect(() => { if (clave) cargar(); }, [clave, cargar]);

  // Prepara el formulario desde un cobro, autocompletando desde Kajabi
  const facturarCobro = async (c) => {
    setForm({ ...FORM_VACIO, fecha: c.fecha, alumno: c.contacto || '', email: c.email || '', concepto: c.concepto, importe: c.importe, referencia: c.referencia });
    setAviso('');
    if (c.email) {
      setBuscandoContacto(true);
      try {
        const contacto = await apiFetch(`/api/admin/facturas?contacto=${encodeURIComponent(c.email)}`);
        if (contacto) {
          setForm((f) => ({
            ...f,
            alumno: f.alumno || contacto.nombre || '',
            dni: contacto.dni || '',
            direccion: contacto.direccion || '',
          }));
        }
      } catch {}
      setBuscandoContacto(false);
    }
  };

  const guardar = async (enviar) => {
    setTrabajando(true);
    setError('');
    try {
      const r = await apiFetch('/api/admin/facturas', {
        method: 'POST',
        body: JSON.stringify({ accion: enviar ? 'crear-y-enviar' : 'crear', ...form, importe: Number(form.importe) }),
      });
      setAviso(enviar ? `✅ Factura ${r.numero} enviada a ${r.enviadaA}` : `✅ Factura ${r.numero} guardada como borrador`);
      setForm(null);
      cargar();
    } catch (e) { setError(e.message); }
    setTrabajando(false);
  };

  const accion = async (cuerpo, mensaje) => {
    setTrabajando(true);
    setError('');
    try {
      const r = await apiFetch('/api/admin/facturas', { method: 'POST', body: JSON.stringify(cuerpo) });
      if (mensaje) setAviso(typeof mensaje === 'function' ? mensaje(r) : mensaje);
      cargar();
    } catch (e) { setError(e.message); }
    setTrabajando(false);
  };

  const verPdf = async (id) => {
    try {
      const key = localStorage.getItem('agAdminKey');
      const r = await fetch(`/api/admin/facturas?pdf=${id}`, { headers: { 'x-admin-key': key || '' } });
      if (!r.ok) throw new Error('No se pudo generar el PDF');
      const blob = await r.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (e) { setError(e.message); }
  };

  if (error && !datos) return <p style={{ backgroundColor: '#fee2e2', padding: '12px', borderRadius: '6px' }}>{error}</p>;
  if (!datos) return <p>Cargando…</p>;

  // Buscador: filtra por nombre, email, concepto o número de factura
  const normaliza = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = normaliza(busqueda.trim());
  const coincide = (...campos) => !q || campos.some((c) => normaliza(c).includes(q));
  const cobrosVisibles = datos.cobros.filter((c) => coincide(c.contacto, c.email, c.concepto));
  const facturasVisibles = datos.facturas.filter((f) => coincide(f.alumno, f.email, f.concepto, f.numero, f.dni));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h2 style={{ marginTop: 0 }}>🧾 Facturas</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="🔍 Buscar alumno, email, curso…"
                 style={{ padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', width: '240px' }} />
          {busqueda && <button onClick={() => setBusqueda('')} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer' }}>limpiar</button>}
          <button onClick={() => { setForm({ ...FORM_VACIO }); setAviso(''); }} style={{ padding: '8px 14px', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>+ Factura manual</button>
        </div>
      </div>
      <p style={{ color: '#6b7280', fontSize: '14px' }}>
        Elige un cobro, revisa los datos (se autocompletan desde Kajabi) y pulsa enviar: el alumno recibe el PDF con el diseño de AG Academy.
      </p>
      {aviso && <p style={{ backgroundColor: '#dcfce7', padding: '10px', borderRadius: '6px' }}>{aviso}</p>}
      {error && <p style={{ backgroundColor: '#fee2e2', padding: '10px', borderRadius: '6px' }}>{error}</p>}

      {/* FORMULARIO */}
      {form && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '20px', borderTop: '4px solid #2456A6' }}>
          <h3 style={{ marginTop: 0 }}>Nueva factura {buscandoContacto && <span style={{ fontSize: '13px', color: '#6b7280' }}>· buscando datos del alumno en Kajabi…</span>}</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <div style={campo('0 1 140px')}><label style={label}>Fecha</label><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={inputStyle} /></div>
            <div style={campo('2 1 220px')}><label style={label}>Alumno (nombre completo) *</label><input value={form.alumno} onChange={(e) => setForm({ ...form, alumno: e.target.value })} style={inputStyle} /></div>
            <div style={campo('0 1 140px')}><label style={label}>DNI / NIE</label><input value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} style={inputStyle} placeholder="12345678A" /></div>
            <div style={campo('1 1 220px')}><label style={label}>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <div style={campo('2 1 300px')}><label style={label}>Dirección</label><input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} style={inputStyle} placeholder="Calle, nº, CP, ciudad, provincia" /></div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <div style={campo('2 1 280px')}><label style={label}>Concepto *</label><input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} style={inputStyle} /></div>
            <div style={campo('0 1 90px')}><label style={label}>Cantidad</label><input type="number" min="1" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })} style={inputStyle} /></div>
            <div style={campo('0 1 130px')}><label style={label}>Importe total (€) *</label><input type="number" step="0.01" value={form.importe} onChange={(e) => setForm({ ...form, importe: e.target.value })} style={inputStyle} /></div>
            <div style={campo('0 1 170px')}>
              <label style={label}>Estado del pago</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 0', fontSize: '14px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.pagada} onChange={(e) => setForm({ ...form, pagada: e.target.checked })} />
                <span style={{ color: form.pagada ? '#059669' : '#d97706', fontWeight: 'bold' }}>{form.pagada ? '✔ Pagada (sello PAGADA, sin IBAN)' : 'Pendiente (mostrará el IBAN)'}</span>
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => guardar(true)} disabled={trabajando || !form.email} title={!form.email ? 'Sin email no se puede enviar' : ''}
                    style={{ padding: '10px 20px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
              {trabajando ? 'Enviando…' : '📤 Guardar y ENVIAR al alumno'}
            </button>
            <button onClick={() => guardar(false)} disabled={trabajando} style={{ padding: '10px 20px', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Guardar borrador</button>
            <button onClick={() => setForm(null)} style={{ padding: '10px 16px', border: '1px solid #d1d5db', background: 'white', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* COBROS SIN FACTURA */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0 }}>💰 Cobros sin factura <span style={{ color: '#9ca3af', fontSize: '13px' }}>(últimos 90 días · {cobrosVisibles.length}{q ? ` de ${datos.cobros.length}` : ''})</span></h3>
        {datos.cobros.length === 0 && <p style={{ color: '#9ca3af' }}>Todos los cobros recientes tienen factura.</p>}
        {datos.cobros.length > 0 && cobrosVisibles.length === 0 && <p style={{ color: '#9ca3af' }}>Ningún cobro coincide con «{busqueda}».</p>}
        <div style={{ overflowX: 'auto', maxHeight: '340px', overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
            <tbody>
              {cobrosVisibles.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '7px 6px', whiteSpace: 'nowrap' }}>{c.fecha}</td>
                  <td style={{ padding: '7px 6px' }}>{c.contacto || <span style={{ color: '#9ca3af' }}>sin nombre</span>}</td>
                  <td style={{ padding: '7px 6px', color: '#6b7280', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.concepto}>{c.concepto}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{eur(c.importe)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right' }}>
                    <button onClick={() => facturarCobro(c)} style={{ padding: '5px 12px', backgroundColor: '#2456A6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>🧾 Facturar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FACTURAS EMITIDAS */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h3 style={{ marginTop: 0 }}>📚 Facturas emitidas <span style={{ color: '#9ca3af', fontSize: '13px' }}>({facturasVisibles.length}{q ? ` de ${datos.facturas.length}` : ''})</span></h3>
        {datos.facturas.length === 0 && <p style={{ color: '#9ca3af' }}>Todavía no hay facturas. Genera la primera desde un cobro de arriba.</p>}
        {datos.facturas.length > 0 && facturasVisibles.length === 0 && <p style={{ color: '#9ca3af' }}>Ninguna factura coincide con «{busqueda}».</p>}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: '12px' }}>
                <th style={{ padding: '8px 6px' }}>Número</th><th style={{ padding: '8px 6px' }}>Fecha</th>
                <th style={{ padding: '8px 6px' }}>Alumno</th><th style={{ padding: '8px 6px', textAlign: 'right' }}>Importe</th>
                <th style={{ padding: '8px 6px' }}>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {facturasVisibles.map((f) => (
                <tr key={f.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 6px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{f.numero}</td>
                  <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{f.fecha}</td>
                  <td style={{ padding: '8px 6px' }}>{f.alumno}<div style={{ fontSize: '11px', color: '#9ca3af' }}>{f.email}</div></td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{eur(f.importe)}
                    <div style={{ fontSize: '10px', fontWeight: 'bold', color: f.pagada ? '#059669' : '#d97706' }}>{f.pagada ? 'PAGADA' : 'PTE. PAGO'}</div>
                  </td>
                  <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                    {f.estado === 'ENVIADA'
                      ? <span style={{ fontSize: '12px', color: '#059669', fontWeight: 'bold' }}>📤 enviada {f.enviada}</span>
                      : <span style={{ fontSize: '12px', color: '#d97706', fontWeight: 'bold' }}>📝 borrador</span>}
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => verPdf(f.id)} style={{ padding: '4px 10px', border: '1px solid #d1d5db', background: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', marginRight: '6px' }}>👁 PDF</button>
                    {f.email && <button onClick={() => accion({ accion: 'enviar', id: f.id }, (r) => `✅ Factura ${r.numero} enviada a ${r.enviadaA}`)} disabled={trabajando}
                            style={{ padding: '4px 10px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', marginRight: '6px' }}>
                      {f.estado === 'ENVIADA' ? 'Reenviar' : 'Enviar'}
                    </button>}
                    {f.estado === 'BORRADOR' && <button onClick={() => accion({ accion: 'borrar', id: f.id }, '🗑️ Borrador eliminado')} style={{ padding: '4px 8px', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}>🗑️</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function PaginaFacturas() {
  return (
    <Shell activo="facturas">
      <Facturas />
    </Shell>
  );
}
