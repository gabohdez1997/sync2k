<!-- src/routes/dashboard/warehouse/receipts/[doc_num]/print/+page@.svelte -->
<script lang="ts">
    import dayjs from "dayjs";
    import "dayjs/locale/es";
    import { onMount } from "svelte";
    import type { PageData } from "./$types";

    dayjs.locale("es");

    let { data }: { data: PageData } = $props();
    const { receipt, branch, settings } = data;

    const logoUrl = branch?.logo_url || settings?.app_logo_url;
    const allItems = receipt?.renglones || [];

    const isUSD =
        (receipt?.co_mone || "").toUpperCase().includes("US") ||
        (receipt?.co_mone || "").includes("$");

    const displayFecEmis = receipt?.fec_us_mo ? receipt.fec_us_mo : receipt?.fec_emis;

    const cleanObs = String(receipt?.comentario || "")
        .replace(/\s*\|\s*EDITADO V[IÍ]A API/gi, "")
        .replace(/\s*\|\s*CREADO V[IÍ]A API/gi, "")
        .replace(/\s*\|\s*EDITADO VIA API/gi, "")
        .replace(/\s*\|\s*CREADO VIA API/gi, "")
        .trim();

    function formatQuantity(val: number | string) {
        const num = Number(val || 0);
        return num.toLocaleString("de-DE", {
            minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
            maximumFractionDigits: 2,
        });
    }

    const originOrder = (() => {
        const rengs = receipt?.renglones || [];
        const found = rengs.find((r: any) => r.num_doc && String(r.num_doc).trim() !== "");
        return found ? String(found.num_doc).trim() : (receipt?.orden_compra || receipt?.n_control || "---");
    })();

    const defaultWarehouse = (() => {
        const rengs = receipt?.renglones || [];
        const found = rengs.find((r: any) => r.almacen_des || r.co_alma);
        if (found) {
            return found.almacen_des ? `${found.almacen_des} (${found.co_alma?.trim() || "01"})` : found.co_alma;
        }
        return receipt?.almacen_des || "ALMACEN PRINCIPAL (01)";
    })();

    const totalPhysicalUnits = allItems.reduce((acc: number, r: any) => acc + Number(r.cantidad || r.total_art || 0), 0);

    // --- LÓGICA DE PAGINACIÓN DINÁMICA CALIBRADA ---
    const CAPACITY_WITH_TOTALS = 22; // Capacidad óptima en hoja con totales y firmas
    const CAPACITY_WITHOUT_TOTALS = 36; // Capacidad óptima en hojas intermedias

    function getItemWeight(item: any): number {
        const desc = String(item?.art_des || "").trim();
        if (desc.length > 90) return 3;
        if (desc.length > 45) return 2;
        return 1;
    }

    function paginate(items: any[]) {
        let pages: any[] = [];
        let remaining = [...items];

        while (remaining.length > 0) {
            const remainingWeight = remaining.reduce(
                (acc, it) => acc + getItemWeight(it),
                0,
            );
            if (remainingWeight <= CAPACITY_WITH_TOTALS) {
                pages.push({
                    items: remaining.splice(0, remaining.length),
                    showTotals: true,
                    emptyRowsCount: Math.max(
                        0,
                        CAPACITY_WITH_TOTALS - remainingWeight,
                    ),
                });
                break;
            }

            let pageItems: any[] = [];
            let currentWeight = 0;

            while (remaining.length > 0) {
                const nextWeight = getItemWeight(remaining[0]);
                if (
                    pageItems.length > 0 &&
                    currentWeight + nextWeight > CAPACITY_WITHOUT_TOTALS
                ) {
                    break;
                }
                currentWeight += nextWeight;
                pageItems.push(remaining.shift());
            }

            pages.push({
                items: pageItems,
                showTotals: false,
                emptyRowsCount: Math.max(
                    0,
                    CAPACITY_WITHOUT_TOTALS - currentWeight,
                ),
            });
        }

        if (pages.length > 0 && !pages[pages.length - 1].showTotals) {
            pages.push({
                items: [],
                showTotals: true,
                emptyRowsCount: CAPACITY_WITH_TOTALS,
            });
        }

        if (pages.length === 0) {
            pages.push({
                items: [],
                showTotals: true,
                emptyRowsCount: CAPACITY_WITH_TOTALS,
            });
        }

        return pages;
    }

    const pages = paginate(allItems);

    onMount(() => {
        window.scrollTo(0, 0);
    });
</script>

<svelte:head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nota de Recepción {receipt?.doc_num} - {branch?.business_name || branch?.name || "Profit Cloud"}</title>
</svelte:head>

<!-- FLOATING ACTIONS (NO PRINT) -->
<div
    class="no-print fixed bottom-6 left-4 right-4 md:left-auto md:right-8 flex flex-col md:flex-row gap-3 pointer-events-auto z-[99999] select-none touch-manipulation"
