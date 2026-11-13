<script lang="ts">
  import { page } from "$app/stores";
  import { goto, invalidateAll } from "$app/navigation";
  import { enhance } from "$app/forms";
  import {
    Landmark,
    Plus,
    Eye,
    Printer,
    Pen,
    Ban,
    Trash2,
    ChevronLeft,
    ChevronRight,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Store,
    Scale,
    AlertTriangle,
    Lock,
    X,
    ArrowRightLeft,
    CheckCircle2,
    Clock,
    Loader2,
  } from "lucide-svelte";
  import { fade } from "svelte/transition";
  import { toast } from "svelte-sonner";
  import SearchBar from "$lib/components/ui/SearchBar.svelte";
  import Combobox from "$lib/components/ui/Combobox.svelte";

  let { data } = $props();

  let selectedBranch = $state(data.selectedBranchId);
  let searchInput = $state(data.filters?.search || "");
  let filterCodCta = $state(data.filters?.cod_cta || "");
  let filterTipoOp = $state(data.filters?.tipo_op || "");
  let filterOrigen = $state(data.filters?.origen || "");
  let filterEstado = $state(data.filters?.estado || "all");
  let filterFecD = $state(data.filters?.fecha_d || "");
  let filterFecH = $state(data.filters?.fecha_h || "");

  // Modales
  let showDetailModal = $state(false);
  let loadingDetail = $state(false);
  let detailData = $state<any>(null);

  let showVoidModal = $state(false);
  let movToVoid = $state<any>(null);
  let voidPassword = $state("");
  let isVoiding = $state(false);

  let showDeleteModal = $state(false);
  let movToDelete = $state<any>(null);
  let deletePassword = $state("");
  let isDeleting = $state(false);

  $effect(() => {
    selectedBranch = data.selectedBranchId;
    searchInput = data.filters?.search || "";
    filterCodCta = data.filters?.cod_cta || "";
    filterTipoOp = data.filters?.tipo_op || "";
    filterOrigen = data.filters?.origen || "";
    filterEstado = data.filters?.estado || "all";
    filterFecD = data.filters?.fecha_d || "";
    filterFecH = data.filters?.fecha_h || "";
  });

  const accountOptions = $derived([
    { value: "", label: "Todas las Cuentas" },
    ...(data.cuentasBancarias || []).map((c: any) => ({
      value: c.cod_cta,
      label: `${c.cod_cta} · ${c.des_ban} (${c.co_mone})`,
    })),
  ]);

  function formatDate(val: any) {
    if (!val) return "-";
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val).slice(0, 10);
    return d.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formatAmount(val: number, coMone: string) {
    const n = Number(val || 0);
    const isUSD = coMone && !["BS", "BSS", "BS.", "VEF", "VES"].includes(coMone.toUpperCase());
    if (isUSD) {
      return `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `Bs. ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function applyFilters(overrides: Record<string, any> = {}) {
    const q = new URLSearchParams();
    const branch = overrides.branch_id ?? selectedBranch;
    const s = overrides.search ?? searchInput;
    const cta = overrides.cod_cta ?? filterCodCta;
    const tp = overrides.tipo_op ?? filterTipoOp;
    const org = overrides.origen ?? filterOrigen;
    const est = overrides.estado ?? filterEstado;
    const fd = overrides.fecha_d ?? filterFecD;
    const fh = overrides.fecha_h ?? filterFecH;
    const sortBy = overrides.sortBy ?? data.filters?.sortBy ?? "fecha";
    const sortDir = overrides.sortDir ?? data.filters?.sortDir ?? "desc";
    const p = overrides.page ?? 1;

    if (branch) q.set("branch_id", branch);
    if (s) q.set("search", s);
    if (cta) q.set("cod_cta", cta);
    if (tp) q.set("tipo_op", tp);
    if (org) q.set("origen", org);
    if (est && est !== "all") q.set("estado", est);
    if (fd) q.set("fecha_d", fd);
    if (fh) q.set("fecha_h", fh);
    if (sortBy) q.set("sortBy", sortBy);
    if (sortDir) q.set("sortDir", sortDir);
    q.set("page", String(p));

    goto(`/dashboard/banks/movements/history?${q.toString()}`);
  }

  function clearFilters() {
    searchInput = "";
    filterCodCta = "";
    filterTipoOp = "";
    filterOrigen = "";
    filterEstado = "all";
    filterFecD = "";
    filterFecH = "";
    applyFilters({
      search: "",
      cod_cta: "",
      tipo_op: "",
      origen: "",
      estado: "all",
      fecha_d: "",
      fecha_h: "",
      page: 1,
    });
  }

  function toggleSort(col: string) {
    const currentBy = data.filters?.sortBy || "fecha";
    const currentDir = data.filters?.sortDir || "desc";
    const nextDir = currentBy === col && currentDir === "desc" ? "asc" : "desc";
    applyFilters({ sortBy: col, sortDir: nextDir, page: 1 });
  }

  async function openDetailModal(mov: any) {
    showDetailModal = true;
    loadingDetail = true;
    detailData = mov;
    try {
      const res = await fetch(
        `/api/agent/bancos/movimientos/${encodeURIComponent(mov.mov_num)}?branch_id=${encodeURIComponent(selectedBranch)}`
      );
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        detailData = json.data;
      }
    } catch (e) {
      // Mantiene datos básicos de la fila si falla recarga detalle
    } finally {
      loadingDetail = false;
    }
  }

  function openVoidModal(mov: any) {
    movToVoid = mov;
    voidPassword = "";
    showVoidModal = true;
  }

  function openDeleteModal(mov: any) {
    movToDelete = mov;
    deletePassword = "";
    showDeleteModal = true;
  }

  function naturalezaBadgeClass(nat: string) {
    if (nat === "INGRESO") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    if (nat === "IDB") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    return "bg-rose-500/15 text-rose-400 border-rose-500/30";
  }

  function origenBadgeClass(origen: string) {
    if (origen === "BAN") return "bg-brand-500/15 text-brand-400 border-brand-500/30";
    if (origen === "COB") return "bg-sky-500/15 text-sky-400 border-sky-500/30";
    if (origen === "PAG") return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    return "bg-surface-strong text-text-muted border-border-subtle";
  }
</script>

<div class="max-w-[1440px] mx-auto space-y-6 pb-20">
  <!-- HEADER -->
  <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Landmark size={40} class="text-brand-500" />
        Historial de Movimientos Bancarios
      </h1>
      <p class="text-text-muted mt-2 text-base">
        Consulta integral, impresión, edición, anulación y auditoría de movimientos en cuentas bancarias.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <a
        href="/dashboard/banks/reconciliation?branch_id={encodeURIComponent(selectedBranch)}"
        class="h-12 px-5 rounded-2xl bg-surface-strong hover:bg-surface-base text-text-base border border-border-subtle font-bold text-sm flex items-center gap-2 transition-all"
      >
        <Scale size={17} class="text-brand-400" />
        Conciliación
      </a>

      {#if data.canCreate}
        <a
          href="/dashboard/banks/movements?branch_id={encodeURIComponent(selectedBranch)}"
          class="h-12 px-6 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-brand-500/25 transition-all active:scale-95"
        >
          <Plus size={18} />
          Nuevo Movimiento
        </a>
      {/if}
    </div>
  </div>

  {#if data.error}
    <div class="glass p-5 rounded-3xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm font-semibold">
      {data.error}
    </div>
  {/if}

  <!-- KPI CARDS -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
    <div class="glass p-5 rounded-3xl border border-border-subtle shadow-lg">
      <span class="text-[11px] font-black uppercase tracking-widest text-text-muted">Total Movimientos</span>
      <div class="text-3xl font-black text-text-base mt-2 font-mono">{data.metrics.total_registros}</div>
      <p class="text-xs text-text-muted mt-1">Según filtros aplicados</p>
    </div>

    <div class="glass p-5 rounded-3xl border border-border-subtle shadow-lg">
      <span class="text-[11px] font-black uppercase tracking-widest text-emerald-400">Ingresos Activos</span>
      <div class="text-2xl font-black text-emerald-400 mt-2 font-mono">
        {formatAmount(data.metrics.total_ingresos_bs, "BS")}
      </div>
      {#if data.metrics.total_ingresos_usd > 0}
        <p class="text-xs font-mono font-bold text-emerald-300 mt-1">
          + {formatAmount(data.metrics.total_ingresos_usd, "USD")}
        </p>
      {:else}
        <p class="text-xs text-text-muted mt-1">Depósitos, NC y TP</p>
      {/if}
    </div>

    <div class="glass p-5 rounded-3xl border border-border-subtle shadow-lg">
      <span class="text-[11px] font-black uppercase tracking-widest text-rose-400">Egresos e IDB Activos</span>
      <div class="text-2xl font-black text-rose-400 mt-2 font-mono">
        {formatAmount(data.metrics.total_egresos_bs + data.metrics.total_idb_bs, "BS")}
      </div>
      {#if data.metrics.total_egresos_usd + data.metrics.total_idb_usd > 0}
        <p class="text-xs font-mono font-bold text-rose-300 mt-1">
          + {formatAmount(data.metrics.total_egresos_usd + data.metrics.total_idb_usd, "USD")}
        </p>
      {:else}
        <p class="text-xs text-text-muted mt-1">Cheques, ND, TR, Retiros e IDB</p>
      {/if}
    </div>

    <div class="glass p-5 rounded-3xl border border-border-subtle shadow-lg">
      <span class="text-[11px] font-black uppercase tracking-widest text-text-muted">Conciliados / Anulados</span>
      <div class="flex items-baseline gap-3 mt-2">
        <span class="text-3xl font-black text-brand-400 font-mono">{data.metrics.total_conciliados}</span>
        <span class="text-text-muted">/</span>
        <span class="text-2xl font-black text-rose-400 font-mono">{data.metrics.total_anulados}</span>
      </div>
      <p class="text-xs text-text-muted mt-1">Conciliados vs sin efecto</p>
    </div>
  </div>

  <!-- FILTERS BAR -->
  <div class="glass p-4 rounded-3xl border border-border-subtle shadow-xl space-y-3">
    <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
      {#if data.branches && data.branches.length > 1}
        <div class="md:col-span-2 relative">
          <Store size={16} class="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <select
            bind:value={selectedBranch}
            onchange={() => applyFilters({ branch_id: selectedBranch, page: 1 })}
            class="w-full h-14 pl-10 pr-4 bg-surface-soft border border-border-subtle rounded-2xl text-sm font-semibold outline-none cursor-pointer"
          >
            {#each data.branches as b}
              <option value={b.id}>{b.name}</option>
            {/each}
          </select>
        </div>
      {/if}

      <div class="{data.branches && data.branches.length > 1 ? 'md:col-span-4' : 'md:col-span-6'}">
        <SearchBar
          bind:value={searchInput}
          placeholder="Buscar por N° Mov, Referencia, Concepto o Banco..."
          onsubmit={() => applyFilters({ search: searchInput, page: 1 })}
        />
      </div>

      <div class="md:col-span-3">
        <Combobox
          options={accountOptions}
          bind:value={filterCodCta}
          placeholder="Cuenta Bancaria"
          onchange={() => applyFilters({ cod_cta: filterCodCta, page: 1 })}
        />
      </div>

      <div class="md:col-span-3 grid grid-cols-2 gap-2">
        <select
          bind:value={filterTipoOp}
          onchange={() => applyFilters({ tipo_op: filterTipoOp, page: 1 })}
          class="h-14 px-3 bg-surface-soft border border-border-subtle rounded-2xl text-xs font-bold outline-none cursor-pointer"
        >
          <option value="">Todos Tipos</option>
          <option value="DP">DP · Depósito</option>
          <option value="NC">NC · Nota Crédito</option>
          <option value="TP">TP · Transf. Pos.</option>
          <option value="TR">TR · Transf. Neg.</option>
          <option value="ND">ND · Nota Débito</option>
          <option value="CH">CH · Cheque</option>
          <option value="RC">RC · Retiro</option>
          <option value="ID">ID · IDB / IGTF</option>
        </select>

        <select
          bind:value={filterEstado}
          onchange={() => applyFilters({ estado: filterEstado, page: 1 })}
          class="h-14 px-3 bg-surface-soft border border-border-subtle rounded-2xl text-xs font-bold outline-none cursor-pointer"
        >
          <option value="all">Todos Estados</option>
          <option value="activos">Activos</option>
          <option value="conciliados">Conciliados</option>
          <option value="no_conciliados">Por Conciliar</option>
          <option value="anulados">Anulados</option>
        </select>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3 pt-1">
      <select
        bind:value={filterOrigen}
        onchange={() => applyFilters({ origen: filterOrigen, page: 1 })}
        class="h-11 px-3.5 bg-surface-soft border border-border-subtle rounded-xl text-xs font-bold outline-none cursor-pointer"
      >
        <option value="">Todos Orígenes</option>
        <option value="BAN">BAN · Banco Directo</option>
        <option value="COB">COB · Cobros Clientes</option>
        <option value="PAG">PAG · Pagos Proveedores</option>
        <option value="DEP">DEP · Depósitos</option>
      </select>

      <div class="flex items-center gap-2">
        <span class="text-xs font-bold text-text-muted">Desde:</span>
        <input
          type="date"
          bind:value={filterFecD}
          onchange={() => applyFilters({ fecha_d: filterFecD, page: 1 })}
          class="h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-xs font-medium outline-none"
        />
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs font-bold text-text-muted">Hasta:</span>
        <input
          type="date"
          bind:value={filterFecH}
          onchange={() => applyFilters({ fecha_h: filterFecH, page: 1 })}
          class="h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-xs font-medium outline-none"
        />
      </div>

      {#if searchInput || filterCodCta || filterTipoOp || filterOrigen || filterEstado !== "all" || filterFecD || filterFecH}
        <button
          type="button"
          onclick={clearFilters}
          class="h-11 px-4 rounded-xl bg-surface-strong hover:bg-surface-base text-xs font-bold text-text-muted hover:text-text-base border border-border-subtle transition-all cursor-pointer"
        >
          Limpiar Filtros
        </button>
      {/if}
    </div>
  </div>

  <!-- TABLE -->
  <div class="glass rounded-3xl border border-border-subtle shadow-xl overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b border-border-subtle bg-surface-soft/60 text-[11px] font-black uppercase tracking-wider text-text-muted">
            <th class="p-4">
              <button onclick={() => toggleSort("tipo_op")} class="flex items-center gap-1 cursor-pointer hover:text-text-base">
                TIPO / ORIGEN
                {#if data.filters?.sortBy === "tipo_op"}
                  {#if data.filters.sortDir === "asc"}<ArrowUp size={13} />{:else}<ArrowDown size={13} />{/if}
                {:else}<ArrowUpDown size={13} class="opacity-40" />{/if}
              </button>
            </th>
            <th class="p-4">
              <button onclick={() => toggleSort("mov_num")} class="flex items-center gap-1 cursor-pointer hover:text-text-base">
                N° MOV. / REF.
                {#if data.filters?.sortBy === "mov_num"}
                  {#if data.filters.sortDir === "asc"}<ArrowUp size={13} />{:else}<ArrowDown size={13} />{/if}
                {:else}<ArrowUpDown size={13} class="opacity-40" />{/if}
              </button>
            </th>
            <th class="p-4">
              <button onclick={() => toggleSort("cod_cta")} class="flex items-center gap-1 cursor-pointer hover:text-text-base">
                CUENTA BANCARIA
                {#if data.filters?.sortBy === "cod_cta"}
                  {#if data.filters.sortDir === "asc"}<ArrowUp size={13} />{:else}<ArrowDown size={13} />{/if}
                {:else}<ArrowUpDown size={13} class="opacity-40" />{/if}
              </button>
            </th>
            <th class="p-4">
              <button onclick={() => toggleSort("fecha")} class="flex items-center gap-1 cursor-pointer hover:text-text-base">
                FECHA
                {#if data.filters?.sortBy === "fecha"}
                  {#if data.filters.sortDir === "asc"}<ArrowUp size={13} />{:else}<ArrowDown size={13} />{/if}
                {:else}<ArrowUpDown size={13} class="opacity-40" />{/if}
              </button>
            </th>
            <th class="p-4">CONCEPTO / CTA ING-EGR</th>
            <th class="p-4 text-right">
              <button onclick={() => toggleSort("monto")} class="flex items-center gap-1 ml-auto cursor-pointer hover:text-text-base">
                MONTO
                {#if data.filters?.sortBy === "monto"}
                  {#if data.filters.sortDir === "asc"}<ArrowUp size={13} />{:else}<ArrowDown size={13} />{/if}
                {:else}<ArrowUpDown size={13} class="opacity-40" />{/if}
              </button>
            </th>
            <th class="p-4">USUARIO</th>
            <th class="p-4 text-center">ESTADO</th>
            <th class="p-4 text-right">ACCIONES</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle/50 text-sm">
          {#if data.movements.length === 0}
            <tr>
              <td colspan="9" class="p-12 text-center text-text-muted">
                No se encontraron movimientos bancarios con los criterios seleccionados.
              </td>
            </tr>
          {:else}
            {#each data.movements as m}
              <tr class="hover:bg-surface-soft/40 transition-colors {m.anulado ? 'opacity-60' : ''}">
                <td class="p-4">
                  <div class="flex items-center gap-1.5">
                    <span class="px-2 py-0.5 rounded-lg text-[11px] font-black font-mono border {naturalezaBadgeClass(m.naturaleza)}">
                      {m.tipo_op}
                    </span>
                    <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono border {origenBadgeClass(m.origen)}">
                      {m.origen}
                    </span>
                  </div>
                </td>

                <td class="p-4">
                  <div class="font-mono font-bold text-text-base">{m.mov_num}</div>
                  {#if m.doc_num && m.doc_num !== m.mov_num}
                    <div class="text-[11px] font-mono text-text-muted">Ref: {m.doc_num}</div>
                  {/if}
                  {#if m.es_transferencia}
                    <div class="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 text-[10px] font-bold">
                      <ArrowRightLeft size={10} /> Transf. #{m.co_trans_ban}
                    </div>
                  {:else if m.cob_pag}
                    <div class="text-[10px] font-mono text-text-muted">{m.origen} #{m.cob_pag}</div>
                  {/if}
                </td>

                <td class="p-4">
                  <div class="font-bold text-text-base">{m.des_ban}</div>
                  <div class="text-[11px] font-mono text-text-muted">{m.cod_cta} · {m.co_mone}</div>
                </td>

                <td class="p-4 whitespace-nowrap font-mono text-xs font-semibold text-text-base">
                  {formatDate(m.fecha)}
                  {#if m.conciliado && m.fec_con}
                    <div class="text-[10px] text-emerald-400">Conc: {formatDate(m.fec_con)}</div>
                  {/if}
                </td>

                <td class="p-4 max-w-xs">
                  <div class="text-xs font-semibold text-text-base truncate" title={m.descrip}>
                    {m.descrip || "-"}
                  </div>
                  <div class="text-[11px] text-text-muted truncate">
                    {m.co_cta_ingr_egr} · {m.cta_ing_egr_des}
                  </div>
                </td>

                <td class="p-4 text-right whitespace-nowrap">
                  <div class="font-mono font-black {m.anulado ? 'line-through text-text-muted' : m.naturaleza === 'INGRESO' ? 'text-emerald-400' : m.naturaleza === 'IDB' ? 'text-amber-400' : 'text-rose-400'}">
                    {m.naturaleza === "INGRESO" ? "+" : "-"} {formatAmount(m.monto, m.co_mone)}
                  </div>
                  {#if m.idb > 0 && m.tipo_op !== "ID"}
                    <div class="text-[10px] font-mono text-amber-400">
                      IDB: {formatAmount(m.idb, m.co_mone)}
                    </div>
                  {/if}
                </td>

                <td class="p-4 text-xs font-medium text-text-muted">
                  {m.usuario_nombre}
                </td>

                <td class="p-4 text-center">
                  {#if m.anulado}
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-500/15 text-rose-400 border border-rose-500/20">
                      Anulado
                    </span>
                  {:else if m.conciliado}
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 size={12} /> Conciliado
                    </span>
                  {:else}
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-500/15 text-amber-400 border border-amber-500/20">
                      <Clock size={12} /> Pendiente
                    </span>
                  {/if}
                </td>

                <td class="p-4 text-right">
                  <div class="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onclick={() => openDetailModal(m)}
                      class="p-2 rounded-xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-brand-400 border border-border-subtle transition-all cursor-pointer"
                      title="Ver Detalle"
                    >
                      <Eye size={15} />
                    </button>

                    <a
                      href="/dashboard/banks/movements/{encodeURIComponent(m.mov_num)}/print?branch_id={encodeURIComponent(selectedBranch)}"
                      target="_blank"
                      class="p-2 rounded-xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base border border-border-subtle transition-all"
                      title="Imprimir PDF"
                    >
                      <Printer size={15} />
                    </a>

                    {#if m.editable && data.canEdit}
                      <a
                        href="/dashboard/banks/movements?branch_id={encodeURIComponent(selectedBranch)}&edit_mov={encodeURIComponent(m.mov_num)}"
                        class="p-2 rounded-xl bg-surface-soft hover:bg-brand-500/20 text-text-muted hover:text-brand-400 border border-border-subtle transition-all"
                        title="Editar Movimiento"
                      >
                        <Pen size={15} />
                      </a>
                    {/if}

                    {#if m.anulable && data.canVoid}
                      <button
                        type="button"
                        onclick={() => openVoidModal(m)}
                        class="p-2 rounded-xl bg-surface-soft hover:bg-amber-500/20 text-text-muted hover:text-amber-400 border border-border-subtle transition-all cursor-pointer"
                        title="Anular Movimiento"
                      >
                        <Ban size={15} />
                      </button>
                    {/if}

                    {#if m.eliminable && data.canDelete}
                      <button
                        type="button"
                        onclick={() => openDeleteModal(m)}
                        class="p-2 rounded-xl bg-surface-soft hover:bg-rose-500/20 text-text-muted hover:text-rose-400 border border-border-subtle transition-all cursor-pointer"
                        title="Eliminar Definitivamente"
                      >
                        <Trash2 size={15} />
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
    <div class="p-4 border-t border-border-subtle bg-surface-soft/30 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-text-muted">
      <div>
        Mostrando página <strong class="text-text-base">{data.pagination.page}</strong> de{" "}
        <strong class="text-text-base">{data.pagination.totalPages}</strong> ·{" "}
        <strong class="text-text-base">{data.pagination.total}</strong> registros totales
      </div>
      <div class="flex items-center gap-2">
        <button
          disabled={data.pagination.page <= 1}
          onclick={() => applyFilters({ page: data.pagination.page - 1 })}
          class="px-3 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle disabled:opacity-40 cursor-pointer flex items-center gap-1 font-bold"
        >
          <ChevronLeft size={14} /> Anterior
        </button>
        <button
          disabled={data.pagination.page >= data.pagination.totalPages}
          onclick={() => applyFilters({ page: data.pagination.page + 1 })}
          class="px-3 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle disabled:opacity-40 cursor-pointer flex items-center gap-1 font-bold"
        >
          Siguiente <ChevronRight size={14} />
        </button>
      </div>
    </div>
  </div>
</div>

<!-- DETAIL MODAL -->
{#if showDetailModal && detailData}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade={{ duration: 150 }}>
    <div class="glass w-full max-w-2xl rounded-3xl border border-border-subtle shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
      <div class="p-6 border-b border-border-subtle flex items-center justify-between">
        <div>
          <span class="text-[11px] font-black uppercase tracking-widest text-brand-400">Detalle de Movimiento Bancario</span>
          <h3 class="text-2xl font-black font-mono text-text-base mt-0.5">{detailData.mov_num}</h3>
        </div>
        <button
          type="button"
          onclick={() => (showDetailModal = false)}
          class="p-2 rounded-xl hover:bg-surface-strong text-text-muted hover:text-text-base cursor-pointer"
        >
          <X size={20} />
        </button>
      </div>

      <div class="p-6 overflow-y-auto space-y-5 text-sm">
        {#if loadingDetail}
          <div class="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 size={14} class="animate-spin" /> Cargando información completa...
          </div>
        {/if}

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-surface-soft/50 p-4 rounded-2xl border border-border-subtle">
          <div>
            <span class="text-[10px] uppercase font-bold text-text-muted block">Tipo Operación</span>
            <span class="font-bold text-text-base">{detailData.tipo_op} · {detailData.tipo_op_label}</span>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-text-muted block">Origen Profit</span>
            <span class="font-mono font-bold text-text-base">{detailData.origen}</span>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-text-muted block">Fecha</span>
            <span class="font-mono font-bold text-text-base">{formatDate(detailData.fecha)}</span>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-text-muted block">Cuenta Bancaria</span>
            <span class="font-bold text-text-base">{detailData.des_ban} ({detailData.cod_cta})</span>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-text-muted block">N° Referencia</span>
            <span class="font-mono font-bold text-text-base">{detailData.doc_num || "-"}</span>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-text-muted block">Monto ({detailData.co_mone})</span>
            <span class="font-mono font-black text-brand-400">{formatAmount(detailData.monto, detailData.co_mone)}</span>
          </div>
        </div>

        <div class="bg-surface-soft/40 p-4 rounded-2xl border border-border-subtle space-y-1.5">
          <span class="text-[10px] uppercase font-bold text-text-muted block">Concepto / Descripción</span>
          <p class="text-text-base font-medium">{detailData.descrip || "Sin descripción"}</p>
          <p class="text-xs text-text-muted pt-1">
            Cta. Ingreso/Egreso: <strong>{detailData.co_cta_ingr_egr}</strong> · {detailData.cta_ing_egr_des || ""}
          </p>
        </div>

        {#if detailData.transferencia}
          <div class="bg-brand-500/5 p-4 rounded-2xl border border-brand-500/20 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-black uppercase tracking-wider text-brand-400 flex items-center gap-1.5">
                <ArrowRightLeft size={14} /> Transferencia entre Cuentas #{detailData.transferencia.co_trans_ban}
              </span>
              <span class="text-xs font-bold">{detailData.transferencia.procesado ? "Activa" : "Anulada"}</span>
            </div>
            <div class="space-y-2">
              {#each detailData.transferencia.movimientos_vinculados || [] as leg}
                <div class="flex items-center justify-between text-xs bg-surface-base/60 p-2.5 rounded-xl border border-border-subtle">
                  <div>
                    <span class="font-mono font-black">{leg.tipo_op}</span> · {leg.mov_num} ({leg.des_ban} / {leg.cod_cta})
                  </div>
                  <div class="font-mono font-bold">
                    {leg.tipo_op === "TP"
                      ? `+ ${formatAmount(leg.monto_h, leg.co_mone)}`
                      : `- ${formatAmount(leg.monto_d, leg.co_mone)}`}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <div class="p-4 border-t border-border-subtle flex justify-end gap-3 bg-surface-soft/30">
        <a
          href="/dashboard/banks/movements/{encodeURIComponent(detailData.mov_num)}/print?branch_id={encodeURIComponent(selectedBranch)}"
          target="_blank"
          class="px-5 py-2.5 rounded-xl bg-surface-strong hover:bg-surface-base text-text-base font-bold text-xs flex items-center gap-2 border border-border-subtle"
        >
          <Printer size={15} /> Imprimir Comprobante
        </a>
        {#if detailData.origen === "BAN" && !detailData.anulado && !detailData.conciliado && data.canEdit}
          <a
            href="/dashboard/banks/movements?branch_id={encodeURIComponent(selectedBranch)}&edit_mov={encodeURIComponent(detailData.mov_num)}"
            class="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs flex items-center gap-2"
          >
            <Pen size={15} /> Editar
          </a>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- VOID MODAL -->
{#if showVoidModal && movToVoid}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade={{ duration: 150 }}>
    <form
      method="POST"
      action="?/voidMovement"
      use:enhance={() => {
        isVoiding = true;
        return async ({ result, update }) => {
          isVoiding = false;
          if (result.type === "success") {
            toast.success((result.data as any)?.message || "Movimiento anulado.");
            showVoidModal = false;
            await invalidateAll();
          } else {
            toast.error((result as any).data?.message || "No se pudo anular el movimiento.");
            await update({ reset: false });
          }
        };
      }}
      class="glass w-full max-w-md rounded-3xl border border-amber-500/30 p-6 space-y-5 shadow-2xl"
    >
      <input type="hidden" name="mov_num" value={movToVoid.mov_num} />
      <input type="hidden" name="branch_id" value={selectedBranch} />

      <div class="flex items-start gap-3">
        <div class="h-11 w-11 rounded-2xl bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
          <AlertTriangle size={22} />
        </div>
        <div>
          <h3 class="text-lg font-black text-text-base">Anular Movimiento {movToVoid.mov_num}</h3>
          <p class="text-xs text-text-muted mt-1">
            {#if movToVoid.es_transferencia}
              Este movimiento pertenece a la Transferencia #{movToVoid.co_trans_ban}. Se anularán ambos lados de la transferencia y se ajustarán los saldos bancarios.
            {:else}
              El movimiento quedará marcado como anulado en Profit Plus y el saldo bancario será recalculado.
            {/if}
          </p>
        </div>
      </div>

      <div>
        <label for="void_pass" class="text-xs font-bold text-text-muted block mb-1.5 flex items-center gap-1">
          <Lock size={12} /> Contraseña de confirmación
        </label>
        <input
          id="void_pass"
          type="password"
          name="password"
          bind:value={voidPassword}
          required
          placeholder="Ingresa tu contraseña"
          class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm outline-none focus:border-amber-500"
        />
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onclick={() => (showVoidModal = false)}
          class="px-4 py-2.5 rounded-xl bg-surface-soft text-text-muted font-bold text-xs cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isVoiding}
          class="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
        >
          {isVoiding ? "Anulando..." : "Confirmar Anulación"}
        </button>
      </div>
    </form>
  </div>
{/if}

<!-- DELETE MODAL -->
{#if showDeleteModal && movToDelete}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade={{ duration: 150 }}>
    <form
      method="POST"
      action="?/deleteMovement"
      use:enhance={() => {
        isDeleting = true;
        return async ({ result, update }) => {
          isDeleting = false;
          if (result.type === "success") {
            toast.success((result.data as any)?.message || "Movimiento eliminado.");
            showDeleteModal = false;
            await invalidateAll();
          } else {
            toast.error((result as any).data?.message || "No se pudo eliminar el movimiento.");
            await update({ reset: false });
          }
        };
      }}
      class="glass w-full max-w-md rounded-3xl border border-rose-500/30 p-6 space-y-5 shadow-2xl"
    >
      <input type="hidden" name="mov_num" value={movToDelete.mov_num} />
      <input type="hidden" name="branch_id" value={selectedBranch} />

      <div class="flex items-start gap-3">
        <div class="h-11 w-11 rounded-2xl bg-rose-500/15 flex items-center justify-center text-rose-400 shrink-0">
          <Trash2 size={22} />
        </div>
        <div>
          <h3 class="text-lg font-black text-text-base">Eliminar Movimiento {movToDelete.mov_num}</h3>
          <p class="text-xs text-text-muted mt-1">
            {#if movToDelete.es_transferencia}
              ¡Acción irreversible! Se eliminará físicamente la Transferencia #{movToDelete.co_trans_ban} junto con todos sus movimientos bancarios vinculados.
            {:else}
              ¡Acción irreversible! El registro se eliminará físicamente de Profit Plus mediante el procedimiento oficial y recalculará saldos.
            {/if}
          </p>
        </div>
      </div>

      <div>
        <label for="del_pass" class="text-xs font-bold text-text-muted block mb-1.5 flex items-center gap-1">
          <Lock size={12} /> Contraseña de confirmación
        </label>
        <input
          id="del_pass"
          type="password"
          name="password"
          bind:value={deletePassword}
          required
          placeholder="Ingresa tu contraseña"
          class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm outline-none focus:border-rose-500"
        />
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onclick={() => (showDeleteModal = false)}
          class="px-4 py-2.5 rounded-xl bg-surface-soft text-text-muted font-bold text-xs cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isDeleting}
          class="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
        >
          {isDeleting ? "Eliminando..." : "Eliminar Definitivamente"}
        </button>
      </div>
    </form>
  </div>
{/if}

