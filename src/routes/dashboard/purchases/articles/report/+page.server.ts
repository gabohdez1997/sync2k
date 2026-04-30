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

        const urlBranchId = url.searchParams.get('branch_id') || '';
        const isAllBranches = !urlBranchId;

        // Determinar qué sucursales consultar
        const branchesToQuery = isAllBranches 
            ? allowedBranches.filter(b => b.agent_url)
            : [allowedBranches.find(b => b.id === urlBranchId)].filter(b => b?.agent_url);

        if (branchesToQuery.length === 0) {
            return { articles: [], branch: null, error: 'Sucursal sin Agente o no encontrada.' };
        }

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
            limit: '10000',
            search, linea, categoria, cost_type, in_stock, solo_pendientes
        });
        // Solo enviar ids si hay selección real
        if (ids) params.set('ids', ids);

        let articles: any[] = [];
        let lineas: any[] = [];
        let categorias: any[] = [];

        try {
            // Consultar catálogos del primer agente disponible
            const firstAgent = new AgentClient({
                slug: branchesToQuery[0].id,
                agent_url: branchesToQuery[0].agent_url,
                agent_api_key: branchesToQuery[0].agent_token
            }, userProfile || undefined, fetch);

            const [linRes, catRes] = await Promise.all([
                firstAgent.request<any>('/catalogos/lineas').catch(() => ({ data: [] })),
                firstAgent.request<any>('/catalogos/categorias').catch(() => ({ data: [] }))
            ]);

            lineas = (linRes as any).data || (linRes as any).items || (Array.isArray(linRes) ? linRes : []);
            categorias = (catRes as any).data || (catRes as any).items || (Array.isArray(catRes) ? catRes : []);

            // Consultar artículos de cada sucursal en paralelo
            const branchResults = await Promise.all(
                branchesToQuery.map(async (br) => {
                    try {
                        const agent = new AgentClient({
                            slug: br.id,
                            agent_url: br.agent_url,
                            agent_api_key: br.agent_token
                        }, userProfile || undefined, fetch);

                        const artRes = await agent.request<any>(`/compras/articulos?${params.toString()}`);
                        const arts = (artRes.data || []).map((art: any) => {
                            const totalSede = (art.disponibilidad || []).reduce((acc: number, alm: any) => acc + (Number(alm.stock) || 0), 0);
                            return {
                                ...art,
                                _branch_id: br.id,
                                _branch_name: br.name,
                                stock_sede: totalSede
                            };
                        });
                        return arts;
                    } catch (e) {
                        console.error(`[ARTICLES REPORT] Error fetching from ${br.name}:`, e);
                        return [];
                    }
                })
            );

            // Concatenar artículos (si es una sucursal será un solo array, si son varias se juntan)
            articles = branchResults.flat();

        } catch (e) {
            console.error('[PURCHASES ARTICLES REPORT] Fetch error:', e);
        }

        const { data: settingsData } = await supabaseAdmin.from('settings').select('*').single();

        return {
            articles,
            branch: isAllBranches ? { name: 'Todas las Sucursales' } : branchesToQuery[0],
            isAllBranches,
            catalogs: { lineas, categorias },
            filters: { search, linea, categoria, cost_type, in_stock, solo_pendientes, ids },
            settings: settingsData || {}
        };
    } catch (e: any) {
        return { error: `Error interno: ${e.message}`, articles: [], branches: [] };
    }
});
