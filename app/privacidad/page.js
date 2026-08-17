export const metadata = { title: 'Política de privacidad · AG Academy' };

export default function Privacidad() {
  return (
    <main style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 20px', lineHeight: 1.7 }}>
      <h1>Política de privacidad</h1>
      <p><strong>AG Academy</strong> — Panel interno de administración.</p>
      <p>
        Esta aplicación es una herramienta interna de gestión de AG Academy. Los datos que trata
        (movimientos bancarios, pagos de alumnos y gastos) se utilizan exclusivamente para la
        administración interna de la academia y no se comparten con terceros ni se usan con fines
        comerciales o publicitarios.
      </p>
      <p>
        El acceso a los datos bancarios se realiza mediante Enable Banking, proveedor autorizado de
        servicios de información de cuenta conforme a la normativa europea PSD2, en modo de solo
        lectura y únicamente sobre las cuentas propias de AG Academy. La autorización puede
        revocarse en cualquier momento desde la banca online de la entidad.
      </p>
      <p>
        Los datos se almacenan cifrados en infraestructura de Vercel y Neon (Postgres) dentro de la
        Unión Europea o bajo cláusulas contractuales tipo. El acceso a la aplicación está protegido
        por contraseña y limitado al personal administrativo de AG Academy.
      </p>
      <p>
        Para cualquier cuestión sobre protección de datos: <strong>agacademyoffice@gmail.com</strong>
      </p>
    </main>
  );
}
