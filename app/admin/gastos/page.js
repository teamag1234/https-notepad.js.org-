'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { Shell, useAdmin, eur } from '../ui.js';

const CATEGORIAS = [
  'Nóminas', 'Seguridad Social', 'Impuestos', 'Publicidad / Ads', 'Software y herramientas',
  'Afiliados y comisiones', 'Pasarela de pago', 'Formación', 'Equipo / Material', 'Gastos Jesu',
  'Devolución de cursos', 'Otros gastos', 'Sin clasificar',
];

const hoy = () => new Date().toISOString().slice(0, 10);

function Gastos() {
  const { apiFetch, clave } = useAdmin();
  const [gastos, setGastos] = useState(null);
  const [filtro, setFiltro] = useState('todos');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ concepto: '', categoria: CATEGORIAS[0], importe: '', fecha: hoy(), contacto: '' });
  const [guardando, setGuardando] = useState(false);
  const [subiendoDoc, setSubiendoDoc] = useState(null); // id del gasto en subida
  const [mesAsesoria, setMesAsesoria] = useState(new Date().toISOString().slice(0, 7));
  const [emailAsesoria, setEmailAsesoria] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    if (clave) apiFetch('/api/admin/asesoria').then((d) => setEmailAsesoria(d.email || '')).catch(() => {});
  }, [clave, apiFetch]);

  // Adjuntar la factura de compra a un gasto (subida directa al Blob privado)
  const adjuntar = async (gasto, archivo) => {
    if (!archivo) return;
    setSubiendoDoc(gasto.id);
    setError('');
    try {
      const { uploadPresigned } = await import('@vercel/blob/client');
      const key = localStorage.getItem('agAdminKey');
      const limpio = archivo.name.replace(/[^\w.\- ]+/g, '_');
      const blob = await uploadPresigned(`gastos/${gasto.id}/${Date.now()}-${limpio}`, archivo, {
        access: 'private',
        handleUploadUrl: '/api/admin/adjuntos',
        headers: { 'x-admin-key': key || '' },
        multipart: archivo.size > 8 * 1024 * 1024,
      });
      await apiFetch('/api/admin/movimientos', {
        method: 'PATCH',
        body: JSON.stringify({ id: gasto.id, adjunto: { url: blob.url, nombre: archivo.name } }),
      });
      setAviso(`📎 Factura adjuntada a «${(gasto.concepto || '').substring(0, 40)}»`);
      cargar();
    } catch (e) { setError(e.message); }
    setSubiendoDoc(null);
  };

  const verDoc = async (id) => {
    try {
      const key = localStorage.getItem('agAdminKey');
      const r = await fetch(`/api/admin/adjuntos?id=${id}`, { headers: { 'x-admin-key': key || '' } });
      if (!r.ok) throw new Error('No se pudo abrir el documento');
      window.open(URL.createObjectURL(await r.blob()), '_blank');
    } catch (e) { setError(e.message); }
  };

  const quitarDoc = async (id) => {
    if (!confirm('¿Quitar el documento de este gasto?')) return;
    try {
      await apiFetch('/api/admin/movimientos', { method: 'PATCH', body: JSON.stringify({ id, adjunto: null }) });
      cargar();
    } catch (e) { setError(e.message); }
  };

  const enviarAsesoria = async () => {
    const destino = prompt('Email de la asesoría:', emailAsesoria || '');
    if (!destino) return;
    setGuardando(true);
    setError('');
    setAviso('');
    try {
      const r = await apiFetch('/api/admin/asesoria', {
        method: 'POST',
        body: JSON.stringify({ mes: mesAsesoria, email: destino }),
      });
      setEmailAsesoria(destino);
      setAviso(`📤 Contabilidad de ${mesAsesoria} enviada a ${r.enviadoA}: ${r.movimientos} movimientos, ${r.gastosConDoc} facturas adjuntas (ZIP de ${r.tamanoZipMB} MB)${r.gastosSinDoc ? ` · ⚠️ ${r.gastosSinDoc} gastos sin factura` : ''}.`);
    } catch (e) { setError(e.message); }
    setGuardando(false);
  };

  const cargar = useCallback(() => {
    apiFetch('/api/admin/movimientos?tipo=GASTO&limite=500').then(setGastos).catch((e) => setError(e.message));
  }, [apiFetch]);

  useEffect(() => {
    if (!clave) return;
    cargar();
    if (new URLSearchParams(window.location.search).get('filtro') === 'sin') setFiltro('sin');
  }, [clave, cargar]);

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await apiFetch('/api/admin/movimientos', {
        method: 'POST',
        body: JSON.stringify({ ...form, tipo: 'GASTO', importe: Number(String(form.importe).replace(',', '.')) }),
      });
      setForm({ concepto: '', categoria: form.categoria, importe: '', fecha: form.fecha, contacto: '' });
      cargar();
    } catch (err) { setError(err.message); }
    setGuardando(false);
  };

  const reclasificar = async (id, categoria) => {
    setError('');
    try {
      setGastos((gs) => gs.map((g) => (g.id === id ? { ...g, categoria } : g)));
      await apiFetch('/api/admin/movimientos', { method: 'PATCH', body: JSON.stringify({ id, categoria }) });
    } catch (err) {
      setError(err.message);
      cargar();
    }
  };

  const limpiarDuplicados = async () => {
    if (!confirm('Buscará movimientos del banco repetidos (mismo día, importe y concepto) y eliminará las copias dejando solo uno. ¿Continuar?')) return;
    setGuardando(true);
    setError('');
    try {
      const r = await apiFetch('/api/admin/limpiar-duplicados', { method: 'POST' });
      let msg = `🧹 ${r.eliminados.length} duplicados eliminados.`;
      if (r.eliminados.length) msg += ' ' + r.eliminados.slice(0, 5).map((e) => `${e.concepto?.substring(0, 30)} (${e.fecha})`).join('; ') + (r.eliminados.length > 5 ? '…' : '');
      if (r.sospechosos.length) msg += ` ⚠️ Quedan ${r.sospechosos.length} posibles duplicados con concepto distinto — revísalos en la lista.`;
      alert(msg);
      cargar();
    } catch (err) { setError(err.message); }
    setGuardando(false);
  };

  const borrar = async (id) => {
    if (!confirm('¿Borrar este gasto?')) return;
    try {
      await apiFetch(`/api/admin/movimientos?id=${id}`, { method: 'DELETE' });
      cargar();
    } catch (err) { setError(err.message); }
  };

  const inputStyle = { padding: '9px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' };
  const numSin = (gastos || []).filter((g) => g.categoria === 'Sin clasificar').length;
  const visibles = (gastos || []).filter((g) => (filtro === 'sin' ? g.categoria === 'Sin clasificar' : true));
  const chip = (activo) => ({
    padding: '7px 14px', borderRadius: '999px', border: '1px solid #d1d5db', cursor: 'pointer', fontSize: '13px',
    backgroundColor: activo ? '#111827' : 'white', color: activo ? 'white' : '#374151', fontWeight: activo ? 'bold' : 'normal',
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
        <h2 style={{ margin: 0 }}>Gastos</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="month" value={mesAsesoria} onChange={(e) => setMesAsesoria(e.target.value)} style={{ padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }} />
          <button onClick={enviarAsesoria} disabled={guardando} style={{ padding: '8px 14px', backgroundColor: '#2456A6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
            {guardando ? 'Preparando…' : '📤 Enviar mes a la asesoría'}
          </button>
        </div>
      </div>
      <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 12px' }}>
        Adjunta a cada gasto su factura de compra con el clip 📎 — el botón de arriba envía a la asesoría el CSV del mes con todas las facturas en un ZIP.
      </p>
      {aviso && <p style={{ backgroundColor: '#dcfce7', padding: '10px', borderRadius: '6px' }}>{aviso}</p>}
      {error && <p style={{ backgroundColor: '#fee2e2', padding: '10px', borderRadius: '6px' }}>{error}</p>}

      <form onSubmit={guardar} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '18px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '2 1 200px' }}>
          <label style={{ fontSize: '12px', color: '#6b7280' }}>Concepto *</label>
          <input required value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} style={inputStyle} placeholder="Ej: Nómina agosto Vilma" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 160px' }}>
          <label style={{ fontSize: '12px', color: '#6b7280' }}>Categoría</label>
          <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} style={inputStyle}>
            {CATEGORIAS.filter((c) => c !== 'Sin clasificar').map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '0 1 110px' }}>
          <label style={{ fontSize: '12px', color: '#6b7280' }}>Importe € *</label>
          <input required value={form.importe} onChange={(e) => setForm({ ...form, importe: e.target.value })} style={inputStyle} placeholder="0,00" inputMode="decimal" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '0 1 150px' }}>
          <label style={{ fontSize: '12px', color: '#6b7280' }}>Fecha *</label>
          <input required type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 150px' }}>
          <label style={{ fontSize: '12px', color: '#6b7280' }}>Proveedor / persona</label>
          <input value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} style={inputStyle} />
        </div>
        <button type="submit" disabled={guardando} style={{ padding: '10px 20px', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
          {guardando ? 'Guardando…' : '+ Añadir gasto'}
        </button>
      </form>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button style={chip(filtro === 'todos')} onClick={() => setFiltro('todos')}>Todos ({(gastos || []).length})</button>
        <button style={chip(filtro === 'sin')} onClick={() => setFiltro('sin')}>⚠️ Sin clasificar ({numSin})</button>
        <button style={{ ...chip(false), marginLeft: 'auto' }} onClick={limpiarDuplicados} disabled={guardando}>🧹 Quitar duplicados del banco</button>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        {!gastos && <p>Cargando…</p>}
        {gastos && visibles.length === 0 && (
          <p style={{ color: '#9ca3af' }}>{filtro === 'sin' ? '🎉 No queda nada sin clasificar.' : 'Todavía no hay gastos registrados.'}</p>
        )}
        {gastos && visibles.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: '12px' }}>
                  <th style={{ padding: '8px 6px' }}>Fecha</th>
                  <th style={{ padding: '8px 6px' }}>Concepto</th>
                  <th style={{ padding: '8px 6px' }}>Categoría (clic para cambiar)</th>
                  <th style={{ padding: '8px 6px' }}>Origen</th>
                  <th style={{ padding: '8px 6px' }}>📎 Factura</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Importe</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibles.map((g) => (
                  <tr key={g.id} style={{ borderTop: '1px solid #f3f4f6', backgroundColor: g.categoria === 'Sin clasificar' ? '#fffbeb' : 'transparent' }}>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{g.fecha}</td>
                    <td style={{ padding: '8px 6px', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.concepto}>{g.concepto}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <select
                        value={g.categoria}
                        onChange={(e) => reclasificar(g.id, e.target.value)}
                        style={{ padding: '6px 8px', border: `1px solid ${g.categoria === 'Sin clasificar' ? '#d97706' : '#d1d5db'}`, borderRadius: '6px', fontSize: '13px', backgroundColor: 'white', cursor: 'pointer' }}
                      >
                        {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px 6px', color: '#9ca3af', fontSize: '12px' }}>{g.fuente === 'BANCO' ? '🏦 Banco' : g.fuente === 'KAJABI' ? 'Kajabi' : '✍️ Manual'}</td>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      {subiendoDoc === g.id ? (
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>Subiendo…</span>
                      ) : g.tiene_doc ? (
                        <>
                          <button onClick={() => verDoc(g.id)} title={g.doc_nombre || 'Ver documento'} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '15px' }}>📄</button>
                          <button onClick={() => quitarDoc(g.id)} title="Quitar documento" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '11px' }}>✕</button>
                        </>
                      ) : (
                        <label title="Adjuntar factura" style={{ cursor: 'pointer', fontSize: '15px', opacity: 0.55 }}>📎
                          <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={(e) => { adjuntar(g, e.target.files[0]); e.target.value = ''; }} />
                        </label>
                      )}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626', whiteSpace: 'nowrap' }}>{eur(g.importe)}</td>
                    <td style={{ padding: '8px 6px' }}>
                      {g.fuente === 'MANUAL' && (
                        <button onClick={() => borrar(g.id)} title="Borrar" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}>🗑️</button>
                      )}
                    </td>
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

export default function PaginaGastos() {
  return (
    <Shell activo="gastos">
      <Suspense>
        <Gastos />
      </Suspense>
    </Shell>
  );
}
