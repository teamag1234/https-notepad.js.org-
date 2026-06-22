import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export async function sendPaymentReminder(studentEmail, studentName, amount, dueDate) {
  try {
    console.log(`Sending payment reminder to ${studentEmail}`);

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: studentEmail,
      subject: '⏰ Recordatorio: Tu pago pendiente',
      html: `
        <h2>Hola ${studentName},</h2>
        <p>Te enviamos este recordatorio sobre tu pago pendiente.</p>
        <p><strong>Monto:</strong> $${amount}</p>
        <p><strong>Fecha límite:</strong> ${new Date(dueDate).toLocaleDateString('es-ES')}</p>
        <p>Por favor, completa tu pago lo antes posible.</p>
        <p>Si ya realizaste el pago, ignora este mensaje.</p>
        <p>Gracias,<br>Tu Academia</p>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${studentEmail}:`, info.response);
    return true;
  } catch (error) {
    console.error(`Error sending email to ${studentEmail}:`, error.message);
    return false;
  }
}

export async function sendFailedPaymentNotification(studentEmail, studentName, amount) {
  try {
    console.log(`Sending failed payment notification to ${studentEmail}`);

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: studentEmail,
      subject: '❌ Notificación: Pago rechazado',
      html: `
        <h2>Hola ${studentName},</h2>
        <p>Tu pago de $${amount} ha sido rechazado.</p>
        <p>Por favor, verifica tu información de pago e intenta nuevamente.</p>
        <p>Si tienes problemas, contáctanos para asistencia.</p>
        <p>Gracias,<br>Tu Academia</p>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${studentEmail}:`, info.response);
    return true;
  } catch (error) {
    console.error(`Error sending email to ${studentEmail}:`, error.message);
    return false;
  }
}

export async function sendSyncReport(adminEmail, report) {
  try {
    console.log(`Sending sync report to ${adminEmail}`);

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: adminEmail,
      subject: '📊 Reporte de Sincronización de Pagos',
      html: `
        <h2>Reporte de Sincronización</h2>
        <p><strong>Hora:</strong> ${new Date().toLocaleString('es-ES')}</p>
        <p><strong>Pagos sincronizados:</strong> ${report.synced || 0}</p>
        <p><strong>Pagos actualizados:</strong> ${report.updated || 0}</p>
        <p><strong>Recordatorios enviados:</strong> ${report.reminders || 0}</p>
        <p><strong>Notificaciones de fallo:</strong> ${report.failed || 0}</p>
        <p><strong>Errores:</strong> ${report.errors || 0}</p>
        ${report.details ? `<pre>${report.details}</pre>` : ''}
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Report email sent to ${adminEmail}:`, info.response);
    return true;
  } catch (error) {
    console.error(`Error sending report email:`, error.message);
    return false;
  }
}
