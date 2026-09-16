<!-- src/routes/dashboard/warehouse/receipts/+page.svelte -->
<script lang="ts">
  import { fade, slide, scale } from "svelte/transition";
  import {
    Inbox,
    Search,
    Filter,
    Plus,
    FileText,
    ArrowRight,
    Printer,
    Trash2,
    Building,
    ShoppingBag,
    RefreshCw,
    CheckCircle2,
    AlertTriangle,
    X,
    ShieldAlert,
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
    User,
    Sparkles
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { deserialize } from "$app/forms";
  import dayjs from "dayjs";
  import "dayjs/locale/es";
  import ImportItemCard from "$lib/components/ui/ImportItemCard.svelte";

  dayjs.locale("es");

  let { data } = $props();

  // Active Reception State
  let filterSede = $state(data.selectedBranchId || "");
  let showUSD = $state(true);
  let activeTasa = $state(data.tasa || 1);

  let selectedOrders = $state<any[]>([]);
  let receiptLines = $state<any[]>([]);
  let observations = $state("");
  let nroFacturaProveedor = $state("");
  let isSavingReceipt = $state(false);

  // Orden principal y criterios de compatibilidad (mismo proveedor y mismo comprador)
  const primaryOrder = $derived(selectedOrders[0] || null);
  const primarySupplier = $derived(
    primaryOrder
      ? {
          co_prov: primaryOrder.co_prov,
          prov_des: primaryOrder.prov_des,
          rif: primaryOrder.rif,
          prov_dir: primaryOrder.prov_dir,
          telefonos: primaryOrder.telefonos,
          co_cond: primaryOrder.co_cond,
          cond_des: primaryOrder.cond_des,
          co_mone: primaryOrder.co_mone
        }
      : null
  );
  const primaryBuyer = $derived(primaryOrder?.co_us_in?.trim().toUpperCase() || null);

  function getBuyerName(code?: string) {
    if (!code) return "Sin Comprador";
    const upper = code.trim().toUpperCase();
    return data.buyersMap?.[upper] ? `${data.buyersMap[upper]} (${upper})` : upper;
  }

  // Edit Mode State
  let isEditing = $state(false);
  let editingDocNum = $state("");

  $effect(() => {
    const p = data.preloadedReceipt;
    if (p && p.doc_num && p.doc_num !== editingDocNum) {
      isEditing = true;
      editingDocNum = p.doc_num;

      const cleanDescrip = (p.descrip || "")
        .replace(/\s*\|\s*EDITADO V[IÍ]A API/gi, "")
        .replace(/\s*\|\s*CREADO V[IÍ]A API/gi, "")
        .trim();
      const cleanComment = (p.comentario || "")
        .replace(/\s*\|\s*EDITADO V[IÍ]A API/gi, "")
        .replace(/\s*\|\s*CREADO V[IÍ]A API/gi, "")
        .trim();
      observations = cleanDescrip;
      nroFacturaProveedor = p.nro_fact ? p.nro_fact.trim() : "";

      const distinctOCs = [...new Set(
        (p.renglones || [])
          .map((r: any) => (r.num_doc || "").trim())
          .filter(Boolean)
      )];

      if (distinctOCs.length > 0) {
        selectedOrders = distinctOCs.map((ocNum) => ({
          doc_num: ocNum,
          co_prov: p.co_prov,
          prov_des: p.prov_des,
          rif: p.rif,
          prov_dir: p.prov_dir,
          telefonos: p.telefonos,
          co_cond: p.co_cond,
          cond_des: p.cond_des,
          co_mone: p.co_mone,
          tasa: p.tasa,
          co_us_in: p.oc_co_us_in || p.co_us_in,
          nro_fact: p.nro_fact ? p.nro_fact.trim() : "",
          comentario: cleanComment
        }));
      } else {
        selectedOrders = [{
          doc_num: p.orden_compra || (p.renglones && p.renglones[0]?.num_doc) || p.n_control,
          co_prov: p.co_prov,
          prov_des: p.prov_des,
          rif: p.rif,
          prov_dir: p.prov_dir,
          telefonos: p.telefonos,
          co_cond: p.co_cond,
          cond_des: p.cond_des,
          co_mone: p.co_mone,
          tasa: p.tasa,
          co_us_in: p.oc_co_us_in || p.co_us_in,
          nro_fact: p.nro_fact ? p.nro_fact.trim() : "",
          comentario: cleanComment
        }];
      }

      receiptLines = (p.renglones || []).map((l: any) => {
        const cantActual = Number(l.cantidad || l.total_art || 0);
        const cantPendiente = Number(l.cant_pendiente != null ? l.cant_pendiente : (l.cant_original || cantActual));
        const cantOriginal = Number(l.cant_original != null ? l.cant_original : cantPendiente);
        return {
          ...l,
          doc_num: (l.num_doc || p.orden_compra || "").trim(),
          checked: cantActual > 0,
          cant_recibida: cantActual,
          cant_pendiente: cantPendiente > 0 ? cantPendiente : cantActual,
          cant_original: cantOriginal > 0 ? cantOriginal : cantActual,
          co_alma: l.co_alma || data.defaultWarehouse || "01",
          isNewlyAdded: false
        };
      });
    }
  });

  // Buscador de artículos en renglones
  let linesSearchTerm = $state("");

  let filteredReceiptLines = $derived.by(() => {
    const term = linesSearchTerm.trim().toLowerCase();
    if (!term) {
      return receiptLines.map((line, originalIndex) => ({ line, originalIndex }));
    }
    return receiptLines
      .map((line, originalIndex) => ({ line, originalIndex }))
      .filter(({ line }) => {
        const code = String(line.co_art || "").toLowerCase();
        const desc = String(line.art_des || "").toLowerCase();
        const mod = String(line.modelo || "").toLowerCase();
        const ref = String(line.referencia || "").toLowerCase();
        return code.includes(term) || desc.includes(term) || mod.includes(term) || ref.includes(term);
      });
  });

  // Success State
  let saveSuccess = $state(false);
  let generatedDocNum = $state("");
  let savedBranchId = $state("");

  // Import Modal State
  let showImportModal = $state(false);
  let importSearchQuery = $state("");
  let isSearchingOrders = $state(false);
  let foundOrders = $state<any[]>([]);
  let isLoadingOrderDetail = $state(false);

  // Sede actual configurada
  const selectedBranchConfig = $derived(
    data.branches?.find(
      (b: any) => String(b.id).toLowerCase() === String(filterSede).toLowerCase()
    )
  );

  // Almacén por defecto
  const defaultWarehouseName = $derived.by(() => {
    const defaultCode = (data.defaultWarehouse || "01").trim();
    const w = data.warehouses?.find((wh: any) => wh.co_alma?.trim() === defaultCode);
    if (w) {
      const name = w.des_alma?.trim() || w.alma_des?.trim();
      return name ? `${name} (${defaultCode})` : `Almacén ${defaultCode}`;
    }
    // Buscar en renglones de la orden si traen des_alma_original
    const firstWithDes = receiptLines.find((l) => l.des_alma_original);
    if (firstWithDes) {
      return `${firstWithDes.des_alma_original.trim()} (${firstWithDes.co_alma_original?.trim() || defaultCode})`;
    }
    return `Almacén ${defaultCode}`;
  });

  function handleBranchChange() {
    const params = new URLSearchParams($page.url.searchParams);
    if (filterSede) params.set("branch_id", filterSede);
    else params.delete("branch_id");
    goto(`?${params.toString()}`);
  }

  // Resumen de Cantidades Físicas (Sin precios en UI)
  const totals = $derived.by(() => {
    const selectedLines = receiptLines.filter((l) => l.checked && Number(l.cant_recibida) > 0);
    const totalLinesCount = selectedLines.length;
    const totalUnitsCount = selectedLines.reduce((acc, l) => acc + Number(l.cant_recibida || 0), 0);

    // Verificar si la recepción es total o parcial
    let allPendingReceived = true;
    let anyPendingRemaining = false;

    for (const l of receiptLines) {
      const pending = Number(l.cant_pendiente || 0);
      const received = l.checked ? Number(l.cant_recibida || 0) : 0;

      if (received < pending) {
        allPendingReceived = false;
        anyPendingRemaining = true;
      }
    }

    return {
      selectedLines,
      totalLinesCount,
      totalUnitsCount,
      isFullyReceived: allPendingReceived && totalUnitsCount > 0,
      isPartiallyReceived: anyPendingRemaining && totalUnitsCount > 0
    };
  });

  function formatQuantity(val: number) {
    return Number(val || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  // --- BUSCAR ÓRDENES DE COMPRA EN MODAL ---
  async function searchPendingOrders() {
    if (!filterSede) {
      toast.error("Selecciona una sucursal primero.");
      return;
    }
    isSearchingOrders = true;
    foundOrders = [];

    try {
      const formData = new FormData();
      formData.append("branch_id", filterSede);
      formData.append("search", importSearchQuery);

      // Si ya hay al menos una orden cargada, filtramos estrictamente por ese mismo proveedor y comprador
      if (primaryOrder) {
        if (primaryOrder.co_prov) {
          formData.append("co_prov", primaryOrder.co_prov.trim());
        }
        if (primaryBuyer) {
          formData.append("co_us_in", primaryBuyer.trim());
        }
      }

      const res = await fetch("?/searchPendingOrders", {
        method: "POST",
        body: formData
      });

      const result = deserialize(await res.text());
      if (result.type === "success" && (result.data as any)?.orders) {
        let orders = (result.data as any).orders || [];

        // Asegurar filtro en cliente si ya hay orden cargada (doble garantía: mismo proveedor y comprador)
        if (primaryOrder) {
          const reqProv = (primaryOrder.co_prov || "").trim().toUpperCase();
          const reqBuyer = (primaryBuyer || "").trim().toUpperCase();
          orders = orders.filter((o: any) => {
            const oProv = (o.co_prov || "").trim().toUpperCase();
            const oBuyer = (o.co_us_in || "").trim().toUpperCase();
            return (!reqProv || oProv === reqProv) && (!reqBuyer || oBuyer === reqBuyer);
          });
        }

        foundOrders = orders;
      } else if (result.type === "failure") {
        toast.error((result.data as any)?.message || "Error al buscar órdenes.");
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Error de conexión al buscar órdenes.");
    } finally {
      isSearchingOrders = false;
    }
  }

  function openImportModal() {
    if (!filterSede) {
      toast.error("Seleccione una sucursal primero");
      return;
    }
    showImportModal = true;
    searchPendingOrders();
  }

  // --- SELECCIONAR E INCORPORAR ORDEN DE COMPRA ---
  async function selectOrder(order: any) {
    const isAlreadyLoaded = selectedOrders.some(
      (o) => o.doc_num?.trim().toUpperCase() === order.doc_num?.trim().toUpperCase()
    );

    // Validar compatibilidad estricta de proveedor y comprador si ya hay órdenes cargadas
    if (primaryOrder) {
      const pProv = (primaryOrder.co_prov || "").trim().toUpperCase();
      const oProv = (order.co_prov || "").trim().toUpperCase();
      if (pProv && oProv && pProv !== oProv) {
        toast.error(`No se puede agregar: La orden es del proveedor (${order.prov_des || order.co_prov}), pero la recepción actual es para (${primarySupplier?.prov_des || primaryOrder.co_prov}).`);
        return;
      }

      const pBuyer = (primaryBuyer || "").trim().toUpperCase();
      const oBuyer = (order.co_us_in || "").trim().toUpperCase();
      if (pBuyer && oBuyer && pBuyer !== oBuyer) {
        toast.error(`No se puede agregar: El comprador de la orden (${getBuyerName(order.co_us_in)}) no coincide con el comprador de la recepción (${getBuyerName(primaryBuyer)}).`);
        return;
      }
    }

    isLoadingOrderDetail = true;
    try {
      const formData = new FormData();
      formData.append("branch_id", filterSede);
      formData.append("doc_num", order.doc_num);

      const res = await fetch("?/getOrderDetail", {
        method: "POST",
        body: formData
      });

      const result = deserialize(await res.text());

      if (result.type === "success" && (result.data as any)?.order) {
        const orderData = (result.data as any).order;
        // Preservar co_us_in de order si orderData no lo trae
        if (!orderData.co_us_in && order.co_us_in) {
          orderData.co_us_in = order.co_us_in;
        }

        // Si la orden aún no está en selectedOrders, la agregamos
        if (!isAlreadyLoaded) {
          selectedOrders = [...selectedOrders, orderData];
        }

        const incomingRenglones = orderData.renglones || [];
        let addedCount = 0;
        let reactivatedCount = 0;
        const newLinesToAdd: any[] = [];

        for (const l of incomingRenglones) {
          const pending = Number(l.cant_pendiente != null ? l.cant_pendiente : l.pendiente);
          const original = Number(l.cant_original != null ? l.cant_original : l.total_art);

          // Buscar si este renglón ya está en receiptLines
          const existingIndex = receiptLines.findIndex((rl) => {
            const sameDoc = (rl.doc_num || "").trim().toUpperCase() === (orderData.doc_num || "").trim().toUpperCase();
            if (!sameDoc) return false;
            if (rl.rowguid_doc && l.rowguid_doc) {
              return String(rl.rowguid_doc).toLowerCase() === String(l.rowguid_doc).toLowerCase();
            }
            return (rl.co_art || "").trim().toUpperCase() === (l.co_art || "").trim().toUpperCase();
          });

          if (existingIndex >= 0) {
            const existing = receiptLines[existingIndex];
            // Si estaba desmarcado o con cantidad 0, reactivarlo si tiene saldo pendiente
            if (!existing.checked || Number(existing.cant_recibida || 0) === 0) {
              if (pending > 0) {
                receiptLines[existingIndex].checked = true;
                receiptLines[existingIndex].cant_recibida = pending;
                receiptLines[existingIndex].cant_pendiente = pending;
                reactivatedCount++;
              }
            } else {
              // Ya tiene cantidad recibida ingresada. Actualizamos el tope si la orden reporta más pendiente
              if (pending > Number(existing.cant_pendiente || 0)) {
                receiptLines[existingIndex].cant_pendiente = pending;
              }
            }
          } else {
            // Renglón nuevo para esta recepción: incorporarlo con su saldo pendiente y marcarlo como recién añadido
            if (pending > 0) {
              newLinesToAdd.push({
                ...l,
                doc_num: orderData.doc_num,
                checked: true,
                cant_recibida: pending,
                cant_pendiente: pending,
                cant_original: original,
                co_alma: data.defaultWarehouse || "01",
                isNewlyAdded: true
              });
              addedCount++;
            }
          }
        }

        if (newLinesToAdd.length > 0) {
          receiptLines = [...receiptLines, ...newLinesToAdd];
        }

        showImportModal = false;

        if (addedCount > 0 && reactivatedCount > 0) {
          toast.success(`Orden ${orderData.doc_num}: ${addedCount} artículo(s) agregado(s) y ${reactivatedCount} reactivado(s).`);
        } else if (addedCount > 0) {
          toast.success(`Orden ${orderData.doc_num}: ${addedCount} artículo(s) pendiente(s) incorporado(s).`);
        } else if (reactivatedCount > 0) {
          toast.success(`Orden ${orderData.doc_num}: ${reactivatedCount} artículo(s) reactivado(s).`);
        } else if (isAlreadyLoaded) {
          toast.info(`Todos los artículos con saldo pendiente de la orden ${orderData.doc_num} ya están en la recepción.`);
        } else {
          toast.info(`La orden ${orderData.doc_num} fue vinculada, pero no tiene artículos con saldo pendiente.`);
        }
      } else {
        toast.error(((result as any).data)?.message || "No se pudo cargar el detalle de la orden.");
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Error al cargar detalle de la orden.");
    } finally {
      isLoadingOrderDetail = false;
    }
  }

  // Quitar una orden específica
  function removeSingleOrder(docNum: string) {
    selectedOrders = selectedOrders.filter((o) => o.doc_num !== docNum);
    receiptLines = receiptLines.filter((l) => l.doc_num !== docNum);
    if (selectedOrders.length === 0) {
      observations = "";
      linesSearchTerm = "";
    }
    toast.info(`Orden ${docNum} retirada de la recepción.`);
  }

  // Quitar un renglón individual específico (especialmente útil para líneas recién importadas)
  function removeSingleLine(index: number) {
    const line = receiptLines[index];
    if (!line) return;
    const desc = line.art_des || line.co_art || "Artículo";
    receiptLines = receiptLines.filter((_, i) => i !== index);
    toast.info(`Artículo "${desc}" retirado de la recepción.`);
  }

  // Quitar todas las órdenes
  function removeAllOrders() {
    selectedOrders = [];
    receiptLines = [];
    observations = "";
    linesSearchTerm = "";
  }

  // --- SELECCIÓN GENERAL DE RENGLONES ---
  function toggleSelectAll() {
    const allChecked = receiptLines.every((l) => l.checked);
    receiptLines = receiptLines.map((l) => ({ ...l, checked: !allChecked }));
  }

  // --- MODIFICAR CANTIDADES DE FORMA SEGURA ---
  function updateReceivedQty(index: number, val: number, inputEl?: HTMLInputElement | null) {
    const line = receiptLines[index];
    if (!line) return;
    const maxAllowed = Number(line.cant_pendiente || line.cant_original || 0);
    let clamped = Math.max(0, isNaN(val) ? 0 : val);
    if (maxAllowed > 0 && clamped > maxAllowed) {
      clamped = maxAllowed;
      toast.warning(`La cantidad no puede superar el saldo pendiente (${maxAllowed} un.)`);
    }
    receiptLines[index].cant_recibida = clamped;
    receiptLines[index].checked = clamped > 0;

    if (inputEl) {
      inputEl.value = String(clamped);
    }
  }

  // --- GUARDAR / PROCESAR NOTA DE RECEPCIÓN ---
  async function submitReceipt() {
    if (selectedOrders.length === 0 || !primaryOrder) {
      toast.error("Debes importar al menos una orden de compra.");
      return;
    }

    if (!nroFacturaProveedor || !nroFacturaProveedor.trim()) {
      toast.error("El N° de Factura / Guía del Proveedor (N° NDR) es obligatorio.");
      return;
    }

    const linesToProcess = receiptLines.filter((l) => l.checked && Number(l.cant_recibida) > 0);

    if (linesToProcess.length === 0) {
      toast.error("Debes seleccionar al menos un artículo con cantidad recibida mayor a cero.");
      return;
    }

    // Validar coherencia: todas las órdenes deben ser del mismo proveedor y comprador
    const mainProv = (primaryOrder.co_prov || "").trim().toUpperCase();
    const mainBuyer = (primaryBuyer || "").trim().toUpperCase();
    for (const ord of selectedOrders) {
      const oProv = (ord.co_prov || "").trim().toUpperCase();
      const oBuyer = (ord.co_us_in || "").trim().toUpperCase();
      if (mainProv && oProv && mainProv !== oProv) {
        toast.error(`Conflicto de proveedor: La orden ${ord.doc_num} pertenece a otro proveedor.`);
        return;
      }
      if (mainBuyer && oBuyer && mainBuyer !== oBuyer) {
        toast.error(`Conflicto de comprador: La orden ${ord.doc_num} tiene un comprador diferente (${getBuyerName(oBuyer)}).`);
        return;
      }
    }

    // Validación estricta de límites antes de procesar
    for (const l of linesToProcess) {
      const maxAllowed = Number(l.cant_pendiente || l.cant_original || 0);
      const received = Number(l.cant_recibida || 0);
      if (maxAllowed > 0 && received > maxAllowed) {
        toast.error(`El artículo "${l.art_des || l.co_art}" excede la cantidad pendiente permitida (${maxAllowed} un.).`);
        return;
      }
      if (received <= 0) {
        toast.error(`El artículo "${l.art_des || l.co_art}" debe tener una cantidad mayor a cero.`);
        return;
      }
    }

    isSavingReceipt = true;

    try {
      const ocNums = selectedOrders.map((o) => String(o.doc_num || '').trim()).filter(Boolean);
      const ocDisplay = ocNums.join(", ");

      const payload = {
        isEditing: isEditing,
        doc_num: isEditing ? editingDocNum : undefined,
        co_prov: primaryOrder.co_prov,
        co_mone: primaryOrder.co_mone || (showUSD ? "USD" : "BS"),
        tasa: activeTasa,
        showUSD: showUSD,
        doc_num_oc: ocNums,
        descrip: observations.trim() || `RECEPCION OC ${ocDisplay}`.substring(0, 60),
        co_cond: primaryOrder.co_cond || "CONT",
        n_control: ocNums.length === 1 ? ocNums[0] : undefined,
        nro_fact: nroFacturaProveedor.trim() || undefined,
        comentario: observations.trim() ? `${observations.trim()} | OC: ${ocDisplay}` : `Recepción de OC: ${ocDisplay}`,
        co_alma_defecto: data.defaultWarehouse || "01",
        renglones: linesToProcess.map((l, i) => ({
          reng_num: i + 1,
          reng_num_oc: l.reng_num_oc || l.reng_num,
          rowguid_doc: l.rowguid_doc,
          num_doc: l.doc_num || primaryOrder.doc_num,
          co_art: l.co_art,
          art_des: l.art_des,
          co_uni: l.co_uni || "UNI",
          co_alma: l.co_alma || data.defaultWarehouse || data.warehouses?.[0]?.co_alma || "01",
          cantidad: Number(l.cant_recibida),
          cost_unit_om: Number(l.cost_unit_om || l.cost_unit || 0),
          cost_unit: Number(l.cost_unit || 0),
          porc_imp: Number(l.porc_imp != null ? l.porc_imp : 0),
          tipo_imp: l.tipo_imp || "1"
        }))
      };

      const formData = new FormData();
      formData.append("branch_id", filterSede);
      formData.append("payload", JSON.stringify(payload));

      const res = await fetch("?/saveReceipt", {
        method: "POST",
        body: formData
      });

      const result = deserialize(await res.text());

      if (result.type === "success" && (result.data as any)?.success) {
        const resData = result.data as any;
        generatedDocNum = resData.doc_num || resData.data?.doc_num || resData.results?.[0]?.data?.doc_num || editingDocNum || "";
        savedBranchId = filterSede;
        saveSuccess = true;
        toast.success(isEditing ? `Nota de Recepción N° ${generatedDocNum} actualizada con éxito.` : `Nota de Recepción N° ${generatedDocNum} generada con éxito.`);
      } else {
        toast.error(((result as any).data)?.message || "Error al procesar la nota de recepción.");
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Error de conexión al procesar nota de recepción.");
    } finally {
      isSavingReceipt = false;
    }
  }

  function resetForm() {
    selectedOrders = [];
    receiptLines = [];
    observations = "";
    nroFacturaProveedor = "";
    saveSuccess = false;
    generatedDocNum = "";
    linesSearchTerm = "";
    isEditing = false;
    editingDocNum = "";
    if ($page.url.searchParams.has("doc_num")) {
      const params = new URLSearchParams($page.url.searchParams);
      params.delete("doc_num");
      goto(`?${params.toString()}`);
    }
  }
</script>

{#if saveSuccess}
  <div
    class="glass p-12 rounded-[40px] border border-green-500/20 max-w-xl mx-auto flex flex-col items-center justify-center text-center space-y-6 mt-12"
    in:fade
  >
    <div
      class="h-20 w-20 rounded-3xl bg-green-500/10 flex items-center justify-center text-green-400 shadow-lg shadow-green-500/10"
    >
      <Check size={48} />
    </div>
    <div class="space-y-2">
      <h2 class="text-3xl font-black text-text-base">¡Recepción Registrada!</h2>
      <p class="text-text-muted">
        La nota de recepción y la entrada de inventario han sido procesadas exitosamente en Profit Plus.
      </p>
    </div>
    <div class="bg-white/5 px-6 py-4 rounded-2xl border border-white/5">
      <span
        class="text-xs text-text-muted/60 uppercase font-bold tracking-wider"
        >Nota de Recepción Generada</span
      >
      <div class="text-2xl font-black text-brand-500 mt-1 font-mono">
        {generatedDocNum}
      </div>
    </div>
    <div class="flex gap-4 w-full">
      <a
        href="/dashboard/warehouse/receipts/{generatedDocNum}/print?branch_id={savedBranchId}"
        target="_blank"
        class="flex-1 text-center bg-white/5 hover:bg-white/10 text-text-base px-6 py-3.5 rounded-2xl font-bold transition-all text-sm flex items-center justify-center gap-2 border border-white/10"
      >
        <Printer size={16} class="text-brand-400" />
        Imprimir
      </a>
      <button
        onclick={resetForm}
        class="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-brand-500/20 text-sm cursor-pointer"
      >
        Nueva Recepción
      </button>
    </div>
  </div>
{:else}
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
    <!-- TOP HEADER -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
          <Inbox size={40} class="text-brand-500" />
          Notas de Recepción
        </h1>
        <p class="text-text-muted mt-2 text-lg">
          Ingreso físico y verificación de mercancía desde Órdenes de Compra.
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
          onclick={openImportModal}
          class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto"
          title={isEditing ? "Importar o re-importar órdenes de compra compatibles" : "Importar orden de compra"}
        >
          <ShoppingBag size={18} />
          <span>{isEditing ? "Importar Orden" : "Importar Orden"}</span>
        </button>

        <button
          onclick={() => {
            const params = new URLSearchParams();
            if (filterSede) params.set("branch_id", filterSede);
            goto(`/dashboard/warehouse/receipts/history?${params.toString()}`);
          }}
          class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-surface-strong hover:bg-surface-base text-text-base border border-border-subtle transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full sm:w-auto"
        >
          <Clock size={18} class="text-brand-400" />
          Ver Historial
        </button>
      </div>
    </div>

    {#if data.error}
      <div class="glass border-red-500/20 p-6 rounded-3xl flex items-center gap-6 bg-red-500/5 shadow-xl shadow-red-500/10">
        <div class="h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
          <AlertTriangle size={24} />
        </div>
        <div class="flex-1">
          <h3 class="text-sm font-black text-red-500 uppercase tracking-widest mb-1">Restricción de Acceso</h3>
          <p class="text-text-muted font-bold text-sm leading-relaxed">{data.error}</p>
        </div>
      </div>
    {/if}

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
      <!-- LEFT/CENTER: RECEIPT FORM & LINES -->
      <div class="xl:col-span-2 space-y-6">
        <!-- SUPPLIER & ORDERS INFO BOX -->
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-4">
          <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
            <Building size={16} />
            Datos del Proveedor y Comprador
          </h3>

          {#if selectedOrders.length === 0 || !primarySupplier}
            <div class="p-8 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-2">
              <Building size={32} class="text-text-muted/30" />
              <p class="text-xs text-text-muted font-bold">
                No hay ninguna orden cargada. Haz clic en "Importar Orden" para iniciar la recepción.
              </p>
            </div>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4" in:slide>
              <div class="md:col-span-2 space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Razón Social / Proveedor</span>
                <p class="text-base font-black text-text-base">
                  {primarySupplier.prov_des || primarySupplier.co_prov}
                </p>
              </div>
              <div class="space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">RIF / Código</span>
                <p class="text-base font-bold font-mono text-text-base">
                  {primarySupplier.rif || primarySupplier.co_prov}
                </p>
              </div>
              <div class="space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Dirección</span>
                <p class="text-xs text-text-muted font-bold leading-relaxed">
                  {primarySupplier.prov_dir || "Sin dirección registrada"}
                </p>
              </div>
              <div class="space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Teléfono</span>
                <p class="text-xs text-text-muted font-bold font-mono">
                  {primarySupplier.telefonos || "---"}
                </p>
              </div>
              <div class="space-y-1">
                <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Comprador (OC)</span>
                <p class="text-xs font-bold font-mono text-blue-400 flex items-center gap-1.5 truncate" title={getBuyerName(primaryBuyer)}>
                  <User size={13} class="shrink-0" />
                  {getBuyerName(primaryBuyer)}
                </p>
              </div>

              <!-- Sub-detalles y Órdenes vinculadas -->
              <div class="md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-border-subtle/30">
                {#if isEditing}
                  <div class="space-y-1">
                    <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Nota Recepción</span>
                    <p class="text-xs font-black font-mono text-emerald-400">
                      #{editingDocNum}
                    </p>
                  </div>
                {/if}
                <div class="space-y-1">
                  <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">N° Factura / NDR</span>
                  <p class="text-xs font-bold font-mono text-cyan-400">
                    {nroFacturaProveedor || primaryOrder?.nro_fact || "---"}
                  </p>
                </div>
                <div class="space-y-1">
                  <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Almacén Ingreso</span>
                  <p class="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Warehouse size={13} />
                    {defaultWarehouseName}
                  </p>
                </div>
                <div class="space-y-1">
                  <span class="text-[9px] font-black uppercase tracking-widest text-text-muted">Condición Pago</span>
                  <p class="text-xs font-bold text-text-base">
                    {primarySupplier.cond_des || primarySupplier.co_cond || "CONTADO"}
                  </p>
                </div>
              </div>

              <!-- Órdenes de Compra Vinculadas -->
              <div class="md:col-span-3 space-y-2 pt-3 border-t border-border-subtle/30">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-black uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                    <ShoppingBag size={13} class="text-brand-400" />
                    Órdenes de Compra en esta Recepción ({selectedOrders.length})
                  </span>
                  <button
                    type="button"
                    onclick={openImportModal}
                    class="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/20 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                    title="Importar o agregar otra orden de compra de este mismo proveedor y comprador"
                  >
                    <Plus size={13} />
                    Importar / Agregar Orden
                  </button>
                </div>
                <div class="flex flex-wrap gap-2 pt-1">
                  {#each selectedOrders as ord (ord.doc_num)}
                    {@const ordLinesCount = receiptLines.filter(l => l.doc_num === ord.doc_num).length}
                    {@const ordUnitsCount = receiptLines.filter(l => l.doc_num === ord.doc_num && l.checked).reduce((acc, l) => acc + Number(l.cant_recibida || 0), 0)}
                    <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-soft border border-border-subtle text-xs font-bold shadow-sm">
                      <span class="font-mono text-brand-400 font-black">OC: {ord.doc_num}</span>
                      <span class="text-[10px] text-text-muted font-normal">({ordLinesCount} arts &bull; {formatQuantity(ordUnitsCount)} un.)</span>
                      {#if !isEditing || selectedOrders.length > 1}
                        <button
                          type="button"
                          onclick={() => removeSingleOrder(ord.doc_num)}
                          class="p-0.5 hover:bg-red-500/20 hover:text-red-400 text-text-muted rounded transition-colors cursor-pointer"
                          title="Quitar orden {ord.doc_num}"
                        >
                          <X size={13} />
                        </button>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- ITEMS TABLE (CANTIDADES FÍSICAS EXCLUSIVAMENTE) -->
        <div class="glass border border-border-subtle rounded-3xl shadow-xl overflow-hidden">
          <div class="p-4 md:p-6 border-b border-border-subtle bg-surface-soft/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <!-- Buscador en Renglones (reemplaza título de Artículos a Recepcionar) -->
            <div class="relative flex-1 max-w-xl">
              <Search size={16} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                type="text"
                bind:value={linesSearchTerm}
                placeholder={receiptLines.length > 0 ? `Buscar artículo en renglones (${receiptLines.length})...` : "Buscar artículo en renglones..."}
                disabled={receiptLines.length === 0}
                class="w-full h-12 pl-11 pr-10 rounded-2xl bg-surface-base border border-border-subtle focus:border-brand-500/50 outline-none text-xs font-bold text-text-base transition-all placeholder:text-text-muted disabled:opacity-40"
              />
              {#if linesSearchTerm}
                <button
                  type="button"
                  onclick={() => (linesSearchTerm = "")}
                  class="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors cursor-pointer"
                  title="Limpiar búsqueda"
                >
                  <X size={14} />
                </button>
              {/if}
            </div>

            {#if selectedOrders.length > 0}
              <div class="flex items-center gap-2 shrink-0 flex-wrap">
                {#if receiptLines.some(l => l.isNewlyAdded)}
                  {@const newCount = receiptLines.filter(l => l.isNewlyAdded).length}
                  <div class="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-400 rounded-2xl animate-pulse shadow-xs">
                    <Sparkles size={14} />
                    <span>+{newCount} {newCount === 1 ? 'artículo nuevo' : 'artículos nuevos'}</span>
                  </div>
                {/if}
                <div class="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500/10 border border-brand-500/20 text-xs font-bold text-text-base rounded-2xl">
                  <span class="font-black text-brand-400 font-mono">{selectedOrders.length} {selectedOrders.length === 1 ? 'Orden' : 'Órdenes'}</span>
                </div>
                {#if !isEditing}
                  <button
                    type="button"
                    onclick={removeAllOrders}
                    class="p-1.5 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded-xl transition-colors cursor-pointer"
                    title="Quitar todas las órdenes"
                  >
                    <Trash2 size={15} />
                  </button>
                {/if}
              </div>
            {/if}
          </div>

          {#if receiptLines.length === 0}
            <div class="p-20 text-center flex flex-col items-center justify-center gap-3">
              <ShoppingBag size={48} class="text-text-muted/30 animate-pulse" />
              <h4 class="text-lg font-bold text-text-muted">Recepción vacía</h4>
              <p class="text-xs text-text-muted/50 max-w-xs">
                Los artículos importados de la orden de compra aparecerán aquí para su verificación física.
              </p>
            </div>
          {:else if filteredReceiptLines.length === 0}
            <div class="p-16 text-center text-text-muted text-sm font-bold space-y-3">
              <Search size={36} class="mx-auto text-text-muted opacity-40" />
              <p>No se encontraron artículos que coincidan con "<span class="text-white font-black">{linesSearchTerm}</span>"</p>
              <button
                type="button"
                onclick={() => (linesSearchTerm = "")}
                class="text-xs font-bold text-brand-400 hover:underline cursor-pointer"
              >
                Limpiar búsqueda
              </button>
            </div>
          {:else}
            <div class="overflow-x-auto" in:slide>
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-surface-strong border-b border-border-subtle text-xs font-black uppercase tracking-wider text-text-muted">
                    <th class="px-6 py-4 w-12 text-center">
                      <label class="group relative inline-flex items-center cursor-pointer justify-center" title="Seleccionar Todos">
                        <input
                          type="checkbox"
                          checked={receiptLines.length > 0 && receiptLines.every((l) => l.checked)}
                          onchange={toggleSelectAll}
                          class="sr-only peer"
                        />
                        <div
                          class="w-6 h-6 bg-surface-base border-2 border-border-subtle rounded-lg peer-checked:bg-brand-500 peer-checked:border-brand-500 transition-all flex items-center justify-center shadow-inner group-hover:border-brand-500/30"
                        >
                          {#if receiptLines.length > 0 && receiptLines.every((l) => l.checked)}
                            <div in:fade={{ duration: 100 }}>
                              <Check
                                size={14}
                                class="text-white"
                                strokeWidth={4}
                              />
                            </div>
                          {/if}
                        </div>
                      </label>
                    </th>
                    <th class="px-6 py-4">Artículo</th>
                    <th class="px-6 py-4 text-center">OC / Pendiente</th>
                    <th class="px-6 py-4 text-center">Cant. Recibida</th>
                    <th class="px-3 py-4 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle text-xs">
                  {#each filteredReceiptLines as { line, originalIndex } (line.co_art + '_' + originalIndex)}
                    <tr class="transition-all {receiptLines[originalIndex].checked ? '' : 'opacity-50'} {line.isNewlyAdded ? 'bg-emerald-500/10 hover:bg-emerald-500/15 border-l-4 border-l-emerald-500' : 'hover:bg-surface-soft/60'}">
                      <td class="px-6 py-4 text-center">
                        <label class="group relative inline-flex items-center cursor-pointer justify-center">
                          <input
                            type="checkbox"
                            bind:checked={receiptLines[originalIndex].checked}
                            class="sr-only peer"
                          />
                          <div
                            class="w-6 h-6 bg-surface-base border-2 border-border-subtle rounded-lg peer-checked:bg-brand-500 peer-checked:border-brand-500 transition-all flex items-center justify-center shadow-inner group-hover:border-brand-500/30"
                          >
                            {#if receiptLines[originalIndex].checked}
                              <div in:fade={{ duration: 100 }}>
                                <Check
                                  size={14}
                                  class="text-white"
                                  strokeWidth={4}
                                />
                              </div>
                            {/if}
                          </div>
                        </label>
                      </td>

                      <td class="px-6 py-4">
                        <div class="flex flex-col gap-1 max-w-md">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-black text-text-base text-sm leading-snug" title={line.art_des}>
                              {line.art_des}
                            </span>
                            {#if line.isNewlyAdded}
                              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider animate-pulse shadow-xs">
                                <Sparkles size={11} class="text-emerald-400 shrink-0" />
                                {isEditing ? "Nuevo en esta Edición" : "Recién Importado"}
                              </span>
                            {/if}
                          </div>
                          <div class="flex items-center gap-2 flex-wrap">
                            {#if line.doc_num}
                              <span class="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded font-mono font-bold">
                                OC: {line.doc_num}
                              </span>
                            {/if}
                            <span class="text-[10px] text-text-muted font-mono font-bold">{line.co_art?.trim()}</span>
                            {#if line.modelo}
                              <span class="text-[10px] text-brand-400 font-bold">• Mod: {line.modelo.trim()}</span>
                            {/if}
                            <span class="text-[10px] text-emerald-400 font-bold uppercase">({line.unidad?.trim() || line.co_uni?.trim() || "UNI"})</span>
                          </div>
                        </div>
                      </td>

                      <td class="px-6 py-4 text-center font-bold text-text-muted font-mono text-sm">
                        {line.cant_original} <span class="text-text-muted/40">/</span> <strong class="text-amber-400 font-black">{line.cant_pendiente}</strong>
                      </td>

                      <td class="px-6 py-4 text-center">
                        <div class="inline-flex items-center gap-1.5 bg-surface-base border border-border-subtle rounded-2xl p-1.5 shadow-inner">
                          <button
                            type="button"
                            onclick={() => updateReceivedQty(originalIndex, Number(receiptLines[originalIndex].cant_recibida || 0) - 1)}
                            class="h-8 w-8 rounded-xl bg-surface-strong hover:bg-surface-soft text-text-base font-black flex items-center justify-center transition-all disabled:opacity-30 cursor-pointer"
                            disabled={Number(receiptLines[originalIndex].cant_recibida || 0) <= 0}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            max={line.cant_pendiente || line.cant_original || 999999}
                            step="any"
                            value={receiptLines[originalIndex].cant_recibida}
                            oninput={(e) => {
                              const target = e.currentTarget as HTMLInputElement;
                              const parsed = parseFloat(target.value);
                              updateReceivedQty(originalIndex, isNaN(parsed) ? 0 : parsed, target);
                            }}
                            onchange={(e) => {
                              const target = e.currentTarget as HTMLInputElement;
                              const parsed = parseFloat(target.value);
                              updateReceivedQty(originalIndex, isNaN(parsed) ? 0 : parsed, target);
                            }}
                            onblur={(e) => {
                              const target = e.currentTarget as HTMLInputElement;
                              const parsed = parseFloat(target.value);
                              updateReceivedQty(originalIndex, isNaN(parsed) ? 0 : parsed, target);
                            }}
                            class="w-20 bg-transparent text-center font-mono font-black text-sm text-text-base focus:outline-none"
                          />
                          <button
                            type="button"
                            onclick={() => updateReceivedQty(originalIndex, Number(receiptLines[originalIndex].cant_recibida || 0) + 1)}
                            class="h-8 w-8 rounded-xl bg-surface-strong hover:bg-surface-soft text-text-base font-black flex items-center justify-center transition-all disabled:opacity-30 cursor-pointer"
                            disabled={Number(receiptLines[originalIndex].cant_recibida || 0) >= Number(line.cant_pendiente || line.cant_original || 999999)}
                          >
                            +
                          </button>
                        </div>
                      </td>

                      <td class="px-3 py-4 text-center">
                        {#if line.isNewlyAdded}
                          <button
                            type="button"
                            onclick={() => removeSingleLine(originalIndex)}
                            class="p-2 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded-xl transition-colors cursor-pointer"
                            title="Quitar este artículo nuevo de la recepción"
                          >
                            <X size={14} />
                          </button>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>

      <!-- RIGHT COLUMN: PHYSICAL SUMMARY & SUBMIT -->
      <div class="xl:col-span-1">
        <div class="glass p-8 rounded-[32px] border border-border-subtle space-y-8 bg-brand-500/[0.03] backdrop-blur-3xl relative overflow-hidden flex flex-col sticky top-24 shadow-xl">
          <div class="absolute -top-12 -right-12 w-48 h-48 bg-brand-500/10 rounded-full blur-[80px]"></div>

          <div class="border-b border-border-subtle pb-6 relative z-10">
            <h4 class="text-xs font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
              <Package size={16} class="text-brand-500" />
              Resumen de Recepción
            </h4>
          </div>

          <div class="space-y-6 relative z-10">
            <!-- Renglones Seleccionados -->
            <div class="flex justify-between items-center text-sm font-bold text-text-muted">
              <span>Renglones a Ingresar</span>
              <span class="font-mono text-text-base font-black text-base">{totals.totalLinesCount} de {receiptLines.length}</span>
            </div>

            <!-- Total Unidades Físicas (Destacado) -->
            <div class="p-5 rounded-2xl bg-surface-soft/60 border border-border-subtle space-y-1">
              <span class="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                Total Unidades Físicas
              </span>
              <div class="text-4xl font-black text-emerald-400 font-mono tracking-tight">
                {formatQuantity(totals.totalUnitsCount)}
              </div>
            </div>

            <!-- N° Factura / Guía del Proveedor (N° NDR) -->
            <div class="border-t border-border-subtle/50 pt-4 space-y-2">
              <label for="nroFacturaProveedor" class="text-[10px] font-black uppercase tracking-wider text-text-muted flex items-center justify-between">
                <span class="flex items-center gap-1.5 text-text-base">
                  <FileText size={12} class="text-brand-500" />
                  N° Factura / Guía Proveedor (N° NDR) <span class="text-red-500">*</span>
                </span>
                <span class="text-[9px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider">Obligatorio</span>
              </label>
              <input
                id="nroFacturaProveedor"
                type="text"
                bind:value={nroFacturaProveedor}
                placeholder="Ej. FACT-C-006240 o N° Guía..."
                class="w-full bg-surface-soft border {(!nroFacturaProveedor || !nroFacturaProveedor.trim()) ? 'border-amber-500/40 focus:border-amber-500' : 'border-border-subtle focus:border-brand-500/50'} px-4 py-3 rounded-2xl text-xs text-text-base placeholder-text-muted/50 focus:ring-0 focus:outline-hidden transition-all font-mono font-bold"
              />
            </div>

            <!-- Observaciones -->
            <div class="border-t border-border-subtle/50 pt-4 space-y-2">
              <label for="observations" class="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                Observaciones
              </label>
              <textarea
                id="observations"
                bind:value={observations}
                rows="3"
                placeholder="Observaciones sobre el estado de la mercancía recibida..."
                class="w-full bg-surface-soft border border-border-subtle px-4 py-3 rounded-2xl text-xs text-text-base placeholder-text-muted/50 focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all font-medium resize-none"
              ></textarea>
            </div>

            <!-- Diagnóstico de Estado de OC -->
            {#if totals.isFullyReceived}
              <div class="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-xs flex gap-3 items-start" transition:slide>
                <CheckCircle2 size={20} class="shrink-0 mt-0.5" />
                <p class="font-bold text-xs leading-relaxed">
                  Recepción Total: Todos los renglones se reciben al 100%. La orden de compra quedará cerrada.
                </p>
              </div>
            {:else if totals.isPartiallyReceived}
              <div class="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl text-xs flex gap-3 items-start" transition:slide>
                <AlertTriangle size={20} class="shrink-0 mt-0.5" />
                <p class="font-bold text-xs leading-relaxed">
                  Recepción Parcial: Se reciben cantidades menores al saldo. La orden mantendrá ítems pendientes para futuras recepciones.
                </p>
              </div>
            {/if}

            {#if isEditing && receiptLines.some(l => l.isNewlyAdded && l.checked)}
              {@const newActiveCount = receiptLines.filter(l => l.isNewlyAdded && l.checked).length}
              <div class="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-xs flex gap-3 items-start" transition:slide>
                <Sparkles size={20} class="shrink-0 mt-0.5 text-emerald-400 animate-pulse" />
                <p class="font-bold text-xs leading-relaxed">
                  Esta edición incorpora <span class="text-white font-black">{newActiveCount} artículo(s) nuevo(s)</span> que no formaban parte de la recepción inicial.
                </p>
              </div>
            {/if}
          </div>

          <!-- SAVE BUTTON -->
          <button
            onclick={submitReceipt}
            disabled={receiptLines.length === 0 || totals.totalUnitsCount === 0 || !nroFacturaProveedor || !nroFacturaProveedor.trim() || isSavingReceipt}
            class="w-full h-20 bg-brand-600 hover:bg-brand-500 disabled:bg-surface-soft text-white disabled:text-text-muted/30 rounded-[24px] font-black text-lg uppercase tracking-[0.2em] transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-4 shadow-xl shadow-brand-500/10 hover:shadow-brand-500/30 group relative z-10 cursor-pointer"
          >
            {#if isSavingReceipt}
              <RefreshCw size={24} class="animate-spin text-brand-400/40" />
              <span class="animate-pulse">{isEditing ? "Actualizando..." : "Procesando..."}</span>
            {:else}
              <div class="bg-surface-strong/50 p-2.5 rounded-xl group-hover:scale-110 transition-transform">
                <Check size={24} />
              </div>
              <span>{isEditing ? "Actualizar" : "Guardar"}</span>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ========================================================================= -->
<!-- MODAL: IMPORTAR ORDEN DE COMPRA (ENFOQUE EN CANTIDADES) -->
<!-- ========================================================================= -->
{#if showImportModal}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    in:fade
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0"
      onclick={() => (showImportModal = false)}
    ></div>

    <div
      class="w-full max-w-2xl bg-surface-base border border-border-subtle rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh] relative z-10"
      in:scale={{ duration: 200, start: 0.95 }}
    >
      <!-- Modal Header -->
      <div class="p-8 border-b border-border-subtle flex justify-between items-center bg-surface-soft/50">
        <div>
          <h2 class="text-2xl font-black tracking-tight">
            {selectedOrders.length > 0 ? "Importar / Agregar Órdenes de Compra" : "Importar Orden de Compra"}
          </h2>
          <p class="text-text-muted text-sm">
            {selectedOrders.length > 0
              ? `Selecciona órdenes del mismo proveedor y comprador para agregar o re-importar ítems pendientes (${selectedOrders.length} vinculada${selectedOrders.length > 1 ? 's' : ''})`
              : "Selecciona una orden de compra con saldo pendiente para recibir"}
          </p>
        </div>
        <button
          type="button"
          onclick={() => (showImportModal = false)}
          class="p-2 hover:bg-surface-strong rounded-full transition-colors cursor-pointer"
        >
          <X size={24} />
        </button>
      </div>

      <!-- Contenido Modal -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar min-h-[300px] custom-scrollbar">
        {#if primaryOrder}
          <div class="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3 text-xs" in:slide>
            <Filter size={18} class="text-blue-400 shrink-0 mt-0.5" />
            <div class="space-y-1">
              <span class="font-black text-blue-400 uppercase tracking-wider block text-[10px]">
                Filtro Automático de Órdenes Compatibles
              </span>
              <p class="text-text-base leading-relaxed">
                Mostrando únicamente órdenes pendientes para el proveedor <strong class="text-white font-bold">{primarySupplier?.prov_des || primarySupplier?.co_prov}</strong> y comprador <strong class="text-blue-300 font-mono font-bold">{getBuyerName(primaryBuyer)}</strong>.
              </p>
            </div>
          </div>
        {/if}

        <!-- Buscador -->
        <div class="relative">
          <Search size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder={primaryOrder ? "Buscar en órdenes compatibles por N° orden..." : "Buscar por nro. orden, RIF o nombre de proveedor..."}
            bind:value={importSearchQuery}
            oninput={searchPendingOrders}
            class="w-full bg-surface-soft border border-border-subtle pl-12 pr-4 py-3.5 rounded-2xl text-sm text-text-base placeholder-text-muted/50 focus:border-brand-500/50 focus:ring-0 focus:outline-hidden transition-all font-medium"
          />
          {#if isSearchingOrders}
            <RefreshCw size={16} class="animate-spin absolute right-4 top-1/2 -translate-y-1/2 text-brand-500" />
          {/if}
        </div>

        <!-- Resultados -->
        <div class="space-y-3">
          {#if isSearchingOrders}
            <div class="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 size={40} class="animate-spin text-brand-500" />
              <p class="text-text-muted font-bold animate-pulse">
                Buscando órdenes de compra...
              </p>
            </div>
          {:else if foundOrders.length === 0}
            <div class="flex flex-col items-center justify-center py-20 gap-3 text-text-muted opacity-50 bg-surface-base">
              <FileText size={48} />
              <p class="font-bold">
                {primaryOrder
                  ? "No se encontraron otras órdenes de compra pendientes para este proveedor y comprador"
                  : "No se encontraron órdenes de compra pendientes"}
              </p>
            </div>
          {:else}
            {#each foundOrders as order (order.doc_num + order.sede_id)}
              {@const isParcial = String(order.status).trim() === '1'}
              {@const pendingQty = Number(order.cant_pendiente || 0)}
              {@const isAlreadyLoaded = selectedOrders.some((o) => o.doc_num?.trim().toUpperCase() === order.doc_num?.trim().toUpperCase())}

              <ImportItemCard
                docType="ORD"
                docNum={order.doc_num}
                statusLabel={isAlreadyLoaded ? 'En Recepción • Re-importar' : (isParcial ? 'Parcial' : 'Sin Procesar')}
                statusClass={isAlreadyLoaded ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : (isParcial ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-brand-500/10 text-brand-400 border-brand-500/20')}
                clientName={order.prov_des || order.co_prov}
                clientRif={order.rif || order.co_prov}
                cashierName={`Comprador: ${getBuyerName(order.co_us_in)}`}
                dateEmis={dayjs(order.fec_emis).format("DD/MM/YYYY")}
                qtyLabel={`${formatQuantity(pendingQty)} un.`}
                branchName={order.sede_nombre || "N/A"}
                onclick={() => selectOrder(order)}
              />
            {/each}
          {/if}
        </div>
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
