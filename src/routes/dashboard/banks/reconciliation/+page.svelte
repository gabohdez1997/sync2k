<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import {
    Scale,
    Landmark,
    Store,
    Calendar,
    Printer,
    Save,
    RotateCcw,
    CheckSquare,
    Square,
    CheckCircle2,
    Clock,
    AlertTriangle,
    Loader2,
    ArrowRightLeft,
    SlidersHorizontal,
    Sparkles,
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import SearchBar from "$lib/components/ui/SearchBar.svelte";
  import Combobox from "$lib/components/ui/Combobox.svelte";

  let { data } = $props();

  const MONTH_NAMES = [
    { value: 1, label: "Enero" },
    { value: 2, label: "Febrero" },
    { value: 3, label: "Marzo" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Mayo" },
    { value: 6, label: "Junio" },
    { value: 7, label: "Julio" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Septiembre" },
    { value: 10, label: "Octubre" },
    { value: 11, label: "Noviembre" },
    { value: 12, label: "Diciembre" },
  ];

  // Selectores de período/cuenta
  let selectedBranch = $state(data.selectedBranchId);
  let selectedCodCta = $state(data.selectedCodCta);
  let selectedAnio = $state(data.anio);
  let selectedMes = $state(data.mes);

  // Estado interactivo de conciliación
  let checkedMap = $state<Record<string, boolean>>({});
  let bankStatementBalance = $state<string>("");
  let isSaving = $state(false);

  // Filtros de tabla local
  let searchQuery = $state("");
  let statusFilter = $state<"all" | "conciliados" | "pendientes" | "modificados">("all");
  let originFilter = $state("");
  let natureFilter = $state("");

  function buildInitialMap(movs: any[]) {
    const m: Record<string, boolean> = {};
    for (const row of movs || []) {
      m[row.mov_num] = Boolean(row.conciliado);
    }
    return m;
  }

  $effect(() => {
    selectedBranch = data.selectedBranchId;
    selectedCodCta = data.selectedCodCta;
    selectedAnio = data.anio;
    selectedMes = data.mes;
    checkedMap = buildInitialMap(data.reconciliation?.movimientos || []);
  });

  function round2(n: number) {
    return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
  }

  const cuenta = $derived(data.reconciliation?.cuenta || null);
  const movimientos = $derived<any[]>(data.reconciliation?.movimientos || []);
  const resumen = $derived(data.reconciliation?.resumen || null);
  const coMone = $derived(cuenta?.co_mone || "BS");

  const accountOptions = $derived(
    (data.cuentasBancarias || []).map((c: any) => ({
      value: c.cod_cta,
      label: `${c.cod_cta} · ${c.des_ban} (${c.co_mone})${c.inactivo ? " [Inactiva]" : ""}`,
    }))
  );

  const yearOptions = $derived.by(() => {
    const cy = new Date().getFullYear();
    const minY = Math.min(cy - 4, selectedAnio - 2);
    const maxY = Math.max(cy + 1, selectedAnio + 1);
    const arr: number[] = [];
    for (let y = maxY; y >= minY; y--) arr.push(y);
    return arr;
  });

  function isUSD(currency: string) {
    return Boolean(currency && !["BS", "BSS", "BS.", "VEF", "VES"].includes(currency.toUpperCase()));
  }

  function formatMoney(val: number, currency: string = coMone) {
    const n = Number(val || 0);
    if (isUSD(currency)) {
      return `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `Bs. ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatDate(val: any) {
    if (!val) return "-";
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val).slice(0, 10);
    return d.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  // Lista de cambios pendientes respecto al estado cargado desde SQL
  const modifiedRows = $derived.by(() =>
    movimientos.filter((m) => Boolean(checkedMap[m.mov_num]) !== Boolean(m.conciliado))
  );

  // Cálculos dinámicos en vivo al marcar/desmarcar
  const liveTotals = $derived.by(() => {
    let ingConc = 0;
    let egrConc = 0;
    let idbConc = 0;
    let netConcDelta = 0;
    let countConc = 0;

    let ingPend = 0;
    let egrPend = 0;
    let idbPend = 0;
    let countPend = 0;

    for (const m of movimientos) {
      const checked = Boolean(checkedMap[m.mov_num]);
      const h = Number(m.monto_h || 0);
      const d = Number(m.monto_d || 0);
      const idbVal = Number(m.idb || 0);
      const efecto = Number(m.efecto_neto || 0);

      if (checked) {
        countConc++;
        netConcDelta += efecto;
        if (!m.saldo_ini) {
          ingConc += h;
          egrConc += d;
          idbConc += idbVal;
        }
      } else {
        countPend++;
        if (!m.saldo_ini) {
          ingPend += h;
          egrPend += d;
          idbPend += idbVal;
        }
      }
    }

    const saldoInicial = Number(resumen?.saldo_inicial_conciliado || 0);
    const saldoCalculado = round2(saldoInicial + netConcDelta);

    return {
      saldoInicial,
      ingConc: round2(ingConc),
      egrConc: round2(egrConc),
      idbConc: round2(idbConc),
      egresosTotalesConc: round2(egrConc + idbConc),
      netConcDelta: round2(netConcDelta),
      saldoCalculado,
      countConc,
      ingPend: round2(ingPend),
      egrPend: round2(egrPend),
      idbPend: round2(idbPend),
      countPend,
    };
  });

  const parsedBankStatement = $derived.by(() => {
    const raw = String(bankStatementBalance ?? "").trim();
    if (!raw) return null;
    const normalized = raw.replace(/\s+/g, "").replace(",", ".");
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  });

  const bankDifference = $derived.by(() => {
    if (parsedBankStatement === null) return null;
    return round2(parsedBankStatement - liveTotals.saldoCalculado);
  });

  const filteredMovements = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    return movimientos.filter((m) => {
      const isChecked = Boolean(checkedMap[m.mov_num]);
      const isModified = isChecked !== Boolean(m.conciliado);

      if (statusFilter === "conciliados" && !isChecked) return false;
      if (statusFilter === "pendientes" && isChecked) return false;
      if (statusFilter === "modificados" && !isModified) return false;

      if (originFilter && m.origen !== originFilter) return false;
      if (natureFilter && m.naturaleza !== natureFilter) return false;

      if (q) {
        const hay = `${m.mov_num} ${m.doc_num || ""} ${m.descrip || ""} ${m.cob_pag || ""} ${m.cta_ing_egr_des || ""} ${m.usuario_nombre || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  const allVisibleChecked = $derived(
    filteredMovements.length > 0 && filteredMovements.every((m) => Boolean(checkedMap[m.mov_num]))
  );

  function loadPeriod(overrides: Record<string, any> = {}) {
    if (modifiedRows.length > 0) {
      const proceed = confirm(
        `Tienes ${modifiedRows.length} cambio(s) sin guardar en la conciliación actual. ¿Deseas cambiar de vista sin guardar?`
      );
      if (!proceed) {
        selectedBranch = data.selectedBranchId;
        selectedCodCta = data.selectedCodCta;
        selectedAnio = data.anio;
        selectedMes = data.mes;
        return;
      }
    }

    const q = new URLSearchParams();
    q.set("branch_id", String(overrides.branch_id ?? selectedBranch));
    const cta = String(overrides.cod_cta ?? selectedCodCta);
    if (cta) q.set("cod_cta", cta);
    q.set("anio", String(overrides.anio ?? selectedAnio));
    q.set("mes", String(overrides.mes ?? selectedMes));
    goto(`/dashboard/banks/reconciliation?${q.toString()}`);
  }

  function toggleRow(movNum: string) {
    if (!data.canSave) return;
    checkedMap[movNum] = !checkedMap[movNum];
  }

  function setVisibleRows(state: boolean) {
    if (!data.canSave) return;
    for (const m of filteredMovements) {
      checkedMap[m.mov_num] = state;
    }
  }

  function resetChanges() {
    checkedMap = buildInitialMap(movimientos);
    toast.info("Se restauraron los cambios locales sin guardar.");
  }

  async function saveReconciliation() {
    if (!data.canSave || modifiedRows.length === 0 || isSaving) return;

    isSaving = true;
    try {
      const payload = {
        branch_id: selectedBranch,
        cod_cta: selectedCodCta,
        anio: selectedAnio,
        mes: selectedMes,
        movimientos: modifiedRows.map((m) => ({
          mov_num: m.mov_num,
          conciliado: Boolean(checkedMap[m.mov_num]),
        })),
      };

      const res = await fetch("/api/agent/bancos/conciliacion/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok || json.success === false) {
        toast.error(json.message || "Error al guardar la conciliación bancaria.");
        return;
      }

      toast.success(json.message || "Conciliación bancaria guardada correctamente.");
      await invalidateAll();
    } catch (e: any) {
      toast.error("Error de red guardando conciliación: " + e.message);
    } finally {
      isSaving = false;
    }
  }

  const printUrl = $derived.by(() => {
    const q = new URLSearchParams();
    q.set("branch_id", selectedBranch);
    q.set("cod_cta", selectedCodCta);
    q.set("anio", String(selectedAnio));
    q.set("mes", String(selectedMes));
    if (parsedBankStatement !== null) {
      q.set("saldo_banco", String(parsedBankStatement));
    }
    return `/dashboard/banks/reconciliation/print?${q.toString()}`;
  });
</script>

<svelte:head>
  <title>Conciliación Bancaria | Sync2K</title>
</svelte:head>

<div class="max-w-7xl mx-auto space-y-6 pb-12">
  <!-- HEADER -->
  <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
    <div class="flex items-center gap-3.5">
      <div class="p-3 rounded-2xl bg-brand-500/10 text-brand-400 border border-brand-500/20 shadow-sm">
        <Scale size={28} />
      </div>
      <div>
        <h1 class="text-2xl font-black tracking-tight text-text-base">Conciliación Bancaria</h1>
        <p class="text-sm text-text-muted">
          Marca los movimientos confirmados en el estado de cuenta bancario del mes para cuadrar el saldo.
        </p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2.5">
      <a
        href="/dashboard/banks/movements?branch_id={encodeURIComponent(selectedBranch)}"
        class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-raised hover:bg-surface-soft text-text-base font-bold text-sm border border-border-subtle transition-all"
      >
        <ArrowRightLeft size={16} class="text-brand-400" />
        Ir a Movimientos
      </a>

      {#if selectedCodCta && cuenta}
        <a
          href={printUrl}
          target="_blank"
          class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-raised hover:bg-surface-soft text-text-base font-bold text-sm border border-border-subtle transition-all"
        >
          <Printer size={16} />
          Imprimir Reporte
        </a>
      {/if}

      {#if data.canSave}
        <button
          type="button"
          onclick={saveReconciliation}
          disabled={modifiedRows.length === 0 || isSaving}
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg shadow-brand-500/20 transition-all cursor-pointer"
        >
          {#if isSaving}
            <Loader2 size={16} class="animate-spin" />
            Guardando...
          {:else}
            <Save size={16} />
            Guardar Conciliación
            {#if modifiedRows.length > 0}
              <span class="px-2 py-0.5 rounded-full bg-white/20 text-[11px] font-black">
                {modifiedRows.length}
              </span>
            {/if}
          {/if}
        </button>
      {/if}
    </div>
  </div>

  <!-- SELECTORES DE SUCURSAL, CUENTA Y PERÍODO -->
  <div class="bg-surface-raised border border-border-subtle rounded-2xl p-4 shadow-sm">
    <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
      <div class="md:col-span-3">
        <label for="rec-branch" class="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
          Sucursal
        </label>
        <div class="flex items-center gap-2 bg-surface-soft border border-border-subtle rounded-xl px-3 py-2.5">
          <Store size={16} class="text-brand-400 shrink-0" />
          <select
            id="rec-branch"
            bind:value={selectedBranch}
            onchange={() => loadPeriod({ branch_id: selectedBranch, cod_cta: "" })}
            class="bg-transparent text-sm font-bold text-text-base focus:outline-none w-full cursor-pointer"
          >
            {#each data.branches as b}
              <option value={b.id}>{b.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="md:col-span-5">
        <span class="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
          Cuenta Bancaria
        </span>
        <Combobox
          options={accountOptions}
          bind:value={selectedCodCta}
          placeholder="Seleccionar cuenta bancaria..."
          onchange={() => loadPeriod({ cod_cta: selectedCodCta })}
        />
      </div>

      <div class="md:col-span-2">
        <label for="rec-mes" class="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
          Mes
        </label>
        <div class="flex items-center gap-2 bg-surface-soft border border-border-subtle rounded-xl px-3 py-2.5">
          <Calendar size={15} class="text-text-muted shrink-0" />
          <select
            id="rec-mes"
            bind:value={selectedMes}
            onchange={() => loadPeriod({ mes: selectedMes })}
            class="bg-transparent text-sm font-bold text-text-base focus:outline-none w-full cursor-pointer"
          >
            {#each MONTH_NAMES as m}
              <option value={m.value}>{m.label}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="md:col-span-2">
        <label for="rec-anio" class="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
          Año
        </label>
        <select
          id="rec-anio"
          bind:value={selectedAnio}
          onchange={() => loadPeriod({ anio: selectedAnio })}
          class="w-full bg-surface-soft border border-border-subtle rounded-xl px-3 py-2.5 text-sm font-bold text-text-base focus:outline-none cursor-pointer"
        >
          {#each yearOptions as y}
            <option value={y}>{y}</option>
          {/each}
        </select>
      </div>
    </div>

    {#if cuenta}
      <div class="mt-3 pt-3 border-t border-border-subtle/60 flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted">
        <div class="flex flex-wrap items-center gap-4">
          <span class="inline-flex items-center gap-1.5">
            <Landmark size={14} class="text-brand-400" />
            <strong class="text-text-base">{cuenta.des_ban}</strong>
          </span>
          <span>Cuenta N°: <strong class="font-mono text-text-base">{cuenta.num_cta || "-"}</strong></span>
          <span>Moneda: <strong class="font-mono text-text-base">{cuenta.co_mone}</strong></span>
          <span>Saldo Total Libros Actual: <strong class="font-mono text-text-base">{formatMoney(cuenta.saldo_total_libros)}</strong></span>
        </div>
        <div>
          Saldo Conciliado Acumulado Global (SQL): <strong class="font-mono text-text-base">{formatMoney(cuenta.saldo_conciliado_global)}</strong>
        </div>
      </div>
    {/if}
  </div>

  {#if data.error}
    <div class="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
      <AlertTriangle size={18} />
      <span>{data.error}</span>
    </div>
  {/if}

  {#if data.hiddenOtherUsersCount > 0}
    <div class="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
      <AlertTriangle size={16} class="shrink-0" />
      <span>
        Se ocultaron <strong>{data.hiddenOtherUsersCount}</strong> movimiento(s) registrados por otros usuarios porque tu perfil no posee el permiso de terceros en Conciliación Bancaria.
      </span>
    </div>
  {/if}

  {#if data.reconciliation && cuenta}
    <!-- KPI & CUADRE CARDS -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <div class="bg-surface-raised border border-border-subtle rounded-2xl p-4 shadow-sm">
        <span class="text-[10px] font-black uppercase tracking-wider text-text-muted">Saldo Inicial Conciliado</span>
        <div class="text-lg font-black font-mono text-text-base mt-1">
          {formatMoney(liveTotals.saldoInicial)}
        </div>
        <div class="text-[11px] text-text-muted mt-1">
          Cierre mes {data.reconciliation.periodo?.prev_mes}/{data.reconciliation.periodo?.prev_anio}
        </div>
      </div>

      <div class="bg-surface-raised border border-border-subtle rounded-2xl p-4 shadow-sm">
        <span class="text-[10px] font-black uppercase tracking-wider text-text-muted">+ Ingresos Conciliados</span>
        <div class="text-lg font-black font-mono text-emerald-400 mt-1">
          {formatMoney(liveTotals.ingConc)}
        </div>
        <div class="text-[11px] text-text-muted mt-1">
          En tránsito: {formatMoney(liveTotals.ingPend)}
        </div>
      </div>

      <div class="bg-surface-raised border border-border-subtle rounded-2xl p-4 shadow-sm">
        <span class="text-[10px] font-black uppercase tracking-wider text-text-muted">- Egresos + IDB Conciliados</span>
        <div class="text-lg font-black font-mono text-rose-400 mt-1">
          {formatMoney(liveTotals.egresosTotalesConc)}
        </div>
        <div class="text-[11px] text-text-muted mt-1">
          IDB: {formatMoney(liveTotals.idbConc)} · Tránsito: {formatMoney(liveTotals.egrPend + liveTotals.idbPend)}
        </div>
      </div>

      <div class="bg-surface-raised border border-brand-500/30 rounded-2xl p-4 shadow-sm">
        <span class="text-[10px] font-black uppercase tracking-wider text-brand-400">= Saldo Conciliado Libros</span>
        <div class="text-lg font-black font-mono text-brand-400 mt-1">
          {formatMoney(liveTotals.saldoCalculado)}
        </div>
        <div class="text-[11px] text-text-muted mt-1">
          {liveTotals.countConc} conciliados · {liveTotals.countPend} pendientes
        </div>
      </div>

      <div class="bg-surface-raised border border-border-subtle rounded-2xl p-4 shadow-sm">
        <div class="flex items-center justify-between gap-1">
          <span class="text-[10px] font-black uppercase tracking-wider text-text-muted">Estado de Cuenta (Banco)</span>
          <button
            type="button"
            onclick={() => (bankStatementBalance = liveTotals.saldoCalculado.toFixed(2))}
            class="text-[10px] font-bold text-brand-400 hover:underline cursor-pointer"
            title="Copiar saldo conciliado calculado"
          >
            Igualar
          </button>
        </div>
        <input
          type="text"
          inputmode="decimal"
          bind:value={bankStatementBalance}
          placeholder="0.00"
          class="w-full mt-1.5 px-2.5 py-1.5 rounded-xl bg-surface-soft border border-border-subtle font-mono font-black text-base text-text-base focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
        <div class="text-[11px] text-text-muted mt-1">Saldo final según banco</div>
      </div>

      <div
        class="border rounded-2xl p-4 shadow-sm {bankDifference === null
          ? 'bg-surface-raised border-border-subtle'
          : Math.abs(bankDifference) < 0.01
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-amber-500/10 border-amber-500/30'}"
      >
        <span class="text-[10px] font-black uppercase tracking-wider text-text-muted">Diferencia por Conciliar</span>
        {#if bankDifference === null}
          <div class="text-sm font-bold text-text-muted mt-2">Ingresa saldo del banco</div>
          <div class="text-[11px] text-text-muted mt-1">Para verificar el cuadre</div>
        {:else if Math.abs(bankDifference) < 0.01}
          <div class="flex items-center gap-1.5 text-lg font-black text-emerald-400 mt-1">
            <CheckCircle2 size={20} />
            Cuadrado
          </div>
          <div class="text-[11px] text-emerald-300/80 mt-1 font-mono">{formatMoney(0)} de diferencia</div>
        {:else}
          <div class="text-lg font-black font-mono text-amber-400 mt-1">
            {bankDifference > 0 ? "+" : "-"}{formatMoney(Math.abs(bankDifference))}
          </div>
          <div class="text-[11px] text-amber-300/80 mt-1">
            {bankDifference > 0 ? "Banco mayor a Libros" : "Libros mayor a Banco"}
          </div>
        {/if}
      </div>
    </div>

    {#if modifiedRows.length > 0}
      <div class="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 text-xs text-amber-300">
          <Sparkles size={16} class="shrink-0" />
          <span>
            Tienes <strong>{modifiedRows.length}</strong> movimiento(s) modificados pendientes por guardar en Profit Plus.
            Los cálculos superiores reflejan la vista previa de tu conciliación.
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={resetChanges}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-raised hover:bg-surface-soft border border-border-subtle text-xs font-bold text-text-base cursor-pointer"
          >
            <RotateCcw size={13} /> Deshacer
          </button>
          {#if data.canSave}
            <button
              type="button"
              onclick={saveReconciliation}
              disabled={isSaving}
              class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black cursor-pointer"
            >
              <Save size={13} /> Guardar Ahora
            </button>
          {/if}
        </div>
      </div>
    {/if}

    <!-- FILTROS DE TABLA Y ACCIONES MASIVAS -->
    <div class="bg-surface-raised border border-border-subtle rounded-2xl p-4 shadow-sm space-y-3">
      <div class="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-1.5">
          {#each [
            { id: "all", label: `Todos (${movimientos.length})` },
            { id: "pendientes", label: `Pendientes (${liveTotals.countPend})` },
            { id: "conciliados", label: `Conciliados (${liveTotals.countConc})` },
            { id: "modificados", label: `Modificados (${modifiedRows.length})` },
          ] as tab}
            <button
              type="button"
              onclick={() => (statusFilter = tab.id as any)}
              class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border {statusFilter === tab.id
                ? 'bg-brand-600 text-white border-brand-500 shadow-sm'
                : 'bg-surface-soft text-text-muted hover:text-text-base border-border-subtle'}"
            >
              {tab.label}
            </button>
          {/each}
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="w-64">
            <SearchBar
              bind:value={searchQuery}
              placeholder="Buscar mov, ref, descripción..."
              onsubmit={() => {}}
            />
          </div>

          <select
            bind:value={natureFilter}
            class="bg-surface-soft border border-border-subtle rounded-xl px-3 py-2 text-xs font-bold text-text-base focus:outline-none cursor-pointer"
          >
            <option value="">Todas Naturalezas</option>
            <option value="INGRESO">Ingresos (+)</option>
            <option value="EGRESO">Egresos (-)</option>
            <option value="IDB">IGTF / IDB</option>
          </select>

          <select
            bind:value={originFilter}
            class="bg-surface-soft border border-border-subtle rounded-xl px-3 py-2 text-xs font-bold text-text-base focus:outline-none cursor-pointer"
          >
            <option value="">Todos Orígenes</option>
            <option value="BAN">BAN - Bancos</option>
            <option value="PAG">PAG - Pagos</option>
            <option value="COB">COB - Cobros</option>
            <option value="CAJ">CAJ - Caja</option>
            <option value="ORD">ORD - Órdenes Pago</option>
          </select>
        </div>
      </div>

      {#if data.canSave && filteredMovements.length > 0}
        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border-subtle/50 text-xs text-text-muted">
          <div class="flex items-center gap-1.5">
            <SlidersHorizontal size={13} />
            <span>Mostrando <strong class="text-text-base">{filteredMovements.length}</strong> de {movimientos.length} movimientos</span>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick={() => setVisibleRows(true)}
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-bold border border-emerald-500/20 cursor-pointer transition-colors"
            >
              <CheckSquare size={13} /> Marcar visibles
            </button>
            <button
              type="button"
              onclick={() => setVisibleRows(false)}
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base font-bold border border-border-subtle cursor-pointer transition-colors"
            >
              <Square size={13} /> Desmarcar visibles
            </button>
          </div>
        </div>
      {/if}
    </div>

    <!-- TABLA DE CONCILIACIÓN -->
    <div class="bg-surface-raised border border-border-subtle rounded-2xl shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-border-subtle bg-surface-soft/50 text-[10px] font-black uppercase tracking-wider text-text-muted">
              <th class="p-3.5 text-center w-12">
                {#if data.canSave}
                  <input
                    type="checkbox"
                    checked={allVisibleChecked}
                    onchange={(e) => setVisibleRows((e.currentTarget as HTMLInputElement).checked)}
                    class="w-4 h-4 rounded accent-brand-500 cursor-pointer"
                    title="Marcar o desmarcar todos los visibles"
                  />
                {:else}
                  Conc.
                {/if}
              </th>
              <th class="p-3.5">Fecha</th>
              <th class="p-3.5">N° Mov / Ref</th>
              <th class="p-3.5">Tipo / Origen</th>
              <th class="p-3.5">Descripción / Cuenta</th>
              <th class="p-3.5 text-right">Crédito (+)</th>
              <th class="p-3.5 text-right">Débito (-)</th>
              <th class="p-3.5 text-right">IGTF / IDB</th>
              <th class="p-3.5 text-center">Estado</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-subtle/50 text-sm">
            {#if filteredMovements.length === 0}
              <tr>
                <td colspan="9" class="p-12 text-center text-text-muted">
                  No se encontraron movimientos elegibles para conciliar con estos filtros.
                </td>
              </tr>
            {:else}
              {#each filteredMovements as m (m.mov_num)}
                {@const isChecked = Boolean(checkedMap[m.mov_num])}
                {@const isModified = isChecked !== Boolean(m.conciliado)}
                {@const isCarryOver = m.anio_mov < selectedAnio || (m.anio_mov === selectedAnio && m.mes_mov < selectedMes)}
                <tr
                  onclick={() => toggleRow(m.mov_num)}
                  class="transition-colors {data.canSave ? 'cursor-pointer' : ''} {isModified
                    ? 'bg-amber-500/10 hover:bg-amber-500/15'
                    : isChecked
                      ? 'bg-emerald-500/[0.04] hover:bg-surface-soft/60'
                      : 'hover:bg-surface-soft/50'}"
                >
                  <td class="p-3.5 text-center" onclick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!data.canSave}
                      onchange={() => toggleRow(m.mov_num)}
                      class="w-4 h-4 rounded accent-brand-500 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </td>

                  <td class="p-3.5 whitespace-nowrap">
                    <div class="text-xs font-bold text-text-base">{formatDate(m.fecha)}</div>
                    {#if isCarryOver}
                      <span class="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] font-bold">
                        Mes anterior
                      </span>
                    {/if}
                    {#if m.saldo_ini}
                      <span class="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400 text-[10px] font-bold">
                        Saldo Ini.
                      </span>
                    {/if}
                  </td>

                  <td class="p-3.5 whitespace-nowrap">
                    <div class="font-mono text-xs font-black text-text-base">{m.mov_num}</div>
                    {#if m.doc_num}
                      <div class="font-mono text-[11px] text-text-muted">Ref: {m.doc_num}</div>
                    {/if}
                  </td>

                  <td class="p-3.5 whitespace-nowrap">
                    <div class="flex items-center gap-1.5">
                      <span class="px-2 py-0.5 rounded-md text-[10px] font-black font-mono bg-surface-soft border border-border-subtle text-text-base">
                        {m.tipo_op}
                      </span>
                      <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-surface-soft text-text-muted">
                        {m.origen}
                      </span>
                    </div>
                    {#if m.cob_pag}
                      <div class="text-[10px] font-mono text-text-muted mt-0.5">{m.cob_pag}</div>
                    {/if}
                  </td>

                  <td class="p-3.5 max-w-xs">
                    <div class="text-xs font-semibold text-text-base line-clamp-2" title={m.descrip}>
                      {m.descrip || "-"}
                    </div>
                    <div class="text-[11px] text-text-muted mt-0.5 truncate">
                      {m.co_cta_ingr_egr || ""} {m.cta_ing_egr_des ? `· ${m.cta_ing_egr_des}` : ""} · {m.usuario_nombre}
                    </div>
                  </td>

                  <td class="p-3.5 text-right font-mono text-xs whitespace-nowrap">
                    {#if Number(m.monto_h || 0) > 0}
                      <span class="font-bold text-emerald-400">{formatMoney(m.monto_h)}</span>
                    {:else}
                      <span class="text-text-muted/40">-</span>
                    {/if}
                  </td>

                  <td class="p-3.5 text-right font-mono text-xs whitespace-nowrap">
                    {#if Number(m.monto_d || 0) > 0}
                      <span class="font-bold text-rose-400">{formatMoney(m.monto_d)}</span>
                    {:else}
                      <span class="text-text-muted/40">-</span>
                    {/if}
                  </td>

                  <td class="p-3.5 text-right font-mono text-xs whitespace-nowrap">
                    {#if Number(m.idb || 0) > 0}
                      <span class="font-bold text-amber-400">{formatMoney(m.idb)}</span>
                    {:else}
                      <span class="text-text-muted/40">-</span>
                    {/if}
                  </td>

                  <td class="p-3.5 text-center whitespace-nowrap">
                    <div class="flex flex-col items-center gap-1">
                      {#if isChecked}
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 size={11} /> Conciliado
                        </span>
                      {:else}
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500/15 text-amber-400 border border-amber-500/20">
                          <Clock size={11} /> Pendiente
                        </span>
                      {/if}
                      {#if isModified}
                        <span class="text-[10px] font-black text-amber-400 uppercase tracking-tighter">
                          ● Sin guardar
                        </span>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

