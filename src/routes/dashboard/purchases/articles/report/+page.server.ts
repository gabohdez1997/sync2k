import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_articles', async ({ url, locals, fetch }) => {
    try {
        const userProfile = (locals as any).profile;

        // 1. CARGAR SUCURSALES
        let allBranches: any[] = [];
        const { data: dbBranches } = await supabaseAdmin
            .from('branches')
            .select('id, name, agent_url, agent_token, active, sort_order, business_name, rif, address, phone, logo_url')
            .eq('active', true)
            .order('sort_order');

        if (dbBranches) {
            allBranches = dbBranches;
        }

        const profileAllowed = userProfile?.allowed_branches || [];
        const profileBranchIds: string[] = Array.isArray(profileAllowed) 
            ? profileAllowed.map((b: any) => (typeof b === 'object' ? b.id : b))
            : [];
        
        const isAdmin = profileBranchIds.length === 0;
        const allowedBranches = isAdmin ? allBranches : allBranches.filter(b => profileBranchIds.includes(b.id));

        if (allowedBranches.length === 0) return { articles: [], error: 'No tienes sucursales autorizadas.' };

        const urlBranchId = url.searchParams.get('branch_id');
        const branchId = (urlBranchId && allowedBranches.some(b => b.id === urlBranchId)) ? urlBranchId : (allowedBranches[0]?.id || '');
        const selectedBranchObj = allowedBranches.find(b => b.id === branchId);

        if (!selectedBranchObj?.agent_url) return { articles: [], branch: selectedBranchObj, error: 'Sucursal sin Agente.' };

        const agentClient = new AgentClient({
            slug: selectedBranchObj.id,
            agent_url: selectedBranchObj.agent_url,
            agent_api_key: selectedBranchObj.agent_token
        }, userProfile || undefined, fetch);

        // 3. PARÁMETROS
        const search = (url.searchParams.get('search') || '').trim();
        const linea = (url.searchParams.get('linea') || '').trim();
        const categoria = (url.searchParams.get('categoria') || '').trim();
        const cost_type = url.searchParams.get('cost_type') || 'all';
        const in_stock = url.searchParams.get('in_stock') || 'all';
        const solo_pendientes = url.searchParams.get('solo_pendientes') || 'all';
        const ids = url.searchParams.get('ids') || '';

        const params = new URLSearchParams({
            page: '1',
            limit: '5000',
            search, linea, categoria, cost_type, in_stock, solo_pendientes
        });
        // Solo enviar ids si hay selección real
        if (ids) params.set('ids', ids);

        let articles: any[] = [];
        let lineas: any[] = [];
        let categorias: any[] = [];

        try {
            const [artRes, linRes, catRes] = await Promise.all([
                agentClient.request<any>(`/compras/articulos?${params.toString()}`),
                agentClient.request<any>('/catalogos/lineas').catch(() => ({ data: [] })),
                agentClient.request<any>('/catalogos/categorias').catch(() => ({ data: [] }))
            ]);

            articles = artRes.data || [];
            
            // CONSOLIDAR STOCK POR SUCURSAL
            articles = articles.map(art => {
                const totalSede = (art.disponibilidad || []).reduce((acc: number, alm: any) => acc + (Number(alm.stock) || 0), 0);
                return {
                    ...art,
                    stock_sede: totalSede
                };
            });

            lineas = (linRes as any).data || (linRes as any).items || (Array.isArray(linRes) ? linRes : []);
            categorias = (catRes as any).data || (catRes as any).items || (Array.isArray(catRes) ? catRes : []);

        } catch (e) {
            console.error('[PURCHASES ARTICLES REPORT] Fetch error:', e);
        }

        const { data: settingsData } = await supabaseAdmin.from('settings').select('*').single();

        return {
            articles,
            branch: selectedBranchObj,
            catalogs: { lineas, categorias },
            filters: { search, linea, categoria, cost_type, in_stock, solo_pendientes, ids },
            settings: settingsData || {}
        };
    } catch (e: any) {
        return { error: `Error interno: ${e.message}`, articles: [], branches: [] };
    }
});
