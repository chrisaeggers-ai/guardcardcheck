import { SupabaseClient } from '@supabase/supabase-js';
import type { TrainingCenter, UpsertResult } from './types';
export declare function getSupabaseClient(): SupabaseClient;
/**
 * Upsert scraped training centers into the "training_centers" table.
 * Uses license_number as the conflict target to prevent duplicates.
 */
export declare function saveToSupabase(data: TrainingCenter[]): Promise<UpsertResult>;
/**
 * Verify the training_centers table exists by running a count query.
 */
export declare function verifyTable(): Promise<boolean>;
