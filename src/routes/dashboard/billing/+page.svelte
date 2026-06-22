<!-- src/routes/dashboard/billing/+page.svelte -->
<script lang="ts">
  import { fade, slide, scale } from "svelte/transition";
  import {
    Receipt,
    Search,
    Filter,
    Plus,
    FileText,
    ArrowRight,
    Printer,
    Trash2,
    User,
    Landmark,
    ShoppingBag,
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
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import dayjs from "dayjs";

  let { data } = $props();

  // Active Billing State
  let filterSede = $state(data.selectedBranchId || "");

  let selectedClient = $state<any>(null);
  let billingLines = $state<any[]>([]);
  const uniqueOrigins = $derived.by(() => {
    const origins = new Set();
    for (const line of billingLines) {
      if (line.doc_num) {
        origins.add(line.doc_num.trim());
      }
    }
    return Array.from(origins);
  });

  const originOrderNum = $derived(uniqueOrigins.join(", "));
  const hasMultipleOrigins = $derived(uniqueOrigins.length > 1);

  let importedOrdersInfo = $state<Record<string, { descrip: string }>>({});

  // Search/Import Modal State
  let showImportModal = $state(false);
  let importSearchQuery = $state("");
  let isSearchingOrders = $state(false);
  let foundOrders = $state<any[]>([]);

  let isLoadingOrderDetail = $state(false);

  let isSavingInvoice = $state(false);
  let showUSD = $state(true);
  let activeTasa = $state(1);

  function toggleCurrency(val: boolean) {
    showUSD = val;
  }

  const activeTotals = $derived.by(() => {
    const multiplier = showUSD ? 1 : activeTasa;
    const symbol = showUSD ? "$" : "Bs";

    return {
      symbol,
      subtotal: invoiceTotals.subtotal * multiplier,
      tax: invoiceTotals.tax * multiplier,
      retencion: invoiceTotals.retencion * multiplier,
      porc_esp: invoiceTotals.porc_esp,
      totalFactura: invoiceTotals.totalFactura * multiplier,
      total: invoiceTotals.total * multiplier,
    };
  });

  // Totals calculations based on active lines
  const invoiceTotals = $derived.by(() => {
    let subtotal = 0;
    let tax = 0;
    for (const line of billingLines) {
      if (line.checked) {
        const qty = Number(line.cantidad || 0);
        const price = Number(line.precio || 0);
        const pImp = Number(line.porc_imp || 0);

        const lineTotal = qty * price;
        const lineTax = (lineTotal * pImp) / 100;

        subtotal += lineTotal;
        tax += lineTax;
      }
    }
    const porcEsp = selectedClient?.porc_esp ? Number(selectedClient.porc_esp) : 0;
    const retencion = tax * (porcEsp / 100);
    const totalFactura = subtotal + tax;
    const total = totalFactura - retencion;

    return { subtotal, tax, retencion, porc_esp: porcEsp, totalFactura, total };
  });

  function handleBranchChange() {
    const params = new URLSearchParams($page.url.searchParams);
    if (filterSede) params.set("branch_id", filterSede);
    else params.delete("branch_id");
    goto(`?${params.toString()}`);
  }

  // --- SEARCH ORDERS FLOW ---
  async function searchOrders() {
    if (!filterSede) {
      toast.error("Selecciona una sucursal primero");
      return;
    }
    isSearchingOrders = true;
    foundOrders = [];

    try {
      const response = await fetch(
        `/api/agent/orders?branch_id=${filterSede}&search=${encodeURIComponent(importSearchQuery)}`,
      );
      const result = await response.json();

      if (result.success) {
        foundOrders = result.data || [];
        if (foundOrders.length === 0) {
          toast.warning("No se encontraron pedidos con esos criterios.");
        }
      } else {
        toast.error(result.message || "Error al buscar pedidos.");
      }
    } catch (err: any) {
      toast.error("Error de red: " + err.message);
    } finally {
      isSearchingOrders = false;
    }
  }

  async function loadOrderDetailAndImport(order: any) {
    isLoadingOrderDetail = true;

    try {
      const response = await fetch(
        `/api/agent/orders/${order.doc_num}?branch_id=${filterSede}`,
      );
      const result = await response.json();

      if (result.success && result.data && result.data.length > 0) {
        const orderDetails = result.data[0];

        // Evitar importar el mismo pedido más de una vez
        const orderDocNum = orderDetails.doc_num.trim();
        if (uniqueOrigins.includes(orderDocNum)) {
          toast.error(`El pedido ${orderDocNum} ya se encuentra cargado.`);
          showImportModal = false;
          importSearchQuery = "";
          foundOrders = [];
          return;
        }

        const lines = orderDetails.renglones || [];
        const docTasa = Number(orderDetails.tasa || 1);
        const tasa = docTasa > 1 ? docTasa : Number(orderDetails.tasa_actual || 1);

        const newLines = lines
          .filter((l: any) => Number(l.pendiente ?? l.cantidad) > 0)
          .map((l: any) => {
            const itemQty = Number(l.pendiente ?? l.cantidad);
            const usdPrice = Number(l.prec_vta_om || 0) > 0 ? Number(l.prec_vta_om) : Number(l.precio || 0) / tasa;
            return {
              ...l,
              doc_num: orderDetails.doc_num,
              cantidad: itemQty,
              precio: usdPrice,
              checked: true,
            };
          });

        if (newLines.length === 0) {
          toast.error("El pedido no tiene artículos pendientes por facturar.");
          return;
        }

        // Check if there is already an order loaded
        if (selectedClient && selectedClient.co_cli.trim() !== orderDetails.co_cli.trim()) {
          // Different client: Replace everything
          selectedClient = {
            co_cli: orderDetails.co_cli,
            cli_des: orderDetails.cli_des,
            rif: orderDetails.rif,
            direc1: orderDetails.direc1,
            telefonos: orderDetails.telefonos,
            email: orderDetails.email,
            co_cond: orderDetails.co_cond,
            co_ven: orderDetails.co_ven,
            ven_des: orderDetails.ven_des,
            porc_esp: Number(orderDetails.porc_esp) || 0,
            contribu_e: orderDetails.contribu_e,
            contribuyente: !!orderDetails.contribu_e,
          };
          const orderDesc = (orderDetails.descrip || "").trim() || (orderDetails.comentario || "").trim() || "Sin descripción";

          billingLines = newLines;
          activeTasa = tasa;
          importedOrdersInfo = {
            [orderDetails.doc_num.trim()]: {
              descrip: orderDesc
            }
          };
          toast.success(`Pedido ${orderDetails.doc_num} importado (sustituyó pedido anterior por cambio de cliente)`);
        } else {
          // Same client or first import
          if (!selectedClient) {
            selectedClient = {
              co_cli: orderDetails.co_cli,
              cli_des: orderDetails.cli_des,
              rif: orderDetails.rif,
              direc1: orderDetails.direc1,
              telefonos: orderDetails.telefonos,
              email: orderDetails.email,
              co_cond: orderDetails.co_cond,
              co_ven: orderDetails.co_ven,
              ven_des: orderDetails.ven_des,
              porc_esp: Number(orderDetails.porc_esp) || 0,
              contribu_e: orderDetails.contribu_e,
              contribuyente: !!orderDetails.contribu_e,
            };
            activeTasa = tasa;
            billingLines = newLines;
            const orderDesc = (orderDetails.descrip || "").trim() || (orderDetails.comentario || "").trim() || "Sin descripción";
            importedOrdersInfo = {
              [orderDetails.doc_num.trim()]: {
                descrip: orderDesc
              }
            };
            toast.success(`Pedido ${orderDetails.doc_num} importado (${newLines.length} artículos)`);
          } else {
            // Append lines
            billingLines = [...billingLines, ...newLines];
            const orderDesc = (orderDetails.descrip || "").trim() || (orderDetails.comentario || "").trim() || "Sin descripción";
            importedOrdersInfo = {
              ...importedOrdersInfo,
              [orderDetails.doc_num.trim()]: {
                descrip: orderDesc
              }
            };
            toast.success(`Pedido ${orderDetails.doc_num} agregado (${newLines.length} artículos)`);
          }
        }

        showImportModal = false;
        importSearchQuery = "";
        foundOrders = [];
      } else {
        toast.error(
          result.message || "No se pudo cargar el detalle del pedido.",
        );
      }
    } catch (err: any) {
      toast.error("Error al cargar e importar el pedido: " + err.message);
    } finally {
      isLoadingOrderDetail = false;
    }
  }

  // --- BILLING SCREEN ACTIONS ---
  function toggleBillingLine(index: number) {
    billingLines[index].checked = !billingLines[index].checked;
  }

  function removeBillingLine(index: number) {
    billingLines = billingLines.filter((_, idx) => idx !== index);
    if (billingLines.length === 0) {
      selectedClient = null;
      activeTasa = 1;
      importedOrdersInfo = {};
    }
  }

  function removeOrder(docNum: string) {
    billingLines = billingLines.filter((l) => l.doc_num?.trim() !== docNum.trim());
    
    // Eliminar descripción de cache
    const cleanDoc = docNum.trim();
    const newInfo = { ...importedOrdersInfo };
    delete newInfo[cleanDoc];
    importedOrdersInfo = newInfo;

    if (billingLines.length === 0) {
      selectedClient = null;
      activeTasa = 1;
      importedOrdersInfo = {};
    }
  }

  async function saveAndPrintSimulatedInvoice() {
    const activeLines = billingLines.filter((l) => l.checked);
    if (activeLines.length === 0) {
      toast.error(
        "Debes tener al menos un artículo seleccionado para facturar.",
      );
      return;
    }

    isSavingInvoice = true;

    const tasa = activeTasa;

    // Construir la factura en USD según requerimiento
    const invoiceData = {
      co_cli: selectedClient.co_cli,
      co_ven: selectedClient.co_ven,
      co_cond: selectedClient.co_cond,
      descrip: `FACTURA WEB - PEDIDO: ${originOrderNum}`,
      comentario: `Importado de pedidos: ${originOrderNum}`,
      tasa: tasa,
      renglones: activeLines.map((line: any) => ({
        co_art: line.co_art,
        art_des: line.art_des,
        cantidad: Number(line.cantidad),
        co_uni: line.co_uni,
        co_alma: line.co_alma,
        co_precio: line.co_precio,
        precio: Number(line.precio), // precio ya está en USD en el estado de Svelte
        porc_imp: Number(line.porc_imp),
        tipo_imp: line.tipo_imp || '1',
        tipo_doc: 'PCLI',
        num_doc: line.doc_num,
        rowguid_doc: line.rowguid,
        co_subl: line.co_subl,
        co_lin: line.co_lin,
      })),
    };

    try {
      // 1. Guardar factura real en la base de datos SQL
      const saveResponse = await fetch(`/api/agent/facturas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: filterSede,
          invoice: invoiceData,
        }),
      });
      const saveResult = await saveResponse.json();

      if (!saveResult.success) {
        throw new Error(saveResult.message || "Error al guardar la factura en la base de datos.");
      }

      const realDocNum = saveResult.doc_num || saveResult.results?.[0]?.doc_num;
      if (!realDocNum) {
        throw new Error("No se recibió el número de documento correlativo generado.");
      }

      toast.success(`Factura Nro. ${realDocNum} guardada exitosamente en la base de datos.`);

      // 2. Si existen impresoras activas, proceder a imprimir el ticket de predespacho para almacén
      if (data.printers && data.printers.length > 0) {
        toast.info("Enviando ticket de predespacho a almacén...");
        try {
          const printResponse = await fetch(`/api/agent/billing/print`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              branch_id: filterSede,
              invoice: {
                ...invoiceData,
                invoice_num: realDocNum, // Usado para imprimir origen FACTURA Nro. XXX
                doc_num: realDocNum,     // Usado para el código grande al pie del ticket
                cli_des: selectedClient.cli_des,
                rif: selectedClient.rif,
                telefonos: selectedClient.telefonos,
                direc1: selectedClient.direc1,
                vendedor: selectedClient.ven_des || selectedClient.co_ven || "---",
              },
            }),
          });
          const printResult = await printResponse.json();
          if (printResult.success) {
            toast.success(printResult.message || "Ticket de predespacho enviado.");
          } else {
            toast.warning(`La factura se guardó pero falló la impresión: ${printResult.message}`);
          }
        } catch (printErr: any) {
          console.error("Error al imprimir ticket:", printErr);
          toast.warning(`La factura se guardó pero ocurrió un error al imprimir: ${printErr.message}`);
        }
      }

      // Reset billing form en caso de éxito
      selectedClient = null;
      billingLines = [];
      activeTasa = 1;
      importedOrdersInfo = {};
    } catch (err: any) {
      toast.error(err.message || "Error al procesar la factura.");
    } finally {
      isSavingInvoice = false;
    }
  }

  function getBranchName(id: string) {
    const b = data.branches?.find((br: any) => br.id === id);
    return b ? b.name : "Desconocida";
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <!-- TOP HEADER -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Receipt size={40} class="text-brand-500" />
        Facturas / NE
      </h1>
      <p class="text-text-muted mt-2 text-lg">
        Importación de pedidos y facturación.
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

      <button
        onclick={() => {
          if (!filterSede) {
            toast.error("Seleccione una sucursal primero");
            return;
          }
          showImportModal = true;
        }}
        class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto"
      >
        <ShoppingBag size={18} />
        Importar Pedido
      </button>

      <button
        onclick={() => {
          const params = new URLSearchParams();
          if (filterSede) params.set("branch_id", filterSede);
          goto(`/dashboard/billing/history?${params.toString()}`);
        }}
        class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-surface-strong hover:bg-surface-base text-text-base border border-border-subtle transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto"
      >
        <Clock size={18} class="text-brand-400" />
        Ver Historial
      </button>
    </div>
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
    <!-- LEFT/CENTER: INVOICE FORM & LINES -->
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

        {#if !selectedClient}
          <div
            class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-2"
          >
            <User size={32} class="text-text-muted/30" />
            <p class="text-xs text-text-muted font-bold">
              No hay ningún cliente cargado. Haz clic en "Importar Pedido" para
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
                {selectedClient.cli_des}
              </p>
            </div>
            <div class="space-y-1">
              <span
                class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                >RIF / CI</span
              >
              <p class="text-base font-bold font-mono text-text-base">
                {selectedClient.rif || "---"}
              </p>
            </div>
            <div class="md:col-span-2 space-y-1">
              <span
                class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                >Dirección</span
              >
              <p class="text-xs text-text-muted font-bold leading-relaxed">
                {selectedClient.direc1 || "---"}
              </p>
            </div>
            <div class="space-y-1">
              <span
                class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                >Teléfono</span
              >
              <p class="text-xs text-text-muted font-bold font-mono">
                {selectedClient.telefonos || "---"}
              </p>
            </div>
            <div class="md:col-span-3 space-y-1 pt-2 border-t border-border-subtle/30">
              <span
                class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                >Estatus Fiscal</span
              >
              <p class="text-xs font-bold text-brand-400">
                {selectedClient.porc_esp > 0
                  ? `Contribuyente Especial (${selectedClient.porc_esp}%)`
                  : selectedClient.contribuyente
                    ? "Contribuyente Especial"
                    : "No Contribuyente"}
              </p>
            </div>
          </div>
        {/if}
      </div>

      <!-- INVOICE RENG-LINES TABLE -->
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
            Artículos a Facturar
          </h3>
          {#if uniqueOrigins.length > 0}
            <div class="flex flex-wrap items-center gap-2 justify-end max-w-xl">
              {#each uniqueOrigins as origin}
                <div class="flex items-center gap-2.5 px-4 py-2 bg-brand-500/10 border border-brand-500/20 text-xs md:text-sm font-bold text-text-base rounded-2xl transition-all shadow-sm hover:border-brand-500/30">
                  <div class="flex items-center gap-1.5 truncate max-w-[280px] md:max-w-md">
                    <span class="font-black text-brand-400 font-mono">{origin}</span>
                    {#if importedOrdersInfo[origin]?.descrip}
                      <span class="text-text-muted">: </span>
                      <span class="text-text-secondary truncate font-medium text-xs md:text-sm" title={importedOrdersInfo[origin].descrip}>
                        {importedOrdersInfo[origin].descrip}
                      </span>
                    {/if}
                  </div>
                  <button 
                    onclick={() => removeOrder(origin)}
                    class="p-1 hover:bg-brand-500/20 text-brand-400 hover:text-brand-300 rounded-lg transition-colors cursor-pointer flex items-center justify-center border-none bg-transparent shrink-0"
                    title={`Quitar pedido ${origin}`}
                  >
                    <X size={14} class="stroke-[3]" />
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        {#if billingLines.length === 0}
          <div
            class="p-20 text-center flex flex-col items-center justify-center gap-3"
          >
            <ShoppingBag size={48} class="text-text-muted/30 animate-pulse" />
            <h4 class="text-lg font-bold text-text-muted">Factura vacía</h4>
            <p class="text-xs text-text-muted/50 max-w-xs">
              Los artículos importados del pedido seleccionado aparecerán aquí.
            </p>
          </div>
        {:else}
          <div class="overflow-x-auto" in:slide>
            <table class="w-full text-left border-collapse">
              <thead>
                <tr
                  class="bg-surface-strong border-b border-border-subtle text-xs font-black uppercase tracking-wider text-text-muted"
                >
                  <th class="px-6 py-4 w-12 text-center">Item</th>
                  <th class="px-6 py-4">Artículo</th>
                  <th class="px-6 py-4 text-center">Cantidad</th>
                  <th class="px-6 py-4 text-center">Tipo Precio</th>
                  <th class="px-6 py-4 text-right">Precio {showUSD ? 'USD' : 'Bs'}</th>
                  <th class="px-6 py-4 text-right">Total {showUSD ? 'USD' : 'Bs'}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-subtle text-xs">
                {#each billingLines as line, idx (line.co_art + idx)}
                  <tr class="hover:bg-surface-soft/60 transition-colors">
                    <td class="px-6 py-4 text-center font-mono text-text-muted">
                      {line.reng_num || idx + 1}
                    </td>

                    <td class="px-6 py-4">
                      <div class="flex flex-col gap-0.5 max-w-[200px]">
                        <span class="font-black text-text-base truncate"
                          >{line.art_des}</span
                        >
                        <span
                          class="text-[9px] text-text-muted font-mono font-bold"
                          >{line.co_art.trim()}</span
                        >
                      </div>
                    </td>

                    <td class="px-6 py-4 text-center font-black text-text-base">
                      {Number(line.cantidad).toFixed(2)} {line.unidad?.trim() || line.co_uni?.trim()}
                    </td>

                    <td class="px-6 py-4 text-center font-bold text-text-muted font-mono">
                      {line.co_precio ? `Precio ${parseInt(line.co_precio, 10) || line.co_precio.trim()}` : '---'}
                    </td>

                    <td class="px-6 py-4 text-right font-bold text-text-muted">
                      {activeTotals.symbol} {(Number(line.precio) * (showUSD ? 1 : Number(activeTasa || 1))).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    <td class="px-6 py-4 text-right font-black text-brand-500">
                      {activeTotals.symbol} {(Number(line.cantidad) * Number(line.precio) * (showUSD ? 1 : Number(activeTasa || 1))).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </div>

    <!-- RIGHT COLUMN: TOTALS & PRINT SETTINGS -->
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
              >{activeTotals.symbol} {activeTotals.subtotal.toLocaleString("de-DE", {
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
              >{activeTotals.symbol} {activeTotals.tax.toLocaleString("de-DE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}</span
            >
          </div>

          <div
            class="flex justify-between items-center text-base font-bold text-text-muted border-t border-border-subtle/50 pt-4"
          >
            <span>Total Factura</span>
            <span class="font-mono text-text-base"
              >{activeTotals.symbol} {activeTotals.totalFactura.toLocaleString("de-DE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}</span
            >
          </div>

          {#if activeTotals.retencion > 0}
            <div
              class="flex justify-between items-center text-base font-bold text-amber-500/90"
              transition:slide
            >
              <span>Retención ({activeTotals.porc_esp}%)</span>
              <span class="font-mono"
                >- {activeTotals.symbol} {activeTotals.retencion.toLocaleString("de-DE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}</span
              >
            </div>
          {/if}

          <div
            class="pt-8 border-t border-border-bold flex flex-col gap-2"
          >
            <div class="flex justify-between items-end">
              <div>
                <span
                  class="text-[10px] font-black uppercase tracking-[0.2em] text-brand-400/60 block mb-2"
                  >Total a Pagar</span
                >
                <div
                  class="text-5xl font-black text-text-base drop-shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)] tracking-tight leading-none text-brand-400"
                >
                  {activeTotals.symbol} {activeTotals.total.toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- PRINTER SETTINGS -->
        {#if data.printers.length === 0}
          <div
            class="p-4 bg-red-500/5 border border-red-500/10 text-red-400 rounded-2xl text-xs flex gap-2 items-start relative z-10"
          >
            <AlertTriangle size={16} class="shrink-0 mt-0.5" />
            <div>
              <p class="font-bold">Sin Impresoras Disponibles</p>
              <p class="text-[10px] text-red-500/70 mt-1 font-medium leading-relaxed">
                Debes configurar al menos una impresora en el módulo de Sistema para esta sucursal.
              </p>
            </div>
          </div>
        {/if}

        <!-- <div
          class="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex gap-3 text-amber-500 text-xs relative z-10"
        >
          <ShieldAlert size={18} class="shrink-0 mt-0.5" />
          <div class="font-bold leading-relaxed">
            <p
              class="uppercase tracking-wider text-[10px] text-amber-400 mb-0.5"
            >
              Modo de Pruebas Activo
            </p>
            <p class="text-text-muted font-medium text-[11px] leading-relaxed">
              Al guardar, la factura no se grabará en la base de datos SQL (saFacturaVenta), pero se enviará de inmediato el ticket de pre-despacho a las impresoras correspondientes según la sub-línea de los artículos.
            </p>
          </div>
        </div> -->

        {#if hasMultipleOrigins}
          <div
            class="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs flex gap-2 items-start relative z-10"
          >
            <AlertTriangle size={16} class="shrink-0 mt-0.5" />
            <div>
              <p class="font-bold">Múltiples Pedidos Cargados</p>
              <p class="text-[10px] text-red-500/70 mt-1 font-medium leading-relaxed font-mono">
                Esta factura contiene artículos de múltiples pedidos ({originOrderNum}). Solo se permite sumar montos para visualización; la facturación está inhabilitada.
              </p>
            </div>
          </div>
        {/if}

        <!-- SAVE BUTTON -->
        <button
          onclick={saveAndPrintSimulatedInvoice}
          disabled={billingLines.length === 0 ||
            isSavingInvoice ||
            hasMultipleOrigins}
          class="w-full h-20 bg-brand-600 hover:bg-brand-500 disabled:bg-surface-soft text-white disabled:text-text-muted/30 rounded-[24px] font-black text-lg uppercase tracking-[0.2em] transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-4 shadow-xl shadow-brand-500/10 hover:shadow-brand-500/30 group relative z-10"
        >
          {#if isSavingInvoice}
            <RefreshCw size={24} class="animate-spin text-brand-400/40" />
            <span class="animate-pulse">Procesando...</span>
          {:else}
            <div class="bg-surface-strong/50 p-2.5 rounded-xl group-hover:scale-110 transition-transform">
              <Printer size={24} />
            </div>
            <span>Guardar</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>

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
          <h2 class="text-2xl font-black tracking-tight">Importar Pedido</h2>
          <p class="text-text-muted text-sm">
            Selecciona un pedido para cargarlo en la factura
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

      <!-- Search form/bar in modal -->
      <div class="p-6 border-b border-border-subtle bg-surface-base">
        <div class="flex flex-col md:flex-row gap-4">
          <!-- Selector de Sucursal -->
          {#if data.branches && data.branches.length > 1}
            <div class="w-full md:w-60">
              <div class="relative group">
                <Store
                  size={16}
                  class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-brand-500 transition-colors pointer-events-none"
                />
                <select
                  bind:value={filterSede}
                  onchange={handleBranchChange}
                  class="w-full h-14 pl-10 pr-10 bg-surface-soft border border-border-subtle rounded-2xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-sm appearance-none cursor-pointer text-text-base"
                >
                  {#each data.branches || [] as b}
                    <option value={b.id}>{b.name}</option>
                  {/each}
                </select>
                <ChevronDown
                  size={16}
                  class="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
              </div>
            </div>
          {/if}

          <!-- Entrada de búsqueda -->
          <div class="flex-1 relative group h-14">
            <input
              type="text"
              bind:value={importSearchQuery}
              onkeydown={(e) => {
                if (e.key === "Enter") searchOrders();
              }}
              placeholder="Buscar por Nro de Pedido, RIF o Cliente..."
              class="w-full h-full bg-surface-base pl-6 pr-14 rounded-2xl border border-border-subtle focus:border-brand-500/30 outline-none transition-all font-bold text-sm placeholder:font-normal placeholder:text-text-secondary/30"
            />
            <button
              type="button"
              onclick={searchOrders}
              disabled={isSearchingOrders}
              class="absolute right-1 top-1 bottom-1 w-12 flex items-center justify-center bg-surface-soft hover:bg-surface-strong text-brand-400 rounded-xl transition-all border border-border-subtle active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Buscar"
            >
              {#if isSearchingOrders}
                <div
                  class="w-4.5 h-4.5 border-2 border-brand-500/20 border-t-brand-500 rounded-full animate-spin"
                ></div>
              {:else}
                <Search size={18} />
              {/if}
            </button>
          </div>
        </div>
      </div>

      <!-- Orders results list -->
      <div
        class="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar min-h-[300px]"
      >
        {#if isSearchingOrders}
          <div class="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 size={40} class="animate-spin text-brand-500" />
            <p class="text-text-muted font-bold animate-pulse">
              Buscando pedidos...
            </p>
          </div>
        {:else if foundOrders.length === 0}
          <div
            class="flex flex-col items-center justify-center py-20 gap-3 text-text-muted opacity-50 bg-surface-base"
          >
            <FileText size={48} />
            <p class="font-bold">Realiza una búsqueda de pedidos arriba</p>
          </div>
        {:else}
          {#each foundOrders as order (order.doc_num + order.sede_id)}
            <button
              onclick={() => loadOrderDetailAndImport(order)}
              class="w-full p-4 rounded-2xl bg-surface-soft border border-border-subtle hover:border-brand-500/50 hover:bg-surface-strong transition-all flex items-center justify-between group text-left cursor-pointer"
            >
              <div class="flex items-center gap-4">
                <div
                  class="bg-surface-strong p-3 rounded-xl group-hover:bg-brand-500/10 group-hover:text-brand-400 transition-colors"
                >
                  <FileText size={20} />
                </div>
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-black text-text-base"
                      >{order.doc_num}</span
                    >
                    <span
                      class="text-[10px] px-2 py-0.5 rounded-full bg-surface-strong text-text-muted font-bold uppercase"
                      >{getBranchName(order.sede_id) || "N/A"}</span
                    >
                    {#if String(order.status).trim() === '1'}
                      <span
                        class="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase tracking-wider"
                      >Parcial</span>
                    {:else}
                      <span
                        class="text-[9px] px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20 font-bold uppercase tracking-wider"
                      >Sin Procesar</span>
                    {/if}
                  </div>
                  <p
                    class="text-sm text-text-muted font-medium truncate max-w-[300px]"
                  >
                    {order.cli_des || order.co_cli}
                  </p>
                </div>
              </div>
              <div class="text-right">
                <p class="font-black text-text-base">
                  $ {(Number(order.total_neto) / (Number(order.tasa || 1) > 1 ? Number(order.tasa) : Number(order.tasa_actual || 1))).toFixed(2)} USD
                </p>
                <p
                  class="text-[10px] text-text-muted font-bold uppercase mt-0.5"
                >
                  {dayjs(order.fec_emis).format("DD/MM/YYYY")}
                </p>
              </div>
            </button>
          {/each}
        {/if}
      </div>

      <!-- View 1 Footer -->
      <div
        class="p-6 border-t border-border-subtle bg-surface-soft/40 flex justify-end"
      >
        <button
          type="button"
          onclick={() => {
            showImportModal = false;
          }}
          class="h-14 px-8 rounded-2xl bg-surface-strong hover:bg-surface-base border border-border-subtle font-bold text-sm tracking-wide transition-all active:scale-[0.97] cursor-pointer text-text-base"
        >
          Cancelar
        </button>
      </div>
    </div>

    {#if isLoadingOrderDetail}
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
