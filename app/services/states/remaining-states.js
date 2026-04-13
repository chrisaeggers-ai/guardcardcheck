/**
 * Illinois State Adapter — IDFPR License Lookup
 * Portal: https://online-dfpr.micropact.com/lookup/licenselookup.aspx
 * License types: PERC (all guards), FCC (armed), PSC Agency (company)
 */

const axios = require('axios');
const https = require('https');
const BaseStateAdapter = require('../adapters/BaseStateAdapter');
const { STATES } = require('../../config/states');

/** AZ DPS legacy host serves an incomplete chain; Node TLS fails unless we opt in (browser/curl are lenient). */
const AZ_DPS_HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });

class IllinoisAdapter extends BaseStateAdapter {
  constructor() {
    super(STATES.IL);
    this.searchUrl = 'https://online-dfpr.micropact.com/lookup/licenselookup.aspx';
  }

  async verify(licenseNumber) {
    try {
      const cleanLicense = licenseNumber.trim();
      const $ = await this._getPage(this.searchUrl);
      const viewState = $('#__VIEWSTATE').val();
      const viewStateGen = $('#__VIEWSTATEGENERATOR').val();

      const result$ = await this._postForm(this.searchUrl, {
        '__VIEWSTATE': viewState,
        '__VIEWSTATEGENERATOR': viewStateGen,
        'ctl00$MainContent$ddlLicType': '129', // 129 = PERC in IDFPR system
        'ctl00$MainContent$txtLicenseNumber': cleanLicense,
        'ctl00$MainContent$btnSearch': 'Search',
      });

      return this._parseResult(result$, cleanLicense);
    } catch (e) {
      console.error(`[IL] verify error:`, e.message);
      throw e;
    }
  }

  async search(firstName, lastName) {
    const $ = await this._getPage(this.searchUrl);
    const result$ = await this._postForm(this.searchUrl, {
      '__VIEWSTATE': $('#__VIEWSTATE').val(),
      '__VIEWSTATEGENERATOR': $('#__VIEWSTATEGENERATOR').val(),
      'ctl00$MainContent$txtFirstName': firstName.trim(),
      'ctl00$MainContent$txtLastName': lastName.trim(),
      'ctl00$MainContent$btnSearch': 'Search',
    });
    return this._parseMultiResult(result$);
  }

  _parseResult($, queryLicense) {
    if ($('.noResults, span:contains("No licenses found")').length > 0) {
      return this.normalize({ status: 'NOT_FOUND', licenseNumber: queryLicense });
    }
    const cells = $('table.results tr').eq(1).find('td');
    if (!cells.length) return this.normalize({ status: 'NOT_FOUND', licenseNumber: queryLicense });

    const licenseType = $(cells[0]).text().trim();
    const holderName = $(cells[1]).text().trim();
    const licenseNumber = $(cells[2]).text().trim() || queryLicense;
    const status = $(cells[3]).text().trim();
    const expirationDate = $(cells[4]).text().trim();
    const typeCode = licenseType.includes('Firearm') || licenseType.includes('FCC') ? 'FCC' : 'PERC';

    return this.normalize({
      licenseNumber, licenseType, licenseTypeCode: typeCode, holderName, status,
      expirationDate: this._parseDate(expirationDate),
      isArmed: typeCode === 'FCC',
    });
  }

  _parseMultiResult($) {
    const results = [];
    $('table.results tr').each((i, row) => {
      if (i === 0) return;
      const cells = $(row).find('td');
      if (cells.length < 4) return;
      const licenseType = $(cells[0]).text().trim();
      const typeCode = licenseType.toUpperCase().includes('FIREARM') ? 'FCC' : 'PERC';
      results.push(this.normalize({
        licenseType, licenseTypeCode: typeCode,
        holderName: $(cells[1]).text().trim(),
        licenseNumber: $(cells[2]).text().trim(),
        status: $(cells[3]).text().trim(),
        expirationDate: this._parseDate($(cells[4]).text().trim()),
        isArmed: typeCode === 'FCC',
      }));
    });
    return results;
  }
}

/**
 * Virginia State Adapter — DCJS Individual Verification
 * Portal: https://www.cms.dcjs.virginia.gov/GLSuiteWeb/Clients/VADCJS/Public/IndividualVerification/Search.aspx
 * License types: Unarmed Registration, Armed Registration w/ Firearms Certification
 */
