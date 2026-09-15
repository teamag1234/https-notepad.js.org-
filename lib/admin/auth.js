// Autenticación del panel de administración. La clave se define en la variable
// de entorno ADMIN_PASSWORD (Vercel → Settings → Environment Variables) y el
// navegador la envía en la cabecera x-admin-key tras iniciar sesión en /admin.
export function comprobarAdmin(request) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return { ok: false, status: 500, error: 'Falta configurar ADMIN_PASSWORD en las variables de entorno' };
  }
  const clave = request.headers.get('x-admin-key');
  if (clave !== password) {
    return { ok: false, status: 401, error: 'Clave de administración incorrecta' };
  }
  return { ok: true, rol: 'admin' };
}

// Acceso limitado SOLO a la sección de facturas: el equipo entra con la clave
// FACTURAS_PASSWORD (si está definida) y puede buscar y enviar facturas, pero
// ninguna otra ruta del panel acepta esa clave.
export function comprobarFacturas(request) {
  const admin = comprobarAdmin(request);
  if (admin.ok) return admin;
  const claveFacturas = process.env.FACTURAS_PASSWORD;
  const clave = request.headers.get('x-admin-key');
  if (claveFacturas && clave === claveFacturas) {
    return { ok: true, rol: 'facturas' };
  }
  return { ok: false, status: 401, error: 'Clave incorrecta' };
}
