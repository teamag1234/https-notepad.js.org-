'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shell, useAdmin, eur } from '../ui.js';

const VERDE = '#059669';
const ROJO = '#dc2626';

function Kpi({ titulo, valor, color = '#111827', pie }) {
  return (
    <div style={{ flex: '1 1 120px', textAlign: 'center' }}>
      <div style={{ fontSize: '12px', color: '#6b7280' }}>{titulo}</div>
      <div style={{ fontSize: '22px', fontWeight: 'bold', color }}>{valor}</div>
      {pie && <div style={{ fontSize: '11px', color: '#9ca3af' }}>{pie}</div>}
    </div>
  );
}

function Roas() {
  const { apiFetch, clave } = useAdmin();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const mesActual = new Date().toISOString().slice(0, 7);
  const [desde, setDesde] = useState(mesActual);
  const [hasta, setHasta] = useState(mesActual);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    apiFetch(`/api/admin/roas?desde=${desde}&hasta=${hasta}`)
      .then((d) => { setDatos(d); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [apiFetch, desde, hasta]);

  useEffect(() => { if (clave) cargar(); }, [clave, cargar]);

  const logoPlat = { 'Meta': '📘', 'Google': '🔍', 'TikTok': '🎵', 'Otras plataformas': '📢' };
  const colorRoas = (r) => (r == null ? '#6b7280' : r >= 3 ? VERDE : r >= 1 ? '#d97706' : ROJO);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'baseline', gap: '10px' }}>
        <h2 style={{ marginTop: 0 }}>📈 Fuente del lead · ROAS y ROI</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="month" value={desde} onChange={(e) => { setDesde(e.target.value); if (e.target.value > hasta) setHasta(e.target.value); }} style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
          <span style={{ color: '#9ca3af' }}>→</span>
          <input type="month" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
        </div>
      </div>
      <p style={{ color: '#6b7280', fontSize: '14px' }}>
        Facturación por fuente del lead (Airtable) frente a la inversión real en publicidad (cargos del banco). ROAS = facturado ÷ invertido · ROI = beneficio sobre lo invertido.
      </p>
      {error && <p style={{ backgroundColor: '#fee2e2', padding: '10px', borderRadius: '6px' }}>{error}</p>}
      {(!datos || cargando) && <p>Cargando…</p>}

      {datos && !cargando && (
        <>
          {/* TOTAL GENERAL */}
          <div style={{ backgroundColor: '#111827', color: 'white', borderRadius: '14px', padding: '18px 22px', marginBottom: '18px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <div style={{ flex: '1 1 160px' }}>
              <div style={{ fontSize: '13px', opacity: 0.7 }}>TOTAL PUBLICIDAD</div>
              <div style={{ fontSize: '26px', fontWeight: 'bold' }}>{eur(datos.totales.invertido)}</div>
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <div style={{ fontSize: '13px', opacity: 0.7 }}>FACTURACIÓN TOTAL</div>
              <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#6ee7b7' }}>{eur(datos.totales.facturado)}</div>
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <div style={{ fontSize: '13px', opacity: 0.7 }}>ROAS GLOBAL</div>
              <div style={{ fontSize: '26px', fontWeight: 'bold' }}>{datos.totales.roas != null ? `${datos.totales.roas}×` : '—'}</div>
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <div style={{ fontSize: '13px', opacity: 0.7 }}>ROI GLOBAL</div>
              <div style={{ fontSize: '26px', fontWeight: 'bold' }}>{datos.totales.roi != null ? `${datos.totales.roi}%` : '—'}</div>
            </div>
          </div>

          {/* PLATAFORMAS CON INVERSIÓN */}
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '18px' }}>
            {datos.plataformas.map((p) => (
              <div key={p.plataforma} style={{ flex: '1 1 300px', backgroundColor: 'white', borderRadius: '12px', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h3 style={{ margin: '0 0 10px' }}>{logoPlat[p.plataforma] || '📢'} {p.plataforma}</h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <Kpi titulo="Invertido" valor={eur(p.invertido)} color={ROJO} />
                  <Kpi titulo="Facturado" valor={eur(p.facturado)} color={VERDE} />
                  <Kpi titulo="ROAS" valor={p.roas != null ? `${p.roas}×` : '—'} color={colorRoas(p.roas)} />
                  <Kpi titulo="ROI" valor={p.roi != null ? `${p.roi}%` : '—'} color={colorRoas(p.roas)} />
                </div>
                {p.fuentes.length > 0 && (
                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '8px', fontSize: '13px' }}>
                    {p.fuentes.map((f) => (
                      <div key={f.fuente} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                        <span style={{ color: '#6b7280' }}>{f.fuente} <span style={{ color: '#9ca3af', fontSize: '11px' }}>({f.cobros} cobros)</span></span>
                        <strong>{eur(f.facturado)}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {p.invertido > 0 && p.facturado === 0 && (
                  <p style={{ fontSize: '12px', color: '#92400e', backgroundColor: '#fef3c7', borderRadius: '6px', padding: '6px 10px', margin: '8px 0 0' }}>
                    Inversión sin cobros atribuidos este periodo (revisa la FUENTE DEL LEAD de los alumnos nuevos).
                  </p>
                )}
              </div>
            ))}
            {!datos.plataformas.length && (
              <p style={{ color: '#9ca3af' }}>Sin inversión publicitaria ni cobros de fuentes de pago en este periodo.</p>
            )}
          </div>

          {/* FUENTES SIN INVERSIÓN */}
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ margin: '0 0 4px' }}>🌱 Fuentes sin inversión</h3>
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#6b7280' }}>
              Orgánico, recomendaciones, afiliados… · total <strong style={{ color: VERDE }}>{eur(datos.facturadoOrganico)}</strong>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {datos.organicas.map((f) => (
                <div key={f.fuente} style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '8px 14px', fontSize: '13px' }}>
                  <div style={{ color: '#6b7280' }}>{f.fuente} <span style={{ color: '#9ca3af', fontSize: '11px' }}>({f.cobros})</span></div>
                  <strong>{eur(f.facturado)}</strong>
                </div>
              ))}
              {!datos.organicas.length && <span style={{ color: '#9ca3af' }}>Sin cobros de fuentes orgánicas en este periodo.</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function PaginaRoas() {
  return (
    <Shell activo="roas">
      <Roas />
    </Shell>
  );
}
