import crypto from 'crypto';
import axios from 'axios';
import nodemailer from 'nodemailer';
import { q, ensureSchema } from './db.js';
import { buscarAlumno } from './airtable-pagos.js';

// Bajas y devoluciones (periodo de prueba de 15 días): el equipo inicia la
// baja desde el panel; el alumno recibe un formulario para dejar su IBAN (o el
// equipo lo mete directamente); la solicitud se vuelca a la base BAJAS de
// Airtable, el alumno queda marcado BAJA en CURSOS KAJABI (si es baja total),
// a la oficina le llega el aviso y en el panel queda "pendiente de
// transferencia" hasta que se hace el reembolso.
const BASE_BAJAS = 'apprYTB1DW7GfkJny'; // BAJAS - PROPUESTA DE MEJORAS
const TABLA_BAJAS = 'Table 1';
const BASE_ALUMNOS = process.env.AIRTABLE_CURSOS_BASE_ID || 'appN0vx5OPGi81zB5';

const airtable = axios.create({
  baseURL: 'https://api.airtable.com/v0',
  headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` },
});

function transporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
  });
}

const eurTexto = (n) => `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`;

export function ibanValido(iban) {
  const limpio = String(iban || '').replace(/\s/g, '').toUpperCase();
  if (!/^ES\d{22}$/.test(limpio)) return false;
  // Validación módulo 97 del IBAN
  const rotado = limpio.slice(4) + limpio.slice(0, 4);
  const numerico = rotado.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let resto = 0;
  for (const d of numerico) resto = (resto * 10 + Number(d)) % 97;
  return resto === 1;
}

export async function listarBajas() {
  await ensureSchema();
  return q(`
    SELECT id, alumno, email, telefono, concepto, tipo, importe::float AS importe,
           to_char(fecha_compra, 'DD/MM/YYYY') AS fecha_compra, iban, titular, dni_titular,
           motivo, estado, token,
           to_char(creada_el, 'DD/MM/YYYY') AS creada,
           to_char(respondida_el, 'DD/MM/YYYY') AS respondida,
           to_char(transferida_el, 'DD/MM/YYYY') AS transferida
    FROM bajas ORDER BY id DESC LIMIT 300
  `);
}

// El equipo inicia la baja. Con IBAN → directa a pendiente de transferencia;
// sin IBAN → email al alumno con su formulario personal.
export async function iniciarBaja({ alumno, email, concepto, tipo, importe, fechaCompra, referencia, iban, titular, dniTitular, motivo }, origen) {
  await ensureSchema();
  if (!alumno) throw new Error('Falta el nombre del alumno');
  const conIban = !!(iban && String(iban).trim());
  if (conIban && !ibanValido(iban)) throw new Error('El IBAN no es válido (debe ser ES + 22 dígitos)');
  if (!conIban && !email) throw new Error('Sin IBAN necesito el email del alumno para enviarle el formulario');
  const token = crypto.randomBytes(20).toString('hex');
  const filas = await q(`
    INSERT INTO bajas (alumno, email, concepto, tipo, importe, fecha_compra, referencia, iban, titular, dni_titular, motivo, token, estado, respondida_el)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id
  `, [alumno.trim(), email || null, concepto || null, tipo === 'DEVOLUCION' ? 'DEVOLUCION' : 'BAJA',
      importe || null, fechaCompra || null, referencia || null,
      conIban ? String(iban).replace(/\s/g, '').toUpperCase() : null, titular || null, dniTitular || null,
      motivo || null, token, conIban ? 'PENDIENTE_TRANSFERENCIA' : 'ESPERANDO_ALUMNO', conIban ? new Date() : null]);
  const id = filas[0].id;

  if (conIban) {
    await tramitarBaja(id);
    return { id, estado: 'PENDIENTE_TRANSFERENCIA' };
  }
  await enviarFormularioAlumno(id, origen);
  return { id, estado: 'ESPERANDO_ALUMNO' };
}

export async function enviarFormularioAlumno(id, origen) {
  const filas = await q(`SELECT * FROM bajas WHERE id = $1`, [id]);
  if (!filas.length) throw new Error('Baja no encontrada');
  const b = filas[0];
  if (!b.email) throw new Error('La baja no tiene email del alumno');
  const enlace = `${origen}/baja?t=${b.token}`;
  const esBaja = b.tipo === 'BAJA';
  await transporter().sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: b.email,
    subject: esBaja ? 'Tramitación de tu baja — AG Academy' : 'Tramitación de tu devolución — AG Academy',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 540px;">
        <h2 style="color:#2456A6;">Hola ${b.alumno},</h2>
        <p>Hemos recibido tu solicitud de ${esBaja ? `<strong>baja</strong>${b.concepto ? ` del curso <strong>${b.concepto}</strong>` : ''} dentro del periodo de prueba de 15 días` : `<strong>devolución</strong> de <strong>${b.concepto || 'tu compra'}</strong>`}.</p>
        <p>Para hacerte el reembolso${b.importe ? ` de <strong>${eurTexto(b.importe)}</strong>` : ''} solo necesitamos los datos de tu cuenta bancaria. Rellena este formulario (1 minuto):</p>
        <p style="margin:24px 0;">
          <a href="${enlace}" style="background:#2456A6;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">
            ✍️ Completar datos para el reembolso
          </a>
        </p>
        <p>Una vez recibidos, tramitaremos la transferencia en un plazo de 7 días hábiles.</p>
        <p>Un saludo,<br>El equipo de AG Academy</p>
      </div>
    `,
  });
  return { enviadoA: b.email };
}

