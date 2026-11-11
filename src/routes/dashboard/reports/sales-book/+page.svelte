<!-- src/routes/dashboard/reports/sales-book/+page.svelte -->
<script lang="ts">
    import {
        Building,
        Calendar,
        TrendingUp,
        Receipt,
        Percent,
        ShieldCheck,
        Package,
        Search,
        RefreshCw,
        FileSpreadsheet,
        AlertTriangle,
        Filter,
        X,
        CheckCircle2,
        XCircle,
        Layers,
        ChevronLeft,
        ChevronRight,
        Printer,
    } from "lucide-svelte";
    import Combobox from "$lib/components/ui/Combobox.svelte";
    import { goto } from "$app/navigation";
    import * as XLSX from "xlsx";

    let { data } = $props();

    let isSyncing = $state(false);

    // Filtros de URL
    let startDate = $state(data.startDate);
    let endDate = $state(data.endDate);
    let selectedBranch = $state(data.branchId);

    // Filtros locales
    let searchTerm = $state("");
    let selectedType = $state<string>("ALL"); // "ALL", "FAC", "NC", "ND", "RET/IVA", "ANULADAS"

    // Paginación
    let currentPage = $state(1);
    const pageSize = 50;

    $effect(() => {
        startDate = data.startDate;
        endDate = data.endDate;
        selectedBranch = data.branchId;
    });

    // Opciones de sucursales
    const branchesOptions = $derived.by(() => {
        const list = (data.branches || []).map((b: any) => ({
            value: b.id,
            label: b.name,
        }));
        if (data.hasMultipleBranches) {
            return [
                { value: "all", label: "Todas las Sedes (Unificado)" },
                ...list,
            ];
        }
        return list;
    });

    // Filtro rápido de fechas (Quincenas / Meses)
    function setFortnight(firstFortnight: boolean, previousMonth: boolean = false) {
        const d = new Date();
        if (previousMonth) {
            d.setMonth(d.getMonth() - 1);
        }
        const year = d.getFullYear();
        const month = d.getMonth();
        if (firstFortnight) {
            startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
            endDate = `${year}-${String(month + 1).padStart(2, "0")}-15`;
        } else {
            const lastDay = new Date(year, month + 1, 0).getDate();
            startDate = `${year}-${String(month + 1).padStart(2, "0")}-16`;
            endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        }
        applyFilters();
    }

    function setCurrentMonth() {
        const d = new Date();
        const year = d.getFullYear();
        const month = d.getMonth();
        const lastDay = new Date(year, month + 1, 0).getDate();
        startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
        endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        applyFilters();
    }

    function setPreviousMonth() {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        const year = d.getFullYear();
        const month = d.getMonth();
        const lastDay = new Date(year, month + 1, 0).getDate();
        startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
        endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        applyFilters();
    }

    async function applyFilters() {
        isSyncing = true;
        const params = new URLSearchParams();
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        if (selectedBranch) params.set("branch_id", selectedBranch);
        await goto(`?${params.toString()}`);
        isSyncing = false;
    }

    // Filtrado de documentos en memoria
    const filteredItems = $derived.by(() => {
        let list: any[] = data.reportData || [];

        // Filtro por tipo de documento
        if (selectedType === "ANULADAS") {
            list = list.filter((i) => Number(i.anulado) === 1 || String(i.status) === "3");
        } else if (selectedType !== "ALL") {
            list = list.filter((i) => {
                if (Number(i.anulado) === 1 || String(i.status) === "3") return false;
                return i.tipo_doc === selectedType;
            });
        }

        // Búsqueda por texto libre
        if (searchTerm && searchTerm.trim() !== "") {
            const t = searchTerm.trim().toLowerCase();
            list = list.filter(
                (i) =>
                    (i.doc_num && i.doc_num.toLowerCase().includes(t)) ||
                    (i.n_control && i.n_control.toLowerCase().includes(t)) ||
                    (i.cli_des && i.cli_des.toLowerCase().includes(t)) ||
                    (i.rif && i.rif.toLowerCase().includes(t)) ||
                    (i.reporte_z && i.reporte_z.toLowerCase().includes(t)) ||
                    (i.serial_imp && i.serial_imp.toLowerCase().includes(t)) ||
                    (i.num_comprobante_iva && i.num_comprobante_iva.toLowerCase().includes(t)) ||
                    (i.doc_afectado && i.doc_afectado.toLowerCase().includes(t)),
            );
        }

        return list;
    });

    // Detectar dinámicamente si los resultados tienen Reporte Z o Serial de Impresora
    const hasReporteZ = $derived.by(() => {
        const raw: any[] = data.reportData || [];
        return raw.some((i) => i.reporte_z && String(i.reporte_z).trim() !== "");
    });

    const hasSerialImp = $derived.by(() => {
        const raw: any[] = data.reportData || [];
        return raw.some((i) => i.serial_imp && String(i.serial_imp).trim() !== "");
    });

    const hasSeparateRetRows = $derived.by(() => {
        const raw: any[] = data.reportData || [];
        return raw.some((i) => i.tipo_doc === "RET/IVA");
    });

    // Paginación
    const totalPages = $derived(Math.max(1, Math.ceil(filteredItems.length / pageSize)));
    const paginatedItems = $derived(
        filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    );

    $effect(() => {
        const _ = [searchTerm, selectedType, selectedBranch];
        currentPage = 1;
    });

    // Formateadores numéricos en Bolívares (es-VE)
    function formatBs(val: number | string | null | undefined): string {
        const num = Number(val || 0);
        return num.toLocaleString("es-VE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    function formatDate(val: string | Date | null | undefined): string {
        if (!val) return "---";
        try {
            const str = String(val).split("T")[0];
            const parts = str.split("-");
            if (parts.length === 3) {
                return `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
            return str;
        } catch {
            return String(val);
        }
    }

    // Totales calculados de los ítems actualmente filtrados
    const currentTotals = $derived.by(() => {
        let totalNeto = 0;
        let totalExento = 0;
        let totalBaseGeneral = 0;
        let totalDebitoGeneral = 0;
        let totalIvaRetenido = 0;

        for (const item of filteredItems) {
            const isAnulada = Number(item.anulado) === 1 || String(item.status) === "3";
            if (isAnulada) continue;

            totalNeto += Number(item.total_neto || 0);
            totalExento += Number(item.ventas_exentas || 0);
            totalBaseGeneral += Number(item.base_general || 0);
            totalDebitoGeneral += Number(item.imp_general || 0);

            if (hasSeparateRetRows) {
                if (item.tipo_doc === "RET/IVA") {
                    totalIvaRetenido += Number(item.iva_retenido || 0);
                }
            } else {
                totalIvaRetenido += Number(item.iva_retenido || 0);
            }
        }

        return {
            totalNeto,
            totalExento,
            totalBaseGeneral,
            totalDebitoGeneral,
            totalIvaRetenido,
        };
    });

    // Exportar a Excel (.xlsx) estructurado
    function exportToExcel() {
        const rawItems: any[] = data.reportData || [];
        if (!rawItems || rawItems.length === 0) return;

        const comp: any = data.company || {};
        const branchConfig: any = (data.selectedBranch && data.selectedBranch.id !== 'all')
            ? data.selectedBranch
            : (data.branches?.[0] || {});

        const empName = (branchConfig.business_name && branchConfig.business_name.trim())
            || (comp.emp_des && comp.emp_des.trim())
            || branchConfig.name
            || (data.selectedBranch?.name ?? "EMPRESA");
        const empRif = (branchConfig.rif && branchConfig.rif.trim())
            || (comp.rif && comp.rif.trim())
            || "";
        const empDir = (branchConfig.address && branchConfig.address.trim())
            || (comp.direc && comp.direc.trim())
            || "";

        // Encabezado institucional
        const rows: any[][] = [
            [empName],
            [`RIF: ${empRif}`],
            [`DIRECCIÓN: ${empDir}`],
            ["LIBRO DE VENTAS"],
            [`PERÍODO: DESDE ${formatDate(startDate)} HASTA ${formatDate(endDate)}`],
            [`SEDE: ${data.selectedBranch?.name || "TODAS LAS SEDES (UNIFICADO)"}`],
            [], // Fila en blanco
        ];

        // Fila de encabezados de la tabla
        const headerRow: string[] = [
            "Oper. Nro.",
            "Fecha",
            "Tipo Doc",
            ...(data.hasMultipleBranches ? ["Sede"] : []),
            "RIF / Cédula",
            "Nombre o Razón Social",
            "Nro. Comp. Retención IVA",
            "Nro. Factura / Fiscal",
            "Nro. Nota Débito",
            "Nro. Nota Crédito",
            "Nro. Control",
            ...(hasReporteZ ? ["Reporte Z"] : []),
            ...(hasSerialImp ? ["Serial Impresora"] : []),
            "Tipo Trans.",
            "Factura Afectada",
            "Total Ventas mas Impuesto",
            "Ventas Exentas",
            "Base Imponible General (16%)",
            "% Alícuota",
            "Débito Fiscal General",
            "IVA Retenido por Comprador",
        ];
        rows.push(headerRow);

        // Filas de datos
        for (const item of rawItems) {
            const isAnulada = Number(item.anulado) === 1 || String(item.status) === "3";
            const isRetRow = item.tipo_doc === "RET/IVA";
            const rowIvaRetenido = isAnulada
                ? 0
                : (hasSeparateRetRows && !isRetRow)
                    ? 0
                    : Number(item.iva_retenido || 0);
            const compIva = (hasSeparateRetRows && !isRetRow)
                ? ""
                : (item.num_comprobante_iva || "");

            const rowData: any[] = [
                item.oper_nro,
                formatDate(item.fec_emis),
                item.tipo_doc,
                ...(data.hasMultipleBranches ? [item.sede_nombre || ""] : []),
                item.rif || "",
                isAnulada ? "ANULADA" : item.cli_des || "",
                compIva,
                item.tipo_doc === "FAC" ? (item.comp_fiscal_desde || item.doc_num) : "",
                item.tipo_doc === "ND" ? item.doc_num : "",
                item.tipo_doc === "NC" ? item.doc_num : "",
                item.n_control || "",
                ...(hasReporteZ ? [item.reporte_z || ""] : []),
                ...(hasSerialImp ? [item.serial_imp || ""] : []),
                isAnulada ? "03-ANUL" : isRetRow ? "02-RET" : "01-REG",
                item.doc_afectado || "",
                isAnulada ? 0 : Number(item.total_neto || 0),
                isAnulada ? 0 : Number(item.ventas_exentas || 0),
                isAnulada ? 0 : Number(item.base_general || 0),
                isAnulada ? "0%" : "16,00%",
                isAnulada ? 0 : Number(item.imp_general || 0),
                rowIvaRetenido,
            ];
            rows.push(rowData);
        }

        // Fila de Totales de la Tabla
        const k = data.kpis || {};
        rows.push([]);
        const totalRow: any[] = [
            "TOTALES GENERALES",
            "",
            "",
            ...(data.hasMultipleBranches ? [""] : []),
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            ...(hasReporteZ ? [""] : []),
            ...(hasSerialImp ? [""] : []),
            "",
            "",
            Number(k.total_ventas || 0),
            Number(k.total_exento || 0),
            Number(k.total_base_general || 0),
            "",
            Number(k.total_debito_general || 0),
            Number(k.total_iva_retenido || 0),
        ];
        rows.push(totalRow);

        // Resumen del Período (SENIAT) al pie
        rows.push([]);
        rows.push(["RESUMEN DEL PERÍODO (SENIAT)", "", "Base Imponible", "Débito Fiscal", "IVA Retenido"]);
        rows.push(["Total Ventas Internas No Gravadas (Exentas)", "", Number(k.total_exento || 0), 0, ""]);
        rows.push(["De las Ventas de Exportación", "", 0, 0, ""]);
        rows.push(["De las Ventas Internas Afectas solo Alícuota General 16%", "", Number(k.total_base_general || 0), Number(k.total_debito_general || 0), ""]);
        rows.push(["De las Ventas Internas Afectas en Alícuota Reducida 8%", "", Number(k.total_base_reducida || 0), Number(k.total_debito_reducida || 0), ""]);
        rows.push(["De las Ventas Internas Afectas en Alícuota Adicional", "", Number(k.total_base_adicional || 0), Number(k.total_debito_adicional || 0), ""]);
        rows.push(["TOTALES GENERALES", "", Number(k.total_base_imponible_total || 0), Number(k.total_debito_fiscal_total || 0), ""]);
        rows.push(["IVA Retenido por el Comprador", "", "", "", Number(k.total_iva_retenido || 0)]);

        // Crear libro y hoja
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Libro de Ventas");

        const fName = `Libro_de_Ventas_${startDate.replace(/-/g, "")}_a_${endDate.replace(/-/g, "")}.xlsx`;
        XLSX.writeFile(wb, fName);
    }
</script>

<div class="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1750px] mx-auto min-h-screen">
    <!-- HEADER PRINCIPAL -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-subtle pb-5">
        <div>
            <div class="flex items-center gap-2.5 text-xs text-brand-600 dark:text-brand-400 font-bold uppercase tracking-wider mb-1">
                <Receipt size={16} />
                <span>Libro Fiscal de Ventas</span>
                <span class="text-text-muted">•</span>
                <span class="text-text-muted">SENIAT</span>
            </div>
            <h1 class="text-2xl sm:text-3xl font-black text-text-primary tracking-tight">
                Libro de Ventas
            </h1>
            <p class="text-text-muted text-xs sm:text-sm mt-0.5">
                {data.company?.emp_des || "Empresa"} {data.company?.rif ? `(${data.company.rif})` : ""} — Período del <b>{formatDate(startDate)}</b> al <b>{formatDate(endDate)}</b>
            </p>
        </div>

        <div class="flex flex-wrap items-center gap-2.5">
            <button
                onclick={exportToExcel}
                disabled={!data.reportData || data.reportData.length === 0}
                class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Descargar Libro de Ventas en formato Excel (.xlsx)"
            >
                <FileSpreadsheet size={16} />
                Exportar Excel (.xlsx)
            </button>
        </div>
    </div>

    <!-- ERROR ALERT SI HUBIERE -->
    {#if data.error}
        <div class="bg-red-500/10 border border-red-500/30 text-red-500 p-5 rounded-2xl flex items-start gap-3">
            <AlertTriangle size={22} class="shrink-0 mt-0.5" />
            <div>
                <h3 class="font-bold text-sm">Error al generar Libro de Ventas</h3>
                <p class="text-xs opacity-90 mt-0.5">{data.error}</p>
            </div>
        </div>
    {/if}

    <!-- FILTROS DE CONSULTA (SEDE Y FECHAS) -->
    <div class="bg-surface-raised border border-border-subtle rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div class="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            <!-- Selector de Sucursales -->
            <div class="flex flex-wrap items-center gap-3">
                {#if data.hasMultipleBranches}
                    <div class="w-full sm:w-64">
                        <Combobox
                            options={branchesOptions}
                            value={selectedBranch}
                            placeholder="Seleccionar Sede..."
                            buttonClass="h-9 text-xs"
                            onchange={(val: string) => {
                                selectedBranch = val;
                                applyFilters();
                            }}
                        />
                    </div>
                {:else if data.branches && data.branches.length === 1}
                    <div class="flex items-center gap-2 px-3 py-2 bg-surface-sunken border border-border-subtle rounded-xl text-xs font-bold text-text-primary">
                        <Building size={14} class="text-brand-500" />
                        <span>{data.branches[0].name}</span>
                    </div>
                {/if}

                <!-- Rango de Fechas -->
                <div class="flex items-center gap-2">
                    <div class="relative">
                        <input
                            type="date"
                            bind:value={startDate}
                            class="px-3 py-1.5 bg-surface-sunken border border-border-subtle rounded-xl text-xs font-bold text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                            title="Fecha Inicio"
                        />
                    </div>
                    <span class="text-text-muted text-xs font-bold">a</span>
                    <div class="relative">
                        <input
                            type="date"
                            bind:value={endDate}
                            class="px-3 py-1.5 bg-surface-sunken border border-border-subtle rounded-xl text-xs font-bold text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                            title="Fecha Fin"
                        />
                    </div>
                    <button
                        onclick={applyFilters}
                        disabled={isSyncing}
                        class="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw size={13} class={isSyncing ? "animate-spin" : ""} />
                        <span>Filtrar</span>
                    </button>
                </div>
            </div>

            <!-- Accesos directos a períodos fiscales -->
            <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-[11px] font-bold text-text-muted mr-1">Períodos:</span>
                <button
                    onclick={() => setFortnight(true, false)}
                    class="px-2.5 py-1 bg-surface-sunken hover:bg-surface-raised border border-border-subtle text-[11px] font-bold rounded-lg text-text-secondary transition-colors"
                >
                    1era Quincena
                </button>
                <button
                    onclick={() => setFortnight(false, false)}
                    class="px-2.5 py-1 bg-surface-sunken hover:bg-surface-raised border border-border-subtle text-[11px] font-bold rounded-lg text-text-secondary transition-colors"
                >
                    2da Quincena
                </button>
                <button
                    onclick={setCurrentMonth}
                    class="px-2.5 py-1 bg-surface-sunken hover:bg-surface-raised border border-border-subtle text-[11px] font-bold rounded-lg text-text-secondary transition-colors"
                >
                    Mes Actual
                </button>
                <button
                    onclick={setPreviousMonth}
                    class="px-2.5 py-1 bg-surface-sunken hover:bg-surface-raised border border-border-subtle text-[11px] font-bold rounded-lg text-text-secondary transition-colors"
                >
                    Mes Anterior
                </button>
            </div>
        </div>
    </div>

    <!-- CARDS RESUMEN KPIS FISCALES -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <!-- 1. TOTAL FACTURADO (CON IMPUESTOS) -->
        <div class="bg-surface-raised border border-border-subtle rounded-2xl p-4 relative overflow-hidden group">
            <div class="flex items-center justify-between mb-2">
                <span class="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Total Facturado
                </span>
                <div class="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <TrendingUp size={16} />
                </div>
            </div>
            <p class="text-xl sm:text-2xl font-black text-text-primary">
                Bs. {formatBs(data.kpis?.total_ventas)}
            </p>
            <p class="text-[10px] text-text-muted mt-1">
                Ventas Netas con Impuestos
            </p>
        </div>

        <!-- 2. BASE IMPONIBLE GENERAL (16%) -->
        <div class="bg-surface-raised border border-border-subtle rounded-2xl p-4 relative overflow-hidden group">
            <div class="flex items-center justify-between mb-2">
                <span class="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Base Imponible (16%)
                </span>
                <div class="p-2 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    <Receipt size={16} />
                </div>
            </div>
            <p class="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400">
                Bs. {formatBs(data.kpis?.total_base_general)}
            </p>
            <p class="text-[10px] text-text-muted mt-1">
                Ventas Gravadas Alícuota General
            </p>
        </div>

        <!-- 3. DÉBITO FISCAL (IVA 16%) -->
        <div class="bg-surface-raised border border-border-subtle rounded-2xl p-4 relative overflow-hidden group">
            <div class="flex items-center justify-between mb-2">
                <span class="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Débito Fiscal (IVA)
                </span>
                <div class="p-2 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    <Percent size={16} />
                </div>
            </div>
            <p class="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400">
                Bs. {formatBs(data.kpis?.total_debito_general)}
            </p>
            <p class="text-[10px] text-text-muted mt-1">
                Impuesto IVA Generado
            </p>
        </div>

        <!-- 4. IVA RETENIDO POR CLIENTES -->
        <div class="bg-surface-raised border border-border-subtle rounded-2xl p-4 relative overflow-hidden group">
            <div class="flex items-center justify-between mb-2">
                <span class="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    IVA Retenido (Clientes)
                </span>
                <div class="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <ShieldCheck size={16} />
                </div>
            </div>
            <p class="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400">
                Bs. {formatBs(data.kpis?.total_iva_retenido)}
            </p>
            <p class="text-[10px] text-text-muted mt-1">
                Retenciones Aplicadas por Compradores
            </p>
        </div>

        <!-- 5. VENTAS EXENTAS -->
        <div class="bg-surface-raised border border-border-subtle rounded-2xl p-4 relative overflow-hidden group">
            <div class="flex items-center justify-between mb-2">
                <span class="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Ventas Exentas
                </span>
                <div class="p-2 rounded-xl bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                    <Package size={16} />
                </div>
            </div>
            <p class="text-xl sm:text-2xl font-black text-text-secondary">
                Bs. {formatBs(data.kpis?.total_exento)}
            </p>
            <p class="text-[10px] text-text-muted mt-1">
                Ventas No Gravadas
            </p>
        </div>
    </div>

    <!-- BARRA DE BÚSQUEDA Y FILTRO POR TIPO -->
    <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-surface-raised border border-border-subtle p-3.5 rounded-2xl">
        <div class="flex flex-wrap items-center gap-1.5">
            <button
                onclick={() => (selectedType = "ALL")}
                class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all {selectedType === 'ALL' ? 'bg-brand-600 text-white shadow-xs' : 'text-text-muted hover:text-text-primary'}"
            >
                Todos ({data.kpis?.total_documentos || 0})
            </button>
            <button
                onclick={() => (selectedType = "FAC")}
                class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all {selectedType === 'FAC' ? 'bg-blue-600 text-white shadow-xs' : 'text-text-muted hover:text-text-primary'}"
            >
                Facturas ({data.kpis?.cant_facturas || 0})
            </button>
            <button
                onclick={() => (selectedType = "NC")}
                class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all {selectedType === 'NC' ? 'bg-rose-600 text-white shadow-xs' : 'text-text-muted hover:text-text-primary'}"
            >
                Notas Crédito ({data.kpis?.cant_notas_credito || 0})
            </button>
            <button
                onclick={() => (selectedType = "ND")}
                class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all {selectedType === 'ND' ? 'bg-amber-600 text-white shadow-xs' : 'text-text-muted hover:text-text-primary'}"
            >
                Notas Débito ({data.kpis?.cant_notas_debito || 0})
            </button>
            <button
                onclick={() => (selectedType = "RET/IVA")}
                class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all {selectedType === 'RET/IVA' ? 'bg-emerald-600 text-white shadow-xs' : 'text-text-muted hover:text-text-primary'}"
            >
                Retenciones IVA ({data.kpis?.cant_retenciones || 0})
            </button>
            {#if Number(data.kpis?.cant_anuladas) > 0}
                <button
                    onclick={() => (selectedType = "ANULADAS")}
                    class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all {selectedType === 'ANULADAS' ? 'bg-red-700 text-white shadow-xs' : 'text-red-500 hover:text-red-600'}"
                >
                    Anuladas ({data.kpis?.cant_anuladas})
                </button>
            {/if}
        </div>

        <div class="relative w-full md:w-80">
            <Search size={15} class="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
                type="text"
                bind:value={searchTerm}
                placeholder="Buscar cliente, RIF, doc, control, Z..."
                class="w-full pl-9 pr-8 py-2 bg-surface-sunken border border-border-subtle rounded-xl text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {#if searchTerm}
                <button
                    onclick={() => (searchTerm = "")}
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                    <X size={14} />
                </button>
            {/if}
        </div>
    </div>

    <!-- TABLA DE DOCUMENTOS FISCALES -->
    <div class="bg-surface-raised border border-border-subtle rounded-2xl overflow-hidden shadow-xs">
        <div class="overflow-x-auto max-h-[650px] relative">
            <table class="w-full text-left border-collapse text-[11px] whitespace-nowrap">
                <thead class="sticky top-0 z-20 bg-surface-sunken/95 backdrop-blur-xs border-b border-border-subtle text-[10px] font-black uppercase text-text-muted tracking-wider shadow-xs">
                    <tr>
                        <th class="py-3 px-3">Oper.</th>
                        <th class="py-3 px-3">Fecha</th>
                        <th class="py-3 px-2 text-center">Tipo</th>
                        {#if data.hasMultipleBranches}
                            <th class="py-3 px-3">Sede</th>
                        {/if}
                        <th class="py-3 px-3">RIF / Cédula</th>
                        <th class="py-3 px-3">Razón Social</th>
                        <th class="py-3 px-3">Nro. Factura</th>
                        <th class="py-3 px-3">Nro. Control</th>
                        <th class="py-3 px-3">Doc. Afectado</th>
                        {#if hasReporteZ}
                            <th class="py-3 px-3">Reporte Z</th>
                        {/if}
                        {#if hasSerialImp}
                            <th class="py-3 px-3">Serial Imp.</th>
                        {/if}
                        <th class="py-3 px-3 text-right">Total c/IVA (Bs.)</th>
                        <th class="py-3 px-3 text-right">Exento (Bs.)</th>
                        <th class="py-3 px-3 text-right">Base Imponible (Bs.)</th>
                        <th class="py-3 px-2 text-center">% IVA</th>
                        <th class="py-3 px-3 text-right">Débito Fiscal (Bs.)</th>
                        <th class="py-3 px-3 text-right">IVA Retenido (Bs.)</th>
                        <th class="py-3 px-3">Nro. Comp. Ret.</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle/50 text-text-primary">
                    {#if paginatedItems.length === 0}
                        <tr>
                            <td colspan={20} class="py-12 text-center text-text-muted">
                                <Receipt size={32} class="mx-auto mb-2 opacity-40" />
                                <p class="text-xs font-bold">No se encontraron documentos fiscales en este período.</p>
                            </td>
                        </tr>
                    {:else}
                        {#each paginatedItems as row}
                            {@const isAnulada = Number(row.anulado) === 1 || String(row.status) === "3"}
                            <tr class="hover:bg-surface-sunken/50 transition-colors {isAnulada ? 'bg-red-500/5 text-red-600 dark:text-red-400' : ''}">
                                <td class="py-2.5 px-3 font-mono font-bold text-text-muted">{row.oper_nro}</td>
                                <td class="py-2.5 px-3 font-mono">{formatDate(row.fec_emis)}</td>
                                <td class="py-2.5 px-2 text-center">
                                    {#if isAnulada}
                                        <span class="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-red-500/15 text-red-600 border border-red-500/30">
                                            ANUL
                                        </span>
                                    {:else if row.tipo_doc === 'FAC'}
                                        <span class="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                            FAC
                                        </span>
                                    {:else if row.tipo_doc === 'NC'}
                                        <span class="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                            NC
                                        </span>
                                    {:else if row.tipo_doc === 'ND'}
                                        <span class="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                            ND
                                        </span>
                                    {:else if row.tipo_doc === 'RET/IVA'}
                                        <span class="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                            RET/IVA
                                        </span>
                                    {:else}
                                        <span class="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-slate-500/15 text-slate-600 border border-slate-500/20">
                                            {row.tipo_doc}
                                        </span>
                                    {/if}
                                </td>
                                {#if data.hasMultipleBranches}
                                    <td class="py-2.5 px-3 text-text-secondary text-[11px] font-bold whitespace-nowrap" title={row.sede_nombre}>
                                        {row.sede_nombre}
                                    </td>
                                {/if}
                                <td class="py-2.5 px-3 font-mono font-bold text-text-secondary">{row.rif || "---"}</td>
                                <td class="py-2.5 px-3 font-bold max-w-[240px] truncate" title={row.cli_des}>
                                    {row.cli_des}
                                </td>
                                <td class="py-2.5 px-3 font-mono font-bold">
                                    {row.comp_fiscal_desde || row.doc_num}
                                </td>
                                <td class="py-2.5 px-3 font-mono text-text-secondary">
                                    {row.n_control || "---"}
                                </td>
                                <td class="py-2.5 px-3 font-mono text-text-muted">
                                    {row.doc_afectado || "---"}
                                </td>
                                {#if hasReporteZ}
                                    <td class="py-2.5 px-3 font-mono text-text-muted">
                                        {row.reporte_z || "---"}
                                    </td>
                                {/if}
                                {#if hasSerialImp}
                                    <td class="py-2.5 px-3 font-mono text-text-muted">
                                        {row.serial_imp || "---"}
                                    </td>
                                {/if}
                                <td class="py-2.5 px-3 text-right font-mono font-bold {isAnulada ? 'line-through opacity-50' : Number(row.total_neto) < 0 ? 'text-rose-500' : ''}">
                                    {formatBs(row.total_neto)}
                                </td>
                                <td class="py-2.5 px-3 text-right font-mono text-text-secondary {isAnulada ? 'line-through opacity-50' : ''}">
                                    {formatBs(row.ventas_exentas)}
                                </td>
                                <td class="py-2.5 px-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400 {isAnulada ? 'line-through opacity-50' : ''}">
                                    {formatBs(row.base_general)}
                                </td>
                                <td class="py-2.5 px-2 text-center font-mono text-text-muted text-[10px]">
                                    {isAnulada ? '0%' : '16%'}
                                </td>
                                <td class="py-2.5 px-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400 {isAnulada ? 'line-through opacity-50' : ''}">
                                    {formatBs(row.imp_general)}
                                </td>
                                <td class="py-2.5 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400 {isAnulada ? 'line-through opacity-50' : ''}">
                                    {formatBs(hasSeparateRetRows && row.tipo_doc !== 'RET/IVA' ? 0 : row.iva_retenido)}
                                </td>
                                <td class="py-2.5 px-3 font-mono text-[10px] text-text-muted truncate max-w-[130px]" title={row.num_comprobante_iva}>
                                    {(hasSeparateRetRows && row.tipo_doc !== 'RET/IVA') ? '---' : (row.num_comprobante_iva || '---')}
                                </td>
                            </tr>
                        {/each}
                    {/if}
                </tbody>
                <!-- FILA DE TOTALES AL PIE DE LA TABLA -->
                {#if paginatedItems.length > 0}
                    <tfoot class="sticky bottom-0 bg-surface-sunken/95 backdrop-blur-xs border-t-2 border-border-subtle font-black text-text-primary">
                        <tr>
                            <td colspan={data.hasMultipleBranches ? 6 : 5} class="py-3 px-3 uppercase text-[10px] tracking-wider">
                                Subtotales Página ({filteredItems.length} Docs)
                            </td>
                            <td colspan={3 + (hasReporteZ ? 1 : 0) + (hasSerialImp ? 1 : 0)}></td>
                            <td class="py-3 px-3 text-right font-mono text-xs">
                                Bs. {formatBs(currentTotals.totalNeto)}
                            </td>
                            <td class="py-3 px-3 text-right font-mono text-xs text-text-secondary">
                                Bs. {formatBs(currentTotals.totalExento)}
                            </td>
                            <td class="py-3 px-3 text-right font-mono text-xs text-blue-600 dark:text-blue-400">
                                Bs. {formatBs(currentTotals.totalBaseGeneral)}
                            </td>
                            <td></td>
                            <td class="py-3 px-3 text-right font-mono text-xs text-indigo-600 dark:text-indigo-400">
                                Bs. {formatBs(currentTotals.totalDebitoGeneral)}
                            </td>
                            <td class="py-3 px-3 text-right font-mono text-xs text-amber-600 dark:text-amber-400">
                                Bs. {formatBs(currentTotals.totalIvaRetenido)}
                            </td>
                            <td></td>
                        </tr>
                    </tfoot>
                {/if}
            </table>
        </div>

        <!-- PAGINACIÓN -->
        {#if totalPages > 1}
            <div class="flex items-center justify-between p-3.5 border-t border-border-subtle text-xs bg-surface-raised">
                <span class="text-text-muted">
                    Mostrando <b>{(currentPage - 1) * pageSize + 1}</b> a <b>{Math.min(currentPage * pageSize, filteredItems.length)}</b> de <b>{filteredItems.length}</b> documentos
                </span>
                <div class="flex items-center gap-1.5">
                    <button
                        onclick={() => (currentPage = Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        class="p-1.5 rounded-lg border border-border-subtle hover:bg-surface-sunken disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span class="px-2 font-bold text-text-primary">
                        {currentPage} / {totalPages}
                    </span>
                    <button
                        onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        class="p-1.5 rounded-lg border border-border-subtle hover:bg-surface-sunken disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        {/if}
    </div>

    <!-- CUADRO RESUMEN DEL PERÍODO (ESTRUCTURA SENIAT) -->
    <div class="bg-surface-raised border border-border-subtle rounded-2xl p-5 shadow-xs space-y-4">
        <div class="flex items-center justify-between border-b border-border-subtle pb-3">
            <div class="flex items-center gap-2">
                <Receipt size={18} class="text-brand-500" />
                <h3 class="text-sm font-black text-text-primary uppercase tracking-wider">
                    Resumen del Período Fiscal (SENIAT)
                </h3>
            </div>
            <span class="text-xs text-text-muted font-bold">
                Cálculo acumulado oficial del período
            </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <!-- TABLA DESGLOSE IMPOSITIVO -->
            <div class="border border-border-subtle rounded-xl overflow-hidden">
                <table class="w-full text-left divide-y divide-border-subtle">
                    <thead class="bg-surface-sunken text-[10px] font-black uppercase text-text-muted">
                        <tr>
                            <th class="py-2.5 px-3">Concepto Fiscal</th>
                            <th class="py-2.5 px-3 text-right">Base Imponible</th>
                            <th class="py-2.5 px-3 text-right">Débito Fiscal</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border-subtle font-mono text-[11px]">
                        <tr>
                            <td class="py-2 px-3 font-sans text-text-secondary">Total Ventas Internas No Gravadas (Exentas)</td>
                            <td class="py-2 px-3 text-right font-bold">Bs. {formatBs(data.kpis?.total_exento)}</td>
                            <td class="py-2 px-3 text-right text-text-muted">0,00</td>
                        </tr>
                        <tr>
                            <td class="py-2 px-3 font-sans text-text-secondary">De las Ventas de Exportación</td>
                            <td class="py-2 px-3 text-right text-text-muted">0,00</td>
                            <td class="py-2 px-3 text-right text-text-muted">0,00</td>
                        </tr>
                        <tr class="bg-blue-500/5">
                            <td class="py-2 px-3 font-sans font-bold text-blue-600 dark:text-blue-400">Ventas Internas Alícuota General (16%)</td>
                            <td class="py-2 px-3 text-right font-bold text-blue-600 dark:text-blue-400">Bs. {formatBs(data.kpis?.total_base_general)}</td>
                            <td class="py-2 px-3 text-right font-bold text-indigo-600 dark:text-indigo-400">Bs. {formatBs(data.kpis?.total_debito_general)}</td>
                        </tr>
                        <tr>
                            <td class="py-2 px-3 font-sans text-text-secondary">Ventas Internas Alícuota Reducida (8%)</td>
                            <td class="py-2 px-3 text-right font-bold">Bs. {formatBs(data.kpis?.total_base_reducida)}</td>
                            <td class="py-2 px-3 text-right font-bold">Bs. {formatBs(data.kpis?.total_debito_reducida)}</td>
                        </tr>
                        <tr>
                            <td class="py-2 px-3 font-sans text-text-secondary">Ventas Internas Alícuota Adicional</td>
                            <td class="py-2 px-3 text-right font-bold">Bs. {formatBs(data.kpis?.total_base_adicional)}</td>
                            <td class="py-2 px-3 text-right font-bold">Bs. {formatBs(data.kpis?.total_debito_adicional)}</td>
                        </tr>
                    </tbody>
                    <tfoot class="bg-surface-sunken font-black font-mono text-xs border-t-2 border-border-subtle">
                        <tr>
                            <td class="py-2.5 px-3 font-sans uppercase text-[10px]">TOTALES GENERALES</td>
                            <td class="py-2.5 px-3 text-right text-brand-600 dark:text-brand-400">
                                Bs. {formatBs(data.kpis?.total_base_imponible_total)}
                            </td>
                            <td class="py-2.5 px-3 text-right text-indigo-600 dark:text-indigo-400">
                                Bs. {formatBs(data.kpis?.total_debito_fiscal_total)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <!-- TABLA RETENCIONES Y RESUMEN DOCUMENTOS -->
            <div class="space-y-4">
                <div class="border border-border-subtle rounded-xl p-4 bg-amber-500/5 border-amber-500/20 space-y-2">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                            Total IVA Retenido por Compradores
                        </span>
                        <ShieldCheck size={18} class="text-amber-600" />
                    </div>
                    <p class="text-2xl font-black font-mono text-amber-700 dark:text-amber-400">
                        Bs. {formatBs(data.kpis?.total_iva_retenido)}
                    </p>
                    <p class="text-[10px] text-text-muted">
                        Monto total de retenciones enteradas por clientes en comprobantes recibidos en el período.
                    </p>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-center">
                    <div class="p-2.5 bg-surface-sunken border border-border-subtle rounded-xl">
                        <p class="text-[10px] font-bold text-text-muted uppercase">Facturas</p>
                        <p class="text-base font-black text-blue-600">{data.kpis?.cant_facturas || 0}</p>
                    </div>
                    <div class="p-2.5 bg-surface-sunken border border-border-subtle rounded-xl">
                        <p class="text-[10px] font-bold text-text-muted uppercase">Notas Crédito</p>
                        <p class="text-base font-black text-rose-600">{data.kpis?.cant_notas_credito || 0}</p>
                    </div>
                    <div class="p-2.5 bg-surface-sunken border border-border-subtle rounded-xl">
                        <p class="text-[10px] font-bold text-text-muted uppercase">Notas Débito</p>
                        <p class="text-base font-black text-amber-600">{data.kpis?.cant_notas_debito || 0}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
