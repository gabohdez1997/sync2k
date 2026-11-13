<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import {
    Landmark,
    ArrowRightLeft,
    ArrowUpCircle,
    ArrowDownCircle,
    Receipt,
    Clock,
    Store,
    ChevronDown,
    Check,
    RefreshCw,
    AlertCircle,
    Hash,
    Calendar,
    FileText,
    Coins,
    ShieldCheck,
    Loader2,
  } from "lucide-svelte";
  import { fade } from "svelte/transition";
  import { toast } from "svelte-sonner";

  let { data } = $props();

  const INCOME_OPS = [
    { codigo: "DP", label: "Depósito", short: "DP" },
    { codigo: "NC", label: "Nota de Crédito", short: "NC" },
    { codigo: "TP", label: "Transf. Positiva (Ingreso)", short: "TP" },
  ];
  const EXPENSE_OPS = [
    { codigo: "TR", label: "Transferencia Emitida", short: "TR" },
    { codigo: "ND", label: "Nota de Débito", short: "ND" },
    { codigo: "CH", label: "Cheque", short: "CH" },
    { codigo: "RC", label: "Retiro / Cargo", short: "RC" },
  ];
  const TAX_OPS = [{ codigo: "ID", label: "IDB / IGTF Bancario", short: "ID" }];

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function dateToISO(val: any): string {
    if (!val) return todayISO();
    const str = String(val);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    const d = new Date(val);
    if (isNaN(d.getTime())) return todayISO();
    return d.toISOString().slice(0, 10);
  }

  function round2(n: number) {
    return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
  }

  function formatMoney(n: number, isUSD: boolean) {
    const abs = Number(n || 0);
    if (isUSD) {
      return `$ ${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `Bs. ${abs.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function getAccountBalances(acc: any, rateVal = activeTasa) {
    const rate = Number(rateVal || 1) > 0 ? Number(rateVal) : 1;
    const raw = Number(acc?.saldo_total || 0);
    const isUSD = acc?.moneda_tipo === "USD";
    return {
      isUSD,
      native: round2(raw),
      usd: isUSD ? round2(raw) : round2(raw / rate),
      bs: isUSD ? round2(raw * rate) : round2(raw),
    };
  }

  function formatAccountDualBalance(acc: any, preferUSD = showUSD, rateVal = activeTasa) {
    if (!acc) return "";
    const b = getAccountBalances(acc, rateVal);
    return preferUSD
      ? `${formatMoney(b.usd, true)} (≈ ${formatMoney(b.bs, false)})`
      : `${formatMoney(b.bs, false)} (≈ ${formatMoney(b.usd, true)})`;
  }

  const editMov = $derived(data.editMovement);
  const isEditing = $derived(Boolean(editMov));
  const isEditingTransfer = $derived(Boolean(editMov?.es_transferencia && editMov?.transferencia));

  let filterSede = $state(data.selectedBranchId || "");
  let activeTab = $state<"individual" | "transfer">(
    data.editMovement?.es_transferencia ? "transfer" : "individual"
  );

  // Estado compartido moneda/tasa
  let activeTasa = $state(Number(data.tasaActual || 1));
  let isFetchingRate = $state(false);
  let showUSD = $state(false);
  let initializedEditKey = $state("");
  let initializedDefaultCta = $state(false);

  // Estado Tab 1: Movimiento Individual
  let codCta = $state("");
  let tipoOp = $state("TR");
  let manualMovNumEnabled = $state(false);
  let manualMovNum = $state("");
  let docNum = $state("");
  let fecha = $state(todayISO());
  let fechaChe = $state(todayISO());
  let coCtaIngrEgr = $state("02");
  let userChangedIngEgr = $state(false);
  let descrip = $state("");
  let montoInput = $state(0);
  let idbInput = $state(0);

  // Estado Tab 2: Transferencia entre Cuentas
  let trManualCodeEnabled = $state(false);
  let trCode = $state("");
  let trCtaOrigen = $state("");
  let trCtaDestino = $state("");
  let trCtaIngEgrOrigen = $state("02");
  let trCtaIngEgrDestino = $state("01");
  let trFecha = $state(todayISO());
  let trFechaOrigen = $state(todayISO());
  let trFechaDestino = $state(todayISO());
  let trRefOrigen = $state("");
  let trRefDestino = $state("");
  let trDescrip = $state("");
  let trMontoOrigen = $state(0);
  let trMontoDestinoOverride = $state<number | null>(null);
  let trHasComision = $state(false);
  let trComision = $state(0);
  let trCtaComision = $state("");
  let trCtaIngEgrComision = $state("02");
  let trRefComis = $state("");

  // Estado Submit / Éxito
  let isSaving = $state(false);
  let saveSuccess = $state(false);
  let savedResult = $state<any>(null);

  // Inicializar valores por defecto y modo edición
  $effect(() => {
    const cuentas = data.cuentasBancarias || [];
    if (data.selectedBranchId && filterSede !== data.selectedBranchId) {
      filterSede = data.selectedBranchId;
    }

    if (editMov) {
      const editKey = String(editMov.mov_num || "");
      if (initializedEditKey === editKey) return;
      initializedEditKey = editKey;

      if (editMov.es_transferencia && editMov.transferencia) {
        const t = editMov.transferencia;
        activeTab = "transfer";
        trCode = t.co_trans_ban || "";
        trCtaOrigen = t.cta_origen || "";
        trCtaDestino = t.cta_destino || "";
        trCtaIngEgrOrigen = t.cta_ingr_egr_origen || "02";
        trCtaIngEgrDestino = t.cta_ingr_egr_destino || "01";
        trFecha = dateToISO(t.fecha);
        trFechaOrigen = dateToISO(t.fecha_origen);
        trFechaDestino = dateToISO(t.fecha_destino);
        trRefOrigen = t.referencia_origen || "";
        trRefDestino = t.referencia_destino || "";
        trDescrip = t.des_trans_ban || "";
        trMontoOrigen = Number(t.monto || 0);
        const destLeg = (t.movimientos_vinculados || []).find((m: any) => m.tipo_op === "TP");
        if (destLeg) {
          trMontoDestinoOverride = Number(destLeg.monto_h || 0);
        }
        trHasComision = Number(t.comision || 0) > 0;
        trComision = Number(t.comision || 0);
        trCtaComision = t.cta_comision || t.cta_origen || "";
        trCtaIngEgrComision = t.cta_ingr_egr_comision || "02";
        trRefComis = t.referencia_comis || "";
        const rateUsed = Number(t.tasa || 1) > 1 ? Number(t.tasa) : Number(t.tasa_origen || 1);
        if (rateUsed > 1) activeTasa = rateUsed;
        const origAcc = cuentas.find((c: any) => c.cod_cta === t.cta_origen);
        showUSD = origAcc ? origAcc.moneda_tipo === "USD" : false;
      } else {
        activeTab = "individual";
        codCta = editMov.cod_cta || "";
        tipoOp = editMov.tipo_op || "TR";
        docNum = editMov.doc_num || "";
        fecha = dateToISO(editMov.fecha);
        fechaChe = dateToISO(editMov.fecha_che || editMov.fecha);
        coCtaIngrEgr = editMov.co_cta_ingr_egr || "02";
        userChangedIngEgr = true;
        descrip = editMov.descrip || "";
        const matchedAcc = cuentas.find((c: any) => c.cod_cta === editMov.cod_cta);
        const accIsUSD = matchedAcc?.moneda_tipo === "USD" || (editMov.co_mone && editMov.co_mone !== "BS");
        showUSD = Boolean(accIsUSD);
        montoInput = Number(editMov.monto || 0);
        idbInput = editMov.tipo_op === "ID" ? 0 : Number(editMov.idb || 0);
        if (Number(editMov.tasa || 1) > 1) {
          activeTasa = Number(editMov.tasa);
        }
      }
    } else {
      initializedEditKey = "";
      if (cuentas.length > 0 && (!initializedDefaultCta || !cuentas.some((c: any) => c.cod_cta === codCta))) {
        initializedDefaultCta = true;
        codCta = cuentas[0].cod_cta;
        showUSD = cuentas[0].moneda_tipo === "USD";
        trCtaOrigen = cuentas[0].cod_cta;
        trCtaDestino = cuentas[1]?.cod_cta || "";
        trCtaComision = cuentas[0].cod_cta;
      }
    }
  });

  const selectedAccount = $derived(
    (data.cuentasBancarias || []).find((c: any) => c.cod_cta === codCta) || null
  );
  const trOrigAccount = $derived(
    (data.cuentasBancarias || []).find((c: any) => c.cod_cta === trCtaOrigen) || null
  );
  const trDestAccount = $derived(
    (data.cuentasBancarias || []).find((c: any) => c.cod_cta === trCtaDestino) || null
  );
  const trComAccount = $derived(
    (data.cuentasBancarias || []).find((c: any) => c.cod_cta === (trCtaComision || trCtaOrigen)) || null
  );

  const isCreditOp = $derived(["DP", "NC", "TP"].includes(tipoOp));
  const opSign = $derived(isCreditOp ? 1 : -1);

  const individualSummary = $derived.by(() => {
    const rate = Number(activeTasa || 1) > 0 ? Number(activeTasa) : 1;
    const rawAmt = Math.max(0, Number(montoInput || 0));
    const rawIdb = tipoOp === "ID" ? 0 : Math.max(0, Number(idbInput || 0));

    const amountBS = showUSD ? round2(rawAmt * rate) : round2(rawAmt);
    const amountUSD = showUSD ? round2(rawAmt) : round2(rawAmt / rate);
    const idbBS = showUSD ? round2(rawIdb * rate) : round2(rawIdb);
    const idbUSD = showUSD ? round2(rawIdb) : round2(rawIdb / rate);

    const accIsUSD = selectedAccount?.moneda_tipo === "USD";
    const nativeAmount = accIsUSD ? amountUSD : amountBS;
    const nativeIdb = tipoOp === "ID" ? nativeAmount : accIsUSD ? idbUSD : idbBS;
    const deltaBalance =
      tipoOp === "ID"
        ? -nativeAmount
        : isCreditOp
        ? nativeAmount + nativeIdb
        : -(nativeAmount + nativeIdb);

    const currentBalance = Number(selectedAccount?.saldo_total || 0);
    const currentBalanceUSD = accIsUSD ? round2(currentBalance) : round2(currentBalance / rate);
    const currentBalanceBS = accIsUSD ? round2(currentBalance * rate) : round2(currentBalance);

    const projectedBalance = isEditing ? currentBalance : round2(currentBalance + deltaBalance);
    const projectedBalanceUSD = accIsUSD ? round2(projectedBalance) : round2(projectedBalance / rate);
    const projectedBalanceBS = accIsUSD ? round2(projectedBalance * rate) : round2(projectedBalance);

    return {
      amountBS,
      amountUSD,
      idbBS,
      idbUSD,
      nativeAmount,
      nativeIdb,
      accIsUSD,
      deltaBalance,
      currentBalance,
      currentBalanceUSD,
      currentBalanceBS,
      projectedBalance,
      projectedBalanceUSD,
      projectedBalanceBS,
    };
  });

  const transferSummary = $derived.by(() => {
    const rate = Number(activeTasa || 1) > 0 ? Number(activeTasa) : 1;
    const amtOrig = Math.max(0, Number(trMontoOrigen || 0));
    const origIsUSD = trOrigAccount?.moneda_tipo === "USD";
    const destIsUSD = trDestAccount?.moneda_tipo === "USD";
    const comIsUSD = trComAccount?.moneda_tipo === "USD";
    const sameCurrency = origIsUSD === destIsUSD;

    let computedDest = amtOrig;
    if (!sameCurrency) {
      computedDest = origIsUSD ? round2(amtOrig * rate) : round2(amtOrig / rate);
    }

    const finalDest =
      trMontoDestinoOverride !== null && trMontoDestinoOverride > 0
        ? round2(trMontoDestinoOverride)
        : computedDest;

    const comAmt = trHasComision ? Math.max(0, Number(trComision || 0)) : 0;
    const origBalance = Number(trOrigAccount?.saldo_total || 0);
    const destBalance = Number(trDestAccount?.saldo_total || 0);
    const comSameAsOrig = (trCtaComision || trCtaOrigen) === trCtaOrigen;
    const comSameAsDest = (trCtaComision || trCtaOrigen) === trCtaDestino;

    const projectedOrig = isEditing
      ? origBalance
      : round2(origBalance - amtOrig - (comSameAsOrig ? comAmt : 0));
    const projectedDest = isEditing
      ? destBalance
      : round2(destBalance + finalDest - (comSameAsDest ? comAmt : 0));

    const amtOrigUSD = origIsUSD ? round2(amtOrig) : round2(amtOrig / rate);
    const amtOrigBS = origIsUSD ? round2(amtOrig * rate) : round2(amtOrig);
    const finalDestUSD = destIsUSD ? round2(finalDest) : round2(finalDest / rate);
    const finalDestBS = destIsUSD ? round2(finalDest * rate) : round2(finalDest);
    const comAmtUSD = comIsUSD ? round2(comAmt) : round2(comAmt / rate);
    const comAmtBS = comIsUSD ? round2(comAmt * rate) : round2(comAmt);

    const projectedOrigUSD = origIsUSD ? round2(projectedOrig) : round2(projectedOrig / rate);
    const projectedOrigBS = origIsUSD ? round2(projectedOrig * rate) : round2(projectedOrig);
    const projectedDestUSD = destIsUSD ? round2(projectedDest) : round2(projectedDest / rate);
    const projectedDestBS = destIsUSD ? round2(projectedDest * rate) : round2(projectedDest);

    return {
      amtOrig,
      amtOrigUSD,
      amtOrigBS,
      origIsUSD,
      destIsUSD,
      comIsUSD,
      sameCurrency,
      computedDest,
      finalDest,
      finalDestUSD,
      finalDestBS,
      comAmt,
      comAmtUSD,
      comAmtBS,
      origBalance,
      destBalance,
      projectedOrig,
      projectedOrigUSD,
      projectedOrigBS,
      projectedDest,
      projectedDestUSD,
      projectedDestBS,
    };
  });

  function handleBranchChange() {
    const params = new URLSearchParams($page.url.searchParams);
    if (filterSede) params.set("branch_id", filterSede);
    else params.delete("branch_id");
    goto(`?${params.toString()}`);
  }

  function handleSelectAccount(newCodCta: string) {
    codCta = newCodCta;
  }

  function handleSelectTipoOp(codigo: string) {
    tipoOp = codigo;
    if (!userChangedIngEgr) {
      coCtaIngrEgr = ["DP", "NC", "TP"].includes(codigo)
        ? data.defaults?.cta_ingr_egr_ingreso || "01"
        : data.defaults?.cta_ingr_egr_egreso || "02";
    }
    if (codigo === "ID") idbInput = 0;
  }

  function switchCurrency(toUSD: boolean) {
    if (showUSD === toUSD) return;
    const rate = Number(activeTasa || 1) > 0 ? Number(activeTasa) : 1;
    if (toUSD) {
      montoInput = round2(montoInput / rate);
      idbInput = round2(idbInput / rate);
    } else {
      montoInput = round2(montoInput * rate);
      idbInput = round2(idbInput * rate);
    }
    showUSD = toUSD;
  }

  async function fetchExchangeRate() {
    if (!filterSede) return;
    isFetchingRate = true;
    try {
      const res = await fetch(`/api/agent/tasa?branch_id=${encodeURIComponent(filterSede)}`);
      if (res.ok) {
        const json = await res.json();
        const newRate = Number(json.tasa || json.data?.tasa || 1);
        if (newRate > 0) {
          activeTasa = newRate;
          toast.success(`Tasa actualizada: Bs. ${newRate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`);
        }
      } else {
        toast.error("No se pudo obtener la tasa desde el agente.");
      }
    } catch (e: any) {
      toast.error("Error consultando tasa: " + e.message);
    } finally {
      isFetchingRate = false;
    }
  }

  function resetForm() {
    if (isEditing) {
      goto(`/dashboard/banks/movements?branch_id=${encodeURIComponent(filterSede)}`);
      return;
    }
    saveSuccess = false;
    savedResult = null;
    manualMovNumEnabled = false;
    manualMovNum = "";
    docNum = "";
    descrip = "";
    montoInput = 0;
    idbInput = 0;
    userChangedIngEgr = false;
    coCtaIngrEgr = ["DP", "NC", "TP"].includes(tipoOp) ? "01" : "02";

    trManualCodeEnabled = false;
    trCode = "";
    trRefOrigen = "";
    trRefDestino = "";
    trDescrip = "";
    trMontoOrigen = 0;
    trMontoDestinoOverride = null;
    trHasComision = false;
    trComision = 0;
    trRefComis = "";
  }

  async function handleSave() {
    if (data.editError) {
      toast.error(data.editError);
      return;
    }

    if (activeTab === "individual") {
      if (!data.canCreate && !isEditing) {
        toast.error("No tienes permiso para registrar movimientos bancarios.");
        return;
      }
      if (isEditing && !data.canEdit) {
        toast.error("No tienes permiso para editar movimientos bancarios.");
        return;
      }
      if (!codCta) {
        toast.error("Selecciona una cuenta bancaria.");
        return;
      }
      if (Number(montoInput) <= 0) {
        toast.error("El monto del movimiento debe ser mayor a cero.");
        return;
      }
      if (!isEditing && manualMovNumEnabled && !manualMovNum.trim()) {
        toast.error("Ingresa el N° de Movimiento manual o desactiva el ingreso manual.");
        return;
      }

      isSaving = true;
      try {
        const bodyPayload = {
          branch_id: filterSede,
          movimiento: {
            cod_cta: codCta,
            tipo_op: tipoOp,
            mov_num: !isEditing && manualMovNumEnabled ? manualMovNum.trim() : undefined,
            doc_num: docNum.trim(),
            fecha,
            fecha_che: fechaChe || fecha,
            co_cta_ingr_egr: coCtaIngrEgr,
            descrip: descrip.trim(),
            monto: Number(montoInput),
            idb: tipoOp === "ID" ? 0 : Number(idbInput || 0),
            moneda_input: showUSD ? "USD" : "BS",
            tasa: Number(activeTasa || 1),
          },
        };

        const url = isEditing
          ? `/api/agent/bancos/movimientos/${encodeURIComponent(editMov.mov_num)}`
          : `/api/agent/bancos/movimientos`;

        const res = await fetch(url, {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
        });
        const json = await res.json();

        if (!res.ok || json.success === false) {
          toast.error(json.message || "Error al guardar el movimiento bancario.");
          return;
        }

        savedResult = {
          mode: "individual",
          mov_num: json.mov_num,
          doc_num: json.doc_num,
          cod_cta: json.cod_cta,
          co_mone: json.co_mone,
          monto: json.monto,
          tipo_op: json.tipo_op,
        };
        saveSuccess = true;
        toast.success(json.message || "Movimiento bancario guardado con éxito.");
      } catch (e: any) {
        toast.error("Error de comunicación: " + e.message);
      } finally {
        isSaving = false;
      }
      return;
    }

    // Tab 2: Transferencia entre Cuentas
    if (!data.canCreate && !isEditing) {
      toast.error("No tienes permiso para registrar transferencias entre cuentas.");
      return;
    }
    if (isEditing && !data.canEdit) {
      toast.error("No tienes permiso para editar transferencias entre cuentas.");
      return;
    }
    if (!trCtaOrigen || !trCtaDestino) {
      toast.error("Selecciona cuenta origen y cuenta destino.");
      return;
    }
    if (trCtaOrigen === trCtaDestino) {
      toast.error("La cuenta origen y destino no pueden ser la misma.");
      return;
    }
    if (Number(trMontoOrigen) <= 0) {
      toast.error("El monto a transferir debe ser mayor a cero.");
      return;
    }
    if (!isEditing && trManualCodeEnabled && !trCode.trim()) {
      toast.error("Ingresa el N° de Transferencia manual o desactiva el ingreso manual.");
      return;
    }

    isSaving = true;
    try {
      const bodyPayload = {
        branch_id: filterSede,
        transferencia: {
          co_trans_ban: !isEditing && trManualCodeEnabled ? trCode.trim() : undefined,
          des_trans_ban: trDescrip.trim(),
          fecha: trFecha,
          fecha_origen: trFechaOrigen || trFecha,
          fecha_destino: trFechaDestino || trFecha,
          cta_origen: trCtaOrigen,
          cta_destino: trCtaDestino,
          cta_ingr_egr_origen: trCtaIngEgrOrigen,
          cta_ingr_egr_destino: trCtaIngEgrDestino,
          referencia_origen: trRefOrigen.trim(),
          referencia_destino: trRefDestino.trim(),
          monto: Number(trMontoOrigen),
          monto_destino: transferSummary.finalDest,
          tasa: Number(activeTasa || 1),
          comision: trHasComision ? Number(trComision || 0) : 0,
          cta_comision: trHasComision ? (trCtaComision || trCtaOrigen) : trCtaOrigen,
          cta_ingr_egr_comision: trCtaIngEgrComision,
          referencia_comis: trRefComis.trim(),
        },
      };

      const url = isEditingTransfer
        ? `/api/agent/bancos/transferencias/${encodeURIComponent(editMov.transferencia.co_trans_ban)}`
        : `/api/agent/bancos/transferencias`;

      const res = await fetch(url, {
        method: isEditingTransfer ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      const json = await res.json();

      if (!res.ok || json.success === false) {
        toast.error(json.message || "Error al procesar la transferencia entre cuentas.");
        return;
      }

      savedResult = {
        mode: "transfer",
        co_trans_ban: json.co_trans_ban,
        mov_num: json.mov_ban_origen,
        mov_ban_origen: json.mov_ban_origen,
        mov_ban_destino: json.mov_ban_destino,
        mov_ban_comision: json.mov_ban_comision,
        monto_origen: json.monto_origen,
        monto_destino: json.monto_destino,
        comision: json.comision,
      };
      saveSuccess = true;
      toast.success(json.message || "Transferencia entre cuentas procesada con éxito.");
    } catch (e: any) {
      toast.error("Error de comunicación: " + e.message);
    } finally {
      isSaving = false;
    }
  }
</script>

{#if saveSuccess && savedResult}
  <div
    class="glass p-10 md:p-12 rounded-[36px] border border-green-500/20 max-w-2xl mx-auto flex flex-col items-center justify-center text-center space-y-6 mt-10"
    in:fade
  >
    <div class="h-20 w-20 rounded-3xl bg-green-500/10 flex items-center justify-center text-green-400 shadow-lg shadow-green-500/10">
      <Check size={44} />
    </div>
    <div class="space-y-2">
      <h2 class="text-3xl font-black text-text-base">
        {#if savedResult.mode === "transfer"}
          {isEditing ? "¡Transferencia Actualizada!" : "¡Transferencia Registrada!"}
        {:else}
          {isEditing ? "¡Movimiento Actualizado!" : "¡Movimiento Registrado!"}
        {/if}
      </h2>
      <p class="text-text-muted text-sm">
        Los saldos bancarios en Profit Plus han sido actualizados y sincronizados automáticamente.
      </p>
    </div>

    <div class="grid grid-cols-2 gap-4 w-full text-left">
      {#if savedResult.mode === "transfer"}
        <div class="bg-surface-soft p-4 rounded-2xl border border-border-subtle">
          <span class="text-[10px] text-text-muted/70 uppercase font-bold tracking-wider">N° Transferencia</span>
          <div class="text-xl font-black text-brand-400 mt-0.5 font-mono">{savedResult.co_trans_ban}</div>
        </div>
        <div class="bg-surface-soft p-4 rounded-2xl border border-border-subtle">
          <span class="text-[10px] text-text-muted/70 uppercase font-bold tracking-wider">Mov. Origen / Destino</span>
          <div class="text-sm font-bold text-text-base mt-1 font-mono">
            {savedResult.mov_ban_origen} → {savedResult.mov_ban_destino}
          </div>
        </div>
        <div class="col-span-2 bg-surface-soft/60 px-4 py-3 rounded-2xl border border-border-subtle flex justify-between items-center text-sm">
          <span class="text-text-muted font-medium">Monto Transferido / Acreditado:</span>
          <div class="font-mono font-bold text-text-base">
            {formatMoney(savedResult.monto_origen, transferSummary.origIsUSD)} → {formatMoney(savedResult.monto_destino, transferSummary.destIsUSD)}
          </div>
        </div>
      {:else}
        <div class="bg-surface-soft p-4 rounded-2xl border border-border-subtle">
          <span class="text-[10px] text-text-muted/70 uppercase font-bold tracking-wider">N° Movimiento</span>
          <div class="text-xl font-black text-brand-400 mt-0.5 font-mono">{savedResult.mov_num}</div>
        </div>
        <div class="bg-surface-soft p-4 rounded-2xl border border-border-subtle">
          <span class="text-[10px] text-text-muted/70 uppercase font-bold tracking-wider">Tipo / Cuenta</span>
          <div class="text-xl font-black text-text-base mt-0.5 font-mono">
            {savedResult.tipo_op} · {savedResult.cod_cta}
          </div>
        </div>
        <div class="col-span-2 bg-surface-soft/60 px-4 py-3 rounded-2xl border border-border-subtle flex justify-between items-center text-sm">
          <span class="text-text-muted font-medium">Monto Registrado ({savedResult.co_mone}):</span>
          <div class="font-mono font-bold text-text-base">
            {formatMoney(savedResult.monto, savedResult.co_mone !== "BS")}
          </div>
        </div>
      {/if}
    </div>

    <div class="flex flex-col sm:flex-row gap-3 w-full">
      <a
        href="/dashboard/banks/movements/history?branch_id={encodeURIComponent(filterSede)}"
        class="flex-1 text-center bg-surface-soft hover:bg-surface-strong text-text-base px-6 py-3.5 rounded-2xl font-bold transition-all text-sm flex items-center justify-center border border-border-subtle"
      >
        Ver Historial
      </a>
      <a
        href="/dashboard/banks/movements/{encodeURIComponent(savedResult.mov_num)}/print?branch_id={encodeURIComponent(filterSede)}"
        target="_blank"
        class="flex-1 text-center bg-surface-soft hover:bg-surface-strong text-text-base px-6 py-3.5 rounded-2xl font-bold transition-all text-sm flex items-center justify-center border border-border-subtle"
      >
        Imprimir Comprobante
      </a>
      <button
        onclick={resetForm}
        class="flex-1 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-brand-500/20 text-sm cursor-pointer"
      >
        {isEditing ? "Nuevo Movimiento" : "Registrar Otro"}
      </button>
    </div>
  </div>
{:else}
  <div class="max-w-7xl mx-auto space-y-6 pb-20">
    {#if data.error}
      <div class="glass p-5 rounded-3xl border border-red-500/30 bg-red-500/10 flex items-center gap-4">
        <div class="h-11 w-11 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-400 shrink-0">
          <AlertCircle size={22} />
        </div>
        <div>
          <h3 class="text-xs font-black text-red-400 uppercase tracking-widest">Error de Conexión</h3>
          <p class="text-sm text-text-base font-medium">{data.error}</p>
        </div>
      </div>
    {/if}

    {#if data.editError}
      <div class="glass p-5 rounded-3xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="h-11 w-11 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
            <AlertCircle size={22} />
          </div>
          <div>
            <h3 class="text-xs font-black text-amber-500 uppercase tracking-widest mb-0.5">Aviso de Edición</h3>
            <p class="text-text-muted font-semibold text-sm">{data.editError}</p>
          </div>
        </div>
        <a
          href="/dashboard/banks/movements/history?branch_id={encodeURIComponent(filterSede)}"
          class="px-4 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong text-xs font-bold border border-border-subtle transition-all shrink-0"
        >
          Volver al Historial
        </a>
      </div>
    {/if}

    <!-- TOP HEADER -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
          <Landmark size={40} class="text-brand-500" />
          {#if isEditingTransfer}
            Editar Transferencia #{editMov.transferencia.co_trans_ban}
          {:else if isEditing}
            Editar Movimiento #{editMov.mov_num}
          {:else}
            Movimientos Bancarios
          {/if}
        </h1>
        <p class="text-text-muted mt-2 text-base">
          {isEditing
            ? "Modificación de operación bancaria directa (origen BAN) con actualización automática de saldos."
            : "Registro de depósitos, notas de crédito/débito, cheques, retiros, IGTF y transferencias entre cuentas."}
        </p>
      </div>

      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
        {#if data.branches && data.branches.length > 1}
          <div class="w-full sm:w-56 relative group">
            <Store
              size={16}
              class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
            <select
              bind:value={filterSede}
              onchange={handleBranchChange}
              disabled={isEditing}
              class="w-full h-14 pl-10 pr-10 bg-surface-soft border border-border-subtle rounded-2xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-sm appearance-none cursor-pointer text-text-base disabled:opacity-60"
            >
              {#each data.branches as b}
                <option value={b.id}>{b.name}</option>
              {/each}
            </select>
            <ChevronDown size={16} class="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
        {/if}

        <button
          onclick={() => goto(`/dashboard/banks/movements/history?branch_id=${encodeURIComponent(filterSede)}`)}
          class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-surface-strong hover:bg-surface-base text-text-base border border-border-subtle transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer"
        >
          <Clock size={18} class="text-brand-400" />
          Ver Historial
        </button>
      </div>
    </div>

    <!-- MODO TABS -->
    <div class="inline-flex p-1.5 rounded-2xl bg-surface-soft border border-border-subtle gap-1.5">
      <button
        type="button"
        disabled={isEditing && isEditingTransfer}
        onclick={() => (activeTab = "individual")}
        class="px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed {activeTab === 'individual'
          ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
          : 'text-text-muted hover:text-text-base'}"
      >
        <Receipt size={16} />
        Movimiento Individual
      </button>
      <button
        type="button"
        disabled={isEditing && !isEditingTransfer}
        onclick={() => (activeTab = "transfer")}
        class="px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed {activeTab === 'transfer'
          ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
          : 'text-text-muted hover:text-text-base'}"
      >
        <ArrowRightLeft size={16} />
        Transferencia entre Cuentas
      </button>
    </div>

    <!-- MAIN GRID -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
      <!-- LEFT 2 COLS -->
      <div class="xl:col-span-2 space-y-6">
        {#if activeTab === "individual"}
          <!-- 1. CUENTA BANCARIA Y TIPO DE OPERACION -->
          <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-6">
            <div class="flex items-center justify-between border-b border-border-subtle pb-4">
              <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                <Landmark size={16} />
                Cuenta Bancaria y Tipo de Operación
              </h3>
              {#if selectedAccount}
                <span class="px-3 py-1 rounded-full text-xs font-black font-mono {selectedAccount.moneda_tipo === 'USD' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-brand-500/15 text-brand-400 border border-brand-500/20'}">
                  Moneda Cuenta: {selectedAccount.co_mone} · Saldo: {formatAccountDualBalance(selectedAccount, showUSD, activeTasa)}
                </span>
              {/if}
            </div>

            <div>
              <label for="cod_cta" class="text-xs font-bold text-text-muted block mb-1.5">Cuenta Bancaria *</label>
              <select
                id="cod_cta"
                value={codCta}
                onchange={(e) => handleSelectAccount((e.currentTarget as HTMLSelectElement).value)}
                class="w-full h-12 px-4 bg-surface-soft border border-border-subtle rounded-xl text-sm font-bold focus:border-brand-500 outline-none cursor-pointer"
              >
                <option value="">-- Seleccionar Cuenta --</option>
                {#each data.cuentasBancarias as c}
                  <option value={c.cod_cta}>
                    {c.cod_cta} · {c.des_ban} ({c.num_cta}) [{c.co_mone}] — Saldo: {formatAccountDualBalance(c, showUSD, activeTasa)}
                  </option>
                {/each}
              </select>
            </div>

            <!-- TIPO DE OPERACION POR NATURALEZA -->
            <div class="space-y-4">
              <div>
                <span class="text-[11px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-2">
                  <ArrowUpCircle size={14} /> Ingresos (Crédito a Cuenta)
                </span>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {#each INCOME_OPS as op}
                    <button
                      type="button"
                      onclick={() => handleSelectTipoOp(op.codigo)}
                      class="px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between {tipoOp === op.codigo
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400 shadow-sm'
                        : 'bg-surface-soft/60 border-border-subtle text-text-muted hover:text-text-base'}"
                    >
                      <span class="text-xs font-bold">{op.label}</span>
                      <span class="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-surface-strong">{op.short}</span>
                    </button>
                  {/each}
                </div>
              </div>

              <div>
                <span class="text-[11px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5 mb-2">
                  <ArrowDownCircle size={14} /> Egresos (Débito a Cuenta)
                </span>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {#each EXPENSE_OPS as op}
                    <button
                      type="button"
                      onclick={() => handleSelectTipoOp(op.codigo)}
                      class="px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between {tipoOp === op.codigo
                        ? 'bg-rose-500/15 border-rose-500 text-rose-400 shadow-sm'
                        : 'bg-surface-soft/60 border-border-subtle text-text-muted hover:text-text-base'}"
                    >
                      <span class="text-xs font-bold">{op.label}</span>
                      <span class="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-surface-strong">{op.short}</span>
                    </button>
                  {/each}
                </div>
              </div>

              <div>
                <span class="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-2">
                  <Coins size={14} /> Impuesto Bancario
                </span>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {#each TAX_OPS as op}
                    <button
                      type="button"
                      onclick={() => handleSelectTipoOp(op.codigo)}
                      class="px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between {tipoOp === op.codigo
                        ? 'bg-amber-500/15 border-amber-500 text-amber-400 shadow-sm'
                        : 'bg-surface-soft/60 border-border-subtle text-text-muted hover:text-text-base'}"
                    >
                      <span class="text-xs font-bold">{op.label}</span>
                      <span class="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-surface-strong">{op.short}</span>
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          </div>

          <!-- 2. DATOS DEL MOVIMIENTO -->
          <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-5">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-subtle pb-4">
              <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                <FileText size={16} />
                Datos del Movimiento
              </h3>
              {#if !isEditing}
                <label class="inline-flex items-center gap-2 text-xs font-bold text-text-muted cursor-pointer select-none">
                  <input
                    type="checkbox"
                    bind:checked={manualMovNumEnabled}
                    class="rounded border-border-subtle text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                  Ingresar N° Movimiento manualmente
                </label>
              {/if}
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label for="mov_num_input" class="text-xs font-bold text-text-muted block mb-1.5 flex items-center gap-1">
                  <Hash size={12} /> N° Movimiento (Profit)
                </label>
                {#if isEditing}
                  <input
                    id="mov_num_input"
                    type="text"
                    value={editMov.mov_num}
                    disabled
                    class="w-full h-11 px-3 bg-surface-soft/50 border border-border-subtle rounded-xl text-sm font-mono font-bold opacity-70 cursor-not-allowed"
                  />
                {:else if manualMovNumEnabled}
                  <input
                    id="mov_num_input"
                    type="text"
                    bind:value={manualMovNum}
                    maxlength="20"
                    placeholder="Ej. 81845"
                    class="w-full h-11 px-3 bg-surface-soft border border-brand-500/40 rounded-xl text-sm font-mono font-bold focus:border-brand-500 outline-none"
                  />
                {:else}
                  <div class="w-full h-11 px-3 bg-surface-soft/50 border border-border-subtle rounded-xl text-xs font-semibold text-text-muted flex items-center">
                    Automático (Serie MOVB_NUM)
                  </div>
                {/if}
              </div>

              <div>
                <label for="doc_num" class="text-xs font-bold text-text-muted block mb-1.5">N° Referencia / Cheque</label>
                <input
                  id="doc_num"
                  type="text"
                  bind:value={docNum}
                  maxlength="20"
                  placeholder="Ej. 00451982 (Opcional)"
                  class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-mono font-medium focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <label for="co_cta_ie" class="text-xs font-bold text-text-muted block mb-1.5">Cuenta Ingreso / Egreso</label>
                <select
                  id="co_cta_ie"
                  bind:value={coCtaIngrEgr}
                  onchange={() => (userChangedIngEgr = true)}
                  class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-medium focus:border-brand-500 outline-none cursor-pointer"
                >
                  {#each data.cuentasIngrEgr as cie}
                    <option value={cie.co_cta_ingr_egr}>{cie.co_cta_ingr_egr} · {cie.descrip}</option>
                  {/each}
                </select>
              </div>

              <div>
                <label for="fec_mov" class="text-xs font-bold text-text-muted block mb-1.5 flex items-center gap-1">
                  <Calendar size={12} /> Fecha Movimiento *
                </label>
                <input
                  id="fec_mov"
                  type="date"
                  bind:value={fecha}
                  onchange={() => { if (!isEditing) fechaChe = fecha; }}
                  class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-medium focus:border-brand-500 outline-none cursor-pointer"
                />
              </div>

              <div>
                <label for="fec_che" class="text-xs font-bold text-text-muted block mb-1.5">Fecha Efectiva / Cheque</label>
                <input
                  id="fec_che"
                  type="date"
                  bind:value={fechaChe}
                  class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-medium focus:border-brand-500 outline-none cursor-pointer"
                />
              </div>

              <div class="sm:col-span-3">
                <label for="descrip_mov" class="text-xs font-bold text-text-muted block mb-1.5">Descripción / Concepto</label>
                <input
                  id="descrip_mov"
                  type="text"
                  bind:value={descrip}
                  maxlength="160"
                  placeholder="Concepto detallado del movimiento bancario"
                  class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-medium focus:border-brand-500 outline-none"
                />
              </div>
            </div>

            <!-- MONTOS -->
            <div class="flex items-center justify-between pt-2 border-t border-border-subtle/50">
              <span class="text-xs font-bold uppercase tracking-wider text-text-muted">Montos del Movimiento</span>
              <span class="text-xs font-semibold text-text-muted">
                Valores expresados en <strong class="text-brand-400 font-mono">{showUSD ? "Dólares ($)" : "Bolívares (Bs.)"}</strong>
              </span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="bg-surface-soft/60 p-4 rounded-2xl border border-border-subtle space-y-2">
                <div class="flex justify-between items-center">
                  <label for="monto_mov" class="text-xs font-bold uppercase tracking-wider text-text-base">
                    Monto de la Operación *
                  </label>
                  <span class="text-[11px] font-mono text-text-muted">
                    {showUSD ? `≈ ${formatMoney(individualSummary.amountBS, false)}` : `≈ ${formatMoney(individualSummary.amountUSD, true)}`}
                  </span>
                </div>
                <div class="relative">
                  <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">
                    {showUSD ? "$" : "Bs."}
                  </span>
                  <input
                    id="monto_mov"
                    type="number"
                    step="0.01"
                    min="0"
                    bind:value={montoInput}
                    class="w-full h-12 pl-11 pr-4 bg-surface-base border border-border-subtle rounded-xl text-lg font-black font-mono text-text-base focus:border-brand-500 outline-none"
                  />
                </div>
              </div>

              {#if tipoOp !== "ID"}
                <div class="bg-surface-soft/60 p-4 rounded-2xl border border-border-subtle space-y-2">
                  <div class="flex justify-between items-center">
                    <label for="idb_mov" class="text-xs font-bold uppercase tracking-wider text-text-muted">
                      IDB / IGTF Asociado (Opcional)
                    </label>
                    <span class="text-[11px] font-mono text-text-muted">
                      {showUSD ? `≈ ${formatMoney(individualSummary.idbBS, false)}` : `≈ ${formatMoney(individualSummary.idbUSD, true)}`}
                    </span>
                  </div>
                  <div class="relative">
                    <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">
                      {showUSD ? "$" : "Bs."}
                    </span>
                    <input
                      id="idb_mov"
                      type="number"
                      step="0.01"
                      min="0"
                      bind:value={idbInput}
                      class="w-full h-12 pl-11 pr-4 bg-surface-base border border-border-subtle rounded-xl text-lg font-bold font-mono text-text-base focus:border-brand-500 outline-none"
                    />
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <!-- TAB 2: TRANSFERENCIA ENTRE CUENTAS -->
          <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl space-y-6">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-subtle pb-4">
              <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                <ArrowRightLeft size={16} />
                Transferencia entre Cuentas Bancarias
              </h3>
              {#if !isEditing}
                <label class="inline-flex items-center gap-2 text-xs font-bold text-text-muted cursor-pointer select-none">
                  <input
                    type="checkbox"
                    bind:checked={trManualCodeEnabled}
                    class="rounded border-border-subtle text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                  Ingresar N° Transferencia manualmente
                </label>
              {/if}
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label for="tr_code" class="text-xs font-bold text-text-muted block mb-1.5">N° Transferencia</label>
                {#if isEditing}
                  <input id="tr_code" type="text" value={trCode} disabled class="w-full h-11 px-3 bg-surface-soft/50 border border-border-subtle rounded-xl text-sm font-mono font-bold opacity-70" />
                {:else if trManualCodeEnabled}
                  <input id="tr_code" type="text" bind:value={trCode} maxlength="20" placeholder="Ej. 32277" class="w-full h-11 px-3 bg-surface-soft border border-brand-500/40 rounded-xl text-sm font-mono font-bold outline-none" />
                {:else}
                  <div class="w-full h-11 px-3 bg-surface-soft/50 border border-border-subtle rounded-xl text-xs font-semibold text-text-muted flex items-center">
                    Automático (Serie TRENCU_NUM)
                  </div>
                {/if}
              </div>

              <div>
                <label for="tr_fecha" class="text-xs font-bold text-text-muted block mb-1.5">Fecha Registro *</label>
                <input
                  id="tr_fecha"
                  type="date"
                  bind:value={trFecha}
                  onchange={() => {
                    if (!isEditing) {
                      trFechaOrigen = trFecha;
                      trFechaDestino = trFecha;
                    }
                  }}
                  class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-medium outline-none"
                />
              </div>

              <div>
                <label for="tr_descrip" class="text-xs font-bold text-text-muted block mb-1.5">Concepto / Descripción</label>
                <input
                  id="tr_descrip"
                  type="text"
                  bind:value={trDescrip}
                  maxlength="60"
                  placeholder="TRANSFERENCIA ENTRE CUENTAS"
                  class="w-full h-11 px-3 bg-surface-soft border border-border-subtle rounded-xl text-sm font-medium outline-none"
                />
              </div>
            </div>

            <!-- CUENTA ORIGEN VS DESTINO -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
              <!-- ORIGEN -->
              <div class="bg-rose-500/5 p-5 rounded-2xl border border-rose-500/20 space-y-4">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                    <ArrowDownCircle size={15} /> Cuenta Origen (Salida / TR)
                  </span>
                  {#if trOrigAccount}
                    <span class="text-[11px] font-mono font-bold text-text-muted">
                      {trOrigAccount.co_mone} · {formatAccountDualBalance(trOrigAccount, showUSD, activeTasa)}
                    </span>
                  {/if}
                </div>

                <div>
                  <label for="tr_orig" class="text-xs font-bold text-text-muted block mb-1">Cuenta Bancaria Origen *</label>
                  <select id="tr_orig" bind:value={trCtaOrigen} class="w-full h-11 px-3 bg-surface-base border border-border-subtle rounded-xl text-sm font-bold outline-none">
                    <option value="">-- Seleccionar --</option>
                    {#each data.cuentasBancarias as c}
                      <option value={c.cod_cta}>{c.cod_cta} · {c.des_ban} [{c.co_mone}]</option>
                    {/each}
                  </select>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label for="tr_ref_o" class="text-xs font-bold text-text-muted block mb-1">Referencia Origen</label>
                    <input id="tr_ref_o" type="text" bind:value={trRefOrigen} maxlength="20" placeholder="Ref. Débito" class="w-full h-10 px-3 bg-surface-base border border-border-subtle rounded-xl text-xs font-mono outline-none" />
                  </div>
                  <div>
                    <label for="tr_fec_o" class="text-xs font-bold text-text-muted block mb-1">Fecha Débito</label>
                    <input id="tr_fec_o" type="date" bind:value={trFechaOrigen} class="w-full h-10 px-3 bg-surface-base border border-border-subtle rounded-xl text-xs outline-none" />
                  </div>
                </div>

                <div>
                  <label for="tr_ie_o" class="text-xs font-bold text-text-muted block mb-1">Cta Ing/Egr Salida</label>
                  <select id="tr_ie_o" bind:value={trCtaIngEgrOrigen} class="w-full h-10 px-3 bg-surface-base border border-border-subtle rounded-xl text-xs outline-none">
                    {#each data.cuentasIngrEgr as cie}
                      <option value={cie.co_cta_ingr_egr}>{cie.co_cta_ingr_egr} · {cie.descrip}</option>
                    {/each}
                  </select>
                </div>

                <div>
                  <label for="tr_monto_o" class="text-xs font-bold text-text-base block mb-1">
                    Monto Debitando ({trOrigAccount?.co_mone || "BS"}) *
                  </label>
                  <input
                    id="tr_monto_o"
                    type="number"
                    step="0.01"
                    min="0"
                    bind:value={trMontoOrigen}
                    class="w-full h-12 px-3 bg-surface-base border border-border-subtle rounded-xl text-lg font-black font-mono outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <!-- DESTINO -->
              <div class="bg-emerald-500/5 p-5 rounded-2xl border border-emerald-500/20 space-y-4">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <ArrowUpCircle size={15} /> Cuenta Destino (Entrada / TP)
                  </span>
                  {#if trDestAccount}
                    <span class="text-[11px] font-mono font-bold text-text-muted">
                      {trDestAccount.co_mone} · {formatAccountDualBalance(trDestAccount, showUSD, activeTasa)}
                    </span>
                  {/if}
                </div>

                <div>
                  <label for="tr_dest" class="text-xs font-bold text-text-muted block mb-1">Cuenta Bancaria Destino *</label>
                  <select id="tr_dest" bind:value={trCtaDestino} class="w-full h-11 px-3 bg-surface-base border border-border-subtle rounded-xl text-sm font-bold outline-none">
                    <option value="">-- Seleccionar --</option>
                    {#each data.cuentasBancarias as c}
                      <option value={c.cod_cta}>{c.cod_cta} · {c.des_ban} [{c.co_mone}]</option>
                    {/each}
                  </select>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label for="tr_ref_d" class="text-xs font-bold text-text-muted block mb-1">Referencia Destino</label>
                    <input id="tr_ref_d" type="text" bind:value={trRefDestino} maxlength="20" placeholder="Ref. Crédito" class="w-full h-10 px-3 bg-surface-base border border-border-subtle rounded-xl text-xs font-mono outline-none" />
                  </div>
                  <div>
                    <label for="tr_fec_d" class="text-xs font-bold text-text-muted block mb-1">Fecha Crédito</label>
                    <input id="tr_fec_d" type="date" bind:value={trFechaDestino} class="w-full h-10 px-3 bg-surface-base border border-border-subtle rounded-xl text-xs outline-none" />
                  </div>
                </div>

                <div>
                  <label for="tr_ie_d" class="text-xs font-bold text-text-muted block mb-1">Cta Ing/Egr Entrada</label>
                  <select id="tr_ie_d" bind:value={trCtaIngEgrDestino} class="w-full h-10 px-3 bg-surface-base border border-border-subtle rounded-xl text-xs outline-none">
                    {#each data.cuentasIngrEgr as cie}
                      <option value={cie.co_cta_ingr_egr}>{cie.co_cta_ingr_egr} · {cie.descrip}</option>
                    {/each}
                  </select>
                </div>

                <div>
                  <div class="flex justify-between items-center mb-1">
                    <label for="tr_monto_d" class="text-xs font-bold text-text-base">
                      Monto Acreditando ({trDestAccount?.co_mone || "BS"})
                    </label>
                    {#if !transferSummary.sameCurrency}
                      <button
                        type="button"
                        onclick={() => (trMontoDestinoOverride = null)}
                        class="text-[10px] font-bold text-brand-400 hover:underline cursor-pointer"
                      >
                        Auto según tasa
                      </button>
                    {/if}
                  </div>
                  <input
                    id="tr_monto_d"
                    type="number"
                    step="0.01"
                    min="0"
                    value={trMontoDestinoOverride ?? transferSummary.computedDest}
                    oninput={(e) => {
                      const val = Number((e.currentTarget as HTMLInputElement).value || 0);
                      trMontoDestinoOverride = val > 0 ? val : null;
                    }}
                    class="w-full h-12 px-3 bg-surface-base border border-border-subtle rounded-xl text-lg font-black font-mono outline-none focus:border-brand-500"
                  />
                </div>
              </div>
            </div>

            <!-- COMISIÓN BANCARIA OPCIONAL -->
            <div class="bg-surface-soft/50 p-4 rounded-2xl border border-border-subtle space-y-4">
              <label class="inline-flex items-center gap-2.5 text-sm font-bold text-text-base cursor-pointer select-none">
                <input
                  type="checkbox"
                  bind:checked={trHasComision}
                  class="rounded border-border-subtle text-brand-600 focus:ring-brand-500 cursor-pointer"
                />
                Incluir Comisión Bancaria (genera Nota de Débito adicional)
              </label>

              {#if trHasComision}
                <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                  <div>
                    <label for="tr_com_monto" class="text-xs font-bold text-text-muted block mb-1">
                      Monto Comisión ({trComAccount?.co_mone || "BS"})
                    </label>
                    <input id="tr_com_monto" type="number" step="0.01" min="0" bind:value={trComision} class="w-full h-10 px-3 bg-surface-base border border-border-subtle rounded-xl text-sm font-mono font-bold outline-none" />
                  </div>
                  <div>
                    <label for="tr_com_cta" class="text-xs font-bold text-text-muted block mb-1">Cuenta Cargo</label>
                    <select id="tr_com_cta" bind:value={trCtaComision} class="w-full h-10 px-3 bg-surface-base border border-border-subtle rounded-xl text-xs outline-none">
                      {#each data.cuentasBancarias as c}
                        <option value={c.cod_cta}>{c.cod_cta} · {c.des_ban}</option>
                      {/each}
                    </select>
                  </div>
                  <div>
                    <label for="tr_com_ie" class="text-xs font-bold text-text-muted block mb-1">Cta Egreso</label>
                    <select id="tr_com_ie" bind:value={trCtaIngEgrComision} class="w-full h-10 px-3 bg-surface-base border border-border-subtle rounded-xl text-xs outline-none">
                      {#each data.cuentasIngrEgr as cie}
                        <option value={cie.co_cta_ingr_egr}>{cie.co_cta_ingr_egr} · {cie.descrip}</option>
                      {/each}
                    </select>
                  </div>
                  <div>
                    <label for="tr_com_ref" class="text-xs font-bold text-text-muted block mb-1">Ref. Comisión</label>
                    <input id="tr_com_ref" type="text" bind:value={trRefComis} maxlength="20" placeholder="Opcional" class="w-full h-10 px-3 bg-surface-base border border-border-subtle rounded-xl text-xs font-mono outline-none" />
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- RIGHT STICKY COLUMN: TASA + SWITCH MONEDA + RESUMEN -->
      <div class="xl:col-span-1">
        <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl sticky top-6 space-y-6">
          <!-- TASA CAMBIARIA Y SWITCH USD / BS -->
          <div class="flex items-center justify-between gap-3 pb-4 border-b border-border-subtle">
            <div>
              <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block mb-1">Tasa Cambiaria</span>
              <div class="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  bind:value={activeTasa}
                  class="w-24 h-9 px-2.5 bg-surface-soft border border-border-subtle rounded-lg text-sm font-mono font-bold text-brand-400 focus:border-brand-500 outline-none"
                />
                <span class="text-xs font-bold text-text-muted">Bs/$</span>
                <button
                  type="button"
                  onclick={fetchExchangeRate}
                  disabled={isFetchingRate}
                  class="p-1.5 rounded-lg hover:bg-surface-strong text-text-muted hover:text-brand-400 transition-colors cursor-pointer"
                  title="Sincronizar tasa actual"
                >
                  <RefreshCw size={14} class={isFetchingRate ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            <div class="inline-flex bg-surface-soft p-1 rounded-xl border border-border-subtle">
              <button
                type="button"
                onclick={() => switchCurrency(true)}
                class="px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer {showUSD ? 'bg-brand-600 text-white shadow' : 'text-text-muted hover:text-text-base'}"
              >
                USD
              </button>
              <button
                type="button"
                onclick={() => switchCurrency(false)}
                class="px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer {!showUSD ? 'bg-brand-600 text-white shadow' : 'text-text-muted hover:text-text-base'}"
              >
                BS
              </button>
            </div>
          </div>

          <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
            <ShieldCheck size={16} />
            Resumen Bancario
          </h3>

          {#if activeTab === "individual"}
            <div class="space-y-3 text-sm">
              <div class="flex justify-between items-center text-text-muted">
                <span>Cuenta Seleccionada:</span>
                <span class="font-bold font-mono text-text-base">{codCta || "Ninguna"}</span>
              </div>
              <div class="flex justify-between items-center text-text-muted">
                <span>Operación:</span>
                <span class="font-bold {tipoOp === 'ID' ? 'text-amber-400' : isCreditOp ? 'text-emerald-400' : 'text-rose-400'}">
                  {tipoOp} ({tipoOp === "ID" ? "IDB / Cargo" : isCreditOp ? "Ingreso +" : "Egreso -"})
                </span>
              </div>
              <div class="flex justify-between items-start text-text-muted">
                <span>Monto de la Operación:</span>
                <div class="text-right font-mono">
                  <div class="font-bold text-text-base">
                    {formatMoney(showUSD ? individualSummary.amountUSD : individualSummary.amountBS, showUSD)}
                  </div>
                  <div class="text-[11px] text-text-muted">
                    {formatMoney(showUSD ? individualSummary.amountBS : individualSummary.amountUSD, !showUSD)}
                  </div>
                </div>
              </div>
              {#if individualSummary.nativeIdb > 0 && tipoOp !== "ID"}
                <div class="flex justify-between items-start text-text-muted">
                  <span>IDB / IGTF Aplicado:</span>
                  <div class="text-right font-mono">
                    <div class="font-bold text-amber-400">
                      {formatMoney(showUSD ? individualSummary.idbUSD : individualSummary.idbBS, showUSD)}
                    </div>
                    <div class="text-[11px] text-text-muted">
                      {formatMoney(showUSD ? individualSummary.idbBS : individualSummary.idbUSD, !showUSD)}
                    </div>
                  </div>
                </div>
              {/if}

              <div class="border-t border-border-subtle pt-3 space-y-2.5">
                <div class="flex justify-between items-start text-xs text-text-muted">
                  <span>Saldo Actual en Libros ({selectedAccount?.co_mone || "BS"}):</span>
                  <div class="text-right font-mono">
                    <div class="font-bold text-text-base">
                      {formatMoney(showUSD ? individualSummary.currentBalanceUSD : individualSummary.currentBalanceBS, showUSD)}
                    </div>
                    <div class="text-[11px] text-text-muted">
                      {formatMoney(showUSD ? individualSummary.currentBalanceBS : individualSummary.currentBalanceUSD, !showUSD)}
                    </div>
                  </div>
                </div>
                {#if !isEditing}
                  <div class="flex justify-between items-baseline pt-1">
                    <span class="text-xs font-bold text-text-base">Saldo Proyectado:</span>
                    <div class="text-right font-mono">
                      <div class="text-xl font-black {individualSummary.projectedBalance < 0 ? 'text-rose-400' : 'text-brand-400'}">
                        {formatMoney(showUSD ? individualSummary.projectedBalanceUSD : individualSummary.projectedBalanceBS, showUSD)}
                      </div>
                      <div class="text-xs font-bold text-text-muted mt-0.5">
                        {formatMoney(showUSD ? individualSummary.projectedBalanceBS : individualSummary.projectedBalanceUSD, !showUSD)}
                      </div>
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          {:else}
            <div class="space-y-3 text-sm">
              <div class="flex justify-between items-start text-text-muted">
                <span>Salida ({trCtaOrigen || "-"}):</span>
                <div class="text-right font-mono">
                  <div class="font-bold text-rose-400">
                    - {formatMoney(showUSD ? transferSummary.amtOrigUSD : transferSummary.amtOrigBS, showUSD)}
                  </div>
                  <div class="text-[11px] text-text-muted">
                    - {formatMoney(showUSD ? transferSummary.amtOrigBS : transferSummary.amtOrigUSD, !showUSD)}
                  </div>
                </div>
              </div>
              <div class="flex justify-between items-start text-text-muted">
                <span>Entrada ({trCtaDestino || "-"}):</span>
                <div class="text-right font-mono">
                  <div class="font-bold text-emerald-400">
                    + {formatMoney(showUSD ? transferSummary.finalDestUSD : transferSummary.finalDestBS, showUSD)}
                  </div>
                  <div class="text-[11px] text-text-muted">
                    + {formatMoney(showUSD ? transferSummary.finalDestBS : transferSummary.finalDestUSD, !showUSD)}
                  </div>
                </div>
              </div>
              {#if transferSummary.comAmt > 0}
                <div class="flex justify-between items-start text-text-muted">
                  <span>Comisión ({trCtaComision || trCtaOrigen}):</span>
                  <div class="text-right font-mono">
                    <div class="font-bold text-amber-400">
                      - {formatMoney(showUSD ? transferSummary.comAmtUSD : transferSummary.comAmtBS, showUSD)}
                    </div>
                    <div class="text-[11px] text-text-muted">
                      - {formatMoney(showUSD ? transferSummary.comAmtBS : transferSummary.comAmtUSD, !showUSD)}
                    </div>
                  </div>
                </div>
              {/if}

              {#if !isEditing}
                <div class="border-t border-border-subtle pt-3 space-y-2.5 text-xs">
                  <div class="flex justify-between items-start">
                    <span class="text-text-muted">Proyectado Origen:</span>
                    <div class="text-right font-mono">
                      <div class="font-black text-text-base">
                        {formatMoney(showUSD ? transferSummary.projectedOrigUSD : transferSummary.projectedOrigBS, showUSD)}
                      </div>
                      <div class="text-[11px] text-text-muted">
                        {formatMoney(showUSD ? transferSummary.projectedOrigBS : transferSummary.projectedOrigUSD, !showUSD)}
                      </div>
                    </div>
                  </div>
                  <div class="flex justify-between items-start">
                    <span class="text-text-muted">Proyectado Destino:</span>
                    <div class="text-right font-mono">
                      <div class="font-black text-emerald-400">
                        {formatMoney(showUSD ? transferSummary.projectedDestUSD : transferSummary.projectedDestBS, showUSD)}
                      </div>
                      <div class="text-[11px] text-text-muted">
                        {formatMoney(showUSD ? transferSummary.projectedDestBS : transferSummary.projectedDestUSD, !showUSD)}
                      </div>
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <div class="pt-2 space-y-3">
            <button
              type="button"
              onclick={handleSave}
              disabled={isSaving || Boolean(data.editError) || (!isEditing && !data.canCreate) || (isEditing && !data.canEdit)}
              class="w-full py-4 px-6 bg-brand-600 hover:bg-brand-500 text-white rounded-2xl font-black text-sm shadow-lg shadow-brand-500/25 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {#if isSaving}
                <Loader2 size={18} class="animate-spin" />
                Procesando...
              {:else}
                <Check size={18} />
                {isEditing
                  ? "Guardar Cambios"
                  : activeTab === "transfer"
                  ? "Ejecutar Transferencia"
                  : "Registrar Movimiento"}
              {/if}
            </button>

            <button
              type="button"
              onclick={resetForm}
              class="w-full py-3 px-6 bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base rounded-2xl font-bold text-sm border border-border-subtle transition-all cursor-pointer"
            >
              {isEditing ? "Cancelar Edición" : "Limpiar Formulario"}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

