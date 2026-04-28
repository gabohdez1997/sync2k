import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sec_articles', async ({ url, locals, fetch }) => {
    try {
        const userProfile = (locals as any).profile;

        // 1. CARGAR SUCURSALES
        let allBranches: any[] = [];
        const { data: dbBranches, error: dbError } = await supabaseAdmin
            .from('branches')
            .select('id, name, agent_url, agent_token, active, sort_order')
            .eq('active', true)
            .order('sort_order');

        if (dbBranches) {
            allBranches = dbBranches.map(b => ({
                id: b.id, name: b.name, agent_url: b.agent_url, agent_token: b.agent_token
            }));
        }

        const profileAllowed = userProfile?.allowed_branches || [];
        const profileBranchIds: string[] = Array.isArray(profileAllowed) 
            ? profileAllowed.map((b: any) => (typeof b === 'object' ? b.id : b))
            : [];
        
        const isAdmin = profileBranchIds.length === 0;
        const allowedBranches = isAdmin ? allBranches : allBranches.filter(b => profileBranchIds.includes(b.id));

        if (allowedBranches.length === 0) return { articles: [], branches: [], error: 'No tienes sucursales autorizadas.' };

        const urlBranchId = url.searchParams.get('branch_id');
        const branchId = (urlBranchId && allowedBranches.some(b => b.id === urlBranchId)) ? urlBranchId : (allowedBranches[0]?.id || '');
        const selectedBranchObj = allowedBranches.find(b => b.id === branchId);

        if (!selectedBranchObj?.agent_url) return { articles: [], branches: allowedBranches, error: 'Sucursal sin Agente.' };

        const agentClient = new AgentClient({
            slug: selectedBranchObj.id,
            agent_url: selectedBranchObj.agent_url,
            agent_api_key: selectedBranchObj.agent_token
        }, userProfile || undefined, fetch);

        // 3. PARÁMETROS
        const page = parseInt(url.searchParams.get('page') || '1', 10);
        const search = (url.searchParams.get('search') || '').trim();
        const linea = (url.searchParams.get('linea') || '').trim();
        const categoria = (url.searchParams.get('categoria') || '').trim();
        const cost_type = url.searchParams.get('cost_type') || 'all';
        const in_stock = url.searchParams.get('in_stock') || 'all';
        const solo_pendientes = url.searchParams.get('solo_pendientes') || 'all';

        const params = new URLSearchParams({
            page: page.toString(),
            limit: '12',
            search, linea, categoria, cost_type, in_stock, solo_pendientes
        });

        // 4. CARGA PARALELA
        let articles: any[] = [];
        let pagination = { total: 0, page, limit: 12, totalPages: 0 };
        let lineas: any[] = [];
        let categorias: any[] = [];

        try {
            const [artRes, linRes, catRes] = await Promise.all([
                agentClient.request<any>(`/compras/articulos?${params.toString()}`),
                agentClient.request<any>('/catalogos/lineas').catch(() => ({ data: [] })),
                agentClient.request<any>('/catalogos/categorias').catch(() => ({ data: [] }))
            ]);

            articles = artRes.data || [];
            pagination = artRes.pagination || { total: articles.length, page, limit: 12, totalPages: 1 };
            
            // CONSOLIDAR STOCK POR SUCURSAL
            articles = articles.map(art => {
                const totalSede = (art.disponibilidad || []).reduce((acc: number, alm: any) => acc + (Number(alm.stock) || 0), 0);
                return {
                    ...art,
                    // Reemplazamos la lista de almacenes por una lista de sucursales consolidadas
                    existencia_consolidada: [
                        { nombre: selectedBranchObj.name, stock: totalSede }
                    ]
                };
            });

            lineas = (linRes as any).data || (linRes as any).items || (Array.isArray(linRes) ? linRes : []);
            categorias = (catRes as any).data || (catRes as any).items || (Array.isArray(catRes) ? catRes : []);

        } catch (e) {
            console.error('[PURCHASES ARTICLES] Fetch error:', e);
        }

        return {
            articles,
            branches: allowedBranches,
            catalogs: { lineas, categorias },
            pagination,
            crud: userProfile?.permissions?.['sec_articles'] || { read: true },
            selectedBranchId: branchId
        };

    } catch (e: any) {
        return { articles: [], branches: [], error: `Error: ${e.message}` };
    }
});
