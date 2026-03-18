// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { DecodedIdToken } from 'firebase-admin/auth';

declare global {
	namespace App {
		interface Locals {
			/** Verified Firebase Session Cookie Claim */
			session: DecodedIdToken | null;

			/** Extracted Tenant ID from subdomain (e.g. 'empresa1' from empresa1.sync2k.com) */
			tenantId: string | null;

			/** Full User Profile from BD_Master */
			profile: import('$lib/server/auth').Profile | null;
		}

		interface PageData {
			session: DecodedIdToken | null;
			tenantId: string | null;
			profile?: {
				uid: string;
				full_name: string | null;
				email: string | null;
				permissions: Record<string, import('$lib/server/auth').CRUD>;
				roles: Array<{ id: string; name: string }>;
				active: boolean;
			} | null;
		}

		interface Error {
			message: string;
		}
	}
}

export {};
