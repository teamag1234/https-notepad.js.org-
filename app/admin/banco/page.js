'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shell, Card, useAdmin } from '../ui.js';

function Banco() {
  const { apiFetch, clave } = useAdmin();
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(() => {
    apiFetch('/api/admin/banco/estado').then(setEstado).catch((e) => setError(e.message));
  }, [apiFetch]);

  useEffect(() => {
    if (!clave) return;
    cargar();
    const params = new URLSearchParams(window.location.search);
    if (params.get('ok')) {
      setAviso(`✅ Banco conectado (${params.get('cuentas') || 0} cuenta/s). Importados ${params.get('nuevos') || 0} movimientos de los últimos 90 días.`);
      window.history.replaceState({}, '', '/admin/banco');
    } else if (params.get('error')) {
      setError(params.get('error'));
      window.history.replaceState({}, '', '/admin/banco');
    }
  }, [clave, cargar]);

  const conectar = async () => {
    setTrabajando(true);
    setError('');
    try {
      const { url, banco } = await apiFetch('/api/admin/banco/conectar', { method: 'POST', body: JSON.stringify({}) });
      setAviso(`Redirigiendo a la autorización de ${banco}…`);
      window.location.href = url;
    } catch (e) {
      setError(e.message);
      setTrabajando(false);
    }
  };

  const sincronizar = async () => {
    setTrabajando(true);
    setError('');
    try {
      const r = await apiFetch('/api/admin/sync-banco');
      setAviso(`✅ Sincronizado: ${r.nuevos ?? 0} movimientos nuevos de ${r.cuentas ?? 0} cuenta/s.`);
      cargar();
    } catch (e) {
      setError(e.message);
    }
    setTrabajando(false);
  };

  const boton = { padding: '10px 18px', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', opacity: trabajando ? 0.5 : 1 };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Banco (Cajamar)</h2>
      {aviso && <p style={{ backgroundColor: '#dcfce7', padding: '12px', borderRadius: '6px' }}>{aviso}</p>}
      {error && <p style={{ backgroundColor: '#fee2e2', padding: '12px', borderRadius: '6px' }}>{error}</p>}
      {!estado && !error && <p>Cargando…</p>}

      {estado && !estado.configurado && (
        <div style={{ backgroundColor: '#fef3c7', padding: '20px', borderRadius: '10px' }}>
          <h3 style={{ marginTop: 0 }}>Falta configurar Enable Banking</h3>
          <p>Para conectar el banco hay que añadir dos variables en Vercel (Settings → Environment Variables):</p>
          <ol style={{ lineHeight: 2 }}>
            <li><strong>ENABLE_BANKING_APP_ID</strong> → el ID de la aplicación creada en enablebanking.com</li>
            <li><strong>ENABLE_BANKING_PRIVATE_KEY</strong> → el contenido del archivo de clave (.pem) que descarga el portal</li>
          </ol>
          <p style={{ fontSize: '13px', color: '#92400e' }}>Después: Deployments → ⋯ → Redeploy, y vuelve a esta página.</p>
        </div>
      )}

      {estado && estado.configurado && estado.diagnostico && estado.diagnostico.claveValida === false && (
        <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '10px', marginBottom: '16px' }}>
          <strong>⚠️ La clave privada guardada en Vercel no es válida.</strong>
          <p style={{ margin: '8px 0 0', fontSize: '14px' }}>
            Se guardaron {estado.diagnostico.caracteresPegados} caracteres ({estado.diagnostico.caracteresBase64} útiles).
            Probablemente se pegó incompleta o se pegó otra cosa. Ve a Vercel → Settings → Environment Variables,
            edita <code>ENABLE_BANKING_PRIVATE_KEY</code> y vuelve a pegar el archivo de clave completo
            (desde -----BEGIN hasta -----END-----). Después: Deployments → ⋯ → Redeploy.
          </p>
          <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#92400e' }}>Detalle técnico: {estado.diagnostico.error}</p>
        </div>
      )}
      {estado && estado.configurado && estado.cuentas.length === 0 && (
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ marginTop: 0 }}>Conectar la cuenta de Cajamar</h3>
          <p>Al pulsar el botón irás a la página de autorización: te identificas en <strong>tu banca online de Cajamar</strong> como siempre y autorizas el acceso de solo lectura (90 días, revocable). Al terminar vuelves aquí automáticamente y se importan los movimientos de los últimos 90 días.</p>
          <button onClick={conectar} disabled={trabajando} style={boton}>
            {trabajando ? 'Un momento…' : '🏦 Conectar banco'}
          </button>
        </div>
      )}

      {estado && estado.cuentas.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <Card titulo="Cuentas conectadas" valor={estado.cuentas.length} />
            <Card
              titulo="Autorización válida hasta"
              valor={estado.cuentas[0].valida_hasta ? new Date(estado.cuentas[0].valida_hasta).toLocaleDateString('es-ES') : '—'}
              pie="Se renueva en un clic cuando caduque"
            />
            <Card
              titulo="Última sincronización"
              valor={estado.cuentas[0].ultima_sync ? new Date(estado.cuentas[0].ultima_sync).toLocaleString('es-ES') : 'Nunca'}
              pie="Automática cada día a las 7:00"
            />
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            {estado.cuentas.map((c) => (
              <p key={c.uid} style={{ margin: '6px 0' }}>🏦 <strong>{c.nombre}</strong> {c.iban && <span style={{ color: '#6b7280' }}>· {c.iban}</span>}</p>
            ))}
            <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
              <button onClick={sincronizar} disabled={trabajando} style={boton}>
                {trabajando ? 'Sincronizando…' : '🔄 Sincronizar ahora'}
              </button>
              <button onClick={conectar} disabled={trabajando} style={{ ...boton, backgroundColor: '#6b7280' }}>
                Renovar autorización
              </button>
            </div>
            <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '12px' }}>
              Los cargos entran como gastos clasificados automáticamente (nóminas, seguros sociales, impuestos, ads, software…).
              Los abonos de Kajabi/Stripe se marcan como "Traspaso Kajabi" para no contarlos dos veces.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export default function PaginaBanco() {
  return (
    <Shell activo="banco">
      <Banco />
    </Shell>
  );
}
