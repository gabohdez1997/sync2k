<!-- src/routes/dashboard/purchases/documents/history/+page.svelte -->
<script lang="ts">
  import { fade, slide } from "svelte/transition";
  import {
    Clock,
    Store,
    FileSpreadsheet,
    Lock,
    Loader2,
    Check,
    Ban,
    ChevronLeft,
    ChevronRight,
    AlertCircle,
    Plus,
    Eye,
    Building2,
    Calendar,
    X,
    Trash2,
    ArrowUpDown,
    CheckCircle2,
    AlertTriangle,
    CreditCard
  } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { enhance } from "$app/forms";
  import { toast } from "svelte-sonner";
  import SearchBar from "$lib/components/ui/SearchBar.svelte";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import dayjs from "dayjs";
  import "dayjs/locale/es";

  let { data } = $props();

  dayjs.locale("es");

  function formatDate(d: any) {
    if (!d) return "---";
    const str = String(d).trim().split("T")[0];
    const parts = str.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dayjs(d).format("DD/MM/YYYY");
  }

  let isSearching = $state(false);

  // Void Modal State
  let showVoidModal = $state(false);
  let docToVoid = $state<any>(null);
  let voidPassword = $state("");
  let isVoiding = $state(false);

  // Delete Modal State
  let showDeleteModal = $state(false);
  let docToDelete = $state<any>(null);
  let isDeleting = $state(false);

  // Detail Modal State
  let showDetailModal = $state(false);
  let isLoadingDetail = $state(false);
  let selectedDocDetail = $state<any>(null);

  // Filtros locales
  let filterSearch = $state("");
  let filterSede = $state("");
  let filterTipo = $state("");
  let filterStatus = $state("");
  let filterFecD = $state("");
  let filterFecH = $state("");

  $effect(() => {
    filterSearch = data.filters?.search || "";
    filterSede = data.selectedBranchId || "";
    filterTipo = data.filters?.co_tipo_doc || "";
    filterStatus = data.filters?.status || "";
    filterFecD = data.filters?.fec_d || "";
    filterFecH = data.filters?.fec_h || "";
  });

  // Estado de Ordenamiento
  let sortBy = $derived(data.filters?.order_by || "fec_emis");
  let sortAsc = $derived((data.filters?.order_dir || "DESC").toUpperCase() === "ASC");

  function toggleSort(col: string) {
    const params = new URLSearchParams($page.url.searchParams);
    const currentOrder = data.filters?.order_by || "fec_emis";
    const currentDir = (data.filters?.order_dir || "DESC").toUpperCase();

    let nextDir = "DESC";
    if (currentOrder === col) {
      nextDir = currentDir === "ASC" ? "DESC" : "ASC";
    }

    params.set("order_by", col);
    params.set("order_dir", nextDir);
    params.set("page", "1");
    goto(`?${params.toString()}`);
  }

  function applyFilters() {
    const params = new URLSearchParams($page.url.searchParams);
    if (filterSearch) params.set("search", filterSearch);
    else params.delete("search");
    if (filterSede) params.set("branch_id", filterSede);
    if (filterTipo) params.set("co_tipo_doc", filterTipo);
    else params.delete("co_tipo_doc");
    if (filterStatus) params.set("status", filterStatus);
    else params.delete("status");
    if (filterFecD) params.set("fec_d", filterFecD);
    else params.delete("fec_d");
    if (filterFecH) params.set("fec_h", filterFecH);
    else params.delete("fec_h");
    params.set("page", "1");
    goto(`?${params.toString()}`);
  }

  function changePage(p: number) {
    const params = new URLSearchParams($page.url.searchParams);
    params.set("page", p.toString());
    goto(`?${params.toString()}`);
  }

  function openVoidModal(doc: any) {
    docToVoid = doc;
    voidPassword = "";
    showVoidModal = true;
  }

  function openDeleteModal(doc: any) {
    docToDelete = doc;
    showDeleteModal = true;
  }

  async function openDetailModal(doc: any) {
    showDetailModal = true;
    isLoadingDetail = true;
    selectedDocDetail = null;

    try {
      const res = await fetch(`/api/agent/documentos-compra/${encodeURIComponent(doc.co_tipo_doc.trim())}/${encodeURIComponent(doc.nro_doc.trim())}?branch_id=${data.selectedBranchId}`);
      const result = await res.json();
      if (result.success && result.data) {
        selectedDocDetail = result.data;
      } else {
        toast.error(result.message || "No se pudo cargar el detalle del documento.");
        showDetailModal = false;
      }
    } catch (err: any) {
      toast.error("Error al cargar detalle: " + err.message);
      showDetailModal = false;
    } finally {
      isLoadingDetail = false;
    }
  }
