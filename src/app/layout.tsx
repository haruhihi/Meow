import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Script from 'next/script';
import './globals.css';
import type { Viewport } from 'next';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

const serviceWorkerRegistration = `
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (error) {
        console.warn('Service worker registration failed:', error);
      });
    });
  }
`;

export const metadata: Metadata = {
  title: 'Meow',
  description: 'HH',
  icons: {
    icon: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Meow',
    statusBarStyle: 'default',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} style={{ height: '100vh' }}>
        {children}
        <Script
          id="set-body-height"
          dangerouslySetInnerHTML={{
            __html: `
                // 这段 JavaScript 会在页面加载之前执行
                const isMeowDocumentScrollRoute =
                  /^\/meow\/(?:bill|time|me)$/.test(window.location.pathname) ||
                  /^\/meow\/stocks(?:\/(?!snapshots$)[^/]+)?$/.test(window.location.pathname) ||
                  /^\/meow\/articles(?:\/[^/]+)?$/.test(window.location.pathname) ||
                  /^\/meow\/ai-reports(?:\/[^/]+)?$/.test(window.location.pathname);

                if (!isMeowDocumentScrollRoute) {
                  console.log('Setting body height: ' + document.documentElement.clientHeight + 'px')
                  document.body.style.height = document.documentElement.clientHeight + 'px';
                  // 你可以添加其他初始化脚本
                }
              `,
          }}
          strategy="afterInteractive"
        />
        {process.env.NODE_ENV === 'production' && (
          <Script
            id="register-service-worker"
            dangerouslySetInnerHTML={{ __html: serviceWorkerRegistration }}
            strategy="afterInteractive"
          />
        )}
        <Script src="https://cdn.jsdelivr.net/npm/eruda" strategy="beforeInteractive" />
      </body>
    </html>
  );
}
