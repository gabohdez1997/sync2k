// src/routes/api/agent/tasa/+server.ts
import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, fetch }) => {
	try {
		const profile = locals.profile;
		if (!profile) return json({ error: 'Sesión no válida' }, { status: 401 });

		const branchId = url.searchParams.get('branch_id');
		const allowedBranches = profile.allowed_branches || [];
		const branch = allowedBranches.find(b => b.id === branchId) || allowedBranches[0];

		if (!branch || !branch.agent_url) {
			return json({ error: 'Sucursal no configurada' }, { status: 400 });
		}

		const agentClient = new AgentClient({
			slug: branch.id,
			agent_url: branch.agent_url,
			agent_api_key: branch.agent_token
		}, profile, fetch);

		const targetFecha = url.searchParams.get('fecha');
		if (targetFecha) {
			const tasaRes = await agentClient.request<any>(`/catalogos/tasa?fecha=${encodeURIComponent(targetFecha)}`).catch((err) => {
				console.error('[API TASA BY DATE] Error:', err.message);
				return null;
			});
			const data = (tasaRes as any)?.data || (Array.isArray(tasaRes) ? tasaRes : []);
			const record = data.length > 0 ? data[0] : null;
			return json({
				success: true,
				tasa: record ? record.tasa : null,
				fecha_str: record ? record.fecha_str : null,
				fecha: record ? record.fecha : null,
				es_exacta: record ? Boolean(record.es_exacta) : false,
				fechaConsultada: targetFecha
			});
		}

		const [tasaRes, historyRes] = await Promise.all([
			agentClient.request<any>('/catalogos/tasa').catch((err) => {
				console.error('[API TASA] Error fetching current rate:', err.message);
				return null;
			}),
			agentClient.request<any>('/catalogos/tasa/history?limit=7').catch((err) => {
				console.error('[API TASA] Error fetching rate history:', err.message);
				return null;
			})
		]);

		const data = (tasaRes as any)?.data || (Array.isArray(tasaRes) ? tasaRes : []);
		
		let tasa = null;
		if (data.length > 0) {
			tasa = data[0].tasa;
		}

		const rawHistory = (historyRes as any)?.data || (Array.isArray(historyRes) ? historyRes : []);
		
		// Deduplicar por fecha_str y ordenar cronológicamente (antiguo -> reciente)
		const seenDates = new Set();
		const history = rawHistory
			.filter((item: any) => {
				const key = item.fecha_str || (item.fecha ? String(item.fecha).split('T')[0] : '');
				if (!key || seenDates.has(key)) return false;
				seenDates.add(key);
				return true;
			})
			.sort((a: any, b: any) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

		return json({ success: true, tasa, history });
	} catch (e: any) {
		console.error('[API TASA] Error:', e.message);
		return json({ error: e.message }, { status: 500 });
	}
};
