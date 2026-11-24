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
    FileCheck,
    Info,
    User,
    Receipt,
    History,
    Store,
    ChevronDown,
    ShoppingBag,
    Clock,
    KeyRound,
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import ImportItemCard from "$lib/components/ui/ImportItemCard.svelte";
  import AuthorizeEditModal from "$lib/components/ui/AuthorizeEditModal.svelte";

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
  let paymentDate = $state(new Date().toISOString().split("T")[0]);

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

  const CREDIT_DOC_TYPES = ["N/CR", "NCR", "AJNA", "AJNM", "ADEL", "AJPA", "AJPM"];
  const ADVANCE_DOC_TYPES = ["ADEL", "AJNM", "AJPA", "AJPM", "AJNA"];

  function docKey(doc: any): string {
    const t = String(doc?.co_tipo_doc || "").trim().toUpperCase();
    const n = String(doc?.nro_doc || "").trim();
    return `${t}::${n}`;
  }

  function isNcDoc(doc: any): boolean {
    const t = doc?.co_tipo_doc?.trim()?.toUpperCase();
    return CREDIT_DOC_TYPES.includes(t);
  }

  function isAdvanceDoc(doc: any): boolean {
    const t = doc?.co_tipo_doc?.trim()?.toUpperCase();
    return ADVANCE_DOC_TYPES.includes(t);
  }

  function getCreditDocPriority(tipo: string | undefined | null): number {
    const t = (tipo || "").trim().toUpperCase();
    if (t === "N/CR" || t === "NCR") return 1;
    if (t === "AJNA") return 2;
    if (t === "ADEL" || t === "AJNM" || t === "AJPA" || t === "AJPM") return 3;
    return 4;
  }

  function getDocTypeBadge(co_tipo_doc: string) {
    const t = (co_tipo_doc || "").trim().toUpperCase();
    if (t === "ADEL") {
      return {
        label: "Anticipo / Adelanto",
        class: "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30",
      };
    }
    if (t === "AJNM" || t === "AJNA") {
      return {
        label: t === "AJNM" ? "Anticipo / Ajuste (-)" : "Ajuste (-) Aut.",
        class: "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30",
      };
    }
    if (t === "AJPA" || t === "AJPM") {
      return {
        label: t === "AJPA" ? "Anticipo / Excedente" : "Ajuste (+) Manual",
        class: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30",
      };
    }
    if (t === "N/CR" || t === "NCR") {
      return {
        label: "Nota de Crédito",
        class: "bg-teal-500/15 text-teal-400 border border-teal-500/30",
      };
    }
    if (t === "N/DB" || t === "NDEB" || t === "GIRO") {
      return {
        label: t === "GIRO" ? "Giro" : "Nota de Débito",
        class: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
      };
    }
    return {
      label: "Factura",
      class: "bg-brand-500/10 text-brand-400 border border-brand-500/20",
    };
  }

  function getPorcRetIva(): number {
    const raw = selectedSupplier && selectedSupplier.contribu_e
      ? Number(selectedSupplier.porc_esp) || 75
      : 75;
    return raw >= 88 ? 100 : 75;
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
    const map = new Map<string, any>();

    // 1. Primero agregamos los conceptos con la tasa del tabulador del proveedor
    for (const c of list) {
      const code = String(c.co_islr || '').trim();
      if (!code) continue;
      if (String(c.co_tab || '').trim() === currentTab) {
        map.set(code, c);
      }
    }

    // 2. Luego agregamos TODOS los demás conceptos del catálogo para que en pagos se vean todos
    for (const c of list) {
      const code = String(c.co_islr || '').trim();
      if (!code) continue;
      if (!map.has(code)) {
        map.set(code, c);
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      String(a.co_islr).localeCompare(String(b.co_islr), undefined, { numeric: true })
    );
  }

  function resolveConceptValues(conceptObj: any, coIslr: string, currentTab: string) {
    let porcRet = Number(conceptObj?.porc_ret ?? 0);
    let porcImp = Number(conceptObj?.porc_imp ?? 100);
    let sustraen = Number(conceptObj?.sustraen ?? 0);

    // Fallback de contingencia: si el agente remoto aún no tiene el tabulador/sustraendo o devolvió 0
    if (porcRet === 0) {
      if (currentTab === '5') {
        // Tabulador 5: Persona Natural Residente (PNR)
        // Por ley SENIAT: 3% y sustraendo de 107.50 Bs (2.5 UT * 43 Bs = 107.50 Bs)
        porcRet = 3;
        porcImp = 100;
        sustraen = 107.50;
      } else {
        // Tabulador 7: Persona Jurídica Domiciliada (PJD)
        porcRet = (coIslr === '072' || coIslr === '083') ? 3 : 2;
        porcImp = 100;
        sustraen = 0;
      }
    }

    return { porcRet, porcImp, sustraen };
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

    const { porcRet, porcImp, sustraen } = resolveConceptValues(found, inp.co_islr, currentTab);
    inp.porc_islr = porcRet;
    inp.porc_base_islr = porcImp;
    inp.sustraendo_islr_bs = sustraen;
    if (inp.islr_lines && inp.islr_lines[0]) {
      inp.islr_lines[0].co_islr = inp.co_islr;
      inp.islr_lines[0].porc_islr = porcRet;
      inp.islr_lines[0].porc_base_islr = porcImp;
      inp.islr_lines[0].sustraendo_islr_bs = sustraen;
      inp.islr_lines[0].manual_override_islr = false;
    }
    recalculateDocAmounts(docNo, doc);
  }

  function ensureIslrLines(inp, doc) {
    if (!inp) return;
    const docTotalBaseBs = getDocBaseBs(doc);
    if (!Array.isArray(inp.islr_lines) || inp.islr_lines.length === 0) {
      const baseBs = Number(inp.base_imponible_islr_bs) > 0 ? Number(inp.base_imponible_islr_bs) : docTotalBaseBs;
      inp.islr_lines = [
        {
          id: `islr_${Date.now()}_0`,
          co_islr: inp.co_islr || "055",
          porc_islr: inp.porc_islr || 2,
          porc_base_islr: inp.porc_base_islr ?? 100,
          sustraendo_islr_bs: inp.sustraendo_islr_bs || 0,
          base_imponible_islr: toUsd(baseBs),
          base_imponible_islr_bs: baseBs,
          reten_islr: inp.reten_islr || 0,
          reten_islr_bs: inp.reten_islr_bs || 0,
        }
      ];
    } else if (
      inp.islr_lines.length === 1 &&
      (Number(inp.islr_lines[0].base_imponible_islr_bs) || 0) === 0 &&
      docTotalBaseBs > 0
    ) {
      inp.islr_lines[0].base_imponible_islr_bs = docTotalBaseBs;
      inp.islr_lines[0].base_imponible_islr = toUsd(docTotalBaseBs);
    }
  }

  function assignRemainingBaseToLine(docNo, doc, lineIndex) {
    const inp = docInputs[docNo];
    if (!inp || !inp.islr_lines || !inp.islr_lines[lineIndex]) return;
    const docTotalBaseBs = getDocBaseBs(doc);
    const otherLinesAssigned = inp.islr_lines.reduce(
      (sum, l, idx) => idx === lineIndex ? sum : sum + (Number(l.base_imponible_islr_bs) || 0),
      0
    );
    const remaining = Math.max(0, r2(docTotalBaseBs - otherLinesAssigned));
    inp.islr_lines[lineIndex].base_imponible_islr_bs = remaining;
    inp.islr_lines[lineIndex].manual_override_islr = false;
    inp.manual_override_islr = false;
    recalculateDocAmounts(docNo, doc);
  }

  function addIslrConceptLine(docNo, doc) {
    const inp = docInputs[docNo];
    if (!inp) return;
    ensureIslrLines(inp, doc);
    const docTotalBaseBs = getDocBaseBs(doc);
    const currentlyAssignedBs = inp.islr_lines.reduce(
      (sum, l) => sum + (Number(l.base_imponible_islr_bs) || 0),
      0
    );
    const remainingBaseBs = Math.max(0, r2(docTotalBaseBs - currentlyAssignedBs));
    const initialLineBaseBs = remainingBaseBs > 0 ? remainingBaseBs : docTotalBaseBs;

    const supplierConceptos = getConceptosForSupplier();
    const currentTab = getEffectiveSupplierTab();
    const usedCodes = new Set(inp.islr_lines.map((l) => String(l.co_islr).trim()));
    const nextConcept = supplierConceptos.find((c) => !usedCodes.has(String(c.co_islr).trim())) || supplierConceptos[0];
    const nextCode = nextConcept ? String(nextConcept.co_islr).trim() : (currentTab === '5' ? '083' : '055');
    const { porcRet, porcImp, sustraen } = resolveConceptValues(nextConcept, nextCode, currentTab);

    inp.islr_lines.push({
      id: `islr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      co_islr: nextCode,
      porc_islr: porcRet,
      porc_base_islr: porcImp,
      sustraendo_islr_bs: sustraen,
      base_imponible_islr_bs: initialLineBaseBs,
      base_imponible_islr: toUsd(initialLineBaseBs),
      reten_islr: 0,
      reten_islr_bs: 0
    });

    recalculateDocAmounts(docNo, doc);
  }

  function setLineToFullBase(docNo, doc, lineIndex) {
    const inp = docInputs[docNo];
    if (!inp || !inp.islr_lines || !inp.islr_lines[lineIndex]) return;
    const docTotalBaseBs = getDocBaseBs(doc);
    inp.islr_lines[lineIndex].base_imponible_islr_bs = docTotalBaseBs;
    inp.islr_lines[lineIndex].manual_override_islr = false;
    inp.manual_override_islr = false;
    recalculateDocAmounts(docNo, doc);
  }

  function removeIslrConceptLine(docNo, doc, index) {
    const inp = docInputs[docNo];
    if (!inp || !inp.islr_lines || inp.islr_lines.length <= 1) return;
    inp.islr_lines.splice(index, 1);
    inp.manual_override_islr = false;
    recalculateDocAmounts(docNo, doc);
  }

  function handleLineConceptChange(
    docNo,
    doc,
    lineIndex,
    selectedCode,
  ) {
    const inp = docInputs[docNo];
    if (!inp) return;
    ensureIslrLines(inp, doc);
    const line = inp.islr_lines[lineIndex];
    if (!line) return;

    line.co_islr = selectedCode.trim();
    line.manual_override_islr = false;
    inp.manual_override_islr = false;

    const currentTab = getEffectiveSupplierTab();
    const allList = data.conceptosIslr || [];
    const foundInTab = allList.find(
      (c) =>
        String(c.co_tab || "").trim() === currentTab &&
        String(c.co_islr || "").trim() === line.co_islr,
    );
    const found =
      foundInTab ||
      allList.find((c) => String(c.co_islr || "").trim() === line.co_islr);

    const { porcRet, porcImp, sustraen } = resolveConceptValues(
      found,
      line.co_islr,
      currentTab,
    );
    line.porc_islr = porcRet;
    line.porc_base_islr = porcImp;
    line.sustraendo_islr_bs = sustraen;
    recalculateDocAmounts(docNo, doc);
  }

  function onSupplierTabChange() {
    const currentTab = getEffectiveSupplierTab();
    const supplierConceptos = getConceptosForSupplier();
    const defaultConceptObj = currentTab === '5'
      ? (supplierConceptos.find((c: any) => c.co_islr.trim() === '083') || supplierConceptos[0])
      : (supplierConceptos.find((c: any) => c.co_islr.trim() === '055') || supplierConceptos[0]);

    documentos.forEach((doc) => {
      const k = docKey(doc);
      const inp = docInputs[k];
      if (inp && defaultConceptObj && !isAdvanceDoc(doc)) {
        inp.co_islr = defaultConceptObj.co_islr.trim();
        const { porcRet, porcImp, sustraen } = resolveConceptValues(defaultConceptObj, inp.co_islr, currentTab);
        inp.porc_islr = porcRet;
        inp.porc_base_islr = porcImp;
        inp.sustraendo_islr_bs = sustraen;
        inp.manual_override_islr = false;
        recalculateDocAmounts(k, doc, false);
      }
    });
    syncSinglePaymentInstrument();
  }

  function getDocBaseBs(doc: any): number {
    return r2(doc.base_imponible > 0 ? doc.base_imponible : (doc.total_neto - doc.monto_imp));
  }

  function getDocIvaBaseBs(doc: any): number {
    if (Number(doc.monto_exento || 0) > 0 || Number(doc.base_imponible || 0) > 0) {
      return r2(Number(doc.base_imponible) || 0);
    }
    return r2(Math.max(0, (Number(doc.total_neto) || 0) - (Number(doc.monto_imp) || 0)));
  }

  function getAppliedRetIvaBs(inp: any): number {
    return inp && !inp.yaTieneRetIva && inp.showIvaDetails ? r2(inp.reten_iva_bs) : 0;
  }

  function getAppliedRetIslrBs(inp: any): number {
    return inp && !inp.yaTieneRetIslr && inp.showIslrDetails ? r2(inp.reten_islr_bs) : 0;
  }

  let aplicarTimbreFiscal = $state(false);

  function getDocTimbreFiscal(doc: any): {
    timbreBs: number;
    timbreUsd: number;
    baseBs: number;
  } {
    const k = doc ? docKey(doc) : "";
    const inp = k ? docInputs[k] : null;
    if (
      (!aplicarTimbreFiscal && !inp?.manual_override_timbre) ||
      !doc ||
      isNcDoc(doc)
    ) {
      return { timbreBs: 0, timbreUsd: 0, baseBs: 0 };
    }
    const baseBs = getDocBaseBs(doc);
    const timbreBs = inp?.manual_override_timbre
      ? r2(inp.reten_timbre_bs || 0)
      : r2(baseBs * 0.001);
    return { timbreBs, timbreUsd: toUsd(timbreBs), baseBs };
  }

  // Modo de operación: Pagar Documentos vs Registrar Anticipo Directo
  let paymentMode = $state<"documents" | "advance">("documents");
  let advanceDocType = $state<"ADEL" | "AJPA" | "AJNM">("ADEL");
  let advanceDescrip = $state("");
  let advanceCtaIngrEgr = $state("");
  let paymentCtaIngrEgr = $state("");
  let showSupplierSearchModal = $state(false);
  let supplierSearchInput = $state("");
  let searchingSuppliers = $state(false);
  let supplierResults = $state<any[]>([]);
  let generatedAdvanceDoc = $state<{ co_tipo_doc: string; nro_doc: string; saldo?: number } | null>(null);
  let generatedMovBan = $state<string | null>(null);

  // Documentos cargados del proveedor (keyed por `${co_tipo_doc}::${nro_doc}`)
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
        islr_lines?: Array<{
          id: string;
          co_islr: string;
          porc_islr: number;
          porc_base_islr?: number;
          sustraendo_islr_bs?: number;
          base_imponible_islr: number;
          base_imponible_islr_bs: number;
          reten_islr: number;
          reten_islr_bs: number;
          manual_override_islr?: boolean;
          authorized_by?: string;
        }>;
        sustraendo_islr_bs?: number;
        showIvaDetails: boolean;
        showIslrDetails: boolean;
        manual_override_iva?: boolean;
        authorized_iva_by?: string;
        manual_override_islr?: boolean;
        reten_timbre_bs?: number;
        manual_override_timbre?: boolean;
        authorized_timbre_by?: string;
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

  // Prorrateo secuencial de créditos y anticipos seleccionados contra las facturas
  let creditAllocations = $derived.by(() => {
    const map: Record<string, {
      netCreditBs: number;
      appliedBs: number;
      appliedUsd: number;
      remainingBs: number;
      remainingUsd: number;
      isPartial: boolean;
    }> = {};
    if (paymentMode === "advance") return map;

    let remainingNeedBs = totalFacturasNetoBs;
    const checkedCredits = documentos
      .filter((d) => checkedDocs[docKey(d)] && isNcDoc(d))
      .sort((a, b) => {
        const prio = getCreditDocPriority(a.co_tipo_doc) - getCreditDocPriority(b.co_tipo_doc);
        if (prio !== 0) return prio;
        return new Date(a.fec_emis || 0).getTime() - new Date(b.fec_emis || 0).getTime();
      });

    for (const doc of checkedCredits) {
      const k = docKey(doc);
      const inp = docInputs[k];
      const saldoBs = r2(doc.saldo);
      const retIvaBs = inp ? getAppliedRetIvaBs(inp) : 0;
      const retIslrBs = inp ? getAppliedRetIslrBs(inp) : 0;
      const netCreditBs = Math.max(0, r2(saldoBs - retIvaBs - retIslrBs));
      const appliedBs = r2(Math.min(netCreditBs, remainingNeedBs));
      const remainingBs = r2(Math.max(0, netCreditBs - appliedBs));
      remainingNeedBs = r2(Math.max(0, remainingNeedBs - appliedBs));
      map[k] = {
        netCreditBs,
        appliedBs,
        appliedUsd: toUsd(appliedBs),
        remainingBs,
        remainingUsd: toUsd(remainingBs),
        isPartial: appliedBs > 0.005 && remainingBs > 0.005,
      };
    }
    return map;
  });

  let selectedDocsWithCta = $derived.by(() => {
    if (paymentMode === "advance") {
      return [] as Array<{ label: string; code: string; descrip: string }>;
    }
    return documentos
      .filter((d) => checkedDocs[docKey(d)])
      .map((doc) => ({
        label: `${String(doc.co_tipo_doc || "").trim()} ${String(doc.nro_doc || "").trim()}`.trim(),
        code: String(doc.co_cta_ingr_egr || "").trim(),
        descrip: String(doc.des_cta_ingr_egr || "").trim(),
      }))
      .filter((d) => d.code !== "");
  });

  // Reactivo: Auto-distribuir el total de instrumentos de pago y anticipos/notas de crédito a las facturas seleccionadas
  // (todo en Bs, que es la moneda en la que se liquida la factura)
  $effect(() => {
    if (paymentMode === "advance") return;

    // 1. Fondo disponible total para aplicar a facturas/deudas (Instrumentos + Créditos/Anticipos aplicados)
    let remainingPaymentBs = r2(totalInstrumentosPagoBs + creditoNcAplicadoBs);

    // 2. Procesar todos los documentos cargados
    for (const doc of documentos) {
      const k = docKey(doc);
      const inp = docInputs[k];
      if (!inp) continue;

      if (!checkedDocs[k]) {
        inp.mont_cob = 0;
        inp.mont_cob_bs = 0;
        continue;
      }

      if (isNcDoc(doc)) {
        const allocBs = creditAllocations[k]?.appliedBs ?? 0;
        inp.mont_cob_bs = -allocBs;
        inp.mont_cob = -toUsd(allocBs);
      } else {
        const retTimbreBs = getDocTimbreFiscal(doc).timbreBs;
        const maxAbonoBs = Math.max(
          0,
          r2(r2(doc.saldo) - getAppliedRetIvaBs(inp) - getAppliedRetIslrBs(inp) - retTimbreBs),
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
    paymentMode === "advance"
      ? totalInstrumentosPagoBs
      : r2(
          documentos.reduce((acc, doc) => {
            const k = docKey(doc);
            if (checkedDocs[k]) {
              const saldoBs = r2(doc.saldo);
              if (isNcDoc(doc)) {
                const inp = docInputs[k];
                const retIvaBs = inp ? getAppliedRetIvaBs(inp) : 0;
                const retIslrBs = inp ? getAppliedRetIslrBs(inp) : 0;
                return acc - Math.max(0, r2(saldoBs - retIvaBs - retIslrBs));
              }
              const inp = docInputs[k];
              if (inp) {
                const retTimbreBs = getDocTimbreFiscal(doc).timbreBs;
                return acc + Math.max(0, r2(saldoBs - getAppliedRetIvaBs(inp) - getAppliedRetIslrBs(inp) - retTimbreBs));
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
        const k = docKey(doc);
        if (checkedDocs[k]) {
          const inp = docInputs[k];
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
        const k = docKey(doc);
        if (checkedDocs[k]) {
          return acc + getAppliedRetIvaBs(docInputs[k]);
        }
        return acc;
      }, 0),
    ),
  );

  let totalRetenidoIva = $derived(toUsd(totalRetenidoIvaBs));

  let totalRetenidoIvaVistaBs = $derived(
    r2(
      documentos.reduce((acc, doc) => {
        const k = docKey(doc);
        if (checkedDocs[k]) {
          const inp = docInputs[k];
          if (inp?.yaTieneRetIva) {
            return acc + (Number(inp.monto_ret_iva_previo_bs) || 0);
          } else if (inp?.showIvaDetails) {
            return acc + r2(inp.reten_iva_bs);
          } else if (!isAdvanceDoc(doc)) {
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
        const k = docKey(doc);
        if (checkedDocs[k]) {
          return acc + getAppliedRetIslrBs(docInputs[k]);
        }
        return acc;
      }, 0),
    ),
  );

  let totalRetenidoIslr = $derived(toUsd(totalRetenidoIslrBs));

  let totalRetenidoIslrVistaBs = $derived(
    r2(
      documentos.reduce((acc, doc) => {
        const k = docKey(doc);
        if (checkedDocs[k]) {
          const inp = docInputs[k];
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

  // Totales de Retenciones Timbre Fiscal (1x1000)
  let totalBaseTimbreBs = $derived(
    r2(
      documentos.reduce((acc, doc) => {
        if (checkedDocs[docKey(doc)] && !isNcDoc(doc)) {
          return acc + getDocTimbreFiscal(doc).baseBs;
        }
        return acc;
      }, 0),
    ),
  );

  let totalTimbreFiscalBs = $derived(
    r2(
      documentos.reduce((acc, doc) => {
        if (checkedDocs[docKey(doc)] && !isNcDoc(doc)) {
          return acc + getDocTimbreFiscal(doc).timbreBs;
        }
        return acc;
      }, 0),
    ),
  );

  let totalTimbreFiscalUsd = $derived(toUsd(totalTimbreFiscalBs));

  // Total neto adeudado en facturas de débito seleccionadas
  let totalFacturasNetoBs = $derived(
    r2(
      documentos.reduce((acc, doc) => {
        const k = docKey(doc);
        if (!checkedDocs[k] || isNcDoc(doc)) return acc;
        const inp = docInputs[k];
        const saldoBs = r2(doc.saldo);
        const retIvaBs = inp ? getAppliedRetIvaBs(inp) : 0;
        const retIslrBs = inp ? getAppliedRetIslrBs(inp) : 0;
        const retTimbreBs = getDocTimbreFiscal(doc).timbreBs;
        return acc + Math.max(0, r2(saldoBs - retIvaBs - retIslrBs - retTimbreBs));
      }, 0),
    ),
  );

  let totalFacturasNetoUsd = $derived(toUsd(totalFacturasNetoBs));

  // Total crédito aportado por Notas de Crédito / Anticipos seleccionados (después de retenciones)
  let totalCreditoDisponibleBs = $derived(
    r2(
      documentos.reduce((acc, doc) => {
        const k = docKey(doc);
        if (!checkedDocs[k] || !isNcDoc(doc)) return acc;
        const inp = docInputs[k];
        const saldoBs = r2(doc.saldo);
        const retIvaBs = inp ? getAppliedRetIvaBs(inp) : 0;
        const retIslrBs = inp ? getAppliedRetIslrBs(inp) : 0;
        return acc + Math.max(0, r2(saldoBs - retIvaBs - retIslrBs));
      }, 0),
    ),
  );

  let totalCreditoDisponibleUsd = $derived(toUsd(totalCreditoDisponibleBs));

  // Crédito / Anticipo que realmente se aplica a las facturas seleccionadas
  let creditoNcAplicadoBs = $derived(
    r2(Math.min(totalCreditoDisponibleBs, totalFacturasNetoBs))
  );

  let creditoNcAplicadoUsd = $derived(toUsd(creditoNcAplicadoBs));

  // Excedente de la N/CR o Anticipo que NO se consume y permanece disponible en Profit Plus
  let creditoNcExcedenteBs = $derived(
    r2(Math.max(0, totalCreditoDisponibleBs - totalFacturasNetoBs))
  );

  let creditoNcExcedenteUsd = $derived(toUsd(creditoNcExcedenteBs));

  // Monto neto de facturas que debe ser cubierto por instrumentos de pago (caja/banco)
  let montoNetoAPagarBs = $derived(
    r2(Math.max(0, totalFacturasNetoBs - creditoNcAplicadoBs))
  );

  let montoNetoAPagarUsd = $derived(toUsd(montoNetoAPagarBs));

  // Excedente cuando el monto ingresado en instrumentos de pago es MAYOR a la sumatoria neta de las facturas
  let excedentePagoBs = $derived(
    paymentMode === "advance"
      ? totalInstrumentosPagoBs
      : r2(Math.max(0, totalInstrumentosPagoBs - montoNetoAPagarBs))
  );

  let excedentePagoUsd = $derived(toUsd(excedentePagoBs));

  // Solo se genera AJPA por excedente cuando se paga documentos y sobra efectivo/banco
  let hasPaymentSurplus = $derived(
    paymentMode !== "advance" && totalInstrumentosPagoBs > montoNetoAPagarBs + 0.05
  );

  // Saldo pendiente por pagar (Bs exactos del documento)
  let saldoPendientePorCobrarBs = $derived(
    paymentMode === "advance" || hasPaymentSurplus ? 0 : r2(Math.max(0, montoNetoAPagarBs - totalInstrumentosPagoBs))
  );

  let saldoPendientePorCobrar = $derived(toUsd(saldoPendientePorCobrarBs));

  // Cuadre: si hay excedente en instrumentos, se cuadra generando el AJPA
  let diferenciaCuadreBs = $derived(
    paymentMode === "advance" || hasPaymentSurplus ? 0 : r2(Math.abs(montoNetoAPagarBs - totalInstrumentosPagoBs))
  );

  let diferenciaCuadre = $derived(toUsd(diferenciaCuadreBs));

  // Condición para habilitar Guardar Pago / Anticipo Directo
  let canSave = $derived.by(() => {
    if (saving || !selectedSupplier) return false;

    if (paymentMode === "advance") {
      if (totalInstrumentosPagoBs <= 0.01) return false;
      return formasPago.some(
        (fp) =>
          (Number(fp.mont_doc_bs) || 0) > 0.01 &&
          (fp.forma_pag === "EF" ? Boolean(fp.cod_caja) : Boolean(fp.cod_cta)),
      );
    }

    const selectedCount = Object.values(checkedDocs).filter(Boolean).length;
    if (selectedCount === 0) return false;

    // Caso 1: Hay pago en exceso en instrumentos (se generará un AJPA por la diferencia a favor)
    if (hasPaymentSurplus) {
      return true;
    }

    // Caso 2: Sin instrumentos de pago (pago parcial exclusivamente de retenciones o cubierto 100% por N/CR / Anticipo)
    if (totalInstrumentosPagoBs === 0) {
      const hasRetentions =
        totalRetenidoIvaBs > 0 ||
        totalRetenidoIslrBs > 0 ||
        totalTimbreFiscalBs > 0;
      const hasCreditApplied = creditoNcAplicadoBs > 0;
      return hasRetentions || hasCreditApplied;
    }

    // Caso 3: Con instrumentos de pago -> debe cuadrar exactamente con el neto a pagar
    return diferenciaCuadreBs === 0 && formasPago.length > 0;
  });

  // Sincronizar sucursal seleccionada
  let selectedBranch = $state(data.selectedBranchId || "");

  const allowEditableRetentions = $derived(
    Boolean(
      (data.branches || []).find((b: any) => b.id === selectedBranch)
        ?.allow_editable_retentions ?? false,
    ),
  );

  let retAuthModal = $state<{
    open: boolean;
    kind: "IVA" | "ISLR" | "TIMBRE";
    doc: any;
    lineIndex: number;
    initialValue: number;
    title: string;
    description: string;
    fieldLabel: string;
  }>({
    open: false,
    kind: "IVA",
    doc: null,
    lineIndex: -1,
    initialValue: 0,
    title: "",
    description: "",
    fieldLabel: "",
  });

  function openRetentionAuthModal(
    kind: "IVA" | "ISLR" | "TIMBRE",
    doc: any,
    lineIndex = -1,
  ) {
    const k = docKey(doc);
    const nro = doc?.nro_doc?.trim() || "";
    const inp = docInputs[k];
    if (!inp) return;

    if (kind === "IVA") {
      retAuthModal = {
        open: true,
        kind: "IVA",
        doc,
        lineIndex: -1,
        initialValue: Number(inp.reten_iva_bs || 0),
        title: "Autorizar Monto Retención IVA",
        description: `Documento ${doc.co_tipo_doc?.trim() || "FACT"} ${nro}`,
        fieldLabel: "Nuevo Monto Retenido IVA (Bs.)",
      };
    } else if (kind === "ISLR") {
      const line = inp.islr_lines?.[lineIndex];
      const currentVal = line
        ? Number(line.reten_islr_bs || 0)
        : Number(inp.reten_islr_bs || 0);
      retAuthModal = {
        open: true,
        kind: "ISLR",
        doc,
        lineIndex,
        initialValue: currentVal,
        title: "Autorizar Monto Retención ISLR",
        description: `Documento ${doc.co_tipo_doc?.trim() || "FACT"} ${nro}${line?.co_islr ? ` · Concepto ${line.co_islr}` : ""}`,
        fieldLabel: "Nuevo Monto Retenido ISLR (Bs.)",
      };
    } else {
      const currentTimbre = getDocTimbreFiscal(doc).timbreBs;
      retAuthModal = {
        open: true,
        kind: "TIMBRE",
        doc,
        lineIndex: -1,
        initialValue: currentTimbre,
        title: "Autorizar Retención Timbre 1x1000",
        description: `Documento ${doc.co_tipo_doc?.trim() || "FACT"} ${nro}`,
        fieldLabel: "Nuevo Monto Timbre Fiscal 1x1000 (Bs.)",
      };
    }
  }

  function applyAuthorizedRetention(
    newVal: number,
    authorizer: { email: string; full_name: string },
  ) {
    const doc = retAuthModal.doc;
    if (!doc) return;
    const k = docKey(doc);
    const inp = docInputs[k];
    if (!inp) return;
    const authName = authorizer.full_name || authorizer.email;
    const rounded = Math.max(0, Math.round(Number(newVal || 0) * 100) / 100);

    if (retAuthModal.kind === "IVA") {
      inp.reten_iva_bs = rounded;
      inp.manual_override_iva = true;
      inp.authorized_iva_by = authName;
      recalculateDocAmounts(k, doc, true);
    } else if (retAuthModal.kind === "ISLR") {
      ensureIslrLines(inp, doc);
      const idx = retAuthModal.lineIndex >= 0 ? retAuthModal.lineIndex : 0;
      if (inp.islr_lines?.[idx]) {
        inp.islr_lines[idx].reten_islr_bs = rounded;
        inp.islr_lines[idx].manual_override_islr = true;
        inp.islr_lines[idx].authorized_by = authName;
      }
      inp.manual_override_islr = true;
      recalculateDocAmounts(k, doc, true);
    } else if (retAuthModal.kind === "TIMBRE") {
      aplicarTimbreFiscal = true;
      inp.reten_timbre_bs = rounded;
      inp.manual_override_timbre = true;
      inp.authorized_timbre_by = authName;
      recalculateDocAmounts(k, doc, true);
    }
  }

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

  // Cambio entre Pagar Documentos vs Registrar Anticipo Directo
  function switchPaymentMode(mode: "documents" | "advance") {
    if (paymentMode === mode) return;
    paymentMode = mode;
    if (mode === "advance") {
      checkedDocs = {};
      if (selectedSupplier) {
        if (!advanceDescrip.trim()) {
          advanceDescrip = `ANTICIPO A PROVEEDOR ${selectedSupplier.descripcion || selectedSupplier.co_prov}`;
        }
        if (formasPago.length === 0) {
          addFormaPago();
        }
      } else {
        openSupplierSearchModal();
      }
    } else if (selectedSupplier) {
      loadSupplierDocuments(selectedSupplier.co_prov);
    }
  }

  function openSupplierSearchModal() {
    showSupplierSearchModal = true;
    searchSuppliersList(supplierSearchInput);
  }

  function closeSupplierSearchModal() {
    showSupplierSearchModal = false;
  }

  async function searchSuppliersList(query = "") {
    if (!selectedBranch) return;
    searchingSuppliers = true;
    try {
      const q = new URLSearchParams({
        branch_id: selectedBranch,
        limit: "25",
      });
      if (query.trim()) q.set("search", query.trim());
      const res = await fetch(`/api/agent/suppliers?${q.toString()}`);
      if (res.ok) {
        const json = await res.json();
        supplierResults = json.data || [];
      } else {
        supplierResults = [];
      }
    } catch (e) {
      console.error("Error searching suppliers:", e);
      supplierResults = [];
    } finally {
      searchingSuppliers = false;
    }
  }

  function selectSupplierForAdvance(prov: any) {
    closeSupplierSearchModal();
    const effectiveTab = resolveTabulador(prov.co_tab, prov.rif || prov.co_prov, prov.tipo_per);
    selectedSupplier = {
      co_prov: String(prov.co_prov || "").trim(),
      descripcion: String(prov.prov_des || prov.descripcion || "").trim(),
      rif: String(prov.rif || "").trim(),
      contribu_e: prov.contribu_e,
      porc_esp: prov.porc_esp || 75,
      co_tab: effectiveTab,
      tab_des: prov.tab_des?.trim() || getTabDescription(effectiveTab),
      tipo_per: prov.tipo_per ? String(prov.tipo_per).trim() : (effectiveTab === "5" ? "1" : "3"),
      direc1: String(prov.direc1 || "").trim(),
      telefonos: String(prov.telefonos || "").trim(),
    };
    co_prov = selectedSupplier.co_prov;
    documentos = [];
    checkedDocs = {};
    docInputs = {};
    advanceDescrip = `ANTICIPO A PROVEEDOR ${selectedSupplier.descripcion || selectedSupplier.co_prov}`;
    if (formasPago.length === 0) {
      addFormaPago();
    }
    toast.success(`Proveedor seleccionado: ${selectedSupplier.descripcion}`);
  }

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
    paymentMode = "documents";
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
    await loadSupplierDocuments(co_prov, docKey(inv));
  }

  // Cargar Documentos del Proveedor
  async function loadSupplierDocuments(provCode: string, specificKeyToSelect: string | null = null) {
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

        if (specificKeyToSelect) {
          const targetDoc = documentos.find(
            (d) => docKey(d) === specificKeyToSelect || d.nro_doc.trim() === specificKeyToSelect
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
        const { porcRet: defaultPorcIslr, porcImp: defaultPorcBaseIslr, sustraen: defaultSustraendoIslr } = resolveConceptValues(defaultConceptObj, defaultIslrConcept, currentTab);

        documentos.forEach((doc) => {
          const k = docKey(doc);
          const nro = doc.nro_doc.trim();
          const isAdv = isAdvanceDoc(doc);

          // Verificar si ya tiene retención de IVA o ISLR aplicada
          const yaTieneRetIva = !isAdv && ((Number(doc.ya_reten_iva_bs) > 0) || Boolean(doc.nro_comp_iva));
          const yaTieneRetIslr = !isAdv && ((Number(doc.ya_reten_islr_bs) > 0) || Boolean(doc.nro_comp_islr));
          const montoRetIvaPrevioBs = r2(doc.ya_reten_iva_bs);
          const montoRetIslrPrevioBs = r2(doc.ya_reten_islr_bs);

          // Base imponible del documento en Bs (exacta, tal como está en la factura)
          const baseImpBs = getDocBaseBs(doc);
          const baseImpIvaBs = getDocIvaBaseBs(doc);

          // Retención de IVA por defecto (75% / 100%) sobre el IVA en Bs - Solo si NO es anticipo y NO tiene retención previa
          const ivaBs = Number(doc.monto_imp) || 0;
          const porcRetIva = getPorcRetIva();
          const retIvaBs = !isAdv && !yaTieneRetIva && ivaBs > 0
            ? r2(ivaBs * (porcRetIva / 100))
            : 0;

          docInputs[k] = {
            mont_cob: 0,
            mont_cob_bs: 0,
            reten_iva: toUsd(retIvaBs),
            reten_iva_bs: retIvaBs,
            num_comprobante_iva: "",
            porc_ret_iva: porcRetIva,
            base_imponible_iva: toUsd(baseImpIvaBs),
            base_imponible_iva_bs: baseImpIvaBs,
            alicuota_iva: doc.porc_imp != null ? doc.porc_imp : 16,
            reten_islr: 0,
            reten_islr_bs: 0,
            co_islr: defaultIslrConcept,
            porc_islr: defaultPorcIslr,
            porc_base_islr: defaultPorcBaseIslr,
            sustraendo_islr_bs: defaultSustraendoIslr,
            base_imponible_islr: toUsd(baseImpBs),
            base_imponible_islr_bs: baseImpBs,
            islr_lines: [
              {
                id: `islr_${Date.now()}_0`,
                co_islr: defaultIslrConcept,
                porc_islr: defaultPorcIslr,
                porc_base_islr: defaultPorcBaseIslr,
                sustraendo_islr_bs: defaultSustraendoIslr,
                base_imponible_islr: toUsd(baseImpBs),
                base_imponible_islr_bs: baseImpBs,
                reten_islr: 0,
                reten_islr_bs: 0
              }
            ],
            showIvaDetails: !isAdv && !yaTieneRetIva && retIvaBs > 0,
            showIslrDetails: !isAdv && !yaTieneRetIslr && (Boolean(doc.sujeto_obj_retenISLR_auto) || Boolean(selectedSupplier?.co_tab)),
            yaTieneRetIva,
            nro_comp_iva_previo: doc.nro_comp_iva ? doc.nro_comp_iva.trim() : "",
            monto_ret_iva_previo_bs: montoRetIvaPrevioBs,
            monto_ret_iva_previo_usd: toUsd(montoRetIvaPrevioBs),
            yaTieneRetIslr,
            nro_comp_islr_previo: doc.nro_comp_islr ? doc.nro_comp_islr.trim() : "",
            monto_ret_islr_previo_bs: montoRetIslrPrevioBs,
            monto_ret_islr_previo_usd: toUsd(montoRetIslrPrevioBs),
          };

          if (specificKeyToSelect && (k === specificKeyToSelect || nro === specificKeyToSelect)) {
            checkedDocs[k] = true;
          }
        });

        // Si no se especificó un documento, seleccionamos el primero si hay
        if (!specificKeyToSelect && documentos.length > 0) {
          checkedDocs[docKey(documentos[0])] = true;
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
    aplicarTimbreFiscal = false;
    advanceDescrip = "";
    advanceCtaIngrEgr = "";
    paymentCtaIngrEgr = "";
    showMovCtaModal = false;
    confirmedMovCta = false;
    modalCtaSelected = "";
    modalCtaSearch = "";
    generatedAdvanceDoc = null;
    generatedMovBan = null;
  }

  function toggleDocSelection(docKeyStr: string, doc: any, isChecked: boolean) {
    checkedDocs[docKeyStr] = isChecked;
    recalculateDocAmounts(docKeyStr, doc, true);
  }

  function recalculateDocAmounts(docNo: string, doc: any, syncInstrument = true) {
    const inp = docInputs[docNo];
    if (!inp) return;

    // Base imponible: Bs exactos del documento; USD solo referencial
    const baseImpIvaBs = getDocIvaBaseBs(doc);
    inp.base_imponible_iva_bs = baseImpIvaBs;
    inp.base_imponible_iva = toUsd(baseImpIvaBs);
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

    // Manejo de Retención de ISLR (soporta múltiples conceptos por documento)
    if (inp.yaTieneRetIslr) {
      inp.showIslrDetails = false;
      inp.reten_islr_bs = 0;
    } else if (inp.showIslrDetails) {
      ensureIslrLines(inp, doc);
      let totalRetBs = 0;
      let totalBaseBs = 0;

      for (const line of inp.islr_lines) {
        const lineBaseRaw = Number(line.base_imponible_islr_bs) || 0;
        if (line.manual_override_islr) {
          line.reten_islr_bs = r2(Number(line.reten_islr_bs) || 0);
          line.reten_islr = toUsd(line.reten_islr_bs);
          line.base_imponible_islr = toUsd(lineBaseRaw);
        } else {
          const porcBase = Number(line.porc_base_islr ?? 100) / 100;
          const baseSujeta = r2(lineBaseRaw * porcBase);
          const porcRet = (Number(line.porc_islr) || 0) / 100;
          const sustraendoBs = Number(line.sustraendo_islr_bs) || 0;

          // Fórmula SENIAT / Profit Plus: (Base * %Base * %Ret) - Sustraendo
          const retBruta = r2(baseSujeta * porcRet);
          const retNeta = r2(retBruta - sustraendoBs);
          line.reten_islr_bs = Math.max(0, retNeta);
          line.reten_islr = toUsd(line.reten_islr_bs);
          line.base_imponible_islr = toUsd(lineBaseRaw);
        }

        totalRetBs += line.reten_islr_bs;
        totalBaseBs += lineBaseRaw;
      }

      inp.reten_islr_bs = r2(totalRetBs);
      inp.base_imponible_islr_bs = r2(totalBaseBs);
      if (inp.islr_lines[0]) {
        inp.co_islr = inp.islr_lines[0].co_islr;
        inp.porc_islr = inp.islr_lines[0].porc_islr;
        inp.sustraendo_islr_bs = inp.islr_lines[0].sustraendo_islr_bs;
      }
    } else {
      inp.reten_islr_bs = 0;
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
      recalculateDocAmounts(docKey(doc), doc, false);
    });
    syncSinglePaymentInstrument();
  }

  // Helper para calcular el monto neto pendiente (en Bs exactos) que deja el saldo del documento en 0
  function getRemainingPendingBalance(excludeIndex: number = -1) {
    if (paymentMode === "advance" || montoNetoAPagarBs === 0) {
      return { pendingBs: 0, pendingUsd: 0 };
    }
    let totalNeededBs = 0;

    for (const doc of documentos) {
      const k = docKey(doc);
      if (!checkedDocs[k]) continue;

      const saldoBs = r2(doc.saldo);
      if (isNcDoc(doc)) {
        const inp = docInputs[k];
        const retIvaBs = inp ? getAppliedRetIvaBs(inp) : 0;
        const retIslrBs = inp ? getAppliedRetIslrBs(inp) : 0;
        totalNeededBs -= Math.max(0, r2(saldoBs - retIvaBs - retIslrBs));
        continue;
      }

      const inp = docInputs[k];
      const retTimbreBs = getDocTimbreFiscal(doc).timbreBs;
      totalNeededBs += Math.max(0, r2(saldoBs - getAppliedRetIvaBs(inp) - getAppliedRetIslrBs(inp) - retTimbreBs));
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
    if (paymentMode === "advance") return;
    if (!formasPago[index]) return;
    const fp = formasPago[index];
    const { pendingBs, pendingUsd } = getRemainingPendingBalance(index);

    // Siempre se liquida el monto exacto en Bs; el USD es el equivalente a la tasa actual
    fp.mont_doc_bs = pendingBs;
    fp.mont_doc = pendingUsd;
  }

  function syncSinglePaymentInstrument() {
    if (paymentMode === "advance") return;
    if (formasPago.length === 1 && !formasPago[0].manual_override) {
      applyExactPendingAmount(0);
    }
  }

  // Manejo de Formas de Pago
  function addFormaPago() {
    const defaultCaja = data.cajas?.[0]?.cod_caja || "02";
    const defaultCta = data.cuentasBancarias?.[0]?.cod_cta || "";
    const defaultBan = data.bancos?.[0]?.co_ban || "";
    const preferBank = paymentMode === "advance" && Boolean(defaultCta);
    const newFp = {
      forma_pag: preferBank ? "TR" : "EF",
      cod_caja: preferBank ? "" : defaultCaja,
      cod_cta: preferBank ? defaultCta : "",
      co_ban: preferBank ? defaultBan : "",
      num_doc: "",
      mont_doc: 0,
      mont_doc_bs: 0,
      fecha_che: null,
      manual_override: paymentMode === "advance",
    };
    const newIndex = formasPago.length;
    formasPago = [...formasPago, newFp];
    if (paymentMode !== "advance") {
      applyExactPendingAmount(newIndex);
    }
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
    } else if (fp.forma_pag === "TE" || fp.forma_pag === "TR" || fp.forma_pag === "DP" || fp.forma_pag === "CH") {
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
  let showAjpaConfirmModal = $state(false);
  let confirmedAjpa = $state(false);
  let showMovCtaModal = $state(false);
  let confirmedMovCta = $state(false);
  let modalCtaSelected = $state("");
  let modalCtaSearch = $state("");

  let filteredCuentasIngrEgr = $derived.by(() => {
    const list = data.cuentasIngrEgr || [];
    const q = modalCtaSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c: any) =>
        String(c.co_cta_ingr_egr || "").toLowerCase().includes(q) ||
        String(c.descrip || "").toLowerCase().includes(q)
    );
  });

  let modalCtaSelectedObj = $derived(
    (data.cuentasIngrEgr || []).find(
      (c: any) =>
        String(c.co_cta_ingr_egr || "").trim().toUpperCase() ===
        modalCtaSelected.trim().toUpperCase()
    ) || null
  );

  function getFormaPagLabel(forma: string): string {
    if (forma === "EF") return "Efectivo";
    if (forma === "TR" || forma === "TE") return "Transferencia";
    if (forma === "DP") return "Depósito";
    if (forma === "CH") return "Cheque";
    return forma || "Pago";
  }

  function getInstrumentAccountLabel(fp: any): string {
    if (fp.forma_pag === "EF") {
      const caja = (data.cajas || []).find(
        (c: any) => c.cod_caja?.trim() === fp.cod_caja?.trim()
      );
      return caja
        ? `${caja.cod_caja?.trim()} - ${caja.descrip?.trim()}`
        : `Caja ${fp.cod_caja || "02"}`;
    }
    const cb = (data.cuentasBancarias || []).find(
      (c: any) => c.cod_cta?.trim() === fp.cod_cta?.trim()
    );
    return cb
      ? `${cb.cod_cta?.trim()} - ${cb.descrip?.trim()}`
      : `Banco ${fp.cod_cta || ""}`;
  }

  function handleSaveClick() {
    if (!selectedSupplier) {
      toast.error("Debe seleccionar un proveedor.");
      return;
    }

    const activeInstruments = formasPago.filter(
      (fp) => (Number(fp.mont_doc_bs) || 0) > 0.001
    );

    if (paymentMode === "advance") {
      if (activeInstruments.length === 0 || totalInstrumentosPagoBs <= 0.01) {
        toast.error(
          "Debe ingresar al menos un instrumento de pago con monto mayor a 0 para el anticipo."
        );
        return;
      }
    } else {
      const selectedDocsList = documentos.filter((d) => checkedDocs[docKey(d)]);
      if (selectedDocsList.length === 0) {
        toast.error("Debe seleccionar al menos un documento a pagar.");
        return;
      }
      if (
        !hasPaymentSurplus &&
        totalInstrumentosPagoBs === 0 &&
        totalRetenidoIvaBs === 0 &&
        totalRetenidoIslrBs === 0 &&
        totalTimbreFiscalBs === 0 &&
        creditoNcAplicadoBs === 0
      ) {
        toast.error(
          "Debe ingresar un monto a pagar o aplicar al menos una retención (IVA, ISLR o 1x1000)."
        );
        return;
      }
      if (
        !hasPaymentSurplus &&
        totalInstrumentosPagoBs > 0 &&
        diferenciaCuadreBs !== 0
      ) {
        toast.error(
          "El monto abonado en facturas debe coincidir exactamente con los instrumentos de pago."
        );
        return;
      }
    }

    if (paymentMode !== "advance" && hasPaymentSurplus && !confirmedAjpa) {
      showAjpaConfirmModal = true;
      return;
    }

    const willGenerateMovement = activeInstruments.length > 0;
    if (
      willGenerateMovement &&
      !confirmedMovCta &&
      (data.cuentasIngrEgr || []).length > 0
    ) {
      modalCtaSearch = "";
      if (paymentMode === "advance") {
        modalCtaSelected = String(advanceCtaIngrEgr || "").trim();
      } else {
        const uniqueCodes: string[] = [];
        for (const item of selectedDocsWithCta) {
          if (
            !uniqueCodes.some(
              (u) => u.toUpperCase() === item.code.toUpperCase()
            )
          ) {
            uniqueCodes.push(item.code);
          }
        }
        modalCtaSelected = uniqueCodes.length === 1 ? uniqueCodes[0] : "";
      }
      showMovCtaModal = true;
      return;
    }

    executeSavePago();
  }

  async function executeSavePago() {
    if (!selectedSupplier) {
      toast.error("Debe seleccionar un proveedor.");
      return;
    }

    const formas_pago_cleaned = formasPago
      .filter((fp) => (Number(fp.mont_doc_bs) || 0) > 0.001)
      .map((fp) => ({
        forma_pag: fp.forma_pag,
        cod_caja: fp.cod_caja || null,
        cod_cta: fp.cod_cta || null,
        co_ban: fp.co_ban || null,
        num_doc: fp.num_doc ? fp.num_doc.trim() : null,
        mont_doc: fp.mont_doc_bs || 0,
        fecha_che: fp.fecha_che || null,
      }));

    if (paymentMode === "advance") {
      if (formas_pago_cleaned.length === 0 || totalInstrumentosPagoBs <= 0.01) {
        toast.error("Debe ingresar al menos un instrumento de pago con monto mayor a 0 para el anticipo.");
        return;
      }

      saving = true;
      try {
        const advPayload = {
          co_prov: selectedSupplier.co_prov,
          co_mone: showUSD ? "USD" : "BS",
          fecha: paymentDate,
          tasa: Number(currentExchangeRate || 1),
          monto: showUSD ? totalInstrumentosPago : totalInstrumentosPagoBs,
          descrip: (advanceDescrip || `ANTICIPO A PROVEEDOR ${selectedSupplier.descripcion || selectedSupplier.co_prov}`).trim(),
          co_cta_ingr_egr: advanceCtaIngrEgr || null,
          is_advance: true,
          advance_doc_type: advanceDocType,
          renglones: [],
          formas_pago: formas_pago_cleaned,
          retenciones_iva: [],
          retenciones_islr: [],
        };

        const res = await fetch(`/api/agent/payables/payments?branch_id=${selectedBranch}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(advPayload),
        });

        if (res.ok) {
          const resJson = await res.json();
          const docNum = resJson.data?.doc_num || resJson.doc_num || resJson.results?.[0]?.doc_num;
          const advDoc = resJson.data?.advance_doc || resJson.advance_doc || null;
          const movBan = resJson.data?.mov_ban || resJson.mov_ban || null;
          if (resJson.success && docNum) {
            generatedDocNum = docNum;
            generatedAdvanceDoc = advDoc;
            generatedMovBan = movBan;
            saveSuccess = true;
            toast.success(
              advDoc
                ? `¡Anticipo ${advDoc.co_tipo_doc} ${advDoc.nro_doc} y Pago ${docNum} registrados exitosamente!`
                : `¡Anticipo ${docNum} registrado exitosamente!`
            );
          } else {
            toast.error(resJson.message || resJson.error || "Error al procesar el anticipo en el agente.");
          }
        } else {
          const errJson = await res.json().catch(() => ({}));
          toast.error(errJson.message || errJson.error || `Error del servidor: ${res.status}`);
        }
      } catch (e: any) {
        console.error("Error guardando anticipo:", e);
        toast.error(`Error inesperado: ${e.message}`);
      } finally {
        saving = false;
        confirmedMovCta = false;
        confirmedAjpa = false;
      }
      return;
    }

    const selectedDocsList = documentos.filter((d) => checkedDocs[docKey(d)]);
    if (selectedDocsList.length === 0) {
      toast.error("Debe seleccionar al menos un documento a pagar.");
      return;
    }

    if (!hasPaymentSurplus && totalInstrumentosPagoBs === 0 && totalRetenidoIvaBs === 0 && totalRetenidoIslrBs === 0 && totalTimbreFiscalBs === 0 && creditoNcAplicadoBs === 0) {
      toast.error("Debe ingresar un monto a pagar o aplicar al menos una retención (IVA, ISLR o 1x1000).");
      return;
    }

    if (!hasPaymentSurplus && totalInstrumentosPagoBs > 0 && diferenciaCuadreBs !== 0) {
      toast.error("El monto abonado en facturas debe coincidir exactamente con los instrumentos de pago.");
      return;
    }

    saving = true;

    try {
      const firstParent = selectedDocsList.find((d) =>
        ["FACT", "NDEB", "N/DB", "GIRO"].includes(d.co_tipo_doc.trim().toUpperCase())
      );
      const parentDocNo = firstParent ? firstParent.nro_doc.trim() : null;

      let totalDocBs = 0;
      const renglones = selectedDocsList.map((doc) => {
        const k = docKey(doc);
        const inp = docInputs[k];
        const isParent = ["FACT", "NDEB", "N/DB", "GIRO"].includes(doc.co_tipo_doc.trim().toUpperCase());
        const retIvaBs = (!inp.yaTieneRetIva && inp.showIvaDetails) ? (inp.reten_iva_bs || 0) : 0;
        const retIslrBs = (!inp.yaTieneRetIslr && inp.showIslrDetails) ? (inp.reten_islr_bs || 0) : 0;
        const retTimbreBs = isNcDoc(doc) ? 0 : getDocTimbreFiscal(doc).timbreBs;

        let montCobBs;
        if (isNcDoc(doc)) {
          const allocBs = creditAllocations[k]?.appliedBs ?? 0;
          montCobBs = -allocBs;
        } else {
          montCobBs = inp.mont_cob_bs || 0;
        }

        totalDocBs += montCobBs;

        return {
          co_tipo_doc: doc.co_tipo_doc.trim(),
          nro_doc: doc.nro_doc.trim(),
          nro_fact: doc.nro_fact ? doc.nro_fact.trim() : doc.nro_doc.trim(),
          mont_cob: montCobBs,
          monto_retencion_iva: retIvaBs,
          monto_retencion: retIslrBs,
          monto_timbre_bs: retTimbreBs,
          num_comprobante_iva: (inp.num_comprobante_iva || "").trim(),
          parent_doc: !isParent ? parentDocNo : null,
        };
      });

      // Retenciones de IVA (solo nuevas)
      const retenciones_iva = selectedDocsList
        .filter((doc) => {
          const inp = docInputs[docKey(doc)];
          return inp && !inp.yaTieneRetIva && inp.showIvaDetails && inp.reten_iva_bs > 0;
        })
        .map((doc) => {
          const inp = docInputs[docKey(doc)];
          const tipoUpper = (doc.co_tipo_doc || '').trim().toUpperCase();
          const isNcOrNd = ['N/CR', 'NCR', 'N/DB', 'NDEB'].includes(tipoUpper);
          const affectedDocNo = isNcOrNd
            ? ((doc.nro_fact_afectado || doc.nro_orig || '0').trim() || '0')
            : '0';
          const exentoMonto = Number(doc.monto_exento || 0);
          return {
            nro_doc_asoc: doc.nro_doc.trim(),
            rif_comprador: selectedSupplier.rif || doc.rif,
            numero_documento: doc.nro_fact ? doc.nro_fact.trim() : doc.nro_doc.trim(),
            numero_control_documento: doc.n_control ? doc.n_control.trim() : "",
            numero_documento_afectado: affectedDocNo,
            monto_documento: doc.total_neto,
            base_imponible: inp.base_imponible_iva_bs || Math.max(0, Number(doc.total_neto || 0) - Number(doc.monto_imp || 0) - exentoMonto),
            monto_ret_imp: inp.reten_iva_bs,
            num_comprobante: (inp.num_comprobante_iva || "").trim(),
            monto_excento: exentoMonto,
            alicuota: inp.alicuota_iva != null ? inp.alicuota_iva : 16,
          };
        });

      // Retenciones de ISLR (soporta múltiples conceptos por documento)
      const retenciones_islr = [];
      selectedDocsList
        .filter((doc) => {
          const inp = docInputs[docKey(doc)];
          return inp && !inp.yaTieneRetIslr && inp.showIslrDetails && ((inp.reten_islr_bs || 0) > 0 || (inp.islr_lines?.length || 0) > 0);
        })
        .forEach((doc) => {
          const inp = docInputs[docKey(doc)];
          const lines = (inp.islr_lines && inp.islr_lines.length > 0)
            ? inp.islr_lines
            : [{
                co_islr: inp.co_islr || "055",
                base_imponible_islr_bs: inp.base_imponible_islr_bs,
                reten_islr_bs: inp.reten_islr_bs,
                porc_islr: inp.porc_islr || 2,
                sustraendo_islr_bs: inp.sustraendo_islr_bs || 0
              }];

          lines.forEach((l) => {
            if ((l.reten_islr_bs || 0) > 0 || (l.base_imponible_islr_bs || 0) > 0) {
              retenciones_islr.push({
                nro_doc_asoc: doc.nro_doc.trim(),
                co_islr: l.co_islr || "055",
                monto_obj: l.base_imponible_islr_bs || (doc.total_neto - doc.monto_imp),
                monto_reten: l.reten_islr_bs || 0,
                porc_retn: l.porc_islr || 2,
                sustraendo: Number(l.sustraendo_islr_bs || 0),
              });
            }
          });
        });

      const firstDoc = selectedDocsList[0];
      const docMone = (firstDoc?.co_mone || "").trim().toUpperCase();
      const safeCurrency = !docMone || ["BS", "VES", "BS.", "BOL"].includes(docMone) ? "BS" : docMone;

      const payload = {
        co_prov: selectedSupplier.co_prov,
        co_mone: safeCurrency,
        fecha: paymentDate,
        tasa: Number(currentExchangeRate || 1),
        monto: Math.max(0, Math.round(totalDocBs * 100) / 100),
        descrip: `PAGO PROVEEDOR ${selectedSupplier.co_prov}`,
        co_cta_ingr_egr: paymentCtaIngrEgr || null,
        renglones,
        formas_pago: formas_pago_cleaned,
        retenciones_iva,
        retenciones_islr,
        timbre_fiscal: (aplicarTimbreFiscal || totalTimbreFiscalBs > 0) && totalTimbreFiscalBs > 0 ? {
          aplicar: true,
          alicuota: 0.001,
          base_imponible_bs: totalBaseTimbreBs,
          monto_bs: totalTimbreFiscalBs,
          monto_usd: totalTimbreFiscalUsd,
        } : null,
        ajuste_diferencia: hasPaymentSurplus ? {
          tipo: 'AJPA',
          monto_usd: excedentePagoUsd,
          monto_bs: excedentePagoBs,
        } : null,
      };

      const res = await fetch(`/api/agent/payables/payments?branch_id=${selectedBranch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const resJson = await res.json();
        const docNum = resJson.data?.doc_num || resJson.doc_num || resJson.results?.[0]?.doc_num;
        const advDoc = resJson.data?.advance_doc || resJson.advance_doc || null;
        const movBan = resJson.data?.mov_ban || resJson.mov_ban || null;
        if (resJson.success && docNum) {
          generatedDocNum = docNum;
          generatedAdvanceDoc = advDoc;
          generatedMovBan = movBan;
          saveSuccess = true;
          showAjpaConfirmModal = false;
          confirmedAjpa = false;
          const isRetentionOnly = totalInstrumentosPagoBs === 0 && (totalRetenidoIvaBs > 0 || totalRetenidoIslrBs > 0);
          toast.success(
            hasPaymentSurplus
              ? `¡Pago ${docNum} y AJPA por excedente generados exitosamente!`
              : isRetentionOnly
                ? `¡Comprobante de retención ${docNum} generado exitosamente!`
                : `¡Pago ${docNum} generado exitosamente!`
          );
        } else {
          toast.error(resJson.message || resJson.error || "Error al procesar el pago en el agente.");
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        toast.error(errJson.message || errJson.error || `Error del servidor: ${res.status}`);
      }
    } catch (e: any) {
      console.error("Error guardando pago:", e);
      toast.error(`Error inesperado: ${e.message}`);
    } finally {
      saving = false;
      confirmedMovCta = false;
      confirmedAjpa = false;
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
          {paymentMode === "advance" ? "Registrar Anticipo a Proveedor" : "Registrar Pago a Proveedor"}
        </h1>
        <p class="text-sm text-text-muted font-medium">
          {paymentMode === "advance"
            ? "Emisión de anticipo directo con movimiento bancario o de caja y saldo a favor en Profit Plus"
            : "Emisión de pagos a cuentas por pagar con cruce de anticipos y retenciones de IVA e ISLR"}
        </p>
      </div>
    </div>
  </div>

  <div class="flex flex-wrap items-center gap-3 w-full lg:w-auto">
    <!-- Selector de Modo: Pagar Documentos vs Registrar Anticipo -->
    <div class="flex bg-surface-strong p-1 rounded-2xl border border-border-subtle shadow-sm">
      <button
        type="button"
        onclick={() => switchPaymentMode("documents")}
        class={`px-4 h-12 rounded-xl text-xs font-black transition-all cursor-pointer ${paymentMode === "documents" ? "bg-brand-600 text-white shadow-md" : "text-text-muted hover:text-text-base"}`}
      >
        Pagar Documentos
      </button>
      <button
        type="button"
        onclick={() => switchPaymentMode("advance")}
        class={`px-4 h-12 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${paymentMode === "advance" ? "bg-emerald-600 text-white shadow-md" : "text-text-muted hover:text-text-base"}`}
      >
        <Plus size={14} />
        Registrar Anticipo
      </button>
    </div>

    <!-- Selector de Fecha de Pago -->
    <div class="relative w-full sm:w-auto">
      <input
        type="date"
        bind:value={paymentDate}
        class="h-14 px-4 bg-surface-strong border border-border-subtle rounded-2xl text-text-base font-bold text-sm outline-none focus:border-brand-500 transition-all cursor-pointer w-full sm:w-44 shadow-sm"
        title="Fecha del pago / emisión de retención"
      />
    </div>

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

    {#if paymentMode === "advance"}
      <button
        type="button"
        onclick={openSupplierSearchModal}
        class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto text-sm"
      >
        <Search size={18} />
        Buscar Proveedor
      </button>
    {:else}
      <!-- Botón Importar Factura de Compra -->
      <button
        onclick={openImportModal}
        class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-600 dark:text-brand-400 border border-brand-500/30 transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto text-sm"
      >
        <ShoppingBag size={18} />
        Importar Factura
      </button>
    {/if}

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
      <h2 class="text-3xl font-black text-text-base">
        {generatedAdvanceDoc ? "¡Anticipo Registrado!" : "¡Pago Registrado!"}
      </h2>
      <p class="text-text-muted">
        {generatedAdvanceDoc
          ? "El anticipo a proveedor y su documento de saldo a favor fueron guardados en Profit Plus."
          : "El pago a proveedor ha sido guardado exitosamente en Profit Plus."}
      </p>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
      <div class="bg-white/5 px-6 py-4 rounded-2xl border border-white/5 {(!generatedAdvanceDoc && !generatedMovBan) ? 'sm:col-span-2' : ''}">
        <span class="text-xs text-text-muted/60 uppercase font-bold tracking-wider"
          >Documento de Pago Generado</span
        >
        <div class="text-2xl font-black text-brand-500 mt-1 font-mono">
          {generatedDocNum}
        </div>
      </div>
      {#if generatedAdvanceDoc}
        <div class="bg-emerald-500/10 px-6 py-4 rounded-2xl border border-emerald-500/20">
          <span class="text-xs text-emerald-400/80 uppercase font-bold tracking-wider"
            >Documento de Anticipo</span
          >
          <div class="text-xl font-black text-emerald-400 mt-1 font-mono">
            {generatedAdvanceDoc.co_tipo_doc} {generatedAdvanceDoc.nro_doc}
          </div>
        </div>
      {/if}
      {#if generatedMovBan}
        <div class="sm:col-span-2 bg-cyan-500/10 px-6 py-3 rounded-2xl border border-cyan-500/20 flex items-center justify-between">
          <span class="text-xs text-cyan-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
            <Landmark size={14} /> Movimiento Bancario (PAG)
          </span>
          <span class="text-base font-black text-cyan-400 font-mono">{generatedMovBan}</span>
        </div>
      {/if}
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
        {generatedAdvanceDoc ? "Registrar Otro" : "Registrar Otro Pago"}
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
          <div class="flex items-center gap-3">
            {#if paymentMode === "advance"}
              <button
                type="button"
                onclick={openSupplierSearchModal}
                class="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
              >
                <Search size={13} />
                {selectedSupplier ? "Buscar Otro" : "Seleccionar Proveedor"}
              </button>
            {/if}
            {#if selectedSupplier}
              <button
                onclick={clearSupplier}
                class="text-xs text-text-muted hover:text-red-400 font-bold flex items-center gap-1 cursor-pointer"
              >
                <X size={14} />
                Limpiar
              </button>
            {/if}
          </div>
        </div>

        {#if !selectedSupplier}
          <div
            class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-3"
          >
            <Building size={32} class="text-text-muted/30" />
            <p class="text-xs text-text-muted font-bold max-w-md">
              {#if paymentMode === "advance"}
                Selecciona el proveedor al cual entregarás el anticipo sin necesidad de factura previa.
              {:else}
                No hay ningún proveedor seleccionado. Haz clic en "Importar Factura" para cargar sus deudas y anticipos disponibles.
              {/if}
            </p>
            {#if paymentMode === "advance"}
              <button
                type="button"
                onclick={openSupplierSearchModal}
                class="px-5 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                <Search size={14} />
                Buscar Proveedor
              </button>
            {/if}
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
            {#if paymentMode === "documents"}
              <div class="md:col-span-3 pt-2 border-t border-border-subtle/50 flex flex-wrap items-center justify-between gap-3">
                <label class="inline-flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    bind:checked={aplicarTimbreFiscal}
                    onchange={() => recalculateAllDocAmounts()}
                    class="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                  />
                  <span class="text-xs font-bold text-indigo-400">
                    Aplicar Retención Timbre Fiscal 1x1000 (0,1%)
                  </span>
                </label>
                {#if totalTimbreFiscalBs > 0}
                  <span class="text-xs font-mono font-bold text-indigo-400">
                    - Bs. {totalTimbreFiscalBs.toLocaleString("de-DE", { minimumFractionDigits: 2 })} (${totalTimbreFiscalUsd.toLocaleString("de-DE", { minimumFractionDigits: 2 })})
                  </span>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      {#if paymentMode === "advance"}
        <!-- CONFIGURACIÓN DE ANTICIPO DIRECTO -->
        <div class="glass p-6 rounded-3xl border border-emerald-500/20 shadow-xl space-y-5 bg-emerald-500/[0.02]">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
              <Landmark size={16} />
              Configuración del Anticipo Directo
            </h3>
            <span class="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Sin factura previa
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label for="adv_tipo_doc" class="text-[10px] font-black uppercase text-text-muted block mb-1.5">
                Tipo de Documento en Profit Plus *
              </label>
              <select
                id="adv_tipo_doc"
                bind:value={advanceDocType}
                class="w-full h-12 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-bold text-text-base focus:border-emerald-500 outline-none cursor-pointer"
              >
                <option value="ADEL">ADEL - Adelanto Compra (Serie C007 • Recomendado)</option>
                <option value="AJPA">AJPA - Ajuste Positivo Automático (Serie C010)</option>
                <option value="AJNM">AJNM - Ajuste Negativo Manual (Serie C009)</option>
              </select>
            </div>

            <div>
              <label for="adv_cta_ie" class="text-[10px] font-black uppercase text-text-muted block mb-1.5">
                Cuenta de Ingreso / Egreso
              </label>
              <select
                id="adv_cta_ie"
                bind:value={advanceCtaIngrEgr}
                class="w-full h-12 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-medium text-text-base focus:border-emerald-500 outline-none cursor-pointer"
              >
                <option value="">(Preguntar al guardar)</option>
                {#each (data.cuentasIngrEgr || []) as cta}
                  <option value={cta.co_cta_ingr_egr?.trim()}>
                    {cta.co_cta_ingr_egr?.trim()} - {cta.descrip?.trim()}
                  </option>
                {/each}
              </select>
            </div>

            <div class="md:col-span-2">
              <label for="adv_descrip" class="text-[10px] font-black uppercase text-text-muted block mb-1.5">
                Descripción / Concepto del Anticipo
              </label>
              <input
                id="adv_descrip"
                type="text"
                maxlength="120"
                bind:value={advanceDescrip}
                placeholder="Ej: Anticipo por compra de materiales / honorarios..."
                class="w-full h-12 px-4 bg-surface-soft border border-border-subtle rounded-xl text-sm font-medium text-text-base focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          <div class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-start gap-3">
            <Info size={18} class="text-emerald-400 shrink-0 mt-0.5" />
            <div class="space-y-1">
              <p class="font-bold text-text-base">Creación atómica en Profit Plus</p>
              <p class="text-text-muted leading-relaxed">
                Al guardar, se registrará el Pago (<code>saPago</code>), el movimiento bancario o de caja por el monto ingresado (actualizando <code>saSaldoBanco</code> con origen <code>PAG</code>) y el documento <strong>{advanceDocType}</strong> con el 100% de su saldo disponible para cruzarlo posteriormente contra facturas del proveedor.
              </p>
            </div>
          </div>
        </div>
      {:else}
        <!-- FACTURAS Y DOCUMENTOS DE COMPRA -->
        <div
          class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-4"
        >
          <div class="flex items-center justify-between">
            <h3
              class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2"
            >
              <Receipt size={16} />
              Facturas, Anticipos y Documentos
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
                Las facturas, notas de crédito y anticipos con saldo aparecerán aquí una vez seleccionado un proveedor.
              </p>
            </div>
          {:else if loadingDocs}
            <div
              class="p-12 flex flex-col items-center justify-center gap-4 text-center"
            >
              <RefreshCw size={32} class="animate-spin text-brand-500" />
              <p class="text-sm font-bold text-text-muted">
                Cargando documentos pendientes del proveedor...
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
                No hay facturas, anticipos ni notas con saldo pendiente para este proveedor en esta sede.
              </p>
            </div>
          {:else}
            <!-- Acordeón / Listado de Documentos con Saldo -->
            <div class="space-y-4">
              {#each documentos as doc (docKey(doc))}
                {@const k = docKey(doc)}
                {@const input = docInputs[k]}
                {@const isCredit = isNcDoc(doc)}
                {@const isAdv = isAdvanceDoc(doc)}
                {@const docBadge = getDocTypeBadge(doc.co_tipo_doc)}
                {@const alloc = creditAllocations[k]}
                {#if input}
                  <div
                    class="bg-surface-soft/20 rounded-2xl border p-5 transition-all space-y-4 {checkedDocs[k] && isCredit ? 'border-emerald-500/40 bg-emerald-500/[0.03]' : 'border-border-subtle hover:border-white/10'}"
                  >
                    <!-- Fila Superior -->
                    <div
                      class="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div class="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checkedDocs[k]}
                          onchange={(e) =>
                            toggleDocSelection(
                              k,
                              doc,
                              e.currentTarget.checked,
                            )}
                          class="w-5 h-5 rounded-lg border-border-subtle bg-surface-soft text-brand-500 focus:ring-brand-500 focus:ring-offset-0 cursor-pointer mt-1"
                        />
                        <div>
                          <div class="flex flex-wrap items-center gap-2">
                            <span
                              class="bg-white/5 border border-white/5 px-2 py-0.5 rounded-md font-bold text-xs text-text-muted uppercase"
                              >{doc.co_tipo_doc}</span
                            >
                            <span class="font-black text-text-base text-base font-mono"
                              >{doc.nro_doc}</span
                            >
                            <span class={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${docBadge.class}`}>
                              {docBadge.label}
                            </span>
                            {#if doc.nro_fact && doc.nro_fact.trim() !== doc.nro_doc.trim()}
                              <span class="text-xs bg-brand-500/10 text-brand-400 font-bold px-2 py-0.5 rounded-md">
                                Fact. Prov: {doc.nro_fact}
                              </span>
                            {/if}
                            {#if doc.mov_ban}
                              <span class="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold px-2 py-0.5 rounded-md font-mono">
                                Mov. Banco: {doc.mov_ban}
                              </span>
                            {/if}
                          </div>
                          {#if isAdv && doc.observa}
                            <p class="text-xs font-semibold text-emerald-400/90 mt-1">
                              {doc.observa}
                            </p>
                          {/if}
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
                          >{isCredit ? "Saldo a Favor" : "Saldo Pendiente"}</span
                        >
                        <span class="text-lg font-black {isCredit ? 'text-emerald-400' : 'text-brand-500'}">
                          {#if isCredit}-{/if}$ {toUsd(doc.saldo).toLocaleString("de-DE", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <span
                          class="block text-xs {isCredit ? 'text-emerald-400/80' : 'text-text-muted'} font-bold mt-1"
                        >
                          Bs. {#if isCredit}-{/if}{r2(doc.saldo).toLocaleString("de-DE", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        {#if isCredit && checkedDocs[k] && alloc}
                          {#if alloc.isPartial}
                            <span
                              class="inline-block text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-full font-bold mt-1.5"
                            >
                              {showUSD
                                ? `Aplica: -$${alloc.appliedUsd.toFixed(2)} | Queda disponible: +$${alloc.remainingUsd.toFixed(2)}`
                                : `Aplica: -Bs. ${alloc.appliedBs.toFixed(2)} | Queda disponible: +Bs. ${alloc.remainingBs.toFixed(2)}`}
                            </span>
                          {:else if alloc.appliedBs > 0.005}
                            <span
                              class="inline-block text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full font-bold mt-1.5"
                            >
                              {showUSD
                                ? `Aplica: -$${alloc.appliedUsd.toFixed(2)} (Total)`
                                : `Aplica: -Bs. ${alloc.appliedBs.toFixed(2)} (Total)`}
                            </span>
                          {:else}
                            <span
                              class="inline-block text-[10px] bg-blue-500/15 text-blue-300 border border-blue-500/40 px-2.5 py-0.5 rounded-full font-bold mt-1.5"
                            >
                              {showUSD
                                ? `Sin aplicar • Disponible: +$${alloc.remainingUsd.toFixed(2)}`
                                : `Sin aplicar • Disponible: +Bs. ${alloc.remainingBs.toFixed(2)}`}
                            </span>
                          {/if}
                        {/if}
                      </div>
                    </div>

                    <!-- Detalle de Abonos, Prorrateo de Anticipos y Retenciones -->
                    {#if checkedDocs[k]}
                      <div
                        class="border-t border-border-subtle/50 pt-4 space-y-4 transition-all duration-200"
                      >
                        {#if isCredit && alloc}
                          {#if alloc.appliedBs <= 0.005}
                            <div class="bg-blue-500/10 border border-blue-500/30 p-4 rounded-2xl text-xs space-y-1.5">
                              <div class="flex items-center justify-between">
                                <span class="font-bold text-blue-300 flex items-center gap-1.5">
                                  <Info size={16} class="text-blue-400 shrink-0" />
                                  {isAdv ? "Anticipo disponible aún no consumido" : "Nota de Crédito sin consumo"}
                                </span>
                                <span class="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-500/40">
                                  Sin Aplicar
                                </span>
                              </div>
                              <p class="text-text-muted leading-relaxed">
                                Marca una o más facturas del proveedor en esta pantalla para cruzarlas contra este saldo a favor. Mientras tanto, su saldo (+Bs. {r2(doc.saldo).toLocaleString("de-DE", { minimumFractionDigits: 2 })}) permanecerá intacto en Profit Plus.
                              </p>
                            </div>
                          {:else if alloc.isPartial}
                            <div class="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl text-xs space-y-3">
                              <div class="flex items-center justify-between">
                                <span class="font-bold text-amber-300 flex items-center gap-1.5">
                                  <AlertCircle size={16} class="text-amber-400 shrink-0" />
                                  Prorrateo Automático (Rebaja únicamente el saldo consumido)
                                </span>
                                <span class="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40">
                                  Consumo Parcial
                                </span>
                              </div>
                              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                <div class="bg-surface-base/80 p-3.5 rounded-xl border border-border-subtle">
                                  <span class="block text-[10px] text-text-muted uppercase font-black tracking-wider">Aplica a Facturas en este Pago:</span>
                                  <span class="text-base font-black text-emerald-400 font-mono block mt-0.5">
                                    -$ {alloc.appliedUsd.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  <span class="block text-xs text-text-muted font-bold mt-0.5">
                                    -Bs. {alloc.appliedBs.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <div class="bg-surface-base/80 p-3.5 rounded-xl border border-amber-500/30">
                                  <span class="block text-[10px] text-amber-300 uppercase font-black tracking-wider">Queda Disponible para Futuros Pagos:</span>
                                  <span class="text-base font-black text-amber-300 font-mono block mt-0.5">
                                    +$ {alloc.remainingUsd.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  <span class="block text-xs text-text-muted font-bold mt-0.5">
                                    +Bs. {alloc.remainingBs.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          {:else}
                            <div class="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-2xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div class="flex items-center gap-2">
                                <CheckCircle size={16} class="text-emerald-400 shrink-0" />
                                <span class="font-bold text-emerald-300">
                                  {isAdv ? "Anticipo consumido en su totalidad contra las facturas seleccionadas" : "Nota de Crédito aplicada en su totalidad"}
                                </span>
                              </div>
                              <span class="font-mono font-black text-emerald-400">
                                -$ {alloc.appliedUsd.toLocaleString("de-DE", { minimumFractionDigits: 2 })} (Bs. {alloc.appliedBs.toLocaleString("de-DE", { minimumFractionDigits: 2 })})
                              </span>
                            </div>
                          {/if}
                        {/if}

                        {#if !isAdv}
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
                                    recalculateDocAmounts(k, doc);
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
                                      for (const l of input.islr_lines || []) {
                                        l.manual_override_islr = false;
                                      }
                                      const currentTab = getEffectiveSupplierTab();
                                      const allList = data.conceptosIslr || [];
                                      const found = allList.find((c: any) => 
                                        String(c.co_tab || '').trim() === currentTab && 
                                        String(c.co_islr || '').trim() === String(input.co_islr || '').trim()
                                      ) || allList.find((c: any) => String(c.co_islr || '').trim() === String(input.co_islr || '').trim());
                                      if (found) {
                                        const { porcRet, porcImp, sustraen } = resolveConceptValues(found, String(input.co_islr || '').trim(), currentTab);
                                        input.porc_islr = porcRet;
                                        input.porc_base_islr = porcImp;
                                        input.sustraendo_islr_bs = sustraen;
                                      }
                                    }
                                    recalculateDocAmounts(k, doc);
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
                                  recalculateDocAmounts(k, doc);
                                }}
                                class="text-text-muted hover:text-text-base cursor-pointer"
                                ><X size={14} /></button
                              >
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
                              <div>
                                <div class="flex items-center justify-between mb-1">
                                  <span class="text-[9px] text-text-muted font-bold"
                                    >NRO. COMPROBANTE</span
                                  >
                                  {#if input.num_comprobante_iva?.trim()}
                                    <span class="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                                      Manual / Antiguo
                                    </span>
                                  {:else}
                                    <span class="text-[9px] font-normal text-text-muted">
                                      (Vacío = Auto)
                                    </span>
                                  {/if}
                                </div>
                                <input
                                  type="text"
                                  placeholder="Auto-generar o ingresar manual"
                                  bind:value={input.num_comprobante_iva}
                                  title="Deja vacío para auto-asignar el siguiente correlativo fiscal, o ingresa el número de comprobante antiguo/manual (ej: 20240100004140)."
                                  class="w-full bg-surface-soft border px-2 py-1.5 rounded-lg text-xs font-mono transition-colors {input.num_comprobante_iva?.trim() ? 'border-amber-500/50 text-amber-300 font-semibold focus:border-amber-400' : 'border-border-subtle text-text-base focus:border-brand-500'}"
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
                                    recalculateDocAmounts(k, doc);
                                  }}
                                  class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs"
                                >
                                  <option value={75}>75% (General)</option>
                                  <option value={100}>100% (Total)</option>
                                </select>
                              </div>
                              <div>
                                <div class="flex items-center justify-between gap-1 mb-1">
                                  <span class="text-[9px] font-bold font-semibold text-green-400"
                                    >MTO RETENIDO (Bs.)</span
                                  >
                                  {#if allowEditableRetentions}
                                    <button
                                      type="button"
                                      onclick={() => openRetentionAuthModal("IVA", doc)}
                                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/30 text-[9px] font-bold transition-colors cursor-pointer"
                                      title="Autorizar edición manual del monto retenido de IVA"
                                    >
                                      <KeyRound size={10} />
                                      Editar
                                    </button>
                                  {/if}
                                </div>
                                <input
                                  type="number"
                                  step="0.01"
                                  readonly
                                  value={input.reten_iva_bs}
                                  class="w-full bg-surface-soft/60 border border-border-subtle text-green-400 font-bold px-2 py-1.5 rounded-lg text-xs text-right cursor-not-allowed opacity-90"
                                />
                                {#if input.manual_override_iva && input.authorized_iva_by}
                                  <span class="block text-[9px] text-amber-400 font-semibold mt-0.5 truncate">
                                    Autorizado por: {input.authorized_iva_by}
                                  </span>
                                {/if}
                              </div>
                            </div>
                          </div>
                        {/if}

                        <!-- Detalles Retención ISLR (Soporte Multi-concepto) -->
                        {#if input.showIslrDetails && !input.yaTieneRetIslr}
                          {@const docTotalBaseBs = getDocBaseBs(doc)}
                          {@const totalLineasBaseBs = (input.islr_lines || []).reduce((sum, l) => sum + (Number(l.base_imponible_islr_bs) || 0), 0)}
                          {@const difBaseBs = r2(docTotalBaseBs - totalLineasBaseBs)}
                          <div
                            class="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl space-y-3 text-xs animate-in slide-in-from-top-2 duration-150"
                          >
                            <div class="flex justify-between items-center flex-wrap gap-2">
                              <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-bold text-amber-300"
                                  >Conceptos Retención ISLR ({getTabDescription(getEffectiveSupplierTab())})</span
                                >
                                <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
                                  Base Total: Bs. {docTotalBaseBs.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                                </span>
                                {#if Math.abs(difBaseBs) > 0.05}
                                  <button
                                    type="button"
                                    onclick={() => {
                                      if (difBaseBs > 0) {
                                        const targetIdx = (input.islr_lines || []).findIndex((l) => (Number(l.base_imponible_islr_bs) || 0) === 0);
                                        assignRemainingBaseToLine(k, doc, targetIdx !== -1 ? targetIdx : (input.islr_lines?.length || 1) - 1);
                                      }
                                    }}
                                    class="text-[10px] px-2 py-0.5 rounded-full {difBaseBs > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 cursor-pointer' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'} font-semibold transition-colors"
                                    title={difBaseBs > 0 ? "Haz clic para asignar el restante" : ""}
                                  >
                                    {difBaseBs > 0 ? `Por asignar: Bs. ${difBaseBs.toLocaleString('de-DE', { minimumFractionDigits: 2 })} (clic para asignar)` : `Exceso base: Bs. ${Math.abs(difBaseBs).toLocaleString('de-DE', { minimumFractionDigits: 2 })}`}
                                  </button>
                                {/if}
                              </div>
                              <button
                                type="button"
                                onclick={() => {
                                  input.showIslrDetails = false;
                                  input.reten_islr_bs = 0;
                                  input.reten_islr = 0;
                                  input.manual_override_islr = true;
                                  recalculateDocAmounts(k, doc);
                                }}
                                class="text-text-muted hover:text-text-base cursor-pointer"
                                ><X size={14} /></button
                              >
                            </div>

                            <!-- Lista dinámica de conceptos ISLR aplicados -->
                            {#if !input.islr_lines || input.islr_lines.length === 0}
                              {@const _ = ensureIslrLines(input, doc)}
                            {/if}

                            <div class="space-y-2">
                              {#each (input.islr_lines || []) as line, lineIdx (line.id || lineIdx)}
                                <div class="p-2.5 rounded-xl bg-surface-soft border border-border-subtle grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                                  <div class="sm:col-span-5">
                                    <span class="text-[9px] text-text-muted font-bold block mb-1">CONCEPTO #{lineIdx + 1}</span>
                                    <select
                                      value={line.co_islr}
                                      onchange={(e) => {
                                        const selectedCode = (e.currentTarget as HTMLSelectElement).value;
                                        handleLineConceptChange(k, doc, lineIdx, selectedCode);
                                      }}
                                      class="w-full bg-surface-base border border-border-subtle px-2 py-1.5 rounded-lg text-xs"
                                    >
                                      {#each getConceptosForSupplier() as c}
                                        {@const cVals = resolveConceptValues(c, c.co_islr.trim(), getEffectiveSupplierTab())}
                                        <option value={c.co_islr.trim()}>
                                          {c.co_islr.trim()} - {c.islr_des.trim()} ({cVals.porcRet}%{cVals.sustraen > 0 ? ` - Sustr: Bs. ${cVals.sustraen}` : ''})
                                        </option>
                                      {/each}
                                    </select>
                                  </div>
                                  <div class="sm:col-span-3">
                                    <div class="flex justify-between items-center mb-1 flex-wrap gap-1">
                                      <span class="text-[9px] text-text-muted font-bold block">BASE IMPONIBLE (Bs.)</span>
                                      <div class="flex items-center gap-1.5">
                                        {#if (Number(line.base_imponible_islr_bs) || 0) === 0 && difBaseBs > 0}
                                          <button
                                            type="button"
                                            title="Asignar el remanente no cubierto a este concepto"
                                            onclick={() => assignRemainingBaseToLine(k, doc, lineIdx)}
                                            class="text-[9px] font-bold text-amber-500 hover:text-amber-400 underline cursor-pointer"
                                          >
                                            + Remanente
                                          </button>
                                        {/if}
                                        {#if Math.abs((Number(line.base_imponible_islr_bs) || 0) - docTotalBaseBs) > 0.01}
                                          <button
                                            type="button"
                                            title="Colocar la base total de la factura a este concepto"
                                            onclick={() => setLineToFullBase(k, doc, lineIdx)}
                                            class="text-[9px] font-semibold text-text-muted hover:text-amber-400 cursor-pointer"
                                          >
                                            Base total
                                          </button>
                                        {/if}
                                      </div>
                                    </div>
                                    <input
                                      type="number"
                                      step="0.01"
                                      bind:value={line.base_imponible_islr_bs}
                                      oninput={() => {
                                        line.manual_override_islr = false;
                                        input.manual_override_islr = false;
                                        recalculateDocAmounts(k, doc);
                                      }}
                                      class="w-full bg-surface-base border border-border-subtle px-2 py-1.5 rounded-lg text-xs text-right font-mono"
                                    />
                                  </div>
                                  <div class="sm:col-span-1">
                                    <span class="text-[9px] text-text-muted font-bold block mb-1">% RET.</span>
                                    <input
                                      type="number"
                                      step="0.1"
                                      bind:value={line.porc_islr}
                                      oninput={() => {
                                        line.manual_override_islr = false;
                                        input.manual_override_islr = false;
                                        recalculateDocAmounts(k, doc);
                                      }}
                                      class="w-full bg-surface-base border border-border-subtle px-1.5 py-1.5 rounded-lg text-xs text-right font-mono"
                                    />
                                  </div>
                                  <div class="sm:col-span-2">
                                    <div class="flex items-center justify-between gap-1 mb-1">
                                      <span class="text-[9px] font-bold font-semibold text-amber-400">RETENIDO (Bs.)</span>
                                      {#if allowEditableRetentions}
                                        <button
                                          type="button"
                                          onclick={() => openRetentionAuthModal("ISLR", doc, lineIdx)}
                                          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/30 text-[9px] font-bold transition-colors cursor-pointer"
                                          title="Autorizar edición manual del monto retenido de ISLR"
                                        >
                                          <KeyRound size={10} />
                                          Editar
                                        </button>
                                      {/if}
                                    </div>
                                    <input
                                      type="number"
                                      step="0.01"
                                      readonly
                                      value={line.reten_islr_bs}
                                      class="w-full bg-surface-soft/60 border border-border-subtle px-2 py-1.5 rounded-lg text-xs text-right text-amber-400 font-bold cursor-not-allowed opacity-90 font-mono"
                                    />
                                    {#if line.manual_override_islr && line.authorized_by}
                                      <span class="block text-[9px] text-amber-400 font-semibold mt-0.5 truncate">
                                        Autorizado por: {line.authorized_by}
                                      </span>
                                    {/if}
                                  </div>
                                  <div class="sm:col-span-1 flex justify-center pt-2 sm:pt-0">
                                    {#if (input.islr_lines?.length || 0) > 1}
                                      <button
                                        type="button"
                                        title="Eliminar este concepto"
                                        onclick={() => removeIslrConceptLine(k, doc, lineIdx)}
                                        class="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    {/if}
                                  </div>
                                </div>
                              {/each}
                            </div>

                            <div class="flex items-center justify-between pt-1 flex-wrap gap-2">
                              <button
                                type="button"
                                onclick={() => addIslrConceptLine(k, doc)}
                                class="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 cursor-pointer"
                              >
                                <Plus size={13} />
                                Agregar otro concepto ISLR
                              </button>

                              <div class="text-right">
                                <span class="text-[11px] text-text-muted">Total Retención ISLR:</span>
                                <strong class="text-xs font-mono font-bold text-amber-400 ml-1.5">
                                  Bs. {Number(input.reten_islr_bs || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                                </strong>
                              </div>
                            </div>

                            {#if (input.sustraendo_islr_bs || 0) > 0}
                              <div class="text-[10px] text-amber-400/90 flex items-center gap-1 font-medium bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 w-max">
                                <span>Sustraendo legal aplicado: <strong>Bs. {Number(input.sustraendo_islr_bs).toLocaleString('de-DE', { minimumFractionDigits: 2 })}</strong></span>
                              </div>
                            {/if}
                          </div>
                        {/if}
                        {/if}

                        <!-- Retención Timbre Fiscal 1x1000 por Documento -->
                        {#if !isCredit && (aplicarTimbreFiscal || input.manual_override_timbre || allowEditableRetentions)}
                          {@const docTimbre = getDocTimbreFiscal(doc)}
                          {#if docTimbre.timbreBs > 0 || allowEditableRetentions}
                            <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-indigo-500/5 border border-indigo-500/20 text-xs">
                              <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-bold text-indigo-400">Timbre Fiscal (1x1000):</span>
                                <span class="font-mono font-bold text-text-base">
                                  Bs. {docTimbre.timbreBs.toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                                </span>
                                <span class="text-text-muted text-[10px]">
                                  (${docTimbre.timbreUsd.toLocaleString("de-DE", { minimumFractionDigits: 2 })})
                                </span>
                                {#if input.manual_override_timbre && input.authorized_timbre_by}
                                  <span class="text-[10px] font-semibold text-amber-400">
                                    · Autorizado por: {input.authorized_timbre_by}
                                  </span>
                                {/if}
                              </div>
                              {#if allowEditableRetentions}
                                <button
                                  type="button"
                                  onclick={() => openRetentionAuthModal("TIMBRE", doc)}
                                  class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/30 text-[10px] font-bold transition-colors cursor-pointer"
                                  title="Autorizar edición manual del monto de Timbre Fiscal 1x1000"
                                >
                                  <KeyRound size={11} />
                                  Editar 1x1000
                                </button>
                              {/if}
                            </div>
                          {/if}
                        {/if}

                        <!-- Neto Abonado por este Documento -->
                        {#if !isCredit && input.mont_cob_bs > 0}
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
      {/if}
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
            {#if paymentMode === "advance"}
              <div class="flex justify-between items-center text-base font-bold text-text-muted">
                <span>Documento a Generar</span>
                <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                  {advanceDocType}
                </span>
              </div>
              <div class="flex justify-between items-center text-base font-bold text-text-muted border-t border-border-subtle/50 pt-4">
                <span>Movimiento de Banco / Caja</span>
                <span class="text-xs font-black text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-full">
                  Automático (Origen PAG)
                </span>
              </div>
              <div class="flex justify-between items-center text-base font-bold text-text-muted border-t border-border-subtle/50 pt-4">
                <span>Instrumentos Emitidos</span>
                <span class="font-mono text-text-base">
                  {showUSD ? "$" : "Bs."} {(showUSD ? totalInstrumentosPago : totalInstrumentosPagoBs).toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            {:else}
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
            {#if (showUSD ? totalTimbreFiscalUsd : totalTimbreFiscalBs) > 0}
              <div
                class="flex justify-between items-center text-base font-bold text-text-muted"
              >
                <span>Timbre Fiscal (1x1000)</span>
                <span class="font-mono text-indigo-400">
                  {showUSD ? "$" : "Bs."} {(showUSD ? totalTimbreFiscalUsd : totalTimbreFiscalBs).toLocaleString("de-DE", {
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
            {#if creditoNcAplicadoBs > 0}
              <div
                class="flex justify-between items-center text-base font-bold text-text-muted border-t border-border-subtle/50 pt-4"
              >
                <span class="flex items-center gap-1.5 text-emerald-400">
                  <Receipt size={16} />
                  Crédito / Anticipo Aplicado
                </span>
                <span class="font-mono text-emerald-400 font-bold">
                  - {showUSD ? "$" : "Bs."} {(showUSD ? creditoNcAplicadoUsd : creditoNcAplicadoBs).toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            {/if}
            {#if creditoNcExcedenteBs > 0}
              <div
                class="flex justify-between items-center text-xs font-bold text-text-muted border-t border-border-subtle/50 pt-3"
              >
                <span class="text-amber-400 flex items-center gap-1.5">
                  <Receipt size={14} />
                  Queda disponible en Crédito / Anticipo
                </span>
                <span class="font-mono text-amber-400 font-bold">
                  +{showUSD ? "$" : "Bs."} {(showUSD ? creditoNcExcedenteUsd : creditoNcExcedenteBs).toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            {/if}
            {#if hasPaymentSurplus}
              <div
                class="flex justify-between items-center text-base font-bold text-text-muted border-t border-border-subtle/50 pt-4"
              >
                <span class="flex items-center gap-1.5 text-blue-400">
                  <Receipt size={16} />
                  Anticipo / AJPA (A Favor)
                </span>
                <span class="font-mono text-blue-400 font-bold">
                  + {showUSD ? "$" : "Bs."} {(showUSD ? excedentePagoUsd : excedentePagoBs).toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            {/if}
            <div
              class="flex justify-between items-center text-base font-bold text-text-muted border-t border-border-subtle/50 pt-4"
            >
              <span>Diferencia de Cuadre</span>
              {#if diferenciaCuadre === 0}
                <span
                  class="text-xs font-black text-green-500 bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-full flex items-center gap-1.5 font-mono"
                >
                  <CheckCircle size={14} />
                  {hasPaymentSurplus ? "Cuadrado (con AJPA)" : "Cuadrado"}
                </span>
              {:else if totalInstrumentosPagoBs === 0 && (totalRetenidoIvaBs > 0 || totalRetenidoIslrBs > 0 || totalTimbreFiscalBs > 0)}
                <span
                  class="text-xs font-black text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full flex items-center gap-1.5 font-mono"
                >
                  <FileCheck size={14} />
                  Solo Retención
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
            {/if}
          </div>

          <div
            class="pt-6 border-t border-border-subtle flex flex-col gap-2 relative z-10"
          >
            <div class="flex justify-between items-end">
              <div>
                <span
                  class="text-[10px] font-black uppercase tracking-[0.2em] text-brand-400/60 block mb-2"
                  >{paymentMode === "advance" ? "Monto Total del Anticipo" : "Saldo pendiente por pagar"}</span
                >
                <div
                  class="text-5xl font-black text-text-base drop-shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)] tracking-tight leading-none {paymentMode === 'advance' ? 'text-emerald-400' : 'text-brand-400'}"
                >
                  {showUSD ? "$" : "Bs."} {(
                    paymentMode === "advance"
                      ? (showUSD ? totalInstrumentosPago : totalInstrumentosPagoBs)
                      : (showUSD ? saldoPendientePorCobrar : saldoPendientePorCobrarBs)
                  ).toLocaleString("de-DE", {
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
                        <option value="TR">Transferencia Bancaria</option>
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

                    {#if fp.forma_pag === "TE" || fp.forma_pag === "TR" || fp.forma_pag === "DP" || fp.forma_pag === "CH"}
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
                          {#if paymentMode !== "advance"}
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
                          {/if}
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

          <!-- ALERTA INFORMATIVA: EXCEDENTE QUE PERMANECE EN LA N/CR O ANTICIPO -->
          {#if paymentMode !== "advance" && creditoNcExcedenteBs > 0}
            <div
              class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-start gap-3 relative z-10"
              transition:slide={{ duration: 150 }}
            >
              <Info size={18} class="text-emerald-400 shrink-0 mt-0.5" />
              <div class="space-y-1">
                <p class="font-bold text-text-base">
                  Crédito / Anticipo con saldo remanente disponible
                </p>
                <p class="text-text-muted leading-relaxed">
                  {#if totalFacturasNetoBs > 0}
                    El crédito/anticipo cubre el 100% de las facturas seleccionadas. El saldo excedente de <strong class="text-emerald-400 font-mono">{showUSD ? "$" : "Bs."} {(showUSD ? creditoNcExcedenteUsd : creditoNcExcedenteBs).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> quedará disponible para futuros pagos.
                  {:else}
                    No se rebajará saldo hasta seleccionar una factura a cruzar (o aplicar retención). Quedarán disponibles <strong class="text-emerald-400 font-mono">{showUSD ? "$" : "Bs."} {(showUSD ? creditoNcExcedenteUsd : creditoNcExcedenteBs).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> para futuros pagos.
                  {/if}
                </p>
              </div>
            </div>
          {/if}

          <!-- ALERTA INFORMATIVA: PAGO EN EXCESO EN INSTRUMENTOS -> AJPA -->
          {#if paymentMode !== "advance" && hasPaymentSurplus}
            <div
              class="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-start gap-3 relative z-10"
              transition:slide={{ duration: 150 }}
            >
              <Info size={18} class="text-blue-400 shrink-0 mt-0.5" />
              <div class="space-y-1">
                <p class="font-bold text-text-base">
                  Pago en exceso en instrumentos de pago
                </p>
                <p class="text-text-muted leading-relaxed">
                  El monto ingresado en los instrumentos de pago supera la deuda de las facturas seleccionadas.
                  Se generará automáticamente un documento <strong>AJPA</strong> (Ajuste Positivo Automático de Compra) por 
                  <strong class="text-blue-400 font-mono">{showUSD ? "$" : "Bs."} {(showUSD ? excedentePagoUsd : excedentePagoBs).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> 
                  a favor en la cuenta del proveedor para compensar en compras futuras.
                </p>
              </div>
            </div>
          {:else if paymentMode !== "advance" && totalInstrumentosPagoBs === 0 && (totalRetenidoIvaBs > 0 || totalRetenidoIslrBs > 0)}
            <div
              class="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-start gap-3 relative z-10"
              transition:slide={{ duration: 150 }}
            >
              <Info size={18} class="text-blue-400 shrink-0 mt-0.5" />
              <div class="space-y-1">
                <p class="font-bold text-text-base">
                  Registro exclusivo de Retenciones
                </p>
                <p class="text-text-muted leading-relaxed">
                  No se han agregado instrumentos de pago. Se registrará la retención fiscal (IVA / ISLR) en Profit Plus, rebajando el monto retenido del saldo de la factura y dejando el neto pendiente por pagar.
                </p>
              </div>
            </div>
          {/if}

          <!-- BOTÓN PRINCIPAL: GUARDAR PAGO O ANTICIPO -->
          {#if selectedSupplier}
            <button
              onclick={handleSaveClick}
              disabled={!canSave}
              class="w-full py-4 rounded-2xl {paymentMode === 'advance' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/25' : 'bg-brand-600 hover:bg-brand-500 shadow-brand-500/25'} active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-white font-black text-base transition-all shadow-xl flex items-center justify-center gap-3 cursor-pointer mt-4"
            >
              {#if saving}
                <RefreshCw size={20} class="animate-spin" />
                {paymentMode === "advance" ? "Registrando Anticipo..." : "Procesando Pago..."}
              {:else if paymentMode === "advance"}
                <Landmark size={20} />
                Registrar Anticipo y Movimiento
              {:else if hasPaymentSurplus}
                <Wallet size={20} />
                Generar AJPA y Guardar Pago
              {:else if totalInstrumentosPagoBs === 0 && (totalRetenidoIvaBs > 0 || totalRetenidoIslrBs > 0 || totalTimbreFiscalBs > 0)}
                <FileCheck size={20} />
                Guardar Retención
              {:else if totalFacturasNetoBs === 0 && (totalRetenidoIvaBs > 0 || totalRetenidoIslrBs > 0)}
                <Wallet size={20} />
                Guardar Retención N/CR
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
            {@const invBadge = getDocTypeBadge(inv.co_tipo_doc)}
            {@const invIsCredit = isNcDoc(inv)}
            <button
              onclick={() => selectInvoiceFromModal(inv)}
              class="w-full text-left bg-surface-base hover:bg-surface-soft border border-border-subtle hover:border-brand-500/40 p-4 rounded-2xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group cursor-pointer shadow-xs hover:shadow-md"
            >
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="bg-brand-500/10 text-brand-500 font-bold px-2 py-0.5 rounded-md text-xs border border-brand-500/20">
                    {inv.co_tipo_doc} {inv.nro_doc}
                  </span>
                  <span class={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${invBadge.class}`}>
                    {invBadge.label}
                  </span>
                  {#if inv.nro_fact && inv.nro_fact.trim() !== inv.nro_doc.trim()}
                    <span class="text-xs text-text-muted font-bold">
                      (Fact. {inv.nro_fact})
                    </span>
                  {/if}
                  {#if inv.mov_ban}
                    <span class="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold px-2 py-0.5 rounded-md font-mono">
                      Mov. Banco: {inv.mov_ban}
                    </span>
                  {/if}
                  <span class="text-xs text-text-muted font-mono">
                    Control: {inv.n_control || "N/A"}
                  </span>
                </div>
                <p class="font-black text-sm text-text-base group-hover:text-brand-500 transition-colors">
                  {inv.prov_des}
                </p>
                {#if inv.observa && isAdvanceDoc(inv)}
                  <p class="text-xs font-semibold text-emerald-400/90">
                    {inv.observa}
                  </p>
                {/if}
                <p class="text-xs text-text-muted font-mono">
                  RIF: {inv.rif} • Emisión: {new Date(inv.fec_emis).toLocaleDateString("es-VE")}
                </p>
              </div>

              <div class="text-left sm:text-right shrink-0">
                <span class="text-[10px] uppercase font-bold text-text-muted block">
                  {invIsCredit ? "Saldo a Favor" : "Saldo Pendiente"}
                </span>
                <span class="text-base font-black {invIsCredit ? 'text-emerald-400' : 'text-brand-500'}">
                  {#if invIsCredit}-{/if}$ {(inv.saldo / (inv.tasa > 0 ? inv.tasa : 1)).toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                </span>
                <span class="block text-xs {invIsCredit ? 'text-emerald-400/80' : 'text-text-muted'} font-bold">
                  Bs. {#if invIsCredit}-{/if}{Number(inv.saldo).toLocaleString("de-DE", { minimumFractionDigits: 2 })}
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

<!-- MODAL DE CONFIRMACIÓN AJPA POR PAGO EN EXCESO -->
{#if showAjpaConfirmModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-md"
    style="background-color: var(--modal-backdrop);"
    transition:fade={{ duration: 150 }}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0"
      onclick={() => (showAjpaConfirmModal = false)}
    ></div>

    <div
      class="relative z-10 bg-surface-raised border border-border-subtle rounded-[32px] w-full max-w-lg p-6 sm:p-8 flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 space-y-6"
    >
      <div class="flex items-center gap-4">
        <div
          class="h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0"
        >
          <AlertCircle size={24} />
        </div>
        <div>
          <h3 class="font-black text-lg text-text-base">
            Pago en Exceso / Anticipo
          </h3>
          <p class="text-xs text-text-muted font-medium">
            Generación de Ajuste Positivo (AJPA) en Profit Plus
          </p>
        </div>
      </div>

      <div class="space-y-3 bg-surface-soft/40 p-4 rounded-2xl border border-border-subtle text-xs">
        <div class="flex justify-between items-center text-text-muted font-medium">
          <span>Total neto a pagar en facturas:</span>
          <span class="font-mono font-bold text-text-base">
            $ {montoNetoAPagarUsd.toLocaleString("de-DE", { minimumFractionDigits: 2 })}
            <span class="text-[10px] text-text-muted font-normal">(Bs. {montoNetoAPagarBs.toLocaleString("de-DE", { minimumFractionDigits: 2 })})</span>
          </span>
        </div>
        <div class="flex justify-between items-center text-text-muted font-medium">
          <span>Monto emitido en instrumentos de pago:</span>
          <span class="font-mono font-bold text-text-base">
            $ {totalInstrumentosPago.toLocaleString("de-DE", { minimumFractionDigits: 2 })}
            <span class="text-[10px] text-text-muted font-normal">(Bs. {totalInstrumentosPagoBs.toLocaleString("de-DE", { minimumFractionDigits: 2 })})</span>
          </span>
        </div>
        <div class="flex justify-between items-center border-t border-border-subtle/60 pt-3 text-text-base font-bold">
          <span class="text-blue-400">Diferencia a favor (se creará como AJPA):</span>
          <span class="font-mono font-black text-blue-400 text-sm">
            $ {excedentePagoUsd.toLocaleString("de-DE", { minimumFractionDigits: 2 })}
            <span class="text-xs font-bold text-blue-300/80">(Bs. {excedentePagoBs.toLocaleString("de-DE", { minimumFractionDigits: 2 })})</span>
          </span>
        </div>
      </div>

      <p class="text-xs text-text-muted leading-relaxed">
        El monto pagado en efectivo/banco supera las facturas seleccionadas. El sistema registrará el pago de las facturas y creará automáticamente un documento <strong>AJPA (Ajuste Positivo Automático de Compra)</strong> en la serie <strong>C010</strong> por la diferencia a favor en la cuenta del proveedor para compensar futuras compras.
      </p>

      <div class="flex items-center justify-end gap-3 pt-2">
        <button
          onclick={() => (showAjpaConfirmModal = false)}
          class="px-5 py-3 rounded-xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base text-xs font-bold transition-all cursor-pointer"
        >
          Cancelar
        </button>
        <button
          onclick={() => {
            confirmedAjpa = true;
            showAjpaConfirmModal = false;
            handleSaveClick();
          }}
          disabled={saving}
          class="px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-black transition-all shadow-lg shadow-brand-500/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {#if saving}
            <RefreshCw size={14} class="animate-spin" />
            Procesando...
          {:else}
            <CheckCircle size={14} />
            Confirmar y Guardar Pago
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL DE SELECCIÓN DE CUENTA INGRESO/EGRESO PARA EL MOVIMIENTO BANCARIO / CAJA -->
{#if showMovCtaModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-md"
    style="background-color: var(--modal-backdrop);"
    transition:fade={{ duration: 150 }}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0"
      onclick={() => {
        showMovCtaModal = false;
        confirmedAjpa = false;
      }}
    ></div>

    <div
      class="relative z-10 bg-surface-raised border border-border-subtle rounded-[32px] w-full max-w-xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
    >
      <div class="p-6 border-b border-border-subtle flex items-center justify-between bg-surface-soft shrink-0">
        <div class="flex items-center gap-3">
          <div class="h-11 w-11 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0">
            <Landmark size={22} />
          </div>
          <div>
            <h3 class="font-black text-lg text-text-base leading-tight">
              Cuenta para el Movimiento Bancario / Caja
            </h3>
            <p class="text-xs text-text-muted font-medium">
              Selecciona la cuenta de Ingreso/Egreso donde se registrará el egreso en Profit Plus
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => {
            showMovCtaModal = false;
            confirmedAjpa = false;
          }}
          class="h-10 w-10 rounded-xl bg-surface-soft hover:bg-surface-strong flex items-center justify-center text-text-muted hover:text-text-base transition-all cursor-pointer"
          aria-label="Cerrar modal"
        >
          <X size={18} />
        </button>
      </div>

      <div class="p-6 space-y-4 overflow-y-auto flex-1">
        <!-- Resumen de movimientos a generar -->
        <div class="bg-surface-soft/50 border border-border-subtle rounded-2xl p-3.5 space-y-2 text-xs">
          <span class="text-[10px] font-black uppercase tracking-wider text-text-muted block">
            Movimientos a generar en Profit Plus
          </span>
          <div class="space-y-1.5">
            {#each formasPago.filter((fp) => (Number(fp.mont_doc_bs) || 0) > 0.001) as fp}
              <div class="flex flex-wrap items-center justify-between gap-2 bg-surface-base/70 px-3 py-2 rounded-xl border border-border-subtle/60">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="px-2 py-0.5 rounded-md bg-brand-500/10 text-brand-400 border border-brand-500/20 text-[10px] font-black uppercase">
                    {getFormaPagLabel(fp.forma_pag)}
                  </span>
                  <span class="font-semibold text-text-base truncate">
                    {getInstrumentAccountLabel(fp)}
                  </span>
                  {#if fp.num_doc}
                    <span class="text-[10px] font-mono text-text-muted">Ref: {fp.num_doc}</span>
                  {/if}
                </div>
                <span class="font-mono font-black text-text-base shrink-0">
                  Bs. {r2(fp.mont_doc_bs).toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                  <span class="text-[10px] text-text-muted font-normal">($ {r2(fp.mont_doc).toLocaleString("de-DE", { minimumFractionDigits: 2 })})</span>
                </span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Quick-picks desde los documentos seleccionados -->
        {#if selectedDocsWithCta.length > 0}
          <div class="space-y-2">
            <span class="text-[10px] font-black uppercase tracking-wider text-text-muted block">
              Cuentas definidas en los documentos de este pago (clic para elegir):
            </span>
            <div class="flex flex-wrap gap-2">
              {#each selectedDocsWithCta as item}
                {@const isActiveChip = modalCtaSelected.trim().toUpperCase() === item.code.toUpperCase()}
                <button
                  type="button"
                  onclick={() => (modalCtaSelected = item.code)}
                  class={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    isActiveChip
                      ? "bg-brand-600 text-white border-brand-500 shadow-sm shadow-brand-500/20"
                      : "bg-surface-soft text-text-base border-border-subtle hover:border-brand-500/40"
                  }`}
                >
                  <span class="font-mono text-[10px] opacity-85">{item.label}</span>
                  <span>·</span>
                  <span class="font-mono font-black">{item.code}</span>
                  {#if item.descrip}
                    <span class="opacity-85 truncate max-w-[180px]">· {item.descrip}</span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Buscador + listado completo de saCuentaIngEgr -->
        <div class="space-y-2.5">
          <div class="relative">
            <Search size={16} class="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              bind:value={modalCtaSearch}
              placeholder="Buscar cuenta por código (ej. P-001, G-021) o nombre..."
              class="w-full h-11 pl-10 pr-4 bg-surface-soft border border-border-subtle rounded-xl text-xs font-medium text-text-base outline-none focus:border-brand-500 transition-all"
            />
          </div>

          <div class="max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {#if filteredCuentasIngrEgr.length === 0}
              <div class="py-8 text-center text-xs text-text-muted font-semibold bg-surface-soft/30 rounded-2xl border border-dashed border-border-subtle">
                No se encontraron cuentas de Ingreso/Egreso que coincidan con "{modalCtaSearch}".
              </div>
            {:else}
              {#each filteredCuentasIngrEgr as cta}
                {@const ctaCode = String(cta.co_cta_ingr_egr || "").trim()}
                {@const isSelectedCta = modalCtaSelected.trim().toUpperCase() === ctaCode.toUpperCase()}
                <button
                  type="button"
                  onclick={() => (modalCtaSelected = ctaCode)}
                  class={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                    isSelectedCta
                      ? "bg-brand-500/15 border-brand-500/50 text-text-base shadow-xs"
                      : "bg-surface-soft/40 hover:bg-surface-soft border-border-subtle/70 text-text-base"
                  }`}
                >
                  <div class="flex items-center gap-2.5 min-w-0">
                    <span
                      class={`px-2 py-0.5 rounded-md font-mono text-[11px] font-black border shrink-0 ${
                        isSelectedCta
                          ? "bg-brand-600 text-white border-brand-500"
                          : "bg-surface-base text-brand-400 border-border-subtle"
                      }`}
                    >
                      {ctaCode}
                    </span>
                    <span class="text-xs font-semibold truncate">{cta.descrip?.trim()}</span>
                  </div>
                  {#if isSelectedCta}
                    <CheckCircle size={15} class="text-brand-400 shrink-0" />
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        </div>
      </div>

      <div class="p-5 border-t border-border-subtle bg-surface-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div class="text-xs min-w-0">
          {#if modalCtaSelected.trim()}
            <span class="text-[10px] uppercase font-bold text-text-muted block">Cuenta seleccionada:</span>
            <span class="font-mono font-black text-brand-400 truncate block">
              {modalCtaSelected.trim()}{modalCtaSelectedObj?.descrip ? ` · ${modalCtaSelectedObj.descrip.trim()}` : ""}
            </span>
          {:else}
            <span class="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <AlertCircle size={14} class="shrink-0" />
              Debes seleccionar una cuenta para continuar
            </span>
          {/if}
        </div>
        <div class="flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onclick={() => {
              showMovCtaModal = false;
              confirmedAjpa = false;
            }}
            class="px-4 py-2.5 rounded-xl bg-surface-base hover:bg-surface-strong border border-border-subtle text-text-muted hover:text-text-base text-xs font-bold transition-all cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!modalCtaSelected.trim() || saving}
            onclick={() => {
              const chosen = modalCtaSelected.trim();
              if (!chosen) return;
              paymentCtaIngrEgr = chosen;
              if (paymentMode === "advance") {
                advanceCtaIngrEgr = chosen;
              }
              confirmedMovCta = true;
              showMovCtaModal = false;
              executeSavePago();
            }}
            class="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-black transition-all shadow-lg shadow-brand-500/25 flex items-center gap-2 cursor-pointer"
          >
            {#if saving}
              <RefreshCw size={14} class="animate-spin" />
              Procesando...
            {:else}
              <CheckCircle size={14} />
              Confirmar y Generar Movimiento
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<AuthorizeEditModal
  bind:open={retAuthModal.open}
  module="pur_payments"
  branchId={selectedBranch}
  title={retAuthModal.title}
  description={retAuthModal.description}
  fieldLabel={retAuthModal.fieldLabel}
  currencySymbol="Bs."
  initialValue={retAuthModal.initialValue}
  recordId={retAuthModal.doc?.nro_doc?.trim() || ""}
  currentUserEmail={($page.data as any)?.profile?.email || ""}
  onAuthorized={applyAuthorizedRetention}
/>

<!-- MODAL DE BÚSQUEDA DE PROVEEDORES (MODO ANTICIPO DIRECTO) -->
{#if showSupplierSearchModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-md"
    style="background-color: var(--modal-backdrop);"
    transition:fade={{ duration: 150 }}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0" onclick={closeSupplierSearchModal}></div>

    <div
      class="relative z-10 bg-surface-raised border border-border-subtle rounded-[32px] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
    >
      <div class="p-6 border-b border-border-subtle flex items-center justify-between bg-surface-soft">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
            <Building size={20} />
          </div>
          <div>
            <h3 class="font-black text-lg text-text-base">Seleccionar Proveedor para Anticipo</h3>
            <p class="text-xs text-text-muted font-medium">Busca cualquier proveedor activo aunque no tenga facturas emitidas</p>
          </div>
        </div>
        <button
          type="button"
          onclick={closeSupplierSearchModal}
          class="h-10 w-10 rounded-xl bg-surface-soft hover:bg-surface-strong flex items-center justify-center text-text-muted hover:text-text-base transition-all cursor-pointer"
          aria-label="Cerrar modal"
        >
          <X size={18} />
        </button>
      </div>

      <div class="p-5 border-b border-border-subtle bg-surface-soft/50">
        <div class="relative flex gap-2">
          <div class="relative flex-1">
            <input
              type="text"
              placeholder="Buscar por RIF, Código o Razón Social..."
              bind:value={supplierSearchInput}
              oninput={() => searchSuppliersList(supplierSearchInput)}
              onkeydown={(e) => e.key === "Enter" && searchSuppliersList(supplierSearchInput)}
              class="w-full h-12 pl-12 pr-4 bg-surface-base border border-border-subtle rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-text-base"
            />
            <Search size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
          </div>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-5 space-y-2.5 bg-surface-raised">
        {#if searchingSuppliers}
          <div class="py-12 flex flex-col items-center justify-center gap-3 text-text-muted">
            <RefreshCw size={24} class="animate-spin text-emerald-500" />
            <p class="text-xs font-bold">Buscando proveedores...</p>
          </div>
        {:else if supplierResults.length === 0}
          <div class="py-12 text-center text-text-muted text-xs font-bold">
            No se encontraron proveedores para esta búsqueda.
          </div>
        {:else}
          {#each supplierResults as prov}
            <button
              type="button"
              onclick={() => selectSupplierForAdvance(prov)}
              class="w-full text-left bg-surface-base hover:bg-surface-soft border border-border-subtle hover:border-emerald-500/40 p-4 rounded-2xl transition-all flex items-center justify-between gap-4 group cursor-pointer"
            >
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="font-black text-sm text-text-base group-hover:text-emerald-400 transition-colors">
                    {prov.prov_des || prov.descripcion}
                  </span>
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-soft border border-border-subtle text-text-muted">
                    {prov.co_prov}
                  </span>
                </div>
                <p class="text-xs text-text-muted font-mono">
                  RIF: {prov.rif || "N/A"} {prov.telefonos ? `• Tlf: ${prov.telefonos}` : ""}
                </p>
              </div>
              <span class="text-xs font-black text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                Seleccionar →
              </span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
