import type { Condition } from './types.js';

function getFieldValue(data: Record<string, unknown>, fieldPath: string): unknown {
  const parts = fieldPath.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function evaluateCondition(
  condition: Condition,
  data: Record<string, unknown>,
): boolean {
  const value = getFieldValue(data, condition.field);

  switch (condition.operator) {
    case 'eq':
      return value === condition.value;

    case 'neq':
      return value !== condition.value;

    case 'not_empty':
      return (
        value !== null &&
        value !== undefined &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0)
      );

    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(value);

    case 'not_in':
      return Array.isArray(condition.value) && !condition.value.includes(value);

    case 'exists':
      return value !== undefined;

    default:
      return false;
  }
}
