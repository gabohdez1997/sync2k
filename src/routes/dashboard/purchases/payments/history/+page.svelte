<!-- src/routes/dashboard/purchases/payments/history/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto, invalidateAll } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { 
    Wallet, Search, Plus, Eye, X, Trash2, Pen,
    AlertCircle, RefreshCw, AlertTriangle, Building, CreditCard, Landmark, CheckCircle,
    FileText, ChevronLeft, ChevronRight, Ban, Store, Lock, Check, Loader2, Clock, Receipt
  } from 'lucide-svelte';
  import { fade } from 'svelte/transition';
  import { toast } from 'svelte-sonner';
  import SearchBar from "$lib/components/ui/SearchBar.svelte";
  import Combobox from "$lib/components/ui/Combobox.svelte";

  let { data } = $props();

  // Estados de Modales
  let showVoidModal = $state(false);
  let paymentToVoid = $state<any>(null);
  let voidPassword = $state('');
  let isVoiding = $state(false);

  function openVoidModal(payment: any) {
    paymentToVoid = payment;
    voidPassword = '';
    showVoidModal = true;
  }

  // Modal de Edición
  let showEditModal = $state(false);
  let paymentToEdit = $state<any>(null);
  let editPassword = $state('');
  let isEditing = $state(false);

  function openEditModal(payment: any) {
    paymentToEdit = payment;
    editPassword = '';
    showEditModal = true;
  }

  // Modal de Eliminación Definitiva
  let showDeleteModal = $state(false);
  let paymentToDelete = $state<any>(null);
  let deletePassword = $state('');
  let isDeleting = $state(false);

  function openDeleteModal(payment: any) {
    paymentToDelete = payment;
    deletePassword = '';
    showDeleteModal = true;
  }

  let searchInput = $state('');
  let selectedBranch = $state(data.selectedBranchId);
  let filterFecD = $state('');
  let filterFecH = $state('');

  // Sincronizar inputs si cambian desde la URL
  $effect(() => {
    selectedBranch = data.selectedBranchId;
    searchInput = data.filters?.search || $page.url.searchParams.get('search') || '';
    filterFecD = data.filters?.fec_d || $page.url.searchParams.get('fec_d') || '';
    filterFecH = data.filters?.fec_h || $page.url.searchParams.get('fec_h') || '';
  });

  // Funciones de navegación y filtrado
  function applyFilters(pageNumber = 1) {
    const qParams = new URLSearchParams();
    qParams.set('branch_id', selectedBranch);
    qParams.set('page', String(pageNumber));
    if (searchInput) qParams.set('search', searchInput);
    if (filterFecD) qParams.set('fec_d', filterFecD);
    if (filterFecH) qParams.set('fec_h', filterFecH);
    
    goto(`?${qParams.toString()}`);
  }

  // Modal de Detalle
  let detailModalOpen = $state(false);
  let loadingDetail = $state(false);
  let detailData = $state<any>(null);
  let selectedPayment = $state<any>(null);
  let detailError = $state<string | null>(null);

  async function openDetail(payment: any) {
    selectedPayment = payment;
    detailModalOpen = true;
    loadingDetail = true;
    detailError = null;
    detailData = null;
    const rawCob = typeof payment === 'string' ? payment : payment?.cob_num;
    const cobNum = (rawCob || '').trim();
    const branchId = selectedBranch || payment?.branch_id || data.selectedBranchId;
    try {
      const res = await fetch(`/api/agent/payables/payments/${encodeURIComponent(cobNum)}?branch_id=${branchId}`);
      if (res.ok) {
        const resJson = await res.json();
        if (resJson.success && resJson.data) {
          detailData = Array.isArray(resJson.data) ? resJson.data[0] : resJson.data;
        } else {
          detailError = resJson.message || 'No se pudo obtener el desglose del pago en el agente.';
        }
      } else {
        const resErr = await res.json().catch(() => ({}));
        detailError = resErr.message || resErr.error || `Error al consultar: ${res.statusText}`;
      }
    } catch (e: any) {
      detailError = `Error de red: ${e.message}`;
    } finally {
      loadingDetail = false;
    }
  }

  function parseDocumentosAsociados(docStr: string) {
    if (!docStr || docStr === '---') return [];
    return docStr.split(',').map(s => {
      const parts = s.trim().split(':');
      const docTypeAndNum = parts[0]?.trim() || '';
      const totalNeto = Number(parts[1]?.trim() || '0');
      return {
        doc: docTypeAndNum,
        totalNeto
      };
    }).filter(d => d.doc);
  }
</script>

<svelte:head>
  <title>Historial de Pagos a Proveedores - Sistema Profit Plus</title>
