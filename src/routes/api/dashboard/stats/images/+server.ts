import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { json } from '@sveltejs/kit';

export const GET = async ({ request, locals }) => {
	try {
		const userProfile = (locals as any).profile;
		const { data: dbBranches, error: branchErr } = await supabaseAdmin
			.from('branches')
			.select('id, name, agent_url, agent_token, profit_branch_codes, active')
			.eq('active', true);

		if (branchErr || !dbBranches || dbBranches.length === 0) {
			return json({ success: false, error: 'No branches found' }, { status: 400 });
		}

		let totalItems = 0;
		let totalWithImage = 0;
		let successfulBranches = 0;

		const query = "SELECT COUNT(*) as total, SUM(CASE WHEN LTRIM(RTRIM(ISNULL(campo7, ''))) != '' THEN 1 ELSE 0 END) as con_img FROM saArticulo WHERE anulado = 0";

		for (const b of dbBranches) {
			try {
				let result = null;

				const agentClient = new AgentClient(
					{
						slug: b.id,
						agent_url: b.agent_url,
						agent_api_key: b.agent_token
					},
					{
						profit_user: userProfile?.profit_user,
						profit_pass: userProfile?.profit_pass
					}
				);

				try {
					console.log(`[STATS] Querying: ${b.agent_url}/query`);
					const res = await agentClient.request<any>('/query', {
						method: 'POST',
						body: JSON.stringify({ query }),
						signal: AbortSignal.timeout(5000)
					});
					
					// La respuesta puede venir envuelta en .data o directo
					const data = res.data || res;
					result = Array.isArray(data) ? data[0] : data;
					
				} catch (err: any) {
					console.log(`[STATS] /query failed for ${b.name}: ${err.message}, trying /sql...`);
					// Fallback a /sql
					const resSql = await agentClient.request<any>('/sql', {
						method: 'POST',
						body: JSON.stringify({ query }),
						signal: AbortSignal.timeout(5000)
					});
					
					const data = resSql.data || resSql;
					result = Array.isArray(data) ? data[0] : data;
				}

				if (result) {
					totalItems += Number(result.total || 0);
					totalWithImage += Number(result.con_img || 0);
					successfulBranches++;
				}
			} catch (err) {
				console.error(`Error querying branch ${b.name}:`, err);
			}
		}

		// Promediar por sedes (dividir dinámicamente)
		if (successfulBranches > 0) {
			totalItems = Math.round(totalItems / successfulBranches);
			totalWithImage = Math.round(totalWithImage / successfulBranches);
		}

		return json({
			success: true,
			data: {
				total: totalItems,
				withImage: totalWithImage,
				branchesAveraged: successfulBranches
			}
		});

	} catch (e: any) {
		return json({ success: false, error: e.message }, { status: 500 });
	}
};
