import { useState, useCallback, type FormEvent } from 'react';
import { api } from '../api';

interface IntentType {
  value: string;
  label: string;
  fields: FieldDef[];
}

interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  nested?: string; // dot-path for nesting, e.g. "address.street"
}

const INTENT_TYPES: IntentType[] = [
  {
    value: 'mdm.vendor.create',
    label: 'Create Vendor',
    fields: [
      { name: 'name', label: 'Vendor Name', type: 'text', placeholder: 'Acme Corp', required: true },
      { name: 'tax_id', label: 'Tax ID', type: 'text', placeholder: 'XX-XXXXXXX', required: true },
      {
        name: 'payment_terms',
        label: 'Payment Terms',
        type: 'select',
        options: [
          { value: 'net-15', label: 'Net 15' },
          { value: 'net-30', label: 'Net 30' },
          { value: 'net-45', label: 'Net 45' },
          { value: 'net-60', label: 'Net 60' },
        ],
      },
      {
        name: 'currency',
        label: 'Currency',
        type: 'select',
        options: [
          { value: 'USD', label: 'USD' },
          { value: 'GBP', label: 'GBP' },
          { value: 'EUR', label: 'EUR' },
        ],
      },
    ],
  },
  {
    value: 'ap.purchase_order.create',
    label: 'Create PO',
    fields: [
      { name: 'po_number', label: 'PO Number', type: 'text', placeholder: 'PO-001', required: true },
      { name: 'vendor_id', label: 'Vendor ID', type: 'text', placeholder: 'ULID', required: true },
      { name: 'total_amount', label: 'Total Amount', type: 'number', placeholder: '10000', required: true },
      {
        name: 'currency',
        label: 'Currency',
        type: 'select',
        options: [
          { value: 'USD', label: 'USD' },
          { value: 'GBP', label: 'GBP' },
        ],
      },
    ],
  },
  {
    value: 'ap.invoice.submit',
    label: 'Submit Invoice',
    fields: [
      { name: 'invoice_number', label: 'Invoice #', type: 'text', placeholder: 'INV-001', required: true },
      { name: 'vendor_id', label: 'Vendor ID', type: 'text', placeholder: 'ULID', required: true },
      { name: 'vendor_name', label: 'Vendor Name', type: 'text', placeholder: 'Acme Corp', required: true },
      { name: 'amount', label: 'Amount', type: 'number', placeholder: '5000', required: true },
      {
        name: 'currency',
        label: 'Currency',
        type: 'select',
        options: [
          { value: 'USD', label: 'USD' },
          { value: 'GBP', label: 'GBP' },
        ],
      },
      { name: 'due_date', label: 'Due Date', type: 'text', placeholder: 'YYYY-MM-DD', required: true },
    ],
  },
  {
    value: 'ap.invoice.approve',
    label: 'Approve Invoice',
    fields: [
      { name: 'invoice_id', label: 'Invoice ID', type: 'text', placeholder: 'ULID', required: true },
    ],
  },
  {
    value: 'ap.invoice.post',
    label: 'Post Invoice',
    fields: [
      { name: 'invoice_id', label: 'Invoice ID', type: 'text', placeholder: 'ULID', required: true },
    ],
  },
  {
    value: 'ap.invoice.pay',
    label: 'Pay Invoice',
    fields: [
      { name: 'invoice_id', label: 'Invoice ID', type: 'text', placeholder: 'ULID', required: true },
      { name: 'payment_reference', label: 'Payment Ref', type: 'text', placeholder: 'CHK-001' },
    ],
  },
];

type ResultState =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; data: unknown }
  | { type: 'error'; error: { error: string; message: string; traces?: unknown[] } };

export function IntentLauncher() {
  const [selectedType, setSelectedType] = useState(INTENT_TYPES[0]!.value);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ResultState>({ type: 'idle' });

  const intentDef = INTENT_TYPES.find((t) => t.value === selectedType)!;

  const handleTypeChange = useCallback((value: string) => {
    setSelectedType(value);
    setFormData({});
    setResult({ type: 'idle' });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setResult({ type: 'loading' });

    // Build data object, converting numbers
    const data: Record<string, unknown> = {};
    for (const field of intentDef.fields) {
      const val = formData[field.name];
      if (val === undefined || val === '') continue;
      if (field.type === 'number') {
        data[field.name] = parseFloat(val);
      } else {
        data[field.name] = val;
      }
    }

    try {
      const response = await api.submitIntent({
        type: selectedType,
        actor: {
          type: 'human',
          id: 'dashboard-user',
          name: 'Dashboard User',
        },
        data,
      });
      setResult({ type: 'success', data: response });
    } catch (err) {
      setResult({
        type: 'error',
        error: err as { error: string; message: string; traces?: unknown[] },
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Intent Launcher</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Intent type selector */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
              Intent Type
            </label>
            <select
              value={selectedType}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {INTENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Dynamic fields */}
          {intentDef.fields.map((field) => (
            <div key={field.name}>
              <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                {field.label}
                {field.required && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              {field.type === 'select' ? (
                <select
                  value={formData[field.name] ?? field.options?.[0]?.value ?? ''}
                  onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={formData[field.name] ?? ''}
                  onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                  placeholder={field.placeholder}
                  required={field.required}
                  step={field.type === 'number' ? 'any' : undefined}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                />
              )}
            </div>
          ))}

          <button
            type="submit"
            disabled={result.type === 'loading'}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:text-indigo-400 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors mt-2"
          >
            {result.type === 'loading' ? 'Submitting...' : 'Submit Intent'}
          </button>
        </form>

        {/* Result area */}
        {result.type === 'success' && (
          <div className="mt-3 bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3">
            <div className="text-xs font-semibold text-emerald-300 mb-1">Success</div>
            <pre className="text-[11px] font-mono text-emerald-200/80 overflow-x-auto max-h-32 overflow-y-auto">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          </div>
        )}

        {result.type === 'error' && (
          <div className="mt-3 bg-red-900/20 border border-red-700/40 rounded-lg p-3">
            <div className="text-xs font-semibold text-red-300 mb-1">{result.error.error}</div>
            <div className="text-xs text-red-200/80 mb-2">{result.error.message}</div>
            {result.error.traces && (
              <pre className="text-[11px] font-mono text-red-200/60 overflow-x-auto max-h-32 overflow-y-auto">
                {JSON.stringify(result.error.traces, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
