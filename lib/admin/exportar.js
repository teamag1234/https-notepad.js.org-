import ExcelJS from 'exceljs';
import { q, ensureSchema } from './db.js';

// Excel anual de los movimientos del banco: hoja de movimientos, resumen
// mensual (entradas/salidas/neto) y desglose por categorías — para la
// estimación anual de impuestos.
export async function excelAnualBanco(anio) {
  await ensureSchema();
  const movimientos = await q(`
    SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(fecha, 'YYYY-MM') AS mes,
           tipo, concepto, categoria, contacto, importe::float AS importe
    FROM movimientos
    WHERE fuente = 'BANCO' AND EXTRACT(YEAR FROM fecha) = $1
    ORDER BY fecha, id
  `, [anio]);

  const libro = new ExcelJS.Workbook();
  libro.creator = 'AG Academy · Panel de administración';

  const AZUL = 'FF2456A6';
  const cabecera = (hoja, columnas) => {
    hoja.columns = columnas;
    const fila = hoja.getRow(1);
    fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    fila.height = 20;
  };
  const euroFmt = '#,##0.00 "€"';

  // 1) Movimientos
  const h1 = libro.addWorksheet(`Movimientos banco ${anio}`);
  cabecera(h1, [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Concepto', key: 'concepto', width: 60 },
    { header: 'Categoría', key: 'categoria', width: 24 },
    { header: 'Contraparte', key: 'contacto', width: 28 },
    { header: 'Entrada (€)', key: 'entrada', width: 14, style: { numFmt: euroFmt } },
    { header: 'Salida (€)', key: 'salida', width: 14, style: { numFmt: euroFmt } },
  ]);
  for (const m of movimientos) {
    h1.addRow({
      fecha: m.fecha, tipo: m.tipo, concepto: m.concepto, categoria: m.categoria,
      contacto: m.contacto || '',
      entrada: m.tipo === 'INGRESO' ? m.importe : null,
      salida: m.tipo === 'GASTO' ? m.importe : null,
    });
  }
  h1.autoFilter = 'A1:G1';
  h1.views = [{ state: 'frozen', ySplit: 1 }];

  // 2) Resumen mensual
  const porMes = {};
  for (const m of movimientos) {
    porMes[m.mes] = porMes[m.mes] || { entradas: 0, salidas: 0 };
    porMes[m.mes][m.tipo === 'INGRESO' ? 'entradas' : 'salidas'] += m.importe;
  }
  const h2 = libro.addWorksheet('Resumen mensual');
  cabecera(h2, [
    { header: 'Mes', key: 'mes', width: 12 },
    { header: 'Entradas (€)', key: 'entradas', width: 16, style: { numFmt: euroFmt } },
    { header: 'Salidas (€)', key: 'salidas', width: 16, style: { numFmt: euroFmt } },
    { header: 'Neto (€)', key: 'neto', width: 16, style: { numFmt: euroFmt } },
    { header: 'Neto acumulado (€)', key: 'acumulado', width: 20, style: { numFmt: euroFmt } },
  ]);
  let acumulado = 0;
  let totalEntradas = 0; let totalSalidas = 0;
  for (const mes of Object.keys(porMes).sort()) {
    const v = porMes[mes];
    const neto = v.entradas - v.salidas;
    acumulado += neto;
    totalEntradas += v.entradas; totalSalidas += v.salidas;
    h2.addRow({ mes, entradas: v.entradas, salidas: v.salidas, neto, acumulado });
  }
  const filaTotal = h2.addRow({ mes: 'TOTAL', entradas: totalEntradas, salidas: totalSalidas, neto: totalEntradas - totalSalidas, acumulado });
  filaTotal.font = { bold: true };

  // 3) Por categoría
  const porCategoria = {};
  for (const m of movimientos) {
    const clave = `${m.tipo}|${m.categoria}`;
    porCategoria[clave] = (porCategoria[clave] || 0) + m.importe;
  }
  const h3 = libro.addWorksheet('Por categoría');
  cabecera(h3, [
    { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Categoría', key: 'categoria', width: 28 },
    { header: 'Total (€)', key: 'total', width: 16, style: { numFmt: euroFmt } },
  ]);
  const entradasCat = Object.entries(porCategoria).map(([k, total]) => {
    const [tipo, categoria] = k.split('|');
    return { tipo, categoria, total };
  }).sort((a, b) => a.tipo.localeCompare(b.tipo) || b.total - a.total);
  for (const fila of entradasCat) h3.addRow(fila);

  const buffer = Buffer.from(await libro.xlsx.writeBuffer());
  return {
    buffer,
    resumen: {
      movimientos: movimientos.length,
      desde: movimientos[0]?.fecha || null,
      hasta: movimientos[movimientos.length - 1]?.fecha || null,
      entradas: Math.round(totalEntradas * 100) / 100,
      salidas: Math.round(totalSalidas * 100) / 100,
    },
  };
}
