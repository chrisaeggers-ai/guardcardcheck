/**
 * California State Adapter — DCA iServices Search API
 * Docs: https://iservices.dca.ca.gov/docs/search
 * Auth: APP_ID + APP_KEY headers (3scale)
 */

const http = require('http');
const https = require('https');
const axios = require('axios');
const BaseStateAdapter = require('../adapters/BaseStateAdapter');
const { STATES } = require('../../config/states');

const DCA_STATUS = {
  '1': 'ACTIVE', '10': 'PENDING', '20': 'ACTIVE', '30': 'EXPIRED',
  '40': 'CANCELLED', '50': 'REVOKED', '60': 'SUSPENDED',
  '70': 'DENIED', '80': 'RETIRED', '90': 'DECEASED', '100': 'DELINQUENT',
};

const DCA_LIC_TYPES = {
  G: 'Guard Card', FE: 'Exposed Firearm Permit', FQ: 'Firearm Qualification Card',
  PPO: 'Private Patrol Operator',
  '1201': 'Guard Registration', '1202': 'Firearm Permit', '1203': 'Private Patrol Operator',
  '1204': 'Alarm Company Operator', '1205': 'Locksmith', '1206': 'Repossessor',
  '1207': 'Private Investigator', '1211': 'Firearms Qualification',
  '1260': 'Security Guard Instructor', '1262': 'Proprietary Security Employer',
};

const ARMED_CODES = ['FE', 'FQ', '1202', '1211'];

/**
 * BSIS / BreEZe licTypeCode → human-readable credential (what is this license for?).
 * Distinguishes employee guard card vs PPO company license vs firearm, etc.
 */
const BSIS_CREDENTIAL_SPEC = {
  '1201': {
    short: 'Guard registration',
    specification: 'BSIS security guard registration — employee Class G (unarmed guard card / registration)',
    category: 'guard_employee',
  },
  '1202': {
    short: 'Firearm permit',
    specification: 'BSIS exposed firearm permit — armed guard (qualification to carry on duty)',
    category: 'firearm',
  },
  '1203': {
    short: 'Private Patrol Operator (PPO)',
    specification:
      'BSIS Private Patrol Operator (PPO) — company / business license (patrol operator business, not the same as an individual guard registration card)',
    category: 'company_ppo',
  },
  '1204': {
    short: 'Alarm company operator',
    specification: 'BSIS alarm company operator license',
    category: 'company_other',
  },
  '1205': {
    short: 'Locksmith',
    specification: 'BSIS locksmith license',
    category: 'company_other',
  },
  '1206': {
    short: 'Repossessor',
    specification: 'BSIS repossessor license',
    category: 'company_other',
  },
  '1207': {
    short: 'Private investigator',
    specification: 'BSIS private investigator license',
    category: 'pi',
  },
  '1211': {
    short: 'Firearms qualification',
    specification: 'BSIS firearms qualification card (FQ)',
    category: 'firearm',
  },
  '1260': {
    short: 'Security guard instructor',
    specification: 'BSIS security guard skills training instructor certificate',
    category: 'company_other',
  },
  '1262': {
    short: 'Proprietary security employer',
    specification: 'BSIS proprietary private security employer registration',
    category: 'company_other',
  },
};

/** Map letter-prefix style codes to BreEZe numeric type */
const LETTER_TO_LIC_TYPE = { G: '1201', FE: '1202', FQ: '1211', PPO: '1203' };

/** BSIS results use boardCode "120". */
const BSIS_BOARD_CODE = '120';

/**
 * clientCodeFilterId = 2 is BSIS in BreEZe (from getAllBoards).
 * This is NOT the same as boardCode "120" — the SNDX search API
 * expects the filterId, not the boardCode.
 */
const BSIS_CLIENT_CODE_FILTER_ID = 2;

/**
 * Map user-facing license prefix to BreEZe licTypeCode for the
 * GET /getLicenseNumberSearch endpoint.
 */
const PREFIX_TO_LIC_TYPE = {
  G: '1201',
  FE: '1202',
  FQ: '1211',
  PPO: '1203',
};

