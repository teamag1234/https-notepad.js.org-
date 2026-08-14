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
  return { ok: true };
}
