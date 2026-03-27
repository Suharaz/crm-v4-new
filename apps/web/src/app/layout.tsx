import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CRM V4',
  description: 'Hệ thống quản lý khách hàng nội bộ',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-gray-50 antialiased">{children}</body>
    </html>
  );
}
