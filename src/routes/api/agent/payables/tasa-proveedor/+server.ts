import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { hasPermission } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	try {
		const profile = locals.profile;
		if (!profile) return json({ success: false, message: 'Sesión no válida' }, { status: 401 });

		if (!hasPermission(profile, 'reports_payables', 'update')) {
			return json({ success: false, message: 'No tienes permiso para editar tasas en cuentas por pagar.' }, { status: 403 });
		}

		const body = await request.json();
		const { co_tipo_doc, nro_doc, tasa, sede_id } = body;

		if (!co_tipo_doc || !nro_doc || !sede_id) {
			return json({ success: false, message: 'Faltan parámetros requeridos.' }, { status: 400 });
		}

		// 1. Obtener la configuración de la sucursal desde Supabase
		const { data: branch, error: branchErr } = await supabaseAdmin
			.from('branches')
			.select('*')
			.eq('id', sede_id)
			.single();

		if (branchErr || !branch || !branch.agent_url) {
			return json({ success: false, message: 'Sucursal no encontrada o no configurada.' }, { status: 400 });
		}

		// 2. Crear cliente del agente
		const agentClient = new AgentClient({
			slug: branch.id,
			agent_url: branch.agent_url,
			agent_api_key: branch.agent_token
		}, profile, fetch);

		// 3. Petición POST al agente
		const response = await agentClient.request<any>('/reportes/cxp/tasa-proveedor', {
			method: 'POST',
			body: JSON.stringify({ co_tipo_doc, nro_doc, tasa, sede_id })
		});

		if (!response || !response.success) {
			return json({ success: false, message: response?.message || 'Error en el agente local.' }, { status: 500 });
		}

		return json({ success: true, data: response.data });
	} catch (e: any) {
		console.error('[API TASA PROVEEDOR PROXY] Error:', e.message);
		return json({ success: false, message: e.message }, { status: 500 });
	}
};
