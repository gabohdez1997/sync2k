<!-- src/routes/dashboard/billing/+page.svelte -->
<script lang="ts">
  import { fade, slide, scale } from 'svelte/transition';
  import { 
    Receipt, Search, Filter, Plus, FileText, ArrowRight,
    Printer, Trash2, User, Landmark, ShoppingBag, 
    RefreshCw, CheckCircle2, AlertTriangle, X, ShieldAlert,
    CheckSquare, Square, Store, ChevronLeft, ChevronDown, Check, Loader2
  } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import dayjs from 'dayjs';

  let { data } = $props();

  // Active Billing State
  let filterSede = $state(data.selectedBranchId || '');
  
  let selectedClient = $state<any>(null);
  let billingLines = $state<any[]>([]);
  let originOrderNum = $state<string | null>(null);

  // Search/Import Modal State
  let showImportModal = $state(false);
  let importSearchQuery = $state('');
  let isSearchingOrders = $state(false);
  let foundOrders = $state<any[]>([]);
  
  let selectedOrderDetails = $state<any>(null);
  let isLoadingOrderDetail = $state(false);
  let orderLinesSelection = $state<Record<number, boolean>>({});

  let isSavingInvoice = $state(false);



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
    const total = subtotal + tax;
    return { subtotal, tax, total };
  });

  function handleBranchChange() {
    const params = new URLSearchParams($page.url.searchParams);
    if (filterSede) params.set('branch_id', filterSede); else params.delete('branch_id');
    goto(`?${params.toString()}`);
  }

  // --- SEARCH ORDERS FLOW ---
  async function searchOrders() {
    if (!filterSede) {
      toast.error('Selecciona una sucursal primero');
      return;
    }
    isSearchingOrders = true;
    selectedOrderDetails = null;
    foundOrders = [];

    try {
      const response = await fetch(`/api/agent/orders?branch_id=${filterSede}&search=${encodeURIComponent(importSearchQuery)}`);
      const result = await response.json();

      if (result.success) {
        foundOrders = result.data || [];
        if (foundOrders.length === 0) {
          toast.warning('No se encontraron pedidos con esos criterios.');
        }
      } else {
        toast.error(result.message || 'Error al buscar pedidos.');
      }
    } catch (err: any) {
      toast.error('Error de red: ' + err.message);
    } finally {
      isSearchingOrders = false;
    }
  }

  async function loadOrderDetail(order: any) {
    isLoadingOrderDetail = true;
    selectedOrderDetails = null;
    orderLinesSelection = {};

    try {
      // API routes details: fetch full order details
      const response = await fetch(`/api/agent/orders/${order.doc_num}?branch_id=${filterSede}`);
      const result = await response.json();

      if (result.success && result.data && result.data.length > 0) {
        // Multi-sede endpoint returns array
        selectedOrderDetails = result.data[0];
        
        // Check all lines by default
        const lines = selectedOrderDetails.renglones || [];
        lines.forEach((line: any) => {
          orderLinesSelection[line.reng_num] = true;
        });
      } else {
        toast.error(result.message || 'No se pudo cargar el detalle del pedido.');
      }
    } catch (err: any) {
      toast.error('Error al cargar detalle del pedido: ' + err.message);
    } finally {
      isLoadingOrderDetail = false;
    }
  }

  function toggleAllOrderLines() {
    if (!selectedOrderDetails) return;
    const lines = selectedOrderDetails.renglones || [];
    const allChecked = lines.every((l: any) => orderLinesSelection[l.reng_num]);
    
    lines.forEach((l: any) => {
      orderLinesSelection[l.reng_num] = !allChecked;
    });
  }

  function importSelectedLines() {
    if (!selectedOrderDetails) return;

    const lines = selectedOrderDetails.renglones || [];
    const selectedLines = lines
      .filter((l: any) => orderLinesSelection[l.reng_num])
      .map((l: any) => ({
        ...l,
        checked: true
      }));

    if (selectedLines.length === 0) {
      toast.error('Selecciona al menos un artículo para importar.');
      return;
    }

    selectedClient = {
      co_cli: selectedOrderDetails.co_cli,
      cli_des: selectedOrderDetails.cli_des,
      rif: selectedOrderDetails.rif,
      direc1: selectedOrderDetails.direc1,
      telefonos: selectedOrderDetails.telefonos,
      email: selectedOrderDetails.email,
      co_cond: selectedOrderDetails.co_cond,
      co_ven: selectedOrderDetails.co_ven,
      ven_des: selectedOrderDetails.ven_des
    };

    billingLines = selectedLines;
    originOrderNum = selectedOrderDetails.doc_num;
    
    toast.success(`Pedido ${originOrderNum} importado (${selectedLines.length} artículos)`);
    showImportModal = false;
    
    // Clear search modal state
    foundOrders = [];
    importSearchQuery = '';
    selectedOrderDetails = null;
  }

  // --- BILLING SCREEN ACTIONS ---
  function toggleBillingLine(index: number) {
    billingLines[index].checked = !billingLines[index].checked;
  }

  function removeBillingLine(index: number) {
    billingLines = billingLines.filter((_, idx) => idx !== index);
    if (billingLines.length === 0) {
      selectedClient = null;
      originOrderNum = null;
    }
  }

  async function saveAndPrintSimulatedInvoice() {
    const activeLines = billingLines.filter(l => l.checked);
    if (activeLines.length === 0) {
      toast.error('Debes tener al menos un artículo seleccionado para facturar.');
      return;
    }

    isSavingInvoice = true;

    const simulatedInvoice = {
      doc_num: originOrderNum || 'SIM-TICKET',
      co_cli: selectedClient.co_cli,
      cli_des: selectedClient.cli_des,
      rif: selectedClient.rif,
      telefonos: selectedClient.telefonos,
      direc1: selectedClient.direc1,
      vendedor: selectedClient.ven_des || selectedClient.co_ven || '---',
      renglones: activeLines,
      total_bruto: invoiceTotals.subtotal,
      monto_imp: invoiceTotals.tax,
      total_neto: invoiceTotals.total
    };

    try {
      const response = await fetch(`/api/agent/billing/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: filterSede,
          invoice: simulatedInvoice
        })
      });
      const result = await response.json();

      if (result.success) {
        toast.success(result.message || '¡Factura simulada con éxito! Ticket enviado.');
        
        // Reset billing form
        selectedClient = null;
        billingLines = [];
        originOrderNum = null;
      } else {
        toast.error(result.message || 'Error al enviar impresión de la factura.');
      }
    } catch (err: any) {
      toast.error('Error al procesar simulación e impresión: ' + err.message);
    } finally {
      isSavingInvoice = false;
    }
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  
  <!-- TOP HEADER -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Receipt size={40} class="text-brand-500" />
        Facturación de Caja
      </h1>
      <p class="text-text-muted mt-2 text-lg">Importación de pedidos y facturación directa con ticketera ESC/POS.</p>
    </div>
    
    <div class="flex items-center gap-3">
      <!-- Sede Selector -->
      {#if data.branches && data.branches.length > 1}
        <div class="w-56 relative group">
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
        class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full md:w-auto"
      >
        <ShoppingBag size={18} />
        Importar Pedido
      </button>
    </div>
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
    
    <!-- LEFT/CENTER: INVOICE FORM & LINES -->
    <div class="xl:col-span-2 space-y-6">
      
      <!-- CLIENT INFO BOX -->
      <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-4">
        <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
          <User size={16} />
          Datos del Cliente
        </h3>
        
        {#if !selectedClient}
          <div class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-2">
            <User size={32} class="text-text-muted/30" />
            <p class="text-xs text-text-muted font-bold">No hay ningún cliente cargado. Haz clic en "Importar Pedido" para iniciar.</p>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4" in:slide>
            <div class="md:col-span-2 space-y-1">
              <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Nombre / Razón Social</span>
              <p class="text-base font-black text-text-base">{selectedClient.cli_des}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">RIF / CI</span>
              <p class="text-base font-bold font-mono text-text-base">{selectedClient.rif || '---'}</p>
            </div>
            <div class="md:col-span-2 space-y-1">
              <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Dirección</span>
              <p class="text-xs text-text-muted font-bold leading-relaxed">{selectedClient.direc1 || '---'}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Teléfono</span>
              <p class="text-xs text-text-muted font-bold font-mono">{selectedClient.telefonos || '---'}</p>
            </div>
          </div>
        {/if}
      </div>

      <!-- INVOICE RENG-LINES TABLE -->
      <div class="glass border border-border-subtle rounded-3xl shadow-xl overflow-hidden">
        <div class="p-6 border-b border-border-subtle bg-surface-soft/40 flex items-center justify-between">
          <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
            <ShoppingBag size={16} />
            Artículos a Facturar
          </h3>
          {#if originOrderNum}
            <span class="px-2 py-0.5 bg-brand-500/10 border border-brand-500/20 text-[9px] font-black text-brand-500 rounded">PEDIDO: {originOrderNum}</span>
          {/if}
        </div>

        {#if billingLines.length === 0}
          <div class="p-20 text-center flex flex-col items-center justify-center gap-3">
            <ShoppingBag size={48} class="text-text-muted/30 animate-pulse" />
            <h4 class="text-lg font-bold text-text-muted">Factura vacía</h4>
            <p class="text-xs text-text-muted/50 max-w-xs">Los artículos importados del pedido seleccionado aparecerán aquí.</p>
          </div>
        {:else}
          <div class="overflow-x-auto" in:slide>
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-surface-strong border-b border-border-subtle text-xs font-black uppercase tracking-wider text-text-muted">
                  <th class="px-6 py-4 w-12 text-center">Fact.</th>
                  <th class="px-6 py-4 w-12 text-center">Item</th>
                  <th class="px-6 py-4">Artículo</th>
                  <th class="px-6 py-4 text-center">Almacén</th>
                  <th class="px-6 py-4 text-center">Cantidad</th>
                  <th class="px-6 py-4 text-right">Precio USD</th>
                  <th class="px-6 py-4 text-right">Total USD</th>
                  <th class="px-6 py-4 text-right w-16"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-subtle text-xs">
                {#each billingLines as line, idx (line.co_art + idx)}
                  <tr class="hover:bg-surface-soft/60 transition-colors {line.checked ? '' : 'opacity-40'}">
                    <!-- Checked status toggle -->
                    <td class="px-6 py-4 text-center">
                      <button 
                        onclick={() => toggleBillingLine(idx)}
                        class="p-1 rounded text-brand-500 hover:bg-brand-500/10 transition cursor-pointer"
                      >
                        {#if line.checked}
                          <CheckSquare size={18} />
                        {:else}
                          <Square size={18} class="text-text-muted/40" />
                        {/if}
                      </button>
                    </td>
                    
                    <td class="px-6 py-4 text-center font-mono text-text-muted">
                      {line.reng_num || (idx + 1)}
                    </td>
                    
                    <td class="px-6 py-4">
                      <div class="flex flex-col gap-0.5 max-w-[200px]">
                        <span class="font-black text-text-base truncate">{line.art_des}</span>
                        <span class="text-[9px] text-text-muted font-mono font-bold">{line.co_art.trim()}</span>
                      </div>
                    </td>
                    
                    <td class="px-6 py-4 text-center font-bold text-text-muted">
                      {line.co_alma.trim()}
                    </td>
                    
                    <td class="px-6 py-4 text-center font-black text-text-base">
                      {Number(line.cantidad).toFixed(2)}
                    </td>
                    
                    <td class="px-6 py-4 text-right font-bold text-text-muted">
                      $ {Number(line.precio).toFixed(2)}
                    </td>
                    
                    <td class="px-6 py-4 text-right font-black text-brand-500">
                      $ {(Number(line.cantidad) * Number(line.precio)).toFixed(2)}
                    </td>

                    <!-- Remove row -->
                    <td class="px-6 py-4 text-right">
                      <button 
                        onclick={() => removeBillingLine(idx)}
                        class="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all active:scale-95 cursor-pointer"
                        title="Quitar Renglón"
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

    <!-- RIGHT COLUMN: TOTALS & PRINT SETTINGS -->
    <div class="xl:col-span-1">
      <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-6 sticky top-24">
        <h3 class="text-lg font-black tracking-tight text-text-base flex items-center gap-2 border-b border-border-subtle pb-4">
          <Receipt size={20} class="text-brand-500" />
          Resumen de Factura
        </h3>

        <!-- TOTALS BOARD -->
        <div class="p-5 rounded-2xl bg-surface-soft border border-border-subtle space-y-3 font-bold text-sm">
          <div class="flex justify-between text-text-muted">
            <span>Subtotal:</span>
            <span>$ {invoiceTotals.subtotal.toFixed(2)}</span>
          </div>
          <div class="flex justify-between text-text-muted">
            <span>I.V.A.:</span>
            <span>$ {invoiceTotals.tax.toFixed(2)}</span>
          </div>
          <div class="border-t border-border-subtle pt-3 flex justify-between text-base font-black text-text-base">
            <span>TOTAL GENERAL:</span>
            <span class="text-brand-400">$ {invoiceTotals.total.toFixed(2)}</span>
          </div>
        </div>

        <!-- PRINTER SETTINGS -->
        {#if data.printers.length === 0}
          <div class="p-3 bg-red-500/5 border border-red-500/10 text-red-400 rounded-xl text-xs flex gap-2 items-start mb-3">
            <AlertTriangle size={16} class="shrink-0 mt-0.5" />
            <div>
              <p class="font-bold">Sin Impresoras Disponibles</p>
              <p class="text-[10px] text-red-500/70 mt-1 font-medium">Debes configurar al menos una impresora en el módulo de Sistema para esta sucursal.</p>
            </div>
          </div>
        {/if}

        <div class="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex gap-3 text-amber-500 text-xs">
          <ShieldAlert size={18} class="shrink-0 mt-0.5" />
          <div class="font-bold leading-relaxed">
            <p class="uppercase tracking-wider text-[10px] text-amber-400 mb-0.5">Modo de Pruebas Activo</p>
            <p class="text-text-muted font-medium text-[11px]">Al guardar, la factura no se grabará en la base de datos SQL (saFacturaVenta), pero se enviará de inmediato el ticket de pre-despacho a las impresoras correspondientes según la sub-línea de los artículos.</p>
          </div>
        </div>

        <!-- SAVE BUTTON -->
        <button 
          onclick={saveAndPrintSimulatedInvoice}
          disabled={billingLines.length === 0 || data.printers.length === 0 || isSavingInvoice}
          class="w-full h-14 bg-brand-600 hover:bg-brand-500 disabled:bg-surface-soft text-white disabled:text-text-muted/30 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 shadow-xl shadow-brand-500/10 hover:shadow-brand-500/30"
        >
          {#if isSavingInvoice}
            <RefreshCw size={18} class="animate-spin" />
          {:else}
            <Printer size={18} />
          {/if}
          Guardar e Imprimir Factura
        </button>
      </div>
    </div>

  </div>

</div>

{#if showImportModal}
  <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" in:fade>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0" onclick={() => { showImportModal = false; selectedOrderDetails = null; }}></div>

    <div class="w-full max-w-2xl bg-surface-base border border-border-subtle rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh] relative z-10" 
         in:scale={{ duration: 200, start: 0.95 }}>
      
      <!-- Modal Header -->
      <div class="p-8 border-b border-border-subtle flex justify-between items-center bg-surface-soft/50">
        <div>
          {#if selectedOrderDetails}
            <div class="flex items-center">
              <button
                type="button"
                onclick={() => (selectedOrderDetails = null)}
                class="mr-3 p-2 hover:bg-surface-strong rounded-full transition-colors flex items-center justify-center text-text-muted hover:text-text-base active:scale-90 cursor-pointer"
              >
                <ChevronLeft size={20} />
              </button>
              <div>
                <h2 class="text-2xl font-black tracking-tight">
                  Pedido {selectedOrderDetails.doc_num?.trim()}
                </h2>
                <p class="text-text-muted text-sm truncate max-w-[400px]">
                  {selectedOrderDetails.cli_des?.trim() || selectedOrderDetails.co_cli?.trim()}
                </p>
              </div>
            </div>
          {:else}
            <h2 class="text-2xl font-black tracking-tight">
              Importar Pedido
            </h2>
            <p class="text-text-muted text-sm">
              Selecciona un pedido para cargarlo en la factura
            </p>
          {/if}
        </div>
        <button
          type="button"
          onclick={() => {
            showImportModal = false;
            selectedOrderDetails = null;
          }}
          class="p-2 hover:bg-surface-strong rounded-full transition-colors cursor-pointer"
        >
          <X size={24} />
        </button>
      </div>

      {#if !selectedOrderDetails}
        <!-- Search form/bar in modal -->
        <div class="p-6 border-b border-border-subtle bg-surface-base">
          <div class="flex flex-col md:flex-row gap-4">
            <!-- Selector de Sucursal -->
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

            <!-- Entrada de búsqueda -->
            <div class="flex-1 relative group h-14">
              <input
                type="text"
                bind:value={importSearchQuery}
                onkeydown={(e) => { if (e.key === 'Enter') searchOrders(); }}
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
                  <div class="w-4.5 h-4.5 border-2 border-brand-500/20 border-t-brand-500 rounded-full animate-spin"></div>
                {:else}
                  <Search size={18} />
                {/if}
              </button>
            </div>
          </div>
        </div>

        <!-- Orders results list -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar min-h-[300px]">
          {#if isSearchingOrders}
            <div class="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 size={40} class="animate-spin text-brand-500" />
              <p class="text-text-muted font-bold animate-pulse">
                Buscando pedidos...
              </p>
            </div>
          {:else if foundOrders.length === 0}
            <div class="flex flex-col items-center justify-center py-20 gap-3 text-text-muted opacity-50 bg-surface-base">
              <FileText size={48} />
              <p class="font-bold">Realiza una búsqueda de pedidos arriba</p>
            </div>
          {:else}
            {#each foundOrders as order (order.doc_num + order.sede_id)}
              <button
                onclick={() => loadOrderDetail(order)}
                class="w-full p-4 rounded-2xl bg-surface-soft border border-border-subtle hover:border-brand-500/50 hover:bg-surface-strong transition-all flex items-center justify-between group text-left cursor-pointer"
              >
                <div class="flex items-center gap-4">
                  <div
                    class="bg-surface-strong p-3 rounded-xl group-hover:bg-brand-500/10 group-hover:text-brand-400 transition-colors"
                  >
                    <FileText size={20} />
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-black text-text-base">{order.doc_num}</span>
                      <span
                        class="text-[10px] px-2 py-0.5 rounded-full bg-surface-strong text-text-muted font-bold uppercase"
                        >{getBranchName(order.sede_id) || "N/A"}</span
                      >
                    </div>
                    <p class="text-sm text-text-muted font-medium truncate max-w-[300px]">
                      {order.cli_des || order.co_cli}
                    </p>
                  </div>
                </div>
                <div class="text-right">
                  <p class="font-black text-text-base">
                    $ {Number(order.total_neto).toFixed(2)} USD
                  </p>
                  <p class="text-[10px] text-text-muted font-bold uppercase mt-0.5">
                    {dayjs(order.fec_emis).format('DD/MM/YYYY')}
                  </p>
                </div>
              </button>
            {/each}
          {/if}
        </div>

        <!-- View 1 Footer -->
        <div class="p-6 border-t border-border-subtle bg-surface-soft/40 flex justify-end">
          <button
            type="button"
            onclick={() => { showImportModal = false; }}
            class="h-14 px-8 rounded-2xl bg-surface-strong hover:bg-surface-base border border-border-subtle font-bold text-sm tracking-wide transition-all active:scale-[0.97] cursor-pointer text-text-base"
          >
            Cancelar
          </button>
        </div>
      {:else}
        <!-- Selection of order lines screen (View 2) -->
        <div class="p-4 border-b border-border-subtle bg-surface-soft/20 flex items-center justify-between text-xs font-bold text-text-muted">
          <span>Selecciona los renglones a importar</span>
          <button 
            onclick={toggleAllOrderLines}
            class="text-[10px] font-black text-brand-400 hover:text-brand-300 transition-colors uppercase tracking-wider cursor-pointer"
          >
            Seleccionar Todo
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar min-h-[300px] bg-surface-base">
          {#each selectedOrderDetails.renglones || [] as line (line.reng_num)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div 
              onclick={() => { orderLinesSelection[line.reng_num] = !orderLinesSelection[line.reng_num]; }}
              class="p-4 rounded-2xl border border-border-subtle hover:border-brand-500/30 transition-all bg-surface-soft/40 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
            >
              <!-- Checkbox e Info del Renglón -->
              <div class="flex items-start gap-3 flex-1 min-w-0">
                <div class="relative flex items-center justify-center cursor-pointer mt-1 select-none">
                  <div class="w-6 h-6 border-2 border-border-bold rounded-lg transition-all flex items-center justify-center text-white {orderLinesSelection[line.reng_num] ? 'bg-brand-600 border-brand-600' : 'border-border-bold'}">
                    {#if orderLinesSelection[line.reng_num]}
                      <Check size={14} class="stroke-[3]" />
                    {/if}
                  </div>
                </div>
                
                <div class="flex-1 min-w-0 ml-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-black text-text-base text-xs bg-surface-strong/60 px-2 py-0.5 rounded-lg border border-border-subtle">
                      {line.co_art?.trim()}
                    </span>
                  </div>
                  <p class="text-sm font-bold text-text-base mt-1.5 truncate leading-tight">
                    {line.art_des?.trim()}
                  </p>
                  <p class="text-[11px] text-text-muted font-semibold mt-1">
                    Cantidad: <span class="text-text-base font-bold">{Number(line.cantidad).toFixed(2)}</span> {line.co_uni?.trim()}
                  </p>
                </div>
              </div>

              <!-- Precio del Renglón -->
              <div class="text-right shrink-0">
                <p class="font-black text-text-base text-sm">
                  $ {Number(line.precio).toFixed(2)} USD
                </p>
                <p class="text-[10px] text-text-muted font-bold">
                  Total: $ {Number(line.total_renglon || (line.cantidad * line.precio)).toFixed(2)}
                </p>
              </div>
            </div>
          {/each}
        </div>

        <!-- View 2 Footer -->
        <div class="p-6 border-t border-border-subtle bg-surface-soft/40 flex gap-4 items-center justify-between">
          <button
            type="button"
            onclick={() => (selectedOrderDetails = null)}
            class="h-14 px-6 rounded-2xl bg-surface-strong hover:bg-surface-base border border-border-subtle font-bold text-sm tracking-wide transition-all active:scale-[0.97] cursor-pointer text-text-base"
          >
            Volver
          </button>
          <button
            type="button"
            onclick={importSelectedLines}
            class="h-14 px-8 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-sm tracking-wide transition-all active:scale-[0.97] shadow-lg shadow-brand-500/20 cursor-pointer"
          >
            Confirmar Importación
          </button>
        </div>
      {/if}

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
            <p class="font-black text-lg tracking-tight">CARGANDO RENGLONES...</p>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
