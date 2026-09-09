<!-- src/routes/dashboard/purchases/invoices/history/+page.svelte -->
<script lang="ts">
  import { fade, slide } from "svelte/transition";
  import {
    Clock,
    Store,
    FileText,
    Lock,
    Loader2,
    Check,
    Ban,
    ChevronLeft,
    ChevronRight,
    AlertCircle,
    Plus,
    Eye,
    Truck,
    Building2,
    Calendar,
    X,
    Receipt
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

  let isSearching = $state(false);
  let showVoidModal = $state(false);
  let invoiceToVoid = $state<any>(null);
  let voidPassword = $state("");
  let isVoiding = $state(false);

  // Detail Modal State
  let showDetailModal = $state(false);
  let isLoadingDetail = $state(false);
  let selectedInvoiceDetail = $state<any>(null);

  // Filtros locales
  let filterSearch = $state("");
  let filterSede = $state("");
  let filterFecD = $state("");
  let filterFecH = $state("");

  $effect(() => {
    filterSearch = data.filters?.search || "";
    filterSede = data.selectedBranchId || "";
    filterFecD = data.filters?.fec_d || "";
    filterFecH = data.filters?.fec_h || "";
  });

  function applyFilters() {
    const params = new URLSearchParams($page.url.searchParams);
    if (filterSearch) params.set("search", filterSearch);
    else params.delete("search");
    if (filterSede) params.set("branch_id", filterSede);
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

  function openVoidModal(invoice: any) {
    invoiceToVoid = invoice;
    voidPassword = "";
    showVoidModal = true;
  }

  async function openDetailModal(invoice: any) {
    showDetailModal = true;
    isLoadingDetail = true;
    selectedInvoiceDetail = null;

    try {
      const res = await fetch(`/api/agent/facturas-compras/${invoice.doc_num.trim()}?branch_id=${data.selectedBranchId}`);
      const result = await res.json();
      if (result.success && result.data && result.data.length > 0) {
        selectedInvoiceDetail = result.data[0];
      } else {
        toast.error(result.message || "No se pudo cargar el detalle de la factura.");
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
        <Receipt size={40} class="text-brand-500" />
        Historial Facturas de Compras
      </h1>
      <p class="text-text-muted text-base">
        Consulta, reimpresión y anulación de facturas de compras.
      </p>
    </div>

    {#if data.canCreate}
      <div class="flex items-center gap-3 shrink-0">
        <button
          onclick={() => {
            const params = new URLSearchParams();
            if (filterSede) params.set("branch_id", filterSede);
            goto(`/dashboard/purchases/invoices?${params.toString()}`);
          }}
          class="flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-500 text-white h-14 px-8 rounded-2xl font-black shadow-xl shadow-brand-500/20 transition-all active:scale-95 shrink-0 w-full md:w-auto cursor-pointer"
        >
          <Plus size={20} />
          Nueva Factura
        </button>
      </div>
    {/if}
  </div>

  <!-- SEARCH & FILTERS -->
  <div class="glass p-4 rounded-3xl border border-border-subtle shadow-2xl grid grid-cols-1 md:grid-cols-4 gap-4 items-center mb-6 w-full relative z-20">
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
        placeholder="Buscar por N° Factura, proveedor o RIF..."
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

  <!-- INVOICE LIST TABLE -->
  <div class="bg-surface-raised/50 backdrop-blur-md rounded-[32px] border border-border-subtle shadow-2xl overflow-hidden min-h-[400px]">
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-surface-soft/50 border-b border-border-subtle">
            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted">Fecha Emisión</th>
            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted">N° Doc / Fiscal</th>
            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted">Proveedor</th>
            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-right">Monto Total</th>
            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-right">Saldo CxP</th>
            {#if data.canSeeOthers}
              <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-center">Registrado Por</th>
            {/if}
            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-center">Estatus</th>
            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-center">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle/30">
          {#if !data.invoices || data.invoices.length === 0}
            <tr>
              <td colspan={data.canSeeOthers ? 8 : 7} class="px-6 py-32 text-center">
                <FileText size={48} class="mx-auto text-text-muted/20 mb-4" />
                <p class="text-text-muted font-bold text-base">No se encontraron facturas de compra</p>
                <button
                  onclick={() => {
                    filterSearch = "";
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
            {#each data.invoices as invoice}
              <tr class="hover:bg-brand-500/5 transition-colors group text-xs">
                <!-- Fecha Emisión -->
                <td class="px-6 py-5">
                  <div class="font-bold text-text-base">
                    {dayjs(invoice.fec_emis).format("DD/MM/YYYY")}
                  </div>
                  <div class="text-[10px] text-text-muted/60 mt-0.5">
                    Vence: {dayjs(invoice.fec_venc).format("DD/MM/YYYY")}
                  </div>
                </td>

                <!-- Document Number and Fiscal Invoice Number -->
                <td class="px-6 py-5">
                  <div class="flex flex-col gap-1 items-start">
                    <span
                      class="px-2.5 py-1 rounded-lg bg-surface-soft border border-border-subtle text-xs font-black text-brand-500 group-hover:bg-brand-500 group-hover:border-brand-500 group-hover:text-white transition-all"
                    >
                      {invoice.doc_num}
                    </span>
                    <div class="flex flex-wrap items-center gap-1">
                      <span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        {invoice.nro_fact ? `Fact: ${invoice.nro_fact}` : "Factura"}
                      </span>
                      {#if invoice.n_control && invoice.n_control !== "N/A" && invoice.n_control.trim() !== ""}
                        <span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Ctrl: {invoice.n_control}
                        </span>
                      {/if}
                    </div>
                  </div>
                </td>

                <!-- Proveedor -->
                <td class="px-6 py-5">
                  <div class="flex flex-col max-w-[240px]">
                    <span class="font-bold text-text-base truncate uppercase">{invoice.prov_des || "PROVEEDOR GENERAL"}</span>
                    <span class="text-[10px] text-text-muted font-mono">{invoice.rif || invoice.co_prov}</span>
                  </div>
                </td>

                <!-- Monto Total -->
                <td class="px-6 py-5 text-right font-bold">
                  <div class="text-sm font-black text-text-base">
                    <span class="text-text-muted text-[10px] font-medium mr-1">USD</span>
                    {(Number(invoice.total_neto) / Number(invoice.tasa || 1)).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div class="text-[10px] text-text-muted/70 mt-0.5">
                    <span>Bs. </span>
                    {Number(invoice.total_neto).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </td>

                <!-- Saldo CxP -->
                <td class="px-6 py-5 text-right font-bold">
                  {#if invoice.anulado}
                    <span class="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-black uppercase tracking-wider">
                      Anulada
                    </span>
                  {:else if Number(invoice.saldo ?? 0) <= 0.001}
                    <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-wider">
                      Pagada
                    </span>
                  {:else}
                    <div class="text-xs font-black text-amber-400 font-mono">
                      ${(Number(invoice.saldo) / Number(invoice.tasa || 1)).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div class="text-[10px] text-amber-400/70 font-semibold mt-0.5">
                      Bs. {Number(invoice.saldo).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  {/if}
                </td>

                <!-- Usuario Creador -->
                {#if data.canSeeOthers}
                  <td class="px-6 py-5 text-center">
                    <span class="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase tracking-wider">
                      {invoice.user_name || invoice.co_us_in || "---"}
                    </span>
                  </td>
                {/if}

                <!-- Estatus Badge -->
                <td class="px-6 py-5 text-center">
                  {#if invoice.anulado}
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
                      onclick={() => openDetailModal(invoice)}
                      class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                      title="Ver Detalle de Factura"
                    >
                      <Eye size={18} />
                    </button>

                    <!-- Anular -->
                    {#if !invoice.anulado && data.canVoid}
                      <button
                        type="button"
                        onclick={() => openVoidModal(invoice)}
                        class="p-2 text-text-muted hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                        title="Anular Factura de Compra"
                      >
                        <Ban size={18} />
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
          Página {data.pagination.currentPage} de {data.pagination.pages} ({data.pagination.total} facturas en total)
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

<!-- INVOICE DETAIL MODAL -->
{#if showDetailModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" in:fade>
    <div class="glass border border-border-subtle rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl" in:slide>
      <!-- Modal Header -->
      <div class="p-6 border-b border-border-subtle bg-surface-soft/50 flex items-center justify-between">
        <div>
          <h3 class="text-lg font-black text-text-base flex items-center gap-2">
            <Receipt size={20} class="text-brand-500" />
            Detalle de Factura de Compra
          </h3>
          {#if selectedInvoiceDetail}
            <p class="text-xs text-text-muted mt-0.5">
              Doc N° <span class="font-mono text-brand-400 font-bold">{selectedInvoiceDetail.doc_num}</span> &bull; Factura Fiscal N° <span class="font-mono text-text-base font-bold">{selectedInvoiceDetail.nro_fact}</span>
            </p>
          {/if}
        </div>
        <button
          type="button"
          onclick={() => (showDetailModal = false)}
          class="p-2 text-text-muted hover:text-text-base hover:bg-surface-soft rounded-xl transition-colors cursor-pointer"
        >
          <X size={20} />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
        {#if isLoadingDetail}
          <div class="py-16 flex flex-col items-center justify-center gap-3 text-text-muted">
            <Loader2 size={32} class="animate-spin text-brand-500" />
            <p class="font-bold">Cargando detalle de la factura...</p>
          </div>
        {:else if selectedInvoiceDetail}
          <!-- Top Info Cards -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-surface-soft p-4 rounded-2xl border border-border-subtle space-y-1">
              <span class="text-[9px] font-black uppercase text-text-muted">Proveedor</span>
              <p class="font-black text-sm text-text-base uppercase">{selectedInvoiceDetail.prov_des}</p>
              <p class="text-text-muted font-mono">{selectedInvoiceDetail.rif || selectedInvoiceDetail.co_prov}</p>
            </div>
            <div class="bg-surface-soft p-4 rounded-2xl border border-border-subtle space-y-1">
              <span class="text-[9px] font-black uppercase text-text-muted">Fechas</span>
              <p class="font-bold text-text-base">Emisión: {dayjs(selectedInvoiceDetail.fec_emis).format("DD/MM/YYYY")}</p>
              <p class="text-text-muted">Vence: {dayjs(selectedInvoiceDetail.fec_venc).format("DD/MM/YYYY")}</p>
            </div>
            <div class="bg-surface-soft p-4 rounded-2xl border border-border-subtle space-y-1">
              <span class="text-[9px] font-black uppercase text-text-muted">Condición & Tasa</span>
              <p class="font-bold text-text-base">{selectedInvoiceDetail.cond_des || selectedInvoiceDetail.co_cond || "Contado"}</p>
              <p class="text-brand-400 font-mono">Tasa: {Number(selectedInvoiceDetail.tasa || 1).toFixed(2)} Bs/$</p>
            </div>
          </div>

          <!-- Items Table -->
          <div class="border border-border-subtle rounded-2xl overflow-hidden">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-surface-strong border-b border-border-subtle text-[10px] font-black uppercase tracking-wider text-text-muted">
                  <th class="px-4 py-2.5 w-10 text-center">#</th>
                  <th class="px-4 py-2.5">Artículo</th>
                  <th class="px-4 py-2.5 text-center">Origen</th>
                  <th class="px-4 py-2.5 text-center">Cantidad</th>
                  <th class="px-4 py-2.5 text-right">Costo Unit</th>
                  <th class="px-4 py-2.5 text-center">IVA</th>
                  <th class="px-4 py-2.5 text-right">Neto</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-subtle text-xs">
                {#each selectedInvoiceDetail.renglones || [] as r}
                  <tr class="hover:bg-surface-soft/40">
                    <td class="px-4 py-2.5 text-center text-text-muted font-mono">{r.reng_num}</td>
                    <td class="px-4 py-2.5">
                      <div class="font-bold text-text-base">{r.art_des}</div>
                      <div class="text-[10px] text-text-muted font-mono">{r.co_art}</div>
                    </td>
                    <td class="px-4 py-2.5 text-center">
                      {#if r.num_doc}
                        <span class="px-2 py-0.5 rounded bg-surface-soft border border-border-subtle text-[10px] font-mono font-bold text-brand-400">
                          {r.tipo_doc}: {r.num_doc}
                        </span>
                      {:else}
                        <span class="text-text-muted text-[10px]">---</span>
                      {/if}
                    </td>
                    <td class="px-4 py-2.5 text-center font-bold text-text-base">
                      {Number(r.cantidad).toFixed(2)} {r.unidad || r.co_uni}
                    </td>
                    <td class="px-4 py-2.5 text-right font-mono">
                      ${Number(r.costo_om || (Number(r.costo) / Number(selectedInvoiceDetail.tasa || 1))).toFixed(2)}
                    </td>
                    <td class="px-4 py-2.5 text-center font-mono text-text-muted">
                      {Number(r.porc_imp).toFixed(0)}%
                    </td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-brand-400">
                      ${(Number(r.total_renglon) / Number(selectedInvoiceDetail.tasa || 1)).toFixed(2)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <!-- Totals Breakdown -->
          <div class="flex justify-end">
            <div class="w-72 bg-surface-soft p-4 rounded-2xl border border-border-subtle space-y-2 text-xs">
              <div class="flex justify-between text-text-muted font-bold">
                <span>Sub-Total:</span>
                <span class="font-mono text-text-base">${(Number(selectedInvoiceDetail.total_bruto) / Number(selectedInvoiceDetail.tasa || 1)).toFixed(2)}</span>
              </div>
              {#if Number(selectedInvoiceDetail.monto_desc_glob) > 0}
                <div class="flex justify-between text-text-muted font-bold">
                  <span>Descuento:</span>
                  <span class="font-mono text-red-400">-${(Number(selectedInvoiceDetail.monto_desc_glob) / Number(selectedInvoiceDetail.tasa || 1)).toFixed(2)}</span>
                </div>
              {/if}
              <div class="flex justify-between text-text-muted font-bold">
                <span>I.V.A:</span>
                <span class="font-mono text-brand-400">${(Number(selectedInvoiceDetail.monto_imp) / Number(selectedInvoiceDetail.tasa || 1)).toFixed(2)}</span>
              </div>
              <div class="border-t border-border-subtle pt-2 flex justify-between font-black text-sm">
                <span>Total Neto:</span>
                <span class="font-mono text-brand-400">${(Number(selectedInvoiceDetail.total_neto) / Number(selectedInvoiceDetail.tasa || 1)).toFixed(2)} USD</span>
              </div>
              <div class="text-right text-[10px] text-text-muted font-mono">
                Bs. {Number(selectedInvoiceDetail.total_neto).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="p-4 border-t border-border-subtle bg-surface-soft/30 flex justify-end">
        <button
          type="button"
          onclick={() => (showDetailModal = false)}
          class="px-5 py-2.5 bg-surface-soft hover:bg-surface-strong text-text-base border border-border-subtle rounded-xl text-xs font-bold transition-all cursor-pointer"
        >
          Cerrar
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- VOID CONFIRMATION MODAL -->
{#if showVoidModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" in:fade>
    <div class="glass border border-red-500/20 rounded-3xl max-w-md w-full p-8 text-center space-y-6 shadow-2xl relative" in:slide>
      <div class="h-16 w-16 rounded-2xl bg-red-500/10 text-red-400 mx-auto flex items-center justify-center shadow-lg shadow-red-500/10">
        <Ban size={36} />
      </div>

      <div class="space-y-2">
        <h2 class="text-xl font-black text-text-base">Confirmar Anulación de Factura</h2>
        <p class="text-xs text-text-muted px-2 leading-relaxed">
          ¿Estás seguro de que deseas anular la factura de compra
          <span class="text-text-base font-bold font-mono">{invoiceToVoid?.doc_num}</span> (Fiscal N°: <span class="text-text-base font-bold font-mono">{invoiceToVoid?.nro_fact}</span>)?
          Esto anulará el documento en Cuentas por Pagar y restaurará las cantidades pendientes en las recepciones de mercancía origen.
        </p>
      </div>

      <form
        method="POST"
        action="?/voidInvoice"
        use:enhance={() => {
          isVoiding = true;
          return async ({ result, update }) => {
            await update();
            isVoiding = false;

            if (result.type === "success") {
              showVoidModal = false;
              toast.success((result as any).data?.message || "Factura de compra anulada con éxito.");
            } else if (result.type === "failure" && (result as any).data?.message) {
              toast.error((result as any).data.message);
            } else {
              toast.error("Error al anular la factura de compra.");
            }
          };
        }}
        class="space-y-4 pt-2 text-left"
      >
        <input type="hidden" name="doc_num" value={invoiceToVoid?.doc_num} />
        <input type="hidden" name="branch_id" value={data.selectedBranchId} />

        <div class="space-y-1.5">
          <label for="void-pass" class="text-[10px] font-black uppercase tracking-wider text-text-muted">
            Contraseña de Confirmación
          </label>
          <div class="relative">
            <Lock size={16} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              id="void-pass"
              type="password"
              name="password"
              bind:value={voidPassword}
              required
              placeholder="Introduce tu contraseña para confirmar"
              class="w-full h-12 pl-11 pr-4 bg-surface-soft border border-border-subtle rounded-xl text-xs text-text-base focus:border-red-500 outline-none transition-all"
            />
          </div>
        </div>

        <div class="flex gap-3 pt-4">
          <button
            type="button"
            onclick={() => (showVoidModal = false)}
            disabled={isVoiding}
            class="flex-1 h-12 rounded-xl font-bold bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base border border-border-subtle text-xs transition-all cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isVoiding || !voidPassword}
            class="flex-1 h-12 rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {#if isVoiding}
              <Loader2 size={16} class="animate-spin" />
            {:else}
              <Ban size={16} />
              Anular Factura
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
