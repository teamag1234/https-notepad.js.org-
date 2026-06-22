export const metadata = {
  title: 'Kajabi-Airtable Sync',
  description: 'Sistema automático de sincronización de pagos',
  lang: 'es',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ fontFamily: 'Arial, sans-serif', lineHeight: '1.6', color: '#333' }}>
        {children}
      </body>
    </html>
  );
}
