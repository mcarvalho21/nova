import type { Rule } from './types.js';

export const ITEM_CREATE_RULES: Rule[] = [
  {
    id: 'item-name-required',
    name: 'Item name is required',
    description: 'Rejects item creation if the name field is empty',
    priority: 1,
    intent_type: 'mdm.item.create',
    conditions: [
      { field: '_name_missing', operator: 'eq', value: true },
    ],
    action: 'reject',
    rejection_message: 'Item name is required',
  },
  {
    id: 'item-sku-unique',
    name: 'Item SKU must be unique',
    description: 'Rejects item creation if a item with the same SKU already exists',
    priority: 2,
    intent_type: 'mdm.item.create',
    conditions: [
      { field: '_sku_duplicate_exists', operator: 'eq', value: true },
    ],
    action: 'reject',
    rejection_message: 'An item with this SKU already exists',
  },
];
