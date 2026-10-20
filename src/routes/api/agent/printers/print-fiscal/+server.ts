import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
    const profile = (locals as any).profile;
    if (!profile) {
        return json({ success: false, message: 'No autenticado.' }, { status: 401 });
    }

    if (!hasPermission(profile, 'cash_billing', 'create')) {
        return json({ success: false, message: 'No tienes permisos para facturar o imprimir.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { branch_id, printer_id, invoice } = body;

        if (!branch_id || !invoice) {
            return json({ success: false, message: 'Faltan parámetros obligatorios (branch_id, invoice).' }, { status: 400 });
        }

        // 1. Obtener datos de la sucursal
        const { data: branch, error: bErr } = await supabaseAdmin
            .from('branches')
            .select('*')
            .eq('id', branch_id)
            .single();

        if (bErr || !branch || !branch.agent_url) {
            return json({ success: false, message: 'Sucursal no válida o agente no configurado.' }, { status: 400 });
        }

        // 2. Buscar impresora fiscal activa
        let targetPrinter: any = null;
        if (printer_id) {
            const { data: p } = await supabaseAdmin
                .from('printers')
                .select('*')
                .eq('id', printer_id)
                .single();
            targetPrinter = p;
        } else {
            const { data: rawPrinters } = await supabaseAdmin
                .from('printers')
                .select('*')
                .eq('branch_id', branch_id)
                .eq('is_active', true);

            targetPrinter = (rawPrinters || []).find((p: any) => {
                const subs = (p.sublines || []).map((s: any) => String(s).trim().toUpperCase());
                return subs.includes('TYPE:FISCAL') || subs.includes('DOC:FACTURA_FISCAL') || String(p.port || '') === '8088';
            });
        }

        if (!targetPrinter) {
            return json({
                success: false,
                message: 'No hay ninguna impresora fiscal activa configurada en esta sede.'
            }, { status: 404 });
        }

        // 3. Extraer puerto serial (COM) y parámetros del modelo
        const subs = (targetPrinter.sublines || []).map((s: any) => String(s).trim().toUpperCase());
        const comEntry = subs.find((s: string) => s.startsWith('COM:'));
        const serialPort = comEntry ? comEntry.replace('COM:', '').trim() : 'COM4';

        const modelEntry = subs.find((s: string) => s.startsWith('MODEL:'));
        const model = modelEntry ? modelEntry.replace('MODEL:', '').trim() : 'TALLY_DASCOM_1140';

        // 4. Enviar orden al Agente local de la sede
        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, fetch);

        const response = await agentClient.request<any>('/impresion/imprimir-fiscal', {
            method: 'POST',
            body: JSON.stringify({
                ip: targetPrinter.ip_address,
                port: targetPrinter.port || 8088,
                serial_port: serialPort,
                model,
                invoice
            })
        });

        if (!response || !response.success) {
            return json({
                success: false,
                message: response?.message || 'Error al comunicarse con la impresora fiscal.'
            });
        }

        return json({
            success: true,
            message: response.message || `Factura fiscal emitida exitosamente en [${targetPrinter.name}].`,
            nroFacturaFiscal: (response as any).nroFacturaFiscal,
            serial: (response as any).serial,
            printer_used: {
                id: targetPrinter.id,
                name: targetPrinter.name,
                ip: targetPrinter.ip_address,
                port: targetPrinter.port
            }
        });

    } catch (err: any) {
        console.error('[API PRINT FISCAL ERROR]:', err);
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};
