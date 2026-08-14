'use client';

import { useState, useEffect, useCallback } from 'react';

export const eur = (n) =>
  (n == null ? 0 : n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

export function useAdmin() {
  const [clave, setClave] = useState(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    setClave(localStorage.getItem('agAdminKey'));
    setListo(true);
  }, []);

  const entrar = useCallback((nueva) => {
    localStorage.setItem('agAdminKey', nueva);
    setClave(nueva);
  }, []);

  const salir = useCallback(() => {
    localStorage.removeItem('agAdminKey');
    setClave(null);
  }, []);

  const apiFetch = useCallback(async (url, options = {}) => {
    const key = localStorage.getItem('agAdminKey');
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'x-admin-key': key || '', ...(options.headers || {}) },
    });
    const data = await response.json();
    if (response.status === 401) {
      localStorage.removeItem('agAdminKey');
      setClave(null);
    }
    if (!data.success) throw new Error(data.error || 'Error desconocido');
    return data.data ?? data;
  }, []);

  return { clave, listo, entrar, salir, apiFetch };
}

const estilos = {
  fondo: { minHeight: '100vh', backgroundColor: '#f4f5f7' },
  cabecera: {
    backgroundColor: '#111827',
    color: 'white',
    padding: '14px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '18px',
    flexWrap: 'wrap',
  },
  enlace: (activo) => ({
    color: activo ? '#fff' : '#9ca3af',
    textDecoration: 'none',
    fontWeight: activo ? 'bold' : 'normal',
    fontSize: '14px',
    borderBottom: activo ? '2px solid #f59e0b' : '2px solid transparent',
    paddingBottom: '2px',
  }),
  contenido: { maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' },
};

export function Card({ titulo, valor, color = '#111827', pie }) {
  return (
    <div style={{
      backgroundColor: 'white', borderRadius: '10px', padding: '18px 20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)', flex: '1 1 200px', minWidth: '180px',
    }}>
      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '6px' }}>{titulo}</div>
      <div style={{ fontSize: '26px', fontWeight: 'bold', color }}>{valor}</div>
      {pie && <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>{pie}</div>}
    </div>
  );
}

export function Shell({ activo, children }) {
  const admin = useAdmin();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  if (!admin.listo) return null;

  if (!admin.clave) {
    return (
      <div style={{ ...estilos.fondo, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            const response = await fetch('/api/admin/morosos', { headers: { 'x-admin-key': input } });
            if (response.status === 401) {
              setError('Clave incorrecta');
              return;
            }
            admin.entrar(input);
          }}
          style={{ backgroundColor: 'white', padding: '32px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '340px' }}
        >
          <h2 style={{ marginTop: 0 }}>🎓 AG Academy · Administración</h2>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>Introduce la clave de administración</p>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Clave"
            style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', boxSizing: 'border-box' }}
          />
          {error && <p style={{ color: '#dc2626', fontSize: '13px' }}>{error}</p>}
          <button
            type="submit"
            style={{ marginTop: '14px', width: '100%', padding: '11px', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '6px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Entrar
          </button>
        </form>
      </div>
    );
  }

  const secciones = [
    { id: 'dashboard', href: '/admin', texto: '📊 Dashboard' },
    { id: 'gastos', href: '/admin/gastos', texto: '💸 Gastos' },
    { id: 'ingresos', href: '/admin/ingresos', texto: '💰 Ingresos' },
    { id: 'morosos', href: '/admin/morosos', texto: '⚠️ Morosos' },
  ];

  return (
    <div style={estilos.fondo}>
      <header style={estilos.cabecera}>
        <strong style={{ fontSize: '16px' }}>🎓 AG Academy · Administración</strong>
        <nav style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {secciones.map((s) => (
            <a key={s.id} href={s.href} style={estilos.enlace(activo === s.id)}>{s.texto}</a>
          ))}
        </nav>
        <button
          onClick={admin.salir}
          style={{ marginLeft: 'auto', background: 'none', border: '1px solid #4b5563', color: '#9ca3af', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px' }}
        >
          Salir
        </button>
      </header>
      <main style={estilos.contenido}>{children}</main>
    </div>
  );
}