class VirginiaAdapter extends BaseStateAdapter {
  constructor() {
    super(STATES.VA);
    this.searchUrl = 'https://www.cms.dcjs.virginia.gov/GLSuiteWeb/Clients/VADCJS/Public/IndividualVerification/Search.aspx';
  }

  async verify(licenseNumber) {
    try {
      const cleanLicense = licenseNumber.trim();
      const $ = await this._getPage(this.searchUrl);
      const result$ = await this._postForm(this.searchUrl, {
        '__VIEWSTATE': $('#__VIEWSTATE').val(),
        '__VIEWSTATEGENERATOR': $('#__VIEWSTATEGENERATOR').val(),
        '__EVENTVALIDATION': $('#__EVENTVALIDATION').val(),
        'ctl00$Content$txtLicenseNumber': cleanLicense,
        'ctl00$Content$btnSearch': 'Search',
      }, { headers: { 'Referer': this.searchUrl } });

      return this._parseResult(result$, cleanLicense);
    } catch (e) {
      console.error('[VA] verify error:', e.message);
      throw e;
    }
  }

  async search(firstName, lastName) {
    const $ = await this._getPage(this.searchUrl);
    const result$ = await this._postForm(this.searchUrl, {
      '__VIEWSTATE': $('#__VIEWSTATE').val(),
      '__VIEWSTATEGENERATOR': $('#__VIEWSTATEGENERATOR').val(),
      '__EVENTVALIDATION': $('#__EVENTVALIDATION').val(),
      'ctl00$Content$txtFirstName': firstName.trim(),
      'ctl00$Content$txtLastName': lastName.trim(),
      'ctl00$Content$btnSearch': 'Search',
    }, { headers: { 'Referer': this.searchUrl } });
    return this._parseMultiResult(result$);
  }

  _parseResult($, queryLicense) {
    if ($('.noResults, td:contains("No records found")').length > 0) {
      return this.normalize({ status: 'NOT_FOUND', licenseNumber: queryLicense });
    }
    const row = $('table.SearchResultsTable tr, .GridView tr').eq(1);
    const cells = row.find('td');
    if (!cells.length) return this.normalize({ status: 'NOT_FOUND', licenseNumber: queryLicense });

    const holderName = $(cells[0]).text().trim();
    const licenseNumber = $(cells[1]).text().trim() || queryLicense;
    const licenseType = $(cells[2]).text().trim();
    const status = $(cells[3]).text().trim();
    const expirationDate = $(cells[4]).text().trim();
    const isArmed = licenseType.toUpperCase().includes('ARMED') || licenseType.toUpperCase().includes('FIREARM');

    return this.normalize({
      licenseNumber, licenseType, holderName, status,
      licenseTypeCode: isArmed ? 'ARMED' : 'UNARMED',
      expirationDate: this._parseDate(expirationDate),
      isArmed,
    });
  }

  _parseMultiResult($) {
    const results = [];
    $('table.SearchResultsTable tr, .GridView tr').each((i, row) => {
      if (i === 0) return;
      const cells = $(row).find('td');
      if (cells.length < 4) return;
      const licenseType = $(cells[2]).text().trim();
      const isArmed = licenseType.toUpperCase().includes('ARMED');
      results.push(this.normalize({
        holderName: $(cells[0]).text().trim(),
        licenseNumber: $(cells[1]).text().trim(),
        licenseType, licenseTypeCode: isArmed ? 'ARMED' : 'UNARMED',
        status: $(cells[3]).text().trim(),
        expirationDate: this._parseDate($(cells[4]).text().trim()),
        isArmed,
      }));
    });
    return results;
  }
}

/**
 * Nevada State Adapter — PILB Work Card Search
 * Portal: https://pilb.nv.gov/Work_Cards/Search/
 * License types: Work Card (unarmed), Firearms Cert Card (armed)
 */
class NevadaAdapter extends BaseStateAdapter {
  constructor() {
    super(STATES.NV);
    this.searchUrl = 'https://pilb.nv.gov/Work_Cards/Search/';
  }

