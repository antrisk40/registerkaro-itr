'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

export default function MobileNav() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  const navItems = [
    ...(isAdmin ? [{ href: '/', label: 'Dashboard' }] : []),
    { href: '/launch', label: 'Launch' },
    { href: '/jobs', label: isAdmin ? 'Jobs' : 'My Jobs' },
    ...(isAdmin ? [{ href: '/users', label: 'Users' }] : []),
  ];

  const isActive = (href) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="lg:hidden flex border-b border-white/10 bg-black/30">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex-1 text-center py-3 text-sm font-medium transition-colors ${
            isActive(item.href)
              ? 'text-indigo-300 border-b-2 border-indigo-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
