// src/routes/dashboard/warehouse/dispatches/[doc_num]/print/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('inv_dispatches', async ({ params, url, locals, fetch }) => {
    const { doc_num } = params;
    const branchId = url.searchParams.get('branch_id');

    if (!doc_num) {
        throw error(400, 'Falta el número de documento de nota de despacho.');
    }

    try {
        // 1. Obtener datos de la sucursal: priorizar allowed_branches del perfil, luego Supabase y local DB
        const allowedBranches = locals.profile?.allowed_branches || [];
        let branch = allowedBranches.find(
            (b: any) => b.id === branchId || b.profit_server_id === branchId || b.name === branchId
        );

        if (!branch && branchId) {
            try {
                const { data, error: branchErr } = await supabaseAdmin
                    .from('branches')
                    .select('*')
                    .eq('id', branchId)
                    .single();
                if (!branchErr && data) branch = data;
            } catch (e) {
                console.warn('[PRINT-DISPATCH] Supabase branch query warning:', e);
            }
        }

        if (!branch && branchId) {
            try {
                const { queryLocalDb } = await import('$lib/server/local-db');
                const res = await queryLocalDb('SELECT * FROM branches WHERE id = $1 OR profit_server_id = $1', [branchId]);
                if (res.rows.length > 0) branch = res.rows[0];
            } catch (e) {
                console.warn('[PRINT-DISPATCH] Local DB branch query warning:', e);
            }
        }

        // Fallback a la primera sucursal autorizada si no se encontró por ID
        if (!branch && allowedBranches.length > 0) {
            branch = allowedBranches[0];
        }

        if (!branch) {
            throw error(404, 'No se encontró la configuración de la sucursal.');
        }

        // 2. Obtener datos de la nota de despacho desde el Agente
        const agentClient = new AgentClient({ slug: branch.id, ...branch } as any, locals.profile || undefined, fetch);
        const res = await agentClient.getDispatch(doc_num, branch.profit_server_id || branch.id);
        
        if (!res.success || !res.data) {
            throw error(404, res?.message || 'No se pudo obtener el detalle de la nota de despacho desde el agente.');
        }

        const rawData = res.data;
        let dispatch: any = null;
        if (Array.isArray(rawData)) {
            dispatch = rawData.find((item: any) => item && !item.error && (item.doc_num || item.renglones)) || rawData[0];
        } else {
            dispatch = rawData;
        }

        if (!dispatch || dispatch.error) {
            throw error(404, dispatch?.error || 'No se encontró la nota de despacho solicitada.');
        }

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

        // 4. Buscar nombres de Usuario Despachador (co_us_in) y Editor (co_us_mo) en Supabase profiles o Profit Plus
        const creatorUser = (dispatch.co_us_in || '').trim();
        const editorUser = (dispatch.co_us_mo || '').trim();
        let creatorName = dispatch.despachador_name || creatorUser;
        let editorName = dispatch.editor_name || editorUser;

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
                    creatorName = profileMap.get(creatorUser.toUpperCase()) || dispatch.despachador_name || creatorUser;
                }
                if (editorUser && editorUser.toUpperCase() !== creatorUser.toUpperCase()) {
                    editorName = profileMap.get(editorUser.toUpperCase()) || dispatch.editor_name || editorUser;
                }
            } catch (e) {
                console.warn('[PRINT-DISPATCH] Warning looking up user profiles:', e);
                creatorName = dispatch.despachador_name || creatorUser;
                if (editorUser && editorUser.toUpperCase() !== creatorUser.toUpperCase()) {
                    editorName = dispatch.editor_name || editorUser;
                }
            }
        }

        dispatch.creator_name = creatorName;
        dispatch.despachador_name = creatorName;
        dispatch.editor_name = editorName;
        dispatch.has_editor = !!editorName;

        // 5. Ajustes de la app (tolerante a fallos)
        let settings: any = {};
        try {
            const { data: sysSettings } = await supabaseAdmin
                .from('system_settings')
                .select('*')
                .single();
            if (sysSettings) settings = sysSettings;
        } catch (e) {
            console.warn('[PRINT-DISPATCH] Warning fetching system_settings:', e);
        }

        return {
            title: `Nota de Despacho ${doc_num}`,
            dispatch,
            branch,
            settings: settings || {}
        };
    } catch (err: any) {
        console.error('[PRINT DISPATCH LOAD] Error:', err);
        throw error(err.status || 500, err.message || 'Error interno cargando formato de despacho.');
    }
});
