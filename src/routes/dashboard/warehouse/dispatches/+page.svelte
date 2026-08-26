<!-- src/routes/dashboard/warehouse/dispatches/+page.svelte -->
<script lang="ts">
  import { fade, slide, scale } from "svelte/transition";
  import {
    Truck,
    Search,
    Filter,
    Plus,
    FileText,
    ArrowRight,
    Printer,
    Trash2,
    Building,
    User,
    RefreshCw,
    CheckCircle2,
    AlertTriangle,
    X,
    ShieldAlert,
    CheckSquare,
    Square,
    Store,
    ChevronLeft,
    ChevronDown,
    Check,
    Loader2,
    Clock,
    Package,
    Warehouse,
    ClipboardList,
    Layers,
    Tag,
    History,
    Edit2,
    Send
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { deserialize } from "$app/forms";
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

  // Edit Mode State
  let isEditing = $state(false);
  let editingDocNum = $state("");

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

      dispatchLines = (p.renglones || []).map((l: any) => {
        const cantActual = Number(l.cant_despachada || l.total_art || 0);
        const cantPendiente = Number(l.cant_pendiente != null ? l.cant_pendiente : cantActual);
        const cantOriginal = Number(l.cant_original != null ? l.cant_original : (cantPendiente + cantActual));
        return {
          ...l,
          checked: cantActual > 0,
          cant_despachada: cantActual,
          cant_pendiente: cantPendiente > 0 ? cantPendiente : cantActual,
          cant_original: cantOriginal > 0 ? cantOriginal : cantActual,
          co_alma: l.co_alma || data.defaultWarehouse || "01"
        };
      });
    }
  });

  // Modal State for Selecting Invoices
  let isModalOpen = $state(false);
  let isSearchingInvoices = $state(false);
  let invoiceSearchQuery = $state("");
  let pendingInvoicesList = $state<any[]>([]);

  // Computed Totals (Warehouse quantities only)
  let totalLinesSelected = $derived(
    dispatchLines.filter((l) => l.checked && Number(l.cant_despachada) > 0).length
  );

  let totalUnitsToDispatch = $derived(
    dispatchLines
      .filter((l) => l.checked)
      .reduce((acc, l) => acc + (Number(l.cant_despachada) || 0), 0)
  );

  let totalUnitsInvoiced = $derived(
    dispatchLines
      .reduce((acc, l) => acc + (Number(l.cant_original) || 0), 0)
  );

  let totalUnitsPending = $derived(
    dispatchLines
      .reduce((acc, l) => acc + (Number(l.cant_pendiente) || 0), 0)
  );

  // Handlers
  function handleBranchChange(newBranchId: string) {
    if (newBranchId !== filterSede) {
      if (dispatchLines.length > 0) {
        if (!confirm("Cambiar de sucursal limpiará los artículos cargados del despacho. ¿Deseas continuar?")) {
          return;
        }
      }
      filterSede = newBranchId;
      goto(`?branch_id=${newBranchId}`, { replaceState: true, invalidateAll: true });
      resetDispatch();
    }
  }

  function resetDispatch() {
    selectedInvoice = null;
    dispatchLines = [];
    observations = "";
    isEditing = false;
    editingDocNum = "";
  }

  async function openSearchModal() {
    isModalOpen = true;
    invoiceSearchQuery = "";
    await searchPendingInvoices();
  }

  async function searchPendingInvoices() {
    isSearchingInvoices = true;
    try {
      const formData = new FormData();
      formData.append("branch_id", filterSede);
      formData.append("search", invoiceSearchQuery);

      const response = await fetch("?/searchPendingInvoices", {
        method: "POST",
        body: formData
      });

      const result = deserialize(await response.text());
      if (result.type === "success" && (result.data as any)?.invoices) {
        pendingInvoicesList = (result.data as any).invoices;
      } else {
        toast.error((result as any).data?.message || "Error al buscar facturas pendientes.");
        pendingInvoicesList = [];
      }
    } catch (e: any) {
      toast.error(e.message || "Error de conexión.");
      pendingInvoicesList = [];
    } finally {
      isSearchingInvoices = false;
    }
  }

  async function selectInvoice(inv: any) {
    isSearchingInvoices = true;
    try {
      const formData = new FormData();
      formData.append("branch_id", filterSede);
      formData.append("doc_num", inv.doc_num);

      const response = await fetch("?/getInvoiceDetail", {
        method: "POST",
        body: formData
      });

      const result = deserialize(await response.text());
      if (result.type === "success" && (result.data as any)?.invoice) {
        const fullInv = (result.data as any).invoice;
        selectedInvoice = fullInv;
        observations = fullInv.comentario ? `Ref Factura: ${fullInv.comentario}` : "";

        // Map line items
        dispatchLines = (fullInv.renglones || []).map((r: any) => {
          const cantPend = Number(r.cant_pendiente || 0);
          return {
            reng_num: r.reng_num,
            co_art: r.co_art,
            des_art: r.art_des,
            modelo: r.modelo,
            referencia: r.referencia,
            co_uni: r.co_uni,
            unidad: r.unidad,
            co_alma: r.co_alma_original || data.defaultWarehouse || "01",
            cant_original: Number(r.cant_original || 0),
            cant_pendiente: cantPend,
            cant_despachada: cantPend, // Default to dispatching all pending
            checked: cantPend > 0,
            prec_vta: r.prec_vta,
            tipo_imp: r.tipo_imp,
            porc_imp: r.porc_imp,
            monto_imp: r.monto_imp,
            reng_neto: r.reng_neto,
            rowguid_doc: r.rowguid_doc
          };
        });

        isModalOpen = false;
        toast.success(`Factura ${fullInv.doc_num} cargada exitosamente.`);
      } else {
        toast.error((result as any).data?.message || "No se pudo cargar el detalle de la factura.");
      }
    } catch (e: any) {
      toast.error(e.message || "Error al obtener factura.");
    } finally {
      isSearchingInvoices = false;
    }
  }

  function toggleAllLines(checked: boolean) {
    dispatchLines = dispatchLines.map((l) => ({
      ...l,
      checked: checked,
      cant_despachada: checked ? (l.cant_despachada > 0 ? l.cant_despachada : l.cant_pendiente) : 0
    }));
  }

  function handleLineCheck(index: number, checked: boolean) {
    dispatchLines[index].checked = checked;
    if (checked && Number(dispatchLines[index].cant_despachada) <= 0) {
      dispatchLines[index].cant_despachada = dispatchLines[index].cant_pendiente;
    }
  }

  function handleQuantityChange(index: number, val: number) {
    const max = Number(dispatchLines[index].cant_pendiente || 0);
    let qty = Number(val);
    if (isNaN(qty) || qty < 0) qty = 0;
    if (qty > max) {
      toast.warning(`La cantidad a despachar no puede exceder el pendiente (${max}).`);
      qty = max;
    }
    dispatchLines[index].cant_despachada = qty;
    dispatchLines[index].checked = qty > 0;
  }

  function setMaxQuantity(index: number) {
    dispatchLines[index].cant_despachada = dispatchLines[index].cant_pendiente;
    dispatchLines[index].checked = true;
  }

  async function handleSaveDispatch() {
    if (!selectedInvoice) {
      toast.error("Debes seleccionar una Factura de Venta para despachar.");
      return;
    }

    const linesToDispatch = dispatchLines.filter((l) => l.checked && Number(l.cant_despachada) > 0);
    if (linesToDispatch.length === 0) {
      toast.error("Debes seleccionar al menos un artículo con cantidad mayor a cero para despachar.");
      return;
    }

    isSavingDispatch = true;

    try {
      const payload = {
        isEditing,
        doc_num: isEditing ? editingDocNum : undefined,
        factura_origen: selectedInvoice.doc_num,
        co_cli: selectedInvoice.co_cli,
        cli_des: selectedInvoice.cli_des,
        rif: selectedInvoice.rif,
        cli_dir: selectedInvoice.cli_dir,
        co_cond: selectedInvoice.co_cond || "01",
        co_tran: selectedInvoice.co_tran || "01",
        co_mone: selectedInvoice.co_mone || "BS",
        co_ven: selectedInvoice.co_ven || "01",
        tasa: selectedInvoice.tasa || 1,
        comentario: observations.trim() || `Despacho de Factura ${selectedInvoice.doc_num}`,
        defaultWarehouse: data.defaultWarehouse || "01",
        renglones: linesToDispatch.map((l) => ({
          reng_num: l.reng_num,
          co_art: l.co_art,
          des_art: l.des_art,
          modelo: l.modelo,
          referencia: l.referencia,
          co_uni: l.co_uni,
          co_alma: l.co_alma,
          cant_original: l.cant_original,
          cant_pendiente: l.cant_pendiente,
          cant_despachada: Number(l.cant_despachada),
          prec_vta: l.prec_vta,
          tipo_imp: l.tipo_imp,
          porc_imp: l.porc_imp,
          monto_imp: l.monto_imp,
          reng_neto: l.reng_neto,
          rowguid_doc: l.rowguid_doc,
          doc_num_factura: selectedInvoice.doc_num
        }))
      };

      const formData = new FormData();
      formData.append("branch_id", filterSede);
      formData.append("payload", JSON.stringify(payload));

      const response = await fetch("?/saveDispatch", {
        method: "POST",
        body: formData
      });

      const result = deserialize(await response.text());
      if (result.type === "success" && (result.data as any)?.success) {
        const docNumResult = (result.data as any).doc_num;
        toast.success(`¡Despacho ${docNumResult} procesado exitosamente!`);
        resetDispatch();
        goto(`/dashboard/warehouse/dispatches/history?branch_id=${filterSede}`);
      } else {
        toast.error((result as any).data?.message || "Error al procesar el despacho.");
      }
    } catch (e: any) {
      toast.error(e.message || "Error procesando la solicitud.");
    } finally {
      isSavingDispatch = false;
    }
  }
