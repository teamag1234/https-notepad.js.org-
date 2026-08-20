'use client';

import { useState, useEffect } from 'react';

// Página pública de fichaje del equipo de AG Academy: cada trabajador elige su
// nombre, teclea su PIN y ficha entrada o salida (según su estado actual).
export default function Fichar() {
  const [trabajadores, setTrabajadores] = useState(null);
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = () => {
    fetch('/api/fichar').then((r) => r.json()).then((d) => {
      if (d.success) setTrabajadores(d.data);
      else setError(d.error);
    }).catch((e) => setError(e.message));
  };
  useEffect(cargar, []);

  const fichar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError('');
    setMensaje(null);
    try {
      const r = await fetch('/api/fichar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trabajador_id: sel.id, pin }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      setMensaje(d.data);
      setPin('');
      setSel(null);
      cargar();
    } catch (e2) {
      setError(e2.message);
    }
    setEnviando(false);
  };

  const hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '420px', maxWidth: '100%' }}>
        <h2 style={{ margin: '0 0 4px' }}>🕐 Fichar · AG Academy</h2>
        <p style={{ color: '#6b7280', margin: '0 0 20px' }}>Son las {hora}. Elige tu nombre y teclea tu PIN.</p>

        {mensaje && (
          <div style={{ backgroundColor: '#dcfce7', borderRadius: '10px', padding: '16px', marginBottom: '16px', fontSize: '17px' }}>
            {mensaje.accion === 'entrada' ? '✅ ¡Entrada registrada!' : '👋 ¡Salida registrada!'} <strong>{mensaje.nombre}</strong>
          </div>
        )}
        {error && <div style={{ backgroundColor: '#fee2e2', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>{error}</div>}

        {!trabajadores && !error && <p>Cargando…</p>}
        {trabajadores && trabajadores.length === 0 && (
          <p style={{ color: '#6b7280' }}>No hay trabajadores con PIN configurado todavía. El PIN se asigna desde el panel de administración (RRHH → ficha del trabajador).</p>
        )}

        {trabajadores && !sel && trabajadores.map((t) => (
          <button key={t.id} onClick={() => { setSel(t); setMensaje(null); setError(''); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '14px 16px', marginBottom: '8px', border: '1px solid #e5e7eb', borderRadius: '10px', backgroundColor: 'white', cursor: 'pointer', fontSize: '16px' }}>
            <strong>{t.nombre}</strong>
            <span style={{ fontSize: '13px', color: t.trabajando ? '#059669' : '#9ca3af' }}>
              {t.trabajando ? '🟢 trabajando · pulsar para salir' : 'pulsar para entrar'}
            </span>
          </button>
        ))}

        {sel && (
          <form onSubmit={fichar}>
            <p style={{ fontSize: '17px' }}><strong>{sel.nombre}</strong> — vas a fichar la <strong>{sel.trabajando ? 'SALIDA' : 'ENTRADA'}</strong></p>
            <input
              autoFocus type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)}
              placeholder="Tu PIN" style={{ width: '100%', padding: '14px', fontSize: '22px', textAlign: 'center', letterSpacing: '6px', border: '2px solid #d1d5db', borderRadius: '10px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              <button type="button" onClick={() => { setSel(null); setPin(''); }} style={{ flex: 1, padding: '13px', border: '1px solid #d1d5db', borderRadius: '10px', backgroundColor: 'white', cursor: 'pointer', fontSize: '15px' }}>Cancelar</button>
              <button type="submit" disabled={enviando || !pin} style={{ flex: 2, padding: '13px', border: 'none', borderRadius: '10px', backgroundColor: sel.trabajando ? '#dc2626' : '#059669', color: 'white', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', opacity: enviando || !pin ? 0.6 : 1 }}>
                {enviando ? 'Un momento…' : sel.trabajando ? '👋 Fichar salida' : '✅ Fichar entrada'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
