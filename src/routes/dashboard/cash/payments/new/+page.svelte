<!-- src/routes/dashboard/cash/payments/new/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { 
    Wallet, Search, Plus, Calendar, X, Trash2, 
    AlertCircle, RefreshCw, AlertTriangle, Building, CreditCard, Landmark, CheckCircle, ArrowLeft, Info
  } from 'lucide-svelte';

  let { data } = $props();

  // Estado del Formulario
  let co_cli = $state('');
  let selectedCustomer = $state<any>(null);
  let searchQuery = $state('');
  let pendingInvoices = $state<any[]>([]);
  let searchingInvoices = $state(false);
  let loadingDocs = $state(false);
  let currentExchangeRate = $state(1);
  
  // Documentos cargados del cliente
  let documentos = $state<any[]>([]);
  let checkedDocs = $state<Record<string, boolean>>({});
  
  // Datos de retenciones y abonos por documento
  let docInputs = $state<Record<string, {
    mont_cob: number;
    reten_iva: number;
    num_comprobante_iva: string;
    base_imponible_iva: number;
    alicuota_iva: number;
    reten_islr: number;
    co_islr: string;
    porc_islr: number;
    showIvaDetails: boolean;
    showIslrDetails: boolean;
  }>>({});

  // Formas de Pago agregadas
  let formasPago = $state<any[]>([]);

  // Totales derivativos
  let totalCobradoNeto = $derived(
    Object.values(docInputs).reduce((acc, curr) => acc + (Number(curr.mont_cob) || 0), 0)
  );

  let totalRetenidoIva = $derived(
    Object.values(docInputs).reduce((acc, curr) => acc + (Number(curr.reten_iva) || 0), 0)
  );

  let totalRetenidoIslr = $derived(
    Object.values(docInputs).reduce((acc, curr) => acc + (Number(curr.reten_islr) || 0), 0)
  );

  let totalInstrumentosPago = $derived(
    formasPago.reduce((acc, curr) => acc + (Number(curr.mont_doc) || 0), 0)
  );

  let diferenciaCuadre = $derived(
    Math.round((totalCobradoNeto - totalInstrumentosPago) * 100) / 100
  );

  // Cargar facturas iniciales con saldo pendiente al cargar la página
  $effect(() => {
    loadInitialPendingInvoices();
    loadExchangeRate();
  });

  async function loadExchangeRate() {
    try {
      const res = await fetch(`/api/agent/tasa?branch_id=${data.selectedBranchId}`);
      if (res.ok) {
        const resJson = await res.json();
        if (resJson.success && resJson.tasa) {
          currentExchangeRate = Number(resJson.tasa) || 1;
        }
      }
    } catch (e) {
      console.error('Error al cargar la tasa de cambio:', e);
    }
  }

  async function loadInitialPendingInvoices() {
    searchingInvoices = true;
    try {
      const res = await fetch(`/api/agent/payments/pending-documents?branch_id=${data.selectedBranchId}`);
      if (res.ok) {
        const resJson = await res.json();
        pendingInvoices = resJson.data || [];
      }
    } catch (e) {
      console.error(e);
    } finally {
      searchingInvoices = false;
    }
  }

  async function searchPendingInvoices() {
    if (!searchQuery.trim()) {
      loadInitialPendingInvoices();
      return;
    }
    searchingInvoices = true;
    try {
      const res = await fetch(`/api/agent/payments/pending-documents?search=${encodeURIComponent(searchQuery)}&branch_id=${data.selectedBranchId}`);
      if (res.ok) {
        const resJson = await res.json();
        pendingInvoices = resJson.data || [];
      }
    } catch (e) {
      console.error(e);
    } finally {
      searchingInvoices = false;
    }
  }

  async function selectInvoice(inv: any) {
    selectedCustomer = {
      co_cli: inv.co_cli,
      descripcion: inv.cli_des,
      rif: inv.rif,
      contribu_e: inv.contribu_e,
      porc_esp: inv.porc_esp,
      co_ven: inv.co_ven,
      co_mone: inv.co_mone
    };
    co_cli = inv.co_cli;
    searchQuery = '';
    pendingInvoices = [];
    checkedDocs = {};
    
    // Cargar todos los documentos con saldo del cliente seleccionado
    loadingDocs = true;
    documentos = [];
    docInputs = {};
    try {
      const res = await fetch(`/api/agent/customers/${encodeURIComponent(co_cli)}/documentos?branch_id=${data.selectedBranchId}`);
      if (res.ok) {
        const resJson = await res.json();
        documentos = resJson.data || [];
        
        // Inicializar inputs
        documentos.forEach(doc => {
          const isTargetDoc = doc.nro_doc.trim() === inv.nro_doc.trim() && doc.co_tipo_doc.trim() === inv.co_tipo_doc.trim();
          const docTasa = doc.tasa > 0 ? doc.tasa : 1;
          const totalNetoUsd = doc.total_neto / docTasa;
          const montoImpUsd = doc.monto_imp / docTasa;
          const baseImpUsd = Math.round((totalNetoUsd - montoImpUsd) * 100) / 100;
          const saldoUsd = Math.round((doc.saldo / docTasa) * 100) / 100;
          
          checkedDocs[doc.nro_doc] = isTargetDoc;
          
          docInputs[doc.nro_doc] = {
            mont_cob: 0,
            reten_iva: 0,
            num_comprobante_iva: '',
            base_imponible_iva: baseImpUsd,
            alicuota_iva: 16,
            reten_islr: 0,
            co_islr: '001',
            porc_islr: 2,
            showIvaDetails: false,
            showIslrDetails: false
          };
          
          if (isTargetDoc) {
            recalculateDocAmounts(doc.nro_doc, doc);
          }
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      loadingDocs = false;
    }
  }

  function toggleDocSelection(nroDoc: string, doc: any, checked: boolean) {
    checkedDocs[nroDoc] = checked;
    recalculateDocAmounts(nroDoc, doc);
  }

  function recalculateDocAmounts(nroDoc: string, doc: any) {
    const input = docInputs[nroDoc];
    if (!input) return;
    
    const docTasa = doc.tasa > 0 ? doc.tasa : 1;
    const saldoUsd = Math.round((doc.saldo / docTasa) * 100) / 100;
    const isNC = doc.co_tipo_doc.trim() === 'N/CR';
    
    if (checkedDocs[nroDoc]) {
      // Calcular IVA si es contribuyente especial y no ha sido calculado aún
      if (selectedCustomer?.contribu_e && doc.monto_imp > 0 && input.reten_iva === 0) {
        const porc = Number(selectedCustomer.porc_esp) || 75;
        const montoImpUsd = doc.monto_imp / docTasa;
        input.reten_iva = Math.round((montoImpUsd * (porc / 100)) * 100) / 100;
        input.base_imponible_iva = Math.round(((doc.total_neto - doc.monto_imp) / docTasa) * 100) / 100;
        input.alicuota_iva = 16;
        input.showIvaDetails = true;
      }
      
      if (isNC) {
        input.mont_cob = -saldoUsd;
        input.reten_iva = 0;
        input.reten_islr = 0;
      } else {
        // El abono cobrado (neto registrado en banco/caja) es Saldo - IVA Retenido - ISLR Retenido
        const computedAbono = Math.round((saldoUsd - (input.reten_iva || 0) - (input.reten_islr || 0)) * 100) / 100;
        input.mont_cob = computedAbono;
      }
    } else {
      input.mont_cob = 0;
      input.reten_iva = 0;
      input.reten_islr = 0;
      input.showIvaDetails = false;
      input.showIslrDetails = false;
    }
  }

  function addFormaPago() {
    formasPago.push({
      forma_pag: 'EF',
      cod_caja: data.cajas[0]?.cod_caja || '',
      cod_cta: '',
      co_ban: '',
      co_tar: '',
      num_doc: '',
      mont_doc: diferenciaCuadre > 0 ? diferenciaCuadre : 0,
      fecha_che: new Date().toISOString().substring(0, 10)
    });
  }

  function removeFormaPago(index: number) {
    formasPago.splice(index, 1);
  }

  function handleFormaPagChange(index: number) {
    const fp = formasPago[index];
    if (fp.forma_pag === 'EF') {
      fp.cod_caja = data.cajas[0]?.cod_caja || '';
      fp.cod_cta = '';
      fp.co_ban = '';
      fp.co_tar = '';
      fp.num_doc = '';
    } else if (fp.forma_pag === 'TJ') {
      fp.cod_caja = data.cajas[0]?.cod_caja || '';
      fp.cod_cta = '';
      fp.co_ban = '';
      fp.co_tar = data.tarjetasCredito[0]?.co_tar || '';
      fp.num_doc = '';
    } else if (fp.forma_pag === 'TE' || fp.forma_pag === 'DP' || fp.forma_pag === 'CH') {
      fp.cod_caja = '';
      fp.cod_cta = data.cuentasBancarias[0]?.cod_cta || '';
      fp.co_ban = data.bancos[0]?.co_ban || '';
      fp.co_tar = '';
    }
  }

  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let saveSuccess = $state(false);
  let generatedDocNum = $state('');

  async function saveCobro() {
    if (diferenciaCuadre !== 0) {
      saveError = 'El cobro no está cuadrado. La diferencia de cuadre debe ser exactamente 0.';
      return;
    }

    saving = true;
    saveError = null;

    const tasaCobro = currentExchangeRate;

    // Identificar el primer documento de débito seleccionado para asociar con N/CR u otros documentos
    const firstSelectedParent = documentos.find(d => checkedDocs[d.nro_doc] && ['FACT', 'NDEB', 'N/DB', 'GIRO', 'AJPA'].includes(d.co_tipo_doc.trim()));
    const parentDocNo = firstSelectedParent ? firstSelectedParent.nro_doc : null;

    // Filtrar documentos que tienen algún monto aplicado
    const renglones = documentos
      .filter(doc => checkedDocs[doc.nro_doc])
      .map(doc => {
        const inp = docInputs[doc.nro_doc];
        const isParent = ['FACT', 'NDEB', 'N/DB', 'GIRO', 'AJPA'].includes(doc.co_tipo_doc.trim());
        return {
          co_tipo_doc: doc.co_tipo_doc,
          nro_doc: doc.nro_doc,
          mont_cob: Math.round((inp.mont_cob * tasaCobro) * 100) / 100,
          monto_retencion_iva: Math.round((inp.reten_iva * tasaCobro) * 100) / 100,
          monto_retencion: Math.round((inp.reten_islr * tasaCobro) * 100) / 100,
          parent_doc: !isParent ? parentDocNo : null
        };
      });

    if (renglones.length === 0) {
      saveError = 'Debe registrar al menos un abono o retención en los documentos del cliente.';
      saving = false;
      return;
    }

    // Retenciones IVA desglose
    const retenciones_iva = documentos
      .filter(doc => docInputs[doc.nro_doc].reten_iva > 0)
      .map(doc => {
        const inp = docInputs[doc.nro_doc];
        const today = new Date();
        const periodStr = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0');
        
        return {
          nro_doc_asoc: doc.nro_doc,
          rif_contribuyente: selectedCustomer.rif,
          periodo_impositivo: Number(periodStr),
          fecha_documento: doc.fec_emis,
          rif_comprador: 'J000000000', // El agente lo sobreescribirá con los datos del tenant
          numero_documento: doc.nro_doc,
          numero_control_documento: doc.n_control,
          monto_documento: doc.total_neto,
          base_imponible: Math.round((inp.base_imponible_iva * tasaCobro) * 100) / 100,
          monto_ret_imp: Math.round((inp.reten_iva * tasaCobro) * 100) / 100,
          numero_documento_afectado: doc.nro_doc,
          num_comprobante: inp.num_comprobante_iva || 'S/N',
          monto_excento: 0,
          alicuota: inp.alicuota_iva
        };
      });

    // Retenciones ISLR desglose
    const retenciones_islr = documentos
      .filter(doc => docInputs[doc.nro_doc].reten_islr > 0)
      .map(doc => {
        const inp = docInputs[doc.nro_doc];
        return {
          nro_doc_asoc: doc.nro_doc,
          co_islr: inp.co_islr,
          monto: doc.total_neto - doc.monto_imp,
          monto_reten: Math.round((inp.reten_islr * tasaCobro) * 100) / 100,
          monto_obj: doc.total_neto - doc.monto_imp,
          sustraendo: 0,
          porc_retn: inp.porc_islr
        };
      });

    const formas_pago_cleaned = formasPago.map(fp => {
      return {
        forma_pag: fp.forma_pag === 'TE' ? 'TE' : fp.forma_pag,
        cod_caja: fp.cod_caja || null,
        cod_cta: fp.cod_cta || null,
        co_ban: fp.co_ban || null,
        co_tar: fp.co_tar || null,
        num_doc: fp.num_doc || null,
        mont_doc: Math.round((fp.mont_doc * tasaCobro) * 100) / 100,
        fecha_che: fp.fecha_che || null
      };
    });

    const payload = {
      co_cli: selectedCustomer.co_cli,
      co_ven: selectedCustomer.co_ven,
      co_mone: selectedCustomer.co_mone || 'US$',
      tasa: tasaCobro,
      monto: Math.round((totalCobradoNeto * tasaCobro) * 100) / 100,
      descrip: `COBRO CLIENTE ${selectedCustomer.co_cli}`,
      renglones,
      formas_pago: formas_pago_cleaned,
      retenciones_iva,
      retenciones_islr
    };

    try {
      const res = await fetch(`/api/agent/payments?branch_id=${data.selectedBranchId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const resJson = await res.json();
        if (resJson.success && resJson.data && resJson.data.doc_num) {
          saveSuccess = true;
          generatedDocNum = resJson.data.doc_num;
        } else {
          saveError = resJson.message || 'Error al procesar el cobro.';
        }
      } else {
        saveError = `Error HTTP del agente: ${res.statusText}`;
      }
    } catch (e: any) {
      saveError = `Error de red: ${e.message}`;
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32">
  
  <!-- CABECERA -->
  <div class="flex items-center justify-between border-b border-white/5 pb-6">
    <div class="flex items-center gap-4">
      <a 
        href="/dashboard/cash/payments?branch_id={data.selectedBranchId}"
        class="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-text-muted hover:text-text-base transition-all"
        title="Volver"
      >
        <ArrowLeft size={20} />
      </a>
      <div>
        <h1 class="text-3xl font-black tracking-tight text-text-base flex items-center gap-2">
          <Wallet size={32} class="text-brand-500" />
          Registrar Nuevo Cobro
        </h1>
        <p class="text-text-muted text-sm mt-1">Sede de cobro activa: <span class="text-brand-400 font-bold">{data.branches.find(b => b.id === data.selectedBranchId)?.name || 'Desconocida'}</span></p>
      </div>
    </div>
  </div>

  <!-- EXITOSO -->
  {#if saveSuccess}
    <div class="glass p-12 rounded-[40px] border border-green-500/20 max-w-xl mx-auto flex flex-col items-center justify-center text-center space-y-6">
      <div class="h-20 w-20 rounded-3xl bg-green-500/10 flex items-center justify-center text-green-400">
        <CheckCircle size={48} />
      </div>
      <div class="space-y-2">
        <h2 class="text-3xl font-black text-text-base">¡Cobro Registrado!</h2>
        <p class="text-text-muted">El cobro ha sido guardado exitosamente en Profit Plus.</p>
      </div>
      <div class="bg-white/5 px-6 py-4 rounded-2xl border border-white/5">
        <span class="text-xs text-text-muted/60 uppercase font-bold tracking-wider">Documento Generado</span>
        <div class="text-2xl font-black text-brand-500 mt-1">{generatedDocNum}</div>
      </div>
      <div class="flex gap-4 w-full">
        <a 
          href="/dashboard/cash/payments?branch_id={data.selectedBranchId}"
          class="flex-1 text-center bg-white/5 hover:bg-white/10 text-text-base px-6 py-3.5 rounded-2xl font-bold transition-all"
        >
          Volver al Historial
        </a>
        <button 
          onclick={() => { saveSuccess = false; selectCustomer(selectedCustomer); }}
          class="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-brand-500/20"
        >
          Nuevo Cobro al Cliente
        </button>
      </div>
    </div>
  {:else}

    <!-- BUSCADOR DE FACTURAS PENDIENTES -->
    <div class="glass p-6 rounded-3xl border border-white/5 space-y-4">
      <label for="invoice-search" class="block text-sm font-bold text-brand-500">Buscar Facturas con Saldo Pendiente</label>
      <div class="relative">
        <Search size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
        <input 
          id="invoice-search"
          type="text" 
          placeholder="Buscar por nro. factura, cédula/RIF o nombre de cliente..." 
          bind:value={searchQuery}
          oninput={searchPendingInvoices}
          class="w-full bg-surface-soft border border-white/5 pl-12 pr-4 py-3.5 rounded-2xl text-sm text-text-base placeholder-text-muted/50 focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all"
        />
        {#if searchingInvoices}
          <RefreshCw size={16} class="animate-spin absolute right-4 top-1/2 -translate-y-1/2 text-brand-500" />
        {/if}
      </div>

      <!-- Resultados de Facturas Pendientes -->
      {#if pendingInvoices.length > 0}
        <div class="bg-surface-raised border border-white/10 rounded-2xl shadow-2xl max-h-80 overflow-y-auto divide-y divide-white/5">
          {#each pendingInvoices as inv}
            <button 
              onclick={() => selectInvoice(inv)}
              class="w-full text-left px-5 py-4 hover:bg-white/5 transition-colors flex items-center justify-between group"
            >
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="bg-brand-500/10 text-brand-400 border border-brand-500/20 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase">{inv.co_tipo_doc}</span>
                  <span class="font-black text-text-base text-brand-500 group-hover:text-brand-400 transition-colors">{inv.nro_doc}</span>
                  {#if inv.contribu_e}
                    <span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase">Esp.</span>
                  {/if}
                </div>
                <div class="text-xs text-text-base font-bold">{inv.cli_des}</div>
                <div class="text-[10px] text-text-muted/60">{inv.co_cli} • RIF: {inv.rif} • Emisión: {new Date(inv.fec_emis).toLocaleDateString('es-VE')}</div>
              </div>
              <div class="text-right">
                <div class="text-xs text-text-muted">Saldo Pendiente</div>
                <div class="font-black text-text-base text-lg mt-0.5">
                  <span class="text-xs text-text-muted font-medium mr-0.5">USD</span>
                  {#if inv.co_tipo_doc.trim() === 'N/CR'}-{/if}{(inv.saldo / (inv.tasa > 0 ? inv.tasa : 1)).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </div>
                <div class="text-[10px] text-text-muted/60 mt-0.5">
                  Bs. {#if inv.co_tipo_doc.trim() === 'N/CR'}-{/if}{Number(inv.saldo).toLocaleString('de-DE', {minimumFractionDigits: 2})} (Tasa: {Number(inv.tasa).toFixed(2)})
                </div>
                <div class="text-[9px] text-brand-400/80 font-bold">{inv.sede_nombre}</div>
              </div>
            </button>
          {/each}
        </div>
      {:else if searchQuery.trim() !== '' && !searchingInvoices}
        <div class="p-8 text-center text-sm text-text-muted bg-white/[0.01] rounded-2xl border border-dashed border-white/5">
          No se encontraron facturas o deudas pendientes que coincidan con la búsqueda.
        </div>
      {/if}
    </div>

    {#if selectedCustomer}
      <!-- CLIENTE SELECCIONADO -->
      <div class="bg-brand-600/5 border border-brand-600/20 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span class="text-xs text-text-muted font-bold uppercase tracking-wider">Cliente Seleccionado</span>
          <h2 class="text-2xl font-black text-text-base mt-1">{selectedCustomer.descripcion}</h2>
          <div class="flex flex-wrap gap-4 text-xs text-text-muted mt-1.5">
            <span>Código: <strong class="text-text-base">{selectedCustomer.co_cli}</strong></span>
            <span>RIF: <strong class="text-text-base">{selectedCustomer.rif}</strong></span>
            {#if selectedCustomer.contribu_e}
              <span class="text-brand-400 font-bold flex items-center gap-1">
                <Info size={14} />
                Contrib. Especial (Retención {selectedCustomer.porc_esp}%)
              </span>
            {/if}
          </div>
        </div>
        <button 
          onclick={() => { selectedCustomer = null; documentos = []; docInputs = {}; }}
          class="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-text-muted hover:text-text-base transition-all"
        >
          Cambiar Cliente
        </button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        <!-- SECCIÓN IZQUIERDA: DOCUMENTOS DEUDAS -->
        <div class="lg:col-span-7 space-y-6">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-black text-text-base flex items-center gap-2">
              <span class="h-2 w-2 rounded-full bg-brand-500"></span>
              Cuentas por Cobrar Pendientes
            </h3>
            <span class="bg-white/5 px-3 py-1 rounded-full text-xs text-text-muted font-bold">{documentos.length} Docs</span>
          </div>

          {#if loadingDocs}
            <div class="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center gap-4 text-center">
              <RefreshCw size={32} class="animate-spin text-brand-500" />
              <p class="text-sm font-bold text-text-muted">Cargando cuentas pendientes del cliente...</p>
            </div>
          {:else if documentos.length === 0}
            <div class="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center gap-3 text-center text-text-muted">
              <CheckCircle size={32} class="text-green-500" />
              <h4 class="font-bold text-lg text-text-base">Sin saldos pendientes</h4>
              <p class="text-xs">Este cliente se encuentra totalmente solvente en esta sucursal.</p>
            </div>
          {:else}
            <div class="space-y-4">
              {#each documentos as doc}
                {@const input = docInputs[doc.nro_doc]}
                {#if input}
                  <div class="glass p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all space-y-4">
                    <!-- Fila Superior -->
                    <div class="flex items-start justify-between gap-4">
                      <div class="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          checked={checkedDocs[doc.nro_doc]} 
                          onchange={(e) => toggleDocSelection(doc.nro_doc, doc, e.currentTarget.checked)}
                          class="w-5 h-5 rounded-lg border-white/10 bg-surface-soft text-brand-500 focus:ring-brand-500 focus:ring-offset-0 cursor-pointer"
                        />
                        <div>
                          <span class="bg-white/5 border border-white/5 px-2 py-0.5 rounded-md font-bold text-xs text-text-muted uppercase">{doc.co_tipo_doc}</span>
                          <span class="font-black text-text-base text-base ml-2">{doc.nro_doc}</span>
                          <div class="text-[10px] text-text-muted/60 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                            <span>Control: {doc.n_control || 'N/A'}</span>
                            <span>•</span>
                            <span>Emisión: {new Date(doc.fec_emis).toLocaleDateString('es-VE')}</span>
                            <span>•</span>
                            <span class="text-brand-400 font-semibold">IVA: USD {(doc.monto_imp / (doc.tasa > 0 ? doc.tasa : 1)).toLocaleString('de-DE', {minimumFractionDigits: 2})} (Bs. {Number(doc.monto_imp).toLocaleString('de-DE', {minimumFractionDigits: 2})})</span>
                          </div>
                        </div>
                      </div>

                      <div class="text-right">
                        <span class="text-[10px] text-text-muted font-bold block uppercase tracking-wider">Saldo Documento</span>
                        <span class="text-lg font-black text-brand-500">
                          {#if doc.co_tipo_doc.trim() === 'N/CR'}-{/if}USD {(doc.saldo / (doc.tasa > 0 ? doc.tasa : 1)).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </span>
                        <span class="block text-[10px] text-text-muted/60 mt-0.5">
                          Bs. {#if doc.co_tipo_doc.trim() === 'N/CR'}-{/if}{Number(doc.saldo).toLocaleString('de-DE', {minimumFractionDigits: 2})} (Tasa: {Number(doc.tasa).toFixed(2)})
                        </span>
                      </div>
                    </div>

                    <!-- Inputs y detalles condicionados a selección -->
                    <div class="space-y-4 transition-all duration-200 {!checkedDocs[doc.nro_doc] ? 'opacity-30 pointer-events-none select-none' : ''}">
                      <!-- Campos de Entrada -->
                      <div class="grid grid-cols-4 gap-3">
                        <div>
                          <label class="block text-[10px] font-bold text-text-muted uppercase mb-1">Base Imponible</label>
                          <input 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00"
                            bind:value={input.base_imponible_iva}
                            readonly
                            class="w-full bg-surface-soft border border-white/5 px-3 py-2 rounded-xl text-sm text-text-base focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all text-right font-black cursor-not-allowed opacity-90"
                          />
                          <span class="block text-[9px] text-text-muted/60 text-right mt-1">
                            Bs. {(input.base_imponible_iva * currentExchangeRate).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>

                        <div>
                          <label class="block text-[10px] font-bold text-text-muted uppercase mb-1">IVA</label>
                          <input 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00"
                            value={Math.round((doc.monto_imp / (doc.tasa > 0 ? doc.tasa : 1)) * 100) / 100}
                            readonly
                            class="w-full bg-surface-soft border border-white/5 px-3 py-2 rounded-xl text-sm text-text-base focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all text-right font-black cursor-not-allowed opacity-90"
                          />
                          <span class="block text-[9px] text-text-muted/60 text-right mt-1">
                            Bs. {Number(doc.monto_imp).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>

                        <div>
                          <div class="flex justify-between items-center mb-1">
                            <label class="block text-[10px] font-bold text-text-muted uppercase">Reten. IVA</label>
                            <button 
                              onclick={() => (input.showIvaDetails = !input.showIvaDetails)} 
                              class="text-[9px] text-brand-500 font-bold hover:underline"
                            >
                              Detalle
                            </button>
                          </div>
                          <input 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00"
                            bind:value={input.reten_iva}
                            readonly
                            class="w-full bg-surface-soft border border-white/5 px-3 py-2 rounded-xl text-sm text-text-base focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all text-right font-bold text-green-400 cursor-not-allowed opacity-90"
                          />
                          <span class="block text-[9px] text-green-500/60 text-right mt-1">
                            Bs. {((input.reten_iva || 0) * currentExchangeRate).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>

                        <div>
                          <div class="flex justify-between items-center mb-1">
                            <label class="block text-[10px] font-bold text-text-muted uppercase">Reten. ISLR</label>
                            <button 
                              onclick={() => (input.showIslrDetails = !input.showIslrDetails)} 
                              class="text-[9px] text-brand-500 font-bold hover:underline"
                            >
                              Detalle
                            </button>
                          </div>
                          <input 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00"
                            bind:value={input.reten_islr}
                            readonly
                            class="w-full bg-surface-soft border border-white/5 px-3 py-2 rounded-xl text-sm text-text-base focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all text-right font-bold text-amber-300 cursor-not-allowed opacity-90"
                          />
                          <span class="block text-[9px] text-amber-300/60 text-right mt-1">
                            Bs. {((input.reten_islr || 0) * currentExchangeRate).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>
                      </div>

                      <!-- Detalles Retención IVA -->
                      {#if input.showIvaDetails}
                        <div class="bg-green-500/5 border border-green-500/10 p-4 rounded-xl space-y-3 text-xs animate-in slide-in-from-top-2 duration-150">
                          <div class="flex justify-between items-center">
                            <span class="font-bold text-green-400">Datos Comprobante Retención IVA</span>
                            <button onclick={() => (input.showIvaDetails = false)} class="text-text-muted hover:text-text-base"><X size={14} /></button>
                          </div>
                          <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1">NRO. COMPROBANTE</span>
                              <input 
                                type="text" 
                                placeholder="Ej: 2026060001" 
                                bind:value={input.num_comprobante_iva}
                                class="w-full bg-white/5 border border-white/5 px-2 py-1.5 rounded-lg text-xs"
                              />
                            </div>
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1">BASE IMPONIBLE</span>
                              <input 
                                type="number" 
                                step="0.01" 
                                bind:value={input.base_imponible_iva}
                                class="w-full bg-white/5 border border-white/5 px-2 py-1.5 rounded-lg text-xs text-right"
                              />
                            </div>
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1">ALÍCUOTA (%)</span>
                              <input 
                                type="number" 
                                bind:value={input.alicuota_iva}
                                class="w-full bg-white/5 border border-white/5 px-2 py-1.5 rounded-lg text-xs text-right"
                              />
                            </div>
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1 font-semibold text-green-400">MONTO RETENIDO (USD)</span>
                              <input 
                                type="number" 
                                step="0.01" 
                                bind:value={input.reten_iva}
                                oninput={() => recalculateDocAmounts(doc.nro_doc, doc)}
                                class="w-full bg-white/5 border border-green-500/30 text-green-400 font-bold px-2 py-1.5 rounded-lg text-xs text-right focus:border-green-500 focus:ring-0 focus:outline-hidden"
                              />
                            </div>
                          </div>
                        </div>
                      {/if}

                      <!-- Detalles Retención ISLR -->
                      {#if input.showIslrDetails}
                        <div class="bg-amber-500/5 border border-amber-500/10 p-4 rounded-xl space-y-3 text-xs animate-in slide-in-from-top-2 duration-150">
                          <div class="flex justify-between items-center">
                            <span class="font-bold text-amber-300">Datos Retención ISLR / Municipal</span>
                            <button onclick={() => (input.showIslrDetails = false)} class="text-text-muted hover:text-text-base"><X size={14} /></button>
                          </div>
                          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1">CONCEPTO</span>
                              <input 
                                type="text" 
                                placeholder="Ej: 001" 
                                bind:value={input.co_islr}
                                class="w-full bg-white/5 border border-white/5 px-2 py-1.5 rounded-lg text-xs"
                              />
                            </div>
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1">PORCENTAJE (%)</span>
                              <input 
                                type="number" 
                                step="0.1" 
                                bind:value={input.porc_islr}
                                oninput={() => {
                                  const docTasa = doc.tasa > 0 ? doc.tasa : 1;
                                  const baseImpUsd = (doc.total_neto - doc.monto_imp) / docTasa;
                                  input.reten_islr = Math.round((baseImpUsd * (input.porc_islr / 100)) * 100) / 100;
                                  recalculateDocAmounts(doc.nro_doc, doc);
                                }}
                                class="w-full bg-white/5 border border-white/5 px-2 py-1.5 rounded-lg text-xs text-right"
                              />
                            </div>
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1 font-semibold text-amber-400">MONTO RETENIDO (USD)</span>
                              <input 
                                type="number" 
                                step="0.01" 
                                bind:value={input.reten_islr}
                                oninput={() => recalculateDocAmounts(doc.nro_doc, doc)}
                                class="w-full bg-white/5 border border-amber-500/30 text-amber-300 font-bold px-2 py-1.5 rounded-lg text-xs text-right focus:border-amber-500 focus:ring-0 focus:outline-hidden"
                              />
                            </div>
                          </div>
                        </div>
                      {/if}

                      <!-- Neto Cobrado Calculado -->
                      {#if checkedDocs[doc.nro_doc] && doc.co_tipo_doc.trim() !== 'N/CR'}
                        <div class="mt-2 text-right border-t border-white/5 pt-3">
                          <span class="text-[10px] text-text-muted font-bold uppercase tracking-wider block">Neto Cobrado (Abono)</span>
                          <span class="text-sm font-black text-brand-500">
                            USD {input.mont_cob.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                          <span class="block text-[9px] text-text-muted/60 mt-0.5">
                            Bs. {(input.mont_cob * currentExchangeRate).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>

        <!-- SECCIÓN DERECHA: FORMAS DE PAGO -->
        <div class="lg:col-span-5 space-y-6">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-black text-text-base flex items-center gap-2">
              <CreditCard size={20} class="text-brand-500" />
              Instrumentos de Pago
            </h3>
            <button 
              onclick={addFormaPago}
              class="flex items-center gap-1.5 bg-brand-600/10 hover:bg-brand-600/25 border border-brand-600/30 text-brand-400 px-4 py-2 rounded-xl text-xs font-bold transition-all"
            >
              <Plus size={14} />
              Agregar
            </button>
          </div>

          {#if formasPago.length === 0}
            <div class="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center gap-4 text-center text-text-muted">
              <div class="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center text-text-muted/20">
                <CreditCard size={32} />
              </div>
              <div>
                <h4 class="font-bold text-text-base">Sin formas de pago</h4>
                <p class="text-xs max-w-xs mt-1">Agrega transferencias, efectivo, depósitos o tarjetas para cuadrar la colección.</p>
              </div>
              <button 
                onclick={addFormaPago}
                class="bg-brand-600 hover:bg-brand-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md"
              >
                Agregar Instrumento
              </button>
            </div>
          {:else}
            <div class="space-y-4">
              {#each formasPago as fp, index}
                <div class="glass p-5 rounded-2xl border border-white/5 space-y-4 relative animate-in slide-in-from-right-4 duration-200">
                  <button 
                    onclick={() => removeFormaPago(index)}
                    class="absolute top-4 right-4 text-text-muted hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition-all"
                    title="Eliminar Forma de Pago"
                  >
                    <Trash2 size={16} />
                  </button>

                  <div class="space-y-3">
                    <!-- Tipo Instrumento -->
                    <div>
                      <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Forma de Pago</span>
                      <select 
                        bind:value={fp.forma_pag} 
                        onchange={() => handleFormaPagChange(index)}
                        class="w-full bg-surface-soft border border-white/5 px-3 py-2 rounded-xl text-sm text-text-base focus:border-brand-500/50 focus:ring-0 focus:outline-hidden cursor-pointer"
                      >
                        <option value="EF">Efectivo</option>
                        <option value="TJ">Tarjeta de Débito/Crédito</option>
                        <option value="TE">Transferencia Bancaria</option>
                        <option value="DP">Depósito Bancario</option>
                        <option value="CH">Cheque</option>
                      </select>
                    </div>

                    <!-- Caja (Para EF o TJ) -->
                    {#if fp.forma_pag === 'EF' || fp.forma_pag === 'TJ'}
                      <div>
                        <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Caja Destino</span>
                        <select 
                          bind:value={fp.cod_caja}
                          class="w-full bg-surface-soft border border-white/5 px-3 py-2 rounded-xl text-sm text-text-base focus:border-brand-500/50 focus:ring-0"
                        >
                          {#each data.cajas as c}
                            <option value={c.cod_caja}>{c.descrip} ({c.co_mone})</option>
                          {/each}
                        </select>
                      </div>
                    {/if}

                    <!-- Cuenta Destino y Banco Emisor -->
                    {#if fp.forma_pag === 'TE' || fp.forma_pag === 'DP' || fp.forma_pag === 'CH'}
                      <div class="grid grid-cols-2 gap-3">
                        <div>
                          <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Cuenta Destino</span>
                          <select 
                            bind:value={fp.cod_cta}
                            class="w-full bg-surface-soft border border-white/5 px-3 py-2 rounded-xl text-xs text-text-base focus:border-brand-500/50 focus:ring-0"
                          >
                            {#each data.cuentasBancarias as cb}
                              <option value={cb.cod_cta}>{cb.descrip} ({cb.co_mone})</option>
                            {/each}
                          </select>
                        </div>
                        <div>
                          <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Banco Emisor</span>
                          <select 
                            bind:value={fp.co_ban}
                            class="w-full bg-surface-soft border border-white/5 px-3 py-2 rounded-xl text-xs text-text-base focus:border-brand-500/50 focus:ring-0"
                          >
                            {#each data.bancos as b}
                              <option value={b.co_ban}>{b.ban_des}</option>
                            {/each}
                          </select>
                        </div>
                      </div>
                    {/if}

                    <!-- Tarjeta -->
                    {#if fp.forma_pag === 'TJ'}
                      <div>
                        <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Tipo Tarjeta</span>
                        <select 
                          bind:value={fp.co_tar}
                          class="w-full bg-surface-soft border border-white/5 px-3 py-2 rounded-xl text-sm text-text-base focus:border-brand-500/50 focus:ring-0"
                        >
                          {#each data.tarjetasCredito as t}
                            <option value={t.co_tar}>{t.tar_des}</option>
                          {/each}
                        </select>
                      </div>
                    {/if}

                    <!-- Datos Referencia / Fecha -->
                    {#if fp.forma_pag !== 'EF'}
                      <div class="grid grid-cols-2 gap-3">
                        <div>
                          <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Nro. Referencia</span>
                          <input 
                            type="text" 
                            placeholder="Ej: 098765"
                            bind:value={fp.num_doc}
                            class="w-full bg-surface-soft border border-white/5 px-3 py-2 rounded-xl text-xs text-text-base"
                          />
                        </div>
                        <div>
                          <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Fecha Cheque/Transf</span>
                          <input 
                            type="date" 
                            bind:value={fp.fecha_che}
                            class="w-full bg-surface-soft border border-white/5 px-3 py-2 rounded-xl text-xs text-text-base"
                          />
                        </div>
                      </div>
                    {/if}

                    <!-- Monto -->
                    <div>
                      <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Monto Instrumento (USD)</span>
                      <input 
                        type="number" 
                        step="0.01" 
                        placeholder="0.00"
                        bind:value={fp.mont_doc}
                        class="w-full bg-surface-soft border border-white/5 px-4 py-2.5 rounded-xl text-sm text-text-base font-black text-right focus:border-brand-500/50"
                      />
                      <span class="block text-[9px] text-text-muted/60 text-right mt-1 font-bold">
                        Bs. {((fp.mont_doc || 0) * currentExchangeRate).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- BARRA DE CONTROL INFERIOR -->
{#if selectedCustomer && !saveSuccess}
  <div class="fixed bottom-0 left-0 md:left-64 right-0 glass border-t border-white/10 p-5 z-40 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-8 duration-300">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 flex-1">
      <div>
        <span class="text-[10px] text-text-muted font-bold uppercase tracking-wider block">Total Cobrado (Neto)</span>
        <span class="text-xl font-black text-text-base">${totalCobradoNeto.toLocaleString('de-DE', {minimumFractionDigits: 2})}</span>
        <span class="block text-[10px] text-text-muted/60 mt-0.5">
          Bs. {(totalCobradoNeto * currentExchangeRate).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
        </span>
      </div>
      <div>
        <span class="text-[10px] text-text-muted font-bold uppercase tracking-wider block">Total Retenciones IVA</span>
        <span class="text-xl font-black text-green-400">${totalRetenidoIva.toLocaleString('de-DE', {minimumFractionDigits: 2})}</span>
        <span class="block text-[10px] text-green-500/60 mt-0.5">
          Bs. {(totalRetenidoIva * currentExchangeRate).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
        </span>
      </div>
      <div>
        <span class="text-[10px] text-text-muted font-bold uppercase tracking-wider block">Total Retenciones ISLR</span>
        <span class="text-xl font-black text-amber-300">${totalRetenidoIslr.toLocaleString('de-DE', {minimumFractionDigits: 2})}</span>
        <span class="block text-[10px] text-amber-300/60 mt-0.5">
          Bs. {(totalRetenidoIslr * currentExchangeRate).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
        </span>
      </div>
      <div>
        <span class="text-[10px] text-text-muted font-bold uppercase tracking-wider block">Diferencia de Cuadre</span>
        {#if diferenciaCuadre === 0}
          <span class="text-xl font-black text-green-500 flex items-center gap-1.5 mt-0.5">
            <CheckCircle size={16} />
            Cuadrado
          </span>
        {:else}
          <span class="text-xl font-black text-red-400 block">${diferenciaCuadre.toLocaleString('de-DE', {minimumFractionDigits: 2})}</span>
          <span class="block text-[10px] text-red-400/60 mt-0.5">
            Bs. {(diferenciaCuadre * currentExchangeRate).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </span>
        {/if}
      </div>
    </div>

    <!-- Acciones -->
    <div class="flex flex-col md:flex-row items-stretch md:items-center gap-3 shrink-0">
      {#if saveError}
        <div class="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-xl text-xs max-w-xs flex items-center gap-2">
          <AlertCircle size={14} class="shrink-0" />
          <span>{saveError}</span>
        </div>
      {/if}

      <button 
        disabled={diferenciaCuadre !== 0 || saving || !documentos.some(doc => checkedDocs[doc.nro_doc])}
        onclick={saveCobro}
        class="bg-brand-600 hover:bg-brand-500 text-white disabled:bg-white/5 disabled:text-text-muted disabled:border-white/5 disabled:pointer-events-none px-10 py-4 rounded-2xl font-black text-base transition-all active:scale-95 shadow-xl shadow-brand-500/10 flex items-center justify-center gap-2"
      >
        {#if saving}
          <RefreshCw size={18} class="animate-spin" />
          Procesando...
        {:else}
          Guardar Cobro
        {/if}
      </button>
    </div>
  </div>
{/if}
