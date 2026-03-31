/**
 * Texas State Adapter — DPS Private Security Bureau
 * Portal: https://tops.dps.texas.gov (TOPS — Texas Online Private Security)
 * License types: Level II (unarmed), Level III (armed), Level IV (PPO), Class B (company)
 */

const BaseStateAdapter = require('../adapters/BaseStateAdapter');
const { STATES } = require('../../config/states');

class TexasAdapter extends BaseStateAdapter {
  constructor() {
    super(STATES.TX);
    this.verifyUrl = 'https://tops.dps.texas.gov/PSBPortalPRD/PSB_VerifyLicense.aspx';
  }

  async verify(licenseNumber) {
    try {
      const cleanLicense = licenseNumber.trim();
      
      // Load the verification page
      const $ = await this._getPage(this.verifyUrl);
      const viewState = $('#__VIEWSTATE').val();
      const viewStateGen = $('#__VIEWSTATEGENERATOR').val();

      if (!viewState) throw new Error('TX TOPS portal did not load correctly');

      // Submit license number
      const result$ = await this._postForm(this.verifyUrl, {
        '__VIEWSTATE': viewState,
        '__VIEWSTATEGENERATOR': viewStateGen,
        'LicNumber': cleanLicense,
        'SearchButton': 'Search',
      }, {
        headers: { 'Referer': this.verifyUrl },
      });

      return this._parseResult(result$, cleanLicense);
      
    } catch (error) {
      console.error(`[TX] verify error for ${licenseNumber}:`, error.message);
      throw error;
    }
  }

  async search(firstName, lastName) {
    try {
      const $ = await this._getPage(this.verifyUrl);
      const viewState = $('#__VIEWSTATE').val();
      const viewStateGen = $('#__VIEWSTATEGENERATOR').val();

      const result$ = await this._postForm(this.verifyUrl, {
        '__VIEWSTATE': viewState,
        '__VIEWSTATEGENERATOR': viewStateGen,
        'FirstName': firstName.trim(),
        'LastName': lastName.trim(),
        'SearchButton': 'Search',
      }, {
        headers: { 'Referer': this.verifyUrl },
      });

      return this._parseMultiResult(result$);
    } catch (error) {
      console.error('[TX] search error:', error.message);
      throw error;
    }
  }

  _parseResult($, queryLicense) {
    // Check no results
    if ($('span:contains("No records found"), .noData').length > 0) {
      return this.normalize({ status: 'NOT_FOUND', licenseNumber: queryLicense });
    }

    const resultTable = $('table.searchResults, #ResultsPanel table').first();
    if (!resultTable.length) {
      return this.normalize({ status: 'NOT_FOUND', licenseNumber: queryLicense });
    }

    const rows = resultTable.find('tr');
    const firstDataRow = $(rows[1]);
    const cells = firstDataRow.find('td');
    
    if (!cells.length) {
      return this.normalize({ status: 'NOT_FOUND', licenseNumber: queryLicense });
    }

    const licenseNumber = $(cells[0]).text().trim() || queryLicense;
    const holderName = $(cells[1]).text().trim();
    const licenseType = $(cells[2]).text().trim();
    const status = $(cells[3]).text().trim();
    const expirationDate = $(cells[4]).text().trim();
    const issueDate = $(cells[5])?.text()?.trim();

    const typeCode = this._detectLicenseLevel(licenseType);

    return this.normalize({
      licenseNumber,
      licenseType: licenseType || this._getLevelName(typeCode),
      licenseTypeCode: typeCode,
      holderName,
      status,
      issueDate: this._parseDate(issueDate),
      expirationDate: this._parseDate(expirationDate),
      isArmed: ['L3', 'L4'].includes(typeCode),
    });
  }

  _parseMultiResult($) {
    const results = [];
    $('table.searchResults tr, #ResultsPanel table tr').each((i, row) => {
      if (i === 0) return;
      const cells = $(row).find('td');
      if (cells.length < 4) return;

      const licenseNumber = $(cells[0]).text().trim();
      const holderName = $(cells[1]).text().trim();
      const licenseType = $(cells[2]).text().trim();
      const status = $(cells[3]).text().trim();
      const expirationDate = $(cells[4])?.text()?.trim();
      const typeCode = this._detectLicenseLevel(licenseType);

      results.push(this.normalize({
        licenseNumber, licenseType, licenseTypeCode: typeCode,
        holderName, status,
        expirationDate: this._parseDate(expirationDate),
        isArmed: ['L3', 'L4'].includes(typeCode),
      }));
    });
    return results;
  }

  _detectLicenseLevel(typeString = '') {
    const t = typeString.toUpperCase();
    if (t.includes('LEVEL IV') || t.includes('PERSONAL PROTECTION')) return 'L4';
    if (t.includes('LEVEL III') || t.includes('COMMISSION') || t.includes('ARMED')) return 'L3';
    if (t.includes('LEVEL II') || t.includes('UNARMED')) return 'L2';
    if (t.includes('CLASS B') || t.includes('COMPANY') || t.includes('CONTRACTOR')) return 'B';
    return 'L2';
  }

  _getLevelName(code) {
    return {
      'L2': 'Level II Security Officer (Unarmed)',
      'L3': 'Level III Security Officer Commission (Armed)',
      'L4': 'Level IV Personal Protection Officer',
      'B': 'Class B Security Company License',
    }[code] || 'Security License';
  }
}

module.exports = TexasAdapter;
