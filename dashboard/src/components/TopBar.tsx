import { useCallback } from 'react';
import { api } from '../api';
import { usePolling } from '../usePolling';

interface TopBarProps {
  totalEvents: number;
  lastUpdated: Date | null;
}

export function TopBar({ totalEvents, lastUpdated }: TopBarProps) {
  const healthFetcher = useCallback(() => api.health(), []);
  const { data: health } = usePolling(healthFetcher, 5000);

  const isHealthy = health?.status === 'ok';
  const dbOk = health?.checks.database === 'ok';

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="w-7 h-7 text-indigo-400" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-lg font-semibold tracking-tight text-white">Nova</span>
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-800 text-gray-400 ml-1">
            Developer Console
          </span>
        </div>
      </div>

      <div className="flex items-center gap-6 text-sm">
        {/* Health indicator */}
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${isHealthy && dbOk ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.5)]'}`} />
          <span className={isHealthy && dbOk ? 'text-emerald-400' : 'text-red-400'}>
            {isHealthy && dbOk ? 'Healthy' : 'Degraded'}
          </span>
        </div>

        {/* Event counter */}
        <div className="flex items-center gap-2 text-gray-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
          </svg>
          <span className="font-mono text-gray-300">{totalEvents.toLocaleString()}</span>
          <span>events</span>
        </div>

        {/* Last updated */}
        {lastUpdated && (
          <div className="text-gray-500 text-xs font-mono">
            Updated {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>
    </header>
  );
}
