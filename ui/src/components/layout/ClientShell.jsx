'use client';

import { usePathname } from 'next/navigation';
import AppShell from './AppShell';
import AuthGuard from '../auth/AuthGuard';

export default function ClientShell({ children }) {
  const pathname = usePathname();

  if (pathname === '/login') {
    return children;
  }

  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
