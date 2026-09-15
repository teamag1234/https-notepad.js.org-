import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import { q, ensureSchema } from './db.js';
import { LOGO_AG_BASE64 } from './logo-ag.js';

// Facturas de AG Academy: numeración automática, PDF con la imagen corporativa
// y envío por email al alumno. Datos fiscales del emisor tomados de las
// facturas reales de la empresa.
export const EMISOR = {
  nombre: 'ALWAYS GROWING ACADEMY SL',
  cif: 'B67815498',
  direccion: 'Calle Ángel Valencia, 33 · 30562 Ceutí (Murcia)',
  email: process.env.FACTURAS_EMAIL_FROM || process.env.FACTURAS_EMAIL_USER || 'facturasagacademy@gmail.com',
  iban: process.env.PAGOS_IBAN || 'ES70 3058 0221 0127 2001 7857',
};

const AZUL = '#2456A6';
const AMARILLO = '#F5B317';
const GRIS = '#6b7280';

// Numeración: continúa la serie real de la empresa (última en papel: F250946)
async function siguienteNumero() {
  const filas = await q(`
    SELECT COALESCE(
      MAX(NULLIF(regexp_replace(numero, '\\D', '', 'g'), '')::bigint),
      ${Number(process.env.FACTURAS_ULTIMO_NUMERO || 250946)}
    ) + 1 AS siguiente
    FROM facturas
  `);
  return `F${filas[0].siguiente}`;
}

export async function listarFacturas() {
  await ensureSchema();
  return q(`
    SELECT id, numero, to_char(fecha, 'DD/MM/YYYY') AS fecha, alumno, dni, direccion, email,
           concepto, cantidad, importe::float AS importe, estado,
           to_char(enviada_el, 'DD/MM/YYYY HH24:MI') AS enviada, referencia
    FROM facturas ORDER BY id DESC LIMIT 300
  `);
}

// Cobros recientes (Kajabi y transferencias) que aún no tienen factura
export async function cobrosSinFactura() {
  await ensureSchema();
  return q(`
    SELECT m.id, to_char(m.fecha, 'YYYY-MM-DD') AS fecha, m.importe::float AS importe,
           m.concepto, m.contacto, m.email, m.fuente, m.referencia
    FROM movimientos m
    LEFT JOIN facturas f ON f.referencia = m.referencia
    WHERE m.tipo = 'INGRESO' AND m.categoria <> 'Traspaso Kajabi'
      AND m.fecha >= CURRENT_DATE - 90 AND f.id IS NULL
    ORDER BY m.fecha DESC, m.id DESC LIMIT 200
  `);
}

export async function crearFactura({ fecha, alumno, dni, direccion, email, concepto, cantidad, importe, referencia }) {
  await ensureSchema();
  if (!alumno || !concepto || !importe) throw new Error('Faltan alumno, concepto o importe');
  const numero = await siguienteNumero();
  const filas = await q(`
    INSERT INTO facturas (numero, fecha, alumno, dni, direccion, email, concepto, cantidad, importe, referencia)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, numero
  `, [numero, fecha || new Date().toISOString().slice(0, 10), alumno.trim(), dni || null, direccion || null,
      email || null, concepto, Number(cantidad) || 1, importe, referencia || null]);
  return filas[0];
}

export async function actualizarFactura(id, campos) {
  const permitidos = ['fecha', 'alumno', 'dni', 'direccion', 'email', 'concepto', 'cantidad', 'importe'];
  const sets = []; const valores = [];
  for (const [k, v] of Object.entries(campos)) {
    if (!permitidos.includes(k)) continue;
    valores.push(v === '' ? null : v);
    sets.push(`${k} = $${valores.length}`);
  }
  if (!sets.length) return;
  valores.push(id);
  await q(`UPDATE facturas SET ${sets.join(', ')} WHERE id = $${valores.length}`, valores);
}

export async function borrarFactura(id) {
  const filas = await q(`DELETE FROM facturas WHERE id = $1 AND estado = 'BORRADOR' RETURNING id`, [id]);
  if (!filas.length) throw new Error('Solo se pueden borrar borradores (las enviadas quedan registradas)');
}

async function facturaPorId(id) {
  const filas = await q(`
    SELECT id, numero, to_char(fecha, 'DD/MM/YYYY') AS fecha, alumno, dni, direccion, email,
           concepto, cantidad, importe::float AS importe, estado
    FROM facturas WHERE id = $1
  `, [id]);
  if (!filas.length) throw new Error('Factura no encontrada');
  return filas[0];
}

