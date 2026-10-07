
'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/authStore';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (token) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  }, [token, router]);

  return <div>Redirecting...</div>;
}