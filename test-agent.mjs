
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rwblykcpnduniexbivra.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3Ymx5a2NwbmR1bmlleGJpdnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTcyNDQsImV4cCI6MjA5NzA5MzI0NH0.sDhyi6mVOivOBoIrQ24Loqbow5T2dvuOuLYucfUx6VE';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: branches } = await supabase.from('branches').select('*').eq('active', true);
  if (!branches || branches.length === 0) return console.log('No branches');
  
  const b = branches[0];
  console.log('Testing branch:', b.name, b.agent_url);

  try {
    const res = await fetch(b.agent_url + '/sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': b.agent_token },
      body: JSON.stringify({ query: 'SELECT COUNT(*) as total FROM art' })
    });
    console.log('/sql response:', res.status, await res.text());
  } catch(e) { console.log('/sql failed'); }
  
  try {
    const res = await fetch(b.agent_url + '/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': b.agent_token },
      body: JSON.stringify({ query: 'SELECT COUNT(*) as total FROM art' })
    });
    console.log('/query response:', res.status, await res.text());
  } catch(e) { console.log('/query failed'); }
}
test();

