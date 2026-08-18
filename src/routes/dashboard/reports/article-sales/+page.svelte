<!-- src/routes/dashboard/reports/article-sales/+page.svelte -->
<script lang="ts">
    import { fade, slide } from "svelte/transition";
    import {
        Store,
        Building,
        Filter,
        RefreshCw,
        AlertTriangle,
        Search,
        Printer,
        FileSpreadsheet,
        Tag,
        Layers,
        ClipboardList,
        ShoppingBag,
        Calendar,
        X,
        CheckCircle,
        FileText,
    } from "lucide-svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import Combobox from "$lib/components/ui/Combobox.svelte";
    import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";
    import dayjs from "dayjs";
    import "dayjs/locale/es";

    let { data } = $props();

    dayjs.locale("es");

    let isSearching = $state(false);

    // Rango de fechas por defecto: mes en curso
    const today = new Date();
    const defaultDesde = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const defaultHasta = today.toISOString().split('T')[0];

    // Filter states
    let filterBranch = $state(data.selectedBranchId || '');
    let filterSearch = $state('');
    let filterLine = $state('');
    let filterSubline = $state('');
    let filterCategory = $state('');
    let startDate = $state(data.startDate || defaultDesde);
    let endDate = $state(data.endDate || defaultHasta);

    // Advanced toggle filters
    let filterMinSales = $state('all'); // 'all' | 'positive' | 'negative' | 'zero'
    let filterEstatus = $state('all'); // 'all' | 'active' | 'inactive'

    // Derived options with dynamic cascaded filtering
    const lineasOptions = $derived(
        (data.catalogs?.lineas || []).map((l: any) => ({
            value: (l.co_lin || "").trim(),
            label: l.lin_des ? `${l.lin_des.trim()} (${l.co_lin.trim()})` : l.co_lin,
        })),
    );

    const sublineasOptions = $derived(
        (data.catalogs?.sublineas || [])
            .filter(
                (sl: any) =>
                    !filterLine ||
                    filterLine === "all" ||
                    (sl.co_lin && sl.co_lin.trim() === filterLine.trim()),
            )
            .map((sl: any) => ({
                value: (sl.co_subl || "").trim(),
                label: sl.subl_des ? `${sl.subl_des.trim()} (${sl.co_subl.trim()})` : sl.co_subl,
            })),
    );

    const categoriasOptions = $derived.by(() => {
        const cats: any[] = data.catalogs?.categorias || [];
        const reportCats = (data.report?.data || []).map((a: any) => ({
            co_cat: a.co_cat,
            cat_des: a.des_cat,
            co_subl: a.co_subl,
            co_lin: a.co_lin,
        }));
        const combined = [...cats, ...reportCats];

        let filtered = combined;
        if (filterSubline && filterSubline !== "all") {
            filtered = filtered.filter(
                (c: any) =>
                    c.co_subl &&
                    c.co_subl.trim() === filterSubline.trim(),
            );
        } else if (filterLine && filterLine !== "all") {
            filtered = filtered.filter(
                (c: any) =>
                    c.co_lin &&
                    c.co_lin.trim() === filterLine.trim(),
            );
        }

        const seen = new Set();
        const result: { value: string; label: string }[] = [];
        for (const c of filtered) {
            const val = (c.co_cat || "").trim();
            if (val && !seen.has(val)) {
                seen.add(val);
                const desc = (c.cat_des || val).trim();
                result.push({
                    value: val,
                    label: desc ? `${desc} (${val})` : val,
                });
            }
        }
        result.sort((a, b) => a.label.localeCompare(b.label));
        return result;
    });

    // Auto-limpiar sublínea si la línea cambia y ya no pertenece
    $effect(() => {
        if (filterLine && filterLine !== "all" && filterSubline && filterSubline !== "all") {
            const valid = (data.catalogs?.sublineas || []).some(
                (sl: any) =>
                    sl.co_lin &&
                    sl.co_lin.trim() === filterLine.trim() &&
                    sl.co_subl &&
                    sl.co_subl.trim() === filterSubline.trim(),
            );
            if (!valid) {
                filterSubline = "";
            }
        }
    });

    // Auto-limpiar categoría si la sublínea o línea cambia y ya no pertenece
    $effect(() => {
        if (filterCategory && filterCategory !== "all" && ((filterSubline && filterSubline !== "all") || (filterLine && filterLine !== "all"))) {
            const valid = categoriasOptions.some(
                (c) => c.value.trim() === filterCategory.trim(),
            );
            if (!valid) {
                filterCategory = "";
            }
        }
    });

    // Sync filter states with URL search params
    $effect(() => {
        filterBranch =
            $page.url.searchParams.get("branch_id") ||
            data.selectedBranchId ||
            "";
        filterSearch = $page.url.searchParams.get("search") || "";
        filterLine = $page.url.searchParams.get("linea") || "";
        filterSubline = $page.url.searchParams.get("sublinea") || "";
        filterCategory = $page.url.searchParams.get("categoria") || "";
        startDate = $page.url.searchParams.get("fecha_desde") || data.startDate || defaultDesde;
        endDate = $page.url.searchParams.get("fecha_hasta") || data.endDate || defaultHasta;
    });

    function setPresetDate(preset: 'today' | 'month' | 'prev_month' | 'year') {
        const now = dayjs();
        if (preset === 'today') {
            startDate = now.format('YYYY-MM-DD');
            endDate = now.format('YYYY-MM-DD');
        } else if (preset === 'month') {
            startDate = now.startOf('month').format('YYYY-MM-DD');
            endDate = now.format('YYYY-MM-DD');
        } else if (preset === 'prev_month') {
            const prev = now.subtract(1, 'month');
            startDate = prev.startOf('month').format('YYYY-MM-DD');
            endDate = prev.endOf('month').format('YYYY-MM-DD');
        } else if (preset === 'year') {
            startDate = now.startOf('year').format('YYYY-MM-DD');
            endDate = now.format('YYYY-MM-DD');
        }
        applyFilters();
    }

    function applyFilters() {
        isSearching = true;
        const params = new URLSearchParams($page.url.searchParams);

        if (filterBranch && filterBranch !== "all") {
            params.set("branch_id", filterBranch);
        } else {
            params.delete("branch_id");
        }

        if (filterSearch.trim()) {
            params.set("search", filterSearch.trim());
        } else {
            params.delete("search");
        }

        if (filterLine && filterLine !== "all") {
            params.set("linea", filterLine);
        } else {
            params.delete("linea");
        }

        if (filterSubline && filterSubline !== "all") {
            params.set("sublinea", filterSubline);
        } else {
            params.delete("sublinea");
        }

        if (filterCategory && filterCategory !== "all") {
            params.set("categoria", filterCategory);
        } else {
            params.delete("categoria");
        }

        if (startDate) {
            params.set("fecha_desde", startDate);
        } else {
            params.delete("fecha_desde");
        }

        if (endDate) {
            params.set("fecha_hasta", endDate);
        } else {
            params.delete("fecha_hasta");
        }

        // Reset to page 1 if applicable
        params.delete("page");

        goto(`?${params.toString()}`).finally(() => {
            isSearching = false;
        });
    }

    function clearFilters() {
        filterSearch = '';
        filterLine = '';
        filterSubline = '';
        filterCategory = '';
        startDate = defaultDesde;
        endDate = defaultHasta;
        filterMinSales = 'all';
        filterEstatus = 'all';
        applyFilters();
    }

    // Process report data and calculate stats
    const reportData = $derived(data.report?.data || []);

    const filteredReportData = $derived.by(() => {
        return reportData.filter(item => {
            const net = Number(item.cant_real_vendida) || 0;

            // Filtro por ventas netas
            if (filterMinSales === 'positive' && net <= 0) return false;
            if (filterMinSales === 'negative' && net >= 0) return false;
            if (filterMinSales === 'zero' && net !== 0) return false;

            // Estatus del artículo
            if (filterEstatus === 'active' && item.anulado) return false;
            if (filterEstatus === 'inactive' && !item.anulado) return false;

            return true;
        });
    });

    const stats = $derived.by(() => {
        const total = filteredReportData.length;
        let sumFacturada = 0;
        let sumDevuelta = 0;
        let sumRealVendida = 0;
        let sumDocsFacturados = 0;
        let sumDocsDevueltos = 0;
        let sumDocsExitosos = 0;

        for (const item of filteredReportData) {
            sumFacturada += Number(item.cant_facturada) || 0;
            sumDevuelta += Number(item.cant_devuelta) || 0;
            sumRealVendida += Number(item.cant_real_vendida) || 0;
            sumDocsFacturados += Number(item.docs_facturados) || 0;
            sumDocsDevueltos += Number(item.docs_devueltos) || 0;
            sumDocsExitosos += Number(item.docs_exitosos) || 0;
        }

        return {
            total,
            sumFacturada,
            sumDevuelta,
            sumRealVendida,
            sumDocsFacturados,
            sumDocsDevueltos,
            sumDocsExitosos,
        };
    });

    // Formatting helpers
    function formatQuantity(val: number | string) {
        const num = Number(val);
        if (isNaN(num)) return '0,00';
        return num.toLocaleString('de-DE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    // Excel exporting (CSV with semicolon separators for Spanish Excel compatibility)
    function exportToExcel() {
        if (filteredReportData.length === 0) return;

        // Start with UTF-8 BOM and sep=; directive for Excel
        let csvContent = '\uFEFFsep=;\n';
        csvContent +=
            "Codigo;Descripcion;Linea;Sublinea;Categoria;Modelo;Referencia;Cant. Facturada;Cant. Devuelta;Cant. Real Vendida;Docs. Exitosos;Estatus\n";

        for (const item of filteredReportData) {
            const co_art = `="${String(item.co_art || "")
                .trim()
                .replace(/"/g, '""')}"`;
            const art_des = `"${String(item.art_des || "")
                .trim()
                .replace(/"/g, '""')}"`;
            const des_lin = `"${String(item.des_lin || "").trim().replace(/"/g, '""')}"`;
            const des_subl = `"${String(item.des_subl || "").trim().replace(/"/g, '""')}"`;
            const des_cat = `"${String(item.des_cat || "").trim().replace(/"/g, '""')}"`;
            const modelo = `"${String(item.modelo || "").trim().replace(/"/g, '""')}"`;
            const referencia = `"${String(item.referencia || "").trim().replace(/"/g, '""')}"`;

            // Format decimals using commas for Spanish Excel compatibility
            const cant_facturada = (Number(item.cant_facturada) || 0)
                .toFixed(2)
                .replace(".", ",");
            const cant_devuelta = (Number(item.cant_devuelta) || 0)
                .toFixed(2)
                .replace(".", ",");
            const cant_real_vendida = (Number(item.cant_real_vendida) || 0)
                .toFixed(2)
                .replace(".", ",");
            const docs_exitosos = Number(item.docs_exitosos) || 0;
            const statusLabel = item.anulado ? "Inactivo" : "Activo";

            csvContent += `${co_art};${art_des};${des_lin};${des_subl};${des_cat};${modelo};${referencia};${cant_facturada};${cant_devuelta};${cant_real_vendida};${docs_exitosos};${statusLabel}\n`;
        }

        const blob = new Blob([csvContent], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const branchName =
            data.branches.find((b: any) => b.id === filterBranch)?.name ||
            "general";
        const formattedBranch = branchName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_");
        const filename = `reporte_cantidades_vendidas_${formattedBranch}_${dayjs(startDate).format("YYYYMMDD")}_a_${dayjs(endDate).format("YYYYMMDD")}.csv`;

        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
</script>

<div class="space-y-8 print:space-y-4" in:fade>
    {#if data.error}
        <div
            class="glass border-red-500/20 p-6 rounded-3xl flex items-center gap-6 bg-red-500/5 shadow-xl shadow-red-500/10 print:hidden"
            in:slide
        >
            <div
                class="h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0"
            >
                <AlertTriangle size={24} />
            </div>
            <div class="flex-1">
                <h3
                    class="text-sm font-black text-red-500 uppercase tracking-widest mb-1"
                >
                    Error de Comunicación
                </h3>
                <p class="text-text-muted font-bold text-sm leading-relaxed">
                    {data.error}
                </p>
            </div>
            <button
                onclick={() => window.location.reload()}
                class="px-5 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-xs font-black transition-all cursor-pointer"
                >Reintentar</button
            >
        </div>
    {/if}

    <!-- TOP HEADER -->
    <div
        class="flex flex-col lg:flex-row lg:items-center justify-between gap-6 print:flex-row print:justify-between"
    >
        <div class="flex flex-col gap-2">
            <h1
                class="text-4xl font-black tracking-tight flex items-center gap-3 print:text-2xl"
            >
                <ShoppingBag
                    size={40}
                    class="text-brand-500 print:h-8 print:w-8"
                />
                Cantidad Real Vendida
            </h1>
            <p class="text-text-muted text-lg print:text-xs">
                Resumen de cantidades vendidas o facturadas restando las devoluciones por artículo en un rango de fechas.
            </p>
            <div class="hidden print:block text-[10px] text-text-muted">
                <span>Sucursal: <strong>{data.branches.find((b: any) => b.id === filterBranch)?.name || "General"}</strong></span>
                <span class="mx-2">|</span>
                <span>Rango: <strong>{dayjs(startDate).format("DD/MM/YYYY")} al {dayjs(endDate).format("DD/MM/YYYY")}</strong></span>
                <span class="mx-2">|</span>
                <span>Generado el: <strong>{dayjs().format("DD/MM/YYYY hh:mm A")}</strong></span>
            </div>
        </div>

        <div class="flex items-center gap-3 print:hidden">
            <button
                onclick={exportToExcel}
                disabled={reportData.length === 0}
                class="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-black rounded-xl shadow-lg shadow-brand-600/20 hover:shadow-brand-500/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar a Excel (CSV)"
            >
                <FileSpreadsheet size={16} />
                Exportar Excel
            </button>
        </div>
    </div>

    <!-- METRICS CARDS -->
    <div
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-5 print:grid-cols-5 print:gap-3"
    >
        <!-- Card 1: Artículos con Actividad -->
        <div
            class="bg-surface-raised border border-border-subtle hover:border-brand-500/30 transition-all rounded-3xl p-5 relative overflow-hidden group print:p-3 print:rounded-xl"
        >
            <div
                class="absolute right-0 top-0 w-28 h-28 bg-brand-500/5 rounded-full blur-2xl group-hover:bg-brand-500/10 transition-colors print:hidden"
            ></div>
            <div class="flex items-center justify-between mb-3">
                <div
                    class="p-2 rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-400 border border-brand-500/20 print:hidden"
                >
                    <ClipboardList size={20} />
                </div>
            </div>
            <p
                class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5 print:text-[9px]"
            >
                Artículos con Movimiento
            </p>
            <p
                class="text-2xl sm:text-3xl font-black text-text-base tracking-tight print:text-lg"
            >
                {stats.total}
            </p>
            <p
                class="text-[10px] text-text-muted font-bold mt-1.5 line-clamp-1 print:text-[8px]"
            >
                Con ventas/devoluciones
            </p>
        </div>

        <!-- Card 2: Documentos Exitosos -->
        <div
            class="bg-surface-raised border border-border-subtle hover:border-amber-500/30 transition-all rounded-3xl p-5 relative overflow-hidden group print:p-3 print:rounded-xl"
        >
            <div
                class="absolute right-0 top-0 w-28 h-28 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-colors print:hidden"
            ></div>
            <div class="flex items-center justify-between mb-3">
                <div
                    class="p-2 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 print:hidden"
                >
                    <FileText size={20} />
                </div>
            </div>
            <p
                class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5 text-amber-600 dark:text-amber-400 print:text-[9px]"
            >
                Docs. Exitosos
            </p>
            <p
                class="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 tracking-tight print:text-lg"
            >
                {stats.sumDocsExitosos.toLocaleString('de-DE')}
            </p>
            <p
                class="text-[10px] text-text-muted font-bold mt-1.5 line-clamp-1 print:text-[8px]"
            >
                Facturas menos devoluciones
            </p>
        </div>

        <!-- Card 3: Total Facturado -->
        <div
            class="bg-surface-raised border border-border-subtle hover:border-blue-500/30 transition-all rounded-3xl p-5 relative overflow-hidden group print:p-3 print:rounded-xl"
        >
            <div
                class="absolute right-0 top-0 w-28 h-28 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors print:hidden"
            ></div>
            <div class="flex items-center justify-between mb-3">
                <div
                    class="p-2 rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 print:hidden"
                >
                    <ShoppingBag size={20} />
                </div>
            </div>
            <p
                class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5 text-blue-600 dark:text-blue-400 print:text-[9px]"
            >
                Total Facturado
            </p>
            <p
                class="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 tracking-tight print:text-lg"
            >
                {formatQuantity(stats.sumFacturada)}
            </p>
            <p
                class="text-[10px] text-text-muted font-bold mt-1.5 line-clamp-1 print:text-[8px]"
            >
                Suma bruta de salidas
            </p>
        </div>

        <!-- Card 4: Total Devuelto -->
        <div
            class="bg-surface-raised border border-border-subtle hover:border-red-500/30 transition-all rounded-3xl p-5 relative overflow-hidden group print:p-3 print:rounded-xl"
        >
            <div
                class="absolute right-0 top-0 w-28 h-28 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-colors print:hidden"
            ></div>
            <div class="flex items-center justify-between mb-3">
                <div
                    class="p-2 rounded-xl bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20 print:hidden"
                >
                    <RefreshCw size={20} />
                </div>
            </div>
            <p
                class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5 text-red-600 dark:text-red-400 print:text-[9px]"
            >
                Total Devuelto
            </p>
            <p
                class="text-2xl sm:text-3xl font-black text-red-600 dark:text-red-400 tracking-tight print:text-lg"
            >
                {formatQuantity(stats.sumDevuelta)}
            </p>
            <p
                class="text-[10px] text-text-muted font-bold mt-1.5 line-clamp-1 print:text-[8px]"
            >
                Devoluciones de clientes
            </p>
        </div>

        <!-- Card 5: Cantidad Real Vendida -->
        <div
            class="bg-surface-raised border border-border-subtle hover:border-emerald-500/30 transition-all rounded-3xl p-5 relative overflow-hidden group print:p-3 print:rounded-xl"
        >
            <div
                class="absolute right-0 top-0 w-28 h-28 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors print:hidden"
            ></div>
            <div class="flex items-center justify-between mb-3">
                <div
                    class="p-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 print:hidden"
                >
                    <CheckCircle size={20} />
                </div>
            </div>
            <p
                class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5 text-emerald-600 dark:text-emerald-400 print:text-[9px]"
            >
                Cant. Real Vendida
            </p>
            <p
                class="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight print:text-lg"
            >
                {formatQuantity(stats.sumRealVendida)}
            </p>
            <p
                class="text-[10px] text-text-muted font-bold mt-1.5 line-clamp-1 print:text-[8px]"
            >
                Facturado menos devuelto
            </p>
        </div>
    </div>

    <!-- FILTROS Y BÚSQUEDA -->
    <div
        class="bg-surface-base border border-border-subtle rounded-[32px] p-6 shadow-xl space-y-4 print:hidden"
    >
        <!-- Fila 1: Buscador (con escáner), Líneas, Sub-Líneas, Categorías -->
        <div
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-center"
        >
            <!-- 1. Buscador + Escáner -->
            <div class="flex items-center gap-2 w-full">
                <form onsubmit={(e) => { e.preventDefault(); applyFilters(); }} class="relative flex-1 h-12">
                    <input
                        type="text"
                        placeholder="Buscar por código o descripción..."
                        bind:value={filterSearch}
                        class="w-full h-full bg-surface-raised pl-10 pr-8 rounded-2xl border border-border-subtle focus:border-brand-500/30 outline-none text-text-base text-sm font-bold placeholder:font-normal placeholder:text-text-muted transition-all"
                    />
                    <Search
                        size={18}
                        class="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                    {#if filterSearch}
                        <button
                            type="button"
                            onclick={() => {
                                filterSearch = "";
                                applyFilters();
                            }}
                            class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-base cursor-pointer"
                        >
                            <X size={14} />
                        </button>
                    {/if}
                </form>
                <BarcodeScanner onScan={(code) => { filterSearch = code; applyFilters(); }} />
            </div>

            <!-- 2. Líneas -->
            <Combobox
                options={lineasOptions}
                bind:value={filterLine}
                placeholder="Líneas (Todas)"
                allLabel="Líneas (Todas)"
                onchange={() => applyFilters()}
            />

            <!-- 3. Sub-Líneas -->
            <Combobox
                options={sublineasOptions}
                bind:value={filterSubline}
                placeholder="Sub-Líneas (Todas)"
                allLabel="Sub-Líneas (Todas)"
                onchange={() => applyFilters()}
            />

            <!-- 4. Categorías -->
            <Combobox
                options={categoriasOptions}
                bind:value={filterCategory}
                placeholder="Categorías (Todas)"
                allLabel="Categorías (Todas)"
                onchange={() => applyFilters()}
            />
        </div>

        <!-- Fila 2: Actividad / Ventas & Estatus del Artículo -->
        <div
            class="grid grid-cols-1 md:grid-cols-2 gap-4 items-center pt-2 border-t border-border-subtle/50"
        >
            <!-- Actividad / Ventas Switch -->
            <div class="flex flex-col gap-1.5 min-w-0">
                <span class="text-[10px] font-black uppercase tracking-wider text-text-muted ml-1 truncate">Actividad / Ventas</span>
                <div class="flex items-center bg-surface-raised border border-border-subtle p-1 rounded-2xl h-12 w-full">
                    <button 
                        type="button"
                        onclick={() => filterMinSales = 'all'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 truncate {filterMinSales === 'all' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Todos</button>
                    <button 
                        type="button"
                        onclick={() => filterMinSales = 'positive'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 truncate {filterMinSales === 'positive' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Con Venta</button>
                    <button 
                        type="button"
                        onclick={() => filterMinSales = 'negative'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 truncate {filterMinSales === 'negative' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Devueltos</button>
                    <button 
                        type="button"
                        onclick={() => filterMinSales = 'zero'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 truncate {filterMinSales === 'zero' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Saldo 0</button>
                </div>
            </div>

            <!-- Estatus Artículo Switch -->
            <div class="flex flex-col gap-1.5 min-w-0">
                <span class="text-[10px] font-black uppercase tracking-wider text-text-muted ml-1 truncate">Estatus Artículo</span>
                <div class="flex items-center bg-surface-raised border border-border-subtle p-1 rounded-2xl h-12 w-full">
                    <button 
                        type="button"
                        onclick={() => filterEstatus = 'all'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 truncate {filterEstatus === 'all' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Todos</button>
                    <button 
                        type="button"
                        onclick={() => filterEstatus = 'active'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 truncate {filterEstatus === 'active' ? 'bg-emerald-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Activos</button>
                    <button 
                        type="button"
                        onclick={() => filterEstatus = 'inactive'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 truncate {filterEstatus === 'inactive' ? 'bg-red-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Inactivos</button>
                </div>
            </div>
        </div>

        <!-- Fila 3: Sucursal, Fechas & Botón Consultar -->
        <div
            class="flex flex-col xl:flex-row gap-4 items-stretch xl:items-center justify-between pt-2 border-t border-border-subtle/50"
        >
            <!-- Select de Sucursal -->
            <div class="w-full xl:w-80 shrink-0">
                <Combobox
                    options={(data.branches || []).map((b: any) => ({
                        value: b.id,
                        label: b.name,
                    }))}
                    bind:value={filterBranch}
                    placeholder="Sucursal por defecto"
                    allLabel="Todas las Sucursales"
                    icon={Building}
                    buttonClass="h-12"
                    onchange={() => applyFilters()}
                />
            </div>

            <!-- Fechas, Atajos y Botón Consultar -->
            <div
                class="flex flex-wrap lg:flex-nowrap gap-3 items-center w-full xl:w-auto justify-end"
            >
                <div
                    class="flex items-center gap-2 bg-surface-raised border border-border-subtle rounded-2xl px-3 h-12 w-full sm:w-auto min-w-[250px] flex-1 lg:flex-initial"
                >
                    <Calendar size={16} class="text-text-muted shrink-0" />
                    <input
                        type="date"
                        bind:value={startDate}
                        class="bg-transparent text-text-base font-bold text-xs outline-none cursor-pointer w-full"
                    />
                    <span class="text-text-muted text-xs font-bold">a</span>
                    <input
                        type="date"
                        bind:value={endDate}
                        class="bg-transparent text-text-base font-bold text-xs outline-none cursor-pointer w-full"
                    />
                </div>

                <!-- Atajos de Fecha -->
                <div class="flex items-center gap-1 bg-surface-raised border border-border-subtle p-1 rounded-2xl h-12">
                    <button
                        type="button"
                        onclick={() => setPresetDate('today')}
                        class="px-3 h-full rounded-xl text-xs font-bold text-text-muted hover:text-text-base hover:bg-surface-base transition-all cursor-pointer"
                    >
                        Hoy
                    </button>
                    <button
                        type="button"
                        onclick={() => setPresetDate('month')}
                        class="px-3 h-full rounded-xl text-xs font-bold text-text-muted hover:text-text-base hover:bg-surface-base transition-all cursor-pointer"
                    >
                        Este Mes
                    </button>
                    <button
                        type="button"
                        onclick={() => setPresetDate('prev_month')}
                        class="px-3 h-full rounded-xl text-xs font-bold text-text-muted hover:text-text-base hover:bg-surface-base transition-all cursor-pointer"
                    >
                        Mes Anterior
                    </button>
                    <button
                        type="button"
                        onclick={() => setPresetDate('year')}
                        class="px-3 h-full rounded-xl text-xs font-bold text-text-muted hover:text-text-base hover:bg-surface-base transition-all cursor-pointer"
                    >
                        Este Año
                    </button>
                </div>

                <button
                    type="button"
                    onclick={() => applyFilters()}
                    disabled={isSearching}
                    class="h-12 px-6 bg-brand-600 hover:bg-brand-500 text-white text-xs font-black rounded-2xl shadow-lg shadow-brand-600/20 hover:shadow-brand-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                >
                    {#if isSearching}
                        <RefreshCw size={14} class="animate-spin" />
                        Consultando...
                    {:else}
                        <Filter size={14} />
                        Consultar
                    {/if}
                </button>
            </div>
        </div>
    </div>

    <!-- REPORT TABLE -->
    <div
        class="glass rounded-3xl border border-border-subtle overflow-hidden shadow-2xl relative"
    >
        <div class="overflow-x-auto w-full max-h-[600px] custom-scrollbar">
            <table
                class="w-full border-collapse text-left text-sm print:text-xs"
            >
                <thead>
                    <tr
                        class="bg-surface-soft/80 text-text-muted font-black uppercase tracking-wider text-[11px] print:bg-gray-100 print:text-black"
                    >
                        <th class="px-6 py-4 font-black w-32 print:px-3 print:py-2">Código</th>
                        <th class="px-6 py-4 font-black print:px-3 print:py-2">Descripción</th>
                        <th class="px-6 py-4 font-black w-36 print:px-3 print:py-2">Modelo</th>
                        <th class="px-6 py-4 font-black w-36 print:px-3 print:py-2">Referencia</th>
                        <th class="px-6 py-4 font-black text-right w-32 print:px-3 print:py-2">Cant. Facturada</th>
                        <th class="px-6 py-4 font-black text-right w-32 print:px-3 print:py-2">Cant. Devuelta</th>
                        <th class="px-6 py-4 font-black text-right w-36 print:px-3 print:py-2">Cant. Real Vendida</th>
                        <th class="px-6 py-4 font-black text-right w-36 print:px-3 print:py-2" title="Documentos de Ventas - Devoluciones">Docs. Exitosos</th>
                        <th class="px-6 py-4 font-black text-center w-28 print:px-3 print:py-2">Estatus</th>
                    </tr>
                </thead>
                <tbody
                    class="text-text-base print:divide-gray-200 print:text-black"
                >
                    {#if isSearching}
                        <tr>
                            <td colspan="9" class="px-6 py-16 text-center text-text-muted font-bold">
                                <div class="flex flex-col items-center gap-3">
                                    <RefreshCw size={24} class="animate-spin text-brand-500" />
                                    <span>Buscando artículos en catálogo...</span>
                                </div>
                            </td>
                        </tr>
                    {:else}
                        {#each filteredReportData as item (item.co_art)}
                            <tr
                                class="hover:bg-surface-soft/30 transition-colors group print:hover:bg-transparent"
                            >
                                <td
                                    class="px-6 py-4 font-mono font-bold text-xs text-brand-400 group-hover:text-brand-300 print:text-black print:px-3 print:py-2"
                                >
                                    {item.co_art.trim()}
                                </td>
                                <td
                                    class="px-6 py-4 font-semibold text-text-base print:text-black print:px-3 print:py-2"
                                >
                                    <div class="flex flex-col">
                                        <span>{item.art_des.trim()}</span>
                                        {#if item.des_lin || item.des_subl || item.des_cat}
                                            <div class="flex items-center gap-1.5 text-[10px] text-text-muted mt-0.5 print:hidden flex-wrap">
                                                {#if item.des_lin}
                                                    <span class="truncate max-w-[120px]">{item.des_lin}</span>
                                                {/if}
                                                {#if item.des_subl}
                                                    <span>•</span>
                                                    <span class="truncate max-w-[120px]">{item.des_subl}</span>
                                                {/if}
                                                {#if item.des_cat}
                                                    <span>•</span>
                                                    <span class="truncate max-w-[120px]">{item.des_cat}</span>
                                                {/if}
                                            </div>
                                        {/if}
                                    </div>
                                </td>
                                <td
                                    class="px-6 py-4 font-medium text-text-muted text-xs print:text-black print:px-3 print:py-2"
                                >
                                    {item.modelo ? item.modelo.trim() : '-'}
                                </td>
                                <td
                                    class="px-6 py-4 font-medium text-text-muted text-xs print:text-black print:px-3 print:py-2"
                                >
                                    {item.referencia ? item.referencia.trim() : '-'}
                                </td>
                                <td
                                    class="px-6 py-4 text-right font-mono font-bold text-text-base print:text-black print:px-3 print:py-2"
                                >
                                    {formatQuantity(item.cant_facturada)}
                                </td>
                                <td
                                    class="px-6 py-4 text-right font-mono font-bold text-red-400 print:text-black print:px-3 print:py-2 {Number(item.cant_devuelta) > 0 ? 'bg-red-500/5' : ''}"
                                >
                                    {formatQuantity(item.cant_devuelta)}
                                </td>
                                <td
                                    class="px-6 py-4 text-right font-mono text-base font-black {Number(item.cant_real_vendida) > 0 ? 'text-emerald-400' : Number(item.cant_real_vendida) < 0 ? 'text-red-400' : 'text-text-muted'} print:text-black print:px-3 print:py-2"
                                >
                                    {formatQuantity(item.cant_real_vendida)}
                                </td>
                                <td
                                    class="px-6 py-4 text-right font-mono text-base font-black {Number(item.docs_exitosos) > 0 ? 'text-amber-400' : Number(item.docs_exitosos) < 0 ? 'text-red-400' : 'text-text-muted'} print:text-black print:px-3 print:py-2"
                                >
                                    {Number(item.docs_exitosos || 0).toLocaleString('de-DE')}
                                </td>
                                <td
                                    class="px-6 py-4 font-semibold text-xs text-center print:px-3 print:py-2"
                                >
                                    {#if item.anulado}
                                        <span
                                            class="px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 font-bold text-[10px] uppercase tracking-wider"
                                            >Inactivo</span
                                        >
                                    {:else}
                                        <span
                                            class="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold text-[10px] uppercase tracking-wider"
                                            >Activo</span
                                        >
                                    {/if}
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="9" class="px-6 py-16 text-center text-text-muted font-bold">
                                    <div class="flex flex-col items-center gap-2">
                                        <div class="h-12 w-12 rounded-2xl bg-surface-soft border border-border-subtle flex items-center justify-center mb-1 text-text-muted opacity-45">
                                            <Filter size={20} />
                                        </div>
                                        <span>No se encontraron artículos vendidos en el rango de fechas seleccionado.</span>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    {/if}
                </tbody>
            </table>
        </div>
    </div>
</div>

<style>
    /* Print Styles */
    @media print {
        :global(body) {
            background: white !important;
            color: black !important;
        }
        :global(#sidebar), :global(header) {
            display: none !important;
        }
        .glass {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
        }
        table {
            border: 1px solid #ddd !important;
        }
        th {
            background-color: #f5f5f5 !important;
            color: black !important;
            border-bottom: 2px solid #ddd !important;
        }
        td {
            border-bottom: 1px solid #eee !important;
            color: black !important;
        }
    }
</style>
