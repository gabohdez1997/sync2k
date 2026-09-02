// src/routes/dashboard/reports/vendor-performance/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('reports_vendor_performance', async ({ locals, url, depends, fetch }) => {
    depends('app:vendor_performance');

    const profile = (locals as any).profile;
    if (!profile) throw new Error('Perfil no cargado.');

    let startDate = url.searchParams.get('startDate');
    let endDate = url.searchParams.get('endDate');
    let branchId = url.searchParams.get('branch_id') || '';
    let coVen = url.searchParams.get('co_ven') || '';

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
            startDate, endDate, branchId, coVen,
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
            startDate, endDate, branchId, coVen,
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
        const venParam = coVen ? `&co_ven=${encodeURIComponent(coVen)}` : '';
        const response = await agentClient.request<any>(
            `/rendimiento-vendedores?sede=${branchId}&startDate=${startDate}&endDate=${endDate}${venParam}`,
            { method: 'GET' }
        );

        if (response && response.success) {
            return {
                startDate,
                endDate,
                branchId,
                selectedBranch,
                selectedCoVen: coVen,
                branches: allowedBranches,
                tipoAgrupacion: response.tipoAgrupacion || 'mensual',
                totales: response.totales || { facturas: 0, devoluciones: 0, docs_exitosos: 0, cotizaciones: 0, pedidos: 0 },
                timeline: response.timeline || response.mensual || [],
                mensual: response.timeline || response.mensual || [],
                periodosComparativa: response.periodosComparativa || [],
                vendedoresTimeline: response.vendedoresTimeline || [],
                vendedores: response.vendedores || [],
                rankingVendedores: response.rankingVendedores || [],
                rankingArtPedidos: response.rankingArtPedidos || [],
                rankingArtCotizados: response.rankingArtCotizados || [],
                rankingCobrosUsd: response.rankingCobrosUsd || [],
                rankingCobrosBs: response.rankingCobrosBs || [],
                totalArticulosActivos: response.totalArticulosActivos || 0,
                totalArticulosDistintosGlobal: response.totalArticulosDistintosGlobal || 0,
                totalArtPedidosGlobal: response.totalArtPedidosGlobal || 0,
                totalArtCotizadosGlobal: response.totalArtCotizadosGlobal || 0,
                totalCobrosUsdGlobal: response.totalCobrosUsdGlobal || 0,
                totalCobrosBsUsdGlobal: response.totalCobrosBsUsdGlobal || 0,
                totalCobrosBsGlobal: response.totalCobrosBsGlobal || 0
            };
        } else {
            return {
                startDate, endDate, branchId, selectedCoVen: coVen,
                selectedBranch,
                branches: allowedBranches,
                error: response?.message || 'Error al obtener rendimiento de vendedores del agente.'
            };
        }
    } catch (e: any) {
        console.error('[Vendor Performance Load]', e);
        return {
            startDate, endDate, branchId, selectedCoVen: coVen,
            branches: allowedBranches,
            error: 'Error comunicándose con el Agente Profit: ' + e.message
        };
    }
});
