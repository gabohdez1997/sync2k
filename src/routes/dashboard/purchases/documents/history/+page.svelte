<!-- src/routes/dashboard/purchases/documents/history/+page.svelte -->
<script lang="ts">
  import { fade, slide } from "svelte/transition";
  import {
    Store,
    FileText,
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
    X,
    Trash2,
    Printer,
    Pen,
    ArrowUpDown,
    ArrowUp,
    ArrowDown
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

  function formatNumber(val: number | string) {
    return Number(val || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function getEffectiveRate(doc: any) {
    const docRate = Number(doc?.tasa || 0);
    if (docRate > 1) return docRate;
    const refRate = Number(doc?.tasa_actual || data.activeRate || 1);
    return refRate > 0 ? refRate : 1;
  }

  function getTipoBadgeClasses(tipo: string) {
    const t = String(tipo || "").trim().toUpperCase();
    if (t === "FACT") return "bg-brand-500/10 text-brand-500 border-brand-500/20";
    if (t === "N/CR") return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    if (t === "N/DB") return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    if (t === "IVAN" || t === "ISLR") return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    return "bg-surface-soft text-text-muted border-border-subtle";
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
  let deletePassword = $state("");
  let isDeleting = $state(false);

  // Detail Modal State
  let showDetailModal = $state(false);
  let isLoadingDetail = $state(false);
  let selectedDocDetail = $state<any>(null);

  // Filtros locales
  let filterSearch = $state("");
  let filterSede = $state("");
  let filterTipo = $state("");
  let filterFecD = $state("");
  let filterFecH = $state("");

  $effect(() => {
    filterSearch = data.filters?.search || "";
    filterSede = data.selectedBranchId || "";
    filterTipo = data.filters?.co_tipo_doc || "";
    filterFecD = data.filters?.fec_d || "";
    filterFecH = data.filters?.fec_h || "";
  });

  // Estado de Ordenamiento (del lado servidor)
  let sortBy = $derived(data.filters?.order_by || "fec_emis");
  let sortAsc = $derived((data.filters?.order_dir || "DESC").toUpperCase() === "ASC");

  function toggleSort(col: string) {
    const params = new URLSearchParams($page.url.searchParams);
    const currentOrder = data.filters?.order_by || "fec_emis";
    const currentDir = (data.filters?.order_dir || "DESC").toUpperCase();

    let nextDir = "DESC";
    if (currentOrder === col) {
      nextDir = currentDir === "ASC" ? "DESC" : "ASC";
    } else {
      nextDir = ["proveedor", "nro_doc", "doc_num", "registrado", "estatus"].includes(col) ? "ASC" : "DESC";
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
    deletePassword = "";
    showDeleteModal = true;
  }

  function handleEditDocument(doc: any) {
    const tipo = String(doc.co_tipo_doc || "").trim().toUpperCase();
    const docOrig = String(doc.doc_orig || "").trim().toUpperCase();
    if (docOrig === "FACT") {
      toast.error(`Este documento proviene de la Factura de Compra ${doc.nro_orig || ""}. Edítelo desde Facturas de Compra.`);
      return;
    }
    if (docOrig === "PAGO" || ["IVAN", "ISLR"].includes(tipo)) {
      toast.error("Este documento fue generado automáticamente por una retención o pago. Adminístrelo desde Pagos a Proveedores.");
      return;
    }
    if (Number(doc.pagos_asociados || 0) > 0) {
      toast.error("No se puede editar el documento porque tiene pagos activos asociados.");
      return;
    }
    const branchId = doc.sede_id || filterSede || data.selectedBranchId;
    goto(
      `/dashboard/purchases/documents?edit_tipo=${encodeURIComponent(tipo)}&edit_nro=${encodeURIComponent(String(doc.nro_doc || "").trim())}&branch_id=${encodeURIComponent(branchId)}`
    );
  }

  async function openDetailModal(doc: any) {
    showDetailModal = true;
    isLoadingDetail = true;
    selectedDocDetail = null;

    try {
      const branchId = doc.sede_id || data.selectedBranchId;
      const res = await fetch(
        `/api/agent/documentos-compra/${encodeURIComponent(String(doc.co_tipo_doc || "").trim())}/${encodeURIComponent(String(doc.nro_doc || "").trim())}?branch_id=${encodeURIComponent(branchId)}`
      );
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
        Consulta, edición, reimpresión, anulación y eliminación de documentos de compra.
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

  <!-- SEARCH & FILTERS -->
  <div class="glass p-4 rounded-3xl border border-border-subtle shadow-2xl grid grid-cols-1 md:grid-cols-5 gap-4 items-center mb-6 w-full relative z-20">
    <!-- Branch Selector -->
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

    <!-- Search Input -->
    <div class="w-full {!(data.branches && data.branches.length > 1) ? 'md:col-span-2' : ''}">
      <SearchBar
        bind:value={filterSearch}
        isSearching={isSearching}
        onsubmit={applyFilters}
        placeholder="Buscar por N° Factura, N° Doc, proveedor o RIF..."
        className="w-full h-12"
      />
    </div>

    <!-- Tipo de Documento -->
    <div class="w-full">
      <select
        bind:value={filterTipo}
        onchange={applyFilters}
        class="w-full h-12 px-4 bg-surface-soft border border-border-subtle rounded-2xl text-xs font-bold text-text-base focus:border-brand-500 outline-none transition-all cursor-pointer"
        title="Filtrar por Tipo de Documento"
      >
        <option value="">Todos los Tipos</option>
        <option value="FACT">FACT - Facturas</option>
        <option value="N/CR">N/CR - Notas de Crédito</option>
        <option value="N/DB">N/DB - Notas de Débito</option>
        <option value="IVAN">IVAN - Retención IVA</option>
        <option value="ISLR">ISLR - Retención ISLR</option>
        <option value="AJNM">AJNM - Ajuste Negativo</option>
        <option value="ADEL">ADEL - Adelantos</option>
      </select>
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

  <!-- DOCUMENT LIST TABLE -->
  <div class="bg-surface-raised/50 backdrop-blur-md rounded-[32px] border border-border-subtle shadow-2xl overflow-hidden min-h-[400px]">
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-surface-soft/50 border-b border-border-subtle text-xs font-black uppercase tracking-[0.1em] text-text-muted">
            <!-- Fecha Emisión -->
            <th class="px-6 py-5">
              <button
                type="button"
                onclick={() => toggleSort("fec_emis")}
                class="inline-flex items-center gap-1.5 hover:text-text-base transition-colors group/th cursor-pointer select-none"
                title="Ordenar por Fecha de Emisión"
              >
                <span>Fecha Emisión</span>
                {#if sortBy === 'fec_emis'}
                  {#if sortAsc}
                    <ArrowUp size={13} class="text-brand-500 shrink-0" />
                  {:else}
                    <ArrowDown size={13} class="text-brand-500 shrink-0" />
                  {/if}
                {:else}
                  <ArrowUpDown size={13} class="opacity-30 group-hover/th:opacity-70 transition-opacity shrink-0" />
                {/if}
              </button>
            </th>

            <!-- N° Doc / Fiscal -->
            <th class="px-6 py-5">
              <button
                type="button"
                onclick={() => toggleSort("nro_doc")}
                class="inline-flex items-center gap-1.5 hover:text-text-base transition-colors group/th cursor-pointer select-none"
                title="Ordenar por Número de Documento"
              >
                <span>N° Doc / Fiscal</span>
                {#if sortBy === 'nro_doc' || sortBy === 'doc_num'}
                  {#if sortAsc}
                    <ArrowUp size={13} class="text-brand-500 shrink-0" />
                  {:else}
                    <ArrowDown size={13} class="text-brand-500 shrink-0" />
                  {/if}
                {:else}
                  <ArrowUpDown size={13} class="opacity-30 group-hover/th:opacity-70 transition-opacity shrink-0" />
                {/if}
              </button>
            </th>

            <!-- Proveedor -->
            <th class="px-6 py-5">
              <button
                type="button"
                onclick={() => toggleSort("proveedor")}
                class="inline-flex items-center gap-1.5 hover:text-text-base transition-colors group/th cursor-pointer select-none"
                title="Ordenar por Proveedor"
              >
                <span>Proveedor</span>
                {#if sortBy === 'proveedor' || sortBy === 'prov_des'}
                  {#if sortAsc}
                    <ArrowUp size={13} class="text-brand-500 shrink-0" />
                  {:else}
                    <ArrowDown size={13} class="text-brand-500 shrink-0" />
                  {/if}
                {:else}
                  <ArrowUpDown size={13} class="opacity-30 group-hover/th:opacity-70 transition-opacity shrink-0" />
                {/if}
              </button>
            </th>

            <!-- Monto Total -->
            <th class="px-6 py-5 text-right">
              <button
                type="button"
                onclick={() => toggleSort("monto")}
                class="inline-flex items-center justify-end gap-1.5 w-full hover:text-text-base transition-colors group/th cursor-pointer select-none"
                title="Ordenar por Monto Total"
              >
                <span>Monto Total</span>
                {#if sortBy === 'monto' || sortBy === 'total_neto'}
                  {#if sortAsc}
                    <ArrowUp size={13} class="text-brand-500 shrink-0" />
                  {:else}
                    <ArrowDown size={13} class="text-brand-500 shrink-0" />
                  {/if}
                {:else}
                  <ArrowUpDown size={13} class="opacity-30 group-hover/th:opacity-70 transition-opacity shrink-0" />
                {/if}
              </button>
            </th>

            <!-- Saldo CxP -->
            <th class="px-6 py-5 text-right">
              <button
                type="button"
                onclick={() => toggleSort("saldo")}
                class="inline-flex items-center justify-end gap-1.5 w-full hover:text-text-base transition-colors group/th cursor-pointer select-none"
                title="Ordenar por Saldo CxP"
              >
                <span>Saldo CxP</span>
                {#if sortBy === 'saldo'}
                  {#if sortAsc}
                    <ArrowUp size={13} class="text-brand-500 shrink-0" />
                  {:else}
                    <ArrowDown size={13} class="text-brand-500 shrink-0" />
                  {/if}
                {:else}
                  <ArrowUpDown size={13} class="opacity-30 group-hover/th:opacity-70 transition-opacity shrink-0" />
                {/if}
              </button>
            </th>

            <!-- Registrado Por -->
            {#if data.canSeeOthers}
              <th class="px-6 py-5 text-center">
                <button
                  type="button"
                  onclick={() => toggleSort("registrado")}
                  class="inline-flex items-center justify-center gap-1.5 w-full hover:text-text-base transition-colors group/th cursor-pointer select-none"
                  title="Ordenar por Registrado Por"
                >
                  <span>Registrado Por</span>
                  {#if sortBy === 'registrado' || sortBy === 'co_us_in'}
                    {#if sortAsc}
                      <ArrowUp size={13} class="text-brand-500 shrink-0" />
                    {:else}
                      <ArrowDown size={13} class="text-brand-500 shrink-0" />
                    {/if}
                  {:else}
                    <ArrowUpDown size={13} class="opacity-30 group-hover/th:opacity-70 transition-opacity shrink-0" />
                  {/if}
                </button>
              </th>
            {/if}

            <!-- Estatus -->
            <th class="px-6 py-5 text-center">
              <button
                type="button"
                onclick={() => toggleSort("estatus")}
                class="inline-flex items-center justify-center gap-1.5 w-full hover:text-text-base transition-colors group/th cursor-pointer select-none"
                title="Ordenar por Estatus"
              >
                <span>Estatus</span>
                {#if sortBy === 'estatus'}
                  {#if sortAsc}
                    <ArrowUp size={13} class="text-brand-500 shrink-0" />
                  {:else}
                    <ArrowDown size={13} class="text-brand-500 shrink-0" />
                  {/if}
                {:else}
                  <ArrowUpDown size={13} class="opacity-30 group-hover/th:opacity-70 transition-opacity shrink-0" />
                {/if}
              </button>
            </th>

            <!-- Acciones -->
            <th class="px-6 py-5 text-center text-xs font-black uppercase tracking-[0.1em] text-text-muted">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle/30">
          {#if !data.documents || data.documents.length === 0}
            <tr>
              <td colspan={data.canSeeOthers ? 8 : 7} class="px-6 py-32 text-center">
                <FileText size={48} class="mx-auto text-text-muted/20 mb-4" />
                <p class="text-text-muted font-bold text-base">No se encontraron documentos de compra</p>
                <button
                  onclick={() => {
                    filterSearch = "";
                    filterTipo = "";
                    filterFecD = "";
                    filterFecH = "";
                    applyFilters();
                  }}
                  class="mt-2 text-brand-500 hover:underline text-xs font-bold cursor-pointer"
                >
                  Limpiar filtros
                </button>
              </td>
            </tr>
          {:else}
            {#each data.documents as doc}
              {@const effRate = getEffectiveRate(doc)}
              <tr class="hover:bg-brand-500/5 transition-colors group text-xs">
                <!-- Fecha Emisión -->
                <td class="px-6 py-5">
                  <div class="font-bold text-text-base">
                    {formatDate(doc.fec_emis)}
                  </div>
                  <div class="text-[10px] text-text-muted/60 mt-0.5">
                    Vence: {formatDate(doc.fec_venc)}
                  </div>
                </td>

                <!-- Document Number and Fiscal Invoice Number -->
                <td class="px-6 py-5">
                  <div class="flex flex-col gap-1 items-start">
                    <span
                      class="px-2.5 py-1 rounded-lg bg-surface-soft border border-border-subtle text-xs font-black text-brand-500 group-hover:bg-brand-500 group-hover:border-brand-500 group-hover:text-white transition-all"
                    >
                      {doc.nro_doc}
                    </span>
                    <div class="flex flex-wrap items-center gap-1">
                      <span class={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${getTipoBadgeClasses(doc.co_tipo_doc)}`}>
                        {doc.co_tipo_doc}
                      </span>
                      {#if doc.nro_fact}
                        <span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          Fact: {doc.nro_fact}
                        </span>
                      {/if}
                      {#if doc.n_control && doc.n_control !== "N/A" && doc.n_control.trim() !== ""}
                        <span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Ctrl: {doc.n_control}
                        </span>
                      {/if}
                    </div>
                  </div>
                </td>

                <!-- Proveedor -->
                <td class="px-6 py-5">
                  <div class="flex flex-col max-w-[240px]">
                    <span class="font-bold text-text-base truncate uppercase">{doc.prov_des || "PROVEEDOR GENERAL"}</span>
                    <span class="text-[10px] text-text-muted font-mono">{doc.rif || doc.co_prov}</span>
                  </div>
                </td>

                <!-- Monto Total -->
                <td class="px-6 py-5 text-right font-bold">
                  <div class="text-sm font-black text-text-base">
                    <span class="text-text-muted text-[10px] font-medium mr-1">USD</span>
                    {formatNumber(Number(doc.total_neto || 0) / effRate)}
                  </div>
                  <div class="text-[10px] text-text-muted/70 mt-0.5">
                    <span>Bs. </span>
                    {formatNumber(doc.total_neto)}
                  </div>
                </td>

                <!-- Saldo CxP -->
                <td class="px-6 py-5 text-right font-bold">
                  {#if doc.anulado}
                    <span class="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-black uppercase tracking-wider">
                      Anulado
                    </span>
                  {:else if Number(doc.saldo ?? 0) <= 0.001}
                    <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-wider">
                      Pagado
                    </span>
                  {:else}
                    <div class="text-xs font-black text-amber-400">
                      <span class="text-amber-400/70 text-[10px] font-medium mr-1">USD</span>
                      {formatNumber(Number(doc.saldo || 0) / effRate)}
                    </div>
                    <div class="text-[10px] text-amber-400/70 font-semibold mt-0.5">
                      <span>Bs. </span>
                      {formatNumber(doc.saldo)}
                    </div>
                  {/if}
                </td>

                <!-- Usuario Creador -->
                {#if data.canSeeOthers}
                  <td class="px-6 py-5 text-center">
                    <span class="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase tracking-wider">
                      {doc.user_name || doc.co_us_in || "---"}
                    </span>
                  </td>
                {/if}

                <!-- Estatus Badge -->
                <td class="px-6 py-5 text-center">
                  {#if doc.anulado}
                    <span class="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-black uppercase">
                      Anulado
                    </span>
                  {:else}
                    <span class="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase">
                      Activo
                    </span>
                  {/if}
                </td>

                <!-- Actions -->
                <td class="px-6 py-5">
                  <div class="flex items-center justify-center gap-2">
                    <!-- Ver Detalle -->
                    <button
                      type="button"
                      onclick={() => openDetailModal(doc)}
                      class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                      title="Ver Detalle del Documento"
                    >
                      <Eye size={18} />
                    </button>

                    <!-- Emitir / Imprimir PDF -->
                    <a
                      href="/dashboard/purchases/documents/{encodeURIComponent(String(doc.co_tipo_doc || '').trim())}/{encodeURIComponent(String(doc.nro_doc || '').trim())}/print?branch_id={encodeURIComponent(doc.sede_id || filterSede || data.selectedBranchId)}"
                      target="_blank"
                      class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                      title="Emitir / Imprimir PDF"
                    >
                      <Printer size={18} />
                    </a>

                    <!-- Editar -->
                    {#if !doc.anulado && data.canEdit}
                      <button
                        type="button"
                        onclick={() => handleEditDocument(doc)}
                        class="p-2 text-text-muted hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                        title="Editar Documento de Compra"
                      >
                        <Pen size={18} />
                      </button>
                    {/if}

                    <!-- Anular -->
                    {#if !doc.anulado && data.canVoid}
                      <button
                        type="button"
                        onclick={() => openVoidModal(doc)}
                        class="p-2 text-text-muted hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                        title="Anular Documento de Compra"
                      >
                        <Ban size={18} />
                      </button>
                    {/if}

                    <!-- Eliminar -->
                    {#if data.canDelete}
                      <button
                        type="button"
                        onclick={() => openDeleteModal(doc)}
                        class="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                        title="Eliminar Documento de Compra"
                      >
                        <Trash2 size={18} />
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

    <!-- PAGINATION -->
    {#if data.pagination && data.pagination.pages > 1}
      <div class="p-4 border-t border-border-subtle flex items-center justify-between">
        <div class="text-xs text-text-muted font-medium">
          Página {data.pagination.currentPage} de {data.pagination.pages} ({data.pagination.total} documentos en total)
        </div>
        <div class="flex items-center gap-2">
          <button
            disabled={data.pagination.currentPage <= 1}
            onclick={() => changePage(data.pagination.currentPage - 1)}
            class="p-2 rounded-xl bg-surface-soft border border-border-subtle text-text-base disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            disabled={data.pagination.currentPage >= data.pagination.pages}
            onclick={() => changePage(data.pagination.currentPage + 1)}
            class="p-2 rounded-xl bg-surface-soft border border-border-subtle text-text-base disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- DOCUMENT DETAIL MODAL -->
{#if showDetailModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" in:fade>
    <div
      class="fixed inset-0"
      onclick={() => (showDetailModal = false)}
      onkeydown={(e) => e.key === "Escape" && (showDetailModal = false)}
      role="button"
      tabindex="-1"
    ></div>
    <div class="bg-surface-raised border border-border-bold text-text-base rounded-[32px] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative z-10" in:slide>
      <!-- Modal Header -->
      <div class="p-6 border-b border-border-subtle bg-surface-soft/40 flex items-center justify-between">
        <div>
          <h3 class="text-lg font-black text-text-base flex items-center gap-2">
            <FileSpreadsheet size={20} class="text-brand-500" />
            Detalle de Documento de Compra
          </h3>
          {#if selectedDocDetail}
            <p class="text-xs text-text-muted mt-0.5">
              <span class="font-bold text-brand-500">{selectedDocDetail.co_tipo_doc}</span> N° <span class="font-mono text-brand-500 font-bold">{selectedDocDetail.nro_doc}</span>
              {#if selectedDocDetail.nro_fact}
                &bull; Fiscal N° <span class="font-mono text-text-base font-bold">{selectedDocDetail.nro_fact}</span>
              {/if}
              {#if selectedDocDetail.n_control && selectedDocDetail.n_control !== 'N/A'}
                &bull; Control N° <span class="font-mono text-text-base font-bold">{selectedDocDetail.n_control}</span>
              {/if}
            </p>
          {/if}
        </div>
        <div class="flex items-center gap-2">
          {#if selectedDocDetail}
            <a
              href="/dashboard/purchases/documents/{encodeURIComponent(String(selectedDocDetail.co_tipo_doc || '').trim())}/{encodeURIComponent(String(selectedDocDetail.nro_doc || '').trim())}/print?branch_id={encodeURIComponent(selectedDocDetail.sede_id || filterSede || data.selectedBranchId)}"
              target="_blank"
              class="h-9 px-3.5 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-500 font-bold text-xs flex items-center gap-1.5 transition-colors border border-brand-500/20"
              title="Imprimir PDF"
            >
              <Printer size={15} />
              Imprimir PDF
            </a>
          {/if}
          <button
            type="button"
            onclick={() => (showDetailModal = false)}
            class="h-9 w-9 rounded-xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <!-- Modal Body -->
      <div class="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
        {#if isLoadingDetail}
          <div class="py-16 flex flex-col items-center justify-center gap-3 text-text-muted">
            <Loader2 size={32} class="animate-spin text-brand-500" />
            <p class="font-bold">Cargando detalle del documento...</p>
          </div>
        {:else if selectedDocDetail}
          {@const detailRate = getEffectiveRate(selectedDocDetail)}
          {@const detailBruto = Number(selectedDocDetail.total_bruto || 0)}
          {@const detailDesc = Number(selectedDocDetail.monto_desc_glob || 0)}
          {@const detailReca = Number(selectedDocDetail.monto_reca || 0)}
          {@const detailSinImp = Math.max(0, detailBruto - detailDesc + detailReca)}
          {@const detailExento = Number(selectedDocDetail.monto_exento || 0)}
          {@const detailImp = Number(selectedDocDetail.monto_imp || 0)}
          {@const detailOtros = Number(selectedDocDetail.otros || 0)}
          {@const detailNeto = Number(selectedDocDetail.total_neto || 0)}
          {@const detailSaldo = Number(selectedDocDetail.saldo || 0)}

          <!-- Top Info Cards -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-surface-soft p-4 rounded-2xl border border-border-subtle space-y-1">
              <span class="text-[9px] font-black uppercase text-text-muted">Proveedor</span>
              <p class="font-black text-sm text-text-base uppercase">{selectedDocDetail.prov_des}</p>
              <p class="text-text-muted font-mono">{selectedDocDetail.rif || selectedDocDetail.co_prov}</p>
            </div>
            <div class="bg-surface-soft p-4 rounded-2xl border border-border-subtle space-y-1">
              <span class="text-[9px] font-black uppercase text-text-muted">Fechas</span>
              <p class="font-bold text-text-base">Emisión: {formatDate(selectedDocDetail.fec_emis)}</p>
              <p class="text-text-muted">Vence: {formatDate(selectedDocDetail.fec_venc)}</p>
            </div>
            <div class="bg-surface-soft p-4 rounded-2xl border border-border-subtle space-y-1">
              <span class="text-[9px] font-black uppercase text-text-muted">Cuenta & Tasa</span>
              <p class="font-bold text-text-base truncate" title={selectedDocDetail.des_cta_ingr_egr || ""}>
                {selectedDocDetail.des_cta_ingr_egr || selectedDocDetail.co_cta_ingr_egr || "Cuenta por Defecto"}
              </p>
              <p class="text-brand-500 font-mono font-bold">
                Moneda: {selectedDocDetail.co_mone || "BS"} • Tasa: {Number(selectedDocDetail.tasa || 1).toFixed(2)} Bs/$
              </p>
            </div>
          </div>

          {#if selectedDocDetail.observa}
            <div class="bg-surface-soft p-4 rounded-2xl border border-border-subtle space-y-1">
              <span class="text-[9px] font-black uppercase text-text-muted">Concepto / Observaciones</span>
              <p class="font-semibold text-text-base uppercase">{selectedDocDetail.observa}</p>
            </div>
          {/if}

          <!-- Associated Payments Table -->
          {#if selectedDocDetail.pagos && selectedDocDetail.pagos.length > 0}
            <div class="border border-border-subtle rounded-2xl overflow-hidden">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-surface-soft border-b border-border-subtle text-[10px] font-black uppercase tracking-wider text-text-muted">
                    <th class="px-4 py-2.5">Pago N°</th>
                    <th class="px-4 py-2.5">Fecha</th>
                    <th class="px-4 py-2.5">Descripción</th>
                    <th class="px-4 py-2.5 text-center">Estatus</th>
                    <th class="px-4 py-2.5 text-right">Monto Aplicado</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle text-xs">
                  {#each selectedDocDetail.pagos as p}
                    <tr class="hover:bg-surface-soft/40 transition-colors">
                      <td class="px-4 py-2.5 font-mono font-bold text-brand-500">{p.cob_num}</td>
                      <td class="px-4 py-2.5">{formatDate(p.fec_cob)}</td>
                      <td class="px-4 py-2.5 font-medium text-text-base">{p.descrip || "Pago / Retención"}</td>
                      <td class="px-4 py-2.5 text-center">
                        <span class={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${p.anulado ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {p.anulado ? "Anulado" : "Activo"}
                        </span>
                      </td>
                      <td class="px-4 py-2.5 text-right font-mono font-bold text-text-base">
                        Bs. {formatNumber(p.mont_cob)}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}

          <!-- Totals Breakdown -->
          <div class="flex justify-end">
            <div class="w-80 bg-surface-soft p-4 rounded-2xl border border-border-subtle space-y-2 text-xs">
              <div class="flex justify-between text-text-muted font-bold">
                <span>Monto Bruto:</span>
                <span class="font-mono text-text-base">Bs. {formatNumber(detailBruto)}</span>
              </div>
              {#if detailDesc > 0}
                <div class="flex justify-between text-text-muted font-bold">
                  <span>Descuento ({selectedDocDetail.porc_desc_glob || 0}%):</span>
                  <span class="font-mono text-emerald-400">- Bs. {formatNumber(detailDesc)}</span>
                </div>
              {/if}
              {#if detailReca > 0}
                <div class="flex justify-between text-text-muted font-bold">
                  <span>Recargo ({selectedDocDetail.porc_reca || 0}%):</span>
                  <span class="font-mono text-amber-400">+ Bs. {formatNumber(detailReca)}</span>
                </div>
              {/if}
              {#if detailDesc > 0 || detailReca > 0}
                <div class="flex justify-between text-text-muted font-bold">
                  <span>Total sin Impuesto:</span>
                  <span class="font-mono text-text-base">Bs. {formatNumber(detailSinImp)}</span>
                </div>
              {/if}
              {#if detailExento > 0}
                <div class="flex justify-between text-text-muted font-bold">
                  <span>Monto Exento:</span>
                  <span class="font-mono text-text-base">Bs. {formatNumber(detailExento)}</span>
                </div>
              {/if}
              <div class="flex justify-between text-text-muted font-bold">
                <span>I.V.A ({Number(selectedDocDetail.porc_imp || 0).toFixed(0)}%):</span>
                <span class="font-mono text-brand-500 font-bold">Bs. {formatNumber(detailImp)}</span>
              </div>
              {#if detailOtros > 0}
                <div class="flex justify-between text-text-muted font-bold">
                  <span>Otros (IGTF / Cargos):</span>
                  <span class="font-mono text-text-base">Bs. {formatNumber(detailOtros)}</span>
                </div>
              {/if}
              <div class="border-t border-border-subtle pt-2 flex justify-between font-black text-sm">
                <span>Total Neto:</span>
                <span class="font-mono text-brand-500"><span class="text-brand-500/70 text-xs font-medium mr-1">USD</span>{formatNumber(detailNeto / detailRate)}</span>
              </div>
              <div class="flex justify-between text-[11px] text-text-muted font-mono">
                <span>Saldo: <strong class={detailSaldo > 0.001 ? "text-amber-400" : "text-emerald-400"}>Bs. {formatNumber(detailSaldo)}</strong></span>
                <span>Bs. {formatNumber(detailNeto)}</span>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- VOID CONFIRMATION MODAL -->
{#if showVoidModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
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
        <div class="h-20 w-20 rounded-3xl bg-amber-500/20 text-amber-500 mx-auto flex items-center justify-center shadow-lg shadow-amber-500/10">
          <Ban size={40} />
        </div>

        <div class="space-y-2">
          <h2 class="text-2xl font-black tracking-tight text-text-base">Confirmar Anulación</h2>
          <p class="text-text-muted text-sm px-4">
            ¿Estás seguro de que deseas anular el documento
            <span class="text-text-base font-bold font-mono">{docToVoid?.co_tipo_doc} {docToVoid?.nro_doc}</span>
            {#if docToVoid?.nro_fact}
              (Fiscal N°: <span class="text-text-base font-bold font-mono">{docToVoid?.nro_fact}</span>)
            {/if}?
            Esta acción dejará sin efecto el documento en Cuentas por Pagar.
          </p>
        </div>

        <form
          method="POST"
          action="?/voidDocument"
          use:enhance={() => {
            isVoiding = true;
            return async ({ result, update }) => {
              await update();
              isVoiding = false;

              if (result.type === "success") {
                showVoidModal = false;
                toast.success((result as any).data?.message || "Documento de compra anulado con éxito.");
              } else if (result.type === "failure" && (result as any).data?.message) {
                toast.error((result as any).data.message);
              } else {
                toast.error("Error al anular el documento de compra.");
              }
            };
          }}
          class="space-y-4 pt-4 text-left"
        >
          <input type="hidden" name="co_tipo_doc" value={docToVoid?.co_tipo_doc} />
          <input type="hidden" name="nro_doc" value={docToVoid?.nro_doc} />
          <input type="hidden" name="branch_id" value={data.selectedBranchId} />

          <div class="space-y-2 text-left">
            <label for="void-pass" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">
              Contraseña de Confirmación
            </label>
            <div class="relative">
              <Lock size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" />
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
                Anular Documento
              {/if}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

<!-- DELETE CONFIRMATION MODAL -->
{#if showDeleteModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={() => !isDeleting && (showDeleteModal = false)}
      onkeydown={(e) => e.key === "Escape" && !isDeleting && (showDeleteModal = false)}
      role="button"
      tabindex="-1"
    ></div>

    <div
      class="bg-surface-raised w-full max-w-md rounded-[40px] border border-red-500/20 shadow-2xl relative z-10 overflow-hidden text-text-base"
      transition:slide
    >
      <div class="p-8 text-center space-y-6">
        <div class="h-20 w-20 rounded-3xl bg-red-500/20 text-red-500 mx-auto flex items-center justify-center shadow-lg shadow-red-500/10">
          <Trash2 size={40} />
        </div>

        <div class="space-y-2">
          <h2 class="text-2xl font-black tracking-tight text-text-base">Confirmar Eliminación</h2>
          <p class="text-text-muted text-sm px-4">
            ¿Estás seguro de que deseas eliminar permanentemente el documento
            <span class="text-text-base font-bold font-mono">{docToDelete?.co_tipo_doc} {docToDelete?.nro_doc}</span>
            {#if docToDelete?.nro_fact}
              (Fiscal N°: <span class="text-text-base font-bold font-mono">{docToDelete?.nro_fact}</span>)
            {/if}?
            Esta acción eliminará el registro directamente de Profit Plus (Cuentas por Pagar).
          </p>
        </div>

        <form
          method="POST"
          action="?/deleteDocument"
          use:enhance={() => {
            isDeleting = true;
            return async ({ result, update }) => {
              await update();
              isDeleting = false;

              if (result.type === "success") {
                showDeleteModal = false;
                if (showDetailModal) showDetailModal = false;
                toast.success((result as any).data?.message || "Documento de compra eliminado con éxito.");
              } else if (result.type === "failure" && (result as any).data?.message) {
                toast.error((result as any).data.message);
              } else {
                toast.error("Error al eliminar el documento de compra.");
              }
            };
          }}
          class="space-y-4 pt-4 text-left"
        >
          <input type="hidden" name="co_tipo_doc" value={docToDelete?.co_tipo_doc} />
          <input type="hidden" name="nro_doc" value={docToDelete?.nro_doc} />
          <input type="hidden" name="branch_id" value={data.selectedBranchId} />

          <div class="space-y-2 text-left">
            <label for="del-pass" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">
              Contraseña de Confirmación
            </label>
            <div class="relative">
              <Lock size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" />
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
                <Trash2 size={18} />
                Eliminar
              {/if}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}
