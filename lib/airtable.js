import axios from 'axios';

const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';
const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

const airtableAPI = axios.create({
  baseURL: `${AIRTABLE_API_BASE}/${BASE_ID}`,
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
});

export async function getRecords(tableName) {
  try {
    console.log(`Fetching records from Airtable table: ${tableName}`);
    const response = await airtableAPI.get(`/${tableName}`);
    return response.data?.records || [];
  } catch (error) {
    console.error(`Error fetching records from ${tableName}:`, error.message);
    return [];
  }
}

export async function createRecord(tableName, fields) {
  try {
    console.log(`Creating record in ${tableName}:`, fields);
    const response = await airtableAPI.post(`/${tableName}`, {
      records: [
        {
          fields: fields,
        },
      ],
    });
    return response.data?.records?.[0] || null;
  } catch (error) {
    console.error(`Error creating record in ${tableName}:`, error.message);
    return null;
  }
}

export async function updateRecord(tableName, recordId, fields) {
  try {
    console.log(`Updating record ${recordId} in ${tableName}:`, fields);
    const response = await airtableAPI.patch(`/${tableName}/${recordId}`, {
      fields: fields,
    });
    return response.data;
  } catch (error) {
    console.error(`Error updating record ${recordId}:`, error.message);
    return null;
  }
}

export async function findRecordByEmail(tableName, email) {
  try {
    const records = await getRecords(tableName);
    return records.find(record => record.fields.Email === email);
  } catch (error) {
    console.error(`Error finding record by email:`, error.message);
    return null;
  }
}

export async function getAllRecords(tableName) {
  try {
    console.log(`Fetching all records from ${tableName}`);
    let allRecords = [];
    let offset = null;

    do {
      const params = offset ? { offset } : {};
      const response = await airtableAPI.get(`/${tableName}`, { params });
      allRecords = allRecords.concat(response.data?.records || []);
      offset = response.data?.offset;
    } while (offset);

    return allRecords;
  } catch (error) {
    console.error(`Error fetching all records from ${tableName}:`, error.message);
    return [];
  }
}
