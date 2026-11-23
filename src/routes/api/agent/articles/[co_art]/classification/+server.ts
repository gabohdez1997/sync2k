import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { hasPermission } from '$lib/server/auth';
import { logAction } from '$lib/server/audit';
import type { RequestHandler } from './$types';

const VALID_TIPOS = ['V', 'S', 'C'] as const;
const VALID_TAX_CODES = ['1', '2', '3', '4', '5', '6', '7'] as const;

export const PATCH: RequestHandler = async ({ params, request, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) {
		return json({ success: false, message: 'Sesión no válida.' }, { status: 401 });
	}
	if (!hasPermission(profile, 'pur_articles', 'update')) {
		return json({ success: false, message: 'Sin permisos para modificar artículos.' }, { status: 403 });
	}

	const coArt = String(params.co_art || '').trim();
	if (!coArt) {
		return json({ success: false, message: 'El código de artículo es obligatorio.' }, { status: 400 });
	}

	let body: { tipo?: string; tipo_imp?: string };
	try {
		body = await request.json();
	} catch {
		return json({ success: false, message: 'Cuerpo JSON inválido.' }, { status: 400 });
	}

	const payload: { tipo?: string; tipo_imp?: string } = {};

	if (body.tipo !== undefined) {
		const normTipo = String(body.tipo).trim().toUpperCase();
		if (!VALID_TIPOS.includes(normTipo as any)) {
			return json({ success: false, message: 'Tipo inválido. Valores permitidos: V, S, C.' }, { status: 400 });
		}
		payload.tipo = normTipo;
	}

	if (body.tipo_imp !== undefined) {
		const normImp = String(body.tipo_imp).trim();
		if (!VALID_TAX_CODES.includes(normImp as any)) {
			return json({ success: false, message: 'Código de impuesto inválido. Valores permitidos: 1..7.' }, { status: 400 });
		}
		payload.tipo_imp = normImp;
	}

	if (!payload.tipo && !payload.tipo_imp) {
		return json({ success: false, message: 'Debe indicar al menos tipo o tipo_imp para actualizar.' }, { status: 400 });
	}

	const { data: dbBranches, error: branchErr } = await supabaseAdmin
		.from('branches')
		.select('id, name, agent_url, agent_token, active')
		.eq('active', true);

	if (branchErr || !dbBranches || dbBranches.length === 0) {
		return json({ success: false, message: 'No hay sucursales activas configuradas.' }, { status: 500 });
	}

	const errors: string[] = [];
	let successCount = 0;

	for (const branch of dbBranches) {
		if (!branch.agent_url) continue;

		const agentClient = new AgentClient({
			slug: branch.id,
			agent_url: branch.agent_url,
			agent_api_key: branch.agent_token
		}, profile, fetch);

		try {
			const res = await agentClient.request<any>(
				`/articulos/${encodeURIComponent(coArt)}/clasificacion`,
				{
					method: 'PATCH',
					body: JSON.stringify(payload)
				}
			);

			if ((res as any)?.success === false) {
				errors.push(`[${branch.name}] ${(res as any).message || 'Error al actualizar'}`);
			} else {
				successCount++;
				await logAction({
					uid: profile.id ?? null,
					user_email: profile.email ?? 'system',
					action: 'UPDATE',
					module: 'pur_articles',
					record_id: coArt,
					branch_id: branch.id,
					new_data: payload,
					source: 'cloud'
				});
			}
		} catch (err: any) {
			errors.push(`[${branch.name}] ${err.message || 'Fallo de conexión'}`);
		}
	}

	if (successCount === 0) {
		return json(
			{ success: false, message: 'Fallo al actualizar clasificación:\n' + errors.join('\n') },
			{ status: 500 }
		);
	}

	return json({
		success: true,
		data: { co_art: coArt, ...payload },
		synced_branches: successCount,
		warnings: errors
	});
};

