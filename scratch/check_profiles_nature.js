
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkProfilesNature() {
  console.log('Checking nature of "profiles"...');
  
  // Try to insert a dummy profile to see if it's a table or view
  const dummyId = '00000000-0000-0000-0000-000000000000';
  const { error } = await supabase
    .from('profiles')
    .insert({ id: dummyId, email: 'dummy@test.com', full_name: 'Dummy' });

  if (error) {
    console.log('Insert error (might be because it is a view or RLS):', error.message);
  } else {
    console.log('Insert success! It is likely a table.');
    // Clean up
    await supabase.from('profiles').delete().eq('id', dummyId);
  }

  // Check for ALL profiles with that email again, maybe there's a case sensitivity issue?
  const email = 'Inversiones.romjes@gmail.com';
  const { data: allWithEmail } = await supabase
    .from('profiles')
    .select('*')
    .ilike('email', email);
  
  console.log(`Found ${allWithEmail.length} profiles with email ${email}`);
  allWithEmail.forEach(p => console.log(` - ID: ${p.id}, Email: ${p.email}`));

  // Check for the first 5 chars of the ID in the whole table
  const prefix = '6cb28';
  const { data: prefixed } = await supabase
    .from('profiles')
    .select('id, email')
    .filter('id', 'ilike', `${prefix}%`);
  
  console.log(`Found ${prefixed.length} profiles with ID prefix ${prefix}`);
  prefixed.forEach(p => console.log(` - ID: ${p.id}, Email: ${p.email}`));
}

checkProfilesNature();
