// src/routes/api/agent/tasa/+server.ts
import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, fetch }) => {
	try {
		const profile = locals.profile;
		if (!profile) return json({ error: 'Sesión no válida' }, { status: 401 });

		const allowedBranches = profile.allowed_branches || [];
		if (allowedBranches.length === 0) {
			return json({ error: 'No sucursales autorizadas' }, { status: 403 });
		}

		// Usar la primera sucursal activa
		const branch = allowedBranches[0];
		if (!branch.agent_url) {
			return json({ error: 'Sucursal no configurada' }, { status: 400 });
		}

		const agentClient = new AgentClient({
			slug: branch.id,
			agent_url: branch.agent_url,
			agent_api_key: branch.agent_token
		}, profile, fetch);

		const tasaRes = await agentClient.request<any>('/catalogos/tasa');
		const data = (tasaRes as any).data || (Array.isArray(tasaRes) ? tasaRes : []);
		
		let tasa = null;
		if (data.length > 0) {
			tasa = data[0].tasa;
		}

		return json({ success: true, tasa });
	} catch (e: any) {
		console.error('[API TASA] Error:', e.message);
		return json({ error: e.message }, { status: 500 });
	}
};