  async verify(licenseNumber) {
    const cleanLicense = licenseNumber.trim();
    const $ = await this._getPage(this.searchUrl);
    const result$ = await this._postForm(this.searchUrl, {
      '__VIEWSTATE': $('#__VIEWSTATE').val() || '',
      'CardNumber': cleanLicense,
      'btnSearch': 'Search',
    }, { headers: { 'Referer': this.searchUrl } });

    return this._parseResult(result$, cleanLicense);
  }

  async search(firstName, lastName) {
    const $ = await this._getPage(this.searchUrl);
    const result$ = await this._postForm(this.searchUrl, {
      '__VIEWSTATE': $('#__VIEWSTATE').val() || '',
      'FirstName': firstName.trim(),
      'LastName': lastName.trim(),
      'btnSearch': 'Search',
    }, { headers: { 'Referer': this.searchUrl } });
    return this._parseMultiResult(result$);
  }

  _parseResult($, queryLicense) {
    if ($('td:contains("No records"), .noResults').length > 0 || !$('table.results tr').eq(1).find('td').length) {
      return this.normalize({ status: 'NOT_FOUND', licenseNumber: queryLicense });
    }
    const cells = $('table.results tr').eq(1).find('td');
    const holderName = $(cells[0]).text().trim();
    const licenseNumber = $(cells[1]).text().trim() || queryLicense;
    const status = $(cells[2]).text().trim();
    const expirationDate = $(cells[3]).text().trim();
    const isFirearms = $(cells[4])?.text()?.toLowerCase().includes('firearm');

    return this.normalize({
      licenseNumber, holderName, status,
      licenseType: isFirearms ? 'Firearms Certification Card' : 'Security Guard Work Card',
      licenseTypeCode: isFirearms ? 'FC' : 'WC',
      expirationDate: this._parseDate(expirationDate),
      isArmed: isFirearms,
    });
  }

  _parseMultiResult($) {
    const results = [];
    $('table.results tr').each((i, row) => {
      if (i === 0) return;
      const cells = $(row).find('td');
      if (cells.length < 3) return;
      results.push(this.normalize({
        holderName: $(cells[0]).text().trim(),
        licenseNumber: $(cells[1]).text().trim(),
        status: $(cells[2]).text().trim(),
        expirationDate: this._parseDate($(cells[3]).text().trim()),
        licenseType: 'Security Guard Work Card',
        licenseTypeCode: 'WC',
        isArmed: false,
      }));
    });
    return results;
  }
}

/**
 * Oregon State Adapter — DPSST PS IRIS (Blue Peak snapshot)
 * Employee search: https://www.bpl-orsnapshot.net/IRIS_PublicInquiry/PrivateSecurity/EmployeeSearch.aspx
 *
 * Name search expects "Last, First" in the single text field (site radio: Employee Name).
 * PS Identification uses the same field with radio DPSST PS Identification Number.
 */
class OregonAdapter extends BaseStateAdapter {
  constructor() {
    super(STATES.OR);
    this.searchUrl =
      'https://www.bpl-orsnapshot.net/IRIS_PublicInquiry/PrivateSecurity/EmployeeSearch.aspx';
  }

