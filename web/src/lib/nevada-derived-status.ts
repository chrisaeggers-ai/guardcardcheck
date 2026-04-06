/**
 * Map PILB expiration date + explicit "expired" signals to list status.
 * Shared by `/verify`, home quick verify, and `nevada-license-lookup` parsing.
 */
export function nevadaDerivedStatus(
  expirationIso: string | null,
  expiredSignal: boolean
): 'ACTIVE' | 'EXPIRED' {
  if (expirationIso) {
    const d = new Date(`${expirationIso}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return d.getTime() < Date.now() ? 'EXPIRED' : 'ACTIVE';
    }
  }
  if (expiredSignal) return 'EXPIRED';
  return 'ACTIVE';
}
