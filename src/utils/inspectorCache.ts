/**
 * Client-side localStorage cache for individual reference breakdowns (Deep Inspector)
 */

const CACHE_PREFIX = 'emergent_ref_breakdown_v1_';

export function getCachedBreakdown(refId: string): any | null {
  try {
    const key = `${CACHE_PREFIX}${refId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.data) {
      return parsed.data;
    }
    return null;
  } catch (err) {
    console.warn('Error reading breakdown cache for ref:', refId, err);
    return null;
  }
}

export function setCachedBreakdown(refId: string, breakdownData: any): void {
  try {
    const key = `${CACHE_PREFIX}${refId}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        data: breakdownData,
        cachedAt: new Date().toISOString(),
      })
    );
  } catch (err) {
    console.warn('Error writing breakdown cache for ref:', refId, err);
  }
}

export function clearBreakdownCache(): void {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (err) {
    console.warn('Error clearing breakdown cache:', err);
  }
}