>
    <button
        onclick={() => {
            window.focus();
            window.print();
        }}
        class="w-full md:w-auto justify-center bg-blue-600 text-white px-10 py-5 rounded-2xl font-black shadow-2xl shadow-blue-600/40 hover:bg-blue-500 transition-all active:scale-95 flex items-center gap-3 cursor-pointer"
    >
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path
                d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
            /><rect width="12" height="8" x="6" y="14" rx="1" /><path
                d="M6 8V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"
            />
        </svg>
        IMPRIMIR NOTA DE RECEPCIÓN
    </button>
    <button
        onclick={() => window.close()}
        class="w-full md:w-auto text-center bg-gray-800/80 backdrop-blur-md text-white px-10 py-5 rounded-2xl font-black shadow-xl hover:bg-gray-700 transition-all active:scale-95 cursor-pointer"
    >
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
                            <h1 class="business-name">
                                {branch?.business_name ||
                                    branch?.name ||
                                    "EMPRESA"}
                            </h1>
                            <p class="fiscal-id">RIF: {branch?.rif || "---"}</p>
                            <p class="address">{branch?.address || ""}</p>
                        </div>
                    </div>

                    <div class="doc-info">
                        <div class="doc-badge">
                            <span class="label">Nota de Recepción N°</span>
                            <span class="number text-red-600"
                                >{receipt?.doc_num}</span
                            >
                        </div>
                        <div class="dates mt-2">
                            <p>
                                Emisión: <strong
                                    >{dayjs(displayFecEmis).format(
                                        "DD/MM/YYYY",
                                    )}</strong
                                >
                            </p>
                            {#if originOrder && originOrder !== '---'}
                                <p class="currency-line font-mono font-bold">
                                    OC Origen: <strong class="text-blue-700">{originOrder}</strong>
                                </p>
                            {/if}
                        </div>
                    </div>
                </div>

                <!-- PROVIDER & LOGISTICS -->
                <div class="info-grid">
                    <div class="client-box">
                        <h3 class="section-title">Datos del Proveedor</h3>
                        <p class="client-name">
                            {receipt?.prov_des ||
                                receipt?.co_prov ||
                                "SIN PROVEEDOR"}
                        </p>
                        <p class="client-rif">
                            RIF: {receipt?.rif || receipt?.co_prov}
                        </p>
                        <p class="client-address font-medium">
                            DIRECCIÓN: {receipt?.prov_dir ||
                                receipt?.direc1 ||
                                "Dirección no registrada"}
                        </p>
                        {#if receipt?.telefonos}
                            <p
                                class="client-phone font-bold mt-1 text-slate-700"
                            >
                                TELÉFONO: {receipt.telefonos}
                            </p>
                        {/if}
                    </div>
                    <div class="logistic-box">
                        <h3 class="section-title">Condiciones y Almacén</h3>
                        <div class="info-row">
                            <span class="label">Almacén:</span>
                            <span class="val text-emerald-700 font-black">{defaultWarehouse}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Cond. Pago:</span>
                            <span class="val"
                                >{receipt?.cond_des ||
                                    receipt?.co_cond ||
                                    "CONTADO"}</span
                            >
                        </div>
                        {#if receipt?.nro_fact || receipt?.n_control}
                            <div class="info-row">
                                <span class="label">N° Control / Fact:</span>
                                <span class="val">{receipt.nro_fact || receipt.n_control}</span>
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- ITEMS TABLE -->
                <div class="table-container">
                    <table class="items-table">
                        <thead>
                            <tr>
                                <th class="col-code">Código</th>
                                <th class="col-desc">Descripción de Artículo</th>
                                <th class="col-model">Modelo / Ref</th>
                                <th class="col-wh">Almacén</th>
                                <th class="col-uni">Uni.</th>
                                <th class="col-qty text-right">Cant. Recibida</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each page.items as item}
                                <tr>
                                    <td class="font-mono">{item.co_art?.trim()}</td>
                                    <td class="font-bold uppercase text-left">
                                        {item.art_des?.trim()}
                                    </td>
                                    <td class="font-mono text-center">
                                        {item.modelo ? item.modelo.trim() : (item.referencia ? item.referencia.trim() : "-")}
                                    </td>
                                    <td class="text-center font-bold">
                                        {item.almacen_des ? item.almacen_des.trim() : (item.co_alma?.trim() || "01")}
                                    </td>
                                    <td class="font-black text-center"
                                        >{item.unidad?.trim() ||
                                            item.co_uni?.trim() ||
                                            "UND"}</td
                                    >
                                    <td class="text-right font-black">
                                        {formatQuantity(item.cantidad || item.total_art || 0)}
                                    </td>
                                </tr>
                            {/each}
                            {#if page.emptyRowsCount > 0}
                                {#each Array(page.emptyRowsCount) as _}
                                    <tr class="empty-row"
                                        ><td colspan="6">&nbsp;</td></tr
                                    >
                                {/each}
                            {/if}
                        </tbody>
                    </table>
                    {#if !page.showTotals}
                        <p class="continue-msg">
                            CONTINÚA EN LA SIGUIENTE PÁGINA...
                        </p>
                    {/if}
                </div>

                {#if page.showTotals}
                    <!-- SUMMARY & FOOTER -->
                    <div class="footer-block mt-auto">
                        <!-- SIGNATURES BLOCK -->
                        <div class="signatures-section">
                            <div class="signature-box">
                                <div class="signature-line"></div>
                                <span class="signature-label"
                                    >Recibido / Almacén por:</span
                                >
                            </div>
                            <div class="signature-box">
                                <div class="signature-line"></div>
                                <span class="signature-label"
                                    >Verificado / Supervisado por:</span
                                >
                            </div>
                        </div>

                        <div class="footer-grid">
                            <div class="remarks">
                                {#if cleanObs}
                                    <h4 class="section-title">Observaciones</h4>
                                    <div class="remarks-content">
                                        {cleanObs}
                                    </div>
                                {/if}
                                <div class="disclaimer mt-1">
                                    <p>
                                        * Comprobante oficial de verificación física e ingreso a existencias de inventario.
                                    </p>
                                    {#if originOrder && originOrder !== '---'}
                                        <p>
                                            * Documento vinculado a la Orden de Compra: <strong class="font-mono">{originOrder}</strong>.
                                        </p>
                                    {/if}
                                </div>
                            </div>

                            <div class="totals-box">
                                <div class="total-row">
                                    <span>Renglones Recibidos</span>
                                    <span class="font-mono">{allItems.length}</span>
                                </div>
                                <div class="grand-total-outline">
                                    <div class="bs-total">
                                        <span class="label"
                                            >Total Unidades Físicas</span
                                        >
                                        <span class="val text-emerald-700 font-mono"
                                            >{formatQuantity(totalPhysicalUnits)} un.</span
                                        >
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
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            Helvetica, Arial, sans-serif;
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
        max-height: 27.94cm;
        padding: 0.6cm 0.8cm 0.8cm 0.8cm;
        box-sizing: border-box;
        box-shadow: 0 15px 50px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
        position: relative;
        flex-shrink: 0;
        overflow: hidden;
    }

    .print-container {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .header-section {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 2px solid #000;
        padding-bottom: 0;
        margin-bottom: 5px;
    }

    .brand-info {
        display: flex;
        gap: 12px;
        max-width: 65%;
        align-items: center;
    }
    .logo-img {
        max-width: 100px;
        width: auto;
        object-fit: contain;
    }
    .company-details {
        display: flex;
        flex-direction: column;
    }
    .business-name {
        font-size: 15px;
        font-weight: 900;
        margin: 0 0 2px 0;
        text-transform: uppercase;
        color: #000;
        line-height: 1.15;
    }
    .fiscal-id {
        font-size: 12px;
        font-weight: 700;
        margin: 0;
        color: #1e293b;
    }
    .address {
        font-size: 12px;
        margin: 1px 0;
        color: #334155;
        line-height: 1.25;
    }

    .doc-info {
        text-align: right;
    }
    .doc-badge {
        border: 2px solid #000;
        padding: 4px 10px;
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        background: #fff;
    }
    .doc-badge .label {
        font-size: 8.5px;
        font-weight: 800;
        text-transform: uppercase;
        color: #475569;
        letter-spacing: 0.5px;
    }
    .doc-badge .number {
        font-size: 18px;
        font-weight: 900;
        color: #dc2626 !important;
        letter-spacing: 0.5px;
        line-height: 1.1;
    }
    .dates {
        font-size: 10px;
        color: #334155;
        line-height: 1.3;
        margin-top: 4px;
    }
    .dates p {
        margin: 1px 0;
    }
    .currency-line {
        font-size: 10px;
        color: #1e293b;
        margin-top: 0px;
    }

    .info-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 10px;
        margin-bottom: 5px;
        width: 100%;
        box-sizing: border-box;
    }
    .section-title {
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        border-bottom: 1.5px solid #cbd5e1;
        padding-bottom: 3px;
        margin-bottom: 4px;
        color: #0f172a;
        letter-spacing: 0.3px;
    }
    .client-box,
    .logistic-box {
        background: #f8fafc;
        padding: 7px 10px;
        border-radius: 5px;
        border: 1px solid #cbd5e1;
        min-width: 0;
        overflow: hidden;
        word-break: break-word;
    }
    .client-name {
        font-size: 11.5px;
        font-weight: 900;
        margin: 0 0 2px 0;
        text-transform: uppercase;
        color: #000;
        word-break: break-word;
        line-height: 1.2;
    }
    .client-rif,
    .client-address,
    .client-phone {
        font-size: 9.5px;
        margin: 1.5px 0;
        line-height: 1.3;
        word-break: break-word;
    }
    .client-rif {
        font-weight: 700;
        color: #1e293b;
    }
    .client-address {
        color: #334155;
    }
    .client-phone {
        font-weight: 800;
        color: #0f172a;
    }
    .info-row {
        display: flex;
        gap: 6px;
        font-size: 9.5px;
        margin-bottom: 3px;
        align-items: flex-start;
        line-height: 1.3;
    }
    .info-row .label {
        font-weight: 700;
        color: #475569;
        width: 110px;
        flex-shrink: 0;
    }
    .info-row .val {
        font-weight: 800;
        text-transform: uppercase;
        color: #000;
        flex: 1;
        min-width: 0;
        word-break: break-word;
    }

    .table-container {
        flex: 1;
        margin-bottom: 6px;
    }
    .items-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 8.5px;
    }
    .items-table th {
        background: #f1f5f9;
        border: 1px solid #000;
        padding: 3.5px 4px;
        text-transform: uppercase;
        font-weight: 900;
        font-size: 9px;
        color: #0f172a;
    }
    .items-table td {
        border: 1px solid #cbd5e1;
        padding: 2.5px 5px;
        text-align: center;
        height: 15px;
        color: #000;
    }
    .items-table .empty-row td {
        border-left: 1px solid #cbd5e1;
        border-right: 1px solid #cbd5e1;
        border-bottom: none;
        border-top: none;
    }
    .text-left {
        text-align: left !important;
    }
    .text-right {
        text-align: right !important;
    }
    .font-mono {
        font-family: monospace;
    }
    .col-code {
        width: 15%;
    }
    .col-desc {
        width: 37%;
    }
    .col-model {
        width: 15%;
    }
    .col-wh {
        width: 15%;
    }
    .col-uni {
        width: 8%;
    }
    .col-qty {
        width: 10%;
    }

    .continue-msg {
        font-size: 8px;
        font-weight: bold;
        text-align: right;
        color: #64748b;
        margin-top: 3px;
        font-style: italic;
    }

    .signatures-section {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 60px;
        margin-top: 2px;
        margin-bottom: 4px;
        padding: 0 40px;
    }
    .signature-box {
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    .signature-line {
        width: 100%;
        border-top: 1px solid #000;
        margin-bottom: 2px;
        height: 2px;
    }
    .signature-label {
        font-size: 9.5px;
        font-weight: 800;
        text-transform: uppercase;
        color: #0f172a;
        letter-spacing: 0.3px;
    }

    .footer-grid {
        display: grid;
        grid-template-columns: 1fr 220px;
        gap: 14px;
        align-items: start;
    }
    .remarks-content {
        font-size: 10px;
        font-weight: 600;
        background: #f8fafc;
        padding: 6px 8px;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        min-height: 24px;
        text-transform: uppercase;
        color: #0f172a;
        line-height: 1.35;
    }
    .disclaimer {
        font-size: 9px;
        color: #475569;
        line-height: 1.4;
        margin-top: 4px;
    }
    .disclaimer p {
        margin: 1px 0;
    }

    .totals-box {
        border: 2px solid #000;
        border-radius: 6px;
        overflow: hidden;
        background: #fff;
    }
    .total-row {
        display: flex;
        justify-content: space-between;
        padding: 4px 8px;
        border-bottom: 1px solid #e2e8f0;
        font-size: 10px;
        font-weight: 700;
        color: #1e293b;
    }
    .grand-total-outline {
        padding: 4px 8px;
        text-align: right;
        border-top: 2px solid #000;
        background: #f8fafc;
    }
    .bs-total .label {
        font-size: 9px;
        font-weight: 900;
        text-transform: uppercase;
        color: #475569;
        letter-spacing: 0.5px;
    }
    .bs-total .val {
        font-size: 17px;
        font-weight: 900;
        line-height: 1.1;
    }

    .page-footer {
        position: absolute;
        bottom: 0.3cm;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 9px;
        font-weight: 800;
        color: #64748b;
        margin: 0 0.8cm;
    }

    @media print {
        :global(html, body) {
            background: #fff !important;
            overflow: hidden !important;
        }
        .report-wrapper {
            gap: 0;
            padding: 0;
        }
        .page-sheet {
            box-shadow: none !important;
            margin: 0 !important;
            break-after: page;
            page-break-after: always;
        }
        .no-print {
            display: none !important;
        }
        @page {
            size: letter portrait;
            margin: 0;
        }
    }
</style>
