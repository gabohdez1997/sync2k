<script lang="ts">
    import dayjs from "dayjs";
    import "dayjs/locale/es";
    import { onMount } from "svelte";
    import type { PageData } from "./$types";

    dayjs.locale("es");

    let { data }: { data: PageData } = $props();
    const { client, documents, branch, settings } = data;

    const logoUrl = branch.logo_url || settings.app_logo_url;

    function formatCurrency(val: number | string) {
        return Number(val).toLocaleString("de-DE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    // --- CÁLCULO DE METRICAS ---
    let totalSaldoUsd = 0;
    let totalSaldoBs = 0;
    let totalVencidoUsd = 0;
    let totalVencidoBs = 0;
    let totalUpcomingUsd = 0;
    let totalUpcomingBs = 0;
    let maxDiasMora = 0;

    documents.forEach((d: any) => {
        const isNCR = d.co_tipo_doc.trim().toUpperCase() === 'N/CR';
        if (isNCR) {
            d.saldo_usd = -Math.abs(d.saldo_usd);
            d.saldo_bs = -Math.abs(d.saldo_bs);
            d.total_usd = -Math.abs(d.total_usd);
            d.total_bs = -Math.abs(d.total_bs);
            d.vencido = false;
            d.dias_vencidos = 0;
        }

        totalSaldoUsd += d.saldo_usd;
        totalSaldoBs += d.saldo_bs;
        if (d.vencido) {
            totalVencidoUsd += d.saldo_usd;
            totalVencidoBs += d.saldo_bs;
            if (d.dias_vencidos > maxDiasMora) {
                maxDiasMora = d.dias_vencidos;
            }
        } else {
            totalUpcomingUsd += d.saldo_usd;
            totalUpcomingBs += d.saldo_bs;
        }
    });

    // --- LÓGICA DE PAGINACIÓN ---
    const LIMIT_WITH_TOTALS = 30;
    const LIMIT_WITHOUT_TOTALS = 38;

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

    const pages = paginate(documents);

    onMount(() => {
        window.scrollTo(0, 0);
        setTimeout(() => {
            window.print();
        }, 800);
    });
</script>

<svelte:head>
    <title>Estado de Cuenta - {client.cli_des}</title>
</svelte:head>

<!-- FLOATING ACTIONS (NO PRINT) -->
<div class="no-print fixed bottom-6 left-4 right-4 md:left-auto md:right-8 flex flex-col md:flex-row gap-3 pointer-events-auto z-[99999] select-none">
    <button onclick={() => { window.focus(); window.print(); }}
        class="w-full md:w-auto justify-center bg-blue-600 hover:bg-blue-500 text-white px-10 py-5 rounded-2xl font-black shadow-2xl shadow-blue-600/40 transition-all active:scale-95 flex items-center gap-3 cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14" rx="1"/><path d="M6 8V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/>
        </svg>
        IMPRIMIR REPORTE
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
                        <!-- <div class="doc-badge">
                            <span class="label">ESTADO DE CUENTA</span>
                            <span class="number text-red-600">CxC</span>
                        </div> -->
                        <div class="dates mt-2">
                            <p>Fecha Emisión: <strong>{dayjs().format("DD/MM/YYYY")}</strong></p>
                            <p>Hora Emisión: <strong>{dayjs().format("hh:mm A")}</strong></p>
                            <p class="text-[9px] text-slate-400 mt-1 uppercase">
                                Reporte: <strong>Saldos Pendientes</strong>
                            </p>
                        </div>
                    </div>
                </div>

                <!-- CLIENT INFORMATION -->
                <div class="info-grid">
                    <div class="client-box">
                        <h3 class="section-title">Datos del Cliente</h3>
                        <p class="client-name">{client.cli_des}</p>
                        <p class="client-rif font-bold mt-1">RIF / CÓDIGO: {client.rif || client.co_cli}</p>
                        {#if client.direc1}
                            <p class="client-address font-medium text-slate-700 mt-1">DIRECCIÓN: {client.direc1}</p>
                        {/if}
                        {#if client.telefonos}
                            <p class="client-phone font-bold mt-1 text-slate-700">TELÉFONO: {client.telefonos}</p>
                        {/if}
                    </div>
                    <div class="logistic-box font-bold">
                        <h3 class="section-title">Resumen de Cuenta</h3>
                        <div class="info-row"><span class="label">Documentos:</span><span class="val">{documents.length} activos</span></div>
                        <div class="info-row">
                            <span class="label">Estatus:</span>
                            <span class="val" class:text-red-600={totalVencidoUsd > 0} class:text-green-600={totalVencidoUsd === 0}>
                                {totalVencidoUsd > 0 ? `CON DEUDA VENCIDA (MÁX ${maxDiasMora} DÍAS)` : 'CARTERA AL DÍA'}
                            </span>
                        </div>
                        <div class="info-row"><span class="label">Sede:</span><span class="val">{branch.name}</span></div>
                    </div>
                </div>

                <!-- DOCUMENTS TABLE -->
                <div class="table-container">
                    <table class="items-table">
                        <thead>
                            <tr>
                                <th class="col-doc">Documento</th>
                                <th class="col-type">Tipo</th>
                                <th class="col-date">Emisión</th>
                                <th class="col-date">Vencimiento</th>
                                <th class="col-amount text-right">Monto Original (USD)</th>
                                <th class="col-amount text-right">Saldo Pendiente (USD)</th>
                                <th class="col-amount text-right">Saldo Pendiente (Bs)</th>
                                <th class="col-days">Días Mora</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each page.items as item}
                                {@const isNCR = item.co_tipo_doc.trim().toUpperCase() === 'N/CR'}
                                <tr>
                                    <td class="font-mono font-bold">{item.nro_doc}</td>
                                    <td class="font-bold uppercase" class:text-emerald-600={isNCR}>
                                        {#if item.co_tipo_doc === 'FACT'}Factura{:else if item.co_tipo_doc === 'NDEB'}N/Débito{:else if item.co_tipo_doc === 'GIRO'}Giro{:else if item.co_tipo_doc === 'N/CR'}N/Crédito{:else}{item.co_tipo_doc}{/if}
                                    </td>
                                    <td class:text-emerald-600={isNCR}>{dayjs(item.fec_emis).format("DD/MM/YYYY")}</td>
                                    <td class="font-bold" class:text-red-600={item.vencido && !isNCR} class:text-emerald-600={isNCR}>{dayjs(item.fec_venc).format("DD/MM/YYYY")}</td>
                                    <td class="text-right" class:text-emerald-600={isNCR}>{formatCurrency(item.total_usd)}</td>
                                    <td class="text-right font-black" class:text-red-600={item.vencido && !isNCR} class:text-emerald-600={isNCR}>{formatCurrency(item.saldo_usd)}</td>
                                    <td class="text-right" class:text-emerald-600={isNCR} class:text-slate-500={!isNCR}>{formatCurrency(item.saldo_bs)}</td>
                                    <td class="font-bold">
                                        {#if item.vencido}
                                            <span class={isNCR ? "text-emerald-600" : "text-red-600"}>{item.dias_vencidos} días</span>
                                        {:else}
                                            <span class={isNCR ? "text-emerald-600" : "text-green-600"}>Al día</span>
                                        {/if}
                                    </td>
                                </tr>
                            {/each}
                            {#if page.items.length < page.expectedRows}
                                {#each Array(page.expectedRows - page.items.length) as _}
                                    <tr class="empty-row"><td colspan="8">&nbsp;</td></tr>
                                {/each}
                            {/if}
                        </tbody>
                    </table>
                    {#if !page.showTotals}
                        <p class="continue-msg">CONTINÚA EN LA SIGUIENTE PÁGINA...</p>
                    {/if}
                </div>

                {#if page.showTotals}
                    <!-- SUMMARY & SIGNATURES -->
                    <div class="footer-block mt-auto">
                        <div class="footer-grid">
                            <div class="remarks">
                                <div class="disclaimer mt-2 font-medium">
                                    <p>* El presente estado de cuenta consolida todos los saldos por cobrar pendientes a la fecha actual.</p>
                                    <p>* Los cálculos en divisas se determinan utilizando la tasa oficial histórica del BCV al momento de la emisión de cada documento.</p>
                                </div>
                                <div class="signatures-row mt-6">
                                    <div class="signature-box">
                                        <div class="line"></div>
                                        <p>Preparado por Administración</p>
                                    </div>
                                    <div class="signature-box">
                                        <div class="line"></div>
                                        <p>Firma y Sello de Recepción</p>
                                    </div>
                                </div>
                            </div>

                            <div class="totals-box font-bold">
                                <div class="total-row text-slate-600">
                                    <span>Por Vencer ($)</span>
                                    <span>{formatCurrency(totalUpcomingUsd)}</span>
                                </div>
                                <div class="total-row text-red-600">
                                    <span>Saldo Vencido ($)</span>
                                    <span>{formatCurrency(totalVencidoUsd)}</span>
                                </div>
                                <div class="grand-total-outline">
                                    <div class="bs-total">
                                        <span class="label">Total General</span>
                                        <span class="val text-blue-900">$ {formatCurrency(totalSaldoUsd)}</span>
                                    </div>
                                    <div class="usd-reference">
                                        <span>Consolidado VES</span>
                                        <strong>Bs. {formatCurrency(totalSaldoBs)}</strong>
                                    </div>
                                </div>
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
        padding: 0.6cm 0.8cm;
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
    .info-row { display: flex; gap: 5px; font-size: 8px; margin-bottom: 2px; }
    .info-row .label { font-weight: bold; color: #666; width: 80px; }
    .info-row .val { font-weight: 700; text-transform: uppercase; }

    .table-container { flex: 1; margin-bottom: 5px; }
    .items-table { width: 100%; border-collapse: collapse; font-size: 8.5px; }
    .items-table th { background: #f3f4f6; border: 1px solid #000; padding: 3px; text-transform: uppercase; font-weight: 900; }
    .items-table td { border: 1px solid #ddd; padding: 2.5px 5px; text-align: center; height: 14.5px; }
    .items-table .empty-row td { border-left: 1px solid #ddd; border-right: 1px solid #ddd; border-bottom: none; border-top: none; }
    .text-right { text-align: right !important; }
    .font-mono { font-family: monospace; }
    
    .continue-msg { font-size: 7px; font-weight: bold; text-align: right; color: #999; margin-top: 2px; font-style: italic; }

    .footer-grid { display: grid; grid-template-columns: 1fr 220px; gap: 15px; }
    .disclaimer { font-size: 6.5px; color: #666; line-height: 1.1; }
    
    .signatures-row { display: flex; justify-content: space-between; gap: 20px; }
    .signature-box { display: flex; flex-direction: column; align-items: center; flex-1: 1; }
    .signature-box .line { border-bottom: 1px solid #555; width: 130px; height: 1px; margin-bottom: 3px; }
    .signature-box p { font-size: 7px; color: #666; font-weight: bold; text-transform: uppercase; margin: 0; }

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
