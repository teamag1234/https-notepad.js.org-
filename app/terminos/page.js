export const metadata = { title: 'Términos de uso · AG Academy' };

export default function Terminos() {
  return (
    <main style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 20px', lineHeight: 1.7 }}>
      <h1>Términos de uso</h1>
      <p><strong>AG Academy</strong> — Panel interno de administración.</p>
      <p>
        Esta aplicación es de uso exclusivamente interno para el equipo administrativo de AG
        Academy. No es un servicio ofrecido al público ni a terceros.
      </p>
      <p>
        La aplicación consulta información de cuentas bancarias propias de AG Academy a través de
        Enable Banking (proveedor autorizado PSD2), en modo de solo lectura, con el único fin de
        llevar la contabilidad interna de ingresos y gastos. No se realizan pagos ni operaciones
        sobre las cuentas.
      </p>
      <p>
        El acceso está restringido mediante contraseña. Cualquier uso no autorizado queda
        prohibido.
      </p>
      <p>Contacto: <strong>agacademyoffice@gmail.com</strong></p>
    </main>
  );
}
