import { useCallback } from 'react';
import { api } from '../api';
import { usePolling } from '../usePolling';

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function VendorBalances() {
  const fetcher = useCallback(() => api.vendorBalances(), []);
  const { data: balances } = usePolling(fetcher, 3000);

  if (!balances) {
    return <div className="flex items-center justify-center h-32 text-gray-600 text-sm">Loading...</div>;
  }

  const totalOutstanding = balances.reduce((sum, b) => sum + Number(b.outstanding_amount), 0);

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-900 z-10">
          <tr className="border-b border-gray-800">
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Vendor
            </th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Entity
            </th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Outstanding
            </th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Invoices
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/40">
          {balances.map((b) => (
            <tr key={`${b.vendor_id}-${b.legal_entity}`} className="hover:bg-gray-800/30 transition-colors">
              <td className="px-4 py-2.5 font-mono text-xs text-gray-300">
                {b.vendor_id.slice(0, 12)}...
              </td>
              <td className="px-4 py-2.5 text-xs text-gray-400">{b.legal_entity}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-gray-200 text-right">
                {formatCurrency(Number(b.outstanding_amount), b.currency)}
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-gray-400 text-right">
                {b.invoice_count}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-gray-700 bg-gray-900/50">
          <tr>
            <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-gray-300">Total</td>
            <td className="px-4 py-2.5 font-mono text-xs font-semibold text-white text-right">
              {formatCurrency(totalOutstanding, 'USD')}
            </td>
            <td className="px-4 py-2.5 font-mono text-xs text-gray-400 text-right">
              {balances.reduce((sum, b) => sum + Number(b.invoice_count), 0)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
