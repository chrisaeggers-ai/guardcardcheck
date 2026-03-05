/**
 * Florida State Adapter — FDACS Division of Licensing
 * Portal: https://licensing.fdacs.gov/access/individual.aspx
 * License types: Class D (unarmed), Class G (firearms), Manager-MB (company)
 * 
 * Data Access Strategy:
 *   1. Individual lookups: scrape licensing.fdacs.gov portal
 *   2. Bulk/nightly sync: FL Ch. 119 public records request → CSV feed
 *      (FDACS is legally required to provide this under FL public records law)
 */

const BaseStateAdapter = require('../adapters/BaseStateAdapter');
const { STATES } = require('../../config/states');

class FloridaAdapter extends BaseStateAdapter {
  constructor() {
    super(STATES.FL);
    this.portalBase = 'https://licensing.fdacs.gov';
    this.searchUrl = `${this.portalBase}/access/individual.aspx`;
  }

  async verify(licenseNumber) {
    try {
      const cleanLicense = licenseNumber.trim().toUpperCase();
      
      // Step 1: Load the search page to get ViewState and session cookies
      const session = await this._getPage(this.searchUrl);
      const viewState = session('#__VIEWSTATE').val();
      const viewStateGen = session('#__VIEWSTATEGENERATOR').val();
      const eventValidation = session('#__EVENTVALIDATION').val();

      if (!viewState) {
        throw new Error('Could not load FDACS search form — ViewState missing');
      }

      // Step 2: Submit form with license number search
      const formData = {
        '__VIEWSTATE': viewState,
        '__VIEWSTATEGENERATOR': viewStateGen,
        '__EVENTVALIDATION': eventValidation,
        'ctl00$MainContent$txtLicNum': cleanLicense,
        'ctl00$MainContent$btnSearch': 'Search',
        'ctl00$MainContent$ddlCategory': 'All Individuals',
      };

      const $ = await this._postForm(this.searchUrl, formData, {
        headers: {
          'Referer': this.searchUrl,
          'Origin': this.portalBase,
        },
      });

      return this._parseResult($, cleanLicense);
      
    } catch (error) {
      console.error(`[FL] verify error for ${licenseNumber}:`, error.message);
      throw error;
    }
  }

  async search(firstName, lastName) {
    try {
      const $ = await this._getPage(this.searchUrl);
      const viewState = $('#__VIEWSTATE').val();
      const viewStateGen = $('#__VIEWSTATEGENERATOR').val();
      const eventValidation = $('#__EVENTVALIDATION').val();

      const formData = {
        '__VIEWSTATE': viewState,
        '__VIEWSTATEGENERATOR': viewStateGen,
        '__EVENTVALIDATION': eventValidation,
        'ctl00$MainContent$txtFirstName': firstName.trim(),
        'ctl00$MainContent$txtLastName': lastName.trim(),
        'ctl00$MainContent$btnSearch': 'Search',
        'ctl00$MainContent$ddlCategory': 'All Individuals',
      };

      const result$ = await this._postForm(this.searchUrl, formData, {
        headers: { 'Referer': this.searchUrl },
      });

      return this._parseMultiResult(result$);
      
    } catch (error) {
      console.error(`[FL] search error:`, error.message);
      throw error;
    }
  }

  _parseResult($, queryLicense) {
    // Check for "no records found" message
    const noResults = $('span:contains("No records found"), .noResults').length > 0;
    if (noResults) {
      return this.normalize({ status: 'NOT_FOUND', licenseNumber: queryLicense });
    }

    // Parse the result table
    const rows = $('table.gridResults tr, #ctl00_MainContent_grdResults tr');
    if (rows.length <= 1) {
      return this.normalize({ status: 'NOT_FOUND', licenseNumber: queryLicense });
    }

    // Get first data row (skip header)
    const firstRow = $(rows[1]);
    const cells = firstRow.find('td');

    const licenseNumber = $(cells[0]).text().trim() || queryLicense;
    const licenseType = $(cells[1]).text().trim();
    const holderName = $(cells[2]).text().trim();
    const status = $(cells[3]).text().trim();
    const expirationDate = $(cells[4]).text().trim();
    const issueDate = $(cells[5])?.text()?.trim();

    const typeCode = this._detectLicenseType(licenseNumber, licenseType);

    return this.normalize({
      licenseNumber,
      licenseType: this._getLicenseTypeName(licenseType),
      licenseTypeCode: typeCode,
      holderName,
      status,
      issueDate: this._parseDate(issueDate),
      expirationDate: this._parseDate(expirationDate),
      isArmed: typeCode === 'G', // Class G = statewide firearms license
    });
  }

