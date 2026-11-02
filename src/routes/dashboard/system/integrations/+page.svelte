<!-- src/routes/dashboard/system/integrations/+page.svelte -->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { fade, slide, scale } from "svelte/transition";
  import { toast } from "svelte-sonner";
  import {
    Blocks,
    Search,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Zap,
    RefreshCw,
    ExternalLink,
    Lock,
    Eye,
    EyeOff,
    Receipt,
    Wifi,
    CreditCard,
    Landmark,
    SlidersHorizontal,
    X,
    Save,
    Activity,
    Clock,
    ShieldCheck,
    Globe,
    Check,
    Loader2,
    Sliders,
    Sparkles,
    FlaskConical,
    Database,
    Users,
    Layers,
    ArrowRight
  } from "lucide-svelte";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let integrations = $state(data.integrations || []);
  $effect(() => {
    if (data.integrations) {
      integrations = data.integrations;
    }
  });

  // Filtros
  let selectedCategory = $state<string>("all");
  let searchQuery = $state<string>("");

  // Modal de configuración
  let isModalOpen = $state(false);
  let editingItem = $state<any>(null);
  let showPassword = $state<Record<string, boolean>>({});

  // Modal de sincronización WispHub <-> Profit Plus
  let isSyncModalOpen = $state(false);
  let syncTargetBranch = $state(data.branches?.[0]?.id || "");
  let syncCustomers = $state(true);
  let syncPlans = $state(true);
  let overwriteExisting = $state(true);
  let isSyncing = $state(false);
  let syncSummary = $state<any>(null);

  // Estados de prueba y guardado
  let testingId = $state<string | null>(null);
  let liveTestResult = $state<any>(null);
  let savingId = $state<string | null>(null);

  // Categorías disponibles
  const categories = [
    { id: "all", label: "Todas", icon: Blocks },
    { id: "billing", label: "Facturación Electrónica", icon: Receipt },
    { id: "isp", label: "Telecom & ISP", icon: Wifi },
    { id: "payment", label: "Pasarelas & BNPL", icon: CreditCard },
    { id: "banking", label: "APIs Bancarias", icon: Landmark },
  ];

  // Integraciones filtradas
  const filteredIntegrations = $derived.by(() => {
    return integrations.filter((item) => {
      const matchCat =
        selectedCategory === "all" || item.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  });

  // Métricas
  const totalCount = $derived(integrations.length);
  const activeCount = $derived(integrations.filter((i) => i.is_active).length);
  const testedSuccessCount = $derived(
    integrations.filter((i) => i.last_test_status === "success").length,
  );

  function getCategoryIcon(cat: string) {
    switch (cat) {
      case "billing":
        return Receipt;
      case "isp":
        return Wifi;
      case "payment":
        return CreditCard;
      case "banking":
        return Landmark;
      default:
        return Blocks;
    }
  }

  function getCategoryColor(cat: string) {
    switch (cat) {
      case "billing":
        return "text-cyan-400 bg-cyan-500/10 border-cyan-500/20";
      case "isp":
        return "text-indigo-400 bg-indigo-500/10 border-indigo-500/20";
      case "payment":
        return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      case "banking":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      default:
        return "text-brand-400 bg-brand-500/10 border-brand-500/20";
    }
  }

  function openConfigModal(item: any) {
    editingItem = JSON.parse(JSON.stringify(item));
    liveTestResult = null;
    showPassword = {};
    isModalOpen = true;
  }

  function closeModal() {
    isModalOpen = false;
    editingItem = null;
    liveTestResult = null;
  }

  function openSyncModal(item?: any) {
    isSyncModalOpen = true;
    syncSummary = null;
    if (data.branches && data.branches.length > 0 && !syncTargetBranch) {
      syncTargetBranch = data.branches[0].id;
    }
  }

  function closeSyncModal() {
    if (isSyncing) return;
    isSyncModalOpen = false;
    syncSummary = null;
  }

  async function executeWisphubSync() {
    if (!syncTargetBranch) {
      toast.error("Seleccione una sucursal con Agente Sync2K configurado.");
      return;
    }
    if (!syncCustomers && !syncPlans) {
      toast.error("Seleccione al menos una entidad para sincronizar (Clientes o Planes).");
      return;
    }

    isSyncing = true;
    syncSummary = null;

    try {
      let customersResult: any = null;
      let plansResult: any = null;

      if (syncCustomers) {
        toast.info("Sincronizando clientes de WispHub hacia saCliente...");
        const res = await fetch("/api/integrations/wisphub/sync/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_id: syncTargetBranch,
            options: {
              overwrite_existing: overwriteExisting
            }
          })
        });
        customersResult = await res.json();
        if (!res.ok) {
          throw new Error(customersResult.message || "Error al sincronizar clientes");
        }
      }

      if (syncPlans) {
        toast.info("Verificando planes de WispHub contra saArticulo...");
        const res = await fetch("/api/integrations/wisphub/sync/plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_id: syncTargetBranch
          })
        });
        plansResult = await res.json();
        if (!res.ok) {
          throw new Error(plansResult.message || "Error al verificar planes");
        }
      }

      syncSummary = {
        customers: customersResult?.summary || null,
        plans: plansResult || null,
        branch: customersResult?.branch || plansResult?.branch || null
      };

      toast.success("Sincronización con Profit Plus finalizada exitosamente.");
    } catch (err: any) {
      toast.error(`Error de sincronización: ${err.message}`);
    } finally {
      isSyncing = false;
    }
  }

  function toggleShowSecret(key: string) {
    showPassword[key] = !showPassword[key];
  }

  function handleEnvironmentChange(env: string) {
    if (!editingItem) return;
    editingItem.environment = env;
    if (editingItem.id === "the_factory_hka") {
      editingItem.base_url =
        env === "production"
          ? "https://emision.thefactoryhka.com.ve"
          : "https://demoemision.thefactoryhka.com.ve";
    } else if (editingItem.id === "wisphub") {
      editingItem.base_url =
        env === "production"
          ? "https://api.wisphub.net/api"
          : "https://sandbox-api.wisphub.net/api";
    }
  }
