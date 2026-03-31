export interface TrainingCenter {
    name: string;
    license_number: string;
    license_type: string;
    address: string;
    city: string;
}
export interface ScrapeResult {
    city: string;
    total: number;
    filtered: number;
    data: TrainingCenter[];
}
export interface UpsertResult {
    inserted: number;
    errors: number;
}