  /** @param {0|1} rdoSearchOption 0 = Last, First name  1 = PS ID */
  async _postEmployeeSearch(rdoSearchOption, txtNameSearch) {
    const cheerio = require('cheerio');
    const get$ = await this.http.get(this.searchUrl, {
      headers: { Referer: this.searchUrl },
    });
    const $page = cheerio.load(get$.data);
    const body = new URLSearchParams({
      __VIEWSTATE: $page('#__VIEWSTATE').val() || '',
      __VIEWSTATEGENERATOR: $page('#__VIEWSTATEGENERATOR').val() || '',
      __EVENTVALIDATION: $page('#__EVENTVALIDATION').val() || '',
      rdoSearchOption: String(rdoSearchOption),
      txtNameSearch: txtNameSearch,
      cmdSearch: 'Find',
    });
    const post = await this.http.post(this.searchUrl, body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: this.searchUrl,
      },
    });
    return cheerio.load(post.data);
  }

  _parseEmployeeGrid($) {
    const results = [];
    $('tr.row, tr.rowAlt').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length < 5) return;
      const holderName = $(cells[0]).find('a').first().text().trim() || $(cells[0]).text().trim();
      const psId = $(cells[1])
        .text()
        .trim()
        .replace(/\s/g, '');
      const agency =
        $(cells[2]).find('a').first().text().trim() || $(cells[2]).text().trim();
      const rank = $(cells[3]).text().trim();
      const statusText = $(cells[4]).text().trim().toUpperCase();
      let status = 'UNKNOWN';
      if (statusText.includes('ACTIVE')) status = 'ACTIVE';
      else if (statusText.includes('INACTIVE')) status = 'EXPIRED';
      const rankUp = rank.toUpperCase();
      const isArmed =
        rankUp.includes('ARMED') || (rankUp.includes('ARM') && !rankUp.includes('UNARM'));
      results.push(
        this.normalize({
          licenseNumber: psId,
          holderName,
          licenseType: rank ? `Private Security — ${rank}` : 'Private Security Professional',
          licenseTypeCode: isArmed ? 'ASEC' : 'SEC',
          companyName: agency || null,
          status,
          isArmed,
          credentialSpecification: agency ? `${holderName} (${agency})` : holderName,
        })
      );
    });
    return results;
  }

  async verify(licenseNumber) {
    const digits = String(licenseNumber || '')
      .replace(/\D/g, '');
    if (!digits || digits.length < 4) {
      return this.normalize({ status: 'NOT_FOUND', licenseNumber: licenseNumber?.trim() || null });
    }
    const padded = digits.length <= 6 ? digits.padStart(6, '0') : digits;
    try {
      const $ = await this._postEmployeeSearch(1, padded);
      const rows = this._parseEmployeeGrid($);
      if (!rows.length) {
        return this.normalize({ status: 'NOT_FOUND', licenseNumber: padded });
      }
      const active = rows.find((r) => r.status === 'ACTIVE');
      return active || rows[0];
    } catch (e) {
      console.error('[OR] verify error:', e.message);
      throw e;
    }
  }

  async search(firstName, lastName) {
    const lastFirst = `${lastName.trim()}, ${firstName.trim()}`;
    try {
      const $ = await this._postEmployeeSearch(0, lastFirst);
      return this._parseEmployeeGrid($);
    } catch (e) {
      console.error('[OR] search error:', e.message);
      throw e;
    }
  }
}

/**
 * Washington State Adapter — DOL License Portal
 * Portal: https://fortress.wa.gov/dol/dolprod/bpdLicenseQuery/
 */
class WashingtonAdapter extends BaseStateAdapter {
  constructor() {
    super(STATES.WA);
    this.searchUrl = 'https://fortress.wa.gov/dol/dolprod/bpdLicenseQuery/';
  }

  async verify(licenseNumber) {
    const cleanLicense = licenseNumber.trim();
    const $ = await this._getPage(this.searchUrl);
    const result$ = await this._postForm(this.searchUrl, {
      '__VIEWSTATE': $('#__VIEWSTATE').val() || '',
      'LicNum': cleanLicense,
      'ProfCode': 'SG', // Security Guard profession code
      'Submit': 'Search',
    }, { headers: { 'Referer': this.searchUrl } });
    return this._parseResult(result$, cleanLicense);
  }

  async search(firstName, lastName) {
    const $ = await this._getPage(this.searchUrl);
    const result$ = await this._postForm(this.searchUrl, {
      '__VIEWSTATE': $('#__VIEWSTATE').val() || '',
      'FName': firstName.trim(),
      'LName': lastName.trim(),
      'ProfCode': 'SG',
      'Submit': 'Search',
    }, { headers: { 'Referer': this.searchUrl } });
    return this._parseMultiResult(result$);
  }

  _parseResult($, queryLicense) {
    const cells = $('table#searchResults tr, .resultsTable tr').eq(1).find('td');
    if (!cells.length) return this.normalize({ status: 'NOT_FOUND', licenseNumber: queryLicense });
    const isArmed = $(cells[2]).text().toUpperCase().includes('ARMED');
    return this.normalize({
      holderName: $(cells[0]).text().trim(),
      licenseNumber: $(cells[1]).text().trim() || queryLicense,
      licenseType: $(cells[2]).text().trim(),
      licenseTypeCode: isArmed ? 'ASG' : 'SG',
      status: $(cells[3]).text().trim(),
      expirationDate: this._parseDate($(cells[4]).text().trim()),
      isArmed,
    });
  }

