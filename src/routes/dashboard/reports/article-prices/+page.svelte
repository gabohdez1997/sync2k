<!-- src/routes/dashboard/reports/article-prices/+page.svelte -->
<script lang="ts">
    import { fade, slide } from "svelte/transition";
    import {
        Store,
        Filter,
        RefreshCw,
        AlertTriangle,
        FileText,
        Search,
        X,
        Building,
        Printer,
        FileSpreadsheet,
        Tag,
        Layers,
        ClipboardList,
        DollarSign,
        Percent,
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

    // Filter states
    let filterBranch = $state(data.selectedBranchId || '');
    let filterSearch = $state('');
    let filterLine = $state('');
    let filterSubline = $state('');
    let filterCategory = $state('');

    // Advanced toggle filters
    let filterPrecio1 = $state('all'); // 'all' | 'with' | 'without'
    let filterMargen1 = $state('all'); // 'all' | 'with' | 'without'
    let filterPrecio2 = $state('all'); // 'all' | 'with' | 'without'
    let filterCosto = $state('all'); // 'all' | 'with' | 'without'
    let filterStock = $state('all'); // 'all' | 'with' | 'without'
    let filterMargen2 = $state('all'); // 'all' | 'with' | 'without'
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
    });

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
        filterPrecio1 = 'all';
        filterMargen1 = 'all';
        filterPrecio2 = 'all';
        filterCosto = 'all';
        filterStock = 'all';
        filterMargen2 = 'all';
        filterEstatus = 'all';
        applyFilters();
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (e.key === "Enter") {
            applyFilters();
        }
    }

    // Process report data and calculate stats
    const reportData = $derived(data.report?.data || []);

    const filteredReportData = $derived.by(() => {
        return reportData.filter(item => {
            // Precio 1
            if (filterPrecio1 === 'with' && (Number(item.precio1) || 0) <= 0) return false;
            if (filterPrecio1 === 'without' && (Number(item.precio1) || 0) > 0) return false;

            // Margen 1
            if (filterMargen1 === 'with' && (Number(item.margen1) || 0) <= 0) return false;
            if (filterMargen1 === 'without' && (Number(item.margen1) || 0) > 0) return false;

            // Precio 2
            if (filterPrecio2 === 'with' && (Number(item.precio2) || 0) <= 0) return false;
            if (filterPrecio2 === 'without' && (Number(item.precio2) || 0) > 0) return false;

            // Costo
            if (filterCosto === 'with' && (Number(item.costo) || 0) <= 0) return false;
            if (filterCosto === 'without' && (Number(item.costo) || 0) > 0) return false;

            // Stock Global
            if (filterStock === 'with' && (Number(item.stock_global) || 0) <= 0) return false;
            if (filterStock === 'without' && (Number(item.stock_global) || 0) > 0) return false;

            // Margen 2
            if (filterMargen2 === 'with' && (Number(item.margen2) || 0) <= 0) return false;
            if (filterMargen2 === 'without' && (Number(item.margen2) || 0) > 0) return false;

            // Estatus
            if (filterEstatus === 'active' && item.anulado) return false;
            if (filterEstatus === 'inactive' && !item.anulado) return false;

            return true;
        });
    });

    const stats = $derived.by(() => {
        const total = filteredReportData.length;
        let sumPrice1 = 0;
        let sumPrice2 = 0;
        let sumCosto = 0;
        let sumMargin1 = 0;
        let sumMargin2 = 0;

        let price1Count = 0;
        let price2Count = 0;
        let costCount = 0;
        let margin1Count = 0;
        let margin2Count = 0;

        for (const item of filteredReportData) {
            const p1 = Number(item.precio1) || 0;
            const p2 = Number(item.precio2) || 0;
            const m1 = Number(item.margen1) || 0;
            const m2 = Number(item.margen2) || 0;
            const cost = Number(item.costo) || 0;

            if (p1 > 0) { sumPrice1 += p1; price1Count++; }
            if (p2 > 0) { sumPrice2 += p2; price2Count++; }
            if (m1 > 0) { sumMargin1 += m1; margin1Count++; }
            if (m2 > 0) { sumMargin2 += m2; margin2Count++; }
            if (cost > 0) { sumCosto += cost; costCount++; }
        }

        return {
            total,
            avgPrice1: price1Count > 0 ? sumPrice1 / price1Count : 0,
            avgPrice2: price2Count > 0 ? sumPrice2 / price2Count : 0,
            avgMargin1: margin1Count > 0 ? sumMargin1 / margin1Count : 0,
            avgMargin2: margin2Count > 0 ? sumMargin2 / margin2Count : 0,
            avgCosto: costCount > 0 ? sumCosto / costCount : 0,
        };
    });

    // Formatting helpers
    function formatUSD(val: number | string) {
        const num = Number(val);
        if (isNaN(num)) return '$ 0,00';
        return (
            "$ " +
            num.toLocaleString("de-DE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            })
        );
    }

    function formatPercent(val: number | string) {
        const num = Number(val);
        if (isNaN(num)) return '0,00 %';
        return (
            num.toLocaleString('de-DE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }) + " %"
        );
    }

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
            "Codigo;Descripcion;Linea;Sublinea;Categoria;Modelo;Precio 1 (USD);Margen 1 (%);Precio 2 (USD);Margen 2 (%);Costo (USD);Stock Global;Estatus\n";

        for (const item of filteredReportData) {
            // Formula trick to preserve leading zeros in Excel: ="CODE"
            const co_art = `="${String(item.co_art || "")
                .trim()
                .replace(/"/g, '""')}"`;
            const art_des = `"${String(item.art_des || "")
                .trim()
                .replace(/"/g, '""')}"`;
            const des_lin = `"${String(item.des_lin || "")
                .trim()
                .replace(/"/g, '""')}"`;
            const des_subl = `"${String(item.des_subl || "")
                .trim()
                .replace(/"/g, '""')}"`;
            const des_cat = `"${String(item.des_cat || "")
                .trim()
                .replace(/"/g, '""')}"`;
            const modelo = `"${String(item.modelo || "")
                .trim()
                .replace(/"/g, '""')}"`;

            // Format decimals using commas for Spanish Excel compatibility
            const precio1 = (Number(item.precio1) || 0)
                .toFixed(2)
                .replace(".", ",");
            const margen1 = (Number(item.margen1) || 0)
                .toFixed(2)
                .replace(".", ",");
            const precio2 = (Number(item.precio2) || 0)
                .toFixed(2)
                .replace(".", ",");
            const margen2 = (Number(item.margen2) || 0)
                .toFixed(2)
                .replace(".", ",");
            const costo = (Number(item.costo) || 0)
                .toFixed(2)
                .replace(".", ",");
            const stock_global = (Number(item.stock_global) || 0)
                .toFixed(2)
                .replace(".", ",");
            const statusLabel = item.anulado ? "Inactivo" : "Activo";

            csvContent += `${co_art};${art_des};${des_lin};${des_subl};${des_cat};${modelo};${precio1};${margen1};${precio2};${margen2};${costo};${stock_global};${statusLabel}\n`;
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
        const filename = `reporte_articulos_precios_${formattedBranch}_${dayjs().format("YYYY-MM-DD_HHmmss")}.csv`;

        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function printReport() {
        window.print();
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
                <Tag
                    size={40}
                    class="text-brand-500 print:h-8 print:w-8"
                />
                Artículos con Precios
            </h1>
            <p class="text-text-muted text-lg print:text-xs">
                Listado detallado de artículos con Precios 1 y 2, márgenes
                respectivos y costo en USD.
            </p>
            <div class="hidden print:block text-[10px] text-text-muted">
                <span
                    >Sucursal: <strong
                        >{data.branches.find((b: any) => b.id === filterBranch)
                            ?.name || "General"}</strong
                    ></span
                >
                <span class="mx-2">|</span>
                <span
                    >Generado el: <strong
                        >{dayjs().format("DD/MM/YYYY hh:mm A")}</strong
                    ></span
                >
            </div>
        </div>

        <div class="flex items-center gap-3 print:hidden">
            <button
                onclick={exportToExcel}
                disabled={reportData.length === 0}
                class="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-black rounded-xl shadow-lg shadow-brand-600/20 hover:shadow-brand-500/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar a Excel (XLS)"
            >
                <FileSpreadsheet size={16} />
                Exportar Excel
            </button>
        </div>
    </div>

    <!-- METRICS CARDS -->
    <div
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 print:grid-cols-4 print:gap-3"
    >
        <!-- Card 1: Total Artículos -->
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
                Total Artículos
            </p>
            <p
                class="text-2xl sm:text-3xl font-black text-text-base tracking-tight print:text-lg"
            >
                {stats.total}
            </p>
            <p
                class="text-[10px] text-text-muted font-bold mt-1.5 line-clamp-1 print:text-[8px]"
            >
                Encontrados en catálogo
            </p>
        </div>

        <!-- Card 2: Costo Promedio -->
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
                    <DollarSign size={20} />
                </div>
            </div>
            <p
                class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5 print:text-[9px]"
            >
                Costo Promedio
            </p>
            <p
                class="text-2xl sm:text-3xl font-black text-text-base tracking-tight print:text-lg"
            >
                {formatUSD(stats.avgCosto)}
            </p>
            <p
                class="text-[10px] text-text-muted font-bold mt-1.5 line-clamp-1 print:text-[8px]"
            >
                Promedio en USD
            </p>
        </div>

        <!-- Card 3: Precio Promedio 1 -->
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
                    <DollarSign size={20} />
                </div>
            </div>
            <p
                class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5 text-blue-600 dark:text-blue-400 print:text-[9px]"
            >
                Precio Prom. 1
            </p>
            <p
                class="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 tracking-tight print:text-lg"
            >
                {formatUSD(stats.avgPrice1)}
            </p>
            <p
                class="text-[10px] text-text-muted font-bold mt-1.5 line-clamp-1 print:text-[8px]"
            >
                Precio 1 Promedio
            </p>
        </div>

        <!-- Card 4: Margen Promedio 1 -->
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
                    <Percent size={20} />
                </div>
            </div>
            <p
                class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5 text-emerald-600 dark:text-emerald-400 print:text-[9px]"
            >
                Margen Prom. 1
            </p>
            <p
                class="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight print:text-lg"
            >
                {formatPercent(stats.avgMargin1)}
            </p>
            <p
                class="text-[10px] text-text-muted font-bold mt-1.5 line-clamp-1 print:text-[8px]"
            >
                Margen 1 Promedio
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

        <!-- Fila 2: Sucursal (si aplica) -->
        {#if data.branches && data.branches.length > 1}
            <div class="pt-2 border-t border-border-subtle/50 flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <div class="w-full sm:w-80">
                    <Combobox
                        options={data.branches.map((b: any) => ({
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
            </div>
        {/if}

        <!-- Fila 3: Filtros Avanzados (Switches de Estado y Precios) -->
        <div
            class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7 gap-4 items-center pt-2 border-t border-border-subtle/50"
        >
            <!-- Precio 1 Switch -->
            <div class="flex flex-col gap-1.5 min-w-0">
                <span class="text-[10px] font-black uppercase tracking-wider text-text-muted ml-1">Precio 1</span>
                <div class="flex items-center bg-surface-raised border border-border-subtle p-1 rounded-2xl h-12 w-full">
                    <button 
                        type="button"
                        onclick={() => filterPrecio1 = 'all'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterPrecio1 === 'all' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Todos</button>
                    <button 
                        type="button"
                        onclick={() => filterPrecio1 = 'with'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterPrecio1 === 'with' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Con P1</button>
                    <button 
                        type="button"
                        onclick={() => filterPrecio1 = 'without'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterPrecio1 === 'without' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Sin P1</button>
                </div>
            </div>

            <!-- Margen 1 Switch -->
            <div class="flex flex-col gap-1.5 min-w-0">
                <span class="text-[10px] font-black uppercase tracking-wider text-text-muted ml-1">Margen 1</span>
                <div class="flex items-center bg-surface-raised border border-border-subtle p-1 rounded-2xl h-12 w-full">
                    <button 
                        type="button"
                        onclick={() => filterMargen1 = 'all'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterMargen1 === 'all' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Todos</button>
                    <button 
                        type="button"
                        onclick={() => filterMargen1 = 'with'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterMargen1 === 'with' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Con M1</button>
                    <button 
                        type="button"
                        onclick={() => filterMargen1 = 'without'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterMargen1 === 'without' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Sin M1</button>
                </div>
            </div>

            <!-- Precio 2 Switch -->
            <div class="flex flex-col gap-1.5 min-w-0">
                <span class="text-[10px] font-black uppercase tracking-wider text-text-muted ml-1">Precio 2</span>
                <div class="flex items-center bg-surface-raised border border-border-subtle p-1 rounded-2xl h-12 w-full">
                    <button 
                        type="button"
                        onclick={() => filterPrecio2 = 'all'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterPrecio2 === 'all' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Todos</button>
                    <button 
                        type="button"
                        onclick={() => filterPrecio2 = 'with'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterPrecio2 === 'with' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Con P2</button>
                    <button 
                        type="button"
                        onclick={() => filterPrecio2 = 'without'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterPrecio2 === 'without' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Sin P2</button>
                </div>
            </div>

            <!-- Margen 2 Switch -->
            <div class="flex flex-col gap-1.5 min-w-0">
                <span class="text-[10px] font-black uppercase tracking-wider text-text-muted ml-1">Margen 2</span>
                <div class="flex items-center bg-surface-raised border border-border-subtle p-1 rounded-2xl h-12 w-full">
                    <button 
                        type="button"
                        onclick={() => filterMargen2 = 'all'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterMargen2 === 'all' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Todos</button>
                    <button 
                        type="button"
                        onclick={() => filterMargen2 = 'with'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterMargen2 === 'with' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Con M2</button>
                    <button 
                        type="button"
                        onclick={() => filterMargen2 = 'without'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterMargen2 === 'without' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Sin M2</button>
                </div>
            </div>

            <!-- Costo Switch -->
            <div class="flex flex-col gap-1.5 min-w-0">
                <span class="text-[10px] font-black uppercase tracking-wider text-text-muted ml-1">Costo</span>
                <div class="flex items-center bg-surface-raised border border-border-subtle p-1 rounded-2xl h-12 w-full">
                    <button 
                        type="button"
                        onclick={() => filterCosto = 'all'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterCosto === 'all' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Todos</button>
                    <button 
                        type="button"
                        onclick={() => filterCosto = 'with'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterCosto === 'with' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Con Costo</button>
                    <button 
                        type="button"
                        onclick={() => filterCosto = 'without'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterCosto === 'without' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Sin Costo</button>
                </div>
            </div>

            <!-- Stock Switch -->
            <div class="flex flex-col gap-1.5 min-w-0">
                <span class="text-[10px] font-black uppercase tracking-wider text-text-muted ml-1">Stock Global</span>
                <div class="flex items-center bg-surface-raised border border-border-subtle p-1 rounded-2xl h-12 w-full">
                    <button 
                        type="button"
                        onclick={() => filterStock = 'all'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterStock === 'all' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Todos</button>
                    <button 
                        type="button"
                        onclick={() => filterStock = 'with'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterStock === 'with' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Con Stock</button>
                    <button 
                        type="button"
                        onclick={() => filterStock = 'without'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterStock === 'without' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Sin Stock</button>
                </div>
            </div>

            <!-- Estatus Switch -->
            <div class="flex flex-col gap-1.5 min-w-0">
                <span class="text-[10px] font-black uppercase tracking-wider text-text-muted ml-1">Estatus</span>
                <div class="flex items-center bg-surface-raised border border-border-subtle p-1 rounded-2xl h-12 w-full">
                    <button 
                        type="button"
                        onclick={() => filterEstatus = 'all'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterEstatus === 'all' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Todos</button>
                    <button 
                        type="button"
                        onclick={() => filterEstatus = 'active'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterEstatus === 'active' ? 'bg-emerald-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Activos</button>
                    <button 
                        type="button"
                        onclick={() => filterEstatus = 'inactive'} 
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterEstatus === 'inactive' ? 'bg-red-500 text-white shadow-md' : 'text-text-muted hover:text-text-base'}"
                    >Inactivos</button>
                </div>
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
                        <th
                            class="px-6 py-4 font-black w-32 print:px-3 print:py-2"
                            >Código</th
                        >
                        <th class="px-6 py-4 font-black print:px-3 print:py-2"
                            >Descripción</th
                        >
                        <th class="px-6 py-4 font-black print:px-3 print:py-2"
                            >Modelo</th
                        >
                        <th
                            class="px-6 py-4 font-black text-right w-36 print:px-3 print:py-2"
                            >Precio 1</th
                        >
                        <th
                            class="px-6 py-4 font-black text-right w-28 print:px-3 print:py-2"
                            >Margen 1</th
                        >
                        <th
                            class="px-6 py-4 font-black text-right w-36 print:px-3 print:py-2"
                            >Precio 2</th
                        >
                        <th
                            class="px-6 py-4 font-black text-right w-28 print:px-3 print:py-2"
                            >Margen 2</th
                        >
                        <th
                            class="px-6 py-4 font-black text-right w-36 print:px-3 print:py-2"
                            >Costo</th
                        >
                        <th
                            class="px-6 py-4 font-black text-right w-32 print:px-3 print:py-2"
                            >Stock Global</th
                        >
                        <th
                            class="px-6 py-4 font-black w-28 print:px-3 print:py-2"
                            >Estatus</th
                        >
                    </tr>
                </thead>
                <tbody
                    class="text-text-base print:divide-gray-200 print:text-black"
                >
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
                                {item.modelo ? item.modelo.trim() : ''}
                            </td>
                            <td
                                class="px-6 py-4 text-right font-bold print:px-3 print:py-2"
                            >
                                {formatUSD(item.precio1)}
                            </td>
                            <td
                                class="px-6 py-4 text-right font-medium text-text-muted print:text-black print:px-3 print:py-2"
                            >
                                {formatPercent(item.margen1)}
                            </td>
                            <td
                                class="px-6 py-4 text-right font-bold print:px-3 print:py-2"
                            >
                                {formatUSD(item.precio2)}
                            </td>
                            <td
                                class="px-6 py-4 text-right font-medium text-text-muted print:text-black print:px-3 print:py-2"
                            >
                                {formatPercent(item.margen2)}
                            </td>
                            <td
                                class="px-6 py-4 text-right font-black text-emerald-400 print:text-black print:px-3 print:py-2"
                            >
                                {formatUSD(item.costo)}
                            </td>
                            <td
                                class="px-6 py-4 text-right font-bold text-text-base print:text-black print:px-3 print:py-2"
                            >
                                {formatQuantity(item.stock_global)}
                            </td>
                            <td
                                class="px-6 py-4 font-semibold text-xs print:px-3 print:py-2"
                            >
                                {#if item.anulado}
                                    <span
                                        class="px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 font-bold"
                                        >Inactivo</span
                                    >
                                {:else}
                                    <span
                                        class="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold"
                                        >Activo</span
                                    >
                                {/if}
                            </td>
                        </tr>
                    {:else}
                        <tr>
                            <td
                                colspan="9"
                                class="px-6 py-16 text-center text-text-muted font-bold"
                            >
                                {#if isSearching}
                                    <div
                                        class="flex flex-col items-center gap-3"
                                    >
                                        <RefreshCw
                                            size={24}
                                            class="animate-spin text-brand-500"
                                        />
                                        <span
                                            >Cargando datos del reporte...</span
                                        >
                                    </div>
                                {:else}
                                    <div
                                        class="flex flex-col items-center gap-2"
                                    >
                                        <AlertTriangle
                                            size={32}
                                            class="text-amber-500/60"
                                        />
                                        <span
                                            >No se encontraron artículos con
                                            precios para los filtros
                                            seleccionados.</span
                                        >
                                    </div>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>
</div>

<style>
    /* Table borders styling for screen (both dark and light themes) */
    th {
        border-bottom: 1px solid var(--border-color);
    }
    td {
        border-bottom: 1px solid var(--border-color);
    }
    tr:last-child td {
        border-bottom: none;
    }

    /* CSS Print Rules */
    @media print {
        :global(html, body) {
            background: #fff !important;
            color: #000 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: auto !important;
        }

        /* Hide all layout elements (sidebar, top bar, filters) */
        :global(aside),
        :global(nav),
        :global(form),
        :global(button) {
            display: none !important;
        }

        :global(main) {
            margin: 0 !important;
            padding: 1.5cm !important;
            width: 100% !important;
        }

        /* Override glass styles for clean printing */
        .glass {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
        }

        /* Tables printing styles */
        table {
            border: 1px solid #e2e8f0 !important;
            border-collapse: collapse !important;
            page-break-inside: auto;
        }

        tr {
            page-break-inside: avoid;
            page-break-after: auto;
        }

        th {
            background-color: #f1f5f9 !important;
            color: #000 !important;
            border-bottom: 2px solid #cbd5e1 !important;
        }

        td {
            border-bottom: 1px solid #e2e8f0 !important;
        }
    }
</style>
