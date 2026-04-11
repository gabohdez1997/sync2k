// src/routes/dashboard/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const profile = (locals as any).profile;
		if (!profile) throw new Error('Perfil no cargado.');

		const allowedBranches = profile.allowed_branches || [];
		
		return {
            profile,
            branchName: allowedBranches.length > 0 ? allowedBranches[0].name : 'Sin sucursal',
            hasBranches: allowedBranches.length > 0
		};

	} catch (error) {
		console.error("Dashboard Server Load Error:", error);
		return {
			error: 'Ocurrió un error al cargar ' + error
		};
	}
};
