<!-- src/routes/dashboard/warehouse/dispatches/history/+page.svelte -->
<script lang="ts">
  import { fade, slide, scale } from "svelte/transition";
  import {
    Truck,
    Search,
    Filter,
    Plus,
    FileText,
    Printer,
    Trash2,
    Building,
    Store,
    RefreshCw,
    CheckCircle2,
    AlertTriangle,
    X,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Loader2,
    Calendar,
    Eye,
    Package,
    ShieldAlert,
    Ban
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { deserialize } from "$app/forms";
  import dayjs from "dayjs";
  import "dayjs/locale/es";

  dayjs.locale("es");

  let { data } = $props();

  // Filters State
  let filterSede = $state(data.selectedBranchId || "");
  let searchQuery = $state(data.filters?.search || "");
  let fecD = $state(data.filters?.fec_d || "");
  let fecH = $state(data.filters?.fec_h || "");
  let filterStatus = $state(data.filters?.status || "");

  // Detail Modal State
  let selectedDispatch = $state<any | null>(null);
  let isLoadingDetail = $state(false);

  // Void / Delete Modal State
  let voidTarget = $state<any | null>(null);
  let voidReason = $state("");
  let isVoiding = $state(false);

  let deleteTarget = $state<any | null>(null);
  let isDeleting = $state(false);

  function applyFilters() {
    const params = new URLSearchParams();
    if (filterSede) params.set("branch_id", filterSede);
    if (searchQuery) params.set("search", searchQuery.trim());
    if (fecD) params.set("fec_d", fecD);
    if (fecH) params.set("fec_h", fecH);
    if (filterStatus) params.set("status", filterStatus);
    params.set("page", "1");

    goto(`?${params.toString()}`, { replaceState: true, invalidateAll: true });
  }

  function handleBranchChange(newBranchId: string) {
    filterSede = newBranchId;
    applyFilters();
  }

  function handlePageChange(newPage: number) {
    const params = new URLSearchParams($page.url.searchParams);
    params.set("page", String(newPage));
    goto(`?${params.toString()}`, { replaceState: true, invalidateAll: true });
  }

  function clearFilters() {
    searchQuery = "";
    fecD = "";
    fecH = "";
    filterStatus = "";
    goto(`?branch_id=${filterSede}`, { replaceState: true, invalidateAll: true });
  }

  async function openDetailModal(docNum: string) {
    isLoadingDetail = true;
    selectedDispatch = null;
    try {
      const formData = new FormData();
      formData.append("branch_id", filterSede);
      formData.append("doc_num", docNum);

      const response = await fetch("?/getDispatchDetail", {
        method: "POST",
        body: formData
      });

      const result = deserialize(await response.text());
      if (result.type === "success" && (result.data as any)?.dispatch) {
        selectedDispatch = (result.data as any).dispatch;
      } else {
        toast.error("No se pudo cargar el detalle del despacho.");
      }
    } catch (e: any) {
      toast.error(e.message || "Error al obtener despacho.");
    } finally {
      isLoadingDetail = false;
    }
  }

  async function handleVoidDispatch() {
    if (!voidTarget) return;
    isVoiding = true;
    try {
      const formData = new FormData();
      formData.append("branch_id", filterSede);
      formData.append("doc_num", voidTarget.doc_num);
      formData.append("reason", voidReason);

      const response = await fetch("?/voidDispatch", {
        method: "POST",
        body: formData
      });

      const result = deserialize(await response.text());
      if (result.type === "success") {
        toast.success(`Despacho ${voidTarget.doc_num} anulado exitosamente.`);
        voidTarget = null;
        voidReason = "";
        goto($page.url.pathname + $page.url.search, { invalidateAll: true });
      } else {
        toast.error((result as any).data?.message || "Error al anular despacho.");
      }
    } catch (e: any) {
      toast.error(e.message || "Error al procesar solicitud.");
    } finally {
      isVoiding = false;
    }
  }

  async function handleDeleteDispatch() {
    if (!deleteTarget) return;
    isDeleting = true;
    try {
      const formData = new FormData();
      formData.append("branch_id", filterSede);
      formData.append("doc_num", deleteTarget.doc_num);

      const response = await fetch("?/deleteDispatch", {
        method: "POST",
        body: formData
      });

      const result = deserialize(await response.text());
      if (result.type === "success") {
        toast.success(`Despacho ${deleteTarget.doc_num} eliminado.`);
        deleteTarget = null;
        goto($page.url.pathname + $page.url.search, { invalidateAll: true });
      } else {
        toast.error((result as any).data?.message || "Error al eliminar despacho.");
      }
    } catch (e: any) {
      toast.error(e.message || "Error al procesar solicitud.");
    } finally {
      isDeleting = false;
    }
  }
</script>

<svelte:head>
  <title>Historial de Despachos | Sync2K</title>
</svelte:head>

<div class="space-y-6">
  <!-- Top Header Bar -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/60 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-zinc-800/80 shadow-xl shadow-black/20">
    <div class="flex items-center gap-3.5">
      <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/30 border border-violet-500/30 flex items-center justify-center text-violet-400 shadow-lg shadow-violet-950/40">
        <Truck class="w-6 h-6" />
      </div>
      <div>
        <h1 class="text-xl font-bold text-white tracking-tight">Historial de Despachos</h1>
        <p class="text-xs text-zinc-400 mt-0.5">Consulta y administración de notas de despacho emitidas</p>
      </div>
    </div>

    <!-- Actions & Branch Selector -->
    <div class="flex flex-wrap items-center gap-2.5">
      <!-- Sede Selector -->
      <div class="relative min-w-[170px]">
        <select
          aria-label="Seleccionar sucursal"
          value={filterSede}
          onchange={(e) => handleBranchChange(e.currentTarget.value)}
          class="w-full pl-9 pr-8 py-2 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/70 hover:border-zinc-600 rounded-xl text-xs font-medium text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
        >
          {#each data.branches as branch}
            <option value={branch.id}>{branch.name}</option>
          {/each}
        </select>
        <Store class="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <ChevronDown class="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      <!-- New Dispatch Button -->
      <a
        href="/dashboard/warehouse/dispatches?branch_id={filterSede}"
        class="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-violet-600/30 hover:shadow-violet-600/50 active:scale-95 transition-all"
      >
        <Plus class="w-3.5 h-3.5" />
        <span>Nuevo Despacho</span>
      </a>
    </div>
  </div>

  <!-- Filters Card -->
  <div class="bg-zinc-900/60 backdrop-blur-md rounded-2xl border border-zinc-800/80 p-4 shadow-xl">
    <form onsubmit={(e) => { e.preventDefault(); applyFilters(); }} class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-end">
      <!-- Search Input -->
      <div class="sm:col-span-2 md:col-span-4 space-y-1">
        <label for="search-input" class="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Búsqueda Rápida</label>
        <div class="relative">
          <Search class="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="search-input"
            type="text"
            bind:value={searchQuery}
            placeholder="N° Despacho, Factura, Cliente o RIF..."
            class="w-full pl-9 pr-3 py-2 bg-zinc-800/80 border border-zinc-700/80 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
        </div>
      </div>

      <!-- Date From -->
      <div class="sm:col-span-1 md:col-span-2 space-y-1">
        <label for="fec-d-input" class="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Desde</label>
        <input
          id="fec-d-input"
          type="date"
          bind:value={fecD}
          class="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700/80 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
        />
      </div>

      <!-- Date To -->
      <div class="sm:col-span-1 md:col-span-2 space-y-1">
        <label for="fec-h-input" class="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Hasta</label>
        <input
          id="fec-h-input"
          type="date"
          bind:value={fecH}
          class="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700/80 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
        />
      </div>

      <!-- Status Filter -->
      <div class="sm:col-span-1 md:col-span-2 space-y-1">
        <label for="status-select" class="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Estado</label>
        <select
          id="status-select"
          bind:value={filterStatus}
          class="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700/80 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40 cursor-pointer"
        >
          <option value="">Todos</option>
          <option value="activo">Procesados</option>
          <option value="anulado">Anulados</option>
        </select>
      </div>

      <!-- Filter Buttons -->
      <div class="sm:col-span-1 md:col-span-2 flex items-center gap-2">
        <button
          type="submit"
          class="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-semibold border border-zinc-700 transition-all flex items-center justify-center gap-1.5"
        >
          <Filter class="w-3.5 h-3.5 text-violet-400" />
          <span>Filtrar</span>
        </button>
        <button
          type="button"
          onclick={clearFilters}
          class="p-2 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl text-xs border border-zinc-700/60 transition-all"
          title="Limpiar Filtros"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </form>
  </div>

  <!-- Dispatches Table Card -->
  <div class="bg-zinc-900/60 backdrop-blur-md rounded-2xl border border-zinc-800/80 overflow-hidden shadow-xl">
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 bg-zinc-900/80 uppercase tracking-wider">
            <th class="py-3 px-4">N° Despacho</th>
            <th class="py-3 px-4">Fecha Emisión</th>
            <th class="py-3 px-4">Factura Origen</th>
            <th class="py-3 px-4">Cliente</th>
            <th class="py-3 px-4 text-center">Renglones</th>
            <th class="py-3 px-4 text-center">Unidades</th>
            <th class="py-3 px-4 text-center">Estado</th>
            <th class="py-3 px-4 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800/60">
          {#if data.dispatches.length === 0}
            <tr>
              <td colspan="8" class="text-center py-12 text-zinc-500">
                <Package class="w-10 h-10 mx-auto mb-2 opacity-40 stroke-[1.5]" />
                <p class="text-sm font-semibold text-zinc-400">No se encontraron notas de despacho</p>
                <p class="text-xs text-zinc-500 mt-1">Ajusta los filtros o crea un nuevo despacho de mercancía.</p>
              </td>
            </tr>
          {:else}
            {#each data.dispatches as d}
              <tr class="hover:bg-zinc-800/40 transition-colors {d.anulado ? 'opacity-50 bg-red-950/5' : ''}">
                <!-- Doc Num -->
                <td class="py-3.5 px-4 font-mono font-bold text-white flex items-center gap-2">
                  <span class="text-violet-400">{d.doc_num}</span>
                </td>

                <!-- Date -->
                <td class="py-3.5 px-4 text-zinc-300">
                  {dayjs(d.fec_emis).format("DD/MM/YYYY")}
                </td>

                <!-- Origin Invoice -->
                <td class="py-3.5 px-4 font-mono text-zinc-300">
                  {#if d.factura_origen}
                    <span class="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-violet-300 font-semibold text-[11px]">
                      {d.factura_origen}
                    </span>
                  {:else}
                    <span class="text-zinc-500">---</span>
                  {/if}
                </td>

                <!-- Client -->
                <td class="py-3.5 px-4">
                  <div class="font-medium text-white truncate max-w-[200px]" title={d.cli_des}>{d.cli_des || "---"}</div>
                  <div class="text-[11px] text-zinc-400">{d.co_cli} {d.rif ? `• ${d.rif}` : ''}</div>
                </td>

                <!-- Total Lines -->
                <td class="py-3.5 px-4 text-center font-mono text-zinc-300">
                  {d.total_renglones || 0}
                </td>

                <!-- Total Units -->
                <td class="py-3.5 px-4 text-center font-mono font-bold text-violet-300">
                  {d.total_unidades || 0}
                </td>

                <!-- Status Badge -->
                <td class="py-3.5 px-4 text-center">
                  {#if d.anulado}
                    <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                      Anulado
                    </span>
                  {:else}
                    <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Completado
                    </span>
                  {/if}
                </td>

                <!-- Actions -->
                <td class="py-3.5 px-4 text-right">
                  <div class="flex items-center justify-end gap-1.5">
                    <!-- Quick View -->
                    <button
                      type="button"
                      onclick={() => openDetailModal(d.doc_num)}
                      class="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition-all"
                      title="Ver Detalle"
                    >
                      <Eye class="w-4 h-4 text-violet-400" />
                    </button>

                    <!-- Print -->
                    <a
                      href="/dashboard/warehouse/dispatches/{d.doc_num}/print?branch_id={filterSede}"
                      target="_blank"
                      class="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition-all"
                      title="Imprimir Despacho"
                    >
                      <Printer class="w-4 h-4 text-cyan-400" />
                    </a>

                    <!-- Void -->
                    {#if !d.anulado && data.canVoid}
                      <button
                        type="button"
                        onclick={() => voidTarget = d}
                        class="p-1.5 bg-zinc-800 hover:bg-amber-500/10 text-zinc-400 hover:text-amber-400 rounded-lg transition-all"
                        title="Anular Despacho"
                      >
                        <Ban class="w-4 h-4" />
                      </button>
                    {/if}

                    <!-- Delete -->
                    {#if data.canDelete}
                      <button
                        type="button"
                        onclick={() => deleteTarget = d}
                        class="p-1.5 bg-zinc-800 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 rounded-lg transition-all"
                        title="Eliminar Despacho"
                      >
                        <Trash2 class="w-4 h-4" />
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Pagination Footer -->
    {#if data.pagination && data.pagination.totalPages > 1}
      <div class="p-4 border-t border-zinc-800 flex items-center justify-between bg-zinc-900/80 text-xs text-zinc-400">
        <div>
          Página <span class="font-bold text-white">{data.pagination.page}</span> de <span class="font-bold text-white">{data.pagination.totalPages}</span> ({data.pagination.total} registros)
        </div>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            disabled={data.pagination.page <= 1}
            onclick={() => handlePageChange(data.pagination.page - 1)}
            class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={data.pagination.page >= data.pagination.totalPages}
            onclick={() => handlePageChange(data.pagination.page + 1)}
            class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all"
          >
            Siguiente
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Modal: View Dispatch Details -->
{#if selectedDispatch}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" transition:fade={{ duration: 150 }}>
    <div
      class="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
      transition:scale={{ duration: 150, start: 0.95 }}
    >
      <!-- Header -->
      <div class="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <Truck class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-base font-bold text-white">Despacho N° {selectedDispatch.doc_num}</h3>
            <p class="text-xs text-zinc-400">
              Cliente: {selectedDispatch.cli_des} ({selectedDispatch.co_cli})
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => selectedDispatch = null}
          class="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-5 space-y-4">
        <!-- Info Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div class="bg-zinc-800/40 p-3 rounded-xl border border-zinc-800/60">
            <span class="text-zinc-400 block text-[10px] uppercase font-semibold">Fecha Emisión</span>
            <span class="font-bold text-white">{dayjs(selectedDispatch.fec_emis).format("DD/MM/YYYY")}</span>
          </div>
          <div class="bg-zinc-800/40 p-3 rounded-xl border border-zinc-800/60">
            <span class="text-zinc-400 block text-[10px] uppercase font-semibold">Factura Origen</span>
            <span class="font-bold text-violet-400 font-mono">{selectedDispatch.factura_origen || "---"}</span>
          </div>
          <div class="bg-zinc-800/40 p-3 rounded-xl border border-zinc-800/60">
            <span class="text-zinc-400 block text-[10px] uppercase font-semibold">Total Renglones</span>
            <span class="font-bold text-white">{selectedDispatch.renglones?.length || 0}</span>
          </div>
          <div class="bg-zinc-800/40 p-3 rounded-xl border border-zinc-800/60">
            <span class="text-zinc-400 block text-[10px] uppercase font-semibold">Estado</span>
            <span class="font-bold {selectedDispatch.anulado ? 'text-red-400' : 'text-emerald-400'}">
              {selectedDispatch.anulado ? 'Anulado' : 'Completado'}
            </span>
          </div>
        </div>

        {#if selectedDispatch.comentario}
          <div class="p-3 bg-zinc-800/30 border border-zinc-800/60 rounded-xl text-xs">
            <span class="text-[10px] font-bold uppercase text-zinc-400 block mb-0.5">Observaciones:</span>
            <p class="text-zinc-300">{selectedDispatch.comentario}</p>
          </div>
        {/if}

        <!-- Items Table -->
        <div class="border border-zinc-800 rounded-xl overflow-hidden">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="bg-zinc-800/60 border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 uppercase">
                <th class="py-2.5 px-3">Artículo</th>
                <th class="py-2.5 px-3">Almacén</th>
                <th class="py-2.5 px-3 text-center">Unidad</th>
                <th class="py-2.5 px-3 text-center">Cant. Despachada</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-800">
              {#each (selectedDispatch.renglones || []) as r}
                <tr class="hover:bg-zinc-800/30">
                  <td class="py-2.5 px-3">
                    <div class="font-semibold text-white">{r.art_des || r.co_art}</div>
                    <div class="font-mono text-[10px] text-violet-400/90">{r.co_art}</div>
                  </td>
                  <td class="py-2.5 px-3 text-zinc-300">{r.des_alma || r.co_alma}</td>
                  <td class="py-2.5 px-3 text-center text-zinc-400">{r.unidad || r.co_uni}</td>
                  <td class="py-2.5 px-3 text-center font-mono font-bold text-white">{r.cant_despachada}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Footer -->
      <div class="p-4 border-t border-zinc-800 bg-zinc-900/80 flex justify-between items-center">
        <a
          href="/dashboard/warehouse/dispatches/{selectedDispatch.doc_num}/print?branch_id={filterSede}"
          target="_blank"
          class="flex items-center gap-1.5 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-semibold border border-zinc-700 transition-all"
        >
          <Printer class="w-3.5 h-3.5 text-cyan-400" />
          <span>Imprimir Despacho</span>
        </a>
        <button
          type="button"
          onclick={() => selectedDispatch = null}
          class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold transition-all"
        >
          Cerrar
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Modal: Confirm Void -->
{#if voidTarget}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" transition:fade={{ duration: 150 }}>
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl" transition:scale={{ duration: 150, start: 0.95 }}>
      <div class="flex items-center gap-3 text-amber-400">
        <AlertTriangle class="w-6 h-6" />
        <h3 class="text-base font-bold text-white">Anular Despacho {voidTarget.doc_num}</h3>
      </div>
      <p class="text-xs text-zinc-300 leading-relaxed">
        Al anular este despacho, las cantidades de los artículos despachados serán restauradas automáticamente como pendientes en la Factura de Venta original.
      </p>
      <div class="space-y-1">
        <label for="void-reason" class="text-xs font-semibold text-zinc-400 block">Motivo de Anulación (Opcional)</label>
        <textarea
          id="void-reason"
          bind:value={voidReason}
          rows="2"
          placeholder="Indica el motivo..."
          class="w-full p-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
        ></textarea>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onclick={() => voidTarget = null}
          class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold"
        >
          Cancelar
        </button>
        <button
          type="button"
          onclick={handleVoidDispatch}
          disabled={isVoiding}
          class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
        >
          {#if isVoiding}
            <Loader2 class="w-3.5 h-3.5 animate-spin" />
            <span>Anulando...</span>
          {:else}
            <span>Confirmar Anulación</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Modal: Confirm Delete -->
{#if deleteTarget}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" transition:fade={{ duration: 150 }}>
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl" transition:scale={{ duration: 150, start: 0.95 }}>
      <div class="flex items-center gap-3 text-red-400">
        <Trash2 class="w-6 h-6" />
        <h3 class="text-base font-bold text-white">Eliminar Despacho {deleteTarget.doc_num}</h3>
      </div>
      <p class="text-xs text-zinc-300 leading-relaxed">
        ¿Estás seguro de que deseas eliminar permanentemente esta nota de despacho de Profit Plus? Esta acción no se puede deshacer.
      </p>
      <div class="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onclick={() => deleteTarget = null}
          class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold"
        >
          Cancelar
        </button>
        <button
          type="button"
          onclick={handleDeleteDispatch}
          disabled={isDeleting}
          class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
        >
          {#if isDeleting}
            <Loader2 class="w-3.5 h-3.5 animate-spin" />
            <span>Eliminando...</span>
          {:else}
            <span>Confirmar Eliminación</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
