
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMetadata() {
  console.log('Inspecting Database Metadata for "profiles"...');
  
  // Query pg_catalog to see what "profiles" objects exist
  const { data, error } = await supabase.rpc('get_table_info', { table_name: 'profiles' });
  // Wait, I don't know if get_table_info exists. Let's use raw SQL if possible.
  // Supabase doesn't allow raw SQL via client unless there's a wrapper function.
  
  // Let's try to query without .single() and see exactly WHAT is returned.
  const userId = '6cb28700-f94a-46a7-bde7-e236e069b299';
  console.log(`Querying profiles for ID: ${userId} WITHOUT .single()...`);
  
  const { data: rawRows, error: rawErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId);

  if (rawErr) {
    console.error('Error:', rawErr);
  } else {
    console.log(`Found ${rawRows.length} rows.`);
    console.log('Rows data:', JSON.stringify(rawRows, null, 2));
  }

  // Check if "profiles" is a view or a table
  console.log('Checking view/table status...');
  const { data: viewCheck, error: viewErr } = await supabase
    .from('profiles')
    .select('count', { count: 'exact', head: true });
  
  console.log('Profile count head:', viewCheck, viewErr);
}

checkMetadata();
