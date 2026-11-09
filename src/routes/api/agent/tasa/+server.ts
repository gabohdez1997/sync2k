// src/routes/api/agent/tasa/+server.ts
import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import type { RequestHandler } from './$types';

interface CachedRate {
	tasa: number | null;
	history: any[];
	expiresAt: number;
	branchId?: string;
}

let cachedRate: CachedRate | null = null;

export const GET: RequestHandler = async ({ url, locals, fetch }) => {
	try {
		const profile = locals.profile;
		if (!profile) return json({ error: 'Sesión no válida' }, { status: 401 });

		const branchId = url.searchParams.get('branch_id');
		const targetFecha = url.searchParams.get('fecha');

		// Retornar caché en memoria si está vigente para la tasa actual general
		if (!targetFecha && cachedRate && cachedRate.expiresAt > Date.now() && (!branchId || cachedRate.branchId === branchId)) {
			return json({ success: true, tasa: cachedRate.tasa, history: cachedRate.history, cached: true });
		}

		const allowedBranches = profile.allowed_branches || [];
		const primaryBranch = branchId ? allowedBranches.find(b => b.id === branchId) : null;
		const candidateBranches = primaryBranch ? [primaryBranch] : allowedBranches;

		if (candidateBranches.length === 0) {
			return json({ error: 'Sucursales no configuradas' }, { status: 400 });
		}

		for (const branch of candidateBranches) {
			if (!branch || !branch.agent_url) continue;

			try {
				const agentClient = new AgentClient({
					slug: branch.id,
					agent_url: branch.agent_url,
					agent_api_key: branch.agent_token
				}, profile, fetch);

				if (targetFecha) {
					const cleanDate = targetFecha.split('T')[0].trim();
					const tasaRes = await agentClient.request<any>(`/catalogos/tasa?fecha=${encodeURIComponent(cleanDate)}`);
					const data = (tasaRes as any)?.data || (Array.isArray(tasaRes) ? tasaRes : []);
					const record = data.length > 0 ? data[0] : null;
					return json({
						success: true,
						tasa: record && record.tasa != null ? Number(record.tasa) : null,
						fecha_str: record ? record.fecha_str : null,
						fecha: record ? record.fecha : null,
						es_exacta: record ? Boolean(record.es_exacta) : false,
						fechaConsultada: cleanDate
					});
				}

				const [tasaRes, historyRes] = await Promise.all([
					agentClient.request<any>('/catalogos/tasa').catch(() => null),
					agentClient.request<any>('/catalogos/tasa/history?limit=7').catch(() => null)
				]);

				const data = (tasaRes as any)?.data || (Array.isArray(tasaRes) ? tasaRes : []);
				let tasa = null;
				if (data.length > 0 && data[0].tasa) {
					tasa = Number(data[0].tasa);
				}

				const rawHistory = (historyRes as any)?.data || (Array.isArray(historyRes) ? historyRes : []);
				const seenDates = new Set();
				const history = rawHistory
					.filter((item: any) => {
						const key = item.fecha_str || (item.fecha ? String(item.fecha).split('T')[0] : '');
						if (!key || seenDates.has(key)) return false;
						seenDates.add(key);
						return true;
					})
					.sort((a: any, b: any) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

				if (tasa !== null) {
					cachedRate = {
						tasa,
						history,
						expiresAt: Date.now() + 60_000, // 60 segundos de caché
						branchId: branchId || undefined
					};

					return json({ success: true, tasa, history });
				}
			} catch (e: any) {
				console.warn(`[API TASA] Falló intento con sucursal ${branch.name}:`, e.message);
				continue;
			}
		}

		// Si fallaron todas las ramas y teníamos una tasa previa en caché vencida, usarla como salvavidas
		if (cachedRate && cachedRate.tasa !== null) {
			return json({ success: true, tasa: cachedRate.tasa, history: cachedRate.history, stale: true });
		}

		return json({ error: 'No se pudo obtener la tasa desde ninguna sucursal activa' }, { status: 502 });
	} catch (e: any) {
		console.error('[API TASA] Error crítico:', e.message);
		return json({ error: e.message }, { status: 500 });
	}
};
