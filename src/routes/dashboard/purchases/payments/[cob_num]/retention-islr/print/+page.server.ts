import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { getBranchById } from '$lib/server/branches';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_payments', async ({ params, url, locals, fetch }) => {
    const rawCob = params.cob_num || '';
    const cob_num = rawCob.replace(/^\$+/, '').trim();
    const allowedBranches = locals.profile?.allowed_branches || [];
    let branchId = (url.searchParams.get('branch_id') || url.searchParams.get('sede') || '').replace(/^\$+/, '').trim();

    if (!cob_num) {
        throw error(400, 'Falta el número de pago.');
    }

    try {
        // 1. Obtener la sucursal y su configuración fiscal / membrete
        let branch = await getBranchById(branchId, allowedBranches, fetch);
        if (!branch) {
            throw error(404, 'No se encontró la configuración de la sucursal.');
        }

        // 2. Consultar el pago y sus retenciones desde el Agente
        const agentClient = new AgentClient({ slug: branch.id, ...branch } as any, locals.profile || undefined, fetch);
        const res = await agentClient.request<any>(`/pagos/${encodeURIComponent(cob_num)}?sede=${encodeURIComponent(branch.id)}`);

        if (!res.success || !res.data) {
            throw error(404, 'No se pudo obtener el detalle del pago desde el agente.');
        }

        const payment = Array.isArray(res.data)
            ? (res.data.find((item: any) => item && !item.error && (item.cob_num || item.renglones)) || res.data[0])
            : res.data;

        if (!payment) {
            throw error(404, 'Pago no encontrado.');
        }

        // Sincronizar sucursal si el pago fue registrado en otra sede
        const docSede = payment?.sede_id || payment?.sede;
        if (docSede && String(docSede).toLowerCase() !== String(branch.id).toLowerCase()) {
            const realBranch = await getBranchById(docSede, allowedBranches, fetch);
            if (realBranch) branch = realBranch;
        }

        // 3. Enriquecer datos fiscales de facturas desde saFacturaCompra
        const facturasAbonadas = (payment.renglones || []).filter(
            (r: any) => !['IVAN', 'ISLR', 'AJPA', 'AJNA'].includes((r.co_tipo_doc || '').trim().toUpperCase())
        );

        for (const fact of facturasAbonadas) {
            const docNum = (fact.nro_doc || '').trim();
            if (docNum) {
                try {
                    const factRes = await agentClient.request<any>(
                        `/facturas-compras/${encodeURIComponent(docNum)}?sede=${encodeURIComponent(branch.id)}`
                    );
                    const factData = factRes.data && (Array.isArray(factRes.data) ? factRes.data[0] : factRes.data);
                    if (factData && !factData.error) {
                        fact.fec_emis = factData.fec_emis || fact.fec_emis;
                        fact.nro_fact = factData.nro_fact || fact.nro_fact;
                        fact.n_control = factData.n_control || fact.n_control;
                        fact.total_neto = factData.total_neto != null ? Number(factData.total_neto) : fact.total_neto;
                        fact.total_bruto = factData.total_bruto != null ? Number(factData.total_bruto) : fact.total_bruto;
                        fact.monto_imp = factData.monto_imp != null ? Number(factData.monto_imp) : fact.monto_imp;

                        if (factData.renglones && Array.isArray(factData.renglones)) {
                            const gravadoReng = factData.renglones
                                .filter((rg: any) => Number(rg.porc_imp || 0) > 0)
                                .reduce((acc: number, rg: any) => acc + Number(rg.total_renglon || rg.reng_neto || 0), 0);
                            if (gravadoReng > 0) {
                                fact.base_imponible = gravadoReng;
                            }
                            const exentoReng = factData.renglones
                                .filter((rg: any) => Number(rg.porc_imp || 0) === 0)
                                .reduce((acc: number, rg: any) => acc + Number(rg.total_renglon || rg.reng_neto || 0), 0);
                            fact.monto_exento = exentoReng;
                        }
                    }
                } catch (eFact) {
                    console.warn(`[PRINT-RETENTION-ISLR] No se pudo cargar detalle de factura ${docNum}:`, eFact);
                }
            }
        }

        // Sincronizar también retenciones_islr si vinieron del backend
        if (payment.retenciones_islr && Array.isArray(payment.retenciones_islr)) {
            payment.retenciones_islr.forEach((ret: any) => {
                const matchedFact = facturasAbonadas.find((f: any) => 
                    (ret.rowguid_reng_cob && f.rowguid === ret.rowguid_reng_cob) ||
                    (f.nro_doc && (f.nro_doc === ret.nro_doc || f.nro_fact === ret.nro_doc)) ||
                    (f.nro_fact && (f.nro_fact === ret.nro_fact || f.nro_doc === ret.nro_fact))
                ) || facturasAbonadas[0];

                if (matchedFact) {
                    if (matchedFact.fec_emis) ret.fecha_documento = matchedFact.fec_emis;
                    if (matchedFact.nro_fact) ret.nro_fact = matchedFact.nro_fact;
                    if (matchedFact.n_control && matchedFact.n_control !== '---') ret.numero_control_documento = matchedFact.n_control;
                    if (matchedFact.total_neto != null && Number(matchedFact.total_neto) > 0) {
                        ret.monto_documento = Number(matchedFact.total_neto);
                    }

                    const exentoVal = Number(matchedFact.monto_exento || 0);
                    const retMonto = Number(ret.monto_reten || 0);
                    const isFlete = (String(ret.co_islr || '').trim() === '072') || (exentoVal > 0 && (
                        Math.abs(retMonto - Number((exentoVal * 0.03).toFixed(2))) <= 0.05 ||
                        Math.abs((retMonto / exentoVal) - 0.03) <= 0.005
                    ));

                    if (isFlete) {
                        ret.co_islr = '072';
                        ret.islr_des = 'FLETES PAGADOS A PERSONAS JURÍDICAS O NATURALES';
                        ret.monto_obj = exentoVal > 0 ? exentoVal : (Number(ret.monto_obj) > 0 ? Number(ret.monto_obj) : Number((retMonto / 0.03).toFixed(2)));
                        ret.porc_retn = 3.0;
                    } else {
                        if ((!ret.monto_obj || Number(ret.monto_obj) <= 0) && matchedFact.base_imponible != null && Number(matchedFact.base_imponible) > 0) {
                            ret.monto_obj = Number(matchedFact.base_imponible);
                        }
                        if (Number(ret.porc_retn || 0) <= 0 && Number(ret.monto_obj || 0) > 0) {
                            ret.porc_retn = Number(((retMonto / Number(ret.monto_obj)) * 100).toFixed(2));
                        }
                    }

                    // Formatear num_comprobante al estándar fiscal SENIAT (14 dígitos)
                    const rawVal = ret.num_comprobante || ret.nro_doc_islr;
                    if (rawVal) {
                        const islrDateVal = ret.fec_emis_islr || payment.fecha || new Date();
                        const dObj = new Date(islrDateVal);
                        const pYear = isNaN(dObj.getFullYear()) ? new Date().getFullYear() : dObj.getFullYear();
                        const pMonth = isNaN(dObj.getMonth()) ? String(new Date().getMonth() + 1).padStart(2, '0') : String(dObj.getMonth() + 1).padStart(2, '0');
                        const periodStr = `${pYear}${pMonth}`;
                        const digits = String(rawVal).replace(/\D/g, '');
                        if (digits.length === 14 && /^20\d{12}$/.test(digits)) {
                            ret.num_comprobante = digits;
                        } else if (digits.length > 0) {
                            const seq8 = digits.length >= 8 ? digits.slice(-8) : digits.padStart(8, '0');
                            ret.num_comprobante = `${periodStr}${seq8}`;
                        }
                    }
                }
            });
        }

        return {
            payment,
            branch,
            coIslrFilter: url.searchParams.get('co_islr') || null,
            compFilter: url.searchParams.get('comp') || null
        };
    } catch (err: any) {
        console.error('[PRINT-RETENTION-ISLR] Error:', err);
        throw error(500, err.message || 'Error al cargar el comprobante de retención de ISLR.');
    }
});

