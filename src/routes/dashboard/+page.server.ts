// src/routes/dashboard/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	try {
		const profile = (locals as any).profile;
		if (!profile) throw new Error('Perfil no cargado.');

		const allowedBranches = profile.allowed_branches || [];
		
		if (allowedBranches.length === 0) {
			return {
				tasa_bcv: null,
				error: 'No tienes sucursales asignadas.'
			};
		}

		// Seleccionar la primera sucursal para leer la tasa
		const selectedBranch = allowedBranches[0];

		if (!selectedBranch || !selectedBranch.agent_url) {
			return {
				tasa_bcv: null,
				error: 'Sucursal no configurada correctamente.'
			};
		}

		// Inicializar AgentClient
		const agentClient = new AgentClient({
			slug: selectedBranch.id,
			agent_url: selectedBranch.agent_url,
			agent_api_key: selectedBranch.agent_token
		}, profile);

		let tasa_bcv = null;

		try {
			const tasaRes = await agentClient.request<any>('/catalogos/tasa');
			const data = (tasaRes as any).data || (Array.isArray(tasaRes) ? tasaRes : []);
            if (data.length > 0) {
                tasa_bcv = data[0].tasa; // Viene del agente 'tasa' u ojear como 'tasa_v'
            }
		} catch (e) {
			console.error("[Dashboard] Error leyendo tasa BCV", e);
		}

		return {
			tasa_bcv,
            profile,
            branchName: selectedBranch.name
		};

	} catch (error) {
		console.error("Dashboard Server Load Error:", error);
		return {
			tasa_bcv: null,
			error: 'Ocurrió un error al cargar ' + error
		};
	}
};
