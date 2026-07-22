<!-- src/routes/dashboard/warehouse/transfers/+page.svelte -->
<script lang="ts">
  import { page } from "$app/stores";
  import { goto, invalidateAll } from "$app/navigation";
  import { 
    ArrowRightLeft, Plus, RefreshCw, Search, Store, CheckCircle, 
    XCircle, Clock, Truck, Eye, X, AlertTriangle, Box, FileText, Check, ShieldAlert
  } from "lucide-svelte";
  import { fade } from "svelte/transition";
  import { toast } from "svelte-sonner";
  import Combobox from "$lib/components/ui/Combobox.svelte";

  let { data } = $props();

  let activeTab = $state<'outgoing' | 'incoming' | 'all'>('incoming');
  let selectedBranch = $state('all');
  let searchInput = $state('');

  let isAccepting = $state<string | null>(null);
  let detailModalOpen = $state(false);
  let selectedTransfer = $state<any>(null);

  // Auto sync branch from URL
  $effect(() => {
    selectedBranch = data.selectedBranchId || 'all';
  });

  function applyFilters() {
    const qParams = new URLSearchParams();
    if (selectedBranch && selectedBranch !== 'all') {
      qParams.set('branch_id', selectedBranch);
    }
    goto(`?${qParams.toString()}`);
  }

  // Filtrado reactivo de traslados segun pestaña y busqueda
  let filteredTransfers = $derived.by(() => {
    let list = data.transfers || [];

    if (activeTab === 'incoming') {
      list = list.filter((t: any) => t.status === 'TRANSITO' || (t.target_branch_id === selectedBranch && t.status === 'TRANSITO'));
    } else if (activeTab === 'outgoing') {
      list = list.filter((t: any) => t.source_branch_id === selectedBranch || selectedBranch === 'all');
    }

    if (searchInput.trim()) {
      const query = searchInput.trim().toLowerCase();
      list = list.filter((t: any) => 
        t.transfer_number?.toLowerCase().includes(query) ||
        t.source_branch?.name?.toLowerCase().includes(query) ||
        t.target_branch?.name?.toLowerCase().includes(query) ||
        t.source_ajue_num?.toLowerCase().includes(query) ||
        t.target_ajue_num?.toLowerCase().includes(query)
      );
    }

    return list;
  });

  let metrics = $derived.by(() => {
    const all = data.transfers || [];
    const inTransit = all.filter((t: any) => t.status === 'TRANSITO').length;
    const accepted = all.filter((t: any) => t.status === 'ACEPTADO').length;
    return { total: all.length, inTransit, accepted };
  });

  function openDetail(transfer: any) {
    selectedTransfer = transfer;
    detailModalOpen = true;
  }

  async function handleAcceptTransfer(transferId: string, transferNum: string) {
    if (!confirm(`¿Confirmar recepción del Traslado ${transferNum}? Se registrará el Ajuste de Entrada de Inventario en esta sede.`)) {
      return;
    }

    isAccepting = transferId;
    try {
      const res = await fetch('/api/agent/transfers/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transfer_id: transferId })
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        toast.success(resData.message || 'Traslado aceptado con éxito.');
        detailModalOpen = false;
        await invalidateAll();
      } else {
        toast.error(resData.message || 'Error al aceptar el traslado.');
      }
    } catch (e: any) {
      toast.error(`Error de red: ${e.message}`);
    } finally {
      isAccepting = null;
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'ACEPTADO':
        return { label: 'Completado / Aceptado', bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', icon: CheckCircle };
      case 'TRANSITO':
        return { label: 'En Tránsito / Pendiente', bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400', icon: Clock };
      case 'RECHAZADO':
      case 'CANCELADO':
        return { label: 'Cancelado', bg: 'bg-red-500/10 border-red-500/30 text-red-400', icon: XCircle };
      default:
        return { label: status, bg: 'bg-white/10 border-white/20 text-text-muted', icon: Box };
    }
  }
</script>

<svelte:head>
  <title>{data.title} — GalpeApp</title>
</svelte:head>

<div class="space-y-8" in:fade={{ duration: 150 }}>

  <!-- CABECERA -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight flex items-center gap-3 text-text-base">
        <ArrowRightLeft size={36} class="text-brand-500" />
        {data.title}
      </h1>
      <p class="text-text-muted mt-2 text-base">Control de envío y recepción de inventario mediante Ajustes de Salida y Entrada entre sedes.</p>
    </div>

    <div class="flex flex-wrap items-center gap-4">
      <a 
        href="/dashboard/warehouse/transfers/new"
        class="flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-500 text-white h-14 px-8 rounded-2xl font-black shadow-xl shadow-brand-500/20 transition-all active:scale-95 shrink-0 w-full md:w-auto cursor-pointer"
      >
        <Plus size={20} />
        Nuevo Traslado
      </a>
    </div>
  </div>

  <!-- METRICAS -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div class="glass p-6 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-xs font-bold uppercase tracking-widest text-text-muted">En Tránsito / Pendientes</span>
          <div class="text-3xl font-black text-amber-400 mt-2">{metrics.inTransit}</div>
        </div>
        <div class="h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <Truck size={24} />
        </div>
      </div>
    </div>

    <div class="glass p-6 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-xs font-bold uppercase tracking-widest text-text-muted">Aceptados / Completados</span>
          <div class="text-3xl font-black text-emerald-400 mt-2">{metrics.accepted}</div>
        </div>
        <div class="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          <CheckCircle size={24} />
        </div>
      </div>
    </div>

    <div class="glass p-6 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-xs font-bold uppercase tracking-widest text-text-muted">Total Registrados</span>
          <div class="text-3xl font-black text-brand-400 mt-2">{metrics.total}</div>
        </div>
        <div class="h-12 w-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
          <Box size={24} />
        </div>
      </div>
    </div>
  </div>

  <!-- FILTROS Y CONTROLES -->
  <div class="glass p-6 rounded-3xl border border-white/5 shadow-2xl flex flex-col md:flex-row gap-4 items-center justify-between relative z-20">
    
    <!-- Tabs Navegación -->
    <div class="flex items-center bg-white/5 border border-white/5 p-1.5 rounded-2xl w-full md:w-auto">
      <button 
        onclick={() => activeTab = 'incoming'} 
        class="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 {activeTab === 'incoming' ? 'bg-brand-500 text-white shadow-lg' : 'text-text-muted hover:text-white'}"
      >
        <Truck size={16} />
        Entrantes (Por Recibir)
      </button>
      <button 
        onclick={() => activeTab = 'outgoing'} 
        class="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 {activeTab === 'outgoing' ? 'bg-brand-500 text-white shadow-lg' : 'text-text-muted hover:text-white'}"
      >
        <ArrowRightLeft size={16} />
        Salientes
      </button>
      <button 
        onclick={() => activeTab = 'all'} 
        class="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 {activeTab === 'all' ? 'bg-brand-500 text-white shadow-lg' : 'text-text-muted hover:text-white'}"
      >
        <FileText size={16} />
        Historial
      </button>
    </div>

    <!-- Sede Filter & Search -->
    <div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
      {#if data.branches && data.branches.length > 1}
        <div class="w-full sm:w-60 relative z-30">
          <Combobox
            options={data.branches.map((b: any) => ({ value: b.id, label: b.name }))}
            bind:value={selectedBranch}
            placeholder="Sucursal..."
            allLabel="Todas las Sucursales"
            icon={Store}
            class="w-full h-12"
            onchange={applyFilters}
          />
        </div>
      {/if}

      <div class="relative w-full sm:w-64">
        <input 
          type="text" 
          bind:value={searchInput}
          placeholder="Buscar por Nro. o Sede..."
          class="w-full h-12 bg-white/5 border border-white/5 rounded-2xl pl-10 pr-4 text-xs font-bold text-text-base placeholder:text-text-muted/40 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
        />
        <Search size={16} class="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted opacity-50" />
      </div>
    </div>
  </div>

  <!-- TABLA DE TRASLADOS -->
  {#if filteredTransfers && filteredTransfers.length > 0}
    <div class="glass rounded-[32px] border border-white/5 overflow-hidden shadow-2xl">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-white/5 bg-white/[0.02] text-text-muted text-xs font-bold uppercase tracking-wider">
              <th class="px-6 py-5">Nro. Traslado</th>
              <th class="px-6 py-5">Sede Origen</th>
              <th class="px-6 py-5">Sede Destino</th>
              <th class="px-6 py-5">Salida (Profit)</th>
              <th class="px-6 py-5">Entrada (Profit)</th>
              <th class="px-6 py-5">Fecha</th>
              <th class="px-6 py-5 text-center">Estado</th>
              <th class="px-6 py-5 text-right">Acción</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5 text-sm font-semibold">
            {#each filteredTransfers as item}
              {@const badge = getStatusBadge(item.status)}
              <tr class="hover:bg-white/[0.02] transition-colors">
                <td class="px-6 py-4 font-mono font-black text-brand-400">{item.transfer_number}</td>
                <td class="px-6 py-4 text-text-base">{item.source_branch?.name || '---'}</td>
                <td class="px-6 py-4 text-text-base">{item.target_branch?.name || '---'}</td>
                <td class="px-6 py-4 font-mono text-xs text-amber-400 font-bold">{item.source_ajue_num || 'Pendiente'}</td>
                <td class="px-6 py-4 font-mono text-xs text-emerald-400 font-bold">{item.target_ajue_num || 'Sin Ingresar'}</td>
                <td class="px-6 py-4 text-text-muted text-xs font-mono">{new Date(item.created_at).toLocaleDateString('es-VE')}</td>
                <td class="px-6 py-4 text-center">
                  <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border {badge.bg}">
                    <badge.icon size={12} />
                    {badge.label}
                  </span>
                </td>
                <td class="px-6 py-4 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <button 
                      onclick={() => openDetail(item)}
                      class="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-base transition-all cursor-pointer"
                      title="Ver Detalle"
                    >
                      <Eye size={18} />
                    </button>

                    {#if item.status === 'TRANSITO'}
                      <button 
                        onclick={() => handleAcceptTransfer(item.id, item.transfer_number)}
                        disabled={isAccepting === item.id}
                        class="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 font-bold text-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                        title="Confirmar recepción e ingresar inventario"
                      >
                        {#if isAccepting === item.id}
                          <RefreshCw size={14} class="animate-spin" />
                        {:else}
                          <Check size={14} />
                        {/if}
                        Aceptar Ingreso
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {:else}
    <div class="glass p-12 rounded-[40px] border border-white/5 flex flex-col items-center justify-center text-center space-y-4 min-h-[350px]">
      <div class="h-20 w-20 rounded-3xl bg-white/5 flex items-center justify-center text-text-muted/20">
        <ArrowRightLeft size={48} />
      </div>
      <h2 class="text-2xl font-bold text-text-muted">Sin traslados registrados</h2>
      <p class="text-text-muted/60 max-w-sm">No se encontraron movimientos con los filtros aplicados. Puedes registrar un nuevo envío entre sedes.</p>
    </div>
  {/if}
</div>

<!-- MODAL DETALLE DE TRASLADO -->
{#if detailModalOpen && selectedTransfer}
  <div class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 md:p-6" transition:fade={{ duration: 150 }}>
    <div class="glass max-w-3xl w-full max-h-[90vh] rounded-[32px] border border-white/10 shadow-2xl flex flex-col overflow-hidden">
      
      <!-- Cabecera -->
      <div class="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500">
            <ArrowRightLeft size={20} />
          </div>
          <div>
            <h3 class="font-black text-xl text-text-base">Detalle de Traslado {selectedTransfer.transfer_number}</h3>
            <p class="text-xs text-text-muted">Información de envío y recepción entre sedes</p>
          </div>
        </div>
        <button 
          onclick={() => detailModalOpen = false}
          class="p-2 rounded-xl text-text-muted hover:bg-white/5 hover:text-text-base transition-all"
        >
          <X size={20} />
        </button>
      </div>

      <!-- Contenido -->
      <div class="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar">
        <!-- Cards Fijas -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-white/5 p-4 rounded-2xl border border-white/5">
            <span class="text-xs text-text-muted uppercase font-bold tracking-wider">Sede Origen</span>
            <div class="text-base font-bold text-text-base mt-1">{selectedTransfer.source_branch?.name || '---'}</div>
            <div class="text-xs text-amber-400 font-mono mt-1">Ajuste Salida Profit: {selectedTransfer.source_ajue_num || 'Pendiente'}</div>
          </div>

          <div class="bg-white/5 p-4 rounded-2xl border border-white/5">
            <span class="text-xs text-text-muted uppercase font-bold tracking-wider">Sede Destino</span>
            <div class="text-base font-bold text-text-base mt-1">{selectedTransfer.target_branch?.name || '---'}</div>
            <div class="text-xs text-emerald-400 font-mono mt-1">Ajuste Entrada Profit: {selectedTransfer.target_ajue_num || 'Sin Ingresar'}</div>
          </div>
        </div>

        {#if selectedTransfer.motivo}
          <div class="bg-white/5 p-4 rounded-2xl border border-white/5">
            <span class="text-xs text-text-muted uppercase font-bold tracking-wider">Motivo / Observaciones</span>
            <p class="text-sm font-semibold text-text-base mt-1">{selectedTransfer.motivo}</p>
          </div>
        {/if}

        <!-- Tabla Renglones -->
        <div class="space-y-2">
          <h4 class="text-xs font-black uppercase tracking-widest text-text-muted">Artículos del Traslado</h4>
          <div class="border border-white/5 rounded-2xl overflow-hidden">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="bg-white/5 border-b border-white/5 text-text-muted font-bold">
                  <th class="p-3">Código</th>
                  <th class="p-3">Descripción</th>
                  <th class="p-3 text-center">Almacén Orig.</th>
                  <th class="p-3 text-center">Almacén Dest.</th>
                  <th class="p-3 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5 font-semibold">
                {#each selectedTransfer.items || [] as item}
                  <tr>
                    <td class="p-3 font-mono text-brand-400 font-bold">{item.co_art}</td>
                    <td class="p-3 text-text-base">{item.art_des}</td>
                    <td class="p-3 text-center font-mono text-text-muted">{item.co_alma_source}</td>
                    <td class="p-3 text-center font-mono text-text-muted">{item.co_alma_target}</td>
                    <td class="p-3 text-right font-mono font-bold text-text-base">{Number(item.total_art).toFixed(2)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Pie Modal -->
      <div class="p-6 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
        <button 
          onclick={() => detailModalOpen = false}
          class="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-xs font-bold text-text-muted hover:text-text-base transition-all cursor-pointer"
        >
          Cerrar
        </button>

        {#if selectedTransfer.status === 'TRANSITO'}
          <button 
            onclick={() => handleAcceptTransfer(selectedTransfer.id, selectedTransfer.transfer_number)}
            disabled={isAccepting === selectedTransfer.id}
            class="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs transition-all active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {#if isAccepting === selectedTransfer.id}
              <RefreshCw size={16} class="animate-spin" />
            {:else}
              <Check size={16} />
            {/if}
            Aceptar e Ingresar en Destino
          </button>
        {/if}
      </div>

    </div>
  </div>
{/if}
