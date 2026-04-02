/**
 * GuardCardCheck — Central Verification Engine
 * Routes verification requests to the appropriate state adapter.
 * Handles caching, rate limiting, error recovery, and result normalization.
 */

const CaliforniaAdapter = require('./states/california');
const {
  IllinoisAdapter,
  VirginiaAdapter,
  NevadaAdapter,
  OregonAdapter,
  WashingtonAdapter,
  ArizonaAdapter,
  NorthCarolinaAdapter,
} = require('./states/remaining-states');
const FloridaAdapter = require('./states/florida');
const TexasAdapter = require('./states/texas');

// ============================================================
// Adapter Registry — all 10 Day-1 states
// ============================================================
const ADAPTERS = {
  CA: new CaliforniaAdapter(),
  FL: new FloridaAdapter(),
  TX: new TexasAdapter(),
  IL: new IllinoisAdapter(),
  VA: new VirginiaAdapter(),
  NV: new NevadaAdapter(),
  OR: new OregonAdapter(),
  WA: new WashingtonAdapter(),
  AZ: new ArizonaAdapter(),
  NC: new NorthCarolinaAdapter(),
};

// ============================================================
// In-memory LRU cache (replace with Redis in production)
// ============================================================
const cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — successful license + name hits
const CACHE_TTL_NOT_FOUND_MS = Math.min(
  parseInt(process.env.VERIFY_CACHE_NOT_FOUND_MS || '300000', 10) || 300000,
  CACHE_TTL_MS
); // default 5m — repeat lookups for unknown numbers
function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  const ttl = entry.ttlMs ?? CACHE_TTL_MS;
  if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttlMs) {
  cache.set(key, { data, timestamp: Date.now(), ttlMs: ttlMs ?? CACHE_TTL_MS });
  if (cache.size > 10000) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

/** Match @/lib/florida-license-lookup `normalizeFloridaLicenseInput` for cache keys. */
function normalizeFloridaLicenseKeyForCache(raw) {
  const cleaned = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  const m = cleaned.match(/^([A-Z]{1,2})(\d{7})$/);
  if (!m) return String(raw).trim().toUpperCase();
  const [, prefix, digits] = m;
  if (prefix.length === 1) return `${prefix} ${digits}`;
  return `${prefix}${digits}`;
}

/**
 * FDACS migrated the public form; the legacy axios adapter no longer matches the live markup.
 * Manual verify uses Puppeteer — batch and /api/verify must use the same path.
 */
async function verifyFloridaWithPuppeteer(licenseNumber) {
  const { lookupFloridaLicensesPuppeteer } = await import('@/lib/florida-license-lookup');
  const licNorm = normalizeFloridaLicenseKeyForCache(licenseNumber);
  const lookup = await lookupFloridaLicensesPuppeteer({ licenseNumber: licNorm });
  const adapter = ADAPTERS.FL;
  if (!lookup.ok) {
    if (lookup.error === 'NO_RESULTS') {
      return adapter.normalize({ status: 'NOT_FOUND', licenseNumber: licNorm });
    }
    return {
      stateCode: 'FL',
      stateName: adapter.state.name,
      licenseNumber: licNorm,
      licenseType: null,
      licenseTypeCode: null,
      holderName: null,
      status: 'VERIFICATION_ERROR',
      issueDate: null,
      expirationDate: null,
      isArmed: false,
      companyName: null,
      agencyName: adapter.state.agency.name,
      portalUrl: adapter.state.access.portalUrl,
      verifiedAt: new Date().toISOString(),
      error: 'Unable to retrieve license status. Please try again.',
      errorDetail: process.env.NODE_ENV === 'development' ? lookup.message : undefined,
      retryAfter: 60,
    };
  }
  const r = lookup.results[0];
  const typeCode = (r.license_type || 'D').toString().toUpperCase();
  return adapter.normalize({
    licenseNumber: r.license_number || licNorm,
    licenseType: adapter._getLicenseTypeName(typeCode),
    licenseTypeCode: typeCode,
    holderName: r.name || null,
    status: r.status || null,
    issueDate: null,
    expirationDate: r.expiration_date ? new Date(r.expiration_date) : null,
    isArmed: typeCode === 'G',
    zipCode: r.zip_code || null,
  });
}

// ============================================================
// Verification Functions
// ============================================================

/**
 * Verify a single license number in a specific state.
 * 
 * @param {string} stateCode - e.g. 'CA', 'FL', 'TX'
 * @param {string} licenseNumber - the license number to look up
 * @param {object} options
 * @param {boolean} options.useCache - whether to check cache first (default: true)
 * @returns {Promise<VerificationResult>}
 */
async function verifyLicense(stateCode, licenseNumber, options = {}) {
  const { useCache = true } = options;
  const state = stateCode.toUpperCase();
  const adapter = ADAPTERS[state];

  if (!adapter) {
    return {
      stateCode: state,
      licenseNumber,
      status: 'STATE_NOT_SUPPORTED',
      error: `State ${state} is not currently supported. Supported states: ${Object.keys(ADAPTERS).join(', ')}`,
    };
  }

  const cacheKey =
    state === 'FL'
      ? `FL:${normalizeFloridaLicenseKeyForCache(licenseNumber)}`
      : `${state}:${licenseNumber.trim().toUpperCase()}`;

  if (useCache) {
    const cached = getCached(cacheKey);
    if (cached) return { ...cached, fromCache: true };
  }

  try {
    const result =
      state === 'FL'
        ? await verifyFloridaWithPuppeteer(licenseNumber)
        : await adapter.verify(licenseNumber);
    if (result.status !== 'VERIFICATION_ERROR') {
      const ttl =
        result && result.status === 'NOT_FOUND' ? CACHE_TTL_NOT_FOUND_MS : CACHE_TTL_MS;
      setCache(cacheKey, result, ttl);
    }
    return result;
  } catch (error) {
    console.error(`[${state}] Verification error for ${licenseNumber}:`, error.message);
    return {
      stateCode: state,
      licenseNumber,
      status: 'VERIFICATION_ERROR',
      error: 'Unable to retrieve license status. Please try again.',
      errorDetail: process.env.NODE_ENV === 'development' ? error.message : undefined,
      retryAfter: 60,
    };
  }
}

/**
 * Search by name across one or multiple states.
 * 
 * @param {string} firstName
 * @param {string} lastName
 * @param {string|string[]} states - single state code or array, or 'ALL' for all states
 * @returns {Promise<VerificationResult[]>}
 */
async function searchByName(firstName, lastName, states = 'ALL') {
  const stateCodes = states === 'ALL'
    ? Object.keys(ADAPTERS)
    : (Array.isArray(states) ? states : [states]).map(s => s.toUpperCase());

  const validCodes = stateCodes.filter(code => ADAPTERS[code]);

  const cacheKey = `NAME:${firstName.trim().toLowerCase()}:${lastName.trim().toLowerCase()}:${validCodes.slice().sort().join(',')}`;
  const nameHit = getCached(cacheKey);
  if (nameHit) return { results: nameHit, fromCache: true };

  // Run all state lookups in parallel
  const promises = validCodes.map(async (stateCode) => {
    try {
      const adapter = ADAPTERS[stateCode];
      const results = await adapter.search(firstName, lastName);
      return Array.isArray(results) ? results : [results];
    } catch (error) {
      console.error(`[${stateCode}] Search error:`, error.message);
      return [];
    }
  });

  const allResults = await Promise.allSettled(promises);

  const merged = allResults
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(r => r.status !== 'NOT_FOUND');

  // Only cache non-empty name hits — adapters swallow errors as [], so empty cannot be trusted as "no results"
  if (merged.length > 0) {
    setCache(cacheKey, merged);
  }
  return { results: merged, fromCache: false };
}

/**
 * Bulk verify a roster of license numbers across multiple states.
 * Used by Business/Enterprise tier customers uploading Excel rosters.
 * 
 * @param {Array<{stateCode: string, licenseNumber: string, guardName?: string}>} roster
 * @param {{ afterEachVerify?: (result: object) => void | Promise<void> }} [hooks] — e.g. record usage per row
 * @returns {Promise<RosterVerificationResult>}
 */
async function verifyRoster(roster, hooks = {}) {
  const { afterEachVerify } = hooks;
  const startTime = Date.now();

  // Sequential: FDACS/TOPS use Puppeteer + shared browser; parallel rows caused empty/wrong results.
  const results = [];

  for (let i = 0; i < roster.length; i++) {
    const guard = roster[i];
    const result = await verifyLicense(guard.stateCode, guard.licenseNumber);
    if (typeof afterEachVerify === 'function') {
      try {
        await afterEachVerify(result);
      } catch (e) {
        console.error('[verifyRoster] afterEachVerify:', e?.message || e);
      }
    }
    results.push({
      ...result,
      rosterGuardName: guard.guardName,
      rosterIndex: i,
    });
    if (i + 1 < roster.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // Calculate summary statistics
  const summary = {
    total: results.length,
    active: results.filter(r => r.status === 'ACTIVE').length,
    expired: results.filter(r => r.status === 'EXPIRED').length,
    expiringSoon: results.filter(r => {
      if (!r.expirationDate) return false;
      const days = Math.ceil((new Date(r.expirationDate) - new Date()) / (1000*60*60*24));
      return days > 0 && days <= 60;
    }).length,
    revoked: results.filter(r => r.status === 'REVOKED').length,
    suspended: results.filter(r => r.status === 'SUSPENDED').length,
    notFound: results.filter(r => r.status === 'NOT_FOUND').length,
    errors: results.filter(r => r.status === 'VERIFICATION_ERROR').length,
    armed: results.filter(r => r.isArmed && r.status === 'ACTIVE').length,
    processingTimeMs: Date.now() - startTime,
    statesChecked: [...new Set(results.map(r => r.stateCode))],
  };

  const complianceScore = summary.total > 0
    ? Math.round((summary.active / summary.total) * 100)
    : 0;

  return { results, summary, complianceScore };
}

/**
 * Get list of all supported states with their metadata
 */
function getSupportedStates() {
  return Object.entries(ADAPTERS).map(([code, adapter]) => ({
    code,
    name: adapter.name,
    agency: adapter.state.agency.name,
    licenseTypes: Object.values(adapter.state.licenses)
      .filter(l => l.individual)
      .map(l => ({ code: l.code, name: l.name, isArmed: l.armedCapable })),
    accessType: adapter.state.access.type,
  }));
}

/**
 * Clear cache for a specific license (call after manual verification)
 */
function invalidateCache(stateCode, licenseNumber) {
  const state = stateCode.toUpperCase();
  const key =
    state === 'FL'
      ? `FL:${normalizeFloridaLicenseKeyForCache(licenseNumber)}`
      : `${state}:${licenseNumber.trim().toUpperCase()}`;
  cache.delete(key);
}

module.exports = {
  verifyLicense,
  searchByName,
  verifyRoster,
  getSupportedStates,
  invalidateCache,
  ADAPTERS,
};
