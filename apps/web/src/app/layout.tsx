import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { PwaRegister } from '@/components/pwa-register';

export const metadata: Metadata = {
  title: 'Master of Beauty — CRM салону краси',
  description: 'CRM система для салону краси: записи, клієнти, каса, склад, лояльність',
  applicationName: 'BeautyCRM',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'BeautyCRM',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#c4787a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
