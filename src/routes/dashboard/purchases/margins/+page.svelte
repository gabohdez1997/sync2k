<!-- src/routes/dashboard/purchases/margins/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { fade, fly, slide } from 'svelte/transition';
  import { toast } from 'svelte-sonner';
  import {
    Percent,
    Building,
    CheckCircle2,
    AlertTriangle,
    RefreshCw,
    TrendingDown,
    TrendingUp,
    ShieldCheck,
    Calculator,
    Zap,
    Layers,
    ArrowRight,
    Loader2,
    Info,
    HelpCircle,
    X,
    FileSpreadsheet,
    Database
  } from 'lucide-svelte';
  import Combobox from '$lib/components/ui/Combobox.svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let branches = $derived(data.branches || []);
  let selectedBranchId = $state(data.selectedBranchId || branches[0]?.id || '');
  let selectedBranch = $derived(branches.find((b: any) => b.id === selectedBranchId) || branches[0]);
  let marginsSummary = $derived(data.marginsSummary || []);
  let crud = $derived(data.crud || { create: true, update: true });

  // ─── Estado de Edición de Márgenes ─────────────────────────────
  // Inicializamos los nuevos márgenes copiando el margen actual
  let editableMargins = $state<Record<string, number>>({});
  let selectedPrices = $state<Record<string, boolean>>({});

  $effect(() => {
    const map: Record<string, number> = {};
    const sel: Record<string, boolean> = {};
    marginsSummary.forEach((m: any) => {
      map[m.co_precio] = Number(m.margen_actual) || 0;
      sel[m.co_precio] = true; // Por defecto todos seleccionados para ajuste
    });
    editableMargins = map;
    selectedPrices = sel;
  });

  // ─── Opciones de Actualización ────────────────────────────────
  let updateMargenes = $state(true);
  let updatePrecios = $state(true);
  let filterOldMargin = $state(false);

  // ─── Simulador Interactivo ────────────────────────────────────
  let simPrice = $state(125);
  let simCurrentMargin = $state(25);
  let simNewMargin = $state(50);

  let simCost = $derived(
    simPrice > 0 && simCurrentMargin >= 0
      ? simPrice / (1 + simCurrentMargin / 100)
      : 0
  );
  let simNewPrice = $derived(
    simCost > 0 && simNewMargin >= 0
      ? Math.round(simCost * (1 + simNewMargin / 100) * 100) / 100
      : 0
  );

  // ─── Estado del Modal de Progreso y Confirmación ───────────────
  let showConfirmModal = $state(false);
  let isExecuting = $state(false);
  let executionStep = $state(1);
  let finalResult = $state<any>(null);

  // ─── Manejo de Cambio de Sucursal ─────────────────────────────
  function onBranchChange(newId: string) {
    if (newId !== selectedBranchId) {
      selectedBranchId = newId;
      goto(`?branch_id=${newId}`);
    }
  }

  // ─── Calcular Cambios Preparados ──────────────────────────────
  let preparedUpdates = $derived(
    marginsSummary
      .filter((m: any) => selectedPrices[m.co_precio])
      .map((m: any) => ({
        co_precio: m.co_precio,
        des_precio: m.des_precio,
        margen_actual: m.margen_actual,
        nuevo_margen: Number(editableMargins[m.co_precio] ?? m.margen_actual),
        variacion: Number(editableMargins[m.co_precio] ?? m.margen_actual) - Number(m.margen_actual),
        total_articulos: m.total_articulos,
        total_con_precio: m.total_con_precio
      }))
  );

  let hasPendingChanges = $derived(
    preparedUpdates.some((u: any) => Math.abs(u.variacion) > 0.001)
  );

  // ─── Efecto para Manejo de Form Action Response ───────────────
  $effect(() => {
    if (form) {
      if ((form as any).success && (form as any).result) {
        finalResult = (form as any).result;
        executionStep = 4;
        isExecuting = false;
        toast.success((form as any).message || 'Márgenes y precios actualizados exitosamente.');
      } else if ((form as any).error) {
        isExecuting = false;
        showConfirmModal = false;
        toast.error((form as any).error as string);
      }
    }
  });

  function startExecution() {
    isExecuting = true;
    executionStep = 1;
    // Simulación visual fluida mientras el server action responde
    setTimeout(() => { if (isExecuting) executionStep = 2; }, 600);
    setTimeout(() => { if (isExecuting) executionStep = 3; }, 1200);
  }
