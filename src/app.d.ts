// src/app.d.ts
import type { SupabaseClient, Session } from '@supabase/supabase-js';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient;
			session: Session | null;
			profile: import('$lib/server/auth').Profile | null;
		}

		interface PageData {
			session: Session | null;
			profile?: {
				id: string;
				full_name: string | null;
				email: string | null;
				permissions: Record<string, import('$lib/server/auth').CRUD>;
				roles: Array<{ id: string; name: string }>;
				active: boolean;
				allowed_branches: Array<{
					id: string;
					name: string;
					agent_url: string | null;
					agent_token: string;
					profit_branch_code: string | null;
					profit_server_id: string | null;
				}>;
				allowed_warehouses: string[];
				profit_user: string | null;
				profit_pass: string | null;
			} | null;
		}

		interface Error {
			message: string;
		}
	}
}

export {};
