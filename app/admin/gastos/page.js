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
      <h2 style={{ marginTop: 0 }}>Gastos</h2>
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
