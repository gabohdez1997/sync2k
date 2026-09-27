import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';

export const POST: RequestHandler = async ({ request, fetch, locals }) => {
    try {
        const { branch_id, doc, printer_id, format } = await request.json();

        if (!branch_id || !doc) {
            return json({ success: false, message: 'Faltan parámetros (branch_id, doc).' }, { status: 400 });
        }

        // 1. Obtener datos legales y de configuración de la sede
        const { data: branch, error: branchErr } = await supabaseAdmin
            .from('branches')
            .select('*')
            .eq('id', branch_id)
            .single();

        if (branchErr || !branch) {
            return json({ success: false, message: 'No se encontró la configuración de la sucursal solicitada.' }, { status: 404 });
        }

        const isThermal = (format || 'thermal').toLowerCase() === 'thermal';

        // 2. Buscar impresora según la sede y el formato seleccionado
        let targetPrinter: any = null;
        if (printer_id) {
            const { data: p } = await supabaseAdmin
                .from('printers')
                .select('*')
                .eq('id', printer_id)
                .single();
            targetPrinter = p;
        } else {
            // Obtener todas las impresoras activas de esta sede
            const { data: printers } = await supabaseAdmin
                .from('printers')
                .select('*')
                .eq('branch_id', branch_id)
                .eq('is_active', true);

            if (printers && printers.length > 0) {
                if (isThermal) {
                    // Prioridad 1: Térmica configurada explícitamente para NOTA_ENTREGA
                    targetPrinter = printers.find(p => {
                        const subs = (p.sublines || []).map((s: any) => String(s).toUpperCase());
                        const isDocNota = subs.includes('DOC:NOTA_ENTREGA');
                        const isTypeThermal = subs.includes('TYPE:THERMAL') || String(p.port || '') === '9100';
                        return isDocNota && isTypeThermal;
                    });

                    // Prioridad 2: Cualquier impresora asignada a NOTA_ENTREGA
                    if (!targetPrinter) {
                        targetPrinter = printers.find(p => {
                            const subs = (p.sublines || []).map((s: any) => String(s).toUpperCase());
                            return subs.includes('DOC:NOTA_ENTREGA');
                        });
                    }

                    // Prioridad 3: Cualquier impresora térmica activa en esta sede
                    if (!targetPrinter) {
                        targetPrinter = printers.find(p => {
                            const subs = (p.sublines || []).map((s: any) => String(s).toUpperCase());
                            return subs.includes('TYPE:THERMAL') || String(p.port || '') === '9100';
                        });
                    }

                    // Prioridad 4: Primera impresora activa
                    if (!targetPrinter) {
                        targetPrinter = printers[0];
                    }
                } else {
                    // Formato Matricial (ESC/P)
                    targetPrinter = printers.find(p => {
                        const subs = (p.sublines || []).map((s: any) => String(s).toUpperCase());
                        const isMatrix = subs.includes('TYPE:MATRIX_NETWORK') || String(p.port || '') === '445' || subs.some((s: string) => s.startsWith('SHARE:'));
                        const isDocNota = subs.includes('DOC:NOTA_ENTREGA');
                        return isMatrix && isDocNota;
                    }) || printers.find(p => {
                        const subs = (p.sublines || []).map((s: any) => String(s).toUpperCase());
                        return subs.includes('TYPE:MATRIX_NETWORK') || String(p.port || '') === '445' || subs.some((s: string) => s.startsWith('SHARE:'));
                    }) || printers[0];
                }
            }
        }

        // Metadatos de la impresora resuelta
        const defaultIp = branch.name?.toLowerCase().includes('paraparal') ? '192.168.90.207' : '192.168.90.10';
        let printerMeta = {
            id: targetPrinter?.id || null,
            name: targetPrinter?.name || (isThermal ? 'Impresora Térmica 80mm' : 'Impresora Matricial'),
            ip_address: targetPrinter?.ip_address || defaultIp,
            port: targetPrinter?.port || (isThermal ? 9100 : 445),
            printer_type: isThermal ? 'thermal' : 'matrix_network',
            share_name: 'EPSON LX-350 ESCP-1'
        };

        if (targetPrinter && targetPrinter.sublines) {
            const subs = Array.isArray(targetPrinter.sublines) ? targetPrinter.sublines : [];
            const shareItem = subs.find((s: string) => s.startsWith('SHARE:'));
            if (shareItem) {
                printerMeta.share_name = shareItem.replace('SHARE:', '').trim();
            }
        }

        // 3. Dirección y datos fiscales según la sede emisora
        let branchAddress = branch.address;
        if (!branchAddress) {
            if (branch.name?.toLowerCase().includes('paraparal')) {
                branchAddress = 'CTRA NACIONAL LOS GUAYOS-GUACARA CRUCE CON CALLE 940-A Y CALLE PARAPARAL LOCAL GALPON NRO 20-21 SECTOR LOS GUAYOS LOS GUAYOS CARABOBO;';
            } else {
                branchAddress = 'Av. 92 Pedro melean (via La Isabelica), Valencia, Carabobo';
            }
        }

        const enrichedDoc = {
            ...doc,
            branch_id: branch.id,
            branch_name: branch.business_name || branch.name || 'inversiones Galpe 2021 C.A.',
            branch_rif: branch.rif || 'J-401750354',
            branch_desc: branch.name || 'GALPE',
            branch_address: branchAddress,
            cajero: doc.cajero || locals.profile?.full_name || locals.profile?.name || '---',
            vendedor: doc.vendedor || '---'
        };

        // 4. Enviar orden al Agente de la sede correspondiente
        const agentClient = new AgentClient(branch, locals.profile || undefined, fetch);
        const agentRes = await agentClient.request<any>('/impresion/imprimir-nota-entrega', {
            method: 'POST',
            body: JSON.stringify({
                printer: printerMeta,
                format: isThermal ? 'thermal' : 'matrix',
                doc: enrichedDoc
            })
        });

        return json({
            ...agentRes,
            printer_used: {
                name: printerMeta.name,
                ip: printerMeta.ip_address,
                port: printerMeta.port,
                type: printerMeta.printer_type
            },
            branch_used: {
                id: branch.id,
                name: branch.name,
                address: branchAddress
            }
        });
    } catch (err: any) {
        console.error('[API PRINT NOTE ERROR]:', err);
        return json({ success: false, message: 'Error en servidor: ' + err.message }, { status: 500 });
    }
};

