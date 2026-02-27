import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import type { NovaEvent } from '../types';

function moduleColor(eventType: string): string {
  if (eventType.startsWith('ap.')) return 'text-blue-400';
  if (eventType.startsWith('gl.')) return 'text-emerald-400';
  if (eventType.startsWith('mdm.')) return 'text-gray-400';
  return 'text-purple-400';
}

function moduleBadgeColor(eventType: string): string {
  if (eventType.startsWith('ap.')) return 'bg-blue-900/50 text-blue-300 border-blue-700/50';
  if (eventType.startsWith('gl.')) return 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50';
  if (eventType.startsWith('mdm.')) return 'bg-gray-800/50 text-gray-300 border-gray-600/50';
  return 'bg-purple-900/50 text-purple-300 border-purple-700/50';
}

function modulePrefix(eventType: string): string {
  const parts = eventType.split('.');
  return (parts[0] ?? '').toUpperCase();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface EventStreamProps {
  onEventCountChange: (count: number) => void;
}

export function EventStream({ onEventCountChange }: EventStreamProps) {
  const [events, setEvents] = useState<NovaEvent[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const maxSeqRef = useRef<string>('0');
  const pausedRef = useRef(false);

  // Keep pausedRef in sync
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const poll = useCallback(async () => {
    try {
      // Fetch all events to get the full list
      const page = await api.events(undefined, 500);
      if (page.events.length > 0) {
        onEventCountChange(page.events.length);
        const lastEvent = page.events[page.events.length - 1];
        const newMaxSeq = lastEvent?.sequence ?? '0';

        if (newMaxSeq !== maxSeqRef.current) {
          maxSeqRef.current = newMaxSeq;
          // Show most recent first
          setEvents([...page.events].reverse());
        }
      }
    } catch {
      // silently retry on next tick
    }
  }, [onEventCountChange]);

  useEffect(() => {
    poll();
    const id = setInterval(() => {
      if (!pausedRef.current) poll();
    }, 2000);
    return () => clearInterval(id);
  }, [poll]);

  // Auto-scroll when not paused
  useEffect(() => {
    if (!paused && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [events, paused]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Live Events</h2>
        <button
          onClick={() => setPaused((p) => !p)}
          className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
            paused
              ? 'bg-amber-900/50 text-amber-300 hover:bg-amber-900/70'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          {paused ? 'Paused' : 'Pause'}
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
            Waiting for events...
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {events.map((ev) => (
              <div key={ev.id}>
                <button
                  onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-[11px] font-mono text-gray-600 pt-0.5 shrink-0">
                      {formatTime(ev.occurred_at)}
                    </span>
                    <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border shrink-0 ${moduleBadgeColor(ev.type)}`}>
                      {modulePrefix(ev.type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className={`text-xs font-mono font-medium ${moduleColor(ev.type)}`}>
                        {ev.type}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-gray-500 truncate">
                          {ev.actor.name}
                        </span>
                        {ev.entities[0] && (
                          <span className="text-[11px] text-gray-600 font-mono truncate">
                            {ev.entities[0].entity_type}:{ev.entities[0].entity_id.slice(0, 8)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>

                {expandedId === ev.id && (
                  <div className="px-4 pb-3 bg-gray-900/50">
                    {/* Rules evaluation */}
                    {ev.rules_evaluated.length > 0 && (
                      <div className="mb-2">
                        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Rules</div>
                        <div className="space-y-0.5">
                          {ev.rules_evaluated.map((r, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px] font-mono">
                              <span className={
                                r.result === 'fired'
                                  ? 'text-emerald-400'
                                  : r.result === 'condition_false'
                                    ? 'text-amber-400'
                                    : 'text-gray-600'
                              }>
                                {r.result === 'fired' ? '\u2713' : r.result === 'condition_false' ? '\u2717' : '\u2014'}
                              </span>
                              <span className="text-gray-400">{r.rule_name}</span>
                              <span className="text-gray-600">{r.evaluation_ms}ms</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Caused-by chain */}
                    {ev.caused_by && (
                      <div className="mb-2">
                        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Caused By</div>
                        <span className="text-[11px] font-mono text-gray-400">{ev.caused_by}</span>
                      </div>
                    )}

                    {/* Full payload */}
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Payload</div>
                      <pre className="text-[11px] font-mono text-gray-400 bg-gray-950 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
                        {JSON.stringify(ev.data, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
