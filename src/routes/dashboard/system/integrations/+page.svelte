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

  function toggleShowSecret(key: string) {
    showPassword[key] = !showPassword[key];
  }

  function handleEnvironmentChange(env: string) {
    if (!editingItem) return;
    editingItem.environment = env;
    if (editingItem.id === "the_factory_hka") {
      editingItem.base_url =
        env === "production"
          ? "https://emisionv2.thefactoryhka.com.ve"
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
  <title>Integraciones | Sync2K</title>
</svelte:head>

<div class="space-y-8" in:fade>
  <!-- Encabezado Principal -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <h1
        class="text-3xl sm:text-4xl font-black tracking-tight flex items-center gap-3 text-text-base"
      >
        <Blocks size={36} class="text-brand-500" />
        Integraciones
      </h1>
      <p class="text-text-muted mt-1 text-sm sm:text-base">
        Administra las conexiones externas: Facturación TFHKA, WispHub,
        pasarelas de pago y servicios bancarios.
      </p>
    </div>

    <!-- Indicadores Rápidos -->
    <div class="flex items-center gap-2.5">
      <div
        class="px-3.5 py-1.5 rounded-2xl bg-surface-soft border border-border-subtle text-xs font-bold flex items-center gap-2"
      >
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span class="text-text-muted">Activas:</span>
        <span class="text-text-base font-black"
          >{activeCount} / {totalCount}</span
        >
      </div>
      <div
        class="px-3.5 py-1.5 rounded-2xl bg-surface-soft border border-border-subtle text-xs font-bold flex items-center gap-2"
      >
        <CheckCircle2 size={14} class="text-brand-400" />
        <span class="text-text-muted">Verificadas:</span>
        <span class="text-text-base font-black">{testedSuccessCount}</span>
      </div>
    </div>
  </div>

  <!-- Barra de Filtros y Búsqueda -->
  <div
    class="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4"
  >
    <!-- Pestañas de Categoría -->
    <div
      class="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none"
    >
      {#each categories as cat}
        {@const Icon = cat.icon}
        <button
          type="button"
          onclick={() => (selectedCategory = cat.id)}
          class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 cursor-pointer {selectedCategory ===
          cat.id
            ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/20 active:scale-95'
            : 'bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base border border-border-subtle'}"
        >
          <Icon size={14} />
          <span>{cat.label}</span>
        </button>
      {/each}
    </div>

    <!-- Barra de Búsqueda -->
    <div class="relative w-full lg:w-72">
      <Search
        size={16}
        class="text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
      />
      <input
        type="text"
        placeholder="Buscar servicio..."
        bind:value={searchQuery}
        class="w-full h-11 pl-10 pr-9 text-xs font-bold rounded-2xl bg-surface-soft border border-border-subtle text-text-base placeholder:text-text-muted/60 focus:border-brand-500 outline-none transition-all"
      />
      {#if searchQuery}
        <button
          type="button"
          onclick={() => (searchQuery = "")}
          class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-base"
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

          <!-- Badges de Configuración y Entorno -->
          <div class="mt-4 flex flex-wrap items-center gap-2 text-[10px]">
            <span
              class="px-2.5 py-1 rounded-xl font-black uppercase tracking-wider border {item.environment ===
              'production'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}"
            >
              {item.environment === "production"
                ? "PRODUCCIÓN"
                : item.environment}
            </span>

            <span
              class="px-2.5 py-1 rounded-xl font-black uppercase tracking-wider border {item.is_active
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-surface-soft text-text-muted border-border-subtle'}"
            >
              {item.is_active ? "Activo" : "Inactivo"}
            </span>

            {#if item.last_test_status === "success"}
              <span
                class="px-2.5 py-1 rounded-xl font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1"
              >
                <Check size={11} />
                <span>Test OK</span>
              </span>
            {:else if item.last_test_status === "failed"}
              <span
                class="px-2.5 py-1 rounded-xl font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1"
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

        <!-- Acciones Inferiores -->
        <div
          class="mt-5 pt-4 flex items-center justify-between gap-2 border-t border-border-subtle/60"
        >
          <!-- Botón Test Rápido -->
          <form
            method="POST"
            action="?/test"
            use:enhance={() => {
              testingId = item.id;
              return async ({ result, update }) => {
                testingId = null;
                if (result.type === "success" && result.data?.testResult) {
                  const res = result.data.testResult;
                  if (res.success) {
                    toast.success(res.message, {
                      description: `Latencia: ${res.latencyMs} ms`,
                    });
                  } else {
                    toast.error(res.message, {
                      description: `Código: ${res.statusCode}`,
                    });
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
                <Zap size={13} class="text-amber-400" />
                <span>Probar</span>
              {/if}
            </button>
          </form>

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
    <!-- Backdrop click to close -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0"
      onclick={() => {
        if (!savingId && !testingId) closeModal();
      }}
    ></div>

    <!-- Modal Box con opacidad sólida y estilo Sync2K -->
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
          class="p-2.5 text-text-muted hover:text-text-base rounded-full hover:bg-surface-strong transition-colors cursor-pointer shrink-0 disabled:opacity-50"
        >
          <X size={20} />
        </button>
      </div>

      <!-- Formulario con scroll independiente -->
      <form
        id="integrationConfigForm"
        method="POST"
        action="?/save"
        use:enhance={() => {
          savingId = editingItem.id;
          return async ({ result, update }) => {
            savingId = null;
            if (result.type === "success") {
              toast.success(
                result.data?.message || "Configuración guardada correctamente.",
              );
              closeModal();
              await update();
            } else {
              toast.error(
                result.data?.error || "Error al guardar configuración.",
              );
            }
          };
        }}
        class="flex flex-col flex-1 overflow-hidden"
      >
        <div
          class="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar"
        >
          <input type="hidden" name="id" value={editingItem.id} />
          <input
            type="hidden"
            name="is_active"
            value={editingItem.is_active ? "true" : "false"}
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

          <!-- Sección 1: Estado y Entorno -->
          <div class="space-y-4">
            <span
              class="text-xs font-black uppercase tracking-wider text-brand-400 flex items-center gap-2 border-b border-border-subtle/50 pb-2"
            >
              <Sliders size={14} />
              1. Estado y Modo de Conexión
            </span>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Selector de Entorno -->
              <div class="space-y-1.5">
                <label
                  class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
                >
                  Entorno de Ejecución
                </label>
                <select
                  value={editingItem.environment}
                  onchange={(e) =>
                    handleEnvironmentChange(e.currentTarget.value)}
                  class="w-full bg-surface-soft border border-border-subtle px-4 py-3 rounded-2xl text-xs font-bold text-text-base focus:border-brand-500 outline-none transition-all cursor-pointer"
                >
                  <option value="sandbox">Sandbox (Ambiente de Pruebas)</option>
                  <option value="demo">Demo (Certificación)</option>
                  <option value="production">Producción (Operación Real)</option
                  >
                </select>
              </div>

              <!-- Switch Activo -->
              <div class="space-y-1.5">
                <label
                  class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block"
                >
                  Estado en el ERP
                </label>
                <div
                  class="flex items-center justify-between h-[46px] px-4 rounded-2xl bg-surface-soft border border-border-subtle"
                >
                  <span class="text-xs text-text-base font-bold">
                    {editingItem.is_active
                      ? "Activo (Disponible)"
                      : "Inactivo (Pausado)"}
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
                      class="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-base transition-colors"
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
                      class="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-base transition-colors"
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
                    class="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-base transition-colors"
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
              class="p-4 rounded-2xl border text-xs {liveTestResult.success
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'}"
              transition:slide={{ duration: 150 }}
            >
              <div
                class="flex items-center gap-2 font-black uppercase tracking-wider text-[11px]"
              >
                {#if liveTestResult.success}
                  <CheckCircle2 size={16} class="text-emerald-400" />
                  <span>Prueba Exitosa ({liveTestResult.latencyMs} ms)</span>
                {:else}
                  <XCircle size={16} class="text-red-400" />
                  <span
                    >Prueba Fallida (Código {liveTestResult.statusCode})</span
                  >
                {/if}
              </div>
              <p class="mt-1.5 text-xs font-medium leading-relaxed">
                {liveTestResult.message}
              </p>
            </div>
          {/if}
        </div>

        <!-- Pie de Acciones del Modal con fondo suave -->
        <div
          class="p-6 md:p-8 border-t border-border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface-soft/60"
        >
          <!-- Botón Test en vivo dentro del Modal -->
          <button
            type="button"
            disabled={testingId === editingItem.id ||
              savingId === editingItem.id}
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
                const responseData = await res.json();

                if (responseData?.data) {
                  const parsed = JSON.parse(responseData.data);
                  liveTestResult = parsed[parsed.length - 1]?.testResult;
                } else if (responseData?.testResult) {
                  liveTestResult = responseData.testResult;
                }

                if (liveTestResult?.success) {
                  toast.success("Conexión verificada exitosamente.");
                } else {
                  toast.error("La prueba de conexión ha fallado.");
                }
              } catch (err: any) {
                toast.error("Fallo al ejecutar test: " + err.message);
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
              <Zap size={15} class="text-amber-400" />
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
