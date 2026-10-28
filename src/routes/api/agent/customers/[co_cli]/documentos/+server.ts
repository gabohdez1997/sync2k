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
				const docNums = enrichedData.map((d: any) => `'${d.nro_doc.trim().replace(/'/g, "''")}'`).join(',');
				const sqlQuery = `
					SELECT RTRIM(cdr.co_tipo_doc) AS co_tipo_doc,
					       RTRIM(cdr.nro_doc) AS nro_doc,
					       SUM(ISNULL(cdr.monto_retencion_iva, 0)) AS ya_reten_iva_bs,
					       SUM(ISNULL(cdr.monto_retencion, 0)) AS ya_reten_islr_bs,
					       MAX(CASE WHEN UPPER(RTRIM(dv.co_tipo_doc)) IN ('IVAN', 'IVAP') THEN COALESCE(NULLIF(RTRIM(dv.num_comprobante), ''), RTRIM(dv.nro_doc), '') ELSE '' END) AS nro_comp_iva,
					       MAX(CASE WHEN UPPER(RTRIM(dv.co_tipo_doc)) = 'ISLR' THEN COALESCE(NULLIF(RTRIM(dv.num_comprobante), ''), RTRIM(dv.nro_doc), '') ELSE '' END) AS nro_comp_islr
					FROM saCobroDocReng cdr
					INNER JOIN saCobro c ON cdr.cob_num = c.cob_num
					LEFT JOIN saDocumentoVenta dv ON dv.doc_orig = 'COBRO' AND LTRIM(RTRIM(dv.nro_orig)) = LTRIM(RTRIM(c.cob_num))
					WHERE c.anulado = 0 AND LTRIM(RTRIM(cdr.nro_doc)) IN (${docNums})
					GROUP BY cdr.co_tipo_doc, cdr.nro_doc
				`;
				const retRes = await agentClient.request<any>('/query', {
					method: 'POST',
					body: JSON.stringify({ query: sqlQuery })
				});
				const retList = retRes.data || [];
				const retMap = new Map();
				retList.forEach((r: any) => retMap.set(`${r.co_tipo_doc?.trim()}:${r.nro_doc?.trim()}`, r));

				enrichedData = enrichedData.map((inv: any) => {
					const ret = retMap.get(`${inv.co_tipo_doc?.trim()}:${inv.nro_doc?.trim()}`);
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

		// Respaldo de origen fiscal para N/CR si el agente aún no devuelve num_doc_orig
		const ncrMissingOrig = enrichedData.filter(
			(d: any) => ['N/CR', 'NCR'].includes((d.co_tipo_doc || '').trim().toUpperCase()) && d.num_doc_orig === undefined
		);
		if (ncrMissingOrig.length > 0) {
			try {
				const ncrNums = ncrMissingOrig.map((d: any) => `'${d.nro_doc.trim().replace(/'/g, "''")}'`).join(',');
				const origQuery = `
					SELECT RTRIM(d.nro_doc) AS nro_doc,
					       RTRIM(ISNULL(d.co_sucu_in, '')) AS co_sucu_in,
					       RTRIM(ISNULL(d.doc_orig, '')) AS doc_orig,
					       RTRIM(ISNULL(d.nro_orig, '')) AS nro_orig,
					       COALESCE(NULLIF(RTRIM(d.impfisfac), ''), RTRIM(ISNULL(d.impfis, ''))) AS impfisfac,
					       orig_doc.num_doc_orig,
					       orig_doc.tipo_doc_orig,
					       orig_meta.n_control_orig,
					       orig_meta.monto_imp_orig,
					       orig_meta.co_sucu_in_orig,
					       orig_meta.impfisfac_orig
					FROM saDocumentoVenta d
					OUTER APPLY (
						SELECT TOP 1
							LTRIM(RTRIM(r_orig.num_doc)) AS num_doc_orig,
							ISNULL(NULLIF(LTRIM(RTRIM(r_orig.tipo_doc)), ''), 'FACT') AS tipo_doc_orig
						FROM saDevolucionCliente dc
						INNER JOIN saDevolucionClienteReng r_orig ON dc.doc_num = r_orig.doc_num
						WHERE dc.anulado = 0
						  AND (
							  (UPPER(RTRIM(d.doc_orig)) = 'DEVO' AND dc.doc_num = d.nro_orig)
							  OR dc.nro_doc = d.nro_doc
						  )
						  AND NULLIF(LTRIM(RTRIM(r_orig.num_doc)), '') IS NOT NULL
						ORDER BY r_orig.reng_num ASC
					) devo_orig
					OUTER APPLY (
						SELECT
							COALESCE(
								devo_orig.num_doc_orig,
								CASE WHEN UPPER(RTRIM(d.doc_orig)) IN ('FACT', 'N/DB', 'NDEB')
									 THEN NULLIF(LTRIM(RTRIM(d.nro_orig)), '')
									 ELSE NULL
								END
							) AS num_doc_orig,
							COALESCE(
								devo_orig.tipo_doc_orig,
								CASE WHEN UPPER(RTRIM(d.doc_orig)) IN ('FACT', 'N/DB', 'NDEB')
									 THEN NULLIF(LTRIM(RTRIM(d.doc_orig)), '')
									 ELSE NULL
								END
							) AS tipo_doc_orig
					) orig_doc
					OUTER APPLY (
						SELECT TOP 1
							COALESCE(NULLIF(RTRIM(dv_orig.n_control), ''), RTRIM(ISNULL(fv_orig.n_control, ''))) AS n_control_orig,
							COALESCE(fv_orig.monto_imp, dv_orig.monto_imp, 0) AS monto_imp_orig,
							COALESCE(NULLIF(RTRIM(fv_orig.co_sucu_in), ''), RTRIM(ISNULL(dv_orig.co_sucu_in, ''))) AS co_sucu_in_orig,
							COALESCE(
								NULLIF(RTRIM(fv_orig.impfisfac), ''),
								NULLIF(RTRIM(fv_orig.impfis), ''),
								NULLIF(RTRIM(dv_orig.impfisfac), ''),
								RTRIM(ISNULL(dv_orig.impfis, ''))
							) AS impfisfac_orig
						FROM saDocumentoVenta dv_orig
						LEFT JOIN saFacturaVenta fv_orig
							ON orig_doc.tipo_doc_orig = 'FACT'
						   AND fv_orig.doc_num = orig_doc.num_doc_orig
						WHERE orig_doc.num_doc_orig IS NOT NULL
						  AND dv_orig.co_tipo_doc = orig_doc.tipo_doc_orig
						  AND dv_orig.nro_doc = orig_doc.num_doc_orig
					) orig_meta
					WHERE UPPER(LTRIM(RTRIM(d.co_tipo_doc))) IN ('N/CR', 'NCR')
					  AND LTRIM(RTRIM(d.nro_doc)) IN (${ncrNums})
				`;
				const origRes = await agentClient.request<any>('/query', {
					method: 'POST',
					body: JSON.stringify({ query: origQuery })
				});
				const origMap = new Map();
				(origRes.data || []).forEach((r: any) => origMap.set(r.nro_doc?.trim(), r));

				enrichedData = enrichedData.map((doc: any) => {
					if (!['N/CR', 'NCR'].includes((doc.co_tipo_doc || '').trim().toUpperCase())) return doc;
					const info = origMap.get(doc.nro_doc?.trim());
					return info ? { ...doc, ...info } : doc;
				});
			} catch (errOrig: any) {
				console.error(`[API CUSTOMER DOCUMENTS] Error querying NCR origin for ${co_cli}:`, errOrig.message);
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
