import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function check() {
  try {
    const { data: branches, error } = await supabaseAdmin.from('branches').select('id, name, sql_config, profit_branch_codes, updated_at');
    if (error) throw error;
    console.log(JSON.stringify(branches, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    process.exit(0);
  }
}
check();
