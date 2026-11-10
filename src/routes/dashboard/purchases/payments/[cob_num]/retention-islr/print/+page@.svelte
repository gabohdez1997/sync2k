<script lang="ts">
    import dayjs from "dayjs";
    import "dayjs/locale/es";
    import { onMount } from "svelte";
    import type { PageData } from "./$types";

    dayjs.locale("es");

    let { data }: { data: PageData } = $props();
    const { payment, branch, coIslrFilter, compFilter } = data;

    const logoUrl = branch.logo_url || null;
    const sealUrl = branch.seal_url || branch.sql_config?.seal_url || null;

    const MESES = [
        "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
        "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
    ];

    function formatCurrency(val: number | string) {
        return Number(val || 0).toLocaleString("de-DE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    // Determinar Tipo de Persona (JURÍDICA o NATURAL) y Domicilio
    const rifProv = (payment.rif || payment.co_prov || "").toUpperCase().trim();
    const isPersonaJuridica = 
        rifProv.startsWith("J") || 
        rifProv.startsWith("G") || 
        payment.tipo_per === "J" || 
        payment.co_tab === "7" || 
        payment.co_tab === "8";

    const isNoDomiciliado = payment.co_tab === "8" || payment.co_tab === "6";
    const tipoPersonaText = isPersonaJuridica ? "JURIDICA" : "NATURAL";
    const domicilioText = isNoDomiciliado 
        ? "NO DOMICILIADO" 
        : (isPersonaJuridica ? "DOMICILIADO" : "RESIDENCIADO");

    // Preparar lista de renglones de ISLR
    let rawIslrList = payment.retenciones_islr || [];

    // Fallback: si no vinieron en retenciones_islr, sintetizar desde renglones del pago
    if (rawIslrList.length === 0 && payment.renglones && payment.renglones.length > 0) {
        const facturasConIslr = payment.renglones.filter((r: any) => 
            Number(r.monto_retencion || 0) > 0 && r.co_tipo_doc !== 'IVAN' && r.co_tipo_doc !== 'ISLR'
        );
        const islrRow = payment.renglones.find((r: any) => r.co_tipo_doc === 'ISLR');

        if (facturasConIslr.length > 0) {
            rawIslrList = facturasConIslr.map((f: any, idx: number) => {
                const docBruto = Number(f.total_neto || f.mont_cob || 0);
                const retIslr = Number(f.monto_retencion || 0);
                const base = Number(f.total_bruto || (docBruto - (Number(f.monto_imp) || 0)) || docBruto);
                const porc = base > 0 ? Number(((retIslr / base) * 100).toFixed(2)) : 2.0;

                return {
                    reng_num: idx + 1,
                    co_islr: '055',
                    islr_des: 'Pagos a Empresas Contratistas o Subcontratistas',
                    monto: docBruto,
                    monto_obj: base,
                    monto_reten: retIslr,
                    porc_retn: porc,
                    sustraendo: 0,
                    num_comprobante: islrRow?.nro_doc || payment.recibo || payment.cob_num,
                    nro_doc_islr: islrRow?.nro_doc || '',
                    fecha_documento: f.fec_emis || payment.fecha,
                    numero_control_documento: f.n_control || '---',
                    nro_doc: f.nro_doc,
                    nro_fact: f.nro_fact || f.nro_doc,
                    co_tipo_doc: f.co_tipo_doc || 'FACT',
                    monto_documento: docBruto,
                    doc_descrip: '0'
                };
            });
        }
    }

    // Filtrar por concepto o comprobante si viene en query
    if (coIslrFilter) {
        const filtered = rawIslrList.filter((r: any) => (r.co_islr || '').trim() === coIslrFilter.trim());
        if (filtered.length > 0) rawIslrList = filtered;
    }
    if (compFilter) {
        const filtered = rawIslrList.filter((r: any) => 
            (r.num_comprobante || r.nro_doc_islr || '').trim() === compFilter.trim()
        );
        if (filtered.length > 0) rawIslrList = filtered;
    }

    // Agrupar por número de comprobante o concepto para soportar múltiples
    const vouchersMap = new Map<string, any[]>();
    for (const item of rawIslrList) {
        const comp = (item.num_comprobante || item.nro_doc_islr || payment.cob_num || '').trim();
        if (!vouchersMap.has(comp)) {
            vouchersMap.set(comp, []);
        }
        vouchersMap.get(comp)!.push(item);
    }

    if (vouchersMap.size === 0) {
        vouchersMap.set(payment.cob_num, []);
    }

    const vouchers = Array.from(vouchersMap.entries()).map(([compNum, rows]) => {
        // Formatear comprobante fiscal SENIAT (YYYYMM + 8 dígitos)
        let formattedComp = compNum;
        const pDate = new Date(payment.fecha || Date.now());
        const defaultYear = pDate.getFullYear();
        const defaultMonthNum = String(pDate.getMonth() + 1).padStart(2, '0');
        const defaultPeriodStr = `${defaultYear}${defaultMonthNum}`;

        if (formattedComp.length < 14 && /^\d+$/.test(formattedComp)) {
            formattedComp = `${defaultPeriodStr}${formattedComp.padStart(8, '0')}`;
        }

        const firstRow = rows[0] || {};
        const docDate = firstRow.fecha_documento ? new Date(firstRow.fecha_documento) : pDate;
        const fiscalYear = docDate.getFullYear();
        const fiscalMonthName = MESES[docDate.getMonth()] || MESES[pDate.getMonth()];
        const fechaEmision = payment.fecha ? dayjs(payment.fecha).format("DD/MM/YYYY") : dayjs().format("DD/MM/YYYY");

        const totalRetenido = rows.reduce((acc, r) => acc + Number(r.monto_reten || 0), 0);
        const primaryConcept = firstRow.islr_des || "Pagos a Empresas Contratistas o Subcontratistas";
        const primaryPercent = firstRow.porc_retn ? `${Number(firstRow.porc_retn)}%` : "2%";

        return {
            compNum: formattedComp,
            rawCompNum: compNum,
            fiscalYear,
            fiscalMonthName,
            fechaEmision,
            primaryConcept,
            primaryPercent,
            rows,
            totalRetenido
        };
    });

    onMount(() => {
        window.scrollTo(0, 0);
    });
</script>

<svelte:head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Comprobante de Retención ISLR - {branch.business_name || branch.name}</title>
</svelte:head>

<!-- BARRA DE ACCIONES FLOTANTE (NO SE IMPRIME) -->
<div class="no-print fixed bottom-6 left-4 right-4 md:left-auto md:right-8 flex flex-col md:flex-row gap-3 pointer-events-auto z-[99999] select-none touch-manipulation">
    <button
        onclick={() => { window.focus(); window.print(); }}
        class="w-full md:w-auto justify-center bg-amber-600 hover:bg-amber-500 text-white px-8 py-4 rounded-2xl font-black shadow-2xl shadow-amber-600/40 transition-all active:scale-95 flex items-center gap-3 cursor-pointer text-sm"
    >
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14" rx="1"/><path d="M6 8V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/>
        </svg>
        IMPRIMIR COMPROBANTE ISLR
    </button>
    <button
        onclick={() => window.close()}
        class="w-full md:w-auto text-center bg-gray-900/80 hover:bg-gray-800 backdrop-blur-md text-white px-8 py-4 rounded-2xl font-black shadow-xl transition-all active:scale-95 cursor-pointer text-sm"
    >
        CERRAR
    </button>
</div>

<div class="print-wrapper">
    {#each vouchers as v, vIdx}
        <div class="voucher-sheet">
            <!-- ENCABEZADO SUPERIOR -->
            <div class="top-header">
                <!-- LOGO Y DATOS DE LA EMPRESA -->
                <div class="brand-box">
                    {#if logoUrl}
                        <img src={logoUrl} alt="Logo" class="brand-logo" />
                    {/if}
                    <div class="brand-text">
                        <span class="brand-name">{branch.business_name || branch.name}</span>
                        <span class="brand-rif">{branch.rif || ""}</span>
                    </div>
                </div>

                <!-- TÍTULO CENTRAL Y COMPROBANTE -->
                <div class="header-center">
                    <h1 class="main-title">COMPROBANTE DE RETENCIÓN DE IMPUESTO SOBRE LA RENTA (I.S.L.R)</h1>
                    <div class="comp-box-center">
                        <span class="comp-label">Número de Comprobante</span>
                        <span class="comp-number">{v.compNum}</span>
                    </div>
                </div>

                <!-- PERÍODO FISCAL DERECHO -->
                <div class="fiscal-side-box">
                    <div class="fiscal-side-title">Período Fiscal</div>
                    <div class="fiscal-side-grid">
                        <div class="fiscal-row">
                            <span class="f-lbl">Año:</span>
                            <span class="f-val">{v.fiscalYear}</span>
                        </div>
                        <div class="fiscal-row">
                            <span class="f-lbl">Mes:</span>
                            <span class="f-val">{v.fiscalMonthName}</span>
                        </div>
                        <div class="fiscal-row">
                            <span class="f-lbl">Fecha:</span>
                            <span class="f-val">{v.fechaEmision}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- CUADROS DE AGENTE DE RETENCIÓN Y SUJETO RETENIDO -->
            <div class="parties-container">
                <!-- AGENTE DE RETENCIÓN -->
                <table class="party-table">
                    <tbody>
                        <tr>
                            <td class="cell-label-val w-65">
                                <div class="cell-label">NOMBRE O RAZÓN SOCIAL AGENTE DE RETENCIÓN</div>
                                <div class="cell-value">{branch.business_name || branch.name}</div>
                            </td>
                            <td class="cell-label-val w-35">
                                <div class="cell-label">REGISTRO DE INFORMACIÓN FISCAL (R.I.F.) DEL AGENTE DE RETENCIÓN</div>
                                <div class="cell-value font-mono font-bold">{branch.rif || "---"}</div>
                            </td>
                        </tr>
                        <tr>
                            <td colspan="2" class="cell-label-val">
                                <div class="cell-label">DIRECCION FISCAL DEL AGENTE DE RETENCIÓN</div>
                                <div class="cell-value">{branch.address || "Dirección no registrada"}</div>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <!-- SUJETO RETENIDO (BENEFICIARIO / PROVEEDOR) -->
                <table class="party-table">
                    <tbody>
                        <tr>
                            <td class="cell-label-val w-65">
                                <div class="cell-label">NOMBRE O RAZÓN SOCIAL DEL SUJETO RETENIDO</div>
                                <div class="cell-value">{payment.prov_des || payment.co_prov}</div>
                            </td>
                            <td class="cell-label-val w-35">
                                <div class="cell-label">REGISTRO DE INFORMACIÓN FISCAL (R.I.F.) DEL SUJETO RETENIDO</div>
                                <div class="cell-value font-mono font-bold">{payment.rif || payment.co_prov}</div>
                            </td>
                        </tr>
                        <tr>
                            <td colspan="2" class="cell-label-val">
                                <div class="cell-label">DIRECCION FISCAL DEL SUJETO RETENIDO</div>
                                <div class="cell-value">{payment.direc1 || "Dirección no registrada"}</div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- BARRA DE INFORMACIÓN DE RETENCIÓN ISLR -->
            <div class="islr-info-bar">
                <div class="islr-info-line">
                    <span class="info-tag font-bold">Retención de I.S.L.R por concepto de:</span>
                    <span class="info-val font-black uppercase">{v.primaryConcept}</span>
                </div>
                <div class="islr-meta-line">
                    <div>
                        <span class="info-tag">Tipo de Persona:</span>
                        <span class="info-val font-bold uppercase">{tipoPersonaText}</span>
                    </div>
                    <div>
                        <span class="info-tag">Recidenciado / Domiciliado:</span>
                        <span class="info-val font-bold uppercase">{domicilioText}</span>
                    </div>
                    <div>
                        <span class="info-tag">Porcentaje:</span>
                        <span class="info-val font-black">{v.primaryPercent}</span>
                    </div>
                </div>
            </div>

            <!-- TABLA DE OPERACIONES ISLR -->
            <div class="operations-table-wrap">
                <table class="ops-table">
                    <thead>
                        <tr>
                            <th class="col-date">Fecha del Documento</th>
                            <th class="col-doc">Número de Documento</th>
                            <th class="col-ctrl">Número de Control</th>
                            <th class="col-desc">Descripción</th>
                            <th class="col-amount">Monto del Documeto</th>
                            <th class="col-amount">Base Imponible</th>
                            <th class="col-pct">% de la Retención</th>
                            <th class="col-amount">Sustraendo</th>
                            <th class="col-amount">Monto Retenido</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each v.rows as row}
                            {@const base = Number(row.monto_obj || row.monto || 0)}
                            {@const totalDoc = Number(row.monto_documento || row.monto || base)}
                            {@const porc = Number(row.porc_retn || 2)}
                            {@const sust = Number(row.sustraendo || 0)}
                            {@const ret = Number(row.monto_reten || 0)}
                            {@const docNum = row.nro_fact && row.nro_fact !== '---' ? row.nro_fact : row.nro_doc}
                            <tr>
                                <td class="text-center font-mono">{row.fecha_documento ? dayjs(row.fecha_documento).format("DD/MM/YYYY") : v.fechaEmision}</td>
                                <td class="text-center font-mono font-bold">{docNum || '---'}</td>
                                <td class="text-center font-mono">{row.numero_control_documento || '---'}</td>
                                <td class="text-center font-bold text-gray-700">{row.doc_descrip && row.doc_descrip !== '0' ? row.doc_descrip : '0'}</td>
                                <td class="text-right font-mono font-bold">{formatCurrency(totalDoc)}</td>
                                <td class="text-right font-mono">{formatCurrency(base)}</td>
                                <td class="text-center font-bold">{porc}%</td>
                                <td class="text-right font-mono">{formatCurrency(sust)}</td>
                                <td class="text-right font-mono font-bold">{formatCurrency(ret)}</td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="9" class="text-center py-6 text-gray-500 italic">
                                    No se registraron renglones de retención de ISLR para este pago.
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            <!-- TOTAL RETENIDO -->
            <div class="totals-section">
                <div class="total-retenido-box">
                    <span class="total-lbl">Total Retenido al Proveedor:</span>
                    <span class="total-val">Bs. {formatCurrency(v.totalRetenido)}</span>
                </div>
            </div>

            <!-- SECCIÓN INFERIOR DE FIRMAS Y SELLOS -->
            <div class="signatures-section">
                <!-- AGENTE DE RETENCIÓN -->
                <div class="sig-block left-sig">
                    <div class="sig-row">
                        <span class="sig-lbl">Firma del Agente de Retención:</span>
                        <div class="sig-line"></div>
                    </div>
                    <div class="sig-row mt-4">
                        <span class="sig-lbl">Sello del Agente de Retención:</span>
                        <div class="sig-line"></div>
                    </div>

                    <!-- ESTAMPA DE SELLO Y FIRMA OVERLAY -->
                    {#if sealUrl}
                        <div class="seal-overlay">
                            <img src={sealUrl} alt="Sello y Firma" class="seal-img" />
                        </div>
                    {/if}
                </div>

                <!-- AGENTE RETENIDO -->
                <div class="sig-block right-sig">
                    <div class="sig-row">
                        <span class="sig-lbl">Fecha de Recepción:</span>
                        <div class="sig-line"></div>
                    </div>
                    <div class="sig-row mt-4">
                        <span class="sig-lbl">Recibido por:</span>
                        <div class="sig-line"></div>
                    </div>
                </div>
            </div>
        </div>
    {/each}
</div>

<style>
    :global(body) {
        background-color: #525659;
        margin: 0;
        padding: 0;
        font-family: Arial, Helvetica, sans-serif;
        color: #000;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }

    .print-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 25px;
        padding: 25px 0 80px;
    }

    /* FORMATO CARTA HORIZONTAL (LANDSCAPE) */
    .voucher-sheet {
        background: #ffffff;
        width: 27.94cm;
        min-height: 21.59cm;
        padding: 0.8cm 1cm;
        box-sizing: border-box;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        position: relative;
        display: flex;
        flex-direction: column;
    }

    /* ENCABEZADO */
    .top-header {
        display: grid;
        grid-template-columns: 200px 1fr 180px;
        gap: 15px;
        align-items: start;
        margin-bottom: 12px;
    }

    .brand-box {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
    }

    .brand-logo {
        height: 60px;
        max-width: 190px;
        object-fit: contain;
    }

    .brand-text {
        display: flex;
        flex-direction: column;
        font-size: 8px;
        font-weight: bold;
        text-transform: uppercase;
        line-height: 1.1;
    }

    .brand-name {
        font-size: 9px;
        font-weight: 900;
    }

    .brand-rif {
        font-size: 8px;
        color: #333;
    }

    .header-center {
        text-align: center;
        padding: 0 5px;
    }

    .main-title {
        font-size: 12.5px;
        font-weight: 900;
        margin: 0 0 10px;
        letter-spacing: -0.2px;
        text-transform: uppercase;
    }

    .comp-box-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
    }

    .comp-label {
        font-size: 8.5px;
        font-weight: bold;
        text-transform: uppercase;
        color: #444;
    }

    .comp-number {
        font-size: 13.5px;
        font-weight: 900;
        font-family: monospace;
        letter-spacing: 0.5px;
    }

    /* CAJETÍN DERECHO PERÍODO FISCAL */
    .fiscal-side-box {
        border-left: 2px solid #ddd;
        padding-left: 12px;
        font-size: 8.5px;
    }

    .fiscal-side-title {
        font-weight: 900;
        text-transform: uppercase;
        margin-bottom: 4px;
        color: #333;
    }

    .fiscal-side-grid {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .fiscal-row {
        display: flex;
        gap: 5px;
    }

    .f-lbl {
        font-weight: bold;
        color: #555;
        width: 40px;
    }

    .f-val {
        font-weight: 900;
        text-transform: uppercase;
        font-family: monospace;
    }

    /* DATOS FISCALES */
    .parties-container {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 10px;
    }

    .party-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #000;
    }

    .party-table td {
        border: 1px solid #000;
        padding: 2.5px 6px;
        vertical-align: top;
    }

    .w-65 { width: 65%; }
    .w-35 { width: 35%; }

    .cell-label {
        font-size: 7px;
        font-weight: 900;
        text-transform: uppercase;
        color: #333;
        margin-bottom: 1px;
    }

    .cell-value {
        font-size: 9px;
        font-weight: 900;
        text-transform: uppercase;
        color: #000;
        min-height: 11px;
    }

    /* BARRA DE INFORMACIÓN DE RETENCIÓN */
    .islr-info-bar {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 8px;
        padding: 4px 6px;
        background: #fafafa;
        border: 1px solid #ddd;
        border-radius: 4px;
        margin-bottom: 8px;
    }

    .islr-info-line {
        display: flex;
        gap: 6px;
        align-items: center;
    }

    .islr-meta-line {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 2px;
        border-top: 1px dashed #eee;
    }

    .info-tag {
        color: #444;
        margin-right: 4px;
    }

    .info-val {
        color: #000;
    }

    /* TABLA DE OPERACIONES ISLR */
    .operations-table-wrap {
        margin-bottom: 5px;
    }

    .ops-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 7.5px;
        border: 1px solid #000;
    }

    .ops-table th {
        border: 1px solid #000;
        padding: 4px 3px;
        background: #fff;
        font-weight: 900;
        text-align: center;
        text-transform: uppercase;
        line-height: 1.1;
    }

    .ops-table td {
        border: 1px solid #000;
        padding: 3px 4px;
        height: 18px;
        vertical-align: middle;
    }

    .col-date { width: 9%; }
    .col-doc { width: 10%; }
    .col-ctrl { width: 12%; }
    .col-desc { width: 15%; }
    .col-amount { width: 12%; }
    .col-pct { width: 9%; }

    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-mono { font-family: monospace; }
    .font-bold { font-weight: 700; }

    /* TOTALES */
    .totals-section {
        display: flex;
        justify-content: flex-end;
        margin-top: 4px;
        margin-bottom: 15px;
        padding-right: 10px;
    }

    .total-retenido-box {
        display: flex;
        align-items: center;
        gap: 20px;
        border-top: 2px solid #000;
        padding-top: 4px;
    }

    .total-lbl {
        font-size: 9.5px;
        font-weight: 900;
        text-transform: uppercase;
    }

    .total-val {
        font-size: 13.5px;
        font-weight: 900;
        font-family: monospace;
    }

    /* SECCIÓN DE FIRMAS */
    .signatures-section {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 50px;
        margin-top: auto;
        padding-top: 20px;
        position: relative;
    }

    .sig-block {
        display: flex;
        flex-direction: column;
        gap: 14px;
        position: relative;
    }

    .sig-row {
        display: flex;
        align-items: flex-end;
        font-size: 8.5px;
        font-weight: bold;
    }

    .sig-lbl {
        white-space: nowrap;
        margin-right: 5px;
    }

    .sig-line {
        flex: 1;
        border-bottom: 1px solid #000;
        height: 10px;
    }

    /* ESTAMPA DE SELLO Y FIRMA */
    .seal-overlay {
        position: absolute;
        bottom: -15px;
        left: 100px;
        width: 190px;
        height: 100px;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .seal-img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        transform: rotate(-1.5deg);
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.15));
    }

    /* MEDIA PRINT */
    @media print {
        :global(body) {
            background: #fff !important;
            padding: 0 !important;
            margin: 0 !important;
        }

        .no-print {
            display: none !important;
        }

        .print-wrapper {
            padding: 0 !important;
            gap: 0 !important;
        }

        .voucher-sheet {
            box-shadow: none !important;
            margin: 0 !important;
            width: 100% !important;
            min-height: 0 !important;
            height: auto !important;
            page-break-after: always;
            break-after: page;
            padding: 0.5cm 0.6cm !important;
        }

        @page {
            size: letter landscape;
            margin: 0.5cm;
        }
    }
</style>

