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
    CheckCircle2
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

  $effect(() => {
    if (data.selectedBranchId) filterSede = data.selectedBranchId;
    if (data.activeRate) activeTasa = data.activeRate;
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
  let baseImponibleInput = $state<number>(0);
  let montoExentoInput = $state<number>(0);
  let alicuotaIva = $state<number>(16);
  let customIvaOverride = $state<number | null>(null);

  // Status & Submit
  let isSavingDocument = $state(false);
  let saveSuccess = $state(false);
  let savedDocNum = $state("");
  let savedNroFact = $state("");
  let savedTipoDoc = $state("");
  let savedTotalNeto = $state(0);

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

  // Auto calculate Due Date when Payment Condition changes
  $effect(() => {
    if (docMetadata.co_cond && data.paymentConditions) {
      const cond = data.paymentConditions.find(
        (c: any) => c.co_cond?.trim() === docMetadata.co_cond?.trim()
      );
      if (cond && cond.dias_cred != null) {
        const days = Number(cond.dias_cred) || 0;
        docMetadata.fec_venc = dayjs(docMetadata.fec_emis).add(days, "day").format("YYYY-MM-DD");
      }
    }
  });

  // Financial Calculations
  const calculatedTotals = $derived.by(() => {
    const rate = Number(activeTasa || 1);
    const base = Number(baseImponibleInput) || 0;
    const exento = Number(montoExentoInput) || 0;
    const pIva = Number(alicuotaIva) || 0;

    let baseUSD = 0;
    let baseBS = 0;
    let exentoUSD = 0;
    let exentoBS = 0;

    if (showUSD) {
      baseUSD = base;
      baseBS = base * rate;
      exentoUSD = exento;
      exentoBS = exento * rate;
    } else {
      baseBS = base;
      baseUSD = rate > 0 ? base / rate : 0;
      exentoBS = exento;
      exentoUSD = rate > 0 ? exento / rate : 0;
    }

    let ivaUSD = 0;
    let ivaBS = 0;

    if (customIvaOverride !== null && customIvaOverride >= 0) {
      if (showUSD) {
        ivaUSD = customIvaOverride;
        ivaBS = customIvaOverride * rate;
      } else {
        ivaBS = customIvaOverride;
        ivaUSD = rate > 0 ? customIvaOverride / rate : 0;
      }
    } else {
      ivaUSD = baseUSD * (pIva / 100);
      ivaBS = baseBS * (pIva / 100);
    }

    const totalUSD = baseUSD + exentoUSD + ivaUSD;
    const totalBS = baseBS + exentoBS + ivaBS;

    return {
      rate,
      baseUSD,
      baseBS,
      exentoUSD,
      exentoBS,
      ivaUSD,
      ivaBS,
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

  function switchCurrency(toUSD: boolean) {
    if (showUSD === toUSD) return;
    const rate = Number(activeTasa || 1);
    if (toUSD) {
      // Switching from BS to USD
      baseImponibleInput = rate > 0 ? Math.round((baseImponibleInput / rate) * 100) / 100 : 0;
      montoExentoInput = rate > 0 ? Math.round((montoExentoInput / rate) * 100) / 100 : 0;
      if (customIvaOverride !== null) {
        customIvaOverride = rate > 0 ? Math.round((customIvaOverride / rate) * 100) / 100 : 0;
      }
    } else {
      // Switching from USD to BS
      baseImponibleInput = Math.round((baseImponibleInput * rate) * 100) / 100;
      montoExentoInput = Math.round((montoExentoInput * rate) * 100) / 100;
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
    }

    showSupplierModal = false;
    toast.success(`Proveedor seleccionado: ${selectedSupplier.prov_des}`);
  }

  function resetForm() {
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
    baseImponibleInput = 0;
    montoExentoInput = 0;
    customIvaOverride = null;
    saveSuccess = false;
    savedDocNum = "";
    savedNroFact = "";
  }

  async function handleRegisterDocument() {
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
      // In Profit Plus, direct purchase documents are saved in national currency (BS) with the active tasa
      const documentPayload = {
        co_tipo_doc: docMetadata.co_tipo_doc,
        nro_fact: nroFactClean,
        n_control: (docMetadata.n_control || "N/A").trim() || "N/A",
        co_prov: selectedSupplier.co_prov,
        co_mone: "BS",
        tasa: calculatedTotals.rate,
        total_bruto: calculatedTotals.baseBS,
        otros1: calculatedTotals.exentoBS,
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

      const res = await fetch("/api/agent/documentos-compra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: filterSede,
          document: documentPayload
        })
      });

      const result = await res.json();
      if (result.success !== false) {
        savedDocNum = result.doc_num || result.nro_doc || "";
        savedNroFact = nroFactClean;
        savedTipoDoc = docMetadata.co_tipo_doc;
        savedTotalNeto = calculatedTotals.totalBS;
        saveSuccess = true;
        toast.success(`Documento ${savedTipoDoc} ${savedDocNum} registrado con éxito.`);
      } else {
        toast.error(result.message || "Error al registrar el documento.");
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
      <h2 class="text-3xl font-black text-text-base">¡Documento Registrado!</h2>
      <p class="text-text-muted text-sm">
        El documento de compra ha sido registrado exitosamente en Profit Plus (Cuentas por Pagar).
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
        <span class="text-text-muted font-medium">Monto Total Registrado:</span>
        <span class="font-mono font-bold text-text-base">
          Bs. {savedTotalNeto.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
    </div>

    <div class="flex gap-4 w-full">
      <a
        href="/dashboard/purchases/documents/history?branch_id={filterSede}"
        class="flex-1 text-center bg-surface-soft hover:bg-surface-strong text-text-base px-6 py-3.5 rounded-2xl font-bold transition-all text-sm flex items-center justify-center border border-border-subtle"
      >
        Ver Historial
      </a>
      <button
        onclick={resetForm}
        class="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-brand-500/20 text-sm cursor-pointer"
      >
        Registrar Otro
      </button>
    </div>
  </div>
{:else}
  <!-- MAIN PURCHASE DOCUMENT INTERFACE -->
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
    <!-- TOP HEADER -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
          <FileSpreadsheet size={40} class="text-brand-500" />
          Documentos de Compra
        </h1>
        <p class="text-text-muted mt-2 text-base">
          Registro directo de facturas, notas de crédito y notas de débito de proveedores en Cuentas por Pagar.
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

        <!-- Rate pill -->
        <div class="flex items-center gap-2 px-4 h-14 rounded-2xl bg-surface-soft border border-border-subtle text-xs font-semibold shrink-0">
          <span class="text-text-muted">Tasa BCV:</span>
          <span class="font-mono font-bold text-brand-400">
            Bs. {Number(activeTasa).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </span>
        </div>

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
                class="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 text-xs font-bold transition-all cursor-pointer shadow-sm"
              >
                <Search size={14} />
                Buscar Proveedor
              </button>
            </div>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 bg-surface-soft p-5 rounded-2xl border border-border-subtle">
              <div class="space-y-1">
                <span class="text-[10px] text-text-muted uppercase font-bold tracking-wider">Razón Social</span>
                <p class="text-sm font-bold text-text-base line-clamp-1">{selectedSupplier.prov_des}</p>
                <span class="text-xs text-text-muted font-mono">{selectedSupplier.co_prov}</span>
              </div>
              <div class="space-y-1">
                <span class="text-[10px] text-text-muted uppercase font-bold tracking-wider">RIF / Cédula</span>
                <p class="text-sm font-mono font-bold text-brand-400">{selectedSupplier.rif || 'N/A'}</p>
              </div>
              <div class="space-y-1">
                <span class="text-[10px] text-text-muted uppercase font-bold tracking-wider">Dirección / Teléfono</span>
                <p class="text-xs text-text-muted line-clamp-2">{selectedSupplier.direc1 || 'Sin dirección registrada'}</p>
              </div>
            </div>
          {/if}
        </div>

        <!-- 2. DOCUMENT METADATA CARD -->
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
                class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-semibold focus:border-brand-500 outline-none cursor-pointer"
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
                class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-medium focus:border-brand-500 outline-none cursor-pointer"
              />
            </div>

            <!-- Condición de Pago -->
            <div>
              <label for="co_cond" class="text-xs font-bold text-text-muted block mb-1.5">Condición de Pago</label>
              <select
                id="co_cond"
                bind:value={docMetadata.co_cond}
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

        <!-- 3. AMOUNTS & TAX INPUT CARD -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
              <Calculator size={16} />
              Montos e Impuestos
            </h3>

            <!-- USD / BS TOGGLE (Idéntico a Factura de Compras) -->
            <div class="inline-flex p-1 bg-surface-soft rounded-xl border border-border-subtle self-start sm:self-auto">
              <button
                type="button"
                onclick={() => switchCurrency(true)}
                class="px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer {showUSD ? 'bg-brand-500 text-white shadow' : 'text-text-muted hover:text-text-base'}"
              >
                Dólares ($)
              </button>
              <button
                type="button"
                onclick={() => switchCurrency(false)}
                class="px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer {!showUSD ? 'bg-brand-500 text-white shadow' : 'text-text-muted hover:text-text-base'}"
              >
                Bolívares (Bs.)
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            <!-- Base Imponible -->
            <div class="bg-surface-soft/60 p-4 rounded-2xl border border-border-subtle space-y-2">
              <div class="flex justify-between items-center">
                <label for="base_imp" class="text-xs font-bold text-text-base">
                  Base Gravada ({alicuotaIva}%)
                </label>
                <span class="text-[11px] font-mono text-text-muted">
                  {showUSD ? `≈ Bs. ${calculatedTotals.baseBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `≈ $ ${calculatedTotals.baseUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
              </div>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">
                  {showUSD ? '$' : 'Bs.'}
                </span>
                <input
                  id="base_imp"
                  type="number"
                  step="0.01"
                  min="0"
                  bind:value={baseImponibleInput}
                  class="w-full h-12 pl-10 pr-3 bg-surface-soft border border-border-subtle rounded-xl text-base font-mono font-bold focus:border-brand-500 outline-none"
                />
              </div>
            </div>

            <!-- Monto Exento -->
            <div class="bg-surface-soft/60 p-4 rounded-2xl border border-border-subtle space-y-2">
              <div class="flex justify-between items-center">
                <label for="exento" class="text-xs font-bold text-text-base">
                  Monto Exento (No Gravado)
                </label>
                <span class="text-[11px] font-mono text-text-muted">
                  {showUSD ? `≈ Bs. ${calculatedTotals.exentoBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `≈ $ ${calculatedTotals.exentoUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
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
                  class="w-full h-12 pl-10 pr-3 bg-surface-soft border border-border-subtle rounded-xl text-base font-mono font-bold focus:border-brand-500 outline-none"
                />
              </div>
            </div>

            <!-- Alícuota y Monto IVA -->
            <div class="bg-surface-soft/60 p-4 rounded-2xl border border-border-subtle space-y-2">
              <div class="flex justify-between items-center">
                <label for="iva_monto" class="text-xs font-bold text-text-base">
                  Impuesto IVA
                </label>
                <div class="flex items-center gap-1">
                  <span class="text-[10px] text-text-muted font-bold">Alícuota:</span>
                  <select
                    bind:value={alicuotaIva}
                    class="h-6 px-1.5 bg-surface-soft border border-border-subtle rounded text-[11px] font-bold cursor-pointer"
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
                  class="w-full h-12 pl-10 pr-3 bg-surface-soft border border-border-subtle rounded-xl text-base font-mono font-bold focus:border-brand-500 outline-none"
                />
              </div>
              <div class="flex justify-between items-center text-[11px] text-text-muted">
                <span>Calculado automáticamente</span>
                <span class="font-mono">
                  {showUSD ? `≈ Bs. ${calculatedTotals.ivaBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `≈ $ ${calculatedTotals.ivaUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
              </div>
            </div>

            <!-- Total Calculado Vista Previa -->
            <div class="bg-brand-500/5 p-4 rounded-2xl border border-brand-500/20 flex flex-col justify-between">
              <div>
                <span class="text-[10px] text-brand-400 font-bold uppercase tracking-wider">Total Neto del Documento</span>
                <div class="text-2xl font-black font-mono text-brand-400 mt-1">
                  {showUSD ? `$ ${calculatedTotals.totalUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `Bs. ${calculatedTotals.totalBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </div>
              </div>
              <div class="text-xs text-text-muted font-mono pt-2 border-t border-brand-500/10 flex justify-between">
                <span>Equivalente oficial:</span>
                <span class="font-bold text-text-base">
                  {showUSD ? `Bs. ${calculatedTotals.totalBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$ ${calculatedTotals.totalUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN: FINANCIAL SUMMARY & ACTIONS (1 COL) -->
      <div class="space-y-6">
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-6 sticky top-6">
          <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
            <Calculator size={16} />
            Resumen Financiero
          </h3>

          <div class="space-y-3.5 divide-y divide-border-subtle/50 text-sm">
            <div class="flex justify-between items-center pt-2">
              <span class="text-text-muted">Base Imponible:</span>
              <div class="text-right">
                <div class="font-mono font-bold text-text-base">
                  $ {calculatedTotals.baseUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div class="text-xs text-text-muted font-mono">
                  Bs. {calculatedTotals.baseBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div class="flex justify-between items-center pt-2">
              <span class="text-text-muted">Monto Exento:</span>
              <div class="text-right">
                <div class="font-mono font-bold text-text-base">
                  $ {calculatedTotals.exentoUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div class="text-xs text-text-muted font-mono">
                  Bs. {calculatedTotals.exentoBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div class="flex justify-between items-center pt-2">
              <span class="text-text-muted">IVA ({alicuotaIva}%):</span>
              <div class="text-right">
                <div class="font-mono font-bold text-text-base">
                  $ {calculatedTotals.ivaUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div class="text-xs text-text-muted font-mono">
                  Bs. {calculatedTotals.ivaBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div class="flex justify-between items-baseline pt-4">
              <span class="text-base font-black text-text-base">Total a Pagar:</span>
              <div class="text-right">
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
          <div class="space-y-3 pt-2">
            <button
              onclick={handleRegisterDocument}
              disabled={isSavingDocument || calculatedTotals.totalBS <= 0}
              class="w-full h-14 rounded-2xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-bold transition-all shadow-lg shadow-brand-500/20 active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {#if isSavingDocument}
                <Loader2 size={18} class="animate-spin" />
                Registrando en Profit...
              {:else}
                <Check size={18} />
                Registrar Documento
              {/if}
            </button>

            <button
              onclick={resetForm}
              type="button"
              class="w-full h-11 rounded-xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base text-xs font-bold transition-all border border-border-subtle cursor-pointer"
            >
              Limpiar Formulario
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

