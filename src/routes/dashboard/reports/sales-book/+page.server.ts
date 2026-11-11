// src/routes/dashboard/reports/sales-book/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { getActiveBranches } from '$lib/server/branches';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('reports_sales_book', async (event: any) => {
    const { locals, url, fetch } = event;
    if (typeof event.depends === 'function') {
        event.depends('app:sales_book');
    }

    const profile = (locals as any).profile;
    if (!profile) throw new Error('Perfil no cargado.');

    let startDate = url.searchParams.get('startDate') || url.searchParams.get('desde') || '';
    let endDate = url.searchParams.get('endDate') || url.searchParams.get('hasta') || '';
    let branchId = url.searchParams.get('branch_id') || url.searchParams.get('sede_id') || url.searchParams.get('sede') || '';

    // Fechas por defecto: Quincena actual del mes en curso
    if (!startDate || !endDate) {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth(); // 0-indexed
        const day = today.getDate();

        if (day <= 15) {
            startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            endDate = `${year}-${String(month + 1).padStart(2, '0')}-15`;
        } else {
            const lastDay = new Date(year, month + 1, 0).getDate();
            startDate = `${year}-${String(month + 1).padStart(2, '0')}-16`;
            endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        }
    }

    const profileAllowed = profile.allowed_branches || [];
    if (profileAllowed.length === 0) {
        return {
            startDate, endDate, branchId,
            branches: [],
            error: 'No tienes sucursales asignadas.'
        };
    }

    // Obtener detalles completos de configuración de sucursales (business_name, rif, address, etc.)
    const allDbBranches = await getActiveBranches(fetch);
    const dbBranchMap = new Map(allDbBranches.map(b => [b.id, b]));

    const allowedBranches = profileAllowed.map((pb: any) => {
        const full = dbBranchMap.get(pb.id);
        return {
            ...pb,
            name: full?.name || pb.name,
            business_name: full?.business_name || pb.business_name || '',
            rif: full?.rif || pb.rif || '',
            address: full?.address || pb.address || '',
            phone: full?.phone || pb.phone || ''
        };
    });

    // Si hay más de 1 sucursal, por defecto podemos consultar "all" (Unificado) o la primera
    const hasMultipleBranches = allowedBranches.length > 1;
    if (!branchId) {
        branchId = hasMultipleBranches ? 'all' : allowedBranches[0].id;
    }

    // ─── CONSULTA UNIFICADA (TODAS LAS SEDES) ───
    if (branchId === 'all' && hasMultipleBranches) {
        // Agrupar agentes únicos
        const agentMap = new Map<string, any>();
        for (const b of allowedBranches) {
            if (b.agent_url) {
                const norm = b.agent_url.replace(/\/+$/, '');
                if (!agentMap.has(norm)) {
                    agentMap.set(norm, b);
                }
            }
        }

        const distinctAgents = Array.from(agentMap.values());
        if (distinctAgents.length === 0) {
            return {
                startDate, endDate, branchId,
                branches: allowedBranches,
                hasMultipleBranches,
                error: 'Ninguna de tus sedes asignadas tiene agente configurado.'
            };
        }

        const requests = distinctAgents.map(async (branch) => {
            const client = new AgentClient({
                slug: branch.id,
                agent_url: branch.agent_url,
                agent_api_key: branch.agent_token
            }, profile, fetch);

            try {
                const res = await client.request<any>(
                    `/reportes/libro-ventas?sede=all&startDate=${startDate}&endDate=${endDate}`,
                    { method: 'GET' }
                );
                return { branch, res };
            } catch (err: any) {
                return { branch, error: err.message };
            }
        });

        const settled = await Promise.allSettled(requests);
        let mergedDocs: any[] = [];
        let primaryCompany: any = null;

        for (const r of settled) {
            if (r.status === 'fulfilled' && r.value) {
                const { branch, res } = r.value as any;
                if (res && res.success && Array.isArray(res.data)) {
                    if (!primaryCompany && res.company) {
                        primaryCompany = res.company;
                    }
                    for (const doc of res.data) {
                        mergedDocs.push({
                            ...doc,
                            sede_nombre: branch.name || doc.sede_nombre || branch.business_name,
                            sede_id: doc.sede_id || branch.id
                        });
                    }
                }
            }
        }

        // Ordenar cronológicamente
        mergedDocs.sort((a, b) => {
            const dateA = new Date(a.fec_emis).getTime();
            const dateB = new Date(b.fec_emis).getTime();
            if (dateA !== dateB) return dateA - dateB;
            return String(a.doc_num).localeCompare(String(b.doc_num), undefined, { numeric: true });
        });

        // Re-asignar correlativo de operación
        let op = 1;
        for (const d of mergedDocs) {
            d.oper_nro = op++;
        }

        // Calcular KPIs consolidados
        let totalVentas = 0;
        let totalExento = 0;
        let totalBaseGeneral = 0;
        let totalDebitoGeneral = 0;
        let totalBaseReducida = 0;
        let totalDebitoReducida = 0;
        let totalBaseAdicional = 0;
        let totalDebitoAdicional = 0;
        let totalIvaRetenido = 0;

        let cantFacturas = 0;
        let cantNotasCredito = 0;
        let cantNotasDebito = 0;
        let cantRetenciones = 0;
        let cantAnuladas = 0;

        const hasSeparateRetRows = mergedDocs.some(d => d.tipo_doc === 'RET/IVA');

        for (const doc of mergedDocs) {
            const isAnulada = Number(doc.anulado) === 1 || String(doc.status) === '3';
            if (isAnulada) {
                cantAnuladas++;
                continue;
            }

            if (doc.tipo_doc === 'FAC') cantFacturas++;
            else if (doc.tipo_doc === 'NC') cantNotasCredito++;
            else if (doc.tipo_doc === 'ND') cantNotasDebito++;
            else if (doc.tipo_doc === 'RET/IVA') cantRetenciones++;

            totalVentas += Number(doc.total_neto || 0);
            totalExento += Number(doc.ventas_exentas || 0);
            totalBaseGeneral += Number(doc.base_general || 0);
            totalDebitoGeneral += Number(doc.imp_general || 0);
            totalBaseReducida += Number(doc.base_reducida || 0);
            totalDebitoReducida += Number(doc.imp_reducida || 0);
            totalBaseAdicional += Number(doc.base_adicional || 0);
            totalDebitoAdicional += Number(doc.imp_adicional || 0);

            if (hasSeparateRetRows) {
                if (doc.tipo_doc === 'RET/IVA') {
                    totalIvaRetenido += Number(doc.iva_retenido || 0);
                }
            } else {
                totalIvaRetenido += Number(doc.iva_retenido || 0);
            }
        }

        const hasReporteZ = mergedDocs.some(d => d.reporte_z && String(d.reporte_z).trim() !== '');
        const hasSerialImp = mergedDocs.some(d => d.serial_imp && String(d.serial_imp).trim() !== '');

        const primaryBranch = allowedBranches[0] || {};
        const compEmpDes = (primaryBranch.business_name && primaryBranch.business_name.trim())
            || (primaryCompany?.emp_des && primaryCompany.emp_des.trim())
            || primaryBranch.name
            || 'EMPRESA';
        const compRif = (primaryBranch.rif && primaryBranch.rif.trim())
            || (primaryCompany?.rif && primaryCompany.rif.trim())
            || '';
        const compDirec = (primaryBranch.address && primaryBranch.address.trim())
            || (primaryCompany?.direc && primaryCompany.direc.trim())
            || '';

        return {
            startDate,
            endDate,
            branchId: 'all',
            selectedBranch: { id: 'all', name: 'Todas las Sedes (Unificado)' },
            branches: allowedBranches,
            hasMultipleBranches,
            company: {
                emp_des: compEmpDes,
                rif: compRif,
                direc: compDirec
            },
            kpis: {
                total_ventas: Math.round(totalVentas * 100) / 100,
                total_exento: Math.round(totalExento * 100) / 100,
                total_base_general: Math.round(totalBaseGeneral * 100) / 100,
                total_debito_general: Math.round(totalDebitoGeneral * 100) / 100,
                total_base_reducida: Math.round(totalBaseReducida * 100) / 100,
                total_debito_reducida: Math.round(totalDebitoReducida * 100) / 100,
                total_base_adicional: Math.round(totalBaseAdicional * 100) / 100,
                total_debito_adicional: Math.round(totalDebitoAdicional * 100) / 100,
                total_base_imponible_total: Math.round((totalBaseGeneral + totalBaseReducida + totalBaseAdicional) * 100) / 100,
                total_debito_fiscal_total: Math.round((totalDebitoGeneral + totalDebitoReducida + totalDebitoAdicional) * 100) / 100,
                total_iva_retenido: Math.round(totalIvaRetenido * 100) / 100,
                total_documentos: mergedDocs.length,
                cant_facturas: cantFacturas,
                cant_notas_credito: cantNotasCredito,
                cant_notas_debito: cantNotasDebito,
                cant_retenciones: cantRetenciones,
                cant_anuladas: cantAnuladas,
                has_reporte_z: hasReporteZ,
                has_serial_imp: hasSerialImp
            },
            reportData: mergedDocs
        };
    }

    // ─── CONSULTA DE SEDE ESPECÍFICA (O ÚNICO AGENTE) ───
    const selectedBranch = allowedBranches.find((b: any) => b.id === branchId) || allowedBranches[0];
    if (!selectedBranch || !selectedBranch.agent_url) {
        return {
            startDate, endDate, branchId,
            branches: allowedBranches,
            hasMultipleBranches,
            error: 'La sucursal seleccionada no tiene agente configurado.'
        };
    }

    branchId = selectedBranch.id;

    const agentClient = new AgentClient({
        slug: selectedBranch.id,
        agent_url: selectedBranch.agent_url,
        agent_api_key: selectedBranch.agent_token
    }, profile, fetch);

    try {
        const response = await agentClient.request<any>(
            `/reportes/libro-ventas?sede=${branchId}&startDate=${startDate}&endDate=${endDate}`,
            { method: 'GET' }
        );

        const resData = response as any;
        const compEmpDes = (selectedBranch?.business_name && selectedBranch.business_name.trim())
            || (resData?.company?.emp_des && resData.company.emp_des.trim())
            || selectedBranch?.name
            || 'EMPRESA';
        const compRif = (selectedBranch?.rif && selectedBranch.rif.trim())
            || (resData?.company?.rif && resData.company.rif.trim())
            || '';
        const compDirec = (selectedBranch?.address && selectedBranch.address.trim())
            || (resData?.company?.direc && resData.company.direc.trim())
            || '';

        const companyInfo = {
            emp_des: compEmpDes,
            rif: compRif,
            direc: compDirec
        };

        if (resData && resData.success) {
            return {
                startDate,
                endDate,
                branchId,
                selectedBranch,
                branches: allowedBranches,
                hasMultipleBranches,
                company: companyInfo,
                kpis: resData.kpis || {},
                reportData: (resData.data || []).map((doc: any) => ({
                    ...doc,
                    sede_nombre: selectedBranch.name || doc.sede_nombre
                }))
            };
        } else {
            return {
                startDate,
                endDate,
                branchId,
                selectedBranch,
                branches: allowedBranches,
                hasMultipleBranches,
                company: companyInfo,
                kpis: {},
                reportData: [],
                error: resData?.message || 'Error al obtener datos del Libro de Ventas.'
            };
        }
    } catch (e: any) {
        console.error('[Sales Book Load Error]:', e);
        return {
            startDate,
            endDate,
            branchId,
            selectedBranch,
            branches: allowedBranches,
            hasMultipleBranches,
            company: {
                emp_des: selectedBranch.business_name || selectedBranch.name,
                rif: selectedBranch.rif || '',
                direc: selectedBranch.address || ''
            },
            kpis: {},
            reportData: [],
            error: 'Error de comunicación con el Agente Profit: ' + e.message
        };
    }
});
