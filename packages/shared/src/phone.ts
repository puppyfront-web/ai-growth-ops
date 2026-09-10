/** Normalize phone to digits-only for dedup (CN: strip leading 86 country code). */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('86')) {
    return digits.slice(2);
  }
  return digits;
}

/** Basic CN mobile validation: 11 digits starting with 1. */
export function isValidPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return /^1\d{10}$/.test(normalized);
}
