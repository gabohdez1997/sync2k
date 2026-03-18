// src/routes/dashboard/tenants/+page.server.ts
import { protectLoad, protectAction } from '$lib/server/permissions';
import { adminDb, MasterCollections } from '$lib/server/firebase-admin';
import { logAction } from '$lib/server/audit';
import { fail } from '@sveltejs/kit';
import { PUBLIC_FIREBASE_API_KEY } from '$env/static/public';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sec_tenants', async () => {
	let tenants: any[] = [];

	if (adminDb) {
		try {
			const snap = await adminDb.collection(MasterCollections.CONNECTIONS).get();
			tenants = snap.docs.map(doc => {
				const data = doc.data();
				return {
					id: doc.id,
					name: data.name || '',
					slug: data.slug || doc.id,
					rif: data.rif || '',
					logo: data.logo || '',
					tunnel_token: data.tunnel_token || '',
					agent_url: data.agent_url || '',
					agent_api_key: data.agent_api_key || '',
					sql_config: data.sql_config || { host: '', database: '', user: '', password: '' },
					updatedAt: data.updatedAt || null
				};
			});
		} catch (error) {
			console.error('Error fetching tenants:', error);
		}
	}

	return {
		tenants
	};
});

export const actions: Actions = {
	saveTenant: protectAction('sec_tenants', async ({ request, locals }) => {
		if (!adminDb) return fail(500, { message: 'Base de datos no disponible' });

		const formData = await request.formData();
		const tenantId = formData.get('tenantId') as string;
		const name = formData.get('name') as string;
		const slug = formData.get('slug') as string;
		const rif = formData.get('rif') as string;
		const logo = formData.get('logo') as string; // Esperamos base64
		const tunnel_token = formData.get('tunnel_token') as string;
		const agent_url = formData.get('agent_url') as string;
		const agent_api_key = formData.get('agent_api_key') as string;
		const sqlHost = formData.get('sqlHost') as string;
		const sqlDb = formData.get('sqlDb') as string;
		const sqlUser = formData.get('sqlUser') as string;
		const sqlPass = formData.get('sqlPass') as string;

		const slugValue = (slug || tenantId || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

		if (!name || !slugValue) {
			return fail(400, { message: 'El nombre y el identificador son obligatorios' });
		}

		try {
			const tenantData = {
				name,
				slug: slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
				rif,
				logo,
				tunnel_token,
				agent_url,
				agent_api_key,
				sql_config: {
					host: sqlHost,
					database: sqlDb,
					user: sqlUser,
					password: sqlPass
				},
				updatedAt: new Date().toISOString()
			};

			const docRef = adminDb.collection(MasterCollections.CONNECTIONS).doc(tenantId || tenantData.slug);
			await docRef.set(tenantData, { merge: true });

			// Auditoría
			await logAction({
				uid: (locals as any).uid || 'system',
				user_email: (locals as any).user?.email || 'system',
				action: tenantId ? 'UPDATE' : 'CREATE',
				entity: 'conexiones',
				entity_id: tenantId || tenantData.slug,
				tenant_id: tenantData.slug,
				details: { name, rif, tunnel_token: !!tunnel_token }
			});

			return { success: true };
		} catch (error: any) {
			console.error('Error saving tenant:', error);
			return fail(500, { message: error.message || 'Error al guardar empresa' });
		}
	}),

	deleteTenant: protectAction('sec_tenants', async ({ request, locals }) => {
		if (!adminDb) return fail(500, { message: 'Base de datos no disponible' });

		const formData = await request.formData();
		const tenantId = formData.get('tenantId') as string;
		const password = formData.get('password') as string;

		if (!tenantId) return fail(400, { message: 'ID de empresa no proporcionado' });
		if (!password) return fail(400, { message: 'La contraseña es obligatoria para confirmar' });

		try {
			// Verificar contraseña con Firebase REST API (Identity Toolkit)
			const email = (locals as any).session?.email;
			if (!email) return fail(401, { message: 'Sesión no válida' });

			const verifyResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${PUBLIC_FIREBASE_API_KEY}`, {
				method: 'POST',
				body: JSON.stringify({
					email,
					password,
					returnSecureToken: true
				}),
				headers: { 'Content-Type': 'application/json' }
			});

			if (!verifyResponse.ok) {
				return fail(401, { message: 'Contraseña de confirmación incorrecta' });
			}

			await adminDb.collection(MasterCollections.CONNECTIONS).doc(tenantId).delete();

			// Auditoría
			await logAction({
				uid: (locals as any).uid || 'system',
				user_email: (locals as any).user?.email || 'system',
				action: 'DELETE',
				entity: 'conexiones',
				entity_id: tenantId
			});

			return { success: true };
		} catch (error: any) {
			console.error('Error deleting tenant:', error);
			return fail(500, { message: error.message || 'Error al eliminar empresa' });
		}
	})
};
