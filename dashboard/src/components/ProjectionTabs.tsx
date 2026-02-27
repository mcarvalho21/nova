import { useState } from 'react';
import { InvoiceTable } from './InvoiceTable';
import { AgingChart } from './AgingChart';
import { VendorBalances } from './VendorBalances';
import { GlPostings } from './GlPostings';

const TABS = [
  { id: 'invoices', label: 'AP Invoices' },
  { id: 'aging', label: 'AP Aging' },
  { id: 'vendors', label: 'Vendor Balances' },
  { id: 'gl', label: 'GL Postings' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function ProjectionTabs() {
  const [activeTab, setActiveTab] = useState<TabId>('invoices');

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-0 px-4 pt-2 border-b border-gray-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'invoices' && <InvoiceTable />}
        {activeTab === 'aging' && <AgingChart />}
        {activeTab === 'vendors' && <VendorBalances />}
        {activeTab === 'gl' && <GlPostings />}
      </div>
    </div>
  );
}
