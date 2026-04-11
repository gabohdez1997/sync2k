
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspect() {
  const email = 'Inversiones.romjes@gmail.com';
  console.log(`Checking profile for email: ${email}`);

  // 1. Find user in auth.users (via profiles link or directly if possible)
  const { data: profileSearch, error: pErr } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .ilike('email', email);

  if (pErr) {
    console.error('Error searching profiles:', pErr);
    return;
  }

  console.log('Profiles found:', JSON.stringify(profileSearch, null, 2));

  if (profileSearch.length > 0) {
    const userId = profileSearch[0].id;
    console.log(`Found User ID: ${userId}`);

    // 2. Check the view for this ID
    console.log('Checking view: profile_complete...');
    const { data: viewData, error: vErr } = await supabase
      .from('profile_complete')
      .select('*')
      .eq('id', userId);

    if (vErr) {
      console.error('Error querying view:', vErr);
    } else {
      console.log(`View returned ${viewData.length} rows.`);
      if (viewData.length > 1) {
        console.log('DUPLICATE DETECTED IN VIEW!');
        console.log('Sample rows:', JSON.stringify(viewData, null, 2));
      }
    }

    // 3. Inspect user_roles
    console.log('Checking user_roles...');
    const { data: roles, error: rErr } = await supabase
      .from('user_roles')
      .select('*, roles(name)')
      .eq('user_id', userId);
    
    console.log('User Roles:', JSON.stringify(roles, null, 2));
  }
}

inspect();
