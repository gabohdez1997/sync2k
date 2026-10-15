<!-- src/routes/dashboard/cash/credits/+page.svelte -->
<script lang="ts">
  import { fade, slide, scale } from "svelte/transition";
  import {
    RotateCcw,
    Search,
    Receipt,
    Plus,
    Trash2,
    User,
    Store,
    ChevronLeft,
    ChevronDown,
    Check,
    Loader2,
    Clock,
    History,
    AlertTriangle,
    CheckCircle2,
    X,
    Filter,
    ArrowRight,
    DollarSign,
    Package,
    Eye,
    Ban,
    RefreshCw,
    FileText,
    Percent,
    Calendar,
    Sparkles,
    ShoppingBag,
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import dayjs from "dayjs";
  import ImportItemCard from "$lib/components/ui/ImportItemCard.svelte";

  let { data } = $props();

  // Branch & Active Mode State
  let filterSede = $state(data.selectedBranchId || "");
  let activeTab = $state<"create" | "history">("create");

  // Currency & Rate State
  let showUSD = $state(true);
  let activeTasa = $state(1);
  let isLoadingTasa = $state(false);

  // Return Form State
  let selectedInvoice = $state<any>(null);
  let returnLines = $state<any[]>([]);
  let comentarioDevolucion = $state("");
  let isSavingReturn = $state(false);
  let saveSuccess = $state(false);
  let generatedResult = $state<any>(null);

  // Search/Import Modal State
  let showImportModal = $state(false);
  let importSearchQuery = $state("");
  let isSearchingInvoices = $state(false);
  let foundInvoices = $state<any[]>([]);
  let isLoadingInvoiceDetail = $state(false);

  // History State
  let historyList = $state<any[]>([]);
  let isLoadingHistory = $state(false);
  let historySearchQuery = $state("");
  let historyPage = $state(1);
  let historyTotalPages = $state(1);
  let historyTotalCount = $state(0);

  // History Detail Modal State
  let showDetailModal = $state(false);
  let selectedDetailDev = $state<any>(null);
  let isLoadingDetail = $state(false);

  // Voiding State
  let showVoidConfirmModal = $state(false);
  let devToVoid = $state<any>(null);
  let isVoiding = $state(false);

  // Fetch exchange rate on branch change or mount
  async function loadBranchRate(branchId: string) {
    if (!branchId) return;
    isLoadingTasa = true;
    try {
      const res = await fetch(`/api/agent/tasa?branch_id=${branchId}`);
      const json = await res.json();
      if (json.success && json.tasa) {
        activeTasa = Number(json.tasa);
      }
    } catch (e: any) {
      console.warn("Error loading rate:", e.message);
    } finally {
      isLoadingTasa = false;
    }
  }

  $effect(() => {
    if (filterSede) {
      loadBranchRate(filterSede);
      if (activeTab === "history") {
        loadHistory(1);
      }
    }
  });

  function handleBranchChange() {
    const params = new URLSearchParams($page.url.searchParams);
    if (filterSede) params.set("branch_id", filterSede);
    else params.delete("branch_id");
    goto(`?${params.toString()}`);
  }

  function toggleCurrency(val: boolean) {
    showUSD = val;
  }

  // --- CALCULATION LOGIC ---
  const totals = $derived.by(() => {
    let subtotalUSD = 0;
    let taxUSD = 0;

    for (const line of returnLines) {
      if (line.checked && Number(line.cantidad_devolver) > 0) {
        const qty = Number(line.cantidad_devolver || 0);
        const priceUSD = Number(line.precio_usd || 0);
        const pImp = Number(line.porc_imp || 0);

        const lineNeto = qty * priceUSD;
        const lineTax = (lineNeto * pImp) / 100;

        subtotalUSD += lineNeto;
        taxUSD += lineTax;
      }
    }

    const tasa = activeTasa > 0 ? activeTasa : 1;
    const subtotalBs = subtotalUSD * tasa;
    const taxBs = taxUSD * tasa;

    // Calcular IGTF proporcional si la factura original tenía IGTF
    const facOtros1 = Number(selectedInvoice?.otros1 || 0);
    const facBruto = Number(selectedInvoice?.total_bruto || 0);
    let igtfBs = 0;
    if (facOtros1 > 0 && facBruto > 0) {
      const ratio = Math.min(1, Math.max(0, subtotalBs / facBruto));
      if (ratio >= 0.9999 || Math.abs(subtotalBs - facBruto) <= 0.05) {
        igtfBs = facOtros1;
      } else {
        igtfBs = Math.round((facOtros1 * ratio) * 100) / 100;
      }
    }
    const igtfUSD = igtfBs / tasa;

    const totalUSD = subtotalUSD + taxUSD + igtfUSD;
    const totalBs = subtotalBs + taxBs + igtfBs;

    return {
      subtotalUSD,
      taxUSD,
      igtfUSD,
      totalUSD,
      subtotalBs,
      taxBs,
      igtfBs,
      totalBs,
      activeSubtotal: showUSD ? subtotalUSD : subtotalBs,
      activeTax: showUSD ? taxUSD : taxBs,
      activeIgtf: showUSD ? igtfUSD : igtfBs,
      activeTotal: showUSD ? totalUSD : totalBs,
      symbol: showUSD ? "$" : "Bs",
    };
  });

  const checkedLinesCount = $derived(
    returnLines.filter((l) => l.checked && Number(l.cantidad_devolver) > 0).length,
  );

  const hasInvalidQuantities = $derived(
    returnLines.some(
      (l) =>
        l.checked &&
        (Number(l.cantidad_devolver) > Number(l.disponible) ||
          Number(l.cantidad_devolver) <= 0),
    ),
  );

  // --- SEARCH INVOICES MODAL ---
  let searchDebounceTimer: any = null;

  function getBranchName(id: string) {
    const b = data.branches?.find((br: any) => br.id === id);
    return b ? b.name : "Desconocida";
  }

  function handleImportSearchInput() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchInvoices();
    }, 250);
  }

  async function openImportModal() {
    if (!filterSede) {
      toast.error("Seleccione una sucursal primero");
      return;
    }
    showImportModal = true;
    importSearchQuery = "";
    foundInvoices = [];
    searchInvoices();
  }

  async function searchInvoices() {
    if (!filterSede) {
      toast.error("Seleccione una sucursal primero");
      return;
    }
    isSearchingInvoices = true;
    foundInvoices = [];

    try {
      const q = encodeURIComponent(importSearchQuery.trim());
      // ONLY NON-VOIDED INVOICES (anulado=0)
      const res = await fetch(
        `/api/agent/facturas?branch_id=${filterSede}&search=${q}&anulado=0&limit=25`,
      );
      const json = await res.json();

      if (json.success) {
        foundInvoices = json.data || [];
      } else {
        toast.error(json.message || "Error al buscar facturas.");
      }
    } catch (err: any) {
      toast.error("Error de red: " + err.message);
    } finally {
      isSearchingInvoices = false;
    }
  }

  async function selectAndLoadInvoice(docNumToLoad: string) {
    if (!docNumToLoad || !filterSede) return;
    isLoadingInvoiceDetail = true;

    try {
      const res = await fetch(
        `/api/agent/facturas/${encodeURIComponent(docNumToLoad.trim())}?branch_id=${filterSede}`,
      );
      const json = await res.json();

      if (json.success && json.data && json.data.length > 0) {
        const fac = json.data[0];

        // Validar que la factura NO esté anulada
        if (fac.anulado) {
          toast.error(`La factura ${fac.doc_num} se encuentra anulada. No se pueden procesar devoluciones.`);
          return;
        }

        const lines = fac.renglones || [];
        const facTasa = Number(fac.tasa || 1);
        const resolvedTasa = facTasa > 1 ? facTasa : Number(fac.tasa_actual || activeTasa || 1);
        if (resolvedTasa > 1) {
          activeTasa = resolvedTasa;
        }

        let hasAvailableItems = false;

        const mappedLines = lines.map((l: any, idx: number) => {
          const totalArt = Number(l.cantidad || 0);
          const totalDev = Number(l.total_dev || 0);
          const disponible = Math.max(0, totalArt - totalDev);

          if (disponible > 0) {
            hasAvailableItems = true;
          }

          // Calculate USD unit price
          const priceUSD =
            Number(l.prec_vta_om || 0) > 0
              ? Number(l.prec_vta_om)
              : Number(l.precio || 0) / (resolvedTasa > 0 ? resolvedTasa : 1);

          return {
            reng_num: l.reng_num || idx + 1,
            co_art: (l.co_art || "").trim(),
            art_des: (l.art_des || "").trim(),
            co_alma: (l.co_alma || "01").trim(),
            co_uni: (l.co_uni || "01").trim(),
            unidad: (l.unidad || l.co_uni || "UND").trim(),
            co_precio: (l.co_precio || "01").trim(),
            tipo_imp: l.tipo_imp || "1",
            porc_imp: Number(l.porc_imp || 0),
            cantidad_facturada: totalArt,
            total_dev: totalDev,
            disponible: disponible,
            cantidad_devolver: disponible, // default to all available
            precio_usd: priceUSD,
            precio_bs: priceUSD * resolvedTasa,
            rowguid: l.rowguid,
            checked: disponible > 0,
            hasError: false,
          };
        });

        if (!hasAvailableItems) {
          toast.error(`La factura ${fac.doc_num} ya tiene todos sus artículos devueltos al 100%.`);
          return;
        }

        selectedInvoice = fac;
        returnLines = mappedLines;
        comentarioDevolucion = `Devolución s/ Factura N° ${fac.doc_num.trim()}`;
        showImportModal = false;
        toast.success(`Factura ${fac.doc_num.trim()} cargada exitosamente.`);
      } else {
        toast.error(json.message || "No se pudo obtener el detalle de la factura.");
      }
    } catch (err: any) {
      toast.error("Error al cargar factura: " + err.message);
    } finally {
      isLoadingInvoiceDetail = false;
    }
  }

  // --- QUANTITY ADJUSTMENT & VALIDATION (ESTILO NOTAS DE RECEPCIÓN) ---
  function updateReturnQty(line: any, val: number, inputEl?: HTMLInputElement | null) {
    if (!line || line.disponible <= 0) return;
    const maxAllowed = Number(line.disponible || 0);
    let clamped = Math.max(0, isNaN(val) ? 0 : val);
    if (maxAllowed > 0 && clamped > maxAllowed) {
      clamped = maxAllowed;
      toast.warning(
        `La cantidad no puede superar lo facturado disponible (${maxAllowed}).`
      );
    }
    line.cantidad_devolver = clamped;
    line.checked = clamped > 0;

    if (inputEl) {
      inputEl.value = String(clamped);
    }
  }

  function handleRowCheckbox(line: any, event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const isChecked = target.checked;
    line.checked = isChecked;
    if (isChecked) {
      if (Number(line.cantidad_devolver || 0) <= 0) {
        line.cantidad_devolver = Number(line.disponible || 1);
      }
    } else {
      line.cantidad_devolver = 0;
    }
  }

  function handleMasterCheckbox() {
    const allChecked =
      returnLines.length > 0 &&
      returnLines
        .filter((l) => l.disponible > 0)
        .every((l) => l.checked && Number(l.cantidad_devolver) > 0);
    const newChecked = !allChecked;
    returnLines.forEach((l) => {
      if (l.disponible > 0) {
        l.checked = newChecked;
        l.cantidad_devolver = newChecked ? l.disponible : 0;
      }
    });
  }



  function removeLine(idx: number) {
    returnLines = returnLines.filter((_, i) => i !== idx);
    if (returnLines.length === 0) {
      resetForm();
    }
  }

  function resetForm() {
    selectedInvoice = null;
    returnLines = [];
    comentarioDevolucion = "";
    saveSuccess = false;
    generatedResult = null;
  }

  // --- SAVE RETURN ---
  async function handleSaveReturn() {
    if (!data.permissions?.canCreate) {
      toast.error("No tienes permisos para crear devoluciones.");
      return;
    }

    if (!selectedInvoice) {
      toast.error("Debe cargar una factura primero.");
      return;
    }

    const activeLines = returnLines.filter(
      (l) => l.checked && Number(l.cantidad_devolver) > 0,
    );

    if (activeLines.length === 0) {
      toast.error("Debe seleccionar al menos un artículo con cantidad mayor a cero.");
      return;
    }

    if (hasInvalidQuantities) {
      toast.error("Hay renglones con cantidades inválidas o que superan lo facturado.");
      return;
    }

    isSavingReturn = true;

    try {
      const creditPayload = {
        co_cli: selectedInvoice.co_cli,
        factura_origen: selectedInvoice.doc_num.trim(),
        descrip: `DEV. FACT ${selectedInvoice.doc_num.trim()}`.substring(0, 60),
        comentario: comentarioDevolucion.trim() || `Devolución s/ Factura N° ${selectedInvoice.doc_num.trim()}`,
        co_ven: selectedInvoice.co_ven,
        co_cond: selectedInvoice.co_cond,
        co_tran: selectedInvoice.co_tran,
        tasa: activeTasa,
        renglones: activeLines.map((l) => ({
          co_art: l.co_art,
          art_des: l.art_des,
          co_alma: l.co_alma,
          co_uni: l.co_uni,
          co_precio: l.co_precio,
          tipo_imp: l.tipo_imp,
          porc_imp: l.porc_imp,
          cantidad: Number(l.cantidad_devolver),
          precio: Number(l.precio_usd),
          num_doc: selectedInvoice.doc_num.trim(),
          rowguid_doc: l.rowguid,
        })),
      };

      const res = await fetch("/api/agent/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: filterSede,
          credit: creditPayload,
        }),
      });

      const json = await res.json();

      if (json.success) {
        toast.success(
          json.message || `Devolución registrada con éxito: ${json.data?.doc_num}`,
        );
        generatedResult = json.data;
        saveSuccess = true;
      } else {
        toast.error(json.message || "Error al procesar la devolución.");
      }
    } catch (err: any) {
      toast.error("Error de servidor: " + err.message);
    } finally {
      isSavingReturn = false;
    }
  }

  // --- HISTORY MANAGEMENT ---
  async function loadHistory(page = 1) {
    if (!filterSede) return;
    isLoadingHistory = true;
    historyPage = page;

    try {
      const q = encodeURIComponent(historySearchQuery.trim());
      const res = await fetch(
        `/api/agent/credits?branch_id=${filterSede}&search=${q}&page=${page}&limit=15`,
      );
      const json = await res.json();

      if (json.success) {
        historyList = json.data || [];
        if (json.pagination) {
          historyTotalPages = json.pagination.pages || 1;
          historyTotalCount = json.pagination.total || historyList.length;
        } else {
          historyTotalPages = 1;
          historyTotalCount = historyList.length;
        }
      } else {
        toast.error(json.message || "Error al cargar historial de devoluciones.");
      }
    } catch (err: any) {
      toast.error("Error de conexión: " + err.message);
    } finally {
      isLoadingHistory = false;
    }
  }

  async function openDevDetail(dev: any) {
    selectedDetailDev = dev;
    showDetailModal = true;
    isLoadingDetail = true;

    try {
      const res = await fetch(
        `/api/agent/credits/${encodeURIComponent(dev.doc_num.trim())}?branch_id=${filterSede}`,
      );
      const json = await res.json();

      if (json.success && json.data && json.data.length > 0) {
        selectedDetailDev = json.data[0];
      }
    } catch (e: any) {
      toast.error("Error al cargar detalle: " + e.message);
    } finally {
      isLoadingDetail = false;
    }
  }

  function promptVoidDev(dev: any) {
    if (!data.permissions?.canVoid) {
      toast.error("No tienes permisos para anular devoluciones.");
      return;
    }
    if (dev.anulado) {
      toast.warning("Esta devolución ya se encuentra anulada.");
      return;
    }
    devToVoid = dev;
    showVoidConfirmModal = true;
  }

  async function confirmVoidDev() {
    if (!devToVoid) return;
    isVoiding = true;

    try {
      const res = await fetch(
        `/api/agent/credits/${encodeURIComponent(devToVoid.doc_num.trim())}/void?branch_id=${filterSede}`,
        { method: "POST" },
      );
      const json = await res.json();

      if (json.success) {
        toast.success(`Devolución ${devToVoid.doc_num.trim()} anulada con éxito.`);
        showVoidConfirmModal = false;
        devToVoid = null;
        if (showDetailModal) {
          showDetailModal = false;
        }
        loadHistory(historyPage);
      } else {
        toast.error(json.message || "Error al anular devolución.");
      }
    } catch (err: any) {
      toast.error("Error de red: " + err.message);
    } finally {
      isVoiding = false;
    }
  }
