export default function Card({ children, className = '', glow = false }) {
  return (
    <div className={`bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl shadow-xl relative overflow-hidden ${className}`}>
      {glow && (
        <div className="absolute -top-24 -right-24 w-56 h-56 bg-indigo-500/15 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      )}
      {children}
    </div>
  );
}
