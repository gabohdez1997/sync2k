import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const { Pool } = pg;
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOCAL_PG_URL = process.env.LOCAL_PG_URL || 'postgresql://postgres:Galpe2021*@localhost:5432/sync2k';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const localPool = new Pool({ connectionString: LOCAL_PG_URL });

async function getLastSyncTime(client, table) {
  const { rows } = await client.query(`SELECT MAX(updated_at) as last_updated FROM ${table}`);
  let last = rows[0]?.last_updated;
  if (last && last instanceof Date) return last.toISOString();
  return last || new Date(0).toISOString();
}

async function runOnce() {
  const localClient = await localPool.connect();
  console.log('Forzando sincronización manual Cloud -> Local...');
  try {
    const lastBranchUpdate = await getLastSyncTime(localClient, 'branches');
    const { data: cloudBranches, error } = await supabase
      .from('branches')
      .select('*')
      .gt('updated_at', lastBranchUpdate);
      
    if (error) throw error;
    
    if (cloudBranches && cloudBranches.length > 0) {
      for (const branch of cloudBranches) {
        await localClient.query(`
          INSERT INTO branches (id, name, agent_url, agent_token, profit_branch_codes, sql_config, profit_server_id, local_dns_alias, active, sort_order, updated_at, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            agent_url = EXCLUDED.agent_url,
            agent_token = EXCLUDED.agent_token,
            profit_branch_codes = EXCLUDED.profit_branch_codes,
            sql_config = EXCLUDED.sql_config,
            profit_server_id = EXCLUDED.profit_server_id,
            local_dns_alias = EXCLUDED.local_dns_alias,
            active = EXCLUDED.active,
            sort_order = EXCLUDED.sort_order,
            updated_at = EXCLUDED.updated_at
        `, [branch.id, branch.name, branch.agent_url, branch.agent_token, JSON.stringify(branch.profit_branch_codes), JSON.stringify(branch.sql_config), branch.profit_server_id, branch.local_dns_alias, branch.active, branch.sort_order, branch.updated_at, branch.created_at]);
      }
      console.log(`✅ Sincronizadas ${cloudBranches.length} sucursales.`);
    } else {
      console.log(`✅ No hay sucursales nuevas por sincronizar.`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    localClient.release();
    localPool.end();
    process.exit(0);
  }
}
runOnce();
