<!-- src/routes/dashboard/warehouse/transfers/+page.svelte -->
<script lang="ts">
  import { page } from "$app/stores";
  import { goto, invalidateAll } from "$app/navigation";
import dayjs from "dayjs";
  import { 
    ArrowRightLeft, Plus, RefreshCw, Search, Store, CheckCircle, 
    XCircle, Clock, Truck, Eye, X, AlertTriangle, Box, FileText, Check, ShieldAlert, Lock, Loader2,
    ChevronLeft, ChevronRight, Pencil, Ban
  } from "lucide-svelte";
  import { fade } from "svelte/transition";
  import { toast } from "svelte-sonner";
  import Combobox from "$lib/components/ui/Combobox.svelte";

  let { data } = $props();

  let activeTab = $state<'outgoing' | 'incoming' | 'all'>('incoming');
  let selectedBranch = $state('all');
  let searchInput = $state('');
  let currentPage = $state(1);
  const pageSize = 10;

  let isAccepting = $state<string | null>(null);
  let detailModalOpen = $state(false);
  let selectedTransfer = $state<any>(null);
  let showAcceptModal = $state(false);
  let transferToAccept = $state<any>(null);
  let confirmPassword = $state('');

  // Estado para Anulación de Ingreso
  let showVoidEntryModal = $state(false);
  let transferToVoidEntry = $state<any>(null);
  let voidEntryPassword = $state('');
  let isVoidingEntry = $state(false);

  // Auto sync branch from URL
  $effect(() => {
    selectedBranch = data.selectedBranchId || 'all';
  });

  // Reset pagination when active tab, branch, or search changes
  $effect(() => {
    activeTab; selectedBranch; searchInput;
    currentPage = 1;
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

    if (selectedBranch && selectedBranch !== 'all') {
      if (activeTab === 'incoming') {
        list = list.filter((t: any) => t.target_branch_id === selectedBranch);
      } else if (activeTab === 'outgoing') {
        list = list.filter((t: any) => t.source_branch_id === selectedBranch);
      } else if (activeTab === 'all') {
        list = list.filter((t: any) => t.source_branch_id === selectedBranch || t.target_branch_id === selectedBranch);
      }
    } else {
      if (activeTab === 'incoming') {
        list = list.filter((t: any) => t.status === 'TRANSITO');
      }
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

  let totalPages = $derived(Math.ceil(filteredTransfers.length / pageSize) || 1);

  let paginatedTransfers = $derived.by(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransfers.slice(start, start + pageSize);
  });

  let metrics = $derived.by(() => {
    const all = data.transfers || [];
    const inTransit = all.filter((t: any) => t.status === 'TRANSITO').length;
    const accepted = all.filter((t: any) => t.status === 'ACEPTADO').length;
    return { total: all.length, inTransit, accepted };
  });

  async function openDetail(transfer: any) {
    selectedTransfer = transfer;
    detailModalOpen = true;

    // Cargar nombres reales de los almacenes desde el Agente Profit para ambas sedes
    const branchesToFetch = Array.from(new Set([transfer.source_branch_id, transfer.target_branch_id].filter(Boolean)));
    await Promise.all(branchesToFetch.map(async (bId) => {
      try {
        const res = await fetch(`/api/agent/warehouses?branch_id=${bId}`);
        const resData = await res.json();
        const list = resData.warehouses || (Array.isArray(resData) ? resData : []);
        if (Array.isArray(list)) {
          list.forEach((w: any) => {
            const code = String(w.co_alma || w.id || w.warehouse_id || '').trim();
            const name = String(w.des_alma || w.nombre || w.descripcion || '').trim();
            if (code && name) {
              warehouseNames[code] = name;
            }
          });
        }
      } catch (e) {
        console.warn(`[TRANSFERS] Error cargando almacenes para sede ${bId}:`, e);
      }
    }));
  }

  let warehouseNames = $state<Record<string, string>>({});

  async function promptAcceptTransfer(transfer: any) {
    transferToAccept = transfer;
    confirmPassword = '';
    showAcceptModal = true;

    // Cargar nombres reales de los almacenes desde el Agente Profit para ambas sedes
    const branchesToFetch = Array.from(new Set([transfer.source_branch_id, transfer.target_branch_id].filter(Boolean)));
    
    await Promise.all(branchesToFetch.map(async (bId) => {
      try {
        const res = await fetch(`/api/agent/warehouses?branch_id=${bId}`);
        const resData = await res.json();
        const list = resData.warehouses || (Array.isArray(resData) ? resData : []);
        if (Array.isArray(list)) {
          list.forEach((w: any) => {
            const code = String(w.co_alma || w.id || w.warehouse_id || '').trim();
            const name = String(w.des_alma || w.nombre || w.descripcion || '').trim();
            if (code && name) {
              warehouseNames[code] = name;
            }
          });
        }
      } catch (e) {
        console.warn(`[TRANSFERS] Error cargando almacenes para sede ${bId}:`, e);
      }
    }));
  }

  async function executeAcceptTransfer(e?: Event) {
    if (e) e.preventDefault();
    if (!transferToAccept) return;
    if (!confirmPassword) {
      toast.error('Debe ingresar su contraseña de confirmación.');
      return;
    }

    const transferId = transferToAccept.id;
    isAccepting = transferId;

    try {
      const res = await fetch('/api/agent/transfers/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transfer_id: transferId,
          password: confirmPassword
        })
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        toast.success(resData.message || 'Traslado aceptado con éxito.');
        showAcceptModal = false;
        detailModalOpen = false;
        confirmPassword = '';
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

  function promptVoidEntry(transfer: any) {
    transferToVoidEntry = transfer;
    voidEntryPassword = '';
    showVoidEntryModal = true;
  }

  async function executeVoidEntry(e?: Event) {
    if (e) e.preventDefault();
    if (!transferToVoidEntry) return;
    if (!voidEntryPassword) {
      toast.error('Debe ingresar su contraseña de confirmación.');
      return;
    }

    isVoidingEntry = true;
    try {
      const res = await fetch('/api/agent/transfers/void-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transfer_id: transferToVoidEntry.id,
          password: voidEntryPassword
        })
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        toast.success(resData.message || 'Ingreso de traslado anulado con éxito.');
        showVoidEntryModal = false;
        detailModalOpen = false;
        voidEntryPassword = '';
        await invalidateAll();
      } else {
        toast.error(resData.message || 'Error al anular el ingreso del traslado.');
      }
    } catch (e: any) {
      toast.error(`Error de red: ${e.message}`);
    } finally {
      isVoidingEntry = false;
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'ACEPTADO':
        return { label: 'Completado', bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', icon: CheckCircle };
      case 'TRANSITO':
        return { label: 'Pendiente', bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400', icon: Clock };
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
        Todos
      </button>
    </div>

    <!-- Sede Filter & Search -->
    <div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
      {#if data.branches && data.branches.length > 0}
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
            <tr class="border-b border-border-subtle bg-surface-soft/50 text-text-muted text-xs font-bold uppercase tracking-wider">
              <th class="px-6 py-5">Nro.</th>
              <th class="px-6 py-5">Sede Origen</th>
              <th class="px-6 py-5">Salida</th>
              <th class="px-6 py-5">Sede Destino</th>
              <th class="px-6 py-5">Entrada</th>
              <th class="px-6 py-5">Fecha y Hora</th>
              <th class="px-6 py-5 text-center">Estado</th>
              <th class="px-6 py-5 text-right">Acción</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-subtle/40 text-sm font-semibold">
            {#each paginatedTransfers as item, idx}
              {@const badge = getStatusBadge(item.status)}
              {@const itemIndex = (currentPage - 1) * pageSize + idx + 1}
              <tr class="hover:bg-surface-soft/40 transition-colors">
                <td class="px-6 py-4 font-mono font-black text-brand-500 text-xs">#{itemIndex}</td>
                <td class="px-6 py-4 text-text-base">{item.source_branch?.name || '---'}</td>
                <td class="px-6 py-4 font-mono text-xs text-amber-500 font-bold">{item.source_ajue_num || 'Pendiente'}</td>
                <td class="px-6 py-4 text-text-base">{item.target_branch?.name || '---'}</td>
                <td class="px-6 py-4 font-mono text-xs text-emerald-500 font-bold">{item.target_ajue_num || 'Sin Ingresar'}</td>
                <td class="px-6 py-4 text-text-muted text-xs font-mono">{dayjs(item.created_at).format('DD/MM/YYYY hh:mm A')}</td>
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
                      class="p-2 rounded-xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base border border-border-subtle transition-all cursor-pointer"
                      title="Ver Detalle"
                    >
                      <Eye size={18} />
                    </button>

                    {#if (data.canEdit || data.canCreate) && item.status === 'TRANSITO' && (selectedBranch === 'all' ? item.source_branch_id === data.userBranchId : item.source_branch_id === selectedBranch)}
                      <a 
                        href="/dashboard/warehouse/transfers/new?id={item.id}"
                        class="p-2 rounded-xl bg-surface-soft hover:bg-amber-500/10 text-text-muted hover:text-amber-500 border border-border-subtle transition-all cursor-pointer flex items-center justify-center"
                        title="Editar Ajuste de Salida"
                      >
                        <Pencil size={18} />
                      </a>
                    {/if}

                    {#if data.canVoid && item.status === 'ACEPTADO' && (selectedBranch === 'all' ? item.target_branch_id === data.userBranchId : item.target_branch_id === selectedBranch)}
                      <button 
                        onclick={() => promptVoidEntry(item)}
                        class="p-2 rounded-xl bg-surface-soft hover:bg-amber-500/10 text-text-muted hover:text-amber-500 border border-border-subtle transition-all cursor-pointer flex items-center justify-center"
                        title="Anular Ingreso de Traslado"
                      >
                        <Ban size={18} />
                      </button>
                    {/if}

                    {#if item.status === 'TRANSITO' && activeTab !== 'outgoing' && (selectedBranch === 'all' || item.target_branch_id === selectedBranch)}
                      <button 
                        onclick={() => promptAcceptTransfer(item)}
                        disabled={isAccepting === item.id}
                        class="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-500 border border-emerald-500/30 font-bold text-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                        title="Confirmar recepción e ingresar inventario"
                      >
                        {#if isAccepting === item.id}
                          <RefreshCw size={14} class="animate-spin" />
                        {:else}
                          <Check size={14} />
                        {/if}
                        Ingresar
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- PAGINACIÓN -->
      {#if totalPages > 1}
        <div class="px-8 py-5 bg-surface-soft/40 border-t border-border-subtle flex items-center justify-between">
          <p class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
            Página <span class="text-text-base font-bold">{currentPage}</span> de
            <span class="text-text-base font-bold">{totalPages}</span> (Total: {filteredTransfers.length} traslados)
          </p>

          <div class="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onclick={() => (currentPage -= 1)}
              class="h-10 w-10 flex items-center justify-center rounded-xl bg-surface-soft hover:bg-surface-strong disabled:opacity-30 transition-all border border-border-subtle text-text-muted cursor-pointer"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              disabled={currentPage === totalPages}
              onclick={() => (currentPage += 1)}
              class="h-10 w-10 flex items-center justify-center rounded-xl bg-surface-soft hover:bg-surface-strong disabled:opacity-30 transition-all border border-border-subtle text-text-muted cursor-pointer"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      {/if}
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
  {@const badge = getStatusBadge(selectedTransfer.status)}
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto" transition:fade={{ duration: 150 }}>
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm"
      onclick={() => (detailModalOpen = false)}
      onkeydown={(e) => e.key === "Escape" && (detailModalOpen = false)}
      role="button"
      tabindex="-1"
    ></div>

    <div
      class="bg-surface-raised w-full max-w-3xl rounded-[40px] border border-border-bold shadow-2xl relative z-10 overflow-hidden my-auto text-text-base"
    >
      <div class="p-6 md:p-8 space-y-6">
        
        <!-- ENCABEZADO MODAL -->
        <div class="text-center space-y-3">
          <div
            class="h-16 w-16 rounded-3xl bg-brand-500/20 text-brand-500 border border-brand-500/30 flex items-center justify-center mx-auto"
          >
            <ArrowRightLeft size={32} />
          </div>
          <div class="space-y-1">
            <h2 class="text-2xl font-black tracking-tight text-text-base">Detalles del Traslado</h2>
            <p class="text-text-muted text-xs leading-relaxed max-w-md mx-auto">
              Previsualización de membrete, observaciones y artículos en tránsito entre sedes.
            </p>
          </div>
        </div>

        <!-- PREVISUALIZACION MEMBRETE -->
        <div class="p-4.5 rounded-2xl bg-surface-soft border border-border-subtle text-left space-y-3 text-xs">
          <div class="flex items-center justify-between border-b border-border-subtle pb-2.5">
            <div>
              <span class="text-[10px] font-black uppercase tracking-wider text-text-muted block">Traslado Correlativo</span>
              <span class="font-black text-brand-500 text-sm font-mono">{selectedTransfer.transfer_number}</span>
            </div>
            <span class="px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 {badge.bg}">
              <badge.icon size={12} />
              {badge.label}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-0.5">
              <span class="text-[10px] text-text-muted font-black uppercase tracking-wider block">Sede Origen</span>
              <span class="font-bold text-text-base text-xs block">{selectedTransfer.source_branch?.name || '---'}</span>
              {#if selectedTransfer.source_ajue_num}
                <span class="text-[10px] text-amber-500 font-mono font-bold block">Ajuste Salida Profit: {selectedTransfer.source_ajue_num}</span>
              {/if}
            </div>

            <div class="space-y-0.5">
              <span class="text-[10px] text-text-muted font-black uppercase tracking-wider block">Sede Destino</span>
              <span class="font-bold text-text-base text-xs block">{selectedTransfer.target_branch?.name || '---'}</span>
              {#if selectedTransfer.target_ajue_num}
                <span class="text-[10px] text-emerald-500 font-mono font-bold block">Ajuste Entrada Profit: {selectedTransfer.target_ajue_num}</span>
              {:else}
                <span class="text-[10px] text-amber-500 font-mono font-bold block">Ajuste Entrada Pendiente</span>
              {/if}
            </div>
          </div>

          {#if selectedTransfer.created_by || selectedTransfer.created_at || selectedTransfer.motivo}
            <div class="pt-2 border-t border-border-subtle space-y-1 text-[11px] text-text-muted">
              {#if selectedTransfer.motivo}
                <div><strong class="text-text-base font-semibold">Observación / Motivo:</strong> {selectedTransfer.motivo}</div>
              {/if}
              <div class="flex items-center justify-between text-[10px] text-text-muted pt-0.5">
                <span>Emitido por: <strong class="text-text-base font-bold">{selectedTransfer.created_by || '---'}</strong></span>
                <span>Fecha: <strong class="text-text-base font-bold">{dayjs(selectedTransfer.created_at).format('DD/MM/YYYY hh:mm A')}</strong></span>
              </div>
            </div>
          {/if}
        </div>

        <!-- PREVISUALIZACION ARTICULOS DEL TRASLADO -->
        <div class="space-y-2 text-left">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-black uppercase tracking-widest text-text-muted">
              Artículos del Traslado ({(selectedTransfer.items || []).length})
            </span>
          </div>
          <div class="border border-border-subtle rounded-2xl overflow-hidden max-h-56 overflow-y-auto custom-scrollbar bg-surface-base/50">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="bg-surface-soft border-b border-border-subtle text-text-muted font-bold text-[10px] uppercase tracking-wider">
                  <th class="p-3">Código</th>
                  <th class="p-3">Descripción Completa del Artículo</th>
                  <th class="p-3 text-center">Almacén Origen &rarr; Destino</th>
                  <th class="p-3 text-right">Cantidad / Unidad</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-subtle/50 font-semibold text-[11px]">
                {#each selectedTransfer.items || [] as item}
                  {@const srcName = warehouseNames[item.co_alma_source] ? `${warehouseNames[item.co_alma_source]} (${item.co_alma_source})` : `Almacén ${item.co_alma_source}`}
                  {@const tgtName = warehouseNames[item.co_alma_target] ? `${warehouseNames[item.co_alma_target]} (${item.co_alma_target})` : `Almacén ${item.co_alma_target}`}
                  <tr class="hover:bg-surface-soft/50">
                    <td class="p-3 font-mono text-brand-500 font-bold whitespace-nowrap">{item.co_art}</td>
                    <td class="p-3 text-text-base leading-relaxed break-words">{item.art_des}</td>
                    <td class="p-3 text-center font-mono text-text-muted text-[11px]">
                      <span class="text-text-base font-bold">{srcName}</span>
                      <span class="text-brand-500 mx-1 font-bold">&rarr;</span>
                      <span class="text-text-base font-bold">{tgtName}</span>
                    </td>
                    <td class="p-3 text-right font-mono font-black text-emerald-500 text-xs whitespace-nowrap">
                      {Number(item.total_art).toFixed(2)}
                      <span class="text-[10px] text-emerald-600 font-bold ml-1 uppercase">{item.co_uni || item.unidad || 'UND'}</span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <!-- ACCIONES MODAL DETALLE -->
        <div class="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3">
          {#if (data.canEdit || data.canCreate) && selectedTransfer.status === 'TRANSITO' && (selectedBranch === 'all' ? selectedTransfer.source_branch_id === data.userBranchId : selectedTransfer.source_branch_id === selectedBranch)}
            <a
              href="/dashboard/warehouse/transfers/new?id={selectedTransfer.id}"
              class="w-full sm:w-auto h-12 px-6 rounded-2xl font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 transition-all flex items-center justify-center gap-2 text-xs cursor-pointer"
            >
              <Pencil size={16} />
              Editar Ajuste Salida
            </a>
          {/if}

          {#if data.canVoid && selectedTransfer.status === 'ACEPTADO' && (selectedBranch === 'all' ? selectedTransfer.target_branch_id === data.userBranchId : selectedTransfer.target_branch_id === selectedBranch)}
            <button 
              type="button"
              onclick={() => { detailModalOpen = false; promptVoidEntry(selectedTransfer); }}
              class="w-full sm:w-auto h-12 px-6 rounded-2xl font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 transition-all flex items-center justify-center gap-2 text-xs cursor-pointer"
            >
              <Ban size={16} />
              Anular Ingreso
            </button>
          {/if}

          {#if selectedTransfer.status === 'TRANSITO' && (selectedBranch === 'all' || selectedTransfer.target_branch_id === selectedBranch)}
            <button 
              type="button"
              onclick={() => { detailModalOpen = false; promptAcceptTransfer(selectedTransfer); }}
              class="w-full sm:w-auto h-12 px-6 rounded-2xl font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 transition-all flex items-center justify-center gap-2 text-xs cursor-pointer"
            >
              <Check size={16} />
              Ingresar Inventario
            </button>
          {/if}

          <button
            type="button"
            onclick={() => (detailModalOpen = false)}
            class="w-full sm:w-auto h-12 px-6 rounded-2xl font-bold bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base border border-border-subtle transition-all text-xs cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  </div>
{/if}

<!-- MODAL DE CONFIRMACION DE RECEPCION -->
{#if showAcceptModal && transferToAccept}
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto" transition:fade={{ duration: 150 }}>
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm"
      onclick={() => !isAccepting && (showAcceptModal = false)}
      onkeydown={(e) => e.key === "Escape" && !isAccepting && (showAcceptModal = false)}
      role="button"
      tabindex="-1"
    ></div>

    <div
      class="bg-surface-raised w-full max-w-3xl rounded-[40px] border border-border-bold shadow-2xl relative z-10 overflow-hidden my-auto text-text-base"
    >
      <div class="p-6 md:p-8 space-y-6">
        
        <!-- ENCABEZADO MODAL -->
        <div class="text-center space-y-3">
          <div
            class="h-16 w-16 rounded-3xl bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 flex items-center justify-center mx-auto"
          >
            <Truck size={32} />
          </div>
          <div class="space-y-1">
            <h2 class="text-2xl font-black tracking-tight text-text-base">Confirmar Recepción de Traslado</h2>
            <p class="text-text-muted text-xs leading-relaxed max-w-md mx-auto">
              Revise el detalle de artículos y confirme con su contraseña para ingresar la mercancía al inventario de esta sede.
            </p>
          </div>
        </div>

        <!-- PREVISUALIZACION MEMBRETE -->
        <div class="p-4.5 rounded-2xl bg-surface-soft border border-border-subtle text-left space-y-3 text-xs">
          <div class="flex items-center justify-between border-b border-border-subtle pb-2.5">
            <div>
              <span class="text-[10px] font-black uppercase tracking-wider text-text-muted block">Traslado Correlativo</span>
              <span class="font-black text-brand-500 text-sm font-mono">{transferToAccept.transfer_number}</span>
            </div>
            <span class="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[10px] font-black uppercase tracking-wider">
              Pendiente
            </span>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-0.5">
              <span class="text-[10px] text-text-muted font-black uppercase tracking-wider block">Sede Origen</span>
              <span class="font-bold text-text-base text-xs block">{transferToAccept.source_branch?.name || '---'}</span>
              {#if transferToAccept.source_ajue_num}
                <span class="text-[10px] text-amber-500 font-mono font-bold block">Ajuste Salida Profit: {transferToAccept.source_ajue_num}</span>
              {/if}
            </div>

            <div class="space-y-0.5">
              <span class="text-[10px] text-text-muted font-black uppercase tracking-wider block">Sede Destino</span>
              <span class="font-bold text-text-base text-xs block">{transferToAccept.target_branch?.name || '---'}</span>
              <span class="text-[10px] text-emerald-500 font-mono font-bold block">Ajuste Entrada Pendiente</span>
            </div>
          </div>

          {#if transferToAccept.created_by || transferToAccept.created_at || transferToAccept.motivo}
            <div class="pt-2 border-t border-border-subtle space-y-1 text-[11px] text-text-muted">
              {#if transferToAccept.motivo}
                <div><strong class="text-text-base font-semibold">Observación / Motivo:</strong> {transferToAccept.motivo}</div>
              {/if}
              <div class="flex items-center justify-between text-[10px] text-text-muted pt-0.5">
                <span>Emitido por: <strong class="text-text-base font-bold">{transferToAccept.created_by || '---'}</strong></span>
                <span>Fecha: <strong class="text-text-base font-bold">{dayjs(transferToAccept.created_at).format('DD/MM/YYYY hh:mm A')}</strong></span>
              </div>
            </div>
          {/if}
        </div>

        <!-- PREVISUALIZACION ARTICULOS A INGRESAR -->
        <div class="space-y-2 text-left">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-black uppercase tracking-widest text-text-muted">
              Artículos a Ingresar... ({(transferToAccept.items || []).length})
            </span>
          </div>
          <div class="border border-border-subtle rounded-2xl overflow-hidden max-h-56 overflow-y-auto custom-scrollbar bg-surface-base/50">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="bg-surface-soft border-b border-border-subtle text-text-muted font-bold text-[10px] uppercase tracking-wider">
                  <th class="p-3">Código</th>
                  <th class="p-3">Descripción Completa del Artículo</th>
                  <th class="p-3 text-center">Almacén Origen &rarr; Destino</th>
                  <th class="p-3 text-right">Cantidad / Unidad</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-subtle/50 font-semibold text-[11px]">
                {#each transferToAccept.items || [] as item}
                  {@const srcName = warehouseNames[item.co_alma_source] ? `${warehouseNames[item.co_alma_source]} (${item.co_alma_source})` : `Almacén ${item.co_alma_source}`}
                  {@const tgtName = warehouseNames[item.co_alma_target] ? `${warehouseNames[item.co_alma_target]} (${item.co_alma_target})` : `Almacén ${item.co_alma_target}`}
                  <tr class="hover:bg-surface-soft/50">
                    <td class="p-3 font-mono text-brand-500 font-bold whitespace-nowrap">{item.co_art}</td>
                    <td class="p-3 text-text-base leading-relaxed break-words">{item.art_des}</td>
                    <td class="p-3 text-center font-mono text-text-muted text-[11px]">
                      <span class="text-text-base font-bold">{srcName}</span>
                      <span class="text-brand-500 mx-1 font-bold">&rarr;</span>
                      <span class="text-text-base font-bold">{tgtName}</span>
                    </td>
                    <td class="p-3 text-right font-mono font-black text-emerald-500 text-xs whitespace-nowrap">
                      {Number(item.total_art).toFixed(2)}
                      <span class="text-[10px] text-emerald-600 font-bold ml-1 uppercase">{item.co_uni || item.unidad || 'UND'}</span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <!-- FORMULARIO DE CONFIRMACIÓN CON CONTRASEÑA -->
        <form onsubmit={executeAcceptTransfer} class="space-y-4 pt-1">
          <div class="space-y-2 text-left">
            <label
              class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1"
              for="transfer-accept-pass"
            >
              Contraseña de Confirmación
            </label>
            <div class="relative">
              <Lock
                size={18}
                class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
              />
              <input
                id="transfer-accept-pass"
                type="password"
                bind:value={confirmPassword}
                required
                disabled={!!isAccepting}
                placeholder="Introduzca su contraseña"
                class="w-full h-14 bg-surface-base border border-border-bold rounded-2xl pl-12 pr-5 focus:border-emerald-500 outline-none transition-all text-text-base"
              />
            </div>
          </div>

          <div class="flex gap-3 pt-2">
            <button
              type="button"
              onclick={() => (showAcceptModal = false)}
              disabled={!!isAccepting}
              class="flex-1 h-14 rounded-2xl font-bold bg-surface-soft hover:bg-surface-strong transition-all text-text-muted hover:text-text-base border border-border-subtle cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!!isAccepting || !confirmPassword.trim()}
              class="flex-1 h-14 rounded-2xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {#if isAccepting}
                <Loader2 size={18} class="animate-spin" />
              {:else}
                <Check size={18} />
                Confirmar Ingreso
              {/if}
            </button>
          </div>
        </form>

      </div>
    </div>
  </div>
{/if}

<!-- MODAL DE CONFIRMACIÓN PARA ANULAR INGRESO DE TRASLADO -->
{#if showVoidEntryModal && transferToVoidEntry}
  <div 
    class="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
    transition:fade={{ duration: 150 }}
  >
    <div 
      class="bg-surface-raised border border-border-bold rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-6 text-center space-y-6"
    >
      <div class="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto border border-amber-500/20">
        <Ban size={32} />
      </div>

      <div class="space-y-2">
        <h3 class="text-xl font-black text-text-base">Anular Ingreso de Traslado</h3>
        <p class="text-xs text-text-muted">
          Esta acción anulará el ajuste de entrada en la sede destino y revertirá el estado del traslado <span class="font-mono font-bold text-amber-500">{transferToVoidEntry.transfer_number}</span> a <span class="font-bold text-amber-400">PENDIENTE</span> en la nube.
        </p>
      </div>

      <!-- RESUMEN DEL TRASLADO -->
      <div class="bg-surface-soft/60 rounded-2xl p-4 border border-border-subtle text-left space-y-2 font-mono text-xs">
        <div class="flex justify-between">
          <span class="text-text-muted">Traslado:</span>
          <span class="font-bold text-text-base">{transferToVoidEntry.transfer_number}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-text-muted">Ajuste Entrada:</span>
          <span class="font-bold text-emerald-500">{transferToVoidEntry.target_ajue_num || '---'}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-text-muted">Sede Destino:</span>
          <span class="font-bold text-text-base">{transferToVoidEntry.target_branch?.name || '---'}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-text-muted">Total Renglones:</span>
          <span class="font-bold text-amber-500">{transferToVoidEntry.items?.length || 0} artículos</span>
        </div>
      </div>

      <!-- PREVISUALIZACIÓN ARTÍCULOS A REVERTIR -->
      <div class="space-y-2 text-left">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-black uppercase tracking-widest text-text-muted">
            Artículos a Revertir ({(transferToVoidEntry.items || []).length})
          </span>
        </div>
        <div class="border border-border-subtle rounded-2xl overflow-hidden max-h-56 overflow-y-auto custom-scrollbar bg-surface-base/50">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="bg-surface-soft border-b border-border-subtle text-text-muted font-bold text-[10px] uppercase tracking-wider">
                <th class="p-3">Código</th>
                <th class="p-3">Descripción</th>
                <th class="p-3 text-center">Almacén Destino</th>
                <th class="p-3 text-right">Cantidad / Unidad</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border-subtle/50 font-semibold text-[11px]">
              {#each transferToVoidEntry.items || [] as item}
                {@const tgtName = warehouseNames[item.co_alma_target] ? `${warehouseNames[item.co_alma_target]} (${item.co_alma_target})` : `Almacén ${item.co_alma_target}`}
                <tr class="hover:bg-surface-soft/50">
                  <td class="p-3 font-mono text-brand-500 font-bold whitespace-nowrap">{item.co_art}</td>
                  <td class="p-3 text-text-base leading-relaxed break-words">{item.art_des}</td>
                  <td class="p-3 text-center font-mono text-amber-500 font-bold text-[11px]">{tgtName}</td>
                  <td class="p-3 text-right font-mono font-black text-amber-500 text-xs whitespace-nowrap">
                    {Number(item.total_art).toFixed(2)}
                    <span class="text-[10px] text-amber-600 font-bold ml-1 uppercase">{item.co_uni || 'UND'}</span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- FORMULARIO CON CONTRASEÑA -->
      <form onsubmit={executeVoidEntry} class="space-y-4 pt-1">
        <div class="space-y-2 text-left">
          <label 
            class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1"
            for="transfer-void-pass"
          >
            Contraseña de Confirmación
          </label>
          <div class="relative">
            <Lock size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" />
            <input 
              id="transfer-void-pass"
              type="password"
              bind:value={voidEntryPassword}
              required
              disabled={isVoidingEntry}
              placeholder="Introduzca su contraseña"
              class="w-full h-14 bg-surface-base border border-border-bold rounded-2xl pl-12 pr-5 focus:border-amber-500 outline-none transition-all text-text-base"
            />
          </div>
        </div>

        <div class="flex gap-3 pt-2">
          <button 
            type="button" 
            onclick={() => (showVoidEntryModal = false)}
            disabled={isVoidingEntry}
            class="flex-1 h-14 rounded-2xl font-bold bg-surface-soft hover:bg-surface-strong transition-all text-text-muted hover:text-text-base border border-border-subtle cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button 
            type="submit"
            disabled={isVoidingEntry || !voidEntryPassword.trim()}
            class="flex-1 h-14 rounded-2xl font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-lg shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {#if isVoidingEntry}
              <Loader2 size={18} class="animate-spin" />
            {:else}
              <Ban size={18} />
              Confirmar Anulación
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
