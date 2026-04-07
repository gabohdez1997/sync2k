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

		const resData = await agentClient.getDatabaseConfig();

		if (resData.success === false) {
			return json({ error: (resData as any).message || 'Agent error' }, { status: 500 });
		}

		const parsedServers = (resData as any)?.data?.servers || (resData as any)?.servers || (resData as any)?.data || (Array.isArray(resData) ? resData : []);
		
		return json({ branches: Array.isArray(parsedServers) ? parsedServers : [] });
	} catch (err: any) {
		return json({ error: err.message }, { status: 500 });
	}
};

