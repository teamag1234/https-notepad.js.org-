'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shell, useAdmin, eur } from '../ui.js';

const CATEGORIAS = [
  'Nóminas', 'Seguridad Social', 'Impuestos', 'Publicidad / Ads', 'Software y herramientas',
  'Afiliados y comisiones', 'Pasarela de pago', 'Formación', 'Equipo / Material', 'Otros gastos',
];

const hoy = () => new Date().toISOString().slice(0, 10);

function Gastos() {
  const { apiFetch, clave } = useAdmin();
  const [gastos, setGastos] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ concepto: '', categoria: CATEGORIAS[0], importe: '', fecha: hoy(), contacto: '', notas: '' });
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    apiFetch('/api/admin/movimientos?tipo=GASTO&limite=300').then(setGastos).catch((e) => setError(e.message));
  }, [apiFetch]);

  useEffect(() => { if (clave) cargar(); }, [clave, cargar]);

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await apiFetch('/api/admin/movimientos', {
        method: 'POST',
        body: JSON.stringify({ ...form, tipo: 'GASTO', importe: Number(String(form.importe).replace(',', '.')) }),
      });
      setForm({ concepto: '', categoria: form.categoria, importe: '', fecha: form.fecha, contacto: '', notas: '' });
      cargar();
    } catch (err) {
      setError(err.message);
    }
    setGuardando(false);
  };

  const borrar = async (id) => {
    if (!confirm('¿Borrar este gasto?')) return;
    try {
      await apiFetch(`/api/admin/movimientos?id=${id}`, { method: 'DELETE' });
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  const inputStyle = { padding: '9px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Gastos</h2>
      {error && <p style={{ backgroundColor: '#fee2e2', padding: '10px', borderRadius: '6px' }}>{error}</p>}

      <form onSubmit={guardar} style={{ backgroundColor: 'white', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '2 1 200px' }}>
          <label style={{ fontSize: '12px', color: '#6b7280' }}>Concepto *</label>
          <input required value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} style={inputStyle} placeholder="Ej: Nómina agosto Vilma" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 160px' }}>
          <label style={{ fontSize: '12px', color: '#6b7280' }}>Categoría</label>
          <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} style={inputStyle}>
            {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
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

      <div style={{ backgroundColor: 'white', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        {!gastos && <p>Cargando…</p>}
        {gastos && gastos.length === 0 && <p style={{ color: '#9ca3af' }}>Todavía no hay gastos registrados.</p>}
        {gastos && gastos.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: '12px' }}>
                  <th style={{ padding: '8px 6px' }}>Fecha</th>
                  <th style={{ padding: '8px 6px' }}>Concepto</th>
                  <th style={{ padding: '8px 6px' }}>Categoría</th>
                  <th style={{ padding: '8px 6px' }}>Proveedor</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Importe</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{g.fecha}</td>
                    <td style={{ padding: '8px 6px' }}>{g.concepto}</td>
                    <td style={{ padding: '8px 6px', color: '#6b7280' }}>{g.categoria}</td>
                    <td style={{ padding: '8px 6px', color: '#6b7280' }}>{g.contacto || '—'}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626', whiteSpace: 'nowrap' }}>{eur(g.importe)}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <button onClick={() => borrar(g.id)} title="Borrar" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}>🗑️</button>
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
      <Gastos />
    </Shell>
  );
}
