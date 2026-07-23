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
    Printer,
    AlertCircle,
    Plus,
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


  // Filtros locales
  let filterSearch = $state("");
  let filterSede = $state("");

  $effect(() => {
    filterSearch = data.filters?.search || "";
    filterSede = data.selectedBranchId || "";
  });

  function applyFilters() {
    const params = new URLSearchParams($page.url.searchParams);
    if (filterSearch) params.set("search", filterSearch);
    else params.delete("search");
    if (filterSede) params.set("branch_id", filterSede);
    params.set("page", "1");
    goto(`?${params.toString()}`);
  }

  function changePage(p: number) {
    const params = new URLSearchParams($page.url.searchParams);
    params.set("page", p.toString());
    goto(`?${params.toString()}`);
  }

  function isFiscalInvoice(invoice: any) {
    if (Number(invoice.monto_imp) > 0) return true;
    
    // Buscar configuración de la sede de esta factura
    const bConfig = data.branches?.find((b: any) => String(b.id).toLowerCase() === String(invoice.sede_id).toLowerCase());
    if (!bConfig) return false;
    
    let codes = bConfig.profit_branch_codes;
    if (typeof codes === "string") {
      try { codes = JSON.parse(codes); } catch (e) {}
    }
    if (!Array.isArray(codes)) return false;
    
    const found = codes.find(
      (c: any) =>
        c.is_default === true ||
        String(c.is_default) === "true" ||
        c.default === true
    );
    if (!found) return false;
    
    return String(invoice.co_sucu_in || '').trim().toUpperCase() === String(found.code).trim().toUpperCase();
  }

  function openVoidModal(invoice: any) {
    invoiceToVoid = invoice;
    voidPassword = "";
    showVoidModal = true;
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
        class="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-black transition-all"
        >Reintentar</button
      >
    </div>
  {/if}

  <!-- HEADER -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div class="flex flex-col gap-2">
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Clock size={40} class="text-brand-500" />
        Historial Facturas / NE
      </h1>
      <p class="text-text-muted text-lg">
        Consulta y reimprime facturas o notas de entrega emitidas por caja.
      </p>
    </div>

    <div class="flex items-center gap-3 shrink-0">
      <button
        onclick={() => goto("/dashboard/billing")}
        class="flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-500 text-white h-14 px-8 rounded-2xl font-black shadow-xl shadow-brand-500/20 transition-all active:scale-95 shrink-0 w-full md:w-auto cursor-pointer"
      >
        <Plus size={20} />
        Nueva Factura
      </button>
    </div>
  </div>

  <!-- SEARCH & FILTERS -->
  <div
    class="glass p-4 rounded-3xl border border-white/5 shadow-2xl grid grid-cols-1 md:grid-cols-2 gap-4 items-center mb-6 w-full relative z-20"
  >
    {#if data.branches && data.branches.length > 1}
      <div class="w-full">
        <Combobox
          options={data.branches.map((b: any) => ({ value: b.id, label: b.name }))}
          bind:value={filterSede}
          placeholder="Sucursal..."
          allLabel="Todas las Sucursales"
          icon={Store}
          class="w-full h-14"
          onchange={applyFilters}
        />
      </div>
    {/if}

    <div class="w-full {!(data.branches && data.branches.length > 1) ? 'md:col-span-2' : ''}">
      <SearchBar
        bind:value={filterSearch}
        isSearching={isSearching}
        onsubmit={applyFilters}
        placeholder="Buscar por factura, cliente o RIF..."
        className="w-full h-14"
      />
    </div>
  </div>

  <!-- INVOICE LIST TABLE -->
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
              >Factura / Documento</th
            >
            <th class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted"
              >Cliente</th
            >
            <th
              class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-right"
              >Monto</th
            >
            <th
              class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-right"
              >Saldo</th
            >
            {#if data.canSeeOthers}
              <th
                class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-center"
                >Cajero</th
              >
            {/if}
            <th
              class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-center"
              >Vendedor</th
            >
            <th
              class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-center"
              >Estatus</th
            >
            <th
              class="px-6 py-5 text-xs font-black uppercase tracking-[0.1em] text-text-muted text-center"
              >Acciones</th
            >
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle/30">
          {#if !data.invoices || data.invoices.length === 0}
            <tr>
              <td colspan={data.canSeeOthers ? 9 : 8} class="px-6 py-32 text-center">
                <FileText size={48} class="mx-auto text-text-muted/20 mb-4" />
                <p class="text-text-muted font-bold text-lg">No se encontraron facturas</p>
                <button
                  onclick={() => {
                    filterSearch = "";
                    applyFilters();
                  }}
                  class="mt-2 text-brand-500 hover:underline text-sm font-bold"
                  >Limpiar filtros</button
                >
              </td>
            </tr>
          {:else}
            {#each data.invoices as invoice}
              <tr class="hover:bg-brand-500/5 transition-colors group">
                <td class="px-6 py-5">
                  <div class="text-xs font-bold text-text-base">
                    {dayjs(invoice.fec_emis).format("DD/MM/YYYY")}
                  </div>
                  <div class="text-xs text-text-muted/60 mt-0.5">
                    {dayjs(invoice.fec_emis).format("hh:mm A")}
                  </div>
                </td>
                <td class="px-6 py-5">
                  <div class="flex flex-col gap-1 items-start">
                    <span
                      class="px-2.5 py-1 rounded-lg bg-surface-soft border border-border-subtle text-xs font-black text-brand-500 group-hover:bg-brand-500 group-hover:border-brand-500 group-hover:text-white transition-all"
                    >
                      {invoice.doc_num}
                    </span>
                    <span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md {isFiscalInvoice(invoice) ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}">
                      {isFiscalInvoice(invoice) ? 'Factura' : 'Nota de Entrega'}
                    </span>
                  </div>
                </td>
                <td class="px-6 py-5">
                  <div class="flex flex-col max-w-[240px]">
                    <span class="text-sm font-bold text-text-base truncate"
                      >{invoice.cli_des || "CLIENTE GENERAL"}</span
                    >
                    <span class="text-[10px] text-text-muted font-black tracking-widest"
                      >{invoice.co_cli}</span
                    >
                  </div>
                </td>
                <td class="px-6 py-5 text-right font-bold">
                  <div class="text-base text-text-base">
                    <span class="text-text-muted text-xs font-medium mr-1">USD</span>
                    {(Number(invoice.total_neto) / Number(invoice.tasa || 1)).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </div>
                  <div class="text-xs text-text-muted/60 mt-0.5">
                    <span>Bs. </span>
                    {Number(invoice.total_neto).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    <span class="text-[10px] text-text-muted/40 ml-1">(Tasa: {Number(invoice.tasa || 1).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})})</span>
                  </div>
                </td>
                <td class="px-6 py-5 text-right font-bold">
                  {#if invoice.anulado}
                    <span class="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-black uppercase tracking-wider">
                      Anulada
                    </span>
                  {:else if Number(invoice.saldo ?? 0) <= 0.001}
                    <span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-wider">
                      Pagada
                    </span>
                  {:else}
                    <div class="text-sm font-black text-amber-400">
                      <span class="text-amber-500/70 text-xs font-medium mr-1">USD</span>
                      {(Number(invoice.saldo) / Number(invoice.tasa || 1)).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </div>
                    <div class="text-xs text-amber-400/70 font-semibold mt-0.5">
                      <span>Bs. </span>
                      {Number(invoice.saldo).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </div>
                  {/if}
                </td>
                {#if data.canSeeOthers}
                  <td class="px-6 py-5 text-center">
                    <div class="relative group/tooltip inline-block">
                      <span
                        class="px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 text-xs font-bold uppercase tracking-wider cursor-help"
                      >
                        {invoice.co_us_in || "---"}
                      </span>
                      <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tooltip:block bg-surface-raised border border-border-subtle px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider text-text-base whitespace-nowrap shadow-2xl z-30 pointer-events-none transition-all">
                        {String(invoice.cashier_name || invoice.co_us_in || "---").toUpperCase()}
                        <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border-subtle"></div>
                      </div>
                    </div>
                  </td>
                {/if}
                <td class="px-6 py-5 text-center">
                  <div class="relative group/tooltip inline-block">
                    <span
                      class="px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 text-xs font-bold uppercase tracking-wider cursor-help"
                    >
                      {invoice.co_ven || "---"}
                    </span>
                    <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tooltip:block bg-surface-raised border border-border-subtle px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider text-text-base whitespace-nowrap shadow-2xl z-30 pointer-events-none transition-all">
                      {String(invoice.ven_des || invoice.co_ven || "---").toUpperCase()}
                      <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border-subtle"></div>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-5 text-center">
                  {#if invoice.anulado}
                    <span
                      class="px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-500 border-red-500/20"
                    >
                      Anulada
                    </span>
                  {:else}
                    <span
                      class="px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest bg-green-500/10 text-green-500 border-green-500/20"
                    >
                      Vigente
                    </span>
                  {/if}
                </td>
                <td class="px-6 py-5">
                  <div class="flex items-center justify-center gap-2">
                    <!-- Reimprimir Factura -->
                    <a
                      href="/dashboard/billing/{invoice.doc_num}/print?branch_id={data.selectedBranchId}"
                      target="_blank"
                      class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                      title={isFiscalInvoice(invoice) ? 'Reimprimir Factura' : 'Reimprimir Nota de Entrega'}
                    >
                      <Printer size={18} />
                    </a>

                    <!-- Anular -->
                    {#if data.canVoid && !invoice.anulado}
                      <button
                        onclick={() => openVoidModal(invoice)}
                        class="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
                        title={isFiscalInvoice(invoice) ? 'Anular Factura' : 'Anular Nota de Entrega'}
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
      <div
        class="px-8 py-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-between"
      >
        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
          Página <span class="text-text-base">{data.pagination.currentPage}</span> de
          <span class="text-text-base">{data.pagination.pages}</span> (Total: {data.pagination.total})
        </p>

        <div class="flex items-center gap-2">
          <button
            disabled={data.pagination.currentPage === 1}
            onclick={() => changePage(data.pagination.currentPage - 1)}
            class="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-all border border-white/5 text-text-muted cursor-pointer"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            disabled={data.pagination.currentPage === data.pagination.pages}
            onclick={() => changePage(data.pagination.currentPage + 1)}
            class="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-all border border-white/5 text-text-muted cursor-pointer"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- ANULAR MODAL -->
{#if showVoidModal}
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div
      class="absolute inset-0 bg-black/90 backdrop-blur-md"
      onclick={() => !isVoiding && (showVoidModal = false)}
      onkeydown={(e) => e.key === "Escape" && !isVoiding && (showVoidModal = false)}
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
          <Ban size={40} />
        </div>

        <div class="space-y-2">
          <h2 class="text-2xl font-black tracking-tight">Confirmar Anulación</h2>
          <p class="text-text-muted text-sm px-4">
            ¿Estás seguro de que deseas anular la factura
            <span class="text-text-base font-bold">{invoiceToVoid?.doc_num}</span>? Esto
            revertirá el stock y las cantidades pendientes de los pedidos asociados en Profit
            Plus.
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
                toast.success((result as any).data?.message || "Factura anulada con éxito");
              } else if (result.type === "failure" && (result as any).data?.message) {
                toast.error((result as any).data.message);
              } else {
                toast.error("Error al anular la factura");
              }
            };
          }}
          class="space-y-4 pt-4"
        >
          <input type="hidden" name="doc_num" value={invoiceToVoid?.doc_num} />
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
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-red-500/50 outline-none transition-all text-text-base"
              />
            </div>
          </div>

          <div class="flex gap-3 pt-4">
            <button
              type="button"
              onclick={() => (showVoidModal = false)}
              disabled={isVoiding}
              class="flex-1 h-14 rounded-2xl font-bold bg-white/5 hover:bg-white/10 transition-all text-text-muted disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isVoiding || !voidPassword}
              class="flex-1 h-14 rounded-2xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {#if isVoiding}
                <Loader2 size={18} class="animate-spin" />
              {:else}
                <Check size={18} />
                Confirmar
              {/if}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}
