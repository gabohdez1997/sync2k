// src/routes/dashboard/reports/article-stock/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('reports_article_stock', async ({ url, locals, fetch }) => {
    const profile = (locals as any).profile;
    if (!profile) throw new Error('Perfil no cargado.');

    try {
        const allowedBranches = profile.allowed_branches || [];
        if (allowedBranches.length === 0) {
            return { 
                report: { data: [] }, 
                branches: [], 
                catalogs: { lineas: [], sublineas: [], categorias: [] },
                error: 'No tienes sucursales asignadas.' 
            };
        }

        // Agrupar agentes únicos para consultar todas las sedes disponibles
        const agentMap = new Map<string, any>();
        for (const b of allowedBranches) {
            if (b.agent_url) {
                const normalized = b.agent_url.replace(/\/+$/, '');
                if (!agentMap.has(normalized)) {
                    agentMap.set(normalized, b);
                }
            }
        }

        const distinctAgents = Array.from(agentMap.values());
        if (distinctAgents.length === 0) {
            return { 
                report: { data: [] }, 
                branches: allowedBranches, 
                catalogs: { lineas: [], sublineas: [], categorias: [] },
                error: 'Ninguna sucursal asignada tiene agente configurado.' 
            };
        }

        const primaryBranch = distinctAgents[0];
        const primaryClient = new AgentClient({
            slug: primaryBranch.id, 
            agent_url: primaryBranch.agent_url, 
            agent_api_key: primaryBranch.agent_token
        }, profile, fetch);

        const search = url.searchParams.get('search') || '';
        const co_lin = url.searchParams.get('linea') || '';
        const co_subl = url.searchParams.get('sublinea') || '';
        const co_cat = url.searchParams.get('categoria') || '';
        const estatus = url.searchParams.get('estatus') || '';
        const stock_status = url.searchParams.get('stock') || '';

        const query = new URLSearchParams();
        if (search) query.set('search', search);
        if (co_lin && co_lin !== 'all') query.set('co_lin', co_lin);
        if (co_subl && co_subl !== 'all') query.set('co_subl', co_subl);
        if (co_cat && co_cat !== 'all') query.set('co_cat', co_cat);
        if (estatus && estatus !== 'all') query.set('estatus', estatus);
        if (stock_status && stock_status !== 'all') query.set('stock_status', stock_status);
        query.set('sede', 'all');

        console.log(`[ARTICLE STOCK REPORT SERVER] Consultando reporte consolidado de todas las sedes...`);
        
        // Catálogos desde el agente principal
        const [linRes, sublRes, catRes] = await Promise.all([
            primaryClient.request<any>('/catalogos/lineas').catch(() => ({ data: [] })),
            primaryClient.request<any>('/catalogos/sublineas').catch(() => ({ data: [] })),
            primaryClient.request<any>('/catalogos/categorias').catch(() => ({ data: [] }))
        ]);

        const lineas = (linRes as any).data || (linRes as any).items || (Array.isArray(linRes) ? linRes : []);
        const sublineas = (sublRes as any).data || (sublRes as any).items || (Array.isArray(sublRes) ? sublRes : []);
        const categorias = (catRes as any).data || (catRes as any).items || (Array.isArray(catRes) ? catRes : []);

        // Consultar agentes para todas las sedes
        const reportPromises = distinctAgents.map(async (branch) => {
            const client = new AgentClient({
                slug: branch.id,
                agent_url: branch.agent_url,
                agent_api_key: branch.agent_token
            }, profile, fetch);
            return client.request<any>(`/reportes/articulos-stock?${query.toString()}`);
        });

        const reportResponses = await Promise.allSettled(reportPromises);

        // Consolidación de artículos en caso de existir agentes distribuidos
        const mergedArticles = new Map<string, any>();

        for (const res of reportResponses) {
            if (res.status === 'fulfilled' && res.value && res.value.success && Array.isArray(res.value.data)) {
                for (const item of res.value.data) {
                    if (!mergedArticles.has(item.co_art)) {
                        mergedArticles.set(item.co_art, {
                            ...item,
                            sedes: { ...(item.sedes || {}) },
                            almacenes: [...(item.almacenes || [])]
                        });
                    } else {
                        const existing = mergedArticles.get(item.co_art);
                        // Fusionar sedes
                        if (item.sedes) {
                            existing.sedes = { ...existing.sedes, ...item.sedes };
                        }
                        // Fusionar almacenes
                        if (item.almacenes && item.almacenes.length > 0) {
                            existing.almacenes.push(...item.almacenes);
                        }
                        existing.stock_total_act = (existing.stock_total_act || 0) + (item.stock_total_act || 0);
                        existing.stock_total_com = (existing.stock_total_com || 0) + (item.stock_total_com || 0);
                        existing.stock_total = (existing.stock_total || 0) + (item.stock_total || 0);
                    }
                }
            }
        }

        const finalData = Array.from(mergedArticles.values());

        return {
            report: {
                success: true,
                count: finalData.length,
                data: finalData
            },
            branches: allowedBranches,
            catalogs: { lineas, sublineas, categorias }
        };

    } catch (err: any) {
        console.error("[ARTICLE STOCK REPORT SERVER LOAD ERROR]:", err);
        return { 
            report: { data: [] }, 
            branches: [], 
            catalogs: { lineas: [], sublineas: [], categorias: [] },
            error: 'Error de servidor: ' + err.message 
        };
    }
});
