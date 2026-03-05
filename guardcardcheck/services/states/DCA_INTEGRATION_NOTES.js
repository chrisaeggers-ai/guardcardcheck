/**
 * GuardCardCheck — California DCA API Integration Notes
 * =====================================================
 *
 * STATUS: Wired and ready. One calibration step required after your
 *         DCA API key is approved.
 *
 * HOW TO GET APPROVED:
 *   Apply at: https://data.ca.gov/developer
 *   Mention: "License verification for Private Patrol Operators under BSIS"
 *   Timeline: Typically 2-4 weeks. Follow up if no response after 3 weeks.
 *
 * WHAT THE CODE DOES NOW:
 *   - Calls the DCA API with your key (Bearer token + query param)
 *   - Detects license type from prefix: G=Guard Card, FE/FQ=Firearm, PPO=company
 *   - Normalizes the response into the standard GuardCardCheck result format
 *   - Falls back gracefully if the key isn't set (returns VERIFICATION_ERROR)
 *
 * WHAT NEEDS TO BE CONFIRMED AFTER YOU GET YOUR KEY:
 *   Three things are educated guesses until you can see the real API responses.
 *   Use the "First call diagnostic" script below to reveal the actual values.
 *
 * ─────────────────────────────────────────────────────────────
 * STEP 1 — Run the diagnostic (one-time, after approval)
 * ─────────────────────────────────────────────────────────────
 *
 * Create a temp file `dca-test.js` and run: node dca-test.js
 */

// ── dca-test.js ──────────────────────────────────────────────
// Paste this into a file, fill in your key, and run it.
// It will print the exact endpoint paths and response shape.

/*
require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.DCA_API_KEY; // must be in .env
const BASE    = process.env.DCA_API_BASE || 'https://www.dca.ca.gov/webapps/bsis';

// Try a known BSIS guard card number (use a real active one for best test)
const TEST_LICENSE = 'G123456'; // replace with a real guard card number

async function probe() {
  // Try each candidate endpoint until one returns data
  const endpoints = [
    '/license',
    '/api/license',
    '/v1/license',
    '/license/search',
    '/api/v1/license',
    '/bsis/license',
  ];

  for (const ep of endpoints) {
    try {
      const res = await axios.get(BASE + ep, {
        params: { licenseNum: TEST_LICENSE, apikey: API_KEY },
        headers: { Authorization: 'Bearer ' + API_KEY },
        timeout: 8000,
      });
      console.log('\n✅ HIT:', ep);
      console.log('Status:', res.status);
      console.log('Response shape:', JSON.stringify(res.data, null, 2));
      return; // stop on first hit
    } catch (err) {
      const code = err.response?.status || 'NETWORK';
      console.log(`  ✗ ${ep} → ${code}`);
    }
  }
  console.log('\n❌ None matched. Check DCA_API_BASE in .env');
}

probe();
*/

// ─────────────────────────────────────────────────────────────
// STEP 2 — Update california.js based on diagnostic output
// ─────────────────────────────────────────────────────────────
//
// After running the diagnostic, you'll know the real values.
// Update these 3 things in services/states/california.js:

/**
 * THING 1 — Endpoint paths
 *
 * Current (guesses):
 *   GET ${apiBase}/license          ← for verify by number
 *   GET ${apiBase}/license/search   ← for search by name
 *
 * What to change: Find these lines in california.js and update to the
 * real paths the diagnostic found.
 */

/**
 * THING 2 — Response field names
 *
 * Current code maps these field names from the API response:
 *   record.licenseNumber     ← the license number
 *   record.firstName         ← holder first name
 *   record.lastName          ← holder last name
 *   record.licenseStatus     ← status string (see Thing 3)
 *   record.originalIssueDate ← issue date
 *   record.expirationDate    ← expiration date
 *   record.businessName      ← company name (for PPO licenses)
 *   response.data.totalFound ← count of results (0 = not found)
 *   response.data.results    ← array of result objects
 *
 * What to change: If the diagnostic shows different field names
 * (e.g. "license_number" vs "licenseNumber", "exp_date" vs "expirationDate"),
 * update the record.xxx references in the verify() and search() methods.
 */

