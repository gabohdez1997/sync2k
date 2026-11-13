<script lang="ts">
    import dayjs from "dayjs";
    import "dayjs/locale/es";
    import { onMount } from "svelte";
    import type { PageData } from "./$types";

    dayjs.locale("es");

    let { data }: { data: PageData } = $props();
    const { document: doc, branch, settings } = data;

    const logoUrl = branch.logo_url || settings?.app_logo_url;

    const isUSD = (doc.co_mone || "").toUpperCase().includes("US") || (doc.co_mone || "").includes("$");

    function formatCurrency(val: number | string) {
        return Number(val || 0).toLocaleString("de-DE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    const docTypeCode = String(doc.co_tipo_doc || "DOC").trim().toUpperCase();
    const typeTitles: Record<string, string> = {
        FACT: "Factura de Compra",
        "N/CR": "Nota de Crédito",
        "N/DB": "Nota de Débito",
        IVAN: "Retención de IVA",
        ISLR: "Retención de ISLR",
        AJNA: "Ajuste Negativo Automático",
        AJNM: "Ajuste Negativo Manual",
        AJPA: "Ajuste Positivo Automático",
        AJPM: "Ajuste Positivo Manual",
        ADEL: "Adelanto / Anticipo",
    };
    const docTitle = doc.des_tipo_doc || typeTitles[docTypeCode] || `Documento ${docTypeCode}`;

    const tasaDoc = Number(doc.tasa) > 1 ? Number(doc.tasa) : (Number(doc.tasa_actual) || 1);
    const tasaRef = Number(doc.tasa_actual && Number(doc.tasa) <= 1 ? doc.tasa_actual : tasaDoc);

    const rawBruto = Number(doc.total_bruto || 0);
    const rawDesc = Number(doc.monto_desc_glob || 0);
    const rawReca = Number(doc.monto_reca || 0);
    const rawSinImp = Math.max(0, rawBruto - rawDesc + rawReca);
    const rawExento = Number(doc.monto_exento ?? 0);
    const rawImp = Number(doc.monto_imp || 0);
    const rawOtros = Number(doc.otros || 0);
    const rawNeto = Number(doc.total_neto || 0);
    const rawSaldo = Number(doc.saldo || 0);

    const totalDocUSD = tasaRef > 0 ? rawNeto / tasaRef : 0;
    const saldoUSD = tasaRef > 0 ? rawSaldo / tasaRef : 0;
    const pagos = Array.isArray(doc.pagos) ? doc.pagos : [];

    onMount(() => {
        window.scrollTo(0, 0);
    });
</script>

<svelte:head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{docTitle} {doc.nro_doc} - {branch.business_name || branch.name}</title>
</svelte:head>

<!-- FLOATING ACTIONS (NO PRINT) -->
<div class="no-print fixed bottom-6 left-4 right-4 md:left-auto md:right-8 flex flex-col md:flex-row gap-3 pointer-events-auto z-[99999] select-none touch-manipulation">
    <button
        onclick={() => { window.focus(); window.print(); }}
        class="w-full md:w-auto justify-center bg-blue-600 text-white px-10 py-5 rounded-2xl font-black shadow-2xl shadow-blue-600/40 hover:bg-blue-500 transition-all active:scale-95 flex items-center gap-3 cursor-pointer"
    >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14" rx="1"/><path d="M6 8V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/>
        </svg>
        IMPRIMIR {docTypeCode}
    </button>
    <button
        onclick={() => window.close()}
        class="w-full md:w-auto text-center bg-gray-800/80 backdrop-blur-md text-white px-10 py-5 rounded-2xl font-black shadow-xl hover:bg-gray-700 transition-all active:scale-95 cursor-pointer"
    >
        CERRAR
    </button>
</div>

<div class="report-wrapper pb-20 pt-10">
    <div class="page-sheet">
        <div class="print-container">
            <!-- HEADER FISCAL -->
            <div class="header-section">
                <div class="brand-info">
                    {#if logoUrl}
                        <img src={logoUrl} alt="Logo" class="logo-img" />
                    {/if}
                    <div class="company-details">
                        <h1 class="business-name">{branch.business_name || branch.name}</h1>
                        <p class="fiscal-id">RIF: {branch.rif || "---"}</p>
                        <p class="address">{branch.address || ""}</p>
                        {#if branch.phone}<p class="phone">Tel: {branch.phone}</p>{/if}
                    </div>
                </div>

                <div class="doc-info">
                    <div class="doc-badge">
                        <span class="label">{docTitle} ({docTypeCode})</span>
                        <span class="number text-blue-600">{doc.nro_doc}</span>
                        {#if doc.nro_fact}
                            <span class="sub-label mt-1">Factura Fiscal N°: <strong>{doc.nro_fact}</strong></span>
                        {/if}
                        {#if doc.n_control && doc.n_control !== "N/A"}
                            <span class="sub-label">N° Control: <strong>{doc.n_control}</strong></span>
                        {/if}
                    </div>
                    <div class="dates mt-2">
                        <p>Emisión: <strong>{dayjs(doc.fec_emis).format("DD/MM/YYYY")}</strong></p>
                        <p>Vence: <strong>{dayjs(doc.fec_venc || doc.fec_emis).format("DD/MM/YYYY")}</strong></p>
                        <p class="text-[9px] text-slate-400 mt-1 uppercase">
                            Moneda: <strong>{isUSD ? "DÓLARES (USD)" : "BOLÍVARES (BS.)"}</strong>
                        </p>
                    </div>
                </div>
            </div>

            <!-- SUPPLIER & OPERATION DETAILS -->
            <div class="info-grid">
                <div class="supplier-box">
                    <h3 class="section-title">Datos del Proveedor</h3>
                    <p class="supplier-name">{doc.prov_des || doc.co_prov}</p>
                    <p class="supplier-rif">RIF / Código: {doc.rif || doc.co_prov}</p>
                    <p class="supplier-address font-medium">DIRECCIÓN: {doc.direc1 || "Dirección no registrada"}</p>
                    {#if doc.telefonos}<p class="supplier-phone font-bold mt-1 text-slate-700">TELÉFONO: {doc.telefonos}</p>{/if}
                    {#if doc.email}<p class="supplier-email text-[8px] text-slate-600">EMAIL: {doc.email}</p>{/if}
                </div>
                <div class="logistic-box">
                    <h3 class="section-title">Datos de Operación</h3>
                    <div class="info-row"><span class="label">Tipo Doc:</span><span class="val">{docTypeCode} - {docTitle}</span></div>
                    <div class="info-row"><span class="label">Cuenta Gasto:</span><span class="val">{doc.des_cta_ingr_egr || doc.co_cta_ingr_egr || "POR DEFECTO"}</span></div>
                    <div class="info-row"><span class="label">Registrado:</span><span class="val uppercase">{doc.user_name || doc.co_us_in || "---"}</span></div>
                    <div class="info-row"><span class="label">Sucursal:</span><span class="val">{branch.name || "---"}</span></div>
                    {#if doc.anulado}
                        <div class="info-row mt-1"><span class="label">Estatus:</span><span class="val text-red-600 font-black">ANULADO</span></div>
                    {:else if rawSaldo <= 0.001}
                        <div class="info-row mt-1"><span class="label">Estatus:</span><span class="val text-emerald-700 font-black">PAGADO / APLICADO</span></div>
                    {:else}
                        <div class="info-row mt-1"><span class="label">Estatus:</span><span class="val text-amber-700 font-black">ACTIVO (CON SALDO)</span></div>
                    {/if}
                </div>
            </div>

            <!-- DOCUMENT CONCEPT TABLE -->
            <div class="table-container">
                <table class="items-table">
                    <thead>
                        <tr>
                            <th style="width: 70px;">Tipo</th>
                            <th class="text-left">Concepto / Descripción del Documento</th>
                            <th style="width: 65px;">Alícuota</th>
                            <th style="width: 105px;" class="text-right">Monto Bruto</th>
                            <th style="width: 105px;" class="text-right">Total Neto</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="font-mono font-bold">{docTypeCode}</td>
                            <td class="font-bold uppercase text-left" style="padding: 6px 8px; line-height: 1.3;">
                                {doc.observa || `${docTitle} N° ${doc.nro_fact || doc.nro_doc}`}
                            </td>
                            <td class="font-mono">{Number(doc.porc_imp || 0).toFixed(0)}%</td>
                            <td class="text-right font-mono">Bs. {formatCurrency(rawBruto)}</td>
                            <td class="text-right font-mono font-bold">Bs. {formatCurrency(rawNeto)}</td>
                        </tr>
                    </tbody>
                </table>

                {#if pagos.length > 0}
                    <div class="mt-4">
                        <h3 class="section-title">Pagos / Retenciones Asociadas</h3>
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th style="width: 110px;">N° Pago</th>
                                    <th style="width: 90px;">Fecha</th>
                                    <th class="text-left">Descripción</th>
                                    <th style="width: 85px;">Estatus</th>
                                    <th style="width: 110px;" class="text-right">Monto Aplicado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each pagos as p}
                                    <tr>
                                        <td class="font-mono font-bold">{p.cob_num}</td>
                                        <td>{dayjs(p.fec_cob || p.fecha).format("DD/MM/YYYY")}</td>
                                        <td class="text-left uppercase">{p.descrip || "Pago / Aplicación"}</td>
                                        <td class="font-bold">{p.anulado ? "ANULADO" : "ACTIVO"}</td>
                                        <td class="text-right font-mono font-bold">Bs. {formatCurrency(p.mont_cob)}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
            </div>

            <!-- SUMMARY & FOOTER -->
            <div class="footer-block mt-auto">
                <div class="footer-grid">
                    <div class="remarks">
                        {#if doc.observa}
                            <h4 class="section-title">Observaciones</h4>
                            <div class="remarks-content">{doc.observa}</div>
                        {/if}
                        <div class="disclaimer mt-2">
                            <p>* Tasa de cambio registrada en el documento: <strong>Bs. {formatCurrency(doc.tasa)}</strong> por 1 USD.</p>
                            <p>* Tasa referencial del día: <strong>Bs. {formatCurrency(tasaRef)}</strong> por 1 USD.</p>
                            {#if doc.doc_orig}
                                <p>* Origen del registro: <strong>{doc.doc_orig} {doc.nro_orig || ""}</strong></p>
                            {/if}
                        </div>
                    </div>

                    <div class="totals-box">
                        <div class="total-row"><span>Monto Bruto (Bs.)</span><span>{formatCurrency(rawBruto)}</span></div>
                        {#if rawDesc > 0}
                            <div class="total-row text-red-600"><span>Descuento ({doc.porc_desc_glob || 0}%)</span><span>- {formatCurrency(rawDesc)}</span></div>
                        {/if}
                        {#if rawReca > 0}
                            <div class="total-row"><span>Recargo ({doc.porc_reca || 0}%)</span><span>+ {formatCurrency(rawReca)}</span></div>
                        {/if}
                        {#if rawDesc > 0 || rawReca > 0}
                            <div class="total-row"><span>Total sin Impuesto</span><span>{formatCurrency(rawSinImp)}</span></div>
                        {/if}
                        {#if rawExento > 0}
                            <div class="total-row"><span>Monto Exento</span><span>{formatCurrency(rawExento)}</span></div>
                        {/if}
                        <div class="total-row"><span>IVA ({Number(doc.porc_imp || 0).toFixed(0)}%)</span><span>{formatCurrency(rawImp)}</span></div>
                        {#if rawOtros > 0}
                            <div class="total-row"><span>Otros (IGTF / Cargos)</span><span>{formatCurrency(rawOtros)}</span></div>
                        {/if}
                        <div class="grand-total-outline">
                            <div class="bs-total"><span class="label">Total Documento</span><span class="val">Bs. {formatCurrency(rawNeto)}</span></div>
                            <div class="usd-reference"><span>Referencia USD</span><strong>$ {formatCurrency(totalDocUSD)}</strong></div>
                            {#if rawSaldo > 0.001 && !doc.anulado}
                                <div class="usd-reference text-amber-600 font-bold">
                                    <span>Saldo Pendiente</span>
                                    <strong>Bs. {formatCurrency(rawSaldo)} ($ {formatCurrency(saldoUSD)})</strong>
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>
            </div>

            <!-- PAGE INDICATOR -->
            <div class="page-footer">
                <span>Documento emitido desde SYNC2K - Página 1 de 1</span>
            </div>
        </div>
    </div>
</div>

<style>
    :global(html, body) {
        margin: 0 !important;
        padding: 0 !important;
        background: #ced4da !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #000;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        overflow: auto !important;
    }

    .report-wrapper {
        display: flex;
        flex-direction: column;
        gap: 30px;
        align-items: center;
        width: 100%;
        padding-bottom: 5rem;
    }

    .page-sheet {
        background: #fff;
        width: 21.59cm;
        min-height: 27.94cm;
        padding: 0.7cm 0.9cm;
        box-sizing: border-box;
        box-shadow: 0 15px 50px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
        position: relative;
        flex-shrink: 0;
    }

    .print-container {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 26.2cm;
    }

    .header-section {
        display: flex;
        justify-content: space-between;
        border-bottom: 2px solid #000;
        padding-bottom: 8px;
        margin-bottom: 12px;
    }

    .brand-info { display: flex; gap: 10px; max-width: 62%; }
    .logo-img { height: 52px; width: auto; object-fit: contain; }
    .business-name { font-size: 13px; font-weight: 900; margin: 0; text-transform: uppercase; }
    .fiscal-id, .address, .phone { font-size: 8.5px; margin: 1px 0; color: #333; }

    .doc-info { text-align: right; }
    .doc-badge { border: 2px solid #000; padding: 5px 10px; border-radius: 6px; display: flex; flex-direction: column; align-items: center; }
    .doc-badge .label { font-size: 7.5px; font-weight: bold; text-transform: uppercase; color: #555; }
    .doc-badge .number { font-size: 16px; font-weight: 900; color: #2563eb !important; }
    .doc-badge .sub-label { font-size: 8px; color: #333; margin-top: 1px; }
    .dates { font-size: 8.5px; color: #555; line-height: 1.2; }

    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
    .section-title { font-size: 8.5px; font-weight: 900; text-transform: uppercase; border-bottom: 1px solid #ddd; padding-bottom: 2px; margin-bottom: 4px; }
    .supplier-box, .logistic-box { background: #f9fafb; padding: 7px; border-radius: 4px; border: 1px solid #eee; }
    .supplier-name { font-size: 10.5px; font-weight: 900; margin: 0; text-transform: uppercase; }
    .supplier-rif, .supplier-address, .supplier-phone, .supplier-email { font-size: 8.5px; margin: 2px 0; }
    .info-row { display: flex; gap: 5px; font-size: 8.5px; margin-bottom: 2px; }
    .info-row .label { font-weight: bold; color: #666; width: 78px; flex-shrink: 0; }
    .info-row .val { font-weight: 700; text-transform: uppercase; }

    .table-container { flex: 1; margin-bottom: 10px; }
    .items-table { width: 100%; border-collapse: collapse; font-size: 9px; }
    .items-table th { background: #f3f4f6; border: 1px solid #000; padding: 5px 6px; text-transform: uppercase; font-weight: 900; }
    .items-table td { border: 1px solid #ddd; padding: 5px 6px; text-align: center; }
    .text-left { text-align: left !important; }
    .text-right { text-align: right !important; }
    .font-mono { font-family: monospace; }

    .footer-grid { display: grid; grid-template-columns: 1fr 240px; gap: 14px; }
    .remarks-content { font-size: 8.5px; background: #f9fafb; padding: 6px; border: 1px solid #ddd; min-height: 22px; text-transform: uppercase; }
    .disclaimer { font-size: 7.5px; color: #555; line-height: 1.3; }

    .totals-box { border: 2px solid #000; border-radius: 6px; overflow: hidden; background: #fff; }
    .total-row { display: flex; justify-content: space-between; padding: 3px 8px; border-bottom: 1px solid #eee; font-size: 9px; font-weight: 600; }
    .grand-total-outline { padding: 5px 8px; text-align: right; border-top: 2px solid #000; background: #fdfdfd; }
    .bs-total { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
    .bs-total .label { font-size: 8.5px; font-weight: 900; text-transform: uppercase; color: #555; }
    .bs-total .val { font-size: 15px; font-weight: 900; }
    .usd-reference { margin-top: 3px; padding-top: 3px; border-top: 1px dashed #ddd; display: flex; justify-content: space-between; font-size: 8.5px; font-weight: bold; }

    .page-footer { margin-top: 14px; text-align: center; font-size: 8px; font-weight: bold; color: #777; border-top: 1px solid #eee; padding-top: 4px; }

    @media print {
        :global(html, body) { background: #fff !important; overflow: hidden !important; }
        .report-wrapper { gap: 0; padding: 0; }
        .page-sheet {
            box-shadow: none !important;
            margin: 0 !important;
            min-height: 27.94cm;
            break-after: page;
            page-break-after: always;
        }
        .no-print { display: none !important; }
        @page { size: letter; margin: 0; }
    }
</style>