</script>

<svelte:head>
  <title>Integraciones & Conectores | Sync2K</title>
</svelte:head>

<div class="space-y-6 max-w-7xl mx-auto pb-12">
  <!-- Cabecera Principal y Métricas Rápidas -->
  <div
    class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2"
  >
    <div>
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-2xl bg-brand-500/10 text-brand-400 flex items-center justify-center border border-brand-500/20 shadow-xs"
        >
          <Blocks size={20} />
        </div>
        <div>
          <h1
            class="text-2xl font-black tracking-tight text-text-base flex items-center gap-2"
          >
            Integraciones
          </h1>
          <p class="text-xs text-text-muted mt-0.5 font-medium">
            Administra las conexiones externas: Facturación TFHKA, WispHub,
            pasarelas de pago y servicios bancarios.
          </p>
        </div>
      </div>
    </div>

    <!-- Indicadores de Estado General -->
    <div class="flex items-center gap-2 text-xs">
      <div
        class="px-3.5 py-1.5 rounded-2xl bg-surface-raised border border-border-subtle flex items-center gap-2 font-mono font-bold shadow-xs"
      >
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span class="text-text-muted text-[11px]">Activas:</span>
        <span class="text-text-base">{activeCount} / {totalCount}</span>
      </div>

      <div
        class="px-3.5 py-1.5 rounded-2xl bg-surface-raised border border-border-subtle flex items-center gap-2 font-mono font-bold shadow-xs"
      >
        <CheckCircle2 size={13} class="text-cyan-400" />
        <span class="text-text-muted text-[11px]">Verificadas:</span>
        <span class="text-text-base">{testedSuccessCount}</span>
      </div>
    </div>
  </div>

  <!-- Barra de Filtros por Categoría y Buscador -->
  <div
    class="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3"
  >
    <!-- Píldoras de Categoría -->
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
      {#each categories as cat}
        {@const Icon = cat.icon}
        {@const isSelected = selectedCategory === cat.id}
        <button
          type="button"
          onclick={() => (selectedCategory = cat.id)}
          class="px-3.5 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer border {isSelected
            ? 'bg-brand-500 text-white border-brand-500 shadow-md shadow-brand-500/20'
            : 'bg-surface-raised hover:bg-surface-soft text-text-muted hover:text-text-base border-border-subtle'}"
        >
          <Icon size={14} />
          <span>{cat.label}</span>
        </button>
      {/each}
    </div>

    <!-- Buscador en tiempo real -->
    <div class="relative w-full lg:w-72">
      <Search
        size={14}
        class="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
      />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Buscar servicio..."
        class="w-full bg-surface-raised border border-border-subtle pl-9 pr-8 py-2 rounded-2xl text-xs font-medium text-text-base placeholder:text-text-muted/50 focus:border-brand-500 outline-none transition-all shadow-xs"
      />
      {#if searchQuery}
        <button
          type="button"
          onclick={() => (searchQuery = "")}
          class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-base cursor-pointer"
        >
          <X size={14} />
        </button>
      {/if}
    </div>
  </div>

  <!-- Cuadrícula de Tarjetas de Integración -->
  <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
    {#each filteredIntegrations as item (item.id)}
      {@const CatIcon = getCategoryIcon(item.category)}
      {@const catColorClass = getCategoryColor(item.category)}
      <div
        class="bg-surface-raised p-6 rounded-3xl border border-border-subtle shadow-xl hover:border-brand-500/30 transition-all flex flex-col justify-between group relative overflow-hidden"
      >
        <div>
          <!-- Cabecera de la Tarjeta -->
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <div
                class="w-12 h-12 rounded-2xl flex items-center justify-center border {catColorClass} shadow-xs"
              >
                <CatIcon size={22} />
              </div>
              <div>
                <h3
                  class="text-base font-black text-text-base group-hover:text-brand-400 transition-colors"
                >
                  {item.name}
                </h3>
                <span class="text-[11px] font-mono text-text-muted font-bold">
                  {item.id}
                </span>
              </div>
            </div>

            <!-- Switch Activo / Inactivo -->
            <form
              method="POST"
              action="?/toggle"
              use:enhance={() => {
                savingId = item.id;
                return async ({ result, update }) => {
                  savingId = null;
                  if (result.type === "success") {
                    toast.success(result.data?.message || "Estado actualizado");
                    await update();
                  } else {
                    toast.error("Error al actualizar estado");
                  }
                };
              }}
            >
              <input type="hidden" name="id" value={item.id} />
              <input
                type="hidden"
                name="is_active"
                value={item.is_active ? "false" : "true"}
              />
              <button
                type="submit"
                disabled={!data.canUpdate || savingId === item.id}
                title={item.is_active
                  ? "Desactivar integración"
                  : "Activar integración"}
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 {item.is_active
                  ? 'bg-emerald-500'
                  : 'bg-surface-soft border border-border-subtle'}"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-xs {item.is_active
                    ? 'translate-x-6'
                    : 'translate-x-1'}"
                ></span>
              </button>
            </form>
          </div>

          <!-- Descripción -->
          <p
            class="text-xs text-text-muted font-medium mt-4 line-clamp-2 leading-relaxed"
          >
            {item.description}
          </p>

          <!-- Badges de Configuración y Entorno (Alto contraste en claro/oscuro) -->
          <div class="mt-4 flex flex-wrap items-center gap-2 text-[10px]">
            {#if item.environment}
              <span
                class="px-2.5 py-1 rounded-xl font-black uppercase tracking-wider border flex items-center gap-1.5 {item.environment ===
                'production'
                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/35'}"
                title={`Entorno configurado: ${item.environment.toUpperCase()}`}
              >
                {#if item.environment === 'production'}
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                  <span>PRODUCCIÓN</span>
                {:else}
                  <FlaskConical size={11} class="text-amber-700 dark:text-amber-300 shrink-0" />
                  <span>{item.environment.toUpperCase()}</span>
                {/if}
              </span>
            {/if}

            <span
              class="px-2.5 py-1 rounded-xl font-black uppercase tracking-wider border {item.is_active
                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                : 'bg-surface-soft text-text-muted border-border-subtle'}"
            >
              {item.is_active ? "Activo" : "Inactivo"}
            </span>

            {#if item.last_test_status === "success"}
              <span
                class="px-2.5 py-1 rounded-xl font-black uppercase tracking-wider bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border border-cyan-500/30 flex items-center gap-1"
              >
                <Check size={11} />
                <span>Test OK</span>
              </span>
            {:else if item.last_test_status === "failed"}
              <span
                class="px-2.5 py-1 rounded-xl font-black uppercase tracking-wider bg-red-500/15 text-red-800 dark:text-red-300 border border-red-500/30 flex items-center gap-1"
              >
                <X size={11} />
                <span>Fallo Test</span>
              </span>
            {/if}
          </div>

          <!-- Endpoint URL -->
          <div
            class="mt-4 pt-3 border-t border-border-subtle/50 flex items-center justify-between text-text-muted"
          >
            <span
              class="truncate max-w-[210px] font-mono text-[10px] font-bold"
              title={item.base_url}
            >
              {item.base_url}
            </span>
            {#if item.last_tested_at}
              <span class="shrink-0 text-[10px] font-mono font-bold">
                {new Date(item.last_tested_at).toLocaleDateString()}
              </span>
            {/if}
          </div>
        </div>

        <!-- Acciones Inferiores de la Tarjeta -->
        <div
          class="mt-5 pt-4 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2"
        >
          <div class="flex items-center gap-2">
            <!-- Botón Probar Conexión -->
            <form
              method="POST"
              action="?/test"
              use:enhance={() => {
                testingId = item.id;
                return async ({ result, update }) => {
                  testingId = null;
                  if (result.type === "success") {
                    const res = result.data?.testResult;
                    if (res?.success) {
                      toast.success(res.message || "Conexión exitosa.");
                    } else {
                      toast.error(res?.message || "Fallo en la prueba.");
                    }
                    await update();
                  } else {
                    toast.error("Error al ejecutar la prueba.");
                  }
                };
              }}
            >
              <input type="hidden" name="id" value={item.id} />
              <button
                type="submit"
                disabled={!data.canExecute || testingId === item.id}
                class="px-3.5 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-xs font-bold text-text-base hover:text-brand-400 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {#if testingId === item.id}
                  <Loader2 size={13} class="animate-spin text-brand-400" />
                  <span>Probando...</span>
                {:else}
                  <Zap size={13} class="text-amber-500" />
                  <span>Probar</span>
                {/if}
              </button>
            </form>

            <!-- Botón Sincronizar (Específico para WispHub cuando está activo) -->
            {#if item.id === "wisphub" && item.is_active}
              <button
                type="button"
                onclick={() => openSyncModal(item)}
                class="px-3.5 py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="Sincronizar clientes y planes de WispHub hacia Profit Plus"
              >
                <RefreshCw size={13} class={isSyncing ? "animate-spin" : ""} />
                <span>Sincronizar</span>
              </button>
            {/if}
          </div>

          <!-- Botón Configurar Modal -->
          <button
            type="button"
            onclick={() => openConfigModal(item)}
            class="px-4 py-2 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/20 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <SlidersHorizontal size={13} />
            <span>Configurar</span>
          </button>
        </div>
      </div>
    {/each}
  </div>
</div>

<!-- ============================================================== -->
<!-- MODAL DE CONFIGURACIÓN ESTILO SYNC2K (NATIVO CON CONTRASTE)   -->
<!-- ============================================================== -->
{#if isModalOpen && editingItem}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    in:fade={{ duration: 180 }}
  >
    <div
      class="fixed inset-0"
      onclick={() => {
        if (!savingId && !testingId) closeModal();
      }}
    ></div>

    <div
      class="w-full max-w-2xl bg-surface-base border border-border-subtle rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[88vh] relative z-10"
      in:scale={{ duration: 200, start: 0.95 }}
    >
      <!-- Cabecera del Modal con fondo suave -->
      <div
        class="p-6 md:p-8 border-b border-border-subtle flex justify-between items-center bg-surface-soft/60"
      >
        <div class="flex items-center gap-4">
          <div
            class="h-12 w-12 rounded-2xl bg-brand-500/10 text-brand-400 flex items-center justify-center border border-brand-500/20 shadow-sm shrink-0"
          >
            {#if editingItem.category === "billing"}
              <Receipt size={24} />
            {:else if editingItem.category === "isp"}
              <Wifi size={24} />
            {:else if editingItem.category === "payment"}
              <CreditCard size={24} />
            {:else}
              <Landmark size={24} />
            {/if}
          </div>
          <div>
            <div class="flex items-center gap-2.5">
              <h2
                class="text-xl md:text-2xl font-black tracking-tight text-text-base"
              >
                {editingItem.name}
              </h2>
              <span
                class="px-2 py-0.5 rounded-lg text-[10px] font-mono font-black uppercase bg-surface-soft border border-border-subtle text-text-muted"
              >
                {editingItem.id}
              </span>
            </div>
            <p class="text-text-muted text-xs md:text-sm mt-0.5">
              Configuración de credenciales y parámetros de conexión para el
              servicio.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={Boolean(savingId || testingId)}
          onclick={closeModal}
          class="h-10 w-10 rounded-2xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base flex items-center justify-center transition-colors border border-border-subtle cursor-pointer disabled:opacity-50"
        >
          <X size={18} />
        </button>
      </div>

      <!-- Formulario Principal -->
      <form
        method="POST"
        action="?/save"
        class="flex-1 overflow-y-auto p-6 md:p-8 space-y-6"
        use:enhance={() => {
          savingId = editingItem.id;
          return async ({ result, update }) => {
            savingId = null;
            if (result.type === "success") {
              toast.success(
                result.data?.message || "Configuración guardada exitosamente.",
              );
              closeModal();
              await update();
            } else {
              toast.error(
                result.data?.error || "Error al guardar la configuración.",
              );
            }
          };
        }}
      >
        <input type="hidden" name="id" value={editingItem.id} />
        <input
          type="hidden"
          name="is_active"
          value={editingItem.is_active ? "true" : "false"}
        />
        <input
          type="hidden"
          name="environment"
          value={editingItem.environment}
        />
        <input
          type="hidden"
          name="credentials"
          value={JSON.stringify(editingItem.credentials || {})}
        />
        <input
          type="hidden"
          name="options"
          value={JSON.stringify(editingItem.options || {})}
        />

        <div class="space-y-6">
          <!-- Sección 1: Entorno y Estado -->
          <div class="space-y-4">
            <span
              class="text-xs font-black uppercase tracking-wider text-brand-400 flex items-center gap-2 border-b border-border-subtle/50 pb-2"
            >
              <Globe size={14} />
              1. Entorno de Conexión
            </span>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Selector de Entorno -->
              <div class="space-y-1.5">
                <label
                  class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
                >
                  Ambiente
                </label>
                <div class="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-surface-soft border border-border-subtle">
                  <button
                    type="button"
                    onclick={() => handleEnvironmentChange("sandbox")}
                    class="py-2 rounded-xl text-xs font-bold transition-all cursor-pointer {editingItem.environment !==
                    'production'
                      ? 'bg-surface-base text-amber-500 shadow-sm border border-border-subtle font-black'
                      : 'text-text-muted hover:text-text-base'}"
                  >
                    Demo / Sandbox
                  </button>
                  <button
                    type="button"
                    onclick={() => handleEnvironmentChange("production")}
                    class="py-2 rounded-xl text-xs font-bold transition-all cursor-pointer {editingItem.environment ===
                    'production'
                      ? 'bg-surface-base text-emerald-500 shadow-sm border border-border-subtle font-black'
                      : 'text-text-muted hover:text-text-base'}"
                  >
                    Producción
                  </button>
                </div>
              </div>

              <!-- Estado de Activación -->
              <div class="space-y-1.5">
                <label
                  class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
                >
                  Habilitar Integración
                </label>
                <div
                  class="flex items-center justify-between p-2.5 rounded-2xl bg-surface-soft border border-border-subtle h-[46px]"
                >
                  <span class="text-xs font-bold text-text-base ml-2">
                    {editingItem.is_active ? "Activo" : "Inactivo"}
                  </span>
                  <button
                    type="button"
                    onclick={() =>
                      (editingItem.is_active = !editingItem.is_active)}
                    class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer {editingItem.is_active
                      ? 'bg-emerald-500'
                      : 'bg-surface-strong border border-border-subtle'}"
                  >
                    <span
                      class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-xs {editingItem.is_active
                        ? 'translate-x-6'
                        : 'translate-x-1'}"
                    ></span>
                  </button>
                </div>
              </div>
            </div>

            <!-- URL Base del Endpoint -->
            <div class="space-y-1.5">
              <label
                class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
              >
                URL Base del API
              </label>
              <input
                type="text"
                name="base_url"
                bind:value={editingItem.base_url}
                placeholder="https://api.servicio.com"
                class="w-full bg-surface-soft border border-border-subtle px-4 py-3 rounded-2xl text-xs font-mono font-bold text-text-base placeholder:text-text-muted/40 focus:border-brand-500 outline-none transition-all"
              />
            </div>
          </div>

          <!-- Sección 2: Credenciales Específicas -->
          <div class="space-y-4 pt-2">
            <span
              class="text-xs font-black uppercase tracking-wider text-brand-400 flex items-center gap-2 border-b border-border-subtle/50 pb-2"
            >
              <Lock size={14} />
              2. Credenciales y Parámetros
            </span>

            {#if editingItem.id === "the_factory_hka"}
              <!-- THE FACTORY HKA -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label
                    class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
                  >
                    Token Empresa (Usuario)
                  </label>
                  <div class="relative">
                    <input
                      type={showPassword["hka_emp"] ? "text" : "password"}
                      bind:value={editingItem.credentials.token_empresa}
                      placeholder="Usuario asignado por TFHKA"
                      class="w-full bg-surface-soft border border-border-subtle pl-4 pr-11 py-3 rounded-2xl text-xs font-mono font-bold text-text-base placeholder:text-text-muted/40 focus:border-brand-500 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onclick={() => toggleShowSecret("hka_emp")}
                      class="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-base transition-colors cursor-pointer"
                    >
                      {#if showPassword["hka_emp"]}
                        <EyeOff size={15} />
                      {:else}
                        <Eye size={15} />
                      {/if}
                    </button>
                  </div>
                </div>

                <div class="space-y-1.5">
                  <label
                    class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
                  >
                    Token Clave (Contraseña)
                  </label>
                  <div class="relative">
                    <input
                      type={showPassword["hka_pass"] ? "text" : "password"}
                      bind:value={editingItem.credentials.token_clave}
                      placeholder="Clave de emisión TFHKA"
                      class="w-full bg-surface-soft border border-border-subtle pl-4 pr-11 py-3 rounded-2xl text-xs font-mono font-bold text-text-base placeholder:text-text-muted/40 focus:border-brand-500 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onclick={() => toggleShowSecret("hka_pass")}
                      class="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-base transition-colors cursor-pointer"
                    >
                      {#if showPassword["hka_pass"]}
                        <EyeOff size={15} />
                      {:else}
                        <Eye size={15} />
                      {/if}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Datos Fiscales del Emisor -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label
                    class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
                  >
                    RIF del Emisor
                  </label>
                  <input
                    type="text"
                    bind:value={editingItem.options.emisor_rif}
                    placeholder="J-504441244"
                    class="w-full bg-surface-soft border border-border-subtle px-4 py-3 rounded-2xl text-xs font-bold text-text-base placeholder:text-text-muted/40 focus:border-brand-500 outline-none transition-all"
                  />
                </div>

                <div class="space-y-1.5">
                  <label
                    class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
                  >
                    Razón Social
                  </label>
                  <input
                    type="text"
                    bind:value={editingItem.options.emisor_nombre}
                    placeholder="ALDANET, C.A"
                    class="w-full bg-surface-soft border border-border-subtle px-4 py-3 rounded-2xl text-xs font-bold text-text-base placeholder:text-text-muted/40 focus:border-brand-500 outline-none transition-all"
                  />
                </div>

                <div class="space-y-1.5">
                  <label
                    class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
                  >
                    Correo Emisor
                  </label>
                  <input
                    type="email"
                    bind:value={editingItem.options.emisor_correo}
                    placeholder="facturacion@aldanet.com.ve"
                    class="w-full bg-surface-soft border border-border-subtle px-4 py-3 rounded-2xl text-xs font-bold text-text-base placeholder:text-text-muted/40 focus:border-brand-500 outline-none transition-all"
                  />
                </div>

                <div class="space-y-1.5">
                  <label
                    class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
                  >
                    Correo Copia Oculta
                  </label>
                  <input
                    type="text"
                    bind:value={editingItem.options.correo_adicional}
                    placeholder="copia@aldanet.com.ve"
                    class="w-full bg-surface-soft border border-border-subtle px-4 py-3 rounded-2xl text-xs font-bold text-text-base placeholder:text-text-muted/40 focus:border-brand-500 outline-none transition-all"
                  />
                </div>
              </div>
            {:else if editingItem.id === "wisphub"}
              <!-- WISPHUB -->
              <div class="space-y-1.5">
                <label
                  class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
                >
                  Api-Key de WispHub (Cabecera Authorization)
                </label>
                <div class="relative">
                  <input
                    type={showPassword["wisp_key"] ? "text" : "password"}
                    bind:value={editingItem.credentials.api_key}
                    placeholder="Api-Key obtenida en Wisphub Ajustes -> API"
                    class="w-full bg-surface-soft border border-border-subtle pl-4 pr-11 py-3 rounded-2xl text-xs font-mono font-bold text-text-base placeholder:text-text-muted/40 focus:border-brand-500 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onclick={() => toggleShowSecret("wisp_key")}
                    class="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-base transition-colors cursor-pointer"
                  >
                    {#if showPassword["wisp_key"]}
                      <EyeOff size={15} />
                    {:else}
                      <Eye size={15} />
                    {/if}
                  </button>
                </div>
              </div>

              <!-- Opciones WispHub -->
              <div class="space-y-3 pt-2">
                <label
                  class="flex items-start gap-3.5 p-4 rounded-2xl bg-surface-soft border border-border-subtle cursor-pointer hover:bg-surface-strong/60 transition-all"
                >
                  <input
                    type="checkbox"
                    bind:checked={editingItem.options.sync_clients}
                    class="w-4 h-4 mt-0.5 rounded text-brand-500 focus:ring-brand-500 shrink-0"
                  />
                  <div>
                    <span class="font-bold text-text-base text-xs block"
                      >Sincronización de Clientes</span
                    >
                    <span
                      class="text-text-muted font-medium text-[11px] leading-relaxed block mt-0.5"
                    >
                      Vincular clientes de WispHub hacia el catálogo maestro de
                      clientes de Profit Plus (`saCliente`).
                    </span>
                  </div>
                </label>

                <label
                  class="flex items-start gap-3.5 p-4 rounded-2xl bg-surface-soft border border-border-subtle cursor-pointer hover:bg-surface-strong/60 transition-all"
                >
                  <input
                    type="checkbox"
                    bind:checked={editingItem.options.sync_services}
                    class="w-4 h-4 mt-0.5 rounded text-brand-500 focus:ring-brand-500 shrink-0"
                  />
                  <div>
                    <span class="font-bold text-text-base text-xs block"
                      >Mapeo de Planes de Internet</span
                    >
                    <span
                      class="text-text-muted font-medium text-[11px] leading-relaxed block mt-0.5"
                    >
                      Registrar planes de internet como artículos de servicio
                      (`saArticulo`) bajo línea Servicios / Telecom.
                    </span>
                  </div>
                </label>

                <!-- Acceso directo a Sincronización Inmediata -->
                <div class="pt-2">
                  <button
                    type="button"
                    onclick={() => {
                      closeModal();
                      openSyncModal(editingItem);
                    }}
                    class="w-full py-3 px-4 rounded-2xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <RefreshCw size={14} />
                    <span>Abrir Asistente de Sincronización Profit Plus</span>
                  </button>
                </div>
              </div>
            {:else if editingItem.id === "cashea"}
              <!-- CASHEA -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label
                    class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
                  >
                    API Key
                  </label>
                  <input
                    type="password"
                    bind:value={editingItem.credentials.api_key}
                    placeholder="Cashea API Key"
                    class="w-full bg-surface-soft border border-border-subtle px-4 py-3 rounded-2xl text-xs font-mono font-bold text-text-base placeholder:text-text-muted/40 focus:border-brand-500 outline-none transition-all"
                  />
                </div>

                <div class="space-y-1.5">
                  <label
                    class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
                  >
                    Merchant ID
                  </label>
                  <input
                    type="text"
                    bind:value={editingItem.credentials.merchant_id}
                    placeholder="ID de Comercio Cashea"
                    class="w-full bg-surface-soft border border-border-subtle px-4 py-3 rounded-2xl text-xs font-bold text-text-base placeholder:text-text-muted/40 focus:border-brand-500 outline-none transition-all"
                  />
                </div>
              </div>
            {:else}
              <!-- GENÉRICO / BANCOS / OTROS -->
              <div class="space-y-1.5">
                <label
                  class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
                >
                  API Key o Token de Acceso
                </label>
                <input
                  type="password"
                  bind:value={editingItem.credentials.api_key}
                  placeholder="Token de acceso para este servicio"
                  class="w-full bg-surface-soft border border-border-subtle px-4 py-3 rounded-2xl text-xs font-mono font-bold text-text-base placeholder:text-text-muted/40 focus:border-brand-500 outline-none transition-all"
                />
              </div>
            {/if}
          </div>

          <!-- Banner de Resultado de Prueba en vivo -->
          {#if liveTestResult}
            <div
              class="p-4 rounded-2xl border text-xs font-mono {liveTestResult.success
                ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                : 'bg-red-500/10 text-red-800 dark:text-red-300 border-red-500/30'}"
            >
              <div class="flex items-center gap-2 font-black mb-1">
                {#if liveTestResult.success}
                  <CheckCircle2 size={16} />
                  <span>Prueba Satisfactoria</span>
                {:else}
                  <AlertCircle size={16} />
                  <span>Prueba Fallida</span>
                {/if}
                <span class="text-[10px] ml-auto opacity-70"
                  >{liveTestResult.latencyMs}ms</span
                >
              </div>
              <p class="leading-relaxed">{liveTestResult.message}</p>
            </div>
          {/if}
        </div>

        <!-- Footer del Modal con Acciones -->
        <div
          class="p-6 md:p-8 border-t border-border-subtle flex flex-col-reverse sm:flex-row items-center justify-between gap-4 bg-surface-soft/60 -mx-6 md:-mx-8 -mb-6 md:-mb-8 mt-6"
        >
          <!-- Botón de Prueba en Modal -->
          <button
            type="button"
            disabled={Boolean(testingId || savingId)}
            onclick={async () => {
              testingId = editingItem.id;
              liveTestResult = null;
              try {
                const formData = new FormData();
                formData.append("id", editingItem.id);
                formData.append(
                  "credentials",
                  JSON.stringify(editingItem.credentials || {}),
                );
                const res = await fetch("?/test", {
                  method: "POST",
                  body: formData,
                });
                const resData = await res.json();
                if (resData?.data) {
                  liveTestResult = resData.data.testResult;
                  if (liveTestResult.success) {
                    toast.success(
                      liveTestResult.message || "Conexión exitosa.",
                    );
                  } else {
                    toast.error(
                      liveTestResult.message || "Fallo en la prueba.",
                    );
                  }
                }
              } catch (e: any) {
                toast.error(`Error: ${e.message}`);
              } finally {
                testingId = null;
              }
            }}
            class="px-5 h-12 rounded-2xl bg-surface-base hover:bg-surface-strong border border-border-subtle text-xs font-bold text-text-base hover:text-brand-400 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {#if testingId === editingItem.id}
              <Loader2 size={15} class="animate-spin text-brand-400" />
              <span>Verificando...</span>
            {:else}
              <Zap size={15} class="text-amber-500" />
              <span>Probar Conexión</span>
            {/if}
          </button>

          <!-- Guardar y Cancelar -->
          <div class="flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={Boolean(savingId || testingId)}
              onclick={closeModal}
              class="px-5 h-12 rounded-2xl text-xs font-bold text-text-muted hover:text-text-base hover:bg-surface-soft transition-all cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={Boolean(savingId || testingId)}
              class="px-6 h-12 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white rounded-2xl font-bold text-xs transition-all active:scale-95 shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {#if savingId === editingItem.id}
                <Loader2 size={15} class="animate-spin" />
                <span>Guardando...</span>
              {:else}
                <Save size={15} />
                <span>Guardar Cambios</span>
              {/if}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- ============================================================== -->
<!-- MODAL DE ASISTENTE DE SINCRONIZACIÓN WISPHUB <-> PROFIT PLUS   -->
<!-- ============================================================== -->
{#if isSyncModalOpen}
  <div
    class="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    in:fade={{ duration: 180 }}
  >
    <div class="fixed inset-0" onclick={closeSyncModal}></div>

    <div
      class="w-full max-w-xl bg-surface-base border border-border-subtle rounded-[32px] shadow-2xl overflow-hidden flex flex-col relative z-10 max-h-[90vh]"
      in:scale={{ duration: 200, start: 0.95 }}
    >
      <!-- Cabecera -->
      <div
        class="p-6 md:p-8 border-b border-border-subtle flex justify-between items-center bg-surface-soft/60"
      >
        <div class="flex items-center gap-3.5">
          <div
            class="h-12 w-12 rounded-2xl bg-indigo-500/15 text-indigo-500 flex items-center justify-center border border-indigo-500/25 shadow-sm shrink-0"
          >
            <RefreshCw size={22} class={isSyncing ? "animate-spin" : ""} />
          </div>
          <div>
            <h2 class="text-xl font-black tracking-tight text-text-base">
              Sincronizar WispHub con Profit Plus
            </h2>
            <p class="text-text-muted text-xs mt-0.5">
              Importa clientes (`saCliente`) y vincula planes (`saArticulo`).
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={isSyncing}
          onclick={closeSyncModal}
          class="h-9 w-9 rounded-xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base flex items-center justify-center transition-colors border border-border-subtle cursor-pointer disabled:opacity-50"
        >
          <X size={16} />
        </button>
      </div>

      <!-- Contenido / Opciones -->
      <div class="p-6 md:p-8 space-y-6 overflow-y-auto">
        <!-- Selector de Sucursal Destino -->
        <div class="space-y-1.5">
          <label
            class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 flex items-center gap-1.5"
          >
            <Database size={13} />
            Sucursal Destino en Profit Plus
          </label>
          {#if data.branches && data.branches.length > 0}
            <select
              bind:value={syncTargetBranch}
              disabled={isSyncing}
              class="w-full bg-surface-soft border border-border-subtle px-4 py-3 rounded-2xl text-xs font-bold text-text-base focus:border-brand-500 outline-none transition-all cursor-pointer"
            >
              {#each data.branches as b}
                <option value={b.id}>{b.name} ({b.id})</option>
              {/each}
            </select>
          {:else}
            <div
              class="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-bold"
            >
              No se detectaron sucursales con Agente Sync2K asignadas a tu usuario.
            </div>
          {/if}
        </div>

        <!-- Entidades a Sincronizar -->
        <div class="space-y-3">
          <span
            class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
          >
            Entidades a Sincronizar
          </span>

          <label
            class="flex items-start gap-3.5 p-4 rounded-2xl bg-surface-soft border border-border-subtle cursor-pointer hover:bg-surface-strong/60 transition-all"
          >
            <input
              type="checkbox"
              bind:checked={syncCustomers}
              disabled={isSyncing}
              class="w-4 h-4 mt-0.5 rounded text-indigo-500 focus:ring-indigo-500 shrink-0"
            />
            <div>
              <div class="flex items-center gap-2">
                <Users size={14} class="text-indigo-500" />
                <span class="font-bold text-text-base text-xs">Catálogo de Clientes (`saCliente`)</span>
              </div>
              <span class="text-text-muted font-medium text-[11px] block mt-0.5">
                Crea o actualiza clientes en Profit Plus con su RIF/Cédula, nombre, teléfono y dirección.
              </span>
            </div>
          </label>

          <label
            class="flex items-start gap-3.5 p-4 rounded-2xl bg-surface-soft border border-border-subtle cursor-pointer hover:bg-surface-strong/60 transition-all"
          >
            <input
              type="checkbox"
              bind:checked={syncPlans}
              disabled={isSyncing}
              class="w-4 h-4 mt-0.5 rounded text-indigo-500 focus:ring-indigo-500 shrink-0"
            />
            <div>
              <div class="flex items-center gap-2">
                <Layers size={14} class="text-indigo-500" />
                <span class="font-bold text-text-base text-xs">Planes y Servicios (`saArticulo`)</span>
              </div>
              <span class="text-text-muted font-medium text-[11px] block mt-0.5">
                Verifica y mapea los planes de internet de WispHub contra los códigos de servicio en Profit Plus.
              </span>
            </div>
          </label>

          <label
            class="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-surface-soft/60 border border-border-subtle/60 cursor-pointer"
          >
            <input
              type="checkbox"
              bind:checked={overwriteExisting}
              disabled={isSyncing}
              class="w-3.5 h-3.5 rounded text-indigo-500 focus:ring-indigo-500"
            />
            <span class="text-xs font-semibold text-text-muted">
              Actualizar datos fiscales si el cliente ya existe en Profit Plus
            </span>
          </label>
        </div>

        <!-- Resultados de la Sincronización en Vivo -->
        {#if syncSummary}
          <div
            class="p-5 rounded-2xl bg-surface-soft border border-border-subtle space-y-3"
            in:slide={{ duration: 180 }}
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={15} />
                Resumen de Sincronización
              </span>
              <span class="text-[10px] font-mono font-bold text-text-muted">
                {syncSummary.branch?.name || ''}
              </span>
            </div>

            {#if syncSummary.customers}
              <div class="grid grid-cols-4 gap-2 text-center pt-1 font-mono">
                <div class="p-2 rounded-xl bg-surface-base border border-border-subtle">
                  <span class="text-[10px] text-text-muted uppercase block">Total</span>
                  <span class="text-sm font-black text-text-base">{syncSummary.customers.total}</span>
                </div>
                <div class="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <span class="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase block">Creados</span>
                  <span class="text-sm font-black text-emerald-600 dark:text-emerald-400">{syncSummary.customers.created}</span>
                </div>
                <div class="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                  <span class="text-[10px] text-cyan-600 dark:text-cyan-400 uppercase block">Actualizados</span>
                  <span class="text-sm font-black text-cyan-600 dark:text-cyan-400">{syncSummary.customers.updated}</span>
                </div>
                <div class="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                  <span class="text-[10px] text-red-600 dark:text-red-400 uppercase block">Fallidos</span>
                  <span class="text-sm font-black text-red-600 dark:text-red-400">{syncSummary.customers.failed}</span>
                </div>
              </div>
            {/if}

            {#if syncSummary.plans}
              <div class="p-3 rounded-xl bg-surface-base border border-border-subtle flex items-center justify-between text-xs">
                <span class="text-text-muted font-medium">Planes de Internet verificados:</span>
                <span class="font-mono font-black text-text-base">
                  {syncSummary.plans.mappings?.length || 0} ({syncSummary.plans.unlinkedCount || 0} pendientes de asociar)
                </span>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Footer del Asistente -->
      <div
        class="p-6 md:p-8 border-t border-border-subtle flex items-center justify-between gap-4 bg-surface-soft/60"
      >
        <button
          type="button"
          disabled={isSyncing}
          onclick={closeSyncModal}
          class="px-5 h-12 rounded-2xl text-xs font-bold text-text-muted hover:text-text-base hover:bg-surface-soft transition-all cursor-pointer disabled:opacity-50"
        >
          {syncSummary ? "Cerrar" : "Cancelar"}
        </button>

        <button
          type="button"
          disabled={isSyncing || (!syncCustomers && !syncPlans)}
          onclick={executeWisphubSync}
          class="px-6 h-12 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-2xl font-bold text-xs transition-all active:scale-95 shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {#if isSyncing}
            <Loader2 size={16} class="animate-spin" />
            <span>Sincronizando con Profit Plus...</span>
          {:else}
            <RefreshCw size={15} />
            <span>Iniciar Sincronización Ahora</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