/**
 * THING 3 — Status string values
 *
 * Current code passes record.licenseStatus directly to normalize().
 * The BaseStateAdapter.normalize() maps these strings to standard statuses:
 *
 *   'ACTIVE'    → status: 'ACTIVE'
 *   'EXPIRED'   → status: 'EXPIRED'
 *   'REVOKED'   → status: 'REVOKED'
 *   'SUSPENDED' → status: 'SUSPENDED'
 *   (anything else) → status: 'UNKNOWN'
 *
 * DCA likely returns values like: 'Active', 'Expired', 'Canceled',
 * 'Revoked', 'Inactive', 'Delinquent', etc.
 *
 * If DCA returns non-standard strings, add a mapping step in california.js:
 *
 *   _normalizeStatus(dcaStatus) {
 *     const map = {
 *       'Active':     'ACTIVE',
 *       'Expired':    'EXPIRED',
 *       'Canceled':   'EXPIRED',   // treat canceled as expired
 *       'Delinquent': 'EXPIRED',
 *       'Revoked':    'REVOKED',
 *       'Suspended':  'SUSPENDED',
 *     };
 *     return map[dcaStatus] || 'UNKNOWN';
 *   }
 *
 * Then change:  status: record.licenseStatus,
 *         to:  status: this._normalizeStatus(record.licenseStatus),
 */

// ─────────────────────────────────────────────────────────────
// STEP 3 — Test with real licenses
// ─────────────────────────────────────────────────────────────
//
// After updating, test with these known CA license types:
//   G prefix  → Guard Card (unarmed)  e.g. G1234567
//   FE prefix → Exposed Firearm Permit
//   FQ prefix → Firearm Qualification Card
//   PPO       → Private Patrol Operator license
//
// You can find real license numbers to test with at:
//   https://www.bsis.ca.gov/onlineservices/verify.shtml
// Search any name → grab the license number → test your API returns same data.

// ─────────────────────────────────────────────────────────────
// CURRENT FALLBACK BEHAVIOR (while awaiting DCA approval)
// ─────────────────────────────────────────────────────────────
//
// If DCA_API_KEY is not set, the verify route returns:
//   {
//     status: 'VERIFICATION_ERROR',
//     error: 'CA DCA API key not configured',
//     stateCode: 'CA'
//   }
//
// This means your other 9 states (FL, TX, IL, VA, NV, OR, WA, AZ, NC)
// are fully live and operational right now — CA just needs the key.
//
// OPTION: While waiting for API approval, temporarily switch CA to
// portal scraping (like the other states do) by overriding verify() to
// use the BSIS public lookup at:
// https://www.bsis.ca.gov/onlineservices/verify.shtml
// This is slower and less reliable, but works without an API key.

// ─────────────────────────────────────────────────────────────
// SUMMARY OF WHAT'S PLUG-AND-PLAY vs WHAT NEEDS CALIBRATION
// ─────────────────────────────────────────────────────────────
//
// ✅ PLUG-AND-PLAY (works the moment DCA_API_KEY is set):
//   - API key authentication (Bearer token + query param)
//   - License type detection from prefix (G / FE / FQ / PPO)
//   - All 4 BSIS license types supported
//   - Name search endpoint
//   - Result normalization (status, dates, armed flag)
//   - Caching (30-min TTL)
//   - Error handling (404 → NOT_FOUND, network errors → VERIFICATION_ERROR)
//
// ⚠️  NEEDS CALIBRATION (one-time, after you see real API responses):
//   - Exact endpoint paths (/license vs /api/license vs /v1/license)
//   - Response field names (camelCase vs snake_case, exact key names)
//   - Status string values (Active vs ACTIVE vs active)
//
// ⏱  ESTIMATED CALIBRATION TIME: 30-60 minutes after you get the key
