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
        <p>Gracias,<br>El equipo de AG Academy</p>
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
        <p>Gracias,<br>El equipo de AG Academy</p>
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

export async function sendTelegramOnboardingEmail(studentEmail, studentName, courseName, deepLink, extraNote = '') {
  try {
    console.log(`Sending Telegram onboarding email to ${studentEmail}`);

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: studentEmail,
      subject: `🎓 Tu acceso a ${courseName} — completa tu alta en Telegram`,
      html: `
        <h2>¡Bienvenido/a ${studentName}!</h2>
        <p>Ya estás inscrito/a en <strong>${courseName}</strong>. El curso funciona a través de un grupo privado de Telegram, donde recibirás los contenidos, avisos y soporte.</p>
        ${extraNote ? `<p style="background: #FFF6DD; border-left: 4px solid #F5A623; padding: 12px 16px; border-radius: 4px;">${extraNote}</p>` : ''}
        <p>Para completar tu alta, pulsa este botón (es tu enlace personal, no lo compartas):</p>
        <p style="margin: 24px 0;">
          <a href="${deepLink}" style="background: #2AABEE; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            👉 Completar mi alta en Telegram
          </a>
        </p>
        <p>Al pulsarlo se abrirá Telegram y nuestro asistente te guiará: te mostrará las condiciones del curso para que las aceptes y te dará tu acceso personal al grupo.</p>
        <p><strong>¿No tienes Telegram?</strong> Es gratis y se instala en 1 minuto:</p>
        <ul>
          <li>📱 Móvil: descárgalo desde tu tienda de aplicaciones (App Store / Google Play) y luego vuelve a pulsar el botón de arriba.</li>
          <li>💻 Ordenador: <a href="https://desktop.telegram.org">desktop.telegram.org</a> o <a href="https://web.telegram.org">web.telegram.org</a>.</li>
        </ul>
        <p>Si tienes cualquier problema con el acceso, responde a este email y te ayudamos.</p>
        <p>Un saludo,<br>El equipo de AG Academy</p>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Onboarding email sent to ${studentEmail}:`, info.response);
    return true;
  } catch (error) {
    console.error(`Error sending onboarding email to ${studentEmail}:`, error.message);
    return false;
  }
}

export async function sendConsentConfirmationEmail(studentEmail, studentName, courseName, conditionsUrl, conditionsVersion, acceptedAt) {
  try {
    console.log(`Sending consent confirmation email to ${studentEmail}`);

    const acceptedDate = new Date(acceptedAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: studentEmail,
      subject: `✅ Confirmación de aceptación de condiciones — ${courseName}`,
      html: `
        <h2>Hola ${studentName},</h2>
        <p>Este email es tu justificante de que has leído y aceptado las condiciones del curso <strong>${courseName}</strong>.</p>
        <p><strong>Detalles del registro:</strong></p>
        <ul>
          <li><strong>Documento aceptado:</strong> <a href="${conditionsUrl}">Condiciones del curso</a> (versión ${conditionsVersion})</li>
          <li><strong>Fecha y hora de aceptación:</strong> ${acceptedDate} (hora peninsular española)</li>
          <li><strong>Medio:</strong> confirmación expresa mediante botón de aceptación en Telegram</li>
          <li><strong>Email asociado:</strong> ${studentEmail}</li>
        </ul>
        <p>Te recomendamos guardar este email. Puedes consultar las condiciones en cualquier momento en el enlace anterior.</p>
        <p>Si no has sido tú quien ha realizado esta aceptación, responde a este email inmediatamente.</p>
        <p>Un saludo,<br>El equipo de AG Academy</p>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Consent confirmation email sent to ${studentEmail}:`, info.response);
    return true;
  } catch (error) {
    console.error(`Error sending consent confirmation email to ${studentEmail}:`, error.message);
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
