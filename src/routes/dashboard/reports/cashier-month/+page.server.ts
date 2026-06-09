import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('reports_cashier_month', async ({ url, locals, fetch }) => {
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

        // Get filter month, default to current month
        const today = new Date();
        const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const month = url.searchParams.get('month') || defaultMonth;

        const query = new URLSearchParams();
        query.set('month', month);
        if (urlBranchId && urlBranchId !== 'all') {
            query.set('sede', urlBranchId);
        }

        console.log(`[CASHIER MONTH SERVER] Solicitando reporte a sucursal ${selectedBranch.name} con mes: ${month}...`);
        const response = await agentClient.request<any>(`/reportes/cajero-mes?${query.toString()}`);

        if (!response || !response.success) {
            return {
                report: { data: [] },
                branches: allowedBranches,
                selectedBranchId: urlBranchId || 'all',
                selectedMonth: month,
                error: response?.message || 'Error al obtener reporte del agente local.'
            };
        }

        return {
            report: response,
            branches: allowedBranches,
            selectedBranchId: urlBranchId || 'all',
            selectedMonth: month
        };

    } catch (err: any) {
        console.error("[CASHIER MONTH SERVER LOAD ERROR]:", err);
        return { 
            report: { data: [] }, 
            branches: [], 
            error: 'Error de servidor: ' + err.message 
        };
    }
});
