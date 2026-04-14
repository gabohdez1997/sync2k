
const { Client } = require('pg');
const client = new Client('postgresql://postgres:Galpe2021*@localhost:5432/sync2k');

async function checkSchema() {
  await client.connect();
  const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles'");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

checkSchema().catch(console.error);