const eurPdf = (n) => `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

// ── PDF ──────────────────────────────────────────────────────────────────────
export async function pdfFactura(id) {
  const f = await facturaPorId(id);
  return { buffer: await pdfDesdeDatos(f), factura: f };
}

export async function pdfDesdeDatos(f) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 46, bottom: 46, left: 50, right: 50 } });
  const trozos = [];
  doc.on('data', (c) => trozos.push(c));
  const terminado = new Promise((res) => doc.on('end', () => res(Buffer.concat(trozos))));
  const ancho = doc.page.width - 100; // área útil

  // Cabecera: logo + FACTURA
  doc.image(Buffer.from(LOGO_AG_BASE64, 'base64'), 50, 44, { width: 150 });
  doc.font('Helvetica-Bold').fontSize(26).fillColor(AZUL).text('FACTURA', 300, 50, { width: ancho - 250, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#111827').text(f.numero, 300, 82, { width: ancho - 250, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor(GRIS).text(`Fecha: ${f.fecha}`, 300, 100, { width: ancho - 250, align: 'right' });

  // Línea corporativa
  doc.rect(50, 130, ancho, 3).fill(AMARILLO);

  // Emisor y cliente en dos columnas
  const yBloques = 150;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(AZUL).text('EMITIDO POR', 50, yBloques);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111827').text(EMISOR.nombre, 50, yBloques + 14);
  doc.font('Helvetica').fontSize(9.5).fillColor('#374151')
    .text(`CIF: ${EMISOR.cif}`, 50, yBloques + 29)
    .text(EMISOR.direccion, 50, yBloques + 42, { width: 240 })
    .text(EMISOR.email, 50, yBloques + 55, { width: 240 });

  doc.font('Helvetica-Bold').fontSize(9).fillColor(AZUL).text('DATOS DEL CLIENTE', 320, yBloques);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111827').text(f.alumno, 320, yBloques + 14, { width: 225 });
  let yCliente = doc.y + 2;
  doc.font('Helvetica').fontSize(9.5).fillColor('#374151');
  if (f.dni) { doc.text(`DNI/NIE: ${f.dni}`, 320, yCliente, { width: 225 }); yCliente = doc.y + 2; }
  if (f.direccion) { doc.text(f.direccion, 320, yCliente, { width: 225 }); yCliente = doc.y + 2; }
  if (f.email) { doc.text(f.email, 320, yCliente, { width: 225 }); }

  // Tabla de conceptos
  const yTabla = Math.max(doc.y, yBloques + 80) + 30;
  doc.rect(50, yTabla, ancho, 24).fill(AZUL);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('white');
  doc.text('CONCEPTO', 62, yTabla + 7, { width: 260 });
  doc.text('CANTIDAD', 330, yTabla + 7, { width: 60, align: 'center' });
  doc.text('PRECIO', 400, yTabla + 7, { width: 65, align: 'right' });
  doc.text('TOTAL', 475, yTabla + 7, { width: 68, align: 'right' });

  const total = Math.round(f.importe * 100) / 100;
  const precio = Math.round((total / (f.cantidad || 1)) * 100) / 100;
  const yFila = yTabla + 24;
  doc.rect(50, yFila, ancho, 34).fill('#f8fafc');
  doc.font('Helvetica').fontSize(10).fillColor('#111827');
  doc.text(f.concepto, 62, yFila + 11, { width: 260 });
  doc.text(String(f.cantidad || 1), 330, yFila + 11, { width: 60, align: 'center' });
  doc.text(eurPdf(precio), 400, yFila + 11, { width: 65, align: 'right' });
  doc.text(eurPdf(total), 475, yFila + 11, { width: 68, align: 'right' });
  doc.moveTo(50, yFila + 34).lineTo(50 + ancho, yFila + 34).strokeColor('#e5e7eb').stroke();

  // Total destacado
  const yTotal = yFila + 52;
  doc.rect(340, yTotal, 203, 34).fill(AZUL);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('white').text('TOTAL', 355, yTotal + 10);
  doc.fontSize(14).text(eurPdf(total), 400, yTotal + 8, { width: 130, align: 'right' });

  // Forma de pago
  const yPago = yTotal + 64;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Forma de pago', 50, yPago);
  doc.font('Helvetica').fontSize(9.5).fillColor('#374151')
    .text('Transferencia bancaria al siguiente número de cuenta:', 50, yPago + 15);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(AZUL).text(EMISOR.iban, 50, yPago + 30);

  // Pie
  const yPie = doc.page.height - 70;
  doc.rect(50, yPie - 12, ancho, 2).fill(AMARILLO);
  doc.font('Helvetica').fontSize(8).fillColor(GRIS).text(
    `${EMISOR.nombre} · CIF ${EMISOR.cif} · ${EMISOR.direccion} · ${EMISOR.email}`,
    50, yPie, { width: ancho, align: 'center' },
  );

  doc.end();
  return terminado;
}

// ── Envío por email ──────────────────────────────────────────────────────────
function transporterFacturas() {
  const user = process.env.FACTURAS_EMAIL_USER || process.env.EMAIL_USER;
  const pass = process.env.FACTURAS_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD;
  if (!user || !pass) throw new Error('Faltan las credenciales de email (FACTURAS_EMAIL_USER / FACTURAS_EMAIL_PASSWORD o las generales)');
  return { t: nodemailer.createTransport({ service: 'gmail', auth: { user, pass } }), user };
}

export async function enviarFactura(id) {
  const { buffer, factura } = await pdfFactura(id);
  if (!factura.email) throw new Error('La factura no tiene email del alumno');
  const { t, user } = transporterFacturas();
  await t.sendMail({
    from: process.env.FACTURAS_EMAIL_FROM || user,
    to: factura.email,
    subject: `Tu factura ${factura.numero} — AG Academy`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 540px;">
        <h2 style="color:#2456A6;">Hola ${factura.alumno},</h2>
        <p>Te adjuntamos la factura <strong>${factura.numero}</strong> correspondiente a:</p>
        <p style="background:#f3f4f6;border-radius:8px;padding:12px 16px;">
          <strong>${factura.concepto}</strong><br>
          Importe: <strong>${eurPdf(factura.importe)}</strong> · Fecha: ${factura.fecha}
        </p>
        <p>Si detectas cualquier error en los datos, responde a este email y la corregimos.</p>
        <p>Un saludo,<br>El equipo de AG Academy</p>
      </div>
    `,
    attachments: [{ filename: `${factura.numero}-AGAcademy.pdf`, content: buffer, contentType: 'application/pdf' }],
  });
  await q(`UPDATE facturas SET estado = 'ENVIADA', enviada_el = now() WHERE id = $1`, [id]);
  return { numero: factura.numero, enviadaA: factura.email };
}
