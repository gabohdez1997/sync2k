<!-- src/routes/dashboard/cash/payments/history/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto, invalidateAll } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { 
    Wallet, Search, Filter, Plus, Calendar, Eye, X, Trash2,
    AlertCircle, RefreshCw, Printer, AlertTriangle, Building, CreditCard, Landmark, CheckCircle,
    FileText, ChevronLeft, ChevronRight, Ban, Edit2, Store
  } from 'lucide-svelte';
  import { fade } from 'svelte/transition';
  import SearchBar from "$lib/components/ui/SearchBar.svelte";
  import Combobox from "$lib/components/ui/Combobox.svelte";

  let { data } = $props();

  let showVoidModal = $state(false);
  let paymentToVoid = $state<any>(null);
  let voidPassword = $state('');
  let isVoiding = $state(false);

  function openVoidModal(payment: any) {
    paymentToVoid = payment;
    voidPassword = '';
    showVoidModal = true;
  }

  let searchInput = $state('');
  let selectedBranch = $state(data.selectedBranchId);

  // Sincronizar inputs si cambian desde la URL
  $effect(() => {
    selectedBranch = data.selectedBranchId;
    searchInput = $page.url.searchParams.get('search') || '';
  });

  // Funciones de navegación y filtrado
  function applyFilters(pageNumber = 1) {
    const qParams = new URLSearchParams();
    qParams.set('branch_id', selectedBranch);
    qParams.set('page', String(pageNumber));
    if (searchInput) qParams.set('search', searchInput);
    
    goto(`?${qParams.toString()}`);
  }

  function clearFilters() {
    searchInput = '';
    applyFilters(1);
  }

  // Modal de Detalle
  let detailModalOpen = $state(false);
  let loadingDetail = $state(false);
  let detailData = $state<any>(null);
  let detailError = $state<string | null>(null);

  async function openDetail(cobNum: string) {
    isEditingPayment = false;
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

  async function openEditDirectly(cobNum: string) {
    await openDetail(cobNum);
    if (detailData && !detailData.anulado && data.canEdit) {
      await startEditing();
    }
  }

  function isDocumentoFiscal(co_sucu_in: string, monto_imp: number, sede_id: string) {
    if (monto_imp > 0) return true;
    
    const bConfig = data.branches?.find((b: any) => String(b.id).toLowerCase() === String(sede_id).toLowerCase());
    if (!bConfig) return false;
    
    let codes = bConfig.profit_branch_codes;
    if (typeof codes === "string") {
      try { codes = JSON.parse(codes); } catch (e) {}
    }
    if (!Array.isArray(codes)) return false;
    
    const found = codes.find(
      (c: any) =>
        c.is_default === true ||
        String(c.is_default) === "true" ||
        c.default === true
    );
    if (!found) return false;
    
    return String(co_sucu_in || '').trim().toUpperCase() === String(found.code).trim().toUpperCase();
  }

  function parseDocumentosAsociados(docStr: string, sede_id: string) {
    if (!docStr || docStr === '---') return [];
    return docStr.split(',').map(s => {
      const parts = s.trim().split(':');
      const docTypeAndNum = parts[0]?.trim() || '';
      const docSucu = parts[1]?.trim() || '';
      const docMontoImp = Number(parts[2]?.trim() || '0');
      
      const docParts = docTypeAndNum.split(' ');
      const co_tipo_doc = docParts[0]?.trim() || '';
      const nro_doc = docParts[1]?.trim() || '';
      const isFiscal = isDocumentoFiscal(docSucu, docMontoImp, sede_id);
      return { co_tipo_doc, nro_doc, isFiscal };
    });
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

  // Edit State & Actions
  import { toast } from 'svelte-sonner';
  let isEditingPayment = $state(false);
  let editRenglones = $state<any[]>([]);
  let editFormasPago = $state<any[]>([]);
  let editTasa = $state(1);
  let isSavingEdit = $state(false);

  // Reactivo: Auto-distribuir el total de instrumentos de pago a las facturas seleccionadas en la edición
  $effect(() => {
    let remainingPaymentBs = editTotalInstrumentosBs;
    let remainingPaymentUsd = editTotalInstrumentos;

    for (const r of editRenglones) {
      const docTasa = editTasa > 0 ? editTasa : 1;

      const retIvaBs = Number(r.reten_iva_bs) || 0;
      const retIslrBs = Number(r.reten_islr_bs) || 0;
      
      const retIvaUsd = Number(r.reten_iva) || 0;
      const retIslrUsd = Number(r.reten_islr) || 0;

      const maxAbonoBs = Math.max(0, Math.round((r.maxBalanceBs - retIvaBs - retIslrBs) * 100) / 100);
      const maxAbonoUsd = Math.max(0, Math.round((r.maxBalanceUsd - retIvaUsd - retIslrUsd) * 100) / 100);

      const appliedBs = Math.min(remainingPaymentBs, maxAbonoBs);
      const appliedUsd = Math.min(remainingPaymentUsd, maxAbonoUsd);

      r.mont_cob_bs = Math.round(appliedBs * 100) / 100;
      r.mont_cob = Math.round(appliedUsd * 100) / 100;

      remainingPaymentBs = Math.max(0, Math.round((remainingPaymentBs - appliedBs) * 100) / 100);
      remainingPaymentUsd = Math.max(0, Math.round((remainingPaymentUsd - appliedUsd) * 100) / 100);
    }
  });

  let cajas = $state<any[]>([]);
  let cuentasBancarias = $state<any[]>([]);
  let bancos = $state<any[]>([]);
  let tarjetasCredito = $state<any[]>([]);
  let catalogsLoaded = $state(false);

  async function loadCatalogs() {
    if (catalogsLoaded) return;
    try {
      const branchId = data.selectedBranchId;
      const [cRes, cbRes, bRes, tRes] = await Promise.all([
        fetch(`/api/agent/catalogos/cajas?branch_id=${branchId}`).then(r => r.json()),
        fetch(`/api/agent/catalogos/cuentas_bancarias?branch_id=${branchId}`).then(r => r.json()),
        fetch(`/api/agent/catalogos/bancos?branch_id=${branchId}`).then(r => r.json()),
        fetch(`/api/agent/catalogos/tarjetas_credito?branch_id=${branchId}`).then(r => r.json())
      ]);
      cajas = cRes.success && cRes.data ? cRes.data : [];
      cuentasBancarias = cbRes.success && cbRes.data ? cbRes.data : [];
      bancos = bRes.success && bRes.data ? bRes.data : [];
      tarjetasCredito = tRes.success && tRes.data ? tRes.data : [];
      catalogsLoaded = true;
    } catch (e) {
      console.error('Error loading catalogs:', e);
    }
  }

  function getEditRowCurrency(fp: any) {
    if (fp.forma_pag === "EF" || fp.forma_pag === "TJ" || fp.forma_pag === "CT") {
      if (fp.cod_caja) {
        const caja = cajas?.find((c: any) => c.cod_caja?.trim() === fp.cod_caja?.trim());
        const mone = caja?.co_mone?.trim()?.toUpperCase() || 'BS';
        return (mone === 'VES' || mone === 'BS') ? 'BS' : 'USD';
      }
    } else if (fp.forma_pag === "TE" || fp.forma_pag === "DP" || fp.forma_pag === "CH" || fp.forma_pag === "TP") {
      if (fp.cod_cta) {
        const cta = cuentasBancarias?.find((c: any) => c.cod_cta?.trim() === fp.cod_cta?.trim());
        const mone = cta?.co_mone?.trim()?.toUpperCase() || 'BS';
        return (mone === 'VES' || mone === 'BS') ? 'BS' : 'USD';
      }
    }
    return 'BS';
  }

  async function startEditing() {
    if (!detailData) return;
    await loadCatalogs();

    editTasa = Number(detailData.tasa) || 1;

    editRenglones = detailData.renglones.filter((r: any) => {
      const type = r.co_tipo_doc.trim().toUpperCase();
      return !['IVAN', 'ISLR'].includes(type);
    }).map((r: any) => {
      const retIvaMatch = detailData.retenciones_iva?.find((ri: any) => ri.rowguid_reng_cob === r.rowguid || ri.numero_documento_afectado?.trim() === r.nro_doc?.trim());
      const retIslrMatch = detailData.retenciones_islr?.find((rn: any) => rn.rowguid_reng_cob === r.rowguid);

      const rawNetoBs = Number(r.mont_cob) - Number(r.monto_retencion_iva) - Number(r.monto_retencion);
      const montCobUsd = Math.round((rawNetoBs / editTasa) * 100) / 100;

      const baseImpUsd = retIvaMatch ? Math.round((Number(retIvaMatch.base_imponible) / editTasa) * 100) / 100 : 0;
      const baseImpBs = retIvaMatch ? Number(retIvaMatch.base_imponible) : 0;

      const hasIva = Number(r.monto_retencion_iva) > 0;
      const hasIslr = Number(r.monto_retencion) > 0;

      return {
        rowguid: r.rowguid,
        co_tipo_doc: r.co_tipo_doc,
        nro_doc: r.nro_doc,
        mont_cob: montCobUsd,
        mont_cob_bs: rawNetoBs,
        monto_imp: Number(r.monto_imp) || 0,
        total_neto: Number(r.total_neto) || (rawNetoBs + Number(r.monto_retencion_iva) + Number(r.monto_retencion)),
        otros1: Number(r.otros1) || 0,
        
        showIvaDetails: hasIva,
        manual_override_iva: hasIva,
        reten_iva: Math.round((Number(r.monto_retencion_iva) / editTasa) * 100) / 100,
        reten_iva_bs: Number(r.monto_retencion_iva),
        num_comprobante_iva: retIvaMatch ? retIvaMatch.num_comprobante?.trim() : "",
        base_imponible_iva: baseImpUsd,
        base_imponible_iva_bs: baseImpBs,
        alicuota_iva: retIvaMatch ? retIvaMatch.alicuota : 16,

        showIslrDetails: hasIslr,
        manual_override_islr: hasIslr,
        reten_islr: Math.round((Number(r.monto_retencion) / editTasa) * 100) / 100,
        reten_islr_bs: Number(r.monto_retencion),
        co_islr: retIslrMatch ? retIslrMatch.co_islr?.trim() : "001",
        porc_islr: retIslrMatch ? retIslrMatch.porc_retn : 2,

        maxBalanceBs: rawNetoBs + Number(r.monto_retencion_iva) + Number(r.monto_retencion),
        maxBalanceUsd: montCobUsd + Math.round((Number(r.monto_retencion_iva) / editTasa) * 100) / 100 + Math.round((Number(r.monto_retencion) / editTasa) * 100) / 100
      };
    });

    try {
      const custDocsRes = await fetch(`/api/agent/customers/${encodeURIComponent(detailData.co_cli)}/documentos?branch_id=${data.selectedBranchId}`).then(r => r.json());
      if (custDocsRes.success && custDocsRes.data) {
        editRenglones = editRenglones.map((r: any) => {
          const matchedDoc = custDocsRes.data.find((d: any) => d.nro_doc?.trim() === r.nro_doc?.trim() && d.co_tipo_doc?.trim() === r.co_tipo_doc?.trim());
          const currentSaldoBs = matchedDoc ? Number(matchedDoc.saldo) : 0;
          
          const origReng = detailData.renglones.find((x: any) => x.nro_doc?.trim() === r.nro_doc?.trim() && x.co_tipo_doc?.trim() === r.co_tipo_doc?.trim());
          const totalRebajeOldBs = origReng ? Number(origReng.mont_cob || 0) : 0;
          
          const maxFactBalanceBs = currentSaldoBs + totalRebajeOldBs;
          const maxFactBalanceUsd = Math.round((maxFactBalanceBs / editTasa) * 100) / 100;
          
          return {
            ...r,
            maxBalanceBs: maxFactBalanceBs,
            maxBalanceUsd: maxFactBalanceUsd
          };
        });
      }
    } catch (e) {
      console.error("Error fetching current customer balances for editing:", e);
    }

    editFormasPago = detailData.formas_pago.map((f: any) => {
      const montDocBs = Number(f.mont_doc);
      const montDocUsd = Math.round((montDocBs / editTasa) * 100) / 100;

      return {
        forma_pag: f.forma_pag,
        cod_caja: f.cod_caja || "",
        cod_cta: f.cod_cta || "",
        co_ban: f.co_ban || "",
        co_tar: f.co_tar || "",
        num_doc: f.num_doc || "",
        mont_doc: montDocUsd,
        mont_doc_bs: montDocBs,
        fecha_che: f.fecha_che ? new Date(f.fecha_che).toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10),
      };
    });

    isEditingPayment = true;
  }

  function addEditFormaPago() {
    const initialFp = {
      forma_pag: "EF",
      cod_caja: cajas[0]?.cod_caja || "",
      cod_cta: "",
      co_ban: "",
      co_tar: "",
      num_doc: "",
      mont_doc: 0,
      mont_doc_bs: 0,
      fecha_che: new Date().toISOString().substring(0, 10),
    };
    const isBs = getEditRowCurrency(initialFp) === 'BS';
    if (isBs) {
      initialFp.mont_doc_bs = editSaldoPendienteBs > 0 ? editSaldoPendienteBs : 0;
      initialFp.mont_doc = Math.round((initialFp.mont_doc_bs / editTasa) * 100) / 100;
    } else {
      initialFp.mont_doc = editSaldoPendiente > 0 ? editSaldoPendiente : 0;
      initialFp.mont_doc_bs = Math.round(initialFp.mont_doc * editTasa * 100) / 100;
    }
    editFormasPago.push(initialFp);
  }

  function removeEditFormaPago(index: number) {
    editFormasPago = editFormasPago.filter((_, i) => i !== index);
  }

  function handleEditFormaPagChange(index: number) {
    const fp = editFormasPago[index];
    if (fp.forma_pag === "EF") {
      fp.cod_caja = cajas[0]?.cod_caja || "";
      fp.cod_cta = "";
      fp.co_ban = "";
      fp.co_tar = "";
      fp.num_doc = "";
    } else if (fp.forma_pag === "TJ") {
      fp.cod_caja = cajas[0]?.cod_caja || "";
      fp.cod_cta = "";
      fp.co_ban = "";
      fp.co_tar = tarjetasCredito[0]?.co_tar || "";
      fp.num_doc = "";
    } else if (
      fp.forma_pag === "TE" ||
      fp.forma_pag === "DP" ||
      fp.forma_pag === "CH"
    ) {
      fp.cod_caja = "";
      fp.cod_cta = cuentasBancarias[0]?.cod_cta || "";
      fp.co_ban = bancos[0]?.co_ban || "";
      fp.co_tar = "";
    }
    handleEditCajaCtaChange(index);
  }

  function handleEditCajaCtaChange(index: number) {
    const fp = editFormasPago[index];
    const isBs = getEditRowCurrency(fp) === 'BS';
    if (isBs) {
      fp.mont_doc_bs = fp.mont_doc_bs || Math.round(fp.mont_doc * editTasa * 100) / 100;
      if (Math.abs(editDiferenciaCuadreBs) < 10.00 && editDiferenciaCuadreBs !== 0) {
        fp.mont_doc_bs = Math.round((fp.mont_doc_bs + editDiferenciaCuadreBs) * 100) / 100;
      }
      fp.mont_doc = Math.round((fp.mont_doc_bs / (editTasa > 0 ? editTasa : 1)) * 100) / 100;
    } else {
      fp.mont_doc = fp.mont_doc || Math.round((fp.mont_doc_bs / (editTasa > 0 ? editTasa : 1)) * 100) / 100;
      if (Math.abs(editDiferenciaCuadre) < 0.20 && editDiferenciaCuadre !== 0) {
        fp.mont_doc = Math.round((fp.mont_doc + editDiferenciaCuadre) * 100) / 100;
      }
      fp.mont_doc_bs = Math.round(fp.mont_doc * editTasa * 100) / 100;
    }
  }

  function recalculateEditDocAmounts(index: number) {
    const r = editRenglones[index];
    if (!r) return;

    if (r.showIvaDetails) {
      if (!r.manual_override_iva && r.reten_iva === 0) {
        const totalNetoBs = r.total_neto > 0 ? r.total_neto : r.maxBalanceBs;
        const montoImpBs = r.total_neto > 0 ? r.monto_imp : Math.round((totalNetoBs - (totalNetoBs / 1.16)) * 100) / 100;
        
        r.base_imponible_iva_bs = r.base_imponible_iva_bs || Math.round((totalNetoBs - montoImpBs - (r.otros1 || 0)) * 100) / 100;
        r.base_imponible_iva = Math.round((r.base_imponible_iva_bs / editTasa) * 100) / 100;
        const porc = Number(detailData.porc_esp || 75);
        r.reten_iva_bs = Math.round(montoImpBs * (porc / 100) * 100) / 100;
        r.reten_iva = Math.round((r.reten_iva_bs / editTasa) * 100) / 100;
      } else if (r.manual_override_iva) {
        r.reten_iva_bs = Math.round((r.reten_iva || 0) * editTasa * 100) / 100;
      }
    } else {
      r.reten_iva = 0;
      r.reten_iva_bs = 0;
      r.num_comprobante_iva = "";
    }

    if (r.showIslrDetails) {
      if (!r.manual_override_islr && r.reten_islr === 0) {
        const totalNetoBs = r.total_neto > 0 ? r.total_neto : r.maxBalanceBs;
        const baseBs = r.base_imponible_iva_bs || (totalNetoBs - (r.monto_imp || 0));
        r.reten_islr_bs = Math.round(baseBs * (r.porc_islr / 100) * 100) / 100;
        r.reten_islr = Math.round((r.reten_islr_bs / editTasa) * 100) / 100;
      } else if (r.manual_override_islr) {
        r.reten_islr_bs = Math.round((r.reten_islr || 0) * editTasa * 100) / 100;
      }
    } else {
      r.reten_islr = 0;
      r.reten_islr_bs = 0;
    }
  }

  // Derived variables for Edit mode
  let editTotalCobrado = $derived(
    editRenglones.reduce((acc, r) => acc + (Number(r.mont_cob) || 0), 0)
  );

  let editTotalCobradoBs = $derived(
    editRenglones.reduce((acc, r) => acc + (Number(r.mont_cob_bs) || 0), 0)
  );

  let editTotalRetenidoIva = $derived(
    editRenglones.reduce((acc, r) => acc + (Number(r.reten_iva) || 0), 0)
  );

  let editTotalRetenidoIslr = $derived(
    editRenglones.reduce((acc, r) => acc + (Number(r.reten_islr) || 0), 0)
  );

  let editTotalRetenidoIvaVista = $derived(
    editRenglones.reduce((acc, r) => {
      const docTasa = editTasa > 0 ? editTasa : 1;
      const porcIva = detailData ? (Number(detailData.porc_esp) || 0) : 0;
      const theoreticalRetIvaBs = Math.round((r.monto_imp || 0) * (porcIva / 100) * 100) / 100;
      const theoreticalRetIvaUsd = Math.round((theoreticalRetIvaBs / docTasa) * 100) / 100;
      return acc + Math.max(r.reten_iva || 0, theoreticalRetIvaUsd);
    }, 0)
  );

  let editTotalRetenidoIslrVista = $derived(
    editRenglones.reduce((acc, r) => acc + (Number(r.reten_islr) || 0), 0)
  );

  let editTotalInstrumentos = $derived(
    editFormasPago.reduce((acc, curr) => acc + (Number(curr.mont_doc) || 0), 0)
  );

  let editSaldoPendiente = $derived(
    editRenglones.reduce((acc, r) => {
      const docTasa = editTasa > 0 ? editTasa : 1;
      const porcIva = detailData ? (Number(detailData.porc_esp) || 0) : 0;
      const theoreticalRetIvaBs = Math.round((r.monto_imp || 0) * (porcIva / 100) * 100) / 100;
      const theoreticalRetIvaUsd = Math.round((theoreticalRetIvaBs / docTasa) * 100) / 100;
      
      const appliedRetIva = Math.max(r.reten_iva || 0, theoreticalRetIvaUsd);
      const appliedRetIslr = r.reten_islr || 0;
      
      return acc + (Number(r.maxBalanceUsd) || 0) - appliedRetIva - appliedRetIslr;
    }, 0) - editTotalCobrado
  );

  let editSaldoPendienteBs = $derived(
    editRenglones.reduce((acc, r) => {
      const porcIva = detailData ? (Number(detailData.porc_esp) || 0) : 0;
      const theoreticalRetIvaBs = Math.round((r.monto_imp || 0) * (porcIva / 100) * 100) / 100;
      
      const appliedRetIvaBs = Math.max(r.reten_iva_bs || 0, theoreticalRetIvaBs);
      const appliedRetIslrBs = r.reten_islr_bs || 0;
      
      return acc + (Number(r.maxBalanceBs) || 0) - appliedRetIvaBs - appliedRetIslrBs;
    }, 0) - editTotalCobradoBs
  );

  let hasPendingIvaVoucher = $derived(
    editRenglones.some(r => {
      const porcIva = detailData ? (Number(detailData.porc_esp) || 0) : 0;
      const theoreticalRetIvaBs = Math.round((r.monto_imp || 0) * (porcIva / 100) * 100) / 100;
      return theoreticalRetIvaBs > 0 && !r.num_comprobante_iva;
    })
  );

  let editTotalInstrumentosBs = $derived(
    editFormasPago.reduce((acc, fp) => {
      const isBs = getEditRowCurrency(fp) === 'BS';
      return acc + (isBs ? (Number(fp.mont_doc_bs) || 0) : Math.round(fp.mont_doc * editTasa * 100) / 100);
    }, 0)
  );

  let editDiferenciaCuadreBs = $derived(
    Math.round((editTotalCobradoBs - editTotalInstrumentosBs) * 100) / 100
  );

  let editDiferenciaCuadre = $derived(
    Math.round((editDiferenciaCuadreBs / (editTasa > 0 ? editTasa : 1)) * 100) / 100
  );

  async function saveEditPayment() {
    for (const r of editRenglones) {
      if (r.showIvaDetails && r.reten_iva_bs > 0) {
        const compNum = (r.num_comprobante_iva || "").trim();
        if (!compNum || compNum.toUpperCase() === "S/N" || compNum.toUpperCase() === "SN") {
          toast.error(`Debe ingresar el número de comprobante para la retención de IVA del documento ${r.nro_doc}.`);
          return;
        }
      }
    }

    isSavingEdit = true;

    const renglones = editRenglones.map(r => {
      return {
        co_tipo_doc: r.co_tipo_doc,
        nro_doc: r.nro_doc,
        mont_cob: r.mont_cob_bs,
        monto_retencion_iva: r.reten_iva_bs,
        monto_retencion: r.reten_islr_bs,
        parent_doc: null
      };
    });

    const retenciones_iva = editRenglones.filter(r => r.reten_iva_bs > 0).map(r => {
      const today = new Date();
      const periodStr = today.getFullYear() + String(today.getMonth() + 1).padStart(2, "0");
      return {
        nro_doc_asoc: r.nro_doc,
        rif_contribuyente: detailData.rif,
        periodo_impositivo: Number(periodStr),
        fecha_documento: new Date().toISOString(),
        rif_comprador: "J000000000",
        numero_documento: r.nro_doc,
        numero_control_documento: "",
        monto_documento: r.maxBalanceBs,
        base_imponible: r.base_imponible_iva_bs || 0,
        monto_ret_imp: r.reten_iva_bs || 0,
        numero_documento_afectado: r.nro_doc,
        num_comprobante: r.num_comprobante_iva ? r.num_comprobante_iva.trim() : "",
        monto_excento: 0,
        alicuota: r.alicuota_iva
      };
    });

    const retenciones_islr = editRenglones.filter(r => r.reten_islr_bs > 0).map(r => {
      return {
        nro_doc_asoc: r.nro_doc,
        co_islr: r.co_islr,
        monto: r.mont_cob_bs,
        monto_reten: r.reten_islr_bs || 0,
        monto_obj: r.mont_cob_bs,
        sustraendo: 0,
        porc_retn: r.porc_islr
      };
    });

    const formas_pago_cleaned = editFormasPago.map(fp => {
      const isBs = getEditRowCurrency(fp) === 'BS';
      const montDocBs = isBs ? (fp.mont_doc_bs || 0) : Math.round(fp.mont_doc * editTasa * 100) / 100;
      return {
        forma_pag: fp.forma_pag,
        cod_caja: fp.cod_caja || null,
        cod_cta: fp.cod_cta || null,
        co_ban: fp.co_ban || null,
        co_tar: fp.co_tar || null,
        num_doc: fp.num_doc || null,
        mont_doc: montDocBs,
        fecha_che: fp.fecha_che || null
      };
    });

    const payload = {
      co_cli: detailData.co_cli,
      co_ven: detailData.co_ven,
      co_mone: detailData.co_mone?.trim()?.toUpperCase() === 'US$' ? 'USD' : (detailData.co_mone || 'USD'),
      tasa: editTasa,
      descrip: detailData.descrip,
      renglones,
      formas_pago: formas_pago_cleaned,
      retenciones_iva,
      retenciones_islr
    };

    try {
      const res = await fetch(`/api/agent/payments/${detailData.cob_num}?branch_id=${data.selectedBranchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const resJson = await res.json();
        if (resJson.success) {
          toast.success("¡Cobro actualizado con éxito!");
          isEditingPayment = false;
          detailModalOpen = false;
          detailData = null;
          await invalidateAll();
        } else {
          toast.error(resJson.message || "Error al actualizar el cobro.");
        }
      } else {
        toast.error(`Error HTTP: ${res.statusText}`);
      }
    } catch (e: any) {
      toast.error(`Error de red: ${e.message}`);
    } finally {
      isSavingEdit = false;
    }
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
      <a 
        href="/dashboard/cash/payments?branch_id={selectedBranch}"
        class="flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-500 text-white h-14 px-8 rounded-2xl font-black shadow-xl shadow-brand-500/20 transition-all active:scale-95 shrink-0 w-full md:w-auto cursor-pointer"
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
    class="glass p-4 rounded-3xl border border-white/5 shadow-2xl grid grid-cols-1 md:grid-cols-2 gap-4 items-center mb-6 w-full relative z-20"
  >
    {#if data.branches && data.branches.length > 1}
      <div class="w-full">
        <Combobox
          options={data.branches.map((b: any) => ({ value: b.id, label: b.name }))}
          bind:value={selectedBranch}
          placeholder="Sucursal..."
          icon={Store}
          class="w-full h-14"
          onchange={() => applyFilters(1)}
        />
      </div>
    {/if}

    <div class="w-full {!(data.branches && data.branches.length > 1) ? 'md:col-span-2' : ''}">
      <SearchBar
        bind:value={searchInput}
        isSearching={false}
        onsubmit={() => applyFilters(1)}
        placeholder="Buscar por cliente, RIF, cobro o recibo..."
        className="w-full h-14"
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
              <th class="px-6 py-5">Nro. Cobro</th>
              <th class="px-6 py-5">Factura / Documento</th>
              <th class="px-6 py-5">Cliente</th>
              <th class="px-6 py-5 text-right">Monto</th>
              {#if data.canSeeOthers}
                <th class="px-6 py-5 text-center">Cajero</th>
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
                    class="px-2.5 py-1 rounded-lg bg-surface-soft border border-border-subtle text-xs font-black text-brand-500 group-hover:bg-brand-500 group-hover:border-brand-500 group-hover:text-white transition-all inline-block"
                  >
                    {p.cob_num}
                  </span>
                  {#if p.recibo && p.recibo.trim() !== p.cob_num.trim()}
                    <div class="text-xs text-text-muted/60 mt-1">Recibo: {p.recibo}</div>
                  {/if}
                </td>
                <td class="px-6 py-5">
                  <div class="flex flex-col gap-1.5 items-start">
                    {#each parseDocumentosAsociados(p.documentos_asociados, p.sede_id) as doc}
                      <div class="flex flex-col gap-1 items-start">
                        <span
                          class="px-2.5 py-1 rounded-lg bg-surface-soft border border-border-subtle text-xs font-black text-brand-500 group-hover:bg-brand-500 group-hover:border-brand-500 group-hover:text-white transition-all inline-block"
                        >
                          {doc.nro_doc}
                        </span>
                        <span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md {doc.isFiscal ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}">
                          {doc.isFiscal ? 'Factura' : 'Nota de Entrega'}
                        </span>
                      </div>
                    {:else}
                      <span class="text-xs text-text-muted/50">---</span>
                    {/each}
                  </div>
                </td>
                <td class="px-6 py-5 max-w-xs">
                  <div class="font-bold truncate">{p.cli_des}</div>
                  <div class="text-xs text-text-muted/60 mt-0.5">{p.co_cli} • {p.rif}</div>
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
                {#if data.canSeeOthers}
                  <td class="px-6 py-5 text-center">
                    <div class="relative group/tooltip inline-block">
                      <span
                        class="px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 text-xs font-bold uppercase tracking-wider cursor-help"
                      >
                        {p.co_us_in || "---"}
                      </span>
                      <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tooltip:block bg-surface-raised border border-border-subtle px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider text-text-base whitespace-nowrap shadow-2xl z-30 pointer-events-none transition-all">
                        {String(p.cashier_name || p.co_us_in || "---").toUpperCase()}
                        <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border-subtle"></div>
                      </div>
                    </div>
                  </td>
                {/if}
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
                    {#if p.anulado}
                      <button 
                        onclick={() => openDetail(p.cob_num)}
                        class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all cursor-pointer"
                        title="Ver Detalle"
                      >
                        <Eye size={18} />
                      </button>
                    {:else if data.canEdit}
                      <button 
                        onclick={() => openEditDirectly(p.cob_num)}
                        class="p-2 text-text-muted hover:text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all cursor-pointer"
                        title="Editar Cobro"
                      >
                        <Edit2 size={18} />
                      </button>
                    {/if}
                    {#if data.canVoid && !p.anulado}
                      <button 
                        onclick={() => openVoidModal(p)}
                        class="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
                        title="Anular Cobro"
                      >
                        <Ban size={18} />
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
            <h3 class="font-black text-xl text-text-base">{isEditingPayment ? "Editar Cobro" : "Detalle de Cobro"}</h3>
            <p class="text-xs text-text-muted">{isEditingPayment ? "Modificar registro en el Agente Profit Plus" : "Consulta de registros del Agente Profit Plus"}</p>
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
          {#if isEditingPayment}
            <!-- MODE EDICIÓN -->
            <div class="space-y-8">
              <!-- Información General Fija -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="bg-white/5 p-5 rounded-2xl border border-white/5">
                  <span class="text-xs text-text-muted/65 uppercase font-bold tracking-wider">Identificador</span>
                  <div class="text-2xl font-black text-brand-500 mt-1">{detailData.cob_num}</div>
                </div>

                <div class="bg-white/5 p-5 rounded-2xl border border-white/5">
                  <span class="text-xs text-text-muted/65 uppercase font-bold tracking-wider">Cliente</span>
                  <div class="text-lg font-bold text-text-base mt-1 truncate">{detailData.cli_des}</div>
                  <div class="text-xs text-text-muted mt-1">{detailData.co_cli} • {detailData.rif}</div>
                </div>

                <div class="bg-white/5 p-5 rounded-2xl border border-white/5">
                  <span class="text-xs text-text-muted/65 uppercase font-bold tracking-wider">Tasa de Cambio</span>
                  <div class="text-2xl font-black text-text-base mt-1">
                    <span class="text-xs text-text-muted/70 font-normal mr-1">Bs. / USD</span>
                    {Number(editTasa).toFixed(2)}
                  </div>
                </div>
              </div>

              <!-- Documentos Amortizados Editables -->
              <div class="space-y-4">
                <h4 class="font-black text-text-base text-lg flex items-center gap-2">
                  <FileText size={18} class="text-brand-500" />
                  Facturas y Deudas a Cobrar
                </h4>
                
                <div class="space-y-4">
                  {#each editRenglones as r, idx}
                    <div class="bg-surface-soft/20 rounded-2xl border border-border-subtle p-5 hover:border-white/10 transition-all space-y-4">
                      <!-- Fila Superior -->
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <span class="bg-white/5 border border-white/5 px-2 py-0.5 rounded-md font-bold text-xs text-text-muted uppercase">{r.co_tipo_doc}</span>
                          <span class="font-black text-text-base text-base">{r.nro_doc}</span>
                        </div>
                        <div class="flex items-center gap-6">
                          <div class="text-right">
                            <span class="text-[10px] text-text-muted/60 font-black block uppercase tracking-wider">Disponible en Factura</span>
                            <span class="text-sm font-bold text-brand-500">$ {r.maxBalanceUsd.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      
                      <!-- Controles de Abono e Impuestos -->
                      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <!-- Total Factura ($) (Solo Lectura) -->
                        <div>
                          <label class="block text-xs font-black text-text-muted uppercase mb-1.5">Total Factura</label>
                          <span class="block text-sm font-bold text-text-base py-1.5 font-mono">
                            $ {(r.total_neto / editTasa).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span class="block text-xs text-text-muted font-bold mt-1.5">
                            Bs. {(r.total_neto || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        <!-- Total IVA ($) (Solo Lectura) -->
                        <div>
                          <label class="block text-xs font-black text-text-muted uppercase mb-1.5">Total IVA</label>
                          <span class="block text-sm font-bold text-text-base py-1.5 font-mono">
                            $ {(r.monto_imp / editTasa).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span class="block text-xs text-text-muted font-bold mt-1.5">
                            Bs. {(r.monto_imp || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        <!-- Retención de IVA ($) -->
                        <div>
                          <div class="flex justify-between items-center mb-1.5">
                            <label class="block text-xs font-black text-text-muted uppercase">Reten. IVA ($)</label>
                            <button
                              type="button"
                              onclick={() => {
                                r.showIvaDetails = !r.showIvaDetails;
                                if (!r.showIvaDetails) {
                                  r.reten_iva_bs = 0;
                                  r.reten_iva = 0;
                                  r.manual_override_iva = true;
                                } else {
                                  r.manual_override_iva = false;
                                }
                                recalculateEditDocAmounts(idx);
                              }}
                              class="text-xs text-brand-500 font-bold hover:underline cursor-pointer"
                            >
                              {r.showIvaDetails ? "Cerrar" : "Agregar"}
                            </button>
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            value={r.showIvaDetails ? r.reten_iva : (() => {
                              const porcIva = detailData ? (Number(detailData.porc_esp) || 0) : 0;
                              const theoreticalRetIvaBs = Math.round((r.monto_imp || 0) * (porcIva / 100) * 100) / 100;
                              return Math.round((theoreticalRetIvaBs / (editTasa > 0 ? editTasa : 1)) * 100) / 100;
                            })()}
                            readonly={!r.showIvaDetails}
                            oninput={(e) => {
                              r.reten_iva = Number(e.currentTarget.value) || 0;
                              r.manual_override_iva = true;
                              recalculateEditDocAmounts(idx);
                            }}
                            class="w-full bg-surface-soft border border-border-subtle px-3 py-1.5 rounded-xl text-sm font-bold text-green-400 text-right focus:border-brand-500 focus:ring-0 focus:outline-hidden disabled:opacity-50"
                          />
                          <span class="block text-xs text-green-500 font-black text-right mt-1.5">
                            Bs. {(
                              r.showIvaDetails ? (r.reten_iva_bs || 0) : (() => {
                                const porcIva = detailData ? (Number(detailData.porc_esp) || 0) : 0;
                                return Math.round((r.monto_imp || 0) * (porcIva / 100) * 100) / 100;
                              })()
                            ).toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        <!-- Retención de ISLR ($) -->
                        <div>
                          <div class="flex justify-between items-center mb-1.5">
                            <label class="block text-xs font-black text-text-muted uppercase">Reten. ISLR ($)</label>
                            <button
                              type="button"
                              onclick={() => {
                                r.showIslrDetails = !r.showIslrDetails;
                                if (!r.showIslrDetails) {
                                  r.reten_islr_bs = 0;
                                  r.reten_islr = 0;
                                  r.manual_override_islr = true;
                                } else {
                                  r.manual_override_islr = false;
                                }
                                recalculateEditDocAmounts(idx);
                              }}
                              class="text-xs text-brand-500 font-bold hover:underline cursor-pointer"
                            >
                              {r.showIslrDetails ? "Cerrar" : "Agregar"}
                            </button>
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            bind:value={r.reten_islr}
                            readonly={!r.showIslrDetails}
                            oninput={() => {
                              r.manual_override_islr = true;
                              recalculateEditDocAmounts(idx);
                            }}
                            class="w-full bg-surface-soft border border-border-subtle px-3 py-1.5 rounded-xl text-sm font-bold text-amber-400 text-right focus:border-brand-500 focus:ring-0 focus:outline-hidden disabled:opacity-50"
                          />
                          <span class="block text-xs text-amber-400 font-black text-right mt-1.5">
                            Bs. {(r.reten_islr_bs || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      <!-- Subpanel Comprobante IVA -->
                      {#if r.showIvaDetails}
                        <div class="bg-green-500/5 border border-green-500/20 p-4 rounded-2xl space-y-3 text-xs">
                          <span class="font-bold text-green-400">Datos Comprobante Retención IVA</span>
                          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1">NRO. COMPROBANTE</span>
                              <input
                                type="text"
                                placeholder="Ej: 2026060001"
                                bind:value={r.num_comprobante_iva}
                                class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs"
                              />
                            </div>
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1">BASE IMPONIBLE ($)</span>
                              <input
                                type="number"
                                step="0.01"
                                bind:value={r.base_imponible_iva}
                                oninput={() => {
                                  r.base_imponible_iva_bs = Math.round(r.base_imponible_iva * editTasa * 100) / 100;
                                  recalculateEditDocAmounts(idx);
                                }}
                                class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs text-right"
                              />
                            </div>
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1">ALÍCUOTA (%)</span>
                              <input
                                type="number"
                                bind:value={r.alicuota_iva}
                                oninput={() => recalculateEditDocAmounts(idx)}
                                class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs text-right"
                              />
                            </div>
                          </div>
                        </div>
                      {/if}

                      <!-- Subpanel ISLR -->
                      {#if r.showIslrDetails}
                        <div class="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl space-y-3 text-xs">
                          <span class="font-bold text-amber-300">Datos Retención ISLR / Municipal</span>
                          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1">CONCEPTO</span>
                              <input
                                type="text"
                                placeholder="Ej: 001"
                                bind:value={r.co_islr}
                                class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs"
                              />
                            </div>
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1">PORCENTAJE (%)</span>
                              <input
                                type="number"
                                step="0.1"
                                bind:value={r.porc_islr}
                                oninput={() => recalculateEditDocAmounts(idx)}
                                class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs text-right"
                              />
                            </div>
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>

              <!-- Instrumentos de Pago Editables -->
              <div class="space-y-4">
                <div class="flex items-center justify-between">
                  <h4 class="font-black text-text-base text-lg flex items-center gap-2">
                    <CreditCard size={18} class="text-brand-500" />
                    Instrumentos de Pago Recibidos
                  </h4>
                  <button
                    type="button"
                    onclick={addEditFormaPago}
                    class="px-4 py-2 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 text-brand-400 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={14} />
                    Agregar Instrumento
                  </button>
                </div>
                
                <div class="space-y-4">
                  {#each editFormasPago as fp, fpIdx}
                    <div class="bg-surface-soft/20 rounded-2xl border border-border-subtle p-5 hover:border-white/10 transition-all space-y-4 relative">
                      <button
                        type="button"
                        onclick={() => removeEditFormaPago(fpIdx)}
                        class="absolute top-4 right-4 text-text-muted hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>

                      <div class="space-y-3 text-xs">
                        <!-- Tipo Instrumento -->
                        <div>
                          <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Forma de Pago</span>
                          <select
                            bind:value={fp.forma_pag}
                            onchange={() => handleEditFormaPagChange(fpIdx)}
                            class="w-full h-10 px-3 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-xs cursor-pointer text-text-base"
                          >
                            <option value="EF">Efectivo</option>
                            <option value="TJ">Tarjeta de Débito/Crédito</option>
                            <option value="TE">Transferencia Bancaria</option>
                            <option value="DP">Depósito Bancario</option>
                            <option value="CH">Cheque</option>
                          </select>
                        </div>

                        <!-- Caja (Para EF o TJ) -->
                        {#if fp.forma_pag === "EF" || fp.forma_pag === "TJ"}
                          <div>
                            <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Caja Destino</span>
                            <select
                              bind:value={fp.cod_caja}
                              onchange={() => handleEditCajaCtaChange(fpIdx)}
                              class="w-full h-10 px-3 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-xs cursor-pointer text-text-base"
                            >
                              {#each cajas as c}
                                <option value={c.cod_caja}>{c.descrip} ({c.co_mone?.trim()})</option>
                              {/each}
                            </select>
                          </div>
                        {/if}

                        <!-- Cuenta Destino y Banco Emisor (TE, DP, CH) -->
                        {#if fp.forma_pag === "TE" || fp.forma_pag === "DP" || fp.forma_pag === "CH"}
                          <div class="grid grid-cols-2 gap-2">
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Cuenta Destino</span>
                              <select
                                bind:value={fp.cod_cta}
                                onchange={() => handleEditCajaCtaChange(fpIdx)}
                                class="w-full h-10 px-2 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-[10px] cursor-pointer text-text-base"
                              >
                                {#each cuentasBancarias as cb}
                                  <option value={cb.cod_cta}>{cb.num_cta} ({cb.co_mone?.trim()})</option>
                                {/each}
                              </select>
                            </div>
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Banco Emisor</span>
                              <select
                                bind:value={fp.co_ban}
                                class="w-full h-10 px-2 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-[10px] cursor-pointer text-text-base"
                              >
                                {#each bancos as b}
                                  <option value={b.co_ban}>{b.ban_des}</option>
                                {/each}
                              </select>
                            </div>
                          </div>
                        {/if}

                        <!-- Tarjeta -->
                        {#if fp.forma_pag === "TJ"}
                          <div>
                            <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Tipo Tarjeta</span>
                            <select
                              bind:value={fp.co_tar}
                              class="w-full h-10 px-3 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-xs cursor-pointer text-text-base"
                            >
                              {#each tarjetasCredito as t}
                                <option value={t.co_tar}>{t.tar_des}</option>
                              {/each}
                            </select>
                          </div>
                        {/if}

                        <!-- Datos Referencia / Fecha -->
                        {#if fp.forma_pag !== "EF"}
                          <div class="grid grid-cols-2 gap-2">
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Nro. Referencia</span>
                              <input
                                type="text"
                                placeholder="Ej: 098765"
                                bind:value={fp.num_doc}
                                class="w-full h-10 px-3 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-bold text-xs text-text-base"
                              />
                            </div>
                            <div>
                              <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Fecha Cheque/Transf</span>
                              <input
                                type="date"
                                bind:value={fp.fecha_che}
                                class="w-full h-10 px-3 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-bold text-xs text-text-base"
                              />
                            </div>
                          </div>
                        {/if}

                        <!-- Monto -->
                        <div>
                          <span class="text-[9px] text-text-muted font-bold block mb-1 uppercase">Monto Instrumento ({getEditRowCurrency(fp) === 'BS' ? 'Bs.' : 'USD'})</span>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={getEditRowCurrency(fp) === 'BS' ? (fp.mont_doc_bs || 0) : fp.mont_doc}
                            oninput={(e) => {
                              const val = Number(e.currentTarget.value) || 0;
                              if (getEditRowCurrency(fp) === 'BS') {
                                fp.mont_doc_bs = val;
                                fp.mont_doc = Math.round((val / (editTasa > 0 ? editTasa : 1)) * 100) / 100;
                              } else {
                                fp.mont_doc = val;
                                fp.mont_doc_bs = Math.round(val * editTasa * 100) / 100;
                              }
                            }}
                            class="w-full h-10 px-3 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-black text-xs text-text-base text-right"
                          />
                          <span class="block text-[9px] text-text-muted/60 text-right mt-1 font-bold">
                            {getEditRowCurrency(fp) === 'BS' ? 'Equivalente USD:' : 'Equivalente Bs.:'} {(
                              getEditRowCurrency(fp) === 'BS'
                                ? (fp.mont_doc || 0)
                                : (fp.mont_doc_bs || 0)
                            ).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                      </div>
                    </div>
                  {/each}
                </div>
              </div>

              <!-- Resumen y Diferencia de Cuadre -->
              <div class="glass p-6 rounded-2xl border border-white/10 grid grid-cols-1 md:grid-cols-5 gap-6 bg-brand-500/[0.01] text-xs">
                <div>
                  <span class="text-xs text-text-muted font-bold block">Saldo pendiente por cobrar ($)</span>
                  <span class="text-lg font-black text-brand-400 mt-1 block">$ {editSaldoPendiente.toFixed(2)}</span>
                  <span class="text-xs text-text-muted/60 mt-0.5 block">Bs. {editSaldoPendienteBs.toLocaleString("de-DE", { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                  <span class="text-xs text-text-muted font-bold block">Total Recibido ($)</span>
                  <span class="text-lg font-black text-text-base mt-1 block">$ {editTotalInstrumentos.toFixed(2)}</span>
                  <span class="text-xs text-text-muted/60 mt-0.5 block">Bs. {editTotalInstrumentosBs.toLocaleString("de-DE", { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                  <span class="text-xs text-text-muted font-bold block">Retenciones IVA</span>
                  {#if hasPendingIvaVoucher}
                    <span class="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold px-2.5 py-1 rounded-full mt-1.5 font-mono">
                      Pendiente
                    </span>
                  {:else}
                    <span class="text-lg font-black text-green-400 mt-1 block font-mono">$ {editTotalRetenidoIvaVista.toFixed(2)}</span>
                  {/if}
                </div>
                <div>
                  <span class="text-xs text-text-muted font-bold block">Retenciones ISLR</span>
                  <span class="text-lg font-black text-amber-300 mt-1 block font-mono">$ {editTotalRetenidoIslrVista.toFixed(2)}</span>
                </div>
                <div>
                  <span class="text-xs text-text-muted font-bold block">Diferencia de Cuadre</span>
                  {#if editDiferenciaCuadre === 0}
                    <span class="inline-flex items-center gap-1 bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-bold px-2.5 py-1 rounded-full mt-1.5 font-mono">
                      <CheckCircle size={12} />
                      Cuadrado
                    </span>
                  {:else}
                    <span class="text-lg font-black text-red-400 mt-1 block font-mono">$ {editDiferenciaCuadre.toFixed(2)}</span>
                  {/if}
                </div>
              </div>
            </div>
          {:else}
            <!-- VISTA DETALLE ORIGINAL -->
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

            <!-- Desglose de Retenciones -->
            {#if (detailData.retenciones_iva && detailData.retenciones_iva.length > 0) || (detailData.retenciones_islr && detailData.retenciones_islr.length > 0)}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        {/if}
      </div>

      <!-- Pie Modal -->
      <div class="p-6 border-t border-white/5 flex justify-between bg-white/[0.02]">
        {#if isEditingPayment}
          <button 
            type="button"
            onclick={() => { isEditingPayment = false; detailModalOpen = false; detailData = null; }}
            disabled={isSavingEdit}
            class="px-6 py-3 rounded-xl font-bold bg-white/5 hover:bg-white/10 text-text-base transition-all text-sm disabled:opacity-50 cursor-pointer"
          >
            Cancelar
          </button>
          <button 
            type="button"
            onclick={saveEditPayment}
            disabled={isSavingEdit}
            class="px-6 py-3 rounded-xl font-bold bg-brand-600 hover:bg-brand-500 text-white transition-all text-sm disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {#if isSavingEdit}
              <RefreshCw size={14} class="animate-spin" />
              Guardando...
            {:else}
              Guardar Cambios
            {/if}
          </button>
        {:else}
          <button 
            onclick={() => { detailModalOpen = false; detailData = null; }}
            class="px-6 py-3 rounded-xl font-bold bg-white/5 hover:bg-white/10 text-text-base transition-all text-sm cursor-pointer"
          >
            Cerrar
          </button>
          {#if data.canEdit && detailData && (detailData.anulado === false || detailData.anulado === 0 || String(detailData.anulado).trim() === '0' || String(detailData.anulado).trim().toLowerCase() === 'false')}
            <button
              onclick={startEditing}
              class="px-6 py-3 rounded-xl font-bold bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 transition-all text-sm cursor-pointer flex items-center gap-1.5"
            >
              Editar Cobro
            </button>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- MODAL DE ANULACIÓN -->
{#if showVoidModal}
  <div 
    class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4" 
    transition:fade={{ duration: 150 }}
  >
    <div 
      class="glass max-w-md w-full rounded-[32px] border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
    >
      <!-- Cabecera -->
      <div class="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
            <Ban size={20} />
          </div>
          <div>
            <h3 class="font-black text-xl text-text-base">Confirmar Anulación</h3>
            <p class="text-xs text-text-muted">Esta acción revertirá los saldos</p>
          </div>
        </div>
        <button 
          onclick={() => !isVoiding && (showVoidModal = false)}
          class="p-2 rounded-xl text-text-muted hover:bg-white/5 hover:text-text-base transition-all"
        >
          <X size={20} />
        </button>
      </div>

      <!-- Contenido -->
      <div class="p-6 space-y-4">
        <p class="text-sm text-text-muted">
          ¿Estás seguro de que deseas anular el cobro 
          <span class="text-text-base font-bold">{paymentToVoid?.cob_num}</span>?
        </p>

        {#if paymentToVoid}
          <div class="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-2 text-xs text-text-muted">
            <p><span class="font-bold text-text-base">Cliente:</span> {paymentToVoid.cli_des}</p>
            <p><span class="font-bold text-text-base">Fecha:</span> {new Date(paymentToVoid.fecha).toLocaleDateString('es-VE')}</p>
            <p>
              <span class="font-bold text-text-base">Monto:</span> USD {Number(paymentToVoid.monto / (paymentToVoid.tasa > 0 ? paymentToVoid.tasa : 1)).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              (Bs. {Number(paymentToVoid.monto).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})})
            </p>
          </div>
        {/if}

        <form 
          method="POST" 
          action="?/voidPayment" 
          class="space-y-4"
          use:enhance={() => {
            isVoiding = true;
            return async ({ result, update }) => {
              isVoiding = false;
              if (result.type === 'success') {
                showVoidModal = false;
                await update();
              } else if (result.type === 'failure') {
                alert(result.data?.message || 'Error al anular el cobro');
              }
            };
          }}
        >
          <input type="hidden" name="cob_num" value={paymentToVoid?.cob_num} />
          <input type="hidden" name="branch_id" value={data.selectedBranchId} />

          <div class="space-y-2">
            <label for="void-pass" class="text-xs font-bold text-text-muted uppercase tracking-wider">
              Contraseña de Confirmación
            </label>
            <input 
              type="password" 
              id="void-pass" 
              name="password"
              required
              bind:value={voidPassword}
              placeholder="Introduce tu contraseña actual..."
              class="w-full bg-surface-soft border border-white/5 px-4 py-3 rounded-xl text-sm text-text-base placeholder-text-muted/50 focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all"
            />
          </div>

          <!-- Botones -->
          <div class="flex gap-3 pt-2">
            <button 
              type="button"
              onclick={() => (showVoidModal = false)}
              disabled={isVoiding}
              class="flex-1 py-3.5 rounded-xl font-bold bg-white/5 hover:bg-white/10 text-text-base transition-all text-sm disabled:opacity-50"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={isVoiding || !voidPassword}
              class="flex-1 py-3.5 rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {#if isVoiding}
                <RefreshCw size={16} class="animate-spin" />
                Anulando...
              {:else}
                Anular
              {/if}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}
