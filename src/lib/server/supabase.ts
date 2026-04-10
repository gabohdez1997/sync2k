// src/lib/server/supabase.ts
// Cliente Supabase del lado del SERVIDOR (service_role — bypasa RLS)
// NUNCA exportar al cliente/browser

import { createClient } from '@supabase/supabase-js';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

/**
 * Obtiene valores con fallback manual para entornos donde $env/dynamic falla
 */
const getEnv = (key: string, dynamicValue: string) => {
  return dynamicValue || (typeof process !== 'undefined' ? process.env[key] : '') || '';
};

const supabaseUrl = getEnv('PUBLIC_SUPABASE_URL', publicEnv.PUBLIC_SUPABASE_URL);
const supabaseAnonKey = getEnv('PUBLIC_SUPABASE_ANON_KEY', publicEnv.PUBLIC_SUPABASE_ANON_KEY);
const supabaseServiceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY', privateEnv.SUPABASE_SERVICE_ROLE_KEY);

if (!supabaseUrl) console.warn('[SUPABASE] URL de Supabase no definida.');
if (!supabaseServiceKey) console.error('[SUPABASE] SERVICE ROLE KEY no definida. Las operaciones administrativas fallarán.');

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
