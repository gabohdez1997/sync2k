// src/lib/server/supabase.ts
// Cliente Supabase con service_role — NUNCA exponer en el cliente.
// Se usa para operaciones que bypasean RLS (ej: seed, admin tasks).

import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
} from '$env/static/private';
import type { Database } from '$lib/types/supabase'; // generado con `supabase gen types`

export const supabaseAdmin = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
