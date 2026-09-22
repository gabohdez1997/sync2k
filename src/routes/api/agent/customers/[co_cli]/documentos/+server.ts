// src/routes/api/agent/customers/[co_cli]/documentos/+server.ts
import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, locals, fetch }) => {
	try {
		const profile = locals.profile;
		if (!profile) return json({ error: 'Sesión no válida' }, { status: 401 });

		const { co_cli } = params;
		if (!co_cli) {
			return json({ error: 'Código de cliente obligatorio' }, { status: 400 });
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

		const endpoint = `/clientes/${encodeURIComponent(co_cli)}/documentos`;
		const resData = await agentClient.request<any>(endpoint);

		let enrichedData = resData.data || (Array.isArray(resData) ? resData : []);

		if (enrichedData.length > 0 && enrichedData[0].ya_reten_iva_bs === undefined) {
			try {
				const docNums = enrichedData.map((d: any) => `'${d.nro_doc.trim()}'`).join(',');
				const sqlQuery = `
					SELECT RTRIM(cdr.nro_doc) AS nro_doc,
					       SUM(ISNULL(cdr.monto_retencion_iva, 0)) AS ya_reten_iva_bs,
					       SUM(ISNULL(cdr.monto_retencion, 0)) AS ya_reten_islr_bs,
					       MAX(CASE WHEN UPPER(RTRIM(dv.co_tipo_doc)) = 'IVAN' THEN COALESCE(NULLIF(RTRIM(dv.num_comprobante), ''), RTRIM(dv.nro_doc), '') ELSE '' END) AS nro_comp_iva,
					       MAX(CASE WHEN UPPER(RTRIM(dv.co_tipo_doc)) = 'ISLR' THEN COALESCE(NULLIF(RTRIM(dv.num_comprobante), ''), RTRIM(dv.nro_doc), '') ELSE '' END) AS nro_comp_islr
					FROM saCobroDocReng cdr
					INNER JOIN saCobro c ON cdr.cob_num = c.cob_num
					LEFT JOIN saDocumentoVenta dv ON dv.doc_orig = 'COBRO' AND LTRIM(RTRIM(dv.nro_orig)) = LTRIM(RTRIM(c.cob_num))
					WHERE c.anulado = 0 AND LTRIM(RTRIM(cdr.nro_doc)) IN (${docNums})
					GROUP BY cdr.nro_doc
				`;
				const retRes = await agentClient.request<any>('/query', {
					method: 'POST',
					body: { query: sqlQuery }
				});
				const retList = retRes.data || [];
				const retMap = new Map();
				retList.forEach((r: any) => retMap.set(r.nro_doc?.trim(), r));

				enrichedData = enrichedData.map((inv: any) => {
					const ret = retMap.get(inv.nro_doc.trim());
					return {
						...inv,
						ya_reten_iva_bs: ret ? Number(ret.ya_reten_iva_bs) : 0,
						ya_reten_islr_bs: ret ? Number(ret.ya_reten_islr_bs) : 0,
						nro_comp_iva: ret ? (ret.nro_comp_iva || '') : '',
						nro_comp_islr: ret ? (ret.nro_comp_islr || '') : ''
					};
				});
			} catch (errQuery: any) {
				console.error(`[API CUSTOMER DOCUMENTS] Error querying retentions for ${co_cli}:`, errQuery.message);
			}
		}

		return json({
			success: resData.success !== false,
			data: enrichedData
		});
	} catch (e: any) {
		console.error(`[API CUSTOMER DOCUMENTS] Error para ${params.co_cli}:`, e.message);
		return json({ error: e.message }, { status: 500 });
	}
};
