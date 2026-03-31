"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabaseClient = getSupabaseClient;
exports.saveToSupabase = saveToSupabase;
exports.verifyTable = verifyTable;
const supabase_js_1 = require("@supabase/supabase-js");
let client = null;
function getSupabaseClient() {
    if (client)
        return client;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY. Set them in your .env file.');
    }
    client = (0, supabase_js_1.createClient)(url, key);
    return client;
}
/**
 * Upsert scraped training centers into the "training_centers" table.
 * Uses license_number as the conflict target to prevent duplicates.
 */
async function saveToSupabase(data) {
    if (data.length === 0) {
        console.log('  💾 No data to save.');
        return { inserted: 0, errors: 0 };
    }
    const sb = getSupabaseClient();
    let inserted = 0;
    let errors = 0;
    // Batch in groups of 50 to stay within Supabase row limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        const { data: result, error } = await sb
            .from('training_centers')
            .upsert(batch.map((row) => ({
            name: row.name,
            license_number: row.license_number,
            license_type: row.license_type,
            address: row.address,
            city: row.city,
        })), { onConflict: 'license_number' })
            .select();
        if (error) {
            console.error(`  ❌ Supabase batch error:`, error.message);
            errors += batch.length;
        }
        else {
            const count = result?.length ?? batch.length;
            inserted += count;
            console.log(`  💾 Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${count} rows upserted`);
        }
    }
    return { inserted, errors };
}
/**
 * Verify the training_centers table exists by running a count query.
 */
async function verifyTable() {
    try {
        const sb = getSupabaseClient();
        const { count, error } = await sb
            .from('training_centers')
            .select('*', { count: 'exact', head: true });
        if (error) {
            console.error('❌ Table check failed:', error.message);
            console.log('\nCreate the table in Supabase SQL editor:\n');
            console.log(`CREATE TABLE training_centers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  license_number TEXT UNIQUE NOT NULL,
  license_type TEXT,
  address TEXT,
  city TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);\n`);
            return false;
        }
        console.log(`✅ training_centers table exists (${count ?? 0} rows)`);
        return true;
    }
    catch (err) {
        console.error('❌ Cannot reach Supabase:', err.message);
        return false;
    }
}
//# sourceMappingURL=supabase.js.map