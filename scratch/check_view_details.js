
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.PUBLIC_SUPABASE_ANON_KEY
);

async function simulateLogin() {
  const email = 'Inversiones.romjes@gmail.com';
  const password = '...'; // I don't know the password.
  // Wait, I can't simulate login without the password.
}

async function checkViewDetails() {
  // Use service role to check the profile_complete view for the ID
  const supabaseAdmin = createClient(
    process.env.PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const userId = '6cb28700-f94a-46a7-bde7-e236e069b299';
  
  console.log(`Querying profile_complete for ${userId}...`);
  const { data, error } = await supabaseAdmin
    .from('profile_complete')
    .select('*')
    .eq('id', userId);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Profile count: ${data.length}`);
    if (data.length > 0) {
      console.log('Permissions keys:', Object.keys(data[0].permissions || {}));
      console.log('Branches count:', data[0].allowed_branches?.length);
    }
  }
}

checkViewDetails();
