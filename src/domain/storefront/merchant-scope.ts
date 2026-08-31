export type MerchantSlugValidationResult =
  | { ok: true; value: string }
  | { field: 'merchantSlug'; ok: false };

const MERCHANT_SLUG_PATTERN = /^[a-z0-9-]+$/;

export function normalizeMerchantSlug(
  merchantSlug: string,
): MerchantSlugValidationResult {
  const normalized = merchantSlug.trim();

  if (
    normalized.length < 1 ||
    normalized.length > 100 ||
    !MERCHANT_SLUG_PATTERN.test(normalized)
  ) {
    return { field: 'merchantSlug', ok: false };
  }

  return { ok: true, value: normalized };
}
