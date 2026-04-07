import pg from 'pg';

const pgUrl = process.env.LOCAL_PG_URL || 'postgresql://postgres:Galpe2021*@localhost:5432/sync2k';
const pgPool = new pg.Pool({ connectionString: pgUrl });

async function query() {
  try {
    const { rows } = await pgPool.query('SELECT name, sql_config, profit_branch_codes FROM branches');
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

query();