// Datos mínimos para pintar el formulario público
export async function bajaPorToken(token) {
  await ensureSchema();
  const filas = await q(`
    SELECT alumno, concepto, tipo, importe::float AS importe, estado FROM bajas WHERE token = $1
  `, [token]);
  return filas[0] || null;
}

// El alumno envía el formulario con sus datos bancarios
export async function responderFormulario(token, { iban, titular, dniTitular, telefono, motivo, atencion, sugerencias }) {
  const filas = await q(`SELECT id, estado FROM bajas WHERE token = $1`, [token]);
  if (!filas.length) throw new Error('Enlace no válido');
  const b = filas[0];
  if (b.estado !== 'ESPERANDO_ALUMNO') return { yaTramitada: true };
  if (!ibanValido(iban)) throw new Error('El IBAN no es válido: comprueba que sea ES seguido de 22 dígitos');
  if (!titular || titular.trim().length < 5) throw new Error('Escribe el nombre completo del titular de la cuenta');
  await q(`
    UPDATE bajas SET iban = $2, titular = $3, dni_titular = $4, telefono = $5, motivo = $6,
                     atencion = $7, sugerencias = $8, estado = 'PENDIENTE_TRANSFERENCIA', respondida_el = now()
    WHERE id = $1
  `, [b.id, String(iban).replace(/\s/g, '').toUpperCase(), titular.trim(), dniTitular || null,
      telefono || null, motivo || null, atencion || null, sugerencias || null]);
  await tramitarBaja(b.id);
  return { ok: true };
}

