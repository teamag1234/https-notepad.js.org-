'use client';

import { useState, useEffect } from 'react';

// Página pública donde el trabajador firma la recepción de su documento
// (nómina, contrato…) y, una vez firmado, lo ve. Acceso por enlace personal.
export default function Documento() {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  const [nombre, setNombre] = useState('');
  const [url, setUrl] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [token, setToken] = useState('');

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('t') || '';
    setToken(t);
    if (!t) { setError('Enlace no válido'); return; }
    fetch(`/api/documento?t=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setDoc(d.data); else setError(d.error); })
      .catch((e) => setError(e.message));
  }, []);

  const firmar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      const r = await fetch('/api/documento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, nombre }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      setUrl(d.data.url);
    } catch (e2) { setError(e2.message); }
    setEnviando(false);
  };

  const verSinFirma = async () => {
    // Documento ya firmado anteriormente: recuperar el enlace
    setEnviando(true);
    try {
      const r = await fetch('/api/documento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, nombre: '(ya firmado)' }),
      });
      const d = await r.json();
      if (d.success) setUrl(d.data.url); else setError(d.error);
    } catch (e2) { setError(e2.message); }
    setEnviando(false);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '460px', maxWidth: '100%', color: '#111827' }}>
        <h2 style={{ margin: '0 0 4px' }}>📄 AG Academy · Documentos</h2>

        {error && <div style={{ backgroundColor: '#fee2e2', borderRadius: '10px', padding: '12px', margin: '16px 0' }}>{error}</div>}
        {!doc && !error && <p>Cargando…</p>}

        {doc && !url && (
          <>
            <p style={{ color: '#6b7280', margin: '4px 0 16px' }}>Hola <strong>{doc.trabajador}</strong>, tienes disponible:</p>
            <div style={{ background: '#f3f4f6', borderRadius: '10px', padding: '14px 18px', fontSize: '17px', marginBottom: '18px' }}>
              <strong>{doc.titulo}</strong>{doc.mes ? ` · ${doc.mes}` : ''} {doc.tipo === 'NÓMINA' && <span style={{ color: '#6b7280' }}>(nómina)</span>}
            </div>
            {doc.firmado ? (
              <>
                <p style={{ fontSize: '14px', color: '#059669' }}>✍️ Ya firmaste la recepción de este documento.</p>
                <button onClick={verSinFirma} disabled={enviando} style={{ width: '100%', padding: '13px', border: 'none', borderRadius: '10px', backgroundColor: '#111827', color: 'white', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>
                  {enviando ? 'Un momento…' : '📄 Ver mi documento'}
                </button>
              </>
            ) : (
              <form onSubmit={firmar}>
                <p style={{ fontSize: '14px', lineHeight: 1.6 }}>
                  Para acceder, primero <strong>firma la recepción</strong>: escribe tu nombre completo.
                  Al firmar confirmas que has recibido este documento en la fecha de hoy.
                </p>
                <input
                  autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)}
                  placeholder="Tu nombre completo"
                  style={{ width: '100%', padding: '13px', fontSize: '16px', border: '2px solid #d1d5db', borderRadius: '10px', boxSizing: 'border-box' }}
                />
                <button type="submit" disabled={enviando || nombre.trim().length < 5}
                        style={{ width: '100%', marginTop: '12px', padding: '13px', border: 'none', borderRadius: '10px', backgroundColor: '#059669', color: 'white', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', opacity: enviando || nombre.trim().length < 5 ? 0.6 : 1 }}>
                  {enviando ? 'Firmando…' : '✍️ Firmar recepción y ver documento'}
                </button>
                <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '10px' }}>Quedará registrada la fecha y hora de tu firma como acuse de recibo.</p>
              </form>
            )}
          </>
        )}

        {url && (
          <>
            <div style={{ backgroundColor: '#dcfce7', borderRadius: '10px', padding: '14px', margin: '16px 0', fontSize: '15px' }}>
              ✅ Recepción confirmada. Ya puedes ver tu documento:
            </div>
            <a href={url} target="_blank" rel="noopener"
               style={{ display: 'block', textAlign: 'center', padding: '14px', borderRadius: '10px', backgroundColor: '#111827', color: 'white', fontWeight: 'bold', fontSize: '16px', textDecoration: 'none' }}>
              📄 Abrir {doc?.tipo === 'NÓMINA' ? 'mi nómina' : 'el documento'}
            </a>
            <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '12px' }}>Puedes volver a este enlace siempre que quieras para consultarlo.</p>
          </>
        )}
      </div>
    </div>
  );
}
