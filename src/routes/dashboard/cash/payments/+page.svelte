<!-- src/routes/dashboard/cash/payments/+page.svelte -->
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
  let co_cli = $state("");
  let selectedClient = $state<any>(null);
  let searchQuery = $state("");
  let pendingInvoices = $state<any[]>([]);
  let searchingInvoices = $state(false);
  let loadingDocs = $state(false);
  let currentExchangeRate = $state(1);

  // Documentos cargados del cliente
  let documentos = $state<any[]>([]);
  let checkedDocs = $state<Record<string, boolean>>({});

  // Datos de retenciones y abonos por documento
  let docInputs = $state<
    Record<
      string,
      {
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
      }
    >
  >({});

  let formasPago = $state<any[]>([]);

  // Reactivo: Auto-distribuir el total de instrumentos de pago a las facturas seleccionadas
  $effect(() => {
    // Total de instrumentos de pago en Bs y USD a distribuir
    let remainingPaymentBs = totalInstrumentosPagoBs;
    let remainingPaymentUsd = totalInstrumentosPago;

    // Procesar todos los documentos cargados
    for (const doc of documentos) {
      const nro = doc.nro_doc.trim();
      const inp = docInputs[nro];
      if (!inp) continue;

      if (!checkedDocs[nro]) {
        inp.mont_cob = 0;
        inp.mont_cob_bs = 0;
        continue;
      }

      const docTasa = doc.tasa > 0 ? doc.tasa : 1;
      const isNC = doc.co_tipo_doc.trim() === "N/CR";

      if (isNC) {
        // Notas de Crédito restan saldo (abono negativo)
        const saldoUsd = Math.round((doc.saldo / docTasa) * 100) / 100;
        inp.mont_cob_bs = -doc.saldo;
        inp.mont_cob = -saldoUsd;
      } else {
        // Documentos normales (Facturas, etc.)
        const retIvaBs = Number(inp.reten_iva_bs) || 0;
        const retIslrBs = Number(inp.reten_islr_bs) || 0;
        
        const retIvaUsd = Number(inp.reten_iva) || 0;
        const retIslrUsd = Number(inp.reten_islr) || 0;

        const maxAbonoBs = Math.max(0, Math.round((doc.saldo - retIvaBs - retIslrBs) * 100) / 100);
        const maxAbonoUsd = Math.max(0, Math.round(((doc.saldo / docTasa) - retIvaUsd - retIslrUsd) * 100) / 100);

        // Si tenemos saldo de pago, lo aplicamos
        const appliedBs = Math.min(remainingPaymentBs, maxAbonoBs);
        const appliedUsd = Math.min(remainingPaymentUsd, maxAbonoUsd);

        inp.mont_cob_bs = Math.round(appliedBs * 100) / 100;
        inp.mont_cob = Math.round(appliedUsd * 100) / 100;

        remainingPaymentBs = Math.max(0, Math.round((remainingPaymentBs - appliedBs) * 100) / 100);
        remainingPaymentUsd = Math.max(0, Math.round((remainingPaymentUsd - appliedUsd) * 100) / 100);
      }
    }
  });

  // Modal toggle
  let showImportModal = $state(false);

  // Monto neto esperado a cobrar en efectivo/instrumentos (saldo - retenciones + diferencial N/DB) independiente de los instrumentos
  let expectedNetPayBs = $derived(
    Math.round(
      documentos.reduce((acc, doc) => {
        if (checkedDocs[doc.nro_doc.trim()]) {
          const isNC = doc.co_tipo_doc.trim() === "N/CR";
          if (isNC) return acc - doc.saldo;
          const inp = docInputs[doc.nro_doc.trim()];
          if (inp) {
            const porcIva = (selectedClient && selectedClient.contribu_e) ? (Number(selectedClient.porc_esp) || 0) : 0;
            const theoreticalRetIvaBs = Math.round((doc.monto_imp || 0) * (porcIva / 100) * 100) / 100;
            const appliedRetIvaBs = inp.showIvaDetails ? Math.max(inp.reten_iva_bs || 0, theoreticalRetIvaBs) : 0;
            const appliedRetIslrBs = inp.showIslrDetails ? (inp.reten_islr_bs || 0) : 0;

            // Cálculo del diferencial cambiario N/DB si la factura es de una fecha anterior
            const docFecEmisStr = doc.fec_emis ? new Date(doc.fec_emis).toISOString().split('T')[0] : '';
            const todayStr = new Date().toISOString().split('T')[0];
            const isPreviousDateDoc = docFecEmisStr && docFecEmisStr < todayStr;
            const docTasa = doc.tasa > 0 ? doc.tasa : 1;
            let diffBs = 0;
            if (isPreviousDateDoc && doc.saldo > 0 && currentExchangeRate > docTasa) {
              const saldoUsd = doc.saldo / docTasa;
              const montoBsActual = Math.round((saldoUsd * currentExchangeRate) * 100) / 100;
              diffBs = Math.max(0, Math.round((montoBsActual - doc.saldo) * 100) / 100);
            }

            return acc + doc.saldo - appliedRetIvaBs - appliedRetIslrBs + diffBs;
          }
          return acc + doc.saldo;
        }
        return acc;
      }, 0) * 100
    ) / 100
  );

  let expectedNetPayUsd = $derived(
    documentos.reduce((acc, doc) => {
      if (checkedDocs[doc.nro_doc.trim()]) {
        const docTasa = doc.tasa > 0 ? doc.tasa : 1;
        const isNC = doc.co_tipo_doc.trim() === "N/CR";
        if (isNC) return acc - Math.round((doc.saldo / docTasa) * 100) / 100;
        const inp = docInputs[doc.nro_doc.trim()];
        if (inp) {
          const porcIva = (selectedClient && selectedClient.contribu_e) ? (Number(selectedClient.porc_esp) || 0) : 0;
          const theoreticalRetIvaBs = Math.round((doc.monto_imp || 0) * (porcIva / 100) * 100) / 100;
          const theoreticalRetIvaUsd = Math.round((theoreticalRetIvaBs / docTasa) * 100) / 100;
          const appliedRetIva = inp.showIvaDetails ? Math.max(inp.reten_iva || 0, theoreticalRetIvaUsd) : 0;
          const appliedRetIslr = inp.showIslrDetails ? (inp.reten_islr || 0) : 0;
          const saldoUsd = Math.round((doc.saldo / docTasa) * 100) / 100;
          return acc + saldoUsd - appliedRetIva - appliedRetIslr;
        }
        return acc + Math.round((doc.saldo / docTasa) * 100) / 100;
      }
      return acc;
    }, 0)
  );

  // Totales derivativos
  let totalCobradoNetoBs = $derived(
    expectedNetPayBs
  );

  let totalCobradoNeto = $derived(
    expectedNetPayUsd
  );

  let totalRetenidoIvaBs = $derived(
    Object.values(docInputs).reduce(
      (acc, curr) => acc + (Number(curr.reten_iva_bs) || 0),
      0,
    ),
  );

  let totalRetenidoIva = $derived(
    Object.values(docInputs).reduce(
      (acc, curr) => acc + (Number(curr.reten_iva) || 0),
      0,
    ),
  );

  let totalRetenidoIslrBs = $derived(
    Object.values(docInputs).reduce(
      (acc, curr) => acc + (Number(curr.reten_islr_bs) || 0),
      0,
    ),
  );

  let totalRetenidoIslr = $derived(
    Object.values(docInputs).reduce(
      (acc, curr) => acc + (Number(curr.reten_islr) || 0),
      0,
    ),
  );

  let totalRetenidoIvaVista = $derived(
    documentos.reduce((acc, doc) => {
      if (checkedDocs[doc.nro_doc.trim()]) {
        const docTasa = doc.tasa > 0 ? doc.tasa : 1;
        const inp = docInputs[doc.nro_doc.trim()];
        if (inp && inp.showIvaDetails) {
          const porcIva = (selectedClient && selectedClient.contribu_e) ? (Number(selectedClient.porc_esp) || 0) : 0;
          const theoreticalRetIvaBs = Math.round((doc.monto_imp || 0) * (porcIva / 100) * 100) / 100;
          const theoreticalRetIvaUsd = Math.round((theoreticalRetIvaBs / docTasa) * 100) / 100;
          return acc + Math.max(inp.reten_iva || 0, theoreticalRetIvaUsd);
        }
      }
      return acc;
    }, 0)
  );

  let totalRetenidoIslrVista = $derived(
    documentos.reduce((acc, doc) => {
      if (checkedDocs[doc.nro_doc.trim()]) {
        const inp = docInputs[doc.nro_doc.trim()];
        if (inp && inp.showIslrDetails) {
          return acc + (inp.reten_islr || 0);
        }
      }
      return acc;
    }, 0)
  );

  let totalIgtfBs = $derived(
    documentos.reduce((acc, doc) => {
      if (checkedDocs[doc.nro_doc.trim()]) {
        return acc + (doc.otros1 || 0);
      }
      return acc;
    }, 0),
  );

  let totalIgtf = $derived(
    documentos.reduce((acc, doc) => {
      if (checkedDocs[doc.nro_doc.trim()]) {
        const docTasa = doc.tasa > 0 ? doc.tasa : 1;
        return acc + (doc.otros1 || 0) / docTasa;
      }
      return acc;
    }, 0),
  );

  let totalInstrumentosPagoBs = $derived(
    formasPago.reduce((acc, fp) => {
      const isBs = getRowCurrency(fp) === 'BS';
      const valBs = isBs ? (Number(fp.mont_doc_bs) || 0) : Math.round((Number(fp.mont_doc) || 0) * currentExchangeRate * 100) / 100;
      return acc + valBs;
    }, 0)
  );

  let totalInstrumentosPago = $derived(
    formasPago.reduce((acc, curr) => acc + (Number(curr.mont_doc) || 0), 0),
  );

  let saldoPendientePorCobrar = $derived(
    Math.max(0, Math.round((expectedNetPayUsd - totalInstrumentosPago) * 100) / 100)
  );

  let diferenciaCuadreBs = $derived(
    Math.round((totalCobradoNetoBs - totalInstrumentosPagoBs) * 100) / 100,
  );

  let diferenciaCuadre = $derived(
    Math.round((diferenciaCuadreBs / (currentExchangeRate > 0 ? currentExchangeRate : 1)) * 100) / 100,
  );

  // Sucursal seleccionada
  let selectedBranch = $state(data.selectedBranchId);

  // Cargar tasa de cambio al inicio
  $effect(() => {
    selectedBranch = data.selectedBranchId;
    loadExchangeRate();
  });

  // Cargar factura precargada si viene por URL
  $effect(() => {
    const importInvoiceNum = $page.url.searchParams.get("import_invoice");
    if (importInvoiceNum && selectedBranch) {
      // Evitar bucles de recarga infinitos eliminando el parámetro de la URL
      const queryParams = new URLSearchParams($page.url.searchParams);
      queryParams.delete("import_invoice");
      goto(`?${queryParams.toString()}`, {
        replaceState: true,
        keepFocus: true,
      });

      // Cargar los datos de la factura
      fetch(
        `/api/agent/payments/pending-documents?branch_id=${selectedBranch}&search=${encodeURIComponent(importInvoiceNum)}`,
      )
        .then((res) => res.json())
        .then((resJson) => {
          if (resJson.success && resJson.data && resJson.data.length > 0) {
            const invoice = resJson.data.find(
              (d: any) =>
                d.nro_doc.trim() === importInvoiceNum.trim() &&
                d.co_tipo_doc.trim() === "FACT",
            );
            if (invoice) {
              selectInvoice(invoice);
              toast.success(
                `Factura Nro. ${importInvoiceNum} precargada para cobro.`,
              );
            } else {
              toast.error(
                `No se encontró la factura Nro. ${importInvoiceNum} pendiente de cobro en esta sucursal.`,
              );
            }
          } else {
            toast.error(
              `No se pudo precargar la factura Nro. ${importInvoiceNum}.`,
            );
          }
        })
        .catch((err) => {
          console.error(err);
          toast.error("Error al conectar para precargar la factura.");
        });
    }
  });

  async function loadExchangeRate() {
    try {
      const res = await fetch(`/api/agent/tasa?branch_id=${selectedBranch}`);
      if (res.ok) {
        const resJson = await res.json();
        if (resJson.success && resJson.tasa) {
          currentExchangeRate = Number(resJson.tasa) || 1;
        }
      }
    } catch (e) {
      console.error("Error al cargar la tasa de cambio:", e);
    }
  }

  function handleBranchChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedBranch = target.value;
    clearClient();
    loadExchangeRate();
    const qParams = new URLSearchParams($page.url.searchParams);
    qParams.set("branch_id", selectedBranch);
    goto(`?${qParams.toString()}`);
  }

  // Búsqueda en Modal de Importación
  async function openImportModal() {
    showImportModal = true;
    searchQuery = "";
    searchingInvoices = true;
    try {
      const res = await fetch(
        `/api/agent/payments/pending-documents?branch_id=${selectedBranch}`,
      );
      if (res.ok) {
        const resJson = await res.json();
        pendingInvoices = resJson.data || [];
      }
    } catch (e) {
      console.error(e);
      toast.error("Error al conectar con la sede.");
    } finally {
      searchingInvoices = false;
    }
  }

  async function searchPendingInvoices() {
    if (!searchQuery.trim()) {
      // Si está vacío, volver a cargar iniciales
      searchingInvoices = true;
      try {
        const res = await fetch(
          `/api/agent/payments/pending-documents?branch_id=${selectedBranch}`,
        );
        if (res.ok) {
          const resJson = await res.json();
          pendingInvoices = resJson.data || [];
        }
      } catch (e) {
        console.error(e);
      } finally {
        searchingInvoices = false;
      }
      return;
    }
    searchingInvoices = true;
    try {
      const res = await fetch(
        `/api/agent/payments/pending-documents?search=${encodeURIComponent(searchQuery)}&branch_id=${selectedBranch}`,
      );
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
    selectedClient = {
      co_cli: inv.co_cli ? inv.co_cli.trim() : "",
      descripcion: inv.cli_des ? inv.cli_des.trim() : "",
      rif: inv.rif ? inv.rif.trim() : "",
      contribu_e: !!inv.contribu_e,
      porc_esp: inv.contribu_e ? (inv.porc_esp || 75) : 0,
      co_ven: inv.co_ven ? inv.co_ven.trim() : "",
      co_mone: inv.co_mone ? inv.co_mone.trim() : "USD",
      direc1: "",
      telefonos: "",
    };
    co_cli = selectedClient.co_cli;
    showImportModal = false;
    checkedDocs = {};
    formasPago = [];

    // Fetch full client details for address/phone mapping
    fetch(
      `/api/agent/customers?search=${encodeURIComponent(co_cli)}&branch_id=${selectedBranch}`,
    )
      .then((res) => res.json())
      .then((resJson) => {
        if (resJson.success && resJson.data && resJson.data.length > 0) {
          const cDetail = resJson.data.find(
            (c: any) => c.co_cli.trim() === co_cli,
          );
          if (cDetail) {
            selectedClient.direc1 = cDetail.direc1 || "";
            selectedClient.telefonos = cDetail.telefonos || "";
            selectedClient.email = cDetail.email || "";
          }
        }
      })
      .catch((err) => console.error("Error fetching client details:", err));

    // Cargar todos los documentos pendientes del cliente
    loadingDocs = true;
    documentos = [];
    docInputs = {};
    try {
      const res = await fetch(
        `/api/agent/customers/${encodeURIComponent(co_cli)}/documentos?branch_id=${selectedBranch}`,
      );
      if (res.ok) {
        const resJson = await res.json();
        documentos = resJson.data || [];

        documentos.forEach((doc) => {
          const isTargetDoc =
            doc.nro_doc.trim() === inv.nro_doc.trim() &&
            doc.co_tipo_doc.trim() === inv.co_tipo_doc.trim();
          const docTasa = doc.tasa > 0 ? doc.tasa : 1;
          const totalNetoUsd = doc.total_neto / docTasa;
          const montoImpUsd = doc.monto_imp / docTasa;
          const otros1Usd = (doc.otros1 || 0) / docTasa;
          const baseImpUsd =
            Math.round((totalNetoUsd - montoImpUsd - otros1Usd) * 100) / 100;

          checkedDocs[doc.nro_doc.trim()] = isTargetDoc;

          const baseImpBs = doc.total_neto - doc.monto_imp - (doc.otros1 || 0);
          docInputs[doc.nro_doc.trim()] = {
            mont_cob: 0,
            mont_cob_bs: 0,
            reten_iva: 0,
            reten_iva_bs: 0,
            num_comprobante_iva: "",
            base_imponible_iva: baseImpUsd,
            base_imponible_iva_bs: baseImpBs,
            alicuota_iva: 16,
            reten_islr: 0,
            reten_islr_bs: 0,
            co_islr: "001",
            porc_islr: 2,
            showIvaDetails: false,
            showIslrDetails: false,
            manual_override_iva: false,
            manual_override_islr: false,
            manual_override_abono: false,
          };

          if (isTargetDoc) {
            recalculateDocAmounts(doc.nro_doc.trim(), doc);
          }
        });
      }
    } catch (e) {
      console.error(e);
      toast.error("Error al obtener deudas del cliente.");
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

    if (checkedDocs[nroDoc]) {
      // Auto-enable retenciones si es contribuyente especial y tiene IVA
      if (
        selectedClient?.contribu_e &&
        doc.monto_imp > 0 &&
        !input.manual_override_iva &&
        !input.showIvaDetails
      ) {
        input.showIvaDetails = true;
      }

      // Retención de IVA
      if (input.showIvaDetails) {
        if (!input.manual_override_iva && input.reten_iva === 0) {
          const porc = (selectedClient && selectedClient.contribu_e) ? (Number(selectedClient.porc_esp) || 75) : 0;
          input.reten_iva_bs = Math.round(doc.monto_imp * (porc / 100) * 100) / 100;
          input.reten_iva = Math.round((input.reten_iva_bs / docTasa) * 100) / 100;

          input.base_imponible_iva_bs = doc.total_neto - doc.monto_imp - (doc.otros1 || 0);
          input.base_imponible_iva =
            Math.round((input.base_imponible_iva_bs / docTasa) * 100) / 100;
          input.alicuota_iva = 16;
        } else if (input.manual_override_iva) {
          input.reten_iva_bs = Math.round((input.reten_iva || 0) * docTasa * 100) / 100;
        }
      } else {
        input.reten_iva = 0;
        input.reten_iva_bs = 0;
        input.num_comprobante_iva = "";
      }

      // Retención de ISLR
      if (input.showIslrDetails) {
        if (!input.manual_override_islr && input.reten_islr === 0) {
          const baseImpBs = doc.total_neto - doc.monto_imp;
          input.reten_islr_bs = Math.round(baseImpBs * (input.porc_islr / 100) * 100) / 100;
          input.reten_islr = Math.round((input.reten_islr_bs / docTasa) * 100) / 100;
        } else if (input.manual_override_islr) {
          input.reten_islr_bs = Math.round((input.reten_islr || 0) * docTasa * 100) / 100;
        }
      } else {
        input.reten_islr = 0;
        input.reten_islr_bs = 0;
      }
    } else {
      input.reten_iva = 0;
      input.reten_iva_bs = 0;
      input.manual_override_iva = false;
      input.reten_islr = 0;
      input.reten_islr_bs = 0;
      input.manual_override_islr = false;
      input.manual_override_abono = false;
      input.showIvaDetails = false;
      input.showIslrDetails = false;
    }
  }

  function clearClient() {
    selectedClient = null;
    co_cli = "";
    documentos = [];
    docInputs = {};
    formasPago = [];
  }

  function addFormaPago() {
    // Calcular el monto pendiente = neto esperado - instrumentos ya agregados
    const pendingBs = Math.max(0, Math.round((expectedNetPayBs - totalInstrumentosPagoBs) * 100) / 100);
    const pendingUsd = Math.max(0, Math.round((expectedNetPayUsd - totalInstrumentosPago) * 100) / 100);
    const initialFp = {
      forma_pag: "EF",
      cod_caja: data.cajas[0]?.cod_caja || "",
      cod_cta: "",
      co_ban: "",
      co_tar: "",
      num_doc: "",
      mont_doc: 0,
      mont_doc_bs: 0,
      fecha_che: new Date().toISOString().substring(0, 10),
    };
    const isBs = getRowCurrency(initialFp) === 'BS';
    if (isBs) {
      initialFp.mont_doc_bs = pendingBs;
      initialFp.mont_doc = Math.round((initialFp.mont_doc_bs / (currentExchangeRate > 0 ? currentExchangeRate : 1)) * 100) / 100;
    } else {
      initialFp.mont_doc = pendingUsd;
      initialFp.mont_doc_bs = Math.round(initialFp.mont_doc * currentExchangeRate * 100) / 100;
    }
    formasPago.push(initialFp);
  }

  function removeFormaPago(index: number) {
    formasPago = formasPago.filter((_, i) => i !== index);
  }

  function handleFormaPagChange(index: number) {
    const fp = formasPago[index];
    if (fp.forma_pag === "EF") {
      fp.cod_caja = data.cajas[0]?.cod_caja || "";
      fp.cod_cta = "";
      fp.co_ban = "";
      fp.co_tar = "";
      fp.num_doc = "";
    } else if (fp.forma_pag === "TJ") {
      fp.cod_caja = data.cajas[0]?.cod_caja || "";
      fp.cod_cta = "";
      fp.co_ban = "";
      fp.co_tar = data.tarjetasCredito[0]?.co_tar || "";
      fp.num_doc = "";
    } else if (
      fp.forma_pag === "TE" ||
      fp.forma_pag === "DP" ||
      fp.forma_pag === "CH"
    ) {
      fp.cod_caja = "";
      fp.cod_cta = data.cuentasBancarias[0]?.cod_cta || "";
      fp.co_ban = data.bancos[0]?.co_ban || "";
      fp.co_tar = "";
    }
    handleCajaCtaChange(index);
  }

  function handleCajaCtaChange(index: number) {
    const fp = formasPago[index];
    const isBs = getRowCurrency(fp) === 'BS';
    const rate = currentExchangeRate > 0 ? currentExchangeRate : 1;

    if (formasPago.length === 1) {
      if (isBs) {
        fp.mont_doc_bs = Math.round(expectedNetPayBs * 100) / 100;
        fp.mont_doc = Math.round((fp.mont_doc_bs / rate) * 100) / 100;
      } else {
        fp.mont_doc = Math.round(expectedNetPayUsd * 100) / 100;
        fp.mont_doc_bs = Math.round(fp.mont_doc * rate * 100) / 100;
      }
    } else {
      if (isBs) {
        fp.mont_doc_bs = Math.round(fp.mont_doc * rate * 100) / 100;
        fp.mont_doc = Math.round((fp.mont_doc_bs / rate) * 100) / 100;
      } else {
        fp.mont_doc = Math.round((fp.mont_doc_bs / rate) * 100) / 100;
        fp.mont_doc_bs = Math.round(fp.mont_doc * rate * 100) / 100;
      }
    }
  }

  function getRowCurrency(fp: any) {
    if (fp.forma_pag === "EF" || fp.forma_pag === "TJ" || fp.forma_pag === "CT") {
      if (fp.cod_caja) {
        const caja = data.cajas?.find((c: any) => c.cod_caja?.trim() === fp.cod_caja?.trim());
        const mone = caja?.co_mone?.trim()?.toUpperCase() || 'BS';
        return (mone === 'VES' || mone === 'BS') ? 'BS' : 'USD';
      }
    } else if (fp.forma_pag === "TE" || fp.forma_pag === "DP" || fp.forma_pag === "CH") {
      if (fp.cod_cta) {
        const cta = data.cuentasBancarias?.find((c: any) => c.cod_cta?.trim() === fp.cod_cta?.trim());
        const mone = cta?.co_mone?.trim()?.toUpperCase() || 'BS';
        return (mone === 'VES' || mone === 'BS') ? 'BS' : 'USD';
      }
    }
    return 'BS';
  }


  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let saveSuccess = $state(false);
  let generatedDocNum = $state("");

  async function saveCobro() {
    // 1. Validar y limpiar retenciones de IVA/ISLR según si están habilitadas las secciones o no
    for (const doc of documentos) {
      if (checkedDocs[doc.nro_doc]) {
        const inp = docInputs[doc.nro_doc];
        if (inp.showIvaDetails && inp.reten_iva_bs > 0) {
          const compNum = (inp.num_comprobante_iva || "").trim();
          if (!compNum || compNum.toUpperCase() === "S/N" || compNum.toUpperCase() === "SN") {
            toast.error(
              `Debe ingresar el número de comprobante para la retención de IVA del documento ${doc.nro_doc}.`
            );
            saving = false;
            return;
          }
        } else if (!inp.showIvaDetails) {
          // Si está oculta, limpiar montos de retención para que no se cobren ni guarden
          if (inp.reten_iva_bs > 0 || inp.reten_iva > 0) {
            inp.reten_iva_bs = 0;
            inp.reten_iva = 0;
            recalculateDocAmounts(doc.nro_doc, doc);
          }
        }

        if (!inp.showIslrDetails) {
          if (inp.reten_islr_bs > 0 || inp.reten_islr > 0) {
            inp.reten_islr_bs = 0;
            inp.reten_islr = 0;
            recalculateDocAmounts(doc.nro_doc, doc);
          }
        }
      }
    }

    saving = true;
    saveError = null;

    const tasaCobro = currentExchangeRate;
    const firstSelectedParent = documentos.find(
      (d) =>
        checkedDocs[d.nro_doc] &&
        ["FACT", "NDEB", "N/DB", "GIRO", "AJPA"].includes(d.co_tipo_doc.trim()),
    );
    const parentDocNo = firstSelectedParent
      ? firstSelectedParent.nro_doc
      : null;

    let totalDocBs = 0;
    const renglones = documentos
      .filter((doc) => checkedDocs[doc.nro_doc])
      .map((doc) => {
        const inp = docInputs[doc.nro_doc];
        const isParent = ["FACT", "NDEB", "N/DB", "GIRO", "AJPA"].includes(
          doc.co_tipo_doc.trim(),
        );
        const docTasa = doc.tasa > 0 ? doc.tasa : 1;
        const saldoUsd = Math.round((doc.saldo / docTasa) * 100) / 100;
        
        const retIvaBs = inp.reten_iva_bs || 0;
        const retIslrBs = inp.reten_islr_bs || 0;
        
        // Calcular el abono total teorico en USD para pagar la factura completa
        const fullAbonoUsd = Math.round((saldoUsd - (inp.reten_iva || 0) - (inp.reten_islr || 0)) * 100) / 100;
        
        let montCobBs;
        if (Math.abs(Math.abs(inp.mont_cob) - fullAbonoUsd) < 0.005) {
          // Si es pago completo, mont_cob en Bs es exactamente el saldo restante del documento menos retenciones
          montCobBs = Math.round((doc.saldo - retIvaBs - retIslrBs) * 100) / 100;
          if (inp.mont_cob < 0) {
            montCobBs = -montCobBs;
          }
        } else {
          // Si es abono parcial, se calcula usando el de Bs directamente
          montCobBs = inp.mont_cob_bs || 0;
        }

        totalDocBs += montCobBs;

        return {
          co_tipo_doc: doc.co_tipo_doc,
          nro_doc: doc.nro_doc,
          mont_cob: montCobBs,
          monto_retencion_iva: retIvaBs,
          monto_retencion: retIslrBs,
          parent_doc: !isParent ? parentDocNo : null,
        };
      });

    if (renglones.length === 0) {
      toast.error(
        "Debe registrar al menos un abono o retención en los documentos.",
      );
      saving = false;
      return;
    }

    if (totalCobradoNeto > 0 && formasPago.length === 0) {
      toast.error(
        "Debe registrar al menos un instrumento de pago (Efectivo, Transferencia, etc.) para procesar el cobro.",
      );
      saving = false;
      return;
    }



    const retenciones_iva = documentos
      .filter((doc) => checkedDocs[doc.nro_doc] && docInputs[doc.nro_doc].reten_iva_bs > 0)
      .map((doc) => {
        const inp = docInputs[doc.nro_doc];
        const today = new Date();
        const periodStr =
          today.getFullYear() + String(today.getMonth() + 1).padStart(2, "0");

        return {
          nro_doc_asoc: doc.nro_doc,
          rif_contribuyente: selectedClient.rif,
          periodo_impositivo: Number(periodStr),
          fecha_documento: doc.fec_emis,
          rif_comprador: "J000000000",
          numero_documento: doc.nro_doc,
          numero_control_documento: doc.n_control,
          monto_documento: doc.total_neto,
          base_imponible: inp.base_imponible_iva_bs || 0,
          monto_ret_imp: inp.reten_iva_bs || 0,
          numero_documento_afectado: doc.nro_doc,
          num_comprobante: inp.num_comprobante_iva ? inp.num_comprobante_iva.trim() : "",
          monto_excento: 0,
          alicuota: inp.alicuota_iva,
        };
      });

    const retenciones_islr = documentos
      .filter((doc) => checkedDocs[doc.nro_doc] && docInputs[doc.nro_doc].reten_islr_bs > 0)
      .map((doc) => {
        const inp = docInputs[doc.nro_doc];
        return {
          nro_doc_asoc: doc.nro_doc,
          co_islr: inp.co_islr,
          monto: doc.total_neto - doc.monto_imp,
          monto_reten: inp.reten_islr_bs || 0,
          monto_obj: doc.total_neto - doc.monto_imp,
          sustraendo: 0,
          porc_retn: inp.porc_islr,
        };
      });

    const getFpCurrency = (fp: any) => {
      if (fp.cod_caja) {
        const caja = data.cajas?.find((c: any) => c.cod_caja?.trim() === fp.cod_caja?.trim());
        return caja?.co_mone?.trim()?.toUpperCase() || 'BS';
      }
      if (fp.cod_cta) {
        const cta = data.cuentasBancarias?.find((c: any) => c.cod_cta?.trim() === fp.cod_cta?.trim());
        return cta?.co_mone?.trim()?.toUpperCase() || 'BS';
      }
      return 'BS';
    };

    let totalFpBs = 0;
    const formas_pago_cleaned = formasPago.map((fp) => {
      const isBs = getRowCurrency(fp) === 'BS';
      const montDocBs = isBs ? (fp.mont_doc_bs || 0) : Math.round(fp.mont_doc * tasaCobro * 100) / 100;
      totalFpBs += montDocBs;
      return {
        forma_pag: fp.forma_pag,
        cod_caja: fp.cod_caja || null,
        cod_cta: fp.cod_cta || null,
        co_ban: fp.co_ban || null,
        co_tar: fp.co_tar || null,
        num_doc: fp.num_doc || null,
        mont_doc: montDocBs,
        fecha_che: fp.fecha_che || null,
        _moneda: getFpCurrency(fp),
      };
    });

    // Ajustar por diferencias de redondeo pequeñas si se paga en total
    const diffBs = Math.round((totalDocBs - totalFpBs) * 100) / 100;
    if (Math.abs(diffBs) > 0 && Math.abs(diffBs) < 5.00 && formas_pago_cleaned.length > 0) {
      // Intentar compensar primero en el primer instrumento de Bs/VES
      let targetFp = formas_pago_cleaned.find((fp) => fp._moneda === "BS" || fp._moneda === "VES");
      if (!targetFp) {
        // De lo contrario, usar el primero disponible (que será USD)
        targetFp = formas_pago_cleaned[0];
      }
      targetFp.mont_doc = Math.round((targetFp.mont_doc + diffBs) * 100) / 100;
      console.log(`[PAYMENTS] Rounding difference of ${diffBs} Bs compensated on instrument (${targetFp._moneda})`);
    }

    // Remover la propiedad temporal _moneda antes de enviar
    formas_pago_cleaned.forEach((fp) => delete fp._moneda);

    const selectedDocList = documentos.filter((doc) => checkedDocs[doc.nro_doc.trim()]);
    const firstSelectedDoc = selectedDocList[0];
    const collectionCurrency = firstSelectedDoc ? firstSelectedDoc.co_mone?.trim()?.toUpperCase() : (selectedClient.co_mone?.trim()?.toUpperCase() || "USD");
    const safeCollectionCurrency = collectionCurrency === "US$" ? "USD" : collectionCurrency;

    const payload = {
      co_cli: selectedClient.co_cli,
      co_ven: selectedClient.co_ven,
      co_mone: safeCollectionCurrency,
      tasa: tasaCobro,
      monto: totalDocBs,
      descrip: `COBRO CLIENTE ${selectedClient.co_cli}`,
      renglones,
      formas_pago: formas_pago_cleaned,
      retenciones_iva,
      retenciones_islr,
    };


    try {
      const res = await fetch(
        `/api/agent/payments?branch_id=${selectedBranch}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        const resJson = await res.json();
        const docNum = resJson.data?.doc_num || resJson.results?.[0]?.doc_num;
        if (resJson.success && docNum) {
          saveSuccess = true;
          generatedDocNum = docNum;
          toast.success("¡Cobro guardado con éxito!");
        } else {
          saveError = resJson.message || "Error al procesar el cobro.";
          toast.error(saveError);
        }
      } else {
        saveError = `Error HTTP del agente: ${res.statusText}`;
        toast.error(saveError);
      }
    } catch (e: any) {
      saveError = `Error de red: ${e.message}`;
      toast.error(saveError);
    } finally {
      saving = false;
    }
  }
</script>

<div
  class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32"
>
  <!-- CABECERA -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Wallet size={40} class="text-brand-500" />
        Registrar Cobros
      </h1>
      <p class="text-text-muted mt-2 text-lg">
        Módulo de cobranza rápido. Importa y abona a facturas pendientes.
      </p>
    </div>

    <div
      class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto"
    >
      <!-- Sede Selector -->
      {#if data.branches && data.branches.length > 1}
        <div class="w-full sm:w-56 relative group">
          <Store
            size={16}
            class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-brand-500 transition-colors pointer-events-none"
          />
          <select
            value={selectedBranch}
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

      <!-- Botón Importar Factura (Primary layout style like Importar Pedido) -->
      <button
        onclick={openImportModal}
        class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto text-sm"
      >
        <ShoppingBag size={18} />
        Importar Factura
      </button>

      <!-- Botón Ver Historial (Secondary layout style like Ver Historial of Facturas) -->
      <a
        href="/dashboard/cash/payments/history?branch_id={selectedBranch}"
        class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-surface-strong hover:bg-surface-base text-text-base border border-border-subtle transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto text-sm"
      >
        <Clock size={18} class="text-brand-400" />
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
        <h2 class="text-3xl font-black text-text-base">¡Cobro Registrado!</h2>
        <p class="text-text-muted">
          El cobro ha sido guardado exitosamente en Profit Plus.
        </p>
      </div>
      <div class="bg-white/5 px-6 py-4 rounded-2xl border border-white/5">
        <span
          class="text-xs text-text-muted/60 uppercase font-bold tracking-wider"
          >Documento Generado</span
        >
        <div class="text-2xl font-black text-brand-500 mt-1">
          {generatedDocNum}
        </div>
      </div>
      <div class="flex gap-4 w-full">
        <a
          href="/dashboard/cash/payments/history?branch_id={selectedBranch}"
          class="flex-1 text-center bg-white/5 hover:bg-white/10 text-text-base px-6 py-3.5 rounded-2xl font-bold transition-all text-sm flex items-center justify-center"
        >
          Volver al Historial
        </a>
        <button
          onclick={() => {
            saveSuccess = false;
            clearClient();
          }}
          class="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-brand-500/20 text-sm"
        >
          Registrar Otro Cobro
        </button>
      </div>
    </div>
  {:else}
    <!-- FORMULARIO DE COBRO SPLIT LAYOUT -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
      <!-- SECCIÓN IZQUIERDA: CLIENTE Y DOCUMENTOS (2/3 de ancho) -->
      <div class="xl:col-span-2 space-y-6">
        <!-- DATOS DEL CLIENTE -->
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
                No hay ningún cliente cargado. Haz clic en "Importar Factura"
                para iniciar.
              </p>
            </div>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4" in:fade>
              <div class="md:col-span-2 space-y-1">
                <span
                  class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                  >Nombre / Razón Social</span
                >
                <p class="text-base font-black text-text-base">
                  {selectedClient.descripcion}
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
              <div
                class="md:col-span-3 space-y-1 pt-2 border-t border-border-subtle/30"
              >
                <span
                  class="text-[9px] font-black uppercase tracking-widest text-text-muted"
                  >Estatus Fiscal</span
                >
                <p class="text-xs font-bold text-brand-400">
                  {#if selectedClient.contribu_e}
                    Contribuyente Especial ({selectedClient.porc_esp}% Ret. IVA)
                  {:else}
                    No Contribuyente
                  {/if}
                </p>
              </div>
            </div>
          {/if}
        </div>

        <!-- FACTURAS Y DEUDAS A COBRAR -->
        <div
          class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-4"
        >
          <h3
            class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2"
          >
            <Receipt size={16} />
            Facturas y Deudas a Cobrar
          </h3>

          {#if !selectedClient}
            <div
              class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-3"
            >
              <Receipt size={32} class="text-text-muted/30" />
              <p class="text-xs text-text-muted font-bold">
                No hay facturas cargadas. Se mostrarán al seleccionar un
                cliente.
              </p>
            </div>
          {:else if loadingDocs}
            <div
              class="p-12 flex flex-col items-center justify-center gap-4 text-center"
            >
              <RefreshCw size={32} class="animate-spin text-brand-500" />
              <p class="text-sm font-bold text-text-muted">
                Cargando cuentas pendientes del cliente...
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
                Este cliente se encuentra totalmente solvente en esta sucursal.
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
                          </div>
                          <div
                            class="text-xs text-text-muted/85 mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5"
                          >
                            <span
                              >Control: {doc.n_control?.trim() || "N/A"}</span
                            >
                            <span>•</span>
                            <span
                              >Emisión: {new Date(
                                doc.fec_emis,
                              ).toLocaleDateString("es-VE")}</span
                            >
                            <span>•</span>
                            <span class="text-brand-400 font-bold"
                              >Tasa Doc: {Number(doc.tasa).toFixed(2)}</span
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
                          {#if doc.co_tipo_doc.trim() === "N/CR"}-{/if}$ {(
                            doc.saldo / (doc.tasa > 0 ? doc.tasa : 1)
                          ).toLocaleString("de-DE", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <span
                          class="block text-xs text-text-muted font-bold mt-1"
                        >
                          Bs. {#if doc.co_tipo_doc.trim() === "N/CR"}-{/if}{Number(
                            doc.saldo,
                          ).toLocaleString("de-DE", {
                            minimumFractionDigits: 2,
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
                              Bs. {(
                                input.base_imponible_iva_bs || 0
                              ).toLocaleString("de-DE", {
                                minimumFractionDigits: 2,
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
                              value={Math.round(
                                (doc.monto_imp /
                                  (doc.tasa > 0 ? doc.tasa : 1)) *
                                  100,
                              ) / 100}
                              readonly
                              class="w-full bg-surface-soft border border-border-subtle px-3 py-2 rounded-xl text-sm text-text-base text-right font-bold cursor-not-allowed opacity-90"
                            />
                            <span
                              class="block text-xs text-text-muted font-bold text-right mt-1.5"
                            >
                              Bs. {Number(doc.monto_imp).toLocaleString(
                                "de-DE",
                                { minimumFractionDigits: 2 },
                              )}
                            </span>
                          </div>

                          <div>
                            <div
                              class="flex justify-between items-center mb-1.5"
                            >
                              <label
                                class="block text-xs font-black text-text-muted uppercase"
                                >Reten. IVA ($)</label
                              >
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
                                class="text-xs text-brand-500 font-bold hover:underline"
                              >
                                {input.showIvaDetails ? "Cerrar" : "Editar"}
                              </button>
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              value={input.showIvaDetails ? input.reten_iva : (() => {
                                const porcIva = (selectedClient && selectedClient.contribu_e) ? (Number(selectedClient.porc_esp) || 0) : 0;
                                const theoreticalRetIvaBs = Math.round((doc.monto_imp || 0) * (porcIva / 100) * 100) / 100;
                                return Math.round((theoreticalRetIvaBs / (doc.tasa > 0 ? doc.tasa : 1)) * 100) / 100;
                              })()}
                              readonly
                              class="w-full bg-surface-soft border border-border-subtle px-3 py-2 rounded-xl text-sm font-bold text-green-400 text-right cursor-not-allowed opacity-90"
                            />
                            <span
                              class="block text-xs text-green-500 font-black text-right mt-1.5"
                            >
                              Bs. {(
                                input.showIvaDetails ? (input.reten_iva_bs || 0) : (() => {
                                  const porcIva = (selectedClient && selectedClient.contribu_e) ? (Number(selectedClient.porc_esp) || 0) : 0;
                                  return Math.round((doc.monto_imp || 0) * (porcIva / 100) * 100) / 100;
                                })()
                              ).toLocaleString("de-DE", {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          </div>

                          <div>
                            <div
                              class="flex justify-between items-center mb-1.5"
                            >
                              <label
                                class="block text-xs font-black text-text-muted uppercase"
                                >Reten. ISLR ($)</label
                              >
                              <button
                                onclick={() => {
                                  input.showIslrDetails = !input.showIslrDetails;
                                  if (!input.showIslrDetails) {
                                    input.reten_islr_bs = 0;
                                    input.reten_islr = 0;
                                    input.manual_override_islr = true;
                                  } else {
                                    input.manual_override_islr = false;
                                  }
                                  recalculateDocAmounts(doc.nro_doc.trim(), doc);
                                }}
                                class="text-xs text-brand-500 font-bold hover:underline"
                              >
                                {input.showIslrDetails ? "Cerrar" : "Editar"}
                              </button>
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              bind:value={input.reten_islr}
                              readonly
                              class="w-full bg-surface-soft border border-border-subtle px-3 py-2 rounded-xl text-sm font-bold text-amber-400 text-right cursor-not-allowed opacity-90"
                            />
                            <span
                              class="block text-xs text-amber-400 font-black text-right mt-1.5"
                            >
                              Bs. {(
                                input.reten_islr_bs || 0
                              ).toLocaleString("de-DE", {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        </div>

                        <!-- Detalles Retención IVA (Inputs manuales) -->
                        {#if input.showIvaDetails}
                          <div
                            class="bg-green-500/5 border border-green-500/20 p-4 rounded-2xl space-y-3 text-xs animate-in slide-in-from-top-2 duration-150"
                          >
                            <div class="flex justify-between items-center">
                              <span class="font-bold text-green-400"
                                >Datos Comprobante Retención IVA</span
                              >
                              <button
                                onclick={() => {
                                  input.showIvaDetails = false;
                                  input.reten_iva_bs = 0;
                                  input.reten_iva = 0;
                                  input.manual_override_iva = true;
                                  recalculateDocAmounts(doc.nro_doc.trim(), doc);
                                }}
                                class="text-text-muted hover:text-text-base"
                                ><X size={14} /></button
                              >
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
                              <div>
                                <span
                                  class="text-[9px] text-text-muted font-bold block mb-1"
                                  >NRO. COMPROBANTE</span
                                >
                                <input
                                  type="text"
                                  placeholder="Ej: 2026060001"
                                  bind:value={input.num_comprobante_iva}
                                  class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs"
                                />
                              </div>
                              <div>
                                <span
                                  class="text-[9px] text-text-muted font-bold block mb-1"
                                  >BASE IMPONIBLE</span
                                >
                                <input
                                  type="number"
                                  step="0.01"
                                  bind:value={input.base_imponible_iva}
                                  class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs text-right"
                                />
                              </div>
                              <div>
                                <span
                                  class="text-[9px] text-text-muted font-bold block mb-1"
                                  >ALÍCUOTA (%)</span
                                >
                                <input
                                  type="number"
                                  bind:value={input.alicuota_iva}
                                  class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs text-right"
                                />
                              </div>
                              <div>
                                <span
                                  class="text-[9px] text-text-muted font-bold block mb-1 font-semibold text-green-400"
                                  >MTO RETENIDO ($)</span
                                >
                                <input
                                  type="number"
                                  step="0.01"
                                  bind:value={input.reten_iva}
                                  oninput={() => {
                                    input.manual_override_iva = true;
                                    recalculateDocAmounts(
                                      doc.nro_doc.trim(),
                                      doc,
                                    );
                                  }}
                                  class="w-full bg-surface-soft border border-green-500/30 text-green-400 font-bold px-2 py-1.5 rounded-lg text-xs text-right focus:border-green-500 focus:ring-0 focus:outline-hidden"
                                />
                              </div>
                            </div>
                          </div>
                        {/if}

                        <!-- Detalles Retención ISLR (Inputs manuales) -->
                        {#if input.showIslrDetails}
                          <div
                            class="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl space-y-3 text-xs animate-in slide-in-from-top-2 duration-150"
                          >
                            <div class="flex justify-between items-center">
                              <span class="font-bold text-amber-300"
                                >Datos Retención ISLR / Municipal</span
                              >
                              <button
                                onclick={() => {
                                  input.showIslrDetails = false;
                                  input.reten_islr_bs = 0;
                                  input.reten_islr = 0;
                                  input.manual_override_islr = true;
                                  recalculateDocAmounts(doc.nro_doc.trim(), doc);
                                }}
                                class="text-text-muted hover:text-text-base"
                                ><X size={14} /></button
                              >
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <span
                                  class="text-[9px] text-text-muted font-bold block mb-1"
                                  >CONCEPTO</span
                                >
                                <input
                                  type="text"
                                  placeholder="Ej: 001"
                                  bind:value={input.co_islr}
                                  class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs"
                                />
                              </div>
                              <div>
                                <span
                                  class="text-[9px] text-text-muted font-bold block mb-1"
                                  >PORCENTAJE (%)</span
                                >
                                <input
                                  type="number"
                                  step="0.1"
                                  bind:value={input.porc_islr}
                                  oninput={() => {
                                    const docTasa = doc.tasa > 0 ? doc.tasa : 1;
                                    const baseImpBs = doc.total_neto - doc.monto_imp;
                                    input.reten_islr_bs = Math.round(baseImpBs * (input.porc_islr / 100) * 100) / 100;
                                    input.reten_islr = Math.round((input.reten_islr_bs / docTasa) * 100) / 100;
                                    recalculateDocAmounts(
                                      doc.nro_doc.trim(),
                                      doc,
                                    );
                                  }}
                                  class="w-full bg-surface-soft border border-border-subtle px-2 py-1.5 rounded-lg text-xs text-right"
                                />
                              </div>
                              <div>
                                <span
                                  class="text-[9px] text-text-muted font-bold block mb-1 font-semibold text-amber-400"
                                  >MTO RETENIDO ($)</span
                                >
                                <input
                                  type="number"
                                  step="0.01"
                                  bind:value={input.reten_islr}
                                  oninput={() => {
                                    input.manual_override_islr = true;
                                    recalculateDocAmounts(
                                      doc.nro_doc.trim(),
                                      doc,
                                    );
                                  }}
                                  class="w-full bg-surface-soft border border-amber-500/30 text-amber-300 font-bold px-2 py-1.5 rounded-lg text-xs text-right focus:border-amber-500 focus:ring-0 focus:outline-hidden"
                                />
                              </div>
                            </div>
                          </div>
                        {/if}

                        <!-- Alerta IGTF -->
                        {#if doc.otros1 > 0}
                          <div
                            class="flex items-center justify-between bg-brand-500/5 border border-brand-500/10 p-3.5 rounded-2xl text-xs animate-in slide-in-from-top-2 duration-150 mb-3"
                          >
                            <span
                              class="font-bold text-brand-400 flex items-center gap-1.5"
                            >
                              <Landmark size={14} />
                              Impuesto IGTF (3%) Incluido:
                            </span>
                            <div class="text-right">
                              <span class="font-mono font-black text-brand-400">
                                $ {Number(
                                  doc.otros1 / (doc.tasa > 0 ? doc.tasa : 1),
                                ).toLocaleString("de-DE", {
                                  minimumFractionDigits: 2,
                                })}
                              </span>
                              <span
                                class="block text-xs text-text-muted font-bold mt-1"
                              >
                                Bs. {Number(doc.otros1).toLocaleString(
                                  "de-DE",
                                  { minimumFractionDigits: 2 },
                                )}
                              </span>
                            </div>
                          </div>
                        {/if}

                        <!-- Alerta Diferencial Cambiario (N/DB) para facturas de días anteriores -->
                        {#if doc.co_tipo_doc.trim() !== "N/CR"}
                          {@const docFecEmisStr = doc.fec_emis ? new Date(doc.fec_emis).toISOString().split('T')[0] : ''}
                          {@const todayStr = new Date().toISOString().split('T')[0]}
                          {@const isPreviousDateDoc = docFecEmisStr && docFecEmisStr < todayStr}
                          {@const docTasa = doc.tasa > 0 ? doc.tasa : 1}
                          {@const diffBs = (isPreviousDateDoc && doc.saldo > 0 && currentExchangeRate > docTasa) 
                            ? Math.max(0, Math.round(((doc.saldo / docTasa * currentExchangeRate) - doc.saldo) * 100) / 100)
                            : 0}
                          {#if isPreviousDateDoc && diffBs > 0}
                            <div
                              class="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 p-3.5 rounded-2xl text-xs animate-in slide-in-from-top-2 duration-150 mb-3"
                            >
                              <span
                                class="font-bold text-blue-400 flex items-center gap-1.5"
                              >
                                <RefreshCw size={14} />
                                Diferencial Cambiario (N/DB a generar):
                              </span>
                              <div class="text-right">
                                <span class="font-mono font-black text-blue-400">
                                  {diffBs >= 0 ? '+' : '-'}Bs. {Math.abs(diffBs).toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                                </span>
                                <span
                                  class="block text-xs text-text-muted font-bold mt-0.5"
                                >
                                  {diffBs >= 0 ? '+' : '-'} $ {Math.abs(Number(diffBs / currentExchangeRate)).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          {/if}
                        {/if}

                        <!-- Neto Cobrado Calculado (Solo Lectura) -->
                        {#if doc.co_tipo_doc.trim() !== "N/CR" && input.mont_cob > 0}
                          <div
                            class="flex flex-col sm:flex-row sm:items-center justify-between border-t border-border-subtle/40 pt-3 gap-3"
                          >
                            <span class="text-xs text-text-muted font-bold"
                              >Monto Abonado por este documento:</span
                            >
                            <div class="flex items-center gap-3">
                              <span class="text-sm font-bold text-brand-400 font-mono">
                                $ {input.mont_cob.toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                              </span>
                              <div class="text-right shrink-0 min-w-[120px]">
                                <span
                                  class="block text-xs text-text-muted font-bold"
                                >
                                  Bs. {(
                                    input.mont_cob_bs || 0
                                  ).toLocaleString("de-DE", {
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

          <div
            class="flex items-center justify-between border-b border-border-subtle pb-4 relative z-10"
          >
            <h4
              class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2"
            >
              <Receipt size={16} />
              Resumen de Cobro
            </h4>
          </div>

          <div class="space-y-4 relative z-10 text-sm">
            <div
              class="flex justify-between items-center text-base font-bold text-text-muted"
            >
              <span>Abonado Neto</span>
              <span class="font-mono text-text-base"
                >$ {totalCobradoNeto.toLocaleString("de-DE", {
                  minimumFractionDigits: 2,
                })}</span
              >
            </div>
            <div
              class="flex justify-between items-center text-base font-bold text-text-muted"
            >
              <span>Retenciones IVA</span>
              <span class="font-mono text-green-400"
                >$ {totalRetenidoIvaVista.toLocaleString("de-DE", {
                  minimumFractionDigits: 2,
                })}</span
              >
            </div>
            <div
              class="flex justify-between items-center text-base font-bold text-text-muted"
            >
              <span>Retenciones ISLR</span>
              <span class="font-mono text-amber-300"
                >$ {totalRetenidoIslrVista.toLocaleString("de-DE", {
                  minimumFractionDigits: 2,
                })}</span
              >
            </div>
            {#if totalIgtf > 0}
              <div
                class="flex justify-between items-center text-base font-bold text-brand-400"
                transition:slide
              >
                <span>Impuesto IGTF (3%)</span>
                <span class="font-mono"
                  >$ {totalIgtf.toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                  })}</span
                >
              </div>
            {/if}
            <div
              class="flex justify-between items-center text-base font-bold text-text-muted border-t border-border-subtle/50 pt-4"
            >
              <span>Instrumentos Recibidos</span>
              <span class="font-mono text-text-base"
                >$ {totalInstrumentosPago.toLocaleString("de-DE", {
                  minimumFractionDigits: 2,
                })}</span
              >
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
                <span class="font-mono text-red-400 font-black">
                  $ {diferenciaCuadre.toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
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
                  >Saldo pendiente por cobrar</span
                >
                <div
                  class="text-5xl font-black text-text-base drop-shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)] tracking-tight leading-none text-brand-400"
                >
                  $ {saldoPendientePorCobrar.toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- INSTRUMENTOS DE PAGO -->
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
              Instrumentos Recibidos
            </h4>
            {#if selectedClient}
              <button
                onclick={addFormaPago}
                class="flex items-center gap-1 bg-brand-600/10 hover:bg-brand-600/25 border border-brand-600/30 text-brand-400 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <Plus size={12} />
                Agregar
              </button>
            {/if}
          </div>

          {#if !selectedClient}
            <div
              class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-3 text-text-muted relative z-10 bg-surface-soft/20"
            >
              <CreditCard size={24} class="opacity-30" />
              <p class="text-xs">
                Carga un cliente para configurar las formas de pago.
              </p>
            </div>
          {:else if formasPago.length === 0}
            <div
              class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-3 text-text-muted relative z-10 bg-surface-soft/20"
            >
              <CreditCard size={24} class="opacity-30" />
              <p class="text-xs">
                Agrega efectivo, transferencia o tarjetas para liquidar la
                diferencia de cuadre.
              </p>
              <button
                onclick={addFormaPago}
                class="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-xl text-xs font-black transition-all text-xs shadow-md cursor-pointer"
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
                    <!-- Tipo Instrumento -->
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
                        <option value="TJ">Tarjeta de Débito/Crédito</option>
                        <option value="TE">Transferencia Bancaria</option>
                        <option value="DP">Depósito Bancario</option>
                        <option value="CH">Cheque</option>
                      </select>
                    </div>

                    <!-- Caja (Para EF o TJ) -->
                    {#if fp.forma_pag === "EF" || fp.forma_pag === "TJ"}
                      <div>
                        <span
                          class="text-[9px] text-text-muted font-bold block mb-1 uppercase"
                          >Caja Destino</span
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

                    <!-- Cuenta Destino y Banco Emisor (TE, DP, CH) -->
                    {#if fp.forma_pag === "TE" || fp.forma_pag === "DP" || fp.forma_pag === "CH"}
                      <div class="grid grid-cols-2 gap-2">
                        <div>
                          <span
                            class="text-[9px] text-text-muted font-bold block mb-1 uppercase"
                            >Cuenta Destino</span
                          >
                          <select
                            bind:value={fp.cod_cta}
                            onchange={() => handleCajaCtaChange(index)}
                            class="w-full h-12 px-2 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-[10px] cursor-pointer text-text-base"
                          >
                            {#each data.cuentasBancarias as cb}
                              <option value={cb.cod_cta}
                                >{cb.descrip} ({cb.co_mone})</option
                              >
                            {/each}
                          </select>
                        </div>
                        <div>
                          <span
                            class="text-[9px] text-text-muted font-bold block mb-1 uppercase"
                            >Banco Emisor</span
                          >
                          <select
                            bind:value={fp.co_ban}
                            class="w-full h-12 px-2 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-[10px] cursor-pointer text-text-base"
                          >
                            {#each data.bancos as b}
                              <option value={b.co_ban}>{b.ban_des}</option>
                            {/each}
                          </select>
                        </div>
                      </div>
                    {/if}

                    <!-- Tarjeta -->
                    {#if fp.forma_pag === "TJ"}
                      <div>
                        <span
                          class="text-[9px] text-text-muted font-bold block mb-1 uppercase"
                          >Tipo Tarjeta</span
                        >
                        <select
                          bind:value={fp.co_tar}
                          class="w-full h-12 px-4 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-xs cursor-pointer text-text-base"
                        >
                          {#each data.tarjetasCredito as t}
                            <option value={t.co_tar}>{t.tar_des}</option>
                          {/each}
                        </select>
                      </div>
                    {/if}

                    <!-- Datos Referencia / Fecha -->
                    {#if fp.forma_pag !== "EF"}
                      <div class="grid grid-cols-2 gap-2">
                        <div>
                          <span
                            class="text-[9px] text-text-muted font-bold block mb-1 uppercase"
                            >Nro. Referencia</span
                          >
                          <input
                            type="text"
                            placeholder="Ej: 098765"
                            bind:value={fp.num_doc}
                            class="w-full h-12 px-4 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-bold text-xs text-text-base"
                          />
                        </div>
                        <div>
                          <span
                            class="text-[9px] text-text-muted font-bold block mb-1 uppercase"
                            >Fecha Cheque/Transf</span
                          >
                          <input
                            type="date"
                            bind:value={fp.fecha_che}
                            class="w-full h-12 px-4 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-bold text-xs text-text-base"
                          />
                        </div>
                      </div>
                    {/if}

                    <!-- Monto -->
                    <div>
                      <span
                        class="text-[9px] text-text-muted font-bold block mb-1 uppercase"
                        >Monto Instrumento ({getRowCurrency(fp) === 'BS' ? 'Bs.' : 'USD'})</span
                      >
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={getRowCurrency(fp) === 'BS' ? (Math.round((fp.mont_doc_bs || 0) * 100) / 100) : (Math.round((fp.mont_doc || 0) * 100) / 100)}
                        oninput={(e) => {
                          const val = Number(e.currentTarget.value) || 0;
                          if (getRowCurrency(fp) === 'BS') {
                            fp.mont_doc_bs = val;
                            fp.mont_doc = Math.round((val / (currentExchangeRate > 0 ? currentExchangeRate : 1)) * 100) / 100;
                          } else {
                            fp.mont_doc = val;
                            fp.mont_doc_bs = Math.round(val * currentExchangeRate * 100) / 100;
                          }
                        }}
                        class="w-full h-12 px-4 bg-surface-soft border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-black text-xs text-text-base text-right"
                      />
                      <span
                        class="block text-[9px] text-text-muted/60 text-right mt-1 font-bold"
                      >
                        {getRowCurrency(fp) === 'BS' ? 'Equivalente USD:' : 'Equivalente Bs.:'} {(
                          getRowCurrency(fp) === 'BS'
                            ? (fp.mont_doc || 0)
                            : (fp.mont_doc_bs || 0)
                        ).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- BOTÓN DE GUARDADO H-20 DIRECTO -->
        {#if selectedClient}
          <button
            disabled={(expectedNetPayUsd > 0 && (formasPago.length === 0 || totalInstrumentosPago <= 0)) ||
              saving ||
              !documentos.some((doc) => checkedDocs[doc.nro_doc])}
            onclick={saveCobro}
            class="w-full h-20 bg-brand-600 hover:bg-brand-500 disabled:bg-surface-soft text-white disabled:text-text-muted/30 rounded-[24px] font-black text-lg uppercase tracking-[0.2em] transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-4 shadow-xl shadow-brand-500/10 hover:shadow-brand-500/30 group relative z-10 cursor-pointer"
          >
            {#if saving}
              <RefreshCw size={24} class="animate-spin text-brand-400/40" />
              <span class="animate-pulse">Procesando...</span>
            {:else}
              <div
                class="bg-surface-strong/50 p-2.5 rounded-xl group-hover:scale-110 transition-transform"
              >
                <Wallet size={24} />
              </div>
              <span>Guardar</span>
            {/if}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- MODAL IMPORTAR FACTURA PENDIENTE -->
{#if showImportModal}
  <div
    class="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 md:p-6"
    transition:fade={{ duration: 150 }}
  >
    <div
      class="w-full max-w-2xl bg-surface-base border border-border-subtle rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] relative z-10 animate-in zoom-in-95 duration-200"
    >
      <!-- Modal Header -->
      <div
        class="p-8 border-b border-border-subtle flex justify-between items-center bg-surface-soft/50"
      >
        <div>
          <h2 class="text-2xl font-black tracking-tight">
            Importar Factura / Deuda
          </h2>
          <p class="text-text-muted text-sm">
            Buscar facturas con saldo pendiente del cliente
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

      <!-- Contenido Modal -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        <!-- Buscador -->
        <div class="relative">
          <Search
            size={18}
            class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Buscar por nro. factura, cédula/RIF o nombre de cliente..."
            bind:value={searchQuery}
            oninput={searchPendingInvoices}
            class="w-full bg-surface-soft border border-border-subtle pl-12 pr-4 py-3.5 rounded-2xl text-sm text-text-base placeholder-text-muted/50 focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all"
          />
          {#if searchingInvoices}
            <RefreshCw
              size={16}
              class="animate-spin absolute right-4 top-1/2 -translate-y-1/2 text-brand-500"
            />
          {/if}
        </div>

        <!-- Resultados -->
        <div class="space-y-3">
          {#if pendingInvoices.length > 0}
            <div
              class="space-y-3 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar"
            >
              {#each pendingInvoices as inv}
                {@const isNcr = inv.co_tipo_doc.trim() === "N/CR"}
                {@const rawUsd = inv.saldo / (inv.tasa > 0 ? inv.tasa : 1)}
                {@const formattedUsd =
                  (isNcr ? "-" : "") +
                  rawUsd.toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                {@const formattedBs =
                  (isNcr ? "-" : "") +
                  Number(inv.saldo).toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}

                <ImportItemCard
                  docType={inv.co_tipo_doc}
                  docNum={inv.nro_doc}
                  clientName={inv.cli_des?.trim()}
                  clientRif={inv.rif ? `${inv.rif.trim()} ` : null}
                  dateEmis={new Date(inv.fec_emis).toLocaleDateString("es-VE")}
                  amountUsd={formattedUsd}
                  amountBs={formattedBs}
                  branchName={inv.sede_nombre}
                  statusLabel={inv.contribu_e ? "Esp." : null}
                  statusClass={inv.contribu_e
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : null}
                  onclick={() => selectInvoice(inv)}
                />
              {/each}
            </div>
          {:else if searchQuery.trim() !== "" && !searchingInvoices}
            <div
              class="p-8 text-center text-sm text-text-muted bg-white/[0.01] rounded-2xl border border-dashed border-white/5"
            >
              No se encontraron facturas o deudas pendientes que coincidan con
              la búsqueda.
            </div>
          {:else if !searchingInvoices}
            <div
              class="p-8 text-center text-sm text-text-muted bg-white/[0.01] rounded-2xl border border-dashed border-white/5"
            >
              Introduce un término de búsqueda para localizar facturas con
              saldos pendientes.
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
