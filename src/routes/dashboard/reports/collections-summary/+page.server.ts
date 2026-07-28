// src/routes/dashboard/reports/collections-summary/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('reports_collections_summary', async ({ url, locals, fetch }) => {
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

        const fecha = url.searchParams.get('fecha') || '';

        const query = new URLSearchParams();
        if (fecha) {
            query.set('fecha', fecha); // Nuevo agente
            query.set('fecha_desde', fecha); // Agente viejo fallback
            query.set('fecha_hasta', fecha); // Agente viejo fallback
        }
        
        query.set('sede', selectedBranch.id);

        console.log(`[COLLECTIONS SUMMARY REPORT SERVER] Requesting from agent branch ${selectedBranch.name}...`);
        
        // Fetch from agent
        const reportRes = await agentClient.request<any>(`/reportes/resumen-cobros?${query.toString()}`);

        if (!reportRes || !reportRes.success) {
            return {
                report: { data: [] },
                branches: allowedBranches,
                selectedBranchId: selectedBranch.id,
                error: reportRes?.message || 'Error al obtener reporte del agente local.'
            };
        }

        // Fetch profiles from Supabase to merge names
        const { data: profiles, error: pErr } = await supabaseAdmin
            .from('profiles')
            .select('profit_user, full_name');
            
        if (pErr) {
            console.error('[COLLECTIONS SUMMARY] Error fetching profiles:', pErr);
        }

        const profileMap = new Map();
        if (profiles) {
            profiles.forEach(p => {
                if (p.profit_user) {
                    profileMap.set(p.profit_user.trim().toUpperCase(), p.full_name);
                }
            });
        }

        // Merge names into report data
        const enrichedData = reportRes.data.map((row: any) => {
            const userId = row.usuario ? row.usuario.trim().toUpperCase() : '';
            return {
                ...row,
                usuario_nombre: profileMap.get(userId) || userId || 'Desconocido'
            };
        });

        return {
            report: { 
                success: true, 
                data: enrichedData,
                tasa_dia: reportRes.tasa_dia || 1
            },
            branches: allowedBranches,
            selectedBranchId: selectedBranch.id
        };

    } catch (err: any) {
        console.error("[COLLECTIONS SUMMARY REPORT SERVER LOAD ERROR]:", err);
        return { 
            report: { data: [] }, 
            branches: [], 
            error: 'Error de servidor: ' + err.message 
        };
    }
});
