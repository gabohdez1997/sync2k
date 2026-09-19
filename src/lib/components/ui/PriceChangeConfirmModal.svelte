<!-- src/lib/components/ui/PriceChangeConfirmModal.svelte -->
<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import {
    TrendingUp,
    TrendingDown,
    AlertCircle,
    ArrowRight,
    Check,
    X,
    Loader2,
    Globe,
    DollarSign
  } from "lucide-svelte";

  export interface PriceItem {
    id_precio: string;
    tipo_nombre?: string;
    precio_anterior: number;
    precio_nuevo: number;
    margen: number;
    variacion_pct: number;
  }

  export interface PriceChange {
    co_art: string;
    art_des: string;
    costo_anterior_usd: number;
    costo_nuevo_usd: number;
    costo_variacion_pct: number;
    precios: PriceItem[];
  }

  let {
    open = $bindable(false),
    changes = [],
    loading = false,
    title = "Cambios de Precios Detectados",
    documentType = "Factura de Compra",
    onconfirm,
    oncancel
  }: {
    open: boolean;
    changes: PriceChange[];
    loading?: boolean;
    title?: string;
    documentType?: string;
    onconfirm: (result: { updatePrices: boolean; broadcast: boolean; changes: PriceChange[] }) => void;
    oncancel: () => void;
  } = $props();

  let broadcast = $state(true);

  function handleConfirm(update: boolean) {
    if (loading) return;
    onconfirm({
      updatePrices: update,
      broadcast,
      changes
    });
  }

  function formatMoney(amount: number): string {
    return Number(amount || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatPercent(pct: number): string {
    const val = Number(pct || 0);
    const sign = val > 0 ? "+" : "";
    return `${sign}${val.toFixed(2)}%`;
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    in:fade={{ duration: 180 }}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0"
      onclick={() => {
        if (!loading && oncancel) oncancel();
      }}
    ></div>

    <div
      class="w-full max-w-4xl bg-surface-base border border-border-subtle rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] relative z-10"
      in:scale={{ duration: 200, start: 0.95 }}
    >
      <!-- Modal Header -->
      <div class="p-6 md:p-8 border-b border-border-subtle flex justify-between items-center bg-surface-soft/50">
        <div class="flex items-center gap-4">
          <div class="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 shadow-sm shrink-0">
            <TrendingUp size={26} />
          </div>
          <div>
            <div class="flex items-center gap-3">
              <h2 class="text-xl md:text-2xl font-black tracking-tight text-text-base">{title}</h2>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/15 text-amber-400 border border-amber-500/30">
                {changes.length} {changes.length === 1 ? 'artículo' : 'artículos'}
              </span>
            </div>
            <p class="text-text-muted text-xs md:text-sm mt-0.5">
              Al procesar esta {documentType.toLowerCase()}, se detectaron variaciones en los costos de compra. Decide si deseas actualizar los precios de venta.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={loading}
          onclick={() => {
            if (oncancel) oncancel();
          }}
          class="p-2 hover:bg-surface-strong rounded-full transition-colors cursor-pointer text-text-muted hover:text-text-base disabled:opacity-50"
          title="Cerrar"
        >
          <X size={22} />
        </button>
      </div>

      <!-- Info Banner -->
      <div class="bg-amber-500/5 border-b border-amber-500/15 px-6 py-3 flex items-start gap-3">
        <AlertCircle size={18} class="text-amber-400 shrink-0 mt-0.5" />
        <p class="text-xs text-text-muted leading-relaxed">
          <strong class="text-text-base font-semibold">Nota:</strong> Si eliges <span class="text-brand-400 font-bold">"Actualizar Precios"</span>, se aplicarán los nuevos precios calculados con el margen de ganancia. Si eliges <span class="text-text-base font-bold">"Mantener Precios"</span>, se conservarán los precios de venta actuales (se efectuará rollback a los precios originales).
        </p>
      </div>

      <!-- Scrollable Content -->
      <div class="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar custom-scrollbar">
        {#each changes as item (item.co_art)}
          {@const isUp = item.costo_nuevo_usd >= item.costo_anterior_usd}
          <div class="bg-surface-soft border border-border-subtle rounded-2xl p-5 space-y-4 hover:border-border-strong transition-all">
            <!-- Article Header & Cost Row -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle/60">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded-md font-mono text-xs font-black bg-surface-strong text-text-base border border-border-subtle">
                    {item.co_art}
                  </span>
                  <h3 class="font-bold text-sm md:text-base text-text-base line-clamp-1">
                    {item.art_des}
                  </h3>
                </div>
              </div>

              <!-- Cost comparison -->
              <div class="flex items-center gap-3 bg-surface-base px-3.5 py-2 rounded-xl border border-border-subtle shrink-0">
                <span class="text-xs text-text-muted font-medium">Costo USD:</span>
                <span class="text-xs font-bold text-text-muted line-through">
                  ${formatMoney(item.costo_anterior_usd)}
                </span>
                <ArrowRight size={14} class="text-text-muted" />
                <span class="text-sm font-black text-text-base">
                  ${formatMoney(item.costo_nuevo_usd)}
                </span>
                <span class="text-xs font-black px-2 py-0.5 rounded-lg flex items-center gap-1 {isUp ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}">
                  {#if isUp}
                    <TrendingUp size={12} />
                  {:else}
                    <TrendingDown size={12} />
                  {/if}
                  {formatPercent(item.costo_variacion_pct)}
                </span>
              </div>
            </div>

            <!-- Price Breakdown Grid -->
            <div>
              <p class="text-[11px] font-black uppercase tracking-wider text-text-muted mb-2.5">
                Proyección de Precios de Venta ({item.precios.length} tipos):
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {#each item.precios as p}
                  {@const pUp = p.precio_nuevo >= p.precio_anterior}
                  <div class="bg-surface-base p-3 rounded-xl border border-border-subtle/80 flex flex-col justify-between gap-1.5 hover:border-brand-500/30 transition-all">
                    <div class="flex items-center justify-between text-xs">
                      <span class="font-bold text-text-base">{p.tipo_nombre || `P${p.id_precio}`}</span>
                      {#if p.margen > 0}
                        <span class="text-[10px] font-semibold text-text-muted bg-surface-soft px-1.5 py-0.5 rounded">
                          Margen: {p.margen}%
                        </span>
                      {/if}
                    </div>

                    <div class="flex items-center justify-between gap-2 mt-1">
                      <div class="flex items-center gap-1.5 text-xs">
                        <span class="text-text-muted font-medium line-through">
                          ${formatMoney(p.precio_anterior)}
                        </span>
                        <ArrowRight size={12} class="text-text-muted shrink-0" />
                        <span class="font-black text-sm text-brand-400">
                          ${formatMoney(p.precio_nuevo)}
                        </span>
                      </div>

                      {#if p.variacion_pct !== 0}
                        <span class="text-[10px] font-black px-1.5 py-0.5 rounded {pUp ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}">
                          {formatPercent(p.variacion_pct)}
                        </span>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/each}
      </div>

      <!-- Modal Footer -->
      <div class="p-6 border-t border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-soft/30">
        <!-- Broadcast Checkbox -->
        <label class="flex items-center gap-3 cursor-pointer text-sm font-semibold text-text-base select-none hover:text-text-strong transition-colors">
          <input
            type="checkbox"
            bind:checked={broadcast}
            class="h-4 w-4 rounded-md border-border-subtle text-brand-500 focus:ring-brand-500 bg-surface-base cursor-pointer"
          />
          <div class="flex items-center gap-1.5 text-xs md:text-sm">
            <Globe size={15} class="text-brand-400 shrink-0" />
            <span>Aplicar precios en todas las sedes (Broadcast)</span>
          </div>
        </label>

        <!-- Action Buttons -->
        <div class="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            disabled={loading}
            onclick={() => handleConfirm(false)}
            class="flex-1 sm:flex-none px-5 py-3 rounded-2xl font-bold text-xs md:text-sm text-text-muted hover:text-text-base bg-surface-soft hover:bg-surface-strong border border-border-subtle transition-all cursor-pointer disabled:opacity-50"
          >
            No, Mantener Precios Actuales
          </button>

          <button
            type="button"
            disabled={loading}
            onclick={() => handleConfirm(true)}
            class="flex-1 sm:flex-none px-6 py-3 rounded-2xl font-black text-xs md:text-sm bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-500/25 transition-all active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {#if loading}
              <Loader2 size={16} class="animate-spin" />
              <span>Guardando...</span>
            {:else}
              <Check size={16} />
              <span>Sí, Actualizar Precios</span>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
