
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://rwblykcpnduniexbivra.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3Ymx5a2NwbmR1bmlleGJpdnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTcyNDQsImV4cCI6MjA5NzA5MzI0NH0.sDhyi6mVOivOBoIrQ24Loqbow5T2dvuOuLYucfUx6VE';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
    const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(5);
    console.log(data, error);
}
run();

