// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { SupabaseClient, Session } from '@supabase/supabase-js';

declare global {
	namespace App {
		interface Locals {
			/** Cliente Supabase con sesión del usuario actual */
			supabase: SupabaseClient;

			/** Helper para obtener la sesión (refresca token automáticamente) */
			getSession(): Promise<Session | null>;

			/** Perfil completo del usuario (null en rutas públicas) */
			profile: import('$lib/server/auth').Profile | null;

			/** Sesión activa (null en rutas públicas) */
			session: Session | null;
		}

		interface PageData {
			session: Session | null;
			profile?: {
				id: string;
				full_name: string | null;
				avatar_url: string | null;
				permissions: string[];
				roles: Array<{ id: string; name: string }>;
				company: {
					id: string;
					name: string;
					slug: string;
				} | null;
			} | null;
		}

		interface Error {
			message: string;
		}
	}
}

export {};
