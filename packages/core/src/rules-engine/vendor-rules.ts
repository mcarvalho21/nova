import type { Rule } from './types.js';

export const VENDOR_CREATE_RULES: Rule[] = [
  {
    id: 'vendor-name-required',
    name: 'Vendor name is required',
    description: 'Rejects vendor creation if the name field is empty',
    priority: 1,
    intent_type: 'mdm.vendor.create',
    conditions: [
      { field: '_name_missing', operator: 'eq', value: true },
    ],
    action: 'reject',
    rejection_message: 'Vendor name is required',
  },
  {
    id: 'vendor-name-unique',
    name: 'Vendor name must be unique',
    description: 'Rejects vendor creation if a vendor with the same name already exists',
    priority: 2,
    intent_type: 'mdm.vendor.create',
    conditions: [
      { field: '_duplicate_exists', operator: 'eq', value: true },
    ],
    action: 'reject',
    rejection_message: 'A vendor with this name already exists',
  },
  {
    id: 'vendor-high-value-approval',
    name: 'High-value vendor requires approval',
    description: 'Routes vendor creation for approval if credit_limit exceeds 100,000',
    priority: 10,
    intent_type: 'mdm.vendor.create',
    conditions: [
      { field: 'credit_limit', operator: 'gt', value: 100000 },
    ],
    action: 'route_for_approval',
    approver_role: 'mdm_manager',
  },
];
