// src/routes/dashboard/branches/+page.server.ts
import { protectLoad, protectAction } from '$lib/server/permissions';
import { adminDb, MasterCollections } from '$lib/server/firebase-admin';
import { logAction } from '$lib/server/audit';
import { AgentClient } from '$lib/server/agent';
import { fail } from '@sveltejs/kit';
import { PUBLIC_FIREBASE_API_KEY } from '$env/static/public';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sec_branches', async ({ url }) => {
	let branches: any[] = [];
	let tenants: any[] = [];
	let loadError: string | null = null;
	const selectedTenantId = url.searchParams.get('tenant_id');

	if (adminDb) {
		try {
			// Load tenants for the dropdown link
			const snapTenants = await adminDb.collection(MasterCollections.CONNECTIONS).get();
			tenants = snapTenants.docs.map(doc => {
				const data = doc.data();
				return {
					id: doc.id,
					name: data.name || '',
					slug: data.slug || doc.id,
					agent_url: data.agent_url,
					agent_api_key: data.agent_api_key
				};
			});

			// If a tenant is selected, fetch its branches directly from the associated Agent
			if (selectedTenantId) {
				const selectedTenant = tenants.find(t => t.id === selectedTenantId || t.slug === selectedTenantId);
				if (selectedTenant && selectedTenant.agent_url) {
					const agentClient = new AgentClient({
						slug: selectedTenant.slug,
						agent_url: selectedTenant.agent_url,
						agent_api_key: selectedTenant.agent_api_key
					});
					
					const resData = await agentClient.getDatabaseConfig();

					if (resData.success === false) {
						const errMsg = (resData as any).message || 'Desconocido';
						console.error(`Agent ${selectedTenant.name} returned error:`, errMsg);
						loadError = `Rechazo del Agente: ${errMsg}`;
					} else {
						// Unwrap payload whether it is {servers: []} or root array or {data: {servers: []}}
						const resDataAny = resData as any;
						const parsedServers = resDataAny?.data?.servers || resDataAny?.servers || resDataAny?.data || (Array.isArray(resDataAny) ? resDataAny : []);
						
						if (Array.isArray(parsedServers)) {
							branches = parsedServers.map((s: any) => ({
								...s,
								tenant_id: selectedTenantId, // inject tenant_id for the UI
								sql_config: { host: s.server, database: s.database, user: s.user, password: s.password }
							}));
						}
					}
				}
			}
		} catch (error: any) {
			console.error('Error fetching data for branches:', error);
			loadError = `Error interno o de conexión Node: ${error.message || 'Error desconocido al contactar al Agente'}`;
		}
	}

	return {
		branches,
		tenants,
		loadError
	};
});

