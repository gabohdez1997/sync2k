<script lang="ts">
    import dayjs from "dayjs";
    import "dayjs/locale/es";
    import { onMount } from "svelte";
    import type { PageData } from "./$types";

    dayjs.locale("es");

    let { data }: { data: PageData } = $props();
    const { payment, branch, compFilter } = data;

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

    // Preparar lista de renglones de retención
    let rawRetList = payment.retenciones_iva || [];

    // Fallback: si no vinieron en retenciones_iva, sintetizar desde renglones del pago
    if (rawRetList.length === 0 && payment.renglones && payment.renglones.length > 0) {
        const facturasConReten = payment.renglones.filter((r: any) => 
            Number(r.monto_retencion_iva || 0) > 0 && r.co_tipo_doc !== 'IVAN' && r.co_tipo_doc !== 'ISLR'
        );
        const ivanRow = payment.renglones.find((r: any) => r.co_tipo_doc === 'IVAN');

        if (facturasConReten.length > 0) {
            rawRetList = facturasConReten.map((f: any, idx: number) => {
                const docNeto = Number(f.total_neto || f.mont_cob || 0);
                const retIva = Number(f.monto_retencion_iva || 0);
                const imp = Number(f.monto_imp || (docNeto * 0.16) || 0);
                const base = docNeto - imp;
                const porc = imp > 0 ? Math.round((retIva / imp) * 100) : 75;

                return {
                    reng_num: idx + 1,
                    num_comprobante: ivanRow?.nro_doc || payment.recibo || payment.cob_num,
                    monto_documento: docNeto,
                    base_imponible: base > 0 ? base : docNeto,
                    monto_ret_imp: retIva,
                    alicuota: 16,
                    monto_excento: 0,
                    fecha_documento: f.fec_emis || payment.fecha,
                    numero_control_documento: f.n_control || '---',
                    tipo_documento: f.co_tipo_doc || 'FACT',
                    numero_documento_afectado: '0',
                    nro_doc: f.nro_doc,
                    nro_fact: f.nro_fact || f.nro_doc,
                    porc_ret: porc
                };
            });
        }
    }

    // Filtrar por comprobante específico si viene en query
    if (compFilter) {
        const filtered = rawRetList.filter((r: any) => (r.num_comprobante || '').trim() === compFilter.trim());
        if (filtered.length > 0) {
            rawRetList = filtered;
        }
    }

    // Agrupar por número de comprobante para soportar múltiples comprobantes si aplica
    const vouchersMap = new Map<string, any[]>();
    for (const item of rawRetList) {
        const comp = (item.num_comprobante || payment.cob_num || '').trim();
        if (!vouchersMap.has(comp)) {
            vouchersMap.set(comp, []);
        }
        vouchersMap.get(comp)!.push(item);
    }

    // Si no había ningún renglón de retención, crear un comprobante vacío representativo
    if (vouchersMap.size === 0) {
        vouchersMap.set(payment.cob_num, []);
    }

    const vouchers = Array.from(vouchersMap.entries()).map(([compNum, rows]) => {
        // Formatear número de comprobante fiscal SENIAT si es corto (ej. YYYYMM + 8 dígitos)
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

        const totalRetenido = rows.reduce((acc, r) => acc + Number(r.monto_ret_imp || 0), 0);

        return {
            compNum: formattedComp,
            rawCompNum: compNum,
            fiscalYear,
            fiscalMonthName,
            fechaEmision: payment.fecha ? dayjs(payment.fecha).format("DD/MM/YYYY") : dayjs().format("DD/MM/YYYY"),
            fechaEntrega: payment.fecha ? dayjs(payment.fecha).format("DD/MM/YYYY") : dayjs().format("DD/MM/YYYY"),
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
    <title>Comprobante de Retención IVA - {branch.business_name || branch.name}</title>
</svelte:head>

<!-- BARRA DE ACCIONES FLOTANTE (NO SE IMPRIME) -->
<div class="no-print fixed bottom-6 left-4 right-4 md:left-auto md:right-8 flex flex-col md:flex-row gap-3 pointer-events-auto z-[99999] select-none touch-manipulation">
    <button
        onclick={() => { window.focus(); window.print(); }}
        class="w-full md:w-auto justify-center bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl font-black shadow-2xl shadow-blue-600/40 transition-all active:scale-95 flex items-center gap-3 cursor-pointer text-sm"
    >
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14" rx="1"/><path d="M6 8V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/>
        </svg>
        IMPRIMIR COMPROBANTE IVA
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

                <!-- TÍTULO CENTRAL Y BASE LEGAL -->
                <div class="header-center">
                    <h1 class="main-title">COMPROBANTE DE RETENCION DEL IMPUESTO AL VALOR AGREGADO</h1>
                    <p class="legal-notice">
                        Ley de IVA Art. 11: "La administracion Tributaria podra designar como responsables del pago del impuesto, en calidad de agentes de retencion a quienes por sus funciones publicas o por razon de sus actividades privadas intervengan en operaciones gravadas con el impuesto establecido en este Decreto con Rango, Valor y Fuerza de Ley"
                    </p>
                </div>

                <!-- CAJETÍN FISCAL DERECHO -->
                <div class="fiscal-badge-box">
                    <div class="comp-number-box">
                        <span class="comp-label">N° COMPROBANTE</span>
                        <span class="comp-number">{v.compNum}</span>
                    </div>
                    <table class="dates-table">
                        <thead>
                            <tr>
                                <th>Fecha Emision</th>
                                <th>Fecha Entrega</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>{v.fechaEmision}</td>
                                <td>{v.fechaEntrega}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="period-box">
                        <div class="period-title">PERÍODO FISCAL</div>
                        <div class="period-details">
                            <div class="period-col">
                                <span class="period-lbl">AÑO:</span>
                                <span class="period-val">{v.fiscalYear}</span>
                            </div>
                            <div class="period-col">
                                <span class="period-lbl">MES:</span>
                                <span class="period-val">{v.fiscalMonthName}</span>
                            </div>
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
                            <td class="cell-label-val w-70">
                                <div class="cell-label">NOMBRE O RAZÓN SOCIAL AGENTE DE RETENCIÓN</div>
                                <div class="cell-value">{branch.business_name || branch.name}</div>
                            </td>
                            <td class="cell-label-val w-30">
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

                <!-- SUJETO RETENIDO -->
                <table class="party-table">
                    <tbody>
                        <tr>
                            <td class="cell-label-val w-70">
                                <div class="cell-label">NOMBRE O RAZÓN SOCIAL DEL SUJETO RETENIDO</div>
                                <div class="cell-value">{payment.prov_des || payment.co_prov}</div>
                            </td>
                            <td class="cell-label-val w-30">
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

            <!-- TABLA DE OPERACIONES Y RETENCIONES -->
            <div class="operations-table-wrap">
                <table class="ops-table">
                    <thead>
                        <tr>
                            <th rowspan="2" class="col-sm">N° OPER</th>
                            <th rowspan="2" class="col-date">FECHA FACTURA</th>
                            <th rowspan="2" class="col-doc">N° FACTURA</th>
                            <th rowspan="2" class="col-ctrl">N° CONTROL</th>
                            <th rowspan="2" class="col-sm">N° NOTA DÉBITO</th>
                            <th rowspan="2" class="col-sm">N° NOTA CRÉDITO</th>
                            <th rowspan="2" class="col-trans">TIPO DE TRANS.</th>
                            <th rowspan="2" class="col-sm">N° DEL DOCUMENTO AFECTADO</th>
                            <th rowspan="2" class="col-amount">MONTO TOTAL DE LA FACTURA O NOTA DE DEBITO</th>
                            <th rowspan="2" class="col-amount">COMPRAS SIN DERECHO A CRÉDITO FISCAL</th>
                            <th colspan="5" class="col-group">COMPRAS INTERNAS O IMPORTACIONES</th>
                        </tr>
                        <tr>
                            <th class="col-amount">BASE IMPONIBLE</th>
                            <th class="col-pct">% ALÍCUOTA</th>
                            <th class="col-amount">IMPUESTO I.V.A. CAUSADO</th>
                            <th class="col-amount">IMPUESTO I.V.A. RETENIDO</th>
                            <th class="col-pct">PORCENTAJE RETENIDO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each v.rows as row, idx}
                            {@const base = Number(row.base_imponible || 0)}
                            {@const alic = Number(row.alicuota || 16)}
                            {@const caus = Number(row.monto_imp_causado || (base * (alic / 100)))}
                            {@const ret = Number(row.monto_ret_imp || 0)}
                            {@const porcRet = Number(row.porc_ret || (caus > 0 ? Math.round((ret / caus) * 100) : 75))}
                            {@const isND = (row.tipo_documento || row.co_tipo_doc || '').trim() === 'NDEB' || (row.tipo_documento || row.co_tipo_doc || '').trim() === 'N/DB'}
                            {@const isNC = (row.tipo_documento || row.co_tipo_doc || '').trim() === 'N/CR' || (row.tipo_documento || row.co_tipo_doc || '').trim() === 'NCR'}
                            <tr>
                                <td class="text-center">{idx + 1}</td>
                                <td class="text-center font-mono">{row.fecha_documento ? dayjs(row.fecha_documento).format("DD/MM/YYYY") : v.fechaEmision}</td>
                                <td class="text-center font-mono font-bold">{row.nro_fact || row.numero_documento || row.nro_doc || '---'}</td>
                                <td class="text-center font-mono">{row.numero_control_documento || '---'}</td>
                                <td class="text-center font-mono">{isND ? (row.nro_doc || '0') : '0'}</td>
                                <td class="text-center font-mono">{isNC ? (row.nro_doc || '0') : '0'}</td>
                                <td class="text-center font-bold">{isNC ? '03' : isND ? '02' : '01'}</td>
                                <td class="text-center font-mono">{row.numero_documento_afectado && row.numero_documento_afectado !== '0' ? row.numero_documento_afectado : '0'}</td>
                                <td class="text-right font-mono font-bold">{formatCurrency(row.monto_documento)}</td>
                                <td class="text-right font-mono">{formatCurrency(row.monto_excento || 0)}</td>
                                <td class="text-right font-mono">{formatCurrency(base)}</td>
                                <td class="text-center font-bold">{alic}%</td>
                                <td class="text-right font-mono">{formatCurrency(caus)}</td>
                                <td class="text-right font-mono font-bold">{formatCurrency(ret)}</td>
                                <td class="text-center font-bold">{porcRet}%</td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="15" class="text-center py-6 text-gray-500 italic">
                                    No se registraron renglones de retención de IVA para este pago.
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
                    <div class="sig-row">
                        <span class="sig-lbl">Recibido por:</span>
                        <div class="sig-line"></div>
                    </div>
                    <div class="sig-row">
                        <span class="sig-lbl">Sello del Agente Retenido:</span>
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
        grid-template-columns: 200px 1fr 240px;
        gap: 12px;
        align-items: start;
        margin-bottom: 8px;
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
        font-size: 13.5px;
        font-weight: 900;
        margin: 0 0 4px;
        letter-spacing: -0.2px;
        text-transform: uppercase;
    }

    .legal-notice {
        font-size: 7.5px;
        line-height: 1.15;
        margin: 0;
        color: #222;
        text-align: center;
    }

    /* CAJETÍN FISCAL */
    .fiscal-badge-box {
        border: 1.5px solid #000;
        background: #fff;
    }

    .comp-number-box {
        border-bottom: 1px solid #000;
        padding: 4px 6px;
        text-align: center;
    }

    .comp-label {
        font-size: 8px;
        font-weight: 900;
        display: block;
        text-transform: uppercase;
    }

    .comp-number {
        font-size: 13px;
        font-weight: 900;
        font-family: monospace;
        letter-spacing: 0.5px;
    }

    .dates-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 8px;
        text-align: center;
        border-bottom: 1px solid #000;
    }

    .dates-table th {
        border-bottom: 1px solid #000;
        border-right: 1px solid #000;
        padding: 2px 4px;
        font-weight: bold;
        background: #f9f9f9;
        text-transform: uppercase;
        font-size: 7.5px;
    }

    .dates-table th:last-child {
        border-right: none;
    }

    .dates-table td {
        border-right: 1px solid #000;
        padding: 2px 4px;
        font-family: monospace;
        font-weight: bold;
    }

    .dates-table td:last-child {
        border-right: none;
    }

    .period-box {
        font-size: 8px;
        text-align: center;
    }

    .period-title {
        font-size: 7.5px;
        font-weight: 900;
        background: #f9f9f9;
        border-bottom: 1px solid #000;
        padding: 1px 0;
        text-transform: uppercase;
    }

    .period-details {
        display: grid;
        grid-template-columns: 1fr 1fr;
    }

    .period-col {
        padding: 2px;
        display: flex;
        justify-content: center;
        gap: 3px;
    }

    .period-col:first-child {
        border-right: 1px solid #000;
    }

    .period-lbl {
        font-weight: 900;
        font-size: 7.5px;
    }

    .period-val {
        font-weight: 900;
        font-size: 7.5px;
        text-transform: uppercase;
    }

    /* DATOS FISCALES */
    .parties-container {
        display: flex;
        flex-direction: column;
        gap: 5px;
        margin-bottom: 8px;
    }

    .party-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #000;
    }

    .party-table td {
        border: 1px solid #000;
        padding: 2px 6px;
        vertical-align: top;
    }

    .w-70 { width: 70%; }
    .w-30 { width: 30%; }

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

    /* TABLA DE OPERACIONES */
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
        padding: 2.5px 2px;
        background: #fff;
        font-weight: 900;
        text-align: center;
        text-transform: uppercase;
        line-height: 1.1;
    }

    .ops-table td {
        border: 1px solid #000;
        padding: 2.5px 3px;
        height: 16px;
        vertical-align: middle;
    }

    .col-sm { width: 4.5%; }
    .col-date { width: 6.5%; }
    .col-doc { width: 6.5%; }
    .col-ctrl { width: 7.5%; }
    .col-trans { width: 5%; }
    .col-amount { width: 8.5%; }
    .col-pct { width: 5.5%; }
    .col-group { background: #fdfdfd; font-weight: 900; }

    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-mono { font-family: monospace; }
    .font-bold { font-weight: 700; }

    /* TOTALES */
    .totals-section {
        display: flex;
        justify-content: flex-end;
        margin-top: 3px;
        margin-bottom: 12px;
        padding-right: 10px;
    }

    .total-retenido-box {
        display: flex;
        align-items: center;
        gap: 18px;
    }

    .total-lbl {
        font-size: 9.5px;
        font-weight: 900;
        text-transform: uppercase;
    }

    .total-val {
        font-size: 13px;
        font-weight: 900;
        font-family: monospace;
    }

    /* SECCIÓN DE FIRMAS */
    .signatures-section {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 50px;
        margin-top: auto;
        padding-top: 15px;
        position: relative;
    }

    .sig-block {
        display: flex;
        flex-direction: column;
        gap: 12px;
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
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.15));
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
