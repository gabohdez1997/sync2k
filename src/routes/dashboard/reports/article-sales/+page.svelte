<!-- src/routes/dashboard/reports/article-sales/+page.svelte -->
<script lang="ts">
    import { fade, slide } from "svelte/transition";
    import {
        Store,
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
    } from "lucide-svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import Combobox from "$lib/components/ui/Combobox.svelte";
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
    let filterBranch = $state('all');
    let filterSearch = $state('');
    let filterLine = $state('all');
    let filterCategory = $state('all');
    let startDate = $state(defaultDesde);
    let endDate = $state(defaultHasta);

    // Advanced toggle filters
    let filterMinSales = $state('all'); // 'all' | 'positive' | 'negative' | 'zero'
    let filterEstatus = $state('all'); // 'all' | 'active' | 'inactive'

    // Sync filter states with URL search params
    $effect(() => {
        filterBranch =
            $page.url.searchParams.get("branch_id") ||
            data.selectedBranchId ||
            "all";
        filterSearch = $page.url.searchParams.get("search") || "";
        filterLine = $page.url.searchParams.get("linea") || "all";
        filterCategory = $page.url.searchParams.get("categoria") || "all";
        startDate = $page.url.searchParams.get("fecha_desde") || defaultDesde;
        endDate = $page.url.searchParams.get("fecha_hasta") || defaultHasta;
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
        filterLine = 'all';
        filterCategory = 'all';
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

        for (const item of filteredReportData) {
            sumFacturada += Number(item.cant_facturada) || 0;
            sumDevuelta += Number(item.cant_devuelta) || 0;
            sumRealVendida += Number(item.cant_real_vendida) || 0;
        }

        return {
            total,
            sumFacturada,
            sumDevuelta,
            sumRealVendida,
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
            "Código;Descripción;Línea;Categoría;Cant. Facturada;Cant. Devuelta;Cant. Real Vendida;Estatus\n";

        for (const item of filteredReportData) {
            const co_art = `="${String(item.co_art || "")
                .trim()
                .replace(/"/g, '""')}"`;
            const art_des = `"${String(item.art_des || "")
                .trim()
                .replace(/"/g, '""')}"`;
            const co_lin = `"${String(item.co_lin || "").trim()}"`;
            const co_cat = `"${String(item.co_cat || "").trim()}"`;

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
            const statusLabel = item.anulado ? "Inactivo" : "Activo";

            csvContent += `${co_art};${art_des};${co_lin};${co_cat};${cant_facturada};${cant_devuelta};${cant_real_vendida};${statusLabel}\n`;
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
        class="grid grid-cols-1 md:grid-cols-4 gap-6 print:grid-cols-4 print:gap-3"
    >
        <!-- Card 1: Artículos con Actividad -->
        <div
            class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group print:p-3 print:rounded-xl"
        >
            <div
                class="absolute -right-4 -bottom-4 w-24 h-24 bg-brand-500/5 rounded-full blur-2xl"
            ></div>
            <div class="flex items-start justify-between">
                <div class="space-y-2">
                    <span
                        class="text-xs font-black uppercase tracking-widest text-text-muted print:text-[9px]"
                        >Artículos con Movimiento</span
                    >
                    <h2
                        class="text-2xl font-black text-text-base tracking-tight print:text-lg"
                    >
                        {stats.total}
                    </h2>
                    <p
                        class="text-xs text-text-muted font-bold print:text-[8px]"
                    >
                        Con ventas/devoluciones
                    </p>
                </div>
                <div
                    class="h-10 w-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500 print:hidden"
                >
                    <ClipboardList size={20} />
                </div>
            </div>
        </div>

        <!-- Card 2: Total Facturado -->
        <div
            class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group print:p-3 print:rounded-xl"
        >
            <div
                class="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl"
            ></div>
            <div class="flex items-start justify-between">
                <div class="space-y-2">
                    <span
                        class="text-xs font-black uppercase tracking-widest text-text-muted print:text-[9px]"
                        >Total Facturado</span
                    >
                    <h2
                        class="text-2xl font-black text-text-base tracking-tight print:text-lg"
                    >
                        {formatQuantity(stats.sumFacturada)}
                    </h2>
                    <p
                        class="text-xs text-text-muted font-bold print:text-[8px]"
                    >
                        Suma bruta de salidas
                    </p>
                </div>
                <div
                    class="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 print:hidden"
                >
                    <ShoppingBag size={20} />
                </div>
            </div>
        </div>

        <!-- Card 3: Total Devuelto -->
        <div
            class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group print:p-3 print:rounded-xl"
        >
            <div
                class="absolute -right-4 -bottom-4 w-24 h-24 bg-red-500/5 rounded-full blur-2xl"
            ></div>
            <div class="flex items-start justify-between">
                <div class="space-y-2">
                    <span
                        class="text-xs font-black uppercase tracking-widest text-text-muted print:text-[9px]"
                        >Total Devuelto</span
                    >
                    <h2
                        class="text-2xl font-black text-text-base tracking-tight print:text-lg text-red-400"
                    >
                        {formatQuantity(stats.sumDevuelta)}
                    </h2>
                    <p
                        class="text-xs text-text-muted font-bold print:text-[8px]"
                    >
                        Devoluciones de clientes
                    </p>
                </div>
                <div
                    class="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 print:hidden"
                >
                    <RefreshCw size={20} />
                </div>
            </div>
        </div>

        <!-- Card 4: Cantidad Real Vendida -->
        <div
            class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group print:p-3 print:rounded-xl"
        >
            <div
                class="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl"
            ></div>
            <div class="flex items-start justify-between">
                <div class="space-y-2">
                    <span
                        class="text-xs font-black uppercase tracking-widest text-text-muted print:text-[9px]"
                        >Cant. Real Vendida</span
                    >
                    <h2
                        class="text-2xl font-black text-text-base tracking-tight print:text-lg text-brand-400"
                    >
                        {formatQuantity(stats.sumRealVendida)}
                    </h2>
                    <p
                        class="text-xs text-text-muted font-bold print:text-[8px]"
                    >
                        Facturado menos devuelto
                    </p>
                </div>
                <div
                    class="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 print:hidden"
                >
                    <CheckCircle size={20} class="text-emerald-500" />
                </div>
            </div>
        </div>
    </div>

    <!-- FILTERS PANEL -->
    <div class="glass p-6 rounded-3xl border border-border-subtle shadow-2xl flex flex-col gap-6 w-full relative z-10 print:hidden">
        <!-- Top Row: Selectors, Search & Limpiar -->
        <div class="flex flex-col md:flex-row md:flex-wrap xl:flex-nowrap gap-4 items-center w-full">
            <!-- Sede Selector -->
            {#if data.branches && data.branches.length > 1}
                <div class="w-full md:w-[calc(50%-0.5rem)] xl:w-72">
                    <Combobox
                        options={data.branches.map((b: any) => ({ value: b.id, label: b.name }))}
                        bind:value={filterBranch}
                        placeholder="Sucursal..."
                        allLabel="Todas las Sucursales"
                        icon={Store}
                        class="w-full h-14"
                        onchange={() => applyFilters()}
                    />
                </div>
            {/if}

            <!-- Línea Selector -->
            <div class="w-full md:w-[calc(50%-0.5rem)] xl:w-64">
                <Combobox
                    options={data.catalogs?.lineas?.map((l: any) => ({ value: l.co_lin.trim(), label: `${l.co_lin.trim()} - ${l.lin_des.trim()}` })) || []}
                    bind:value={filterLine}
                    placeholder="Línea..."
                    allLabel="Todas las Líneas"
                    icon={Layers}
                    class="w-full h-14"
                    onchange={() => applyFilters()}
                />
            </div>

            <!-- Categoría Selector -->
            <div class="w-full md:w-[calc(50%-0.5rem)] xl:w-64">
                <Combobox
                    options={data.catalogs?.categorias?.map((c: any) => ({ value: c.co_cat.trim(), label: `${c.co_cat.trim()} - ${c.cat_des.trim()}` })) || []}
                    bind:value={filterCategory}
                    placeholder="Categoría..."
                    allLabel="Todas las Categorías"
                    icon={Tag}
                    class="w-full h-14"
                    onchange={() => applyFilters()}
                />
            </div>

            <!-- Search Bar Form (embedded search button) -->
            <form onsubmit={(e) => { e.preventDefault(); applyFilters(); }} class="relative group w-full md:w-[calc(50%-0.5rem)] xl:flex-1 h-14">
                <input 
                    type="text"
                    bind:value={filterSearch}
                    placeholder="Buscar por código o descripción..."
                    class="w-full h-full bg-surface-soft pl-6 pr-14 rounded-2xl border border-border-subtle focus:border-brand-500/50 outline-none transition-all font-bold text-sm text-text-base placeholder:font-normal placeholder:text-text-muted/40"
                />
                <button 
                    type="submit"
                    disabled={isSearching}
                    class="absolute right-1 top-1 bottom-1 w-12 flex items-center justify-center bg-surface-soft hover:bg-surface-strong text-brand-400 rounded-xl transition-all border border-border-subtle active:scale-95 cursor-pointer disabled:opacity-50"
                    title="Buscar Artículos"
                >
                    {#if isSearching}
                        <div class="w-4 h-4 border-2 border-brand-500/20 border-t-brand-500 rounded-full animate-spin"></div>
                    {:else}
                        <Search size={18} />
                    {/if}
                </button>
            </form>

            <!-- Limpiar Button -->
            <button 
                onclick={clearFilters} 
                class="h-14 w-full md:w-auto xl:w-auto px-6 bg-surface-soft/40 border border-border-subtle hover:bg-surface-soft text-text-muted font-bold text-sm rounded-2xl transition-all flex items-center justify-center cursor-pointer shrink-0"
                title="Limpiar filtros"
            >
                Limpiar
            </button>
        </div>

        <!-- Subtle Divider Line -->
        <div class="h-[1px] w-full bg-border-subtle opacity-10"></div>

        <!-- Bottom Row: Advanced switches & Date Range Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 w-full">
            <!-- Rango de Fechas -->
            <div class="flex flex-col gap-1.5 md:col-span-2">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted ml-1">Rango de Fechas</span>
                <div class="flex items-center bg-white/5 border border-white/5 p-1 rounded-xl h-12 w-full px-3 gap-2">
                    <Calendar size={16} class="text-text-muted shrink-0" />
                    <input 
                        type="date" 
                        bind:value={startDate}
                        onchange={() => applyFilters()}
                        class="bg-transparent border-0 text-text-base focus:outline-none text-[11px] font-bold w-full cursor-pointer text-center"
                    />
                    <span class="text-text-muted font-bold px-1 text-[10px] shrink-0">al</span>
                    <input 
                        type="date" 
                        bind:value={endDate}
                        onchange={() => applyFilters()}
                        class="bg-transparent border-0 text-text-base focus:outline-none text-[11px] font-bold w-full cursor-pointer text-center"
                    />
                    {#if startDate !== defaultDesde || endDate !== defaultHasta}
                        <button 
                            onclick={() => { startDate = defaultDesde; endDate = defaultHasta; applyFilters(); }}
                            class="p-1 hover:bg-white/10 rounded-full text-text-muted hover:text-red-400 transition-colors shrink-0 cursor-pointer"
                            title="Restablecer fechas"
                        >
                            <X size={14} />
                        </button>
                    {/if}
                </div>
            </div>

            <!-- Actividad / Ventas Switch -->
            <div class="flex flex-col gap-1.5">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted ml-1">Actividad / Ventas</span>
                <div class="flex items-center bg-white/5 border border-white/5 p-1 rounded-xl h-12 w-full">
                    <button 
                        onclick={() => filterMinSales = 'all'} 
                        class="flex-1 h-full rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer {filterMinSales === 'all' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-white'}"
                    >Todos</button>
                    <button 
                        onclick={() => filterMinSales = 'positive'} 
                        class="flex-1 h-full rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer {filterMinSales === 'positive' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-white'}"
                    >Con Venta</button>
                    <button 
                        onclick={() => filterMinSales = 'negative'} 
                        class="flex-1 h-full rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer {filterMinSales === 'negative' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-white'}"
                    >Devueltos</button>
                    <button 
                        onclick={() => filterMinSales = 'zero'} 
                        class="flex-1 h-full rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer {filterMinSales === 'zero' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-white'}"
                    >Saldo 0</button>
                </div>
            </div>

            <!-- Estatus Artículo Switch -->
            <div class="flex flex-col gap-1.5">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted ml-1">Estatus Artículo</span>
                <div class="flex items-center bg-white/5 border border-white/5 p-1 rounded-xl h-12 w-full">
                    <button 
                        onclick={() => filterEstatus = 'all'} 
                        class="flex-1 h-full rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer {filterEstatus === 'all' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-white'}"
                    >Todos</button>
                    <button 
                        onclick={() => filterEstatus = 'active'} 
                        class="flex-1 h-full rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer {filterEstatus === 'active' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-white'}"
                    >Activos</button>
                    <button 
                        onclick={() => filterEstatus = 'inactive'} 
                        class="flex-1 h-full rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer {filterEstatus === 'inactive' ? 'bg-brand-500 text-white shadow-md' : 'text-text-muted hover:text-white'}"
                    >Inactivos</button>
                </div>
            </div>
        </div>
    </div>

    <!-- MAIN DATA TABLE -->
    <div class="glass rounded-[32px] border border-border-subtle shadow-2xl relative overflow-hidden bg-surface-card/20 backdrop-blur-3xl">
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
                <thead>
                    <tr class="border-b border-border-subtle bg-surface-soft/40">
                        <th class="py-5 px-6 font-black text-text-muted uppercase tracking-widest w-32">Código</th>
                        <th class="py-5 px-6 font-black text-text-muted uppercase tracking-widest">Descripción</th>
                        <th class="py-5 px-6 font-black text-text-muted uppercase tracking-widest w-40">Línea</th>
                        <th class="py-5 px-6 font-black text-text-muted uppercase tracking-widest w-40">Categoría</th>
                        <th class="py-5 px-6 font-black text-text-muted uppercase tracking-widest text-right w-36">Cant. Facturada</th>
                        <th class="py-5 px-6 font-black text-text-muted uppercase tracking-widest text-right w-36">Cant. Devuelta</th>
                        <th class="py-5 px-6 font-black text-text-muted uppercase tracking-widest text-right w-40">Cant. Real Vendida</th>
                        <th class="py-5 px-6 font-black text-text-muted uppercase tracking-widest text-center w-24">Estado</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle/30 font-bold">
                    {#if isSearching}
                        <tr>
                            <td colspan="8" class="py-16 text-center text-text-muted">
                                <RefreshCw size={24} class="animate-spin mx-auto mb-3 text-brand-500/50" />
                                Buscando artículos en catálogo...
                            </td>
                        </tr>
                    {:else}
                        {#each filteredReportData as item}
                            <tr class="hover:bg-white/[0.02] transition-colors group">
                                <td class="py-4 px-6 font-mono text-text-base text-[11px]">{item.co_art}</td>
                                <td class="py-4 px-6 text-text-base group-hover:text-brand-400 transition-colors">{item.art_des}</td>
                                <td class="py-4 px-6 text-text-muted/80">{item.co_lin}</td>
                                <td class="py-4 px-6 text-text-muted/80">{item.co_cat}</td>
                                <td class="py-4 px-6 text-right text-text-base font-mono">{formatQuantity(item.cant_facturada)}</td>
                                <td class="py-4 px-6 text-right text-red-400 font-mono {Number(item.cant_devuelta) > 0 ? 'bg-red-500/5' : ''}">
                                    {formatQuantity(item.cant_devuelta)}
                                </td>
                                <td class="py-4 px-6 text-right font-mono text-base font-black {Number(item.cant_real_vendida) > 0 ? 'text-emerald-400' : Number(item.cant_real_vendida) < 0 ? 'text-red-400' : 'text-text-muted'}">
                                    {formatQuantity(item.cant_real_vendida)}
                                </td>
                                <td class="py-4 px-6 text-center">
                                    {#if item.anulado}
                                        <span class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-red-500/10 border border-red-500/20 text-red-500">Inactivo</span>
                                    {:else}
                                        <span class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">Activo</span>
                                    {/if}
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="8" class="py-16 text-center text-text-muted">
                                    <div class="h-12 w-12 rounded-2xl bg-surface-soft border border-border-subtle flex items-center justify-center mx-auto mb-3 text-text-muted opacity-45">
                                        <Filter size={20} />
                                    </div>
                                    No se encontraron artículos vendidos en el rango de fechas seleccionado.
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
