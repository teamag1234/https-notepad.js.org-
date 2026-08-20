'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const SOPORTE_TELEFONO = '+34 601 99 35 80';
const SOPORTE_WA = 'https://wa.me/34601993580';

const S = {
  fondo: { minHeight: '100vh', background: '#f2f4f7', padding: '0 12px 40px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1c2733' },
  caja: { maxWidth: 640, margin: '0 auto', paddingTop: 24 },
  marca: { textAlign: 'center', fontWeight: 800, fontSize: 20, color: '#075E54', padding: '12px 0' },
  tarjeta: { background: '#fff', borderRadius: 14, boxShadow: '0 2px 14px rgba(0,0,0,0.07)', padding: '24px 20px', marginBottom: 16 },
  paso: { display: 'inline-block', background: '#E7F7EE', color: '#0B7B4B', fontWeight: 700, fontSize: 14, padding: '4px 12px', borderRadius: 999, marginBottom: 10 },
  titulo: { fontSize: 26, fontWeight: 800, margin: '4px 0 10px', lineHeight: 1.2 },
  texto: { fontSize: 18, lineHeight: 1.55, margin: '10px 0' },
  botonVerde: {
    display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'center', border: 'none',
    background: '#25D366', color: '#fff', fontSize: 19, fontWeight: 800, padding: '16px 20px',
    borderRadius: 10, cursor: 'pointer', textDecoration: 'none',
  },
  botonOscuro: {
    display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'center',
    background: '#075E54', color: '#fff', fontSize: 18, fontWeight: 700, padding: '14px 20px',
    borderRadius: 10, textDecoration: 'none',
  },
  numero: {
    flexShrink: 0, width: 34, height: 34, borderRadius: '50%', background: '#075E54', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17,
  },
  ayuda: { fontSize: 16, color: '#5a6a79', textAlign: 'center', marginTop: 6 },
};

function TarjetaPaso({ n, titulo, children }) {
  return (
    <div style={S.tarjeta}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <div style={S.numero}>{n}</div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{titulo}</div>
      </div>
      {children}
    </div>
  );
}

function Soporte() {
  return (
    <div style={{ ...S.tarjeta, background: '#EAF6F3', textAlign: 'center' }}>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>📞 ¿Necesitas ayuda?</div>
      <p style={{ ...S.texto, marginTop: 0 }}>
        Nuestro equipo de atención al alumno te ayuda con cualquier duda:
      </p>
      <a href={SOPORTE_WA} style={{ ...S.botonVerde, marginBottom: 10 }}>💬 Escribir por WhatsApp</a>
      <a href={`tel:+34601993580`} style={{ fontSize: 19, fontWeight: 800, color: '#075E54', textDecoration: 'none' }}>
        {SOPORTE_TELEFONO}
      </a>
    </div>
  );
}