  _parseMultiResult($) {
    const results = [];
    $('table#searchResults tr, .resultsTable tr').each((i, row) => {
      if (i === 0) return;
      const cells = $(row).find('td');
      if (cells.length < 4) return;
      const isArmed = $(cells[2]).text().toUpperCase().includes('ARMED');
      results.push(this.normalize({
        holderName: $(cells[0]).text().trim(),
        licenseNumber: $(cells[1]).text().trim(),
        licenseType: $(cells[2]).text().trim(),
        licenseTypeCode: isArmed ? 'ASG' : 'SG',
        status: $(cells[3]).text().trim(),
        expirationDate: this._parseDate($(cells[4]).text().trim()),
        isArmed,
      }));
    });
    return results;
  }
}

/**
 * Arizona State Adapter — AZ DPS Public Inquiry
 * Portal: https://webapps.azdps.gov/public_inq/sgrd/ShowLicenseStatus.action
 * AJAX endpoint: LicenseStatusAJAX.action
 * License types: Unarmed Guard, Armed Guard, Security Guard Agency License
 *
 * HTML table columns: License Number | Employee Type | Status | Name | Expire Date
 */
class ArizonaAdapter extends BaseStateAdapter {
  constructor() {
    super(STATES.AZ);
    this.searchUrl = 'https://webapps.azdps.gov/public_inq/sgrd/LicenseStatusAJAX.action';
    this.http = axios.create({
      timeout: 20000,
      httpsAgent: AZ_DPS_HTTPS_AGENT,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
      },
    });
  }

  async verify(licenseNumber) {
    const cleanLicense = licenseNumber.trim();
    try {
      const response = await this.http.post(this.searchUrl, new URLSearchParams({
        licenseNum: cleanLicense,
        firstName: '',
        lastName: '',
        agency: '',
      }).toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: 'https://webapps.azdps.gov/public_inq/sgrd/ShowLicenseStatus.action',
        },
      });
      const $ = require('cheerio').load(response.data);
      const rows = this._parseTableRows($);
      if (rows.length === 0) {
        return this.normalize({ status: 'NOT_FOUND', licenseNumber: cleanLicense });
      }
      const match = rows.find(
        (r) => String(r.licenseNumber || '').replace(/\D/g, '') === cleanLicense.replace(/\D/g, '')
      );
      return match || rows[0];
    } catch (e) {
      console.error('[AZ] verify error:', e.message);
      throw e;
    }
  }

  async search(firstName, lastName) {
    const response = await this.http.post(this.searchUrl, new URLSearchParams({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      licenseNum: '',
      agency: '',
    }).toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: 'https://webapps.azdps.gov/public_inq/sgrd/ShowLicenseStatus.action',
      },
    });
    const $ = require('cheerio').load(response.data);
    return this._parseTableRows($);
  }

  _parseTableRows($) {
    const results = [];
    $('table tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length < 5) return;
      const licenseNumber = $(cells[0]).text().trim();
      const employeeType = $(cells[1]).text().trim();
      const statusText = $(cells[2]).text().trim();
      const holderName = $(cells[3]).text().trim();
      const expDate = $(cells[4]).text().trim();
      const etUp = employeeType.toUpperCase();
      const isArmed = etUp.includes('ARMED') && !etUp.includes('UNARMED');

      let normalizedStatus = statusText.toUpperCase();
      if (normalizedStatus === 'ISSUED') normalizedStatus = 'ACTIVE';

      results.push(this.normalize({
        licenseNumber,
        holderName,
        licenseType: employeeType || (isArmed ? 'Armed Security Guard' : 'Unarmed Security Guard'),
        licenseTypeCode: isArmed ? 'AG' : 'UAG',
        status: normalizedStatus,
        expirationDate: this._parseDate(expDate),
        isArmed,
      }));
    });
    return results;
  }
}

/**
 * North Carolina State Adapter — NC PPSB via Permitium
 * Portal: https://ppsapplication.permitium.com/publicapp/actives/licensee/list
 * License types: Unarmed Guard Registration, Firearm Registration Permit, Guard/Patrol License
 * 
 * UNIQUE NOTE: NC Firearm Registration Permit belongs to the STATE — expires on job termination.
 * This means armed guard rosters must be re-verified any time a guard changes employer.
 */
