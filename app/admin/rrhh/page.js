'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shell, Card, useAdmin, eur } from '../ui.js';

const inputStyle = { padding: '9px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' };
const label = { fontSize: '12px', color: '#6b7280' };
const campo = (flex = '1 1 150px') => ({ display: 'flex', flexDirection: 'column', gap: '4px', flex });

function RRHH() {
  const { apiFetch, clave } = useAdmin();
  const [datos, setDatos] = useState(null);
  const [sel, setSel] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [alta, setAlta] = useState({ nombre: '', email: '', puesto: '', fecha_alta: '', dias_vacaciones: 23 });
  const [doc, setDoc] = useState({ tipo: 'NÓMINA', titulo: '', mes: '', url: '', archivo: null });
  const [vaca, setVaca] = useState({ desde: '', hasta: '', notas: '' });
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(() => {
    apiFetch('/api/admin/rrhh').then(setDatos).catch((e) => setError(e.message));
  }, [apiFetch]);

  const cargarDetalle = useCallback((id, perfil) => {
    setDetalle(null);
    apiFetch(`/api/admin/rrhh?trabajador=${id}${perfil ? `&perfil=${perfil}` : ''}`).then(setDetalle).catch((e) => setError(e.message));
  }, [apiFetch]);

  useEffect(() => { if (clave) cargar(); }, [clave, cargar]);
  useEffect(() => { if (sel) cargarDetalle(sel.id, sel.perfilAgapp); }, [sel, cargarDetalle]);

  const accion = async (cuerpo, mensaje) => {
    setTrabajando(true);
    setError('');
    try {
      await apiFetch('/api/admin/rrhh', { method: 'POST', body: JSON.stringify(cuerpo) });
      if (mensaje) setAviso(mensaje);
      cargar();
      if (sel) cargarDetalle(sel.id, sel.perfilAgapp);
    } catch (e) { setError(e.message); }
    setTrabajando(false);
  };

  const crearTrabajador = async (e) => {
    e.preventDefault();
    await accion({ accion: 'crear-trabajador', ...alta }, `✅ ${alta.nombre} dado de alta`);
    setAlta({ nombre: '', email: '', puesto: '', fecha_alta: '', dias_vacaciones: 23 });
    setAltaAbierta(false);
  };

  const abrirDocumento = async (d) => {
    // Los archivos privados se sirven autenticados; los enlaces (Drive) se abren directo
    if (!/\.private\.blob\.vercel-storage\.com\//.test(d.url)) {
      window.open(d.url, '_blank');
      return;
    }
    try {
      const key = localStorage.getItem('agAdminKey');
      const r = await fetch(`/api/admin/rrhh/archivo?id=${d.id}`, { headers: { 'x-admin-key': key || '' } });
      if (!r.ok) throw new Error('No se pudo abrir el documento');
      const blob = await r.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (e) { setError(e.message); }
  };

  const subirDocumento = async (e) => {
    e.preventDefault();
    setTrabajando(true);
    setError('');
    try {
      if (doc.archivo) {
        const form = new FormData();
        form.append('archivo', doc.archivo);
        form.append('trabajador_id', sel.id);
        form.append('tipo', doc.tipo);
        form.append('titulo', doc.titulo || doc.archivo.name);
        form.append('mes', doc.mes);
        const key = localStorage.getItem('agAdminKey');
        const r = await fetch('/api/admin/rrhh/subir', { method: 'POST', headers: { 'x-admin-key': key || '' }, body: form });
        const j = await r.json();
        if (!j.success) throw new Error(j.error);
      } else if (doc.url) {
        await apiFetch('/api/admin/rrhh', {
          method: 'POST',
          body: JSON.stringify({ accion: 'crear-documento', trabajador_id: sel.id, tipo: doc.tipo, titulo: doc.titulo || 'Documento', mes: doc.mes, url: doc.url }),
        });
      } else {
        throw new Error('Elige un archivo o pega un enlace');
      }
      setAviso('✅ Documento guardado');
      setDoc({ tipo: doc.tipo, titulo: '', mes: '', url: '', archivo: null });
      cargarDetalle(sel.id, sel.perfilAgapp);
      cargar();
    } catch (e2) { setError(e2.message); }
    setTrabajando(false);
  };

  if (error && !datos) return <p style={{ backgroundColor: '#fee2e2', padding: '12px', borderRadius: '6px' }}>{error}</p>;
  if (!datos) return <p>Cargando…</p>;

  const t = sel ? datos.trabajadores.find((x) => x.id === sel.id) : null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: '0 0 12px' }}>👥 RRHH {t && <span style={{ color: '#9ca3af' }}>· {t.nombre}</span>}</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {sel && <button onClick={() => setSel(null)} style={{ padding: '8px 14px', border: '1px solid #d1d5db', background: 'white', borderRadius: '6px', cursor: 'pointer' }}>← Volver al equipo</button>}
          <span style={{ fontSize: '13px', color: datos.fichajeIntegrado ? '#059669' : '#9ca3af' }}>
            {datos.fichajeIntegrado ? '🔗 Fichaje conectado con app.ag-app.es' : '⚪ Fichaje sin conectar'}
          </span>
          {!sel && <button onClick={() => setAltaAbierta(!altaAbierta)} style={{ padding: '8px 14px', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>+ Alta trabajador</button>}
        </div>
      </div>
      {aviso && <p style={{ backgroundColor: '#dcfce7', padding: '10px', borderRadius: '6px' }}>{aviso}</p>}
      {error && <p style={{ backgroundColor: '#fee2e2', padding: '10px', borderRadius: '6px' }}>{error}</p>}

      {datos.diagAgapp && datos.diagAgapp.definida && datos.diagAgapp.ok === false && (
        <div style={{ backgroundColor: '#fee2e2', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px', fontSize: '14px' }}>
          <strong>⚠️ La clave AGAPP_SUPABASE_KEY está puesta en Vercel pero no funciona.</strong>
          <p style={{ margin: '6px 0 0' }}>
            Se guardaron {datos.diagAgapp.caracteres} caracteres (empieza por "{datos.diagAgapp.prefijo}…").
            {String(datos.diagAgapp.prefijo || '').includes('•') || datos.diagAgapp.error?.startsWith('401')
              ? ' Parece una clave incorrecta o pegada desde el texto oculto (puntitos): vuelve a Supabase, usa el botón de COPIAR junto a la clave secreta, pégala de nuevo en Vercel y haz Redeploy.'
              : ' Revisa que sea la clave secreta (service_role / sb_secret_…) y no la publishable, y haz Redeploy tras guardar.'}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#92400e' }}>Detalle técnico: {datos.diagAgapp.error}</p>
        </div>
      )}
      {!datos.fichajeIntegrado && !(datos.diagAgapp && datos.diagAgapp.definida) && (
        <div style={{ backgroundColor: '#fef3c7', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px', fontSize: '14px' }}>
          <strong>🔗 Conecta el fichaje de app.ag-app.es</strong> para ver aquí las horas reales del equipo
          (el equipo sigue fichando en su app de siempre, este panel solo lee):
          <ol style={{ margin: '8px 0 0', paddingLeft: '20px', lineHeight: 1.9 }}>
            <li>Entra en <strong>supabase.com</strong> con la cuenta donde está el proyecto de la app</li>
            <li>Proyecto → ⚙️ <strong>Project Settings</strong> → <strong>API Keys</strong> → copia la clave <strong>secreta</strong> (service_role / secret)</li>
            <li>En Vercel → Environment Variables añade <code>AGAPP_SUPABASE_KEY</code> con esa clave → Redeploy</li>
          </ol>
        </div>
      )}

      {/* ALTA */}
      {altaAbierta && !sel && (
        <form onSubmit={crearTrabajador} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '18px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={campo('2 1 180px')}><label style={label}>Nombre *</label><input required value={alta.nombre} onChange={(e) => setAlta({ ...alta, nombre: e.target.value })} style={inputStyle} /></div>
          <div style={campo()}><label style={label}>Email</label><input value={alta.email} onChange={(e) => setAlta({ ...alta, email: e.target.value })} style={inputStyle} /></div>
          <div style={campo()}><label style={label}>Puesto</label><input value={alta.puesto} onChange={(e) => setAlta({ ...alta, puesto: e.target.value })} style={inputStyle} placeholder="Teacher, Ventas…" /></div>
          <div style={campo('0 1 140px')}><label style={label}>Fecha alta</label><input type="date" value={alta.fecha_alta} onChange={(e) => setAlta({ ...alta, fecha_alta: e.target.value })} style={inputStyle} /></div>
          <div style={campo('0 1 110px')}><label style={label}>Días vacaciones/año</label><input type="number" value={alta.dias_vacaciones} onChange={(e) => setAlta({ ...alta, dias_vacaciones: Number(e.target.value) })} style={inputStyle} /></div>
          <button type="submit" disabled={trabajando} style={{ padding: '10px 20px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Dar de alta</button>
        </form>
      )}

      {/* LISTA DE EQUIPO */}
      {!sel && (
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          {datos.trabajadores.length === 0 && (
            <div style={{ backgroundColor: '#f0f9ff', borderRadius: '10px', padding: '20px', width: '100%' }}>
              Todavía no hay trabajadores. Pulsa <strong>"+ Alta trabajador"</strong> para crear la primera ficha,
              o conecta el fichaje de app.ag-app.es y el equipo aparecerá aquí automáticamente.
            </div>
          )}
          {datos.trabajadores.map((x) => (
            <div key={x.id} onClick={() => setSel(x)} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', flex: '1 1 260px', maxWidth: '340px', cursor: 'pointer', opacity: x.activo ? 1 : 0.55 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong style={{ fontSize: '17px' }}>{x.nombre}</strong>
                {x.trabajandoAhora ? <span style={{ fontSize: '12px', color: '#059669', fontWeight: 'bold' }}>🟢 trabajando</span> : !x.activo && <span style={{ fontSize: '12px', color: '#9ca3af' }}>inactivo</span>}
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '10px' }}>{x.puesto || '—'}</div>
              <div style={{ display: 'flex', gap: '14px', fontSize: '13px', flexWrap: 'wrap' }}>
                <span>🕐 <strong>{x.horasSemana}h</strong> esta semana</span>
                <span>🏖 <strong>{x.vacacionesRestantes}</strong>/{x.dias_vacaciones} días</span>
                <span>📄 {x.numDocumentos}</span>
              </div>
              {datos.fichajeIntegrado && !x.perfilAgapp && <div style={{ fontSize: '12px', color: '#d97706', marginTop: '8px' }}>⚠️ Sin cuenta en app.ag-app.es (empareja por email)</div>}
            </div>
          ))}
        </div>
      )}

      {/* FICHA DEL TRABAJADOR */}
      {sel && t && (
        <>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '18px' }}>
            <Card titulo="Horas hoy" valor={`${t.horasHoy}h`} pie={t.trabajandoAhora ? '🟢 trabajando ahora' : 'no está fichado'} />
            <Card titulo="Horas esta semana" valor={`${t.horasSemana}h`} pie={`${t.horasMes}h este mes`} />
            <Card titulo="Vacaciones" valor={`${t.vacacionesRestantes} días`} pie={`de ${t.dias_vacaciones} · usados ${t.vacacionesUsadas}`} color={t.vacacionesRestantes < 5 ? '#d97706' : '#111827'} />
          </div>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* DOCUMENTOS Y NÓMINAS */}
            <div style={{ flex: '1 1 380px', backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <h3 style={{ marginTop: 0 }}>📄 Documentos y nóminas</h3>
              <form onSubmit={subirDocumento} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '14px', backgroundColor: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                <div style={campo('0 1 110px')}><label style={label}>Tipo</label>
                  <select value={doc.tipo} onChange={(e) => setDoc({ ...doc, tipo: e.target.value })} style={inputStyle}>
                    <option>NÓMINA</option><option>CONTRATO</option><option>OTRO</option>
                  </select>
                </div>
                <div style={campo()}><label style={label}>Título</label><input value={doc.titulo} onChange={(e) => setDoc({ ...doc, titulo: e.target.value })} style={inputStyle} placeholder="Nómina agosto" /></div>
                {doc.tipo === 'NÓMINA' && <div style={campo('0 1 130px')}><label style={label}>Mes</label><input type="month" value={doc.mes} onChange={(e) => setDoc({ ...doc, mes: e.target.value })} style={inputStyle} /></div>}
                <div style={campo('1 1 170px')}><label style={label}>Archivo {datos.blobConfigurado ? '' : '(activa Blob en Vercel→Storage)'}</label>
                  <input type="file" onChange={(e) => setDoc({ ...doc, archivo: e.target.files[0] || null })} style={{ fontSize: '13px' }} disabled={!datos.blobConfigurado} />
                </div>
                <div style={campo('1 1 170px')}><label style={label}>…o enlace (Drive, etc.)</label><input value={doc.url} onChange={(e) => setDoc({ ...doc, url: e.target.value })} style={inputStyle} placeholder="https://…" /></div>
                <button type="submit" disabled={trabajando} style={{ padding: '9px 16px', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Guardar</button>
              </form>
              {!detalle && <p>Cargando…</p>}
              {detalle && detalle.documentos.length === 0 && <p style={{ color: '#9ca3af' }}>Sin documentos todavía.</p>}
              {detalle && detalle.documentos.map((d) => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', borderTop: '1px solid #f3f4f6', fontSize: '14px', gap: '8px', flexWrap: 'wrap' }}>
                  <span>{d.tipo === 'NÓMINA' ? '💶' : d.tipo === 'CONTRATO' ? '📑' : '📄'} <a onClick={() => abrirDocumento(d)} style={{ color: '#2563eb', cursor: 'pointer' }}>{d.titulo}</a> {d.mes && <span style={{ color: '#9ca3af', fontSize: '12px' }}>({d.mes})</span>}</span>
                  <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {d.firmado ? (
                      <span title={`Firmado por ${d.firma_nombre || ''}`} style={{ fontSize: '12px', color: '#059669', fontWeight: 'bold' }}>✍️ firmado {d.firmado}</span>
                    ) : d.avisado ? (
                      <span style={{ fontSize: '12px', color: '#d97706', fontWeight: 'bold' }}>⏳ enviado · sin firmar</span>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#9ca3af' }}>— sin aviso (¿email del trabajador?)</span>
                    )}
                    <span style={{ color: '#9ca3af', fontSize: '12px' }}>{d.subido}</span>
                    <button onClick={() => accion({ accion: 'borrar-documento', id: d.id })} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}>🗑️</button>
                  </span>
                </div>
              ))}
            </div>

            {/* VACACIONES */}
            <div style={{ flex: '1 1 340px', backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <h3 style={{ marginTop: 0 }}>🏖 Vacaciones</h3>
              <form onSubmit={async (e) => { e.preventDefault(); await accion({ accion: 'crear-vacaciones', trabajador_id: sel.id, ...vaca }, '✅ Vacaciones anotadas'); setVaca({ desde: '', hasta: '', notas: '' }); }}
                    style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '14px', backgroundColor: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                <div style={campo('0 1 140px')}><label style={label}>Desde</label><input required type="date" value={vaca.desde} onChange={(e) => setVaca({ ...vaca, desde: e.target.value })} style={inputStyle} /></div>
                <div style={campo('0 1 140px')}><label style={label}>Hasta</label><input required type="date" value={vaca.hasta} min={vaca.desde} onChange={(e) => setVaca({ ...vaca, hasta: e.target.value })} style={inputStyle} /></div>
                <button type="submit" disabled={trabajando} style={{ padding: '9px 16px', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Añadir</button>
              </form>
              {detalle && detalle.vacaciones.length === 0 && <p style={{ color: '#9ca3af' }}>Sin vacaciones anotadas este año.</p>}
              {detalle && detalle.vacaciones.map((v) => (
                <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', borderTop: '1px solid #f3f4f6', fontSize: '14px' }}>
                  <span>{v.desde} → {v.hasta} <strong>({v.dias} días)</strong></span>
                  <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <select value={v.estado} onChange={(e) => accion({ accion: 'estado-vacaciones', id: v.id, estado: e.target.value })}
                            style={{ padding: '4px 6px', borderRadius: '6px', fontSize: '12px', border: '1px solid #d1d5db', backgroundColor: v.estado === 'APROBADA' ? '#dcfce7' : v.estado === 'RECHAZADA' ? '#fee2e2' : '#fef3c7' }}>
                      <option>APROBADA</option><option>PENDIENTE</option><option>RECHAZADA</option>
                    </select>
                    <button onClick={() => accion({ accion: 'borrar-vacaciones', id: v.id })} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}>🗑️</button>
                  </span>
                </div>
              ))}

              <h3>🕐 Últimos fichajes {t.perfilAgapp && <span style={{ fontSize: '12px', color: '#059669', fontWeight: 'normal' }}>(desde app.ag-app.es)</span>}</h3>
              {detalle && detalle.fichajes.length === 0 && <p style={{ color: '#9ca3af' }}>Sin fichajes todavía.</p>}
              {detalle && detalle.fichajes.map((f) => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px', borderTop: '1px solid #f3f4f6', fontSize: '13px' }}>
                  <span>{f.entrada} → {f.abierto ? <strong style={{ color: '#059669' }}>trabajando</strong> : f.salida}</span>
                  <strong>{f.horas}h</strong>
                </div>
              ))}
            </div>

            {/* DATOS */}
            <div style={{ flex: '1 1 280px', backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <h3 style={{ marginTop: 0 }}>⚙️ Datos</h3>
              <FormEditar t={t} onGuardar={(campos) => accion({ accion: 'editar-trabajador', id: t.id, campos }, '✅ Ficha actualizada')} trabajando={trabajando} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FormEditar({ t, onGuardar, trabajando }) {
  const [f, setF] = useState({ nombre: t.nombre, email: t.email || '', puesto: t.puesto || '', fecha_alta: t.fecha_alta || '', dias_vacaciones: t.dias_vacaciones, pin: '', activo: t.activo, notas: t.notas || '' });
  useEffect(() => {
    setF({ nombre: t.nombre, email: t.email || '', puesto: t.puesto || '', fecha_alta: t.fecha_alta || '', dias_vacaciones: t.dias_vacaciones, pin: '', activo: t.activo, notas: t.notas || '' });
  }, [t.id]);
  const enviar = (e) => {
    e.preventDefault();
    const campos = { ...f };
    if (!campos.pin) delete campos.pin; // vacío = no cambiar el PIN
    onGuardar(campos);
  };
  return (
    <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={campo('1')}><label style={label}>Nombre</label><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} style={inputStyle} /></div>
      <div style={campo('1')}><label style={label}>Email</label><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={inputStyle} /></div>
      <div style={campo('1')}><label style={label}>Puesto</label><input value={f.puesto} onChange={(e) => setF({ ...f, puesto: e.target.value })} style={inputStyle} /></div>
      <div style={campo('1')}><label style={label}>Fecha de alta</label><input type="date" value={f.fecha_alta} onChange={(e) => setF({ ...f, fecha_alta: e.target.value })} style={inputStyle} /></div>
      <div style={campo('1')}><label style={label}>Días de vacaciones/año</label><input type="number" value={f.dias_vacaciones} onChange={(e) => setF({ ...f, dias_vacaciones: Number(e.target.value) })} style={inputStyle} /></div>
      <div style={campo('1')}><label style={label}>Notas</label><textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} style={{ ...inputStyle, minHeight: '60px' }} /></div>
      <label style={{ fontSize: '14px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activo en plantilla
      </label>
      <button type="submit" disabled={trabajando} style={{ padding: '10px', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Guardar cambios</button>
    </form>
  );
}

export default function PaginaRRHH() {
  return (
    <Shell activo="rrhh">
      <RRHH />
    </Shell>
  );
}