</script>

<div class="space-y-6 animate-in fade-in duration-500" in:fade>
  {#if data.error}
    <div
      class="glass border-red-500/20 p-6 rounded-3xl flex items-center gap-6 bg-red-500/5 shadow-xl shadow-red-500/10"
      in:slide
    >
      <div
        class="h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0"
      >
        <AlertCircle size={24} />
      </div>
      <div class="flex-1">
        <h3 class="text-sm font-black text-red-500 uppercase tracking-widest mb-1">
          Restricción de Acceso
        </h3>
        <p class="text-text-muted font-bold text-sm leading-relaxed">{data.error}</p>
      </div>
      <button
        onclick={() => window.location.reload()}
        class="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-black transition-all cursor-pointer"
      >
        Reintentar
      </button>
    </div>
  {/if}

  <!-- HEADER -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div class="flex flex-col gap-2">
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <FileSpreadsheet size={40} class="text-brand-500" />
        Historial Documentos de Compra
      </h1>
      <p class="text-text-muted text-base">
        Consulta, anulación y eliminación de documentos directos en Cuentas por Pagar.
      </p>
    </div>

    {#if data.canCreate}
      <div class="flex items-center gap-3 shrink-0">
        <button
          onclick={() => {
            const params = new URLSearchParams();
            if (filterSede) params.set("branch_id", filterSede);
            goto(`/dashboard/purchases/documents?${params.toString()}`);
          }}
          class="flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-500 text-white h-14 px-8 rounded-2xl font-black shadow-xl shadow-brand-500/20 transition-all active:scale-95 shrink-0 w-full md:w-auto cursor-pointer"
        >
          <Plus size={20} />
          Nuevo Documento
        </button>
      </div>
    {/if}
  </div>

  <!-- STAT METRICS CARDS -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="glass p-5 rounded-3xl border border-border-subtle shadow-md">
      <span class="text-[10px] text-text-muted uppercase font-bold tracking-wider">Total Documentos</span>
      <div class="text-2xl font-black text-text-base mt-1">
        {data.metrics?.total_items || data.documents.length}
      </div>
      <span class="text-xs text-text-muted">En el período consultado</span>
    </div>

    <div class="glass p-5 rounded-3xl border border-border-subtle shadow-md">
      <span class="text-[10px] text-text-muted uppercase font-bold tracking-wider">Total Neto</span>
      <div class="text-2xl font-black text-brand-400 mt-1 font-mono">
        Bs. {(data.metrics?.total_neto || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <span class="text-xs text-text-muted">Total acumulado activo</span>
    </div>

    <div class="glass p-5 rounded-3xl border border-border-subtle shadow-md">
      <span class="text-[10px] text-text-muted uppercase font-bold tracking-wider">Saldo Pendiente</span>
      <div class="text-2xl font-black text-amber-400 mt-1 font-mono">
        Bs. {(data.metrics?.total_saldo || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <span class="text-xs text-text-muted">Por pagar a proveedores</span>
    </div>

    <div class="glass p-5 rounded-3xl border border-border-subtle shadow-md">
      <span class="text-[10px] text-text-muted uppercase font-bold tracking-wider">Anulados</span>
      <div class="text-2xl font-black text-red-400 mt-1">
        {data.metrics?.anulados_count || 0}
      </div>
      <span class="text-xs text-text-muted">Documentos sin efecto</span>
    </div>
  </div>

  <!-- SEARCH & FILTERS -->
  <div class="glass p-4 rounded-3xl border border-border-subtle shadow-2xl grid grid-cols-1 md:grid-cols-6 gap-3 items-center w-full relative z-20">
    <!-- Branch Selector -->
    {#if data.branches && data.branches.length > 1}
      <div class="w-full md:col-span-1">
        <Combobox
          options={data.branches.map((b: any) => ({ value: b.id, label: b.name }))}
          bind:value={filterSede}
          placeholder="Sucursal..."
          allLabel="Todas las Sucursales"
          icon={Store}
          class="w-full h-11"
          onchange={applyFilters}
        />
      </div>
    {/if}

    <!-- Search Input -->
    <div class="w-full {!(data.branches && data.branches.length > 1) ? 'md:col-span-2' : 'md:col-span-2'}">
      <SearchBar
        bind:value={filterSearch}
        isSearching={isSearching}
        onsubmit={applyFilters}
        placeholder="Buscar por N° Factura, N° Profit, proveedor o RIF..."
        className="w-full h-11"
      />
    </div>

    <!-- Tipo de Documento -->
    <div class="w-full">
      <select
        bind:value={filterTipo}
        onchange={applyFilters}
        class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-xs font-bold text-text-base focus:border-brand-500 outline-none cursor-pointer"
      >
        <option value="">Todos los Tipos</option>
        <option value="FACT">FACT - Facturas</option>
        <option value="N/CR">N/CR - Notas de Crédito</option>
        <option value="N/DB">N/DB - Notas de Débito</option>
      </select>
    </div>

    <!-- Date From -->
    <div class="w-full">
      <input
        type="date"
        bind:value={filterFecD}
        onchange={applyFilters}
        placeholder="Desde"
        class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-xs font-bold text-text-base focus:border-brand-500 outline-none"
        title="Fecha Emisión Desde"
      />
    </div>

    <!-- Date To -->
    <div class="w-full">
      <input
        type="date"
        bind:value={filterFecH}
        onchange={applyFilters}
        placeholder="Hasta"
        class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-xs font-bold text-text-base focus:border-brand-500 outline-none"
        title="Fecha Emisión Hasta"
      />
    </div>
  </div>

  <!-- TABLE CONTAINER -->
  <div class="glass rounded-3xl border border-border-subtle shadow-2xl overflow-hidden relative">
    <div class="overflow-x-auto min-h-[300px]">
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="border-b border-border-subtle/50 bg-surface-soft/40 uppercase tracking-widest text-text-muted font-black text-[10px]">
            <th class="py-4 px-4 text-center">Tipo</th>
            <th class="py-4 px-4 cursor-pointer hover:text-text-base" onclick={() => toggleSort('nro_doc')}>
              <div class="flex items-center gap-1.5">
                <span>N° Profit</span>
                <ArrowUpDown size={12} class={sortBy === 'nro_doc' ? 'text-brand-500' : 'opacity-40'} />
              </div>
            </th>
            <th class="py-4 px-4 cursor-pointer hover:text-text-base" onclick={() => toggleSort('nro_fact')}>
              <div class="flex items-center gap-1.5">
                <span>Factura / Control</span>
                <ArrowUpDown size={12} class={sortBy === 'nro_fact' ? 'text-brand-500' : 'opacity-40'} />
              </div>
            </th>
            <th class="py-4 px-4 cursor-pointer hover:text-text-base" onclick={() => toggleSort('prov_des')}>
              <div class="flex items-center gap-1.5">
                <span>Proveedor</span>
                <ArrowUpDown size={12} class={sortBy === 'prov_des' ? 'text-brand-500' : 'opacity-40'} />
              </div>
            </th>
            <th class="py-4 px-4 cursor-pointer hover:text-text-base" onclick={() => toggleSort('fec_emis')}>
              <div class="flex items-center gap-1.5">
                <span>Emisión / Venc.</span>
                <ArrowUpDown size={12} class={sortBy === 'fec_emis' ? 'text-brand-500' : 'opacity-40'} />
              </div>
            </th>
            <th class="py-4 px-4 text-right cursor-pointer hover:text-text-base" onclick={() => toggleSort('total_neto')}>
              <div class="flex items-center justify-end gap-1.5">
                <span>Total Neto</span>
                <ArrowUpDown size={12} class={sortBy === 'total_neto' ? 'text-brand-500' : 'opacity-40'} />
              </div>
            </th>
            <th class="py-4 px-4 text-right cursor-pointer hover:text-text-base" onclick={() => toggleSort('saldo')}>
              <div class="flex items-center justify-end gap-1.5">
                <span>Saldo</span>
                <ArrowUpDown size={12} class={sortBy === 'saldo' ? 'text-brand-500' : 'opacity-40'} />
              </div>
            </th>
            <th class="py-4 px-4 text-center">Usuario</th>
            <th class="py-4 px-4 text-center">Estado</th>
            <th class="py-4 px-4 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle/30 font-medium">
          {#if data.documents.length === 0}
            <tr>
              <td colspan="10" class="py-16 text-center text-text-muted">
                <div class="flex flex-col items-center justify-center gap-2">
                  <FileSpreadsheet size={36} class="text-text-muted/40" />
                  <p class="text-sm font-bold">No se encontraron documentos de compra.</p>
                  <p class="text-xs text-text-muted/60">Ajuste los filtros o registre un nuevo documento.</p>
                </div>
              </td>
            </tr>
          {:else}
            {#each data.documents as doc}
              <tr class="hover:bg-surface-soft/40 transition-colors {doc.anulado ? 'opacity-60 bg-red-500/5' : ''}">
                <!-- Tipo Badge -->
                <td class="py-3.5 px-4 text-center">
                  <span
                    class="px-2 py-0.5 rounded text-[10px] font-black uppercase font-mono tracking-wider
                    {doc.co_tipo_doc === 'FACT' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                     doc.co_tipo_doc === 'N/CR' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                     doc.co_tipo_doc === 'N/DB' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                     'bg-surface-soft text-text-muted border border-border-subtle'}"
                  >
                    {doc.co_tipo_doc}
                  </span>
                </td>

                <!-- Nro Profit -->
                <td class="py-3.5 px-4 font-mono font-bold text-text-base">
                  {doc.nro_doc}
                </td>

                <!-- Nro Factura / Control Fiscal -->
                <td class="py-3.5 px-4">
                  <div class="font-mono font-bold text-text-base">{doc.nro_fact}</div>
                  {#if doc.n_control && doc.n_control !== 'N/A'}
                    <div class="text-[10px] text-text-muted font-mono">Ctrl: {doc.n_control}</div>
                  {/if}
                </td>

                <!-- Proveedor -->
                <td class="py-3.5 px-4 max-w-[200px]">
                  <div class="font-bold text-text-base truncate" title={doc.prov_des}>
                    {doc.prov_des || doc.co_prov}
                  </div>
                  <div class="text-[10px] text-text-muted font-mono">{doc.rif || doc.co_prov}</div>
                </td>

                <!-- Emisión / Vencimiento -->
                <td class="py-3.5 px-4">
                  <div class="font-mono">{formatDate(doc.fec_emis)}</div>
                  <div class="text-[10px] text-text-muted font-mono">Venc: {formatDate(doc.fec_venc)}</div>
                </td>

                <!-- Total Neto -->
                <td class="py-3.5 px-4 text-right font-mono font-bold text-text-base">
                  Bs. {Number(doc.total_neto || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>

                <!-- Saldo -->
                <td class="py-3.5 px-4 text-right font-mono font-bold">
                  {#if doc.anulado}
                    <span class="text-text-muted">---</span>
                  {:else if Number(doc.saldo) <= 0}
                    <span class="text-green-400">Bs. 0,00</span>
                  {:else}
                    <span class="text-amber-400">
                      Bs. {Number(doc.saldo || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  {/if}
                </td>

                <!-- Usuario Creador -->
                <td class="py-3.5 px-4 text-center text-[11px] text-text-muted">
                  <span class="font-medium" title={doc.user_name || doc.co_us_in}>
                    {doc.user_name || doc.co_us_in || 'PROFIT'}
                  </span>
                </td>

                <!-- Estado -->
                <td class="py-3.5 px-4 text-center">
                  {#if doc.anulado}
                    <span class="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-bold border border-red-500/20">
                      Anulado
                    </span>
                  {:else if Number(doc.saldo) <= 0}
                    <span class="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[10px] font-bold border border-green-500/20">
                      Pagado
                    </span>
                  {:else}
                    <span class="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold border border-amber-500/20">
                      Con Saldo
                    </span>
                  {/if}
                </td>

                <!-- Acciones -->
                <td class="py-3.5 px-4 text-center">
                  <div class="flex items-center justify-center gap-1.5">
                    <!-- Detalle -->
                    <button
                      onclick={() => openDetailModal(doc)}
                      title="Ver Detalle"
                      class="p-1.5 rounded-lg bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base border border-border-subtle cursor-pointer transition-colors"
                    >
                      <Eye size={14} />
                    </button>

                    <!-- Anular -->
                    {#if data.canVoid && !doc.anulado && Number(doc.pagos_asociados || 0) === 0}
                      <button
                        onclick={() => openVoidModal(doc)}
                        title="Anular Documento"
                        class="p-1.5 rounded-lg bg-surface-soft hover:bg-red-500/10 text-text-muted hover:text-red-400 border border-border-subtle cursor-pointer transition-colors"
                      >
                        <Ban size={14} />
                      </button>
                    {/if}

                    <!-- Eliminar -->
                    {#if data.canDelete && (!doc.doc_orig || doc.doc_orig.trim() !== 'FACT') && Number(doc.pagos_asociados || 0) === 0}
                      <button
                        onclick={() => openDeleteModal(doc)}
                        title="Eliminar Documento"
                        class="p-1.5 rounded-lg bg-surface-soft hover:bg-red-500/10 text-text-muted hover:text-red-400 border border-border-subtle cursor-pointer transition-colors"
                      >
                        <Trash2 size={14} />
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

    <!-- PAGINATION BAR -->
    {#if data.pagination && data.pagination.pages > 1}
      <div class="p-4 border-t border-border-subtle/50 flex items-center justify-between text-xs text-text-muted">
        <span>
          Mostrando página <strong>{data.pagination.currentPage}</strong> de <strong>{data.pagination.pages}</strong> ({data.pagination.total} documentos)
        </span>
        <div class="flex items-center gap-2">
          <button
            onclick={() => changePage((data.pagination?.currentPage || 1) - 1)}
            disabled={(data.pagination?.currentPage || 1) <= 1}
            class="p-2 rounded-xl bg-surface-soft hover:bg-surface-strong disabled:opacity-40 border border-border-subtle cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onclick={() => changePage((data.pagination?.currentPage || 1) + 1)}
            disabled={(data.pagination?.currentPage || 1) >= (data.pagination?.pages || 1)}
            class="p-2 rounded-xl bg-surface-soft hover:bg-surface-strong disabled:opacity-40 border border-border-subtle cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- MODAL: DETALLE DEL DOCUMENTO -->
{#if showDetailModal}
  <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" in:fade>
    <div
      class="bg-surface-base border border-border-subtle rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5"
      in:slide
    >
      <div class="flex justify-between items-center pb-3 border-b border-border-subtle">
        <div class="flex items-center gap-3">
          <div class="p-2.5 bg-brand-500/10 rounded-2xl text-brand-400">
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <h3 class="text-base font-black text-text-base">
              Detalle del Documento {selectedDocDetail?.co_tipo_doc} {selectedDocDetail?.nro_doc}
            </h3>
            <span class="text-xs text-text-muted">Fiscal N°: {selectedDocDetail?.nro_fact}</span>
          </div>
        </div>
        <button
          onclick={() => (showDetailModal = false)}
          class="p-2 rounded-xl text-text-muted hover:text-text-base hover:bg-surface-soft cursor-pointer transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {#if isLoadingDetail}
        <div class="py-16 flex flex-col items-center justify-center gap-2 text-text-muted">
          <Loader2 size={28} class="animate-spin text-brand-500" />
          <span class="text-xs">Cargando información...</span>
        </div>
      {:else if selectedDocDetail}
        <!-- PROVEEDOR & FECHAS -->
        <div class="grid grid-cols-2 gap-4 text-xs bg-surface-soft/60 p-4 rounded-2xl border border-border-subtle">
          <div>
            <span class="text-[10px] text-text-muted uppercase font-bold">Proveedor:</span>
            <p class="font-bold text-text-base mt-0.5">{selectedDocDetail.prov_des}</p>
            <span class="text-text-muted font-mono">{selectedDocDetail.rif} ({selectedDocDetail.co_prov})</span>
          </div>
          <div class="space-y-1">
            <div class="flex justify-between">
              <span class="text-text-muted">Fecha Emisión:</span>
              <span class="font-mono font-bold">{formatDate(selectedDocDetail.fec_emis)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">Fecha Vencimiento:</span>
              <span class="font-mono font-bold">{formatDate(selectedDocDetail.fec_venc)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">N° de Control:</span>
              <span class="font-mono font-bold">{selectedDocDetail.n_control || 'N/A'}</span>
            </div>
          </div>
        </div>

        {#if selectedDocDetail.observa}
          <div class="text-xs bg-surface-soft/40 p-3 rounded-xl border border-border-subtle">
            <span class="text-[10px] text-text-muted uppercase font-bold block mb-1">Concepto / Observaciones:</span>
            <p class="text-text-base">{selectedDocDetail.observa}</p>
          </div>
        {/if}

        <!-- DESGLOSE DE MONTOS -->
        <div class="space-y-2 text-xs bg-surface-soft/60 p-4 rounded-2xl border border-border-subtle divide-y divide-border-subtle/50">
          <div class="flex justify-between py-1">
            <span class="text-text-muted">Base Imponible:</span>
            <span class="font-mono font-bold">
              Bs. {Number(selectedDocDetail.total_bruto || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div class="flex justify-between py-1">
            <span class="text-text-muted">Monto Exento:</span>
            <span class="font-mono font-bold">
              Bs. {Number(selectedDocDetail.monto_exento || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div class="flex justify-between py-1">
            <span class="text-text-muted">IVA ({selectedDocDetail.porc_imp || 16}%):</span>
            <span class="font-mono font-bold">
              Bs. {Number(selectedDocDetail.monto_imp || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div class="flex justify-between py-1.5 text-sm">
            <span class="font-bold text-text-base">Total Neto:</span>
            <span class="font-mono font-black text-brand-400">
              Bs. {Number(selectedDocDetail.total_neto || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div class="flex justify-between py-1 text-xs">
            <span class="font-bold text-text-muted">Saldo Pendiente:</span>
            <span class="font-mono font-bold {Number(selectedDocDetail.saldo) > 0 ? 'text-amber-400' : 'text-green-400'}">
              Bs. {Number(selectedDocDetail.saldo || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <!-- PAGOS APLICADOS -->
        {#if selectedDocDetail.pagos && selectedDocDetail.pagos.length > 0}
          <div class="space-y-2">
            <span class="text-[10px] text-text-muted uppercase font-bold tracking-wider">Pagos / Retenciones Aplicadas:</span>
            <div class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {#each selectedDocDetail.pagos as p}
                <div class="p-2.5 rounded-xl bg-surface-soft border border-border-subtle flex justify-between items-center text-xs">
                  <div>
                    <span class="font-mono font-bold text-brand-400">{p.cob_num}</span>
                    <span class="text-[10px] text-text-muted ml-2">{formatDate(p.fec_cob)}</span>
                  </div>
                  <div class="font-mono font-bold text-text-base">
                    Bs. {Number(p.mont_cob || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<!-- MODAL: ANULACIÓN DE DOCUMENTO -->
{#if showVoidModal && docToVoid}
  <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" in:fade>
    <div
      class="bg-surface-base border border-red-500/20 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5"
      in:slide
    >
      <div class="flex items-center gap-3 text-red-400">
        <div class="p-2.5 bg-red-500/10 rounded-2xl">
          <Ban size={24} />
        </div>
        <div>
          <h3 class="text-lg font-black text-text-base">Anular Documento</h3>
          <span class="text-xs text-text-muted">Esta acción dejará sin efecto la cuenta por pagar</span>
        </div>
      </div>

      <div class="p-4 bg-surface-soft rounded-2xl border border-border-subtle text-xs space-y-1">
        <p><strong>Documento:</strong> {docToVoid.co_tipo_doc} {docToVoid.nro_doc}</p>
        <p><strong>Factura Fiscal:</strong> {docToVoid.nro_fact}</p>
        <p><strong>Proveedor:</strong> {docToVoid.prov_des}</p>
        <p><strong>Monto:</strong> Bs. {Number(docToVoid.total_neto || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      </div>

      <form
        method="POST"
        action="?/voidDocument"
        use:enhance={() => {
          isVoiding = true;
          return async ({ result, update }) => {
            isVoiding = false;
            if (result.type === 'success') {
              showVoidModal = false;
              toast.success("Documento anulado con éxito.");
              await update();
            } else if (result.type === 'failure') {
              toast.error(String((result.data as any)?.message || "Error al anular documento."));
            }
          };
        }}
        class="space-y-4"
      >
        <input type="hidden" name="co_tipo_doc" value={docToVoid.co_tipo_doc} />
        <input type="hidden" name="nro_doc" value={docToVoid.nro_doc} />
        <input type="hidden" name="branch_id" value={data.selectedBranchId} />

        <div>
          <label for="pwd" class="text-xs font-bold text-text-muted block mb-1">
            Ingrese su contraseña para confirmar:
          </label>
          <input
            id="pwd"
            type="password"
            name="password"
            bind:value={voidPassword}
            required
            placeholder="Contraseña de usuario..."
            class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm focus:border-red-500 outline-none"
          />
        </div>

        <div class="flex gap-3 pt-2">
          <button
            type="button"
            onclick={() => (showVoidModal = false)}
            class="flex-1 h-11 rounded-xl bg-surface-soft hover:bg-surface-strong text-xs font-bold transition-all border border-border-subtle cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isVoiding || !voidPassword}
            class="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-red-500/20 cursor-pointer flex items-center justify-center gap-2"
          >
            {#if isVoiding}
              <Loader2 size={14} class="animate-spin" />
              Anulando...
            {:else}
              Confirmar Anulación
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- MODAL: ELIMINACIÓN DE DOCUMENTO -->
{#if showDeleteModal && docToDelete}
  <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" in:fade>
    <div
      class="bg-surface-base border border-red-500/20 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5"
      in:slide
    >
      <div class="flex items-center gap-3 text-red-400">
        <div class="p-2.5 bg-red-500/10 rounded-2xl">
          <Trash2 size={24} />
        </div>
        <div>
          <h3 class="text-lg font-black text-text-base">Eliminar Documento</h3>
          <span class="text-xs text-text-muted">El registro se removerá permanentemente</span>
        </div>
      </div>

      <div class="p-4 bg-surface-soft rounded-2xl border border-border-subtle text-xs space-y-1">
        <p><strong>Documento:</strong> {docToDelete.co_tipo_doc} {docToDelete.nro_doc}</p>
        <p><strong>Factura Fiscal:</strong> {docToDelete.nro_fact}</p>
        <p><strong>Proveedor:</strong> {docToDelete.prov_des}</p>
      </div>

      <form
        method="POST"
        action="?/deleteDocument"
        use:enhance={() => {
          isDeleting = true;
          return async ({ result, update }) => {
            isDeleting = false;
            if (result.type === 'success') {
              showDeleteModal = false;
              toast.success("Documento eliminado con éxito.");
              await update();
            } else if (result.type === 'failure') {
              toast.error(String((result.data as any)?.message || "Error al eliminar documento."));
            }
          };
        }}
        class="space-y-4"
      >
        <input type="hidden" name="co_tipo_doc" value={docToDelete.co_tipo_doc} />
        <input type="hidden" name="nro_doc" value={docToDelete.nro_doc} />
        <input type="hidden" name="branch_id" value={data.selectedBranchId} />

        <div class="flex gap-3 pt-2">
          <button
            type="button"
            onclick={() => (showDeleteModal = false)}
            class="flex-1 h-11 rounded-xl bg-surface-soft hover:bg-surface-strong text-xs font-bold transition-all border border-border-subtle cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isDeleting}
            class="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-red-500/20 cursor-pointer flex items-center justify-center gap-2"
          >
            {#if isDeleting}
              <Loader2 size={14} class="animate-spin" />
              Eliminando...
            {:else}
              Confirmar Eliminación
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