</script>

{#if saveSuccess}
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
      <h2 class="text-3xl font-black text-text-base">¡Devolución Procesada!</h2>
      <p class="text-text-muted">
        La devolución de mercancía y la Nota de Crédito han sido generadas exitosamente en Profit Plus.
      </p>
    </div>

    <div class="grid grid-cols-2 gap-4 w-full">
      <div class="bg-white/5 p-4 rounded-2xl border border-white/5">
        <span class="text-xs text-text-muted/60 uppercase font-bold tracking-wider">Devolución N°</span>
        <div class="text-xl font-black text-brand-500 mt-1 font-mono">
          {generatedResult?.doc_num}
        </div>
      </div>
      <div class="bg-white/5 p-4 rounded-2xl border border-white/5">
        <span class="text-xs text-text-muted/60 uppercase font-bold tracking-wider">Nota de Crédito N°</span>
        <div class="text-xl font-black text-emerald-400 mt-1 font-mono">
          {generatedResult?.nro_doc}
        </div>
      </div>
    </div>

    <div class="flex gap-4 w-full">
      <button
        onclick={() => {
          saveSuccess = false;
          activeTab = "history";
          loadHistory(1);
        }}
        class="flex-1 text-center bg-white/5 hover:bg-white/10 text-text-base px-6 py-3.5 rounded-2xl font-bold transition-all text-sm flex items-center justify-center border border-white/10 cursor-pointer"
      >
        Ver Historial
      </button>
      <button
        onclick={resetForm}
        class="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-brand-500/20 text-sm cursor-pointer"
      >
        Nueva Devolución
      </button>
    </div>
  </div>
{:else}
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
    <!-- TOP HEADER -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
          <RotateCcw size={40} class="text-brand-500" />
          Devolución de Venta
        </h1>
        <p class="text-text-muted mt-2 text-lg">
          Importación de facturas y emisión de notas de crédito.
        </p>
      </div>

      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
        <!-- Sede Selector -->
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
              {#each data.branches as branch}
                <option value={branch.id}>{branch.name}</option>
              {/each}
            </select>
            <ChevronDown
              size={16}
              class="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
          </div>
        {/if}

        {#if activeTab === "create"}
          <button
            onclick={openImportModal}
            class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto"
          >
            <Receipt size={18} />
            Importar Factura
          </button>

          <button
            onclick={() => {
              activeTab = "history";
              loadHistory(1);
            }}
            class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-surface-strong hover:bg-surface-base text-text-base border border-border-subtle transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto"
          >
            <Clock size={18} class="text-brand-400" />
            Ver Historial
          </button>
        {:else}
          <button
            onclick={() => (activeTab = "create")}
            class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white transition-all font-bold active:scale-95 shadow-lg shadow-brand-500/20 shrink-0 cursor-pointer w-full sm:w-auto"
          >
            <RotateCcw size={18} />
            Volver a Devolución
          </button>
        {/if}
      </div>
    </div>

    <!-- MAIN CONTENT AREA -->
    {#if activeTab === "create"}
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <!-- LEFT/CENTER: CLIENT INFO & LINES -->
        <div class="xl:col-span-2 space-y-6">
          <!-- CLIENT INFO BOX -->
          <div
            class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-4"
          >
            <h3
              class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2"
            >
              <User size={16} />
              Datos del Cliente
            </h3>

            {#if !selectedInvoice}
              <div
                class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-2"
              >
                <User size={32} class="text-text-muted/30" />
                <p class="text-xs text-text-muted font-bold">
                  No hay ninguna factura cargada. Haz clic en "Importar Factura" para
                  iniciar.
                </p>
              </div>
            {:else}
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4" in:slide>
                <div class="md:col-span-2 space-y-1">
                  <span
                    class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                    >Nombre / Razón Social</span
                  >
                  <p class="text-base font-black text-text-base">
                    {selectedInvoice.cli_des || selectedInvoice.co_cli}
                  </p>
                </div>
                <div class="space-y-1">
                  <span
                    class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                    >RIF / CI</span
                  >
                  <p class="text-base font-bold font-mono text-text-base">
                    {selectedInvoice.rif || "---"}
                  </p>
                </div>
                <div class="md:col-span-2 space-y-1">
                  <span
                    class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                    >Dirección</span
                  >
                  <p class="text-xs text-text-muted font-bold leading-relaxed">
                    {selectedInvoice.direc1 || "---"}
                  </p>
                </div>
                <div class="space-y-1">
                  <span
                    class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                    >Teléfono</span
                  >
                  <p class="text-xs text-text-muted font-bold font-mono">
                    {selectedInvoice.telefonos || "---"}
                  </p>
                </div>
                <div class="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-border-subtle/30">
                  <div class="space-y-1">
                    <span
                      class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                      >Factura Origen</span
                    >
                    <p class="text-xs font-black text-brand-400 font-mono">
                      {selectedInvoice.doc_num.trim()}
                      <span class="text-[10px] text-text-muted font-normal font-sans ml-1">
                        ({dayjs(selectedInvoice.fec_emis).format("DD/MM/YYYY")})
                      </span>
                    </p>
                  </div>
                  <div class="space-y-1">
                    <span
                      class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                      >Vendedor</span
                    >
                    <p class="text-xs font-bold text-text-base">
                      {selectedInvoice.ven_des || selectedInvoice.co_ven || "Sin asignar"}
                    </p>
                  </div>
                  <div class="space-y-1">
                    <span
                      class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                      >Condición</span
                    >
                    <p class="text-xs font-bold text-text-base">
                      {selectedInvoice.cond_des || selectedInvoice.co_cond || "Contado"}
                    </p>
                  </div>
                </div>

                {#if Number(selectedInvoice.otros1 || 0) > 0}
                  <div class="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-2.5">
                      <div class="h-7 w-7 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                        <AlertTriangle size={15} class="text-amber-500" />
                      </div>
                      <div>
                        <p class="text-amber-300 font-bold">Factura con IGTF (3%) Incluido</p>
                        <p class="text-[11px] text-amber-400/80 font-mono">
                          Monto IGTF Original: ${(Number(selectedInvoice.otros1) / Number(selectedInvoice.tasa || 1)).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span class="text-text-muted">({Number(selectedInvoice.otros1).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs)</span>
                        </p>
                      </div>
                    </div>
                    <span class="text-[10px] uppercase font-black text-amber-400 bg-amber-500/20 px-2.5 py-1 rounded-xl border border-amber-500/30">
                      Abono automático en Nota de Crédito
                    </span>
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <!-- RETURN LINES TABLE -->
          <div
            class="glass border border-border-subtle rounded-3xl shadow-xl overflow-hidden"
          >
            <div
              class="p-6 border-b border-border-subtle bg-surface-soft/40 flex items-center justify-between"
            >
              <h3
                class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2"
              >
                <ShoppingBag size={16} />
                Artículos a Devolver
              </h3>
            </div>

            {#if returnLines.length === 0}
              <div
                class="p-20 text-center flex flex-col items-center justify-center gap-3"
              >
                <ShoppingBag size={48} class="text-text-muted/30 animate-pulse" />
                <h4 class="text-lg font-bold text-text-muted">Devolución vacía</h4>
                <p class="text-xs text-text-muted/50 max-w-xs">
                  Los artículos importados de la factura seleccionada aparecerán aquí.
                </p>
              </div>
            {:else}
              <div class="overflow-x-auto" in:slide>
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr
                      class="bg-surface-strong border-b border-border-subtle text-xs font-black uppercase tracking-wider text-text-muted"
                    >
                      <th class="px-6 py-4 w-12 text-center">
                        <label class="group relative inline-flex items-center cursor-pointer justify-center" title="Seleccionar Todos">
                          <input
                            type="checkbox"
                            checked={returnLines.length > 0 && returnLines.filter(l => l.disponible > 0).every((l) => l.checked && Number(l.cantidad_devolver) > 0)}
                            onchange={handleMasterCheckbox}
                            class="sr-only peer"
                          />
                          <div
                            class="w-6 h-6 bg-surface-base border-2 border-border-subtle rounded-lg peer-checked:bg-brand-500 peer-checked:border-brand-500 transition-all flex items-center justify-center shadow-inner group-hover:border-brand-500/30"
                          >
                            {#if returnLines.length > 0 && returnLines.filter(l => l.disponible > 0).every((l) => l.checked && Number(l.cantidad_devolver) > 0)}
                              <div in:fade={{ duration: 100 }}>
                                <Check
                                  size={14}
                                  class="text-white"
                                  strokeWidth={4}
                                />
                              </div>
                            {/if}
                          </div>
                        </label>
                      </th>
                      <th class="px-6 py-4">Artículo</th>
                      <th class="px-6 py-4 text-center">Facturado / Disp.</th>
                      <th class="px-6 py-4 text-center">Cant. a Devolver</th>
                      <th class="px-6 py-4 text-right">Precio {showUSD ? 'USD' : 'Bs'}</th>
                      <th class="px-6 py-4 text-right">Total {showUSD ? 'USD' : 'Bs'}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border-subtle text-xs">
                    {#each returnLines as line, idx (line.co_art + idx)}
                      {@const isRowDisabled = line.disponible <= 0}
                      <tr class="transition-all {line.checked && Number(line.cantidad_devolver) > 0 ? 'bg-emerald-500/10 hover:bg-emerald-500/15 border-l-4 border-l-emerald-500' : 'opacity-50 hover:bg-surface-soft/60'}">
                        <td class="px-6 py-4 text-center">
                          <label class="group relative inline-flex items-center {isRowDisabled ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'} justify-center">
                            <input
                              type="checkbox"
                              checked={line.checked && Number(line.cantidad_devolver) > 0}
                              disabled={isRowDisabled}
                              onchange={(e) => handleRowCheckbox(line, e)}
                              class="sr-only peer"
                            />
                            <div
                              class="w-6 h-6 bg-surface-base border-2 border-border-subtle rounded-lg peer-checked:bg-brand-500 peer-checked:border-brand-500 transition-all flex items-center justify-center shadow-inner group-hover:border-brand-500/30"
                            >
                              {#if line.checked && Number(line.cantidad_devolver) > 0}
                                <div in:fade={{ duration: 100 }}>
                                  <Check
                                    size={14}
                                    class="text-white"
                                    strokeWidth={4}
                                  />
                                </div>
                              {/if}
                            </div>
                          </label>
                        </td>
                        <td class="px-6 py-4 min-w-[220px]">
                          <div class="flex flex-col gap-1 max-w-md">
                            <span class="font-black text-text-base leading-snug break-words">
                              {line.art_des}
                            </span>
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="text-[10px] text-text-muted font-mono font-bold">{line.co_art.trim()}</span>
                              <span class="text-[10px] text-emerald-400 font-bold uppercase">({line.unidad?.trim() || line.co_uni?.trim() || "UND"})</span>
                            </div>
                          </div>
                        </td>
                        <td class="px-6 py-4 text-center font-bold text-text-muted font-mono text-sm">
                          {Number(line.cantidad_facturada).toFixed(2)} <span class="text-text-muted/40">/</span> <strong class="text-amber-400 font-black">{Number(line.disponible).toFixed(2)}</strong>
                          {#if Number(line.total_dev) > 0}
                            <span class="block text-[10px] text-amber-400 font-normal">
                              (Dev: {Number(line.total_dev).toFixed(2)})
                            </span>
                          {/if}
                        </td>
                        <td class="px-6 py-4 text-center">
                          {#if isRowDisabled}
                            <span class="text-[10px] font-bold text-red-400 uppercase tracking-wider">
                              Agotado
                            </span>
                          {:else}
                            <div class="inline-flex items-center gap-1.5 bg-surface-base border border-border-subtle rounded-2xl p-1.5 shadow-inner">
                              <button
                                type="button"
                                onclick={() => updateReturnQty(line, Number(line.cantidad_devolver || 0) - 1)}
                                class="h-8 w-8 rounded-xl bg-surface-strong hover:bg-surface-soft text-text-base font-black flex items-center justify-center transition-all disabled:opacity-30 cursor-pointer"
                                disabled={Number(line.cantidad_devolver || 0) <= 0}
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="0"
                                max={line.disponible}
                                step="any"
                                value={line.cantidad_devolver}
                                oninput={(e) => {
                                  const target = e.currentTarget as HTMLInputElement;
                                  const parsed = parseFloat(target.value);
                                  updateReturnQty(line, isNaN(parsed) ? 0 : parsed, target);
                                }}
                                onchange={(e) => {
                                  const target = e.currentTarget as HTMLInputElement;
                                  const parsed = parseFloat(target.value);
                                  updateReturnQty(line, isNaN(parsed) ? 0 : parsed, target);
                                }}
                                onblur={(e) => {
                                  const target = e.currentTarget as HTMLInputElement;
                                  const parsed = parseFloat(target.value);
                                  updateReturnQty(line, isNaN(parsed) ? 0 : parsed, target);
                                }}
                                class="w-20 bg-transparent text-center font-mono font-black text-sm text-text-base focus:outline-none"
                              />
                              <button
                                type="button"
                                onclick={() => updateReturnQty(line, Number(line.cantidad_devolver || 0) + 1)}
                                class="h-8 w-8 rounded-xl bg-surface-strong hover:bg-surface-soft text-text-base font-black flex items-center justify-center transition-all disabled:opacity-30 cursor-pointer"
                                disabled={Number(line.cantidad_devolver || 0) >= Number(line.disponible)}
                              >
                                +
                              </button>
                            </div>
                          {/if}
                        </td>
                        <td class="px-6 py-4 text-right font-bold text-text-muted">
                          {totals.symbol} {(
                            Number(line.precio_usd) * (showUSD ? 1 : Number(activeTasa || 1))
                          ).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td class="px-6 py-4 text-right font-black text-brand-500">
                          {totals.symbol} {(
                            (line.checked ? Number(line.cantidad_devolver || 0) : 0) *
                            Number(line.precio_usd) *
                            (showUSD ? 1 : Number(activeTasa || 1))
                          ).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </div>

        <!-- RIGHT COLUMN: TOTALS & ACTIONS -->
        <div class="xl:col-span-1">
          <div
            class="glass p-8 rounded-[32px] border border-border-subtle space-y-8 bg-brand-500/[0.03] backdrop-blur-3xl relative overflow-hidden flex flex-col sticky top-24 shadow-xl"
          >
            <div
              class="absolute -top-12 -right-12 w-48 h-48 bg-brand-500/10 rounded-full blur-[80px]"
            ></div>

            <div
              class="flex items-center justify-between border-b border-border-subtle pb-6 relative z-10"
            >
              <h4
                class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted"
              >
                Total Documento
              </h4>
              <div
                class="flex bg-surface-base p-1 rounded-xl border border-border-bold shadow-lg"
              >
                <button
                  onclick={() => toggleCurrency(true)}
                  class={`px-5 py-2 rounded-lg text-xs font-black transition-all duration-300 ${showUSD ? "bg-brand-600 text-white shadow-lg scale-105" : "text-text-muted hover:text-text-base"}`}
                  >USD</button
                >
                <button
                  onclick={() => toggleCurrency(false)}
                  class={`px-5 py-2 rounded-lg text-xs font-black transition-all duration-300 ${!showUSD ? "bg-brand-600 text-white shadow-lg scale-105" : "text-text-muted hover:text-text-base"}`}
                  >BS</button
                >
              </div>
            </div>

            <div class="space-y-6 relative z-10">
              <div
                class="flex justify-between items-center text-base font-bold text-text-muted"
              >
                <span>Sub-Total</span>
                <span class="font-mono text-text-base"
                  >{totals.symbol} {totals.activeSubtotal.toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}</span
                >
              </div>

              <div
                class="flex justify-between items-center text-base font-bold text-text-muted"
              >
                <span>I.V.A</span>
                <span class="font-mono text-brand-400"
                  >{totals.symbol} {totals.activeTax.toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}</span
                >
              </div>

              {#if totals.igtfBs > 0}
                <div
                  class="flex justify-between items-center text-base font-bold text-amber-500"
                >
                  <span class="flex items-center gap-1.5">
                    <span>IGTF (3%)</span>
                    <span class="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-md font-black uppercase tracking-wider">Abono</span>
                  </span>
                  <span class="font-mono"
                    >{totals.symbol} {totals.activeIgtf.toLocaleString("de-DE", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}</span
                  >
                </div>
              {/if}

              <div
                class="flex justify-between items-center text-base font-bold text-text-muted border-t border-border-subtle/50 pt-4"
              >
                <span>Total Devolución</span>
                <span class="font-mono text-text-base text-lg font-black text-brand-400"
                  >{totals.symbol} {totals.activeTotal.toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}</span
                >
              </div>

              <div class="flex justify-between items-center text-xs text-text-muted border-t border-border-subtle/30 pt-3">
                <span>Tasa de Cambio</span>
                <span class="font-mono font-bold text-text-base">
                  {Number(activeTasa).toFixed(2)} Bs/$
                </span>
              </div>

              <!-- Motivo / Comentario -->
              <div class="space-y-2 border-t border-border-subtle/50 pt-4">
                <label for="comentarioDevolucion" class="text-[10px] font-black uppercase tracking-wider text-text-muted">
                  Motivo / Comentario
                </label>
                <textarea
                  id="comentarioDevolucion"
                  bind:value={comentarioDevolucion}
                  rows={2}
                  placeholder="Indica el motivo de la devolución..."
                  class="w-full p-3 bg-surface-soft border border-border-subtle rounded-2xl text-xs text-text-base placeholder:text-text-muted/50 focus:border-brand-500 outline-none resize-none transition-all"
                ></textarea>
              </div>

              <!-- Big Total Display identical to Billing -->
              <div
                class="pt-8 border-t border-border-bold flex flex-col gap-2"
              >
                <div class="flex justify-between items-end">
                  <div>
                    <span
                      class="text-[10px] font-black uppercase tracking-[0.2em] text-brand-400/60 block mb-2"
                      >Total a Devolver</span
                    >
                    <div
                      class="text-5xl font-black text-text-base drop-shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)] tracking-tight leading-none text-brand-400"
                    >
                      {totals.symbol} {totals.activeTotal.toLocaleString("de-DE", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {#if hasInvalidQuantities}
              <div
                class="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs flex gap-2 items-start relative z-10"
              >
                <AlertTriangle size={16} class="shrink-0 mt-0.5" />
                <div>
                  <p class="font-bold">Cantidades Inválidas</p>
                  <p class="text-[10px] text-red-500/70 mt-1 font-medium leading-relaxed font-mono">
                    Corrige las cantidades que superan el máximo facturado o son menores o iguales a cero.
                  </p>
                </div>
              </div>
            {/if}

            <!-- ACTION BUTTONS: SAVE & RESET -->
            <div class="pt-6 space-y-4 relative z-10">
              <!-- SAVE BUTTON -->
              <button
                type="button"
                onclick={handleSaveReturn}
                disabled={isSavingReturn || checkedLinesCount === 0 || hasInvalidQuantities || !selectedInvoice}
                class="w-full h-20 bg-brand-600 hover:bg-brand-500 text-white rounded-[24px] font-black text-xl uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(var(--brand-rgb),0.3)] active:scale-[0.97] transition-all flex items-center justify-center gap-4 disabled:opacity-50 disabled:grayscale group cursor-pointer border-none"
              >
                {#if isSavingReturn}
                  <RefreshCw size={28} class="animate-spin text-brand-400/40" />
                  <span class="animate-pulse">Guardando Devolución...</span>
                {:else}
                  <div class="bg-surface-strong/50 p-2.5 rounded-xl group-hover:scale-110 transition-transform">
                    <Check size={28} />
                  </div>
                  <span>Guardar Devolución</span>
                {/if}
              </button>

              <!-- SECONDARY BUTTON (RESET) -->
              {#if selectedInvoice}
                <button
                  type="button"
                  onclick={resetForm}
                  disabled={isSavingReturn}
                  class="w-full h-14 rounded-2xl text-text-muted hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all text-xs font-black uppercase tracking-widest border border-border-subtle cursor-pointer disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center active:scale-[0.98]"
                >
                  Descartar Todo
                </button>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {:else}
    <!-- TAB: HISTORIAL DE DEVOLUCIONES -->
    <div class="space-y-6" in:fade>
      <!-- History Search & Filter Bar -->
      <div class="glass p-6 rounded-3xl border border-border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div class="relative flex-1">
          <Search size={16} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            bind:value={historySearchQuery}
            onkeydown={(e) => e.key === "Enter" && loadHistory(1)}
            placeholder="Buscar por N° Devolución, Nota de Crédito, Cliente o RIF..."
            class="w-full h-11 pl-11 pr-4 bg-surface-base border border-border-subtle rounded-xl text-xs text-text-base placeholder:text-text-muted focus:border-brand-500 outline-none transition-all"
          />
        </div>
        <div class="flex items-center gap-3">
          <button
            onclick={() => loadHistory(1)}
            disabled={isLoadingHistory}
            class="px-5 h-11 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-brand-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {#if isLoadingHistory}
              <Loader2 size={14} class="animate-spin" />
            {:else}
              <Search size={14} />
            {/if}
            Buscar
          </button>
          <button
            onclick={() => {
              historySearchQuery = "";
              loadHistory(1);
            }}
            class="px-4 h-11 bg-surface-soft hover:bg-surface-soft/80 border border-border-subtle text-text-muted hover:text-text-base rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Limpiar
          </button>
        </div>
      </div>

      <!-- History Table -->
      <div class="glass border border-border-subtle rounded-3xl overflow-hidden shadow-xl">
        {#if isLoadingHistory}
          <div class="p-20 text-center flex flex-col items-center justify-center gap-3">
            <Loader2 size={36} class="animate-spin text-brand-500" />
            <span class="text-xs text-text-muted font-bold">Cargando devoluciones...</span>
          </div>
        {:else if historyList.length === 0}
          <div class="p-20 text-center flex flex-col items-center justify-center gap-3">
            <History size={48} class="text-text-muted/30" />
            <h4 class="text-lg font-bold text-text-muted">No se encontraron devoluciones</h4>
            <p class="text-xs text-text-muted/50 max-w-sm">
              Las devoluciones emitidas en esta sede aparecerán aquí con su respectiva Nota de Crédito.
            </p>
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-surface-soft/80 border-b border-border-subtle text-[11px] font-black uppercase tracking-wider text-text-muted">
                  <th class="px-6 py-4">Devolución #</th>
                  <th class="px-6 py-4">Nota de Crédito #</th>
                  <th class="px-6 py-4">Fecha</th>
                  <th class="px-6 py-4">Cliente</th>
                  <th class="px-6 py-4 text-right">Total {showUSD ? 'USD' : 'Bs'}</th>
                  <th class="px-6 py-4 text-center">Estado</th>
                  <th class="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-subtle">
                {#each historyList as dev}
                  {@const totalUSD = Number(dev.total_neto || 0) / (Number(dev.tasa || 1) > 0 ? Number(dev.tasa || 1) : 1)}
                  {@const totalBs = Number(dev.total_neto || 0)}
                  <tr class="hover:bg-surface-soft/40 transition-colors {dev.anulado ? 'opacity-50 bg-red-500/[0.02]' : ''}">
                    <!-- Doc Num -->
                    <td class="px-6 py-4 font-mono font-black text-brand-500">
                      {dev.doc_num}
                    </td>

                    <!-- N/CR -->
                    <td class="px-6 py-4 font-mono font-bold text-emerald-400">
                      {dev.nro_doc || '---'}
                    </td>

                    <!-- Fecha -->
                    <td class="px-6 py-4 text-text-muted">
                      {dayjs(dev.fec_emis).format("DD/MM/YYYY")}
                    </td>

                    <!-- Cliente -->
                    <td class="px-6 py-4">
                      <div class="flex flex-col gap-0.5 max-w-[200px]">
                        <span class="font-bold text-text-base truncate" title={dev.cli_des}>
                          {dev.cli_des || dev.co_cli}
                        </span>
                        <span class="text-[10px] text-text-muted font-mono">{dev.rif || dev.co_cli}</span>
                      </div>
                    </td>

                    <!-- Total -->
                    <td class="px-6 py-4 text-right font-black text-text-base">
                      {#if showUSD}
                        ${totalUSD.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {:else}
                        {totalBs.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                      {/if}
                    </td>

                    <!-- Estado -->
                    <td class="px-6 py-4 text-center">
                      {#if dev.anulado}
                        <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
                          Anulada
                        </span>
                      {:else}
                        <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Procesada
                        </span>
                      {/if}
                    </td>

                    <!-- Acciones -->
                    <td class="px-6 py-4 text-center">
                      <div class="flex items-center justify-center gap-2">
                        <button
                          onclick={() => openDevDetail(dev)}
                          class="p-2 rounded-xl bg-surface-soft hover:bg-brand-500/10 text-text-muted hover:text-brand-400 transition-colors cursor-pointer"
                          title="Ver detalle de devolución"
                        >
                          <Eye size={15} />
                        </button>

                        {#if !dev.anulado && data.permissions?.canVoid}
                          <button
                            onclick={() => promptVoidDev(dev)}
                            class="p-2 rounded-xl bg-surface-soft hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors cursor-pointer"
                            title="Anular devolución"
                          >
                            <Ban size={15} />
                          </button>
                        {/if}
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <!-- Pagination Bar -->
          {#if historyTotalPages > 1}
            <div class="p-4 border-t border-border-subtle bg-surface-soft/40 flex items-center justify-between text-xs text-text-muted">
              <span>Página {historyPage} de {historyTotalPages} ({historyTotalCount} registros)</span>
              <div class="flex items-center gap-2">
                <button
                  disabled={historyPage <= 1}
                  onclick={() => loadHistory(historyPage - 1)}
                  class="px-3 py-1.5 rounded-lg bg-surface-soft border border-border-subtle disabled:opacity-40 cursor-pointer"
                >
                  Anterior
                </button>
                <button
                  disabled={historyPage >= historyTotalPages}
                  onclick={() => loadHistory(historyPage + 1)}
                  class="px-3 py-1.5 rounded-lg bg-surface-soft border border-border-subtle disabled:opacity-40 cursor-pointer"
                >
                  Siguiente
                </button>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>
{/if}

<!-- MODAL: BUSCAR FACTURAS ACTIVAS (anulado = 0) -->
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
          <h2 class="text-2xl font-black tracking-tight">Importar Factura</h2>
          <p class="text-text-muted text-sm">
            Selecciona una factura activa para cargarla en la devolución
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
            placeholder="Buscar por nro. factura, RIF o nombre de cliente..." 
            bind:value={importSearchQuery}
            oninput={handleImportSearchInput}
            onkeydown={(e) => {
              if (e.key === "Enter") {
                clearTimeout(searchDebounceTimer);
                searchInvoices();
              }
            }}
            class="w-full bg-surface-soft border border-border-subtle pl-12 pr-4 py-3.5 rounded-2xl text-sm text-text-base placeholder-text-muted/50 focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all font-medium"
          />
          {#if isSearchingInvoices}
            <RefreshCw size={16} class="animate-spin absolute right-4 top-1/2 -translate-y-1/2 text-brand-500" />
          {/if}
        </div>

        <!-- Resultados -->
        <div class="space-y-3">
        {#if isSearchingInvoices}
          <div class="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 size={40} class="animate-spin text-brand-500" />
            <p class="text-text-muted font-bold animate-pulse">
              Buscando facturas...
            </p>
          </div>
        {:else if foundInvoices.length === 0}
          <div
            class="flex flex-col items-center justify-center py-20 gap-3 text-text-muted opacity-50 bg-surface-base"
          >
            <Receipt size={48} />
            <p class="font-bold">No se encontraron facturas activas</p>
          </div>
        {:else}
          {#each foundInvoices as fac (fac.doc_num)}
            {@const facTasa = Number(fac.tasa || 1) > 1 ? Number(fac.tasa) : Number(fac.tasa_actual || activeTasa || 1)}
            {@const rawUsd = Number(fac.total_neto || 0) / (facTasa > 0 ? facTasa : 1)}
            {@const formattedUsd = rawUsd.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            {@const formattedBs = Number(fac.total_neto || 0).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            
            <ImportItemCard
              docType="FAC"
              docNum={fac.doc_num.trim()}
              statusLabel="Activa"
              statusClass="bg-brand-500/10 text-brand-400 border-brand-500/20"
              clientName={fac.cli_des || fac.co_cli}
              clientRif={fac.rif || fac.co_cli}
              dateEmis={dayjs(fac.fec_emis).format("DD/MM/YYYY")}
              amountUsd={formattedUsd}
              amountBs={formattedBs}
              branchName={getBranchName(filterSede)}
              onclick={() => selectAndLoadInvoice(fac.doc_num)}
            />
          {/each}
        {/if}
        </div>
      </div>
    </div>

    {#if isLoadingInvoiceDetail}
      <div
        class="absolute inset-0 bg-surface-base/80 backdrop-blur-[2px] flex items-center justify-center z-[110]"
        in:fade
      >
        <div class="flex flex-col items-center gap-4">
          <div class="relative">
            <Loader2 size={48} class="animate-spin text-brand-500" />
            <ShoppingBag
              size={20}
              class="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 text-brand-400"
            />
          </div>
          <p class="font-black text-lg tracking-tight">
            IMPORTANDO ARTÍCULOS...
          </p>
        </div>
      </div>
    {/if}
  </div>
{/if}

<!-- MODAL: DETALLE DE DEVOLUCION (HISTORIAL) -->
{#if showDetailModal && selectedDetailDev}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
    in:fade={{ duration: 150 }}
  >
    <div
      class="bg-surface-raised border border-border-subtle rounded-[32px] max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
      in:scale={{ start: 0.95, duration: 200 }}
    >
      <div class="p-6 border-b border-border-subtle flex items-center justify-between bg-surface-soft/40">
        <div>
          <div class="flex items-center gap-3">
            <h3 class="text-lg font-black text-text-base">
              Devolución {selectedDetailDev.doc_num}
            </h3>
            {#if selectedDetailDev.anulado}
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-500/10 text-red-400 border border-red-500/20">
                Anulada
              </span>
            {:else}
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Procesada
              </span>
            {/if}
          </div>
          <span class="text-xs text-text-muted">
            Nota de Crédito: <strong>{selectedDetailDev.nro_doc || '---'}</strong> • Emisión: {dayjs(selectedDetailDev.fec_emis).format("DD/MM/YYYY")}
          </span>
        </div>
        <button
          onclick={() => (showDetailModal = false)}
          class="p-2 rounded-xl hover:bg-surface-soft text-text-muted hover:text-text-base transition-colors cursor-pointer"
        >
          <X size={20} />
        </button>
      </div>

      <div class="p-6 overflow-y-auto space-y-6">
        <!-- Client info -->
        <div class="p-4 rounded-2xl bg-surface-soft/40 border border-border-subtle grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span class="text-[10px] font-bold text-text-muted uppercase">Cliente</span>
            <p class="font-bold text-text-base">{selectedDetailDev.cli_des || selectedDetailDev.co_cli}</p>
            <p class="text-[10px] text-text-muted font-mono">{selectedDetailDev.rif}</p>
          </div>
          <div>
            <span class="text-[10px] font-bold text-text-muted uppercase">Vendedor</span>
            <p class="font-bold text-text-base">{selectedDetailDev.ven_des || selectedDetailDev.co_ven || '---'}</p>
          </div>
          <div>
            <span class="text-[10px] font-bold text-text-muted uppercase">Total Devolución</span>
            <p class="font-black text-brand-500 text-sm">
              ${(Number(selectedDetailDev.total_neto) / Number(selectedDetailDev.tasa || 1)).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span class="text-xs font-normal text-text-muted">({Number(selectedDetailDev.total_neto).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs)</span>
            </p>
            {#if Number(selectedDetailDev.otros1 || 0) > 0}
              <p class="text-[10px] text-amber-400 font-bold mt-0.5">
                Incluye IGTF (3%): ${(Number(selectedDetailDev.otros1) / Number(selectedDetailDev.tasa || 1)).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            {/if}
          </div>
        </div>

        <!-- Renglones Table -->
        <div>
          <h4 class="text-xs font-black uppercase text-text-muted tracking-wider mb-3">Renglones Devueltos</h4>
          {#if isLoadingDetail}
            <div class="py-10 text-center flex flex-col items-center justify-center gap-2">
              <Loader2 size={24} class="animate-spin text-brand-500" />
              <span class="text-xs text-text-muted">Cargando renglones...</span>
            </div>
          {:else}
            <div class="border border-border-subtle rounded-2xl overflow-hidden">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="bg-surface-soft border-b border-border-subtle text-[10px] font-black uppercase text-text-muted">
                    <th class="px-4 py-3">#</th>
                    <th class="px-4 py-3">Artículo</th>
                    <th class="px-4 py-3 text-center">Cantidad</th>
                    <th class="px-4 py-3 text-right">Precio USD</th>
                    <th class="px-4 py-3 text-right">Total USD</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle">
                  {#each selectedDetailDev.renglones || [] as r}
                    <tr class="hover:bg-surface-soft/20">
                      <td class="px-4 py-3 font-mono text-text-muted">{r.reng_num}</td>
                      <td class="px-4 py-3 font-bold text-text-base">
                        {r.art_des}
                        <span class="block text-[9px] text-text-muted font-mono">{r.co_art}</span>
                      </td>
                      <td class="px-4 py-3 text-center font-bold text-text-base">
                        {Number(r.cantidad).toFixed(2)} {r.unidad || r.co_uni}
                      </td>
                      <td class="px-4 py-3 text-right font-medium text-text-muted">
                        ${Number(r.prec_vta_om || (r.precio / (selectedDetailDev.tasa || 1))).toFixed(2)}
                      </td>
                      <td class="px-4 py-3 text-right font-black text-brand-500">
                        ${(Number(r.cantidad) * Number(r.prec_vta_om || (r.precio / (selectedDetailDev.tasa || 1)))).toFixed(2)}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>

      <div class="p-6 border-t border-border-subtle bg-surface-soft/40 flex items-center justify-between">
        {#if !selectedDetailDev.anulado && data.permissions?.canVoid}
          <button
            onclick={() => promptVoidDev(selectedDetailDev)}
            class="px-5 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-xs border border-red-500/20 transition-all cursor-pointer flex items-center gap-2"
          >
            <Ban size={15} />
            Anular Devolución
          </button>
        {:else}
          <div></div>
        {/if}
        <button
          onclick={() => (showDetailModal = false)}
          class="px-6 py-2.5 bg-surface-soft hover:bg-surface-soft/80 text-text-base rounded-xl text-xs font-bold border border-border-subtle transition-all cursor-pointer"
        >
          Cerrar
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL: CONFIRMACION DE ANULACION -->
{#if showVoidConfirmModal && devToVoid}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
    in:fade={{ duration: 150 }}
  >
    <div
      class="bg-surface-raised border border-red-500/20 rounded-[32px] max-w-md w-full p-6 space-y-6 shadow-2xl"
      in:scale={{ start: 0.95, duration: 200 }}
    >
      <div class="flex items-center gap-3 text-red-400">
        <div class="h-12 w-12 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0">
          <AlertTriangle size={24} />
        </div>
        <div>
          <h3 class="text-lg font-black text-text-base">¿Anular Devolución?</h3>
          <p class="text-xs text-text-muted">Esta acción no se puede deshacer.</p>
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-surface-soft/60 border border-border-subtle text-xs space-y-2">
        <p class="text-text-muted">
          Al anular la devolución <strong>{devToVoid.doc_num}</strong>:
        </p>
        <ul class="list-disc list-inside space-y-1 text-text-muted text-[11px]">
          <li>La devolución y la Nota de Crédito quedarán marcadas como ANULADAS.</li>
          <li>El stock regresado al inventario será descontado nuevamente.</li>
          <li>Las cantidades devueltas en la factura original se revertirán.</li>
        </ul>
      </div>

      <div class="flex gap-3">
        <button
          onclick={() => (showVoidConfirmModal = false)}
          disabled={isVoiding}
          class="flex-1 py-3 bg-surface-soft hover:bg-surface-soft/80 text-text-base rounded-xl text-xs font-bold border border-border-subtle transition-all cursor-pointer disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onclick={confirmVoidDev}
          disabled={isVoiding}
          class="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {#if isVoiding}
            <Loader2 size={14} class="animate-spin" />
            Anulando...
          {:else}
            <Ban size={14} />
            Confirmar Anulación
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
