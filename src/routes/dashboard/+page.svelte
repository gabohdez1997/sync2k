<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
  import type { PageData } from "./$types";
  import { browser } from "$app/environment";
  import { onDestroy } from "svelte";
  import { fade, slide } from "svelte/transition";
  import { getThemeConfig } from "$lib/theme.svelte";
  import {
    LayoutDashboard,
    Calendar,
    RefreshCw,
    Store,
    Activity,
    ArrowUpRight,
    ArrowDownRight,
    Search,
    Calculator,
    CheckCircle2,
    Info,
    ArrowRightLeft,
    Clock,
    DollarSign,
    Sparkles,
    Copy,
    Check,
  } from "lucide-svelte";
  import dayjs from "dayjs";
  import "dayjs/locale/es";
  import DatePicker from "$lib/components/ui/DatePicker.svelte";
  import {
    Chart as ChartJS,
    Title,
    Tooltip,
    Legend,
    LineElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Filler,
    LineController,
  } from "chart.js";

  dayjs.locale("es");

  ChartJS.register(
    Title,
    Tooltip,
    Legend,
    LineElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Filler,
    LineController,
  );

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

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let chartInstance: ChartJS | null = null;

  function fmtVES(val: number | null | undefined) {
    if (val === null || val === undefined || isNaN(Number(val))) return "0,00";
    return Number(val).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // Métricas calculadas para la gráfica
  let minRate = $derived.by(() => {
    if (!rateHistory || rateHistory.length === 0) return 0;
    return Math.min(...rateHistory.map((r) => Number(r.tasa)));
  });

  let maxRate = $derived.by(() => {
    if (!rateHistory || rateHistory.length === 0) return 0;
    return Math.max(...rateHistory.map((r) => Number(r.tasa)));
  });

  let variation7d = $derived.by(() => {
    if (!rateHistory || rateHistory.length < 2)
      return { amount: 0, percent: 0, isUp: true };
    const first = Number(rateHistory[0].tasa);
    const last = Number(rateHistory[rateHistory.length - 1].tasa);
    const diff = last - first;
    const pct = first > 0 ? (diff / first) * 100 : 0;
    return {
      amount: diff,
      percent: pct,
      isUp: diff >= 0,
    };
  });

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

  function renderChart() {
    if (!browser || !canvasEl) return;

    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    if (!rateHistory || rateHistory.length === 0) return;

    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    // Obtener paleta de color personalizada por el usuario
    const h = themeConfig?.accentHue ?? 217;
    const s = themeConfig?.accentSaturation ?? 91;
    const isDark =
      themeConfig?.mode === "dark" ||
      (themeConfig?.mode === "system" &&
        (browser
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
          : true));
    const l = isDark ? 60 : 50;

    const mainColor = `hsl(${h}, ${s}%, ${l}%)`;
    const pointBg = `hsl(${h}, ${s}%, ${Math.min(l + 12, 88)}%)`;
    const pointHoverBg = `hsl(${h}, ${s}%, ${Math.max(l - 12, 28)}%)`;

    // Crear gradiente personalizado fluido
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, `hsla(${h}, ${s}%, ${l}%, 0.42)`);
    gradient.addColorStop(0.6, `hsla(${h}, ${s}%, ${l}%, 0.08)`);
    gradient.addColorStop(1, `hsla(${h}, ${s}%, ${l}%, 0.0)`);

    const labels = rateHistory.map((item) => {
      const d = dayjs(item.fecha_str || item.fecha);
      return d.format("ddd DD/MM");
    });

    const values = rateHistory.map((item) => Number(item.tasa));

    chartInstance = new ChartJS(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Tasa BCV (Bs/$)",
            data: values,
            borderColor: mainColor,
            borderWidth: 3.5,
            pointBackgroundColor: pointBg,
            pointBorderColor: isDark ? "#0f172a" : "#ffffff",
            pointBorderWidth: 2,
            pointRadius: 5.5,
            pointHoverRadius: 8.5,
            pointHoverBackgroundColor: pointHoverBg,
            pointHoverBorderColor: "#ffffff",
            pointHoverBorderWidth: 3,
            backgroundColor: gradient,
            fill: true,
            tension: 0.38,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: isDark
              ? "rgba(15, 23, 42, 0.92)"
              : "rgba(255, 255, 255, 0.95)",
            titleColor: isDark ? "#94a3b8" : "#64748b",
            bodyColor: isDark ? "#f8fafc" : "#0f172a",
            titleFont: { size: 11, weight: "bold" },
            bodyFont: { size: 14, weight: "bold" },
            padding: 12,
            cornerRadius: 16,
            borderColor: `hsla(${h}, ${s}%, ${l}%, 0.3)`,
            borderWidth: 1.5,
            displayColors: false,
            callbacks: {
              title: (items) => {
                if (!items.length) return "";
                const idx = items[0].dataIndex;
                const rawDate =
                  rateHistory[idx]?.fecha_str || rateHistory[idx]?.fecha;
                return dayjs(rawDate).format("dddd, DD [de] MMMM YYYY");
              },
              label: (item) => {
                const val = Number(item.raw);
                const idx = item.dataIndex;
                let varText = "";
                if (idx > 0) {
                  const prev = Number(rateHistory[idx - 1].tasa);
                  const diff = val - prev;
                  const pct = prev > 0 ? (diff / prev) * 100 : 0;
                  const sign = diff >= 0 ? "+" : "";
                  varText = ` (${sign}${diff.toFixed(2)} Bs | ${sign}${pct.toFixed(2)}%)`;
                }
                return `Tasa: Bs. ${fmtVES(val)}${varText}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              color: isDark
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(0, 0, 0, 0.05)",
            },
            ticks: {
              color: isDark ? "#94a3b8" : "#64748b",
              font: { size: 11, weight: "bold" },
            },
          },
          y: {
            grid: {
              color: isDark
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(0, 0, 0, 0.05)",
            },
            ticks: {
              color: isDark ? "#94a3b8" : "#64748b",
              font: { size: 11, weight: "bold" },
              callback: (val) => `Bs. ${Number(val).toFixed(2)}`,
            },
          },
        },
      },
    });
  }

  $effect(() => {
    // Cuando cambie la sede seleccionada
    loadTasaData();
  });

  $effect(() => {
    // Cuando cambie el histórico, canvas o el tema/color configurado por el usuario
    if (canvasEl && rateHistory.length > 0 && !isLoadingRate && themeConfig) {
      renderChart();
    }
  });

  onDestroy(() => {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
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
  <!-- SECCIÓN GRÁFICA: TASA BCV ÚLTIMOS 7 DÍAS -->
  <!-- ========================================================================= -->
  <div
    class="glass rounded-[36px] border border-border-subtle p-6 md:p-8 shadow-2xl space-y-6 relative overflow-hidden"
  >
    <!-- Background subtle glow adaptado al acento del usuario -->
    <div
      class="absolute -right-20 -top-20 w-96 h-96 rounded-full blur-3xl pointer-events-none transition-all duration-700 opacity-25"
      style="background: radial-gradient(circle, hsl({themeConfig?.accentHue ??
        217}, {themeConfig?.accentSaturation ??
        91}%, 55%) 0%, transparent 70%);"
    ></div>

    <!-- Header de la tarjeta -->
    <div
      class="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10"
    >
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span
            class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-brand-500/10 text-brand-400 border border-brand-500/20 flex items-center gap-1.5"
          >
            <Activity size={12} />
            Profit Plus 2K12
          </span>
          <!-- <span
            class="text-xs text-text-muted font-bold flex items-center gap-1"
          >
            <Calendar size={13} />
            Últimos 7 Días Registrados
          </span> -->
        </div>
        <h2
          class="text-2xl md:text-3xl font-black text-text-base tracking-tight flex items-center gap-2.5"
        >
          Tasa Banco Central de Venezuela
        </h2>
        <p class="text-xs text-text-muted">
          Histórico de fluctuación cambiaria oficial registrado en los últimos <code
            class="font-mono text-brand-400 font-bold">7 días</code
          >.
        </p>
      </div>

      <!-- Tarjetas de métricas rápidas -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
        <!-- Tasa Actual -->
        <div
          class="bg-surface-soft/60 border border-border-subtle p-4 rounded-2xl flex flex-col justify-center"
        >
          <span
            class="text-[10px] font-black uppercase tracking-widest text-text-muted"
            >Tasa Actual</span
          >
          <div class="flex items-baseline gap-1.5 mt-1">
            {#if isLoadingRate && !tasa_bcv}
              <div class="h-6 w-20 bg-white/10 animate-pulse rounded"></div>
            {:else}
              <span
                class="text-xl md:text-2xl font-black text-text-base font-mono"
              >
                Bs. {fmtVES(
                  tasa_bcv ||
                    (rateHistory.length > 0
                      ? rateHistory[rateHistory.length - 1].tasa
                      : 0),
                )}
              </span>
            {/if}
          </div>
        </div>

        <!-- Variación 7D -->
        <div
          class="bg-surface-soft/60 border border-border-subtle p-4 rounded-2xl flex flex-col justify-center"
        >
          <span
            class="text-[10px] font-black uppercase tracking-widest text-text-muted"
            >Variación (7D)</span
          >
          <div class="flex items-center gap-1 mt-1">
            {#if isLoadingRate && rateHistory.length === 0}
              <div class="h-6 w-16 bg-white/10 animate-pulse rounded"></div>
            {:else if variation7d.isUp}
              <ArrowUpRight size={18} class="text-emerald-400 shrink-0" />
              <span
                class="text-sm md:text-base font-black text-emerald-400 font-mono"
              >
                +{variation7d.percent.toFixed(2)}%
              </span>
            {:else}
              <ArrowDownRight size={18} class="text-amber-400 shrink-0" />
              <span
                class="text-sm md:text-base font-black text-amber-400 font-mono"
              >
                {variation7d.percent.toFixed(2)}%
              </span>
            {/if}
          </div>
        </div>

        <!-- Rango Mín - Máx -->
        <div
          class="col-span-2 sm:col-span-1 bg-surface-soft/60 border border-border-subtle p-4 rounded-2xl flex flex-col justify-center"
        >
          <span
            class="text-[10px] font-black uppercase tracking-widest text-text-muted"
            >Rango Semanal</span
          >
          <div class="text-xs font-bold text-text-base font-mono mt-1">
            {#if isLoadingRate && rateHistory.length === 0}
              <div class="h-6 w-24 bg-white/10 animate-pulse rounded"></div>
            {:else}
              <span class="text-text-muted">Min:</span>
              {fmtVES(minRate)}
              <span class="text-text-muted/40 mx-1">|</span>
              <span class="text-text-muted">Max:</span>
              {fmtVES(maxRate)}
            {/if}
          </div>
        </div>
      </div>
    </div>

    <!-- Canvas de la gráfica -->
    <div
      class="relative w-full h-72 md:h-80 bg-surface-base/40 rounded-3xl p-4 border border-border-subtle/60 flex items-center justify-center"
    >
      {#if isLoadingRate && rateHistory.length === 0}
        <div class="flex flex-col items-center gap-3 text-text-muted">
          <RefreshCw size={28} class="animate-spin text-brand-500" />
          <p class="text-xs font-bold">
            Consultando historial cambiario con el agente...
          </p>
        </div>
      {:else if rateHistory.length === 0}
        <div class="flex flex-col items-center gap-2 text-text-muted py-12">
          <Activity size={32} class="opacity-40" />
          <p class="text-sm font-bold">
            No se encontraron registros de tasas para los últimos 7 días
          </p>
        </div>
      {:else}
        <canvas bind:this={canvasEl} class="w-full h-full"></canvas>
      {/if}
    </div>

    <!-- Timeline pills / Resumen de los 7 días -->
    {#if rateHistory.length > 0}
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-2">
        {#each rateHistory as item, idx}
          {@const dateObj = dayjs(item.fecha_str || item.fecha)}
          {@const isLatest = idx === rateHistory.length - 1}
          {@const isSelected = queriedResult?.fecha_str === item.fecha_str}
          <button
            type="button"
            onclick={() => {
              queryDate = item.fecha_str || String(item.fecha).split("T")[0];
              consultRateByDate(queryDate);
            }}
            class="p-3 rounded-2xl border transition-all flex flex-col items-center text-center cursor-pointer {isSelected
              ? 'bg-brand-500/20 border-brand-500 text-brand-300 ring-2 ring-brand-500/50 shadow-lg shadow-brand-500/10'
              : isLatest
                ? 'bg-brand-500/10 border-brand-500/30 text-brand-400 shadow-md shadow-brand-500/5 hover:bg-brand-500/15'
                : 'bg-surface-soft/40 border-border-subtle hover:bg-surface-soft'}"
          >
            <span
              class="text-[10px] font-black uppercase tracking-wider text-text-muted"
            >
              {dateObj.format("ddd DD/MM")}
            </span>
            <span
              class="text-sm font-black font-mono mt-1 {isLatest || isSelected
                ? 'text-brand-300'
                : 'text-text-base'}"
            >
              {fmtVES(item.tasa)}
            </span>
            {#if isLatest}
              <span
                class="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 mt-1"
              >
                Última
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- ========================================================================= -->
  <!-- CONSULTOR DE TASA POR FECHA (INTEGRADO) -->
  <!-- ========================================================================= -->
  <div
    class="glass rounded-[36px] border border-border-subtle p-6 md:p-8 shadow-2xl relative space-y-6"
    in:slide
  >
    <!-- Background subtle glow con contenedor aislado sin cortar elementos flotantes -->
    <div
      class="absolute inset-0 rounded-[36px] overflow-hidden pointer-events-none"
    >
      <div
        class="absolute -left-20 -bottom-20 w-80 h-80 rounded-full blur-3xl transition-all duration-700 opacity-20"
        style="background: radial-gradient(circle, hsl({themeConfig?.accentHue ??
          217}, {themeConfig?.accentSaturation ??
          91}%, 55%) 0%, transparent 70%);"
      ></div>
    </div>

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
      <!-- INPUT SELECTOR DE FECHA CON DATEPICKER PERSONALIZADO -->
      <div
        class="lg:col-span-5 flex flex-col justify-between space-y-4 bg-surface-soft/40 border border-border-subtle p-5 rounded-3xl"
      >
        <div class="space-y-3">
          <DatePicker
            bind:value={queryDate}
            max={todayStr}
            label="Fecha a Consultar"
            onchange={() => consultRateByDate()}
          />
        </div>

        <button
          type="button"
          onclick={() => consultRateByDate()}
          disabled={isConsultingDate || !queryDate}
          class="w-full h-14 bg-brand-600 hover:bg-brand-500 text-white rounded-2xl font-black text-sm shadow-xl shadow-brand-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2.5 cursor-pointer"
        >
          {#if isConsultingDate}
            <RefreshCw size={18} class="animate-spin" />
            Consultando en Profit Plus...
          {:else}
            <Search size={18} />
            Consultar Tasa
          {/if}
        </button>
      </div>

      <!-- RESULTADO DE LA CONSULTA -->
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
                Selecciona una fecha y haz clic en "Consultar Tasa"
              </p>
              <p class="text-xs text-text-muted/70 max-w-sm mt-0.5">
                Obtén al instante el valor exacto de la tasa en Bolívares y su
                equivalencia para ese día.
              </p>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
