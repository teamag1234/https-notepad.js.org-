'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shell, Card, useAdmin, eur } from './ui.js';

const MESES_ES = { '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic' };
const etiquetaMes = (clave) => `${MESES_ES[clave.slice(5)]} ${clave.slice(2, 4)}`;

function Dashboard() {
  const { apiFetch, clave } = useAdmin();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [inicializando, setInicializando] = useState(false);

  const cargar = useCallback(() => {
    setError('');
    apiFetch('/api/admin/resumen').then(setDatos).catch((e) => setError(e.message));
  }, [apiFetch]);

  useEffect(() => { if (clave) cargar(); }, [clave, cargar]);

  const inicializar = async () => {
    setInicializando(true);
    try {
      await apiFetch('/api/admin/setup', { method: 'POST' });
      cargar();
    } catch (e) {
      setError(e.message);
    }
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
        <p>Añade una base de datos Postgres al proyecto (Vercel → Storage → Neon Postgres) y pulsa el botón para crear las tablas e importar el histórico de Kajabi.</p>
        <button
          onClick={inicializar}
          disabled={inicializando}
          style={{ padding: '10px 18px', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {inicializando ? 'Inicializando…' : '🚀 Inicializar base de datos'}
        </button>
        <p style={{ fontSize: '13px', color: '#92400e' }}>Mientras tanto, el apartado de Morosos ya funciona en vivo desde Airtable ({datos.morosos?.length ?? 0} morosos, {eur(datos.totalMorosos)}).</p>
      </div>
    );
  }

  const maximo = Math.max(...datos.porMes.map((m) => Math.max(m.ingresos, m.gastos)), 1);
  const gastosCategorias = datos.categoriasMes.filter((c) => c.tipo === 'GASTO');
  const totalGastosMes = gastosCategorias.reduce((s, c) => s + c.total, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h2 style={{ margin: '0 0 16px' }}>Resumen · {etiquetaMes(datos.mesActual.mes)}</h2>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>
          Actualizado {new Date(datos.actualizadoEl).toLocaleString('es-ES')} ·{' '}
          <a onClick={cargar} style={{ cursor: 'pointer', color: '#2563eb' }}>refrescar</a>
        </span>
      </div>

      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <Card titulo="Ingresos del mes" valor={eur(datos.mesActual.ingresos)} color="#059669" pie={`${datos.mesActual.numCobros} cobros`} />
        <Card titulo="Gastos del mes" valor={eur(datos.mesActual.gastos)} color="#dc2626" />
        <Card titulo="Beneficio del mes" valor={eur(datos.mesActual.beneficio)} color={datos.mesActual.beneficio >= 0 ? '#059669' : '#dc2626'} />
        <Card titulo="Morosos" valor={eur(datos.totalMorosos)} color="#d97706" pie={`${datos.morosos.length} alumnos deben dinero`} />
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '24px' }}>
        <h3 style={{ marginTop: 0 }}>Ingresos vs gastos (últimos 12 meses)</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '190px', overflowX: 'auto', paddingTop: '10px' }}>
          {datos.porMes.map((m) => (
            <div key={m.mes} style={{ flex: '1 0 52px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '140px' }}>
                <div title={`Ingresos ${eur(m.ingresos)}`} style={{ width: '20px', height: `${(m.ingresos / maximo) * 135 + 2}px`, backgroundColor: '#059669', borderRadius: '3px 3px 0 0' }} />
                <div title={`Gastos ${eur(m.gastos)}`} style={{ width: '20px', height: `${(m.gastos / maximo) * 135 + 2}px`, backgroundColor: '#dc2626', borderRadius: '3px 3px 0 0' }} />
              </div>
              <span style={{ fontSize: '11px', color: '#6b7280' }}>{etiquetaMes(m.mes)}</span>
              <span style={{ fontSize: '10px', color: '#059669' }}>{Math.round(m.ingresos)}€</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: '#9ca3af' }}>🟩 ingresos · 🟥 gastos — los ingresos llegan solos desde Kajabi; los gastos se apuntan en la pestaña Gastos.</p>
      </div>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', backgroundColor: 'white', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ marginTop: 0 }}>Gastos del mes por categoría</h3>
          {gastosCategorias.length === 0 && <p style={{ color: '#9ca3af' }}>Aún no hay gastos este mes. Añádelos en la pestaña Gastos.</p>}
          {gastosCategorias.map((c) => (
            <div key={c.categoria} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>{c.categoria}</span><strong>{eur(c.total)}</strong>
              </div>
              <div style={{ height: '8px', backgroundColor: '#f3f4f6', borderRadius: '4px' }}>
                <div style={{ height: '8px', width: `${(c.total / (totalGastosMes || 1)) * 100}%`, backgroundColor: '#dc2626', borderRadius: '4px' }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: '1 1 380px', backgroundColor: 'white', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ marginTop: 0 }}>Últimos movimientos</h3>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <tbody>
              {datos.ultimosMovimientos.map((m) => (
                <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '6px 4px', color: '#6b7280', whiteSpace: 'nowrap' }}>{m.fecha.slice(5)}</td>
                  <td style={{ padding: '6px 4px' }}>{m.contacto || m.concepto}</td>
                  <td style={{ padding: '6px 4px', color: '#9ca3af' }}>{m.categoria}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 'bold', color: m.tipo === 'INGRESO' ? '#059669' : '#dc2626', whiteSpace: 'nowrap' }}>
                    {m.tipo === 'INGRESO' ? '+' : '−'}{eur(Math.abs(m.importe))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
