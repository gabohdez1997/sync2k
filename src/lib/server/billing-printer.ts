import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';

export interface SendCancellationNotificationOptions {
    branch_id: string;
    invoice: any;
    action_type: 'ANULACION' | 'ELIMINACION';
    user_email?: string;
    motivo?: string;
    profile?: any;
    agentClient?: AgentClient;
    fetchFn?: typeof fetch;
}

export interface CancellationPrintResult {
    success: boolean;
    message: string;
    targetPrinters: string[];
    succeeded: string[];
    failed: { printerName: string; error: string }[];
}

/**
 * Envía el ticket compacto de notificación de anulación o eliminación a las impresoras
 * de despacho correspondientes según las sublíneas de los artículos de la factura.
 */
export async function sendCancellationNotificationTicket(
    options: SendCancellationNotificationOptions
): Promise<CancellationPrintResult> {
    const { branch_id, invoice, action_type, user_email, motivo, profile, fetchFn } = options;

    if (!branch_id || !invoice) {
        return {
            success: false,
            message: 'Faltan parámetros obligatorios (branch_id, invoice).',
            targetPrinters: [],
            succeeded: [],
            failed: []
        };
    }

    // 1. Obtener datos de la sucursal
    const { data: branch, error: bErr } = await supabaseAdmin
        .from('branches')
        .select('*')
        .eq('id', branch_id)
        .single();

    if (bErr || !branch || !branch.agent_url) {
        return {
            success: false,
            message: 'Sucursal no válida o agente no configurado.',
            targetPrinters: [],
            succeeded: [],
            failed: []
        };
    }

    // 2. Obtener impresoras activas de esta sede
    const { data: rawPrinters, error: pErr } = await supabaseAdmin
        .from('printers')
        .select('id, name, ip_address, port, sublines')
        .eq('branch_id', branch_id)
        .eq('is_active', true);

    if (pErr || !rawPrinters || rawPrinters.length === 0) {
        return {
            success: false,
            message: 'No hay impresoras activas configuradas para esta sucursal.',
            targetPrinters: [],
            succeeded: [],
            failed: []
        };
    }

    // AISLAMIENTO ESTRICTO: Solo impresoras TYPE:THERMAL con DOC:PRE_DESPACHO activas en la sede
    const printers = (rawPrinters || []).filter((p: any) => {
        const subs = (p.sublines || []).map((s: any) => String(s).trim().toUpperCase());
        const isThermal = subs.includes('TYPE:THERMAL') || (!subs.some((s: string) => s.startsWith('TYPE:')) && String(p.port || '') === '9100');
        const isPreDespacho = subs.includes('DOC:PRE_DESPACHO') || 
            (!subs.some((s: string) => s.startsWith('DOC:')) && !subs.some((s: string) => s.includes('NOTA_ENTREGA') || s.includes('FISCAL')));
        const isExcluded = subs.includes('DOC:NOTA_ENTREGA') || subs.includes('DOC:FACTURA_FISCAL') || subs.includes('TYPE:MATRIX_NETWORK') || subs.includes('TYPE:FISCAL');

        return isThermal && isPreDespacho && !isExcluded;
    });

    if (printers.length === 0) {
        return {
            success: false,
            message: 'No hay impresoras térmicas de pre-despacho (TYPE:THERMAL con DOC:PRE_DESPACHO) activas en esta sucursal.',
            targetPrinters: [],
            succeeded: [],
            failed: []
        };
    }

    // 3. Evaluar sublíneas de los renglones de la factura
    const invoiceLines = invoice.renglones || [];
    const allDefinedSublines = new Set<string>();

    const printersNormalized = printers.map((p: any) => {
        const subs = (p.sublines || []).map((s: any) => String(s).trim().toUpperCase());
        subs.forEach((s: string) => allDefinedSublines.add(s));
        return {
            ...p,
            sublinesNormalized: subs
        };
    });

    const matchedPrinterIds = new Set<string>();

    for (const line of invoiceLines) {
        const subline = (line.co_subl || '').trim().toUpperCase();
        const isDefinedAnywhere = allDefinedSublines.has(subline);

        if (!isDefinedAnywhere) {
            // Si la sublínea no está configurada en ninguna impresora en particular,
            // todas las impresoras activas reciben la notificación
            for (const p of printersNormalized) {
                matchedPrinterIds.add(p.id);
            }
        } else {
            // Si está configurada, sólo las impresoras que tienen asignada esa sublínea
            for (const p of printersNormalized) {
                if (p.sublinesNormalized.includes(subline)) {
                    matchedPrinterIds.add(p.id);
                }
            }
        }
    }

    // Filtrar impresoras destino
    const targetPrinters = printersNormalized.filter((p: any) => matchedPrinterIds.has(p.id));
    const printersToPrint = targetPrinters.length > 0 ? targetPrinters : printersNormalized;

    const client = options.agentClient || new AgentClient({
        slug: branch.id,
        agent_url: branch.agent_url,
        agent_api_key: branch.agent_token
    }, profile, fetchFn || fetch);

    // Resolver nombre y apellido del cajero a partir del código profit_user si no viene en el invoice
    let cashierName = invoice.cashier_name || invoice.cajero || '';
    if (!cashierName && invoice.co_us_in) {
        try {
            const { data: prof } = await supabaseAdmin
                .from('profiles')
                .select('full_name')
                .ilike('profit_user', String(invoice.co_us_in).trim())
                .limit(1)
                .maybeSingle();
            if (prof?.full_name) {
                cashierName = prof.full_name;
            }
        } catch (e) {
            console.warn('[BILLING-PRINTER] No se pudo buscar perfil del cajero:', e);
        }
    }

    const decoratedInvoice = {
        ...invoice,
        cashier_name: cashierName || invoice.co_us_in,
        cajero: cashierName || invoice.co_us_in,
        branch_name: branch.business_name || branch.name,
        branch_rif: branch.rif,
        branch_phone: branch.phone,
        branch_address: branch.address,
        action_type,
        user_email,
        motivo
    };

    // 4. Enviar notificación a cada impresora destino (respetando sublíneas, sin artículos)
    const printPromises = printersToPrint.map(async (printer: any) => {
        try {
            const res = await client.request<any>('/impresion/imprimir-notificacion', {
                method: 'POST',
                body: JSON.stringify({
                    ip: printer.ip_address,
                    port: parseInt(printer.port || '9100'),
                    action_type,
                    invoice: decoratedInvoice
                })
            });

            return {
                printerName: printer.name,
                success: !!(res && res.success),
                message: res?.message || 'Error desconocido'
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
    const succeeded = printResults.filter(r => r.success).map(r => r.printerName);
    const failed = printResults.filter(r => !r.success).map(r => ({ printerName: r.printerName, error: r.message }));

    if (succeeded.length === 0) {
        return {
            success: false,
            message: 'No se pudo conectar con las impresoras destinatarias: ' + 
                failed.map(f => `${f.printerName} (${f.error})`).join(', '),
            targetPrinters: printersToPrint.map((p: any) => p.name),
            succeeded,
            failed
        };
    }

    const successMsg = `Ticket de notificación de ${action_type.toLowerCase()} enviado a: ${succeeded.join(', ')}.` +
        (failed.length > 0 ? ` (Falló en: ${failed.map(f => `${f.printerName} (${f.error})`).join(', ')})` : '');

    return {
        success: true,
        message: successMsg,
        targetPrinters: printersToPrint.map((p: any) => p.name),
        succeeded,
        failed
    };
}