function AceptarContenido() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [info, setInfo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [marcado, setMarcado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null); // { whatsappLink, videoUrl }
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) { setCargando(false); setError(true); return; }
    fetch(`/api/aceptar?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setInfo(d);
          if (d.aceptado) setResultado({ whatsappLink: d.whatsappLink, videoUrl: d.videoUrl });
        } else setError(true);
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
      if (d.ok) {
        setResultado({ whatsappLink: d.whatsappLink, videoUrl: d.videoUrl });
        window.scrollTo(0, 0);
      } else setError(true);
    } catch {
      setError(true);
    }
    setEnviando(false);
  };

  if (cargando) return (
    <div style={S.caja}><div style={S.tarjeta}><p style={S.texto}>Cargando…</p></div></div>
  );

  if (error || !info) return (
    <div style={S.caja}>
      <div style={S.marca}>AG Academy</div>
      <div style={S.tarjeta}>
        <div style={S.titulo}>Este enlace no funciona</div>
        <p style={S.texto}>Puede que esté mal copiado o haya caducado. Abre el último email que te enviamos y vuelve a pulsar el botón verde.</p>
      </div>
      <Soporte />
    </div>
  );

  // ── Pantalla final: ya ha aceptado ──
  if (resultado) return (
    <div style={S.caja}>
      <div style={S.marca}>AG Academy</div>
      <div style={{ ...S.tarjeta, textAlign: 'center', background: '#E7F7EE' }}>
        <div style={{ fontSize: 44 }}>🎉</div>
        <div style={S.titulo}>¡Ya está, {info.nombre}!</div>
        <p style={S.texto}>
          Tu aceptación ha quedado registrada y te hemos enviado una copia a tu email.
          Ahora sigue estos pasos:
        </p>
      </div>

      <TarjetaPaso n="1" titulo="Entra en tu comunidad de WhatsApp">
        <p style={S.texto}>Ahí recibirás los avisos y todo lo importante del curso. Pulsa el botón verde y después pulsa <strong>"Unirte al grupo"</strong>.</p>
        <a href={resultado.whatsappLink} style={S.botonVerde}>💬 Entrar en la comunidad</a>
      </TarjetaPaso>

      {resultado.videoUrl && (
        <TarjetaPaso n="2" titulo="Mira tu vídeo de bienvenida">
          <p style={S.texto}>🎯 Es tu guía de planificación del curso. Míralo antes de empezar para aprovecharlo al máximo 💪</p>
          <a href={resultado.videoUrl} target="_blank" rel="noopener noreferrer" style={S.botonOscuro}>🎬 Ver mi vídeo de guía</a>
        </TarjetaPaso>
      )}

      <TarjetaPaso n={resultado.videoUrl ? '3' : '2'} titulo="¿Ves módulos bloqueados?">
        <p style={S.texto}>
          🔒 Es normal: tienes una <strong>prueba de 15 días</strong>. Si quieres <strong>desbloquear todo ya mismo</strong>,
          pulsa este botón y envíanos el mensaje que aparece escrito. ¡Nosotros nos encargamos del resto! 😉
        </p>
        <a href={`${SOPORTE_WA}?text=Quiero%20desbloquear`} style={{ ...S.botonOscuro, background: '#F5A623' }}>🔓 Quiero desbloquear</a>
      </TarjetaPaso>

      <Soporte />
    </div>
  );

  // ── Pantalla de firma ──
  return (
    <div style={S.caja}>
      <div style={S.marca}>AG Academy</div>
      <div style={S.tarjeta}>
        <span style={S.paso}>Último paso para entrar</span>
        <div style={S.titulo}>¡Ya casi estás dentro, {info.nombre}!</div>
        <p style={S.texto}>
          Estás a un paso de empezar <strong>{info.curso}</strong>. Solo tienes que leer las condiciones
          del curso y aceptarlas aquí abajo.
        </p>
      </div>

      <div style={S.tarjeta}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>📄 Condiciones del curso</div>
        {info.condicionesPreview && (
          <iframe
            src={info.condicionesPreview}
            style={{ width: '100%', height: 420, border: '1px solid #dde3e9', borderRadius: 10 }}
            title="Condiciones del curso"
            allow="autoplay"
          />
        )}
        <p style={S.ayuda}>
          ¿No lo ves bien? <a href={info.condicionesUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#075E54', fontWeight: 700 }}>Ábrelo en grande aquí</a> ({info.version})
        </p>
      </div>

      <div style={S.tarjeta}>
        <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 16 }}>
          <input
            type="checkbox"
            checked={marcado}
            onChange={e => setMarcado(e.target.checked)}
            style={{ marginTop: 5, width: 24, height: 24, accentColor: '#25D366', flexShrink: 0 }}
          />
          <span style={{ fontSize: 18, lineHeight: 1.5 }}>
            <strong>He leído y acepto las condiciones del curso.</strong> Sé que quedará registrada mi
            confirmación (fecha, hora y dispositivo) y que recibiré una copia por email.
          </span>
        </label>
        <button
          onClick={aceptar}
          disabled={!marcado || enviando}
          style={{ ...S.botonVerde, background: marcado ? '#25D366' : '#c6cdd4', cursor: marcado ? 'pointer' : 'not-allowed' }}
        >
          {enviando ? 'Un momento…' : '✅ Acepto y quiero entrar'}
        </button>
        {!marcado && <p style={S.ayuda}>Marca primero la casilla de arriba ☝️</p>}
      </div>

      <Soporte />
    </div>
  );
}

export default function AceptarPage() {
  return (
    <div style={S.fondo}>
      <Suspense fallback={<p style={{ textAlign: 'center', paddingTop: 60 }}>Cargando…</p>}>
        <AceptarContenido />
      </Suspense>
    </div>
  );
}
