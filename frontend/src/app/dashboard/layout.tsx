'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    if (!token) {
      router.push('/login');
    }
  }, [token, router]);

  if (!token) {
    return <div>Redirecting...</div>;
  }

  // Navigation items based on role
  const getNavItems = () => {
    return [
      { label: 'Dashboard', href: '/dashboard', icon: '📊' },
      { label: 'AI Forecasts', href: '/dashboard/predictions', icon: '🤖' },
      { label: 'Waste', href: '/dashboard/waste', icon: '🗑️' },
      { label: 'Inventory', href: '/dashboard/inventory', icon: '📦' },
      { label: 'Attendance', href: '/dashboard/attendance', icon: '📈' },
    ];
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar Navigation */}
      <aside className="fixed left-0 top-0 w-64 bg-gray-900 text-white h-screen overflow-y-auto">
        <div className="p-6">
          <h1 className="text-2xl font-bold">EcoMess AI</h1>
          <p className="text-gray-400 text-sm">Waste Management</p>
        </div>

        <nav className="mt-8 space-y-2 px-4">
          {getNavItems().map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <span className="mr-3">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
          <div className="mb-4">
            <p className="text-sm text-gray-400">Logged in as</p>
            <p className="font-medium">{user?.name}</p>
            <p className="text-xs text-gray-500">{user?.role}</p>
          </div>
          <button
            onClick={() => {
              logout();
              router.push('/login');
            }}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        {children}
      </main>
    </div>
  );
}