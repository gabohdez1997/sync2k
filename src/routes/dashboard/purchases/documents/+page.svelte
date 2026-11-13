<!-- src/routes/dashboard/purchases/documents/+page.svelte -->
<script lang="ts">
  import { fade, slide } from "svelte/transition";
  import {
    FileSpreadsheet,
    Search,
    Building2,
    Calendar,
    Clock,
    Store,
    ChevronDown,
    Check,
    Loader2,
    RefreshCw,
    X,
    FileText,
    Calculator,
    AlertCircle,
    DollarSign,
    CheckCircle2,
    Percent,
    Tag,
    Receipt,
    Sparkles
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import dayjs from "dayjs";

  let { data } = $props();

  // Active State
  let filterSede = $state("");
  let showUSD = $state(true);
  let activeTasa = $state(1);
  let isFetchingRate = $state(false);
  let initializedEditKey = $state("");

  const isEditing = $derived(Boolean(data.editDocument));
  const editingKey = $derived(
    data.editDocument
      ? {
          co_tipo_doc: String(data.editDocument.co_tipo_doc || "").trim(),
          nro_doc: String(data.editDocument.nro_doc || "").trim()
        }
      : null
  );

  const editBlockedReason = $derived.by(() => {
    const d = data.editDocument;
    if (!d) return null;
    if (d.anulado) return "Este documento está anulado y no puede editarse.";
    const docOrig = String(d.doc_orig || "").trim();
    const tipo = String(d.co_tipo_doc || "").trim().toUpperCase();
    if (docOrig === "FACT") {
      return `Este documento proviene de la Factura de Compra ${d.nro_orig || ""}. Debe administrarse desde el módulo de Facturas de Compra.`;
    }
    if (docOrig === "PAGO" || ["IVAN", "ISLR"].includes(tipo)) {
      return "Este documento fue generado automáticamente por una retención o pago. Debe administrarse desde el módulo de Pagos a Proveedores.";
    }
    const activePagos = (d.pagos || []).filter((p: any) => !p.anulado);
    if (activePagos.length > 0) {
      return `Este documento tiene ${activePagos.length} pago(s) activo(s) asociado(s) (Ej. Pago N° ${activePagos[0].cob_num}). Anule los pagos antes de editarlo.`;
    }
    return null;
  });

  // Supplier & Metadata
  let selectedSupplier = $state<any>(null);
  let showSupplierModal = $state(false);
  let supplierSearchQuery = $state("");
  let isSearchingSuppliers = $state(false);
  let foundSuppliers = $state<any[]>([]);

  // Document Fields
  let docMetadata = $state({
    co_tipo_doc: "FACT",
    nro_fact: "",
    n_control: "",
    fec_emis: dayjs().format("YYYY-MM-DD"),
    fec_venc: dayjs().format("YYYY-MM-DD"),
    co_cond: "01",
    co_cta_ingr_egr: "",
    observa: ""
  });

  // Financial Amounts (entered according to showUSD)
  let montoBrutoInput = $state<number>(0);
  let porcDescInput = $state<number>(0);
  let montoDescInput = $state<number>(0);
  let porcRecaInput = $state<number>(0);
  let montoRecaInput = $state<number>(0);
  let montoExentoInput = $state<number>(0);
  let otrosInput = $state<number>(0);
  let alicuotaIva = $state<number>(16);
  let customIvaOverride = $state<number | null>(null);

  // Status & Submit
  let isSavingDocument = $state(false);
  let saveSuccess = $state(false);
  let savedDocNum = $state("");
  let savedNroFact = $state("");
  let savedTipoDoc = $state("");
  let savedTotalNeto = $state(0);
  let savedMoneda = $state<"BS" | "USD">("USD");
  let savedTotalUSD = $state(0);

  $effect(() => {
    if (data.selectedBranchId) filterSede = data.selectedBranchId;
    if (!data.editDocument && data.activeRate) activeTasa = data.activeRate;
  });

  $effect(() => {
    const d = data.editDocument;
    if (!d) {
      initializedEditKey = "";
      return;
    }
    const key = `${String(d.co_tipo_doc || "").trim()}::${String(d.nro_doc || "").trim()}`;
    if (initializedEditKey === key) return;
    initializedEditKey = key;

    const docMone = String(d.co_mone || "BS").trim().toUpperCase();
    const isDocUSD = docMone.includes("US") || docMone.includes("$") || docMone === "DOL";
    const rate = Number(d.tasa) > 1 ? Number(d.tasa) : (Number(d.tasa_actual) || Number(data.activeRate) || 1);
    activeTasa = rate;
    showUSD = isDocUSD;

    selectedSupplier = {
      co_prov: String(d.co_prov || "").trim(),
      prov_des: String(d.prov_des || "").trim(),
      rif: String(d.rif || "").trim(),
      direc1: String(d.direc1 || "").trim(),
      telefonos: String(d.telefonos || "").trim(),
      co_cond: null
    };

    const fecEmisStr = d.fec_emis ? String(d.fec_emis).split("T")[0] : dayjs().format("YYYY-MM-DD");
    const fecVencStr = d.fec_venc ? String(d.fec_venc).split("T")[0] : fecEmisStr;

    docMetadata = {
      co_tipo_doc: String(d.co_tipo_doc || "FACT").trim(),
      nro_fact: String(d.nro_fact || "").trim(),
      n_control: String(d.n_control || "").trim(),
      fec_emis: fecEmisStr,
      fec_venc: fecVencStr,
      co_cond: "01",
      co_cta_ingr_egr: String(d.co_cta_ingr_egr || "").trim(),
      observa: String(d.observa || "").trim()
    };

    const brutoBs = Number(d.total_bruto || 0);
    const descBs = Number(d.monto_desc_glob || 0);
    const recaBs = Number(d.monto_reca || 0);
    const exentoBs = Number(d.monto_exento ?? d.otros2 ?? 0);
    const otrosBs = Number(d.otros ?? 0);
    const impBs = Number(d.monto_imp || 0);
    const pImpRaw = Math.round(Number(d.porc_imp ?? (impBs > 0 ? 16 : 0)));
    const pImp = [0, 8, 16].includes(pImpRaw) ? pImpRaw : (impBs > 0 ? 16 : 0);

    const toEditCurrency = (valBs: number) =>
      isDocUSD && rate > 0 ? Math.round((valBs / rate) * 100) / 100 : valBs;

    montoBrutoInput = toEditCurrency(brutoBs);
    montoDescInput = toEditCurrency(descBs);
    porcDescInput = Number(d.porc_desc_glob || 0) || (brutoBs > 0 && descBs > 0 ? Math.round((descBs / brutoBs) * 10000) / 100 : 0);
    montoRecaInput = toEditCurrency(recaBs);
    porcRecaInput = Number(d.porc_reca || 0) || (brutoBs > 0 && recaBs > 0 ? Math.round((recaBs / brutoBs) * 10000) / 100 : 0);
    montoExentoInput = toEditCurrency(exentoBs);
    otrosInput = toEditCurrency(otrosBs);
    alicuotaIva = pImp;

    const baseNetaBs = Math.max(0, brutoBs - descBs + recaBs);
    const expectedImpBs = baseNetaBs * (pImp / 100);
    customIvaOverride = Math.abs(impBs - expectedImpBs) > 0.02 ? toEditCurrency(impBs) : null;
  });

  // Sucursal Resolution
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
    return found ? found.code : "01";
  });

  function updateDueDateFromCondition() {
    if (docMetadata.co_cond && data.paymentConditions) {
      const cond = data.paymentConditions.find(
        (c: any) => c.co_cond?.trim() === docMetadata.co_cond?.trim()
      );
      if (cond && cond.dias_cred != null) {
        const days = Number(cond.dias_cred) || 0;
        docMetadata.fec_venc = dayjs(docMetadata.fec_emis).add(days, "day").format("YYYY-MM-DD");
      }
    }
  }

  // Handlers for dynamic recalculation between % and Monto
  function handleMontoBrutoChange() {
    const bruto = Number(montoBrutoInput) || 0;
    if (porcDescInput > 0) {
      montoDescInput = Math.round(bruto * (porcDescInput / 100) * 100) / 100;
    }
    if (porcRecaInput > 0) {
      montoRecaInput = Math.round(bruto * (porcRecaInput / 100) * 100) / 100;
    }
  }

  function handlePorcDescChange() {
    const bruto = Number(montoBrutoInput) || 0;
    const porc = Number(porcDescInput) || 0;
    montoDescInput = Math.round(bruto * (porc / 100) * 100) / 100;
  }

  function handleMontoDescChange() {
    const bruto = Number(montoBrutoInput) || 0;
    const desc = Number(montoDescInput) || 0;
    porcDescInput = bruto > 0 ? Math.round((desc / bruto) * 10000) / 100 : 0;
  }

  function handlePorcRecaChange() {
    const bruto = Number(montoBrutoInput) || 0;
    const porc = Number(porcRecaInput) || 0;
    montoRecaInput = Math.round(bruto * (porc / 100) * 100) / 100;
  }

  function handleMontoRecaChange() {
    const bruto = Number(montoBrutoInput) || 0;
    const reca = Number(montoRecaInput) || 0;
    porcRecaInput = bruto > 0 ? Math.round((reca / bruto) * 10000) / 100 : 0;
  }

  function applyIgtf3() {
    const baseSubject = calculatedTotals.totalSinImpuestoInput + (customIvaOverride !== null ? customIvaOverride : calculatedTotals.ivaInput);
    const igtf = Math.round(baseSubject * 0.03 * 100) / 100;
    if (Math.abs(otrosInput - igtf) < 0.01 && otrosInput > 0) {
      otrosInput = 0;
      toast.info("IGTF 3% removido.");
    } else {
      otrosInput = igtf;
      toast.success(`IGTF 3% aplicado: ${showUSD ? '$' : 'Bs.'} ${igtf.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
  }

  // Financial Calculations
  const calculatedTotals = $derived.by(() => {
    const rate = Number(activeTasa || 1);
    const brutoInput = Number(montoBrutoInput) || 0;
    const descInput = Number(montoDescInput) || 0;
    const recaInput = Number(montoRecaInput) || 0;
    const exentoInput = Number(montoExentoInput) || 0;
    const otrosInputVal = Number(otrosInput) || 0;
    const pIva = Number(alicuotaIva) || 0;

    const totalSinImpuestoInput = Math.max(0, brutoInput - descInput + recaInput);

    let brutoUSD = 0, brutoBS = 0;
    let descUSD = 0, descBS = 0;
    let recaUSD = 0, recaBS = 0;
    let totalSinImpuestoUSD = 0, totalSinImpuestoBS = 0;
    let exentoUSD = 0, exentoBS = 0;
    let otrosUSD = 0, otrosBS = 0;

    if (showUSD) {
      brutoUSD = brutoInput;
      brutoBS = brutoInput * rate;
      descUSD = descInput;
      descBS = descInput * rate;
      recaUSD = recaInput;
      recaBS = recaInput * rate;
      totalSinImpuestoUSD = totalSinImpuestoInput;
      totalSinImpuestoBS = totalSinImpuestoInput * rate;
      exentoUSD = exentoInput;
      exentoBS = exentoInput * rate;
      otrosUSD = otrosInputVal;
      otrosBS = otrosInputVal * rate;
    } else {
      brutoBS = brutoInput;
      brutoUSD = rate > 0 ? brutoInput / rate : 0;
      descBS = descInput;
      descUSD = rate > 0 ? descInput / rate : 0;
      recaBS = recaInput;
      recaUSD = rate > 0 ? recaInput / rate : 0;
      totalSinImpuestoBS = totalSinImpuestoInput;
      totalSinImpuestoUSD = rate > 0 ? totalSinImpuestoInput / rate : 0;
      exentoBS = exentoInput;
      exentoUSD = rate > 0 ? exentoInput / rate : 0;
      otrosBS = otrosInputVal;
      otrosUSD = rate > 0 ? otrosInputVal / rate : 0;
    }

    let ivaUSD = 0;
    let ivaBS = 0;
    let ivaInput = 0;

    if (customIvaOverride !== null && customIvaOverride >= 0) {
      ivaInput = customIvaOverride;
      if (showUSD) {
        ivaUSD = customIvaOverride;
        ivaBS = customIvaOverride * rate;
      } else {
        ivaBS = customIvaOverride;
        ivaUSD = rate > 0 ? customIvaOverride / rate : 0;
      }
    } else {
      ivaUSD = totalSinImpuestoUSD * (pIva / 100);
      ivaBS = totalSinImpuestoBS * (pIva / 100);
      ivaInput = showUSD ? ivaUSD : ivaBS;
    }

    const totalUSD = Math.round((totalSinImpuestoUSD + exentoUSD + ivaUSD + otrosUSD) * 100) / 100;
    const totalBS = Math.round((totalSinImpuestoBS + exentoBS + ivaBS + otrosBS) * 100) / 100;

    return {
      rate,
      brutoInput: Math.round(brutoInput * 100) / 100,
      descInput: Math.round(descInput * 100) / 100,
      recaInput: Math.round(recaInput * 100) / 100,
      totalSinImpuestoInput: Math.round(totalSinImpuestoInput * 100) / 100,
      exentoInput: Math.round(exentoInput * 100) / 100,
      otrosInputVal: Math.round(otrosInputVal * 100) / 100,
      ivaInput: Math.round(ivaInput * 100) / 100,
      brutoUSD: Math.round(brutoUSD * 100) / 100,
      brutoBS: Math.round(brutoBS * 100) / 100,
      descUSD: Math.round(descUSD * 100) / 100,
      descBS: Math.round(descBS * 100) / 100,
      recaUSD: Math.round(recaUSD * 100) / 100,
      recaBS: Math.round(recaBS * 100) / 100,
      totalSinImpuestoUSD: Math.round(totalSinImpuestoUSD * 100) / 100,
      totalSinImpuestoBS: Math.round(totalSinImpuestoBS * 100) / 100,
      exentoUSD: Math.round(exentoUSD * 100) / 100,
      exentoBS: Math.round(exentoBS * 100) / 100,
      ivaUSD: Math.round(ivaUSD * 100) / 100,
      ivaBS: Math.round(ivaBS * 100) / 100,
      otrosUSD: Math.round(otrosUSD * 100) / 100,
      otrosBS: Math.round(otrosBS * 100) / 100,
      totalUSD,
      totalBS
    };
  });

  function handleBranchChange() {
    const params = new URLSearchParams($page.url.searchParams);
    if (filterSede) params.set("branch_id", filterSede);
    else params.delete("branch_id");
    goto(`?${params.toString()}`);
  }

  // Fetch Exchange Rate from Agent
  async function fetchExchangeRate() {
    if (!filterSede) return;
    isFetchingRate = true;
    try {
      const res = await fetch(`/api/agent/tasa?branch_id=${filterSede}`);
      if (res.ok) {
        const json = await res.json();
        const newRate = Number(json.tasa || json.data?.tasa || 1);
        if (newRate > 0) {
          activeTasa = newRate;
          toast.success(`Tasa cambiaria actualizada: Bs. ${newRate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`);
        }
      } else {
        toast.error("No se pudo obtener la tasa desde el agente.");
      }
    } catch (e: any) {
      toast.error("Error al obtener la tasa: " + e.message);
    } finally {
      isFetchingRate = false;
    }
  }

  function handleTasaChange() {
    // Reactive rate updates derived totals automatically
  }

  function switchCurrency(toUSD: boolean) {
    if (showUSD === toUSD) return;
    const rate = Number(activeTasa || 1);
    if (toUSD) {
      // Switching from BS to USD
      montoBrutoInput = rate > 0 ? Math.round((montoBrutoInput / rate) * 100) / 100 : 0;
      montoDescInput = rate > 0 ? Math.round((montoDescInput / rate) * 100) / 100 : 0;
      montoRecaInput = rate > 0 ? Math.round((montoRecaInput / rate) * 100) / 100 : 0;
      montoExentoInput = rate > 0 ? Math.round((montoExentoInput / rate) * 100) / 100 : 0;
      otrosInput = rate > 0 ? Math.round((otrosInput / rate) * 100) / 100 : 0;
      if (customIvaOverride !== null) {
        customIvaOverride = rate > 0 ? Math.round((customIvaOverride / rate) * 100) / 100 : 0;
      }
    } else {
      // Switching from USD to BS
      montoBrutoInput = Math.round((montoBrutoInput * rate) * 100) / 100;
      montoDescInput = Math.round((montoDescInput * rate) * 100) / 100;
      montoRecaInput = Math.round((montoRecaInput * rate) * 100) / 100;
      montoExentoInput = Math.round((montoExentoInput * rate) * 100) / 100;
      otrosInput = Math.round((otrosInput * rate) * 100) / 100;
      if (customIvaOverride !== null) {
        customIvaOverride = Math.round((customIvaOverride * rate) * 100) / 100;
      }
    }
    showUSD = toUSD;
  }

  // Supplier Search
  async function searchSuppliers() {
    if (!supplierSearchQuery.trim()) return;
    isSearchingSuppliers = true;
    try {
      const res = await fetch(`/api/agent/suppliers?branch_id=${filterSede}&search=${encodeURIComponent(supplierSearchQuery.trim())}&limit=20`);
      const result = await res.json();
      if (result.success !== false) {
        foundSuppliers = result.data || [];
      } else {
        toast.error(result.message || "Error al buscar proveedores.");
      }
    } catch (e: any) {
      toast.error("Error al buscar proveedores: " + e.message);
    } finally {
      isSearchingSuppliers = false;
    }
  }

  function selectSupplier(prov: any) {
    selectedSupplier = {
      co_prov: String(prov.co_prov || "").trim(),
      prov_des: String(prov.prov_des || prov.descripcion || "").trim(),
      rif: String(prov.rif || "").trim(),
      direc1: String(prov.direc1 || "").trim(),
      telefonos: String(prov.telefonos || "").trim(),
      co_cond: prov.co_cond ? String(prov.co_cond).trim() : null
    };

    if (selectedSupplier.co_cond) {
      docMetadata.co_cond = selectedSupplier.co_cond;
      updateDueDateFromCondition();
    }

    showSupplierModal = false;
    toast.success(`Proveedor seleccionado: ${selectedSupplier.prov_des}`);
  }

  function resetForm() {
    if (isEditing) {
      goto(`/dashboard/purchases/documents?branch_id=${filterSede}`);
      return;
    }
    selectedSupplier = null;
    docMetadata = {
      co_tipo_doc: "FACT",
      nro_fact: "",
      n_control: "",
      fec_emis: dayjs().format("YYYY-MM-DD"),
      fec_venc: dayjs().format("YYYY-MM-DD"),
      co_cond: "01",
      co_cta_ingr_egr: "",
      observa: ""
    };
    montoBrutoInput = 0;
    porcDescInput = 0;
    montoDescInput = 0;
    porcRecaInput = 0;
    montoRecaInput = 0;
    montoExentoInput = 0;
    otrosInput = 0;
    customIvaOverride = null;
    saveSuccess = false;
    savedDocNum = "";
    savedNroFact = "";
  }

  async function handleRegisterDocument() {
    if (isEditing && editBlockedReason) {
      toast.error(editBlockedReason);
      return;
    }
    if (!filterSede) {
      toast.error("Debe seleccionar una sucursal.");
      return;
    }
    if (!selectedSupplier || !selectedSupplier.co_prov) {
      toast.error("Debe seleccionar un proveedor.");
      return;
    }
    const nroFactClean = (docMetadata.nro_fact || "").trim();
    if (!nroFactClean) {
      toast.error("El número de factura / documento fiscal del proveedor es obligatorio.");
      return;
    }
    if (calculatedTotals.totalBS <= 0) {
      toast.error("El monto total del documento debe ser mayor a 0.");
      return;
    }

    isSavingDocument = true;
    try {
      // Profit Plus stores financial amounts in national currency (BS) while recording the document's selected currency (co_mone) and rate
      const selectedCurrency = showUSD ? "USD" : "BS";
      const documentPayload = {
        co_tipo_doc: docMetadata.co_tipo_doc,
        nro_fact: nroFactClean,
        n_control: (docMetadata.n_control || "N/A").trim() || "N/A",
        co_prov: selectedSupplier.co_prov,
        co_mone: selectedCurrency,
        tasa: calculatedTotals.rate,
        total_bruto: calculatedTotals.brutoBS,
        porc_desc_glob: String(porcDescInput || 0),
        monto_desc_glob: calculatedTotals.descBS,
        porc_reca: porcRecaInput > 0 ? String(porcRecaInput) : null,
        monto_reca: calculatedTotals.recaBS,
        otros1: calculatedTotals.otrosBS,
        monto_exento: calculatedTotals.exentoBS,
        porc_imp: alicuotaIva,
        monto_imp: calculatedTotals.ivaBS,
        total_neto: calculatedTotals.totalBS,
        saldo: calculatedTotals.totalBS,
        fec_emis: docMetadata.fec_emis,
        fec_venc: docMetadata.fec_venc,
        fec_reg: docMetadata.fec_emis,
        co_cond: docMetadata.co_cond,
        co_cta_ingr_egr: docMetadata.co_cta_ingr_egr || null,
        observa: docMetadata.observa || `${docMetadata.co_tipo_doc} N° ${nroFactClean} - ${selectedSupplier.prov_des}`,
        co_sucu_in: defaultBranchCode || "01"
      };

      const endpoint = isEditing && editingKey
        ? `/api/agent/documentos-compra/${encodeURIComponent(editingKey.co_tipo_doc)}/${encodeURIComponent(editingKey.nro_doc)}`
        : "/api/agent/documentos-compra";

      const res = await fetch(endpoint, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: filterSede,
          document: documentPayload
        })
      });

      const result = await res.json();
      if (result.success !== false) {
        savedDocNum = result.doc_num || result.nro_doc || editingKey?.nro_doc || "";
        savedNroFact = nroFactClean;
        savedTipoDoc = docMetadata.co_tipo_doc;
        savedTotalNeto = calculatedTotals.totalBS;
        savedMoneda = selectedCurrency;
        savedTotalUSD = calculatedTotals.totalUSD;
        saveSuccess = true;
        toast.success(
          isEditing
            ? `Documento ${savedTipoDoc} ${savedDocNum} actualizado con éxito.`
            : `Documento ${savedTipoDoc} ${savedDocNum} registrado con éxito.`
        );
      } else {
        toast.error(result.message || (isEditing ? "Error al actualizar el documento." : "Error al registrar el documento."));
      }
    } catch (e: any) {
      toast.error("Error al comunicarse con el servidor: " + e.message);
    } finally {
      isSavingDocument = false;
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
      <h2 class="text-3xl font-black text-text-base">{isEditing ? '¡Documento Actualizado!' : '¡Documento Registrado!'}</h2>
      <p class="text-text-muted text-sm">
        El documento de compra ha sido {isEditing ? 'actualizado' : 'registrado'} exitosamente en Profit Plus (Cuentas por Pagar).
      </p>
    </div>

    <div class="grid grid-cols-2 gap-4 w-full">
      <div class="bg-surface-soft p-4 rounded-2xl border border-border-subtle text-left">
        <span class="text-[10px] text-text-muted/70 uppercase font-bold tracking-wider">N° Profit Plus</span>
        <div class="text-xl font-black text-brand-400 mt-0.5 font-mono">{savedDocNum}</div>
      </div>
      <div class="bg-surface-soft p-4 rounded-2xl border border-border-subtle text-left">
        <span class="text-[10px] text-text-muted/70 uppercase font-bold tracking-wider">N° Factura Fiscal</span>
        <div class="text-xl font-black text-text-base mt-0.5 font-mono">{savedNroFact}</div>
      </div>
      <div class="col-span-2 bg-surface-soft/60 px-4 py-3 rounded-2xl border border-border-subtle text-left flex justify-between items-center text-sm">
        <span class="text-text-muted font-medium">Monto Total Registrado ({savedMoneda}):</span>
        <div class="text-right">
          <div class="font-mono font-bold text-text-base">
            {#if savedMoneda === "USD"}
              $ {savedTotalUSD.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {:else}
              Bs. {savedTotalNeto.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {/if}
          </div>
          <div class="text-[11px] font-mono text-text-muted">
            {#if savedMoneda === "USD"}
              Bs. {savedTotalNeto.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {:else}
              Ref: $ {savedTotalUSD.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {/if}
          </div>
        </div>
      </div>
    </div>

    <div class="flex gap-4 w-full">
      <a
        href="/dashboard/purchases/documents/history?branch_id={filterSede}"
        class="flex-1 text-center bg-surface-soft hover:bg-surface-strong text-text-base px-6 py-3.5 rounded-2xl font-bold transition-all text-sm flex items-center justify-center border border-border-subtle"
      >
        Ver Historial
      </a>
      <a
        href="/dashboard/purchases/documents/{encodeURIComponent(savedTipoDoc)}/{encodeURIComponent(savedDocNum)}/print?branch_id={filterSede}"
        target="_blank"
        class="flex-1 text-center bg-surface-soft hover:bg-surface-strong text-text-base px-6 py-3.5 rounded-2xl font-bold transition-all text-sm flex items-center justify-center border border-border-subtle"
      >
        Imprimir PDF
      </a>
      <button
        onclick={resetForm}
        class="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-brand-500/20 text-sm cursor-pointer"
      >
        {isEditing ? 'Nuevo Documento' : 'Registrar Otro'}
      </button>
    </div>
  </div>
{:else}
  <!-- MAIN PURCHASE DOCUMENT INTERFACE -->
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
    {#if data.editError || editBlockedReason}
      <div
        class="glass border-amber-500/30 p-5 rounded-3xl flex items-center gap-4 bg-amber-500/5 shadow-lg"
        in:slide
      >
        <div class="h-11 w-11 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
          <AlertCircle size={22} />
        </div>
        <div class="flex-1">
          <h3 class="text-xs font-black text-amber-500 uppercase tracking-widest mb-0.5">
            Aviso de Edición
          </h3>
          <p class="text-text-muted font-semibold text-sm">
            {data.editError || editBlockedReason}
          </p>
        </div>
        <a
          href="/dashboard/purchases/documents/history?branch_id={filterSede}"
          class="px-4 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong text-xs font-bold border border-border-subtle transition-all"
        >
          Volver al Historial
        </a>
      </div>
    {/if}

    <!-- TOP HEADER -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
          <FileSpreadsheet size={40} class="text-brand-500" />
          {#if isEditing && editingKey}
            Editar Documento {editingKey.co_tipo_doc} #{editingKey.nro_doc}
          {:else}
            Documentos de Compra
          {/if}
        </h1>
        <p class="text-text-muted mt-2 text-base">
          {isEditing
            ? 'Modificación de documento de compra registrado directamente en Cuentas por Pagar.'
            : 'Registro directo de facturas, notas de crédito y notas de débito de proveedores en Cuentas por Pagar.'}
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
              disabled={isEditing}
              class="w-full h-14 pl-10 pr-10 bg-surface-soft border border-border-subtle rounded-2xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-sm appearance-none cursor-pointer text-text-base disabled:opacity-60 disabled:cursor-not-allowed"
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

        <!-- History Button -->
        <button
          onclick={() => {
            const params = new URLSearchParams();
            if (filterSede) params.set("branch_id", filterSede);
            goto(`/dashboard/purchases/documents/history?${params.toString()}`);
          }}
          class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-surface-strong hover:bg-surface-base text-text-base border border-border-subtle transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto"
        >
          <Clock size={18} class="text-brand-400" />
          Ver Historial
        </button>
      </div>
    </div>

    <!-- MAIN GRID: LEFT (SUPPLIER & FISCAL DATA & AMOUNTS) & RIGHT (FINANCIAL SUMMARY) -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
      <!-- LEFT/CENTER COLUMN (2 COLS) -->
      <div class="xl:col-span-2 space-y-6">
        <!-- 1. SUPPLIER INFO CARD -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
              <Building2 size={16} />
              Datos del Proveedor
            </h3>
            {#if selectedSupplier}
              <button
                onclick={() => (showSupplierModal = true)}
                class="text-xs text-brand-400 hover:text-brand-300 font-semibold cursor-pointer underline transition-colors"
              >
                Cambiar Proveedor
              </button>
            {/if}
          </div>

          {#if !selectedSupplier}
            <div
              class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-3 bg-surface-soft/30"
            >
              <div class="p-3 bg-surface-soft rounded-2xl text-text-muted">
                <Building2 size={28} />
              </div>
              <div>
                <p class="text-sm font-bold text-text-base">Ningún proveedor seleccionado</p>
                <p class="text-xs text-text-muted mt-1 max-w-sm">
                  Busque y seleccione el proveedor asociado a esta factura o documento de compra.
                </p>
              </div>
              <button
                onclick={() => (showSupplierModal = true)}
                class="mt-2 px-5 py-2.5 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <Search size={14} />
                Buscar Proveedor
              </button>
            </div>
          {:else}
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-surface-soft/50 p-4 rounded-2xl border border-border-subtle">
              <div class="sm:col-span-2">
                <span class="text-[10px] text-text-muted uppercase font-bold tracking-wider">Razón Social</span>
                <div class="text-base font-bold text-text-base mt-0.5">{selectedSupplier.prov_des}</div>
                <div class="text-xs text-text-muted mt-0.5 flex gap-3">
                  <span>Código: <strong class="text-text-base font-mono">{selectedSupplier.co_prov}</strong></span>
                  <span>RIF: <strong class="text-text-base font-mono">{selectedSupplier.rif || 'N/A'}</strong></span>
                </div>
              </div>
              <div>
                <span class="text-[10px] text-text-muted uppercase font-bold tracking-wider">Contacto</span>
                <div class="text-xs text-text-base font-medium mt-1">
                  {selectedSupplier.telefonos || 'Sin teléfono'}
                </div>
                {#if selectedSupplier.direc1}
                  <div class="text-[11px] text-text-muted truncate mt-0.5" title={selectedSupplier.direc1}>
                    {selectedSupplier.direc1}
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <!-- 2. DOCUMENT FISCAL DATA CARD -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-4">
          <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
            <FileText size={16} />
            Datos del Documento
          </h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <!-- Tipo de Documento -->
            <div>
              <label for="tipo_doc" class="text-xs font-bold text-text-muted block mb-1.5">Tipo de Documento *</label>
              <select
                id="tipo_doc"
                bind:value={docMetadata.co_tipo_doc}
                disabled={isEditing}
                class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-semibold focus:border-brand-500 outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="FACT">FACT - Factura</option>
                <option value="N/CR">N/CR - Nota de Crédito</option>
                <option value="N/DB">N/DB - Nota de Débito</option>
                {#each data.docTypes as td}
                  {#if !['FACT', 'N/CR', 'N/DB'].includes(td.co_tipo_doc?.trim())}
                    <option value={td.co_tipo_doc?.trim()}>{td.co_tipo_doc?.trim()} - {td.descrip?.trim()}</option>
                  {/if}
                {/each}
              </select>
            </div>

            <!-- Nro Factura Proveedor -->
            <div>
              <label for="nro_fact" class="text-xs font-bold text-text-muted block mb-1.5">N° Factura Fiscal *</label>
              <input
                id="nro_fact"
                type="text"
                bind:value={docMetadata.nro_fact}
                placeholder="Ej. 0001482"
                class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-mono font-bold focus:border-brand-500 outline-none uppercase"
              />
            </div>

            <!-- Nro de Control -->
            <div>
              <label for="n_control" class="text-xs font-bold text-text-muted block mb-1.5">N° de Control Fiscal</label>
              <input
                id="n_control"
                type="text"
                bind:value={docMetadata.n_control}
                placeholder="Ej. 00-001234 o N/A"
                class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-mono font-bold focus:border-brand-500 outline-none uppercase"
              />
            </div>

            <!-- Fecha Emisión -->
            <div>
              <label for="fec_emis" class="text-xs font-bold text-text-muted block mb-1.5">Fecha de Emisión *</label>
              <input
                id="fec_emis"
                type="date"
                bind:value={docMetadata.fec_emis}
                onchange={() => { if (!isEditing) updateDueDateFromCondition(); }}
                class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-medium focus:border-brand-500 outline-none cursor-pointer"
              />
            </div>

            <!-- Condición de Pago -->
            <div>
              <label for="co_cond" class="text-xs font-bold text-text-muted block mb-1.5">Condición de Pago</label>
              <select
                id="co_cond"
                bind:value={docMetadata.co_cond}
                onchange={updateDueDateFromCondition}
                class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-semibold focus:border-brand-500 outline-none cursor-pointer"
              >
                {#each data.paymentConditions as cond}
                  <option value={cond.co_cond?.trim()}>{cond.cond_des?.trim() || cond.co_cond?.trim()}</option>
                {/each}
              </select>
            </div>

            <!-- Fecha Vencimiento -->
            <div>
              <label for="fec_venc" class="text-xs font-bold text-text-muted block mb-1.5">Fecha de Vencimiento</label>
              <input
                id="fec_venc"
                type="date"
                bind:value={docMetadata.fec_venc}
                class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-medium focus:border-brand-500 outline-none cursor-pointer"
              />
            </div>

            <!-- Cuenta de Costo/Gasto -->
            <div class="sm:col-span-2 md:col-span-1">
              <label for="co_cta" class="text-xs font-bold text-text-muted block mb-1.5">Cuenta de Gasto/Costo</label>
              <select
                id="co_cta"
                bind:value={docMetadata.co_cta_ingr_egr}
                class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-medium focus:border-brand-500 outline-none cursor-pointer"
              >
                <option value="">(Opcional / Por Defecto)</option>
                {#each data.expenseAccounts as cta}
                  <option value={cta.co_cta_ingr_egr?.trim()}>{cta.descrip?.trim()} ({cta.co_cta_ingr_egr?.trim()})</option>
                {/each}
              </select>
            </div>

            <!-- Observaciones / Concepto -->
            <div class="sm:col-span-2">
              <label for="observa" class="text-xs font-bold text-text-muted block mb-1.5">Concepto / Observaciones</label>
              <input
                id="observa"
                type="text"
                bind:value={docMetadata.observa}
                placeholder="Descripción del gasto o servicio facturado"
                maxlength="120"
                class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-medium focus:border-brand-500 outline-none"
              />
            </div>
          </div>
        </div>

        <!-- 3. AMOUNTS & TAX INPUT CARD (ESTRUCTURA PROFIT PLUS ESCRITORIO) -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-6">
          <div class="flex items-center justify-between border-b border-border-subtle pb-4">
            <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
              <Calculator size={16} />
              Monto del Documento
            </h3>
            <span class="text-xs font-semibold text-text-muted">
              Valores en <strong class="text-brand-400 font-mono">{showUSD ? 'Dólares ($)' : 'Bolívares (Bs.)'}</strong>
            </span>
          </div>

          <!-- FILA 1: MONTO BRUTO -->
          <div class="bg-surface-soft/60 p-5 rounded-2xl border border-border-subtle space-y-2">
            <div class="flex justify-between items-center">
              <label for="monto_bruto" class="text-xs font-bold text-text-base uppercase tracking-wider">
                Monto Bruto
              </label>
              <span class="text-[11px] font-mono text-text-muted">
                {showUSD
                  ? `≈ Bs. ${calculatedTotals.brutoBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `≈ $ ${calculatedTotals.brutoUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
            </div>
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-text-muted">
                {showUSD ? '$' : 'Bs.'}
              </span>
              <input
                id="monto_bruto"
                type="number"
                step="0.01"
                min="0"
                bind:value={montoBrutoInput}
                oninput={handleMontoBrutoChange}
                placeholder="0.00"
                class="w-full h-12 pl-12 pr-4 bg-surface-soft border border-border-subtle rounded-xl text-lg font-mono font-black focus:border-brand-500 outline-none text-text-base transition-all"
              />
            </div>
          </div>

          <!-- FILA 2: DESCUENTO Y RECARGO (IGUAL QUE EN PROFIT ESCRITORIO) -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- % Descuento y Monto Descuento -->
            <div class="bg-surface-soft/60 p-4 rounded-2xl border border-border-subtle space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-text-base flex items-center gap-1.5">
                  <Tag size={14} class="text-text-muted" />
                  Descuento Global
                </span>
                <span class="text-[11px] font-mono text-text-muted">
                  {showUSD
                    ? `≈ Bs. ${calculatedTotals.descBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `≈ $ ${calculatedTotals.descUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label for="porc_desc" class="text-[10px] font-bold text-text-muted block mb-1">% Descuento</label>
                  <div class="relative">
                    <input
                      id="porc_desc"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      bind:value={porcDescInput}
                      oninput={handlePorcDescChange}
                      placeholder="0"
                      class="w-full h-10 px-2.5 pr-6 bg-surface-soft border border-border-subtle rounded-xl text-xs font-mono font-bold text-right outline-none focus:border-brand-500"
                    />
                    <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted pointer-events-none">%</span>
                  </div>
                </div>
                <div>
                  <label for="monto_desc" class="text-[10px] font-bold text-text-muted block mb-1">Monto Descuento</label>
                  <div class="relative">
                    <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted pointer-events-none">
                      {showUSD ? '$' : 'Bs.'}
                    </span>
                    <input
                      id="monto_desc"
                      type="number"
                      step="0.01"
                      min="0"
                      bind:value={montoDescInput}
                      oninput={handleMontoDescChange}
                      placeholder="0.00"
                      class="w-full h-10 pl-8 pr-2.5 bg-surface-soft border border-border-subtle rounded-xl text-xs font-mono font-bold text-right outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- % Recargo y Monto Recargo -->
            <div class="bg-surface-soft/60 p-4 rounded-2xl border border-border-subtle space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-text-base flex items-center gap-1.5">
                  <Percent size={14} class="text-text-muted" />
                  Recargo
                </span>
                <span class="text-[11px] font-mono text-text-muted">
                  {showUSD
                    ? `≈ Bs. ${calculatedTotals.recaBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `≈ $ ${calculatedTotals.recaUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label for="porc_reca" class="text-[10px] font-bold text-text-muted block mb-1">% Recargo</label>
                  <div class="relative">
                    <input
                      id="porc_reca"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      bind:value={porcRecaInput}
                      oninput={handlePorcRecaChange}
                      placeholder="0"
                      class="w-full h-10 px-2.5 pr-6 bg-surface-soft border border-border-subtle rounded-xl text-xs font-mono font-bold text-right outline-none focus:border-brand-500"
                    />
                    <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted pointer-events-none">%</span>
                  </div>
                </div>
                <div>
                  <label for="monto_reca" class="text-[10px] font-bold text-text-muted block mb-1">Monto Recargo</label>
                  <div class="relative">
                    <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted pointer-events-none">
                      {showUSD ? '$' : 'Bs.'}
                    </span>
                    <input
                      id="monto_reca"
                      type="number"
                      step="0.01"
                      min="0"
                      bind:value={montoRecaInput}
                      oninput={handleMontoRecaChange}
                      placeholder="0.00"
                      class="w-full h-10 pl-8 pr-2.5 bg-surface-soft border border-border-subtle rounded-xl text-xs font-mono font-bold text-right outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- FILA 3: TOTAL SIN IMPUESTO (BASE GRAVADA NETA) -->
          <div class="bg-surface-soft/80 p-4 rounded-2xl border border-border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-inner">
            <div>
              <span class="text-xs font-bold text-text-muted uppercase tracking-wider block">
                Total sin Impuesto (Base Gravada)
              </span>
              <span class="text-[11px] text-text-muted">
                Fórmula Profit: Monto Bruto ({showUSD ? '$' : 'Bs.'} {calculatedTotals.brutoInput.toFixed(2)}) - Descuento ({calculatedTotals.descInput.toFixed(2)}) + Recargo ({calculatedTotals.recaInput.toFixed(2)})
              </span>
            </div>
            <div class="text-left sm:text-right font-mono">
              <div class="text-lg font-black text-text-base">
                {showUSD ? '$' : 'Bs.'} {calculatedTotals.totalSinImpuestoInput.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div class="text-xs text-text-muted font-bold">
                {showUSD
                  ? `≈ Bs. ${calculatedTotals.totalSinImpuestoBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `≈ $ ${calculatedTotals.totalSinImpuestoUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>
          </div>

          <!-- FILA 4: IVA, EXENTO Y OTROS (IGTF) -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <!-- Alícuota y Monto IVA -->
            <div class="bg-surface-soft/60 p-4 rounded-2xl border border-border-subtle space-y-2">
              <div class="flex justify-between items-center">
                <label for="iva_monto" class="text-xs font-bold text-text-base">
                  Impuesto I.V.A.
                </label>
                <div class="flex items-center gap-1">
                  <select
                    bind:value={alicuotaIva}
                    onchange={() => (customIvaOverride = null)}
                    class="h-6 px-1 bg-surface-soft border border-border-subtle rounded text-[11px] font-bold cursor-pointer"
                  >
                    <option value={16}>16% (General)</option>
                    <option value={8}>8% (Reducida)</option>
                    <option value={0}>0% (Exento)</option>
                  </select>
                </div>
              </div>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">
                  {showUSD ? '$' : 'Bs.'}
                </span>
                <input
                  id="iva_monto"
                  type="number"
                  step="0.01"
                  min="0"
                  value={showUSD ? calculatedTotals.ivaUSD : calculatedTotals.ivaBS}
                  oninput={(e) => {
                    const val = Number((e.target as HTMLInputElement).value) || 0;
                    customIvaOverride = val;
                  }}
                  class="w-full h-11 pl-9 pr-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-mono font-bold focus:border-brand-500 outline-none text-right"
                />
              </div>
              <div class="flex justify-between items-center text-[11px] text-text-muted font-mono">
                <span>Calculado:</span>
                <span>
                  {showUSD
                    ? `≈ Bs. ${calculatedTotals.ivaBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `≈ $ ${calculatedTotals.ivaUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
              </div>
            </div>

            <!-- Monto Exento -->
            <div class="bg-surface-soft/60 p-4 rounded-2xl border border-border-subtle space-y-2">
              <div class="flex justify-between items-center">
                <label for="exento" class="text-xs font-bold text-text-base">
                  Monto Exento
                </label>
                <span class="text-[10px] text-text-muted font-semibold">No sujeto</span>
              </div>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">
                  {showUSD ? '$' : 'Bs.'}
                </span>
                <input
                  id="exento"
                  type="number"
                  step="0.01"
                  min="0"
                  bind:value={montoExentoInput}
                  placeholder="0.00"
                  class="w-full h-11 pl-9 pr-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-mono font-bold focus:border-brand-500 outline-none text-right"
                />
              </div>
              <div class="flex justify-between items-center text-[11px] text-text-muted font-mono">
                <span>Equivalente:</span>
                <span>
                  {showUSD
                    ? `≈ Bs. ${calculatedTotals.exentoBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `≈ $ ${calculatedTotals.exentoUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
              </div>
            </div>

            <!-- Otros (IGTF / Cargos Adicionales) -->
            <div class="bg-surface-soft/60 p-4 rounded-2xl border border-border-subtle space-y-2">
              <div class="flex justify-between items-center">
                <label for="otros_monto" class="text-xs font-bold text-text-base">
                  Otros (IGTF)
                </label>
                <button
                  type="button"
                  onclick={applyIgtf3}
                  title="Calcular/Alternar IGTF 3% sobre base + IVA"
                  class="px-2 py-0.5 rounded bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/20 text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  <Sparkles size={11} />
                  + IGTF (3%)
                </button>
              </div>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">
                  {showUSD ? '$' : 'Bs.'}
                </span>
                <input
                  id="otros_monto"
                  type="number"
                  step="0.01"
                  min="0"
                  bind:value={otrosInput}
                  placeholder="0.00"
                  class="w-full h-11 pl-9 pr-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-mono font-bold focus:border-brand-500 outline-none text-right"
                />
              </div>
              <div class="flex justify-between items-center text-[11px] text-text-muted font-mono">
                <span>Equivalente:</span>
                <span>
                  {showUSD
                    ? `≈ Bs. ${calculatedTotals.otrosBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `≈ $ ${calculatedTotals.otrosUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
              </div>
            </div>
          </div>

          <!-- TOTAL CALCULADO VISTA PREVIA (MONTO NETO) -->
          <div class="bg-brand-500/5 p-5 rounded-2xl border border-brand-500/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span class="text-[10px] text-brand-400 font-bold uppercase tracking-wider block">
                Monto Neto Total del Documento (Profit Plus)
              </span>
              <div class="text-2xl font-black font-mono text-brand-400 mt-0.5">
                {showUSD
                  ? `$ ${calculatedTotals.totalUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `Bs. ${calculatedTotals.totalBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>
            <div class="text-left sm:text-right text-xs text-text-muted font-mono border-t sm:border-t-0 pt-2 sm:pt-0 border-brand-500/10">
              <span class="block">Equivalente oficial en {showUSD ? 'Bolívares' : 'Dólares'}:</span>
              <span class="font-bold text-sm text-text-base">
                {showUSD
                  ? `Bs. ${calculatedTotals.totalBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `$ ${calculatedTotals.totalUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN: FINANCIAL SUMMARY & ACTIONS (1 COL) -->
      <div class="space-y-6">
        <div class="glass p-6 sm:p-8 rounded-[32px] border border-border-subtle space-y-6 bg-brand-500/[0.03] backdrop-blur-3xl relative overflow-hidden flex flex-col shadow-xl sticky top-6">
          <div class="absolute -top-12 -right-12 w-48 h-48 bg-brand-500/10 rounded-full blur-[80px]"></div>

          <!-- Header Tasa Cambiaria y Switcher USD/BS (RÉPLICA EXACTA DE PAGOS A PROVEEDORES) -->
          <div class="flex items-center justify-between border-b border-border-subtle pb-6 relative z-10">
            <div>
              <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Tasa Cambiaria</h4>
              <div class="flex items-center gap-2 mt-1.5">
                <input
                  type="number"
                  step="any"
                  bind:value={activeTasa}
                  oninput={handleTasaChange}
                  class="w-28 h-8 px-2 bg-surface-soft border border-border-subtle rounded-xl text-sm font-mono font-black text-brand-400 text-center outline-none focus:border-brand-500 transition-all"
                />
                <span class="text-xs font-bold text-text-muted">Bs/$</span>
                <button
                  type="button"
                  onclick={fetchExchangeRate}
                  disabled={isFetchingRate}
                  title="Actualizar tasa desde el agente"
                  class="p-1 hover:bg-white/5 rounded-lg text-text-muted hover:text-brand-400 transition-all cursor-pointer disabled:opacity-50"
                >
                  {#if isFetchingRate}
                    <Loader2 size={13} class="animate-spin text-brand-400" />
                  {:else}
                    <RefreshCw size={13} />
                  {/if}
                </button>
              </div>
            </div>

            <div class="flex bg-surface-base p-1 rounded-xl border border-border-bold shadow-lg">
              <button
                type="button"
                onclick={() => switchCurrency(true)}
                class={`px-5 py-2 rounded-lg text-xs font-black transition-all duration-300 cursor-pointer ${showUSD ? "bg-brand-600 text-white shadow-lg scale-105" : "text-text-muted hover:text-text-base"}`}
              >
                USD
              </button>
              <button
                type="button"
                onclick={() => switchCurrency(false)}
                class={`px-5 py-2 rounded-lg text-xs font-black transition-all duration-300 cursor-pointer ${!showUSD ? "bg-brand-600 text-white shadow-lg scale-105" : "text-text-muted hover:text-text-base"}`}
              >
                BS
              </button>
            </div>
          </div>

          <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2 relative z-10">
            <Calculator size={16} />
            Resumen Financiero
          </h3>

          <div class="space-y-3 divide-y divide-border-subtle/50 text-sm relative z-10">
            <!-- Monto Bruto -->
            <div class="flex justify-between items-center pt-2">
              <span class="text-text-muted">Monto Bruto:</span>
              <div class="text-right font-mono">
                <div class="font-bold text-text-base">
                  $ {calculatedTotals.brutoUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div class="text-xs text-text-muted">
                  Bs. {calculatedTotals.brutoBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <!-- Descuento -->
            {#if calculatedTotals.descInput > 0}
              <div class="flex justify-between items-center pt-2">
                <span class="text-text-muted flex items-center gap-1">
                  Descuento ({porcDescInput}%):
                </span>
                <div class="text-right font-mono text-emerald-400">
                  <div class="font-bold">
                    - $ {calculatedTotals.descUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div class="text-xs opacity-80">
                    - Bs. {calculatedTotals.descBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            {/if}

            <!-- Recargo -->
            {#if calculatedTotals.recaInput > 0}
              <div class="flex justify-between items-center pt-2">
                <span class="text-text-muted flex items-center gap-1">
                  Recargo ({porcRecaInput}%):
                </span>
                <div class="text-right font-mono text-amber-400">
                  <div class="font-bold">
                    + $ {calculatedTotals.recaUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div class="text-xs opacity-80">
                    + Bs. {calculatedTotals.recaBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            {/if}

            <!-- Total sin Impuesto -->
            <div class="flex justify-between items-center pt-2">
              <span class="text-text-muted font-medium">Total sin Impuesto:</span>
              <div class="text-right font-mono">
                <div class="font-bold text-text-base">
                  $ {calculatedTotals.totalSinImpuestoUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div class="text-xs text-text-muted">
                  Bs. {calculatedTotals.totalSinImpuestoBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <!-- Monto Exento -->
            {#if calculatedTotals.exentoInput > 0}
              <div class="flex justify-between items-center pt-2">
                <span class="text-text-muted">Monto Exento:</span>
                <div class="text-right font-mono">
                  <div class="font-bold text-text-base">
                    $ {calculatedTotals.exentoUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div class="text-xs text-text-muted">
                    Bs. {calculatedTotals.exentoBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            {/if}

            <!-- IVA -->
            <div class="flex justify-between items-center pt-2">
              <span class="text-text-muted">IVA ({alicuotaIva}%):</span>
              <div class="text-right font-mono">
                <div class="font-bold text-text-base">
                  $ {calculatedTotals.ivaUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div class="text-xs text-text-muted">
                  Bs. {calculatedTotals.ivaBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <!-- Otros (IGTF) -->
            {#if calculatedTotals.otrosInputVal > 0}
              <div class="flex justify-between items-center pt-2">
                <span class="text-text-muted">Otros (IGTF / Cargos):</span>
                <div class="text-right font-mono">
                  <div class="font-bold text-text-base">
                    $ {calculatedTotals.otrosUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div class="text-xs text-text-muted">
                    Bs. {calculatedTotals.otrosBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            {/if}

            <!-- Total a Pagar -->
            <div class="flex justify-between items-baseline pt-4">
              <span class="text-base font-black text-text-base">Total a Pagar:</span>
              <div class="text-right font-mono">
                <div class="text-2xl font-black font-mono text-brand-400">
                  $ {calculatedTotals.totalUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div class="text-xs font-bold text-text-muted font-mono mt-0.5">
                  Bs. {calculatedTotals.totalBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          <!-- ACTIONS -->
          <div class="space-y-3 pt-2 relative z-10">
            <button
              onclick={handleRegisterDocument}
              disabled={isSavingDocument || calculatedTotals.totalBS <= 0 || Boolean(isEditing && editBlockedReason) || Boolean(data.editError)}
              class="w-full h-14 rounded-2xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-bold transition-all shadow-lg shadow-brand-500/20 active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {#if isSavingDocument}
                <Loader2 size={18} class="animate-spin" />
                {isEditing ? 'Guardando cambios...' : 'Registrando en Profit...'}
              {:else}
                <Check size={18} />
                {isEditing ? 'Guardar Cambios' : 'Registrar Documento'}
              {/if}
            </button>

            <button
              onclick={resetForm}
              type="button"
              class="w-full h-11 rounded-xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base text-xs font-bold transition-all border border-border-subtle cursor-pointer"
            >
              {isEditing ? 'Cancelar Edición' : 'Limpiar Formulario'}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL: BÚSQUEDA DE PROVEEDORES -->
{#if showSupplierModal}
  <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" in:fade>
    <div
      class="bg-surface-base border border-border-subtle rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4"
      in:slide
    >
      <div class="flex justify-between items-center">
        <h3 class="text-lg font-black text-text-base flex items-center gap-2">
          <Building2 size={20} class="text-brand-400" />
          Seleccionar Proveedor
        </h3>
        <button
          onclick={() => (showSupplierModal = false)}
          class="p-2 rounded-xl text-text-muted hover:text-text-base hover:bg-surface-soft cursor-pointer transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <!-- Search Input -->
      <div class="relative">
        <Search size={16} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input
          type="text"
          bind:value={supplierSearchQuery}
          onkeydown={(e) => e.key === "Enter" && searchSuppliers()}
          placeholder="Buscar por RIF, Razón Social o Código..."
          class="w-full h-12 pl-10 pr-24 bg-surface-soft border border-border-subtle rounded-xl text-sm focus:border-brand-500 outline-none"
        />
        <button
          onclick={searchSuppliers}
          disabled={isSearchingSuppliers}
          class="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
        >
          {#if isSearchingSuppliers}
            <Loader2 size={14} class="animate-spin" />
          {:else}
            Buscar
          {/if}
        </button>
      </div>

      <!-- Results list -->
      <div class="max-h-80 overflow-y-auto space-y-2 pr-1">
        {#if isSearchingSuppliers}
          <div class="py-12 flex flex-col items-center justify-center gap-2 text-text-muted">
            <Loader2 size={24} class="animate-spin text-brand-500" />
            <span class="text-xs">Consultando proveedores...</span>
          </div>
        {:else if foundSuppliers.length === 0}
          <div class="py-12 text-center text-text-muted text-xs">
            {supplierSearchQuery ? "No se encontraron proveedores que coincidan con la búsqueda." : "Escriba un RIF o nombre de proveedor para buscar."}
          </div>
        {:else}
          {#each foundSuppliers as prov}
            <button
              onclick={() => selectSupplier(prov)}
              class="w-full text-left p-3.5 rounded-2xl bg-surface-soft/60 hover:bg-surface-strong border border-border-subtle/50 transition-all flex items-center justify-between group cursor-pointer"
            >
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-bold text-text-base group-hover:text-brand-400 transition-colors">
                    {prov.prov_des || prov.descripcion}
                  </span>
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-strong border border-border-subtle text-text-muted">
                    {prov.co_prov}
                  </span>
                </div>
                <div class="text-[11px] text-text-muted flex gap-4">
                  <span>RIF: <strong class="text-text-base font-mono">{prov.rif || 'N/A'}</strong></span>
                  {#if prov.telefonos}
                    <span>Tlf: {prov.telefonos}</span>
                  {/if}
                </div>
              </div>
              <ChevronDown size={16} class="text-text-muted -rotate-90 group-hover:text-brand-400 transition-transform" />
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
