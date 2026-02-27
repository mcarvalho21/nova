import type {
  HealthResponse,
  EventPage,
  ApInvoice,
  ApAgingRow,
  VendorBalance,
  GlPosting,
} from './types';

const BASE = '';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data as T;
}

export const api = {
  health: () => get<HealthResponse>('/health'),

  events: (afterSequence?: string, limit = 100) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (afterSequence) params.set('after_sequence', afterSequence);
    return get<EventPage>(`/audit/events?${params}`);
  },

  invoices: () => get<ApInvoice[]>('/projections/ap_invoice_list'),
  aging: () => get<ApAgingRow[]>('/projections/ap_aging'),
  vendorBalances: () => get<VendorBalance[]>('/projections/ap_vendor_balance'),
  glPostings: () => get<GlPosting[]>('/projections/gl_postings'),

  submitIntent: (body: {
    type: string;
    actor: { type: string; id: string; name: string };
    data: Record<string, unknown>;
  }) => post('/intents', body),
};
