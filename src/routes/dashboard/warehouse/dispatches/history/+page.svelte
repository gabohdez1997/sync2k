<!-- src/routes/dashboard/warehouse/dispatches/history/+page.svelte -->
<script lang="ts">
  import { fade, slide, scale } from "svelte/transition";
  import {
    Truck,
    Store,
    Clock,
    FileText,
    Calendar,
    Filter,
    Plus,
    Printer,
    Eye,
    Pen,
    Trash2,
    Ban,
    ChevronLeft,
    ChevronRight,
    AlertCircle,
    X,
    Loader2,
    CheckCircle2,
    Building,
    Check,
    Lock,
    Package
  } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { enhance, deserialize } from "$app/forms";
  import { toast } from "svelte-sonner";
  import SearchBar from "$lib/components/ui/SearchBar.svelte";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import dayjs from "dayjs";
  import "dayjs/locale/es";

  dayjs.locale("es");

  let { data } = $props();

  let isSearching = $state(false);

  // Filters State
  let filterSearch = $state(data.filters?.search || "");
  let filterSede = $state(data.selectedBranchId || "");
  let filterStatus = $state(data.filters?.status || "all");
  let filterFecD = $state(data.filters?.fec_d || data.filters?.desde || "");
  let filterFecH = $state(data.filters?.fec_h || data.filters?.hasta || "");

  $effect(() => {
    filterSearch = data.filters?.search || "";
    filterSede = data.selectedBranchId || "";
    filterStatus = data.filters?.status || "all";
    filterFecD = data.filters?.fec_d || data.filters?.desde || "";
    filterFecH = data.filters?.fec_h || data.filters?.hasta || "";
  });

  // Detail Modal State
  let showDetailModal = $state(false);
  let detailDispatch = $state<any>(null);
  let isLoadingDetail = $state(false);

  // Delete Modal State
  let showDeleteModal = $state(false);
  let dispatchToDelete = $state<any>(null);
  let deletePassword = $state("");
  let isDeleting = $state(false);

  // Void Modal State
  let showVoidModal = $state(false);
  let dispatchToVoid = $state<any>(null);
  let voidReason = $state("");
  let voidPassword = $state("");
  let isVoiding = $state(false);

  function applyFilters() {
    const params = new URLSearchParams($page.url.searchParams);
    if (filterSearch) params.set("search", filterSearch);
    else params.delete("search");

    if (filterSede) params.set("branch_id", filterSede);
    if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
    else params.delete("status");

    if (filterFecD) params.set("fec_d", filterFecD);
    else params.delete("fec_d");
    if (filterFecH) params.set("fec_h", filterFecH);
    else params.delete("fec_h");

    params.set("page", "1");
    goto(`?${params.toString()}`);
  }

  function clearFilters() {
    filterSearch = "";
    filterStatus = "all";
    filterFecD = "";
    filterFecH = "";
    applyFilters();
  }

  function changePage(p: number) {
    const params = new URLSearchParams($page.url.searchParams);
    params.set("page", p.toString());
    goto(`?${params.toString()}`);
  }

  function formatQuantity(val: number) {
    return Number(val || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  function canDeleteDispatch(dispatch: any) {
    return !dispatch?.anulado;
  }

  // --- ABRIR MODAL DE DETALLE ---
  async function openDetailModal(dispatch: any) {
    showDetailModal = true;
    isLoadingDetail = true;
    detailDispatch = null;

    try {
      const formData = new FormData();
      formData.append("branch_id", filterSede);
      formData.append("doc_num", dispatch.doc_num);

      const res = await fetch("?/getDispatchDetail", {
        method: "POST",
        body: formData
      });

      const result = deserialize(await res.text());

      if (result.type === "success" && (result.data as any)?.dispatch) {
        detailDispatch = (result.data as any).dispatch;
      } else {
        toast.error((result.data as any)?.message || "No se pudo cargar el detalle del despacho.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error al cargar detalle.");
    } finally {
      isLoadingDetail = false;
    }
  }

  // --- ABRIR MODAL DE ELIMINACIÓN ---
  function openDeleteModal(dispatch: any) {
    dispatchToDelete = dispatch;
    deletePassword = "";
    showDeleteModal = true;
  }

  // --- ABRIR MODAL DE ANULACIÓN ---
  function openVoidModal(dispatch: any) {
    dispatchToVoid = dispatch;
    voidReason = "";
    voidPassword = "";
    showVoidModal = true;
  }
</script>

<svelte:head>
  <title>Historial de Despachos | Sync2K</title>
</svelte:head>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
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
        <Clock size={40} class="text-brand-500" />
        Historial de Despachos
      </h1>
      <p class="text-text-muted text-lg">
        Consulta, reimprime o anula comprobantes de despacho y entrega de mercancía.
      </p>
    </div>

    {#if data.canCreate}
      <div class="flex items-center gap-3 shrink-0">
        <button
          onclick={() => goto(`/dashboard/warehouse/dispatches?branch_id=${filterSede}`)}
          class="flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-500 text-white h-14 px-8 rounded-2xl font-black shadow-xl shadow-brand-500/20 transition-all active:scale-95 shrink-0 w-full md:w-auto cursor-pointer"
        >
          <Plus size={20} />
          Nuevo Despacho
        </button>
      </div>
    {/if}
  </div>

  <!-- SEARCH & FILTERS -->
  <div
    class="glass p-4 rounded-3xl border border-border-subtle shadow-2xl grid grid-cols-1 sm:grid-cols-2 {data.branches && data.branches.length > 1 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'} gap-4 items-center mb-6 w-full relative z-20"
  >
    {#if data.branches && data.branches.length > 1}
      <div class="w-full">
        <Combobox
          options={data.branches.map((b: any) => ({ value: b.id, label: b.name }))}
          bind:value={filterSede}
          placeholder="Sucursal..."
          allLabel="Todas las Sucursales"
          icon={Store}
          class="w-full h-12"
          onchange={applyFilters}
        />
      </div>
    {/if}

    <div class="w-full">
      <Combobox
        options={[
          { value: "all", label: "Todos los Estatus" },
          { value: "despachado", label: "Despachado" },
          { value: "parcial", label: "Parcialmente Despachado" },
          { value: "anulado", label: "Anulado" }
        ]}
        bind:value={filterStatus}
        placeholder="Estatus..."
        icon={Filter}
        class="w-full h-12"
        onchange={applyFilters}
      />
    </div>

    <div class="w-full">
      <SearchBar
        bind:value={filterSearch}
        isSearching={isSearching}
        onsubmit={applyFilters}
        placeholder="Buscar por N° despacho, factura, cliente o RIF..."
        className="w-full h-12"
      />
    </div>

    <!-- Date From -->
    <div class="w-full">
      <input
        type="date"
        bind:value={filterFecD}
        onchange={applyFilters}
        placeholder="Desde"
        class="w-full h-12 px-4 bg-surface-soft border border-border-subtle rounded-2xl text-xs font-bold text-text-base focus:border-brand-500 outline-none transition-all"
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
        class="w-full h-12 px-4 bg-surface-soft border border-border-subtle rounded-2xl text-xs font-bold text-text-base focus:border-brand-500 outline-none transition-all"
        title="Fecha Emisión Hasta"
      />
    </div>
  </div>

  <!-- DISPATCH LIST TABLE -->
  <div
    class="bg-surface-raised/50 backdrop-blur-md rounded-[32px] border border-border-subtle shadow-2xl overflow-hidden min-h-[400px]"
  >
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-surface-soft/50 border-b border-border-subtle">
            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted"
              >Fecha Emisión</th
            >
            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted"
              >Despacho / Factura</th
            >
            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted"
              >Cliente</th
            >
            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-center"
              >Renglones / Cant.</th
            >
            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-center"
              >Estatus</th
            >
            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-center"
              >Acciones</th
            >
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle">
          {#if data.dispatches && data.dispatches.length > 0}
            {#each data.dispatches as dispatch}
              <tr class="hover:bg-surface-soft/40 transition-colors group">
                <!-- Fecha -->
                <td class="px-6 py-5 whitespace-nowrap">
                  <div class="text-xs font-black text-text-base">
                    {dayjs(dispatch.fec_emis).format("DD/MM/YYYY")}
                  </div>
                  <div class="text-xs text-text-muted/60 mt-0.5">
                    {dayjs(dispatch.fec_emis).format("hh:mm A")}
                  </div>
                </td>

                <!-- Documento / Factura -->
                <td class="px-6 py-5">
                  <div class="flex flex-col gap-1 items-start">
                    <button
                      type="button"
                      onclick={() => openDetailModal(dispatch)}
                      class="px-2.5 py-1 rounded-lg bg-surface-soft border border-border-subtle text-xs font-black text-brand-500 group-hover:bg-brand-500 group-hover:border-brand-500 group-hover:text-white transition-all font-mono cursor-pointer"
                    >
                      {dispatch.doc_num}
                    </button>
                    {#if dispatch.factura_origen}
                      <span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20 font-mono">
                        FACT: {dispatch.factura_origen}
                      </span>
                    {/if}
                  </div>
                </td>

                <!-- Cliente -->
                <td class="px-6 py-5">
                  <div class="text-xs font-black text-text-base leading-snug truncate max-w-[260px]" title={dispatch.cli_des}>
                    {dispatch.cli_des || dispatch.co_cli}
                  </div>
                  <div class="text-xs text-text-muted/60 font-mono mt-0.5 font-bold">
                    {dispatch.rif || dispatch.co_cli}
                  </div>
                </td>



                <!-- Renglones / Unidades -->
                <td class="px-6 py-5 text-center">
                  <span class="text-xs font-black text-text-base">{dispatch.total_renglones || (dispatch.renglones?.length ?? 0)} ítems</span>
                  <span class="text-xs font-black text-emerald-400 font-mono block mt-0.5">
                    {formatQuantity(dispatch.total_unidades || 0)} un.
                  </span>
                </td>

                <!-- Estatus -->
                <td class="px-6 py-5 text-center">
                  {#if dispatch.anulado}
                    <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20">
                      Anulado
                    </span>
                  {:else if (dispatch.factura_total_unidades && Number(dispatch.total_unidades) < Number(dispatch.factura_total_unidades)) || dispatch.factura_status === '1' || (dispatch.factura_pendiente && Number(dispatch.factura_pendiente) > 0)}
                    <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Parcialmente Despachado
                    </span>
                  {:else}
                    <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-green-500/10 text-green-500 border border-green-500/20">
                      Despachado
                    </span>
                  {/if}
                </td>

                <!-- Acciones -->
                <td class="px-6 py-5 text-center whitespace-nowrap">
                  <div class="flex items-center justify-center gap-2 whitespace-nowrap">
                    <!-- Imprimir -->
                    <a
                      href="/dashboard/warehouse/dispatches/{dispatch.doc_num}/print?branch_id={dispatch.sede_id || filterSede}"
                      target="_blank"
                      class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all inline-block cursor-pointer"
                      title="Imprimir Comprobante"
                    >
                      <Printer size={18} />
                    </a>

                    <!-- Ver Detalle -->
                    <button
                      type="button"
                      onclick={() => openDetailModal(dispatch)}
                      class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all cursor-pointer"
                      title="Ver Detalle"
                    >
                      <Eye size={18} />
                    </button>

                    <!-- Editar -->
                    {#if data.canUpdate && !dispatch.anulado}
                      <button
                        type="button"
                        onclick={() => goto(`/dashboard/warehouse/dispatches?doc_num=${dispatch.doc_num}&branch_id=${dispatch.sede_id || filterSede}`)}
                        class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all cursor-pointer"
                        title="Editar Nota de Despacho"
                      >
                        <Pen size={18} />
                      </button>
                    {/if}

                    <!-- Anular -->
                    {#if data.canVoid && !dispatch.anulado}
                      <button
                        type="button"
                        onclick={() => openVoidModal(dispatch)}
                        class="p-2 text-text-muted hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all cursor-pointer"
                        title="Anular Documento"
                      >
                        <Ban size={18} />
                      </button>
                    {/if}

                    <!-- Eliminar -->
                    {#if data.canDelete && canDeleteDispatch(dispatch)}
                      <button
                        type="button"
                        onclick={() => openDeleteModal(dispatch)}
                        class="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
                        title="Eliminar Nota de Despacho"
                      >
                        <Trash2 size={18} />
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          {:else}
            <tr>
              <td colspan="6" class="py-20 text-center text-text-muted">
                <div class="flex flex-col items-center justify-center gap-3">
                  <Truck size={48} class="text-text-muted/30 stroke-[1.5]" />
                  <p class="text-base font-bold">No se encontraron notas de despacho registradas</p>
                  <p class="text-xs text-text-muted/60 max-w-sm">
                    Intenta ajustar los filtros de búsqueda o registra un nuevo despacho desde facturas de venta.
                  </p>
                  {#if filterSearch || (filterStatus && filterStatus !== 'all') || filterFecD || filterFecH}
                    <button
                      type="button"
                      onclick={clearFilters}
                      class="mt-2 text-brand-500 hover:underline text-sm font-bold cursor-pointer"
                    >
                      Limpiar filtros
                    </button>
                  {/if}
                </div>
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

    <!-- PAGINATION -->
    {#if data.totalPages && data.totalPages > 1}
      <div class="px-6 py-4 border-t border-border-subtle flex items-center justify-between bg-surface-soft/30">
        <span class="text-xs text-text-muted">
          Página <strong class="text-text-base">{data.page}</strong> de <strong class="text-text-base">{data.totalPages}</strong> ({data.total} documentos)
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            disabled={data.page <= 1}
            onclick={() => changePage(data.page - 1)}
            class="p-2 rounded-xl bg-surface-base border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            disabled={data.page >= data.totalPages}
            onclick={() => changePage(data.page + 1)}
            class="p-2 rounded-xl bg-surface-base border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- ========================================================================= -->
<!-- MODAL: DETALLE DE NOTA DE DESPACHO -->
<!-- ========================================================================= -->
{#if showDetailModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    in:fade
  >
    <div
      class="fixed inset-0"
      onclick={() => (showDetailModal = false)}
    ></div>

    <div
      class="w-full max-w-2xl bg-surface-base border border-border-subtle rounded-[32px] shadow-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
      in:scale={{ duration: 200, start: 0.95 }}
    >
      <!-- Header Modal -->
      <div class="p-6 border-b border-border-subtle flex items-center justify-between bg-surface-soft/50">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500">
            <Package size={20} />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-base font-black text-text-base">
                Nota de Despacho N° {detailDispatch?.doc_num || "..."}
              </h3>
              {#if detailDispatch?.anulado}
                <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20">
                  Anulado
                </span>
              {:else if (detailDispatch?.factura_total_unidades && Number(detailDispatch.total_unidades) < Number(detailDispatch.factura_total_unidades)) || detailDispatch?.factura_status === '1' || (detailDispatch?.factura_pendiente && Number(detailDispatch.factura_pendiente) > 0)}
                <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Parcialmente Despachado
                </span>
              {:else if detailDispatch}
                <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-green-500/10 text-green-500 border border-green-500/20">
                  Despachado
                </span>
              {/if}
            </div>
            <p class="text-xs text-text-muted">Detalle físico y artículos despachados</p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => (showDetailModal = false)}
          class="h-8 w-8 rounded-xl bg-surface-strong hover:bg-surface-soft text-text-muted hover:text-text-base flex items-center justify-center transition-all cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      <!-- Body Modal -->
      <div class="p-6 overflow-y-auto space-y-6 flex-1">
        {#if isLoadingDetail}
          <div class="py-16 text-center space-y-3">
            <Loader2 size={32} class="animate-spin text-brand-500 mx-auto" />
            <p class="text-xs text-text-muted">Cargando renglones del documento...</p>
          </div>
        {:else if detailDispatch}
          {@const dispatchedRenglones = (detailDispatch.renglones || []).filter((r: any) => (Number(r.cant_despachada || r.total_art) || 0) > 0)}
          {@const totalUnits = dispatchedRenglones.reduce((acc: number, r: any) => acc + Number(r.cant_despachada || r.total_art || 0), 0)}

          <!-- Info Cliente y Resumen -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-surface-soft border border-border-subtle">
            <div class="space-y-1">
              <span class="text-text-muted text-[10px] uppercase font-bold tracking-wider">Cliente / Razón Social</span>
              <p class="text-text-base font-bold text-sm">{detailDispatch.cli_des || detailDispatch.co_cli}</p>
              <p class="text-xs font-mono text-text-muted">{detailDispatch.rif || detailDispatch.co_cli}</p>
            </div>
            <div class="space-y-1">
              <span class="text-text-muted text-[10px] uppercase font-bold tracking-wider">Factura Origen</span>
              <p class="text-text-base font-bold font-mono text-violet-400">{detailDispatch.factura_origen || (detailDispatch.renglones && detailDispatch.renglones[0]?.doc_num_factura) || "---"}</p>
            </div>
            <div class="space-y-1">
              <span class="text-text-muted text-[10px] uppercase font-bold tracking-wider">Fecha de Emisión</span>
              <p class="text-text-base font-bold text-sm">{dayjs(detailDispatch.fec_emis).format("DD/MM/YYYY")}</p>
            </div>
            {#if detailDispatch.despachador_name || detailDispatch.co_us_in}
              <div class="space-y-1">
                <span class="text-text-muted text-[10px] uppercase font-bold tracking-wider">Despachador</span>
                <p class="text-text-base font-bold text-sm text-brand-400 font-medium">{detailDispatch.despachador_name || detailDispatch.co_us_in}</p>
              </div>
            {/if}
            {#if detailDispatch.editor_name}
              <div class="space-y-1">
                <span class="text-text-muted text-[10px] uppercase font-bold tracking-wider">Editado por</span>
                <p class="text-text-base font-bold text-sm text-amber-400 font-medium">{detailDispatch.editor_name}</p>
              </div>
            {/if}
            <div class="space-y-1">
              <span class="text-text-muted text-[10px] uppercase font-bold tracking-wider">Total Unidades Despachadas</span>
              <p class="text-emerald-400 font-mono font-black text-lg">{formatQuantity(totalUnits)} un.</p>
            </div>
          </div>

          <!-- Renglones -->
          <div class="space-y-3">
            <h4 class="text-xs font-black uppercase tracking-wider text-text-muted">Artículos Despachados</h4>
            <div class="border border-border-subtle rounded-2xl overflow-hidden divide-y divide-border-subtle">
              {#each dispatchedRenglones as r}
                <div class="p-4 bg-surface-soft/40 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs hover:bg-surface-soft transition-colors">
                  <div class="space-y-1">
                    <div class="flex items-center gap-2">
                      <span class="font-mono font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded text-[10px]">
                        {r.co_art?.trim()}
                      </span>
                      {#if r.modelo}
                        <span class="text-[10px] text-text-muted bg-surface-strong px-2 py-0.5 rounded font-bold">
                          Mod: {r.modelo.trim()}
                        </span>
                      {/if}
                      {#if r.doc_num_factura || r.num_doc}
                        <span class="text-[10px] text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20 font-mono font-bold">
                          FACT: {(r.doc_num_factura || r.num_doc).trim()}
                        </span>
                      {/if}
                    </div>
                    <p class="font-black text-text-base">{r.art_des || r.des_art}</p>
                  </div>

                  <div class="flex items-center gap-6 text-right">
                    <div>
                      <span class="text-[9px] text-text-muted uppercase font-bold block">Cant. Despachada</span>
                      <span class="text-base font-black text-text-base font-mono">{r.cant_despachada || r.total_art} {r.unidad || r.co_uni || "UNI"}</span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>

          {#if detailDispatch.comentario}
            <div class="p-4 rounded-2xl bg-surface-soft border border-border-subtle space-y-1 text-xs">
              <span class="text-[10px] font-black uppercase text-text-muted tracking-wider">Observaciones</span>
              <p class="text-text-base font-medium">{detailDispatch.comentario}</p>
            </div>
          {/if}
        {/if}
      </div>

      <!-- Footer Modal -->
      <div class="p-6 border-t border-border-subtle flex items-center justify-between bg-surface-soft/50">
        <span class="text-xs text-text-muted">
          Registrado por: <strong class="text-text-base">{detailDispatch?.co_us_in || "---"}</strong>
        </span>
        {#if detailDispatch}
          <a
            href="/dashboard/warehouse/dispatches/{detailDispatch.doc_num}/print?branch_id={filterSede}"
            target="_blank"
            class="px-6 py-3 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-black transition-all flex items-center gap-2 shadow-lg shadow-brand-500/20 active:scale-95"
          >
            <Printer size={16} />
            Imprimir Comprobante
          </a>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- ========================================================================= -->
<!-- MODAL: CONFIRMAR ELIMINACIÓN -->
<!-- ========================================================================= -->
{#if showDeleteModal && dispatchToDelete}
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={() => !isDeleting && (showDeleteModal = false)}
      onkeydown={(e) => e.key === "Escape" && !isDeleting && (showDeleteModal = false)}
      role="button"
      tabindex="-1"
    ></div>

    <div
      class="bg-surface-raised w-full max-w-md rounded-[40px] border border-border-bold shadow-2xl relative z-10 overflow-hidden text-text-base"
      transition:slide
    >
      <div class="p-8 text-center space-y-6">
        <div
          class="h-20 w-20 rounded-3xl bg-red-500/20 text-red-500 flex items-center justify-center mx-auto shadow-lg shadow-red-500/10"
        >
          <Trash2 size={40} />
        </div>

        <div class="space-y-2">
          <h2 class="text-2xl font-black tracking-tight text-text-base">Confirmar Eliminación</h2>
          <p class="text-text-muted text-sm px-4">
            ¿Estás seguro de que deseas eliminar la nota de despacho
            <span class="text-text-base font-bold">{dispatchToDelete?.doc_num}</span>?
            Esta acción revertirá la salida de stock en inventario y restaurará el saldo pendiente de la factura de venta.
          </p>

          <div class="text-left p-4 rounded-2xl bg-surface-soft border border-border-subtle space-y-2 mt-4">
            <p class="text-xs text-text-muted">
              <span class="font-bold text-text-base">Cliente:</span> {dispatchToDelete.cli_des || dispatchToDelete.co_cli}
            </p>
            <p class="text-xs text-text-muted">
              <span class="font-bold text-text-base">Fecha:</span> {dayjs(dispatchToDelete.fec_emis).format('DD/MM/YYYY HH:mm')}
            </p>
            <p class="text-xs text-text-muted">
              <span class="font-bold text-text-base">Total Unidades:</span> {formatQuantity(dispatchToDelete.total_unidades || 0)} un.
            </p>
            <p class="text-xs text-text-muted flex items-center gap-2">
              <span class="font-bold text-text-base">Estatus:</span>
              <span class="px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest {dispatchToDelete.anulado ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20'}">
                {dispatchToDelete.anulado ? 'Anulado' : 'Completado'}
              </span>
            </p>
          </div>
        </div>

        <form
          method="POST"
          action="?/deleteDispatch"
          use:enhance={() => {
            isDeleting = true;
            return async ({ result, update }) => {
              await update();
              isDeleting = false;

              if (result.type === 'success') {
                showDeleteModal = false;
                toast.success((result as any).data?.message || 'Nota de despacho eliminada con éxito');
              } else if (result.type === 'failure' && (result as any).data?.message) {
                toast.error((result as any).data.message);
              } else {
                toast.error('Error al eliminar la nota de despacho');
              }
            };
          }}
          class="space-y-4 pt-4"
        >
          <input type="hidden" name="doc_num" value={dispatchToDelete?.doc_num} />
          <input type="hidden" name="branch_id" value={filterSede} />

          <div class="space-y-2 text-left">
            <label
              class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1"
              for="del-pass"
            >
              Contraseña de Confirmación
            </label>
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
                class="w-full h-14 bg-surface-base border border-border-bold rounded-2xl pl-12 pr-5 focus:border-red-500 outline-none transition-all text-text-base font-medium"
              />
            </div>
          </div>

          <div class="flex gap-3 pt-4">
            <button
              type="button"
              onclick={() => (showDeleteModal = false)}
              disabled={isDeleting}
              class="flex-1 h-14 rounded-2xl font-bold bg-surface-soft hover:bg-surface-strong transition-all text-text-muted hover:text-text-base border border-border-subtle cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isDeleting || !deletePassword}
              class="flex-1 h-14 rounded-2xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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

<!-- ========================================================================= -->
<!-- MODAL: CONFIRMAR ANULACIÓN -->
<!-- ========================================================================= -->
{#if showVoidModal && dispatchToVoid}
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={() => !isVoiding && (showVoidModal = false)}
      onkeydown={(e) => e.key === "Escape" && !isVoiding && (showVoidModal = false)}
      role="button"
      tabindex="-1"
    ></div>

    <div
      class="bg-surface-raised w-full max-w-md rounded-[40px] border border-border-bold shadow-2xl relative z-10 overflow-hidden text-text-base"
      transition:slide
    >
      <div class="p-8 text-center space-y-6">
        <div
          class="h-20 w-20 rounded-3xl bg-amber-500/20 text-amber-500 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10"
        >
          <Ban size={40} />
        </div>

        <div class="space-y-2">
          <h2 class="text-2xl font-black tracking-tight text-text-base">Confirmar Anulación</h2>
          <p class="text-text-muted text-sm px-4">
            ¿Estás seguro de que deseas anular la nota de despacho
            <span class="text-text-base font-bold">{dispatchToVoid?.doc_num}</span>?
            Esta acción no eliminará físicamente el documento, pero lo marcará como anulado, revertirá el inventario y restaurará los pendientes en la factura de venta.
          </p>

          <div class="text-left p-4 rounded-2xl bg-surface-soft border border-border-subtle space-y-2 mt-4">
            <p class="text-xs text-text-muted">
              <span class="font-bold text-text-base">Cliente:</span> {dispatchToVoid.cli_des || dispatchToVoid.co_cli}
            </p>
            <p class="text-xs text-text-muted">
              <span class="font-bold text-text-base">Fecha:</span> {dayjs(dispatchToVoid.fec_emis).format('DD/MM/YYYY HH:mm')}
            </p>
            <p class="text-xs text-text-muted">
              <span class="font-bold text-text-base">Total Unidades:</span> {formatQuantity(dispatchToVoid.total_unidades || 0)} un.
            </p>
            <p class="text-xs text-text-muted flex items-center gap-2">
              <span class="font-bold text-text-base">Estatus:</span>
              <span class="px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest {dispatchToVoid.anulado ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20'}">
                {dispatchToVoid.anulado ? 'Anulado' : 'Completado'}
              </span>
            </p>
          </div>
        </div>

        <form
          method="POST"
          action="?/voidDispatch"
          use:enhance={() => {
            isVoiding = true;
            return async ({ result, update }) => {
              await update();
              isVoiding = false;

              if (result.type === 'success') {
                showVoidModal = false;
                toast.success((result as any).data?.message || 'Nota de despacho anulada con éxito');
              } else if (result.type === 'failure' && (result as any).data?.message) {
                toast.error((result as any).data.message);
              } else {
                toast.error('Error al anular la nota de despacho');
              }
            };
          }}
          class="space-y-4 pt-4"
        >
          <input type="hidden" name="doc_num" value={dispatchToVoid?.doc_num} />
          <input type="hidden" name="branch_id" value={filterSede} />

          <div class="space-y-2 text-left">
            <label
              class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1"
              for="void-reason"
            >
              Motivo de Anulación
            </label>
            <input
              id="void-reason"
              type="text"
              name="reason"
              bind:value={voidReason}
              placeholder="Ej. Error en entrega o mercancía devuelta"
              class="w-full h-14 bg-surface-base border border-border-bold rounded-2xl px-5 focus:border-amber-500 outline-none transition-all text-text-base font-medium text-xs"
            />
          </div>

          <div class="space-y-2 text-left">
            <label
              class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1"
              for="void-pass"
            >
              Contraseña de Confirmación
            </label>
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
                class="w-full h-14 bg-surface-base border border-border-bold rounded-2xl pl-12 pr-5 focus:border-amber-500 outline-none transition-all text-text-base font-medium"
              />
            </div>
          </div>

          <div class="flex gap-3 pt-4">
            <button
              type="button"
              onclick={() => (showVoidModal = false)}
              disabled={isVoiding}
              class="flex-1 h-14 rounded-2xl font-bold bg-surface-soft hover:bg-surface-strong transition-all text-text-muted hover:text-text-base border border-border-subtle cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isVoiding || !voidPassword}
              class="flex-1 h-14 rounded-2xl font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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
