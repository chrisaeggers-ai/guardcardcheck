/**
 * California State Adapter — DCA iServices Search API
 * Docs: https://iservices.dca.ca.gov/docs/search
 * Auth: APP_ID + APP_KEY headers (3scale)
 */

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
};

const ARMED_CODES = ['FE', 'FQ', '1202', '1211'];

class CaliforniaAdapter extends BaseStateAdapter {
  constructor() {
    super(STATES.CA);
    this.apiBase = process.env.DCA_API_BASE || 'https://iservices.dca.ca.gov/api/search/v1';
    this.appId = process.env.DCA_APP_ID;
    this.appKey = process.env.DCA_APP_KEY || process.env.DCA_API_KEY;

    this.apiHttp = axios.create({
      baseURL: this.apiBase,
      timeout: 20000,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      validateStatus: (s) => s >= 200 && s < 300,
    });
  }

  _auth() { return { APP_ID: this.appId, APP_KEY: this.appKey }; }
  _ok() { return Boolean(this.appId && this.appKey); }

  _mapStatus(raw) { return DCA_STATUS[String(raw).trim()] || String(raw || ''); }
  _mapType(code) { return DCA_LIC_TYPES[code] || code; }
  _isArmed(code) { return ARMED_CODES.includes(String(code).trim()); }

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

  async verify(licenseNumber) {
    if (!this._ok()) {
      throw new Error('California verification requires DCA_APP_ID and DCA_APP_KEY.');
    }

    const clean = licenseNumber.trim().toUpperCase();
    const apiInt = this._toInt(clean);
    if (!apiInt) return this.normalize({ status: 'NOT_FOUND', licenseNumber: clean });

    let response;
    try {
      response = await this.apiHttp.post(
        '/licenseSearchService/getPublicAgileSearch',
        { searchMethod: 'LIC_NBR', licenseNumbers: [apiInt] },
        { headers: this._auth() },
      );
    } catch (err) {
      if (err.response?.status === 404) return this.normalize({ status: 'NOT_FOUND', licenseNumber: clean });
      throw err;
    }

    // Summary-style response (results array)
    if (Array.isArray(response.data?.results) && response.data.results.length > 0) {
      const row = this._bestSummary(response.data.results, clean);
      if (!row) return this.normalize({ status: 'NOT_FOUND', licenseNumber: clean });
      return this.normalize(this._fromSummary(row, clean));
    }

    // Detailed response (licenseDetails array)
    const pick = this._bestDetailed(response.data, clean);
    if (!pick) return this.normalize({ status: 'NOT_FOUND', licenseNumber: clean });
    return this.normalize(this._fromDetailed(pick, clean));
  }

  async search(firstName, lastName) {
    if (!this._ok()) throw new Error('California name search requires DCA_APP_ID and DCA_APP_KEY.');

    const last = lastName.trim();
    if (!last) return [];
    const first = firstName.trim().toUpperCase();

    const response = await this.apiHttp.post(
      '/licenseSearchService/getPublicLicenseSearch',
      { searchMethod: 'SNDX', name: last, clientCodeId: [2] },
      { headers: this._auth() },
    );

    const rows = (response.data?.results || []).filter((r) => {
      if (String(r.boardCode) !== '120') return false;
      if (!first) return true;
      return String(r.name || '').toUpperCase().includes(first);
    });

    return rows.map((r) => {
      const tc = r.licenseType || this._detectPrefix(String(r.licenseNumber || ''));
      return this.normalize({
        licenseNumber: String(r.licenseNumber || '').trim(),
        licenseType: this._mapType(tc),
        licenseTypeCode: tc,
        holderName: (r.name || '').trim(),
        status: this._mapStatus(r.primaryStatusCode),
        expirationDate: r.expirationDate || null,
        isArmed: this._isArmed(tc),
      });
    });
  }

  // ── helpers ──

  _bestSummary(rows, requested) {
    const digits = requested.replace(/\D/g, '');
    let best = null, bestScore = -1;
    for (const r of rows) {
      const n = String(r.licenseNumber || '').trim();
      let score = n === requested ? 100 : n.replace(/\D/g, '') === digits ? 80 : 0;
      if (String(r.boardCode) === '120') score += 10;
      if (score > bestScore) { best = r; bestScore = score; }
    }
    return best || rows[0];
  }

  _fromSummary(row, requested) {
    const num = String(row.licenseNumber || requested).trim();
    const tc = row.licenseType || this._detectPrefix(num);
    return {
      licenseNumber: num, licenseType: this._mapType(tc), licenseTypeCode: tc,
      holderName: (row.name || '').trim(), status: this._mapStatus(row.primaryStatusCode),
      expirationDate: row.expirationDate || null, isArmed: this._isArmed(tc),
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
    const tc = lic.licTypeCode || this._detectPrefix(num);
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
      licenseNumber: num, licenseType: this._mapType(tc), licenseTypeCode: tc,
      holderName: name.trim() || null, status: this._mapStatus(lic.primaryStatusCode),
      issueDate: lic.issueDate || null, expirationDate: lic.expDate || null,
      isArmed: this._isArmed(tc),
      companyName: lic.indivOrbusinessInd === 'B' ? (name || null) : null,
    };
  }
}

module.exports = CaliforniaAdapter;
