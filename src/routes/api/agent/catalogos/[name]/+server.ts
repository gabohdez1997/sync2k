// src/routes/api/agent/catalogos/[name]/+server.ts
import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import type { RequestHandler } from './$types';

const ALLOWED_CATALOGS = ['cajas', 'cuentas_bancarias', 'bancos', 'tarjetas_credito'];

export const GET: RequestHandler = async ({ params, url, locals, fetch }) => {
	try {
		const profile = locals.profile;
		if (!profile) return json({ error: 'Sesión no válida' }, { status: 401 });

		const { name } = params;
		if (!name || !ALLOWED_CATALOGS.includes(name)) {
			return json({ error: 'Catálogo no permitido o inválido' }, { status: 400 });
		}

		const branchId = url.searchParams.get('branch_id');
		const allowedBranches = profile.allowed_branches || [];
		const branch = allowedBranches.find(b => b.id === branchId) || allowedBranches[0];

		if (!branch || !branch.agent_url) {
			return json({ error: 'Sucursal no configurada o autorizada' }, { status: 400 });
		}

		const agentClient = new AgentClient({
			slug: branch.id,
			agent_url: branch.agent_url,
			agent_api_key: branch.agent_token
		}, profile, fetch);

		const endpoint = `/catalogos/${name}`;
		const resData = await agentClient.request<any>(endpoint);

		return json({
			success: resData.success !== false,
			data: resData.data || (Array.isArray(resData) ? resData : [])
		});
	} catch (e: any) {
		console.error(`[API CATALOGOS ${params.name}] Error:`, e.message);
		return json({ error: e.message }, { status: 500 });
	}
};
