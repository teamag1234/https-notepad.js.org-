'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function AceptarContenido() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [info, setInfo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [marcado, setMarcado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [whatsappLink, setWhatsappLink] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) { setCargando(false); setError(true); return; }
    fetch(`/api/aceptar?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) { setInfo(d); if (d.aceptado) setWhatsappLink(d.whatsappLink); }
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, [token]);

  const aceptar = async () => {
    setEnviando(true);
    try {
      const r = await fetch('/api/aceptar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (d.ok) setWhatsappLink(d.whatsappLink);
      else setError(true);
    } catch {
      setError(true);
    }
    setEnviando(false);
  };

  const caja = {
    maxWidth: 560, margin: '40px auto', padding: '32px 24px', fontFamily: 'system-ui, sans-serif',
    background: '#fff', borderRadius: 12, boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
  };
  const boton = {
    display: 'inline-block', border: 'none', cursor: 'pointer', fontSize: 17, fontWeight: 700,
    padding: '14px 28px', borderRadius: 8, color: '#fff', textDecoration: 'none',
  };

  if (cargando) return <div style={caja}><p>Cargando…</p></div>;

  if (error || !info) return (
    <div style={caja}>
      <h2>Enlace no válido</h2>
      <p>Este enlace no es válido o ha caducado. Revisa el último email que te hemos enviado o escríbenos respondiendo a ese email.</p>
    </div>
  );

  if (whatsappLink) return (
    <div style={caja}>
      <h2>🎉 ¡Todo listo, {info.nombre}!</h2>
      <p>Tu aceptación de las condiciones de <strong>{info.curso}</strong> ha quedado registrada y te hemos enviado el justificante por email.</p>
      <p>Este es tu acceso a la comunidad del curso:</p>
      <p style={{ margin: '24px 0' }}>
        <a href={whatsappLink} style={{ ...boton, background: '#25D366' }}>💬 Entrar a la comunidad de WhatsApp</a>
      </p>
      <p style={{ color: '#666', fontSize: 14 }}>Un administrador aprobará tu entrada si es necesario. ¡Nos vemos dentro!</p>
    </div>
  );

  return (
    <div style={caja}>
      <h2>¡Ya casi estás dentro, {info.nombre}!</h2>
      <p>Solo queda un paso para completar tu alta en <strong>{info.curso}</strong>.</p>
      <p>
        📄 Lee las <a href={info.condicionesUrl} target="_blank" rel="noopener noreferrer">condiciones del curso</a> ({info.version}).
        Incluyen las condiciones de acceso, el uso del contenido y la política de desistimiento.
      </p>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '20px 0', cursor: 'pointer' }}>
        <input type="checkbox" checked={marcado} onChange={e => setMarcado(e.target.checked)} style={{ marginTop: 4, width: 18, height: 18 }} />
        <span>He leído y acepto las condiciones del curso. Entiendo que al aceptar quedará registrada mi confirmación (fecha, hora y dispositivo) y recibiré una copia por email.</span>
      </label>
      <button
        onClick={aceptar}
        disabled={!marcado || enviando}
        style={{ ...boton, background: marcado ? '#25D366' : '#b9e8c9', cursor: marcado ? 'pointer' : 'not-allowed' }}
      >
        {enviando ? 'Registrando…' : '✅ Acepto y quiero mi acceso'}
      </button>
    </div>
  );
}

export default function AceptarPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f2f4f7', padding: '0 12px' }}>
      <Suspense fallback={<p style={{ textAlign: 'center', paddingTop: 60 }}>Cargando…</p>}>
        <AceptarContenido />
      </Suspense>
    </div>
  );
}
