<!-- src/routes/dashboard/reports/article-stock/+page.svelte -->
<script lang="ts">
    import { fade, slide } from "svelte/transition";
    import {
        Boxes,
        ClipboardList,
        PackageCheck,
        PackageX,
        Warehouse,
        Search,
        X,
        FileSpreadsheet,
        RefreshCw,
        AlertTriangle,
        ChevronDown,
        ChevronLeft,
        ChevronRight,
    } from "lucide-svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import Combobox from "$lib/components/ui/Combobox.svelte";
    import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";
    import * as XLSX from "xlsx";
    import dayjs from "dayjs";
    import "dayjs/locale/es";

    let { data } = $props();

    dayjs.locale("es");

    let isSearching = $state(false);

    // Filter states
    let filterSearch = $state("");
    let filterLine = $state("");
    let filterSubline = $state("");
    let filterCategory = $state("");
    let filterStock = $state("all"); // 'all' | 'with' | 'without'
    let filterEstatus = $state("all"); // 'all' | 'active' | 'inactive'

    // Pagination state (50 items per page by default to prevent DOM freezing with 8,400+ articles)
    let currentPage = $state(1);
    let pageSize = $state(50);

    // Set of expanded rows for warehouse breakdown
    let expandedRows = $state(new Set<string>());

    function toggleRow(co_art: string) {
        const next = new Set(expandedRows);
        if (next.has(co_art)) {
            next.delete(co_art);
        } else {
            next.add(co_art);
        }
        expandedRows = next;
    }

    // Catalogs options (Direct from catalog, O(1) performance)
    const lineasOptions = $derived(
        (data.catalogs?.lineas || []).map((l: any) => ({
            value: (l.co_lin || "").trim(),
            label: l.lin_des ? `${l.lin_des.trim()} (${l.co_lin.trim()})` : l.co_lin,
        }))
    );

    const sublineasOptions = $derived(
        (data.catalogs?.sublineas || [])
            .filter(
                (sl: any) =>
                    !filterLine ||
                    filterLine === "all" ||
                    (sl.co_lin && sl.co_lin.trim() === filterLine.trim())
            )
            .map((sl: any) => ({
                value: (sl.co_subl || "").trim(),
                label: sl.subl_des ? `${sl.subl_des.trim()} (${sl.co_subl.trim()})` : sl.co_subl,
            }))
    );

    const categoriasOptions = $derived(
        (data.catalogs?.categorias || []).map((c: any) => ({
            value: (c.co_cat || "").trim(),
            label: c.cat_des ? `${c.cat_des.trim()} (${c.co_cat.trim()})` : c.co_cat,
        }))
    );

    // Auto-limpiar sublínea si la línea cambia y ya no pertenece
    $effect(() => {
        if (filterLine && filterLine !== "all" && filterSubline && filterSubline !== "all") {
            const valid = (data.catalogs?.sublineas || []).some(
                (sl: any) =>
                    sl.co_lin &&
                    sl.co_lin.trim() === filterLine.trim() &&
                    sl.co_subl &&
                    sl.co_subl.trim() === filterSubline.trim()
            );
            if (!valid) {
                filterSubline = "";
            }
        }
    });

    // Sincronizar filtros con query params
    $effect(() => {
        filterSearch = $page.url.searchParams.get("search") || "";
        filterLine = $page.url.searchParams.get("linea") || "";
        filterSubline = $page.url.searchParams.get("sublinea") || "";
        filterCategory = $page.url.searchParams.get("categoria") || "";
    });

    // Reset pagination to page 1 on filter changes
    $effect(() => {
        const _ = [filterSearch, filterLine, filterSubline, filterCategory, filterStock, filterEstatus];
        currentPage = 1;
    });

    function applyFilters() {
        isSearching = true;
        const params = new URLSearchParams($page.url.searchParams);

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

        params.delete("page");

        goto(`?${params.toString()}`).finally(() => {
            isSearching = false;
        });
    }

    // Datos completos del reporte
    const reportData = $derived(data.report?.data || []);

    const filteredReportData = $derived.by(() => {
        return reportData.filter((item: any) => {
            // Estatus Switch
            if (filterEstatus === "active" && item.anulado) return false;
            if (filterEstatus === "inactive" && !item.anulado) return false;

            // Stock Switch
            if (filterStock === "with" && item.stock_total <= 0) return false;
            if (filterStock === "without" && item.stock_total > 0) return false;

            return true;
        });
    });

    // Paginación instantánea en memoria
    const totalPages = $derived(Math.max(1, Math.ceil(filteredReportData.length / pageSize)));

    const paginatedData = $derived.by(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredReportData.slice(start, start + pageSize);
    });

    // Métricas para las 4 tarjetas (calculadas sobre el total de registros consolidados)
    const stats = $derived.by(() => {
        const total = filteredReportData.length;
        let withStock = 0;
        let withoutStock = 0;
        let totalPieces = 0;

        for (const item of filteredReportData) {
            if (item.stock_total > 0) {
                withStock++;
            } else {
                withoutStock++;
            }
            totalPieces += Number(item.stock_total_act || item.stock_total) || 0;
        }

        return {
            total,
            withStock,
            withoutStock,
            totalPieces,
        };
    });

    function formatQuantity(val: number | string) {
        const num = Number(val);
        if (isNaN(num)) return "0,00";
        return num.toLocaleString("de-DE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    // Exportación a Excel (.xlsx) nativo
    function exportToExcel() {
        if (filteredReportData.length === 0) return;

        // 1. Recolectar almacenes únicos preservando orden y sedes únicas
        const warehouseMap = new Map<string, { key: string; header: string; co_alma: string; des_alma: string; sede_nombre?: string }>();
        const sedesSet = new Set<string>();

        for (const item of filteredReportData) {
            if (item.sedes && typeof item.sedes === 'object') {
                for (const sName of Object.keys(item.sedes)) {
                    if (sName) sedesSet.add(sName.trim());
                }
            } else if (item.sede_nombre) {
                sedesSet.add(item.sede_nombre.trim());
            }

            for (const alm of (item.almacenes || [])) {
                const sName = (alm.sede_nombre || item.sede_nombre || (data.branches && data.branches[0]?.name) || 'Sede').trim();
                sedesSet.add(sName);

                const key = `${sName}_${alm.co_alma}`.trim();
                if (!warehouseMap.has(key)) {
                    const baseName = (alm.des_alma || alm.co_alma || 'Almacén').trim();
                    const headerName = `${baseName} (${sName})`;
                    warehouseMap.set(key, {
                        key,
                        header: headerName,
                        co_alma: (alm.co_alma || '').trim(),
                        des_alma: baseName,
                        sede_nombre: sName
                    });
                }
            }
        }

        const warehouses = Array.from(warehouseMap.values());
        const sedesList = Array.from(sedesSet);
        if (sedesList.length === 0) {
            const fallbackBranch = (data.branches && data.branches[0]?.name) || 'General';
            sedesList.push(fallbackBranch);
        }

        const rows: any[] = [];

        for (const item of filteredReportData) {
            const statusStr = item.anulado ? "Inactivo" : "Activo";

            const row: Record<string, any> = {
                "Código Artículo": item.co_art,
                "Descripción": item.art_des,
                "Modelo": item.modelo || "",
                "Línea": item.des_lin || item.co_lin || "",
                "Sublínea": item.des_subl || item.co_subl || "",
                "Categoría": item.des_cat || item.co_cat || "",
                "Estatus": statusStr,
            };

            // Columnas dinámicas de almacenes con la cantidad física del artículo (stock_act)
            for (const w of warehouses) {
                const found = (item.almacenes || []).find((a: any) => {
                    const sName = (a.sede_nombre || item.sede_nombre || (data.branches && data.branches[0]?.name) || 'Sede').trim();
                    return (
                        `${sName}_${a.co_alma}`.trim() === w.key ||
                        (a.co_alma && a.co_alma.trim() === w.co_alma && sName === w.sede_nombre)
                    );
                });
                row[w.header] = found ? Number(found.stock_act) || 0 : 0;
            }

            // Columnas de Stock Comprometido (Sede) y Stock Actual (Sede) por cada sede
            // Donde el Stock Comprometido se resta del Stock Actual Físico para obtener el Stock Neto disponible
            let sumStockActual = 0;

            for (const sName of sedesList) {
                let com = 0;
                let act = 0;

                if (item.sedes && item.sedes[sName]) {
                    com = Number(item.sedes[sName].stock_com) || 0;
                    act = Number(item.sedes[sName].stock_act) || 0;
                } else {
                    for (const a of (item.almacenes || [])) {
                        const aSede = (a.sede_nombre || item.sede_nombre || '').trim();
                        if (!aSede || aSede === sName || sedesList.length === 1) {
                            com += Number(a.stock_com) || 0;
                            act += Number(a.stock_act) || 0;
                        }
                    }
                }

                // El stock comprometido resta al stock actual físico
                const stockNetoSede = act - com;

                const colComLabel = `Stock Comprometido (${sName})`;
                const colActLabel = `Stock Actual (${sName})`;

                row[colComLabel] = com;
                row[colActLabel] = stockNetoSede;
                sumStockActual += stockNetoSede;
            }

            // Stock Global: suma todos los stock actual (netos) de las distintas sedes
            row["Stock Global"] = sumStockActual;

            rows.push(row);
        }

        const ws = XLSX.utils.json_to_sheet(rows);

        // Auto-ancho de columnas
        const colWidths: any[] = [
            { wch: 18 }, // Código Artículo
            { wch: 42 }, // Descripción
            { wch: 16 }, // Modelo
            { wch: 20 }, // Línea
            { wch: 20 }, // Sublínea
            { wch: 20 }, // Categoría
            { wch: 12 }, // Estatus
        ];
        for (const w of warehouses) {
            colWidths.push({ wch: Math.max(16, w.header.length + 3) });
        }
        for (let i = 0; i < sedesList.length * 2 + 1; i++) {
            colWidths.push({ wch: 26 });
        }
        ws["!cols"] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Stock de Artículos");

        const fileName = `Stock_Articulos_Consolidado_${dayjs().format("YYYYMMDD_HHmm")}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }
</script>

<svelte:head>
    <title>Stock de Artículos — Sync2k</title>
</svelte:head>

<div class="space-y-6 pb-12">
    <!-- HEADER -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1
                class="text-3xl font-black text-text-base flex items-center gap-3 tracking-tight"
            >
                <div
                    class="p-2.5 bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-2xl border border-brand-500/20"
                >
                    <Boxes size={28} />
                </div>
                Stock de Artículos
            </h1>
            <p class="text-text-muted text-sm mt-1 font-medium">
                Existencia y disponibilidad desglosada por almacén y sede en tiempo real.
            </p>
            <div class="hidden print:block text-[10px] text-text-muted">
                <span>
                    Reporte Consolidado — Todas las Sedes
                </span>
                <span class="mx-2">|</span>
                <span>
                    Generado el: <strong>{dayjs().format("DD/MM/YYYY hh:mm A")}</strong>
                </span>
            </div>
        </div>

        <div class="flex items-center gap-3 print:hidden">
            <button
                onclick={exportToExcel}
                disabled={reportData.length === 0}
                class="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-black rounded-xl shadow-lg shadow-brand-600/20 hover:shadow-brand-500/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar reporte a Excel (.xlsx)"
            >
                <FileSpreadsheet size={16} />
                Exportar Excel
            </button>
        </div>
    </div>

    <!-- ERROR ALERT -->
    {#if data.error}
        <div
            in:fade
            class="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-sm font-bold print:hidden"
        >
            <AlertTriangle size={18} class="shrink-0" />
            <span>{data.error}</span>
        </div>
    {/if}

    <!-- METRICS CARDS (Exact match to Artículos con Precios) -->
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

        <!-- Card 2: Piezas Totales -->
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
                    <Boxes size={20} />
                </div>
            </div>
            <p
                class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5 print:text-[9px]"
            >
                Piezas Totales
            </p>
            <p
                class="text-2xl sm:text-3xl font-black text-text-base tracking-tight print:text-lg"
            >
                {formatQuantity(stats.totalPieces)}
            </p>
            <p
                class="text-[10px] text-text-muted font-bold mt-1.5 line-clamp-1 print:text-[8px]"
            >
                Unidades netas disponibles
            </p>
        </div>

        <!-- Card 3: Con Stock -->
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
                    <PackageCheck size={20} />
                </div>
            </div>
            <p
                class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5 text-blue-600 dark:text-blue-400 print:text-[9px]"
            >
                Con Stock
            </p>
            <p
                class="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 tracking-tight print:text-lg"
            >
                {stats.withStock}
            </p>
            <p
                class="text-[10px] text-text-muted font-bold mt-1.5 line-clamp-1 print:text-[8px]"
            >
                Disponibles para venta
            </p>
        </div>

        <!-- Card 4: Sin Stock -->
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
                    <PackageX size={20} />
                </div>
            </div>
            <p
                class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5 text-emerald-600 dark:text-emerald-400 print:text-[9px]"
            >
                Sin Stock
            </p>
            <p
                class="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight print:text-lg"
            >
                {stats.withoutStock}
            </p>
            <p
                class="text-[10px] text-text-muted font-bold mt-1.5 line-clamp-1 print:text-[8px]"
            >
                Existencia en cero
            </p>
        </div>
    </div>

    <!-- FILTERS AND SEARCH -->
    <div
        class="bg-surface-base border border-border-subtle rounded-[32px] p-6 shadow-xl space-y-4 print:hidden"
    >
        <!-- Fila 1: Buscador (con escáner), Líneas, Sub-Líneas, Categorías -->
        <div
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-center"
        >
            <!-- 1. Buscador + Escáner -->
            <div class="flex items-center gap-2 w-full">
                <form
                    onsubmit={(e) => {
                        e.preventDefault();
                        applyFilters();
                    }}
                    class="relative flex-1 h-12"
                >
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
                <BarcodeScanner
                    onScan={(code) => {
                        filterSearch = code;
                        applyFilters();
                    }}
                />
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

        <!-- Fila 2: Switches de Filtros Rápidos (Stock Global & Estatus) -->
        <div
            class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 items-center pt-2 border-t border-border-subtle/50"
        >
            <!-- Stock Global Switch -->
            <div class="flex flex-col gap-1.5 min-w-0">
                <span
                    class="text-[10px] font-black uppercase tracking-wider text-text-muted ml-1"
                    >Stock Global</span
                >
                <div
                    class="flex items-center bg-surface-raised border border-border-subtle p-1 rounded-2xl h-12 w-full"
                >
                    <button
                        type="button"
                        onclick={() => (filterStock = "all")}
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterStock ===
                        'all'
                            ? 'bg-brand-500 text-white shadow-md'
                            : 'text-text-muted hover:text-text-base'}"
                        >Todos</button
                    >
                    <button
                        type="button"
                        onclick={() => (filterStock = "with")}
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterStock ===
                        'with'
                            ? 'bg-brand-500 text-white shadow-md'
                            : 'text-text-muted hover:text-text-base'}"
                        >Con Stock</button
                    >
                    <button
                        type="button"
                        onclick={() => (filterStock = "without")}
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterStock ===
                        'without'
                            ? 'bg-brand-500 text-white shadow-md'
                            : 'text-text-muted hover:text-text-base'}"
                        >Sin Stock</button
                    >
                </div>
            </div>

            <!-- Estatus Switch -->
            <div class="flex flex-col gap-1.5 min-w-0">
                <span
                    class="text-[10px] font-black uppercase tracking-wider text-text-muted ml-1"
                    >Estatus</span
                >
                <div
                    class="flex items-center bg-surface-raised border border-border-subtle p-1 rounded-2xl h-12 w-full"
                >
                    <button
                        type="button"
                        onclick={() => (filterEstatus = "all")}
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterEstatus ===
                        'all'
                            ? 'bg-brand-500 text-white shadow-md'
                            : 'text-text-muted hover:text-text-base'}"
                        >Todos</button
                    >
                    <button
                        type="button"
                        onclick={() => (filterEstatus = "active")}
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterEstatus ===
                        'active'
                            ? 'bg-emerald-500 text-white shadow-md'
                            : 'text-text-muted hover:text-text-base'}"
                        >Activos</button
                    >
                    <button
                        type="button"
                        onclick={() => (filterEstatus = "inactive")}
                        class="flex-1 h-full rounded-xl text-xs font-bold transition-all cursor-pointer px-2 {filterEstatus ===
                        'inactive'
                            ? 'bg-red-500 text-white shadow-md'
                            : 'text-text-muted hover:text-text-base'}"
                        >Inactivos</button
                    >
                </div>
            </div>
        </div>
    </div>

    <!-- MAIN REPORT TABLE (Glass style matching Artículos con Precios) -->
    <div
        class="glass rounded-3xl border border-border-subtle overflow-hidden shadow-2xl relative"
    >
        <div class="overflow-x-auto w-full max-h-[650px] custom-scrollbar">
            <table class="w-full border-collapse text-left text-sm print:text-xs">
                <thead>
                    <tr
                        class="bg-surface-soft/80 text-text-muted font-black uppercase tracking-wider text-[11px] print:bg-gray-100 print:text-black sticky top-0 z-10 backdrop-blur-md"
                    >
                        <th class="px-4 py-4 font-black w-10 text-center"></th>
                        <th class="px-6 py-4 font-black w-36 print:px-3 print:py-2">Código</th>
                        <th class="px-6 py-4 font-black print:px-3 print:py-2">Descripción</th>
                        <th class="px-6 py-4 font-black print:px-3 print:py-2">Modelo</th>
                        <th class="px-6 py-4 font-black">Stock por Almacén</th>
                        <th class="px-6 py-4 font-black text-right w-36 print:px-3 print:py-2">Stock Total</th>
                        <th class="px-6 py-4 font-black w-28 text-center print:px-3 print:py-2">Estatus</th>
                    </tr>
                </thead>
                <tbody class="text-text-base print:divide-gray-200 print:text-black">
                    {#each paginatedData as item (item.co_art)}
                        {@const isExpanded = expandedRows.has(item.co_art)}
                        <tr
                            class="hover:bg-surface-soft/30 transition-colors group print:hover:bg-transparent border-b border-border-subtle/30"
                        >
                            <!-- Chevron button -->
                            <td class="px-4 py-4 text-center">
                                <button
                                    type="button"
                                    onclick={() => toggleRow(item.co_art)}
                                    class="p-1 rounded-lg hover:bg-surface-raised text-text-muted hover:text-text-base transition-colors cursor-pointer"
                                    title={isExpanded ? "Contraer detalle de almacenes" : "Ver stock por almacén"}
                                >
                                    {#if isExpanded}
                                        <ChevronDown size={16} class="text-brand-400" />
                                    {:else}
                                        <ChevronRight size={16} />
                                    {/if}
                                </button>
                            </td>

                            <!-- Código -->
                            <td
                                class="px-6 py-4 font-mono font-bold text-xs text-brand-400 group-hover:text-brand-300 print:text-black print:px-3 print:py-2"
                            >
                                {item.co_art.trim()}
                            </td>

                            <!-- Descripción con clasificación en subtexto -->
                            <td
                                class="px-6 py-4 font-semibold text-text-base print:text-black print:px-3 print:py-2"
                            >
                                <div class="flex flex-col">
                                    <span>{item.art_des.trim()}</span>
                                    {#if item.des_lin || item.des_subl || item.des_cat}
                                        <div
                                            class="flex items-center gap-1.5 text-[10px] text-text-muted mt-0.5 print:hidden flex-wrap font-medium"
                                        >
                                            {#if item.des_lin}
                                                <span class="truncate max-w-[140px]">{item.des_lin}</span>
                                            {/if}
                                            {#if item.des_subl}
                                                <span>•</span>
                                                <span class="truncate max-w-[140px]">{item.des_subl}</span>
                                            {/if}
                                            {#if item.des_cat}
                                                <span>•</span>
                                                <span class="truncate max-w-[140px]">{item.des_cat}</span>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                            </td>

                            <!-- Modelo -->
                            <td
                                class="px-6 py-4 font-medium text-text-muted text-xs print:text-black print:px-3 print:py-2 font-mono"
                            >
                                {item.modelo ? item.modelo.trim() : ""}
                            </td>

                            <!-- Stock por Almacén Chips -->
                            <td class="px-6 py-4">
                                {#if !item.almacenes || item.almacenes.length === 0}
                                    <span class="text-xs text-text-muted/60 italic font-medium">Sin existencias</span>
                                {:else}
                                    <div class="flex flex-wrap gap-1.5 items-center">
                                        {#each item.almacenes as alm}
                                            <span
                                                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-mono font-bold {alm.stock_disp > 0
                                                    ? 'bg-surface-raised text-text-base border border-border-subtle'
                                                    : 'bg-surface-soft/40 text-text-muted/50 border border-transparent'}"
                                                title="{alm.des_alma}: Disp: {alm.stock_disp} (Act: {alm.stock_act}, Com: {alm.stock_com})"
                                            >
                                                <span class="text-[10px] text-text-muted uppercase font-semibold">{alm.co_alma}:</span>
                                                <span class={alm.stock_disp > 0 ? "text-brand-400" : ""}>{formatQuantity(alm.stock_disp)}</span>
                                            </span>
                                        {/each}
                                    </div>
                                {/if}
                            </td>

                            <!-- Stock Total -->
                            <td
                                class="px-6 py-4 text-right font-bold text-text-base print:text-black print:px-3 print:py-2"
                            >
                                <div
                                    class="font-mono text-sm font-black {item.stock_total > 0
                                        ? 'text-text-base'
                                        : 'text-text-muted/60'}"
                                >
                                    {formatQuantity(item.stock_total)}
                                </div>
                                {#if item.stock_total_com > 0}
                                    <div
                                        class="text-[10px] text-amber-500 font-mono mt-0.5"
                                        title="Stock comprometido en pedidos"
                                    >
                                        Comp: {formatQuantity(item.stock_total_com)}
                                    </div>
                                {/if}
                            </td>

                            <!-- Estatus Badge -->
                            <td
                                class="px-6 py-4 text-center font-semibold text-xs print:px-3 print:py-2"
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

                        <!-- Detalle Expandido de Almacenes -->
                        {#if isExpanded}
                            <tr transition:slide class="bg-surface-soft/40 border-b border-border-subtle/30">
                                <td colspan="7" class="p-4 pl-16">
                                    <div
                                        class="bg-surface-raised border border-border-subtle rounded-2xl p-4 shadow-md"
                                    >
                                        <div
                                            class="flex items-center justify-between mb-3 pb-2 border-b border-border-subtle/40"
                                        >
                                            <span
                                                class="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2"
                                            >
                                                <Warehouse size={16} class="text-brand-500" />
                                                Detalle de Almacenes (Todas las Sedes)
                                            </span>
                                            <span class="text-xs font-mono text-text-muted">
                                                Artículo: <strong class="text-text-base">{item.co_art}</strong>
                                            </span>
                                        </div>

                                        {#if !item.almacenes || item.almacenes.length === 0}
                                            <p class="text-xs text-text-muted italic py-2">
                                                Este artículo no registra movimientos ni saldo en almacenes.
                                            </p>
                                        {:else}
                                            <div class="overflow-x-auto">
                                                <table class="w-full text-xs">
                                                    <thead
                                                        class="text-[10px] text-text-muted font-bold uppercase border-b border-border-subtle/40"
                                                    >
                                                        <tr>
                                                            <th class="py-2 text-left">Sede</th>
                                                            <th class="py-2 text-left">Código Almacén</th>
                                                            <th class="py-2 text-left">Nombre Almacén</th>
                                                            <th class="py-2 text-right">Stock Actual</th>
                                                            <th class="py-2 text-right">Comprometido</th>
                                                            <th class="py-2 text-right font-black text-text-base">Disponible</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody class="divide-y divide-border-subtle/20 font-mono">
                                                        {#each item.almacenes as alm}
                                                            <tr class="hover:bg-surface-soft/30 transition-colors">
                                                                <td class="py-2 text-text-muted font-sans font-semibold">{alm.sede_nombre || "General"}</td>
                                                                <td class="py-2 text-brand-400 font-bold">{alm.co_alma}</td>
                                                                <td class="py-2 font-sans text-text-base">{alm.des_alma}</td>
                                                                <td class="py-2 text-right text-text-muted">{formatQuantity(alm.stock_act)}</td>
                                                                <td class="py-2 text-right text-amber-500">{formatQuantity(alm.stock_com)}</td>
                                                                <td class="py-2 text-right font-black {alm.stock_disp > 0 ? 'text-emerald-500' : 'text-text-muted'}">
                                                                    {formatQuantity(alm.stock_disp)}
                                                                </td>
                                                            </tr>
                                                        {/each}
                                                    </tbody>
                                                </table>
                                            </div>
                                        {/if}
                                    </div>
                                </td>
                            </tr>
                        {/if}
                    {:else}
                        <tr>
                            <td
                                colspan="7"
                                class="px-6 py-16 text-center text-text-muted font-bold"
                            >
                                {#if isSearching}
                                    <div class="flex flex-col items-center gap-3">
                                        <RefreshCw size={24} class="animate-spin text-brand-500" />
                                        <span>Cargando datos del reporte...</span>
                                    </div>
                                {:else}
                                    <div class="flex flex-col items-center gap-2">
                                        <AlertTriangle size={32} class="text-amber-500/60" />
                                        <span>No se encontraron artículos para los filtros seleccionados</span>
                                    </div>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <!-- Pagination Footer (Estilo Suppliers) -->
        {#if totalPages > 1}
            <div
                class="px-8 py-6 bg-white/1 border-t border-white/5 flex items-center justify-between print:hidden"
            >
                <p
                    class="text-xs font-bold text-text-muted uppercase tracking-widest"
                >
                    Página <span class="text-text-base">{currentPage}</span>
                    de <span class="text-text-base">{totalPages}</span>
                    (Total: {filteredReportData.length})
                </p>

                <div class="flex gap-2">
                    <button
                        onclick={() => {
                            if (currentPage > 1) {
                                currentPage -= 1;
                            }
                        }}
                        disabled={currentPage <= 1}
                        class="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-all border border-white/5 text-text-muted cursor-pointer"
                        title="Página anterior"
                    >
                        <ChevronLeft size={20} />
                    </button>

                    <button
                        onclick={() => {
                            if (currentPage < totalPages) {
                                currentPage += 1;
                            }
                        }}
                        disabled={currentPage >= totalPages}
                        class="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-all border border-white/5 text-text-muted cursor-pointer"
                        title="Página siguiente"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>
        {/if}
    </div>
</div>
