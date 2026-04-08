import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';

/**
 * GET /api/agent/branches?tenant_id=...
 * Migrado de Firestore → Supabase.
 * Obtiene la configuración de servidores (bases de datos) desde el agente asociado a una sucursal/empresa.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const session = (locals as any).session;
	const profile = (locals as any).profile;

	if (!session?.user?.id && !profile?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const branchId = url.searchParams.get('tenant_id'); // Usamos tenant_id por compatibilidad legacy, pero es un branch_id
	if (!branchId) {
		return json({ error: 'branch_id/tenant_id is required' }, { status: 400 });
	}

	try {
		// Buscamos la sucursal en Supabase
		const { data: branch, error: dbError } = await supabaseAdmin
			.from('branches')
			.select('id, name, agent_url, agent_token')
			.eq('id', branchId)
			.single();

		if (dbError || !branch) {
			// Intento por nombre si no es un UUID
			const { data: branchByName } = await supabaseAdmin
				.from('branches')
				.select('id, name, agent_url, agent_token')
				.ilike('name', `%${branchId}%`)
				.limit(1)
				.single();
			
			if (!branchByName || !branchByName.agent_url) {
				return json({ error: 'Sucursal no encontrada o sin agente configurado' }, { status: 404 });
			}
			
			// Si la encontramos por nombre, usamos sus datos
			(branch as any) = branchByName;
		}

		if (!branch.agent_url) {
			return json({ error: 'La sucursal no tiene una URL de agente configurada' }, { status: 404 });
		}

		const agentClient = new AgentClient({
			slug: branch.id,
			agent_url: branch.agent_url,
			agent_api_key: branch.agent_token
		});

		const resData = await agentClient.getDatabaseConfig();

		if ((resData as any).success === false) {
			return json({ error: (resData as any).message || 'Error del agente' }, { status: 500 });
		}

		const parsedServers = (resData as any)?.data?.servers || (resData as any)?.servers || (resData as any)?.data || (Array.isArray(resData) ? resData : []);
		
		return json({ branches: Array.isArray(parsedServers) ? parsedServers : [] });
	} catch (err: any) {
		console.error('[API_BRANCHES] Error:', err.message);
		return json({ error: err.message }, { status: 500 });
	}
};
