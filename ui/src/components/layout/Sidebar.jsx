'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

function NavLink({ href, label, icon, active }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
        active
          ? 'bg-indigo-600/30 text-white border border-indigo-500/40'
          : 'text-gray-400 hover:text-white hover:bg-white/5'
      }`}
    >
      <span className="text-lg">{icon}</span>
      {label}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAdmin, logout } = useAuth();

  const isActive = (href) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const navItems = [
    ...(isAdmin ? [{ href: '/', label: 'Dashboard', icon: '📊' }] : []),
    { href: '/launch', label: 'Launch Bot', icon: '🚀' },
    { href: '/jobs', label: isAdmin ? 'All Jobs' : 'My Jobs', icon: '📋' },
    ...(isAdmin ? [{ href: '/users', label: 'Users', icon: '👥' }] : []),
  ];

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-white/10 bg-black/20 p-6 gap-8">
      <div>
        <a href="https://www.registerkaro.in/" className="Header_new-header-logo-section__0jeim mb-4">
          <img
            alt="RegisterKaro Logo"
            title="RegisterKaro Logo"
            loading="eager"
            width="28"
            height="34"
            className="Header_new-header-logo-image__j7h3q"
            style={{ color: 'transparent' }}
            src="https://www.registerkaro.in/_next/static/media/rk_color_logo.5b7ee582.svg"
          />
          <div className="Header_new-header-logo-text__CS50H">
            <span className="Header_new-header-register-text__U1Fft">Register</span>
            <span className="Header_new-header-karo-text__M37x2">Karo</span>
          </div>
        </a>
        <h2 className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Automation Engine</h2>
        {user && (
          <p className="text-xs text-gray-400 mt-2">
            {user.displayName}
            <span className="ml-1 uppercase text-indigo-400">({user.role})</span>
          </p>
        )}
      </div>

      <nav className="flex flex-col gap-2 flex-1">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="text-sm text-gray-400 hover:text-white px-4 py-2 rounded-lg hover:bg-white/5 text-left"
      >
        Sign out
      </button>
    </aside>
  );
}
