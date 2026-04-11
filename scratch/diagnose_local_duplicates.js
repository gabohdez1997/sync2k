
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.LOCAL_PG_URL
});

async function checkLocal() {
  console.log('Inspecting LOCAL PostgreSQL database...');
  try {
    const email = 'Inversiones.romjes@gmail.com';
    const res = await pool.query('SELECT id, email, full_name, count(*) OVER (PARTITION BY id) as cnt FROM profiles WHERE email ILIKE $1', [email]);
    
    console.log(`Found ${res.rows.length} matches locally for email.`);
    res.rows.forEach(r => {
      console.log(` - ID: ${r.id}, Email: ${r.email}, Count: ${r.cnt}`);
    });

    if (res.rows.length > 0) {
      const id = res.rows[0].id;
      console.log(`Checking local view profile_complete for ID: ${id}`);
      const vRes = await pool.query('SELECT * FROM profile_complete WHERE id = $1', [id]);
      console.log(`Local view returned ${vRes.rows.length} rows.`);
    }

  } catch (err) {
    console.error('Local DB Error:', err.message);
  } finally {
    await pool.end();
  }
}

checkLocal();
