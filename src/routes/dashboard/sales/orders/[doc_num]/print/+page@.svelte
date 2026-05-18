<script lang="ts">
    import dayjs from "dayjs";
    import "dayjs/locale/es";
    import { onMount } from "svelte";
    import type { PageData } from "./$types";

    dayjs.locale("es");

    let { data }: { data: PageData } = $props();
    const { order, branch, settings } = data;

    const logoUrl = branch.logo_url || settings.app_logo_url;
    const allItems = order.renglones || [];

    const isUSD = (order.co_mone || "").toUpperCase().includes("US");

    // Si el documento fue editado, tomamos la fecha de modificación (fec_us_mo) para emisión y vencimiento
    const displayFecEmis = order.fec_us_mo ? order.fec_us_mo : order.fec_emis;
    const displayFecVenc = order.fec_us_mo ? order.fec_us_mo : order.fec_venc;

    function formatCurrency(val: number | string) {
        return Number(val).toLocaleString("de-DE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    // --- LÓGICA DE PAGINACIÓN MAXIMIZADA ---
    const LIMIT_WITH_TOTALS = 36;
    const LIMIT_WITHOUT_TOTALS = 44;

    function paginate(items: any[]) {
        let pages = [];
        let remaining = [...items];
        
        while (remaining.length > 0) {
            if (remaining.length <= LIMIT_WITH_TOTALS) {
                pages.push({ 
                    items: remaining.splice(0, remaining.length), 
                    showTotals: true,
                    expectedRows: LIMIT_WITH_TOTALS
                });
            } else {
                pages.push({ 
                    items: remaining.splice(0, LIMIT_WITHOUT_TOTALS), 
                    showTotals: false,
                    expectedRows: LIMIT_WITHOUT_TOTALS
                });
            }
        }
        
        if (pages.length > 0 && !pages[pages.length - 1].showTotals) {
            if (pages[pages.length - 1].items.length > LIMIT_WITH_TOTALS) {
                pages.push({ items: [], showTotals: true, expectedRows: LIMIT_WITH_TOTALS });
            } else {
                pages[pages.length - 1].showTotals = true;
                pages[pages.length - 1].expectedRows = LIMIT_WITH_TOTALS;
            }
        }

        return pages;
    }

    const pages = paginate(allItems);

    onMount(() => {
        window.scrollTo(0, 0);
    });
</script>

<svelte:head>
    <title>Pedido {order.doc_num} - {branch.business_name || branch.name}</title>
</svelte:head>

<!-- FLOATING ACTIONS (NO PRINT) -->
<div class="no-print fixed bottom-6 left-4 right-4 md:left-auto md:right-8 flex flex-col md:flex-row gap-3 pointer-events-auto z-[99999] select-none touch-manipulation">
    <button onclick={() => { window.focus(); window.print(); }}
        class="w-full md:w-auto justify-center bg-blue-600 text-white px-10 py-5 rounded-2xl font-black shadow-2xl shadow-blue-600/40 hover:bg-blue-500 transition-all active:scale-95 flex items-center gap-3 cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14" rx="1"/><path d="M6 8V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/>
        </svg>
        IMPRIMIR PEDIDO
    </button>
    <button onclick={() => window.close()}
        class="w-full md:w-auto text-center bg-gray-800/80 backdrop-blur-md text-white px-10 py-5 rounded-2xl font-black shadow-xl hover:bg-gray-700 transition-all active:scale-95 cursor-pointer">
        CERRAR
    </button>
</div>

<div class="report-wrapper pb-20 pt-10">
    {#each pages as page, i}
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
                            <span class="label">Pedido N°</span>
                            <span class="number text-red-600">{order.doc_num}</span>
                        </div>
                        <div class="dates mt-2">
                            <p>Emisión: <strong>{dayjs(displayFecEmis).format("DD/MM/YYYY")}</strong></p>
                            <p>Vence: <strong>{dayjs(displayFecVenc).format("DD/MM/YYYY")}</strong></p>
                            <p class="text-[9px] text-slate-400 mt-1 uppercase">
                                Moneda: <strong>{isUSD ? "DÓLARES (USD)" : "BOLÍVARES (BS.)"}</strong>
                            </p>
                        </div>
                    </div>
                </div>

                <!-- CLIENT & LOGISTICS -->
                <div class="info-grid">
                    <div class="client-box">
                        <h3 class="section-title">Datos del Cliente</h3>
                        <p class="client-name">{order.cli_des}</p>
                        <p class="client-rif">RIF: {order.cli_rif || order.co_cli}</p>
                        <p class="client-address font-medium">DIRECCIÓN: {order.cli_dir || "Dirección no registrada"}</p>
                        {#if order.cli_tel}<p class="client-phone font-bold mt-1 text-slate-700">TELÉFONO: {order.cli_tel}</p>{/if}
                    </div>
                    <div class="logistic-box">
                        <div class="info-row"><span class="label">Vendedor:</span><span class="val">{order.ven_des || order.co_ven}</span></div>
                        <div class="info-row"><span class="label">Cond. Pago:</span><span class="val">{order.cond_des || order.co_cond || "CONTADO"}</span></div>
                    </div>
                </div>

                <!-- ITEMS TABLE -->
                <div class="table-container">
                    <table class="items-table">
                        <thead>
                            <tr>
                                <th class="col-code">Código</th>
                                <th class="col-desc">Descripción</th>
                                <th class="col-qty">Cant.</th>
                                <th class="col-uni">Uni.</th>
                                <th class="col-price">Precio Unit. ({isUSD ? "$" : "Bs."})</th>
                                <th class="col-total">Total ({isUSD ? "$" : "Bs."})</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each page.items as item}
                                <tr>
                                    <td class="font-mono">{item.co_art}</td>
                                    <td class="font-bold uppercase text-left">{item.art_des}</td>
                                    <td>{item.cantidad}</td>
                                    <td class="font-black">{item.unidad || item.co_uni || "UND"}</td>
                                    <td class="text-right">
                                        {formatCurrency(isUSD ? (Number(item.prec_vta_om) > 0 ? item.prec_vta_om : (Number(item.precio) / Number(order.tasa))) : item.precio)}
                                    </td>
                                    <td class="text-right font-bold">
                                        {formatCurrency(isUSD ? Number(item.cantidad) * (Number(item.prec_vta_om) > 0 ? Number(item.prec_vta_om) : (Number(item.precio) / Number(order.tasa))) : item.total_renglon)}
                                    </td>
                                </tr>
                            {/each}
                            {#if page.items.length < page.expectedRows}
                                {#each Array(page.expectedRows - page.items.length) as _}
                                    <tr class="empty-row"><td colspan="6">&nbsp;</td></tr>
                                {/each}
                            {/if}
                        </tbody>
                    </table>
                    {#if !page.showTotals}
                        <p class="continue-msg">CONTINÚA EN LA SIGUIENTE PÁGINA...</p>
                    {/if}
                </div>

                {#if page.showTotals}
                    <!-- SUMMARY & FOOTER -->
                    <div class="footer-block mt-auto">
                        <div class="footer-grid">
                            <div class="remarks">
                                {#if order.comentario}
                                    <h4 class="section-title">Observaciones</h4>
                                    <div class="remarks-content">{order.comentario}</div>
                                {/if}
                                <div class="disclaimer mt-1">
                                    <p>* Este pedido es referencial. Sujeto a cambios sin previo aviso según tasa del día.</p>
                                    <p>* Tasa referencial del día: <strong>Bs. {formatCurrency(order.tasa_actual || order.tasa)}</strong> por 1 USD.</p>
                                </div>
                            </div>

                            <div class="totals-box">
                                {#if isUSD}
                                    <div class="total-row"><span>Subtotal ($)</span><span>{formatCurrency(Number(order.total_bruto) / Number(order.tasa || 1))}</span></div>
                                    <div class="total-row"><span>IVA (16%)</span><span>{formatCurrency(Number(order.monto_imp) / Number(order.tasa || 1))}</span></div>
                                    <div class="grand-total-outline">
                                        <div class="bs-total"><span class="label">Total General</span><span class="val">$ {formatCurrency(Number(order.total_neto) / Number(order.tasa || 1))}</span></div>
                                    </div>
                                {:else}
                                    <div class="total-row"><span>Subtotal (Bs.)</span><span>{formatCurrency(order.total_bruto)}</span></div>
                                    <div class="total-row"><span>IVA (16%)</span><span>{formatCurrency(order.monto_imp)}</span></div>
                                    <div class="grand-total-outline">
                                        <div class="bs-total"><span class="label">Total General</span><span class="val">Bs. {formatCurrency(order.total_neto)}</span></div>
                                        <div class="usd-reference"><span>Referencia</span><strong>$ {formatCurrency(Number(order.total_neto) / Number(order.tasa_actual && Number(order.tasa) === 1 ? order.tasa_actual : order.tasa || 1))}</strong></div>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- PAGE INDICATOR -->
                <div class="page-footer">
                    <span>Página {i + 1} de {pages.length}</span>
                </div>
            </div>
        </div>
    {/each}
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
        height: 27.94cm;
        padding: 0.6cm 0.8cm; /* Márgenes mínimos para maximizar espacio */
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
        height: 100%;
    }

    .header-section {
        display: flex;
        justify-content: space-between;
        border-bottom: 2px solid #000;
        padding-bottom: 6px;
        margin-bottom: 10px;
    }

    .brand-info { display: flex; gap: 10px; max-width: 65%; }
    .logo-img { height: 50px; width: auto; object-fit: contain; }
    .business-name { font-size: 12px; font-weight: 900; margin: 0; text-transform: uppercase; }
    .fiscal-id, .address, .phone { font-size: 8px; margin: 1px 0; color: #333; }
    
    .doc-info { text-align: right; }
    .doc-badge { border: 2px solid #000; padding: 4px 8px; border-radius: 6px; display: flex; flex-direction: column; align-items: center; }
    .doc-badge .label { font-size: 7px; font-weight: bold; text-transform: uppercase; color: #555; }
    .doc-badge .number { font-size: 16px; font-weight: 900; color: #dc2626 !important; }
    .dates { font-size: 8px; color: #555; line-height: 1.1; }

    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
    .section-title { font-size: 8px; font-weight: 900; text-transform: uppercase; border-bottom: 1px solid #ddd; padding-bottom: 2px; margin-bottom: 3px; }
    .client-box, .logistic-box { background: #f9fafb; padding: 5px; border-radius: 4px; border: 1px solid #eee; }
    .client-name { font-size: 10px; font-weight: 900; margin: 0; text-transform: uppercase; }
    .client-rif, .client-address, .client-phone { font-size: 8px; margin: 1px 0; }
    .info-row { display: flex; gap: 5px; font-size: 8px; margin-bottom: 1px; }
    .info-row .label { font-weight: bold; color: #666; width: 60px; }
    .info-row .val { font-weight: 700; text-transform: uppercase; }

    .table-container { flex: 1; margin-bottom: 5px; }
    .items-table { width: 100%; border-collapse: collapse; font-size: 8.5px; }
    .items-table th { background: #f3f4f6; border: 1px solid #000; padding: 3px; text-transform: uppercase; font-weight: 900; }
    .items-table td { border: 1px solid #ddd; padding: 2px 5px; text-align: center; height: 14.5px; }
    .items-table .empty-row td { border-left: 1px solid #ddd; border-right: 1px solid #ddd; border-bottom: none; border-top: none; }
    .text-left { text-align: left !important; }
    .text-right { text-align: right !important; }
    .font-mono { font-family: monospace; }
    
    .continue-msg { font-size: 7px; font-weight: bold; text-align: right; color: #999; margin-top: 2px; font-style: italic; }

    .footer-grid { display: grid; grid-template-columns: 1fr 200px; gap: 12px; }
    .remarks-content { font-size: 7.5px; background: #f9fafb; padding: 4px; border: 1px solid #ddd; min-height: 18px; text-transform: uppercase; }
    .disclaimer { font-size: 6.5px; color: #666; line-height: 1.0; }
    
    .totals-box { border: 2px solid #000; border-radius: 6px; overflow: hidden; background: #fff; }
    .total-row { display: flex; justify-content: space-between; padding: 2px 8px; border-bottom: 1px solid #eee; font-size: 9px; font-weight: 600; }
    .grand-total-outline { padding: 3px 8px; text-align: right; border-top: 2px solid #000; background: #fdfdfd; }
    .bs-total .label { font-size: 8px; font-weight: 900; text-transform: uppercase; color: #555; }
    .bs-total .val { font-size: 16px; font-weight: 900; }
    .usd-reference { margin-top: 2px; padding-top: 2px; border-top: 1px dashed #ddd; display: flex; justify-content: space-between; font-size: 8.5px; font-weight: bold; }

    .page-footer { position: absolute; bottom: 0.3cm; left: 0; right: 0; text-align: center; font-size: 8px; font-weight: bold; color: #777; border-top: 1px solid #eee; padding-top: 3px; margin: 0 0.8cm; }

    @media print {
        :global(html, body) { background: #fff !important; overflow: hidden !important; }
        .report-wrapper { gap: 0; padding: 0; }
        .page-sheet { 
            box-shadow: none !important; 
            margin: 0 !important; 
            break-after: page; 
            page-break-after: always;
        }
        .no-print { display: none !important; }
        @page { size: letter; margin: 0; }
    }
</style>

