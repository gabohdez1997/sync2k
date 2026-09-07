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
    let coSucu = url.searchParams.get('co_sucu') || '';
    let tab = url.searchParams.get('tab') || '';

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
            startDate, endDate, branchId, coVen, coSucu, tab,
            branches: [],
            sucursales: [],
            error: 'No tienes sucursales asignadas.'
        };
    }

    // Seleccionar sucursal
    let selectedBranch = branchId
        ? allowedBranches.find((b: any) => b.id === branchId)
        : allowedBranches[0];

    if (!selectedBranch || !selectedBranch.agent_url) {
        return {
            startDate, endDate, branchId, coVen, coSucu, tab,
            branches: allowedBranches,
            sucursales: [],
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
        const sucuParam = coSucu ? `&co_sucu=${encodeURIComponent(coSucu)}` : '';
        const response = await agentClient.request<any>(
            `/rendimiento-vendedores?sede=${branchId}&startDate=${startDate}&endDate=${endDate}${venParam}${sucuParam}`,
            { method: 'GET' }
        );

        if (response && response.success) {
            return {
                startDate,
                endDate,
                branchId,
                selectedBranch,
                selectedCoVen: coVen,
                selectedCoSucu: coSucu,
                activeTab: tab,
                branches: allowedBranches,
                sucursales: response.sucursales || [],
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
                rankingFacturadoUsd: response.rankingFacturadoUsd || [],
                totalArticulosActivos: response.totalArticulosActivos || 0,
                totalArticulosDistintosGlobal: response.totalArticulosDistintosGlobal || 0,
                totalArtPedidosGlobal: response.totalArtPedidosGlobal || 0,
                totalArtCotizadosGlobal: response.totalArtCotizadosGlobal || 0,
                totalCobrosUsdGlobal: response.totalCobrosUsdGlobal || 0,
                totalCobrosBsUsdGlobal: response.totalCobrosBsUsdGlobal || 0,
                totalCobrosBsGlobal: response.totalCobrosBsGlobal || 0,
                totalFacturadoUsdGlobal: response.totalFacturadoUsdGlobal || 0
            };
        } else {
            return {
                startDate, endDate, branchId, selectedCoVen: coVen, selectedCoSucu: coSucu, activeTab: tab,
                selectedBranch,
                branches: allowedBranches,
                sucursales: [],
                error: response?.message || 'Error al obtener rendimiento de vendedores del agente.'
            };
        }
    } catch (e: any) {
        console.error('[Vendor Performance Load]', e);
        return {
            startDate, endDate, branchId, selectedCoVen: coVen, selectedCoSucu: coSucu, activeTab: tab,
            branches: allowedBranches,
            sucursales: [],
            error: 'Error comunicándose con el Agente Profit: ' + e.message
        };
    }
});
