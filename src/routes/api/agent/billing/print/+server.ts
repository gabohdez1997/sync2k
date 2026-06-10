import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    const profile = (locals as any).profile;
    if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

    if (!hasPermission(profile, 'cash_billing', 'create')) {
        return json({ success: false, message: 'No tienes permisos para facturar/imprimir.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { branch_id, invoice } = body;

        if (!branch_id || !invoice) {
            return json({ success: false, message: 'Faltan parámetros obligatorios (branch_id, invoice).' }, { status: 400 });
        }

        // Get branch config to lookup RIF, Name, and Address for header printing, and agent URL
        const { data: branch, error: bErr } = await supabaseAdmin
            .from('branches')
            .select('*')
            .eq('id', branch_id)
            .single();

        if (bErr || !branch || !branch.agent_url) {
            return json({ success: false, message: 'Sucursal no válida o agente no configurado.' }, { status: 400 });
        }

        // Fetch active printers for this branch
        const { data: printers, error: pErr } = await supabaseAdmin
            .from('printers')
            .select('id, name, ip_address, port, sublines')
            .eq('branch_id', branch_id)
            .eq('is_active', true);

        if (pErr) {
            return json({ success: false, message: 'Error al consultar impresoras: ' + pErr.message }, { status: 500 });
        }

        if (!printers || printers.length === 0) {
            return json({ success: false, message: 'No hay impresoras activas configuradas para esta sucursal.' }, { status: 400 });
        }

        // 1. Get all unique subline codes from the invoice items
        const invoiceLines = invoice.renglones || [];

        // 2. Normalize printer sublines and build set of all defined sublines in this branch
        const allDefinedSublines = new Set<string>();
        const printersNormalized = printers.map(p => {
            const subs = (p.sublines || []).map((s: string) => s.trim().toUpperCase());
            subs.forEach((s: string) => allDefinedSublines.add(s));
            return {
                ...p,
                sublinesNormalized: subs
            };
        });

        // 3. For each printer, determine which invoice lines (renglones) it should print
        const printerItemsMap = new Map<string, any[]>(); // printer.id -> list of items

        for (const line of invoiceLines) {
            const subline = (line.co_subl || '').trim().toUpperCase();
            const isDefinedAnywhere = allDefinedSublines.has(subline);

            if (!isDefinedAnywhere) {
                // If it is not defined on any printer, send this item to ALL active printers
                for (const p of printersNormalized) {
                    if (!printerItemsMap.has(p.id)) {
                        printerItemsMap.set(p.id, []);
                    }
                    printerItemsMap.get(p.id)!.push(line);
                }
            } else {
                // If it is defined, send this item only to printers that have this subline configured
                for (const p of printersNormalized) {
                    if (p.sublinesNormalized.includes(subline)) {
                        if (!printerItemsMap.has(p.id)) {
                            printerItemsMap.set(p.id, []);
                        }
                        printerItemsMap.get(p.id)!.push(line);
                    }
                }
            }
        }

        // 4. Select printers that have at least one item to print
        const targetPrintersArray = printersNormalized.filter(p => {
            const items = printerItemsMap.get(p.id);
            return items && items.length > 0;
        });

        // Fallback: if no printer matches any item, send all items to all printers
        const printersToPrint = targetPrintersArray.length > 0 ? targetPrintersArray : printersNormalized;

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, fetch);

        // Decorate invoice template base defaults
        const baseDecoratedInvoice = {
            ...invoice,
            branch_name: branch.business_name || branch.name,
            branch_rif: branch.rif,
            branch_phone: branch.phone,
            branch_address: branch.address
        };

        // Send print job to each target printer with its specific filtered items list!
        const printPromises = printersToPrint.map(async (printer) => {
            const filteredLines = printerItemsMap.get(printer.id) || invoiceLines;
            const decoratedInvoice = {
                ...baseDecoratedInvoice,
                renglones: filteredLines
            };

            try {
                const response = await agentClient.request<any>('/impresion/imprimir', {
                    method: 'POST',
                    body: JSON.stringify({
                        ip: printer.ip_address,
                        port: parseInt(printer.port || '9100'),
                        sede: branch_id,
                        invoice: decoratedInvoice
                    })
                });
                return {
                    printerName: printer.name,
                    success: response && response.success,
                    message: response?.message || 'Error desconocido'
                };
            } catch (err: any) {
                return {
                    printerName: printer.name,
                    success: false,
                    message: err.message
                };
            }
        });

        const printResults = await Promise.all(printPromises);
        const succeeded = printResults.filter(r => r.success);
        const failed = printResults.filter(r => !r.success);

        if (succeeded.length === 0) {
            return json({ 
                success: false, 
                message: 'Fallo al imprimir en todas las impresoras destinatarias: ' + 
                    failed.map(f => `${f.printerName} (${f.message})`).join(', ') 
            });
        }

        const successMsg = `Ticket de pre-despacho enviado a: ${succeeded.map(s => s.printerName).join(', ')}.` + 
            (failed.length > 0 ? ` (Falló en: ${failed.map(f => `${f.printerName} (${f.message})`).join(', ')})` : '');

        return json({ success: true, message: successMsg });

    } catch (err: any) {
        console.error('[API BILLING PRINT PROXY ERROR]:', err);
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};
