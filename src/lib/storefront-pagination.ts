export function isValidStorefrontCursor(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 1_024 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function isValidStorefrontPageLimit(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 100
  );
}