</svelte:head>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-[1600px] mx-auto pb-24">
  
  <!-- CABECERA -->
  <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
    <div>
      <h1 class="text-3xl sm:text-4xl font-black tracking-tight flex items-center gap-3 text-text-base">
        <Wallet size={36} class="text-brand-500" />
        {data.title}
      </h1>
      <p class="text-text-muted mt-2 text-base">Historial de pagos emitidos a proveedores con retenciones de IVA e ISLR.</p>
    </div>

    {#if data.canCreate}
      <div class="flex flex-wrap items-center gap-4">
        <a 
          href="/dashboard/purchases/payments?branch_id={selectedBranch}"
          class="flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-500 text-white h-14 px-8 rounded-2xl font-black shadow-xl shadow-brand-500/20 transition-all active:scale-95 shrink-0 w-full md:w-auto cursor-pointer"
        >
          <Plus size={20} />
          Nuevo Pago
        </a>
      </div>
    {/if}
  </div>

  <!-- ERRORES DE CARGA -->
  {#if data.error}
    <div class="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex items-start gap-4 text-red-400">
      <AlertTriangle size={24} class="shrink-0 mt-1" />
      <div>
        <h4 class="font-bold text-lg">Error de Comunicación</h4>
        <p class="mt-1 text-sm">{data.error}</p>
        <button 
          onclick={() => applyFilters(1)}
          class="mt-3 flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
        >
          <RefreshCw size={14} />
          Reintentar Conexión
        </button>
      </div>
    </div>
  {/if}

  <!-- FILTROS -->
  <div
    class="glass p-4 rounded-3xl border border-border-subtle shadow-2xl grid grid-cols-1 md:grid-cols-4 gap-4 items-center mb-6 w-full relative z-20"
  >
    {#if data.branches && data.branches.length > 1}
      <div class="w-full">
        <Combobox
          options={data.branches.map((b: any) => ({ value: b.id, label: b.name }))}
          bind:value={selectedBranch}
          placeholder="Sucursal..."
          icon={Store}
          class="w-full h-12"
          onchange={() => applyFilters(1)}
        />
      </div>
    {/if}

    <div class="w-full {!(data.branches && data.branches.length > 1) ? 'md:col-span-2' : ''}">
      <SearchBar
        bind:value={searchInput}
        isSearching={false}
        onsubmit={() => applyFilters(1)}
        placeholder="Buscar por proveedor, RIF, pago o recibo..."
        className="w-full h-12"
      />
    </div>

    <!-- Date From -->
    <div class="w-full">
      <input
        type="date"
        bind:value={filterFecD}
        onchange={() => applyFilters(1)}
        placeholder="Desde"
        class="w-full h-12 px-4 bg-surface-soft border border-border-subtle rounded-2xl text-xs font-bold text-text-base focus:border-brand-500 outline-none transition-all"
        title="Fecha Pago Desde"
      />
    </div>

    <!-- Date To -->
    <div class="w-full">
      <input
        type="date"
        bind:value={filterFecH}
        onchange={() => applyFilters(1)}
        placeholder="Hasta"
        class="w-full h-12 px-4 bg-surface-soft border border-border-subtle rounded-2xl text-xs font-bold text-text-base focus:border-brand-500 outline-none transition-all"
        title="Fecha Pago Hasta"
      />
    </div>
  </div>

  <!-- TABLA DE MOVIMIENTOS -->
  {#if data.payments && data.payments.length > 0}
    <div class="glass rounded-[32px] border border-white/5 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-white/5 bg-white/[0.02] text-text-muted text-xs font-bold uppercase tracking-wider">
              <th class="px-6 py-5">Fecha</th>
              <th class="px-6 py-5">Nro. Pago</th>
              <th class="px-6 py-5">Facturas de Compra</th>
              <th class="px-6 py-5">Proveedor</th>
              <th class="px-6 py-5 text-right">Monto</th>
              {#if data.canSeeOthers}
                <th class="px-6 py-5 text-center">Registrado Por</th>
              {/if}
              <th class="px-6 py-5">Estado</th>
              <th class="px-6 py-5 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5 text-sm text-text-base">
            {#each data.payments as p}
              <tr class="hover:bg-white/[0.02] transition-colors group">
                <td class="px-6 py-5">
                  <div class="font-bold text-text-base">{new Date(p.fecha).toLocaleDateString('es-VE')}</div>
                  <div class="text-xs text-text-muted/60 mt-0.5">{new Date(p.fecha).toLocaleTimeString('es-VE', {hour: '2-digit', minute:'2-digit'})}</div>
                </td>
                <td class="px-6 py-5">
                  <span
                    class="px-2.5 py-1 rounded-lg bg-surface-soft border border-border-subtle text-xs font-black text-brand-500 group-hover:bg-brand-500 group-hover:border-brand-500 group-hover:text-white transition-all inline-block font-mono"
                  >
                    {p.cob_num}
                  </span>
                  {#if p.recibo && p.recibo.trim() !== p.cob_num.trim()}
                    <div class="text-xs text-text-muted/60 mt-1">Recibo: {p.recibo}</div>
                  {/if}
                </td>
                <td class="px-6 py-5">
                  <div class="flex flex-wrap gap-1.5 items-center">
                    {#each parseDocumentosAsociados(p.documentos_asociados) as doc}
                      <span
                        class="px-2 py-0.5 rounded-md bg-brand-500/10 border border-brand-500/20 text-xs font-bold text-brand-400 inline-block font-mono"
                      >
                        {doc.doc}
                      </span>
                    {:else}
                      <span class="text-xs text-text-muted/50">---</span>
                    {/each}
                  </div>
                </td>
                <td class="px-6 py-5 max-w-xs">
                  <div class="font-bold truncate">{p.prov_des || p.co_prov}</div>
                  <div class="text-xs text-text-muted/60 mt-0.5 font-mono">{p.co_prov} • {p.rif || 'S/R'}</div>
                </td>
                <td class="px-6 py-5 text-right font-bold">
                  <div class="text-base text-text-base">
                    <span class="text-text-muted text-xs font-medium mr-1">USD</span>
                    {Number(p.monto / (p.tasa > 0 ? p.tasa : 1)).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </div>
                  <div class="text-xs text-text-muted/60 mt-0.5">
                    <span>Bs. </span>
                    {Number(p.monto).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    <span class="text-[10px] text-text-muted/40 ml-1">(Tasa: {Number(p.tasa).toLocaleString('de-DE', {minimumFractionDigits: 2})})</span>
                  </div>
                </td>
                {#if data.canSeeOthers}
                  <td class="px-6 py-5 text-center">
                    <span
                      class="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold uppercase tracking-wider"
                    >
                      {p.user_name || p.co_us_in || "---"}
                    </span>
                  </td>
                {/if}
                <td class="px-6 py-5">
                  {#if p.anulado}
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                      Anulado
                    </span>
                  {:else}
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                      Activo
                    </span>
                  {/if}
                </td>
                <td class="px-6 py-5">
                  <div class="flex items-center justify-center gap-1.5">
                    <button 
                      onclick={() => openDetail(p)}
                      class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all cursor-pointer"
                      title="Ver Detalle del Pago"
                    >
                      <Eye size={18} />
                    </button>
                    {#if data.canEdit && !p.anulado}
                      <button 
                        onclick={() => openEditModal(p)}
                        class="p-2 text-text-muted hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all cursor-pointer"
                        title="Editar Pago (Revertir y cargar)"
                      >
                        <Pen size={18} />
                      </button>
                    {/if}
                    {#if data.canVoid && !p.anulado}
                      <button 
                        onclick={() => openVoidModal(p)}
                        class="p-2 text-text-muted hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all cursor-pointer"
                        title="Anular Pago"
                      >
                        <Ban size={18} />
                      </button>
                    {/if}
                    {#if data.canDelete}
                      <button 
                        onclick={() => openDeleteModal(p)}
                        class="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
                        title="Eliminar Pago Permanentemente"
                      >
                        <Trash2 size={18} />
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- PAGINACIÓN -->
      {#if data.pagination && data.pagination.totalPages > 1}
        <div
          class="px-8 py-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-between"
        >
          <p class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
            Página <span class="text-text-base">{data.pagination.page}</span> de
            <span class="text-text-base">{data.pagination.totalPages}</span> (Total: {data.pagination.total})
          </p>

          <div class="flex items-center gap-2">
            <button
              disabled={data.pagination.page === 1}
              onclick={() => applyFilters(data.pagination.page - 1)}
              class="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all border border-white/5 text-text-muted cursor-pointer"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              disabled={data.pagination.page === data.pagination.totalPages}
              onclick={() => applyFilters(data.pagination.page + 1)}
              class="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all border border-white/5 text-text-muted cursor-pointer"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="glass p-16 rounded-[32px] border border-dashed border-border-subtle flex flex-col items-center justify-center text-center gap-4">
      <Wallet size={48} class="text-text-muted/30" />
      <h3 class="text-xl font-bold text-text-base">No hay pagos registrados</h3>
      <p class="text-sm text-text-muted max-w-sm">No se encontraron pagos con los filtros actuales o en esta sucursal.</p>
    </div>
  {/if}
</div>

<!-- MODAL DE DETALLE DE PAGO -->
{#if detailModalOpen}
  <div
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
    transition:fade={{ duration: 150 }}
  >
    <div
      class="fixed inset-0"
      onclick={() => (detailModalOpen = false)}
      onkeydown={(e) => e.key === "Escape" && (detailModalOpen = false)}
      role="button"
      tabindex="-1"
    ></div>

    <div
      class="bg-surface-raised border border-border-bold text-text-base rounded-[32px] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative z-10 animate-in zoom-in-95 duration-150"
    >
      <div class="p-6 border-b border-border-subtle flex items-center justify-between bg-surface-soft/40">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500">
            <Eye size={20} />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-black text-lg text-text-base">
                Detalle de Pago: {detailData?.cob_num || selectedPayment?.cob_num || ''}
              </h3>
              {#if (detailData?.anulado || selectedPayment?.anulado)}
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                  Anulado
                </span>
              {:else if (detailData || selectedPayment)}
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Activo
                </span>
              {/if}
            </div>
            <p class="text-xs text-text-muted">
              {detailData?.prov_des || selectedPayment?.prov_des || ''} ({detailData?.co_prov || selectedPayment?.co_prov || ''})
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => detailModalOpen = false}
          class="h-9 w-9 rounded-xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base flex items-center justify-center transition-all cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        {#if loadingDetail}
          <div class="py-16 flex flex-col items-center justify-center gap-3 text-text-muted">
            <RefreshCw size={28} class="animate-spin text-brand-500" />
            <p class="text-sm font-bold">Cargando desglose del pago...</p>
          </div>
        {:else if detailError}
          <div class="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 space-y-3">
            <div class="flex items-center gap-2 font-bold text-sm">
              <AlertTriangle size={18} />
              <span>No se pudo cargar el desglose del pago</span>
            </div>
            <p class="text-xs text-red-300/80 leading-relaxed">{detailError}</p>
            <div class="pt-2 flex gap-3">
              <button 
                type="button"
                onclick={() => openDetail(selectedPayment)}
                class="px-3.5 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={14} /> Reintentar
              </button>
              <button 
                type="button"
                onclick={() => detailModalOpen = false}
                class="px-3.5 py-2 bg-surface-soft hover:bg-surface-strong text-text-base rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        {:else if detailData}
          <!-- Resumen de Cabecera -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-surface-soft p-4 rounded-2xl border border-border-subtle text-xs">
            <div>
              <span class="text-[9px] uppercase font-bold text-text-muted block">Fecha Emisión</span>
              <span class="font-bold text-text-base">{new Date(detailData.fecha || Date.now()).toLocaleDateString('es-VE')}</span>
            </div>
            <div>
              <span class="text-[9px] uppercase font-bold text-text-muted block">Tasa Cambiaria</span>
              <span class="font-bold text-text-base">{Number(detailData.tasa || 1).toFixed(2)} Bs/$</span>
            </div>
            <div>
              <span class="text-[9px] uppercase font-bold text-text-muted block">Monto Total</span>
              <span class="font-bold text-brand-500 font-mono">
                $ {(Number(detailData.monto || 0) / (Number(detailData.tasa || 1) > 0 ? Number(detailData.tasa || 1) : 1)).toFixed(2)}
              </span>
            </div>
            <div>
              <span class="text-[9px] uppercase font-bold text-text-muted block">Estado</span>
              <span class="font-bold {detailData.anulado ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}">
                {detailData.anulado ? 'Anulado' : 'Activo'}
              </span>
            </div>
          </div>

          <!-- Documentos Pagados -->
          <div class="space-y-2">
            <h4 class="text-xs font-black uppercase tracking-wider text-text-muted flex items-center gap-2">
              <Receipt size={14} />
              Facturas y Documentos Pagados
            </h4>
            <div class="rounded-2xl border border-border-subtle overflow-hidden">
              <table class="w-full text-left text-xs">
                <thead class="bg-surface-soft border-b border-border-subtle text-text-muted uppercase font-bold text-[10px]">
                  <tr>
                    <th class="p-3">Doc</th>
                    <th class="p-3">Factura</th>
                    <th class="p-3 text-right">Abono (Bs)</th>
                    <th class="p-3 text-right">Reten. IVA (Bs)</th>
                    <th class="p-3 text-right">Reten. ISLR (Bs)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle">
                  {#each (detailData.renglones || []) as r}
                    <tr class="hover:bg-surface-soft/40 transition-colors">
                      <td class="p-3 font-mono font-bold text-brand-500">{r.co_tipo_doc} {r.nro_doc}</td>
                      <td class="p-3 text-text-base">{r.nro_fact || '---'}</td>
                      <td class="p-3 text-right font-mono font-bold text-text-base">Bs. {Number(r.mont_cob).toLocaleString('de-DE', {minimumFractionDigits: 2})}</td>
                      <td class="p-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">Bs. {Number(r.monto_retencion_iva || 0).toLocaleString('de-DE', {minimumFractionDigits: 2})}</td>
                      <td class="p-3 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">Bs. {Number(r.monto_retencion || 0).toLocaleString('de-DE', {minimumFractionDigits: 2})}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Retenciones de IVA -->
          {#if detailData.retenciones_iva && detailData.retenciones_iva.length > 0}
            {@const uniqueRetIva = (() => {
              const factRenglones = (detailData.renglones || []).filter(r => r.co_tipo_doc !== 'IVAN' && r.co_tipo_doc !== 'ISLR');

              const list = detailData.retenciones_iva.map((ri) => {
                const rawDoc = (ri.numero_documento_afectado || ri.nro_doc || '').trim();
                const docCode = (rawDoc !== '0' && rawDoc !== '---') ? rawDoc : '';

                // 1. Intentar buscar factura por coincidencia directa de doc o rowguid
                let renglon = factRenglones.find((r) => 
                  (docCode && (r.nro_doc?.trim() === docCode || r.nro_fact?.trim() === docCode)) ||
                  (ri.rowguid_reng_cob && r.rowguid === ri.rowguid_reng_cob)
                );

                // 2. Si el doc recibido era el del IVAN, buscar el renglón original a través de rowguid_reng_ori
                if (!renglon && docCode) {
                  const ivanRow = detailData.renglones?.find(r => r.co_tipo_doc === 'IVAN' && r.nro_doc?.trim() === docCode);
                  if (ivanRow?.rowguid_reng_ori) {
                    renglon = factRenglones.find(r => r.rowguid === ivanRow.rowguid_reng_ori);
                  }
                }

                // 3. Si solo hay una factura en el pago o con retención de IVA, asociarla
                if (!renglon && factRenglones.length === 1) {
                  renglon = factRenglones[0];
                }

                const factNum = (ri.nro_fact && ri.nro_fact !== '---' && ri.nro_fact !== '0')
                  ? ri.nro_fact.trim()
                  : (renglon?.nro_fact && renglon.nro_fact !== '---' && renglon.nro_fact !== '0')
                    ? renglon.nro_fact.trim()
                    : '';

                const internalDoc = (renglon?.nro_doc && renglon.nro_doc !== '---')
                  ? renglon.nro_doc.trim()
                  : (docCode && !docCode.startsWith('IVAN') ? docCode : '');

                return {
                  ...ri,
                  resolvedFactura: factNum,
                  resolvedDoc: internalDoc,
                  hasFacturaOrDoc: Boolean(factNum || internalDoc)
                };
              });

              // Filtrar solo los que tengan número de comprobante y factura/documento
              let valid = list.filter((r) => {
                const hasComp = Boolean(r.num_comprobante && r.num_comprobante.trim() !== '' && r.num_comprobante !== '---');
                return hasComp && r.hasFacturaOrDoc;
              });

              // Respaldo: si ninguno trajo doc directo, asociar con las facturas que tengan retención de IVA en el pago
              if (valid.length === 0 && list.length > 0) {
                const facturasConReten = factRenglones.filter(r => Number(r.monto_retencion_iva || 0) > 0);
                list.forEach((ri, idx) => {
                  const match = facturasConReten[idx] || facturasConReten[0] || factRenglones[0];
                  if (match) {
                    ri.resolvedFactura = (match.nro_fact && match.nro_fact !== '---') ? match.nro_fact : '';
                    ri.resolvedDoc = match.nro_doc || '';
                    ri.hasFacturaOrDoc = true;
                  }
                });
                valid = list.filter(r => r.num_comprobante && r.num_comprobante.trim() !== '' && r.hasFacturaOrDoc);
              }

              const seen = new Set();
              return valid.filter((item) => {
                const compKey = item.num_comprobante.trim();
                const docKey = item.resolvedFactura || item.resolvedDoc || '';
                const key = `${compKey}-${docKey}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
            })()}
            {#if uniqueRetIva.length > 0}
              <div class="space-y-2">
                <h4 class="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <CheckCircle size={14} />
                  Comprobantes de Retención de IVA
                </h4>
                <div class="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-3 space-y-2 text-xs">
                  {#each uniqueRetIva as ri}
                    {@const factDisplay = ri.resolvedFactura 
                      ? `${ri.resolvedFactura}${ri.resolvedDoc && ri.resolvedDoc !== ri.resolvedFactura ? ` (${ri.resolvedDoc})` : ''}` 
                      : ri.resolvedDoc}
                    <div class="flex flex-wrap justify-between items-center py-1 border-b border-emerald-500/10 last:border-0">
                      <div>
                        <span class="font-mono font-black text-emerald-600 dark:text-emerald-400">Comp: {ri.num_comprobante}</span>
                        <span class="text-text-muted ml-2">Factura: {factDisplay}</span>
                      </div>
                      <div class="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                        Retenido: Bs. {Number(ri.monto_ret_imp).toLocaleString('de-DE', {minimumFractionDigits: 2})} (Base: Bs. {Number(ri.base_imponible).toLocaleString('de-DE', {minimumFractionDigits: 2})})
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}

          <!-- Retenciones de ISLR -->
          {#if detailData.retenciones_islr && detailData.retenciones_islr.length > 0}
            {@const uniqueRetIslr = (() => {
              const factRenglones = (detailData.renglones || []).filter(r => r.co_tipo_doc !== 'IVAN' && r.co_tipo_doc !== 'ISLR');

              const list = detailData.retenciones_islr.map((rn) => {
                const rawDoc = (rn.nro_doc || '').trim();
                const docCode = (rawDoc !== '0' && rawDoc !== '---') ? rawDoc : '';

                let renglon = factRenglones.find((r) => 
                  (docCode && (r.nro_doc?.trim() === docCode || r.nro_fact?.trim() === docCode)) ||
                  (rn.rowguid_reng_cob && r.rowguid === rn.rowguid_reng_cob)
                );

                if (!renglon && docCode) {
                  const islrRow = detailData.renglones?.find(r => r.co_tipo_doc === 'ISLR' && r.nro_doc?.trim() === docCode);
                  if (islrRow?.rowguid_reng_ori) {
                    renglon = factRenglones.find(r => r.rowguid === islrRow.rowguid_reng_ori);
                  }
                }

                if (!renglon && factRenglones.length === 1) {
                  renglon = factRenglones[0];
                }

                const factNum = (rn.nro_fact && rn.nro_fact !== '---' && rn.nro_fact !== '0')
                  ? rn.nro_fact.trim()
                  : (renglon?.nro_fact && renglon.nro_fact !== '---' && renglon.nro_fact !== '0')
                    ? renglon.nro_fact.trim()
                    : '';

                const internalDoc = (renglon?.nro_doc && renglon.nro_doc !== '---')
                  ? renglon.nro_doc.trim()
                  : (docCode && !docCode.startsWith('ISLR') ? docCode : '');

                return {
                  ...rn,
                  resolvedFactura: factNum,
                  resolvedDoc: internalDoc,
                  hasFacturaOrDoc: Boolean(factNum || internalDoc)
                };
              });

              let valid = list.filter((r) => r.hasFacturaOrDoc);
              if (valid.length === 0 && list.length > 0) {
                valid = list;
              }

              const seen = new Set();
              return valid.filter((item) => {
                const key = `${item.co_islr?.trim()}-${item.resolvedFactura || item.resolvedDoc || ''}-${Number(item.monto_reten || 0).toFixed(2)}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
            })()}
            {#if uniqueRetIslr.length > 0}
              <div class="space-y-2">
                <h4 class="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <Landmark size={14} />
                  Retenciones de ISLR
                </h4>
                <div class="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3 space-y-2 text-xs">
                  {#each uniqueRetIslr as rn}
                    {@const factDisplay = rn.resolvedFactura 
                      ? `${rn.resolvedFactura}${rn.resolvedDoc && rn.resolvedDoc !== rn.resolvedFactura ? ` (${rn.resolvedDoc})` : ''}` 
                      : rn.resolvedDoc}
                    <div class="flex flex-wrap justify-between items-center py-1 border-b border-amber-500/10 last:border-0">
                      <div>
                        <span class="font-mono font-black text-amber-600 dark:text-amber-400">Concepto: {rn.co_islr}</span>
                        <span class="text-text-muted ml-2">Porc: {rn.porc_retn}%</span>
                        {#if factDisplay}
                          <span class="text-text-muted ml-2">Factura: {factDisplay}</span>
                        {/if}
                      </div>
                      <div class="font-mono font-bold text-amber-700 dark:text-amber-300">
                        Retenido: Bs. {Number(rn.monto_reten).toLocaleString('de-DE', {minimumFractionDigits: 2})} (Base: Bs. {Number(rn.monto_obj).toLocaleString('de-DE', {minimumFractionDigits: 2})})
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}

          <!-- Formas de Pago -->
          {#if detailData.formas_pago && detailData.formas_pago.length > 0}
            <div class="space-y-2">
              <h4 class="text-xs font-black uppercase tracking-wider text-text-muted flex items-center gap-2">
                <CreditCard size={14} />
                Instrumentos Emitidos
              </h4>
              <div class="rounded-2xl border border-border-subtle overflow-hidden">
                <table class="w-full text-left text-xs">
                  <thead class="bg-surface-soft border-b border-border-subtle text-text-muted uppercase font-bold text-[10px]">
                    <tr>
                      <th class="p-3">Forma</th>
                      <th class="p-3">Caja / Cuenta</th>
                      <th class="p-3">Referencia</th>
                      <th class="p-3 text-right">Monto (Bs)</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border-subtle">
                    {#each detailData.formas_pago as fp}
                      <tr class="hover:bg-surface-soft/40 transition-colors">
                        <td class="p-3 font-bold text-text-base">{fp.forma_pag === 'EF' ? 'Efectivo' : fp.forma_pag === 'TP' ? 'Transferencia' : fp.forma_pag}</td>
                        <td class="p-3 text-text-muted">{fp.caja_des || fp.cta_des || fp.cod_caja || fp.cod_cta || '---'}</td>
                        <td class="p-3 font-mono text-text-base">{fp.num_doc || '---'}</td>
                        <td class="p-3 text-right font-mono font-bold text-text-base">Bs. {Number(fp.mont_doc).toLocaleString('de-DE', {minimumFractionDigits: 2})}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- MODAL PARA CONFIRMAR ANULACIÓN CON CONTRASEÑA -->
{#if showVoidModal && paymentToVoid}
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={() => !isVoiding && (showVoidModal = false)}
      onkeydown={(e) => e.key === "Escape" && !isVoiding && (showVoidModal = false)}
      role="button"
      tabindex="-1"
    ></div>

    <div
      class="bg-surface-raised w-full max-w-md rounded-[40px] border border-border-bold shadow-2xl relative z-10 overflow-hidden text-text-base"
      transition:fade={{ duration: 150 }}
    >
      <div class="p-8 text-center space-y-6">
        <div class="h-20 w-20 rounded-3xl bg-amber-500/20 text-amber-500 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
          <Ban size={40} />
        </div>

        <div class="space-y-2">
          <h2 class="text-2xl font-black tracking-tight text-text-base">Confirmar Anulación</h2>
          <p class="text-text-muted text-sm px-4">
            ¿Estás seguro de que deseas anular el pago <span class="font-bold text-text-base">{paymentToVoid.cob_num}</span>?
            Esta acción restaurará el saldo pendiente de las facturas de compra y anulará los documentos de retención y movimientos asociados.
          </p>

          <div class="text-left p-4 rounded-2xl bg-surface-soft border border-border-subtle space-y-2 text-xs mt-4">
            <p class="text-text-muted"><span class="font-bold text-text-base">Proveedor:</span> {paymentToVoid.prov_des || paymentToVoid.co_prov}</p>
            <p class="text-text-muted"><span class="font-bold text-text-base">Pago N°:</span> {paymentToVoid.cob_num}</p>
            {#if paymentToVoid.monto}
              <p class="text-text-muted"><span class="font-bold text-text-base">Monto:</span> {paymentToVoid.co_mone || 'USD'} {Number(paymentToVoid.monto).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            {/if}
          </div>
        </div>

        <form
          method="POST"
          action="?/voidPayment"
          use:enhance={() => {
            isVoiding = true;
            return async ({ result }) => {
              isVoiding = false;
              if (result.type === 'success') {
                showVoidModal = false;
                toast.success('Pago anulado exitosamente.');
                invalidateAll();
              } else if (result.type === 'failure') {
                toast.error(result.data?.message || 'Error al anular el pago.');
              }
            };
          }}
          class="space-y-4 pt-4 text-left"
        >
          <input type="hidden" name="cob_num" value={paymentToVoid.cob_num} />
          <input type="hidden" name="branch_id" value={selectedBranch} />

          <div class="space-y-2 text-left">
            <label for="void-password" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">
              Contraseña de Confirmación
            </label>
            <div class="relative">
              <Lock size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" />
              <input
                id="void-password"
                name="password"
                type="password"
                required
                bind:value={voidPassword}
                placeholder="Introduzca su contraseña"
                class="w-full h-14 bg-surface-base border border-border-bold rounded-2xl pl-12 pr-5 focus:border-amber-500 outline-none transition-all text-text-base font-medium"
              />
            </div>
          </div>

          <div class="flex gap-3 pt-4">
            <button
              type="button"
              onclick={() => showVoidModal = false}
              disabled={isVoiding}
              class="flex-1 h-14 rounded-2xl font-bold bg-surface-soft hover:bg-surface-strong transition-all text-text-muted hover:text-text-base border border-border-subtle cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isVoiding || !voidPassword}
              class="flex-1 h-14 rounded-2xl font-bold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white shadow-lg shadow-amber-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              {#if isVoiding}
                <Loader2 size={18} class="animate-spin" />
              {:else}
                <Check size={18} />
                Anular Pago
              {/if}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL PARA CONFIRMAR EDICIÓN CON CONTRASEÑA -->
{#if showEditModal && paymentToEdit}
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={() => !isEditing && (showEditModal = false)}
      onkeydown={(e) => e.key === "Escape" && !isEditing && (showEditModal = false)}
      role="button"
      tabindex="-1"
    ></div>

    <div
      class="bg-surface-raised w-full max-w-md rounded-[40px] border border-border-bold shadow-2xl relative z-10 overflow-hidden text-text-base"
      transition:fade={{ duration: 150 }}
    >
      <div class="p-8 text-center space-y-6">
        <div class="h-20 w-20 rounded-3xl bg-blue-500/20 text-blue-500 flex items-center justify-center mx-auto shadow-lg shadow-blue-500/10">
          <Edit2 size={40} />
        </div>

        <div class="space-y-2">
          <h2 class="text-2xl font-black tracking-tight text-text-base">Editar Pago</h2>
          <p class="text-text-muted text-sm px-4">
            Para editar este pago, se revertirá el pago actual <span class="font-bold text-text-base">{paymentToEdit.cob_num}</span> en Profit Plus para liberar los saldos de sus facturas y serás redirigido al editor con el proveedor cargado.
          </p>

          <div class="text-left p-4 rounded-2xl bg-surface-soft border border-border-subtle space-y-2 text-xs mt-4">
            <p class="text-text-muted"><span class="font-bold text-text-base">Proveedor:</span> {paymentToEdit.prov_des || paymentToEdit.co_prov}</p>
            <p class="text-text-muted"><span class="font-bold text-text-base">Pago N°:</span> {paymentToEdit.cob_num}</p>
          </div>
        </div>

        <form
          method="POST"
          action="?/editPayment"
          use:enhance={() => {
            isEditing = true;
            return async ({ result }) => {
              isEditing = false;
              if (result.type === 'success') {
                showEditModal = false;
                toast.success(result.data?.message || 'Pago preparado para edición.');
                if (result.data?.redirectUrl) {
                  goto(result.data.redirectUrl);
                } else {
                  invalidateAll();
                }
              } else if (result.type === 'failure') {
                toast.error(result.data?.message || 'Error al autorizar edición del pago.');
              }
            };
          }}
          class="space-y-4 pt-4 text-left"
        >
          <input type="hidden" name="cob_num" value={paymentToEdit.cob_num} />
          <input type="hidden" name="branch_id" value={selectedBranch} />
          <input type="hidden" name="co_prov" value={paymentToEdit.co_prov} />
          <input type="hidden" name="anulado" value={paymentToEdit.anulado ? 'true' : 'false'} />

          <div class="space-y-2 text-left">
            <label for="edit-password" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">
              Contraseña de Confirmación
            </label>
            <div class="relative">
              <Lock size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" />
              <input
                id="edit-password"
                name="password"
                type="password"
                required
                bind:value={editPassword}
                placeholder="Introduzca su contraseña"
                class="w-full h-14 bg-surface-base border border-border-bold rounded-2xl pl-12 pr-5 focus:border-blue-500 outline-none transition-all text-text-base font-medium"
              />
            </div>
          </div>

          <div class="flex gap-3 pt-4">
            <button
              type="button"
              onclick={() => showEditModal = false}
              disabled={isEditing}
              class="flex-1 h-14 rounded-2xl font-bold bg-surface-soft hover:bg-surface-strong transition-all text-text-muted hover:text-text-base border border-border-subtle cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isEditing || !editPassword}
              class="flex-1 h-14 rounded-2xl font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              {#if isEditing}
                <Loader2 size={18} class="animate-spin" />
              {:else}
                <Edit2 size={18} />
                Confirmar y Editar
              {/if}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL PARA CONFIRMAR ELIMINACIÓN DEFINITIVA CON CONTRASEÑA -->
{#if showDeleteModal && paymentToDelete}
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={() => !isDeleting && (showDeleteModal = false)}
      onkeydown={(e) => e.key === "Escape" && !isDeleting && (showDeleteModal = false)}
      role="button"
      tabindex="-1"
    ></div>

    <div
      class="bg-surface-raised w-full max-w-md rounded-[40px] border border-border-bold shadow-2xl relative z-10 overflow-hidden text-text-base"
      transition:fade={{ duration: 150 }}
    >
      <div class="p-8 text-center space-y-6">
        <div class="h-20 w-20 rounded-3xl bg-red-500/20 text-red-500 flex items-center justify-center mx-auto shadow-lg shadow-red-500/10">
          <Trash2 size={40} />
        </div>

        <div class="space-y-2">
          <h2 class="text-2xl font-black tracking-tight text-text-base">Confirmar Eliminación</h2>
          <p class="text-text-muted text-sm px-4">
            ¿Estás seguro de que deseas eliminar permanentemente el pago <span class="font-bold text-text-base">{paymentToDelete.cob_num}</span>?
            Esta acción removerá físicamente el registro del pago en Profit Plus, restaurará el saldo de las facturas asociadas y limpiará los comprobantes generados.
          </p>

          <div class="text-left p-4 rounded-2xl bg-surface-soft border border-border-subtle space-y-2 text-xs mt-4">
            <p class="text-text-muted"><span class="font-bold text-text-base">Proveedor:</span> {paymentToDelete.prov_des || paymentToDelete.co_prov}</p>
            <p class="text-text-muted"><span class="font-bold text-text-base">Pago N°:</span> {paymentToDelete.cob_num}</p>
            <p class="text-red-500 font-bold">Esta operación NO se puede deshacer.</p>
          </div>
        </div>

        <form
          method="POST"
          action="?/deletePayment"
          use:enhance={() => {
            isDeleting = true;
            return async ({ result }) => {
              isDeleting = false;
              if (result.type === 'success') {
                showDeleteModal = false;
                toast.success(result.data?.message || 'Pago eliminado permanentemente.');
                invalidateAll();
              } else if (result.type === 'failure') {
                toast.error(result.data?.message || 'Error al eliminar el pago.');
              }
            };
          }}
          class="space-y-4 pt-4 text-left"
        >
          <input type="hidden" name="cob_num" value={paymentToDelete.cob_num} />
          <input type="hidden" name="branch_id" value={selectedBranch} />

          <div class="space-y-2 text-left">
            <label for="delete-password" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">
              Contraseña de Confirmación
            </label>
            <div class="relative">
              <Lock size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" />
              <input
                id="delete-password"
                name="password"
                type="password"
                required
                bind:value={deletePassword}
                placeholder="Introduzca su contraseña"
                class="w-full h-14 bg-surface-base border border-border-bold rounded-2xl pl-12 pr-5 focus:border-red-500 outline-none transition-all text-text-base font-medium"
              />
            </div>
          </div>

          <div class="flex gap-3 pt-4">
            <button
              type="button"
              onclick={() => showDeleteModal = false}
              disabled={isDeleting}
              class="flex-1 h-14 rounded-2xl font-bold bg-surface-soft hover:bg-surface-strong transition-all text-text-muted hover:text-text-base border border-border-subtle cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isDeleting || !deletePassword}
              class="flex-1 h-14 rounded-2xl font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white shadow-lg shadow-red-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              {#if isDeleting}
                <Loader2 size={18} class="animate-spin" />
              {:else}
                <Check size={18} />
                Eliminar Pago
              {/if}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}