class CaliforniaAdapter extends BaseStateAdapter {
  constructor() {
    super(STATES.CA);
    this.apiBase = process.env.DCA_API_BASE || 'https://iservices.dca.ca.gov/api/search/v1';
    this.appId = process.env.DCA_APP_ID;
    this.appKey = process.env.DCA_APP_KEY || process.env.DCA_API_KEY;
    this.requestTimeout = Math.min(
      parseInt(process.env.DCA_API_TIMEOUT_MS || '25000', 10) || 25000,
      55000
    );

    const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
    const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });
    this.apiHttp = axios.create({
      baseURL: this.apiBase,
      timeout: this.requestTimeout,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      httpAgent,
      httpsAgent,
    });
  }

  _auth() { return { APP_ID: this.appId, APP_KEY: this.appKey }; }
  _ok() { return Boolean(this.appId && this.appKey); }

  _mapStatus(raw) { return DCA_STATUS[String(raw).trim()] || String(raw || ''); }
  _mapType(code) { return DCA_LIC_TYPES[code] || code; }
  _isArmed(code) { return ARMED_CODES.includes(String(code).trim()); }
  _normName(v) { return String(v || '').toUpperCase().replace(/[^A-Z]/g, ''); }

  _firstFromDcaName(name) {
    const raw = String(name || '').toUpperCase().trim();
    if (!raw) return '';
    const afterComma = raw.includes(',') ? raw.split(',').slice(1).join(',').trim() : raw;
    return afterComma.split(/\s+/)[0] || '';
  }

  _firstNameMatches(nameFromApi, requestedFirst) {
    const want = this._normName(requestedFirst);
    if (!want) return true;
    const apiFirst = this._normName(this._firstFromDcaName(nameFromApi));
    if (!apiFirst) return false;
    if (apiFirst === want) return true;
    if (apiFirst.startsWith(want) || want.startsWith(apiFirst)) return true;
    return false;
  }

  _toInt(license) {
    const d = String(license).replace(/\D/g, '');
    const n = parseInt(d, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  _detectPrefix(license) {
    const u = license.toUpperCase();
    if (u.startsWith('PPO')) return 'PPO';
    if (u.startsWith('FQ')) return 'FQ';
    if (u.startsWith('FE')) return 'FE';
    if (u.startsWith('G')) return 'G';
    return 'G';
  }

  _prefixToLicType(prefix) {
    return PREFIX_TO_LIC_TYPE[prefix] || '1201';
  }

  /** Normalize API type field to BreEZe licTypeCode string (e.g. 1201, 1203). */
  _normalizeLicTypeCode(tc) {
    const raw = String(tc ?? '').trim();
    if (!raw) return '1201';
    if (/^\d+$/.test(raw)) return raw;
    const u = raw.toUpperCase();
    if (LETTER_TO_LIC_TYPE[u]) return LETTER_TO_LIC_TYPE[u];
    if (u.startsWith('PPO')) return '1203';
    if (u.startsWith('FQ')) return '1211';
    if (u.startsWith('FE')) return '1202';
    if (u.startsWith('G')) return '1201';
    return raw;
  }

  _modifierNote(lic) {
    const mods = lic?.modifierTypes;
    if (!Array.isArray(mods) || !mods.length) return null;
    const parts = [];
    for (const m of mods) {
      const codes = (m.modifierCodes || []).join(', ');
      if (m.modifierType === 'R' && codes) parts.push(`Registrant modifiers: ${codes}`);
    }
    return parts.length ? parts.join(' · ') : null;
  }

  /**
   * One clear line for UI: what credential this row is (guard vs PPO vs firearm, etc.).
   */
  _normalizeZipDigits(value) {
    if (value == null || value === '') return null;
    const d = String(value).replace(/\D/g, '');
    if (d.length >= 9) return d.slice(0, 5);
    if (d.length === 5) return d;
    return null;
  }

  _zipFromObject(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const keys = [
      'zipCode', 'zip', 'mailingZip', 'mailingZipCode', 'mailZip', 'addrZip', 'addressZip',
      'zip5', 'zipcode',
    ];
    for (const k of keys) {
      const z = this._normalizeZipDigits(obj[k]);
      if (z) return z;
    }
    return null;
  }

  /** Best-effort ZIP from DCA summary row or nested address blobs. */
  _extractZipFromApiRow(row) {
    if (!row || typeof row !== 'object') return null;
    let z = this._zipFromObject(row);
    if (z) return z;
    z = this._zipFromObject(row.mailingAddress) || this._zipFromObject(row.address);
    if (z) return z;
    return null;
  }

  _extractZipFromDetailed(block, lic) {
    let z = this._zipFromObject(lic);
    if (z) return z;
    z = this._zipFromObject(block);
    if (z) return z;
    const tryList = (arr) => {
      if (!Array.isArray(arr)) return null;
      for (const a of arr) {
        const zz = this._zipFromObject(a);
        if (zz) return zz;
      }
      return null;
    };
    z =
      tryList(block?.getAddressDetails) ||
      tryList(lic?.getAddressDetails) ||
      tryList(block?.addressDetails);
    if (z) return z;
    for (const nb of block?.getNameDetails || []) {
      for (const ind of nb?.individualNameDetails || []) {
        const zz = this._zipFromObject(ind);
        if (zz) return zz;
      }
    }
    return null;
  }

  _credentialFields(licTypeCode, licenseNumber, detailedLic) {
    const code = this._normalizeLicTypeCode(licTypeCode);
    const spec = BSIS_CREDENTIAL_SPEC[code];
    const mod = detailedLic ? this._modifierNote(detailedLic) : null;
    let specification = spec
      ? spec.specification
      : `${this._mapType(licTypeCode)} (BSIS lic. type ${code})`;
    if (mod) specification += ` · ${mod}`;
    const short = spec ? spec.short : this._mapType(licTypeCode);
    const category = spec ? spec.category : 'other';
    return {
      licenseType: short,
      credentialSpecification: specification,
      credentialCategory: category,
    };
  }

  async verify(licenseNumber) {
    if (!this._ok()) {
      throw new Error('California verification requires DCA_APP_ID and DCA_APP_KEY.');
    }

    const clean = licenseNumber.trim().toUpperCase();
    const apiInt = this._toInt(clean);
    if (!apiInt) return this.normalize({ status: 'NOT_FOUND', licenseNumber: clean });

    const prefix = this._detectPrefix(clean);
    const licType = this._prefixToLicType(prefix);

    // Fast path: BreEZe GET by license number (often lower latency than POST agile search).
    const getFastMs = Math.min(
      parseInt(process.env.DCA_LICENSE_GET_TIMEOUT_MS || '12000', 10) || 12000,
      this.requestTimeout
    );
    try {
      const getRes = await this.apiHttp.get('/licenseSearchService/getLicenseNumberSearch', {
        params: { licType, licNumber: String(apiInt) },
        headers: this._auth(),
        timeout: getFastMs,
      });
      if (getRes.status === 200 && getRes.data) {
        const hit = this._normalizeFromPayload(getRes.data, clean);
        if (hit) return hit;
      }
    } catch (err) {
      if (err.response?.status === 404) {
        return this.normalize({ status: 'NOT_FOUND', licenseNumber: clean });
      }
      // Continue to POST on timeout or other GET failures.
    }

    // POST agile search — reliable when GET misses or returns empty payload.
    let response;
    try {
      response = await this.apiHttp.post(
        '/licenseSearchService/getPublicAgileSearch',
        { searchMethod: 'LIC_NBR', licenseNumbers: [apiInt] },
        { headers: this._auth(), timeout: this.requestTimeout },
      );
    } catch (err) {
      if (err.response?.status === 404) {
        return this.normalize({ status: 'NOT_FOUND', licenseNumber: clean });
      }
      if (err.code === 'ECONNABORTED' || err.code === 'ERR_CANCELED') {
        try {
          const getRes = await this.apiHttp.get('/licenseSearchService/getLicenseNumberSearch', {
            params: { licType, licNumber: String(apiInt) },
            headers: this._auth(),
            timeout: this.requestTimeout,
          });
          if (getRes.status === 200 && getRes.data) {
            const hit = this._normalizeFromPayload(getRes.data, clean);
            if (hit) return hit;
          }
        } catch { /* fall through */ }
        throw err;
      }
      throw err;
    }

    const result = this._normalizeFromPayload(response.data, clean);
    if (result) return result;
    return this.normalize({ status: 'NOT_FOUND', licenseNumber: clean });
  }

  async search(firstName, lastName) {
    if (!this._ok()) throw new Error('California name search requires DCA_APP_ID and DCA_APP_KEY.');

    const last = lastName.trim();
    if (!last) return [];
    const first = firstName.trim().toUpperCase();

    const searchName = first ? `${last}, ${first}` : last;

    // DCA SNDX routinely takes 15-35s; use 55s and retry once on timeout/504.
    const nameTimeout = 55000;
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await this.apiHttp.post(
          '/licenseSearchService/getPublicLicenseSearch',
          { searchMethod: 'SNDX', name: searchName, clientCodeId: [BSIS_CLIENT_CODE_FILTER_ID] },
          { headers: this._auth(), timeout: nameTimeout },
        );
        if (response.status >= 500) throw new Error(`DCA returned ${response.status}`);
        break;
      } catch (err) {
        const retriable =
          err.code === 'ECONNABORTED' ||
          err.code === 'ERR_CANCELED' ||
          (err.response && err.response.status >= 500);
        if (attempt === 0 && retriable) {
          console.warn('[CA] Name search attempt 1 failed, retrying…', err.message);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw err;
      }
    }

    const rows = (response.data?.results || []).filter(
      (r) => String(r.boardCode) === BSIS_BOARD_CODE
    );

    const filtered = first
      ? rows.filter((r) => this._firstNameMatches(r.name, first))
      : rows;

    return filtered.slice(0, 50).map((r) => this._fromSummaryNormalized(r));
  }

  // ── internal helpers ──

  _normalizeFromPayload(data, clean) {
    if (Array.isArray(data?.results) && data.results.length > 0) {
      const row = this._bestSummary(data.results, clean);
      if (row) return this.normalize(this._fromSummary(row, clean));
    }
    const pick = this._bestDetailed(data, clean);
    if (pick) return this.normalize(this._fromDetailed(pick, clean));
    return null;
  }

  _fromSummaryNormalized(r) {
    const tcRaw = r.licenseType || this._detectPrefix(String(r.licenseNumber || ''));
    const tc = this._normalizeLicTypeCode(tcRaw);
    const num = String(r.licenseNumber || '').trim();
    const cred = this._credentialFields(tc, num, null);
    return this.normalize({
      licenseNumber: num,
      licenseType: cred.licenseType,
      licenseTypeCode: tc,
      credentialSpecification: cred.credentialSpecification,
      credentialCategory: cred.credentialCategory,
      holderName: (r.name || '').trim(),
      zipCode: this._extractZipFromApiRow(r),
      status: this._mapStatus(r.primaryStatusCode),
      expirationDate: r.expirationDate || null,
      isArmed: this._isArmed(tcRaw) || this._isArmed(tc),
    });
  }

  _bestSummary(rows, requested) {
    const digits = requested.replace(/\D/g, '');
    let best = null, bestScore = -1;
    for (const r of rows) {
      const n = String(r.licenseNumber || '').trim();
      let score = n === requested ? 100 : n.replace(/\D/g, '') === digits ? 80 : 0;
      if (String(r.boardCode) === BSIS_BOARD_CODE) score += 10;
      if (score > bestScore) { best = r; bestScore = score; }
    }
    return best || rows[0];
  }

  _fromSummary(row, requested) {
    const num = String(row.licenseNumber || requested).trim();
    const tcRaw = row.licenseType || this._detectPrefix(num);
    const tc = this._normalizeLicTypeCode(tcRaw);
    const cred = this._credentialFields(tc, num, null);
    return {
      licenseNumber: num,
      licenseType: cred.licenseType,
      licenseTypeCode: tc,
      credentialSpecification: cred.credentialSpecification,
      credentialCategory: cred.credentialCategory,
      holderName: (row.name || '').trim(),
      zipCode: this._extractZipFromApiRow(row),
      status: this._mapStatus(row.primaryStatusCode),
      expirationDate: row.expirationDate || null,
      isArmed: this._isArmed(tcRaw) || this._isArmed(tc),
    };
  }

  _bestDetailed(data, requested) {
    const digits = requested.replace(/\D/g, '');
    for (const ld of data?.licenseDetails || []) {
      for (const block of ld?.getFullLicenseDetail || []) {
        for (const lic of block?.getLicenseDetails || []) {
          if (String(lic.licNumber || '').replace(/\D/g, '') === digits) return { block, lic };
        }
      }
    }
    const fb = data?.licenseDetails?.[0]?.getFullLicenseDetail?.[0];
    const fl = fb?.getLicenseDetails?.[0];
    return fb && fl ? { block: fb, lic: fl } : null;
  }

  _fromDetailed({ block, lic }, requested) {
    const num = String(lic.licNumber || requested).trim();
    const tcRaw = lic.licTypeCode || this._detectPrefix(num);
    const tc = this._normalizeLicTypeCode(tcRaw);
    const cred = this._credentialFields(tc, num, lic);
    let name = '';
    for (const nb of block?.getNameDetails || []) {
      for (const ind of nb?.individualNameDetails || []) {
        const parts = [ind.firstName, ind.middleName, ind.lastName].filter(Boolean);
        if (parts.length) { name = parts.join(' '); break; }
        if (ind.keyName) { name = ind.keyName; break; }
      }
      if (name) break;
    }
    return {
      licenseNumber: num,
      licenseType: cred.licenseType,
      licenseTypeCode: tc,
      credentialSpecification: cred.credentialSpecification,
      credentialCategory: cred.credentialCategory,
      holderName: name.trim() || null,
      zipCode: this._extractZipFromDetailed(block, lic),
      status: this._mapStatus(lic.primaryStatusCode),
      issueDate: lic.issueDate || null,
      expirationDate: lic.expDate || null,
      isArmed: this._isArmed(tcRaw) || this._isArmed(tc),
      companyName: lic.indivOrbusinessInd === 'B' ? (name || null) : null,
    };
  }
}

module.exports = CaliforniaAdapter;
