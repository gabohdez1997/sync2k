<script lang="ts">
  import { fade, slide } from "svelte/transition";
  import {
    DollarSign,
    RefreshCw,
    Store,
    ArrowRight,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    TrendingUp,
    Globe,
    Building2,
    Calendar,
    ArrowUpRight,
  } from "lucide-svelte";
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import type { ActionData, PageData } from "./$types";
  import dayjs from "dayjs";
  import { toast } from "svelte-sonner";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let isSyncing = $state(false);
  let isRefreshing = $state(false);

  let manualRate = $state<number | null>(null);
  let isEditing = $state(false);

  let displayRate = $derived(manualRate ?? data.bcvRate);

  async function handleRefresh() {
    isRefreshing = true;
    try {
      await invalidateAll();
      toast.success("Tasa actualizada desde el BCV");
    } finally {
      isRefreshing = false;
    }
  }

  // Formatear moneda: punto para miles, coma para decimales, 2 decimales con redondeo
  function formatCurr(val: number | null) {
    if (val === null || val === undefined) return "---";
    // Redondeo manual: si el 3er decimal >= 5, sumar al 2do
    const shifted = Math.floor(val * 1000);
    const thirdDecimal = shifted % 10;
    let rounded: number;
    if (thirdDecimal >= 5) {
      rounded = Math.floor(val * 100 + 1) / 100;
    } else {
      rounded = Math.floor(val * 100) / 100;
    }
    // Formatear con punto para miles y coma para decimales
    const parts = rounded.toFixed(2).split(".");
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return intPart + "," + parts[1];
  }

  const today = dayjs().format("DD/MM/YYYY");
</script>

