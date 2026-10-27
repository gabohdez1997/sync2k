// src/routes/dashboard/purchases/margins/+page.server.ts
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { logAction } from '$lib/server/audit';
import { supabaseAdmin } from '$lib/server/supabase';

export const load: PageServerLoad = protectLoad('pur_margins', async ({ url, locals, fetch }) => {
    const profile = locals.profile;
    const allowedBranches = profile?.allowed_branches || [];

    // Si profile no tiene allowed_branches cargadas, buscar branches activas en Supabase
    let branches = allowedBranches;
    if (!branches || branches.length === 0) {
        const { data: dbBranches } = await supabaseAdmin
            .from('branches')
            .select('id, name, agent_url, agent_token, active')
            .eq('active', true)
            .order('name');
        branches = dbBranches || [];
    }

    const selectedBranchId = url.searchParams.get('branch_id') || profile?.branch_id || branches[0]?.id || null;
    const selectedBranch = branches.find((b: any) => b.id === selectedBranchId) || branches[0] || null;

    let marginsSummary: any[] = [];
    let loadError: string | null = null;

    if (selectedBranch && selectedBranch.agent_url) {
        try {
            const client = new AgentClient(
                {
                    slug: selectedBranch.id,
                    agent_url: selectedBranch.agent_url,
                    agent_api_key: selectedBranch.agent_token
                },
                profile || undefined,
                fetch
            );

            const res = await client.request<any[]>('/margenes/resumen');
            if (res && res.success && Array.isArray(res.data)) {
                marginsSummary = res.data;
            } else {
                loadError = res?.message || 'No se pudo obtener el resumen de márgenes del agente.';
            }
        } catch (err: any) {
            console.error('[PUR_MARGINS] Error al consultar márgenes:', err.message);
            loadError = `Error de conexión con el agente: ${err.message}`;
        }
    } else if (selectedBranch && !selectedBranch.agent_url) {
        loadError = 'La sucursal seleccionada no tiene una URL de agente local configurada.';
    }

    return {
        branches,
        selectedBranchId,
        selectedBranch,
        marginsSummary,
        loadError,
        crud: profile?.permissions?.pur_margins || { create: true, update: true, delete: true }
    };
});

export const actions: Actions = {
    updateMargins: protectAction('pur_margins', async ({ request, locals, fetch }) => {
        const formData = await request.formData();
        const branchId = (formData.get('branch_id') as string)?.trim();
        const updatesJson = formData.get('updates') as string;
        const updateMargenes = formData.get('update_margenes') === 'true';
        const updatePrecios = formData.get('update_precios') === 'true';
        const filterOldMargin = formData.get('filter_old_margin') === 'true';

        if (!branchId) {
            return fail(400, { error: 'Debe especificar la sucursal de destino.' });
        }

        if (!updateMargenes && !updatePrecios) {
            return fail(400, { error: 'Debe seleccionar al menos una operación: actualizar márgenes o recalcular precios.' });
        }

        let updates: any[] = [];
        try {
            if (updatesJson) updates = JSON.parse(updatesJson);
        } catch (e) {
            return fail(400, { error: 'Formato de actualización inválido.' });
        }

        if (!Array.isArray(updates) || updates.length === 0) {
            return fail(400, { error: 'No se enviaron tipos de precio para actualizar.' });
        }

        // Buscar información de conexión de la sede
        const profile = locals.profile;
        const allowedBranches = profile?.allowed_branches || [];
        let branch = allowedBranches.find((b: any) => b.id === branchId);

        if (!branch) {
            const { data: dbBranch } = await supabaseAdmin
                .from('branches')
                .select('id, name, agent_url, agent_token')
                .eq('id', branchId)
                .single();
            branch = dbBranch;
        }

        if (!branch || !branch.agent_url) {
            return fail(404, { error: 'La sucursal no existe o no tiene agente configurado.' });
        }

        try {
            const client = new AgentClient(
                {
                    slug: branch.id,
                    agent_url: branch.agent_url,
                    agent_api_key: branch.agent_token
                },
                profile || undefined,
                fetch
            );

            const payload = {
                sede_id: branch.id,
                updates,
                update_margenes: updateMargenes,
                update_precios: updatePrecios,
                filter_old_margin: filterOldMargin
            };

            const response = await client.request<any>('/margenes/actualizar-masivo', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (!response || !response.success) {
                return fail(500, { error: response?.message || 'Error desconocido retornado por el agente.' });
            }

            // Registrar auditoría de la operación masiva
            await logAction({
                uid: profile?.id ?? null,
                user_email: profile?.email ?? 'system',
                action: 'UPDATE',
                module: 'pur_margins',
                record_id: branch.id,
                branch_id: branch.id,
                new_data: {
                    operation: 'ACTUALIZACION_MASIVA_MARGENES',
                    branch_name: branch.name,
                    updates_requested: updates,
                    update_margenes: updateMargenes,
                    update_precios: updatePrecios,
                    filter_old_margin: filterOldMargin,
                    result_summary: response.data
                },
                source: 'cloud'
            });

            return {
                success: true,
                message: response.message || 'Actualización masiva completada con éxito.',
                result: response.data
            };

        } catch (err: any) {
            console.error('[PUR_MARGINS_ACTION] Error en ejecución:', err);
            return fail(500, { error: `Fallo al comunicarse con el agente local: ${err.message}` });
        }
    })
};
