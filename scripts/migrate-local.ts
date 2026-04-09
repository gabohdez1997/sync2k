import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.LOCAL_PG_URL
});

async function migrate() {
    try {
        console.log('Connecting to local PostgreSQL...');
        const client = await pool.connect();
        console.log('Running migration...');
        await client.query(`
            ALTER TABLE profiles 
            ADD COLUMN IF NOT EXISTS theme_config JSONB DEFAULT '{"mode": "system", "accentHue": 217}';
        `);
        console.log('Migration completed successfully!');
        client.release();
    } catch (err) {
        console.error('Error during migration:', err);
    } finally {
        await pool.end();
    }
}

migrate();
