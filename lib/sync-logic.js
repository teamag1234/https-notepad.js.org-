import { getPayments, getCustomers, getOrders, updatePaymentInKajabi } from './kajabi.js';
import { getAllRecords, createRecord, updateRecord, findRecordByEmail } from './airtable.js';
import { sendPaymentReminder, sendFailedPaymentNotification, sendSyncReport } from './email.js';

export async function syncKajabiToAirtable() {
  const report = {
    synced: 0,
    updated: 0,
    errors: 0,
    details: [],
  };

  try {
    console.log('=== INICIANDO SINCRONIZACIÓN ===');

    const payments = await getPayments();
    const customers = await getCustomers();
    const airtableRecords = await getAllRecords('Pagos');

    console.log(`Total pagos en Kajabi: ${payments.length}`);
    console.log(`Total registros en Airtable: ${airtableRecords.length}`);

    for (const payment of payments) {
      try {
        const customer = customers.find(c => c.id === payment.customer_id);
        if (!customer) {
          report.details.push(`⚠️ Cliente no encontrado para pago ${payment.id}`);
          continue;
        }

        const paymentData = {
          'Nombre': customer.full_name || customer.email,
          'Email': customer.email,
          'Teléfono': customer.phone || '',
          'Monto': payment.total || 0,
          'Mes': new Date(payment.created_at).toLocaleDateString('es-ES'),
          'Estado': mapPaymentStatus(payment.status),
          'ID Kajabi': payment.id,
          'Fecha': new Date(payment.created_at).toISOString(),
        };

        const existingRecord = airtableRecords.find(
          r => r.fields['Email'] === customer.email &&
               r.fields['ID Kajabi'] === payment.id
        );

        if (existingRecord) {
          await updateRecord('Pagos', existingRecord.id, paymentData);
          report.updated++;
          report.details.push(`✅ Actualizado: ${customer.full_name}`);
        } else {
          await createRecord('Pagos', paymentData);
          report.synced++;
          report.details.push(`✨ Creado: ${customer.full_name}`);
        }
      } catch (error) {
        report.errors++;
        report.details.push(`❌ Error con pago ${payment.id}: ${error.message}`);
        console.error(`Error processing payment ${payment.id}:`, error);
      }
    }

    console.log('=== SINCRONIZACIÓN COMPLETADA ===');
    console.log(`Creados: ${report.synced}, Actualizados: ${report.updated}, Errores: ${report.errors}`);

    return {
      success: true,
      message: 'Sincronización completada',
      data: report,
    };
  } catch (error) {
    console.error('Error en syncKajabiToAirtable:', error);
    report.errors++;
    return {
      success: false,
      message: 'Error en la sincronización',
      error: error.message,
      data: report,
    };
  }
}

export async function checkFailedPayments() {
  const report = {
    checked: 0,
    reminders: 0,
    errors: 0,
    details: [],
  };

  try {
    console.log('=== VERIFICANDO PAGOS FALLIDOS ===');

    const airtableRecords = await getAllRecords('Pagos');
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    for (const record of airtableRecords) {
      try {
        report.checked++;
        const fields = record.fields;

        if (fields['Estado'] === 'En marcha') {
          const recordDate = new Date(fields['Fecha']);

          if (recordDate < threeDaysAgo) {
            const sent = await sendPaymentReminder(
              fields['Email'],
              fields['Nombre'],
              fields['Monto'],
              fields['Fecha']
            );

            if (sent) {
              report.reminders++;
              report.details.push(`📧 Recordatorio enviado: ${fields['Nombre']}`);
            }
          }
        }
      } catch (error) {
        report.errors++;
        report.details.push(`❌ Error verificando registro: ${error.message}`);
        console.error('Error checking payment:', error);
      }
    }

    console.log('=== VERIFICACIÓN COMPLETADA ===');
    console.log(`Verificados: ${report.checked}, Recordatorios: ${report.reminders}`);

    return {
      success: true,
      message: 'Verificación de pagos completada',
      data: report,
    };
  } catch (error) {
    console.error('Error en checkFailedPayments:', error);
    report.errors++;
    return {
      success: false,
      message: 'Error verificando pagos',
      error: error.message,
      data: report,
    };
  }
}

export async function checkFailedTransactions() {
  const report = {
    checked: 0,
    notified: 0,
    errors: 0,
    details: [],
  };

  try {
    console.log('=== VERIFICANDO TRANSACCIONES FALLIDAS ===');

    const airtableRecords = await getAllRecords('Pagos');

    for (const record of airtableRecords) {
      try {
        report.checked++;
        const fields = record.fields;

        if (fields['Estado'] === 'Sin pagar') {
          const sent = await sendFailedPaymentNotification(
            fields['Email'],
            fields['Nombre'],
            fields['Monto']
          );

          if (sent) {
            report.notified++;
            report.details.push(`❌ Notificación de fallo: ${fields['Nombre']}`);
          }
        }
      } catch (error) {
        report.errors++;
        report.details.push(`❌ Error notificando: ${error.message}`);
        console.error('Error notifying failed transaction:', error);
      }
    }

    console.log('=== VERIFICACIÓN DE TRANSACCIONES COMPLETADA ===');
    console.log(`Verificadas: ${report.checked}, Notificadas: ${report.notified}`);

    return {
      success: true,
      message: 'Verificación de transacciones completada',
      data: report,
    };
  } catch (error) {
    console.error('Error en checkFailedTransactions:', error);
    report.errors++;
    return {
      success: false,
      message: 'Error verificando transacciones',
      error: error.message,
      data: report,
    };
  }
}

function mapPaymentStatus(kajabiStatus) {
  const statusMap = {
    'pending': 'En marcha',
    'active': 'Pagado',
    'inactive': 'Sin pagar',
    'failed': 'Fallido',
    'completed': 'Completado',
  };
  return statusMap[kajabiStatus] || kajabiStatus;
}
