<!-- src/routes/dashboard/warehouse/dispatches/+page.svelte -->
<script lang="ts">
  import { fade, slide, scale } from "svelte/transition";
  import {
    Truck,
    Search,
    ShoppingBag,
    FileText,
    Printer,
    Trash2,
    Building,
    User,
    RefreshCw,
    CheckCircle2,
    AlertTriangle,
    X,
    Store,
    ChevronDown,
    Check,
    Loader2,
    Clock,
    Package,
    Edit2
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { deserialize } from "$app/forms";
  import ImportItemCard from "$lib/components/ui/ImportItemCard.svelte";
  import dayjs from "dayjs";
  import "dayjs/locale/es";

  dayjs.locale("es");

  let { data } = $props();

  // Active Dispatch State
  let filterSede = $state(data.selectedBranchId || "");
  let selectedInvoice = $state<any>(null);
  let dispatchLines = $state<any[]>([]);
  let observations = $state("");
  let isSavingDispatch = $state(false);
  let linesSearchTerm = $state("");

  // Post-save UI State
  let saveSuccess = $state(false);
  let generatedDocNum = $state("");
  let savedBranchId = $state("");

  // Edit Mode State
  let isEditing = $state(false);
  let editingDocNum = $state("");

  // Modal State for Importing Invoices
  let showImportModal = $state(false);
  let isSearchingInvoices = $state(false);
  let importSearchQuery = $state("");
  let foundInvoices = $state<any[]>([]);
  let isLoadingInvoiceDetail = $state(false);

  // Auto-preload if editing an existing dispatch
  $effect(() => {
    const p = data.preloadedDispatch;
    if (p && p.doc_num && p.doc_num !== editingDocNum) {
      isEditing = true;
      editingDocNum = p.doc_num;

      const cleanComment = (p.comentario || "")
        .replace(/\s*\|\s*EDITADO V[IÍ]A API/gi, "")
        .replace(/\s*\|\s*CREADO V[IÍ]A API/gi, "")
        .trim();
      observations = cleanComment;

      selectedInvoice = {
        doc_num: p.factura_origen || (p.renglones && p.renglones[0]?.doc_num_factura) || p.n_control,
        co_cli: p.co_cli,
        cli_des: p.cli_des,
        rif: p.rif,
        cli_dir: p.cli_dir,
        telefonos: p.telefonos,
        co_cond: p.co_cond,
        cond_des: p.cond_des,
        co_mone: p.co_mone,
        comentario: cleanComment
      };

      const defaultDocAlma = p.renglones?.[0]?.co_alma || data.defaultWarehouse || "01";
      dispatchLines = (p.renglones || []).map((l: any) => {
        const cantOriginal = Number(l.cant_original != null ? l.cant_original : (l.total_art || 0));
        const cantDespachada = Number(l.cant_despachada || 0);
        const cantPendiente = Number(l.cant_pendiente != null ? l.cant_pendiente : cantDespachada);
        const isChecked = l.checked !== undefined ? Boolean(l.checked) : cantDespachada > 0;
        return {
          ...l,
          checked: isChecked,
          cant_despachada: isChecked ? (cantPendiente > 0 ? cantPendiente : cantDespachada) : 0,
          cant_pendiente: cantPendiente,
          cant_original: cantOriginal > 0 ? cantOriginal : (cantPendiente || cantDespachada),
          co_alma: l.co_alma || defaultDocAlma
        };
      });
    }
  });

  // Filtered lines according to quick search input
  let filteredDispatchLines = $derived(
    dispatchLines
      .map((line, index) => ({ line, originalIndex: index }))
      .filter(({ line }) => {
        if (!linesSearchTerm.trim()) return true;
        const q = linesSearchTerm.toLowerCase();
        return (
          (line.art_des || "").toLowerCase().includes(q) ||
          (line.co_art || "").toLowerCase().includes(q) ||
          (line.referencia || "").toLowerCase().includes(q) ||
          (line.modelo || "").toLowerCase().includes(q)
        );
      })
  );

  // Computed Totals
  let totals = $derived.by(() => {
    const linesToProcess = dispatchLines.filter(
      (l) => l.checked && Number(l.cant_despachada || 0) > 0
    );
    const totalLinesCount = linesToProcess.length;
    const totalUnitsCount = linesToProcess.reduce(
      (acc, l) => acc + Number(l.cant_despachada || 0),
      0
    );
    const totalPendingCount = dispatchLines.reduce(
      (acc, l) => acc + Number(l.cant_pendiente || 0),
      0
    );

    const remainingPendingAfterDispatch = dispatchLines.reduce((acc, l) => {
      const pend = Number(l.cant_pendiente || 0);
      const desp = l.checked ? Number(l.cant_despachada || 0) : 0;
      return acc + Math.max(0, pend - desp);
    }, 0);

    const isFullInvoiceDispatch =
      linesToProcess.length > 0 &&
      linesToProcess.length === dispatchLines.length &&
      remainingPendingAfterDispatch === 0;

    const isPartialFinalDispatch =
      linesToProcess.length > 0 &&
      linesToProcess.length < dispatchLines.length &&
      remainingPendingAfterDispatch === 0;

    const isPartiallyDispatched =
      linesToProcess.length > 0 && remainingPendingAfterDispatch > 0;

    return {
      linesToProcess,
      totalLinesCount,
      totalUnitsCount,
      totalPendingCount,
      isFullInvoiceDispatch,
      isPartialFinalDispatch,
      isPartiallyDispatched
    };
  });

  function formatQuantity(val: number) {
    return Number(val || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  // Branch switcher
  function handleBranchChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const newBranchId = target.value;
    if (newBranchId !== filterSede) {
      if (dispatchLines.length > 0) {
        if (!confirm("Cambiar de sucursal limpiará los artículos cargados del despacho actual. ¿Deseas continuar?")) {
          target.value = filterSede;
          return;
        }
      }
      filterSede = newBranchId;
      goto(`?branch_id=${newBranchId}`, { replaceState: true, invalidateAll: true });
      resetForm();
    }
  }

  function resetForm() {
    selectedInvoice = null;
    dispatchLines = [];
    observations = "";
    saveSuccess = false;
    generatedDocNum = "";
    linesSearchTerm = "";
    isEditing = false;
    editingDocNum = "";
    if ($page.url.searchParams.has("doc_num")) {
      const params = new URLSearchParams($page.url.searchParams);
      params.delete("doc_num");
      goto(`?${params.toString()}`);
    }
  }

  // Open import modal and search
  async function openImportModal() {
    showImportModal = true;
    importSearchQuery = "";
    await searchPendingInvoices();
  }

  let searchDebounceTimer: any = null;
  function handleSearchInput() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchPendingInvoices();
    }, 300);
  }

  async function searchPendingInvoices() {
    isSearchingInvoices = true;
    try {
      const formData = new FormData();
      formData.append("branch_id", filterSede);
      formData.append("search", importSearchQuery.trim());

      const res = await fetch("?/searchPendingInvoices", {
        method: "POST",
        body: formData
      });

      const result = deserialize(await res.text());
      if (result.type === "success" && (result.data as any)?.invoices) {
        foundInvoices = (result.data as any).invoices || [];
      } else {
        foundInvoices = [];
        if ((result as any).data?.message) {
          toast.error((result as any).data.message);
        }
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Error de conexión al consultar facturas pendientes.");
      foundInvoices = [];
    } finally {
      isSearchingInvoices = false;
    }
  }

  async function selectInvoice(inv: any) {
    isLoadingInvoiceDetail = true;
    try {
      const formData = new FormData();
      formData.append("branch_id", filterSede);
      formData.append("doc_num", inv.doc_num);

      const res = await fetch("?/getInvoiceDetail", {
        method: "POST",
        body: formData
      });

      const result = deserialize(await res.text());
      if (result.type === "success" && (result.data as any)?.invoice) {
        const fullInv = (result.data as any).invoice;
        selectedInvoice = fullInv;
        observations = fullInv.comentario ? `Ref Factura: ${fullInv.comentario}` : "";

        // Map invoice lines to dispatch lines
        const defaultDocAlma = fullInv.renglones?.[0]?.co_alma_original || fullInv.co_alma || data.defaultWarehouse || "01";
        dispatchLines = (fullInv.renglones || []).map((r: any) => {
          const cantPend = Number(r.cant_pendiente || 0);
          return {
            reng_num: r.reng_num,
            co_art: r.co_art,
            art_des: r.art_des,
            modelo: r.modelo,
            referencia: r.referencia,
            co_uni: r.co_uni,
            unidad: r.unidad,
            co_alma: r.co_alma_original || defaultDocAlma,
            cant_original: Number(r.cant_original || 0),
            cant_pendiente: cantPend,
            cant_despachada: cantPend, // Toma en totalidad el pendiente por despachar siempre
            checked: cantPend > 0,
            prec_vta: r.prec_vta,
            tipo_imp: r.tipo_imp,
            porc_imp: r.porc_imp,
            monto_imp: r.monto_imp,
            reng_neto: r.reng_neto,
            rowguid_doc: r.rowguid_doc
          };
        });

        showImportModal = false;
        toast.success(`Factura N° ${fullInv.doc_num} importada con éxito.`);
      } else {
        toast.error((result as any).data?.message || "No se pudo cargar el detalle de la factura.");
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Error al obtener datos de la factura.");
    } finally {
      isLoadingInvoiceDetail = false;
    }
  }

  function toggleAllLines(checked: boolean) {
    dispatchLines = dispatchLines.map((l) => {
      const pending = Number(l.cant_pendiente || 0);
      const isChecked = checked && pending > 0;
      return {
        ...l,
        checked: isChecked,
        cant_despachada: isChecked ? pending : 0
      };
    });
  }

  async function submitDispatch() {
    if (!selectedInvoice) {
      toast.error("Debes seleccionar una factura de venta.");
      return;
    }

    const linesToProcess = totals.linesToProcess;
    if (linesToProcess.length === 0) {
      toast.error("Debes seleccionar al menos un artículo para despachar.");
      return;
    }

    for (const l of linesToProcess) {
      const max = Number(l.cant_pendiente || 0);
      const desp = Number(l.cant_despachada || 0);
      if (max > 0 && desp > max) {
        toast.error(`El artículo "${l.art_des || l.co_art}" excede la cantidad pendiente permitida (${max} un.).`);
        return;
      }
      if (desp <= 0) {
        toast.error(`El artículo "${l.art_des || l.co_art}" debe tener una cantidad mayor a cero.`);
        return;
      }
    }

    isSavingDispatch = true;

    try {
      const payload = {
        isEditing: isEditing,
        doc_num: isEditing ? editingDocNum : undefined,
        co_cli: selectedInvoice.co_cli,
        factura_origen: selectedInvoice.doc_num,
        descrip: `DESPACHO FACTURA ${selectedInvoice.doc_num}`,
        co_cond: selectedInvoice.co_cond || "CONT",
        n_control: selectedInvoice.doc_num,
        comentario: observations.trim(),
        co_alma_defecto: data.defaultWarehouse || "01",
        renglones: linesToProcess.map((l, i) => ({
          reng_num: i + 1,
          reng_num_factura: l.reng_num,
          rowguid_doc: l.rowguid_doc,
          num_doc: selectedInvoice.doc_num,
          co_art: l.co_art,
          art_des: l.art_des,
          co_uni: l.co_uni || "UNI",
          co_alma: l.co_alma || data.defaultWarehouse || "01",
          cantidad: Number(l.cant_despachada),
          cant_despachada: Number(l.cant_despachada),
          prec_vta: Number(l.prec_vta || 0),
          tipo_imp: l.tipo_imp || "1",
          porc_imp: Number(l.porc_imp || 0),
          monto_imp: Number(l.monto_imp || 0),
          reng_neto: Number(l.reng_neto || 0)
        }))
      };

      const formData = new FormData();
      formData.append("branch_id", filterSede);
      formData.append("payload", JSON.stringify(payload));

      const res = await fetch("?/saveDispatch", {
        method: "POST",
        body: formData
      });

      const result = deserialize(await res.text());

      if (result.type === "success" && (result.data as any)?.success) {
        const resData = result.data as any;
        generatedDocNum = resData.doc_num || resData.data?.doc_num || resData.results?.[0]?.data?.doc_num || editingDocNum || "";
        savedBranchId = filterSede;
        saveSuccess = true;
        toast.success(isEditing ? `Nota de Despacho N° ${generatedDocNum} actualizada con éxito.` : `Nota de Despacho N° ${generatedDocNum} generada con éxito.`);
      } else {
        toast.error((result.data as any)?.message || "Error al procesar el despacho.");
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Error de conexión al procesar la nota de despacho.");
    } finally {
      isSavingDispatch = false;
    }
  }


</script>

<svelte:head>
  <title>Despacho de Mercancía | Sync2K</title>
</svelte:head>

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
      <h2 class="text-3xl font-black text-text-base">¡Despacho Registrado!</h2>
      <p class="text-text-muted">
        La nota de despacho y la salida de inventario han sido procesadas exitosamente en Profit Plus.
      </p>
    </div>
    <div class="bg-white/5 px-6 py-4 rounded-2xl border border-white/5">
      <span
        class="text-xs text-text-muted/60 uppercase font-bold tracking-wider"
        >Nota de Despacho Generada</span
      >
      <div class="text-2xl font-black text-brand-500 mt-1 font-mono">
        {generatedDocNum}
      </div>
    </div>
    <div class="flex gap-4 w-full">
      <a
        href="/dashboard/warehouse/dispatches/{generatedDocNum}/print?branch_id={savedBranchId}"
        target="_blank"
        class="flex-1 text-center bg-white/5 hover:bg-white/10 text-text-base px-6 py-3.5 rounded-2xl font-bold transition-all text-sm flex items-center justify-center gap-2 border border-white/10"
      >
        <Printer size={16} class="text-brand-400" />
        Imprimir
      </a>
      <button
        onclick={resetForm}
        class="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-brand-500/20 text-sm cursor-pointer"
      >
        Nuevo Despacho
      </button>
    </div>
  </div>
{:else}
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
    <!-- TOP HEADER -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
          <Truck size={40} class="text-brand-500" />
          Despacho de Mercancía
        </h1>
        <p class="text-text-muted mt-2 text-lg">
          Control y verificación de salida física de artículos desde Facturas de Venta.
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

        {#if !isEditing}
          <button
            onclick={openImportModal}
            class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto"
          >
            <FileText size={18} />
            Importar Factura
          </button>
        {/if}

        <button
          onclick={() => {
            const params = new URLSearchParams();
            if (filterSede) params.set("branch_id", filterSede);
            goto(`/dashboard/warehouse/dispatches/history?${params.toString()}`);
          }}
          class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-surface-strong hover:bg-surface-base text-text-base border border-border-subtle transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto"
        >
          <Clock size={18} class="text-brand-400" />
          Ver Historial
        </button>
      </div>
    </div>

    {#if data.error}
      <div class="glass border-red-500/20 p-6 rounded-3xl flex items-center gap-6 bg-red-500/5 shadow-xl shadow-red-500/10">
        <div class="h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
          <AlertTriangle size={24} />
        </div>
        <div class="flex-1">
          <h3 class="text-sm font-black text-red-500 uppercase tracking-widest mb-1">Restricción de Acceso</h3>
          <p class="text-text-muted font-bold text-sm leading-relaxed">{data.error}</p>
        </div>
      </div>
    {/if}

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
      <!-- LEFT/CENTER: CLIENT INFO & DISPATCH LINES -->
      <div class="xl:col-span-2 space-y-6">
        <!-- CLIENT & INVOICE INFO BOX -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-4">
          <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
            <Building size={16} />
            Datos del Cliente y Factura
          </h3>

          {#if !selectedInvoice}
            <div class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-2">
              <User size={32} class="text-text-muted/30" />
              <p class="text-xs text-text-muted font-bold">
                No hay ninguna factura cargada. Haz clic en "Importar Factura" para iniciar el despacho.
              </p>
            </div>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4" in:slide>
              <div class="md:col-span-2 space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Cliente / Razón Social</span>
                <p class="text-base font-black text-text-base truncate" title={selectedInvoice.cli_des}>
                  {selectedInvoice.cli_des || selectedInvoice.co_cli}
                </p>
              </div>
              <div class="space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">RIF / Código</span>
                <p class="text-base font-bold font-mono text-text-base">
                  {selectedInvoice.rif || selectedInvoice.co_cli}
                </p>
              </div>
              <div class="md:col-span-2 space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Dirección de Entrega</span>
                <p class="text-xs text-text-muted font-bold leading-relaxed truncate" title={selectedInvoice.cli_dir}>
                  {selectedInvoice.cli_dir || "Sin dirección registrada"}
                </p>
              </div>
              <div class="space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Teléfono</span>
                <p class="text-xs text-text-muted font-bold font-mono">
                  {selectedInvoice.telefonos || "---"}
                </p>
              </div>
              <div class="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border-subtle/30">
                <div class="space-y-1">
                  <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Factura de Venta</span>
                  <p class="text-xs font-bold font-mono text-brand-400">
                    {selectedInvoice.doc_num}
                  </p>
                </div>
                <div class="space-y-1">
                  <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Condición de Pago</span>
                  <p class="text-xs font-bold text-text-base">
                    {selectedInvoice.cond_des || selectedInvoice.co_cond || "CONTADO"}
                  </p>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- ITEMS TABLE (PHYSICAL QUANTITIES ONLY) -->
        <div class="glass border border-border-subtle rounded-3xl shadow-xl overflow-hidden">
          <div class="p-4 md:p-6 border-b border-border-subtle bg-surface-soft/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <!-- Search in lines -->
            <div class="relative flex-1 max-w-xl">
              <Search size={16} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                type="text"
                bind:value={linesSearchTerm}
                placeholder={dispatchLines.length > 0 ? `Buscar artículo en renglones (${dispatchLines.length})...` : "Buscar artículo en renglones..."}
                disabled={dispatchLines.length === 0}
                class="w-full h-12 pl-11 pr-10 rounded-2xl bg-surface-base border border-border-subtle focus:border-brand-500/50 outline-none text-xs font-bold text-text-base transition-all placeholder:text-text-muted disabled:opacity-40"
              />
              {#if linesSearchTerm}
                <button
                  type="button"
                  onclick={() => (linesSearchTerm = "")}
                  class="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors cursor-pointer"
                  title="Limpiar búsqueda"
                >
                  <X size={14} />
                </button>
              {/if}
            </div>

            {#if selectedInvoice}
              <div class="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onclick={() => toggleAllLines(true)}
                  class="px-3 py-2 rounded-xl bg-surface-strong hover:bg-surface-soft text-[11px] font-black text-text-muted hover:text-text-base transition-all border border-border-subtle cursor-pointer"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onclick={() => toggleAllLines(false)}
                  class="px-3 py-2 rounded-xl bg-surface-strong hover:bg-surface-soft text-[11px] font-black text-text-muted hover:text-text-base transition-all border border-border-subtle cursor-pointer"
                >
                  Ninguno
                </button>
              </div>
            {/if}
          </div>

          {#if !selectedInvoice || dispatchLines.length === 0}
            <div class="p-16 flex flex-col items-center justify-center text-center gap-3">
              <Package size={48} class="text-text-muted/20" />
              <p class="text-text-muted font-bold text-sm">
                No hay artículos para mostrar. Importa una factura para comenzar.
              </p>
            </div>
          {:else}
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="bg-surface-soft/60 border-b border-border-subtle text-text-muted font-black uppercase tracking-wider text-[10px]">
                    <th class="py-4 px-4 w-12 text-center">
                      <label class="group relative inline-flex items-center cursor-pointer justify-center" title="Seleccionar Todos">
                        <input
                          type="checkbox"
                          checked={dispatchLines.length > 0 && dispatchLines.filter((l) => Number(l.cant_pendiente || 0) > 0).every((l) => l.checked)}
                          onchange={() => {
                            const activeLines = dispatchLines.filter((l) => Number(l.cant_pendiente || 0) > 0);
                            const allChecked = activeLines.length > 0 && activeLines.every((l) => l.checked);
                            toggleAllLines(!allChecked);
                          }}
                          class="sr-only peer"
                        />
                        <div
                          class="w-6 h-6 bg-surface-base border-2 border-border-subtle rounded-lg peer-checked:bg-brand-500 peer-checked:border-brand-500 transition-all flex items-center justify-center shadow-inner group-hover:border-brand-500/30"
                        >
                          {#if dispatchLines.length > 0 && dispatchLines.filter((l) => Number(l.cant_pendiente || 0) > 0).every((l) => l.checked)}
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
                    <th class="py-4 px-4 min-w-[220px]">Artículo</th>
                    <th class="py-4 px-4 text-center w-28">Facturado</th>
                    <th class="py-4 px-4 text-center w-28">Pendiente</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle/50 font-medium">
                  {#each filteredDispatchLines as { line, originalIndex } (line.reng_num + line.co_art)}
                    {@const isItemCompleted = !line.checked && Number(line.cant_pendiente || 0) <= 0}
                    <tr class="hover:bg-surface-soft/30 transition-colors {line.checked ? '' : isItemCompleted ? 'opacity-40 bg-surface-soft/20' : 'opacity-60'}">
                      <!-- Checkbox -->
                      <td class="py-3 px-4 text-center">
                        {#if isItemCompleted}
                          <div
                            class="w-6 h-6 bg-surface-base border-2 border-border-subtle/40 rounded-lg flex items-center justify-center mx-auto cursor-not-allowed opacity-30 shadow-inner"
                            title="Artículo ya despachado en su totalidad"
                          >
                            <Check size={14} class="text-emerald-500/50" strokeWidth={4} />
                          </div>
                        {:else}
                          <label class="group relative inline-flex items-center cursor-pointer justify-center" title={line.checked ? "Deseleccionar" : "Seleccionar para despachar"}>
                            <input
                              type="checkbox"
                              checked={line.checked}
                              onchange={() => {
                                const isNowChecked = !dispatchLines[originalIndex].checked;
                                dispatchLines[originalIndex].checked = isNowChecked;
                                dispatchLines[originalIndex].cant_despachada = isNowChecked ? Number(dispatchLines[originalIndex].cant_pendiente || 0) : 0;
                              }}
                              class="sr-only peer"
                            />
                            <div
                              class="w-6 h-6 bg-surface-base border-2 border-border-subtle rounded-lg peer-checked:bg-brand-500 peer-checked:border-brand-500 transition-all flex items-center justify-center shadow-inner group-hover:border-brand-500/30"
                            >
                              {#if line.checked}
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
                        {/if}
                      </td>

                      <!-- Article Info -->
                      <td class="py-3 px-4">
                        <div class="font-black text-text-base text-sm leading-snug">
                          {line.art_des || line.co_art}
                        </div>
                        <div class="text-[11px] text-text-muted font-bold font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                          <span class="text-brand-400">{line.co_art}</span>
                          {#if line.referencia}
                            <span>• Ref: {line.referencia}</span>
                          {/if}
                          {#if line.modelo}
                            <span>• Mod: {line.modelo}</span>
                          {/if}
                          <span class="text-text-muted/80">({line.unidad || line.co_uni || 'UNI'})</span>
                        </div>
                      </td>

                      <!-- Invoiced Qty -->
                      <td class="py-3 px-4 text-center font-mono font-bold text-text-muted">
                        {formatQuantity(line.cant_original)}
                      </td>

                      <!-- Pending Qty -->
                      <td class="py-3 px-4 text-center font-mono font-black">
                        {#if Number(line.cant_pendiente || 0) > 0}
                          <span class="text-amber-400">{formatQuantity(line.cant_pendiente)}</span>
                        {:else if line.despachado_en_otro}
                          <span class="text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 block whitespace-nowrap" title="Entregado en Nota N° {line.despachado_en_otro}">
                            0 (En N/D {line.despachado_en_otro})
                          </span>
                        {:else}
                          <span class="text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                            0 (Listo)
                          </span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>

      <!-- RIGHT COLUMN: PHYSICAL SUMMARY & SUBMIT -->
      <div class="xl:col-span-1">
        <div class="glass p-8 rounded-[32px] border border-border-subtle space-y-8 bg-brand-500/[0.03] backdrop-blur-3xl relative overflow-hidden flex flex-col sticky top-24 shadow-xl">
          <div class="absolute -top-12 -right-12 w-48 h-48 bg-brand-500/10 rounded-full blur-[80px]"></div>

          <div class="border-b border-border-subtle pb-6 relative z-10">
            <h4 class="text-xs font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
              <Package size={16} class="text-brand-500" />
              Resumen de Despacho
            </h4>
          </div>

          <div class="space-y-6 relative z-10">
            <!-- Renglones Seleccionados -->
            <div class="flex justify-between items-center text-sm font-bold text-text-muted">
              <span>Renglones a Despachar</span>
              <span class="font-mono text-text-base font-black text-base">{totals.totalLinesCount} de {dispatchLines.length}</span>
            </div>

            <!-- Total Unidades Físicas (Destacado) -->
            <div class="p-5 rounded-2xl bg-surface-soft/60 border border-border-subtle space-y-1">
              <span class="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                Total Unidades Físicas
              </span>
              <div class="text-4xl font-black text-emerald-400 font-mono tracking-tight">
                {formatQuantity(totals.totalUnitsCount)}
              </div>
            </div>

            <!-- Observaciones -->
            <div class="border-t border-border-subtle/50 pt-4 space-y-2">
              <label for="observations" class="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                Observaciones / Comentario de Salida
              </label>
              <textarea
                id="observations"
                bind:value={observations}
                rows="3"
                placeholder="Ej: Despachado por transporte X, conductor Y, precinto Z..."
                class="w-full bg-surface-soft border border-border-subtle px-4 py-3 rounded-2xl text-xs text-text-base placeholder-text-muted/50 focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all font-medium resize-none"
              ></textarea>
            </div>

            <!-- Diagnóstico de Estado de Despacho -->
            {#if totals.isFullInvoiceDispatch}
              <div class="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-xs flex gap-3 items-start" transition:slide>
                <CheckCircle2 size={20} class="shrink-0 mt-0.5" />
                <p class="font-bold text-xs leading-relaxed">
                  Despacho Total: Todos los renglones de la factura se despachan en esta nota al 100%.
                </p>
              </div>
            {:else if totals.isPartialFinalDispatch}
              <div class="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-xs flex gap-3 items-start" transition:slide>
                <CheckCircle2 size={20} class="shrink-0 mt-0.5" />
                <p class="font-bold text-xs leading-relaxed">
                  Despacho Parcial (Cierre de Factura): Se despachan {totals.totalLinesCount} de {dispatchLines.length} renglones. Los demás ítems ya fueron entregados en notas anteriores (la factura queda 100% entregada).
                </p>
              </div>
            {:else if totals.isPartiallyDispatched}
              <div class="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl text-xs flex gap-3 items-start" transition:slide>
                <AlertTriangle size={20} class="shrink-0 mt-0.5" />
                <p class="font-bold text-xs leading-relaxed">
                  Despacho Parcial: Se entregan cantidades menores al saldo. La factura mantendrá ítems pendientes para futuros despachos.
                </p>
              </div>
            {/if}
          </div>

          <!-- SAVE BUTTON -->
          <button
            onclick={submitDispatch}
            disabled={dispatchLines.length === 0 || totals.totalUnitsCount === 0 || isSavingDispatch}
            class="w-full h-20 bg-brand-600 hover:bg-brand-500 disabled:bg-surface-soft text-white disabled:text-text-muted/30 rounded-[24px] font-black text-lg uppercase tracking-[0.2em] transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-4 shadow-xl shadow-brand-500/10 hover:shadow-brand-500/30 group relative z-10 cursor-pointer"
          >
            {#if isSavingDispatch}
              <RefreshCw size={24} class="animate-spin text-brand-400/40" />
              <span class="animate-pulse">{isEditing ? "Actualizando..." : "Procesando..."}</span>
            {:else}
              <div class="bg-surface-strong/50 p-2.5 rounded-xl group-hover:scale-110 transition-transform">
                <Check size={24} />
              </div>
              <span>{isEditing ? "Actualizar" : "Guardar"}</span>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ========================================================================= -->
<!-- MODAL: IMPORTAR FACTURA DE VENTA PENDIENTE -->
<!-- ========================================================================= -->
{#if showImportModal}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    in:fade
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0"
      onclick={() => (showImportModal = false)}
    ></div>

    <div
      class="w-full max-w-2xl bg-surface-base border border-border-subtle rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh] relative z-10"
      in:scale={{ duration: 200, start: 0.95 }}
    >
      <!-- Modal Header -->
      <div class="p-8 border-b border-border-subtle flex justify-between items-center bg-surface-soft/50">
        <div>
          <h2 class="text-2xl font-black tracking-tight">Importar Factura de Venta</h2>
          <p class="text-text-muted text-sm">
            Selecciona una factura con saldo pendiente para despachar mercancía
          </p>
        </div>
        <button
          type="button"
          onclick={() => (showImportModal = false)}
          class="p-2 hover:bg-surface-strong rounded-full transition-colors cursor-pointer"
        >
          <X size={24} />
        </button>
      </div>

      <!-- Modal Content -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar min-h-[300px] custom-scrollbar">
        <!-- Search bar -->
        <div class="relative">
          <Search size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Buscar por nro. factura, RIF o nombre de cliente..."
            bind:value={importSearchQuery}
            oninput={handleSearchInput}
            class="w-full bg-surface-soft border border-border-subtle pl-12 pr-4 py-3.5 rounded-2xl text-sm text-text-base placeholder-text-muted/50 focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all font-medium"
          />
          {#if isSearchingInvoices}
            <RefreshCw size={16} class="animate-spin absolute right-4 top-1/2 -translate-y-1/2 text-brand-500" />
          {/if}
        </div>

        <!-- Invoices List -->
        <div class="space-y-3">
          {#if isSearchingInvoices}
            <div class="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 size={40} class="animate-spin text-brand-500" />
              <p class="text-text-muted font-bold animate-pulse">
                Buscando facturas pendientes...
              </p>
            </div>
          {:else if foundInvoices.length === 0}
            <div class="flex flex-col items-center justify-center py-16 gap-3 text-text-muted opacity-60 bg-surface-base">
              <FileText size={48} />
              <p class="font-bold text-sm">No se encontraron facturas con despacho pendiente en esta sucursal</p>
              <p class="text-xs text-text-muted/70 max-w-sm text-center">
                Verifica haber seleccionado la sucursal correcta en el encabezado o que las facturas tengan saldo pendiente de entrega.
              </p>
            </div>
          {:else}
            {#each foundInvoices as inv (inv.doc_num + inv.sede_id)}
              {@const isParcial = String(inv.status).trim() === '1'}
              {@const pendingQty = Number(inv.cant_pendiente || 0)}

              <ImportItemCard
                docType="FACT"
                docNum={inv.doc_num}
                statusLabel={isParcial ? 'Parcial' : 'Sin Despachar'}
                statusClass={isParcial ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-brand-500/10 text-brand-400 border-brand-500/20'}
                clientName={inv.cli_des || inv.co_cli}
                clientRif={inv.rif || inv.co_cli}
                dateEmis={dayjs(inv.fec_emis).format("DD/MM/YYYY")}
                qtyLabel={`${formatQuantity(pendingQty)} un.`}
                branchName={inv.sede_nombre || "N/A"}
                onclick={() => selectInvoice(inv)}
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
            <Truck
              size={20}
              class="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 text-brand-400"
            />
          </div>
          <p class="font-black text-lg tracking-tight">
            IMPORTANDO ARTÍCULOS DE FACTURA...
          </p>
        </div>
      </div>
    {/if}
  </div>
{/if}
