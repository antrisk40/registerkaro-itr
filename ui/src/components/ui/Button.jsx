'use client';

const variants = {
  primary: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_35px_rgba(79,70,229,0.55)]',
  secondary: 'bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10',
  danger: 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300',
};

export default function Button({
  children,
  variant = 'primary',
  className = '',
  loading = false,
  ...props
}) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`font-semibold py-2.5 px-4 rounded-xl transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-2 text-sm ${variants[variant]} ${className}`}
    >
      {loading ? (
        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : children}
    </button>
  );
}
