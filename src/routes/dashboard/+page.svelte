<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
  import type { PageData } from "./$types";
  import { browser } from "$app/environment";
  import { fade, slide } from "svelte/transition";
  import { getThemeConfig } from "$lib/theme.svelte";
  import {
    LayoutDashboard,
    RefreshCw,
    Store,
    Calculator,
    CheckCircle2,
    Info,
    ArrowRightLeft,
    Clock,
    DollarSign,
    Copy,
    Check,
  } from "lucide-svelte";
  import dayjs from "dayjs";
  import "dayjs/locale/es";
  import DatePicker from "$lib/components/ui/DatePicker.svelte";

  dayjs.locale("es");

  let { data }: { data: PageData } = $props();

  // Configuración de tema reactiva del usuario
  let themeConfig = $derived(getThemeConfig());

  // Fechas de referencia
  const todayStr = dayjs().format("YYYY-MM-DD");

  let tasa_bcv = $state<number | null>(null);
  let rateHistory = $state<
    Array<{ fecha_str: string; fecha: string; tasa: number; co_mone: string }>
  >([]);
  let isLoadingRate = $state(true);
  let selectedBranchId = $state(
    data.profile?.branch_id || (data.profile?.allowed_branches?.[0]?.id ?? ""),
  );


  // --- ESTADOS DEL CONSULTOR Y CALCULADORA DE TASA POR FECHA ---
  let queryDate = $state(todayStr);
  let isConsultingDate = $state(false);
  let queriedResult = $state<{
    tasa: number | null;
    fecha_str: string | null;
    fecha: string | null;
    es_exacta: boolean;
    fechaConsultada: string;
  } | null>(null);

  // Calculadora interactiva bidireccional
  let usdInput = $state<string>("1");
  let bsInput = $state<string>("");
  let lastEdited = $state<"usd" | "bs">("usd");
  let copiedField = $state<"usd" | "bs" | null>(null);

  function handleUsdInput(val: string) {
    usdInput = val;
    lastEdited = "usd";
    const cleaned = val.replace(/[^0-9.,]/g, "").replace(/,/g, ".");
    const num = parseFloat(cleaned);
    const rate = Number(queriedResult?.tasa || tasa_bcv || 0);
    if (!isNaN(num) && rate > 0) {
      bsInput = (num * rate).toFixed(2);
    } else if (!val.trim()) {
      bsInput = "";
    }
  }

  function handleBsInput(val: string) {
    bsInput = val;
    lastEdited = "bs";
    const cleaned = val.replace(/[^0-9.,]/g, "").replace(/,/g, ".");
    const num = parseFloat(cleaned);
    const rate = Number(queriedResult?.tasa || tasa_bcv || 0);
    if (!isNaN(num) && rate > 0) {
      usdInput = (num / rate).toFixed(2);
    } else if (!val.trim()) {
      usdInput = "";
    }
  }

  function recalculateWithCurrentRate() {
    const rate = Number(queriedResult?.tasa || tasa_bcv || 0);
    if (rate <= 0) return;
    if (lastEdited === "usd") {
      const cleaned = usdInput.replace(/[^0-9.,]/g, "").replace(/,/g, ".");
      const num = parseFloat(cleaned);
      if (!isNaN(num)) {
        bsInput = (num * rate).toFixed(2);
      }
    } else {
      const cleaned = bsInput.replace(/[^0-9.,]/g, "").replace(/,/g, ".");
      const num = parseFloat(cleaned);
      if (!isNaN(num)) {
        usdInput = (num / rate).toFixed(2);
      }
    }
  }


  function copyToClipboard(val: string, field: "usd" | "bs") {
    if (!browser || !navigator.clipboard) return;
    navigator.clipboard.writeText(val);
    copiedField = field;
    setTimeout(() => {
      if (copiedField === field) copiedField = null;
    }, 2000);
  }

  function fmtVES(val: number | null | undefined) {
    if (val === null || val === undefined || isNaN(Number(val))) return "0,00";
    return Number(val).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // Cargar tasa actual + histórico de 7 días
  async function loadTasaData() {
    if (!browser) return;
    isLoadingRate = true;
    try {
      const url = selectedBranchId
        ? `/api/agent/tasa?branch_id=${selectedBranchId}`
        : "/api/agent/tasa";
      const res = await fetch(url);
      const d = await res.json();
      if (d.success) {
        tasa_bcv = d.tasa;
        rateHistory = Array.isArray(d.history) ? d.history : [];
        if (!queriedResult && d.tasa) {
          queriedResult = {
            tasa: d.tasa,
            fecha_str: todayStr,
            fecha: todayStr,
            es_exacta: true,
            fechaConsultada: todayStr,
          };
          recalculateWithCurrentRate();
        }
      }
    } catch (e) {
      console.error("Error cargando tasa del BCV:", e);
    } finally {
      isLoadingRate = false;
    }
  }

  // Consultar tasa para una fecha específica
  async function consultRateByDate(targetDate?: string) {
    if (!browser) return;
    const dateToSearch = targetDate || queryDate;
    if (!dateToSearch) return;

    queryDate = dateToSearch;
    isConsultingDate = true;
    try {
      const url = `/api/agent/tasa?fecha=${encodeURIComponent(dateToSearch)}${
        selectedBranchId ? `&branch_id=${selectedBranchId}` : ""
      }`;
      const res = await fetch(url);
      const d = await res.json();
      if (d.success) {
        queriedResult = {
          tasa: d.tasa,
          fecha_str: d.fecha_str,
          fecha: d.fecha,
          es_exacta: Boolean(d.es_exacta),
          fechaConsultada: d.fechaConsultada,
        };
        recalculateWithCurrentRate();
      }
    } catch (e) {
      console.error("Error al consultar tasa por fecha:", e);
    } finally {
      isConsultingDate = false;
    }
  }

  // Atajos de fecha rápida
  function setQuickDate(offsetDays: number) {
    const d = dayjs().subtract(offsetDays, "day").format("YYYY-MM-DD");
    queryDate = d;
    consultRateByDate(d);
  }

  function setMonthStart() {
    const d = dayjs().startOf("month").format("YYYY-MM-DD");
    queryDate = d;
    consultRateByDate(d);
  }

  $effect(() => {
    // Cuando cambie la sede seleccionada
    loadTasaData();
  });
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <!-- HEADER -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <LayoutDashboard size={40} class="text-brand-500" />
        Inicio
      </h1>
      <p class="text-text-muted mt-2 text-lg italic">
        Bienvenido, <span class="text-brand-400 not-italic font-bold"
          >{data.profile?.full_name ?? "Usuario"}</span
        >
      </p>
    </div>

    <!-- Sede selector & Refresh button -->
    <div class="flex items-center gap-3">
      {#if data.profile?.allowed_branches && data.profile.allowed_branches.length > 1}
        <div class="relative flex items-center">
          <Store
            size={16}
            class="absolute left-4 text-brand-400 pointer-events-none"
          />
          <select
            bind:value={selectedBranchId}
            onchange={loadTasaData}
            class="bg-surface-raised border border-border-subtle rounded-2xl pl-11 pr-8 py-3 text-xs font-bold text-text-base appearance-none focus:border-brand-500 outline-none cursor-pointer transition-all shadow-sm"
          >
            {#each data.profile.allowed_branches as branch}
              <option value={branch.id}>{branch.name}</option>
            {/each}
          </select>
        </div>
      {/if}

      <button
        onclick={loadTasaData}
        disabled={isLoadingRate}
        class="p-3 bg-surface-soft hover:bg-surface-strong border border-border-subtle rounded-2xl text-text-muted hover:text-brand-400 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
        title="Actualizar datos del agente"
      >
        <RefreshCw
          size={18}
          class={isLoadingRate ? "animate-spin text-brand-500" : ""}
        />
      </button>
    </div>
  </div>



  <!-- ========================================================================= -->
  <!-- CONSULTOR DE TASA POR FECHA (INTEGRADO) -->
  <!-- ========================================================================= -->
  <div
    class="glass rounded-[36px] border border-border-subtle p-6 md:p-8 relative space-y-6 transition-all duration-500"
    style="box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.08), 0 0 35px -10px hsl({themeConfig?.accentHue ?? 217}, {themeConfig?.accentSaturation ?? 91}%, 55%, 0.12);"
    in:slide
  >

    <div
      class="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10"
    >
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <!-- <span
            class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-brand-500/10 text-brand-400 border border-brand-500/20 flex items-center gap-1.5"
          >
            <Search size={12} />
            Consultor Histórico
          </span> -->
        </div>
        <h3
          class="text-2xl font-black text-text-base tracking-tight flex items-center gap-2.5"
        >
          Consultar Tasa por Fecha
        </h3>
        <p class="text-xs text-text-muted">
          Selecciona una fecha para consultar la tasa oficial que estuvo vigente
          en el sistema.
        </p>
      </div>

      <!-- Botones de atajos rápidos -->
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onclick={() => setQuickDate(0)}
          class="px-3 py-1.5 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-[11px] font-bold text-text-muted hover:text-text-base transition-all cursor-pointer"
        >
          Hoy
        </button>
        <button
          type="button"
          onclick={() => setQuickDate(1)}
          class="px-3 py-1.5 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-[11px] font-bold text-text-muted hover:text-text-base transition-all cursor-pointer"
        >
          Ayer
        </button>
        <button
          type="button"
          onclick={() => setQuickDate(7)}
          class="px-3 py-1.5 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-[11px] font-bold text-text-muted hover:text-text-base transition-all cursor-pointer"
        >
          -7 días
        </button>
        <button
          type="button"
          onclick={() => setQuickDate(15)}
          class="px-3 py-1.5 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-[11px] font-bold text-text-muted hover:text-text-base transition-all cursor-pointer"
        >
          -15 días
        </button>
        <button
          type="button"
          onclick={() => setMonthStart()}
          class="px-3 py-1.5 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-[11px] font-bold text-text-muted hover:text-text-base transition-all cursor-pointer"
        >
          Inicio de Mes
        </button>
      </div>
    </div>

    <!-- Formulario de Consulta & Resultado -->
    <div
      class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch relative z-10"
    >
      <!-- RESULTADO DE LA CONSULTA Y CONVERSOR (PRIMERO EN DOM -> ARRIBA EN MÓVILES, IZQUIERDA EN DESKTOP) -->
      <div
        class="lg:col-span-7 bg-surface-soft/40 border border-border-subtle p-6 rounded-3xl flex flex-col justify-between"
      >
        {#if isConsultingDate}
          <div
            class="flex flex-col items-center justify-center py-10 space-y-3 text-text-muted"
          >
            <RefreshCw size={32} class="animate-spin text-brand-500" />
            <p class="text-xs font-bold">
              Buscando registro cambiario en base de datos...
            </p>
          </div>
        {:else if queriedResult && queriedResult.tasa}
          {@const currentTasaVal =
            tasa_bcv ||
            (rateHistory.length > 0
              ? rateHistory[rateHistory.length - 1].tasa
              : 0)}
          {@const diffWithCurrent = currentTasaVal
            ? Number(currentTasaVal) - Number(queriedResult.tasa)
            : 0}
          {@const pctWithCurrent = queriedResult.tasa
            ? (diffWithCurrent / Number(queriedResult.tasa)) * 100
            : 0}
          {@const dateFormatted = dayjs(queriedResult.fechaConsultada).format(
            "dddd, DD [de] MMMM YYYY",
          )}

          <div class="space-y-4" in:fade>
            <!-- Header Resultado -->
            <div
              class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-subtle pb-3"
            >
              <div>
                <span
                  class="text-[10px] font-black uppercase tracking-widest text-text-muted"
                  >Fecha Consultada</span
                >
                <h4
                  class="text-sm md:text-base font-black text-text-base capitalize mt-0.5"
                >
                  {dateFormatted}
                </h4>
              </div>

              {#if queriedResult.es_exacta}
                <span
                  class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <CheckCircle2 size={12} />
                  Tasa Exacta del Día
                </span>
              {:else}
                <span
                  class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5 self-start sm:self-auto"
                  title="Tasa vigente del último día hábil anterior registrado"
                >
                  <Info size={12} />
                  Vigente del {dayjs(
                    queriedResult.fecha_str || queriedResult.fecha,
                  ).format("DD/MM/YYYY")}
                </span>
              {/if}
            </div>

            <!-- Tasa y Comparativa -->
            <div
              class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4"
            >
              <div>
                <span
                  class="text-[10px] font-black uppercase tracking-widest text-text-muted block"
                  >Tasa BCV Oficial</span
                >
                <span
                  class="text-3xl md:text-4xl font-black text-brand-400 font-mono tracking-tight"
                >
                  Bs. {fmtVES(queriedResult.tasa)}
                </span>
              </div>

              {#if currentTasaVal && diffWithCurrent !== 0}
                <div class="text-left sm:text-right">
                  <span
                    class="text-[10px] font-black uppercase tracking-widest text-text-muted block"
                    >Variación a hoy</span
                  >
                  <span
                    class="text-xs font-bold font-mono {diffWithCurrent >= 0
                      ? 'text-emerald-400'
                      : 'text-amber-400'}"
                  >
                    {diffWithCurrent >= 0
                      ? `+Bs. ${fmtVES(diffWithCurrent)} (+${pctWithCurrent.toFixed(2)}%)`
                      : `-Bs. ${fmtVES(Math.abs(diffWithCurrent))} (${pctWithCurrent.toFixed(2)}%)`}
                  </span>
                </div>
              {/if}
            </div>

            <!-- Conversor Interactivo a la Tasa Consultada -->
            <div class="pt-4 border-t border-border-subtle space-y-3.5">
              <div class="flex items-center gap-2">
                <div
                  class="p-1.5 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20"
                >
                  <Calculator size={15} />
                </div>
                <span class="text-xs font-black uppercase tracking-wider text-text-base">
                  Conversor a Tasa del Día
                </span>
              </div>

              <!-- Inputs Bidireccionales Editables -->
              <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                <!-- Input USD -->
                <div class="sm:col-span-5 space-y-1">
                  <label for="usd-calc-input" class="text-[10px] font-black uppercase tracking-wider text-text-muted flex items-center justify-between">
                    <span>Dólares ($ USD)</span>
                    {#if lastEdited === 'usd'}
                      <span class="text-[9px] text-brand-400 font-bold">Editando</span>
                    {/if}
                  </label>
                  <div class="relative flex items-center">
                    <div class="absolute left-3.5 flex items-center pointer-events-none text-text-muted font-bold text-sm">
                      <DollarSign size={16} />
                    </div>
                    <input
                      id="usd-calc-input"
                      type="text"
                      inputmode="decimal"
                      value={usdInput}
                      oninput={(e) => handleUsdInput(e.currentTarget.value)}
                      placeholder="0.00"
                      class="w-full h-12 bg-surface-base/80 border rounded-2xl pl-9 pr-10 text-base font-black font-mono text-text-base transition-all outline-none {lastEdited === 'usd' ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-border-subtle focus:border-brand-500/40'}"
                    />
                    {#if usdInput}
                      <button
                        type="button"
                        onclick={() => copyToClipboard(usdInput, 'usd')}
                        title="Copiar monto en USD"
                        class="absolute right-2.5 p-1.5 rounded-xl text-text-muted hover:text-text-base hover:bg-surface-soft transition-all cursor-pointer"
                      >
                        {#if copiedField === 'usd'}
                          <Check size={14} class="text-emerald-400" />
                        {:else}
                          <Copy size={14} />
                        {/if}
                      </button>
                    {/if}
                  </div>
                </div>

                <!-- Indicador de Conversión / Intercambio -->
                <div class="sm:col-span-2 flex items-center justify-center sm:pt-4">
                  <div class="p-2 rounded-2xl bg-surface-base border border-border-subtle text-brand-400 shadow-sm flex items-center justify-center">
                    <ArrowRightLeft size={16} />
                  </div>
                </div>

                <!-- Input Bolívares -->
                <div class="sm:col-span-5 space-y-1">
                  <label for="bs-calc-input" class="text-[10px] font-black uppercase tracking-wider text-text-muted flex items-center justify-between">
                    <span>Bolívares (Bs. VES)</span>
                    {#if lastEdited === 'bs'}
                      <span class="text-[9px] text-brand-400 font-bold">Editando</span>
                    {/if}
                  </label>
                  <div class="relative flex items-center">
                    <span class="absolute left-3.5 pointer-events-none text-text-muted font-black text-xs font-mono">
                      Bs.
                    </span>
                    <input
                      id="bs-calc-input"
                      type="text"
                      inputmode="decimal"
                      value={bsInput}
                      oninput={(e) => handleBsInput(e.currentTarget.value)}
                      placeholder="0.00"
                      class="w-full h-12 bg-surface-base/80 border rounded-2xl pl-10 pr-10 text-base font-black font-mono text-text-base transition-all outline-none {lastEdited === 'bs' ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-border-subtle focus:border-brand-500/40'}"
                    />
                    {#if bsInput}
                      <button
                        type="button"
                        onclick={() => copyToClipboard(bsInput, 'bs')}
                        title="Copiar monto en Bs"
                        class="absolute right-2.5 p-1.5 rounded-xl text-text-muted hover:text-text-base hover:bg-surface-soft transition-all cursor-pointer"
                      >
                        {#if copiedField === 'bs'}
                          <Check size={14} class="text-emerald-400" />
                        {:else}
                          <Copy size={14} />
                        {/if}
                      </button>
                    {/if}
                  </div>
                </div>
              </div>

            </div>
          </div>
        {:else}
          <!-- Estado Inicial / Vacío -->
          <div
            class="flex flex-col items-center justify-center py-10 text-center space-y-3 text-text-muted"
          >
            <div
              class="h-14 w-14 rounded-2xl bg-surface-soft border border-border-subtle flex items-center justify-center text-brand-400"
            >
              <Clock size={24} />
            </div>
            <div>
              <p class="text-sm font-bold text-text-base">
                Selecciona una fecha en el calendario
              </p>
              <p class="text-xs text-text-muted/70 max-w-sm mt-0.5">
                Obtén al instante el valor exacto de la tasa en Bolívares y su
                equivalencia para ese día.
              </p>
            </div>
          </div>
        {/if}
      </div>

      <!-- SELECTOR DE FECHA CON CALENDARIO DESPLEGADO (SEGUNDO EN DOM -> ABAJO EN MÓVILES, DERECHA EN DESKTOP) -->
      <div
        class="lg:col-span-5 flex flex-col justify-between bg-surface-soft/40 border border-border-subtle p-5 rounded-3xl"
      >
        <DatePicker
          inline
          bind:value={queryDate}
          max={todayStr}
          label="Fecha a Consultar"
          loading={isConsultingDate}
          onSelect={(val) => consultRateByDate(val)}
          onchange={(val) => consultRateByDate(val)}
        />
      </div>
    </div>
  </div>
</div>
