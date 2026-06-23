export default function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="bg-black/40 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
    >
      {options.map((o) => (
        <option key={o} value={o} className="bg-gray-900">{o}</option>
      ))}
    </select>
  );
}
