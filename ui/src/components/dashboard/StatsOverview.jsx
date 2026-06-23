import Card from '../ui/Card';

const STAT_CONFIG = [
  { key: 'total', label: 'Total Jobs', color: 'from-blue-500 to-indigo-500', icon: '📋' },
  { key: 'active', label: 'Active', color: 'from-yellow-500 to-orange-500', icon: '⚡' },
  { key: 'success', label: 'Successful', color: 'from-green-500 to-emerald-500', icon: '✅' },
  { key: 'failed', label: 'Failed', color: 'from-red-500 to-rose-500', icon: '❌' },
];

export default function StatsOverview({ stats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {STAT_CONFIG.map(({ key, label, color, icon }) => (
        <Card key={key} className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
              <p className={`text-3xl font-bold mt-2 text-transparent bg-clip-text bg-gradient-to-r ${color}`}>
                {stats[key]}
              </p>
            </div>
            <span className="text-2xl">{icon}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}
