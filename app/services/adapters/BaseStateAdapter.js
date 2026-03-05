/**
 * GuardCardCheck — Base State Adapter
 * All per-state scrapers extend this class.
 * Provides standard interface: verify(), search(), normalize()
 */

const axios = require('axios');
const cheerio = require('cheerio');

class BaseStateAdapter {
  constructor(stateConfig) {
    this.state = stateConfig;
    this.code = stateConfig.code;
    this.name = stateConfig.name;
    
    // Shared axios instance with browser-like headers to avoid bot detection
    this.http = axios.create({
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
    });
  }

  /**
   * Verify a single license number.
   * @param {string} licenseNumber
   * @returns {Promise<VerificationResult>}
   */
  async verify(licenseNumber) {
    throw new Error(`verify() not implemented for ${this.code}`);
  }

  /**
   * Search by name (first + last).
   * @param {string} firstName
   * @param {string} lastName
   * @returns {Promise<VerificationResult[]>}
   */
  async search(firstName, lastName) {
    throw new Error(`search() not implemented for ${this.code}`);
  }

  /**
   * Normalize raw scraped data into standard GuardCardCheck result format.
   * All adapters must return objects matching this schema.
   */
  normalize(rawData) {
    return {
      stateCode: this.code,
      stateName: this.name,
      licenseNumber: rawData.licenseNumber || null,
      licenseType: rawData.licenseType || null,      // e.g. 'Guard Card', 'Class D', 'PERC'
      licenseTypeCode: rawData.licenseTypeCode || null, // e.g. 'G', 'D', 'PERC'
      holderName: rawData.holderName || null,
      status: this._normalizeStatus(rawData.status),  // ACTIVE | EXPIRED | REVOKED | SUSPENDED | NOT_FOUND
      issueDate: rawData.issueDate ? new Date(rawData.issueDate) : null,
      expirationDate: rawData.expirationDate ? new Date(rawData.expirationDate) : null,
      isArmed: rawData.isArmed || false,
      companyName: rawData.companyName || null,       // for PPO/agency lookups
      agencyName: this.state.agency.name,
      portalUrl: this.state.access.portalUrl,
      verifiedAt: new Date().toISOString(),
      rawData: process.env.NODE_ENV === 'development' ? rawData : undefined,
    };
  }

  /**
   * Normalize status strings to standard values
   */
  _normalizeStatus(raw) {
    if (!raw) return 'UNKNOWN';
    const s = raw.toString().toUpperCase().trim();
    if (['ACTIVE', 'VALID', 'CURRENT', 'ISSUED', 'CLEAR'].some(k => s.includes(k))) return 'ACTIVE';
    if (['EXPIRED', 'LAPSED'].some(k => s.includes(k))) return 'EXPIRED';
    if (['REVOKED', 'CANCELLED', 'CANCELED'].some(k => s.includes(k))) return 'REVOKED';
    if (['SUSPENDED', 'SUSPENSION'].some(k => s.includes(k))) return 'SUSPENDED';
    if (['PENDING', 'INCOMPLETE', 'PROCESSING'].some(k => s.includes(k))) return 'PENDING';
    if (['NOT FOUND', 'NO RECORD', 'NOTFOUND'].some(k => s.includes(k))) return 'NOT_FOUND';
    return 'UNKNOWN';
  }

  /**
   * Check if a license is expiring within N days
   */
  _isExpiringSoon(expirationDate, days = 60) {
    if (!expirationDate) return false;
    const expiry = new Date(expirationDate);
    const now = new Date();
    const diffMs = expiry - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= days;
  }

  /**
   * Parse common date formats found on state portals
   */
  _parseDate(str) {
    if (!str) return null;
    const cleaned = str.trim().replace(/\//g, '-');
    const d = new Date(cleaned);
    return isNaN(d) ? null : d.toISOString();
  }

  /**
   * Load a page and return a cheerio instance
   */
  async _getPage(url, options = {}) {
    const response = await this.http.get(url, options);
    return cheerio.load(response.data);
  }

  /**
   * Submit a form and return a cheerio instance of the response
   */
  async _postForm(url, formData, options = {}) {
    const response = await this.http.post(url, new URLSearchParams(formData).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      ...options,
    });
    return cheerio.load(response.data);
  }
}

module.exports = BaseStateAdapter;
