'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shell, useAdmin, eur } from './ui.js';

const MESES_ES = { '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic' };
const MESES_LARGO = { '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril', '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto', '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre' };
const etiquetaMes = (clave) => `${MESES_ES[clave.slice(5)]} ${clave.slice(2, 4)}`;

const VERDE = '#059669';
const ROJO = '#dc2626';
const AMBAR = '#d97706';

function Delta({ valor, invertir = false, etiqueta = 'vs mes anterior' }) {
  if (valor == null) return null;
  const sube = valor >= 0;
  const bueno = invertir ? !sube : sube;
  return (
    <span style={{ fontSize: '13px', fontWeight: 'bold', color: bueno ? VERDE : ROJO }}>
      {sube ? '▲' : '▼'} {Math.abs(valor).toLocaleString('es-ES')}%
      <span style={{ color: '#9ca3af', fontWeight: 'normal' }}> {etiqueta}</span>
    </span>
  );
}

function TileGrande({ titulo, valor, color, delta, invertir, pie, etiquetaDelta }) {
  return (
    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', flex: '1 1 210px', minWidth: '200px' }}>
      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{titulo}</div>
      <div style={{ fontSize: '34px', fontWeight: 800, color, lineHeight: 1.1 }}>{valor}</div>
      <div style={{ marginTop: '6px', minHeight: '18px' }}>
        <Delta valor={delta} invertir={invertir} etiqueta={etiquetaDelta} />
        {pie && <div style={{ fontSize: '12px', color: '#9ca3af' }}>{pie}</div>}
      </div>
    </div>
  );
}

