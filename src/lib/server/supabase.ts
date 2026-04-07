// src/lib/server/supabase.ts
// Cliente Supabase del lado del SERVIDOR (service_role — bypasa RLS)
// NUNCA exportar al cliente/browser

import { createClient } from '@supabase/supabase-js';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export const supabaseAdmin = createClient(
  publicEnv.PUBLIC_SUPABASE_URL || '',
  privateEnv.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
