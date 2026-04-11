import { queryLocalDb } from '../src/lib/server/local-db.js';

async function diagnose() {
    try {
        console.log("--- Checking profiles table ---");
        const profilesCols = await queryLocalDb("SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles'");
        console.log("Profiles columns:", profilesCols.rows.map(r => r.column_name));

        console.log("\n--- Checking profile_complete view ---");
        const viewCols = await queryLocalDb("SELECT column_name FROM information_schema.columns WHERE table_name = 'profile_complete'");
        console.log("View columns:", viewCols.rows.map(r => r.column_name));

        const testUser = await queryLocalDb("SELECT theme_config FROM profiles LIMIT 1");
        console.log("\nSample theme_config in profiles:", testUser.rows[0]);
        
    } catch (e) {
        console.error("DIAGNOSE ERROR:", e);
    }
    process.exit(0);
}

diagnose();