// Tramitación: vuelca a la base BAJAS de Airtable, marca BAJA en la ficha del
// alumno (solo bajas totales), avisa a la oficina y confirma al alumno.
async function tramitarBaja(id) {
  const filas = await q(`SELECT * FROM bajas WHERE id = $1`, [id]);
  const b = filas[0];

  // 1) Volcado a la base BAJAS (los nombres de campo son los del formulario real)
  try {
    await airtable.post(`/${BASE_BAJAS}/${encodeURIComponent(TABLA_BAJAS)}?typecast=true`, {
      fields: {
        'NOMBRE Y APELLIDOS': b.alumno,
        'Teléfono': b.telefono || '',
        'EMAIL': b.email || '',
        'Nombre del curso': b.concepto || '',
        '¿Cuál ha sido el motivo principal por el que has decidido darte de baja?': b.motivo || (b.tipo === 'DEVOLUCION' ? 'Devolución de una compra concreta' : ''),
        '¿Te has sentido a gusto con la atención recibida por parte del equipo?': b.atencion || '',
        '¿Te gustaría dejar alguna sugerencia o comentario adicional?': b.sugerencias || '',
        'Nombre del titular de la cuenta bancaria': b.titular || '',
        'IBAN completo (24 dígitos)': b.iban || '',
        'DNI del titular': b.dni_titular || '',
        ' Confirmo que solicito la baja del curso dentro de los 15 días de prueba y acepto que se tramitará el reembolso en un plazo de 7 días hábiles.': true,
        ...(b.fecha_compra ? { '¿Cuándo compré el curso?': String(b.fecha_compra).slice(0, 10) } : {}),
      },
    });
  } catch (error) {
    console.error('Aviso: no se pudo volcar la baja a Airtable BAJAS:', error.response?.data?.error?.message || error.message);
  }

  // 2) Baja total: marcar BAJA en su ficha de CURSOS KAJABI (corta morosos y recordatorios)
  if (b.tipo === 'BAJA' && b.email) {
    try {
      const ficha = await buscarAlumno(b.email, b.alumno);
      if (ficha) {
        await airtable.patch(`/${BASE_ALUMNOS}/CURSOS%20KAJABI/${ficha.id}?typecast=true`, {
          fields: { 'TIPO DE CURSO': 'BAJA' },
        });
      }
    } catch (error) {
      console.error('Aviso: no se pudo marcar BAJA en CURSOS KAJABI:', error.message);
    }
  }

  // 3) Aviso a la oficina con todo lo necesario para la transferencia
  try {
    const oficina = process.env.EMAIL_USER;
    await transporter().sendMail({
      from: process.env.EMAIL_FROM || oficina,
      to: oficina,
      subject: `💸 ${b.tipo === 'BAJA' ? 'BAJA' : 'DEVOLUCIÓN'} pendiente de transferencia — ${b.alumno}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #333; max-width: 560px;">
          <h2 style="color:#dc2626;">${b.tipo === 'BAJA' ? '🚪 Baja tramitada' : '↩️ Devolución tramitada'}</h2>
          <table style="border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Alumno</td><td><strong>${b.alumno}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Curso/compra</td><td>${b.concepto || '—'}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Importe a devolver</td><td><strong style="font-size:16px;">${b.importe ? eurTexto(b.importe) : 'POR CONFIRMAR'}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">IBAN</td><td><strong>${b.iban || '—'}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Titular</td><td>${b.titular || '—'}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">DNI titular</td><td>${b.dni_titular || '—'}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Motivo</td><td>${b.motivo || '—'}</td></tr>
          </table>
          <p>${b.tipo === 'BAJA' ? 'El alumno ya está marcado como BAJA en Airtable (recuerda quitarle el acceso en Kajabi).' : 'Devolución parcial: el alumno NO se ha dado de baja del curso.'}</p>
          <p>Cuando hagas la transferencia, márcala como hecha en el panel → 🚪 Bajas.</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Aviso: no se pudo enviar el email a la oficina:', error.message);
  }

  // 4) Confirmación al alumno
  if (b.email) {
    try {
      await transporter().sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: b.email,
        subject: `${b.tipo === 'BAJA' ? 'Tu baja está tramitada' : 'Tu devolución está tramitada'} — AG Academy`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 540px;">
            <h2 style="color:#2456A6;">Hola ${b.alumno},</h2>
            <p>Hemos tramitado tu ${b.tipo === 'BAJA' ? 'baja' : 'devolución'}${b.concepto ? ` de <strong>${b.concepto}</strong>` : ''}.</p>
            ${b.importe ? `<p>Recibirás la devolución de <strong>${eurTexto(b.importe)}</strong> en la cuenta acabada en <strong>${String(b.iban || '').slice(-4)}</strong> en un plazo máximo de 7 días hábiles.</p>` : ''}
            <p>Sentimos verte marchar 💙 — si en el futuro quieres retomarlo, estaremos encantados de ayudarte.</p>
            <p>Un saludo,<br>El equipo de AG Academy</p>
          </div>
        `,
      });
    } catch (error) {
      console.error('Aviso: no se pudo confirmar al alumno:', error.message);
    }
  }
}

export async function marcarTransferida(id) {
  const filas = await q(`
    UPDATE bajas SET estado = 'TRANSFERIDA', transferida_el = now()
    WHERE id = $1 AND estado = 'PENDIENTE_TRANSFERENCIA' RETURNING alumno
  `, [id]);
  if (!filas.length) throw new Error('Esa baja no está pendiente de transferencia');
  return filas[0];
}

export async function cancelarBaja(id) {
  const filas = await q(`DELETE FROM bajas WHERE id = $1 AND estado = 'ESPERANDO_ALUMNO' RETURNING id`, [id]);
  if (!filas.length) throw new Error('Solo se pueden cancelar bajas que aún esperan al alumno');
}
