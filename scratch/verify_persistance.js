import { queryLocalDb } from '../src/lib/server/local-db.js';

async function verify() {
    try {
        console.log("Checking if theme_config exists in profiles...");
        const res = await queryLocalDb("SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'theme_config'");
        
        if (res.rows.length === 0) {
            console.log("Missing column! Adding it...");
            await queryLocalDb("ALTER TABLE profiles ADD COLUMN theme_config JSONB DEFAULT NULL");
            console.log("Column added.");
        } else {
            console.log("Column already exists.");
        }

        console.log("Checking profile_complete view...");
        const resView = await queryLocalDb("SELECT column_name FROM information_schema.columns WHERE table_name = 'profile_complete' AND column_name = 'theme_config'");
        if (resView.rows.length === 0) {
            console.warn("View is STALE. It does not have theme_config column.");
            // My fallback in getUserProfile handles this now!
        } else {
            console.log("View is up to date.");
        }

    } catch (e) {
        console.error("DIAGNOSE ERROR:", e);
    }
    process.exit(0);
}

verify();
