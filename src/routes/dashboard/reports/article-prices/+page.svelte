<!-- src/routes/dashboard/reports/article-prices/+page.svelte -->
<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { 
        Store, Filter, RefreshCw, AlertTriangle, FileText, 
        Search, Printer, FileSpreadsheet, Tag, Layers, ClipboardList,
        DollarSign, Percent
    } from 'lucide-svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import Combobox from '$lib/components/ui/Combobox.svelte';
    import dayjs from 'dayjs';
    import 'dayjs/locale/es';

    let { data } = $props();

    dayjs.locale('es');

    let isSearching = $state(false);

    // Filter states
    let filterBranch = $state('all');
    let filterSearch = $state('');
    let filterLine = $state('all');
    let filterCategory = $state('all');

    // Sync filter states with URL search params
    $effect(() => {
        filterBranch = $page.url.searchParams.get('branch_id') || data.selectedBranchId || 'all';
        filterSearch = $page.url.searchParams.get('search') || '';
        filterLine = $page.url.searchParams.get('linea') || 'all';
        filterCategory = $page.url.searchParams.get('categoria') || 'all';
    });

    function applyFilters() {
        isSearching = true;
        const params = new URLSearchParams($page.url.searchParams);

        if (filterBranch && filterBranch !== 'all') {
            params.set('branch_id', filterBranch);
        } else {
            params.delete('branch_id');
        }

        if (filterSearch.trim()) {
            params.set('search', filterSearch.trim());
        } else {
            params.delete('search');
        }

        if (filterLine && filterLine !== 'all') {
            params.set('linea', filterLine);
        } else {
            params.delete('linea');
        }

        if (filterCategory && filterCategory !== 'all') {
            params.set('categoria', filterCategory);
        } else {
            params.delete('categoria');
        }

        // Reset to page 1 if applicable
        params.delete('page');

        goto(`?${params.toString()}`).finally(() => {
            isSearching = false;
        });
    }

    function clearFilters() {
        filterSearch = '';
        filterLine = 'all';
        filterCategory = 'all';
        applyFilters();
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            applyFilters();
        }
    }

    // Process report data and calculate stats
    const reportData = $derived(data.report?.data || []);

    const stats = $derived.by(() => {
        const total = reportData.length;
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

        for (const item of reportData) {
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
            avgCosto: costCount > 0 ? sumCosto / costCount : 0
        };
    });

    // Formatting helpers
    function formatUSD(val: number | string) {
        const num = Number(val);
        if (isNaN(num)) return '$ 0,00';
        return '$ ' + num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatPercent(val: number | string) {
        const num = Number(val);
        if (isNaN(num)) return '0,00 %';
        return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
    }

    // Excel exporting (CSV with semicolon separators for Spanish Excel compatibility)
    function exportToExcel() {
        if (reportData.length === 0) return;

        // Start with UTF-8 BOM and sep=; directive for Excel
        let csvContent = '\uFEFFsep=;\n';
        csvContent += 'Código;Descripción;Precio 1 (USD);Margen 1 (%);Precio 2 (USD);Margen 2 (%);Costo (USD);Estatus\n';

        for (const item of reportData) {
            // Formula trick to preserve leading zeros in Excel: ="CODE"
            const co_art = `="${String(item.co_art || '').trim().replace(/"/g, '""')}"`;
            const art_des = `"${String(item.art_des || '').trim().replace(/"/g, '""')}"`;
            
            // Format decimals using commas for Spanish Excel compatibility
            const precio1 = (Number(item.precio1) || 0).toFixed(2).replace('.', ',');
            const margen1 = (Number(item.margen1) || 0).toFixed(2).replace('.', ',');
            const precio2 = (Number(item.precio2) || 0).toFixed(2).replace('.', ',');
            const margen2 = (Number(item.margen2) || 0).toFixed(2).replace('.', ',');
            const costo = (Number(item.costo) || 0).toFixed(2).replace('.', ',');
            const statusLabel = item.anulado ? 'Inactivo' : 'Activo';

            csvContent += `${co_art};${art_des};${precio1};${margen1};${precio2};${margen2};${costo};${statusLabel}\n`;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const branchName = data.branches.find((b: any) => b.id === filterBranch)?.name || 'general';
        const formattedBranch = branchName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const filename = `reporte_articulos_precios_${formattedBranch}_${dayjs().format('YYYY-MM-DD_HHmmss')}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
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
        <div class="glass border-red-500/20 p-6 rounded-3xl flex items-center gap-6 bg-red-500/5 shadow-xl shadow-red-500/10 print:hidden" in:slide>
            <div class="h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                <AlertTriangle size={24} />
            </div>
            <div class="flex-1">
                <h3 class="text-sm font-black text-red-500 uppercase tracking-widest mb-1">Error de Comunicación</h3>
                <p class="text-text-muted font-bold text-sm leading-relaxed">{data.error}</p>
            </div>
            <button onclick={() => window.location.reload()} class="px-5 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-xs font-black transition-all cursor-pointer">Reintentar</button>
        </div>
    {/if}

    <!-- TOP HEADER -->
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6 print:flex-row print:justify-between">
        <div class="flex flex-col gap-2">
            <h1 class="text-4xl font-black tracking-tight flex items-center gap-3 print:text-2xl">
                <FileText size={40} class="text-brand-500 print:h-8 print:w-8" />
                Artículos con Precios
            </h1>
            <p class="text-text-muted text-lg print:text-xs">
                Listado detallado de artículos con Precios 1 y 2, márgenes respectivos y costo en USD.
            </p>
            <div class="hidden print:block text-[10px] text-text-muted">
                <span>Sucursal: <strong>{data.branches.find((b: any) => b.id === filterBranch)?.name || 'General'}</strong></span>
                <span class="mx-2">|</span>
                <span>Generado el: <strong>{dayjs().format('DD/MM/YYYY hh:mm A')}</strong></span>
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
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 print:grid-cols-4 print:gap-3">
        <!-- Card 1: Total Artículos -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group print:p-3 print:rounded-xl">
            <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-brand-500/5 rounded-full blur-2xl"></div>
            <div class="flex items-start justify-between">
                <div class="space-y-2">
                    <span class="text-xs font-black uppercase tracking-widest text-text-muted print:text-[9px]">Total Artículos</span>
                    <h2 class="text-2xl font-black text-text-base tracking-tight print:text-lg">{stats.total}</h2>
                    <p class="text-xs text-text-muted font-bold print:text-[8px]">Encontrados en catálogo</p>
                </div>
                <div class="h-10 w-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500 print:hidden">
                    <ClipboardList size={20} />
                </div>
            </div>
        </div>

        <!-- Card 2: Costo Promedio -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group print:p-3 print:rounded-xl">
            <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-red-500/5 rounded-full blur-2xl"></div>
            <div class="flex items-start justify-between">
                <div class="space-y-2">
                    <span class="text-xs font-black uppercase tracking-widest text-text-muted print:text-[9px]">Costo Promedio</span>
                    <h2 class="text-2xl font-black text-text-base tracking-tight print:text-lg">{formatUSD(stats.avgCosto)}</h2>
                    <p class="text-xs text-text-muted font-bold print:text-[8px]">Promedio en USD</p>
                </div>
                <div class="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 print:hidden">
                    <DollarSign size={20} />
                </div>
            </div>
        </div>

        <!-- Card 3: Precio Promedio 1 -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group print:p-3 print:rounded-xl">
            <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl"></div>
            <div class="flex items-start justify-between">
                <div class="space-y-2">
                    <span class="text-xs font-black uppercase tracking-widest text-text-muted print:text-[9px]">Precio Prom. 1</span>
                    <h2 class="text-2xl font-black text-text-base tracking-tight print:text-lg">{formatUSD(stats.avgPrice1)}</h2>
                    <p class="text-xs text-text-muted font-bold print:text-[8px]">Precio 1 Promedio</p>
                </div>
                <div class="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 print:hidden">
                    <DollarSign size={20} />
                </div>
            </div>
        </div>

        <!-- Card 4: Margen Promedio 1 -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group print:p-3 print:rounded-xl">
            <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl"></div>
            <div class="flex items-start justify-between">
                <div class="space-y-2">
                    <span class="text-xs font-black uppercase tracking-widest text-text-muted print:text-[9px]">Margen Prom. 1</span>
                    <h2 class="text-2xl font-black text-text-base tracking-tight print:text-lg">{formatPercent(stats.avgMargin1)}</h2>
                    <p class="text-xs text-text-muted font-bold print:text-[8px]">Margen 1 Promedio</p>
                </div>
                <div class="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 print:hidden">
                    <Percent size={20} />
                </div>
            </div>
        </div>
    </div>

    <!-- FILTERS BAR -->
    <div class="glass p-5 rounded-3xl border border-border-subtle shadow-2xl flex flex-col xl:flex-row gap-4 items-center w-full relative z-10 print:hidden">
        
        <!-- Sede Selector -->
        {#if data.branches && data.branches.length > 1}
            <div class="w-full xl:w-72">
                <Combobox
                    options={data.branches.map((b: any) => ({ value: b.id, label: b.name }))}
                    bind:value={filterBranch}
                    placeholder="Sucursal..."
                    allLabel="Todas las Sucursales"
                    icon={Store}
                    class="w-full h-12"
                    onchange={() => applyFilters()}
                />
            </div>
        {/if}

        <!-- Línea Selector -->
        <div class="w-full xl:w-64">
            <Combobox
                options={data.catalogs?.lineas?.map((l: any) => ({ value: l.co_lin.trim(), label: `${l.co_lin.trim()} - ${l.lin_des.trim()}` })) || []}
                bind:value={filterLine}
                placeholder="Línea..."
                allLabel="Todas las Líneas"
                icon={Layers}
                class="w-full h-12"
                onchange={() => applyFilters()}
            />
        </div>

        <!-- Categoría Selector -->
        <div class="w-full xl:w-64">
            <Combobox
                options={data.catalogs?.categorias?.map((c: any) => ({ value: c.co_cat.trim(), label: `${c.co_cat.trim()} - ${c.cat_des.trim()}` })) || []}
                bind:value={filterCategory}
                placeholder="Categoría..."
                allLabel="Todas las Categorías"
                icon={Tag}
                class="w-full h-12"
                onchange={() => applyFilters()}
            />
        </div>

        <!-- Search Bar -->
        <div class="w-full xl:flex-1">
            <div class="relative w-full h-12 bg-surface-soft border border-border-subtle rounded-xl flex items-center px-4 focus-within:border-brand-500/50 transition-all">
                <Search size={16} class="text-text-muted mr-2.5 shrink-0" />
                <input 
                    type="text"
                    bind:value={filterSearch}
                    onkeydown={handleKeyDown}
                    placeholder="Buscar por código o descripción..."
                    class="w-full h-full bg-transparent outline-none text-sm text-text-base font-bold placeholder:text-text-muted/40"
                />
            </div>
        </div>

        <div class="flex w-full xl:w-auto gap-2">
            <button 
                onclick={applyFilters} 
                class="h-12 flex-1 xl:flex-none px-6 bg-surface-soft border border-border-subtle hover:bg-surface-strong text-text-base font-black rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
                <RefreshCw size={16} class={isSearching ? 'animate-spin' : ''} />
                Filtrar
            </button>
            <button 
                onclick={clearFilters} 
                class="h-12 px-4 bg-surface-soft/40 border border-border-subtle hover:bg-surface-soft text-text-muted font-bold text-xs rounded-xl transition-all flex items-center justify-center cursor-pointer"
                title="Limpiar filtros"
            >
                Limpiar
            </button>
        </div>
    </div>

    <!-- REPORT TABLE -->
    <div class="glass rounded-3xl border border-border-subtle overflow-hidden shadow-2xl relative">
        <div class="overflow-x-auto w-full max-h-[600px] custom-scrollbar">
            <table class="w-full border-collapse text-left text-sm print:text-xs">
                <thead>
                    <tr class="bg-surface-soft/80 text-text-muted font-black uppercase tracking-wider text-[11px] print:bg-gray-100 print:text-black">
                        <th class="px-6 py-4 font-black w-32 print:px-3 print:py-2">Código</th>
                        <th class="px-6 py-4 font-black print:px-3 print:py-2">Descripción</th>
                        <th class="px-6 py-4 font-black text-right w-36 print:px-3 print:py-2">Precio 1</th>
                        <th class="px-6 py-4 font-black text-right w-28 print:px-3 print:py-2">Margen 1</th>
                        <th class="px-6 py-4 font-black text-right w-36 print:px-3 print:py-2">Precio 2</th>
                        <th class="px-6 py-4 font-black text-right w-28 print:px-3 print:py-2">Margen 2</th>
                        <th class="px-6 py-4 font-black text-right w-36 print:px-3 print:py-2">Costo</th>
                        <th class="px-6 py-4 font-black w-28 print:px-3 print:py-2">Estatus</th>
                    </tr>
                </thead>
                <tbody class="text-text-base print:divide-gray-200 print:text-black">
                    {#each reportData as item (item.co_art)}
                        <tr class="hover:bg-surface-soft/30 transition-colors group print:hover:bg-transparent">
                            <td class="px-6 py-4 font-mono font-bold text-xs text-brand-400 group-hover:text-brand-300 print:text-black print:px-3 print:py-2">
                                {item.co_art.trim()}
                            </td>
                            <td class="px-6 py-4 font-semibold text-text-base print:text-black print:px-3 print:py-2">
                                {item.art_des.trim()}
                            </td>
                            <td class="px-6 py-4 text-right font-bold print:px-3 print:py-2">
                                {formatUSD(item.precio1)}
                            </td>
                            <td class="px-6 py-4 text-right font-medium text-text-muted print:text-black print:px-3 print:py-2">
                                {formatPercent(item.margen1)}
                            </td>
                            <td class="px-6 py-4 text-right font-bold print:px-3 print:py-2">
                                {formatUSD(item.precio2)}
                            </td>
                            <td class="px-6 py-4 text-right font-medium text-text-muted print:text-black print:px-3 print:py-2">
                                {formatPercent(item.margen2)}
                            </td>
                            <td class="px-6 py-4 text-right font-black text-emerald-400 print:text-black print:px-3 print:py-2">
                                {formatUSD(item.costo)}
                            </td>
                            <td class="px-6 py-4 font-semibold text-xs print:px-3 print:py-2">
                                {#if item.anulado}
                                    <span class="px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 font-bold">Inactivo</span>
                                {:else}
                                    <span class="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold">Activo</span>
                                {/if}
                            </td>
                        </tr>
                    {:else}
                        <tr>
                            <td colspan="8" class="px-6 py-16 text-center text-text-muted font-bold">
                                {#if isSearching}
                                    <div class="flex flex-col items-center gap-3">
                                        <RefreshCw size={24} class="animate-spin text-brand-500" />
                                        <span>Cargando datos del reporte...</span>
                                    </div>
                                {:else}
                                    <div class="flex flex-col items-center gap-2">
                                        <AlertTriangle size={32} class="text-amber-500/60" />
                                        <span>No se encontraron artículos con precios para los filtros seleccionados.</span>
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
        :global(aside), :global(nav), :global(form), :global(button) {
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
