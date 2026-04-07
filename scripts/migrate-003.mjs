import postgres from 'pg';
import fs from 'fs';
import { readFileSync } from 'fs';

const DB_URL = process.env.LOCAL_PG_URL || 'postgresql://postgres:Galpe2021*@localhost:5432/sync2k';
console.log(`Conectando a PG Local en: ${DB_URL}`);

const pool = new postgres.Pool({
  connectionString: DB_URL
});

async function main() {
  try {
    const sqlScript = readFileSync('supabase/migrations/003_multi_branch_codes.sql', 'utf8');
    const client = await pool.connect();
    
    console.log('--- Ejecutando 003_multi_branch_codes.sql en PostgreSQL Local ---');
    await client.query(sqlScript);
    console.log('✅ Migración Ejecutada Correctamente');

    client.release();
  } catch (error) {
    console.error('❌ Error migrando DB local:', error.message);
  } finally {
    pool.end();
  }
}

main();
