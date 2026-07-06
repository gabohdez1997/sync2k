<!-- src/routes/dashboard/cash/payments/history/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { 
    Wallet, Search, Filter, Plus, Calendar, Eye, X, 
    AlertCircle, RefreshCw, Printer, AlertTriangle, Building, CreditCard, Landmark, CheckCircle,
    FileText, ChevronLeft, ChevronRight
  } from 'lucide-svelte';
  import { fade } from 'svelte/transition';

  let { data } = $props();

  let searchInput = $state('');
  let fecDInput = $state('');
  let fecHInput = $state('');
  let selectedBranch = $state(data.selectedBranchId);

  // Sincronizar inputs si cambian desde la URL
  $effect(() => {
    selectedBranch = data.selectedBranchId;
    searchInput = $page.url.searchParams.get('search') || '';
    fecDInput = $page.url.searchParams.get('fec_d') || '';
    fecHInput = $page.url.searchParams.get('fec_h') || '';
  });

  // Funciones de navegación y filtrado
  function applyFilters(pageNumber = 1) {
    const qParams = new URLSearchParams();
    qParams.set('branch_id', selectedBranch);
    qParams.set('page', String(pageNumber));
    if (searchInput) qParams.set('search', searchInput);
    if (fecDInput) qParams.set('fec_d', fecDInput);
    if (fecHInput) qParams.set('fec_h', fecHInput);
    
    goto(`?${qParams.toString()}`);
  }

  function handleBranchChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedBranch = target.value;
    applyFilters(1);
  }

  function clearFilters() {
    searchInput = '';
    fecDInput = '';
    fecHInput = '';
    applyFilters(1);
  }

  // Modal de Detalle
  let detailModalOpen = $state(false);
  let loadingDetail = $state(false);
  let detailData = $state<any>(null);
  let detailError = $state<string | null>(null);

  async function openDetail(cobNum: string) {
    detailModalOpen = true;
    loadingDetail = true;
    detailError = null;
    detailData = null;
    try {
      const res = await fetch(`/api/agent/payments/${cobNum}?branch_id=${data.selectedBranchId}`);
      if (res.ok) {
        const resJson = await res.json();
        if (resJson.success && resJson.data && resJson.data.length > 0) {
          detailData = resJson.data[0];
        } else {
          detailError = resJson.message || 'No se pudo obtener el detalle del cobro.';
        }
      } else {
        detailError = `Error al consultar: ${res.statusText}`;
      }
    } catch (e: any) {
      detailError = `Error de red: ${e.message}`;
    } finally {
      loadingDetail = false;
    }
  }

  function formatFormaPag(fp: string) {
    const mappings: Record<string, string> = {
      'EF': 'Efectivo',
      'TJ': 'Tarjeta',
      'CT': 'Cesta Ticket',
      'DP': 'Depósito',
      'CH': 'Cheque',
      'TP': 'Transferencia/Pago Móvil'
    };
    return mappings[fp] || fp;
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  
  <!-- CABECERA -->
  <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3 text-text-base">
        <Wallet size={40} class="text-brand-500" />
        {data.title}
      </h1>
      <p class="text-text-muted mt-2 text-lg">Historial de cobros y abonos de facturas de clientes en la sede.</p>
    </div>

    <div class="flex flex-wrap items-center gap-4">
      <!-- Selector de Sucursal -->
      {#if data.branches && data.branches.length > 0}
        <div class="flex items-center gap-2 bg-surface-soft border border-white/5 px-4 py-3 rounded-2xl">
          <Building size={18} class="text-brand-500" />
          <select 
            value={selectedBranch} 
            onchange={handleBranchChange}
            class="bg-transparent border-0 text-sm font-bold text-text-base focus:ring-0 focus:outline-hidden cursor-pointer"
          >
            {#each data.branches as b}
              <option value={b.id} class="bg-surface-base text-text-base">{b.name}</option>
            {/each}
          </select>
        </div>
      {/if}

      <a 
        href="/dashboard/cash/payments?branch_id={selectedBranch}"
        class="flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-500 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-brand-500/20 transition-all active:scale-95 text-base"
      >
        <Plus size={20} />
        Nuevo Cobro
      </a>
    </div>
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
          class="mt-3 flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 px-4 py-2 rounded-xl text-xs font-bold transition-all"
        >
          <RefreshCw size={14} />
          Reintentar Conexión
        </button>
      </div>
    </div>
  {/if}

  <!-- FILTROS -->
  <div class="glass p-6 rounded-3xl border border-white/5 space-y-4">
    <div class="flex items-center gap-2 text-brand-500 font-bold">
      <Filter size={18} />
      <span>Filtros de Búsqueda</span>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <!-- Filtro Búsqueda -->
      <div class="md:col-span-2 relative">
        <Search size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
        <input 
          type="text" 
          placeholder="Buscar por cliente, RIF, cobro o recibo..." 
          bind:value={searchInput}
          onkeydown={(e) => e.key === 'Enter' && applyFilters(1)}
          class="w-full bg-surface-soft border border-white/5 pl-12 pr-4 py-3.5 rounded-2xl text-sm text-text-base placeholder-text-muted/50 focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all"
        />
      </div>

      <!-- Fecha Desde -->
      <div class="relative">
        <Calendar size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
        <input 
          type="date" 
          bind:value={fecDInput}
          class="w-full bg-surface-soft border border-white/5 pl-12 pr-4 py-3.5 rounded-2xl text-sm text-text-base focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all"
        />
      </div>

      <!-- Fecha Hasta -->
      <div class="relative">
        <Calendar size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
        <input 
          type="date" 
          bind:value={fecHInput}
          class="w-full bg-surface-soft border border-white/5 pl-12 pr-4 py-3.5 rounded-2xl text-sm text-text-base focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all"
        />
      </div>
    </div>

    <div class="flex justify-end gap-3 pt-2">
      <button 
        onclick={clearFilters}
        class="px-6 py-3 rounded-2xl text-sm font-bold text-text-muted hover:bg-white/5 transition-all"
      >
        Limpiar
      </button>
      <button 
        onclick={() => applyFilters(1)}
        class="bg-brand-600/20 hover:bg-brand-600/35 text-brand-300 border border-brand-600/40 px-8 py-3 rounded-2xl font-bold transition-all"
      >
        Aplicar Filtros
      </button>
    </div>
  </div>

  <!-- TABLA DE MOVIMIENTOS -->
  {#if data.payments && data.payments.length > 0}
    <div class="glass rounded-[32px] border border-white/5 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-white/5 bg-white/[0.02] text-text-muted text-xs font-bold uppercase tracking-wider">
              <th class="px-6 py-5">Nro. Cobro / Recibo</th>
              <th class="px-6 py-5">Cliente</th>
              <th class="px-6 py-5">Fecha</th>
              <th class="px-6 py-5 text-right">Monto</th>
              <th class="px-6 py-5">Cajero</th>
              <th class="px-6 py-5">Estado</th>
              <th class="px-6 py-5 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5 text-sm text-text-base">
            {#each data.payments as p}
              <tr class="hover:bg-white/[0.02] transition-colors group">
                <td class="px-6 py-5">
                  <div class="font-black text-brand-500">{p.cob_num}</div>
                  {#if p.recibo && p.recibo.trim() !== p.cob_num.trim()}
                    <div class="text-xs text-text-muted/60 mt-0.5">Recibo: {p.recibo}</div>
                  {/if}
                </td>
                <td class="px-6 py-5 max-w-xs">
                  <div class="font-bold truncate">{p.cli_des}</div>
                  <div class="text-xs text-text-muted/60 mt-0.5">{p.co_cli} • {p.rif}</div>
                </td>
                <td class="px-6 py-5">
                  <div>{new Date(p.fecha).toLocaleDateString('es-VE')}</div>
                  <div class="text-xs text-text-muted/60 mt-0.5">{new Date(p.fecha).toLocaleTimeString('es-VE', {hour: '2-digit', minute:'2-digit'})}</div>
                </td>
                <td class="px-6 py-5 text-right font-bold">
                  <div class="text-base text-text-base">
                    <span class="text-text-muted text-xs font-medium mr-1">USD</span>
                    {Number(p.monto / (p.tasa > 0 ? p.tasa : 1)).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </div>
                  <div class="text-xs text-text-muted/60 mt-0.5">
                    <span>Bs. </span>
                    {Number(p.monto).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    <span class="text-[10px] text-text-muted/40 ml-1">(Tasa: {Number(p.tasa).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})})</span>
                  </div>
                </td>
                <td class="px-6 py-5">
                  <span class="bg-white/5 border border-white/5 px-2.5 py-1 rounded-md text-xs font-medium">{p.co_us_in}</span>
                </td>
                <td class="px-6 py-5">
                  {#if p.anulado}
                    <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                       Anulado
                    </span>
                  {:else}
                    <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                       Activo
                    </span>
                  {/if}
                </td>
                <td class="px-6 py-5">
                  <div class="flex items-center justify-center gap-2">
                    <button 
                      onclick={() => openDetail(p.cob_num)}
                      class="p-2.5 rounded-xl bg-white/5 hover:bg-brand-600/20 text-text-muted hover:text-brand-400 transition-all"
                      title="Ver Detalle"
                    >
                      <Eye size={16} />
                    </button>
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
  {:else if !data.error}
    <div class="glass p-12 rounded-[40px] border border-white/5 flex flex-col items-center justify-center text-center space-y-4 min-h-[400px]">
      <div class="h-20 w-20 rounded-3xl bg-white/5 flex items-center justify-center text-text-muted/20">
        <Wallet size={48} />
      </div>
      <h2 class="text-2xl font-bold text-text-muted">Sin movimientos registrados</h2>
      <p class="text-text-muted/60 max-w-sm">No se encontraron cobros registrados con los filtros aplicados. Intenta modificarlos o registra uno nuevo.</p>
    </div>
  {/if}
</div>

<!-- MODAL DE DETALLE -->
{#if detailModalOpen}
  <div class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 md:p-6" transition:fade={{ duration: 150 }}>
    <div class="glass max-w-4xl w-full max-h-[90vh] rounded-[32px] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
      
      <!-- Cabecera Modal -->
      <div class="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500">
            <Wallet size={20} />
          </div>
          <div>
            <h3 class="font-black text-xl text-text-base">Detalle de Cobro</h3>
            <p class="text-xs text-text-muted">Consulta de registros del Agente Profit Plus</p>
          </div>
        </div>
        <button 
          onclick={() => { detailModalOpen = false; detailData = null; }}
          class="p-2 rounded-xl text-text-muted hover:bg-white/5 hover:text-text-base transition-all"
        >
          <X size={20} />
        </button>
      </div>

      <!-- Contenido Modal -->
      <div class="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 custom-scrollbar">
        {#if loadingDetail}
          <div class="flex flex-col items-center justify-center py-20 gap-4">
            <RefreshCw size={40} class="animate-spin text-brand-500" />
            <p class="text-sm font-bold text-text-muted">Buscando información en la sede local...</p>
          </div>
        {:else if detailError}
          <div class="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 flex gap-4 text-red-400">
            <AlertCircle size={24} class="shrink-0" />
            <div>
              <h4 class="font-bold">Error al Cargar Detalle</h4>
              <p class="text-sm mt-1">{detailError}</p>
            </div>
          </div>
        {:else if detailData}
          <!-- Información General -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-white/5 p-5 rounded-2xl border border-white/5">
              <span class="text-xs text-text-muted/60 uppercase font-bold tracking-wider">Identificador</span>
              <div class="text-2xl font-black text-brand-500 mt-1">{detailData.cob_num}</div>
              {#if detailData.recibo && detailData.recibo.trim() !== detailData.cob_num.trim()}
                <div class="text-xs text-text-muted mt-1">Recibo: {detailData.recibo}</div>
              {/if}
            </div>

            <div class="bg-white/5 p-5 rounded-2xl border border-white/5">
              <span class="text-xs text-text-muted/60 uppercase font-bold tracking-wider">Cliente</span>
              <div class="text-lg font-bold text-text-base mt-1 truncate">{detailData.cli_des}</div>
              <div class="text-xs text-text-muted mt-1">{detailData.co_cli} • {detailData.rif}</div>
            </div>

            <div class="bg-white/5 p-5 rounded-2xl border border-white/5">
              <span class="text-xs text-text-muted/60 uppercase font-bold tracking-wider">Monto Total</span>
              <div class="text-2xl font-black text-text-base mt-1">
                <span class="text-sm text-text-muted font-normal mr-1">USD</span>
                {Number(detailData.monto / (detailData.tasa > 0 ? detailData.tasa : 1)).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </div>
              <div class="text-xs text-text-muted mt-1">
                <span>Equivalente: Bs. </span>
                {Number(detailData.monto).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </div>
              <div class="text-[10px] text-text-muted/50 mt-1">Tasa: {Number(detailData.tasa).toFixed(4)} • {new Date(detailData.fecha).toLocaleDateString('es-VE')}</div>
            </div>
          </div>

          <!-- Documentos Amortizados -->
          <div class="space-y-3">
            <h4 class="font-black text-text-base text-lg flex items-center gap-2">
              <FileText size={18} class="text-brand-500" />
              Documentos Amortizados
            </h4>
            <div class="glass rounded-2xl border border-white/5 overflow-hidden">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="bg-white/[0.02] border-b border-white/5 text-text-muted font-bold uppercase">
                    <th class="px-4 py-3">Reng</th>
                    <th class="px-4 py-3">Tipo Doc</th>
                    <th class="px-4 py-3">Nro Documento</th>
                    <th class="px-4 py-3 text-right">Abono Cobrado</th>
                    <th class="px-4 py-3 text-right">IGTF (3%)</th>
                    <th class="px-4 py-3 text-right">Retención IVA</th>
                    <th class="px-4 py-3 text-right">Retención ISLR</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5 text-text-base">
                  {#each detailData.renglones || [] as r}
                    <tr class="hover:bg-white/[0.01]">
                      <td class="px-4 py-3.5 text-text-muted font-bold">{r.reng_num}</td>
                      <td class="px-4 py-3.5"><span class="bg-white/5 border border-white/5 px-2 py-0.5 rounded-md font-bold text-xs">{r.co_tipo_doc}</span></td>
                      <td class="px-4 py-3.5 font-bold text-brand-500">{r.nro_doc}</td>
                      <td class="px-4 py-3.5 text-right">
                        <div class="font-black text-text-base">
                          {Number(r.mont_cob / (detailData.tasa > 0 ? detailData.tasa : 1)).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </div>
                        <div class="text-[10px] text-text-muted/60">
                          Bs. {Number(r.mont_cob).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </div>
                      </td>
                      <td class="px-4 py-3.5 text-right">
                        {#if r.otros1 > 0}
                          <div class="font-bold text-brand-400">
                            {Number(r.otros1 / (detailData.tasa > 0 ? detailData.tasa : 1)).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </div>
                          <div class="text-[10px] text-text-muted/60">
                            Bs. {Number(r.otros1).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </div>
                        {:else}
                          <span class="text-text-muted/50">—</span>
                        {/if}
                      </td>
                      <td class="px-4 py-3.5 text-right">
                        {#if r.monto_retencion_iva > 0}
                          <div class="font-bold text-green-400">
                            {Number(r.monto_retencion_iva / (detailData.tasa > 0 ? detailData.tasa : 1)).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </div>
                          <div class="text-[10px] text-text-muted/60">
                            Bs. {Number(r.monto_retencion_iva).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </div>
                        {:else}
                          <span class="text-text-muted/50">—</span>
                        {/if}
                      </td>
                      <td class="px-4 py-3.5 text-right">
                        {#if r.monto_retencion > 0}
                          <div class="font-bold text-amber-300">
                            {Number(r.monto_retencion / (detailData.tasa > 0 ? detailData.tasa : 1)).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </div>
                          <div class="text-[10px] text-text-muted/60">
                            Bs. {Number(r.monto_retencion).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </div>
                        {:else}
                          <span class="text-text-muted/50">—</span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Formas de Pago / Cuadre -->
          <div class="space-y-3">
            <h4 class="font-black text-text-base text-lg flex items-center gap-2">
              <CreditCard size={18} class="text-brand-500" />
              Instrumentos de Pago Recibidos
            </h4>
            <div class="glass rounded-2xl border border-white/5 overflow-hidden">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="bg-white/[0.02] border-b border-white/5 text-text-muted font-bold uppercase">
                    <th class="px-4 py-3">Reng</th>
                    <th class="px-4 py-3">Forma de Pago</th>
                    <th class="px-4 py-3">Caja / Cuenta</th>
                    <th class="px-4 py-3">Banco / Tarjeta</th>
                    <th class="px-4 py-3">Nro. Ref</th>
                    <th class="px-4 py-3 text-right">Monto Recibido</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5 text-text-base">
                  {#each detailData.formas_pago || [] as f}
                    <tr class="hover:bg-white/[0.01]">
                      <td class="px-4 py-3.5 text-text-muted font-bold">{f.reng_num}</td>
                      <td class="px-4 py-3.5">
                        <span class="font-bold">{formatFormaPag(f.forma_pag)}</span>
                      </td>
                      <td class="px-4 py-3.5">
                        {#if f.cod_caja}
                          <div class="font-medium text-text-base">{f.cod_caja}</div>
                          <div class="text-[10px] text-text-muted/60">{f.caja_des}</div>
                        {:else if f.cod_cta}
                          <div class="font-medium text-text-base">{f.cod_cta}</div>
                          <div class="text-[10px] text-text-muted/60">{f.cta_des}</div>
                        {:else}
                          <span class="text-text-muted/50">—</span>
                        {/if}
                      </td>
                      <td class="px-4 py-3.5">
                        {#if f.co_ban}
                          <div class="font-medium text-text-base">{f.co_ban}</div>
                          <div class="text-[10px] text-text-muted/60">{f.ban_des}</div>
                        {:else if f.co_tar}
                          <div class="font-medium text-text-base">{f.co_tar}</div>
                          <div class="text-[10px] text-text-muted/60">{f.tar_des}</div>
                        {:else}
                          <span class="text-text-muted/50">—</span>
                        {/if}
                      </td>
                      <td class="px-4 py-3.5 text-text-muted">{f.num_doc || '—'}</td>
                      <td class="px-4 py-3.5 text-right">
                        <div class="font-black text-brand-500">
                          {Number(f.mont_doc / (detailData.tasa > 0 ? detailData.tasa : 1)).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </div>
                        <div class="text-[10px] text-text-muted/60">
                          Bs. {Number(f.mont_doc).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Desglose de Retenciones (si aplican) -->
          {#if (detailData.retenciones_iva && detailData.retenciones_iva.length > 0) || (detailData.retenciones_islr && detailData.retenciones_islr.length > 0)}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- IVA -->
              {#if detailData.retenciones_iva && detailData.retenciones_iva.length > 0}
                <div class="space-y-3">
                  <h5 class="font-bold text-text-base text-sm flex items-center gap-1.5 text-green-400">
                    <CheckCircle size={16} />
                    Detalle Retenciones IVA
                  </h5>
                  <div class="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-3 text-xs">
                    {#each detailData.retenciones_iva as ri}
                      <div class="border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
                        <div class="flex justify-between font-bold text-text-base">
                          <span>Comprobante: {ri.num_comprobante}</span>
                          <span class="text-green-400">USD {Number(ri.monto_ret_imp / (detailData.tasa > 0 ? detailData.tasa : 1)).toFixed(2)}</span>
                        </div>
                        <div class="flex justify-between text-text-muted/70 mt-1">
                          <span>Base Imponible: USD {Number(ri.base_imponible / (detailData.tasa > 0 ? detailData.tasa : 1)).toFixed(2)} ({ri.alicuota}%)</span>
                          <span>Doc. Afectado: {ri.numero_documento_afectado}</span>
                        </div>
                        <div class="flex justify-between text-[10px] text-text-muted/50 mt-0.5">
                          <span>Base Imp. Bs: {Number(ri.base_imponible).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                          <span>Ret. Imp. Bs: {Number(ri.monto_ret_imp).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- ISLR -->
              {#if detailData.retenciones_islr && detailData.retenciones_islr.length > 0}
                <div class="space-y-3">
                  <h5 class="font-bold text-text-base text-sm flex items-center gap-1.5 text-amber-300">
                    <CheckCircle size={16} />
                    Detalle Retenciones ISLR / Mun.
                  </h5>
                  <div class="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-3 text-xs">
                    {#each detailData.retenciones_islr as rn}
                      <div class="border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
                        <div class="flex justify-between font-bold text-text-base">
                          <span>Concepto: {rn.co_islr}</span>
                          <span class="text-amber-300">USD {Number(rn.monto_reten / (detailData.tasa > 0 ? detailData.tasa : 1)).toFixed(2)}</span>
                        </div>
                        <div class="flex justify-between text-text-muted/70 mt-1">
                          <span>Monto Objeto: USD {Number(rn.monto_obj / (detailData.tasa > 0 ? detailData.tasa : 1)).toFixed(2)} ({rn.porc_retn}%)</span>
                        </div>
                        <div class="flex justify-between text-[10px] text-text-muted/50 mt-0.5">
                          <span>Monto Obj. Bs: {Number(rn.monto_obj).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                          <span>Retenido Bs: {Number(rn.monto_reten).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        {/if}
      </div>

      <!-- Pie Modal -->
      <div class="p-6 border-t border-white/5 flex justify-between bg-white/[0.02]">
        <button 
          onclick={() => { detailModalOpen = false; detailData = null; }}
          class="px-6 py-3 rounded-xl font-bold bg-white/5 hover:bg-white/10 text-text-base transition-all text-sm"
        >
          Cerrar
        </button>
        {#if detailData && !detailData.anulado}
          <div class="text-xs text-text-muted flex items-center gap-1.5">
            <CheckCircle size={14} class="text-green-500" />
            <span>Este cobro se encuentra conciliado y procesado.</span>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
