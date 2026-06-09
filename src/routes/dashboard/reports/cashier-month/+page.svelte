<script lang="ts">
    import { fade, slide, scale } from 'svelte/transition';
    import { 
        Trophy, Crown, Calendar, Store, Filter, RefreshCw, 
        AlertTriangle, Users, FileText, Award, ChevronRight,
        Clock, UserCheck, TrendingUp, Sparkles, Printer
    } from 'lucide-svelte';
    import { goto } from '$app/navigation';
    import { page, navigating } from '$app/stores';
    import Combobox from '$lib/components/ui/Combobox.svelte';
    import dayjs from 'dayjs';
    import 'dayjs/locale/es';

    let { data } = $props();

    dayjs.locale('es');

    let isSearching = $state(false);

    // Filtros
    let filterMonth = $state('');
    let filterSede = $state('all');
    let filterSearch = $state('');

    $effect(() => {
        const today = new Date();
        const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        filterMonth = $page.url.searchParams.get('month') || data.selectedMonth || defaultMonth;
        filterSede = $page.url.searchParams.get('branch_id') || data.selectedBranchId || 'all';
    });

    function applyFilters() {
        isSearching = true;
        const params = new URLSearchParams($page.url.searchParams);
        
        if (filterMonth) params.set('month', filterMonth); else params.delete('month');
        if (filterSede && filterSede !== 'all') params.set('branch_id', filterSede); else params.delete('branch_id');
        
        goto(`?${params.toString()}`).finally(() => {
            isSearching = false;
        });
    }



    // Datos procesados
    const cashiers = $derived.by(() => {
        const raw = data.report?.data || [];
        // Ordenar estrictamente por cantidad de documentos de mayor a menor
        const sorted = [...raw].sort((a: any, b: any) => Number(b.total_facturas) - Number(a.total_facturas));
        
        if (!filterSearch.trim()) return sorted;
        const s = filterSearch.toLowerCase().trim();
        return sorted.filter((c: any) => 
            c.co_us_in.toLowerCase().includes(s) || 
            c.nombre.toLowerCase().includes(s)
        );
    });

    // Cajero ganador (#1 del Mes)
    const winner = $derived(cashiers.length > 0 ? cashiers[0] : null);

    // Métricas globales del mes
    const metrics = $derived.by(() => {
        let docs = 0;
        let bs = 0;
        let usd = 0;
        for (const c of cashiers) {
            docs += Number(c.total_facturas) || 0;
            bs += Number(c.total_neto_bs) || 0;
            usd += Number(c.total_neto_usd) || 0;
        }
        return { docs, bs, usd };
    });



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
                <h3 class="text-sm font-black text-red-500 uppercase tracking-widest mb-1">Error al consultar datos</h3>
                <p class="text-text-muted font-bold text-sm leading-relaxed">{data.error}</p>
            </div>
            <button onclick={() => window.location.reload()} class="px-5 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-xs font-black transition-all cursor-pointer">Reintentar</button>
        </div>
    {/if}

    <!-- TOP HEADER -->
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6 print:flex-row">
        <div class="flex flex-col gap-2">
            <h1 class="text-4xl font-black tracking-tight flex items-center gap-3 print:text-2xl">
                <Award size={40} class="text-brand-500 print:h-8 print:w-8" />
                Cajero del Mes
            </h1>
            <p class="text-text-muted text-lg print:text-sm">
                Clasificación y ventas consolidadas por facturación de caja.
            </p>
        </div>
        
        <!-- <div class="flex items-center gap-3 print:hidden">
            <button 
                onclick={printReport}
                class="px-5 py-2.5 bg-surface-soft border border-border-subtle hover:bg-surface-strong text-text-base text-xs font-black rounded-xl transition-all flex items-center gap-2 cursor-pointer"
            >
                <Printer size={16} />
                Imprimir Reporte
            </button>
        </div> -->
    </div>

    <!-- METRICS CARDS -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 print:grid-cols-3">
        <!-- Card 1: Facturas Totales -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group print:p-4">
            <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl"></div>
            <div class="flex items-start justify-between">
                <div class="space-y-2">
                    <span class="text-xs font-black uppercase tracking-widest text-text-muted">Documentos Procesados</span>
                    <h2 class="text-2xl font-black text-text-base tracking-tight">{metrics.docs} docs</h2>
                    <p class="text-xs text-text-muted font-bold">Total facturado en el mes</p>
                </div>
                <div class="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 print:hidden">
                    <FileText size={20} />
                </div>
            </div>
        </div>

        <!-- Card 2: Cajeros Activos -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group print:p-4">
            <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-green-500/5 rounded-full blur-2xl"></div>
            <div class="flex items-start justify-between">
                <div class="space-y-2">
                    <span class="text-xs font-black uppercase tracking-widest text-text-muted">Cajeros Activos</span>
                    <h2 class="text-2xl font-black text-text-base tracking-tight">{cashiers.length} cajeros</h2>
                    <p class="text-xs text-text-muted font-bold">Con operaciones registradas</p>
                </div>
                <div class="h-10 w-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500 print:hidden">
                    <Users size={20} />
                </div>
            </div>
        </div>

        <!-- Card 3: Promedio de Documentos -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group print:p-4">
            <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl"></div>
            <div class="flex items-start justify-between">
                <div class="space-y-2">
                    <span class="text-xs font-black uppercase tracking-widest text-text-muted">Promedio por Cajero</span>
                    <h2 class="text-2xl font-black text-text-base tracking-tight">{(cashiers.length > 0 ? metrics.docs / cashiers.length : 0).toFixed(1)} docs</h2>
                    <p class="text-xs text-text-muted font-bold">Rendimiento medio mensual</p>
                </div>
                <div class="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 print:hidden">
                    <TrendingUp size={20} />
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
                    bind:value={filterSede}
                    placeholder="Sucursal..."
                    allLabel="Todas las Sucursales"
                    icon={Store}
                    class="w-full h-12"
                    onchange={() => applyFilters()}
                />
            </div>
        {/if}

        <!-- Month Filter -->
        <div class="w-full xl:w-64">
            <div class="relative w-full h-12 bg-surface-soft border border-border-subtle rounded-xl flex items-center px-4 group focus-within:border-brand-500/50 transition-all">
                <Calendar size={16} class="text-text-muted mr-2.5 shrink-0" />
                <input 
                    type="month"
                    bind:value={filterMonth}
                    onchange={applyFilters}
                    class="w-full h-full bg-transparent outline-none text-sm text-text-base font-bold cursor-pointer"
                />
            </div>
        </div>

        <!-- Search Bar -->
        <div class="w-full xl:flex-1">
            <div class="relative w-full h-12 bg-surface-soft border border-border-subtle rounded-xl flex items-center px-4 focus-within:border-brand-500/50 transition-all">
                <Users size={16} class="text-text-muted mr-2.5 shrink-0" />
                <input 
                    type="text"
                    bind:value={filterSearch}
                    placeholder="Buscar cajero por nombre o usuario..."
                    class="w-full h-full bg-transparent outline-none text-sm text-text-base font-bold placeholder:text-text-muted/40"
                />
            </div>
        </div>

        <button 
            onclick={() => applyFilters()} 
            class="h-12 w-full xl:w-auto px-6 bg-surface-soft border border-border-subtle hover:bg-surface-strong text-text-base font-black rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
            <RefreshCw size={16} class={isSearching ? 'animate-spin' : ''} />
            Actualizar
        </button>
    </div>

    <!-- WINNER HERO BANNER -->
    {#if winner && !filterSearch}
        <div class="glass p-8 rounded-3xl border border-amber-500/30 relative overflow-hidden group shadow-2xl flex flex-col md:flex-row items-center gap-8 bg-gradient-to-r from-amber-500/5 via-amber-500/0 to-transparent print:p-6" in:fade>
            <!-- Background lights -->
            <div class="absolute -right-20 -bottom-20 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700"></div>
            
            <div class="h-28 w-28 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 relative shrink-0">
                <div class="absolute -top-6 text-amber-500 drop-shadow-lg animate-bounce">
                    <Crown size={36} fill="currentColor" />
                </div>
                <Trophy size={56} class="mt-2" />
            </div>

            <div class="flex-1 text-center md:text-left space-y-3">
                <div class="flex flex-col md:flex-row md:items-center gap-3 justify-center md:justify-start">
                    <span class="px-3 py-1 bg-amber-500/20 border border-amber-500/30 text-[10px] font-black uppercase tracking-widest text-amber-500 rounded-full w-fit mx-auto md:mx-0 flex items-center gap-1">
                        <Sparkles size={10} />
                        El Cajero del Mes
                    </span>
                    <span class="text-xs font-bold text-text-muted">
                        Período: <strong class="text-text-base font-black">{dayjs(filterMonth).format('MMMM YYYY').toUpperCase()}</strong>
                    </span>
                </div>
                
                <h2 class="text-3xl font-black text-text-base tracking-tight">{winner.nombre}</h2>
                <p class="text-sm text-text-muted font-bold">
                    Código de Usuario en Profit: <span class="font-mono text-amber-500 font-black">{winner.co_us_in}</span>
                </p>

                <div class="pt-2 flex flex-wrap gap-6 justify-center md:justify-start">
                    <div class="text-xs font-bold text-text-muted">
                        Documentos Procesados: <span class="text-text-base font-black text-sm">{winner.total_facturas}</span>
                    </div>
                    <div class="text-xs font-bold text-text-muted">
                        Participación: <span class="text-brand-500 font-black text-sm">{metrics.docs > 0 ? ((Number(winner.total_facturas) / metrics.docs) * 100).toFixed(1) : 0}%</span>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- MAIN LIST - RANKING GRID -->
    {#if isSearching}
        <div class="glass p-20 rounded-[32px] border border-border-subtle shadow-2xl flex flex-col items-center justify-center gap-4 min-h-[350px] print:hidden">
            <RefreshCw size={48} class="animate-spin text-brand-500" />
            <p class="text-base font-black text-text-muted">Cargando reporte de cajeros con el agente...</p>
        </div>
    {:else if cashiers.length === 0}
        <div class="glass p-20 rounded-[32px] border border-border-subtle shadow-2xl flex flex-col items-center justify-center gap-3 text-center min-h-[350px]" in:fade>
            <Users size={56} class="text-brand-500 mb-2" />
            <h3 class="text-2xl font-black text-text-base">Sin Datos</h3>
            <p class="text-sm text-text-muted font-bold max-w-md">No se encontraron registros de ventas de cajeros en el mes/sucursal seleccionados.</p>
        </div>
    {:else}
        <!-- Cashiers List / Table -->
        <div class="glass border border-border-subtle rounded-3xl shadow-xl overflow-hidden" in:fade>
            <div class="p-6 border-b border-border-subtle bg-surface-soft/40 print:p-4">
                <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                    <Users size={16} />
                    Clasificación General de Cajeros
                </h3>
            </div>
            
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-surface-strong border-b border-border-subtle text-xs font-black uppercase tracking-wider text-text-muted">
                            <th class="px-6 py-4 text-center w-16">Pos</th>
                            <th class="px-6 py-4">Cajero / Usuario</th>
                            <th class="px-6 py-4 text-center">Documentos</th>
                            <th class="px-6 py-4 w-1/3 print:hidden">% Participación</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border-subtle text-sm">
                        {#each cashiers as cashier, index (cashier.co_us_in)}
                            {@const pct = metrics.docs > 0 ? (Number(cashier.total_facturas) / metrics.docs * 100) : 0}
                            {@const barColor = index === 0 ? '#f59e0b' : index === 1 ? '#94a3b8' : index === 2 ? '#b45309' : 'var(--color-brand-500)'}
                            <tr class="hover:bg-surface-soft/60 transition-colors">
                                <!-- Position -->
                                <td class="px-6 py-4 text-center font-black">
                                    <div class="flex items-center justify-center">
                                        {#if index < 3}
                                            {@const badgeColor = index === 0 ? '#eab308' : index === 1 ? '#3b82f6' : '#ef4444'}
                                            {@const badgeBg = index === 0 ? 'rgba(234, 179, 8, 0.1)' : index === 1 ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)'}
                                            {@const badgeBorder = index === 0 ? 'rgba(234, 179, 8, 0.3)' : index === 1 ? 'rgba(59, 130, 246, 0.3)' : 'rgba(239, 68, 68, 0.3)'}
                                            <div 
                                                class="h-8 w-8 rounded-full flex items-center justify-center font-black text-sm border shrink-0"
                                                style="color: {badgeColor}; background-color: {badgeBg}; border-color: {badgeBorder};"
                                            >
                                                {index + 1}
                                            </div>
                                        {:else}
                                            <span class="text-text-muted">{index + 1}</span>
                                        {/if}
                                    </div>
                                </td>
                                
                                <!-- Name / Code -->
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-3">
                                        <div class="flex flex-col">
                                            <span class="font-black text-text-base">{cashier.nombre}</span>
                                            <span class="text-[10px] text-text-muted font-mono font-bold mt-0.5">{cashier.co_us_in}</span>
                                        </div>
                                    </div>
                                </td>
                                
                                <!-- Invoices -->
                                <td class="px-6 py-4 text-center font-bold text-text-base">
                                    {cashier.total_facturas}
                                </td>

                                <!-- Visual progress bar percentage -->
                                <td class="px-6 py-4 print:hidden">
                                    <div class="flex items-center gap-3">
                                        <div class="w-full bg-surface-soft h-2 rounded-full overflow-hidden border border-border-subtle">
                                            <div 
                                                class="h-full rounded-full transition-all duration-500" 
                                                style="width: {pct}%; background-color: {barColor};"
                                            ></div>
                                        </div>
                                        <span class="text-[10px] font-black text-text-muted shrink-0 w-8 text-right">{pct.toFixed(0)}%</span>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}
</div>

<style>
    :global(.glass) {
        background: var(--glass-bg);
        backdrop-filter: blur(var(--blur-glass));
        -webkit-backdrop-filter: blur(var(--blur-glass));
        border-color: var(--border-color);
    }
    
    @media print {
        :global(body) {
            background: white !important;
            color: black !important;
        }
        :global(.glass) {
            background: transparent !important;
            border-color: #ddd !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
        }
        :global(.bg-surface-raised), :global(.bg-surface-soft) {
            background: #f9f9f9 !important;
        }
    }
</style>
