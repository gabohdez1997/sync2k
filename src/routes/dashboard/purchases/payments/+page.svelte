<!-- src/routes/dashboard/purchases/payments/+page.svelte -->
<script lang="ts">
  import { fade, slide } from "svelte/transition";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import {
    Wallet,
    Search,
    Plus,
    Calendar,
    X,
    Trash2,
    AlertCircle,
    RefreshCw,
    AlertTriangle,
    Building,
    CreditCard,
    Landmark,
    CheckCircle,
    Info,
    User,
    Receipt,
    History,
    Store,
    ChevronDown,
    ShoppingBag,
    Clock,
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import ImportItemCard from "$lib/components/ui/ImportItemCard.svelte";

  let { data } = $props();

  // Estado del Formulario
  let co_prov = $state("");
  let selectedSupplier = $state<any>(null);
  let searchQuery = $state("");
  let pendingInvoices = $state<any[]>([]);
  let searchingInvoices = $state(false);
  let loadingDocs = $state(false);
  let currentExchangeRate = $state(data.activeRate || 1);
  let showUSD = $state(true);

  function switchCurrency(toUSD: boolean) {
    showUSD = toUSD;
  }

  // ─── Helpers monetarios ───────────────────────────────────────────────
  // Regla: el monto en Bs de la factura es la fuente de verdad (fiscal y de pago).
  // Las retenciones y netos se calculan SIEMPRE sobre los Bs del documento,
  // redondeando una sola vez. El USD es solo referencial (Bs / tasa actual) y
  // nunca se reconvierte USD → Bs (eso generaba diferencias de redondeo).
  function r2(n: number): number {
    const v = Number(n) || 0;
    return Math.round(Number((v * 100).toFixed(6))) / 100;
  }

  function getRate(): number {
    const r = Number(currentExchangeRate || 1);
    return r > 0 ? r : 1;
  }

  function toUsd(bs: number): number {
    return r2((Number(bs) || 0) / getRate());
  }

  function isNcDoc(doc: any): boolean {
    return doc.co_tipo_doc.trim() === "N/CR";
  }

  function getPorcRetIva(): number {
    return selectedSupplier && selectedSupplier.contribu_e
      ? Number(selectedSupplier.porc_esp) || 75
      : 75;
  }

  function resolveTabulador(tab: string | undefined | null, rif: string | undefined | null, tipoPer: string | undefined | null): string {
    const cleanTab = String(tab || '').trim();
    if (cleanTab && cleanTab !== '' && cleanTab !== '0') return cleanTab;
    if (tipoPer === '1') return '5';
    if (tipoPer === '2') return '6';
    if (tipoPer === '3') return '7';
    if (tipoPer === '4') return '8';
    const cleanRif = String(rif || '').trim().toUpperCase();
    if (cleanRif.startsWith('V') || cleanRif.startsWith('E')) return '5';
    return '7';
  }

  function getTabDescription(tabCode: string): string {
    const t = (data.tabuladores || []).find((x: any) => String(x.co_tab).trim() === String(tabCode).trim());
    if (t?.tab_des) return t.tab_des.trim();
    if (tabCode === '5') return 'Persona Natural Residente (PNR)';
    if (tabCode === '6') return 'Persona Natural No Residente (PNNR)';
    if (tabCode === '7') return 'Persona Jurídica Domiciliada (PJD)';
    if (tabCode === '8') return 'Persona Jurídica No Domiciliada (PJND)';
    return `Tabulador ${tabCode}`;
  }

  function getEffectiveSupplierTab(): string {
    return resolveTabulador(selectedSupplier?.co_tab, selectedSupplier?.rif || selectedSupplier?.co_prov, selectedSupplier?.tipo_per);
  }

  function getConceptosForSupplier(): any[] {
    const currentTab = getEffectiveSupplierTab();
    const list = data.conceptosIslr || [];
    const filtered = list.filter((c: any) => String(c.co_tab || '').trim() === currentTab);
    return filtered.length > 0 ? filtered : list;
  }

  function handleConceptChange(docNo: string, doc: any, selectedCode: string) {
    const inp = docInputs[docNo];
    if (!inp) return;
    inp.co_islr = selectedCode.trim();
    inp.manual_override_islr = false;

    const currentTab = getEffectiveSupplierTab();
    const allList = data.conceptosIslr || [];
    const foundInTab = allList.find((c: any) => 
      String(c.co_tab || '').trim() === currentTab && 
      String(c.co_islr || '').trim() === inp.co_islr
    );
    const found = foundInTab || allList.find((c: any) => String(c.co_islr || '').trim() === inp.co_islr);

    if (found) {
      inp.porc_islr = Number(found.porc_ret ?? 0);
      inp.porc_base_islr = Number(found.porc_imp ?? 100);
      inp.sustraendo_islr_bs = Number(found.sustraen ?? 0);
    }
    recalculateDocAmounts(docNo, doc);
  }

  function onSupplierTabChange() {
    const currentTab = getEffectiveSupplierTab();
    const supplierConceptos = getConceptosForSupplier();
    const defaultConceptObj = currentTab === '5'
      ? (supplierConceptos.find((c: any) => c.co_islr.trim() === '083') || supplierConceptos[0])
      : (supplierConceptos.find((c: any) => c.co_islr.trim() === '055') || supplierConceptos[0]);

    documentos.forEach((doc) => {
      const nro = doc.nro_doc.trim();
      const inp = docInputs[nro];
      if (inp && defaultConceptObj) {
        inp.co_islr = defaultConceptObj.co_islr.trim();
        inp.porc_islr = Number(defaultConceptObj.porc_ret ?? 0);
        inp.porc_base_islr = Number(defaultConceptObj.porc_imp ?? 100);
        inp.sustraendo_islr_bs = Number(defaultConceptObj.sustraen ?? 0);
        inp.manual_override_islr = false;
        recalculateDocAmounts(nro, doc, false);
      }
    });
    syncSinglePaymentInstrument();
  }

  function getDocBaseBs(doc: any): number {
    return r2(doc.base_imponible > 0 ? doc.base_imponible : (doc.total_neto - doc.monto_imp));
  }

  function getAppliedRetIvaBs(inp: any): number {
    return inp && !inp.yaTieneRetIva && inp.showIvaDetails ? r2(inp.reten_iva_bs) : 0;
  }

  function getAppliedRetIslrBs(inp: any): number {
    return inp && !inp.yaTieneRetIslr && inp.showIslrDetails ? r2(inp.reten_islr_bs) : 0;
  }

  // Documentos cargados del proveedor
  let documentos = $state<any[]>([]);
  let checkedDocs = $state<Record<string, boolean>>({});

  // Datos de retenciones y abonos por documento
  let docInputs = $state<
    Record<
      string,
      {
        mont_cob: number;
        mont_cob_bs: number;
        reten_iva: number;
        reten_iva_bs: number;
        num_comprobante_iva: string;
        porc_ret_iva: number;
        base_imponible_iva: number;
        base_imponible_iva_bs: number;
        alicuota_iva: number;
        reten_islr: number;
        reten_islr_bs: number;
        co_islr: string;
        porc_islr: number;
        base_imponible_islr: number;
        base_imponible_islr_bs: number;
        porc_base_islr?: number;
        sustraendo_islr_bs?: number;
        showIvaDetails: boolean;
        showIslrDetails: boolean;
        manual_override_iva?: boolean;
        manual_override_islr?: boolean;
        yaTieneRetIva?: boolean;
        nro_comp_iva_previo?: string;
        monto_ret_iva_previo_bs?: number;
        monto_ret_iva_previo_usd?: number;
        yaTieneRetIslr?: boolean;
        nro_comp_islr_previo?: string;
        monto_ret_islr_previo_bs?: number;
        monto_ret_islr_previo_usd?: number;
      }
    >
  >({});

  let formasPago = $state<any[]>([]);

  // Reactivo: Auto-distribuir el total de instrumentos de pago y notas de crédito a las facturas seleccionadas
  // (todo en Bs, que es la moneda en la que se liquida la factura)
  $effect(() => {
    // 1. Saldo a favor aportado por Notas de Crédito seleccionadas
    let creditFromNCsBs = 0;
    for (const doc of documentos) {
      if (!checkedDocs[doc.nro_doc.trim()]) continue;
      if (isNcDoc(doc)) creditFromNCsBs += r2(doc.saldo);
    }

    // 2. Fondo disponible total para aplicar a facturas/deudas (Instrumentos + Notas de Crédito)
    let remainingPaymentBs = r2(totalInstrumentosPagoBs + creditFromNCsBs);

    // 3. Procesar todos los documentos cargados
    for (const doc of documentos) {
      const nro = doc.nro_doc.trim();
      const inp = docInputs[nro];
      if (!inp) continue;

      if (!checkedDocs[nro]) {
        inp.mont_cob = 0;
        inp.mont_cob_bs = 0;
        continue;
      }

      if (isNcDoc(doc)) {
        const saldoBs = r2(doc.saldo);
        inp.mont_cob_bs = -saldoBs;
        inp.mont_cob = -toUsd(saldoBs);
      } else {
        const maxAbonoBs = Math.max(
          0,
          r2(r2(doc.saldo) - getAppliedRetIvaBs(inp) - getAppliedRetIslrBs(inp)),
        );
        const appliedBs = r2(Math.min(remainingPaymentBs, maxAbonoBs));

        inp.mont_cob_bs = appliedBs;
        inp.mont_cob = toUsd(appliedBs);

        remainingPaymentBs = Math.max(0, r2(remainingPaymentBs - appliedBs));
      }
    }
  });

  // Modal toggle
  let showImportModal = $state(false);

  // Monto neto esperado a pagar en efectivo/instrumentos (Bs exactos de la factura)
  let expectedNetPayBs = $derived(
    r2(
      documentos.reduce((acc, doc) => {
        if (checkedDocs[doc.nro_doc.trim()]) {
          const saldoBs = r2(doc.saldo);
          if (isNcDoc(doc)) return acc - saldoBs;
          const inp = docInputs[doc.nro_doc.trim()];
          if (inp) {
            return acc + Math.max(0, r2(saldoBs - getAppliedRetIvaBs(inp) - getAppliedRetIslrBs(inp)));
          }
        }
        return acc;
      }, 0),
    ),
  );

  let expectedNetPayUsd = $derived(toUsd(expectedNetPayBs));

  // Totales de Abonos (Bs es la fuente; USD referencial)
  let totalCobradoNetoBs = $derived(
    r2(
      documentos.reduce((acc, doc) => {
        if (checkedDocs[doc.nro_doc.trim()]) {
          const inp = docInputs[doc.nro_doc.trim()];
          return acc + (Number(inp?.mont_cob_bs) || 0);
        }
        return acc;
      }, 0),
    ),
  );

  let totalCobradoNeto = $derived(toUsd(totalCobradoNetoBs));

  // Totales de Retenciones de IVA
  let totalRetenidoIvaBs = $derived(
    r2(
      documentos.reduce((acc, doc) => {
        if (checkedDocs[doc.nro_doc.trim()]) {
          return acc + getAppliedRetIvaBs(docInputs[doc.nro_doc.trim()]);
        }
        return acc;
      }, 0),
    ),
  );

  let totalRetenidoIva = $derived(toUsd(totalRetenidoIvaBs));

  let totalRetenidoIvaVistaBs = $derived(
    r2(
      documentos.reduce((acc, doc) => {
        if (checkedDocs[doc.nro_doc.trim()]) {
          const inp = docInputs[doc.nro_doc.trim()];
          if (inp?.yaTieneRetIva) {
            return acc + (Number(inp.monto_ret_iva_previo_bs) || 0);
          } else if (inp?.showIvaDetails) {
            return acc + r2(inp.reten_iva_bs);
          } else {
            // Retención teórica sobre el IVA en Bs de la factura
            return acc + r2((Number(doc.monto_imp) || 0) * (getPorcRetIva() / 100));
          }
        }
        return acc;
      }, 0),
    ),
  );

  let totalRetenidoIvaVista = $derived(toUsd(totalRetenidoIvaVistaBs));

  // Totales de Retenciones de ISLR
  let totalRetenidoIslrBs = $derived(
    r2(
      documentos.reduce((acc, doc) => {
        if (checkedDocs[doc.nro_doc.trim()]) {
          return acc + getAppliedRetIslrBs(docInputs[doc.nro_doc.trim()]);
        }
        return acc;
      }, 0),
    ),
  );

  let totalRetenidoIslr = $derived(toUsd(totalRetenidoIslrBs));

  let totalRetenidoIslrVistaBs = $derived(
    r2(
      documentos.reduce((acc, doc) => {
        if (checkedDocs[doc.nro_doc.trim()]) {
          const inp = docInputs[doc.nro_doc.trim()];
          if (inp?.yaTieneRetIslr) {
            return acc + (Number(inp.monto_ret_islr_previo_bs) || 0);
          } else if (inp?.showIslrDetails) {
            return acc + r2(inp.reten_islr_bs);
          }
        }
        return acc;
      }, 0),
    ),
  );

  let totalRetenidoIslrVista = $derived(toUsd(totalRetenidoIslrVistaBs));

  // Total de Instrumentos de Pago ingresados
  let totalInstrumentosPago = $derived(
    Math.round(
      formasPago.reduce((acc, fp) => {
        return acc + Math.abs(Number(fp.mont_doc) || 0);
      }, 0) * 100,
    ) / 100,
  );

  let totalInstrumentosPagoBs = $derived(
    Math.round(
      formasPago.reduce((acc, fp) => {
        return acc + Math.abs(Number(fp.mont_doc_bs) || 0);
      }, 0) * 100,
    ) / 100,
  );

  // Saldo total pendiente solo de las facturas seleccionadas (Bs exactos del documento)
  let saldoPendientePorCobrarBs = $derived(
    r2(
      documentos.reduce((acc, doc) => {
        if (!checkedDocs[doc.nro_doc.trim()]) return acc;
        const saldoBs = r2(doc.saldo);
        return isNcDoc(doc) ? acc - saldoBs : acc + saldoBs;
      }, 0),
    ),
  );

  let saldoPendientePorCobrar = $derived(toUsd(saldoPendientePorCobrarBs));

  // Cuadre: se valida en Bs, que es lo que se registra en Profit
  let diferenciaCuadreBs = $derived(
    r2(Math.abs(totalCobradoNetoBs - totalInstrumentosPagoBs)),
  );

  let diferenciaCuadre = $derived(toUsd(diferenciaCuadreBs));

  // Condición para habilitar Guardar Pago
  let canSave = $derived.by(() => {
    if (saving) return false;
    const selectedCount = Object.values(checkedDocs).filter(Boolean).length;
    if (selectedCount === 0) return false;

    // Caso 1: Pago normal o mixto (requiere instrumentos y cuadre en Bs con el neto abonado)
    if (totalCobradoNetoBs > 0) {
      return diferenciaCuadreBs === 0 && formasPago.length > 0;
    }

    // Caso 2: Pago parcial exclusivamente de retenciones (IVA y/o ISLR aplicadas sin instrumentos)
    if (totalCobradoNetoBs === 0) {
      return totalRetenidoIvaBs > 0 || totalRetenidoIslrBs > 0;
    }

    return false;
  });

  // Sincronizar sucursal seleccionada
  let selectedBranch = $state(data.selectedBranchId || "");

  function onBranchChange(newBranchId: string) {
    selectedBranch = newBranchId;
    goto(`?branch_id=${newBranchId}`, { invalidateAll: true });
  }

  // Obtener Tasa de Cambio Actual de la sucursal
  async function fetchExchangeRate() {
    if (!selectedBranch) return;
    try {
      const res = await fetch(`/api/agent/tasa?branch_id=${selectedBranch}`);
      if (res.ok) {
        const json = await res.json();
        const newRate = Number(json.tasa || json.data?.tasa || 1);
        if (newRate > 0) {
          currentExchangeRate = newRate;
          handleTasaChange();
        }
      }
    } catch (e) {
      console.error("Error fetching exchange rate:", e);
    }
  }

  function handleTasaChange() {
    const rate = Number(currentExchangeRate || 1);
    if (rate <= 0) return;

    recalculateAllDocAmounts();

    formasPago.forEach((fp, idx) => {
      const curr = getRowCurrency(fp);
      if (!fp.manual_override) {
        applyExactPendingAmount(idx);
      } else {
        handleAmountChange(idx, curr === "BS" ? fp.mont_doc_bs : fp.mont_doc);
      }
    });
  }

  $effect(() => {
    if (selectedBranch) {
      fetchExchangeRate();

      const urlProv = $page.url.searchParams.get("co_prov");
      const editFrom = $page.url.searchParams.get("edit_from");
      if (urlProv && !selectedSupplier && !loadingDocs) {
        fetch(
          `/api/agent/payables/pending-documents?branch_id=${selectedBranch}&co_prov=${encodeURIComponent(urlProv)}&limit=100`,
        )
          .then((r) => r.json())
          .then((json) => {
            if (json.data && json.data.length > 0) {
              const first = json.data[0];
              const effectiveTab = resolveTabulador(first.co_tab, first.rif || first.co_prov, first.tipo_per);
              selectedSupplier = {
                co_prov: first.co_prov?.trim(),
                descripcion: first.prov_des?.trim(),
                rif: first.rif?.trim(),
                contribu_e: first.contribu_e,
                porc_esp: first.porc_esp || 75,
                co_tab: effectiveTab,
                tab_des: first.tab_des?.trim() || getTabDescription(effectiveTab),
                tipo_per: first.tipo_per ? first.tipo_per.trim() : (effectiveTab === '5' ? '1' : '3'),
                direc1: "",
                telefonos: "",
              };
              co_prov = selectedSupplier.co_prov;
              loadSupplierDocuments(co_prov);
              if (editFrom) {
                toast.info(
                  `Editando pago anterior ${editFrom}. Se cargaron las facturas del proveedor.`,
                );
              }
            }
          })
          .catch(console.error);
      }
    }
  });

  // Modal Importar Factura
  function openImportModal() {
    showImportModal = true;
    searchPendingInvoices();
  }

  function closeImportModal() {
    showImportModal = false;
  }

  async function searchPendingInvoices(query = "") {
    if (!selectedBranch) return;
    searchingInvoices = true;
    try {
      const q = new URLSearchParams({
        branch_id: selectedBranch,
        search: query,
        limit: "50",
      });
      const res = await fetch(`/api/agent/payables/pending-documents?${q.toString()}`);
      if (res.ok) {
        const json = await res.json();
        pendingInvoices = json.data || [];
      } else {
        pendingInvoices = [];
      }
    } catch (e) {
      console.error("Error searching pending invoices:", e);
      pendingInvoices = [];
    } finally {
      searchingInvoices = false;
    }
  }

  async function selectInvoiceFromModal(inv: any) {
    closeImportModal();
    const invTasa = Number(inv.tasa || 0);
    if (invTasa > 1) {
      currentExchangeRate = invTasa;
    }
    const effectiveTab = resolveTabulador(inv.co_tab, inv.rif || inv.co_prov, inv.tipo_per);
    selectedSupplier = {
      co_prov: inv.co_prov?.trim(),
      descripcion: inv.prov_des?.trim(),
      rif: inv.rif?.trim(),
      contribu_e: inv.contribu_e,
      porc_esp: inv.porc_esp || 75,
      co_tab: effectiveTab,
      tab_des: inv.tab_des?.trim() || getTabDescription(effectiveTab),
      tipo_per: inv.tipo_per ? inv.tipo_per.trim() : (effectiveTab === '5' ? '1' : '3'),
      direc1: "",
      telefonos: "",
    };
    co_prov = selectedSupplier.co_prov;
    await loadSupplierDocuments(co_prov, inv.nro_doc.trim());
  }

  // Cargar Documentos del Proveedor
  async function loadSupplierDocuments(provCode: string, specificDocToSelect: string | null = null) {
    if (!selectedBranch || !provCode) return;
    loadingDocs = true;
    try {
      const q = new URLSearchParams({
        branch_id: selectedBranch,
        co_prov: provCode,
        limit: "100",
      });
      const res = await fetch(`/api/agent/payables/pending-documents?${q.toString()}`);
      if (res.ok) {
        const json = await res.json();
        documentos = json.data || [];

        if (specificDocToSelect) {
          const targetDoc = documentos.find(
            (d) => d.nro_doc.trim() === specificDocToSelect.trim()
          );
          if (targetDoc && Number(targetDoc.tasa || 0) > 1) {
            currentExchangeRate = Number(targetDoc.tasa);
          }
        }

        // Inicializar estados de inputs
        checkedDocs = {};
        docInputs = {};

        if (documentos.length > 0) {
          const first = documentos[0];
          const effectiveTab = resolveTabulador(
            first.co_tab || selectedSupplier?.co_tab,
            first.rif || selectedSupplier?.rif || first.co_prov,
            first.tipo_per || selectedSupplier?.tipo_per
          );
          selectedSupplier = {
            co_prov: first.co_prov?.trim() || selectedSupplier?.co_prov,
            descripcion: first.prov_des?.trim() || selectedSupplier?.descripcion,
            rif: first.rif?.trim() || selectedSupplier?.rif,
            contribu_e: first.contribu_e ?? selectedSupplier?.contribu_e,
            porc_esp: first.porc_esp || selectedSupplier?.porc_esp || 75,
            co_tab: effectiveTab,
            tab_des: first.tab_des?.trim() || selectedSupplier?.tab_des || getTabDescription(effectiveTab),
            tipo_per: first.tipo_per ? first.tipo_per.trim() : (selectedSupplier?.tipo_per || (effectiveTab === '5' ? '1' : '3')),
            direc1: selectedSupplier?.direc1 || "",
            telefonos: selectedSupplier?.telefonos || "",
          };
        }

        const currentTab = getEffectiveSupplierTab();
        const supplierConceptos = getConceptosForSupplier();
        const defaultConceptObj = currentTab === '5'
          ? (supplierConceptos.find((c: any) => c.co_islr.trim() === '083') || supplierConceptos.find((c: any) => c.co_islr.trim() === '002') || supplierConceptos[0])
          : (supplierConceptos.find((c: any) => c.co_islr.trim() === '055') || supplierConceptos.find((c: any) => c.co_islr.trim() === '072') || supplierConceptos[0]);

        const defaultIslrConcept = defaultConceptObj ? defaultConceptObj.co_islr.trim() : (currentTab === '5' ? '083' : '055');
        const defaultPorcIslr = Number(defaultConceptObj?.porc_ret ?? (currentTab === '5' ? 3 : 2));
        const defaultPorcBaseIslr = Number(defaultConceptObj?.porc_imp ?? 100);
        const defaultSustraendoIslr = Number(defaultConceptObj?.sustraen ?? (currentTab === '5' ? 107.50 : 0));

        documentos.forEach((doc) => {
          const nro = doc.nro_doc.trim();
          const isNC = isNcDoc(doc);

          // Verificar si ya tiene retención de IVA o ISLR aplicada
          const yaTieneRetIva = (Number(doc.ya_reten_iva_bs) > 0) || Boolean(doc.nro_comp_iva);
          const yaTieneRetIslr = (Number(doc.ya_reten_islr_bs) > 0) || Boolean(doc.nro_comp_islr);
          const montoRetIvaPrevioBs = r2(doc.ya_reten_iva_bs);
          const montoRetIslrPrevioBs = r2(doc.ya_reten_islr_bs);

          // Base imponible del documento en Bs (exacta, tal como está en la factura)
          const baseImpBs = getDocBaseBs(doc);

          // Retención de IVA por defecto (75% / 100%) sobre el IVA en Bs - Solo si NO tiene retención previa
          const ivaBs = Number(doc.monto_imp) || 0;
          const porcRetIva = getPorcRetIva();
          const retIvaBs = !isNC && !yaTieneRetIva && ivaBs > 0
            ? r2(ivaBs * (porcRetIva / 100))
            : 0;

          // Retención ISLR (desactivada por defecto hasta que se active el toggle)
          const porcIslr = 2; // Default 2%

          docInputs[nro] = {
            mont_cob: 0,
            mont_cob_bs: 0,
            reten_iva: toUsd(retIvaBs),
            reten_iva_bs: retIvaBs,
            num_comprobante_iva: "",
            porc_ret_iva: porcRetIva,
            base_imponible_iva: toUsd(baseImpBs),
            base_imponible_iva_bs: baseImpBs,
            alicuota_iva: doc.porc_imp || 16,
            reten_islr: 0,
            reten_islr_bs: 0,
            co_islr: defaultIslrConcept,
            porc_islr: defaultPorcIslr,
            porc_base_islr: defaultPorcBaseIslr,
            sustraendo_islr_bs: defaultSustraendoIslr,
            base_imponible_islr: toUsd(baseImpBs),
            base_imponible_islr_bs: baseImpBs,
            showIvaDetails: !yaTieneRetIva && retIvaBs > 0,
            showIslrDetails: false,
            yaTieneRetIva,
            nro_comp_iva_previo: doc.nro_comp_iva ? doc.nro_comp_iva.trim() : "",
            monto_ret_iva_previo_bs: montoRetIvaPrevioBs,
            monto_ret_iva_previo_usd: toUsd(montoRetIvaPrevioBs),
            yaTieneRetIslr,
            nro_comp_islr_previo: doc.nro_comp_islr ? doc.nro_comp_islr.trim() : "",
            monto_ret_islr_previo_bs: montoRetIslrPrevioBs,
            monto_ret_islr_previo_usd: toUsd(montoRetIslrPrevioBs),
          };

          if (specificDocToSelect && nro === specificDocToSelect) {
            checkedDocs[nro] = true;
          }
        });

        // Si no se especificó un documento, seleccionamos el primero si hay
        if (!specificDocToSelect && documentos.length > 0) {
          checkedDocs[documentos[0].nro_doc.trim()] = true;
        }

        recalculateAllDocAmounts();

        if (formasPago.length === 0 && documentos.length > 0) {
          addFormaPago();
        } else {
          syncSinglePaymentInstrument();
        }
      }
    } catch (e) {
      console.error("Error loading supplier documents:", e);
      toast.error("Error al cargar documentos del proveedor");
    } finally {
      loadingDocs = false;
    }
  }

  function clearSupplier() {
    selectedSupplier = null;
    co_prov = "";
    documentos = [];
    checkedDocs = {};
    docInputs = {};
    formasPago = [];
  }

  function toggleDocSelection(docNo: string, doc: any, isChecked: boolean) {
    checkedDocs[docNo] = isChecked;
    recalculateDocAmounts(docNo, doc, true);
  }

  function recalculateDocAmounts(docNo: string, doc: any, syncInstrument = true) {
    const inp = docInputs[docNo];
    if (!inp) return;

    // Base imponible: Bs exactos del documento; USD solo referencial
    const baseImpBs = getDocBaseBs(doc);
    inp.base_imponible_iva_bs = baseImpBs;
    inp.base_imponible_iva = toUsd(baseImpBs);
    inp.monto_ret_iva_previo_usd = toUsd(inp.monto_ret_iva_previo_bs || 0);
    inp.monto_ret_islr_previo_usd = toUsd(inp.monto_ret_islr_previo_bs || 0);

    // Manejo de Retención de IVA (se calcula sobre el IVA en Bs de la factura)
    if (inp.yaTieneRetIva) {
      inp.showIvaDetails = false;
      inp.reten_iva_bs = 0;
    } else if (!inp.manual_override_iva) {
      if (inp.showIvaDetails) {
        const porcIva = Number(inp.porc_ret_iva) || getPorcRetIva();
        inp.reten_iva_bs = r2((Number(doc.monto_imp) || 0) * (porcIva / 100));
      } else {
        inp.reten_iva_bs = 0;
      }
    }
    // (si es manual se respeta el monto en Bs ingresado por el usuario)
    inp.reten_iva = toUsd(inp.reten_iva_bs);

    // Manejo de Retención de ISLR (se calcula sobre la base en Bs con % base, % retención y sustraendo)
    if (inp.yaTieneRetIslr) {
      inp.showIslrDetails = false;
      inp.reten_islr_bs = 0;
    } else if (!inp.manual_override_islr) {
      if (inp.showIslrDetails) {
        const baseImpRaw = Number(inp.base_imponible_islr_bs) > 0 ? r2(inp.base_imponible_islr_bs) : baseImpBs;
        const porcBase = Number(inp.porc_base_islr ?? 100) / 100;
        const baseSujeta = r2(baseImpRaw * porcBase);
        const porcRet = (Number(inp.porc_islr) || 0) / 100;
        const sustraendoBs = Number(inp.sustraendo_islr_bs) || 0;

        // Fórmula SENIAT / Profit Plus: (Base * %Base * %Ret) - Sustraendo
        const retBruta = r2(baseSujeta * porcRet);
        const retNeta = r2(retBruta - sustraendoBs);
        inp.reten_islr_bs = Math.max(0, retNeta);
      } else {
        inp.reten_islr_bs = 0;
      }
    }
    // (si es manual se respeta el monto en Bs ingresado por el usuario)
    inp.base_imponible_islr = toUsd(inp.base_imponible_islr_bs);
    inp.reten_islr = toUsd(inp.reten_islr_bs);

    if (syncInstrument) {
      syncSinglePaymentInstrument();
    }
  }

  function recalculateAllDocAmounts() {
    documentos.forEach((doc) => {
      recalculateDocAmounts(doc.nro_doc.trim(), doc, false);
    });
    syncSinglePaymentInstrument();
  }

  // Helper para calcular el monto neto pendiente (en Bs exactos) que deja el saldo del documento en 0
  function getRemainingPendingBalance(excludeIndex: number = -1) {
    let totalNeededBs = 0;

    for (const doc of documentos) {
      const nro = doc.nro_doc.trim();
      if (!checkedDocs[nro]) continue;

      const saldoBs = r2(doc.saldo);
      if (isNcDoc(doc)) {
        totalNeededBs -= saldoBs;
        continue;
      }

      const inp = docInputs[nro];
      totalNeededBs += Math.max(0, r2(saldoBs - getAppliedRetIvaBs(inp) - getAppliedRetIslrBs(inp)));
    }

    let otherInstrumentsBs = 0;
    formasPago.forEach((fp, i) => {
      if (i !== excludeIndex) {
        otherInstrumentsBs += Math.abs(Number(fp.mont_doc_bs) || 0);
      }
    });

    const pendingBs = Math.max(0, r2(totalNeededBs - otherInstrumentsBs));
    const pendingUsd = toUsd(pendingBs);

    return { pendingBs, pendingUsd };
  }

  function applyExactPendingAmount(index: number) {
    if (!formasPago[index]) return;
    const fp = formasPago[index];
    const { pendingBs, pendingUsd } = getRemainingPendingBalance(index);

    // Siempre se liquida el monto exacto en Bs; el USD es el equivalente a la tasa actual
    fp.mont_doc_bs = pendingBs;
    fp.mont_doc = pendingUsd;
  }

  function syncSinglePaymentInstrument() {
    if (formasPago.length === 1 && !formasPago[0].manual_override) {
      applyExactPendingAmount(0);
    }
  }

  // Manejo de Formas de Pago
  function addFormaPago() {
    const defaultCaja = data.cajas?.[0]?.cod_caja || "02";
    const newFp = {
      forma_pag: "EF",
      cod_caja: defaultCaja,
      cod_cta: "",
      co_ban: "",
      num_doc: "",
      mont_doc: 0,
      mont_doc_bs: 0,
      fecha_che: null,
      manual_override: false,
    };
    const newIndex = formasPago.length;
    formasPago = [...formasPago, newFp];
    applyExactPendingAmount(newIndex);
  }

  function removeFormaPago(index: number) {
    formasPago = formasPago.filter((_, i) => i !== index);
    syncSinglePaymentInstrument();
  }

  function getRowCurrency(fp: any): "BS" | "USD" {
    if (fp.forma_pag === "EF") {
      if (fp.cod_caja) {
        const caja = data.cajas?.find((c: any) => c.cod_caja?.trim() === fp.cod_caja?.trim());
        const mone = caja?.co_mone?.trim()?.toUpperCase() || "BS";
        return mone === "VES" || mone === "BS" ? "BS" : "USD";
      }
    } else if (fp.forma_pag === "TE" || fp.forma_pag === "DP" || fp.forma_pag === "CH") {
      if (fp.cod_cta) {
        const cta = data.cuentasBancarias?.find((c: any) => c.cod_cta?.trim() === fp.cod_cta?.trim());
        const mone = cta?.co_mone?.trim()?.toUpperCase() || "BS";
        return mone === "VES" || mone === "BS" ? "BS" : "USD";
      }
    }
    return "BS";
  }

  function handleFormaPagChange(index: number) {
    const fp = formasPago[index];
    if (!fp) return;
    fp.manual_override = false;
    if (fp.forma_pag === "EF") {
      fp.cod_cta = "";
      fp.co_ban = "";
      fp.cod_caja = data.cajas?.[0]?.cod_caja || "02";
    } else {
      fp.cod_caja = "";
      fp.cod_cta = data.cuentasBancarias?.[0]?.cod_cta || "";
      fp.co_ban = data.bancos?.[0]?.co_ban || "";
    }
    applyExactPendingAmount(index);
  }

  function handleCajaCtaChange(index: number) {
    const fp = formasPago[index];
    if (!fp) return;
    fp.manual_override = false;
    applyExactPendingAmount(index);
  }

  function handleAmountChange(index: number, val: number) {
    const fp = formasPago[index];
    if (!fp) return;
    const curr = getRowCurrency(fp);

    if (curr === "BS") {
      fp.mont_doc_bs = r2(val);
      fp.mont_doc = toUsd(fp.mont_doc_bs);
    } else {
      fp.mont_doc = r2(val);
      // Si el monto en $ corresponde al pendiente, se usa el Bs exacto de la factura
      // (evita que el redondeo del USD descuadre el pago en Bs)
      const { pendingBs, pendingUsd } = getRemainingPendingBalance(index);
      fp.mont_doc_bs =
        pendingBs > 0 && Math.abs(fp.mont_doc - pendingUsd) < 0.005
          ? pendingBs
          : r2(fp.mont_doc * getRate());
    }
  }

  let saving = $state(false);
  let saveSuccess = $state(false);
  let generatedDocNum = $state("");

  async function savePago() {
    if (!selectedSupplier) {
      toast.error("Debe seleccionar un proveedor.");
      return;
    }

    const selectedDocsList = documentos.filter((d) => checkedDocs[d.nro_doc.trim()]);
    if (selectedDocsList.length === 0) {
      toast.error("Debe seleccionar al menos un documento a pagar.");
      return;
    }

    if (totalCobradoNetoBs === 0 && totalRetenidoIvaBs === 0 && totalRetenidoIslrBs === 0) {
      toast.error("Debe ingresar un monto a pagar o aplicar al menos una retención (IVA o ISLR).");
      return;
    }

    if (totalCobradoNetoBs > 0 && formasPago.length === 0) {
      toast.error("Debe agregar al menos un instrumento de pago (Efectivo, Banco, etc.).");
      return;
    }

    if (totalCobradoNetoBs > 0 && diferenciaCuadreBs !== 0) {
      toast.error("El monto abonado en facturas debe coincidir exactamente con los instrumentos de pago.");
      return;
    }

    saving = true;

    try {
      const firstParent = selectedDocsList.find((d) =>
        ["FACT", "NDEB", "N/DB", "GIRO", "AJPA"].includes(d.co_tipo_doc.trim())
      );
      const parentDocNo = firstParent ? firstParent.nro_doc.trim() : null;

      let totalDocBs = 0;
      const renglones = selectedDocsList.map((doc) => {
        const inp = docInputs[doc.nro_doc.trim()];
        const isParent = ["FACT", "NDEB", "N/DB", "GIRO", "AJPA"].includes(doc.co_tipo_doc.trim());
        const montCobBs = inp.mont_cob_bs || 0;
        const retIvaBs = (!inp.yaTieneRetIva && inp.showIvaDetails) ? (inp.reten_iva_bs || 0) : 0;
        const retIslrBs = (!inp.yaTieneRetIslr && inp.showIslrDetails) ? (inp.reten_islr_bs || 0) : 0;

        totalDocBs += montCobBs;

        return {
          co_tipo_doc: doc.co_tipo_doc.trim(),
          nro_doc: doc.nro_doc.trim(),
          nro_fact: doc.nro_fact ? doc.nro_fact.trim() : doc.nro_doc.trim(),
          mont_cob: montCobBs,
          monto_retencion_iva: retIvaBs,
          monto_retencion: retIslrBs,
          parent_doc: !isParent ? parentDocNo : null,
        };
      });

      // Retenciones de IVA (solo nuevas)
      const retenciones_iva = selectedDocsList
        .filter((doc) => {
          const inp = docInputs[doc.nro_doc.trim()];
          return inp && !inp.yaTieneRetIva && inp.showIvaDetails && inp.reten_iva_bs > 0;
        })
        .map((doc) => {
          const inp = docInputs[doc.nro_doc.trim()];
          return {
            nro_doc_asoc: doc.nro_doc.trim(),
            rif_comprador: selectedSupplier.rif || doc.rif,
            numero_documento: doc.nro_fact ? doc.nro_fact.trim() : doc.nro_doc.trim(),
            numero_control_documento: doc.n_control ? doc.n_control.trim() : "",
            monto_documento: doc.total_neto,
            base_imponible: inp.base_imponible_iva_bs || (doc.total_neto - doc.monto_imp),
            monto_ret_imp: inp.reten_iva_bs,
            num_comprobante: (inp.num_comprobante_iva || "").trim(),
            monto_excento: 0,
            alicuota: inp.alicuota_iva || 16,
          };
        });

      // Retenciones de ISLR (solo nuevas)
      const retenciones_islr = selectedDocsList
        .filter((doc) => {
          const inp = docInputs[doc.nro_doc.trim()];
          return inp && !inp.yaTieneRetIslr && inp.showIslrDetails && inp.reten_islr_bs > 0;
        })
        .map((doc) => {
          const inp = docInputs[doc.nro_doc.trim()];
          return {
            nro_doc_asoc: doc.nro_doc.trim(),
            co_islr: inp.co_islr || "055",
            monto_obj: inp.base_imponible_islr_bs || (doc.total_neto - doc.monto_imp),
            monto_reten: inp.reten_islr_bs,
            porc_retn: inp.porc_islr || 2,
            sustraendo: Number(inp.sustraendo_islr_bs || 0),
          };
        });

      // Formas de pago limpiadas
      const formas_pago_cleaned = formasPago.map((fp) => {
        return {
          forma_pag: fp.forma_pag,
          cod_caja: fp.cod_caja || null,
          cod_cta: fp.cod_cta || null,
          co_ban: fp.co_ban || null,
          num_doc: fp.num_doc ? fp.num_doc.trim() : null,
          mont_doc: fp.mont_doc_bs || 0,
          fecha_che: fp.fecha_che || null,
        };
      });

      const firstDoc = selectedDocsList[0];
      const docMone = (firstDoc?.co_mone || "").trim().toUpperCase();
      const safeCurrency = !docMone || ["BS", "VES", "BS.", "BOL"].includes(docMone) ? "BS" : docMone;

      const payload = {
        co_prov: selectedSupplier.co_prov,
        co_mone: safeCurrency,
        tasa: Number(currentExchangeRate || 1),
        monto: totalDocBs,
        descrip: `PAGO PROVEEDOR ${selectedSupplier.co_prov}`,
        renglones,
        formas_pago: formas_pago_cleaned,
        retenciones_iva,
        retenciones_islr,
      };

      const res = await fetch(`/api/agent/payables/payments?branch_id=${selectedBranch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const resJson = await res.json();
        const docNum = resJson.data?.doc_num || resJson.doc_num || resJson.results?.[0]?.doc_num;
        if (resJson.success && docNum) {
          generatedDocNum = docNum;
          saveSuccess = true;
          toast.success(`¡Pago ${docNum} generado exitosamente!`);
        } else {
          toast.error(resJson.message || "Error al procesar el pago en el agente.");
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        toast.error(errJson.message || `Error del servidor: ${res.status}`);
      }
    } catch (e: any) {
      console.error("Error guardando pago:", e);
      toast.error(`Error inesperado: ${e.message}`);
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Registrar Pago a Proveedor - Sistema Profit Plus</title>
</svelte:head>

<div class="space-y-8 max-w-[1600px] mx-auto pb-24">
  <!-- ENCABEZADO Y SUCURSAL -->
  <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
    <div class="space-y-1">
      <div class="flex items-center gap-3">
        <div
          class="h-12 w-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400"
        >
          <Wallet size={24} />
        </div>
        <div>
          <h1 class="text-2xl sm:text-3xl font-black text-text-base tracking-tight">
            Registrar Pago a Proveedor
          </h1>
          <p class="text-sm text-text-muted font-medium">
            Emisión de pagos a cuentas por pagar con retenciones de IVA e ISLR en Profit Plus
          </p>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3 w-full lg:w-auto">
      <!-- Selector de Sucursal -->
      {#if data.branches && data.branches.length > 1}
        <div class="relative w-full sm:w-auto">
          <select
            value={selectedBranch}
            onchange={(e) => onBranchChange(e.currentTarget.value)}
            class="h-14 pl-11 pr-10 bg-surface-strong border border-border-subtle rounded-2xl text-text-base font-bold text-sm outline-none focus:border-brand-500 transition-all appearance-none cursor-pointer w-full sm:w-64"
          >
            {#each data.branches as b}
              <option value={b.id}>{b.name}</option>
            {/each}
          </select>
          <Store
            size={18}
            class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
          />
          <ChevronDown
            size={16}
            class="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
          />
        </div>
      {/if}


      <!-- Botón Importar Factura de Compra -->
      <button
        onclick={openImportModal}
        class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-600 dark:text-brand-400 border border-brand-500/30 transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto text-sm"
      >
        <ShoppingBag size={18} />
        Importar Factura
      </button>

      <!-- Botón Ver Historial de Pagos -->
      <a
        href="/dashboard/purchases/payments/history?branch_id={selectedBranch}"
        class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-surface-strong hover:bg-surface-base text-text-base border border-border-subtle transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto text-sm"
      >
        <Clock size={18} class="text-brand-600 dark:text-brand-400" />
        Ver Historial
      </a>
    </div>
  </div>

  <!-- EXITOSO -->
  {#if saveSuccess}
    <div
      class="glass p-12 rounded-[40px] border border-green-500/20 max-w-xl mx-auto flex flex-col items-center justify-center text-center space-y-6"
    >
      <div
        class="h-20 w-20 rounded-3xl bg-green-500/10 flex items-center justify-center text-green-400"
      >
        <CheckCircle size={48} />
      </div>
      <div class="space-y-2">
        <h2 class="text-3xl font-black text-text-base">¡Pago Registrado!</h2>
        <p class="text-text-muted">
          El pago a proveedor ha sido guardado exitosamente en Profit Plus.
        </p>
      </div>
      <div class="bg-white/5 px-6 py-4 rounded-2xl border border-white/5">
        <span class="text-xs text-text-muted/60 uppercase font-bold tracking-wider"
          >Documento de Pago Generado</span
        >
        <div class="text-2xl font-black text-brand-500 mt-1">
          {generatedDocNum}
        </div>
      </div>
      <div class="flex gap-4 w-full">
        <a
          href="/dashboard/purchases/payments/history?branch_id={selectedBranch}"
          class="flex-1 text-center bg-white/5 hover:bg-white/10 text-text-base px-6 py-3.5 rounded-2xl font-bold transition-all text-sm flex items-center justify-center"
        >
          Volver al Historial
        </a>
        <button
          onclick={() => {
            saveSuccess = false;
            clearSupplier();
          }}
          class="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-brand-500/20 text-sm cursor-pointer"
        >
          Registrar Otro Pago
        </button>
      </div>
    </div>
  {:else}
    <!-- FORMULARIO DE PAGO SPLIT LAYOUT -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
      <!-- SECCIÓN IZQUIERDA: PROVEEDOR Y DOCUMENTOS (2/3 de ancho) -->
      <div class="xl:col-span-2 space-y-6">
        <!-- DATOS DEL PROVEEDOR -->
        <div
          class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-4"
        >
          <div class="flex items-center justify-between">
            <h3
              class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2"
            >
              <Building size={16} />
              Datos del Proveedor
            </h3>
            {#if selectedSupplier}
              <button
                onclick={clearSupplier}
                class="text-xs text-text-muted hover:text-red-400 font-bold flex items-center gap-1 cursor-pointer"
              >
                <X size={14} />
                Cambiar Proveedor
              </button>
            {/if}
          </div>

          {#if !selectedSupplier}
            <div
              class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-2"
            >
              <Building size={32} class="text-text-muted/30" />
              <p class="text-xs text-text-muted font-bold">
                No hay ningún proveedor seleccionado. Haz clic en "Importar Factura" para cargar sus deudas.
              </p>
            </div>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4" in:fade>
              <div class="md:col-span-2 space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                  >Razón Social / Proveedor</span
                >
                <p class="text-base font-black text-text-base">
                  {selectedSupplier.descripcion}
                </p>
              </div>
              <div class="space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                  >RIF</span
                >
                <p class="text-base font-bold font-mono text-text-base">
                  {selectedSupplier.rif || "---"}
                </p>
              </div>
              <div class="space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                  >Código Proveedor</span
                >
                <p class="text-xs text-text-muted font-bold font-mono">
                  {selectedSupplier.co_prov}
                </p>
              </div>
              <div class="md:col-span-2 space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                  >Estatus Fiscal y Retención</span
                >
                <p class="text-xs font-bold text-brand-400">
                  Contribuyente Especial ({selectedSupplier.porc_esp || 75}% Ret. IVA) • Tabulador ISLR: {selectedSupplier.tab_des || getTabDescription(selectedSupplier.co_tab)}
                </p>
              </div>
            </div>
          {/if}
        </div>

        <!-- FACTURAS Y DOCUMENTOS DE COMPRA -->
        <div
          class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-4"
        >
          <div class="flex items-center justify-between">
            <h3
              class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2"
            >
              <Receipt size={16} />
              Facturas y Documentos a Pagar
            </h3>
            {#if documentos.length > 0}
              <span class="text-xs font-bold text-brand-400">
                {documentos.length} documento(s) con saldo
              </span>
            {/if}
          </div>

          {#if !selectedSupplier}
            <div
              class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-3"
            >
              <Receipt size={32} class="text-text-muted/30" />
              <p class="text-xs text-text-muted font-bold">
                Las facturas con saldo pendiente aparecerán aquí una vez seleccionado un proveedor.
              </p>
            </div>
          {:else if loadingDocs}
            <div
              class="p-12 flex flex-col items-center justify-center gap-4 text-center"
            >
              <RefreshCw size={32} class="animate-spin text-brand-500" />
              <p class="text-sm font-bold text-text-muted">
                Cargando facturas pendientes del proveedor...
              </p>
            </div>
          {:else if documentos.length === 0}
            <div
              class="p-12 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center gap-3 text-center text-text-muted"
            >
              <CheckCircle size={32} class="text-emerald-500" />
              <h4 class="font-bold text-lg text-text-base">
                Sin saldos pendientes
              </h4>
              <p class="text-xs">
                No hay facturas ni notas de compra con saldo pendiente para este proveedor en esta sede.
              </p>
            </div>
          {:else}
            <!-- Acordeón / Listado de Documentos con Saldo -->
            <div class="space-y-4">
              {#each documentos as doc}
                {@const input = docInputs[doc.nro_doc.trim()]}
                {#if input}
                  <div
                    class="bg-surface-soft/20 rounded-2xl border border-border-subtle p-5 hover:border-white/10 transition-all space-y-4"
                  >
                    <!-- Fila Superior -->
                    <div
                      class="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div class="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checkedDocs[doc.nro_doc.trim()]}
                          onchange={(e) =>
                            toggleDocSelection(
                              doc.nro_doc.trim(),
                              doc,
                              e.currentTarget.checked,
                            )}
                          class="w-5 h-5 rounded-lg border-border-subtle bg-surface-soft text-brand-500 focus:ring-brand-500 focus:ring-offset-0 cursor-pointer mt-1"
                        />
                        <div>
                          <div class="flex items-center gap-2">
                            <span
                              class="bg-white/5 border border-white/5 px-2 py-0.5 rounded-md font-bold text-xs text-text-muted uppercase"
                              >{doc.co_tipo_doc}</span
                            >
                            <span class="font-black text-text-base text-base"
                              >{doc.nro_doc}</span
                            >
                            {#if doc.nro_fact && doc.nro_fact !== doc.nro_doc}
                              <span class="text-xs bg-brand-500/10 text-brand-400 font-bold px-2 py-0.5 rounded-md">
                                Fact. Prov: {doc.nro_fact}
                              </span>
                            {/if}
                          </div>
                          <div
                            class="text-xs text-text-muted/85 mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5"
                          >
                            <span>Control: {doc.n_control?.trim() || "N/A"}</span>
                            <span>•</span>
                            <span
                              >Emisión: {new Date(doc.fec_emis).toLocaleDateString("es-VE")}</span
                            >
                            <span>•</span>
                            <span class="text-brand-400 font-bold"
                              >Tasa: {Number(Number(doc.tasa || 1) > 1 ? doc.tasa : currentExchangeRate).toFixed(2)}</span
                            >
                          </div>
                        </div>
                      </div>

                      <div class="text-left sm:text-right shrink-0">
                        <span
                          class="text-xs text-text-muted font-black block uppercase tracking-wider"
                          >Saldo Pendiente</span
                        >
                        <span class="text-lg font-black text-brand-500">
                          {#if doc.co_tipo_doc.trim() === "N/CR"}-{/if}$ {toUsd(doc.saldo).toLocaleString("de-DE", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <span
                          class="block text-xs text-text-muted font-bold mt-1"
                        >
                          Bs. {#if doc.co_tipo_doc.trim() === "N/CR"}-{/if}{r2(doc.saldo).toLocaleString("de-DE", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>

                    <!-- Detalle de Abonos y Retenciones -->
                    {#if checkedDocs[doc.nro_doc.trim()]}
                      <div
                        class="border-t border-border-subtle/50 pt-4 space-y-4 transition-all duration-200"
                      >
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <label
                              class="block text-xs font-black text-text-muted uppercase mb-1.5"
                              >Base Imponible ($)</label
                            >
                            <input
                              type="number"
                              step="0.01"
                              bind:value={input.base_imponible_iva}
                              readonly
                              class="w-full bg-surface-soft border border-border-subtle px-3 py-2 rounded-xl text-sm text-text-base text-right font-bold cursor-not-allowed opacity-90"
                            />
                            <span
                              class="block text-xs text-text-muted font-bold text-right mt-1.5"
                            >
                              Bs. {(input.base_imponible_iva_bs || 0).toLocaleString("de-DE", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </div>

                          <div>
                            <label
                              class="block text-xs font-black text-text-muted uppercase mb-1.5"
                              >Monto IVA ($)</label
                            >
                            <input
                              type="number"
                              step="0.01"
                              value={toUsd(doc.monto_imp)}
                              readonly
                              class="w-full bg-surface-soft border border-border-subtle px-3 py-2 rounded-xl text-sm text-text-base text-right font-bold cursor-not-allowed opacity-90"
                            />
                            <span
                              class="block text-xs text-text-muted font-bold text-right mt-1.5"
                            >
                              Bs. {r2(doc.monto_imp).toLocaleString("de-DE", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </div>

                          <!-- Retención IVA Toggle y Monto -->
                          <div>
                            <div class="flex justify-between items-center mb-1.5">
                              <label
                                class="block text-xs font-black text-text-muted uppercase"
                                >Reten. IVA ($)</label
                              >
                              {#if input.yaTieneRetIva}
                                <span
                                  class="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded font-black tracking-wide"
                                  title={input.nro_comp_iva_previo ? `Comprobante: ${input.nro_comp_iva_previo}` : 'Ya aplicada en pago previo'}
                                >
                                  Ya Aplicada
                                </span>
                              {:else}
                                <button
                                  onclick={() => {
                                    input.showIvaDetails = !input.showIvaDetails;
                                    if (!input.showIvaDetails) {
                                      input.reten_iva_bs = 0;
                                      input.reten_iva = 0;
                                      input.manual_override_iva = true;
                                    } else {
                                      input.manual_override_iva = false;
                                    }
                                    recalculateDocAmounts(doc.nro_doc.trim(), doc);
                                  }}
                                  class="text-xs text-brand-500 font-bold hover:underline cursor-pointer"
                                >
                                  {input.showIvaDetails ? "Cerrar" : "Aplicar"}
                                </button>
                              {/if}
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              value={input.yaTieneRetIva ? input.monto_ret_iva_previo_usd : (input.showIvaDetails ? input.reten_iva : 0)}
                              readonly
                              class="w-full bg-surface-soft border border-border-subtle px-3 py-2 rounded-xl text-sm font-bold {input.yaTieneRetIva ? 'text-emerald-400' : 'text-green-400'} text-right cursor-not-allowed opacity-90"
                            />
                            <span
                              class="block text-xs {input.yaTieneRetIva ? 'text-emerald-500/80' : 'text-green-500'} font-black text-right mt-1.5"
                            >
                              Bs. {(
                                input.yaTieneRetIva ? (input.monto_ret_iva_previo_bs || 0) : (input.showIvaDetails ? (input.reten_iva_bs || 0) : 0)
                              ).toLocaleString("de-DE", {
                                minimumFractionDigits: 2,
                              })}
                              {#if input.yaTieneRetIva && input.nro_comp_iva_previo}
                                <span class="block text-[10px] font-normal text-text-muted mt-0.5">Comp: {input.nro_comp_iva_previo}</span>
                              {/if}
                            </span>
                          </div>

                          <!-- Retención ISLR Toggle y Monto -->
                          <div>
                            <div class="flex justify-between items-center mb-1.5">
                              <label
                                class="block text-xs font-black text-text-muted uppercase"
                                >Reten. ISLR ($)</label
                              >
                              {#if input.yaTieneRetIslr}
                                <span
                                  class="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded font-black tracking-wide"
                                  title={input.nro_comp_islr_previo ? `Comprobante: ${input.nro_comp_islr_previo}` : 'Ya aplicada en pago previo'}
                                >
                                  Ya Aplicada
                                </span>
                              {:else}
                                <button
                                  onclick={() => {
                                    input.showIslrDetails = !input.showIslrDetails;
                                    if (!input.showIslrDetails) {
                                      input.reten_islr_bs = 0;
                                      input.reten_islr = 0;
                                      input.manual_override_islr = true;
                                    } else {
                                      input.manual_override_islr = false;
                                      const currentTab = getEffectiveSupplierTab();
                                      const allList = data.conceptosIslr || [];
                                      const found = allList.find((c: any) => 
                                        String(c.co_tab || '').trim() === currentTab && 
                                        String(c.co_islr || '').trim() === String(input.co_islr || '').trim()
                                      ) || allList.find((c: any) => String(c.co_islr || '').trim() === String(input.co_islr || '').trim());
                                      if (found) {
                                        input.porc_islr = Number(found.porc_ret ?? 0);
                                        input.porc_base_islr = Number(found.porc_imp ?? 100);
                                        input.sustraendo_islr_bs = Number(found.sustraen ?? 0);
                                      }
                                    }
                                    recalculateDocAmounts(doc.nro_doc.trim(), doc);
                                  }}
                                  class="text-xs text-brand-500 font-bold hover:underline cursor-pointer"
                                >
                                  {input.showIslrDetails ? "Cerrar" : "Aplicar"}
                                </button>
                              {/if}
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              value={input.yaTieneRetIslr ? input.monto_ret_islr_previo_usd : (input.showIslrDetails ? input.reten_islr : 0)}
                              readonly
                              class="w-full bg-surface-soft border border-border-subtle px-3 py-2 rounded-xl text-sm font-bold text-amber-400 text-right cursor-not-allowed opacity-90"
                            />
                            <span
                              class="block text-xs text-amber-400 font-black text-right mt-1.5"
                            >
                              Bs. {(
                                input.yaTieneRetIslr ? (input.monto_ret_islr_previo_bs || 0) : (input.showIslrDetails ? (input.reten_islr_bs || 0) : 0)
                              ).toLocaleString("de-DE", {
                                minimumFractionDigits: 2,
                              })}
                              {#if input.yaTieneRetIslr && input.nro_comp_islr_previo}
                                <span class="block text-[10px] font-normal text-text-muted mt-0.5">Comp: {input.nro_comp_islr_previo}</span>
                              {/if}
                            </span>
                          </div>
                        </div>

                        <!-- Detalles Retención IVA -->
                        {#if input.showIvaDetails && !input.yaTieneRetIva}
                          <div
                            class="bg-green-500/5 border border-green-500/20 p-4 rounded-2xl space-y-3 text-xs animate-in slide-in-from-top-2 duration-150"
                          >
                            <div class="flex justify-between items-center">
                              <span class="font-bold text-green-400"
                                >Datos Retención IVA (Comprobante Fiscal SENIAT)</span
                              >
                              <button
                                onclick={() => {
                                  input.showIvaDetails = false;
                                  input.reten_iva_bs = 0;
                                  input.reten_iva = 0;
                                  input.manual_override_iva = true;
                                  recalculateDocAmounts(doc.nro_doc.trim(), doc);
                                }}
                                class="text-text-muted hover:text-text-base cursor-pointer"
                                ><X size={14} /></button
                              >
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
                              <div>
                                <span class="text-[9px] text-text-muted font-bold block mb-1"
                                  >COMPROBANTE SUGERIDO</span
                                >
                                <input
                                  type="text"
                                  placeholder="Auto-generado al guardar"
                                  bind:value={input.num_comprobante_iva}
                                  class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs font-mono"
                                />
                              </div>
                              <div>
                                <span class="text-[9px] text-text-muted font-bold block mb-1"
                                  >BASE IMPONIBLE (Bs.)</span
                                >
                                <input
                                  type="number"
                                  step="0.01"
                                  readonly
                                  bind:value={input.base_imponible_iva_bs}
                                  class="w-full bg-surface-soft/50 border border-border-subtle px-2 py-1.5 rounded-lg text-xs text-right opacity-70 cursor-not-allowed"
                                />
                              </div>
                              <div>
                                <span class="text-[9px] text-text-muted font-bold block mb-1"
                                  >PORC. RETENCIÓN (%)</span
                                >
                                <select
                                  bind:value={input.porc_ret_iva}
                                  onchange={() => {
                                    input.manual_override_iva = false;
                                    recalculateDocAmounts(doc.nro_doc.trim(), doc);
                                  }}
                                  class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs"
                                >
                                  <option value={75}>75% (General)</option>
                                  <option value={100}>100% (Total)</option>
                                </select>
                              </div>
                              <div>
                                <span class="text-[9px] text-text-muted font-bold block mb-1 font-semibold text-green-400"
                                  >MTO RETENIDO (Bs.)</span
                                >
                                <input
                                  type="number"
                                  step="0.01"
                                  readonly
                                  value={input.reten_iva_bs}
                                  class="w-full bg-surface-soft/60 border border-border-subtle text-green-400 font-bold px-2 py-1.5 rounded-lg text-xs text-right cursor-not-allowed opacity-90"
                                />
                              </div>
                            </div>
                          </div>
                        {/if}

                        <!-- Detalles Retención ISLR -->
                        {#if input.showIslrDetails && !input.yaTieneRetIslr}
                          <div
                            class="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl space-y-3 text-xs animate-in slide-in-from-top-2 duration-150"
                          >
                            <div class="flex justify-between items-center">
                              <span class="font-bold text-amber-300"
                                >Datos Retención ISLR Proveedores</span
                              >
                              <button
                                onclick={() => {
                                  input.showIslrDetails = false;
                                  input.reten_islr_bs = 0;
                                  input.reten_islr = 0;
                                  input.manual_override_islr = true;
                                  recalculateDocAmounts(doc.nro_doc.trim(), doc);
                                }}
                                class="text-text-muted hover:text-text-base cursor-pointer"
                                ><X size={14} /></button
                              >
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-5 gap-3">
                              <div class="sm:col-span-1">
                                <span class="text-[9px] text-text-muted font-bold block mb-1">CONCEPTO SENIAT</span>
                                <select
                                  value={input.co_islr}
                                  onchange={(e) => {
                                    const selectedCode = (e.currentTarget as HTMLSelectElement).value;
                                    handleConceptChange(doc.nro_doc.trim(), doc, selectedCode);
                                  }}
                                  class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs"
                                >
                                  {#each getConceptosForSupplier() as c}
                                    <option value={c.co_islr.trim()}>
                                      {c.co_islr.trim()} - {c.islr_des.trim()} ({c.porc_ret}%{c.sustraen > 0 ? ` - Sustr: Bs. ${c.sustraen}` : ''})
                                    </option>
                                  {/each}
                                </select>
                              </div>
                              <div>
                                <span class="text-[9px] text-text-muted font-bold block mb-1">BASE IMPONIBLE (Bs.)</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  bind:value={input.base_imponible_islr_bs}
                                  oninput={() => {
                                    input.manual_override_islr = false;
                                    recalculateDocAmounts(doc.nro_doc.trim(), doc);
                                  }}
                                  class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs text-right"
                                />
                              </div>
                              <div>
                                <span class="text-[9px] text-text-muted font-bold block mb-1">PORCENTAJE (%)</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  bind:value={input.porc_islr}
                                  oninput={() => {
                                    input.manual_override_islr = false;
                                    recalculateDocAmounts(doc.nro_doc.trim(), doc);
                                  }}
                                  class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs text-right"
                                />
                              </div>
                              <div>
                                <span class="text-[9px] text-text-muted font-bold block mb-1 text-amber-300">SUSTRAENDO (Bs.)</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  bind:value={input.sustraendo_islr_bs}
                                  oninput={() => {
                                    input.manual_override_islr = false;
                                    recalculateDocAmounts(doc.nro_doc.trim(), doc);
                                  }}
                                  class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs text-right text-amber-300 font-mono"
                                />
                              </div>
                              <div>
                                <span class="text-[9px] text-text-muted font-bold block mb-1 font-semibold text-amber-400">MTO RETENIDO (Bs.)</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  readonly
                                  value={input.reten_islr_bs}
                                  class="w-full bg-surface-soft/60 border border-border-subtle px-2 py-1.5 rounded-lg text-xs text-right text-amber-400 font-bold cursor-not-allowed opacity-90"
                                />
                              </div>
                            </div>
                          </div>
                        {/if}

                        <!-- Neto Abonado por este Documento -->
                        {#if doc.co_tipo_doc.trim() !== "N/CR" && input.mont_cob_bs > 0}
                          <div
                            class="flex flex-col sm:flex-row sm:items-center justify-between border-t border-border-subtle/40 pt-3 gap-3"
                          >
                            <span class="text-xs text-text-muted font-bold"
                              >Monto Abonado a esta Factura:</span
                            >
                            <div class="flex items-center gap-3">
                              <span class="text-sm font-bold text-brand-400 font-mono">
                                $ {input.mont_cob.toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                              </span>
                              <div class="text-right shrink-0 min-w-[120px]">
                                <span class="block text-xs text-text-muted font-bold">
                                  Bs. {(input.mont_cob_bs || 0).toLocaleString("de-DE", {
                                    minimumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- SECCIÓN DERECHA: RESUMEN DE TOTALES Y FORMAS DE PAGO (1/3 de ancho) -->
      <div class="xl:col-span-1 space-y-6">
        <!-- RESUMEN DE TOTALES -->
        <div
          class="glass p-8 rounded-[32px] border border-border-subtle space-y-6 bg-brand-500/[0.03] backdrop-blur-3xl relative overflow-hidden flex flex-col shadow-xl"
        >
          <div
            class="absolute -top-12 -right-12 w-48 h-48 bg-brand-500/10 rounded-full blur-[80px]"
          ></div>

          <!-- Header Tasa Cambiaria y Switcher USD/BS -->
          <div
            class="flex items-center justify-between border-b border-border-subtle pb-6 relative z-10"
          >
            <div>
              <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Tasa Cambiaria</h4>
              <div class="flex items-center gap-2 mt-1.5">
                <input
                  type="number"
                  step="any"
                  bind:value={currentExchangeRate}
                  oninput={handleTasaChange}
                  class="w-28 h-8 px-2 bg-surface-soft border border-border-subtle rounded-xl text-sm font-mono font-black text-brand-400 text-center outline-none focus:border-brand-500 transition-all"
                />
                <span class="text-xs font-bold text-text-muted">Bs/$</span>
                <button
                  type="button"
                  onclick={fetchExchangeRate}
                  title="Actualizar tasa desde el agente"
                  class="p-1 hover:bg-white/5 rounded-lg text-text-muted hover:text-brand-400 transition-all cursor-pointer"
                >
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>

            <div class="flex bg-surface-base p-1 rounded-xl border border-border-bold shadow-lg">
              <button
                type="button"
                onclick={() => switchCurrency(true)}
                class={`px-5 py-2 rounded-lg text-xs font-black transition-all duration-300 cursor-pointer ${showUSD ? "bg-brand-600 text-white shadow-lg scale-105" : "text-text-muted hover:text-text-base"}`}
              >
                USD
              </button>
              <button
                type="button"
                onclick={() => switchCurrency(false)}
                class={`px-5 py-2 rounded-lg text-xs font-black transition-all duration-300 cursor-pointer ${!showUSD ? "bg-brand-600 text-white shadow-lg scale-105" : "text-text-muted hover:text-text-base"}`}
              >
                BS
              </button>
            </div>
          </div>

          <div class="space-y-4 relative z-10 text-sm">
            <div
              class="flex justify-between items-center text-base font-bold text-text-muted"
            >
              <span>Abonado Neto Facturas</span>
              <span class="font-mono text-text-base">
                {showUSD ? "$" : "Bs."} {(showUSD ? totalCobradoNeto : totalCobradoNetoBs).toLocaleString("de-DE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            {#if (showUSD ? totalRetenidoIvaVista : totalRetenidoIvaVistaBs) > 0}
              <div
                class="flex justify-between items-center text-base font-bold text-text-muted"
              >
                <span>Retenciones IVA</span>
                <span class="font-mono text-green-400">
                  {showUSD ? "$" : "Bs."} {(showUSD ? totalRetenidoIvaVista : totalRetenidoIvaVistaBs).toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            {/if}
            {#if (showUSD ? totalRetenidoIslrVista : totalRetenidoIslrVistaBs) > 0}
              <div
                class="flex justify-between items-center text-base font-bold text-text-muted"
              >
                <span>Retenciones ISLR</span>
                <span class="font-mono text-amber-300">
                  {showUSD ? "$" : "Bs."} {(showUSD ? totalRetenidoIslrVista : totalRetenidoIslrVistaBs).toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            {/if}
            <div
              class="flex justify-between items-center text-base font-bold text-text-muted border-t border-border-subtle/50 pt-4"
            >
              <span>Instrumentos Emitidos</span>
              <span class="font-mono text-text-base">
                {showUSD ? "$" : "Bs."} {(showUSD ? totalInstrumentosPago : totalInstrumentosPagoBs).toLocaleString("de-DE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div
              class="flex justify-between items-center text-base font-bold text-text-muted border-t border-border-subtle/50 pt-4"
            >
              <span>Diferencia de Cuadre</span>
              {#if diferenciaCuadre === 0}
                <span
                  class="text-xs font-black text-green-500 bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-full flex items-center gap-1.5 font-mono"
                >
                  <CheckCircle size={14} />
                  Cuadrado
                </span>
              {:else}
                <span class="font-mono text-amber-400 font-black">
                  {showUSD ? "$" : "Bs."} {(showUSD ? diferenciaCuadre : diferenciaCuadreBs).toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              {/if}
            </div>
          </div>

          <div
            class="pt-6 border-t border-border-subtle flex flex-col gap-2 relative z-10"
          >
            <div class="flex justify-between items-end">
              <div>
                <span
                  class="text-[10px] font-black uppercase tracking-[0.2em] text-brand-400/60 block mb-2"
                  >Saldo pendiente por pagar</span
                >
                <div
                  class="text-5xl font-black text-text-base drop-shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)] tracking-tight leading-none text-brand-400"
                >
                  {showUSD ? "$" : "Bs."} {(showUSD ? saldoPendientePorCobrar : saldoPendientePorCobrarBs).toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- INSTRUMENTOS DE PAGO (FORMAS DE PAGO) -->
        <div
          class="glass p-8 rounded-[32px] border border-border-subtle space-y-6 bg-brand-500/[0.03] backdrop-blur-3xl relative overflow-hidden flex flex-col shadow-xl"
        >
          <div
            class="absolute -top-12 -right-12 w-48 h-48 bg-brand-500/10 rounded-full blur-[80px]"
          ></div>

          <div
            class="flex items-center justify-between border-b border-border-subtle pb-4 relative z-10"
          >
            <h4
              class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2"
            >
              <CreditCard size={16} />
              Instrumentos de Pago
            </h4>
            {#if selectedSupplier}
              <button
                onclick={addFormaPago}
                class="flex items-center gap-1 bg-brand-600/10 hover:bg-brand-600/25 border border-brand-600/30 text-brand-400 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <Plus size={12} />
                Agregar
              </button>
            {/if}
          </div>

          {#if !selectedSupplier}
            <div
              class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-3 text-text-muted relative z-10 bg-surface-soft/20"
            >
              <CreditCard size={24} class="opacity-30" />
              <p class="text-xs">
                Carga un proveedor para configurar los instrumentos de pago.
              </p>
            </div>
          {:else if formasPago.length === 0}
            <div
              class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-3 text-text-muted relative z-10 bg-surface-soft/20"
            >
              <CreditCard size={24} class="opacity-30" />
              <p class="text-xs">
                Agrega efectivo o transferencias bancarias para liquidar el saldo.
              </p>
              <button
                onclick={addFormaPago}
                class="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-md cursor-pointer"
              >
                Agregar Instrumento
              </button>
            </div>
          {:else}
            <div class="space-y-4 relative z-10">
              {#each formasPago as fp, index}
                <div
                  class="bg-surface-soft/30 p-5 rounded-2xl border border-border-subtle space-y-3 relative"
                >
                  <button
                    onclick={() => removeFormaPago(index)}
                    class="absolute top-4 right-4 text-text-muted hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>

                  <div class="space-y-3 text-xs">
                    <div>
                      <span
                        class="text-[9px] text-text-muted font-bold block mb-1 uppercase"
                        >Forma de Pago</span
                      >
                      <select
                        bind:value={fp.forma_pag}
                        onchange={() => handleFormaPagChange(index)}
                        class="w-full h-12 px-4 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-xs cursor-pointer text-text-base"
                      >
                        <option value="EF">Efectivo</option>
                        <option value="TE">Transferencia Bancaria</option>
                        <option value="DP">Depósito Bancario</option>
                        <option value="CH">Cheque</option>
                      </select>
                    </div>

                    {#if fp.forma_pag === "EF"}
                      <div>
                        <span
                          class="text-[9px] text-text-muted font-bold block mb-1 uppercase"
                          >Caja Origen</span
                        >
                        <select
                          bind:value={fp.cod_caja}
                          onchange={() => handleCajaCtaChange(index)}
                          class="w-full h-12 px-4 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-xs cursor-pointer text-text-base"
                        >
                          {#each data.cajas as c}
                            <option value={c.cod_caja}
                              >{c.descrip} ({c.co_mone})</option
                            >
                          {/each}
                        </select>
                      </div>
                    {/if}

                    {#if fp.forma_pag === "TE" || fp.forma_pag === "DP" || fp.forma_pag === "CH"}
                      <div class="grid grid-cols-2 gap-2">
                        <div>
                          <span
                            class="text-[9px] text-text-muted font-bold block mb-1 uppercase"
                            >Cuenta Origen</span
                          >
                          <select
                            bind:value={fp.cod_cta}
                            onchange={() => handleCajaCtaChange(index)}
                            class="w-full h-12 px-2 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-[10px] cursor-pointer text-text-base"
                          >
                            {#each data.cuentasBancarias as cb}
                              <option value={cb.cod_cta}
                                >{cb.cod_cta.trim()} - {cb.descrip} ({cb.co_mone})</option
                              >
                            {/each}
                          </select>
                        </div>
                        <div>
                          <span
                            class="text-[9px] text-text-muted font-bold block mb-1 uppercase"
                            >Banco Destino</span
                          >
                          <select
                            bind:value={fp.co_ban}
                            class="w-full h-12 px-2 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-[10px] cursor-pointer text-text-base"
                          >
                            {#each data.bancos as b}
                              <option value={b.co_ban}>{b.ban_des || b.des_ban}</option>
                            {/each}
                          </select>
                        </div>
                      </div>

                      <div>
                        <span
                          class="text-[9px] text-text-muted font-bold block mb-1 uppercase"
                          >Nro. Referencia / Cheque</span
                        >
                        <input
                          type="text"
                          placeholder="Ej: 00293847"
                          bind:value={fp.num_doc}
                          class="w-full h-12 px-4 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-xs text-text-base"
                        />
                      </div>
                    {/if}

                    <!-- Monto del instrumento -->
                    <div>
                      <div class="flex justify-between items-center mb-1">
                        <span
                          class="text-[9px] text-text-muted font-bold uppercase"
                          >Monto {getRowCurrency(fp) === 'BS' ? 'en Bolívares (Bs.)' : 'en Dólares ($)'}</span
                        >
                        <div class="flex items-center gap-2">
                          <button
                            type="button"
                            onclick={() => {
                              fp.manual_override = false;
                              applyExactPendingAmount(index);
                            }}
                            class="text-[9px] text-brand-400 hover:text-brand-300 font-bold underline cursor-pointer"
                            title="Ajustar automáticamente para saldar el documento en 0"
                          >
                            Saldar pendiente
                          </button>
                          <span class="text-[10px] text-brand-400 font-bold">
                            {getRowCurrency(fp) === 'BS' ? `Equiv: $ ${fp.mont_doc || 0}` : `Equiv: Bs. ${fp.mont_doc_bs || 0}`}
                          </span>
                        </div>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={getRowCurrency(fp) === 'BS' ? fp.mont_doc_bs : fp.mont_doc}
                        oninput={(e) => {
                          fp.manual_override = true;
                          handleAmountChange(index, Number(e.currentTarget.value));
                        }}
                        class="w-full h-12 px-4 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-black text-sm text-text-base text-right font-mono"
                      />
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <!-- BOTÓN PRINCIPAL: GUARDAR PAGO -->
          {#if selectedSupplier}
            <button
              onclick={savePago}
              disabled={!canSave}
              class="w-full py-4 rounded-2xl bg-brand-600 hover:bg-brand-500 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-white font-black text-base transition-all shadow-xl shadow-brand-500/25 flex items-center justify-center gap-3 cursor-pointer mt-4"
            >
              {#if saving}
                <RefreshCw size={20} class="animate-spin" />
                Procesando Pago...
              {:else}
                <Wallet size={20} />
                Guardar Pago
              {/if}
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- MODAL PARA IMPORTAR FACTURA PENDIENTE -->
{#if showImportModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-md"
    style="background-color: var(--modal-backdrop);"
    transition:fade={{ duration: 150 }}
  >
    <!-- Backdrop Click to Close -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0"
      onclick={closeImportModal}
    ></div>

    <div
      class="relative z-10 bg-surface-raised border border-border-subtle rounded-[32px] w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
    >
      <div
        class="p-6 border-b border-border-subtle flex items-center justify-between bg-surface-soft"
      >
        <div class="flex items-center gap-3">
          <div
            class="h-10 w-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500 shrink-0"
          >
            <ShoppingBag size={20} />
          </div>
          <div>
            <h3 class="font-black text-lg text-text-base">
              Importar Factura de Compra
            </h3>
            <p class="text-xs text-text-muted font-medium">
              Selecciona una factura o documento de compra con saldo para cargar los datos del proveedor
            </p>
          </div>
        </div>
        <button
          onclick={closeImportModal}
          class="h-10 w-10 rounded-xl bg-surface-soft hover:bg-surface-strong flex items-center justify-center text-text-muted hover:text-text-base transition-all cursor-pointer"
          aria-label="Cerrar modal"
        >
          <X size={18} />
        </button>
      </div>

      <div class="p-6 border-b border-border-subtle bg-surface-soft/50">
        <div class="relative">
          <input
            type="text"
            placeholder="Buscar por número de documento, factura de proveedor, RIF o razón social..."
            bind:value={searchQuery}
            oninput={() => searchPendingInvoices(searchQuery)}
            class="w-full h-12 pl-12 pr-4 bg-surface-base border border-border-subtle rounded-xl text-sm font-medium focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none text-text-base placeholder:text-text-muted transition-all"
          />
          <Search
            size={18}
            class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-6 space-y-3 bg-surface-raised">
        {#if searchingInvoices}
          <div class="py-12 flex flex-col items-center justify-center gap-3 text-text-muted">
            <RefreshCw size={24} class="animate-spin text-brand-500" />
            <p class="text-xs font-bold">Buscando documentos de compra pendientes...</p>
          </div>
        {:else if pendingInvoices.length === 0}
          <div class="py-12 text-center text-text-muted text-xs font-bold">
            No se encontraron documentos pendientes con saldo para esta búsqueda.
          </div>
        {:else}
          {#each pendingInvoices as inv}
            <button
              onclick={() => selectInvoiceFromModal(inv)}
              class="w-full text-left bg-surface-base hover:bg-surface-soft border border-border-subtle hover:border-brand-500/40 p-4 rounded-2xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group cursor-pointer shadow-xs hover:shadow-md"
            >
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="bg-brand-500/10 text-brand-500 font-bold px-2 py-0.5 rounded-md text-xs border border-brand-500/20">
                    {inv.co_tipo_doc} {inv.nro_doc}
                  </span>
                  {#if inv.nro_fact && inv.nro_fact !== inv.nro_doc}
                    <span class="text-xs text-text-muted font-bold">
                      (Fact. {inv.nro_fact})
                    </span>
                  {/if}
                  <span class="text-xs text-text-muted font-mono">
                    Control: {inv.n_control || "N/A"}
                  </span>
                </div>
                <p class="font-black text-sm text-text-base group-hover:text-brand-500 transition-colors">
                  {inv.prov_des}
                </p>
                <p class="text-xs text-text-muted font-mono">
                  RIF: {inv.rif} • Emisión: {new Date(inv.fec_emis).toLocaleDateString("es-VE")}
                </p>
              </div>

              <div class="text-left sm:text-right shrink-0">
                <span class="text-[10px] uppercase font-bold text-text-muted block">Saldo Pendiente</span>
                <span class="text-base font-black text-brand-500">
                  $ {(inv.saldo / (inv.tasa > 0 ? inv.tasa : 1)).toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                </span>
                <span class="block text-xs text-text-muted font-bold">
                  Bs. {Number(inv.saldo).toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                </span>
                <span class="block text-[11px] text-brand-400 font-bold">
                  Tasa: {Number(inv.tasa || 1).toFixed(2)} Bs/$
                </span>
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
