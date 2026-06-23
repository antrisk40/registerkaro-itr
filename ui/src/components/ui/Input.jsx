export default function Input({ className = '', ...props }) {
  return (
    <input
      {...props}
      className={`bg-black/40 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors ${className}`}
    />
  );
}
