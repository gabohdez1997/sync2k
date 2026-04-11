import { queryLocalDb } from '../src/lib/server/local-db.js';

async function checkSchema() {
    try {
        const res = await queryLocalDb("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles'");
        console.table(res.rows);
    } catch (e) {
        console.error("Error checking schema:", e);
    }
    process.exit(0);
}

checkSchema();
