export async function GET() {
  return new Response(
    JSON.stringify({
      status: 'ok',
      message: 'Kajabi-Airtable Sync Service is running',
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