class NorthCarolinaAdapter extends BaseStateAdapter {
  constructor() {
    super(STATES.NC);
    this.listUrl = 'https://ppsapplication.permitium.com/publicapp/actives/licensee/list';
    this.searchUrl = 'https://ppsapplication.permitium.com/publicapp/actives/licensee/search';
  }

  async verify(licenseNumber) {
    try {
      const cleanLicense = licenseNumber.trim();
      const response = await this.http.get(this.searchUrl, {
        params: { query: cleanLicense, type: 'license_number' },
        headers: { 'Accept': 'application/json, text/html' },
      });

      // Permitium may return JSON or HTML depending on request
      if (response.headers['content-type']?.includes('json')) {
        return this._parseJsonResult(response.data, cleanLicense);
      }

      const $ = require('cheerio').load(response.data);
      return this._parseResult($, cleanLicense);
    } catch (e) {
      console.error('[NC] verify error:', e.message);
      throw e;
    }
  }

  async search(firstName, lastName) {
    const response = await this.http.get(this.searchUrl, {
      params: { firstName: firstName.trim(), lastName: lastName.trim() },
    });
    if (response.headers['content-type']?.includes('json')) {
      const data = Array.isArray(response.data) ? response.data : [response.data];
      return data.map(r => this._parseJsonResult(r, r.licenseNumber));
    }
    const $ = require('cheerio').load(response.data);
    return this._parseMultiResult($);
  }

  _parseJsonResult(data, queryLicense) {
    if (!data || !data.licenseNumber) {
      return this.normalize({ status: 'NOT_FOUND', licenseNumber: queryLicense });
    }
    const isArmed = (data.licenseType || '').toUpperCase().includes('FIREARM') ||
                    (data.licenseType || '').toUpperCase().includes('ARMED');
    return this.normalize({
      licenseNumber: data.licenseNumber || queryLicense,
      licenseType: data.licenseTypeName || data.licenseType,
      licenseTypeCode: isArmed ? 'FRP' : 'UNARMED',
      holderName: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
      status: data.status || data.licenseStatus,
      issueDate: this._parseDate(data.issueDate || data.originalDate),
      expirationDate: this._parseDate(data.expirationDate),
      companyName: data.businessName || data.employerName,
      isArmed,
    });
  }

  _parseResult($, queryLicense) {
    const row = $('table tr, .licenseeRow').eq(1);
    const cells = row.find('td');
    if (!cells.length) return this.normalize({ status: 'NOT_FOUND', licenseNumber: queryLicense });

    const licenseType = $(cells[2]).text().trim();
    const isArmed = licenseType.toUpperCase().includes('FIREARM');
    return this.normalize({
      holderName: $(cells[0]).text().trim(),
      licenseNumber: $(cells[1]).text().trim() || queryLicense,
      licenseType, licenseTypeCode: isArmed ? 'FRP' : 'UNARMED',
      status: $(cells[3]).text().trim(),
      expirationDate: this._parseDate($(cells[4]).text().trim()),
      companyName: $(cells[5])?.text()?.trim(),
      isArmed,
    });
  }

  _parseMultiResult($) {
    const results = [];
    $('table tr, .licenseeRow').each((i, row) => {
      if (i === 0) return;
      const cells = $(row).find('td');
      if (cells.length < 4) return;
      const licenseType = $(cells[2]).text().trim();
      const isArmed = licenseType.toUpperCase().includes('FIREARM');
      results.push(this.normalize({
        holderName: $(cells[0]).text().trim(),
        licenseNumber: $(cells[1]).text().trim(),
        licenseType, licenseTypeCode: isArmed ? 'FRP' : 'UNARMED',
        status: $(cells[3]).text().trim(),
        expirationDate: this._parseDate($(cells[4]).text().trim()),
        companyName: $(cells[5])?.text()?.trim(),
        isArmed,
      }));
    });
    return results;
  }
}

module.exports = {
  IllinoisAdapter,
  VirginiaAdapter,
  NevadaAdapter,
  OregonAdapter,
  WashingtonAdapter,
  ArizonaAdapter,
  NorthCarolinaAdapter,
};
