// src/routes/dashboard/reports/article-prices/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('reports_article_prices', async ({ url, locals, fetch }) => {
    const profile = (locals as any).profile;
    if (!profile) throw new Error('Perfil no cargado.');

    try {
        const allowedBranches = profile.allowed_branches || [];
        if (allowedBranches.length === 0) {
            return { 
                report: { data: [] }, 
                branches: [], 
                error: 'No tienes sucursales asignadas.' 
            };
        }

        const urlBranchId = url.searchParams.get('branch_id');
        const selectedBranch = urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : allowedBranches[0];

        if (!selectedBranch || !selectedBranch.agent_url) {
            return { 
                report: { data: [] }, 
                branches: allowedBranches, 
                error: 'La sucursal seleccionada no tiene agente configurado.' 
            };
        }

        const agentClient = new AgentClient({
            slug: selectedBranch.id, 
            agent_url: selectedBranch.agent_url, 
            agent_api_key: selectedBranch.agent_token
        }, profile, fetch);

        const search = url.searchParams.get('search') || '';
        const co_lin = url.searchParams.get('linea') || '';
        const co_subl = url.searchParams.get('sublinea') || '';
        const co_cat = url.searchParams.get('categoria') || '';

        const query = new URLSearchParams();
        if (search) query.set('search', search);
        if (co_lin && co_lin !== 'all') query.set('co_lin', co_lin);
        if (co_subl && co_subl !== 'all') query.set('co_subl', co_subl);
        if (co_cat && co_cat !== 'all') query.set('co_cat', co_cat);
        query.set('sede', selectedBranch.id);

        console.log(`[ARTICLE PRICES REPORT SERVER] Requesting from agent branch ${selectedBranch.name}...`);
        
        // Fetch catalogs for filters from the agent
        const [linRes, sublRes, catRes, reportRes] = await Promise.all([
            agentClient.request<any>('/catalogos/lineas').catch(() => ({ data: [] })),
            agentClient.request<any>('/catalogos/sublineas').catch(() => ({ data: [] })),
            agentClient.request<any>('/catalogos/categorias').catch(() => ({ data: [] })),
            agentClient.request<any>(`/reportes/articulos-precios?${query.toString()}`)
        ]);

        const lineas = (linRes as any).data || (linRes as any).items || (Array.isArray(linRes) ? linRes : []);
        const sublineas = (sublRes as any).data || (sublRes as any).items || (Array.isArray(sublRes) ? sublRes : []);
        const categorias = (catRes as any).data || (catRes as any).items || (Array.isArray(catRes) ? catRes : []);

        if (!reportRes || !reportRes.success) {
            return {
                report: { data: [] },
                branches: allowedBranches,
                catalogs: { lineas, sublineas, categorias },
                selectedBranchId: selectedBranch.id,
                error: reportRes?.message || 'Error al obtener reporte del agente local.'
            };
        }

        return {
            report: reportRes,
            branches: allowedBranches,
            catalogs: { lineas, sublineas, categorias },
            selectedBranchId: selectedBranch.id
        };

    } catch (err: any) {
        console.error("[ARTICLE PRICES REPORT SERVER LOAD ERROR]:", err);
        return { 
            report: { data: [] }, 
            branches: [], 
            error: 'Error de servidor: ' + err.message 
        };
    }
});
