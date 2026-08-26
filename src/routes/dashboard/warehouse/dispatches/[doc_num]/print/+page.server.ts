// src/routes/dashboard/warehouse/dispatches/[doc_num]/print/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('inv_dispatches', async ({ params, url, locals, fetch }) => {
    const { doc_num } = params;
    const branchId = url.searchParams.get('branch_id');

    if (!doc_num || !branchId) {
        throw error(400, 'Faltan parámetros de documento o sucursal.');
    }

    try {
        // 1. Obtener datos de la sucursal desde Supabase
        const { data: branch, error: branchErr } = await supabaseAdmin
            .from('branches')
            .select('*')
            .eq('id', branchId)
            .single();

        if (branchErr || !branch) {
            throw error(404, 'No se encontró la configuración de la sucursal.');
        }

        // 2. Obtener datos de la nota de despacho desde el Agente
        const agentClient = new AgentClient(branch, locals.profile || undefined, fetch);
        const res = await agentClient.getDispatch(doc_num);
        
        if (!res.success || !res.data) {
            throw error(404, 'No se pudo obtener el detalle de la nota de despacho desde el agente.');
        }

        const dispatch = Array.isArray(res.data) ? res.data[0] : res.data;

        // 3. Enriquecer con datos del cliente si falta algo
        if (dispatch && dispatch.co_cli) {
            try {
                const cliRes = await agentClient.getCustomer(dispatch.co_cli.trim());
                if (cliRes.success && cliRes.data) {
                    const cliData = Array.isArray(cliRes.data) ? cliRes.data[0] : cliRes.data;
                    dispatch.cli_dir = cliData.direc1 || cliData.direc2 || dispatch.cli_dir;
                    dispatch.telefonos = cliData.telefonos || dispatch.telefonos;
                    dispatch.email = cliData.email || dispatch.email;
                }
            } catch (e) {
                console.warn('[PRINT-DISPATCH] Warning fetching extra customer data:', e);
            }
        }

        // 4. Buscar nombres de Usuario Despachador (co_us_in) y Editor (co_us_mo) en Supabase profiles
        let creatorName = '';
        let editorName = '';

        const creatorUser = (dispatch.co_us_in || '').trim();
        const editorUser = (dispatch.co_us_mo || '').trim();

        const usersToFetch = Array.from(new Set([creatorUser, editorUser].filter(Boolean)));

        if (usersToFetch.length > 0) {
            try {
                const { data: profiles } = await supabaseAdmin
                    .from('profiles')
                    .select('full_name, profit_user');

                const profileMap = new Map<string, string>();
                (profiles || []).forEach((p: any) => {
                    if (p.profit_user && p.full_name) {
                        profileMap.set(p.profit_user.trim().toUpperCase(), p.full_name);
                    }
                });

                if (creatorUser) {
                    creatorName = profileMap.get(creatorUser.toUpperCase()) || creatorUser;
                }
                if (editorUser && editorUser.toUpperCase() !== creatorUser.toUpperCase()) {
                    editorName = profileMap.get(editorUser.toUpperCase()) || editorUser;
                }
            } catch (e) {
                console.warn('[PRINT-DISPATCH] Warning looking up user profiles:', e);
                creatorName = creatorUser;
                if (editorUser && editorUser.toUpperCase() !== creatorUser.toUpperCase()) {
                    editorName = editorUser;
                }
            }
        }

        dispatch.creator_name = creatorName;
        dispatch.despachador_name = creatorName;
        dispatch.editor_name = editorName;
        dispatch.has_editor = !!editorName;

        // 5. Ajustes de la app
        const { data: settings } = await supabaseAdmin
            .from('app_settings')
            .select('*')
            .single();

        return {
            title: `Despacho ${doc_num}`,
            dispatch,
            branch,
            settings
        };
    } catch (err: any) {
        console.error('[PRINT DISPATCH LOAD] Error:', err);
        throw error(500, err.message || 'Error interno cargando formato de despacho.');
    }
});
