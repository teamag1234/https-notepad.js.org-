import JSZip from 'jszip';
import nodemailer from 'nodemailer';
import { get } from '@vercel/blob';
import { q, ensureSchema } from './db.js';

// Paquete mensual para la asesoría: un email con el ZIP de la contabilidad
// del mes — CSV con todos los movimientos (ingresos y gastos) y las facturas
// de compra adjuntas a los gastos, renombradas de forma legible.
const limpiarNombre = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').substring(0, 40);

export async function enviarMesAsesoria({ mes, email }) {
  if (!/^\d{4}-\d{2}$/.test(mes || '')) throw new Error('Falta el mes (formato 2026-09)');
  if (!email || !/.+@.+\..+/.test(email)) throw new Error('Falta el email de la asesoría');
  await ensureSchema();

  const movimientos = await q(`
    SELECT id, tipo, to_char(fecha, 'YYYY-MM-DD') AS fecha, importe::float AS importe,
           concepto, categoria, contacto, fuente, doc_url, doc_nombre
    FROM movimientos WHERE to_char(fecha, 'YYYY-MM') = $1
    ORDER BY fecha, id
  `, [mes]);
  if (!movimientos.length) throw new Error(`No hay movimientos en ${mes}`);

  // CSV (separador ; y BOM para que Excel lo abra bien en español)
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const filas = [['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Proveedor/Alumno', 'Importe (€)', 'Origen', 'Documento'].join(';')];
  let totalIngresos = 0; let totalGastos = 0; let gastosConDoc = 0; let gastosSinDoc = [];
  const zip = new JSZip();

  for (const m of movimientos) {
    const nombreDoc = m.doc_url
      ? `facturas-gastos/${m.fecha}_${limpiarNombre(m.contacto || m.concepto)}_${String(m.importe).replace('.', ',')}eur${(m.doc_nombre?.match(/\.\w{2,5}$/) || [''])[0]}`
      : '';
    filas.push([m.fecha, m.tipo, esc(m.concepto), m.categoria, esc(m.contacto || ''),
      String(m.importe).replace('.', ','), m.fuente, nombreDoc ? esc(nombreDoc.split('/')[1]) : 'NO'].join(';'));
    if (m.tipo === 'INGRESO' && m.categoria !== 'Traspaso Kajabi') totalIngresos += m.importe;
    if (m.tipo === 'GASTO') {
      totalGastos += m.importe;
      if (m.doc_url) {
        try {
          const resultado = await get(m.doc_url, { access: 'private' });
          if (resultado?.statusCode === 200) {
            const buffer = Buffer.from(await new Response(resultado.stream).arrayBuffer());
            zip.file(nombreDoc, buffer);
            gastosConDoc += 1;
          } else gastosSinDoc.push(`${m.fecha} ${m.concepto} (${m.importe}€) — documento ilocalizable`);
        } catch {
          gastosSinDoc.push(`${m.fecha} ${m.concepto} (${m.importe}€) — error al leer el documento`);
        }
      } else {
        gastosSinDoc.push(`${m.fecha} ${(m.concepto || '').substring(0, 60)} (${m.importe}€)`);
      }
    }
  }
  zip.file(`movimientos-${mes}.csv`, '﻿' + filas.join('\r\n'));
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  const eur = (n) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`;
  const user = process.env.EMAIL_USER;
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass: process.env.EMAIL_PASSWORD } });
  await t.sendMail({
    from: process.env.EMAIL_FROM || user,
    to: email,
    cc: user,
    subject: `Contabilidad AG Academy — ${mes} (Always Growing Academy SL)`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #333; max-width: 560px;">
        <p>Hola,</p>
        <p>Os adjuntamos la contabilidad de <strong>${mes}</strong> de Always Growing Academy SL (CIF B67815498):</p>
        <ul>
          <li>Ingresos facturados: <strong>${eur(Math.round(totalIngresos * 100) / 100)}</strong></li>
          <li>Gastos: <strong>${eur(Math.round(totalGastos * 100) / 100)}</strong> (${gastosConDoc} con factura adjunta en el ZIP)</li>
          <li>Movimientos totales: ${movimientos.length} (detalle completo en el CSV)</li>
        </ul>
        ${gastosSinDoc.length ? `<p><strong>Gastos sin factura adjunta (${gastosSinDoc.length}):</strong></p><ul style="font-size:13px;color:#6b7280;">${gastosSinDoc.slice(0, 25).map((g) => `<li>${g}</li>`).join('')}${gastosSinDoc.length > 25 ? `<li>… y ${gastosSinDoc.length - 25} más</li>` : ''}</ul>` : '<p>✅ Todos los gastos llevan su factura adjunta.</p>'}
        <p>Cualquier duda, respondednos a este email.</p>
        <p>Un saludo,<br>AG Academy</p>
      </div>
    `,
    attachments: [{ filename: `contabilidad-AG-${mes}.zip`, content: zipBuffer, contentType: 'application/zip' }],
  });

  // Recuerda el email de la asesoría para la próxima vez
  await q(`
    INSERT INTO banco_config (clave, valor, actualizado_el) VALUES ('asesoria_email', $1, now())
    ON CONFLICT (clave) DO UPDATE SET valor = $1, actualizado_el = now()
  `, [email]).catch(() => {});

  return {
    enviadoA: email,
    movimientos: movimientos.length,
    gastosConDoc,
    gastosSinDoc: gastosSinDoc.length,
    tamanoZipMB: Math.round((zipBuffer.length / 1048576) * 10) / 10,
  };
}

export async function emailAsesoriaGuardado() {
  await ensureSchema();
  const filas = await q(`SELECT valor FROM banco_config WHERE clave = 'asesoria_email'`).catch(() => []);
  return filas[0]?.valor || '';
}
