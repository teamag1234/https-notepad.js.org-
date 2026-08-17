export async function GET() {
  return new Response(
    JSON.stringify({
      status: 'ok',
      message: 'Kajabi-Airtable Sync Service is running',
      version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'local',
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
