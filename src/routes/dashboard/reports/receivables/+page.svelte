<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { 
        Wallet, FileText, Calendar, DollarSign, Clock, AlertTriangle, 
        ChevronLeft, ChevronRight, Store, Search, Filter, FileDown,
        TrendingDown, TrendingUp, CheckCircle, RefreshCw, Loader2
    } from 'lucide-svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { toast } from 'svelte-sonner';
    import SearchBar from '$lib/components/ui/SearchBar.svelte';
    import Combobox from '$lib/components/ui/Combobox.svelte';
    import dayjs from 'dayjs';
    import 'dayjs/locale/es';

    let { data } = $props();

    dayjs.locale('es');

    let isSearching = $state(false);
    let exporting = $state(false);

    // Filtros
    let filterSearch = $state('');
    let filterStatus = $state('all'); // all, vencidos, por_vencer
    let filterTipoDoc = $state('all'); // all, FACT, NDEB, etc.
    let filterSede = $state('');

    $effect(() => {
        filterSearch = $page.url.searchParams.get('search') || '';
        filterStatus = $page.url.searchParams.get('status') || 'all';
        filterTipoDoc = $page.url.searchParams.get('tipo_doc') || 'all';
        filterSede = data.selectedBranchId || '';
    });

    function applyFilters() {
        isSearching = true;
        const params = new URLSearchParams($page.url.searchParams);
        if (filterSearch) params.set('search', filterSearch); else params.delete('search');
        if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus); else params.delete('status');
        if (filterTipoDoc && filterTipoDoc !== 'all') params.set('tipo_doc', filterTipoDoc); else params.delete('tipo_doc');
        if (filterSede) params.set('branch_id', filterSede);
        params.set('page', '1');
        
        goto(`?${params.toString()}`).finally(() => {
            isSearching = false;
        });
    }

    function changePage(p: number) {
        const params = new URLSearchParams($page.url.searchParams);
        params.set('page', p.toString());
        goto(`?${params.toString()}`);
    }

    function formatCurrency(val: number, code: string = 'USD') {
        const formatter = new Intl.NumberFormat('es-VE', {
            style: 'currency',
            currency: code === 'USD' ? 'USD' : 'VES',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        return formatter.format(val);
    }

    function handleExport(format: 'pdf' | 'excel') {
        exporting = true;
        toast.info(`Simulando exportación a ${format.toUpperCase()}...`);
        setTimeout(() => {
            exporting = false;
            toast.success(`Reporte exportado exitosamente en formato ${format.toUpperCase()}!`);
        }, 1500);
    }

    // Tipo de documentos badges
    const docTypes: Record<string, { label: string, class: string }> = {
        'FACT': { label: 'Factura', class: 'bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20' },
        'NDEB': { label: 'N/Débito', class: 'bg-purple-500/10 text-purple-500 dark:text-purple-400 border-purple-500/20' },
        'GIRO': { label: 'Giro', class: 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20' },
        'default': { label: 'Otro', class: 'bg-gray-500/10 text-gray-500 border-gray-500/20' }
    };

    function getDocTypeBadge(type: string) {
        const t = String(type).trim().toUpperCase();
        return docTypes[t] || docTypes['default'];
    }
</script>

<div class="space-y-8" in:fade>
    
    {#if data.error}
        <div class="glass border-red-500/20 p-6 rounded-3xl flex items-center gap-6 bg-red-500/5 shadow-xl shadow-red-500/10" in:slide>
            <div class="h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                <AlertTriangle size={24} />
            </div>
            <div class="flex-1">
                <h3 class="text-sm font-black text-red-500 uppercase tracking-widest mb-1">Error de Comunicación</h3>
                <p class="text-text-muted font-bold text-sm leading-relaxed">{data.error}</p>
            </div>
            <button onclick={() => window.location.reload()} class="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-black transition-all">Reintentar</button>
        </div>
    {/if}

    <!-- TOP HEADER -->
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div class="flex flex-col gap-2">
            <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
                <Wallet size={40} class="text-brand-500" />
                Cuentas por Cobrar (CxC)
            </h1>
            <p class="text-text-muted text-lg">
                Visualización consolidada y análisis de cartera de clientes pendiente.
            </p>
        </div>

        <div class="flex flex-wrap items-center gap-3 justify-start lg:justify-end shrink-0">
            <button 
                onclick={() => handleExport('excel')}
                disabled={exporting || !data.cxc?.data?.length}
                class="flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 text-text-base h-12 px-6 rounded-xl font-bold transition-all disabled:opacity-50"
            >
                <FileDown size={18} />
                Exportar Excel
            </button>

            <button 
                onclick={() => handleExport('pdf')}
                disabled={exporting || !data.cxc?.data?.length}
                class="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white h-12 px-6 rounded-xl font-bold shadow-xl shadow-brand-500/20 transition-all disabled:opacity-50"
            >
                <FileDown size={18} />
                Exportar PDF
            </button>
        </div>
    </div>

    <!-- METRICS CARDS -->
    {#if data.cxc?.metrics}
        {@const metrics = data.cxc.metrics}
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6" in:slide>
            
            <!-- Card 1: Cartera Total -->
            <div class="glass p-6 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden group">
                <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-brand-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"></div>
                <div class="flex items-start justify-between">
                    <div class="space-y-2">
                        <span class="text-xs font-black uppercase tracking-widest text-text-muted">Cartera Total</span>
                        <h2 class="text-2xl font-black text-text-base tracking-tight">{formatCurrency(metrics.total_outstanding_usd, 'USD')}</h2>
                        <p class="text-xs text-text-muted font-bold">{formatCurrency(metrics.total_outstanding_bs, 'VES')}</p>
                    </div>
                    <div class="h-10 w-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500">
                        <Wallet size={20} />
                    </div>
                </div>
            </div>

            <!-- Card 2: Cartera Vencida -->
            <div class="glass p-6 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden group">
                <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-red-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"></div>
                <div class="flex items-start justify-between">
                    <div class="space-y-2">
                        <span class="text-xs font-black uppercase tracking-widest text-red-500/80">Cartera Vencida</span>
                        <h2 class="text-2xl font-black text-red-500 tracking-tight">{formatCurrency(metrics.total_overdue_usd, 'USD')}</h2>
                        <p class="text-xs text-text-muted font-bold">{formatCurrency(metrics.total_overdue_bs, 'VES')}</p>
                    </div>
                    <div class="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
                        <TrendingDown size={20} />
                    </div>
                </div>
            </div>

            <!-- Card 3: Cartera Por Vencer -->
            <div class="glass p-6 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden group">
                <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-green-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"></div>
                <div class="flex items-start justify-between">
                    <div class="space-y-2">
                        <span class="text-xs font-black uppercase tracking-widest text-green-500/80">Cartera por Vencer</span>
                        <h2 class="text-2xl font-black text-green-500 tracking-tight">{formatCurrency(metrics.total_upcoming_usd, 'USD')}</h2>
                        <p class="text-xs text-text-muted font-bold">{formatCurrency(metrics.total_upcoming_bs, 'VES')}</p>
                    </div>
                    <div class="h-10 w-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500">
                        <TrendingUp size={20} />
                    </div>
                </div>
            </div>

            <!-- Card 4: Conteo Documentos -->
            <div class="glass p-6 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden group">
                <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"></div>
                <div class="flex items-start justify-between">
                    <div class="space-y-2">
                        <span class="text-xs font-black uppercase tracking-widest text-text-muted">Documentos Activos</span>
                        <h2 class="text-2xl font-black text-text-base tracking-tight">{metrics.doc_count}</h2>
                        <p class="text-xs text-text-muted font-bold">Invoices / Giros pendientes</p>
                    </div>
                    <div class="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                        <FileText size={20} />
                    </div>
                </div>
            </div>

        </div>
    {/if}

    <!-- FILTERS BAR -->
    <div class="glass p-5 rounded-3xl border border-white/5 shadow-2xl flex flex-col xl:flex-row gap-4 items-center w-full relative z-10">
        
        <!-- Sede Selector -->
        {#if data.branches && data.branches.length > 1}
            <div class="w-full xl:w-72">
                <Combobox
                    options={data.branches.map((b: any) => ({ value: b.id, label: b.name }))}
                    bind:value={filterSede}
                    placeholder="Sucursal..."
                    allLabel="Todas las Sucursales"
                    icon={Store}
                    class="w-full h-12"
                    onchange={() => applyFilters()}
                />
            </div>
        {/if}

        <!-- Status Filter -->
        <div class="w-full xl:w-56">
            <div class="relative w-full h-12 bg-black/20 border border-white/10 rounded-xl flex items-center px-3 group focus-within:border-brand-500/50 transition-all">
                <Clock size={16} class="text-text-muted mr-2.5 shrink-0" />
                <select 
                    bind:value={filterStatus} 
                    onchange={applyFilters}
                    class="w-full h-full bg-transparent outline-none text-sm text-text-base font-bold cursor-pointer appearance-none pr-8"
                >
                    <option value="all" class="bg-surface-raised text-text-base">Todos los Saldos</option>
                    <option value="vencidos" class="bg-surface-raised text-text-base">Vencidos (Overdue)</option>
                    <option value="por_vencer" class="bg-surface-raised text-text-base">Por Vencer (Upcoming)</option>
                </select>
                <div class="pointer-events-none absolute right-3 flex items-center text-text-muted">
                    <Filter size={14} />
                </div>
            </div>
        </div>

        <!-- Tipo Doc Filter -->
        <div class="w-full xl:w-56">
            <div class="relative w-full h-12 bg-black/20 border border-white/10 rounded-xl flex items-center px-3 group focus-within:border-brand-500/50 transition-all">
                <FileText size={16} class="text-text-muted mr-2.5 shrink-0" />
                <select 
                    bind:value={filterTipoDoc} 
                    onchange={applyFilters}
                    class="w-full h-full bg-transparent outline-none text-sm text-text-base font-bold cursor-pointer appearance-none pr-8"
                >
                    <option value="all" class="bg-surface-raised text-text-base">Todos los Tipos</option>
                    <option value="FACT" class="bg-surface-raised text-text-base">Facturas (FACT)</option>
                    <option value="NDEB" class="bg-surface-raised text-text-base">Notas de Débito</option>
                    <option value="GIRO" class="bg-surface-raised text-text-base">Giros</option>
                </select>
                <div class="pointer-events-none absolute right-3 flex items-center text-text-muted">
                    <Filter size={14} />
                </div>
            </div>
        </div>

        <!-- Search Bar -->
        <div class="w-full xl:flex-1">
            <SearchBar 
                bind:value={filterSearch} 
                isSearching={isSearching} 
                onsubmit={applyFilters} 
                placeholder="Buscar por cliente, documento o RIF..."
                className="w-full h-12"
            />
        </div>

        <button 
            onclick={() => applyFilters()} 
            class="h-12 w-full xl:w-auto px-6 bg-white/5 border border-white/10 hover:bg-white/10 text-text-base font-black rounded-xl transition-all flex items-center justify-center gap-2"
        >
            <RefreshCw size={16} class={isSearching ? 'animate-spin' : ''} />
            Actualizar
        </button>

    </div>

    <!-- MAIN LIST -->
    <div class="bg-surface-raised/50 backdrop-blur-md rounded-[32px] border border-border-subtle shadow-2xl overflow-hidden min-h-[400px]">
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-surface-soft/50 border-b border-border-subtle">
                        <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted">Documento</th>
                        <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted">Cliente</th>
                        <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted">Emisión</th>
                        <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted">Vencimiento</th>
                        <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-right">Monto Original</th>
                        <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-right">Saldo Pendiente</th>
                        <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-center">Días Retraso</th>
                        {#if data.hasOthers}
                            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-center">Vendedor</th>
                        {/if}
                    </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle">
                    {#if isSearching}
                        <tr>
                            <td colspan={data.hasOthers ? 8 : 7} class="px-6 py-20 text-center">
                                <div class="flex flex-col items-center justify-center gap-3">
                                    <Loader2 size={40} class="animate-spin text-brand-500" />
                                    <p class="text-sm font-bold text-text-muted">Consultando saldos con el agente Profit local...</p>
                                </div>
                            </td>
                        </tr>
                    {:else}
                        {#each data.cxc?.data || [] as doc (doc.nro_doc + doc.sede_id + doc.co_tipo_doc)}
                            {@const badge = getDocTypeBadge(doc.co_tipo_doc)}
                            <tr class="hover:bg-brand-500/5 transition-colors group">
                                <!-- Documento -->
                                <td class="px-6 py-5">
                                    <div class="flex items-center gap-3">
                                        <div class="p-2 rounded-xl bg-white/5 border border-white/5 text-text-muted group-hover:text-brand-500 transition-colors">
                                            <FileText size={16} />
                                        </div>
                                        <div class="flex flex-col min-w-0">
                                            <span class="font-black text-sm tracking-tight text-text-base">{doc.nro_doc}</span>
                                            <span class="px-1.5 py-0.5 mt-1 border text-[9px] font-black uppercase tracking-wider rounded-md text-center max-w-[65px] {badge.class}">
                                                {badge.label}
                                            </span>
                                        </div>
                                    </div>
                                </td>

                                <!-- Cliente -->
                                <td class="px-6 py-5">
                                    <div class="flex flex-col min-w-0">
                                        <span class="font-bold text-sm text-text-base truncate group-hover:text-brand-400 transition-colors max-w-[200px]" title={doc.cli_des}>
                                            {doc.cli_des}
                                        </span>
                                        <span class="text-[10px] text-text-muted font-mono mt-0.5">{doc.co_cli}</span>
                                    </div>
                                </td>

                                <!-- Emision -->
                                <td class="px-6 py-5 whitespace-nowrap">
                                    <div class="flex items-center gap-2 text-text-muted">
                                        <Calendar size={14} class="opacity-65" />
                                        <span class="text-xs font-bold">{dayjs(doc.fec_emis).format('DD MMM YYYY')}</span>
                                    </div>
                                </td>

                                <!-- Vencimiento -->
                                <td class="px-6 py-5 whitespace-nowrap">
                                    <div class="flex items-center gap-2 font-bold text-xs" class:text-red-400={doc.vencido} class:text-text-muted={!doc.vencido}>
                                        <Clock size={14} class="opacity-65" />
                                        <span>{dayjs(doc.fec_venc).format('DD MMM YYYY')}</span>
                                    </div>
                                </td>

                                <!-- Monto Original -->
                                <td class="px-6 py-5 text-right whitespace-nowrap">
                                    <div class="flex flex-col items-end">
                                        <span class="font-bold text-sm text-text-base">{formatCurrency(doc.total_usd, 'USD')}</span>
                                        <span class="text-[10px] text-text-muted mt-0.5">{formatCurrency(doc.total_bs, 'VES')}</span>
                                    </div>
                                </td>

                                <!-- Saldo Pendiente -->
                                <td class="px-6 py-5 text-right whitespace-nowrap">
                                    <div class="flex flex-col items-end">
                                        <span class="font-black text-sm" class:text-red-400={doc.vencido} class:text-green-400={!doc.vencido}>
                                            {formatCurrency(doc.saldo_usd, 'USD')}
                                        </span>
                                        <span class="text-[10px] text-text-muted mt-0.5">{formatCurrency(doc.saldo_bs, 'VES')}</span>
                                    </div>
                                </td>

                                <!-- Dias Retraso -->
                                <td class="px-6 py-5 text-center">
                                    {#if doc.vencido}
                                        <span class="px-2 py-1 bg-red-500/10 text-red-500 border border-red-500/20 text-xs font-bold rounded-lg whitespace-nowrap">
                                            {doc.dias_vencidos} días
                                        </span>
                                    {:else}
                                        <span class="px-2 py-1 bg-green-500/10 text-green-500 border border-green-500/20 text-xs font-bold rounded-lg whitespace-nowrap flex items-center justify-center gap-1 max-w-[80px] mx-auto">
                                            <CheckCircle size={10} />
                                            Al día
                                        </span>
                                    {/if}
                                </td>

                                <!-- Vendedor -->
                                {#if data.hasOthers}
                                    <td class="px-6 py-5 text-center whitespace-nowrap">
                                        <span class="px-2 py-1 bg-white/5 border border-white/5 text-[11px] font-mono font-bold rounded-lg text-text-muted">
                                            {doc.co_ven}
                                        </span>
                                    </td>
                                {/if}
                            </tr>
                        {:else}
                            <tr>
                                <td colspan={data.hasOthers ? 8 : 7} class="px-6 py-20 text-center">
                                    <div class="flex flex-col items-center justify-center gap-2 opacity-50">
                                        <CheckCircle size={40} class="text-brand-500 mb-2" />
                                        <p class="text-lg font-black text-text-base">¡Cartera Impecable!</p>
                                        <p class="text-sm text-text-muted font-bold max-w-md">No se encontraron cuentas por cobrar pendientes en esta sede que coincidan con los filtros seleccionados.</p>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    {/if}
                </tbody>
            </table>
        </div>

        <!-- PAGINATION BAR -->
        {#if data.cxc?.total_pages && data.cxc.total_pages > 1}
            {@const page = data.cxc.page}
            {@const totalPages = data.cxc.total_pages}
            <div class="px-6 py-5 bg-surface-soft/40 border-t border-border-subtle flex items-center justify-between gap-4">
                <span class="text-xs font-bold text-text-muted">
                    Mostrando página <strong class="text-text-base font-black">{page}</strong> de <strong class="text-text-base font-black">{totalPages}</strong> (Consolidado: {data.cxc.total_items} docs)
                </span>

                <div class="flex items-center gap-1.5">
                    <button 
                        onclick={() => changePage(page - 1)}
                        disabled={page === 1}
                        class="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-text-muted hover:text-text-base transition disabled:opacity-30 disabled:pointer-events-none"
                    >
                        <ChevronLeft size={16} />
                    </button>

                    {#each Array.from({ length: totalPages }, (_, i) => i + 1) as p}
                        {#if p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)}
                            <button 
                                onclick={() => changePage(p)}
                                class="h-9 w-9 rounded-xl text-xs font-black transition border {p === page ? 'bg-brand-600 border-brand-500 text-white' : 'bg-white/5 hover:bg-white/10 border-white/5 text-text-muted hover:text-text-base'}"
                            >
                                {p}
                            </button>
                        {:else if p === page - 2 || p === page + 2}
                            <span class="px-1 text-text-muted text-xs font-bold">...</span>
                        {/if}
                    {/each}

                    <button 
                        onclick={() => changePage(page + 1)}
                        disabled={page === totalPages}
                        class="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-text-muted hover:text-text-base transition disabled:opacity-30 disabled:pointer-events-none"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        {/if}

    </div>

</div>

<style>
    :global(.glass) {
        background: var(--glass-bg);
        backdrop-filter: blur(var(--blur-glass));
        -webkit-backdrop-filter: blur(var(--blur-glass));
        border-color: var(--border-color);
    }
</style>
