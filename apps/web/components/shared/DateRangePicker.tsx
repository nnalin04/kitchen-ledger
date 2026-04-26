'use client';

interface DateRangePickerProps {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}

type Preset = 'today' | 'this_week' | 'this_month' | 'last_month';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
];

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function applyPreset(preset: Preset): { start: string; end: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (preset === 'today') {
    const s = toDateStr(today);
    return { start: s, end: s };
  }

  if (preset === 'this_week') {
    const day = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: toDateStr(monday), end: toDateStr(sunday) };
  }

  if (preset === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start: toDateStr(start), end: toDateStr(end) };
  }

  // last_month
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 0);
  return { start: toDateStr(start), end: toDateStr(end) };
}

export function DateRangePicker({
  start,
  end,
  onStartChange,
  onEndChange,
}: DateRangePickerProps) {
  function handlePreset(preset: Preset) {
    const { start: s, end: e } = applyPreset(preset);
    onStartChange(s);
    onEndChange(e);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Preset buttons */}
      <div className="flex gap-1.5 flex-wrap">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            className="px-3 py-1 text-xs font-medium border border-gray-200 rounded-lg bg-white hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Date inputs */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={start}
          onChange={e => onStartChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
        />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-gray-400 flex-shrink-0"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <input
          type="date"
          value={end}
          min={start}
          onChange={e => onEndChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
        />
      </div>
    </div>
  );
}
