<!-- src/routes/dashboard/purchases/invoices/+page.svelte -->
<script lang="ts">
  import { fade, slide, scale } from "svelte/transition";
  import {
    Receipt,
    Search,
    ShoppingBag,
    FileText,
    Trash2,
    Store,
    ChevronDown,
    Check,
    Loader2,
    Clock,
    Truck,
    Building2,
    Calendar,
    RefreshCw,
    X
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import dayjs from "dayjs";
  import ImportItemCard from "$lib/components/ui/ImportItemCard.svelte";
  import PriceChangeConfirmModal from "$lib/components/ui/PriceChangeConfirmModal.svelte";

  let { data } = $props();

  // Active State
  let filterSede = $state(data.selectedBranchId || "");
  let showUSD = $state(true);
  let activeTasa = $state(data.activeRate || 1);
  let taxRateOption = $state(16); // 16 o 0 (Cargar 16% o Exento 0%)

  // Price change detection modal state
  let showPriceModal = $state(false);
  let detectedPriceChanges = $state<any[]>([]);
  let isCheckingPrices = $state(false);

  // Sucursal Resolution (idéntico a /dashboard/billing)
  const selectedBranchConfig = $derived(
    (data.branches || []).find((b: any) => b.id === filterSede)
  );

  const profitBranchCodes = $derived.by(() => {
    if (!selectedBranchConfig?.profit_branch_codes) return [];
    let codes = selectedBranchConfig.profit_branch_codes;
    if (typeof codes === "string") {
      try {
        codes = JSON.parse(codes);
      } catch (e) {
        return [];
      }
    }
    return Array.isArray(codes) ? codes : [];
  });

  const defaultBranchCode = $derived.by(() => {
    const found = profitBranchCodes.find(
      (c: any) =>
        c.is_default === true ||
        String(c.is_default) === "true" ||
        c.default === true
    );
    return found ? found.code : "";
  });

  const nonDefaultBranchCode = $derived.by(() => {
    const found = profitBranchCodes.find(
      (c: any) =>
        c.is_default === false ||
        String(c.is_default) === "false" ||
        !c.is_default
    );
    return found ? found.code : "";
  });

  const activeBranchCode = $derived.by(() => {
    const hasIVA = invoiceTotals.totalTaxUSD > 0;
    return hasIVA ? (defaultBranchCode || "01") : (nonDefaultBranchCode || defaultBranchCode || "02");
  });

  // Supplier & Invoice Metadata
  let selectedSupplier = $state<any>(null);
  let invoiceMetadata = $state({
    nro_fact: "",
    n_control: "",
    fec_emis: dayjs().format("YYYY-MM-DD"),
    fec_venc: dayjs().format("YYYY-MM-DD"),
    descrip: "",
    comentario: "",
    descuento_global: 0
  });

  // Invoice Lines
  interface InvoiceLine {
    co_art: string;
    art_des: string;
    modelo?: string;
    referencia?: string;
    co_uni: string;
    unidad?: string;
    co_alma: string;
    des_alma?: string;
    cantidad: number;
    pendiente_original: number;
    costo_usd: number;
    porc_imp: number;
    tipo_imp: string;
    doc_num_reception: string;
    reng_num_reception: number;
    rowguid_reception?: string;
    checked: boolean;
  }

  let invoiceLines = $state<InvoiceLine[]>([]);
  let importedReceptionsInfo = $state<Record<string, { descrip: string }>>({});
  let isSavingInvoice = $state(false);
  let saveSuccess = $state(false);
  let generatedDocNum = $state("");
  let savedNroFact = $state("");
  let savedSucu = $state("");

  // Import Modal State
  let showImportModal = $state(false);
  let importSearchQuery = $state("");
  let isSearchingReceptions = $state(false);
  let foundReceptions = $state<any[]>([]);

  // Derived reception origins
  const uniqueReceptionOrigins = $derived.by(() => {
    const origins = new Set<string>();
    for (const line of invoiceLines) {
      if (line.doc_num_reception) {
        origins.add(line.doc_num_reception.trim());
      }
    }
    return Array.from(origins);
  });

  // Calculations
  const invoiceTotals = $derived.by(() => {
    let subtotalUSD = 0;
    let totalTaxUSD = 0;

    for (const line of invoiceLines) {
      if (line.checked) {
        const qty = Number(line.cantidad || 0);
        const cost = Number(line.costo_usd || 0);
        const pImp = taxRateOption === 0 ? 0 : Number(line.porc_imp || 16);

        const lineNet = qty * cost;
        const lineTax = lineNet * (pImp / 100);

        subtotalUSD += lineNet;
        totalTaxUSD += lineTax;
      }
    }

    const descGlobUSD = Number(invoiceMetadata.descuento_global || 0);
    const subtotalAfterDescUSD = Math.max(0, subtotalUSD - descGlobUSD);
    const totalUSD = subtotalAfterDescUSD + totalTaxUSD;

    const rate = Number(activeTasa || 1);

    return {
      subtotalUSD,
      descGlobUSD,
      totalTaxUSD,
      totalUSD,
      subtotalBS: subtotalUSD * rate,
      descGlobBS: descGlobUSD * rate,
      totalTaxBS: totalTaxUSD * rate,
      totalBS: totalUSD * rate
    };
  });

  function handleBranchChange() {
    const params = new URLSearchParams($page.url.searchParams);
    if (filterSede) params.set("branch_id", filterSede);
    else params.delete("branch_id");
    goto(`?${params.toString()}`);
  }

  // --- SEARCH & IMPORT RECEPTIONS FLOW ---
  async function openImportModal() {
    if (!filterSede) {
      toast.error("Seleccione una sucursal primero");
      return;
    }
    showImportModal = true;
    importSearchQuery = "";
    await searchPendingReceptions();
  }

  async function searchPendingReceptions() {
    if (!filterSede) return;
    isSearchingReceptions = true;
    try {
      const coProvParam = selectedSupplier ? `&co_prov=${encodeURIComponent(selectedSupplier.co_prov)}` : "";
      const searchParam = importSearchQuery ? `&search=${encodeURIComponent(importSearchQuery)}` : "";
      const res = await fetch(`/api/agent/facturas-compras/recepciones-pendientes?branch_id=${filterSede}${coProvParam}${searchParam}`);
      const result = await res.json();

      if (result.success !== false) {
        foundReceptions = result.data || result || [];
        if (foundReceptions.length === 0 && importSearchQuery) {
          toast.info("No se encontraron recepciones pendientes con ese criterio.");
        }
      } else {
        toast.error(result.message || "Error al buscar recepciones.");
      }
    } catch (err: any) {
      toast.error("Error de red: " + err.message);
    } finally {
      isSearchingReceptions = false;
    }
  }

  function importReception(reception: any) {
    const receptionDocNum = (reception.doc_num || "").trim();
    const receptionCoProv = (reception.co_prov || "").trim();

    const receptionLines = reception.renglones || [];
    const pendingItems = receptionLines.filter((r: any) => Number(r.pendiente || r.cant_facturar || 0) > 0);

    if (pendingItems.length === 0) {
      toast.error(`La recepción ${receptionDocNum} no tiene artículos con cantidades pendientes.`);
      return;
    }

    const docTasa = Number(reception.tasa || 1);
    const tasaToUse = docTasa > 1 ? docTasa : Number(activeTasa || 1);
    if (tasaToUse > 1) {
      activeTasa = tasaToUse;
    }

    // Convert items into invoice lines
    const mappedLines: InvoiceLine[] = pendingItems.map((r: any) => {
      const pendingQty = Number(r.pendiente || r.cant_facturar || r.total_art);
      
      // Compute USD unit cost
      let unitCostUSD = 0;
      if (Number(r.cost_unit_om) > 0) {
        unitCostUSD = Number(r.cost_unit_om);
      } else if (Number(r.cost_unit) > 0) {
        unitCostUSD = tasaToUse > 1 ? Number(r.cost_unit) / tasaToUse : Number(r.cost_unit);
      }

      return {
        co_art: (r.co_art || "").trim(),
        art_des: (r.art_des || "").trim(),
        modelo: (r.modelo || "").trim(),
        referencia: (r.referencia || "").trim(),
        co_uni: (r.co_uni || "UND").trim(),
        unidad: (r.unidad || "").trim(),
        co_alma: (r.co_alma || "01").trim(),
        des_alma: (r.des_alma || "").trim(),
        cantidad: pendingQty,
        pendiente_original: pendingQty,
        costo_usd: unitCostUSD,
        porc_imp: Number(r.porc_imp || 0),
        tipo_imp: (r.tipo_imp || "1").trim(),
        doc_num_reception: receptionDocNum,
        reng_num_reception: Number(r.reng_num),
        rowguid_reception: r.rowguid,
        checked: true
      };
    });

    const newSupplier = {
      co_prov: reception.co_prov,
      prov_des: reception.prov_des,
      rif: reception.rif,
      direc1: reception.direc1,
      telefonos: reception.telefonos,
      co_cond: reception.co_cond,
      cond_des: reception.cond_des,
      contribu_e: reception.contribu_e,
      porc_esp: Number(reception.porc_esp) || 0
    };

    const receptionDesc = (reception.descrip || "").trim() || (reception.nro_fact ? `Fact: ${reception.nro_fact.trim()}` : "Sin descripción");

    // Si hay un proveedor cargado y es DIFERENTE al actual: sustituir el proveedor y reemplazar los renglones
    if (selectedSupplier && selectedSupplier.co_prov.trim().toUpperCase() !== receptionCoProv.toUpperCase()) {
      selectedSupplier = newSupplier;
      invoiceLines = mappedLines;
      importedReceptionsInfo = {
        [receptionDocNum]: {
          descrip: receptionDesc
        }
      };

      // Cargar datos fiscales de la nueva recepción
      invoiceMetadata.nro_fact = reception.nro_fact ? reception.nro_fact.trim() : "";
      invoiceMetadata.n_control = reception.n_control ? reception.n_control.trim() : "";
      invoiceMetadata.descrip = reception.descrip ? reception.descrip.trim() : "";
      if (reception.fec_emis) {
        invoiceMetadata.fec_emis = dayjs(reception.fec_emis).format("YYYY-MM-DD");
      }
      if (reception.fec_venc) {
        invoiceMetadata.fec_venc = dayjs(reception.fec_venc).format("YYYY-MM-DD");
      }

      toast.warning(`Se sustituyó la recepción anterior por cambio de proveedor: ${reception.prov_des} (Recepción ${receptionDocNum}).`);
    } else {
      // Mismo proveedor o primera carga
      if (!selectedSupplier) {
        selectedSupplier = newSupplier;
        invoiceLines = mappedLines;
        importedReceptionsInfo = {
          [receptionDocNum]: {
            descrip: receptionDesc
          }
        };

        // Cargar datos fiscales de la recepción
        invoiceMetadata.nro_fact = reception.nro_fact ? reception.nro_fact.trim() : "";
        invoiceMetadata.n_control = reception.n_control ? reception.n_control.trim() : "";
        invoiceMetadata.descrip = reception.descrip ? reception.descrip.trim() : "";
        if (reception.fec_emis) {
          invoiceMetadata.fec_emis = dayjs(reception.fec_emis).format("YYYY-MM-DD");
        }
        if (reception.fec_venc) {
          invoiceMetadata.fec_venc = dayjs(reception.fec_venc).format("YYYY-MM-DD");
        }

        toast.success(`Recepción ${receptionDocNum} importada (${mappedLines.length} artículos).`);
      } else {
        // Mismo proveedor: verificar que la recepción no esté ya cargada
        if (uniqueReceptionOrigins.includes(receptionDocNum)) {
          toast.error(`La recepción ${receptionDocNum} ya se encuentra cargada.`);
          showImportModal = false;
          return;
        }

        invoiceLines = [...invoiceLines, ...mappedLines];
        importedReceptionsInfo = {
          ...importedReceptionsInfo,
          [receptionDocNum]: {
            descrip: receptionDesc
          }
        };

        // Si los datos fiscales estaban vacíos, completarlos con la nueva recepción
        if (!invoiceMetadata.nro_fact && reception.nro_fact) {
          invoiceMetadata.nro_fact = reception.nro_fact.trim();
        }
        if (!invoiceMetadata.n_control && reception.n_control) {
          invoiceMetadata.n_control = reception.n_control.trim();
        }
        if (!invoiceMetadata.descrip && reception.descrip) {
          invoiceMetadata.descrip = reception.descrip.trim();
        }

        toast.success(`Recepción ${receptionDocNum} agregada (${mappedLines.length} artículos).`);
      }
    }

    showImportModal = false;
  }

  function removeLine(index: number) {
    invoiceLines = invoiceLines.filter((_, idx) => idx !== index);
    if (invoiceLines.length === 0) {
      resetForm();
    }
  }

  function removeReceptionLines(originDocNum: string) {
    invoiceLines = invoiceLines.filter((l) => l.doc_num_reception !== originDocNum);
    const cleanDoc = originDocNum.trim();
    const newInfo = { ...importedReceptionsInfo };
    delete newInfo[cleanDoc];
    importedReceptionsInfo = newInfo;

    if (invoiceLines.length === 0) {
      resetForm();
      toast.info(`Recepción ${originDocNum} removida y formulario reiniciado.`);
    } else {
      toast.info(`Artículos de la recepción ${originDocNum} removidos.`);
    }
  }

  function resetForm() {
    selectedSupplier = null;
    invoiceLines = [];
    importedReceptionsInfo = {};
    invoiceMetadata = {
      nro_fact: "",
      n_control: "",
      fec_emis: dayjs().format("YYYY-MM-DD"),
      fec_venc: dayjs().format("YYYY-MM-DD"),
      descrip: "",
      comentario: "",
      descuento_global: 0
    };
    saveSuccess = false;
    generatedDocNum = "";
    savedNroFact = "";
    savedSucu = "";
  }

  // --- SAVE PURCHASE INVOICE ---
  async function handleSaveInvoice() {
    if (!filterSede) {
      toast.error("Seleccione una sucursal.");
      return;
    }

    if (!selectedSupplier || !selectedSupplier.co_prov) {
      toast.error("Debe cargar un proveedor (importe una recepción).");
      return;
    }

    const nroFactClean = (invoiceMetadata.nro_fact || "").trim();
    if (!nroFactClean) {
      toast.error("El N° de Factura Fiscal del Proveedor es obligatorio.");
      return;
    }

    const activeLines = invoiceLines.filter((l) => l.checked);
    if (activeLines.length === 0) {
      toast.error("Debe seleccionar al menos un artículo para facturar.");
      return;
    }

    // Validate quantities and costs
    for (const l of activeLines) {
      if (Number(l.cantidad) <= 0) {
        toast.error(`El artículo ${l.co_art} tiene una cantidad inválida.`);
        return;
      }
      if (Number(l.costo_usd) < 0) {
        toast.error(`El artículo ${l.co_art} tiene un costo negativo.`);
        return;
      }
    }

    // 1. Pre-verificar cambios de precio antes de asentar la factura
    isCheckingPrices = true;
    try {
      const checkRes = await fetch("/api/agent/articles/preview-price-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: filterSede,
          items: activeLines.map((l) => ({
            co_art: l.co_art,
            art_des: l.art_des,
            nuevo_costo_usd: Number(l.costo_usd)
          }))
        })
      });

      const checkData = await checkRes.json();
      if (checkData.success && checkData.hasChanges && checkData.changes?.length > 0) {
        detectedPriceChanges = checkData.changes;
        showPriceModal = true;
        isCheckingPrices = false;
        return;
      }
    } catch (checkErr) {
      console.warn("No se pudo verificar preview de precios, continuando:", checkErr);
    } finally {
      isCheckingPrices = false;
    }

    // Si no hubo cambios de precio, guardar directamente
    await executeSaveInvoice({ updatePrices: true, broadcast: true, changes: [] });
  }

  async function executeSaveInvoice({
    updatePrices = true,
    broadcast = true,
    changes = []
  }: {
    updatePrices?: boolean;
    broadcast?: boolean;
    changes?: any[];
  } = {}) {
    const activeLines = invoiceLines.filter((l) => l.checked);
    const nroFactClean = (invoiceMetadata.nro_fact || "").trim();

    isSavingInvoice = true;

    try {
      const payloadInvoice = {
        co_prov: selectedSupplier.co_prov.trim(),
        nro_fact: nroFactClean,
        n_control: (invoiceMetadata.n_control || "").trim() || "N/A",
        fec_emis: invoiceMetadata.fec_emis,
        fec_venc: invoiceMetadata.fec_venc,
        descrip: (invoiceMetadata.descrip || `Factura de compra N° ${nroFactClean}`).trim(),
        comentario: (invoiceMetadata.comentario || "").trim(),
        co_mone: "USD",
        tasa: Number(activeTasa || 1),
        co_cond: selectedSupplier.co_cond || "01",
        co_sucu: activeBranchCode,
        force_sucu: activeBranchCode,
        monto_desc_glob: Number(invoiceMetadata.descuento_global || 0),
        update_prices: updatePrices,
        broadcast_prices: broadcast,
        price_updates: updatePrices ? changes : [],
        renglones: activeLines.map((l) => ({
          co_art: l.co_art,
          art_des: l.art_des,
          cantidad: Number(l.cantidad),
          co_uni: l.co_uni,
          co_alma: l.co_alma,
          costo: Number(l.costo_usd), // En USD
          cost_unit_om: Number(l.costo_usd), // En USD explícito
          porc_imp: taxRateOption === 0 ? 0 : Number(l.porc_imp),
          tipo_imp: taxRateOption === 0 ? "6" : (l.tipo_imp === "5" ? "6" : (l.tipo_imp || "1")), // '6' = Compra Exenta en Profit Plus
          tipo_doc: "NREC",
          num_doc: l.doc_num_reception,
          reng_doc: l.reng_num_reception,
          rowguid_doc: l.rowguid_reception
        }))
      };

      const res = await fetch("/api/agent/facturas-compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: filterSede,
          invoice: payloadInvoice
        })
      });

      const result = await res.json();

      if (!result.success) {
        throw new Error(result.message || "Error al registrar la factura de compra.");
      }

      const docNumGenerated = result.doc_num || result.results?.[0]?.doc_num || "REGISTRADA";
      generatedDocNum = docNumGenerated;
      savedNroFact = nroFactClean;
      savedSucu = `${activeBranchCode} (${invoiceTotals.totalTaxUSD > 0 ? 'Fiscal / Defecto' : 'Exenta / Otra'})`;
      saveSuccess = true;

      toast.success(`Factura de Compra ${docNumGenerated} (Fiscal N°: ${nroFactClean}) registrada exitosamente.`);
    } catch (err: any) {
      console.error("[SAVE PURCHASE INVOICE ERROR]:", err);
      toast.error(err.message || "Error al guardar la factura de compra.");
    } finally {
      isSavingInvoice = false;
    }
  }
