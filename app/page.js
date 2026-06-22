'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  const manualSync = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/sync-kajabi');
      const data = await response.json();
      setSyncStatus(data);
      setLastSync(new Date());
      setActiveTab('result');
    } catch (error) {
      setSyncStatus({ success: false, error: error.message });
      setActiveTab('result');
    }
    setLoading(false);
  };

  const checkPayments = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/check-failed-payments');
      const data = await response.json();
      setSyncStatus(data);
      setActiveTab('result');
    } catch (error) {
      setSyncStatus({ success: false, error: error.message });
      setActiveTab('result');
    }
    setLoading(false);
  };

  const checkTransactions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/check-transactions');
      const data = await response.json();
      setSyncStatus(data);
      setActiveTab('result');
    } catch (error) {
      setSyncStatus({ success: false, error: error.message });
      setActiveTab('result');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetch('/api/health').catch(console.error);
  }, []);

  const buttonStyle = {
    padding: '12px 20px',
    marginRight: '10px',
    marginBottom: '10px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    transition: 'all 0.3s',
    opacity: loading ? 0.5 : 1,
    pointerEvents: loading ? 'none' : 'auto',
  };

  const tabStyle = {
    padding: '12px 20px',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    fontSize: '14px',
    backgroundColor: 'transparent',
    transition: 'all 0.3s',
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
      <h1>🔄 Kajabi-Airtable Sync</h1>
      <p style={{ fontSize: '16px', color: '#666' }}>Sistema automático de sincronización de pagos</p>

      <div style={{ borderBottom: '2px solid #ddd', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('dashboard')}
          style={{
            ...tabStyle,
            color: activeTab === 'dashboard' ? '#2563eb' : '#666',
            borderBottomColor: activeTab === 'dashboard' ? '#2563eb' : 'transparent',
          }}
        >
          📊 Dashboard
        </button>
        <button
          onClick={() => setActiveTab('result')}
          style={{
            ...tabStyle,
            color: activeTab === 'result' ? '#2563eb' : '#666',
            borderBottomColor: activeTab === 'result' ? '#2563eb' : 'transparent',
          }}
        >
          📋 Resultados
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <div>
          <div style={{
            border: '1px solid #ccc',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '20px',
            backgroundColor: '#f9f9f9'
          }}>
            <h2>🎮 Control Manual</h2>
            <p style={{ color: '#666' }}>Ejecuta las acciones de sincronización de forma manual</p>

            <button
              onClick={manualSync}
              disabled={loading}
              style={{
                ...buttonStyle,
                backgroundColor: '#2563eb',
                color: 'white',
              }}
            >
              {loading ? '⏳ Sincronizando...' : '▶️ Sincronizar Todos los Pagos'}
            </button>

            <button
              onClick={checkPayments}
              disabled={loading}
              style={{
                ...buttonStyle,
                backgroundColor: '#dc2626',
                color: 'white',
              }}
            >
              {loading ? '⏳ Verificando...' : '⚠️ Verificar Pagos Pendientes'}
            </button>

            <button
              onClick={checkTransactions}
              disabled={loading}
              style={{
                ...buttonStyle,
                backgroundColor: '#ea580c',
                color: 'white',
              }}
            >
              {loading ? '⏳ Verificando...' : '❌ Verificar Transacciones Fallidas'}
            </button>
          </div>

          {lastSync && (
            <p style={{ color: '#666', fontSize: '14px' }}>
              ⏱️ Última sincronización: {lastSync.toLocaleString('es-ES')}
            </p>
          )}

          <div style={{
            marginTop: '40px',
            padding: '20px',
            backgroundColor: '#f0f9ff',
            borderRadius: '8px',
            borderLeft: '4px solid #2563eb'
          }}>
            <h3>📋 Información del Sistema</h3>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>Sincronización automática:</strong> Cada día a las 2:00 AM UTC</li>
              <li><strong>Verificación de pagos:</strong> Cada día a las 10:00 AM UTC</li>
              <li><strong>Recordatorios:</strong> Se envían por email después de 3 días sin pago</li>
              <li><strong>Notificaciones:</strong> Se envían automáticamente para pagos fallidos</li>
              <li><strong>Datos sincronizados:</strong> Nombre, email, teléfono, monto, fecha, estado</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'result' && syncStatus && (
        <div style={{
          border: '1px solid #ddd',
          padding: '20px',
          borderRadius: '8px',
          backgroundColor: syncStatus.success ? '#dcfce7' : '#fee2e2',
          marginTop: '20px'
        }}>
          <h3>{syncStatus.success ? '✅ Éxito' : '❌ Error'}</h3>
          <p><strong>Mensaje:</strong> {syncStatus.message || syncStatus.error}</p>

          {syncStatus.data && (
            <div style={{ marginTop: '20px' }}>
              <h4>📊 Detalles de la Operación:</h4>
              {Object.entries(syncStatus.data).map(([key, value]) => {
                if (key === 'details' && Array.isArray(value)) {
                  return (
                    <div key={key} style={{ marginBottom: '15px' }}>
                      <p><strong>{key}:</strong></p>
                      <ul style={{ marginLeft: '20px' }}>
                        {value.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  );
                }
                return (
                  <p key={key}>
                    <strong>{key}:</strong> {JSON.stringify(value)}
                  </p>
                );
              })}
            </div>
          )}

          <pre style={{
            backgroundColor: '#f3f4f6',
            padding: '15px',
            borderRadius: '4px',
            overflow: 'auto',
            maxHeight: '400px',
            marginTop: '20px',
            fontSize: '12px',
          }}>
            {JSON.stringify(syncStatus, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
