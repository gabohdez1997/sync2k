<script lang="ts">
    import dayjs from "dayjs";
    import "dayjs/locale/es";
    import { onMount } from "svelte";
    import type { PageData } from "./$types";

    dayjs.locale("es");

    let { data }: { data: PageData } = $props();
    const { quote, branch, settings } = data;

    const logoUrl = branch.logo_url || settings.app_logo_url;
    const items = quote.renglones || [];

    const isUSD = (quote.co_mone || "").toUpperCase().includes("US");

    function formatCurrency(val: number | string) {
        return Number(val).toLocaleString("de-DE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    onMount(() => {
        // Auto-scroll to top
        window.scrollTo(0, 0);
    });
</script>

<svelte:head>
    <title
        >Cotización {quote.doc_num} - {branch.business_name ||
            branch.name}</title
    >
</svelte:head>

<!-- El contenedor principal utiliza fondo blanco forzado -->
<div class="w-full overflow-x-auto pb-40 md:pb-0">
    <div class="print-container">
    <!-- HEADER FISCAL -->
    <div class="header-section">
        <div class="brand-info">
            {#if logoUrl}
                <img src={logoUrl} alt="Logo" class="logo-img" />
            {/if}
            <div class="company-details">
                <h1 class="business-name">
                    {branch.business_name || branch.name}
                </h1>
                <p class="fiscal-id">RIF: {branch.rif || "---"}</p>
                <p class="address">{branch.address || ""}</p>
                {#if branch.phone}
                    <p class="phone">Tel: {branch.phone}</p>
                {/if}
            </div>
        </div>

        <div class="doc-info">
            <div class="doc-badge">
                <span class="label">Cotización N°</span>
                <span class="number text-red-600">{quote.doc_num}</span>
            </div>
            <div class="dates mt-2">
                <p>
                    Emisión: <strong
                        >{dayjs(quote.fec_emis).format("DD/MM/YYYY")}</strong
                    >
                </p>
                <p>
                    Vence: <strong
                        >{dayjs(quote.fec_venc).format("DD/MM/YYYY")}</strong
                    >
                </p>
                <p class="text-[9px] text-slate-400 mt-1 uppercase">
                    Moneda: <strong>{isUSD ? 'DÓLARES (USD)' : 'BOLÍVARES (BS.)'}</strong>
                </p>
            </div>
        </div>
    </div>

    <!-- CLIENT & LOGISTICS -->
    <div class="info-grid">
        <div class="client-box">
            <h3 class="section-title">Datos del Cliente</h3>
            <p class="client-name">{quote.cli_des}</p>
            <p class="client-rif">RIF: {quote.cli_rif || quote.co_cli}</p>
            <p class="client-address font-medium">
                DIRECCIÓN: {quote.cli_dir || "Dirección no registrada"}
            </p>
            {#if quote.cli_tel}
                <p class="client-phone font-bold mt-1 text-slate-700">
                    TELÉFONO: {quote.cli_tel}
                </p>
            {/if}
        </div>

        <div class="logistic-box">
            <div class="info-row">
                <span class="label">Vendedor:</span>
                <span class="val">{quote.ven_des || quote.co_ven}</span>
            </div>
            <div class="info-row">
                <span class="label">Cond. Pago:</span>
                <span class="val"
                    >{quote.cond_des || quote.co_cond || "CONTADO"}</span
                >
            </div>
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
                    <th class="col-price">Precio Unit. ({isUSD ? '$' : 'Bs.'})</th>
                    <th class="col-total">Total ({isUSD ? '$' : 'Bs.'})</th>
                </tr>
            </thead>
            <tbody>
                {#each items as item}
                    <tr>
                        <td class="font-mono">{item.co_art}</td>
                        <td class="font-bold uppercase text-left"
                            >{item.art_des}</td
                        >
                        <td>{item.cantidad}</td>
                        <td class="font-black"
                            >{item.unidad || item.co_uni || "UND"}</td
                        >
                        <td class="text-right">
                            {formatCurrency(isUSD ? item.prec_vta_om : item.precio)}
                        </td>
                        <td class="text-right font-bold">
                            {formatCurrency(isUSD 
                                ? (Number(item.cantidad) * Number(item.prec_vta_om)) 
                                : item.total_renglon)}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>

    <!-- SUMMARY & FOOTER -->
    <div class="footer-grid">
        <div class="remarks">
            {#if quote.comentario}
                <h4 class="section-title">Observaciones</h4>
                <div class="remarks-content">
                    {quote.comentario}
                </div>
            {/if}
            <div class="disclaimer mt-4">
                <p>
                    * Esta cotización es referencial. Sujeto a cambios sin
                    previo aviso según tasa del día.
                </p>
                <p>
                    * Tasa referencial del día: <strong
                        >Bs. {formatCurrency(quote.tasa_actual || quote.tasa)}</strong
                    > por 1 USD.
                </p>
            </div>
        </div>

        <div class="totals-box">
            {#if isUSD}
                <!-- MODO USD: Mostramos USD como principal, BS como referencia abajo -->
                <div class="total-row">
                    <span>Subtotal ($)</span>
                    <span>{formatCurrency(Number(quote.total_bruto) / Number(quote.tasa || 1))}</span>
                </div>
                <div class="total-row">
                    <span>IVA (16%)</span>
                    <span>{formatCurrency(Number(quote.monto_imp) / Number(quote.tasa || 1))}</span>
                </div>
                <div class="grand-total-outline">
                    <div class="bs-total">
                        <span class="label">Total General</span>
                        <span class="val"
                            >$ {formatCurrency(Number(quote.total_neto) / Number(quote.tasa || 1))}</span
                        >
                    </div>
                    <div class="usd-reference">
                        <span>Ref. Bolívares</span>
                        <strong
                            >Bs. {formatCurrency(quote.total_neto)}</strong
                        >
                    </div>
                </div>
            {:else}
                <!-- MODO BS: Original -->
                <div class="total-row">
                    <span>Subtotal (Bs.)</span>
                    <span>{formatCurrency(quote.total_bruto)}</span>
                </div>
                <div class="total-row">
                    <span>IVA (16%)</span>
                    <span>{formatCurrency(quote.monto_imp)}</span>
                </div>
                <div class="grand-total-outline">
                    <div class="bs-total">
                        <span class="label">Total General</span>
                        <span class="val"
                            >Bs. {formatCurrency(quote.total_neto)}</span
                        >
                    </div>
                    <div class="usd-reference">
                        <span>Referencia</span>
                        <strong
                            >$ {formatCurrency(
                                Number(quote.total_neto) / Number(quote.tasa_actual && Number(quote.tasa) === 1 ? quote.tasa_actual : (quote.tasa || 1)),
                            )}</strong
                        >
                    </div>
                </div>
            {/if}
        </div>
    </div>
    </div>
</div>

<!-- FLOATING ACTIONS (NO PRINT) -->
<div class="no-print fixed bottom-4 md:bottom-8 left-4 right-4 md:left-auto md:right-8 flex flex-col md:flex-row gap-3 md:gap-4 pointer-events-auto z-[9999]">
    <button
        onclick={() => window.print()}
        class="w-full md:w-auto justify-center bg-blue-600 text-white px-5 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-black shadow-2xl shadow-blue-600/40 hover:bg-blue-500 transition-all active:scale-95 flex items-center gap-2"
    >
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path
                d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
            /><rect width="12" height="8" x="6" y="14" rx="1" /><path
                d="M6 8V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"
            /></svg
        >
        IMPRIMIR COTIZACIÓN
    </button>
    <button
        onclick={() => window.close()}
        class="w-full md:w-auto text-center bg-gray-800/80 backdrop-blur-md text-white px-5 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold shadow-xl hover:bg-gray-700 transition-all active:scale-95"
    >
        CERRAR
    </button>
</div>

<style>
    /* RESET GLOBAL PARA REPORTE */
    :global(html, body) {
        margin: 0 !important;
        padding: 0 !important;
        background: #f0f2f5 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            Helvetica, Arial, sans-serif;
        color: #000;
        overflow: auto !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }

    .print-container {
        background: #fff;
        width: 21.59cm;
        min-height: 27.94cm;
        margin: 20px auto;
        padding: 1.5cm;
        box-sizing: border-box;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
        display: flex;
        flex-direction: column;
    }

    /* HEADER */
    .header-section {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 2px solid #000;
        padding-bottom: 15px;
        margin-bottom: 20px;
    }

    .brand-info {
        display: flex;
        gap: 15px;
        max-width: 65%;
    }

    .logo-img {
        height: 70px;
        width: auto;
        object-fit: contain;
    }

    .business-name {
        font-size: 16px;
        font-weight: 900;
        margin: 0;
        text-transform: uppercase;
    }

    .fiscal-id,
    .address,
    .phone {
        font-size: 10px;
        margin: 2px 0;
        color: #333;
    }

    .doc-info {
        text-align: right;
    }

    .doc-badge {
        border: 2px solid #000;
        padding: 8px 16px;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        background: #fff;
    }

    .doc-badge .label {
        font-size: 9px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #555;
    }
    .doc-badge .number {
        font-size: 24px;
        font-weight: 900;
    }
    .text-red-600 {
        color: #dc2626 !important;
    }

    .dates {
        font-size: 10px;
        color: #555;
        line-height: 1.4;
    }

    /* GRID INFO */
    .info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 25px;
    }

    .section-title {
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        border-bottom: 1px solid #ddd;
        padding-bottom: 4px;
        margin-bottom: 8px;
        color: #000;
    }

    .client-box,
    .logistic-box {
        background: #f9fafb;
        padding: 12px;
        border-radius: 4px;
        border: 1px solid #eee;
    }

    .client-name {
        font-size: 12px;
        font-weight: 900;
        margin: 0;
        text-transform: uppercase;
    }
    .client-rif,
    .client-address,
    .client-phone {
        font-size: 10px;
        margin: 2px 0;
    }

    .info-row {
        display: flex;
        gap: 8px;
        font-size: 10px;
        margin-bottom: 4px;
    }
    .info-row .label {
        font-weight: bold;
        color: #666;
        width: 80px;
    }
    .info-row .val {
        font-weight: 700;
        color: #000;
        text-transform: uppercase;
    }

    /* TABLE */
    .table-container {
        flex: 1;
        margin-bottom: 25px;
    }

    .items-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
    }

    .items-table th {
        background: #f3f4f6;
        border: 1px solid #000;
        padding: 8px;
        text-transform: uppercase;
        font-weight: 900;
    }

    .items-table td {
        border: 1px solid #ddd;
        padding: 6px 8px;
        text-align: center;
    }

    .items-table tr:nth-child(even) {
        background: #fdfdfd;
    }

    .text-left {
        text-align: left !important;
    }
    .text-right {
        text-align: right !important;
    }
    .font-mono {
        font-family: "Courier New", Courier, monospace;
        letter-spacing: 0.5px;
    }

    /* FOOTER GRID */
    .footer-grid {
        display: grid;
        grid-template-columns: 1fr 280px;
        gap: 30px;
        align-items: flex-start;
    }

    .remarks-content {
        font-size: 9px;
        background: #f9fafb;
        padding: 10px;
        border: 1px solid #ddd;
        min-height: 40px;
        text-transform: uppercase;
    }

    .disclaimer {
        font-size: 8px;
        color: #666;
        line-height: 1.3;
    }

    .totals-box {
        border: 2px solid #000;
        border-radius: 8px;
        overflow: hidden;
        background: #fff;
    }

    .total-row {
        display: flex;
        justify-content: space-between;
        padding: 6px 15px;
        border-bottom: 1px solid #eee;
        font-size: 11px;
        font-weight: 600;
    }

    .grand-total-outline {
        padding: 15px;
        text-align: right;
        border-top: 2px solid #000;
        background: #fdfdfd;
    }

    .bs-total {
        display: flex;
        flex-direction: column;
    }
    .bs-total .label {
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        color: #555;
    }
    .bs-total .val {
        font-size: 26px;
        font-weight: 900;
        color: #000;
    }

    .usd-reference {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px dashed #ddd;
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        font-weight: bold;
    }

    /* SIGNATURE */
    .signature-section {
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .signature-line {
        width: 200px;
        border-bottom: 1px solid #000;
        margin-bottom: 5px;
    }

    .signature-section p {
        font-size: 10px;
        font-weight: bold;
        text-transform: uppercase;
        color: #555;
    }

    /* PRINT QUERIES */
    @media print {
        :global(body) {
            background: #fff !important;
        }
        .print-container {
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0.5cm !important;
            box-shadow: none !important;
        }
        .no-print {
            display: none !important;
        }
        @page {
            size: letter;
            margin: 1cm;
        }
    }
</style>
