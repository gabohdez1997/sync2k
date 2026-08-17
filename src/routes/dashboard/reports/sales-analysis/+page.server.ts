// src/routes/dashboard/reports/sales-analysis/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('reports_sales_analysis', async ({ locals, url, depends, fetch }) => {
    depends('app:sales_analysis');

    const profile = (locals as any).profile;
    if (!profile) throw new Error('Perfil no cargado.');

    let startDate = url.searchParams.get('startDate');
    let endDate = url.searchParams.get('endDate');
    let branchId = url.searchParams.get('branch_id') || '';

    // Por defecto: últimos 30 días
    if (!startDate || !endDate) {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        startDate = start.toISOString().split('T')[0];
        endDate = end.toISOString().split('T')[0];
    }

    const allowedBranches = profile.allowed_branches || [];
    if (allowedBranches.length === 0) {
        return {
            startDate, endDate, branchId,
            branches: [],
            error: 'No tienes sucursales asignadas.'
        };
    }

    // Seleccionar sucursal
    let selectedBranch = branchId
        ? allowedBranches.find((b: any) => b.id === branchId)
        : allowedBranches[0];

    if (!selectedBranch || !selectedBranch.agent_url) {
        return {
            startDate, endDate, branchId,
            branches: allowedBranches,
            error: 'La sucursal seleccionada no tiene agente configurado.'
        };
    }

    branchId = selectedBranch.id;

    const agentClient = new AgentClient(
        {
            slug: selectedBranch.id,
            agent_url: selectedBranch.agent_url,
            agent_api_key: selectedBranch.agent_token
        },
        profile,
        fetch
    );

    try {
        const [response, lineasRes, sublineasRes, catsRes] = await Promise.all([
            agentClient.request<any>(
                `/analisis-ventas?sede=${branchId}&startDate=${startDate}&endDate=${endDate}`,
                { method: 'GET' }
            ),
            agentClient.request<any>('/catalogos/lineas').catch(() => ({ data: [] })),
            agentClient.request<any>('/catalogos/sublineas').catch(() => ({ data: [] })),
            agentClient.request<any>('/catalogos/categorias').catch(() => ({ data: [] }))
        ]);

        const lineas = (lineasRes as any).data || (lineasRes as any).items || (Array.isArray(lineasRes) ? lineasRes : []);
        const sublineas = (sublineasRes as any).data || (sublineasRes as any).items || (Array.isArray(sublineasRes) ? sublineasRes : []);
        const categorias = (catsRes as any).data || (catsRes as any).items || (Array.isArray(catsRes) ? catsRes : []);

        if (response && response.success) {
            return {
                startDate,
                endDate,
                branchId,
                selectedBranch,
                selectedBranchConfig: selectedBranch,
                branches: allowedBranches,
                analysisData: response.data || [],
                kpis: response.kpis,
                businessDays: response.businessDays,
                catalogs: {
                    lineas,
                    sublineas,
                    categorias
                }
            };
        } else {
            return {
                startDate, endDate, branchId,
                selectedBranch,
                selectedBranchConfig: selectedBranch,
                branches: allowedBranches,
                catalogs: { lineas, sublineas, categorias },
                error: response?.message || 'Error al obtener análisis de ventas del agente.'
            };
        }
    } catch (e: any) {
        console.error('[Sales Analysis Load]', e);
        return {
            startDate, endDate, branchId,
            branches: allowedBranches,
            catalogs: { lineas: [], sublineas: [], categorias: [] },
            error: 'Error comunicándose con el Agente Profit: ' + e.message
        };
    }
});
