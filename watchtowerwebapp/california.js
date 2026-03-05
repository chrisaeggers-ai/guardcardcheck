/**
 * California State Adapter — BSIS / DCA Official API
 * Uses the Department of Consumer Affairs official API
 * License types: Guard Card (G), Exposed Firearm Permit (FE/FQ), PPO
 */

const BaseStateAdapter = require('../adapters/BaseStateAdapter');
const { STATES } = require('../../config/states');

class CaliforniaAdapter extends BaseStateAdapter {
  constructor() {
    super(STATES.CA);
    this.apiBase = process.env.DCA_API_BASE || 'https://www.dca.ca.gov/webapps/bsis';
    this.apiKey = process.env.DCA_API_KEY;
  }

  async verify(licenseNumber) {
    try {
      const cleanLicense = licenseNumber.trim().toUpperCase();
      
      // Determine license type from prefix
      const type = this._detectLicenseType(cleanLicense);
      
      const response = await this.http.get(`${this.apiBase}/license`, {
        params: {
          licenseNum: cleanLicense,
          licenseType: type,
          apikey: this.apiKey,
        },
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.data || response.data.totalFound === 0) {
        return this.normalize({ status: 'NOT_FOUND', licenseNumber: cleanLicense });
      }

      const record = response.data.results[0];
      
      return this.normalize({
        licenseNumber: record.licenseNumber || cleanLicense,
        licenseType: this._getLicenseTypeName(type),
        licenseTypeCode: type,
        holderName: `${record.firstName || ''} ${record.lastName || ''}`.trim(),
        status: record.licenseStatus,
        issueDate: record.originalIssueDate,
        expirationDate: record.expirationDate,
        isArmed: ['FE', 'FQ'].includes(type),
        companyName: record.businessName || null,
      });
      
    } catch (error) {
      if (error.response?.status === 404) {
        return this.normalize({ status: 'NOT_FOUND', licenseNumber });
      }
      throw error;
    }
  }

  async search(firstName, lastName) {
    const response = await this.http.get(`${this.apiBase}/license/search`, {
      params: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        apikey: this.apiKey,
      },
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.data?.results?.length) return [];
    
    return response.data.results.map(record => this.normalize({
      licenseNumber: record.licenseNumber,
      licenseType: this._getLicenseTypeName(this._detectLicenseType(record.licenseNumber)),
      licenseTypeCode: this._detectLicenseType(record.licenseNumber),
      holderName: `${record.firstName || ''} ${record.lastName || ''}`.trim(),
      status: record.licenseStatus,
      issueDate: record.originalIssueDate,
      expirationDate: record.expirationDate,
      isArmed: record.licenseNumber?.startsWith('FE') || record.licenseNumber?.startsWith('FQ'),
    }));
  }

  _detectLicenseType(licenseNumber) {
    const upper = licenseNumber.toUpperCase();
    if (upper.startsWith('PPO')) return 'PPO';
    if (upper.startsWith('FQ')) return 'FQ';
    if (upper.startsWith('FE')) return 'FE';
    if (upper.startsWith('G')) return 'G';
    return 'G'; // default
  }

  _getLicenseTypeName(typeCode) {
    const names = {
      'G': 'Guard Card',
      'FE': 'Exposed Firearm Permit',
      'FQ': 'Firearm Qualification Card',
      'PPO': 'Private Patrol Operator',
    };
    return names[typeCode] || typeCode;
  }
}

module.exports = CaliforniaAdapter;
