import axios from 'axios';

const KAJABI_API_BASE = 'https://api.kajabi.com/v4';
const API_KEY = process.env.KAJABI_API_KEY;

const kajabiAPI = axios.create({
  baseURL: KAJABI_API_BASE,
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
});

export async function getPayments() {
  try {
    console.log('Fetching payments from Kajabi...');
    const response = await kajabiAPI.get('/payments', {
      params: {
        limit: 100,
        page: 1,
      },
    });
    return response.data?.data || [];
  } catch (error) {
    console.error('Error fetching payments from Kajabi:', error.message);
    return [];
  }
}

export async function getCustomers() {
  try {
    console.log('Fetching customers from Kajabi...');
    const response = await kajabiAPI.get('/customers', {
      params: {
        limit: 100,
        page: 1,
      },
    });
    return response.data?.data || [];
  } catch (error) {
    console.error('Error fetching customers from Kajabi:', error.message);
    return [];
  }
}

export async function getOrders() {
  try {
    console.log('Fetching orders from Kajabi...');
    const response = await kajabiAPI.get('/orders', {
      params: {
        limit: 100,
        page: 1,
      },
    });
    return response.data?.data || [];
  } catch (error) {
    console.error('Error fetching orders from Kajabi:', error.message);
    return [];
  }
}

export async function updatePaymentInKajabi(paymentId, status) {
  try {
    console.log(`Updating payment ${paymentId} in Kajabi to ${status}...`);
    const response = await kajabiAPI.patch(`/payments/${paymentId}`, {
      status: status,
    });
    return response.data;
  } catch (error) {
    console.error(`Error updating payment ${paymentId} in Kajabi:`, error.message);
    return null;
  }
}
