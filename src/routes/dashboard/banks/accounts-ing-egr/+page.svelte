<script lang="ts">
  import { fade, fly, scale } from "svelte/transition";
  import { enhance } from "$app/forms";
  import {
    Layers,
    Search,
    Plus,
    ChevronLeft,
    ChevronRight,
    AlertCircle,
    Loader2,
    Hash,
    Pen,
    Trash2,
    X,
    Check,
    Lock,
    Store,
    FileText,
    ShieldCheck,
    ArrowRightLeft,
    Calendar,
    Eye,
    TrendingUp,
    TrendingDown,
    Building2,
    RefreshCw,
    Receipt,
    Coins,
  } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { toast } from "svelte-sonner";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import SearchBar from "$lib/components/ui/SearchBar.svelte";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const canCreate = $derived(data.crud?.create ?? false);
  const canUpdate = $derived(data.crud?.update ?? false);
  const canDelete = $derived(data.crud?.delete ?? false);

  let searchQuery = $state("");
  let filterStatus = $state("all");
  let selectedBranch = $state("");
  let isSearching = $state(false);

  // Modales CRUD
  let showModal = $state(false);
  let isEditing = $state(false);
  let loading = $state(false);

  let showDeleteModal = $state(false);
  let accountToDelete = $state<any>(null);
  let deletePassword = $state("");
  let isDeleting = $state(false);

  // Estado del formulario
  let co_cta_ingr_egr = $state("");
  let descrip = $state("");
  let co_islr = $state("");

  let localAccounts = $derived(data.accounts || []);
  let localPagination = $derived(
    data.pagination || { total: 0, page: 1, limit: 20, totalPages: 1 }
  );
  let metrics = $derived(
    data.metrics || { total_cuentas: 0, con_movimientos: 0, sin_movimientos: 0 }
  );

  const islrOptions = $derived(
    (data.conceptosIslr || []).map((c: any) => ({
      value: c.co_islr,
      label: `${c.co_islr} · ${c.islr_des}`,
    }))
  );

  $effect(() => {
    searchQuery = data.search || "";
    filterStatus = data.filter || "all";
    selectedBranch =
      data.selectedBranchId ||
      $page.url.searchParams.get("branch_id") ||
      data.branches?.[0]?.id ||
      "";
  });

  $effect(() => {
    if (form?.success) {
      toast.success(
        form.message || (isEditing ? "Cuenta actualizada" : "Cuenta creada")
      );
      showModal = false;
    } else if (form?.message) {
      toast.error(form.message);
    }
    if (data.error) {
      toast.error(data.error);
    }
  });

  function applyFilters(newPage = 1) {
    isSearching = true;
    const url = new URL(window.location.href);

    if (searchQuery.trim()) url.searchParams.set("search", searchQuery.trim());
    else url.searchParams.delete("search");

    if (filterStatus && filterStatus !== "all") url.searchParams.set("filter", filterStatus);
    else url.searchParams.delete("filter");

    if (selectedBranch) url.searchParams.set("branch_id", selectedBranch);
    else url.searchParams.delete("branch_id");

    url.searchParams.set("page", String(newPage));

    goto(url.toString(), { replaceState: true, keepFocus: true }).finally(() => {
      isSearching = false;
    });
  }

  function handleSearch(e?: Event) {
    if (e) e.preventDefault();
    applyFilters(1);
  }

  function changePage(newPage: number) {
    if (newPage < 1 || newPage > localPagination.totalPages) return;
    applyFilters(newPage);
  }

  function openCreateModal() {
    isEditing = false;
    co_cta_ingr_egr = "";
    descrip = "";
    co_islr = "";
    showModal = true;
  }

  function openEditModal(account: any) {
    if (!account.editable) {
      toast.error(
        `No se puede editar "${account.co_cta_ingr_egr}" porque tiene ${account.total_movimientos} movimiento(s) asociado(s).`
      );
      return;
    }
    isEditing = true;
    co_cta_ingr_egr = account.co_cta_ingr_egr || "";
    descrip = account.descrip || "";
    co_islr = account.co_islr || "";
    showModal = true;
  }

  function openDeleteModal(account: any) {
    if (!account.eliminable) {
      const reason = account.tiene_movimientos
        ? `tiene ${account.total_movimientos} movimiento(s) asociado(s)`
        : "está referenciada en documentos o maestros de Profit Plus";
      toast.error(`No se puede eliminar "${account.co_cta_ingr_egr}" porque ${reason}.`);
      return;
    }
    accountToDelete = account;
    deletePassword = "";
    showDeleteModal = true;
  }

  // Modal de Detalle de Movimientos
  let showMovementsModal = $state(false);
  let selectedAccountForMovs = $state<any>(null);
  let movsLoading = $state(false);
  let movsList = $state<any[]>([]);
  let movsMetrics = $state({
    total_registros: 0,
    total_anulados: 0,
    total_conciliados: 0,
    total_ingresos_bs: 0,
    total_ingresos_usd: 0,
    total_egresos_bs: 0,
    total_egresos_usd: 0,
    total_idb_bs: 0,
  });
  let movsPagination = $state({
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 1,
  });
  let movsFechaD = $state("");
  let movsFechaH = $state("");
  let movsSearch = $state("");
  let movsBalanceBs = $derived(
    movsMetrics.total_ingresos_bs - movsMetrics.total_egresos_bs - movsMetrics.total_idb_bs
  );

  function formatCurrency(amount: number, curr = "BS") {
    const n = Number(amount || 0);
    const formatted = n.toLocaleString("es-VE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return curr === "USD" ? `$ ${formatted}` : `Bs. ${formatted}`;
  }

  function formatDate(val: any) {
    if (!val) return "---";
    const s = String(val);
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    const d = new Date(val);
    if (isNaN(d.getTime())) return s;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${d.getFullYear()}`;
  }

  function openMovementsModal(account: any) {
    selectedAccountForMovs = account;
    showMovementsModal = true;
    movsSearch = "";

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    if (!movsFechaD) movsFechaD = `${yyyy}-01-01`;
    if (!movsFechaH) movsFechaH = `${yyyy}-${mm}-${dd}`;

    loadAccountMovements(1);
  }

  function setQuickRange(type: "month" | "year" | "all") {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    if (type === "month") {
      movsFechaD = `${yyyy}-${mm}-01`;
      movsFechaH = `${yyyy}-${mm}-${dd}`;
    } else if (type === "year") {
      movsFechaD = `${yyyy}-01-01`;
      movsFechaH = `${yyyy}-${mm}-${dd}`;
    } else if (type === "all") {
      movsFechaD = "";
      movsFechaH = "";
    }
    loadAccountMovements(1);
  }

  async function loadAccountMovements(newPage = 1) {
    if (!selectedAccountForMovs) return;
    movsLoading = true;

    try {
      const params = new URLSearchParams();
      if (selectedBranch) params.set("branch_id", selectedBranch);
      params.set("page", String(newPage));
      params.set("limit", "25");
      if (movsFechaD) params.set("fecha_d", movsFechaD);
      if (movsFechaH) params.set("fecha_h", movsFechaH);
      if (movsSearch.trim()) params.set("search", movsSearch.trim());

      const url = `/api/agent/bancos/cuentas-ingr-egr/${encodeURIComponent(selectedAccountForMovs.co_cta_ingr_egr)}/movimientos?${params.toString()}`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.success) {
        movsList = json.data || [];
        movsMetrics = json.metrics || {
          total_registros: 0,
          total_anulados: 0,
          total_conciliados: 0,
          total_ingresos_bs: 0,
          total_ingresos_usd: 0,
          total_egresos_bs: 0,
          total_egresos_usd: 0,
          total_idb_bs: 0,
        };
        movsPagination = json.pagination || {
          total: movsList.length,
          page: newPage,
          limit: 25,
          totalPages: 1,
        };
      } else {
        toast.error(json.message || "Error al consultar movimientos.");
      }
    } catch (e: any) {
      toast.error("Error al conectar: " + e.message);
    } finally {
      movsLoading = false;
    }
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Layers size={40} class="text-brand-500" />
        {data.title}
      </h1>
      <p class="text-text-muted mt-2 text-lg">
        Gestiona el catálogo de cuentas de ingresos y egresos de bancos (`saCuentaIngEgr`) en Profit Plus.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <a
        href="/dashboard/banks/movements?branch_id={encodeURIComponent(selectedBranch)}"
        class="flex items-center justify-center gap-2 bg-surface-strong hover:bg-surface-base text-text-base border border-border-subtle px-6 py-4 rounded-2xl font-bold transition-all active:scale-95"
      >
        <ArrowRightLeft size={18} class="text-brand-400" />
        Movimientos
      </a>

      {#if canCreate}
        <button
          type="button"
          onclick={openCreateModal}
          class="flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-500 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-brand-500/20 transition-all active:scale-95 cursor-pointer"
        >
          <Plus size={20} />
          Nueva Cuenta
        </button>
      {/if}
    </div>
  </div>

  <!-- Search, Filters and Stats -->
  <div
    class="glass relative z-30 p-4 rounded-3xl border border-white/5 shadow-2xl grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-center w-full"
  >
    {#if data.branches && data.branches.length > 1}
      <div class="w-full">
        <Combobox
          options={(data.branches || []).map((b: any) => ({ value: b.id, label: b.name }))}
          bind:value={selectedBranch}
          placeholder="Sucursal..."
          icon={Store}
          class="w-full h-14"
          onchange={() => applyFilters(1)}
        />
      </div>
    {:else}
      <div class="h-14 bg-surface-base border border-border-subtle rounded-2xl px-6 flex items-center gap-3 w-full">
        <Store class="text-brand-400 shrink-0" size={18} />
        <span class="font-bold text-sm text-text-base truncate">
          {data.branches?.[0]?.name || "Sede Principal"}
        </span>
      </div>
    {/if}

    <div class="w-full">
      <SearchBar
        bind:value={searchQuery}
        {isSearching}
        onsubmit={handleSearch}
        placeholder="Buscar por código, descripción o ISLR..."
        className="w-full h-14"
      />
    </div>

    <div class="w-full">
      <select
        bind:value={filterStatus}
        onchange={() => applyFilters(1)}
        class="w-full h-14 px-4 bg-surface-base border border-border-subtle rounded-2xl text-sm font-bold outline-none cursor-pointer"
      >
        <option value="all">Todas las cuentas ({metrics.total_cuentas})</option>
        <option value="sin_movimientos">Sin movimientos · Editables ({metrics.sin_movimientos})</option>
        <option value="con_movimientos">Con movimientos · Bloqueadas ({metrics.con_movimientos})</option>
      </select>
    </div>

    <!-- Compact Stats Counter -->
    <div class="flex items-center justify-between bg-surface-base border border-border-subtle px-5 py-3 rounded-2xl h-14 w-full">
      <span class="text-[11px] font-black text-text-muted uppercase tracking-widest">Editables / Total</span>
      <div class="flex items-baseline gap-1.5 font-mono">
        <span class="text-lg font-black text-emerald-500">{metrics.sin_movimientos}</span>
        <span class="text-text-muted text-xs">/</span>
        <span class="text-lg font-black text-brand-500">{localPagination.total}</span>
      </div>
    </div>
  </div>

  {#if data.error}
    <div
      class="glass border-red-500/20 p-12 rounded-[40px] flex flex-col items-center justify-center text-center space-y-4"
    >
      <div
        class="h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-500"
      >
        <AlertCircle size={40} />
      </div>
      <div class="space-y-1">
        <h3 class="text-2xl font-black">Conexión Interrumpida</h3>
        <p class="text-text-muted max-w-md mx-auto">{data.error}</p>
      </div>
      <button
        type="button"
        onclick={() => window.location.reload()}
        class="px-8 py-3 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-all cursor-pointer"
      >
        Reintentar Conexión
      </button>
    </div>
  {:else}
    <!-- Table -->
    <div
      class="glass relative z-10 rounded-[40px] border border-white/5 overflow-hidden shadow-2xl"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-white/5 bg-white/2">
              <th class="px-8 py-6 text-xs font-black uppercase tracking-widest text-text-muted">
                Cuenta Ingreso / Egreso
              </th>
              <th class="px-8 py-6 text-xs font-black uppercase tracking-widest text-text-muted">
                Concepto ISLR
              </th>
              <th class="px-8 py-6 text-xs font-black uppercase tracking-widest text-text-muted">
                Movimientos / Estado
              </th>
              <th class="px-8 py-6 text-xs font-black uppercase tracking-widest text-text-muted text-right">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            {#each localAccounts as account}
              <tr class="group hover:bg-white/2 transition-colors">
                <td class="px-8 py-6">
                  <div class="flex items-center gap-4">
                    <div
                      class="h-12 w-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 font-black shadow-inner shrink-0"
                    >
                      {account.co_cta_ingr_egr?.slice(0, 3) || "?"}
                    </div>
                    <div>
                      <p
                        class="font-bold text-text-base group-hover:text-brand-400 transition-colors uppercase leading-none mb-1.5 text-sm"
                      >
                        {account.descrip}
                      </p>
                      <div class="flex items-center gap-2 text-xs text-text-muted">
                        <Hash size={12} class="opacity-50" />
                        <span class="font-mono font-bold">{account.co_cta_ingr_egr}</span>
                      </div>
                    </div>
                  </div>
                </td>

                <td class="px-8 py-6">
                  {#if account.co_islr}
                    <div class="space-y-1">
                      <span
                        class="inline-block text-[10px] font-black uppercase tracking-tighter bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20 text-brand-500 font-mono"
                      >
                        ISLR {account.co_islr}
                      </span>
                      <p class="text-xs text-text-muted max-w-[260px] truncate" title={account.islr_des}>
                        {account.islr_des || "Concepto asociado"}
                      </p>
                    </div>
                  {:else}
                    <span class="text-[11px] text-text-muted/50 italic">No aplica</span>
                  {/if}
                </td>

                <td class="px-8 py-6">
                  {#if account.tiene_movimientos}
                    <div class="space-y-1">
                      <button
                        type="button"
                        onclick={() => openMovementsModal(account)}
                        class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-500 border border-amber-500/25 hover:bg-amber-500/25 transition-all cursor-pointer text-left"
                        title="Ver detalle de movimientos en esta cuenta"
                      >
                        <Lock size={12} />
                        {account.total_movimientos} movimiento{account.total_movimientos === 1 ? "" : "s"}
                      </button>
                      <p class="text-[11px] text-text-muted">
                        Banco: {account.mov_banco} · Caja: {account.mov_caja}
                        {#if account.transf_banco + account.dep_banco + account.ord_pago > 0}
                          · Otros: {account.transf_banco + account.dep_banco + account.ord_pago}
                        {/if}
                      </p>
                    </div>
                  {:else if account.otras_refs > 0}
                    <div class="space-y-1">
                      <span
                        class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/25"
                      >
                        <ShieldCheck size={12} />
                        Sin movimientos · Editable
                      </span>
                      <p class="text-[11px] text-text-muted">
                        Referenciada en parámetros/maestros ({account.otras_refs})
                      </p>
                    </div>
                  {:else}
                    <span
                      class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/25"
                    >
                      <ShieldCheck size={12} />
                      Sin movimientos · Libre
                    </span>
                  {/if}
                </td>

                <td class="px-8 py-6">
                  <div class="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onclick={() => openMovementsModal(account)}
                      class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all cursor-pointer"
                      title="Ver Movimientos de la Cuenta"
                    >
                      <Eye size={18} />
                    </button>
                    {#if canUpdate}
                      {#if account.editable}
                        <button
                          type="button"
                          onclick={() => openEditModal(account)}
                          class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all cursor-pointer"
                          title="Editar Cuenta"
                        >
                          <Pen size={18} />
                        </button>
                      {:else}
                        <button
                          type="button"
                          onclick={() => openEditModal(account)}
                          class="p-2 text-text-muted/35 hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all cursor-not-allowed"
                          title="Bloqueada: tiene {account.total_movimientos} movimiento(s) asociado(s)"
                        >
                          <Lock size={17} />
                        </button>
                      {/if}
                    {/if}

                    {#if canDelete}
                      {#if account.eliminable}
                        <button
                          type="button"
                          onclick={() => openDeleteModal(account)}
                          class="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
                          title="Eliminar Cuenta"
                        >
                          <Trash2 size={18} />
                        </button>
                      {:else}
                        <button
                          type="button"
                          onclick={() => openDeleteModal(account)}
                          class="p-2 text-text-muted/30 hover:text-amber-500 rounded-xl transition-all cursor-not-allowed"
                          title={account.tiene_movimientos
                            ? `No eliminable: tiene ${account.total_movimientos} movimiento(s)`
                            : "No eliminable: referenciada en maestros/documentos"}
                        >
                          <Trash2 size={18} />
                        </button>
                      {/if}
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}

            {#if localAccounts.length === 0}
              <tr>
                <td colspan="4" class="px-8 py-32 text-center bg-white/2">
                  <div class="flex flex-col items-center gap-6 max-w-md mx-auto">
                    <div
                      class="h-24 w-24 rounded-full bg-white/5 flex items-center justify-center text-text-muted/20"
                    >
                      <Search size={48} />
                    </div>
                    <div>
                      <h3 class="text-2xl font-black text-text-base mb-2">
                        No se encontraron cuentas
                      </h3>
                      <p class="text-text-muted font-medium text-sm leading-relaxed">
                        Pruebe con otros términos de búsqueda o verifique el filtro seleccionado.
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      {#if localPagination && localPagination.totalPages > 1}
        <div
          class="px-8 py-6 bg-white/1 border-t border-white/5 flex items-center justify-between"
        >
          <p class="text-xs font-bold text-text-muted uppercase tracking-widest">
            Página <span class="text-text-base">{localPagination.page}</span>
            de <span class="text-text-base">{localPagination.totalPages}</span>
            (Total: {localPagination.total})
          </p>

          <div class="flex gap-2">
            <button
              type="button"
              onclick={() => changePage(localPagination.page - 1)}
              disabled={localPagination.page <= 1}
              class="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-all border border-white/5 text-text-muted cursor-pointer"
            >
              <ChevronLeft size={20} />
            </button>

            <button
              type="button"
              onclick={() => changePage(localPagination.page + 1)}
              disabled={localPagination.page >= localPagination.totalPages}
              class="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-all border border-white/5 text-text-muted cursor-pointer"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Management Modal (Create / Edit) -->
{#if showModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 bg-slate-900/50 dark:bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 text-text-base"
    transition:fade
    onmousedown={(e) => {
      if (e.target === e.currentTarget) showModal = false;
    }}
  >
    <div
      class="bg-surface-raised w-full max-w-xl rounded-[40px] border border-border-bold shadow-2xl flex flex-col"
      transition:fly={{ y: 50, duration: 350 }}
      onmousedown={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === "Escape" && (showModal = false)}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <!-- Modal Header -->
      <div
        class="p-8 border-b border-border-subtle flex items-center justify-between bg-surface-base/50 rounded-t-[40px]"
      >
        <div class="flex items-center gap-4">
          <div
            class="h-12 w-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 shadow-inner"
          >
            <Layers size={24} />
          </div>
          <div>
            <h2 class="text-2xl font-bold">
              {isEditing ? "Editar Cuenta" : "Nueva Cuenta"}
            </h2>
            <p class="text-sm text-text-muted">
              {isEditing
                ? "Actualiza la descripción o concepto ISLR (solo cuentas sin movimientos)"
                : "Registra una nueva cuenta de ingreso o egreso en Profit Plus"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => (showModal = false)}
          class="p-3 text-text-muted hover:text-text-base hover:bg-surface-soft rounded-2xl transition-all cursor-pointer"
        >
          <X size={24} />
        </button>
      </div>

      <!-- Modal Form -->
      <form
        method="POST"
        action="?/saveAccount"
        use:enhance={() => {
          loading = true;
          return async ({ update }) => {
            await update();
            loading = false;
          };
        }}
        class="p-8 space-y-6 flex-1"
      >
        <input type="hidden" name="_isNew" value={String(!isEditing)} />
        <input type="hidden" name="branch_id" value={selectedBranch} />
        {#if isEditing}
          <input type="hidden" name="co_cta_ingr_egr" value={co_cta_ingr_egr} />
        {/if}

        <div class="space-y-5">
          <!-- Código -->
          <div class="space-y-2">
            <label
              for="co_cta_ingr_egr"
              class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1"
            >
              Código de Cuenta *
            </label>
            <div class="relative">
              <Hash
                size={18}
                class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
              />
              <input
                id="co_cta_ingr_egr"
                name={isEditing ? undefined : "co_cta_ingr_egr"}
                type="text"
                maxlength="20"
                required
                disabled={isEditing}
                bind:value={co_cta_ingr_egr}
                placeholder="Ej: G-032, I-003"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <!-- Descripción -->
          <div class="space-y-2">
            <label
              for="descrip"
              class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1"
            >
              Descripción *
            </label>
            <div class="relative">
              <FileText
                size={18}
                class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
              />
              <input
                id="descrip"
                name="descrip"
                type="text"
                maxlength="60"
                required
                bind:value={descrip}
                placeholder="Ej: GASTOS DE MANTENIMIENTO"
                class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
              />
            </div>
          </div>

          <!-- Concepto ISLR (Opcional) -->
          <div class="space-y-2">
            <span
              class="text-xs font-bold uppercase tracking-widest text-text-muted ml-1 block"
            >
              Concepto ISLR (Opcional)
            </span>
            <input type="hidden" name="co_islr" value={co_islr} />
            <Combobox
              id="co_islr"
              direction="up"
              options={islrOptions}
              bind:value={co_islr}
              placeholder="Sin retención ISLR..."
              allLabel="Ninguno (No aplica ISLR)"
            />
          </div>
        </div>

        <!-- Submit Button -->
        <div class="pt-3 pb-1">
          <button
            type="submit"
            disabled={loading}
            class="w-full bg-brand-600 hover:bg-brand-500 text-white py-5 rounded-2xl font-black text-lg uppercase tracking-widest shadow-xl shadow-brand-500/20 hover:shadow-brand-500/40 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-3 cursor-pointer"
          >
            {#if loading}
              <Loader2 size={24} class="animate-spin" />
              Procesando...
            {:else}
              <Check size={24} />
              {isEditing ? "Guardar Cambios" : "Crear Cuenta"}
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Modal de Confirmación de Eliminación -->
{#if showDeleteModal}
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div
      class="absolute inset-0 bg-slate-900/50 dark:bg-black/75 backdrop-blur-sm"
      onclick={() => !isDeleting && (showDeleteModal = false)}
      onkeydown={(e) =>
        e.key === "Escape" && !isDeleting && (showDeleteModal = false)}
      role="button"
      tabindex="-1"
    ></div>

    <div
      class="bg-surface-raised w-full max-w-md rounded-[40px] border border-border-bold shadow-2xl relative z-10 overflow-hidden text-text-base"
      transition:scale={{ duration: 300, start: 0.95 }}
    >
      <div class="p-8 text-center space-y-6">
        <div
          class="h-20 w-20 rounded-3xl bg-red-500/20 text-red-500 flex items-center justify-center mx-auto shadow-lg shadow-red-500/10"
        >
          <Trash2 size={40} />
        </div>

        <div class="space-y-2">
          <h2 class="text-2xl font-black tracking-tight text-text-base">
            Confirmar Eliminación
          </h2>
          <p class="text-text-muted text-sm px-4">
            ¿Estás seguro de que deseas eliminar la cuenta
            <span class="text-text-base font-bold">
              {accountToDelete?.co_cta_ingr_egr} · {accountToDelete?.descrip}
            </span>? Esta acción es irreversible en Profit Plus.
          </p>
        </div>

        <form
          method="POST"
          action="?/deleteAccount"
          use:enhance={() => {
            isDeleting = true;
            return async ({ result, update }) => {
              await update();
              isDeleting = false;
              if (result.type === "success") {
                showDeleteModal = false;
              }
            };
          }}
          class="space-y-4 pt-4"
        >
          <input
            type="hidden"
            name="co_cta_ingr_egr"
            value={accountToDelete?.co_cta_ingr_egr}
          />
          <input type="hidden" name="branch_id" value={selectedBranch} />

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
                class="w-full h-14 bg-surface-base border border-border-bold rounded-2xl pl-12 pr-5 focus:border-red-500 outline-none transition-all text-text-base"
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

<!-- Modal de Detalle de Movimientos de la Cuenta -->
{#if showMovementsModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 md:p-6 text-text-base"
    transition:fade
    onmousedown={(e) => {
      if (e.target === e.currentTarget) showMovementsModal = false;
    }}
  >
    <div
      class="bg-surface-raised w-full max-w-6xl max-h-[92vh] rounded-[36px] border border-border-bold shadow-2xl flex flex-col overflow-hidden"
      transition:fly={{ y: 50, duration: 350 }}
      onmousedown={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === "Escape" && (showMovementsModal = false)}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <!-- Modal Header -->
      <div
        class="p-6 md:p-8 border-b border-border-subtle flex items-center justify-between bg-surface-base/60 shrink-0"
      >
        <div class="flex items-center gap-4">
          <div
            class="h-14 w-14 rounded-2xl bg-brand-500/15 flex items-center justify-center text-brand-500 font-mono font-black shadow-inner shrink-0 text-base"
          >
            {selectedAccountForMovs?.co_cta_ingr_egr?.slice(0, 3) || "CTA"}
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="font-mono text-xs font-black px-2 py-0.5 rounded bg-brand-500/15 text-brand-400 border border-brand-500/20">
                {selectedAccountForMovs?.co_cta_ingr_egr}
              </span>
              {#if selectedAccountForMovs?.co_islr}
                <span class="text-[10px] font-black uppercase tracking-tight bg-amber-500/15 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded">
                  ISLR {selectedAccountForMovs.co_islr}
                </span>
              {/if}
            </div>
            <h2 class="text-xl md:text-2xl font-black text-text-base uppercase tracking-tight">
              {selectedAccountForMovs?.descrip}
            </h2>
            <p class="text-xs text-text-muted">
              Historial detallado de movimientos bancarios y de caja asociados a esta cuenta.
            </p>
          </div>
        </div>

        <button
          type="button"
          onclick={() => (showMovementsModal = false)}
          class="p-3 text-text-muted hover:text-text-base hover:bg-surface-soft rounded-2xl transition-all cursor-pointer shrink-0"
          title="Cerrar"
        >
          <X size={24} />
        </button>
      </div>

      <!-- Filter Controls -->
      <div class="p-4 md:p-6 bg-surface-base/30 border-b border-border-subtle shrink-0 space-y-3">
        <form
          onsubmit={(e) => {
            e.preventDefault();
            loadAccountMovements(1);
          }}
          class="flex flex-wrap items-center gap-3"
        >
          <!-- Desde -->
          <div class="flex items-center gap-2 bg-surface-raised px-3 py-2 rounded-xl border border-border-bold">
            <span class="text-[11px] font-bold text-text-muted uppercase">Desde:</span>
            <input
              type="date"
              bind:value={movsFechaD}
              class="bg-transparent text-xs font-mono font-bold text-text-base outline-none cursor-pointer"
            />
          </div>

          <!-- Hasta -->
          <div class="flex items-center gap-2 bg-surface-raised px-3 py-2 rounded-xl border border-border-bold">
            <span class="text-[11px] font-bold text-text-muted uppercase">Hasta:</span>
            <input
              type="date"
              bind:value={movsFechaH}
              class="bg-transparent text-xs font-mono font-bold text-text-base outline-none cursor-pointer"
            />
          </div>

          <!-- Quick Filters -->
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              onclick={() => setQuickRange("month")}
              class="text-xs font-bold px-3 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base transition-all border border-border-subtle cursor-pointer"
            >
              Este Mes
            </button>
            <button
              type="button"
              onclick={() => setQuickRange("year")}
              class="text-xs font-bold px-3 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base transition-all border border-border-subtle cursor-pointer"
            >
              Este Año
            </button>
            <button
              type="button"
              onclick={() => setQuickRange("all")}
              class="text-xs font-bold px-3 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base transition-all border border-border-subtle cursor-pointer"
            >
              Todo
            </button>
          </div>

          <!-- Búsqueda rápida de texto -->
          <div class="relative flex-1 min-w-[200px]">
            <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted opacity-50" />
            <input
              type="text"
              placeholder="Buscar por N° mov, ref, banco..."
              bind:value={movsSearch}
              class="w-full bg-surface-raised border border-border-bold rounded-xl pl-9 pr-3 py-2 text-xs text-text-base outline-none focus:border-brand-500 transition-all"
            />
          </div>

          <!-- Botón de consultar -->
          <button
            type="submit"
            disabled={movsLoading}
            class="flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs shadow-lg shadow-brand-500/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
          >
            {#if movsLoading}
              <Loader2 size={15} class="animate-spin" />
            {:else}
              <RefreshCw size={15} />
            {/if}
            Consultar
          </button>
        </form>

        <!-- Metrics Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <!-- Total Movimientos -->
          <div class="p-3.5 rounded-2xl bg-surface-base border border-border-subtle">
            <span class="text-[10px] font-black uppercase tracking-wider text-text-muted block mb-1">
              Total Registros
            </span>
            <div class="flex items-baseline gap-2">
              <span class="text-xl font-black font-mono text-text-base">
                {movsMetrics.total_registros}
              </span>
              <span class="text-[10px] font-bold text-text-muted">
                ({movsMetrics.total_conciliados} conc. · {movsMetrics.total_anulados} anul.)
              </span>
            </div>
          </div>

          <!-- Total Ingresos -->
          <div class="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                Ingresos
              </span>
              <TrendingUp size={13} class="text-emerald-400" />
            </div>
            <p class="text-sm md:text-base font-black font-mono text-emerald-400 truncate">
              {formatCurrency(movsMetrics.total_ingresos_bs, "BS")}
            </p>
            {#if movsMetrics.total_ingresos_usd > 0}
              <p class="text-[10px] font-mono font-bold text-emerald-400/80">
                {formatCurrency(movsMetrics.total_ingresos_usd, "USD")}
              </p>
            {/if}
          </div>

          <!-- Total Egresos -->
          <div class="p-3.5 rounded-2xl bg-rose-500/5 border border-rose-500/20">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] font-black uppercase tracking-wider text-rose-400">
                Egresos + IDB
              </span>
              <TrendingDown size={13} class="text-rose-400" />
            </div>
            <p class="text-sm md:text-base font-black font-mono text-rose-400 truncate">
              {formatCurrency(movsMetrics.total_egresos_bs + movsMetrics.total_idb_bs, "BS")}
            </p>
            {#if movsMetrics.total_egresos_usd > 0}
              <p class="text-[10px] font-mono font-bold text-rose-400/80">
                {formatCurrency(movsMetrics.total_egresos_usd, "USD")}
              </p>
            {/if}
          </div>

          <!-- Balance Neto -->
          <div class="p-3.5 rounded-2xl bg-surface-base border border-border-subtle">
            <span class="text-[10px] font-black uppercase tracking-wider text-text-muted block mb-1">
              Balance Período
            </span>
            <p class="text-sm md:text-base font-black font-mono {movsBalanceBs >= 0 ? 'text-emerald-400' : 'text-rose-400'} truncate">
              {formatCurrency(movsBalanceBs, "BS")}
            </p>
            <span class="text-[10px] font-bold text-text-muted">
              {movsBalanceBs >= 0 ? 'Superávit neto' : 'Déficit neto'}
            </span>
          </div>
        </div>
      </div>

      <!-- Movements Table Content -->
      <div class="flex-1 overflow-y-auto min-h-[280px]">
        {#if movsLoading}
          <div class="p-16 flex flex-col items-center justify-center gap-3 text-text-muted">
            <Loader2 size={36} class="animate-spin text-brand-500" />
            <p class="text-sm font-bold">Cargando movimientos de la cuenta...</p>
          </div>
        {:else if movsList.length === 0}
          <div class="p-16 flex flex-col items-center justify-center gap-3 text-center">
            <div class="h-16 w-16 rounded-3xl bg-surface-soft border border-border-subtle flex items-center justify-center text-text-muted">
              <Receipt size={32} />
            </div>
            <h4 class="text-lg font-bold text-text-base">Sin movimientos en el rango</h4>
            <p class="text-xs text-text-muted max-w-md">
              No se encontraron movimientos bancarios ni de caja asociados a <span class="font-bold text-brand-400 font-mono">{selectedAccountForMovs?.co_cta_ingr_egr}</span> para las fechas seleccionadas.
            </p>
          </div>
        {:else}
          <table class="w-full text-left border-collapse">
            <thead class="sticky top-0 bg-surface-raised z-10 border-b border-border-subtle shadow-sm">
              <tr class="text-[10px] font-black uppercase tracking-wider text-text-muted">
                <th class="px-5 py-3">Tipo / N° Mov</th>
                <th class="px-4 py-3">Fecha</th>
                <th class="px-5 py-3">Banco / Cuenta / Origen</th>
                <th class="px-5 py-3">Concepto / Descripción</th>
                <th class="px-5 py-3 text-right">Monto</th>
                <th class="px-5 py-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border-subtle">
              {#each movsList as mov}
                {@const isIngreso = mov.naturaleza === 'INGRESO'}
                {@const isIdb = mov.naturaleza === 'IDB'}
                <tr class="hover:bg-surface-base/50 transition-colors text-xs {mov.anulado ? 'opacity-40 line-through' : ''}">
                  <!-- Tipo / N° Mov -->
                  <td class="px-5 py-3.5">
                    <div class="flex items-center gap-2">
                      <span
                        class="px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase tracking-tight
                        {isIngreso ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 
                         isIdb ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : 
                         'bg-rose-500/15 text-rose-400 border border-rose-500/20'}"
                        title={mov.tipo_op_label}
                      >
                        {mov.tipo_op}
                      </span>
                      <div>
                        <span class="font-mono font-bold text-text-base block">
                          {mov.mov_num}
                        </span>
                        {#if mov.doc_num}
                          <span class="text-[10px] text-text-muted font-mono">
                            Ref: {mov.doc_num}
                          </span>
                        {/if}
                      </div>
                    </div>
                  </td>

                  <!-- Fecha -->
                  <td class="px-4 py-3.5 whitespace-nowrap font-mono text-text-muted font-bold">
                    {formatDate(mov.fecha)}
                  </td>

                  <!-- Banco / Cuenta / Origen -->
                  <td class="px-5 py-3.5">
                    <p class="font-bold text-text-base uppercase text-[11px] leading-tight truncate max-w-[200px]" title={mov.entidad_nombre}>
                      {mov.entidad_nombre}
                    </p>
                    <div class="flex items-center gap-1.5 text-[10px] text-text-muted font-mono mt-0.5">
                      <span>{mov.num_cta || mov.cuenta_origen_cod}</span>
                      <span class="opacity-40">·</span>
                      <span class="px-1 py-0.2 rounded bg-surface-soft uppercase text-[9px] font-bold">
                        {mov.fuente}
                      </span>
                    </div>
                  </td>

                  <!-- Concepto / Descripción -->
                  <td class="px-5 py-3.5">
                    <p class="text-text-base text-xs font-semibold leading-tight line-clamp-2 uppercase" title={mov.descrip}>
                      {mov.descrip || 'Sin descripción'}
                    </p>
                  </td>

                  <!-- Monto -->
                  <td class="px-5 py-3.5 text-right font-mono font-black whitespace-nowrap">
                    {#if isIngreso}
                      <span class="text-emerald-400">
                        + {formatCurrency(mov.monto, mov.co_mone)}
                      </span>
                    {:else if isIdb}
                      <span class="text-amber-400">
                        - {formatCurrency(mov.monto, mov.co_mone)}
                      </span>
                    {:else}
                      <span class="text-rose-400">
                        - {formatCurrency(mov.monto, mov.co_mone)}
                      </span>
                    {/if}
                  </td>

                  <!-- Estado -->
                  <td class="px-5 py-3.5 text-center">
                    {#if mov.anulado}
                      <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/25 uppercase">
                        Anulado
                      </span>
                    {:else if mov.conciliado}
                      <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 uppercase">
                        Conciliado
                      </span>
                    {:else}
                      <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase">
                        Pendiente
                      </span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>

      <!-- Modal Footer with Pagination -->
      <div class="p-4 px-6 md:px-8 border-t border-border-subtle bg-surface-base/50 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
        <p class="text-xs text-text-muted">
          Mostrando <span class="font-bold text-text-base">{movsList.length}</span> de <span class="font-bold text-text-base">{movsPagination.total}</span> movimientos encontrados
        </p>

        <div class="flex items-center gap-3">
          {#if movsPagination.totalPages > 1}
            <div class="flex items-center gap-1">
              <button
                type="button"
                onclick={() => loadAccountMovements(movsPagination.page - 1)}
                disabled={movsPagination.page <= 1 || movsLoading}
                class="px-3 py-1.5 rounded-xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base text-xs font-bold disabled:opacity-30 transition-all border border-border-subtle cursor-pointer disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span class="px-2 text-xs font-mono font-bold text-text-muted">
                {movsPagination.page} / {movsPagination.totalPages}
              </span>
              <button
                type="button"
                onclick={() => loadAccountMovements(movsPagination.page + 1)}
                disabled={movsPagination.page >= movsPagination.totalPages || movsLoading}
                class="px-3 py-1.5 rounded-xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base text-xs font-bold disabled:opacity-30 transition-all border border-border-subtle cursor-pointer disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          {/if}

          <button
            type="button"
            onclick={() => (showMovementsModal = false)}
            class="px-6 py-2.5 rounded-xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base text-xs font-bold transition-all border border-border-subtle cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
