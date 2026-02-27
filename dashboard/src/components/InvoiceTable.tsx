import { useState, useCallback } from 'react';
import { api } from '../api';
import { usePolling } from '../usePolling';

type SortField = 'invoice_number' | 'vendor_name' | 'amount' | 'status' | 'due_date';

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40',
  posted: 'bg-blue-900/40 text-blue-300 border-blue-700/40',
  approved: 'bg-blue-900/30 text-blue-300 border-blue-700/30',
  submitted: 'bg-amber-900/40 text-amber-300 border-amber-700/40',
  matched: 'bg-cyan-900/40 text-cyan-300 border-cyan-700/40',
  match_exception: 'bg-orange-900/40 text-orange-300 border-orange-700/40',
  rejected: 'bg-red-900/40 text-red-300 border-red-700/40',
  cancelled: 'bg-gray-800/40 text-gray-400 border-gray-600/40',
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-800 text-gray-400 border-gray-600';
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${style}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function InvoiceTable() {
  const fetcher = useCallback(() => api.invoices(), []);
  const { data: invoices } = usePolling(fetcher, 3000);
  const [sortField, setSortField] = useState<SortField>('due_date');
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sorted = [...(invoices ?? [])].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;
    switch (sortField) {
      case 'amount':
        return (a.amount - b.amount) * dir;
      case 'invoice_number':
        return a.invoice_number.localeCompare(b.invoice_number) * dir;
      case 'vendor_name':
        return a.vendor_name.localeCompare(b.vendor_name) * dir;
      case 'status':
        return a.status.localeCompare(b.status) * dir;
      case 'due_date':
        return a.due_date.localeCompare(b.due_date) * dir;
      default:
        return 0;
    }
  });

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      onClick={() => handleSort(field)}
      className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200 transition-colors select-none"
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortField === field && (
          <span className="text-indigo-400">{sortAsc ? '\u2191' : '\u2193'}</span>
        )}
      </span>
    </th>
  );

  if (!invoices) {
    return <div className="flex items-center justify-center h-32 text-gray-600 text-sm">Loading...</div>;
  }

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-900 z-10">
          <tr className="border-b border-gray-800">
            <SortHeader field="invoice_number">Invoice</SortHeader>
            <SortHeader field="vendor_name">Vendor</SortHeader>
            <SortHeader field="amount">Amount</SortHeader>
            <SortHeader field="status">Status</SortHeader>
            <SortHeader field="due_date">Due Date</SortHeader>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/40">
          {sorted.map((inv) => (
            <tr key={inv.invoice_id} className="hover:bg-gray-800/30 transition-colors">
              <td className="px-4 py-2.5 font-mono text-xs text-gray-300">{inv.invoice_number}</td>
              <td className="px-4 py-2.5 text-gray-300">{inv.vendor_name}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-gray-200 text-right">
                {formatCurrency(Number(inv.amount), inv.currency)}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={inv.status} />
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{inv.due_date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
