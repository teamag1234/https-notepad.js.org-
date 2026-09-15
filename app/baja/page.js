'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const inputStyle = { width: '100%', padding: '11px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' };
const label = { fontSize: '13px', color: '#374151', fontWeight: 'bold', display: 'block', margin: '14px 0 5px' };

function FormularioBaja() {
  const token = useSearchParams().get('t');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [f, setF] = useState({ iban: '', titular: '', dniTitular: '', telefono: '', motivo: '', atencion: '', sugerencias: '' });

  useEffect(() => {
    if (!token) { setError('Este enlace no es válido.'); return; }
    fetch(`/api/baja?t=${token}`).then((r) => r.json()).then((j) => {
      if (!j.success) setError(j.error);
      else if (j.data.estado !== 'ESPERANDO_ALUMNO') setHecho(true);
      else setDatos(j.data);
    }).catch(() => setError('No se pudo cargar el formulario.'));
  }, [token]);

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      const r = await fetch('/api/baja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...f }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setHecho(true);
    } catch (e2) { setError(e2.message); }
    setEnviando(false);
  };

  const eur = (n) => `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f4f5f7', display: 'flex', justifyContent: 'center', padding: '30px 16px' }}>
      <div style={{ maxWidth: '520px', width: '100%' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '28px', boxShadow: '0 4px 14px rgba(0,0,0,0.08)', borderTop: '5px solid #2456A6' }}>
          <img src="/logo-ag.png" alt="AG Academy" style={{ width: '150px', marginBottom: '14px' }} />

          {hecho && (
            <>
              <h2 style={{ color: '#059669' }}>✅ ¡Recibido!</h2>
              <p style={{ lineHeight: 1.7 }}>Ya tenemos tus datos. Tramitaremos tu reembolso por transferencia en un plazo máximo de <strong>7 días hábiles</strong> y te llegará un email de confirmación.</p>
              <p style={{ color: '#6b7280' }}>Gracias por habernos acompañado 💙</p>
            </>
          )}

          {!hecho && error && !datos && <p style={{ backgroundColor: '#fee2e2', padding: '12px', borderRadius: '8px' }}>{error}</p>}

          {!hecho && datos && (
            <form onSubmit={enviar}>
              <h2 style={{ margin: '0 0 6px' }}>{datos.tipo === 'BAJA' ? 'Solicitud de baja' : 'Solicitud de devolución'}</h2>
              <p style={{ color: '#6b7280', lineHeight: 1.6, marginTop: 0 }}>
                Hola <strong>{datos.alumno}</strong>{datos.concepto ? <> · {datos.concepto}</> : null}.
                {datos.importe ? <> Te devolveremos <strong>{eur(datos.importe)}</strong>.</> : null} Rellena los datos de la cuenta donde quieres recibir el reembolso:
              </p>

              <label style={label}>IBAN (empieza por ES, 24 caracteres) *</label>
              <input required value={f.iban} onChange={(e) => setF({ ...f, iban: e.target.value })} style={inputStyle} placeholder="ES00 0000 0000 0000 0000 0000" />

              <label style={label}>Nombre completo del titular de la cuenta *</label>
              <input required value={f.titular} onChange={(e) => setF({ ...f, titular: e.target.value })} style={inputStyle} />

              <label style={label}>DNI del titular</label>
              <input value={f.dniTitular} onChange={(e) => setF({ ...f, dniTitular: e.target.value })} style={inputStyle} placeholder="12345678A" />

              <label style={label}>Teléfono de contacto</label>
              <input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} style={inputStyle} />

              <label style={label}>¿Cuál ha sido el motivo principal de tu decisión?</label>
              <textarea value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} style={{ ...inputStyle, minHeight: '70px' }} />

              <label style={label}>¿Te has sentido a gusto con la atención del equipo?</label>
              <textarea value={f.atencion} onChange={(e) => setF({ ...f, atencion: e.target.value })} style={{ ...inputStyle, minHeight: '50px' }} />

              <label style={label}>¿Alguna sugerencia para mejorar?</label>
              <textarea value={f.sugerencias} onChange={(e) => setF({ ...f, sugerencias: e.target.value })} style={{ ...inputStyle, minHeight: '50px' }} />

              <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5, backgroundColor: '#f9fafb', padding: '10px 12px', borderRadius: '8px' }}>
                Al enviar confirmo que solicito la {datos.tipo === 'BAJA' ? 'baja del curso dentro de los 15 días de prueba' : 'devolución'} y acepto que el reembolso se tramitará en un plazo de 7 días hábiles.
              </p>

              {error && <p style={{ backgroundColor: '#fee2e2', padding: '10px', borderRadius: '8px' }}>{error}</p>}

              <button type="submit" disabled={enviando}
                      style={{ width: '100%', padding: '14px', backgroundColor: '#2456A6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '6px' }}>
                {enviando ? 'Enviando…' : '📤 Enviar y solicitar el reembolso'}
              </button>
            </form>
          )}
        </div>
        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '12px', marginTop: '14px' }}>AG Academy · Always Growing Academy SL</p>
      </div>
    </div>
  );
}

export default function PaginaBaja() {
  return (
    <Suspense fallback={<p style={{ padding: '40px', textAlign: 'center' }}>Cargando…</p>}>
      <FormularioBaja />
    </Suspense>
  );
}
