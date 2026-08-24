// src/routes/dashboard/warehouse/receipts/[doc_num]/print/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('inv_receipts', async ({ params, url, locals, fetch }) => {
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

        // 2. Obtener datos de la nota de recepción desde el Agente
        const agentClient = new AgentClient(branch, locals.profile || undefined, fetch);
        const res = await agentClient.getReceivingNote(doc_num);
        
        if (!res.success || !res.data) {
            throw error(404, 'No se pudo obtener el detalle de la nota de recepción desde el agente.');
        }

        const receipt = Array.isArray(res.data) ? res.data[0] : res.data;

        // 3. Enriquecer con datos del proveedor
        if (receipt && receipt.co_prov) {
            try {
                const provRes = await agentClient.getSupplier(receipt.co_prov.trim());
                if (provRes.success && provRes.data) {
                    const provData = Array.isArray(provRes.data) ? provRes.data[0] : provRes.data;
                    receipt.prov_dir = provData.direc1 || provData.direc2 || receipt.prov_dir;
                    receipt.telefonos = provData.telefonos || receipt.telefonos;
                    receipt.email = provData.email || receipt.email;
                }
            } catch (e) {
                console.warn('[PRINT-RECEIPT] Warning fetching extra supplier data:', e);
            }
        }

        // 4. Buscar nombres de Recepcionista (co_us_in), Editor (co_us_mo) y Comprador OC (oc_co_us_in) en Supabase profiles
        let creatorName = '';
        let editorName = '';
        let buyerName = '';

        const creatorUser = (receipt.co_us_in || '').trim();
        const editorUser = (receipt.co_us_mo || '').trim();
        const buyerUser = (receipt.oc_co_us_in || '').trim();

        const usersToFetch = Array.from(new Set([creatorUser, editorUser, buyerUser].filter(Boolean)));

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
                if (buyerUser) {
                    buyerName = profileMap.get(buyerUser.toUpperCase()) || buyerUser;
                }
            } catch (e) {
                console.warn('[PRINT-RECEIPT] Warning looking up user profiles:', e);
                creatorName = creatorUser;
                if (editorUser && editorUser.toUpperCase() !== creatorUser.toUpperCase()) {
                    editorName = editorUser;
                }
                buyerName = buyerUser;
            }
        }

        receipt.creator_name = creatorName;
        receipt.recepcionista_name = creatorName;
        receipt.editor_name = editorName;
        receipt.has_editor = !!editorName;
        receipt.buyer_name = buyerName;

        // 5. Obtener branding global
        const { data: settings } = await supabaseAdmin.from('system_settings').select('*').single();

        return {
            receipt,
            branch,
            settings: settings || {},
            title: `Nota de Recepción ${doc_num}`
        };

    } catch (err: any) {
        console.error('[PRINT-RECEIPT] Error:', err);
        throw error(err.status || 500, err.message || 'Error cargando datos de impresión.');
    }
});
