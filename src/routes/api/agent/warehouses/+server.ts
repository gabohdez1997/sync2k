import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDb, MasterCollections } from '$lib/server/firebase-admin';
import { AgentClient } from '$lib/server/agent';

export const GET: RequestHandler = async ({ url, locals }) => {
	// Simple auth check
	if (!(locals as any).session?.uid && !(locals as any).profile?.uid) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const tenantId = url.searchParams.get('tenant_id');
	if (!tenantId) {
		return json({ error: 'tenant_id is required' }, { status: 400 });
	}
	
	const branchId = url.searchParams.get('branch_id'); // Optionally filter by branch if needed by agent later

	if (!adminDb) {
		return json({ error: 'Database not initialized' }, { status: 500 });
	}

	try {
		// Fetch tenant info
		const snapTenants = await adminDb.collection(MasterCollections.CONNECTIONS).get();
		const tenants = snapTenants.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
		const selectedTenant = tenants.find(t => t.id === tenantId || t.slug === tenantId);

		if (!selectedTenant || !selectedTenant.agent_url) {
			return json({ error: 'Tenant non-existent or has no agent_url' }, { status: 404 });
		}

		const agentClient = new AgentClient({
			slug: selectedTenant.slug,
			agent_url: selectedTenant.agent_url,
			agent_api_key: selectedTenant.agent_api_key
		});

		// The user specified: /api/v1/catalogos/almacenes te traera todos los almacenes
		const resData = await agentClient.request<any>('/catalogos/almacenes');

		if (resData.success === false) {
			return json({ error: resData.message || 'Agent error' }, { status: 500 });
		}

		const warehouses = (resData as any)?.data || (Array.isArray(resData) ? resData : []);
		return json({ warehouses: Array.isArray(warehouses) ? warehouses : [] });
	} catch (err: any) {
		return json({ error: err.message }, { status: 500 });
	}
};

