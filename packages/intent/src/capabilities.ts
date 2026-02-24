import { AuthorizationError } from '@nova/core';

const CAPABILITY_REQUIREMENTS: Record<string, string[]> = {
  'mdm.vendor.create': ['mdm.vendor.create'],
  'mdm.vendor.update': ['mdm.vendor.update'],
  'mdm.item.create': ['mdm.item.create'],
  'mdm.vendor.add_contact': ['mdm.vendor.update'],
  'ap.invoice.submit': ['ap.invoice.submit'],
  'ap.invoice.approve': ['ap.invoice.approve'],
  'ap.invoice.reject': ['ap.invoice.reject'],
  'ap.invoice.post': ['ap.invoice.post'],
  'ap.invoice.pay': ['ap.invoice.pay'],
  'ap.purchase_order.create': ['ap.purchase_order.create'],
};

export function checkCapabilities(
  intentType: string,
  userCapabilities: string[] | undefined,
): void {
  // If no capabilities provided (auth not enabled), skip check
  if (!userCapabilities) return;

  const required = CAPABILITY_REQUIREMENTS[intentType];
  if (!required) return; // No requirements defined for this intent type

  const hasAll = required.every((cap) => userCapabilities.includes(cap));
  if (!hasAll) {
    throw new AuthorizationError(
      `Missing required capabilities for ${intentType}: ${required.join(', ')}`,
      required,
    );
  }
}
