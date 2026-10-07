import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EcoMess AI',
  description: 'Food waste prediction and inventory optimization',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}