  _parseMultiResult($) {
    const results = [];
    const rows = $('table.gridResults tr, #ctl00_MainContent_grdResults tr');
    
    rows.each((i, row) => {
      if (i === 0) return; // skip header
      const cells = $(row).find('td');
      if (cells.length < 4) return;

      const licenseNumber = $(cells[0]).text().trim();
      const licenseType = $(cells[1]).text().trim();
      const holderName = $(cells[2]).text().trim();
      const status = $(cells[3]).text().trim();
      const expirationDate = $(cells[4])?.text()?.trim();
      const typeCode = this._detectLicenseType(licenseNumber, licenseType);

      results.push(this.normalize({
        licenseNumber,
        licenseType: this._getLicenseTypeName(licenseType),
        licenseTypeCode: typeCode,
        holderName,
        status,
        expirationDate: this._parseDate(expirationDate),
        isArmed: typeCode === 'G',
      }));
    });

    return results;
  }

  _detectLicenseType(licenseNumber, displayType = '') {
    const num = (licenseNumber || '').toUpperCase();
    const disp = (displayType || '').toUpperCase();
    if (num.startsWith('D') || disp.includes('SECURITY OFFICER') || disp === 'D') return 'D';
    if (num.startsWith('G') || disp.includes('FIREARMS') || disp === 'G') return 'G';
    if (num.startsWith('MB') || disp.includes('MANAGER SECURITY')) return 'MB';
    if (num.startsWith('MA') || disp.includes('MANAGER INVESTIGATIVE')) return 'MA';
    if (num.startsWith('C') || disp.includes('PRIVATE INVESTIGATOR') || disp === 'C' || disp === 'CC') return 'C';
    return 'D'; // default to Class D
  }

  _getLicenseTypeName(rawType) {
    const t = (rawType || '').toUpperCase();
    const names = {
      'D': 'Class D Security Officer License',
      'G': 'Class G Statewide Firearms License',
      'MB': 'Manager Security Agency (MB)',
      'MA': 'Manager Investigative Agency (MA)',
      'C': 'Private Investigator',
      'CC': 'Private Investigator Intern',
    };
    return names[t] || rawType || 'Security License';
  }

  /**
   * Bulk data sync method — called by nightly cron job
   * Requests CSV export of all active licenses from FDACS via public records
   * FL Chapter 119 requires a response within 5 business days
   */
  async getBulkDataRequest() {
    return {
      method: 'PUBLIC_RECORDS_REQUEST',
      agency: 'Florida Department of Agriculture and Consumer Services',
      email: 'DL-Licensing@fdacs.gov',
      subject: 'Public Records Request — Active Security License Dataset (Ch. 119, F.S.)',
      body: `
        Pursuant to Chapter 119, Florida Statutes, we hereby request a copy of the active
        security professional license database maintained by the Division of Licensing,
        including all records for license types: D (Security Officer), G (Statewide Firearms),
        MB (Manager Security Agency).
        
        Requested format: CSV or Excel spreadsheet.
        Requested fields: License Number, License Type, First Name, Last Name, Status, 
                         Issue Date, Expiration Date.
        
        This is a commercial public records request. We are willing to pay reasonable
        duplication costs.
      `.trim(),
      note: 'Florida has the strongest public records law in the US. Expect data within 5 business days.',
    };
  }
}

module.exports = FloridaAdapter;
