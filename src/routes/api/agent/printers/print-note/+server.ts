import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';

export const POST: RequestHandler = async ({ request, fetch, locals }) => {
    try {
        const { branch_id, doc, printer_id } = await request.json();

        if (!branch_id || !doc) {
            return json({ success: false, message: 'Faltan parámetros (branch_id, doc).' }, { status: 400 });
        }

        // 1. Obtener datos de la sede
        const { data: branch, error: branchErr } = await supabaseAdmin
            .from('branches')
            .select('*')
            .eq('id', branch_id)
            .single();

        if (branchErr || !branch) {
            return json({ success: false, message: 'No se encontró la configuración de la sucursal.' }, { status: 404 });
        }

        // 2. Buscar impresora matricial activa si no se especificó printer_id
        let targetPrinter: any = null;
        if (printer_id) {
            const { data: p } = await supabaseAdmin
                .from('printers')
                .select('*')
                .eq('id', printer_id)
                .single();
            targetPrinter = p;
        } else {
            // Buscar impresora con TYPE:MATRIX_NETWORK o DOC:NOTA_ENTREGA
            const { data: printers } = await supabaseAdmin
                .from('printers')
                .select('*')
                .eq('branch_id', branch_id)
                .eq('is_active', true);

            if (printers && printers.length > 0) {
                targetPrinter = printers.find(p => {
                    const sub = Array.isArray(p.sublines) ? p.sublines : [];
                    return sub.some((s: string) => s.includes('MATRIX') || s.includes('NOTA_ENTREGA') || s.includes('SHARE:'));
                }) || printers[0];
            }
        }

        // Extraer metadatos de la impresora
        let printerMeta = {
            ip_address: targetPrinter?.ip_address || '192.168.90.207',
            port: targetPrinter?.port || 445,
            share_name: 'EPSON LX-350 ESCP-1'
        };

        if (targetPrinter && targetPrinter.sublines) {
            const subs = Array.isArray(targetPrinter.sublines) ? targetPrinter.sublines : [];
            const shareItem = subs.find((s: string) => s.startsWith('SHARE:'));
            if (shareItem) {
                printerMeta.share_name = shareItem.replace('SHARE:', '').trim();
            }
        }

        // 3. Enviar orden al Agente
        const agentClient = new AgentClient(branch, locals.profile || undefined, fetch);
        const agentRes = await agentClient.request('/impresion/imprimir-nota-entrega', {
            method: 'POST',
            body: JSON.stringify({
                printer: printerMeta,
                doc: {
                    ...doc,
                    branch_name: branch.business_name || branch.name || 'INVERSIONES GALPE, C.A.',
                    branch_rif: branch.rif || 'J-40175035-4',
                    branch_desc: branch.name || 'BOCA DE RIO'
                }
            })
        });

        return json(agentRes);
    } catch (err: any) {
        console.error('[API PRINT NOTE ERROR]:', err);
        return json({ success: false, message: 'Error en servidor: ' + err.message }, { status: 500 });
    }
};
