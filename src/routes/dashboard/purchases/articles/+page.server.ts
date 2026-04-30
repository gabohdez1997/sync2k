import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { fail } from '@sveltejs/kit';
import { logAction } from '$lib/server/audit';
import type { PageServerLoad, Actions } from './$types';

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

        const urlBranchId = url.searchParams.get('branch_id') || '';
        const isAllBranches = !urlBranchId;

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

        let articles: any[] = [];
        let pagination = { total: 0, page, limit: 12, totalPages: 0 };
        let lineas: any[] = [];
        let categorias: any[] = [];

        // Determinar qué sucursales consultar
        const branchesToQuery = isAllBranches 
            ? allowedBranches.filter(b => b.agent_url)
            : [allowedBranches.find(b => b.id === urlBranchId)].filter(b => b?.agent_url);

        if (branchesToQuery.length === 0) {
            return { articles: [], branches: allowedBranches, error: 'Sucursal sin Agente.' };
        }

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
                                existencia_consolidada: [{ nombre: br.name, stock: totalSede }]
                            };
                        });
                        return { arts, pagination: artRes.pagination };
                    } catch (e) {
                        console.error(`[ARTICLES] Error fetching from ${br.name}:`, e);
                        return { arts: [], pagination: null };
                    }
                })
            );

            if (isAllBranches) {
                // Multi-sucursal: una card por artículo+sucursal
                articles = branchResults.flatMap(r => r.arts);
                // Paginación local: total = suma, pero como el agente ya pagina, solo concatenamos
                const totalAll = branchResults.reduce((s, r) => s + (r.pagination?.total || 0), 0);
                pagination = { total: totalAll, page, limit: 12 * branchesToQuery.length, totalPages: Math.max(...branchResults.map(r => r.pagination?.totalPages || 1)) };
            } else {
                // Sucursal única (comportamiento original)
                articles = branchResults[0]?.arts || [];
                pagination = branchResults[0]?.pagination || { total: articles.length, page, limit: 12, totalPages: 1 };
            }

        } catch (e) {
            console.error('[PURCHASES ARTICLES] Fetch error:', e);
        }

        return {
            articles,
            branches: allowedBranches,
            catalogs: { lineas, categorias },
            pagination,
            crud: userProfile?.permissions?.pur_articles || { create: true, update: true, delete: true },
            selectedBranchId: urlBranchId,
            isAllBranches
        };

    } catch (e: any) {
        return { error: `Error interno: ${e.message}`, articles: [], branches: [] };
    }
});

export const actions: Actions = {
    deleteArticle: protectAction('pur_articles', async ({ request, locals, fetch }) => {
        const formData = await request.formData();
        const co_art = formData.get('co_art')?.toString();
        
        if (!co_art) return fail(400, { deleteError: 'Artículo no especificado' });

        const { data: dbBranches } = await supabaseAdmin.from('branches').select('*').eq('active', true);
        if (!dbBranches || dbBranches.length === 0) return fail(500, { deleteError: 'Error cargando sucursales' });

        const userProfile = (locals as any).profile;
        let errors: string[] = [];
        let successCount = 0;

        for (const branch of dbBranches) {
            if (!branch.agent_url) continue;
            
            const agentClient = new AgentClient({
                slug: branch.id,
                agent_url: branch.agent_url,
                agent_api_key: branch.agent_token
            }, userProfile || undefined, fetch);

            try {
                const res = await agentClient.request(`/articulos/${encodeURIComponent(co_art)}`, { method: 'DELETE' });
                if ((res as any).success === false) {
                    errors.push(`[${branch.name}] ${(res as any).message || 'Error'}`);
                } else {
                    successCount++;
                }
            } catch (err: any) {
                errors.push(`[${branch.name}] Fallo: ${err.message}`);
            }
        }

        if (successCount === 0) {
            return fail(500, { deleteError: 'Fallo al eliminar en todas las sedes:\n' + errors.join('\n') });
        }

        await logAction({
            uid: userProfile?.id ?? null,
            user_email: userProfile?.email ?? 'system',
            action: 'DELETE',
            module: 'pur_articles',
            record_id: co_art,
            branch_id: 'BROADCAST',
            new_data: { co_art },
            source: 'cloud'
        });

        return { success: true, message: 'Artículo eliminado exitosamente de todas las sedes.' };
    })
};