<div class="flex flex-col gap-8 max-w-6xl mx-auto" in:fade>
  <!-- HEADER -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div class="flex flex-col gap-2">
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <RefreshCw size={40} class="text-brand-500" />
        Sincronización de Tasa (BCV)
      </h1>
      <p class="text-text-muted text-lg">
        Actualiza la tasa oficial del Banco Central de Venezuela en todas tus
        sucursales.
      </p>
    </div>

    <div
      class="glass px-6 py-3 rounded-2xl border border-white/5 flex items-center gap-4"
    >
      <Calendar size={20} class="text-brand-400" />
      <div>
        <p
          class="text-[10px] uppercase tracking-widest font-black text-text-muted"
        >
          Fecha Hoy
        </p>
        <p class="font-bold text-lg">{today}</p>
      </div>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <!-- PANEL IZQUIERDO: TASA ACTUAL BCV -->
    <div class="lg:col-span-1 flex flex-col gap-6">
      <div
        class="glass p-8 rounded-[2.5rem] border border-white/5 relative overflow-hidden group"
      >
        <!-- Decoration -->
        <div
          class="absolute -top-12 -right-12 w-48 h-48 bg-brand-500/10 rounded-full blur-3xl transition-all group-hover:bg-brand-500/20"
        ></div>
        <div
          class="absolute -bottom-8 -left-8 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl"
        ></div>

        <div class="relative z-10 flex flex-col gap-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-3 bg-brand-500/20 rounded-2xl text-brand-400">
                <Globe size={24} />
              </div>
              <h3 class="font-bold text-xl">Tasa Oficial BCV</h3>
            </div>

            <div class="flex items-center gap-1">
              <button
                onclick={handleRefresh}
                disabled={isRefreshing}
                class="p-2 hover:bg-white/10 rounded-xl transition-colors text-text-muted hover:text-brand-400 disabled:opacity-50"
                title="Refrescar tasa desde el BCV"
              >
                <RefreshCw
                  size={18}
                  class={isRefreshing ? "animate-spin" : ""}
                />
              </button>

              <button
                onclick={() => {
                  if (!isEditing) {
                    manualRate = data.bcvRate || 0;
                  }
                  isEditing = !isEditing;
                }}
                class="p-2 hover:bg-white/10 rounded-xl transition-colors text-text-muted {isEditing
                  ? 'text-brand-400 bg-brand-500/10'
                  : 'hover:text-brand-400'}"
                title="Editar manualmente"
              >
                <ArrowUpRight size={18} />
              </button>
            </div>
          </div>

          <div class="flex flex-col">
            <span
              class="text-[10px] uppercase tracking-widest font-black text-text-muted mb-1"
              >Dólar Estadounidense (USD)</span
            >

            {#if isEditing}
              <div class="flex items-center gap-2" in:slide>
                <input
                  type="number"
                  step="0.0001"
                  bind:value={manualRate}
                  class="w-full bg-surface-base border border-brand-500/30 rounded-2xl px-6 py-4 text-3xl font-black text-white outline-none focus:ring-2 ring-brand-500/20"
                />
              </div>
            {:else}
              <div class="flex items-baseline gap-2">
                <span class="text-5xl font-black text-white tracking-tighter">
                  {displayRate ? formatCurr(displayRate) : "---"}
                </span>
                <span class="text-xl font-bold text-brand-400">Bs.</span>
              </div>
            {/if}
          </div>

          {#if !data.bcvRate && !isEditing}
            <div
              class="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"
            >
              <AlertTriangle size={16} />
              <span>No se pudo obtener la tasa automáticamente.</span>
            </div>
          {:else if !isEditing}
            <div
              class="flex items-center gap-2 text-emerald-400 text-sm font-medium"
            >
              <CheckCircle2 size={16} />
              <span>Información obtenida de bcv.org.ve</span>
            </div>
          {/if}

          <form
            method="POST"
            action="?/sync"
            use:enhance={() => {
              isSyncing = true;
              return async ({ update }) => {
                await update();
                isSyncing = false;
                isEditing = false;
                if (form?.success) {
                  toast.success("Tasa sincronizada exitosamente");
                }
              };
            }}
          >
            <input type="hidden" name="rate" value={displayRate} />
            <button
              type="submit"
              disabled={isSyncing || !displayRate}
              class="w-full h-16 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-brand-600/20 text-white rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
            >
              {#if isSyncing}
                <RefreshCw size={20} class="animate-spin" />
                Sincronizando...
              {:else}
                <RefreshCw size={20} />
                Sincronizar Sucursales
              {/if}
            </button>
          </form>
        </div>
      </div>

      <!-- TIP CARD -->
      <div
        class="glass p-6 rounded-3xl border border-white/5 text-sm text-text-muted flex gap-4"
      >
        <TrendingUp size={24} class="text-brand-400 shrink-0" />
        <p>
          Al presionar <strong>Sincronizar</strong>, el sistema actualizará
          automáticamente la tasa del dólar en el maestro de monedas de todas
          las sucursales autorizadas.
        </p>
      </div>
    </div>

    <!-- PANEL DERECHO: ESTADO POR SUCURSAL -->
    <div class="lg:col-span-2 flex flex-col gap-4">
      <div class="flex items-center justify-between px-2">
        <h3 class="font-bold text-xl flex items-center gap-2">
          <Building2 size={20} class="text-brand-400" />
          Estado de Sucursales
        </h3>
        <span
          class="text-xs text-text-muted font-medium bg-white/5 px-3 py-1 rounded-full border border-white/5"
        >
          {data.branchRates.length} Sucursales
        </span>
      </div>

      <div class="flex flex-col gap-3">
        {#each data.branchRates as branch}
          <div
            class="glass p-5 rounded-2xl border border-white/5 flex items-center justify-between group hover:bg-white/[0.02] transition-colors"
          >
            <div class="flex items-center gap-4">
              <div
                class="w-12 h-12 bg-surface-base rounded-xl flex items-center justify-center border border-white/5 group-hover:border-brand-500/30 transition-colors"
              >
                <Store
                  size={22}
                  class="text-text-muted group-hover:text-brand-400 transition-colors"
                />
              </div>
              <div class="flex flex-col">
                <h4 class="font-bold text-text-base">{branch.name}</h4>
                <span
                  class="text-xs text-text-muted font-medium uppercase tracking-tight"
                  >{branch.id}</span
                >
              </div>
            </div>

            <div class="flex items-center gap-8">
              <div class="flex flex-col items-end">
                <span
                  class="text-[10px] uppercase font-black text-text-muted tracking-widest mb-0.5"
                  >Tasa Actual</span
                >
                <div class="flex items-center gap-2">
                  <span
                    class="font-mono font-bold text-lg {branch.currentRate ===
                    data.bcvRate
                      ? 'text-emerald-400'
                      : 'text-white'}"
                  >
                    {formatCurr(branch.currentRate)}
                  </span>
                  <span class="text-xs font-medium text-text-muted">Bs.</span>
                </div>
              </div>

              <div class="w-10 h-10 flex items-center justify-center">
                {#if branch.error}
                  <div class="text-red-400" title={branch.error}>
                    <XCircle size={24} />
                  </div>
                {:else if branch.currentRate === data.bcvRate}
                  <div class="text-emerald-500" title="Sincronizada">
                    <CheckCircle2 size={24} />
                  </div>
                {:else}
                  <div class="text-amber-500" title="Desactualizada">
                    <RefreshCw size={24} class="opacity-50" />
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>

      {#if form?.results}
        <div class="mt-4 flex flex-col gap-2" in:slide>
          <h4
            class="text-xs font-black uppercase tracking-widest text-text-muted px-2"
          >
            Resultado de la última sincronización:
          </h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            {#each form.results as res}
              <div
                class="flex items-center gap-2 text-xs p-2 rounded-lg {res.success
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-red-500/10 text-red-400'} border border-white/5"
              >
                {#if res.success}
                  <CheckCircle2 size={12} />
                {:else}
                  <XCircle size={12} />
                {/if}
                <span class="font-bold">{res.branch}:</span>
                <span>{res.message}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Estilos base para el diseño glass */
  .glass {
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
</style>
