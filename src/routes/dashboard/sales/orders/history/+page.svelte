<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { 
        Hash, DollarSign, Edit2, Trash2, 
        FileDown, ChevronLeft, ChevronRight,
        Plus, Clock, MoreVertical, Store,
        Printer, Trash, AlertCircle, FileText, Lock, Loader2, Check, CheckSquare,
        Ban
    } from 'lucide-svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { enhance } from '$app/forms';
    import { toast } from 'svelte-sonner';
    import SearchBar from '$lib/components/ui/SearchBar.svelte';
    import Combobox from '$lib/components/ui/Combobox.svelte';
    import dayjs from 'dayjs';
    import 'dayjs/locale/es';

    let { data } = $props();

    dayjs.locale('es');

    let isSearching = $state(false);
    let showDeleteModal = $state(false);
    let orderToDelete = $state<any>(null);
    let deletePassword = $state('');
    let isDeleting = $state(false);

    let showVoidModal = $state(false);
    let orderToVoid = $state<any>(null);
    let voidPassword = $state('');
    let isVoiding = $state(false);

    let showProcessModal = $state(false);
    let orderToProcess = $state<any>(null);
    let processPassword = $state('');
    let isProcessing = $state(false);

    let showVoidAllModal = $state(false);
    let voidAllPassword = $state('');
    let isVoidingAll = $state(false);

    // Filtros locales para el buscador reactivo
    let filterDoc = $state('');
    let filterSearch = $state('');
    let filterVen = $state('');
    let filterSede = $state('');

    $effect(() => {
        filterDoc = data.filters?.doc_num || '';
        filterSearch = data.filters?.search || '';
        filterVen = data.filters?.co_ven || '';
        filterSede = data.selectedBranchId || '';
    });

    function applyFilters() {
        const params = new URLSearchParams($page.url.searchParams);
        if (filterDoc) params.set('doc_num', filterDoc); else params.delete('doc_num');
        if (filterSearch) params.set('search', filterSearch); else params.delete('search');
        if (filterVen) params.set('co_ven', filterVen); else params.delete('co_ven');
        if (filterSede) params.set('branch_id', filterSede);
        params.set('page', '1');
        goto(`?${params.toString()}`);
    }

    function changePage(p: number) {
        const params = new URLSearchParams($page.url.searchParams);
        params.set('page', p.toString());
        goto(`?${params.toString()}`);
    }

    const statuses = {
        '0': { label: 'Sin procesar', class: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
        '1': { label: 'Parcial procesada', class: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
        '2': { label: 'Procesada', class: 'bg-green-500/10 text-green-500 border-green-500/20' },
        'anulada': { label: 'Anulada', class: 'bg-red-500/10 text-red-500 border-red-500/20' },
        'default': { label: 'Desconocido', class: 'bg-gray-500/10 text-gray-500 border-gray-500/20' }
    };

    function getStatus(quote: any) {
        if (quote.anulado) return statuses['anulada'];
        const st = String(quote?.status ?? '').trim();
        return (statuses as any)[st] || statuses['default'];
    }

    function candeleteOrder(quote: any) {
        const st = String(quote?.status ?? '').trim();
        return !quote?.anulado && st === '0';
    }

    function canEditOrder(quote: any) {
        const st = String(quote?.status ?? '').trim();
        return !quote?.anulado && st === '0';
    }

    function openDeleteModal(quote: any) {
        orderToDelete = quote;
        deletePassword = '';
        showDeleteModal = true;
    }

    function openVoidModal(order: any) {
        orderToVoid = order;
        voidPassword = '';
        showVoidModal = true;
    }

    function openProcessModal(order: any) {
        orderToProcess = order;
        processPassword = '';
        showProcessModal = true;
    }
</script>

<div class="space-y-6" in:fade>


    {#if data.error}
        <div class="glass border-red-500/20 p-6 rounded-3xl flex items-center gap-6 bg-red-500/5 shadow-xl shadow-red-500/10" in:slide>
            <div class="h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                <AlertCircle size={24} />
            </div>
            <div class="flex-1">
                <h3 class="text-sm font-black text-red-500 uppercase tracking-widest mb-1">Restricción de Acceso</h3>
                <p class="text-text-muted font-bold text-sm leading-relaxed">{data.error}</p>
            </div>
            <button onclick={() => window.location.reload()} class="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-black transition-all">Reintentar</button>
        </div>
    {/if}

    <!-- TOP HEADER -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex flex-col gap-2">
            <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
                <Clock size={40} class="text-brand-500" />
                Historial de Pedidos
            </h1>
            <p class="text-text-muted text-lg">
                Consulta y gestiona tus documentos emitidos en tiempo real.
            </p>
        </div>

        <div class="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            {#if data.canVoid}
                <button 
                    onclick={() => {
                        voidAllPassword = '';
                        showVoidAllModal = true;
                    }}
                    class="flex items-center justify-center gap-3 border border-amber-500/25 text-amber-500 bg-amber-500/10 hover:bg-amber-500/25 h-14 px-8 rounded-2xl font-black transition-all active:scale-95 shrink-0 w-full md:w-auto"
                >
                    <Ban size={20} />
                    Anular Todos
                </button>
            {/if}

            {#if data.canCreate}
                <button 
                    onclick={() => {
                        localStorage.removeItem('profit_order_draft');
                        goto('/dashboard/sales/orders');
                    }}
                    class="flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-500 text-white h-14 px-8 rounded-2xl font-black shadow-xl shadow-brand-500/20 transition-all active:scale-95 shrink-0 w-full md:w-auto"
                >
                    <Plus size={20} />
                    Nuevo Pedido
                </button>
            {/if}
        </div>
    </div>

    <!-- SEARCH & FILTERS ROW -->
    <div class="glass p-4 rounded-3xl border border-white/5 shadow-2xl grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-center relative z-20 mb-8 w-full">
        {#if data.branches && data.branches.length > 1}
            <div class="w-full">
                <Combobox
                    options={data.branches.map((b: any) => ({ value: b.id, label: b.name }))}
                    bind:value={filterSede}
                    placeholder="Sucursal..."
                    allLabel="Todas las Sucursales"
                    icon={Store}
                    class="w-full h-14"
                    onchange={() => applyFilters()}
                />
            </div>
        {/if}

        <div class="w-full">
            <SearchBar 
                bind:value={filterSearch} 
                isSearching={isSearching} 
                onsubmit={applyFilters} 
                placeholder="Buscar por documento, cliente o RIF..."
                className="w-full h-14"
            />
        </div>
    </div>

    <!-- MAIN LIST -->
    <div class="bg-surface-raised/50 backdrop-blur-md rounded-[32px] border border-border-subtle shadow-2xl overflow-hidden min-h-[400px]">
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-surface-soft/50 border-b border-border-subtle">
                        <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted">Fechas</th>
                        <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted">Documento</th>
                        <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted">Cliente</th>
                        <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-right">Monto</th>
                        {#if data.canSeeOthers}
                            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-center">Vendedor</th>
                        {/if}
                        <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-center">Estatus</th>
                        <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle/30">
                    {#if data.orders.length === 0}
                        <tr>
                            <td colspan={data.canSeeOthers ? 7 : 6} class="px-6 py-32 text-center">
                                <FileText size={48} class="mx-auto text-text-muted/20 mb-4" />
                                <p class="text-text-muted font-bold text-lg">No se encontraron pedidos</p>
                                <button onclick={() => {filterDoc=''; filterSearch=''; filterVen=''; applyFilters();}} class="mt-2 text-brand-500 hover:underline text-sm font-bold">Limpiar filtros</button>
                            </td>
                        </tr>
                    {:else}
                        {#each data.orders as quote}
                            {@const status = getStatus(quote)}
                            <tr class="hover:bg-brand-500/5 transition-colors group">
                                <td class="px-6 py-5">
                                    <div class="flex flex-col space-y-2">
                                        <div class="flex items-center gap-2" title="Fecha de Creación">
                                            <span class="text-[9px] font-black uppercase tracking-wider text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded leading-none shrink-0 w-14 text-center">Creación</span>
                                            <div class="flex flex-col">
                                                <span class="text-xs font-bold text-text-base leading-tight">{dayjs(quote.fec_reg || quote.fec_emis).format('DD/MM/YYYY')}</span>
                                                <span class="text-[10px] text-text-muted/70 leading-none">{dayjs(quote.fec_reg || quote.fec_emis).format('hh:mm A')}</span>
                                            </div>
                                        </div>
                                        {#if quote.fec_us_mo}
                                            <div class="flex items-center gap-2" title="Fecha de Última Modificación">
                                                <span class="text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded leading-none shrink-0 w-14 text-center">Edición</span>
                                                <div class="flex flex-col">
                                                    <span class="text-xs font-bold text-text-base leading-tight">{dayjs(quote.fec_us_mo).format('DD/MM/YYYY')}</span>
                                                    <span class="text-[10px] text-text-muted/70 leading-none">{dayjs(quote.fec_us_mo).format('hh:mm A')}</span>
                                                </div>
                                            </div>
                                        {:else}
                                            <div class="flex items-center gap-2 opacity-40">
                                                <span class="text-[9px] font-black uppercase tracking-wider text-text-muted bg-white/5 px-1.5 py-0.5 rounded leading-none shrink-0 w-14 text-center">Edición</span>
                                                <span class="text-[10px] font-bold text-text-muted font-mono leading-none">Sin modificar</span>
                                            </div>
                                        {/if}
                                    </div>
                                </td>
                                <td class="px-6 py-5">
                                    <div class="flex items-center gap-2">
                                        <span class="px-2 py-1 rounded-md bg-surface-soft border border-border-subtle text-xs font-black text-brand-500 group-hover:bg-brand-500 group-hover:border-brand-500 group-hover:text-white transition-all whitespace-nowrap">
                                            {quote.doc_num}
                                        </span>
                                    </div>
                                </td>
                                <td class="px-6 py-5">
                                    <div class="flex flex-col max-w-[200px]">
                                        <span class="text-sm font-bold text-text-base truncate">{quote.cli_des || 'CONSUMIDOR FINAL'}</span>
                                        <span class="text-[10px] text-text-muted font-black tracking-widest">{quote.co_cli}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-5 text-right font-bold whitespace-nowrap">
                                     <div class="text-base text-text-base">
                                         <span class="text-text-muted text-xs font-medium mr-1">USD</span>
                                         {(Number(quote.total_neto) / Number(quote.tasa || 1)).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                     </div>
                                     <div class="text-xs text-text-muted/60 mt-0.5">
                                         <span>Bs. </span>
                                         {Number(quote.total_neto).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                         <span class="text-[10px] text-text-muted/40 ml-1">(Tasa: {Number(quote.tasa || 1).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                                     </div>
                                 </td>
                                 {#if data.canSeeOthers}
                                     <td class="px-6 py-5 text-center">
                                         <div class="relative group/tooltip inline-block">
                                             <span
                                                 class="px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 text-xs font-bold uppercase tracking-wider cursor-help"
                                             >
                                                 {quote.co_ven || '---'}
                                             </span>
                                             <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tooltip:block bg-surface-raised border border-border-subtle px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider text-text-base whitespace-nowrap shadow-2xl z-30 pointer-events-none transition-all">
                                                 {String(quote.ven_des || quote.co_ven || '---').toUpperCase()}
                                                 <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border-subtle"></div>
                                             </div>
                                         </div>
                                     </td>
                                 {/if}
                                <td class="px-6 py-5 text-center">
                                    <span class="px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest whitespace-nowrap {status.class}">
                                        {status.label}
                                    </span>
                                </td>
                                <td class="px-6 py-5">
                                    <div class="flex items-center justify-center gap-2 whitespace-nowrap">
                                        <!-- Editar -->
                                        {#if data.canUpdate && canEditOrder(quote)}
                                            <button 
                                                onclick={() => goto(`/dashboard/sales/orders?doc_num=${quote.doc_num}&branch_id=${data.selectedBranchId}`)}
                                                class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all" title="Editar"
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                        {/if}

                                        <!-- Eliminar -->
                                        {#if data.canDelete && candeleteOrder(quote)}
                                            <button 
                                                onclick={() => openDeleteModal(quote)}
                                                class="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all" title="Eliminar"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        {/if}

                                        <!-- Anular -->
                                        {#if data.canVoid && !quote.anulado && String(quote.status ?? '').trim() === '0'}
                                            <button 
                                                onclick={() => openVoidModal(quote)}
                                                class="p-2 text-text-muted hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all" title="Anular"
                                            >
                                                <Ban size={18} />
                                            </button>
                                        {/if}

                                        <!-- Procesar (liberar comprometido de pedidos parciales) -->
                                        {#if data.canVoid && !quote.anulado && String(quote.status ?? '').trim() === '1'}
                                            <button 
                                                onclick={() => openProcessModal(quote)}
                                                class="p-2 text-text-muted hover:text-green-500 hover:bg-green-500/10 rounded-xl transition-all" title="Liberar Comprometidos / Cerrar Pedido"
                                            >
                                                <CheckSquare size={18} />
                                            </button>
                                        {/if}

                                        <!-- PDF/Reporte -->
                                        <button 
                                            onclick={() => window.open(`/dashboard/sales/orders/${quote.doc_num}/print?branch_id=${data.selectedBranchId}`, '_blank')}
                                            class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all" title="Ver Reporte PDF"
                                        >
                                            <FileDown size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    {/if}
                </tbody>
            </table>
        </div>

        <!-- PAGINATION -->
        {#if data.pagination && data.pagination.pages > 1}
            <div class="px-8 py-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
                <p class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                    Página <span class="text-text-base">{data.pagination.currentPage}</span> de <span class="text-text-base">{data.pagination.pages}</span> 
                    (Total: {data.pagination.total})
                </p>

                <div class="flex items-center gap-2">
                    <button 
                        disabled={data.pagination.currentPage === 1}
                        onclick={() => changePage(data.pagination.currentPage - 1)}
                        class="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-all border border-white/5 text-text-muted"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <button 
                        disabled={data.pagination.currentPage === data.pagination.pages}
                        onclick={() => changePage(data.pagination.currentPage + 1)}
                        class="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-all border border-white/5 text-text-muted"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>
        {/if}
    </div>
</div>

{#if showDeleteModal}
    <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div
            class="absolute inset-0 bg-black/90 backdrop-blur-md"
            onclick={() => !isDeleting && (showDeleteModal = false)}
            onkeydown={(e) =>
                e.key === "Escape" && !isDeleting && (showDeleteModal = false)}
            role="button"
            tabindex="-1"
        ></div>

        <div
            class="glass w-full max-w-md rounded-[40px] border border-white/10 shadow-2xl relative z-10 overflow-hidden"
            transition:slide
        >
            <div class="p-8 text-center space-y-6">
                <div
                    class="h-20 w-20 rounded-3xl bg-red-500/20 text-red-500 flex items-center justify-center mx-auto shadow-lg shadow-red-500/10"
                >
                    <Trash2 size={40} />
                </div>

                <div class="space-y-2">
                    <h2 class="text-2xl font-black tracking-tight">Confirmar Eliminación</h2>
                    <p class="text-text-muted text-sm px-4">
                        ¿Estás seguro de que deseas eliminar el pedido
                        <span class="text-text-base font-bold">{orderToDelete?.doc_num}</span>?
                        Esta acción es irreversible en Profit Plus.
                    </p>
                    {#if orderToDelete}
                        {@const qStatus = getStatus(orderToDelete)}
                        <div class="text-left p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                            <p class="text-xs text-text-muted"><span class="font-bold">Cliente:</span> {orderToDelete.cli_des || orderToDelete.co_cli}</p>
                            <p class="text-xs text-text-muted"><span class="font-bold">Fecha:</span> {dayjs(orderToDelete.fec_emis).format('DD/MM/YYYY HH:mm')}</p>
                            <p class="text-xs text-text-muted">
                                <span class="font-bold">Monto:</span>
                                {orderToDelete.co_mone === 'BS'
                                    ? `Bs ${Number(orderToDelete.total_neto || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : `$ ${(Number(orderToDelete.total_neto || 0) / Number(orderToDelete.tasa || 1)).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                }
                            </p>
                            <p class="text-xs text-text-muted flex items-center gap-2">
                                <span class="font-bold">Estatus:</span>
                                <span class="px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest {qStatus.class}">
                                    {qStatus.label}
                                </span>
                            </p>
                            {#if !candeleteOrder(orderToDelete)}
                                <p class="text-xs text-red-400 font-bold">
                                    Solo se pueden eliminar pedidos en estado "Sin procesar".
                                </p>
                            {/if}
                        </div>
                    {/if}
                </div>

                <form
                    method="POST"
                    action="?/deleteOrder"
                    use:enhance={() => {
                        isDeleting = true;
                        return async ({ result, update }) => {
                            await update();
                            isDeleting = false;

                            if (result.type === 'success') {
                                showDeleteModal = false;
                                toast.success((result as any).data?.message || 'Pedido eliminado con éxito');
                            } else if (result.type === 'failure' && (result as any).data?.message) {
                                toast.error((result as any).data.message);
                            } else {
                                toast.error('Error al eliminar el pedido');
                            }
                        };
                    }}
                    class="space-y-4 pt-4"
                >
                    <input type="hidden" name="doc_num" value={orderToDelete?.doc_num} />
                    <input type="hidden" name="branch_id" value={data.selectedBranchId} />

                    <div class="space-y-2 text-left">
                        <label
                            class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1"
                            for="del-pass">Contraseña de Confirmación</label
                        >
                        <div class="relative">
                            <Lock
                                size={18}
                                class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
                            />
                            <input
                                id="del-pass"
                                type="password"
                                name="password"
                                bind:value={deletePassword}
                                required
                                placeholder="Introduzca su contraseña"
                                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-red-500/50 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div class="flex gap-3 pt-4">
                        <button
                            type="button"
                            onclick={() => (showDeleteModal = false)}
                            disabled={isDeleting}
                            class="flex-1 h-14 rounded-2xl font-bold bg-white/5 hover:bg-white/10 transition-all text-text-muted disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isDeleting || !deletePassword || !candeleteOrder(orderToDelete)}
                            class="flex-1 h-14 rounded-2xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {#if isDeleting}
                                <Loader2 size={18} class="animate-spin" />
                            {:else}
                                <Check size={18} />
                                Eliminar
                            {/if}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
{/if}

{#if showVoidModal}
    <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div
            class="absolute inset-0 bg-black/90 backdrop-blur-md"
            onclick={() => !isVoiding && (showVoidModal = false)}
            onkeydown={(e) =>
                e.key === "Escape" && !isVoiding && (showVoidModal = false)}
            role="button"
            tabindex="-1"
        ></div>

        <div
            class="glass w-full max-w-md rounded-[40px] border border-white/10 shadow-2xl relative z-10 overflow-hidden"
            transition:slide
        >
            <div class="p-8 text-center space-y-6">
                <div
                    class="h-20 w-20 rounded-3xl bg-amber-500/20 text-amber-500 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10"
                >
                    <Ban size={40} />
                </div>

                <div class="space-y-2">
                    <h2 class="text-2xl font-black tracking-tight">Confirmar Anulación</h2>
                    <p class="text-text-muted text-sm px-4">
                        ¿Estás seguro de que deseas anular el pedido
                        <span class="text-text-base font-bold">{orderToVoid?.doc_num}</span>?
                        Esta acción no eliminará físicamente el documento, pero lo marcará como anulado y liberará sus renglones y stock comprometido.
                    </p>
                    {#if orderToVoid}
                        {@const qStatus = getStatus(orderToVoid)}
                        <div class="text-left p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                            <p class="text-xs text-text-muted"><span class="font-bold">Cliente:</span> {orderToVoid.cli_des || orderToVoid.co_cli}</p>
                            <p class="text-xs text-text-muted"><span class="font-bold">Fecha:</span> {dayjs(orderToVoid.fec_emis).format('DD/MM/YYYY HH:mm')}</p>
                            <p class="text-xs text-text-muted">
                                <span class="font-bold">Monto:</span>
                                {orderToVoid.co_mone === 'BS'
                                    ? `Bs ${Number(orderToVoid.total_neto || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : `$ ${(Number(orderToVoid.total_neto || 0) / Number(orderToVoid.tasa || 1)).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                }
                            </p>
                            <p class="text-xs text-text-muted flex items-center gap-2">
                                <span class="font-bold">Estatus:</span>
                                <span class="px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest {qStatus.class}">
                                    {qStatus.label}
                                </span>
                            </p>
                            {#if orderToVoid.anulado || orderToVoid.status !== '0'}
                                <p class="text-xs text-red-400 font-bold">
                                    Solo se pueden anular pedidos en estado "Sin procesar".
                                </p>
                            {/if}
                        </div>
                    {/if}
                </div>

                <form
                    method="POST"
                    action="?/voidOrder"
                    use:enhance={() => {
                        isVoiding = true;
                        return async ({ result, update }) => {
                            await update();
                            isVoiding = false;

                            if (result.type === 'success') {
                                showVoidModal = false;
                                toast.success((result as any).data?.message || 'Pedido anulado con éxito');
                            } else if (result.type === 'failure' && (result as any).data?.message) {
                                toast.error((result as any).data.message);
                            } else {
                                toast.error('Error al anular el pedido');
                            }
                        };
                    }}
                    class="space-y-4 pt-4"
                >
                    <input type="hidden" name="doc_num" value={orderToVoid?.doc_num} />
                    <input type="hidden" name="branch_id" value={data.selectedBranchId} />

                    <div class="space-y-2 text-left">
                        <label
                            class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1"
                            for="void-pass">Contraseña de Confirmación</label
                        >
                        <div class="relative">
                            <Lock
                                size={18}
                                class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
                            />
                            <input
                                id="void-pass"
                                type="password"
                                name="password"
                                bind:value={voidPassword}
                                required
                                placeholder="Introduzca su contraseña"
                                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-amber-500/50 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div class="flex gap-3 pt-4">
                        <button
                            type="button"
                            onclick={() => (showVoidModal = false)}
                            disabled={isVoiding}
                            class="flex-1 h-14 rounded-2xl font-bold bg-white/5 hover:bg-white/10 transition-all text-text-muted disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isVoiding || !voidPassword || (orderToVoid?.anulado || orderToVoid?.status !== '0')}
                            class="flex-1 h-14 rounded-2xl font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {#if isVoiding}
                                <Loader2 size={18} class="animate-spin" />
                            {:else}
                                <Check size={18} />
                                Anular
                            {/if}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
{/if}

{#if showProcessModal}
    <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div
            class="absolute inset-0 bg-black/90 backdrop-blur-md"
            onclick={() => !isProcessing && (showProcessModal = false)}
            onkeydown={(e) =>
                e.key === "Escape" && !isProcessing && (showProcessModal = false)}
            role="button"
            tabindex="-1"
        ></div>

        <div
            class="glass w-full max-w-md rounded-[40px] border border-white/10 shadow-2xl relative z-10 overflow-hidden"
            transition:slide
        >
            <div class="p-8 text-center space-y-6">
                <div
                    class="h-20 w-20 rounded-3xl bg-green-500/20 text-green-400 flex items-center justify-center mx-auto shadow-lg shadow-green-500/10"
                >
                    <CheckSquare size={40} />
                </div>

                <div class="space-y-2">
                    <h2 class="text-2xl font-black tracking-tight">Liberar Mercadería</h2>
                    <p class="text-text-muted text-sm px-4">
                        ¿Estás seguro de que deseas liberar los artículos comprometidos restantes del pedido
                        <span class="text-text-base font-bold">{orderToProcess?.doc_num}</span>?
                        Esta acción marcará el pedido como Totalmente Procesado, liberando del inventario comprometido las cantidades que no llegaron a facturarse.
                    </p>
                    {#if orderToProcess}
                        {@const qStatus = getStatus(orderToProcess)}
                        <div class="text-left p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                            <p class="text-xs text-text-muted"><span class="font-bold">Cliente:</span> {orderToProcess.cli_des || orderToProcess.co_cli}</p>
                            <p class="text-xs text-text-muted"><span class="font-bold">Fecha:</span> {dayjs(orderToProcess.fec_emis).format('DD/MM/YYYY HH:mm')}</p>
                            <p class="text-xs text-text-muted">
                                <span class="font-bold">Monto Original:</span>
                                {orderToProcess.co_mone === 'BS'
                                    ? `Bs ${Number(orderToProcess.total_neto || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : `$ ${(Number(orderToProcess.total_neto || 0) / Number(orderToProcess.tasa || 1)).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                }
                            </p>
                            <p class="text-xs text-text-muted flex items-center gap-2">
                                <span class="font-bold">Estatus:</span>
                                <span class="px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest {qStatus.class}">
                                    {qStatus.label}
                                </span>
                            </p>
                        </div>
                    {/if}
                </div>

                <form
                    method="POST"
                    action="?/processOrder"
                    use:enhance={() => {
                        isProcessing = true;
                        return async ({ result, update }) => {
                            await update();
                            isProcessing = false;

                            if (result.type === 'success') {
                                showProcessModal = false;
                                toast.success((result as any).data?.message || 'Comprometidos liberados con éxito');
                            } else if (result.type === 'failure' && (result as any).data?.message) {
                                toast.error((result as any).data.message);
                            } else {
                                toast.error('Error al liberar el pedido');
                            }
                        };
                    }}
                    class="space-y-4 pt-4"
                >
                    <input type="hidden" name="doc_num" value={orderToProcess?.doc_num} />
                    <input type="hidden" name="branch_id" value={data.selectedBranchId} />

                    <div class="space-y-2 text-left">
                        <label
                            class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1"
                            for="process-pass">Contraseña de Confirmación</label
                        >
                        <div class="relative">
                            <Lock
                                size={18}
                                class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
                            />
                            <input
                                id="process-pass"
                                type="password"
                                name="password"
                                bind:value={processPassword}
                                required
                                placeholder="Introduzca su contraseña"
                                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-green-500/50 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div class="flex gap-3 pt-4">
                        <button
                            type="button"
                            onclick={() => (showProcessModal = false)}
                            disabled={isProcessing}
                            class="flex-1 h-14 rounded-2xl font-bold bg-white/5 hover:bg-white/10 transition-all text-text-muted disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isProcessing || !processPassword}
                            class="flex-1 h-14 rounded-2xl font-bold bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {#if isProcessing}
                                <Loader2 size={18} class="animate-spin" />
                            {:else}
                                <Check size={18} />
                                Liberar
                            {/if}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
{/if}

{#if showVoidAllModal}
    <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div
            class="absolute inset-0 bg-black/90 backdrop-blur-md"
            onclick={() => !isVoidingAll && (showVoidAllModal = false)}
            onkeydown={(e) =>
                e.key === "Escape" && !isVoidingAll && (showVoidAllModal = false)}
            role="button"
            tabindex="-1"
        ></div>

        <div
            class="glass w-full max-w-md rounded-[40px] border border-amber-500/20 shadow-2xl shadow-amber-500/10 relative z-10 overflow-hidden"
            transition:slide
        >
            <div class="p-8 text-center space-y-6">
                <div
                    class="h-20 w-20 rounded-3xl bg-amber-500/20 text-amber-500 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10"
                >
                    <Ban size={40} />
                </div>

                <div class="space-y-2">
                    <h2 class="text-2xl font-black tracking-tight text-amber-400">Anulación Masiva</h2>
                    <p class="text-text-muted text-sm px-4">
                        ¿Estás absolutamente seguro de que deseas <span class="text-amber-400 font-bold">anular TODOS</span> los documentos sin procesar en la sucursal actual?
                    </p>
                    <div class="text-left p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-2 text-xs">
                        <p class="text-text-muted leading-relaxed">
                            <span class="font-bold text-amber-400/80">Ámbito de Seguridad:</span> 
                            {#if data.canSeeOthers}
                                Se anularán todos los documentos sin procesar de todos los vendedores en la sucursal activa.
                            {:else}
                                Solo se anularán los documentos sin procesar creados bajo su código de vendedor ({data.filters?.co_ven || 'su usuario'}).
                            {/if}
                        </p>
                        <p class="text-red-400 font-bold">
                            Esta acción es masiva y no se puede deshacer. Se requerirá autenticación con su contraseña.
                        </p>
                    </div>
                </div>

                <form
                    method="POST"
                    action="?/voidAllOrders"
                    use:enhance={() => {
                        isVoidingAll = true;
                        return async ({ result, update }) => {
                            await update();
                            isVoidingAll = false;

                            if (result.type === 'success') {
                                showVoidAllModal = false;
                                toast.success((result as any).data?.message || 'Proceso de anulación masiva completado.');
                            } else if (result.type === 'failure' && (result as any).data?.message) {
                                toast.error((result as any).data.message);
                            } else {
                                toast.error('Error durante la anulación masiva');
                            }
                        };
                    }}
                    class="space-y-4 pt-4"
                >
                    <input type="hidden" name="branch_id" value={data.selectedBranchId} />

                    <div class="space-y-2 text-left">
                        <label
                            class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1"
                            for="void-all-pass">Contraseña de Confirmación</label
                        >
                        <div class="relative">
                            <Lock
                                size={18}
                                class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
                            />
                            <input
                                id="void-all-pass"
                                type="password"
                                name="password"
                                bind:value={voidAllPassword}
                                required
                                placeholder="Introduzca su contraseña"
                                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-amber-500/50 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div class="flex gap-3 pt-4">
                        <button
                            type="button"
                            onclick={() => (showVoidAllModal = false)}
                            disabled={isVoidingAll}
                            class="flex-1 h-14 rounded-2xl font-bold bg-white/5 hover:bg-white/10 transition-all text-text-muted disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isVoidingAll || !voidAllPassword}
                            class="flex-1 h-14 rounded-2xl font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {#if isVoidingAll}
                                <Loader2 size={18} class="animate-spin" />
                            {:else}
                                <Check size={18} />
                                Confirmar Anulación
                            {/if}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
{/if}