</script>

<div class="space-y-8 max-w-7xl mx-auto" in:fade>
  <!-- ─── HEADER PRINCIPAL ────────────────────────────────────── -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-border-subtle">
    <div>
      <h1 class="text-3xl sm:text-4xl font-black tracking-tight text-text-base flex items-center gap-3">
        <Percent class="text-brand-500" size={36} />
        Márgenes y Precios
      </h1>
      <p class="text-text-muted mt-1 text-sm sm:text-base">
        Ajuste global de márgenes de utilidad y recálculo automático de precios de venta en Profit Plus.
      </p>
    </div>

    <!-- Selector de Sucursal -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="w-64">
        <Combobox
          options={branches.map((b: any) => ({
            value: b.id,
            label: b.name
          }))}
          value={selectedBranchId}
          onchange={(val) => onBranchChange(val)}
          buttonClass="h-12"
          icon={Building}
          placeholder="Seleccionar sucursal..."
        />
      </div>

      <button
        onclick={() => goto(`?branch_id=${selectedBranchId}`, { invalidateAll: true })}
        class="h-12 w-12 flex items-center justify-center bg-surface-raised hover:bg-surface-soft border border-border-subtle rounded-2xl text-text-muted hover:text-text-base transition-colors"
        title="Refrescar datos del agente"
      >
        <RefreshCw size={18} />
      </button>
    </div>
  </div>

  {#if data.loadError}
    <div class="p-6 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex items-start gap-4 text-rose-500" in:fly={{ y: 10 }}>
      <AlertTriangle size={24} class="shrink-0 mt-0.5" />
      <div>
        <h3 class="font-bold text-base">Atención al conectar con la sucursal</h3>
        <p class="text-sm mt-1 opacity-90">{data.loadError}</p>
        <p class="text-xs mt-2 opacity-75">Verifica que el agente local de la sede esté en ejecución y conectado a la red.</p>
      </div>
    </div>
  {/if}

  <!-- ─── SIMULADOR Y EXPLICACIÓN DE LA FÓRMULA ──────────────── -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
    <!-- Tarjeta de Fórmula -->
    <div class="lg:col-span-7 bg-surface-raised border border-border-subtle rounded-[32px] p-6 sm:p-8 space-y-4 shadow-sm relative overflow-hidden">
      <div class="absolute -right-12 -bottom-12 opacity-5 pointer-events-none text-brand-500">
        <Calculator size={220} />
      </div>

      <div class="flex items-center gap-3 text-brand-500 font-black text-xs uppercase tracking-widest">
        <Calculator size={18} />
        Fórmula Matemática del Recálculo
      </div>

      <h2 class="text-xl font-black text-text-base">¿Cómo se actualizan los precios al cambiar el margen?</h2>

      <p class="text-sm text-text-muted leading-relaxed">
        Para que los precios de venta se ajusten con precisión sin alterar el costo original de compra, el sistema primero <strong class="text-text-base">despeja el costo implícito</strong> del artículo dividiendo el precio actual entre su margen actual, y luego le aplica el nuevo margen:
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
        <div class="p-4 bg-surface-soft/80 border border-border-subtle/80 rounded-2xl">
          <div class="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Paso 1: Obtener Costo Base</div>
          <div class="text-sm font-mono font-bold text-brand-600 dark:text-brand-400">
            Costo = Precio Actual ÷ (1 + Margen Actual)
          </div>
        </div>

        <div class="p-4 bg-surface-soft/80 border border-border-subtle/80 rounded-2xl">
          <div class="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Paso 2: Aplicar Nuevo Margen</div>
          <div class="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
            Nuevo Precio = Costo × (1 + Nuevo Margen)
          </div>
        </div>
      </div>
    </div>

    <!-- Mini Simulador Interactivo -->
    <div class="lg:col-span-5 bg-gradient-to-br from-brand-500/[0.04] to-surface-raised border border-brand-500/20 rounded-[32px] p-6 sm:p-8 space-y-4 shadow-sm">
      <div class="flex items-center gap-2 text-brand-500 font-black text-xs uppercase tracking-widest">
        <Zap size={16} />
        Simulador en Vivo
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-[10px] font-bold uppercase text-text-muted block mb-1" for="sim-cur-margin">% Margen Actual</label>
          <input
            id="sim-cur-margin"
            type="number"
            bind:value={simCurrentMargin}
            class="w-full h-11 bg-surface-raised border border-border-subtle rounded-xl px-3 font-mono font-bold text-sm text-text-base outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label class="text-[10px] font-bold uppercase text-text-muted block mb-1" for="sim-new-margin">% Nuevo Margen</label>
          <input
            id="sim-new-margin"
            type="number"
            bind:value={simNewMargin}
            class="w-full h-11 bg-surface-raised border border-border-subtle rounded-xl px-3 font-mono font-bold text-sm text-text-base outline-none focus:border-brand-500"
          />
        </div>
      </div>

      <div class="p-4 bg-surface-raised border border-border-subtle rounded-2xl flex items-center justify-between gap-4">
        <div class="flex-1">
          <label class="text-[10px] font-bold uppercase text-text-muted block mb-1" for="sim-price">Precio Actual</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted font-bold text-sm">$</span>
            <input
              id="sim-price"
              type="number"
              bind:value={simPrice}
              class="w-full h-11 bg-surface-soft border border-border-subtle rounded-xl pl-7 pr-3 font-mono font-bold text-sm text-text-base outline-none focus:border-brand-500"
            />
          </div>
        </div>

        <div class="pt-5">
          <ArrowRight size={20} class="text-brand-500 shrink-0" />
        </div>

        <div class="text-right flex-1 pt-1">
          <div class="text-[10px] font-bold uppercase text-text-muted">Nuevo Precio:</div>
          <div class="text-xl font-mono font-black text-emerald-600 dark:text-emerald-400 mt-1">
            ${simNewPrice.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ─── LISTADO DE TIPOS DE PRECIO Y MÁRGENES ──────────────── -->
  <div class="bg-surface-raised border border-border-subtle rounded-[36px] p-6 sm:p-8 space-y-6 shadow-sm">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
      <div>
        <h2 class="text-xl font-black text-text-base flex items-center gap-2">
          <Layers size={22} class="text-brand-500" />
          Tipos de Precio Configurados en Profit Plus
        </h2>
      </div>

      {#if marginsSummary.length > 0}
        <div class="text-xs font-bold text-text-muted px-4 py-2 bg-surface-soft rounded-full border border-border-subtle">
          {marginsSummary.length} tipos de precio encontrados
        </div>
      {/if}
    </div>

    {#if marginsSummary.length === 0}
      <div class="text-center py-12 text-text-muted space-y-3">
        <Info size={40} class="mx-auto opacity-30" />
        <p class="font-medium text-sm">No se encontraron tipos de precio o la sede no respondió.</p>
        <button
          onclick={() => goto(`?branch_id=${selectedBranchId}`, { invalidateAll: true })}
          class="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs rounded-xl shadow transition-all"
        >
          Reintentar conexión
        </button>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each marginsSummary as item}
          {@const nuevoM = Number(editableMargins[item.co_precio] ?? item.margen_actual)}
          {@const variacion = nuevoM - Number(item.margen_actual)}
          {@const isChecked = selectedPrices[item.co_precio]}

          <div
            class="p-5 rounded-3xl border transition-all space-y-4 {isChecked ? 'bg-surface-soft/60 border-border-subtle hover:border-brand-500/40 shadow-sm' : 'bg-surface-soft/20 border-dashed border-border-subtle/50 opacity-60'}"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <input
                  type="checkbox"
                  bind:checked={selectedPrices[item.co_precio]}
                  class="h-5 w-5 rounded-lg border-border-subtle text-brand-500 focus:ring-brand-500 cursor-pointer"
                  title="Incluir este tipo de precio en el ajuste"
                />
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="font-black text-base text-text-base">
                      {item.des_precio}
                    </h3>
                  </div>
                  <p class="text-xs text-text-muted mt-1">
                    {item.total_articulos} artículos registrados • {item.total_con_precio} con precio activo
                  </p>
                </div>
              </div>

              <!-- Badge de variación -->
              {#if Math.abs(variacion) > 0.001}
                <div class="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-xl {variacion > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}">
                  {#if variacion > 0}
                    <TrendingUp size={14} /> +{variacion.toFixed(2)}%
                  {:else}
                    <TrendingDown size={14} /> {variacion.toFixed(2)}%
                  {/if}
                </div>
              {/if}
            </div>

            <!-- Comparación de Márgenes -->
            <div class="grid grid-cols-2 gap-3 pt-2 border-t border-border-subtle/60">
              <div class="p-3 bg-surface-raised/80 border border-border-subtle rounded-2xl">
                <span class="text-[10px] font-bold uppercase text-text-muted block">Margen Actual en Profit</span>
                <span class="text-lg font-mono font-black text-text-base">
                  {Number(item.margen_actual).toFixed(2)}%
                </span>
              </div>

              <div class="p-3 bg-surface-raised/80 border border-border-subtle rounded-2xl focus-within:border-brand-500 transition-colors">
                <label class="text-[10px] font-bold uppercase text-brand-600 dark:text-brand-400 block" for="margin-{item.co_precio}">Nuevo Margen %</label>
                <div class="flex items-center gap-1">
                  <input
                    id="margin-{item.co_precio}"
                    type="number"
                    step="0.01"
                    disabled={!isChecked}
                    bind:value={editableMargins[item.co_precio]}
                    class="w-full bg-transparent font-mono font-black text-lg text-text-base outline-none disabled:opacity-50"
                  />
                  <span class="text-sm font-bold text-text-muted">%</span>
                </div>
              </div>
            </div>

            <!-- Preview del factor matemático -->
            {#if isChecked && Number(item.margen_actual) > 0 && nuevoM > 0}
              {@const factor = (1 + nuevoM / 100) / (1 + Number(item.margen_actual) / 100)}
              <div class="text-[11px] text-text-muted flex items-center justify-between px-1">
                <span>Factor sobre precio actual:</span>
                <span class="font-mono font-bold {factor < 1 ? 'text-rose-500' : 'text-emerald-500'}">
                  × {factor.toFixed(4)} ({factor < 1 ? '-' : '+'}{Math.abs((factor - 1) * 100).toFixed(2)}%)
                </span>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- ─── OPCIONES DE EJECUCIÓN (CHECKS DE CONFIRMACIÓN) ─────── -->
    <div class="p-6 bg-surface-soft/80 border border-border-subtle rounded-3xl space-y-4">
      <div class="text-xs font-black uppercase tracking-wider text-text-muted flex items-center gap-2">
        <ShieldCheck size={16} class="text-brand-500" />
        Configuración y Alcance del Ajuste Masivo
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Check 1: saArtMargen -->
        <label class="flex items-start gap-3 p-4 bg-surface-raised border border-border-subtle rounded-2xl cursor-pointer hover:border-brand-500/50 transition-colors">
          <input
            type="checkbox"
            bind:checked={updateMargenes}
            class="mt-1 h-5 w-5 rounded-lg border-border-subtle text-brand-500 focus:ring-brand-500 cursor-pointer"
          />
          <div>
            <span class="font-bold text-sm text-text-base block">Actualizar márgenes de utilidad (saArtMargen)</span>
            <span class="text-xs text-text-muted mt-0.5 block leading-normal">
              Modifica los porcentajes de margen mínimo y máximo en las fichas de los artículos en Profit Plus.
            </span>
          </div>
        </label>

        <!-- Check 2: saArtPrecio -->
        <label class="flex items-start gap-3 p-4 bg-surface-raised border border-border-subtle rounded-2xl cursor-pointer hover:border-brand-500/50 transition-colors">
          <input
            type="checkbox"
            bind:checked={updatePrecios}
            class="mt-1 h-5 w-5 rounded-lg border-border-subtle text-brand-500 focus:ring-brand-500 cursor-pointer"
          />
          <div>
            <span class="font-bold text-sm text-text-base block">Recalcular precios de venta (saArtPrecio)</span>
            <span class="text-xs text-text-muted mt-0.5 block leading-normal">
              Despeja el costo base (Precio ÷ (1 + Margen Actual)) y aplica el nuevo margen sobre los montos en moneda venta.
            </span>
          </div>
        </label>
      </div>

      <!-- Filtro Opcional de Seguridad -->
      <label class="flex items-center gap-3 p-3 text-xs text-text-muted cursor-pointer hover:text-text-base transition-colors">
        <input
          type="checkbox"
          bind:checked={filterOldMargin}
          class="h-4 w-4 rounded border-border-subtle text-brand-500 focus:ring-brand-500"
        />
        <span>
          <strong>Proteger artículos personalizados:</strong> Aplicar sólo a artículos cuyo margen actual coincida exactamente con el margen registrado de la lista.
        </span>
      </label>
    </div>

    <!-- ─── BOTÓN DE ACCIÓN PRINCIPAL ──────────────────────────── -->
    <div class="flex items-center justify-end gap-4 pt-4 border-t border-border-subtle">
      <button
        onclick={() => {
          const map: Record<string, number> = {};
          marginsSummary.forEach((m: any) => { map[m.co_precio] = Number(m.margen_actual) || 0; });
          editableMargins = map;
        }}
        class="h-12 px-6 rounded-2xl text-xs font-bold text-text-muted hover:text-text-base hover:bg-surface-soft transition-all"
      >
        Restablecer Valores
      </button>

      {#if crud.update}
        <button
          onclick={() => (showConfirmModal = true)}
          disabled={!hasPendingChanges || (!updateMargenes && !updatePrecios)}
          class="h-14 px-8 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:pointer-events-none text-white font-bold rounded-2xl flex items-center gap-3 shadow-lg shadow-brand-500/20 active:scale-95 transition-all text-sm"
        >
          <Zap size={18} />
          Aplicar Ajuste de Márgenes
        </button>
      {/if}
    </div>
  </div>
</div>

<!-- ─── MODAL DE CONFIRMACIÓN Y PROGRESO DE EJECUCIÓN ──────────── -->
{#if showConfirmModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" in:fade>
    <div
      class="bg-surface-raised w-full max-w-xl rounded-[36px] border border-border-subtle shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6"
      in:fly={{ y: 20 }}
    >
      <div class="flex items-center justify-between pb-4 border-b border-border-subtle">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-2xl bg-brand-500/10 text-brand-500 flex items-center justify-center font-bold">
            <Percent size={20} />
          </div>
          <div>
            <h3 class="font-black text-lg text-text-base">
              {isExecuting ? 'Aplicando Actualización Masiva...' : finalResult ? '¡Actualización Completada!' : 'Confirmar Ajuste Masivo'}
            </h3>
            <p class="text-xs text-text-muted">
              Sucursal de destino: <strong class="text-text-base">{selectedBranch?.name}</strong>
            </p>
          </div>
        </div>
        {#if !isExecuting}
          <button
            onclick={() => { showConfirmModal = false; finalResult = null; }}
            class="p-2 text-text-muted hover:text-text-base rounded-full hover:bg-surface-soft"
          >
            <X size={20} />
          </button>
        {/if}
      </div>

      {#if isExecuting}
        <!-- Fases de Progreso en Vivo -->
        <div class="space-y-6 py-4">
          <div class="flex items-center justify-center">
            <Loader2 size={48} class="animate-spin text-brand-500" />
          </div>

          <div class="space-y-3">
            <div class="flex items-center gap-3 text-sm {executionStep >= 1 ? 'font-bold text-text-base' : 'text-text-muted opacity-50'}">
              <div class="h-6 w-6 rounded-full flex items-center justify-center text-xs {executionStep > 1 ? 'bg-emerald-500 text-white' : executionStep === 1 ? 'bg-brand-500 text-white animate-pulse' : 'bg-surface-soft'}">
                {executionStep > 1 ? '✓' : '1'}
              </div>
              <span>Conectando con agente local en {selectedBranch?.name}...</span>
            </div>

            <div class="flex items-center gap-3 text-sm {executionStep >= 2 ? 'font-bold text-text-base' : 'text-text-muted opacity-50'}">
              <div class="h-6 w-6 rounded-full flex items-center justify-center text-xs {executionStep > 2 ? 'bg-emerald-500 text-white' : executionStep === 2 ? 'bg-brand-500 text-white animate-pulse' : 'bg-surface-soft'}">
                {executionStep > 2 ? '✓' : '2'}
              </div>
              <span>{updatePrecios ? 'Despejando costo base y recalculando precios (saArtPrecio)...' : 'Omitiendo recálculo de precios...'}</span>
            </div>

            <div class="flex items-center gap-3 text-sm {executionStep >= 3 ? 'font-bold text-text-base' : 'text-text-muted opacity-50'}">
              <div class="h-6 w-6 rounded-full flex items-center justify-center text-xs {executionStep > 3 ? 'bg-emerald-500 text-white' : executionStep === 3 ? 'bg-brand-500 text-white animate-pulse' : 'bg-surface-soft'}">
                {executionStep > 3 ? '✓' : '3'}
              </div>
              <span>{updateMargenes ? 'Actualizando porcentajes de margen en saArtMargen...' : 'Omitiendo márgenes...'}</span>
            </div>

            <div class="flex items-center gap-3 text-sm {executionStep >= 4 ? 'font-bold text-text-base' : 'text-text-muted opacity-50'}">
              <div class="h-6 w-6 rounded-full flex items-center justify-center text-xs {executionStep === 4 ? 'bg-emerald-500 text-white' : 'bg-surface-soft'}">
                4
              </div>
              <span>Confirmando transacción en SQL Server y registrando auditoría...</span>
            </div>
          </div>
        </div>

      {:else if finalResult}
        <!-- Resumen Final de Filas Afectadas -->
        <div class="space-y-6 py-2">
          <div class="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl text-center space-y-2">
            <CheckCircle2 size={44} class="mx-auto text-emerald-500" />
            <h4 class="text-lg font-black text-text-base">¡Operación Ejecutada con Éxito!</h4>
            <p class="text-xs text-text-muted">
              Transacción confirmada en {finalResult.sede_nombre} en {(finalResult.elapsed_ms / 1000).toFixed(2)} segundos.
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="p-4 bg-surface-soft rounded-2xl text-center">
              <span class="text-[11px] font-bold uppercase text-text-muted block">Márgenes Actualizados</span>
              <span class="text-2xl font-black font-mono text-brand-500">
                {finalResult.total_margenes_actualizados || 0}
              </span>
              <span class="text-[10px] text-text-muted block">artículos en saArtMargen</span>
            </div>

            <div class="p-4 bg-surface-soft rounded-2xl text-center">
              <span class="text-[11px] font-bold uppercase text-text-muted block">Precios Recalculados</span>
              <span class="text-2xl font-black font-mono text-emerald-500">
                {finalResult.total_precios_actualizados || 0}
              </span>
              <span class="text-[10px] text-text-muted block">artículos en saArtPrecio</span>
            </div>
          </div>

          <!-- Desglose por tipo de precio -->
          {#if finalResult.results && finalResult.results.length > 0}
            <div class="space-y-2 border border-border-subtle rounded-2xl p-4 bg-surface-soft/40 max-h-48 overflow-y-auto custom-scrollbar">
              <div class="text-[10px] font-bold uppercase text-text-muted">Desglose por Lista:</div>
              {#each finalResult.results as r}
                <div class="flex items-center justify-between text-xs py-1 border-b border-border-subtle/50 last:border-0">
                  <span class="font-bold text-text-base">{r.des_precio} ({r.co_precio}):</span>
                  <span class="font-mono text-text-muted">
                    {r.articulos_margenes_actualizados} márgenes • {r.articulos_precios_actualizados} precios
                  </span>
                </div>
              {/each}
            </div>
          {/if}

          <button
            onclick={() => {
              showConfirmModal = false;
              finalResult = null;
              goto(`?branch_id=${selectedBranchId}`, { invalidateAll: true });
            }}
            class="w-full h-12 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-2xl shadow transition-all text-sm"
          >
            Aceptar y Recargar Datos
          </button>
        </div>

      {:else}
        <!-- Resumen Previo antes de Disparar -->
        <div class="space-y-4">
          <p class="text-sm text-text-muted leading-relaxed">
            Estás a punto de aplicar los siguientes cambios en <strong class="text-text-base">{selectedBranch?.name}</strong>:
          </p>

          <div class="space-y-2 border border-border-subtle rounded-2xl p-4 bg-surface-soft/40 max-h-56 overflow-y-auto custom-scrollbar">
            {#each preparedUpdates as u}
              {#if Math.abs(u.variacion) > 0.001}
                <div class="flex items-center justify-between text-xs py-1.5 border-b border-border-subtle/50 last:border-0">
                  <span class="font-bold text-text-base">{u.des_precio} ({u.co_precio}):</span>
                  <span class="font-mono">
                    <span class="text-text-muted">{Number(u.margen_actual).toFixed(2)}%</span>
                    <span class="text-brand-500 mx-1">→</span>
                    <strong class="text-text-base">{u.nuevo_margen.toFixed(2)}%</strong>
                    <span class="text-text-muted text-[10px] ml-1">({u.total_articulos} arts)</span>
                  </span>
                </div>
              {/if}
            {/each}
          </div>

          <div class="text-xs text-text-muted space-y-1 p-3 bg-brand-500/5 border border-brand-500/20 rounded-2xl">
            <div>✓ Actualizar tabla <strong>saArtMargen</strong>: {updateMargenes ? 'SÍ' : 'NO'}</div>
            <div>✓ Recalcular tabla <strong>saArtPrecio</strong>: {updatePrecios ? 'SÍ' : 'NO'}</div>
            <div>✓ Filtrar sólo artículos con margen previo exacto: {filterOldMargin ? 'SÍ' : 'NO'}</div>
          </div>

          <form
            method="POST"
            action="?/updateMargins"
            use:enhance={() => {
              startExecution();
              return async ({ update }) => {
                await update({ reset: false });
              };
            }}
            class="flex items-center justify-end gap-3 pt-2"
          >
            <input type="hidden" name="branch_id" value={selectedBranchId} />
            <input type="hidden" name="updates" value={JSON.stringify(preparedUpdates.filter(u => Math.abs(u.variacion) > 0.001))} />
            <input type="hidden" name="update_margenes" value={String(updateMargenes)} />
            <input type="hidden" name="update_precios" value={String(updatePrecios)} />
            <input type="hidden" name="filter_old_margin" value={String(filterOldMargin)} />

            <button
              type="button"
              onclick={() => (showConfirmModal = false)}
              class="h-12 px-6 rounded-2xl text-xs font-bold text-text-muted hover:text-text-base hover:bg-surface-soft transition-all"
            >
              Cancelar
            </button>

            <button
              type="submit"
              class="h-12 px-8 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-2xl flex items-center gap-2 shadow-lg shadow-brand-500/20 active:scale-95 transition-all text-xs"
            >
              <Zap size={16} />
              Confirmar y Ejecutar
            </button>
          </form>
        </div>
      {/if}
    </div>
  </div>
{/if}
