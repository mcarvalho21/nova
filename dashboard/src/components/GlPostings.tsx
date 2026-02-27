import { useCallback } from 'react';
import { api } from '../api';
import { usePolling } from '../usePolling';

function formatCurrency(amount: number): string {
  return Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

export function GlPostings() {
  const fetcher = useCallback(() => api.glPostings(), []);
  const { data: postings } = usePolling(fetcher, 3000);

  if (!postings) {
    return <div className="flex items-center justify-center h-32 text-gray-600 text-sm">Loading...</div>;
  }

  const totalDebit = postings.reduce((sum, p) => sum + Number(p.debit), 0);
  const totalCredit = postings.reduce((sum, p) => sum + Number(p.credit), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-900 z-10">
          <tr className="border-b border-gray-800">
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Date
            </th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Account
            </th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Debit
            </th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Credit
            </th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Description
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/40">
          {postings.map((p) => (
            <tr key={p.posting_id} className="hover:bg-gray-800/30 transition-colors">
              <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{formatDate(p.posted_at)}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-indigo-300">{p.account_code}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-right">
                {Number(p.debit) > 0 ? (
                  <span className="text-gray-200">{formatCurrency(Number(p.debit))}</span>
                ) : (
                  <span className="text-gray-700">&mdash;</span>
                )}
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-right">
                {Number(p.credit) > 0 ? (
                  <span className="text-gray-200">{formatCurrency(Number(p.credit))}</span>
                ) : (
                  <span className="text-gray-700">&mdash;</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[200px] truncate">
                {p.description}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-gray-700 bg-gray-900/50">
          <tr>
            <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-gray-300">
              Totals
              {balanced ? (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
                  Balanced
                </span>
              ) : (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-700/40">
                  Imbalanced
                </span>
              )}
            </td>
            <td className="px-4 py-2.5 font-mono text-xs font-semibold text-white text-right">
              {formatCurrency(totalDebit)}
            </td>
            <td className="px-4 py-2.5 font-mono text-xs font-semibold text-white text-right">
              {formatCurrency(totalCredit)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
