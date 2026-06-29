<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { 
        RefreshCw, FileText, TrendingDown, TrendingUp,
        Store, Filter, Loader2, DollarSign, Wallet, AlertTriangle, ArrowRightLeft
    } from 'lucide-svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { toast } from 'svelte-sonner';
    import Combobox from '$lib/components/ui/Combobox.svelte';

    let { data } = $props();

    let isSearching = $state(false);

    // Filtros locales
    let filterSede = $state('');
    let filterMonto = $state(0);
    let filterTipo = $state('p2p');

    $effect(() => {
        filterSede = data.selectedBranchId || '';
        filterMonto = data.transAmount || 15000000;
        filterTipo = data.filterType || 'block';
    });

    function applyFilters() {
        isSearching = true;
        const params = new URLSearchParams($page.url.searchParams);
        
        if (filterSede) params.set('branch_id', filterSede); else params.delete('branch_id');
        if (filterMonto > 0) params.set('trans_amount', filterMonto.toString()); else params.delete('trans_amount');
        params.set('filter_type', 'block'); // Force to 'block' (merchant)
        
        goto(`?${params.toString()}`).finally(() => {
            isSearching = false;
            toast.success('Tasas actualizadas en tiempo real.');
        });
    }

    function formatNumber(val: number, decimals = 2) {
        return new Intl.NumberFormat('es-VE', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(val);
    }

    // Cálculo del diferencial usando la misma fórmula de tasas-bcv-binance
    // differential = (binanceAverage / profitRate - 1) * 100
    let differential = $derived(data.profitRate > 0 && data.binanceAverage > 0
        ? (data.binanceAverage / data.profitRate - 1) * 100
        : 0);
</script>

<div class="space-y-8 animate-fade-in" in:fade>
    
    {#if data.error}
        <div class="glass border-red-500/20 p-6 rounded-3xl flex items-center gap-6 bg-red-500/5 shadow-xl shadow-red-500/10" in:slide>
            <div class="h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                <AlertTriangle size={24} />
            </div>
            <div class="flex-1">
                <h3 class="text-sm font-black text-red-500 uppercase tracking-widest mb-1">Advertencia de Consulta</h3>
                <p class="text-text-muted font-bold text-sm leading-relaxed">{data.error}</p>
            </div>
            <div class="flex gap-2">
                <button onclick={() => window.location.reload()} class="px-5 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-xs font-black transition-all cursor-pointer">Reintentar</button>
            </div>
        </div>
    {/if}

    <!-- HEADER -->
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div class="flex flex-col gap-2">
            <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
                <ArrowRightLeft size={40} class="text-brand-500" />
                Diferencial Cambiario
            </h1>
            <p class="text-text-muted text-lg">
                Comparativa entre el promedio P2P de Binance (USDT/VES) y la tasa configurada en Profit Plus.
            </p>
        </div>
    </div>

    <!-- TARJETAS DE INDICADORES (KPIs) - LÍNEA DE DISEÑO CxC -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6" in:slide>
        <!-- Tasa Profit -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group">
            <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-brand-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"></div>
            <div class="flex items-start justify-between">
                <div class="space-y-2">
                    <span class="text-xs font-black uppercase tracking-widest text-brand-400">Tasa Profit Oficial</span>
                    {#if data.profitRate > 0}
                        <h2 class="text-2xl font-black text-text-base tracking-tight">{formatNumber(data.profitRate)} <span class="text-xs text-text-muted">VES</span></h2>
                    {:else}
                        <h2 class="text-2xl font-black text-text-muted tracking-tight font-mono">No configurada</h2>
                    {/if}
                    <p class="text-xs text-text-muted font-bold">Sede: {data.branches.find(b => b.id === data.selectedBranchId)?.name || 'Desconocida'}</p>
                </div>
                <div class="h-10 w-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500">
                    <Store size={20} />
                </div>
            </div>
        </div>

        <!-- Promedio Binance -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group">
            <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"></div>
            <div class="flex items-start justify-between">
                <div class="space-y-2">
                    <span class="text-xs font-black uppercase tracking-widest text-amber-500/80">Promedio Binance</span>
                    {#if data.binanceAverage > 0}
                        <h2 class="text-2xl font-black text-amber-400 tracking-tight">{formatNumber(data.binanceAverage)} <span class="text-xs text-text-muted">VES</span></h2>
                    {:else}
                        <h2 class="text-2xl font-black text-text-muted tracking-tight font-mono">No disponible</h2>
                    {/if}
                    <p class="text-xs text-text-muted font-bold">Fuente: Binance P2P (Bloques)</p>
                </div>
                <div class="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <Wallet size={20} />
                </div>
            </div>
        </div>

        <!-- Diferencial -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group">
            {#if differential < 0}
                <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-red-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"></div>
            {:else}
                <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-green-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"></div>
            {/if}
            <div class="flex items-start justify-between">
                <div class="space-y-2">
                    {#if differential < 0}
                        <span class="text-xs font-black uppercase tracking-widest text-red-500/80">Diferencial</span>
                    {:else}
                        <span class="text-xs font-black uppercase tracking-widest text-green-500/80">Diferencial</span>
                    {/if}
                    {#if data.binanceAverage > 0 && data.profitRate > 0}
                        <h2 class="text-2xl font-black tracking-tight {differential < 0 ? 'text-red-400' : 'text-green-400'}">{differential.toFixed(2)}%</h2>
                    {:else}
                        <h2 class="text-2xl font-black text-text-muted tracking-tight font-mono">Sin cálculo</h2>
                    {/if}
                    <p class="text-xs text-text-muted font-bold">Cálculo Profit / Binance</p>
                </div>
                <div class="h-10 w-10 rounded-xl flex items-center justify-center 
                    {differential < 0 
                        ? 'bg-red-500/10 border border-red-500/20 text-red-400' 
                        : 'bg-green-500/10 border border-green-500/20 text-green-400'}">
                    {#if differential < 0}
                        <TrendingDown size={20} />
                    {:else}
                        <TrendingUp size={20} />
                    {/if}
                </div>
            </div>
        </div>
    </div>

    <!-- FILTROS AUXILIARES (SEDE Y MONTO) - LÍNEA DE DISEÑO CxC -->
    <div class="glass p-5 rounded-3xl border border-border-subtle shadow-2xl flex flex-col xl:flex-row gap-4 items-center w-full relative z-10">
        <!-- Selector de Sucursal -->
        <div class="w-full xl:w-72">
            <Combobox
                options={data.branches.map((b: any) => ({ value: b.id, label: b.name }))}
                bind:value={filterSede}
                placeholder="Sucursal..."
                icon={Store}
                class="w-full h-12"
                onchange={() => applyFilters()}
            />
        </div>

        <!-- Monto Transacción Input -->
        <div class="w-full xl:w-64">
            <div class="relative w-full h-12 bg-surface-soft border border-border-subtle rounded-xl flex items-center px-3 group focus-within:border-brand-500/50 transition-all">
                <DollarSign size={16} class="text-text-muted mr-2.5 shrink-0" />
                <input 
                    type="number"
                    min="0"
                    bind:value={filterMonto}
                    placeholder="Monto transacción..."
                    class="w-full h-full bg-transparent outline-none text-sm text-text-base font-bold font-mono"
                />
            </div>
        </div>

        <!-- Actualizar Button -->
        <button 
            onclick={applyFilters}
            disabled={isSearching}
            class="h-12 px-6 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-xs font-black transition-all cursor-pointer flex items-center gap-2 text-text-base xl:ml-auto w-full xl:w-auto justify-center"
        >
            {#if isSearching}
                <Loader2 size={14} class="animate-spin text-text-muted" />
            {:else}
                <RefreshCw size={14} class="text-text-muted" />
            {/if}
            Actualizar
        </button>
    </div>

    <!-- ANUNCIOS DETALLE (TABLA) -->
    <div class="glass border-border-subtle rounded-3xl overflow-hidden shadow-lg bg-surface-card/20">
        <div class="p-6 border-b border-border-subtle bg-surface-soft/30 flex justify-between items-center">
            <h3 class="text-lg font-black tracking-tight flex items-center gap-2">
                <FileText size={20} class="text-text-muted" />
                Compra por Bloques (Merchant)
            </h3>
            <span class="text-xs font-bold text-text-muted bg-surface-soft px-3 py-1 rounded-full">
                {data.binanceAds.length} anuncios
            </span>
        </div>

        <div class="overflow-x-auto">
            <table class="w-full text-sm text-left border-collapse">
                <thead>
                    <tr class="bg-surface-soft/40 font-black uppercase text-[10px] tracking-widest text-text-muted border-b border-border-subtle">
                        <th class="px-6 py-4">Anunciante</th>
                        <th class="px-6 py-4">Confianza</th>
                        <th class="px-6 py-4">Precio</th>
                        <th class="px-6 py-4 text-right">Límites</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle/30 font-bold">
                    {#if data.binanceAds && data.binanceAds.length > 0}
                        {#each data.binanceAds as ad}
                            <tr class="hover:bg-surface-soft/20 transition-colors">
                                <td class="px-6 py-5 flex items-center gap-2">
                                    <span class="text-text-main">{ad.advertiser.nickName}</span>
                                    {#if ad.advertiser.userType === 'merchant'}
                                        <span class="px-1.5 py-0.5 rounded bg-yellow-400/20 text-yellow-500 text-[9px] font-black uppercase tracking-wider">M</span>
                                    {/if}
                                </td>
                                <td class="px-6 py-5">
                                    <div class="flex flex-col gap-0.5">
                                        <span class="text-text-main">{ad.advertiser.monthOrderCount} ord.</span>
                                        <span class="text-[10px] text-green-500 font-bold">{(ad.advertiser.monthFinishRate * 100).toFixed(1)}%</span>
                                    </div>
                                </td>
                                <td class="px-6 py-5 font-mono text-base font-black text-text-main">
                                    {formatNumber(parseFloat(ad.adv.price))} VES
                                </td>
                                <td class="px-6 py-5 text-right font-mono text-text-muted text-xs">
                                    {formatNumber(parseFloat(ad.adv.minSingleTransAmount), 0)} - {formatNumber(parseFloat(ad.adv.maxSingleTransAmount), 0)}
                                </td>
                            </tr>
                        {/each}
                    {:else}
                        <tr>
                            <td colspan="4" class="px-6 py-10 text-center text-text-muted">
                                No se encontraron anuncios en Binance P2P con los filtros actuales.
                            </td>
                        </tr>
                    {/if}
                </tbody>
            </table>
        </div>
    </div>

</div>