export const actions: Actions = {
	saveBranch: protectAction('sec_branches', async ({ request, locals }) => {
		if (!adminDb) return fail(500, { message: 'Base de datos no disponible' });

		const formData = await request.formData();
		const tenant_id = formData.get('tenant_id') as string;
		const name = formData.get('name') as string;
		const description = formData.get('description') as string;
		const sqlHost = formData.get('sqlHost') as string;
		const sqlDb = formData.get('sqlDb') as string;
		const sqlUser = formData.get('sqlUser') as string;
		const sqlPass = formData.get('sqlPass') as string;
		const co_sucu = formData.get('co_sucu') as string;
		const is_default = formData.get('is_default') === 'on';

		const branchIdRaw = formData.get('branchId') as string;
		const branchId = branchIdRaw && branchIdRaw.trim() !== "" ? branchIdRaw : null;
		
		if (!name || !tenant_id) {
			return fail(400, { message: 'El nombre y la empresa asocida son obligatorios' });
		}

		try {
			// Sync directly with Agent API
			const tenantDoc = await adminDb.collection(MasterCollections.CONNECTIONS).doc(tenant_id).get();
			const tenantData = tenantDoc.data();
			
			if (!tenantData || !tenantData.agent_url) {
				return fail(400, { message: 'La empresa seleccionada no tiene un Agente configurado' });
			}

			const isNew = !branchId;
			let actualBranchId: string;

			// If it's a "new" branch from the UI, triple check Firestore to avoid duplicates by name
			if (isNew) {
				const existingSnap = await adminDb.collection(MasterCollections.CONNECTIONS)
					.doc(tenant_id)
					.collection('branches')
					.where('name', '==', name)
					.limit(1)
					.get();
				
				if (!existingSnap.empty) {
					actualBranchId = existingSnap.docs[0].id;
					console.log(`[BRANCHES] Existing branch found by name. Reusing UUID: ${actualBranchId}`);
				} else {
					actualBranchId = crypto.randomUUID();
				}
			} else {
				actualBranchId = branchId as string;
			}

			let payload: any;
			let urlEndpoint = '/config/database';

			if (isNew && !branchId) { // Really new (not just re-pushing)
				payload = {
					servers: [{
						id: actualBranchId,
						name: name,
						server: sqlHost,
						database: sqlDb,
						user: sqlUser,
						password: sqlPass,
						co_sucur: co_sucu,
						is_default: is_default
					}]
				};
			} else {
				urlEndpoint = `/config/database/${actualBranchId}`;
				payload = {
					name: name,
					server: sqlHost,
					database: sqlDb,
					user: sqlUser,
					password: sqlPass,
					co_sucur: co_sucu,
					is_default: is_default
				};
			}

			const response = await fetch(`${tenantData.agent_url.replace(/\/$/, '')}/api/v1${urlEndpoint}`, {
				method: isNew ? 'POST' : 'PATCH',
				headers: { 
					'Content-Type': 'application/json',
					'x-api-key': tenantData.agent_api_key || ''
				},
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				const errText = await response.text();
				console.error(`Agent API Sync error (${isNew ? 'POST' : 'PATCH'}):`, errText);
				return fail(response.status, { message: `HTTP ${response.status}: ${errText.substring(0, 100)}` });
			}

			const rawJson = await response.text();
			let resJson: any = null;
			try {
				resJson = JSON.parse(rawJson);
			} catch (_) {}

			if (resJson && resJson.success === false) {
				console.error('Agent API Sync returned success=false:', resJson);
				return fail(400, { message: `Rechazado: ${JSON.stringify(resJson).substring(0, 100)}` });
			}

			// Auditoría
			await logAction({
				uid: (locals as any).uid || 'system',
				user_email: (locals as any).user?.email || 'system',
				action: branchId ? 'UPDATE' : 'CREATE',
				entity: 'sucursales_agente',
				entity_id: actualBranchId,
				tenant_id: tenant_id,
				details: { name, description, co_sucu, is_default }
			});

			// Backup en Firestore por si se pierde la conexión
			try {
				await adminDb.collection(MasterCollections.CONNECTIONS)
					.doc(tenant_id)
					.collection('branches')
					.doc(actualBranchId)
					.set({
						id: actualBranchId,
						name: name,
						description: description || '',
						server: sqlHost,
						database: sqlDb,
						user: sqlUser,
						password: sqlPass,
						co_sucur: co_sucu,
						is_default: is_default,
						updatedAt: new Date()
					}, { merge: true });
			} catch (fsError) {
				console.error('Error guardando backup de sucursal en Firestore:', fsError);
				// No fallamos toda la petición si el backup falla pero el agente lo aceptó
			}

			return { success: true };
		} catch (error: any) {
			console.error('Error saving branch:', error);
			return fail(500, { message: error.message || 'Error al guardar sucursal' });
		}
	}),

	deleteBranch: protectAction('sec_branches', async ({ request, locals }) => {
		if (!adminDb) return fail(500, { message: 'Base de datos no disponible' });

		const formData = await request.formData();
		const branchId = formData.get('branchId') as string;
		const password = formData.get('password') as string;

		const tenant_id = formData.get('tenant_id') as string;

		if (!branchId) return fail(400, { message: 'ID de sucursal no proporcionado' });
		if (!tenant_id) return fail(400, { message: 'ID de empresa no proporcionado' });
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

			// Sync delete with Agent API directly
			const tenantDoc = await adminDb.collection(MasterCollections.CONNECTIONS).doc(tenant_id).get();
			const tenantData = tenantDoc.data();
			
			if (!tenantData || !tenantData.agent_url) {
				return fail(400, { message: 'La empresa seleccionada no tiene un Agente configurado' });
			}

			const response = await fetch(`${tenantData.agent_url.replace(/\/$/, '')}/api/v1/config/database/${branchId}`, {
				method: 'DELETE',
				headers: { 
					'Content-Type': 'application/json',
					'x-api-key': tenantData.agent_api_key || ''
				}
			});

			if (!response.ok) {
				console.error('Agent API Sync error (delete):', await response.text());
				return fail(500, { message: 'Error eliminando la sucursal del Agente (HTTP Error)' });
			}

			const resJsonDelete = await response.json().catch(() => null);
			if (resJsonDelete && resJsonDelete.success === false) {
				console.error('Agent API Sync returned success=false (delete):', resJsonDelete);
				return fail(500, { message: resJsonDelete.message || 'El agente rechazó la eliminación.' });
			}

			// Auditoría
			await logAction({
				uid: (locals as any).uid || 'system',
				user_email: (locals as any).user?.email || 'system',
				action: 'DELETE',
				entity: 'sucursales_agente',
				entity_id: branchId
			});

			// Eliminar de Firestore backup
			try {
				await adminDb.collection(MasterCollections.CONNECTIONS)
					.doc(tenant_id)
					.collection('branches')
					.doc(branchId)
					.delete();
			} catch (fsError) {
				console.error('Error eliminando backup de sucursal en Firestore:', fsError);
			}

			return { success: true };
		} catch (error: any) {
			console.error('Error deleting branch:', error);
			return fail(500, { message: error.message || 'Error al eliminar sucursal' });
		}
	})
};
