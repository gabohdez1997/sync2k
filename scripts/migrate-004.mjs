import postgres from 'pg';
import fs from 'fs';
import { readFileSync } from 'fs';

const DB_URL = process.env.LOCAL_PG_URL || 'postgresql://postgres:Galpe2021*@localhost:5432/sync2k';
const pool = new postgres.Pool({ connectionString: DB_URL });

async function main() {
  try {
    const sqlScript = readFileSync('supabase/migrations/004_add_sql_config.sql', 'utf8');
    const client = await pool.connect();
    console.log('--- Ejecutando 004_add_sql_config.sql ---');
    await client.query(sqlScript);
    console.log('✅ Migración Ejecutada');
    client.release();
  } catch (err) {
    console.error('❌ Error migrando DB local:', err.message);
  } finally {
    pool.end();
  }
}

main();
