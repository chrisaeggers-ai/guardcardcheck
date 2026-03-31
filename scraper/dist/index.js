"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load .env from scraper directory or project root
dotenv.config({ path: path_1.default.resolve(__dirname, '../.env') });
dotenv.config({ path: path_1.default.resolve(__dirname, '../../app/.env') });
const scraper_1 = require("./scraper");
const supabase_1 = require("./supabase");
const CITIES_TO_SCRAPE = ['San Diego', 'Oakland'];
async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  BSIS Training Facility Scraper');
    console.log('  Target: search.dca.ca.gov');
    console.log(`  Cities: ${CITIES_TO_SCRAPE.join(', ')}`);
    console.log('═══════════════════════════════════════════════════\n');
    // Verify Supabase connection
    const hasSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY;
    if (hasSupabase) {
        const tableOk = await (0, supabase_1.verifyTable)();
        if (!tableOk) {
            console.log('⚠  Supabase table issue — results will be logged but not saved.\n');
        }
    }
    else {
        console.log('ℹ  No SUPABASE_URL/SUPABASE_ANON_KEY set — dry-run mode (results logged only)\n');
    }
    const { browser, context } = await (0, scraper_1.launchBrowser)();
    const page = await context.newPage();
    const allResults = [];
    try {
        for (const city of CITIES_TO_SCRAPE) {
            const result = await (0, scraper_1.scrapeCity)(page, city);
            allResults.push(...result.data);
            console.log(`  📊 ${city}: ${result.total} total rows → ${result.filtered} training facilities\n`);
        }
    }
    catch (err) {
        console.error('❌ Scraping error:', err.message);
    }
    finally {
        await browser.close();
    }
    // Deduplicate by license_number
    const seen = new Set();
    const unique = allResults.filter((r) => {
        if (!r.license_number || seen.has(r.license_number))
            return false;
        seen.add(r.license_number);
        return true;
    });
    console.log('\n═══════════════════════════════════════════════════');
    console.log(`  RESULTS SUMMARY`);
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Total scraped:     ${allResults.length}`);
    console.log(`  After dedup:       ${unique.length}`);
    console.log('───────────────────────────────────────────────────');
    if (unique.length > 0) {
        console.log('\n  Training Facilities Found:\n');
        for (const r of unique) {
            console.log(`    ${r.name}`);
            console.log(`      License: ${r.license_number} (${r.license_type})`);
            console.log(`      Address: ${r.address}`);
            console.log(`      City:    ${r.city}`);
            console.log('');
        }
    }
    // Save to Supabase
    if (hasSupabase && unique.length > 0) {
        console.log('\n💾 Saving to Supabase...');
        const upsertResult = await (0, supabase_1.saveToSupabase)(unique);
        console.log(`  ✅ Inserted/updated: ${upsertResult.inserted}`);
        if (upsertResult.errors > 0) {
            console.log(`  ❌ Errors: ${upsertResult.errors}`);
        }
    }
    console.log('\n✅ Done.');
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map