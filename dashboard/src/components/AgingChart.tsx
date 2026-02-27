import { useCallback, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { api } from '../api';
import { usePolling } from '../usePolling';
import type { ApAgingRow } from '../types';

const BUCKET_ORDER = ['current', '1-30', '31-60', '61-90', '91+'];

const BUCKET_COLORS: Record<string, string> = {
  current: '#34d399',
  '1-30': '#60a5fa',
  '31-60': '#fbbf24',
  '61-90': '#f97316',
  '91+': '#ef4444',
};

const BUCKET_LABELS: Record<string, string> = {
  current: 'Current',
  '1-30': '1-30 days',
  '31-60': '31-60 days',
  '61-90': '61-90 days',
  '91+': '91+ days',
};

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 shadow-xl">
      <div className="text-sm font-medium text-gray-200">{d.label}</div>
      <div className="text-xs text-gray-400 mt-0.5">
        {d.count} invoice{d.count !== 1 ? 's' : ''}
      </div>
      <div className="text-sm font-mono text-white mt-1">
        ${Number(d.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </div>
    </div>
  );
}

export function AgingChart() {
  const fetcher = useCallback(() => api.aging(), []);
  const { data: agingRows } = usePolling(fetcher, 3000);

  const chartData = useMemo(() => {
    if (!agingRows) return [];

    // Only count open items
    const openRows = agingRows.filter((r: ApAgingRow) => r.status === 'open');

    const buckets = new Map<string, { total: number; count: number }>();
    for (const row of openRows) {
      const key = row.aging_bucket;
      const existing = buckets.get(key) ?? { total: 0, count: 0 };
      existing.total += Number(row.amount);
      existing.count += 1;
      buckets.set(key, existing);
    }

    return BUCKET_ORDER.map((bucket) => {
      const data = buckets.get(bucket) ?? { total: 0, count: 0 };
      return {
        bucket,
        label: BUCKET_LABELS[bucket] ?? bucket,
        total: data.total,
        count: data.count,
        color: BUCKET_COLORS[bucket] ?? '#6b7280',
      };
    });
  }, [agingRows]);

  const grandTotal = chartData.reduce((sum, d) => sum + d.total, 0);

  if (!agingRows) {
    return <div className="flex items-center justify-center h-32 text-gray-600 text-sm">Loading...</div>;
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300">AP Aging Summary</h3>
        <div className="text-sm font-mono text-gray-400">
          Total Outstanding: <span className="text-white font-semibold">{formatCurrency(grandTotal)}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 10 }}>
            <XAxis
              type="number"
              tickFormatter={formatCurrency}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={90}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Legend content={() => null} />
            <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={28}>
              {chartData.map((entry) => (
                <Cell key={entry.bucket} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-2 mt-4">
        {chartData.map((d) => (
          <div key={d.bucket} className="bg-gray-800/50 rounded-lg p-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{d.label}</div>
            <div className="text-sm font-mono font-semibold" style={{ color: d.color }}>
              {formatCurrency(d.total)}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {d.count} inv.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