</script>

{#if saveSuccess}
  <!-- SUCCESS STATE CARD -->
  <div
    class="glass p-12 rounded-[40px] border border-green-500/20 max-w-xl mx-auto flex flex-col items-center justify-center text-center space-y-6 mt-12"
    in:fade
  >
    <div
      class="h-20 w-20 rounded-3xl bg-green-500/10 flex items-center justify-center text-green-400 shadow-lg shadow-green-500/10"
    >
      <Check size={48} />
    </div>
    <div class="space-y-2">
      <h2 class="text-3xl font-black text-text-base">¡Factura de Compra Registrada!</h2>
      <p class="text-text-muted text-sm">
        El documento ha sido asentado exitosamente en Profit Plus (Módulo de Compras y Cuentas por Pagar).
      </p>
    </div>

    <div class="grid grid-cols-2 gap-4 w-full">
      <div class="bg-surface-soft p-4 rounded-2xl border border-border-subtle text-left">
        <span class="text-[10px] text-text-muted/70 uppercase font-bold tracking-wider">N° Profit Plus</span>
        <div class="text-xl font-black text-brand-400 mt-0.5 font-mono">{generatedDocNum}</div>
      </div>
      <div class="bg-surface-soft p-4 rounded-2xl border border-border-subtle text-left">
        <span class="text-[10px] text-text-muted/70 uppercase font-bold tracking-wider">N° Factura Fiscal</span>
        <div class="text-xl font-black text-text-base mt-0.5 font-mono">{savedNroFact}</div>
      </div>
      {#if savedSucu}
        <div class="col-span-2 bg-surface-soft/60 px-4 py-2.5 rounded-xl border border-border-subtle text-left flex justify-between items-center text-xs">
          <span class="text-text-muted font-medium">Sucursal Asignada en Profit:</span>
          <span class="font-mono font-bold text-brand-400">{savedSucu}</span>
        </div>
      {/if}
    </div>

    <div class="flex gap-4 w-full">
      <a
        href="/dashboard/purchases/invoices/history?branch_id={filterSede}"
        class="flex-1 text-center bg-surface-soft hover:bg-surface-strong text-text-base px-6 py-3.5 rounded-2xl font-bold transition-all text-sm flex items-center justify-center border border-border-subtle"
      >
        Ver Historial
      </a>
      <button
        onclick={resetForm}
        class="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-brand-500/20 text-sm cursor-pointer"
      >
        Registrar Otra Factura
      </button>
    </div>
  </div>
{:else}
  <!-- MAIN PURCHASE INVOICE INTERFACE -->
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
    <!-- TOP HEADER -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
          <Receipt size={40} class="text-brand-500" />
          Factura de Compra
        </h1>
        <p class="text-text-muted mt-2 text-base">
          Importación de recepciones y facturación.
        </p>
      </div>

      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
        <!-- Branch Selector -->
        {#if data.branches && data.branches.length > 1}
          <div class="w-full sm:w-56 relative group">
            <Store
              size={16}
              class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-brand-500 transition-colors pointer-events-none"
            />
            <select
              bind:value={filterSede}
              onchange={handleBranchChange}
              class="w-full h-14 pl-10 pr-10 bg-surface-soft border border-border-subtle rounded-2xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-sm appearance-none cursor-pointer text-text-base"
            >
              {#each data.branches as b}
                <option value={b.id}>{b.name}</option>
              {/each}
            </select>
            <ChevronDown
              size={16}
              class="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
          </div>
        {/if}

        <!-- Import Reception Button -->
        <button
          onclick={openImportModal}
          class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto"
        >
          <Truck size={18} />
          Importar Recepción
        </button>

        <!-- History Button -->
        <button
          onclick={() => {
            const params = new URLSearchParams();
            if (filterSede) params.set("branch_id", filterSede);
            goto(`/dashboard/purchases/invoices/history?${params.toString()}`);
          }}
          class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-surface-strong hover:bg-surface-base text-text-base border border-border-subtle transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto"
        >
          <Clock size={18} class="text-brand-400" />
          Ver Historial
        </button>
      </div>
    </div>

    <!-- MAIN GRID: LEFT (SUPPLIER + FISCAL DATA + ITEMS) & RIGHT (FINANCIAL TOTALS) -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
      <!-- LEFT/CENTER COLUMN -->
      <div class="xl:col-span-2 space-y-6">
        <!-- SUPPLIER INFO CARD (Estilo idéntico a Datos del Cliente de /dashboard/billing) -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-4">
          <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
            <Building2 size={16} />
            Datos del Proveedor
          </h3>

          {#if !selectedSupplier}
            <div
              class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-2"
            >
              <Building2 size={32} class="text-text-muted/30" />
              <p class="text-xs text-text-muted font-bold">
                No hay ningún proveedor cargado. Haz clic en "Importar Recepción" para iniciar.
              </p>
            </div>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4" in:slide>
              <div class="md:col-span-2 space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Nombre / Razón Social</span>
                <p class="text-base font-black text-text-base">{selectedSupplier.prov_des}</p>
              </div>
              <div class="space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">RIF / CI</span>
                <p class="text-base font-bold font-mono text-text-base">{selectedSupplier.rif || selectedSupplier.co_prov || "---"}</p>
              </div>
              <div class="md:col-span-2 space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Dirección</span>
                <p class="text-xs text-text-muted font-bold leading-relaxed">{selectedSupplier.direc1 || "---"}</p>
              </div>
              <div class="space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Teléfono</span>
                <p class="text-xs text-text-muted font-bold font-mono">{selectedSupplier.telefonos || "---"}</p>
              </div>
              <div class="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border-subtle/30">
                <div class="space-y-1">
                  <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Estatus Fiscal</span>
                  <p class="text-xs font-bold text-brand-400">
                    {selectedSupplier.porc_esp > 0
                      ? `Contribuyente Especial (${selectedSupplier.porc_esp}%)`
                      : selectedSupplier.contribu_e
                        ? "Contribuyente Especial"
                        : "No Contribuyente"}
                  </p>
                </div>
                <div class="space-y-1">
                  <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Condición de Pago</span>
                  <p class="text-xs font-bold text-text-base">{selectedSupplier.cond_des || selectedSupplier.co_cond || "Contado"}</p>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- FISCAL INVOICE METADATA CARD (Mismos estilos de encabezado) -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-4">
          <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
            <FileText size={16} />
            Datos Fiscales de la Factura
          </h3>

          {#if !selectedSupplier}
            <div
              class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-2"
            >
              <FileText size={32} class="text-text-muted/30" />
              <p class="text-xs text-text-muted font-bold">
                No hay datos fiscales cargados. Haz clic en "Importar Recepción" para iniciar.
              </p>
            </div>
          {:else}
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4" in:slide>
              <!-- Nro Factura Fiscal (Obligatorio) -->
              <div class="space-y-1.5 sm:col-span-2 md:col-span-2">
                <label for="nro_fact" class="text-[10px] font-black uppercase tracking-wider text-text-muted flex items-center gap-1">
                  N° Factura del Proveedor <span class="text-red-400">*</span>
                </label>
                <input
                  id="nro_fact"
                  type="text"
                  bind:value={invoiceMetadata.nro_fact}
                  placeholder="Ej. 00012345"
                  class="w-full h-11 px-4 bg-surface-soft border border-border-subtle rounded-xl text-sm font-mono font-bold text-text-base focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none transition-all"
                />
              </div>

              <!-- Nro Control Fiscal -->
              <div class="space-y-1.5 sm:col-span-2 md:col-span-2">
                <label for="n_control" class="text-[10px] font-black uppercase tracking-wider text-text-muted flex items-center gap-1">
                  N° Control SENIAT
                </label>
                <input
                  id="n_control"
                  type="text"
                  bind:value={invoiceMetadata.n_control}
                  placeholder="Ej. 00-00123456"
                  class="w-full h-11 px-4 bg-surface-soft border border-border-subtle rounded-xl text-sm font-mono font-bold text-text-base focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none transition-all"
                />
              </div>

              <!-- Fecha Emisión -->
              <div class="space-y-1.5 sm:col-span-1 md:col-span-2">
                <label for="fec_emis" class="text-[10px] font-black uppercase tracking-wider text-text-muted flex items-center gap-1">
                  <Calendar size={12} class="text-text-muted" />
                  Fecha de Emisión
                </label>
                <input
                  id="fec_emis"
                  type="date"
                  bind:value={invoiceMetadata.fec_emis}
                  class="w-full h-11 px-4 bg-surface-soft border border-border-subtle rounded-xl text-sm font-medium text-text-base focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none transition-all"
                />
              </div>

              <!-- Fecha Vencimiento -->
              <div class="space-y-1.5 sm:col-span-1 md:col-span-2">
                <label for="fec_venc" class="text-[10px] font-black uppercase tracking-wider text-text-muted flex items-center gap-1">
                  <Calendar size={12} class="text-text-muted" />
                  Fecha de Vencimiento
                </label>
                <input
                  id="fec_venc"
                  type="date"
                  bind:value={invoiceMetadata.fec_venc}
                  class="w-full h-11 px-4 bg-surface-soft border border-border-subtle rounded-xl text-sm font-medium text-text-base focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none transition-all"
                />
              </div>

              <!-- Descripción (100% de ancho) -->
              <div class="space-y-1.5 col-span-full w-full">
                <label for="descrip" class="text-[10px] font-black uppercase tracking-wider text-text-muted">
                  Descripción / Concepto
                </label>
                <input
                  id="descrip"
                  type="text"
                  bind:value={invoiceMetadata.descrip}
                  placeholder="Ej. Factura de compra correspondiente a recepción de repuestos..."
                  class="w-full h-11 px-4 bg-surface-soft border border-border-subtle rounded-xl text-sm text-text-base focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none transition-all"
                />
              </div>
            </div>
          {/if}
        </div>

        <!-- INVOICE ITEMS TABLE (Mismos estilos de /dashboard/billing) -->
        <div class="glass border border-border-subtle rounded-3xl shadow-xl overflow-hidden">
          <div class="p-6 border-b border-border-subtle bg-surface-soft/40 flex items-center justify-between">
            <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
              <ShoppingBag size={16} />
              Artículos a Facturar
            </h3>

            <!-- Reception Origins Tags -->
            {#if uniqueReceptionOrigins.length > 0}
              <div class="flex flex-wrap items-center gap-2 justify-end max-w-xl">
                {#each uniqueReceptionOrigins as origin}
                  <div class="flex items-center gap-2.5 px-4 py-2 bg-brand-500/10 border border-brand-500/20 text-xs md:text-sm font-bold text-text-base rounded-2xl transition-all shadow-sm hover:border-brand-500/30">
                    <div class="flex items-center gap-1.5 truncate max-w-[280px] md:max-w-md">
                      <span class="font-black text-brand-400 font-mono">{origin}</span>
                      {#if importedReceptionsInfo[origin]?.descrip}
                        <span class="text-text-muted">: </span>
                        <span class="text-text-secondary truncate font-medium text-xs md:text-sm" title={importedReceptionsInfo[origin].descrip}>
                          {importedReceptionsInfo[origin].descrip}
                        </span>
                      {/if}
                    </div>
                    <button
                      onclick={() => removeReceptionLines(origin)}
                      class="p-1 hover:bg-brand-500/20 text-brand-400 hover:text-brand-300 rounded-lg transition-colors cursor-pointer flex items-center justify-center border-none bg-transparent shrink-0"
                      title={`Quitar recepción ${origin}`}
                    >
                      <X size={14} class="stroke-[3]" />
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          {#if invoiceLines.length === 0}
            <div class="p-20 text-center flex flex-col items-center justify-center gap-3">
              <ShoppingBag size={48} class="text-text-muted/30 animate-pulse" />
              <h4 class="text-lg font-bold text-text-muted">Factura vacía</h4>
              <p class="text-xs text-text-muted/50 max-w-xs">
                Los artículos importados de la recepción seleccionada aparecerán aquí.
              </p>
            </div>
          {:else}
            <div class="overflow-x-auto" in:slide>
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-surface-strong border-b border-border-subtle text-xs font-black uppercase tracking-wider text-text-muted">
                    <th class="px-6 py-4 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={invoiceLines.every((l) => l.checked)}
                        onchange={(e) => {
                          const target = e.target as HTMLInputElement;
                          invoiceLines.forEach((l) => (l.checked = target.checked));
                        }}
                        class="rounded border-border-subtle text-brand-500 focus:ring-0 cursor-pointer"
                      />
                    </th>
                    <th class="px-6 py-4">Artículo</th>
                    <th class="px-6 py-4 text-center">Recepción</th>
                    <th class="px-6 py-4 text-center">Cantidad</th>
                    <th class="px-6 py-4 text-right">Costo Unit {showUSD ? 'USD' : 'Bs'}</th>
                    <th class="px-6 py-4 text-right">Total {showUSD ? 'USD' : 'Bs'}</th>
                    <th class="px-6 py-4 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle text-xs">
                  {#each invoiceLines as line, idx (line.co_art + line.doc_num_reception + idx)}
                    <tr class="hover:bg-surface-soft/60 transition-colors {line.checked ? '' : 'opacity-40'}">
                      <td class="px-6 py-4 text-center">
                        <input
                          type="checkbox"
                          bind:checked={line.checked}
                          class="rounded border-border-subtle text-brand-500 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      <td class="px-6 py-4">
                        <div class="flex flex-col gap-0.5 max-w-[200px]">
                          <span class="font-black text-text-base truncate">{line.art_des}</span>
                          <div class="flex items-center gap-1.5 text-[9px] text-text-muted font-mono font-bold">
                            <span>{line.co_art.trim()}</span>
                            {#if line.referencia}
                              <span>&bull; Ref: {line.referencia}</span>
                            {/if}
                          </div>
                        </div>
                      </td>

                      <td class="px-6 py-4 text-center">
                        <span class="px-2.5 py-1 rounded-lg bg-surface-soft border border-border-subtle text-xs font-mono font-bold text-brand-400">
                          {line.doc_num_reception}
                        </span>
                      </td>

                      <td class="px-6 py-4 text-center font-black text-text-base">
                        {Number(line.cantidad).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {line.unidad?.trim() || line.co_uni?.trim()}
                      </td>

                      <td class="px-6 py-4 text-right font-bold text-text-muted">
                        <div class="flex items-center justify-end gap-1">
                          {#if showUSD}
                            <input
                              type="number"
                              min="0"
                              step="any"
                              bind:value={line.costo_usd}
                              class="w-24 h-8 text-right px-2 bg-surface-soft border border-border-subtle rounded-lg font-mono font-bold text-text-base focus:border-brand-500 outline-none text-xs"
                            />
                          {:else}
                            <span class="font-mono">
                              {(Number(line.costo_usd || 0) * Number(activeTasa || 1)).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          {/if}
                        </div>
                      </td>

                      <td class="px-6 py-4 text-right font-black text-brand-500 font-mono">
                        {showUSD ? "$" : "Bs."} {((Number(line.cantidad) || 0) * (Number(line.costo_usd) || 0) * (showUSD ? 1 : Number(activeTasa || 1))).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      <td class="px-6 py-4 text-center">
                        <button
                          type="button"
                          onclick={() => removeLine(idx)}
                          class="p-1 text-text-muted hover:text-red-400 transition-colors cursor-pointer"
                          title="Eliminar renglón"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>

      <!-- RIGHT COLUMN: FINANCIAL TOTALS (Estilos idénticos a /dashboard/billing) -->
      <div class="xl:col-span-1">
        <div class="glass p-8 rounded-[32px] border border-border-subtle space-y-8 bg-brand-500/[0.03] backdrop-blur-3xl relative overflow-hidden flex flex-col sticky top-24 shadow-xl">
          <div class="absolute -top-12 -right-12 w-48 h-48 bg-brand-500/10 rounded-full blur-[80px]"></div>

          <!-- Header Tasa Cambiaria y Switcher USD/BS -->
          <div class="flex items-center justify-between border-b border-border-subtle pb-6 relative z-10">
            <div>
              <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Tasa Cambiaria</h4>
              <div class="flex items-center gap-2 mt-1.5">
                <input
                  type="number"
                  step="any"
                  bind:value={activeTasa}
                  class="w-28 h-8 px-2 bg-surface-soft border border-border-subtle rounded-xl text-sm font-mono font-black text-brand-400 text-center outline-none focus:border-brand-500 transition-all"
                />
                <span class="text-xs font-bold text-text-muted">Bs/$</span>
              </div>
            </div>

            <div class="flex bg-surface-base p-1 rounded-xl border border-border-bold shadow-lg">
              <button
                type="button"
                onclick={() => (showUSD = true)}
                class={`px-5 py-2 rounded-lg text-xs font-black transition-all duration-300 ${showUSD ? "bg-brand-600 text-white shadow-lg scale-105" : "text-text-muted hover:text-text-base"}`}
              >
                USD
              </button>
              <button
                type="button"
                onclick={() => (showUSD = false)}
                class={`px-5 py-2 rounded-lg text-xs font-black transition-all duration-300 ${!showUSD ? "bg-brand-600 text-white shadow-lg scale-105" : "text-text-muted hover:text-text-base"}`}
              >
                BS
              </button>
            </div>
          </div>

          <!-- Breakdown -->
          <div class="space-y-6 relative z-10">
            <div class="flex justify-between items-center text-base font-bold text-text-muted">
              <span>Sub-Total</span>
              <span class="font-mono text-text-base">
                {showUSD ? "$" : "Bs."} {(showUSD ? invoiceTotals.subtotalUSD : invoiceTotals.subtotalBS).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <!-- Descuento Global -->
            <div class="flex justify-between items-center text-base font-bold text-text-muted">
              <span>Descuento Global</span>
              <div class="flex items-center gap-1">
                <span class="text-xs font-bold text-text-muted">{showUSD ? "$" : "Bs."}</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  bind:value={invoiceMetadata.descuento_global}
                  class="w-24 h-7 text-right px-2 bg-surface-soft border border-border-subtle rounded text-xs font-mono font-bold text-text-base outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <!-- I.V.A con select -->
            <div class="flex justify-between items-center text-base font-bold text-text-muted">
              <div class="flex items-center gap-3">
                <span>I.V.A</span>
                <select
                  bind:value={taxRateOption}
                  class="bg-surface-strong border border-border-bold text-[10px] font-black text-brand-400 cursor-pointer outline-none hover:bg-surface-soft rounded-lg px-2.5 py-1 transition-all shadow-sm"
                >
                  <option value={16} class="bg-surface-base font-sans text-xs">Cargar 16%</option>
                  <option value={0} class="bg-surface-base font-sans text-xs">Exento 0%</option>
                </select>
              </div>
              <span class="font-mono text-brand-400">
                {showUSD ? "$" : "Bs."} {(showUSD ? invoiceTotals.totalTaxUSD : invoiceTotals.totalTaxBS).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div class="flex justify-between items-center text-base font-bold text-text-muted border-t border-border-subtle/50 pt-4">
              <span>Total Factura</span>
              <span class="font-mono text-text-base">
                {showUSD ? "$" : "Bs."} {(showUSD ? invoiceTotals.totalUSD : invoiceTotals.totalBS).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <!-- TOTAL A PAGAR -->
            <div class="pt-8 border-t border-border-bold flex flex-col gap-2">
              <div class="flex justify-between items-end">
                <div>
                  <span class="text-[10px] font-black uppercase tracking-[0.2em] text-brand-400/60 block mb-2">
                    TOTAL A PAGAR
                  </span>
                  <div class="text-5xl font-black text-text-base drop-shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)] tracking-tight leading-none text-brand-400">
                    {showUSD ? "$" : "Bs."} {(showUSD ? invoiceTotals.totalUSD : invoiceTotals.totalBS).toLocaleString("de-DE", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              </div>
              {#if !showUSD}
                <p class="text-[11px] text-left text-text-muted font-mono mt-1">
                  Equivalente: ${invoiceTotals.totalUSD.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </p>
              {:else}
                <p class="text-[11px] text-left text-text-muted font-mono mt-1">
                  Equivalente: Bs. {invoiceTotals.totalBS.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              {/if}
            </div>
          </div>

          <!-- Action Button: Guardar Factura -->
          <div class="pt-4 relative z-10">
            <button
              type="button"
              onclick={handleSaveInvoice}
              disabled={isSavingInvoice || invoiceLines.length === 0}
              class="w-full h-14 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30 transition-all active:scale-[0.98] cursor-pointer"
            >
              {#if isSavingInvoice}
                <Loader2 size={18} class="animate-spin" />
                GUARDANDO FACTURA...
              {:else}
                <Check size={18} />
                GUARDAR FACTURA
              {/if}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- IMPORT RECEPTIONS MODAL (Idéntico a Importar Pedido de /dashboard/billing) -->
{#if showImportModal}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    in:fade
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0"
      onclick={() => {
        showImportModal = false;
      }}
    ></div>

    <div
      class="w-full max-w-2xl bg-surface-base border border-border-subtle rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh] relative z-10"
      in:scale={{ duration: 200, start: 0.95 }}
    >
      <!-- Modal Header -->
      <div
        class="p-8 border-b border-border-subtle flex justify-between items-center bg-surface-soft/50"
      >
        <div>
          <h2 class="text-2xl font-black tracking-tight">Importar Recepcion</h2>
          <p class="text-text-muted text-sm">
            Selecciona una recepción para cargarla en la factura
          </p>
        </div>
        <button
          type="button"
          onclick={() => {
            showImportModal = false;
          }}
          class="p-2 hover:bg-surface-strong rounded-full transition-colors cursor-pointer"
        >
          <X size={24} />
        </button>
      </div>

      <!-- Contenido Modal -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar min-h-[300px] custom-scrollbar">
        <!-- Buscador -->
        <div class="relative">
          <Search size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
          <input 
            type="text" 
            placeholder="Buscar por nro. recepción, RIF o nombre de proveedor..." 
            bind:value={importSearchQuery}
            oninput={searchPendingReceptions}
            class="w-full bg-surface-soft border border-border-subtle pl-12 pr-4 py-3.5 rounded-2xl text-sm text-text-base placeholder-text-muted/50 focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all font-medium"
          />
          {#if isSearchingReceptions}
            <RefreshCw size={16} class="animate-spin absolute right-4 top-1/2 -translate-y-1/2 text-brand-500" />
          {/if}
        </div>

        <!-- Resultados -->
        <div class="space-y-3">
          {#if isSearchingReceptions}
            <div class="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 size={40} class="animate-spin text-brand-500" />
              <p class="text-text-muted font-bold animate-pulse">
                Buscando recepciones...
              </p>
            </div>
          {:else if foundReceptions.length === 0}
            <div
              class="flex flex-col items-center justify-center py-20 gap-3 text-text-muted opacity-50 bg-surface-base"
            >
              <FileText size={48} />
              <p class="font-bold">No se encontraron recepciones pendientes</p>
            </div>
          {:else}
            {#each foundReceptions as reception (reception.doc_num + (reception.sede_id || ""))}
              {@const isParcial = String(reception.status).trim() === "1"}
              {@const docTasa = Number(reception.tasa || 1) > 1 ? Number(reception.tasa) : Number(activeTasa || 1)}
              {@const rawUsd = Number(reception.total_neto) / docTasa}
              {@const formattedUsd = rawUsd.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {@const formattedBs = Number(reception.total_neto).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

              <ImportItemCard
                docType="NREC"
                docNum={reception.doc_num}
                statusLabel={isParcial ? "Parcial" : "Sin Procesar"}
                statusClass={isParcial ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-brand-500/10 text-brand-400 border-brand-500/20"}
                clientName={reception.prov_des || reception.co_prov}
                clientRif={reception.rif || reception.co_prov}
                dateEmis={dayjs(reception.fec_emis).format("DD/MM/YYYY")}
                amountUsd={formattedUsd}
                amountBs={formattedBs}
                qtyLabel={`${reception.cant_renglones_pendientes || reception.renglones?.length || 0} items`}
                branchName={reception.sede_nombre || "N/A"}
                onclick={() => importReception(reception)}
              />
            {/each}
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL DE CONFIRMACIÓN DE CAMBIO DE PRECIOS -->
<PriceChangeConfirmModal
  bind:open={showPriceModal}
  changes={detectedPriceChanges}
  loading={isSavingInvoice}
  documentType="Factura de Compra"
  onconfirm={({ updatePrices, broadcast, changes }) => {
    showPriceModal = false;
    executeSaveInvoice({ updatePrices, broadcast, changes });
  }}
  oncancel={() => {
    showPriceModal = false;
  }}
/>
