/** Normalize US phone to E.164 (+1XXXXXXXXXX). Returns null if invalid. */
export function normalizeUsPhoneToE164(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export function isValidUsPhone(input: string): boolean {
  return normalizeUsPhoneToE164(input) !== null;
}