</script>

<svelte:head>
  <title>Despacho de Mercancía | Sync2K</title>
</svelte:head>

<div class="space-y-6">
  <!-- Top Navigation & Header Bar -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/60 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-zinc-800/80 shadow-xl shadow-black/20">
    <div class="flex items-center gap-3.5">
      <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/30 border border-violet-500/30 flex items-center justify-center text-violet-400 shadow-lg shadow-violet-950/40">
        <Truck class="w-6 h-6" />
      </div>
      <div>
        <div class="flex items-center gap-2.5">
          <h1 class="text-xl font-bold text-white tracking-tight">Despacho de Mercancía</h1>
          {#if isEditing}
            <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
              <Edit2 class="w-3 h-3" /> Editando {editingDocNum}
            </span>
          {/if}
        </div>
        <p class="text-xs text-zinc-400 mt-0.5">Control y verificación de salida de artículos por Facturas de Venta</p>
      </div>
    </div>

    <!-- Actions & Sede Selector -->
    <div class="flex flex-wrap items-center gap-2.5">
      <!-- Sede Selector -->
      <div class="relative min-w-[170px]">
        <select
          aria-label="Seleccionar sucursal"
          value={filterSede}
          onchange={(e) => handleBranchChange(e.currentTarget.value)}
          class="w-full pl-9 pr-8 py-2 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/70 hover:border-zinc-600 rounded-xl text-xs font-medium text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
        >
          {#each data.branches as branch}
            <option value={branch.id}>{branch.name}</option>
          {/each}
        </select>
        <Store class="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <ChevronDown class="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      <!-- History Button -->
      <a
        href="/dashboard/warehouse/dispatches/history?branch_id={filterSede}"
        class="flex items-center gap-2 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700/80 text-zinc-300 hover:text-white border border-zinc-700/80 rounded-xl text-xs font-medium transition-all shadow-sm"
      >
        <History class="w-3.5 h-3.5 text-violet-400" />
        <span>Historial</span>
      </a>

      <!-- Import Invoice Button -->
      <button
        onclick={openSearchModal}
        disabled={isSavingDispatch}
        class="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-violet-600/30 hover:shadow-violet-600/50 active:scale-95 transition-all disabled:opacity-50"
      >
        <Search class="w-3.5 h-3.5" />
        <span>Importar Factura</span>
      </button>

      {#if selectedInvoice}
        <button
          onclick={resetDispatch}
          disabled={isSavingDispatch}
          class="p-2 bg-zinc-800/60 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 border border-zinc-700/60 hover:border-red-500/20 rounded-xl transition-all"
          title="Limpiar Formulario"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      {/if}
    </div>
  </div>

  <!-- Main Content Layout -->
  {#if !selectedInvoice}
    <!-- Empty State / Prompt to Import Invoice -->
    <div class="flex flex-col items-center justify-center p-12 sm:p-16 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl text-center shadow-lg backdrop-blur-sm">
      <div class="w-20 h-20 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-500 mb-5 shadow-inner">
        <Truck class="w-10 h-10 text-violet-400/80 stroke-[1.5]" />
      </div>
      <h2 class="text-lg font-bold text-white mb-1.5">Ninguna Factura de Venta Seleccionada</h2>
      <p class="text-xs text-zinc-400 max-w-md mb-6 leading-relaxed">
        Para iniciar el despacho, haz clic en el botón inferior para buscar y seleccionar una Factura de Venta pendiente de entrega.
      </p>
      <button
        onclick={openSearchModal}
        class="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-violet-600/30 hover:shadow-violet-600/50 active:scale-95 transition-all"
      >
        <Search class="w-4 h-4" />
        <span>Buscar Facturas Pendientes</span>
      </button>
    </div>
  {:else}
    <!-- Active Dispatch Workspace -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- Left / Main Panel: Invoice Details & Items Table -->
      <div class="lg:col-span-8 space-y-6">
        <!-- Client & Invoice Info Card -->
        <div class="bg-zinc-900/60 backdrop-blur-md rounded-2xl border border-zinc-800/80 p-5 shadow-xl">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4 mb-4">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 font-bold text-xs">
                FACT
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold text-white">Factura N° {selectedInvoice.doc_num}</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Pendiente Despacho
                  </span>
                </div>
                <p class="text-xs text-zinc-400 mt-0.5">
                  Emisión: {dayjs(selectedInvoice.fec_emis).format("DD/MM/YYYY")}
                </p>
              </div>
            </div>

            <button
              onclick={openSearchModal}
              class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-medium border border-zinc-700/60 transition-all flex items-center gap-1.5"
            >
              <RefreshCw class="w-3 h-3 text-violet-400" />
              <span>Cambiar Factura</span>
            </button>
          </div>

          <!-- Client details grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs">
            <div class="bg-zinc-800/40 p-3 rounded-xl border border-zinc-800/60">
              <span class="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider block mb-1">Cliente / Razón Social</span>
              <p class="font-medium text-white truncate" title={selectedInvoice.cli_des}>{selectedInvoice.cli_des || "---"}</p>
              <p class="text-[11px] text-zinc-400 mt-0.5">{selectedInvoice.co_cli} • {selectedInvoice.rif || "Sin RIF"}</p>
            </div>

            <div class="bg-zinc-800/40 p-3 rounded-xl border border-zinc-800/60">
              <span class="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider block mb-1">Dirección de Entrega</span>
              <p class="font-medium text-zinc-300 truncate" title={selectedInvoice.cli_dir}>{selectedInvoice.cli_dir || "Dirección no especificada"}</p>
              <p class="text-[11px] text-zinc-400 mt-0.5">Tel: {selectedInvoice.telefonos || "No registrado"}</p>
            </div>

            <div class="bg-zinc-800/40 p-3 rounded-xl border border-zinc-800/60 sm:col-span-2 md:col-span-1">
              <span class="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider block mb-1">Condición de Pago</span>
              <p class="font-medium text-zinc-300 truncate">{selectedInvoice.cond_des || selectedInvoice.co_cond || "Contado"}</p>
              <p class="text-[11px] text-zinc-400 mt-0.5">Moneda: {selectedInvoice.co_mone || "BS"}</p>
            </div>
          </div>
        </div>

        <!-- Line Items Table Card -->
        <div class="bg-zinc-900/60 backdrop-blur-md rounded-2xl border border-zinc-800/80 overflow-hidden shadow-xl">
          <div class="p-4 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 bg-zinc-900/80">
            <div class="flex items-center gap-2">
              <Package class="w-4 h-4 text-violet-400" />
              <h3 class="text-sm font-bold text-white">Artículos para Despacho</h3>
              <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20">
                {dispatchLines.length} renglones
              </span>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                onclick={() => toggleAllLines(true)}
                class="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-[11px] font-medium text-zinc-300 rounded-lg border border-zinc-700/60 transition-all"
              >
                Seleccionar Todo
              </button>
              <button
                type="button"
                onclick={() => toggleAllLines(false)}
                class="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-[11px] font-medium text-zinc-300 rounded-lg border border-zinc-700/60 transition-all"
              >
                Deseleccionar
              </button>
            </div>
          </div>

          <!-- Items Table -->
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 bg-zinc-900/40 uppercase tracking-wider">
                  <th class="py-3 px-3 w-10 text-center">Sel</th>
                  <th class="py-3 px-3 min-w-[220px]">Artículo</th>
                  <th class="py-3 px-3 min-w-[130px]">Almacén Salida</th>
                  <th class="py-3 px-3 text-center w-24">Facturado</th>
                  <th class="py-3 px-3 text-center w-24">Pendiente</th>
                  <th class="py-3 px-3 text-center w-36">A Despachar</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-800/60">
                {#each dispatchLines as line, index}
                  <tr class="hover:bg-zinc-800/30 transition-colors {line.checked ? 'bg-violet-950/10' : 'opacity-60'}">
                    <!-- Checkbox -->
                    <td class="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar artículo ${line.des_art || line.co_art}`}
                        checked={line.checked}
                        onchange={(e) => handleLineCheck(index, e.currentTarget.checked)}
                        class="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-violet-600 focus:ring-violet-500/40 cursor-pointer"
                      />
                    </td>

                    <!-- Article Info -->
                    <td class="py-3 px-3">
                      <div class="font-semibold text-white leading-snug">{line.des_art || line.co_art}</div>
                      <div class="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                        <span class="font-mono text-violet-400/90">{line.co_art}</span>
                        {#if line.referencia}
                          <span>• Ref: {line.referencia}</span>
                        {/if}
                        {#if line.modelo}
                          <span>• Mod: {line.modelo}</span>
                        {/if}
                        <span class="text-zinc-400">({line.unidad || line.co_uni})</span>
                      </div>
                    </td>

                    <!-- Warehouse Selector -->
                    <td class="py-3 px-3">
                      <select
                        aria-label="Almacén de salida para {line.des_art || line.co_art}"
                        bind:value={line.co_alma}
                        class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700/80 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500/40"
                      >
                        {#each data.warehouses as wh}
                          <option value={wh.co_alma}>{wh.des_alma || wh.co_alma}</option>
                        {/each}
                      </select>
                    </td>

                    <!-- Invoiced Qty -->
                    <td class="py-3 px-3 text-center font-mono font-medium text-zinc-300">
                      {line.cant_original}
                    </td>

                    <!-- Pending Qty -->
                    <td class="py-3 px-3 text-center font-mono font-bold text-amber-400">
                      {line.cant_pendiente}
                    </td>

                    <!-- Quantity to Dispatch Input -->
                    <td class="py-3 px-3">
                      <div class="flex items-center gap-1.5 justify-center">
                        <input
                          type="number"
                          aria-label="Cantidad a despachar de {line.des_art || line.co_art}"
                          min="0"
                          max={line.cant_pendiente}
                          step="any"
                          value={line.cant_despachada}
                          oninput={(e) => handleQuantityChange(index, Number(e.currentTarget.value))}
                          class="w-20 px-2 py-1.5 bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-lg text-center font-mono font-bold text-white text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
                        />
                        <button
                          type="button"
                          onclick={() => setMaxQuantity(index)}
                          class="px-2 py-1 bg-zinc-800 hover:bg-violet-600 hover:text-white text-[10px] font-bold text-zinc-400 rounded-md border border-zinc-700 transition-all"
                          title="Despachar todo el pendiente"
                        >
                          MAX
                        </button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Right Panel: Summary, Observations & Action Button -->
      <div class="lg:col-span-4 space-y-6">
        <!-- Summary Card -->
        <div class="bg-zinc-900/60 backdrop-blur-md rounded-2xl border border-zinc-800/80 p-5 shadow-xl space-y-5">
          <div class="flex items-center gap-2.5 border-b border-zinc-800/80 pb-3.5">
            <ClipboardList class="w-4 h-4 text-violet-400" />
            <h3 class="text-sm font-bold text-white">Resumen de Despacho</h3>
          </div>

          <!-- Metrics -->
          <div class="space-y-3 text-xs">
            <div class="flex justify-between items-center py-1.5 border-b border-zinc-800/50">
              <span class="text-zinc-400">Factura Origen:</span>
              <span class="font-mono font-bold text-white">{selectedInvoice.doc_num}</span>
            </div>
            <div class="flex justify-between items-center py-1.5 border-b border-zinc-800/50">
              <span class="text-zinc-400">Renglones a Despachar:</span>
              <span class="font-mono font-bold text-violet-400">{totalLinesSelected} de {dispatchLines.length}</span>
            </div>
            <div class="flex justify-between items-center py-1.5 border-b border-zinc-800/50">
              <span class="text-zinc-400">Total Unidades Facturadas:</span>
              <span class="font-mono text-zinc-300">{totalUnitsInvoiced}</span>
            </div>
            <div class="flex justify-between items-center py-1.5 border-b border-zinc-800/50">
              <span class="text-zinc-400">Total Unidades Pendientes:</span>
              <span class="font-mono font-bold text-amber-400">{totalUnitsPending}</span>
            </div>
            <div class="flex justify-between items-center py-2 bg-violet-950/20 px-3 rounded-xl border border-violet-500/20 text-sm">
              <span class="font-bold text-violet-300">Total Unidades a Despachar:</span>
              <span class="font-mono font-extrabold text-white text-base">{totalUnitsToDispatch}</span>
            </div>
          </div>

          <!-- Observations / Comments -->
          <div class="space-y-1.5">
            <label for="observations-field" class="text-xs font-semibold text-zinc-300 block">Observaciones / Comentario de Salida</label>
            <textarea
              id="observations-field"
              bind:value={observations}
              rows="3"
              placeholder="Ej: Despachado por transporte X, conductor Y, precinto Z..."
              class="w-full p-3 bg-zinc-800/80 border border-zinc-700/80 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none transition-all"
            ></textarea>
          </div>

          <!-- Primary Save Action Button -->
          <button
            type="button"
            onclick={handleSaveDispatch}
            disabled={isSavingDispatch || totalLinesSelected === 0}
            class="w-full py-3.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-violet-600/30 hover:shadow-violet-600/50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {#if isSavingDispatch}
              <Loader2 class="w-4 h-4 animate-spin" />
              <span>Procesando Despacho...</span>
            {:else}
              <Send class="w-4 h-4" />
              <span>Guardar y Procesar Despacho</span>
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Modal: Search Pending Invoices -->
{#if isModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" transition:fade={{ duration: 150 }}>
    <div
      class="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
      transition:scale={{ duration: 150, start: 0.95 }}
    >
      <!-- Modal Header -->
      <div class="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <Search class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-base font-bold text-white">Importar Factura de Venta Pendiente</h3>
            <p class="text-xs text-zinc-400">Selecciona la factura para cargar los artículos a despachar</p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => isModalOpen = false}
          class="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Search Input Bar -->
      <div class="p-4 border-b border-zinc-800/80 bg-zinc-900/50">
        <form onsubmit={(e) => { e.preventDefault(); searchPendingInvoices(); }} class="flex gap-2">
          <div class="relative flex-1">
            <Search class="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              bind:value={invoiceSearchQuery}
              placeholder="Buscar por N° factura, nombre de cliente o RIF..."
              class="w-full pl-10 pr-4 py-2 bg-zinc-800/80 border border-zinc-700/80 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>
          <button
            type="submit"
            disabled={isSearchingInvoices}
            class="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
          >
            {#if isSearchingInvoices}
              <Loader2 class="w-3.5 h-3.5 animate-spin" />
            {:else}
              <span>Buscar</span>
            {/if}
          </button>
        </form>
      </div>

      <!-- Invoices List -->
      <div class="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[50vh]">
        {#if isSearchingInvoices}
          <div class="flex flex-col items-center justify-center p-12 text-zinc-400 space-y-3">
            <Loader2 class="w-8 h-8 animate-spin text-violet-400" />
            <p class="text-xs">Consultando facturas pendientes en Profit Plus...</p>
          </div>
        {:else if pendingInvoicesList.length === 0}
          <div class="flex flex-col items-center justify-center p-12 text-zinc-400 text-center">
            <Package class="w-10 h-10 text-zinc-600 mb-2 stroke-[1.5]" />
            <p class="text-sm font-semibold text-zinc-300">No se encontraron facturas con despacho pendiente</p>
            <p class="text-xs text-zinc-400 mt-1 max-w-sm">Intenta con otro término de búsqueda o asegúrate de que la sede seleccionada tenga facturas activas.</p>
          </div>
        {:else}
          {#each pendingInvoicesList as inv}
            <button
              type="button"
              onclick={() => selectInvoice(inv)}
              class="w-full text-left p-4 rounded-xl bg-zinc-800/40 hover:bg-zinc-800/80 border border-zinc-700/60 hover:border-violet-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
            >
              <div class="space-y-1">
                <div class="flex items-center gap-2.5">
                  <span class="font-mono font-bold text-white text-sm group-hover:text-violet-300 transition-colors">
                    N° {inv.doc_num}
                  </span>
                  <span class="text-xs text-zinc-400">
                    {dayjs(inv.fec_emis).format("DD/MM/YYYY")}
                  </span>
                </div>
                <div class="text-xs font-semibold text-zinc-200">{inv.cli_des}</div>
                <div class="text-[11px] text-zinc-400">{inv.co_cli} • {inv.rif || "Sin RIF"}</div>
              </div>

              <div class="flex items-center gap-4 text-xs">
                <div class="text-right">
                  <div class="text-[11px] text-zinc-400">Pendiente:</div>
                  <div class="font-mono font-bold text-amber-400 text-sm">{inv.cant_pendiente} arts</div>
                </div>
                <div class="w-8 h-8 rounded-lg bg-violet-600/10 group-hover:bg-violet-600 group-hover:text-white text-violet-400 flex items-center justify-center transition-all">
                  <ArrowRight class="w-4 h-4" />
                </div>
              </div>
            </button>
          {/each}
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="p-4 border-t border-zinc-800 bg-zinc-900/80 flex justify-end">
        <button
          type="button"
          onclick={() => isModalOpen = false}
          class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold transition-all"
        >
          Cerrar
        </button>
      </div>
    </div>
  </div>
{/if}
