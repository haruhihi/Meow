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

export const metadata: Metadata = {
  title: 'Meow',
  description: 'HH',
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
                console.log('Setting body height: ' + document.documentElement.clientHeight + 'px')
                document.body.style.height = document.documentElement.clientHeight + 'px';
                // 你可以添加其他初始化脚本
              `,
          }}
          strategy="afterInteractive"
        />
        <Script src="https://cdn.jsdelivr.net/npm/eruda" strategy="beforeInteractive" />
      </body>
    </html>
  );
}