function AnillaMargen({ margen }) {
  const pct = Math.max(0, Math.min(100, margen ?? 0));
  const color = (margen ?? 0) >= 0 ? VERDE : ROJO;
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', flex: '1 1 210px', minWidth: '200px', display: 'flex', alignItems: 'center', gap: '16px' }}>
      <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`Margen de beneficio ${margen ?? 0}%`}>
        <circle cx="42" cy="42" r={r} fill="none" stroke="#f3f4f6" strokeWidth="9" />
        <circle
          cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 42 42)"
        />
        <text x="42" y="47" textAnchor="middle" fontSize="19" fontWeight="800" fill="#111827">
          {margen == null ? '—' : `${margen.toLocaleString('es-ES')}%`}
        </text>
      </svg>
      <div>
        <div style={{ fontSize: '13px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Margen de beneficio</div>
        <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>
          {margen == null ? 'Sin ingresos este mes' : `De cada 100 € ingresados, ${Math.round(margen)} € son beneficio`}
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const { apiFetch, clave } = useAdmin();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [inicializando, setInicializando] = useState(false);

  const [periodo, setPeriodo] = useState({ desde: '', hasta: '' });

  const cargar = useCallback(() => {
    setError('');
    const params = new URLSearchParams();
    if (periodo.desde) params.set('desde', periodo.desde);
    if (periodo.hasta || periodo.desde) params.set('hasta', periodo.hasta || periodo.desde);
    apiFetch(`/api/admin/resumen${params.toString() ? `?${params}` : ''}`).then(setDatos).catch((e) => setError(e.message));
  }, [apiFetch, periodo]);

  useEffect(() => { if (clave) cargar(); }, [clave, cargar]);

  const mesHoy = () => {
    const ahora = new Date();
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
  };
  const restarMeses = (n) => {
    const ahora = new Date();
    const f = new Date(ahora.getFullYear(), ahora.getMonth() - n, 1);
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
  };

  const inicializar = async () => {
    setInicializando(true);
    try {
      await apiFetch('/api/admin/setup', { method: 'POST' });
      cargar();
    } catch (e) { setError(e.message); }
    setInicializando(false);
  };

  if (error) {
    return (
      <div style={{ backgroundColor: '#fee2e2', padding: '18px', borderRadius: '8px' }}>
        <strong>Error:</strong> {error}
        <div style={{ marginTop: '10px' }}>
          <button onClick={cargar} style={{ padding: '8px 14px', cursor: 'pointer' }}>Reintentar</button>
        </div>
      </div>
    );
  }
  if (!datos) return <p>Cargando…</p>;

  if (datos.sinBaseDeDatos) {
    return (
      <div style={{ backgroundColor: '#fef3c7', padding: '20px', borderRadius: '10px' }}>
        <h3 style={{ marginTop: 0 }}>Falta conectar la base de datos</h3>
        <p>Añade Postgres (Vercel → Storage → Neon) y pulsa el botón.</p>
        <button onClick={inicializar} disabled={inicializando} style={{ padding: '10px 18px', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          {inicializando ? 'Inicializando…' : '🚀 Inicializar base de datos'}
        </button>
      </div>
    );
  }

  const m = datos.mesActual;
  const p = datos.periodo || { desde: m.mes, hasta: m.mes, duracion: 1, esMesActual: true };
  const maximo = Math.max(...datos.porMes.map((x) => Math.max(x.ingresos, x.gastos)), 1);
  const gastosCategorias = datos.categoriasMes.filter((c) => c.tipo === 'GASTO').sort((a, b) => b.total - a.total);
  const totalGastosMes = gastosCategorias.reduce((s, c) => s + c.total, 0) || 1;
  const nombrePeriodo = p.duracion === 1
    ? `${MESES_LARGO[p.desde.slice(5)]} ${p.desde.slice(0, 4)}`
    : `${MESES_LARGO[p.desde.slice(5)]} ${p.desde.slice(0, 4)} — ${MESES_LARGO[p.hasta.slice(5)]} ${p.hasta.slice(0, 4)}`;
  const etiquetaDelta = p.duracion === 1 ? 'vs mes anterior' : `vs ${p.duracion} meses anteriores`;
  const chipPeriodo = (activo) => ({
    padding: '7px 14px', borderRadius: '999px', border: '1px solid #d1d5db', cursor: 'pointer', fontSize: '13px',
    backgroundColor: activo ? '#111827' : 'white', color: activo ? 'white' : '#374151', fontWeight: activo ? 'bold' : 'normal',
  });
  const esEsteMes = !periodo.desde;
  const esMesPasado = periodo.desde === restarMeses(1) && (periodo.hasta || periodo.desde) === restarMeses(1);
  const esTresMeses = periodo.desde === restarMeses(2) && (periodo.hasta || periodo.desde) === mesHoy();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h2 style={{ margin: '0 0 12px' }}>{nombrePeriodo}</h2>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>
          Actualizado {new Date(datos.actualizadoEl).toLocaleTimeString('es-ES')} ·{' '}
          <a onClick={cargar} style={{ cursor: 'pointer', color: '#2563eb' }}>refrescar</a>
        </span>
      </div>

      {/* Selector de periodo */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
        <button style={chipPeriodo(esEsteMes)} onClick={() => setPeriodo({ desde: '', hasta: '' })}>Este mes</button>
        <button style={chipPeriodo(esMesPasado)} onClick={() => setPeriodo({ desde: restarMeses(1), hasta: restarMeses(1) })}>Mes pasado</button>
        <button style={chipPeriodo(esTresMeses)} onClick={() => setPeriodo({ desde: restarMeses(2), hasta: mesHoy() })}>Últimos 3 meses</button>
        <span style={{ fontSize: '13px', color: '#6b7280', marginLeft: '8px' }}>Personalizado:</span>
        <input
          type="month" value={periodo.desde} max={mesHoy()}
          onChange={(e) => setPeriodo((prev) => ({ desde: e.target.value, hasta: prev.hasta || e.target.value }))}
          style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
        />
        <span style={{ color: '#9ca3af' }}>→</span>
        <input
          type="month" value={periodo.hasta} min={periodo.desde || undefined} max={mesHoy()}
          onChange={(e) => setPeriodo((prev) => ({ desde: prev.desde || e.target.value, hasta: e.target.value }))}
          style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
        />
      </div>

      {/* KPIs del periodo */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <TileGrande titulo="💰 Ingresos" valor={eur(m.ingresos)} color={VERDE} delta={m.deltaIngresos} etiquetaDelta={etiquetaDelta} pie={`${m.numCobros} cobros en el periodo`} />
        <TileGrande titulo="💸 Gastos" valor={eur(m.gastos)} color={ROJO} delta={m.deltaGastos} invertir etiquetaDelta={etiquetaDelta} />
        <TileGrande titulo="📈 Beneficio" valor={eur(m.beneficio)} color={m.beneficio >= 0 ? VERDE : ROJO} delta={m.deltaBeneficio} etiquetaDelta={etiquetaDelta} />
        <AnillaMargen margen={m.margen} />
      </div>

      {/* Aviso de gastos sin clasificar */}
      {datos.sinClasificar.cantidad > 0 && (
        <a href="/admin/gastos?filtro=sin" style={{ textDecoration: 'none' }}>
          <div style={{ backgroundColor: '#fef3c7', border: `1px solid ${AMBAR}33`, padding: '14px 18px', borderRadius: '10px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
            <span style={{ fontSize: '22px' }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <strong style={{ color: '#92400e' }}>{datos.sinClasificar.cantidad} gastos sin clasificar ({eur(datos.sinClasificar.total)})</strong>
              <div style={{ fontSize: '13px', color: '#92400e' }}>Son cargos del banco que no he sabido categorizar — haz clic para ponerles categoría (o dime en el chat cuáles son y lo aprendo).</div>
            </div>
            <span style={{ color: '#92400e', fontWeight: 'bold' }}>Clasificar →</span>
          </div>
        </a>
      )}

      {/* Evolución 12 meses */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Evolución mensual</h3>
          <div style={{ display: 'flex', gap: '14px', fontSize: '13px', color: '#374151' }}>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: VERDE, borderRadius: '2px', marginRight: '5px' }} />Ingresos</span>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: ROJO, borderRadius: '2px', marginRight: '5px' }} />Gastos</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '210px', overflowX: 'auto', paddingTop: '22px', marginTop: '8px' }}>
          {datos.porMes.map((x) => {
            const beneficioMes = Math.round((x.ingresos - x.gastos) * 100) / 100;
            const dentro = x.mes >= p.desde && x.mes <= p.hasta;
            return (
              <div key={x.mes} title={`${etiquetaMes(x.mes)} · Ingresos ${eur(x.ingresos)} · Gastos ${eur(x.gastos)} · Beneficio ${eur(beneficioMes)}`}
                   onClick={() => setPeriodo({ desde: x.mes, hasta: x.mes })}
                   style={{ flex: '1 0 56px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', opacity: dentro ? 1 : 0.4 }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#374151' }}>
                  {x.ingresos >= 1000 ? `${Math.round(x.ingresos / 1000)}k` : Math.round(x.ingresos)}
                </span>
                <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '140px' }}>
                  <div style={{ width: '22px', height: `${(x.ingresos / maximo) * 136 + 2}px`, backgroundColor: VERDE, borderRadius: '4px 4px 0 0' }} />
                  <div style={{ width: '22px', height: `${(x.gastos / maximo) * 136 + 2}px`, backgroundColor: ROJO, borderRadius: '4px 4px 0 0' }} />
                </div>
                <span style={{ fontSize: '11px', color: dentro ? '#111827' : '#6b7280', fontWeight: dentro ? 'bold' : 'normal' }}>{etiquetaMes(x.mes)}</span>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: '12px', color: '#9ca3af', margin: '6px 0 0' }}>💡 Haz clic en cualquier mes de la gráfica para ver solo sus números; el periodo elegido queda resaltado.</p>
      </div>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {/* Gastos por categoría */}
        <div style={{ flex: '1 1 340px', backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ marginTop: 0 }}>¿En qué se va el dinero? <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: 'normal' }}>({nombrePeriodo})</span></h3>
          {gastosCategorias.length === 0 && <p style={{ color: '#9ca3af' }}>Sin gastos en este periodo.</p>}
          {gastosCategorias.map((c) => {
            const pct = Math.round((c.total / totalGastosMes) * 100);
            const esSin = c.categoria === 'Sin clasificar';
            return (
              <div key={c.categoria} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '3px' }}>
                  <span style={{ color: '#374151' }}>{esSin ? '⚠️ ' : ''}{c.categoria}</span>
                  <span><strong>{eur(c.total)}</strong> <span style={{ color: '#9ca3af', fontSize: '12px' }}>{pct}%</span></span>
                </div>
                <div style={{ height: '10px', backgroundColor: '#f3f4f6', borderRadius: '5px' }}>
                  <div style={{ height: '10px', width: `${pct}%`, minWidth: '4px', backgroundColor: esSin ? AMBAR : ROJO, borderRadius: '5px' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Últimos movimientos + morosos */}
        <div style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <a href="/admin/morosos" style={{ textDecoration: 'none' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
              <span style={{ fontSize: '26px' }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Pendiente de cobro (morosos)</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: AMBAR }}>{eur(datos.totalMorosos)} <span style={{ fontSize: '14px', color: '#9ca3af', fontWeight: 'normal' }}>· {datos.morosos.length} alumnos</span></div>
              </div>
              <span style={{ color: '#9ca3af' }}>→</span>
            </div>
          </a>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', flex: 1 }}>
            <h3 style={{ marginTop: 0 }}>Últimos movimientos</h3>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <tbody>
                {datos.ultimosMovimientos.map((mov) => (
                  <tr key={mov.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 4px', color: '#6b7280', whiteSpace: 'nowrap' }}>{mov.fecha.slice(5)}</td>
                    <td style={{ padding: '6px 4px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mov.concepto}>{mov.contacto || mov.concepto}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 'bold', color: mov.tipo === 'INGRESO' ? VERDE : ROJO, whiteSpace: 'nowrap' }}>
                      {mov.tipo === 'INGRESO' ? '+' : '−'}{eur(Math.abs(mov.importe))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaginaAdmin() {
  return (
    <Shell activo="dashboard">
      <Dashboard />
    </Shell>
  );
}
