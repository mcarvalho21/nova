import { useState, useCallback } from 'react';
import { TopBar } from './components/TopBar';
import { EventStream } from './components/EventStream';
import { ProjectionTabs } from './components/ProjectionTabs';
import { IntentLauncher } from './components/IntentLauncher';

export function App() {
  const [totalEvents, setTotalEvents] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const handleEventCountChange = useCallback((count: number) => {
    setTotalEvents(count);
    setLastUpdated(new Date());
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar totalEvents={totalEvents} lastUpdated={lastUpdated} />

      <div className="flex-1 flex min-h-0">
        {/* Left panel — Event Stream */}
        <div className="w-[340px] shrink-0 border-r border-gray-800 bg-gray-900/50">
          <EventStream onEventCountChange={handleEventCountChange} />
        </div>

        {/* Center panel — Projections */}
        <div className="flex-1 min-w-0 bg-gray-950">
          <ProjectionTabs />
        </div>

        {/* Right panel — Intent Launcher */}
        <div className="w-[300px] shrink-0 border-l border-gray-800 bg-gray-900/50">
          <IntentLauncher />
        </div>
      </div>
    </div>
  );
}
