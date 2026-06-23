export default function EmptyState({ title, description, action }) {
  return (
    <div className="text-center p-12 bg-white/5 rounded-xl border border-white/10 backdrop-blur-xl">
      <p className="text-gray-300 font-semibold mb-2">{title}</p>
      {description && <p className="text-gray-500 text-sm mb-4">{description}</p>}
      {action}
    </div>
  );
}
