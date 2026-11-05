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
    ArrowRight,
    ChevronDown,
    ChevronUp,
    Settings2,
    FileSpreadsheet,
    FileCode2,
    Download
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

  // Opciones de mapeo Profit Plus para WispHub
  let showAdvancedMappings = $state(false);
  let defaultCtaIngrEgr = $state("I-001");
  let defaultClientType = $state("01");
  let defaultZone = $state("01");
  let defaultSeller = $state("01");
  let defaultSegment = $state("01");
  let defaultPaymentCond = $state("01");
  let coCliSource = $state<string>("cedula_or_id");
  let campo1Source = $state<string>("id_servicio");
  let campo2Source = $state<string>("usuario");
  let campo3Source = $state<string>("ip");
  let saveDefaults = $state(true);
  let showFailuresList = $state(false);

  // Modal de Extracción / Exportación (Excel & SQL) / Replicación HKA -> Profit Plus
  let isHkaModalOpen = $state(false);
  let hkaTargetBranch = $state(data.branches?.[0]?.id || "");
  let hkaSerie = $state("");
  let hkaTipoDoc = $state("ALL");
  let hkaDocInicio = $state("");
  let hkaDocFin = $state("");
  let hkaFechaInicio = $state("");
  let hkaFechaFin = $state("");
  let hkaPadDocNum = $state(true);
  let hkaMonedaProfit = $state<"BS" | "USD">("BS");
  let hkaMonedaPrecioArt = $state<"USD" | "BS">("USD");
  let hkaSaldoMode = $state<"pendiente" | "cero">("pendiente");
  let hkaSkipZero = $state(true);
  let hkaIncludeAnnulled = $state(true);
  let isExtractingHka = $state(false);
  let isExportingHka = $state<"excel" | "sql" | null>(null);
  let isReplicatingHka = $state(false);
  let hkaPlanResult = $state<any>(null);
  let hkaSelectedDocs = $state<Record<string, boolean>>({});
  let hkaConfirmReplicate = $state(false);
  let isCheckingMissingPrices = $state(false);
  let isApplyingMissingPrices = $state(false);
  let hkaMissingPricesResult = $state<any>(null);

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

  function applyAldanetPreset(target: "sync" | "config" = "sync") {
    if (target === "sync") {
      defaultZone = "004";
      defaultClientType = "DET";
      defaultCtaIngrEgr = "I-001";
      defaultSeller = "01";
      defaultSegment = "01";
      defaultPaymentCond = "01";
      toast.info("Preset aplicado: Aldanet (Zona 004, Tipo DET, Cta I-001)");
    } else if (editingItem?.options) {
      editingItem.options.default_zone = "004";
      editingItem.options.default_client_type = "DET";
      editingItem.options.default_cta_ingr_egr = "I-001";
      editingItem.options.default_seller = "01";
      editingItem.options.default_segment = "01";
      toast.info("Preset aplicado: Aldanet (Zona 004, Tipo DET, Cta I-001)");
    }
  }

  function applyGalpePreset(target: "sync" | "config" = "sync") {
    if (target === "sync") {
      defaultZone = "01";
      defaultClientType = "01";
      defaultCtaIngrEgr = "01";
      defaultSeller = "01";
      defaultSegment = "01";
      defaultPaymentCond = "01";
      toast.info("Preset aplicado: Galpe (Zona 01, Tipo 01, Cta 01)");
    } else if (editingItem?.options) {
      editingItem.options.default_zone = "01";
      editingItem.options.default_client_type = "01";
      editingItem.options.default_cta_ingr_egr = "01";
      editingItem.options.default_seller = "01";
      editingItem.options.default_segment = "01";
      toast.info("Preset aplicado: Galpe (Zona 01, Tipo 01, Cta 01)");
    }
  }

  function updateBranchDefaults(branchId: string) {
    const branch = data.branches?.find((b: any) => b.id === branchId);
    if (!branch) return;

    const wisp = integrations.find((i) => i.id === "wisphub");
    const branchPreset = wisp?.options?.branch_presets?.[branchId];

    if (branchPreset) {
      if (branchPreset.default_cta_ingr_egr) defaultCtaIngrEgr = branchPreset.default_cta_ingr_egr;
      if (branchPreset.default_client_type) defaultClientType = branchPreset.default_client_type;
      if (branchPreset.default_zone) defaultZone = branchPreset.default_zone;
      if (branchPreset.default_seller) defaultSeller = branchPreset.default_seller;
      if (branchPreset.default_segment) defaultSegment = branchPreset.default_segment;
      if (branchPreset.field_mappings?.co_cli_source) coCliSource = branchPreset.field_mappings.co_cli_source;
      if (branchPreset.field_mappings?.campo1_source) campo1Source = branchPreset.field_mappings.campo1_source;
      if (branchPreset.field_mappings?.campo2_source) campo2Source = branchPreset.field_mappings.campo2_source;
      if (branchPreset.field_mappings?.campo3_source) campo3Source = branchPreset.field_mappings.campo3_source;
    } else {
      defaultZone = branch.default_zone || "01";
      defaultClientType = branch.default_client_type || "01";
      defaultCtaIngrEgr = branch.default_cta_ingr_egr || "I-001";
      defaultSeller = branch.default_seller || "01";
      defaultSegment = branch.default_segment || "01";
      defaultPaymentCond = "01";
    }
  }

  function openConfigModal(item: any) {
    editingItem = JSON.parse(JSON.stringify(item));
    if (editingItem.id === "wisphub") {
      if (!editingItem.options) editingItem.options = {};
      if (!editingItem.options.default_cta_ingr_egr) editingItem.options.default_cta_ingr_egr = "I-001";
      if (!editingItem.options.default_client_type) editingItem.options.default_client_type = "DET";
      if (!editingItem.options.default_zone) editingItem.options.default_zone = "004";
      if (!editingItem.options.default_seller) editingItem.options.default_seller = "01";
      if (!editingItem.options.default_segment) editingItem.options.default_segment = "01";
      if (!editingItem.options.default_cond) editingItem.options.default_cond = "01";
      if (!editingItem.options.field_mappings) {
        editingItem.options.field_mappings = {
          co_cli_source: "cedula_or_id",
          campo1_source: "id_servicio",
          campo2_source: "usuario",
          campo3_source: "ip"
        };
      }
    }
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
    showFailuresList = false;
    if (data.branches && data.branches.length > 0 && !syncTargetBranch) {
      syncTargetBranch = data.branches[0].id;
    }
    updateBranchDefaults(syncTargetBranch);
  }

  function closeSyncModal() {
    if (isSyncing) return;
    isSyncModalOpen = false;
    syncSummary = null;
    showFailuresList = false;
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
    showFailuresList = false;

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
              overwrite_existing: overwriteExisting,
              default_cta_ingr_egr: defaultCtaIngrEgr,
              default_client_type: defaultClientType,
              default_zone: defaultZone,
              default_seller: defaultSeller,
              default_segment: defaultSegment,
              default_cond: defaultPaymentCond,
              save_defaults: saveDefaults,
              field_mappings: {
                co_cli_source: coCliSource,
                campo1_source: campo1Source,
                campo2_source: campo2Source,
                campo3_source: campo3Source
              }
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

      if (syncSummary.customers?.failed > 0) {
        toast.warning(
          `Sincronización completada con observaciones: ${syncSummary.customers.failed} registros fallaron.`
        );
      } else {
        toast.success("Sincronización con Profit Plus finalizada exitosamente.");
      }
    } catch (err: any) {
      toast.error(`Error de sincronización: ${err.message}`);
    } finally {
      isSyncing = false;
    }
  }

  function openHkaModal() {
    isHkaModalOpen = true;
    hkaPlanResult = null;
    hkaMissingPricesResult = null;
    hkaConfirmReplicate = false;
    if (data.branches && data.branches.length > 0 && !hkaTargetBranch) {
      hkaTargetBranch = data.branches[0].id;
    }
  }

  function closeHkaModal() {
    if (isExtractingHka || isReplicatingHka || isCheckingMissingPrices || isApplyingMissingPrices) return;
    isHkaModalOpen = false;
    hkaConfirmReplicate = false;
  }

  function getSelectedHkaDocsArray(): string[] | undefined {
    if (!hkaPlanResult?.plan?.invoices) return undefined;
    const keys = Object.keys(hkaSelectedDocs).filter((k) => hkaSelectedDocs[k]);
    return keys.length > 0 ? keys : undefined;
  }

  function buildHkaPayload(extra: Record<string, any> = {}) {
    return {
      branch_id: hkaTargetBranch,
      serie: hkaSerie.trim(),
      tipo_documento: hkaTipoDoc,
      doc_inicio: hkaDocInicio.trim() || undefined,
      doc_fin: hkaDocFin.trim() || undefined,
      fecha_inicio: hkaFechaInicio || undefined,
      fecha_fin: hkaFechaFin || undefined,
      pad_doc_num: hkaPadDocNum,
      moneda_profit: hkaMonedaProfit,
      moneda_precio_articulo: hkaMonedaPrecioArt,
      saldo_mode: hkaSaldoMode,
      skip_zero_amount: hkaSkipZero,
      include_annulled: hkaIncludeAnnulled,
      ...extra
    };
  }

  async function previewMissingPricesInProfit() {
    isCheckingMissingPrices = true;
    try {
      const res = await fetch("/api/integrations/hka/replicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "backfill_prices",
          branch_id: hkaTargetBranch,
          moneda_precio_articulo: hkaMonedaPrecioArt,
          dry_run: true
        })
      });
      const jsonRes = await res.json();
      if (!res.ok || !jsonRes.success) {
        throw new Error(jsonRes.message || "Error al consultar artículos sin precio en Profit Plus");
      }
      hkaMissingPricesResult = jsonRes;
      if (jsonRes.count > 0) {
        toast.info(jsonRes.message);
      } else {
        toast.success(jsonRes.message);
      }
    } catch (err: any) {
      toast.error(`Error al verificar precios en Profit: ${err.message}`);
    } finally {
      isCheckingMissingPrices = false;
    }
  }

  async function downloadMissingPricesSql() {
    try {
      const res = await fetch("/api/integrations/hka/replicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "backfill_prices",
          format: "sql",
          branch_id: hkaTargetBranch,
          moneda_precio_articulo: hkaMonedaPrecioArt,
          dry_run: true
        })
      });
      if (!res.ok) {
        throw new Error("No se pudo generar el script SQL de precios.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const fnMatch = disposition.match(/filename="([^"]+)"/);
      const fileName = fnMatch?.[1] || "Precios_Faltantes_saArtPrecio.sql";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Script ${fileName} descargado.`);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function applyMissingPricesInProfit() {
    isApplyingMissingPrices = true;
    try {
      const res = await fetch("/api/integrations/hka/replicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "backfill_prices",
          branch_id: hkaTargetBranch,
          moneda_precio_articulo: hkaMonedaPrecioArt,
          dry_run: false,
          confirm: true
        })
      });
      const jsonRes = await res.json();
      if (!res.ok || !jsonRes.success) {
        throw new Error(jsonRes.message || "Error al insertar precios en saArtPrecio");
      }
      toast.success(jsonRes.message || "Precios registrados exitosamente en saArtPrecio.");
      await previewMissingPricesInProfit();
    } catch (err: any) {
      toast.error(`Error al registrar precios: ${err.message}`);
    } finally {
      isApplyingMissingPrices = false;
    }
  }

  async function previewHkaExtraction() {
    isExtractingHka = true;
    hkaConfirmReplicate = false;
    try {
      toast.info("Consultando facturas emitidas en The Factory HKA y auditando contra Profit Plus...");
      const res = await fetch("/api/integrations/hka/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildHkaPayload({ format: "json" }))
      });
      const jsonRes = await res.json();
      if (!res.ok || !jsonRes.success) {
        throw new Error(jsonRes.message || "No se pudo extraer la información de HKA");
      }
      hkaPlanResult = jsonRes;
      const sel: Record<string, boolean> = {};
      for (const inv of jsonRes.plan?.invoices || []) {
        sel[inv.hka_numero_documento] = inv.action === "CREATE";
      }
      hkaSelectedDocs = sel;
      toast.success(
        `Extracción lista: ${jsonRes.plan.summary.totalHkaDocuments} documento(s) encontrados (${jsonRes.plan.summary.invoicesToCreate} nuevos para Profit).`
      );
    } catch (err: any) {
      toast.error(`Error al extraer desde HKA: ${err.message}`);
    } finally {
      isExtractingHka = false;
    }
  }

  async function exportHkaFile(format: "excel" | "sql") {
    isExportingHka = format;
    try {
      const selected = getSelectedHkaDocsArray();
      const res = await fetch("/api/integrations/hka/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildHkaPayload({
            format,
            ...(selected ? { selected_hka_docs: selected } : {})
          })
        )
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Error al generar archivo ${format.toUpperCase()}`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const fnMatch = disposition.match(/filename="([^"]+)"/);
      const defaultName =
        format === "excel" ? "Auditoria_HKA_Profit.xlsx" : "Replicacion_HKA_Profit.sql";
      const fileName = fnMatch?.[1] || defaultName;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success(`Archivo ${fileName} descargado exitosamente.`);
    } catch (err: any) {
      toast.error(`Error al exportar ${format.toUpperCase()}: ${err.message}`);
    } finally {
      isExportingHka = null;
    }
  }

  async function executeHkaReplication() {
    const selected = getSelectedHkaDocsArray();
    if (!selected || selected.length === 0) {
      toast.error("Seleccione al menos una factura pendiente para replicar en Profit Plus.");
      return;
    }

    isReplicatingHka = true;
    try {
      toast.info(`Replicando ${selected.length} factura(s) en Profit Plus...`);
      const res = await fetch("/api/integrations/hka/replicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildHkaPayload({
            selected_hka_docs: selected,
            dry_run: false,
            confirm: true
          })
        )
      });
      const jsonRes = await res.json();
      if (!res.ok || !jsonRes.success) {
        throw new Error(jsonRes.message || "Error al replicar en Profit Plus");
      }
      toast.success(jsonRes.message || "Facturas replicadas exitosamente en Profit Plus.");
      hkaConfirmReplicate = false;
      await previewHkaExtraction();
    } catch (err: any) {
      toast.error(`Error al replicar en Profit Plus: ${err.message}`);
    } finally {
      isReplicatingHka = false;
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
      {@const env = item.environment || (item.base_url?.includes('demo') || item.base_url?.includes('sandbox') ? 'demo' : 'production')}
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
            <span
              class="px-2.5 py-1 rounded-xl font-black uppercase tracking-wider border flex items-center gap-1.5 {env ===
              'production'
                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-900 dark:text-amber-300 border-amber-500/35 font-bold'}"
              title={env === 'production'
                ? 'Ambiente de PRODUCCIÓN: Emisión y sincronización en vivo real'
                : `Ambiente de PRUEBAS (${env.toUpperCase()}): Modo de certificación y ensayos sin afectación fiscal`}
            >
              {#if env === 'production'}
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                <span>PRODUCCIÓN</span>
              {:else}
                <FlaskConical size={11} class="text-amber-700 dark:text-amber-400 shrink-0" />
                <span>PRUEBAS ({env.toUpperCase()})</span>
              {/if}
            </span>

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

            <!-- Botón Extraer / Exportar / Replicar (Específico para The Factory HKA cuando está activo) -->
            {#if item.id === "the_factory_hka" && item.is_active}
              <button
                type="button"
                onclick={() => openHkaModal()}
                class="px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-800 dark:text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="Extraer facturas de HKA, exportar en Excel o SQL y replicar en Profit Plus"
              >
                <Database size={13} />
                <span>Extraer / Profit</span>
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

                <!-- Mapeo Predeterminado a Profit Plus (saCliente) -->
                <div class="pt-2 border-t border-border-subtle/60 space-y-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                      <Settings2 size={15} class="text-indigo-500" />
                      <span class="text-xs font-black uppercase tracking-wider text-text-base">
                        Mapeo Predeterminado a Profit Plus (`saCliente`)
                      </span>
                    </div>

                    <!-- Presets Rápidos Empresa -->
                    <div class="flex items-center gap-1.5">
                      <button
                        type="button"
                        onclick={() => applyAldanetPreset("config")}
                        class="px-2.5 py-1 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-black transition-all cursor-pointer flex items-center gap-1"
                        title="Aplicar valores de Aldanet (Zona 004, Tipo DET, Cuenta I-001)"
                      >
                        <Sparkles size={11} />
                        <span>Preset Aldanet</span>
                      </button>
                      <button
                        type="button"
                        onclick={() => applyGalpePreset("config")}
                        class="px-2.5 py-1 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-text-muted hover:text-text-base text-[10px] font-bold transition-all cursor-pointer"
                        title="Aplicar valores de Galpe (Zona 01, Tipo 01, Cuenta 01)"
                      >
                        <span>Preset Galpe</span>
                      </button>
                    </div>
                  </div>

                  <!-- Cuenta Ingreso/Egreso FK -->
                  <div class="space-y-1.5 p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
                    <div class="flex items-center justify-between">
                      <label class="text-xs font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                        Cuenta Ingreso / Egreso (`co_cta_ingr_egr`)
                      </label>
                      <span class="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        FK ALDANET: I-001
                      </span>
                    </div>
                    <input
                      type="text"
                      bind:value={editingItem.options.default_cta_ingr_egr}
                      placeholder="I-001"
                      class="w-full bg-surface-soft border border-border-subtle px-4 py-2.5 rounded-xl text-xs font-mono font-bold text-text-base focus:border-brand-500 outline-none transition-all"
                    />
                    <span class="text-[10px] text-text-muted leading-tight block">
                      Obligatorio por clave foránea FK_saCliente_saCuentaIngEgr en tabla saCuentaIngEgr.
                    </span>
                  </div>

                  <!-- Origen del Código de Cliente -->
                  <div class="space-y-1.5">
                    <label class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 block">
                      Estrategia de Código de Cliente (`co_cli`)
                    </label>
                    <select
                      bind:value={editingItem.options.field_mappings.co_cli_source}
                      class="w-full bg-surface-soft border border-border-subtle px-4 py-2.5 rounded-xl text-xs font-bold text-text-base focus:border-brand-500 outline-none transition-all cursor-pointer"
                    >
                      <option value="cedula_or_id">Cédula/RIF si existe (ej. V12345678), o ID WispHub (WISP-775)</option>
                      <option value="cedula_or_user">Cédula/RIF si existe, o Nombre de Usuario WispHub</option>
                      <option value="id_servicio">Siempre ID de Servicio WispHub (WISP-775)</option>
                      <option value="usuario">Nombre de Usuario WispHub</option>
                    </select>
                  </div>

                  <!-- Grid de Defaults (Zona, Vendedor, Segmento, Tipo Cliente) -->
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div class="space-y-1">
                      <label class="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                        Tipo Cliente
                      </label>
                      <input
                        type="text"
                        bind:value={editingItem.options.default_client_type}
                        placeholder="01"
                        class="w-full bg-surface-soft border border-border-subtle px-3 py-2 rounded-xl text-xs font-mono font-bold text-text-base text-center"
                      />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                        Zona
                      </label>
                      <input
                        type="text"
                        bind:value={editingItem.options.default_zone}
                        placeholder="01"
                        class="w-full bg-surface-soft border border-border-subtle px-3 py-2 rounded-xl text-xs font-mono font-bold text-text-base text-center"
                      />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                        Vendedor
                      </label>
                      <input
                        type="text"
                        bind:value={editingItem.options.default_seller}
                        placeholder="01"
                        class="w-full bg-surface-soft border border-border-subtle px-3 py-2 rounded-xl text-xs font-mono font-bold text-text-base text-center"
                      />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                        Segmento
                      </label>
                      <input
                        type="text"
                        bind:value={editingItem.options.default_segment}
                        placeholder="01"
                        class="w-full bg-surface-soft border border-border-subtle px-3 py-2 rounded-xl text-xs font-mono font-bold text-text-base text-center"
                      />
                    </div>
                  </div>

                  <!-- Campos Libres -->
                  <div class="space-y-2 pt-1 border-t border-border-subtle/50">
                    <span class="text-[11px] font-black uppercase tracking-wider text-text-muted block">
                      Mapeo a Campos Libres (`campo1`, `campo2`, `campo3`)
                    </span>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <span class="text-[10px] text-text-muted font-bold block mb-1">Campo 1</span>
                        <select
                          bind:value={editingItem.options.field_mappings.campo1_source}
                          class="w-full bg-surface-soft border border-border-subtle px-2.5 py-1.5 rounded-xl text-xs font-bold text-text-base"
                        >
                          <option value="id_servicio">ID Servicio</option>
                          <option value="usuario">Usuario</option>
                          <option value="ip">IP</option>
                          <option value="plan">Plan</option>
                          <option value="none">Vacío</option>
                        </select>
                      </div>
                      <div>
                        <span class="text-[10px] text-text-muted font-bold block mb-1">Campo 2</span>
                        <select
                          bind:value={editingItem.options.field_mappings.campo2_source}
                          class="w-full bg-surface-soft border border-border-subtle px-2.5 py-1.5 rounded-xl text-xs font-bold text-text-base"
                        >
                          <option value="usuario">Usuario</option>
                          <option value="id_servicio">ID Servicio</option>
                          <option value="ip">IP</option>
                          <option value="plan">Plan</option>
                          <option value="none">Vacío</option>
                        </select>
                      </div>
                      <div>
                        <span class="text-[10px] text-text-muted font-bold block mb-1">Campo 3</span>
                        <select
                          bind:value={editingItem.options.field_mappings.campo3_source}
                          class="w-full bg-surface-soft border border-border-subtle px-2.5 py-1.5 rounded-xl text-xs font-bold text-text-base"
                        >
                          <option value="ip">IP</option>
                          <option value="id_servicio">ID Servicio</option>
                          <option value="usuario">Usuario</option>
                          <option value="plan">Plan</option>
                          <option value="none">Vacío</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

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
              onchange={() => updateBranchDefaults(syncTargetBranch)}
              disabled={isSyncing}
              class="w-full bg-surface-soft border border-border-subtle px-4 py-3 rounded-2xl text-xs font-bold text-text-base focus:border-brand-500 outline-none transition-all cursor-pointer"
            >
              {#each data.branches as b}
                <option value={b.id}>{b.name} ({b.id})</option>
              {/each}
            </select>

            {#if syncTargetBranch}
              {@const selectedB = data.branches?.find((b: any) => b.id === syncTargetBranch)}
              <div class="flex items-center justify-between pt-1">
                <span class="text-[11px] text-text-muted">
                  Valores configurados en Sucursal:
                  <strong class="text-text-base font-bold">
                    {selectedB?.name}
                  </strong>
                </span>
                <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                  Zona: {selectedB?.default_zone || '01'} · Tipo: {selectedB?.default_client_type || '01'} · Cta: {selectedB?.default_cta_ingr_egr || 'I-001'}
                </span>
              </div>
            {/if}
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

        <!-- Ajustes de Mapeo y Defaults Profit Plus (saCliente) -->
        {#if syncCustomers}
          <div class="border border-border-subtle rounded-2xl overflow-hidden bg-surface-soft/40">
            <button
              type="button"
              onclick={() => (showAdvancedMappings = !showAdvancedMappings)}
              class="w-full p-4 flex items-center justify-between text-left hover:bg-surface-soft transition-colors cursor-pointer"
            >
              <div class="flex items-center gap-2.5">
                <Settings2 size={16} class="text-indigo-500 shrink-0" />
                <div>
                  <span class="text-xs font-bold text-text-base block">
                    Mapeo de Campos Profit Plus (`saCliente`)
                  </span>
                  <span class="text-[11px] text-text-muted block">
                    Cuenta Ingreso/Egreso ({defaultCtaIngrEgr}), Zona, Vendedor y Campos Libres
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-1.5 text-xs text-text-muted font-bold">
                <span>{showAdvancedMappings ? "Ocultar" : "Personalizar"}</span>
                {#if showAdvancedMappings}
                  <ChevronUp size={14} />
                {:else}
                  <ChevronDown size={14} />
                {/if}
              </div>
            </button>

            {#if showAdvancedMappings}
              <div class="p-4 pt-2 border-t border-border-subtle space-y-4" in:slide={{ duration: 150 }}>
                <!-- Presets Rápidos por Empresa -->
                <div class="p-3 rounded-2xl bg-surface-soft border border-border-subtle flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5">
                    <Sparkles size={14} class="text-indigo-500" />
                    <span class="text-xs font-bold text-text-base">Plantillas por Empresa:</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      onclick={() => applyAldanetPreset("sync")}
                      class="px-3 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-black transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Sparkles size={12} />
                      <span>Aldanet (004 / DET / I-001)</span>
                    </button>
                    <button
                      type="button"
                      onclick={() => applyGalpePreset("sync")}
                      class="px-3 py-1.5 rounded-xl bg-surface-base hover:bg-surface-strong border border-border-subtle text-text-muted hover:text-text-base text-[11px] font-bold transition-all cursor-pointer"
                    >
                      <span>Galpe (01 / 01 / 01)</span>
                    </button>
                  </div>
                </div>

                <!-- Cuenta de Ingresos / Egresos (FK ALDANET) -->
                <div class="space-y-1.5 p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
                  <div class="flex items-center justify-between">
                    <label class="text-[11px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                      Cuenta Ingreso / Egreso (`co_cta_ingr_egr`)
                    </label>
                    <span class="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      FK ALDANET: I-001
                    </span>
                  </div>
                  <input
                    type="text"
                    bind:value={defaultCtaIngrEgr}
                    placeholder="I-001"
                    class="w-full bg-surface-base border border-border-subtle px-3 py-2 rounded-xl text-xs font-mono font-bold text-text-base focus:border-indigo-500 outline-none transition-all"
                  />
                  <p class="text-[10px] text-text-muted leading-tight">
                    Código de cuenta contable requerido por la clave foránea <code class="font-mono text-indigo-600 dark:text-indigo-400">FK_saCliente_saCuentaIngEgr</code>. En Aldanet debe ser <strong>I-001</strong>.
                  </p>
                </div>

                <!-- Origen de Código de Cliente (co_cli) -->
                <div class="space-y-1.5">
                  <label class="text-[11px] font-black uppercase tracking-wider text-text-muted block">
                    Origen del Código de Cliente (`co_cli`)
                  </label>
                  <select
                    bind:value={coCliSource}
                    class="w-full bg-surface-base border border-border-subtle px-3 py-2 rounded-xl text-xs font-bold text-text-base focus:border-indigo-500 outline-none transition-all cursor-pointer"
                  >
                    <option value="cedula_or_id">Cédula/RIF si existe (ej. V12345678), o ID WispHub (WISP-775)</option>
                    <option value="cedula_or_user">Cédula/RIF si existe, o Nombre de Usuario WispHub</option>
                    <option value="id_servicio">Siempre ID de Servicio WispHub (WISP-775)</option>
                    <option value="usuario">Nombre de Usuario WispHub</option>
                  </select>
                </div>

                <!-- Grid de Valores Por Defecto -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div class="space-y-1">
                    <label class="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                      Tipo Cliente
                    </label>
                    <input
                      type="text"
                      bind:value={defaultClientType}
                      placeholder="01"
                      class="w-full bg-surface-base border border-border-subtle px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold text-text-base text-center"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                      Zona
                    </label>
                    <input
                      type="text"
                      bind:value={defaultZone}
                      placeholder="01"
                      class="w-full bg-surface-base border border-border-subtle px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold text-text-base text-center"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                      Vendedor
                    </label>
                    <input
                      type="text"
                      bind:value={defaultSeller}
                      placeholder="01"
                      class="w-full bg-surface-base border border-border-subtle px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold text-text-base text-center"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                      Segmento
                    </label>
                    <input
                      type="text"
                      bind:value={defaultSegment}
                      placeholder="01"
                      class="w-full bg-surface-base border border-border-subtle px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold text-text-base text-center"
                    />
                  </div>
                </div>

                <!-- Mapeo de Campos Libres (campo1, campo2, campo3) -->
                <div class="space-y-2 pt-1 border-t border-border-subtle/50">
                  <span class="text-[11px] font-black uppercase tracking-wider text-text-muted block">
                    Campos Libres en saCliente (Profit Plus)
                  </span>
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <span class="text-[10px] text-text-muted font-bold block mb-1">Campo 1 (Libre)</span>
                      <select
                        bind:value={campo1Source}
                        class="w-full bg-surface-base border border-border-subtle px-2.5 py-1.5 rounded-xl text-xs font-bold text-text-base"
                      >
                        <option value="id_servicio">ID Servicio (WispHub)</option>
                        <option value="usuario">Usuario WispHub</option>
                        <option value="ip">Dirección IP</option>
                        <option value="plan">Plan de Internet</option>
                        <option value="none">No mapear (Vacío)</option>
                      </select>
                    </div>
                    <div>
                      <span class="text-[10px] text-text-muted font-bold block mb-1">Campo 2 (Libre)</span>
                      <select
                        bind:value={campo2Source}
                        class="w-full bg-surface-base border border-border-subtle px-2.5 py-1.5 rounded-xl text-xs font-bold text-text-base"
                      >
                        <option value="usuario">Usuario WispHub</option>
                        <option value="id_servicio">ID Servicio</option>
                        <option value="ip">Dirección IP</option>
                        <option value="plan">Plan de Internet</option>
                        <option value="none">No mapear (Vacío)</option>
                      </select>
                    </div>
                    <div>
                      <span class="text-[10px] text-text-muted font-bold block mb-1">Campo 3 (Libre)</span>
                      <select
                        bind:value={campo3Source}
                        class="w-full bg-surface-base border border-border-subtle px-2.5 py-1.5 rounded-xl text-xs font-bold text-text-base"
                      >
                        <option value="ip">Dirección IP</option>
                        <option value="id_servicio">ID Servicio</option>
                        <option value="usuario">Usuario WispHub</option>
                        <option value="plan">Plan de Internet</option>
                        <option value="none">No mapear (Vacío)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <!-- Guardar mapeos por defecto -->
                <label class="flex items-center gap-2 pt-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    bind:checked={saveDefaults}
                    class="w-3.5 h-3.5 rounded text-indigo-500 focus:ring-indigo-500"
                  />
                  <span class="text-text-muted font-semibold">
                    Guardar estos mapeos como predeterminados en WispHub
                  </span>
                </label>
              </div>
            {/if}
          </div>
        {/if}

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

              {#if syncSummary.customers.failed > 0 && Array.isArray(syncSummary.customers.results)}
                <div class="pt-2 border-t border-border-subtle">
                  <button
                    type="button"
                    onclick={() => (showFailuresList = !showFailuresList)}
                    class="text-[11px] font-bold text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Ver detalle de los {syncSummary.customers.failed} registros fallidos</span>
                    {#if showFailuresList}
                      <ChevronUp size={12} />
                    {:else}
                      <ChevronDown size={12} />
                    {/if}
                  </button>
                  {#if showFailuresList}
                    <div class="mt-2 max-h-48 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]" in:slide={{ duration: 150 }}>
                      {#each syncSummary.customers.results.filter((r: any) => !r.success) as fail}
                        <div class="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-text-base">
                          <div class="flex items-center justify-between font-bold">
                            <span>{fail.nombre || 'Sin nombre'} ({fail.co_cli})</span>
                            <span class="text-red-600 dark:text-red-400">ID #{fail.id_servicio}</span>
                          </div>
                          <p class="text-[10px] text-red-700 dark:text-red-300 mt-1 break-all">
                            {fail.error}
                          </p>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
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

<!-- ============================================================== -->
<!-- MODAL DE AUDITORÍA, EXPORTACIÓN (EXCEL/SQL) Y REPLICACIÓN HKA  -->
<!-- ============================================================== -->
{#if isHkaModalOpen}
  <div
    class="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    in:fade={{ duration: 180 }}
  >
    <div
      class="fixed inset-0"
      onclick={closeHkaModal}
      role="presentation"
    ></div>

    <div
      class="relative z-10 w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-3xl bg-surface-base border border-border-subtle shadow-2xl flex flex-col"
      in:scale={{ duration: 200, start: 0.96 }}
    >
      <!-- Cabecera -->
      <div class="p-5 md:p-6 border-b border-border-subtle flex items-center justify-between bg-surface-raised">
        <div class="flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-500">
            <Receipt size={22} />
          </div>
          <div>
            <h3 class="text-base md:text-lg font-black text-text-base">
              Extracción y Replicación Fiscal: The Factory HKA → Profit Plus
            </h3>
            <p class="text-xs text-text-muted font-medium">
              Extrae las facturas ya emitidas en HKA, audita clientes/artículos/tasas y exporta en Excel o SQL antes de recrear en Profit Plus.
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={closeHkaModal}
          class="p-2 rounded-xl text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      <!-- Contenido Scrollable -->
      <div class="p-5 md:p-6 overflow-y-auto space-y-5 flex-1">
        <!-- Filtros y Parámetros -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3 bg-surface-raised p-4 rounded-2xl border border-border-subtle">
          <div>
            <label class="block text-[11px] font-bold text-text-muted uppercase mb-1">
              Sucursal Profit Destino
            </label>
            <select
              bind:value={hkaTargetBranch}
              class="w-full bg-surface-base border border-border-subtle rounded-xl px-3 py-2 text-xs font-semibold text-text-base outline-none focus:border-brand-500"
            >
              {#each data.branches || [] as b}
                <option value={b.id}>{b.name}</option>
              {/each}
            </select>
          </div>

          <div>
            <label class="block text-[11px] font-bold text-text-muted uppercase mb-1">
              Tipo Documento / Serie
            </label>
            <div class="flex gap-1.5">
              <select
                bind:value={hkaTipoDoc}
                class="flex-1 bg-surface-base border border-border-subtle rounded-xl px-2.5 py-2 text-xs font-semibold text-text-base outline-none focus:border-brand-500"
              >
                <option value="ALL">Todos (01/02/03)</option>
                <option value="01">01 - Factura</option>
                <option value="03">03 - Nota Crédito</option>
                <option value="02">02 - Nota Débito</option>
              </select>
              <input
                type="text"
                bind:value={hkaSerie}
                placeholder="Serie (*)"
                title="Dejar vacío para traer todas las series"
                class="w-20 bg-surface-base border border-border-subtle rounded-xl px-2.5 py-2 text-xs font-mono text-text-base outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div>
            <label class="block text-[11px] font-bold text-text-muted uppercase mb-1">
              Rango N° Documento (Opc.)
            </label>
            <div class="flex items-center gap-1.5">
              <input
                type="number"
                bind:value={hkaDocInicio}
                placeholder="Desde"
                class="w-1/2 bg-surface-base border border-border-subtle rounded-xl px-2.5 py-2 text-xs font-mono text-text-base outline-none focus:border-brand-500"
              />
              <input
                type="number"
                bind:value={hkaDocFin}
                placeholder="Hasta"
                class="w-1/2 bg-surface-base border border-border-subtle rounded-xl px-2.5 py-2 text-xs font-mono text-text-base outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div>
            <label class="block text-[11px] font-bold text-text-muted uppercase mb-1">
              Rango Fechas Emisión (Opc.)
            </label>
            <div class="flex items-center gap-1.5">
              <input
                type="date"
                bind:value={hkaFechaInicio}
                class="w-1/2 bg-surface-base border border-border-subtle rounded-xl px-2 py-2 text-[11px] text-text-base outline-none focus:border-brand-500"
              />
              <input
                type="date"
                bind:value={hkaFechaFin}
                class="w-1/2 bg-surface-base border border-border-subtle rounded-xl px-2 py-2 text-[11px] text-text-base outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <!-- Fila 2: Opciones Profit Plus -->
          <div>
            <label class="block text-[11px] font-bold text-text-muted uppercase mb-1">
              Moneda Cabecera Profit
            </label>
            <select
              bind:value={hkaMonedaProfit}
              class="w-full bg-surface-base border border-border-subtle rounded-xl px-3 py-2 text-xs font-semibold text-text-base outline-none focus:border-brand-500"
            >
              <option value="BS">BS (Tasa 1.00 - Nativo HKA VES)</option>
              <option value="USD">USD (Tasa BCV histórica saTasa)</option>
            </select>
          </div>

          <div>
            <label class="block text-[11px] font-bold text-text-muted uppercase mb-1">
              Moneda Precio 01 (saArtPrecio)
            </label>
            <select
              bind:value={hkaMonedaPrecioArt}
              class="w-full bg-surface-base border border-border-subtle rounded-xl px-3 py-2 text-xs font-semibold text-text-base outline-none focus:border-brand-500"
            >
              <option value="USD">USD (Otra Moneda prec_om=1 / BCV)</option>
              <option value="BS">BS (Moneda Base prec_om=0)</option>
            </select>
          </div>

          <div>
            <label class="block text-[11px] font-bold text-text-muted uppercase mb-1">
              Saldo CxC Inicial
            </label>
            <select
              bind:value={hkaSaldoMode}
              class="w-full bg-surface-base border border-border-subtle rounded-xl px-3 py-2 text-xs font-semibold text-text-base outline-none focus:border-brand-500"
            >
              <option value="pendiente">Pendiente (= Total Neto, cruzar cobro)</option>
              <option value="cero">Saldo 0.00 (Sin saldo pendiente)</option>
            </select>
          </div>

          <div class="flex flex-col justify-center gap-1.5 pt-2">
            <label class="flex items-center gap-2 text-[11px] font-semibold text-text-base cursor-pointer">
              <input type="checkbox" bind:checked={hkaPadDocNum} class="rounded accent-cyan-500" />
              <span>Correlativo 10 dígitos (<code class="font-mono">0000000512</code>)</span>
            </label>
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-1.5 text-[11px] font-semibold text-text-base cursor-pointer">
                <input type="checkbox" bind:checked={hkaSkipZero} class="rounded accent-cyan-500" />
                <span>Omitir 0.00</span>
              </label>
              <label class="flex items-center gap-1.5 text-[11px] font-semibold text-text-base cursor-pointer">
                <input type="checkbox" bind:checked={hkaIncludeAnnulled} class="rounded accent-cyan-500" />
                <span>Incluir anuladas</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Barra de Acciones de Consulta y Exportación -->
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isExtractingHka || isCheckingMissingPrices}
              onclick={previewHkaExtraction}
              class="px-4 py-2.5 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-cyan-500/20 cursor-pointer disabled:opacity-50"
            >
              {#if isExtractingHka}
                <Loader2 size={15} class="animate-spin" />
                <span>Extrayendo de HKA y Auditando BD...</span>
              {:else}
                <Search size={15} />
                <span>1. Consultar y Previsualizar Facturas HKA</span>
              {/if}
            </button>

            <button
              type="button"
              disabled={isCheckingMissingPrices || isExtractingHka}
              onclick={previewMissingPricesInProfit}
              title="Detecta al instante artículos ya creados en Profit Plus que no tengan Precio 01 en saArtPrecio, tomando su última factura activa sin redescargar desde HKA"
              class="px-4 py-2.5 rounded-2xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-800 dark:text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {#if isCheckingMissingPrices}
                <Loader2 size={14} class="animate-spin" />
                <span>Verificando saArtPrecio...</span>
              {:else}
                <Sparkles size={15} />
                <span>Completar Precios Faltantes en Profit (saArtPrecio)</span>
              {/if}
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isExportingHka !== null || isExtractingHka}
              onclick={() => exportHkaFile("excel")}
              class="px-4 py-2.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {#if isExportingHka === "excel"}
                <Loader2 size={14} class="animate-spin" />
                <span>Generando Excel...</span>
              {:else}
                <FileSpreadsheet size={15} />
                <span>Exportar Excel (.xlsx)</span>
              {/if}
            </button>

            <button
              type="button"
              disabled={isExportingHka !== null || isExtractingHka}
              onclick={() => exportHkaFile("sql")}
              class="px-4 py-2.5 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-300 border border-amber-500/35 text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {#if isExportingHka === "sql"}
                <Loader2 size={14} class="animate-spin" />
                <span>Generando SQL...</span>
              {:else}
                <FileCode2 size={15} />
                <span>Exportar Script SQL (.sql)</span>
              {/if}
            </button>
          </div>
        </div>

        <!-- Panel Rápido: Artículos en Profit Plus sin Precio en saArtPrecio -->
        {#if hkaMissingPricesResult}
          <div class="rounded-2xl border border-purple-500/30 bg-purple-500/5 overflow-hidden space-y-3 p-4" in:slide={{ duration: 160 }}>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <Sparkles size={16} class="text-purple-500" />
                <span class="text-xs font-black text-text-base">
                  Auditoría Directa de Precios en {hkaMissingPricesResult.databaseName} (dbo.saArtPrecio — Precio 01 en {hkaMissingPricesResult.monedaPrecio})
                </span>
              </div>
              <button
                type="button"
                onclick={() => (hkaMissingPricesResult = null)}
                class="text-[11px] font-bold text-text-muted hover:text-text-base cursor-pointer"
              >
                Ocultar
              </button>
            </div>

            <p class="text-xs text-text-muted">
              {hkaMissingPricesResult.message}
            </p>

            {#if hkaMissingPricesResult.count > 0}
              <div class="max-h-56 overflow-auto rounded-xl border border-border-subtle bg-surface-base">
                <table class="w-full text-left text-xs">
                  <thead class="bg-surface-soft/80 text-[10px] uppercase text-text-muted sticky top-0">
                    <tr>
                      <th class="p-2">Co_Art</th>
                      <th class="p-2">Descripción</th>
                      <th class="p-2">Últ. Factura</th>
                      <th class="p-2 text-right">Tasa BCV</th>
                      <th class="p-2 text-right">Base Bs</th>
                      <th class="p-2 text-right">Base USD</th>
                      <th class="p-2 text-right">Ref c/IVA USD</th>
                      <th class="p-2 text-right">Precio 01 ({hkaMissingPricesResult.monedaPrecio})</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border-subtle font-mono text-[11px]">
                    {#each hkaMissingPricesResult.articles as art}
                      <tr class="hover:bg-surface-soft/50">
                        <td class="p-2 font-bold text-text-base">{art.co_art}</td>
                        <td class="p-2 font-sans text-text-base truncate max-w-[220px]" title={art.art_des}>{art.art_des}</td>
                        <td class="p-2 text-text-muted">{art.latest_doc_num} ({art.latest_fec_emis})</td>
                        <td class="p-2 text-right text-text-muted">{Number(art.tasa_bcv_fecha).toFixed(2)}</td>
                        <td class="p-2 text-right text-text-muted">
                          {Number(art.latest_price_bs).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td class="p-2 text-right text-cyan-700 dark:text-cyan-300 font-semibold">
                          ${Number(art.latest_price_usd).toFixed(4)}
                        </td>
                        <td class="p-2 text-right text-emerald-700 dark:text-emerald-300 font-bold">
                          ${Number(art.ref_con_iva_usd).toFixed(2)}
                        </td>
                        <td class="p-2 text-right font-black text-purple-700 dark:text-purple-300">
                          {Number(art.monto_asignar).toFixed(4)} {art.co_mone_precio}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>

              <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onclick={downloadMissingPricesSql}
                  class="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-300 border border-amber-500/35 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={14} />
                  <span>Descargar SQL Precios (.sql)</span>
                </button>
                <button
                  type="button"
                  disabled={isApplyingMissingPrices}
                  onclick={applyMissingPricesInProfit}
                  class="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {#if isApplyingMissingPrices}
                    <Loader2 size={14} class="animate-spin" />
                    <span>Registrando en saArtPrecio...</span>
                  {:else}
                    <CheckCircle2 size={14} />
                    <span>Registrar Precio 01 en saArtPrecio ({hkaMissingPricesResult.count} artículos)</span>
                  {/if}
                </button>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Resultados de Previsualización -->
        {#if hkaPlanResult?.plan}
          {@const p = hkaPlanResult.plan}
          <div class="space-y-4" in:fade={{ duration: 150 }}>
            <!-- Métricas Resumen -->
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 font-mono">
              <div class="p-3 rounded-2xl bg-surface-raised border border-border-subtle">
                <span class="text-[10px] text-text-muted uppercase block">Extraídas HKA</span>
                <span class="text-base font-black text-text-base">{p.summary.totalHkaDocuments}</span>
              </div>
              <div class="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/25">
                <span class="text-[10px] text-cyan-700 dark:text-cyan-300 uppercase block">Por Crear Profit</span>
                <span class="text-base font-black text-cyan-700 dark:text-cyan-300">{p.summary.invoicesToCreate}</span>
              </div>
              <div class="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
                <span class="text-[10px] text-emerald-700 dark:text-emerald-300 uppercase block">Ya en Profit</span>
                <span class="text-base font-black text-emerald-700 dark:text-emerald-300">{p.summary.invoicesAlreadyInProfit}</span>
              </div>
              <div class="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/25">
                <span class="text-[10px] text-indigo-700 dark:text-indigo-300 uppercase block">Clientes Nuevos</span>
                <span class="text-base font-black text-indigo-700 dark:text-indigo-300">{p.summary.clientsToCreate} / {p.summary.totalClientsReferenced}</span>
              </div>
              <div class="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/25">
                <span class="text-[10px] text-purple-700 dark:text-purple-300 uppercase block">Artículos / Precios</span>
                <span class="text-base font-black text-purple-700 dark:text-purple-300">{p.summary.articlesToCreate} / {p.summary.totalArticlesReferenced}</span>
                {#if p.summary.articlesMissingPrice > 0}
                  <span class="text-[9px] text-purple-600 dark:text-purple-400 block">+{p.summary.articlesMissingPrice} Precio 01</span>
                {/if}
              </div>
              <div class="p-3 rounded-2xl bg-surface-raised border border-border-subtle">
                <span class="text-[10px] text-text-muted uppercase block">Total Neto (Bs)</span>
                <span class="text-sm font-black text-text-base">
                  {Number(p.summary.totalNetoBsToReplicate || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <!-- Tabla de Facturas Auditadas -->
            <div class="rounded-2xl border border-border-subtle overflow-hidden bg-surface-raised">
              <div class="px-4 py-2.5 bg-surface-soft border-b border-border-subtle flex items-center justify-between text-xs">
                <span class="font-bold text-text-base">
                  Detalle de Documentos Extraídos ({p.databaseName} • Entorno HKA: {p.hkaEnvironment.toUpperCase()})
                </span>
                <span class="text-[11px] text-text-muted font-mono">
                  Control: {p.summary.minControlNumber || "-"} → {p.summary.maxControlNumber || "-"}
                </span>
              </div>
              <div class="max-h-72 overflow-auto">
                <table class="w-full text-left text-xs">
                  <thead class="bg-surface-soft/70 text-[10px] uppercase text-text-muted sticky top-0">
                    <tr>
                      <th class="p-2.5 w-8 text-center">Sel</th>
                      <th class="p-2.5">Doc Profit</th>
                      <th class="p-2.5">N° Control</th>
                      <th class="p-2.5">Emisión</th>
                      <th class="p-2.5">Cliente (co_cli)</th>
                      <th class="p-2.5">Ítems / Comentario Factura</th>
                      <th class="p-2.5 text-right">Total Bs</th>
                      <th class="p-2.5 text-right">Tasa BCV</th>
                      <th class="p-2.5">Estado</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border-subtle font-mono text-[11px]">
                    {#each p.invoices as inv}
                      <tr class="hover:bg-surface-soft/50">
                        <td class="p-2.5 text-center">
                          <input
                            type="checkbox"
                            disabled={inv.action !== "CREATE"}
                            bind:checked={hkaSelectedDocs[inv.hka_numero_documento]}
                            class="rounded accent-cyan-500"
                          />
                        </td>
                        <td class="p-2.5 font-bold text-text-base">
                          {inv.doc_num_profit}
                          {#if inv.anulado}
                            <span class="ml-1 px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400 text-[9px]">ANULADA</span>
                          {/if}
                        </td>
                        <td class="p-2.5 text-text-muted">{inv.n_control}</td>
                        <td class="p-2.5 text-text-muted">{inv.fec_emis_iso}</td>
                        <td class="p-2.5 font-sans">
                          <div class="font-bold text-text-base truncate max-w-[200px]" title={inv.cli_des}>{inv.cli_des}</div>
                          <div class="text-[10px] text-text-muted font-mono">{inv.co_cli} ({inv.rif})</div>
                        </td>
                        <td class="p-2.5 font-sans">
                          <div class="font-mono font-bold text-text-base" title={inv.renglones.map((r: any) => `${r.co_art}: ${r.des_art}`).join(" | ")}>
                            {inv.renglones.map((r: any) => r.co_art).join(", ")}
                          </div>
                          {#if inv.comentario_factura}
                            <div class="text-[10px] text-cyan-700 dark:text-cyan-300 font-semibold truncate max-w-[230px]" title={inv.comentario_factura}>
                              {inv.comentario_factura}
                            </div>
                          {/if}
                        </td>
                        <td class="p-2.5 text-right font-bold text-text-base">
                          {Number(inv.total_neto_bs).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td class="p-2.5 text-right text-text-muted">
                          {Number(inv.tasa_bcv_referencia).toFixed(2)}
                        </td>
                        <td class="p-2.5 font-sans">
                          {#if inv.action === "CREATE"}
                            <span class="px-2 py-0.5 rounded-lg bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 font-bold text-[10px]">
                              LISTA PARA CREAR
                            </span>
                          {:else if inv.action === "SKIP_EXISTING"}
                            <span class="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
                              YA EN PROFIT
                            </span>
                          {:else}
                            <span class="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-900 dark:text-amber-300 font-bold text-[10px]" title={inv.warnings?.join(" • ")}>
                              OMITIDA ({inv.action.replace("SKIP_", "")})
                            </span>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>

            {#if p.warnings && p.warnings.length > 0}
              <div class="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1">
                <div class="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertCircle size={14} />
                  <span>Observaciones de validación detectadas ({p.warnings.length}):</span>
                </div>
                <ul class="list-disc list-inside text-[11px] text-amber-900/90 dark:text-amber-200/90 space-y-0.5 max-h-24 overflow-y-auto">
                  {#each p.warnings as w}
                    <li><strong>Doc {w.doc_num} ({w.n_control}):</strong> {w.message}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="p-5 border-t border-border-subtle bg-surface-soft/60 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onclick={closeHkaModal}
          class="px-5 py-2.5 rounded-2xl text-xs font-bold text-text-muted hover:text-text-base hover:bg-surface-soft cursor-pointer"
        >
          Cerrar
        </button>

        {#if hkaPlanResult?.plan?.summary?.invoicesToCreate > 0}
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300 cursor-pointer">
              <input type="checkbox" bind:checked={hkaConfirmReplicate} class="rounded accent-emerald-500" />
              <span>Ya revisé el Excel/SQL y confirmo escribir en Profit Plus ({hkaPlanResult.plan.databaseName})</span>
            </label>
            <button
              type="button"
              disabled={!hkaConfirmReplicate || isReplicatingHka}
              onclick={executeHkaReplication}
              class="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-40"
            >
              {#if isReplicatingHka}
                <Loader2 size={15} class="animate-spin" />
                <span>Replicando en Profit Plus...</span>
              {:else}
                <Database size={15} />
                <span>Ejecutar Replicación en Profit</span>
              {/if}
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
