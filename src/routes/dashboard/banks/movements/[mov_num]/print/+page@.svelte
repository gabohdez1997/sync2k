<script lang="ts">
  import dayjs from "dayjs";
  import "dayjs/locale/es";
  import { onMount } from "svelte";

  dayjs.locale("es");

  let { data } = $props();

  const mov = data.mov;
  const company = data.company;
  const transfer = mov?.transferencia || null;

  function isUSD(coMone: string) {
    return Boolean(coMone && !["BS", "BSS", "BS.", "VEF", "VES"].includes(coMone.toUpperCase()));
  }

  const usdMode = isUSD(mov?.co_mone || "BS");

  function formatAmount(val: number | string) {
    return Number(val || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatMoney(val: number | string, coMone: string = mov?.co_mone || "BS") {
    return `${isUSD(coMone) ? "$" : "Bs."} ${formatAmount(val)}`;
  }

  const montoH = Number(mov?.monto_h || 0);
  const montoD = Number(mov?.monto_d || 0);
  const montoIdb = Number(mov?.idb || 0);
  const tasaVal = Number(mov?.tasa || 1);

  const netoAfectacion =
    mov?.tipo_op === "ID" ? -montoIdb : montoH > 0 ? montoH : -(montoD + montoIdb);

  const statusText = mov?.anulado
    ? "ANULADO"
    : mov?.conciliado
      ? `CONCILIADO${mov?.fec_con ? ` (${dayjs(mov.fec_con).format("MM/YYYY")})` : ""}`
      : "PENDIENTE POR CONCILIAR";

  const linkedLegs: any[] = Array.isArray(transfer?.movimientos_vinculados)
    ? transfer.movimientos_vinculados
    : [];

  const rowsCount = 1 + (linkedLegs.length > 0 ? linkedLegs.length : 0);
  const emptyRowsCount = Math.max(0, (linkedLegs.length > 0 ? 18 : 22) - rowsCount);

  onMount(() => {
    window.scrollTo(0, 0);
  });
</script>

<svelte:head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Comprobante Bancario {mov?.mov_num || ""} - {company.name}</title>
</svelte:head>

<!-- FLOATING ACTIONS (NO PRINT) -->
<div
  class="no-print fixed bottom-6 left-4 right-4 md:left-auto md:right-8 flex flex-col md:flex-row gap-3 pointer-events-auto z-[99999] select-none touch-manipulation"
>
  <button
    type="button"
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
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect width="12" height="8" x="6" y="14" rx="1" />
      <path d="M6 8V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4" />
    </svg>
    IMPRIMIR COMPROBANTE
  </button>
  <button
    type="button"
    onclick={() => window.close()}
    class="w-full md:w-auto text-center bg-gray-800/80 backdrop-blur-md text-white px-10 py-5 rounded-2xl font-black shadow-xl hover:bg-gray-700 transition-all active:scale-95 cursor-pointer"
  >
    CERRAR
  </button>
</div>

<div class="report-wrapper pb-20 pt-10">
  <div class="page-sheet">
    {#if mov?.anulado}
      <div class="watermark-anulado">ANULADO</div>
    {/if}

    <div class="print-container">
      <!-- HEADER FISCAL -->
      <div class="header-section">
        <div class="brand-info">
          {#if company.logo_url}
            <img src={company.logo_url} alt="Logo" class="logo-img" />
          {/if}
          <div class="company-details">
            <h1 class="business-name">{company.name}</h1>
            <p class="fiscal-id">RIF: {company.rif || "---"}</p>
            {#if company.address}
              <p class="address">{company.address}</p>
            {/if}
            {#if company.phone}
              <p class="address">Tel: {company.phone}</p>
            {/if}
          </div>
        </div>

        <div class="doc-info">
          <div class="doc-badge">
            <span class="label">
              {mov.es_transferencia ? "Transferencia Bancaria" : "Movimiento Bancario"} ({mov.tipo_op})
            </span>
            <span class="number">{mov.mov_num}</span>
          </div>
          <div class="dates mt-2">
            <p>Emisión: <strong>{dayjs(mov.fecha).format("DD/MM/YYYY")}</strong></p>
            {#if mov.fecha_che}
              <p>Fecha Cheque / Ref.: <strong>{dayjs(mov.fecha_che).format("DD/MM/YYYY")}</strong></p>
            {/if}
            <p class="currency-line uppercase">
              Moneda: <strong>{usdMode ? "DÓLARES (USD)" : "BOLÍVARES (BS.)"}</strong>
            </p>
          </div>
        </div>
      </div>

      <!-- ACCOUNT & OPERATION DETAILS -->
      <div class="info-grid">
        <div class="client-box">
          <h3 class="section-title">Datos de la Cuenta Bancaria</h3>
          <p class="client-name">{mov.des_ban}</p>
          <p class="client-rif">CÓDIGO CUENTA: {mov.cod_cta} · MONEDA: {mov.co_mone}</p>
          <p class="client-address font-medium">N° CUENTA: {mov.num_cta || "No registrado"}</p>
          <p class="client-phone mt-1">
            CTA. ING/EGR: {mov.co_cta_ingr_egr || "-"} {mov.cta_ing_egr_des ? `· ${mov.cta_ing_egr_des}` : ""}
          </p>
        </div>

        <div class="logistic-box">
          <h3 class="section-title">Datos de Operación</h3>
          <div class="info-row">
            <span class="label">Sucursal:</span>
            <span class="val text-blue-900 font-black">{company.branch_name}</span>
          </div>
          <div class="info-row">
            <span class="label">Tipo Op.:</span>
            <span class="val">{mov.tipo_op} - {mov.tipo_op_label}</span>
          </div>
          <div class="info-row">
            <span class="label">Referencia:</span>
            <span class="val">{mov.doc_num || "-"}</span>
          </div>
          <div class="info-row">
            <span class="label">Origen:</span>
            <span class="val">
              {mov.origen}
              {#if mov.cob_pag} · Doc: {mov.cob_pag}{/if}
              {#if mov.dep_num} · Dep: {mov.dep_num}{/if}
            </span>
          </div>
          <div class="info-row">
            <span class="label">Estatus:</span>
            <span class="val {mov.anulado ? 'text-red-700' : mov.conciliado ? 'text-emerald-700' : 'text-amber-700'}">
              {statusText}
            </span>
          </div>
        </div>
      </div>

      <!-- DETAIL TABLE -->
      <div class="table-container">
        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 8%;">Tipo</th>
              <th style="width: 14%;">Referencia</th>
              <th style="width: 42%;">Concepto / Descripción</th>
              <th style="width: 12%;">Crédito (+)</th>
              <th style="width: 12%;">Débito (-)</th>
              <th style="width: 12%;">IGTF / IDB</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="font-mono font-bold">{mov.tipo_op}</td>
              <td class="font-mono">{mov.doc_num || "-"}</td>
              <td class="text-left font-bold uppercase">{mov.descrip || "-"}</td>
              <td class="text-right font-mono font-bold text-emerald-700">
                {montoH > 0 ? formatAmount(montoH) : "-"}
              </td>
              <td class="text-right font-mono font-bold text-red-700">
                {montoD > 0 ? formatAmount(montoD) : "-"}
              </td>
              <td class="text-right font-mono font-bold text-amber-700">
                {montoIdb > 0 ? formatAmount(montoIdb) : "-"}
              </td>
            </tr>
            {#if emptyRowsCount > 0}
              {#each Array(emptyRowsCount) as _}
                <tr class="empty-row"><td colspan="6">&nbsp;</td></tr>
              {/each}
            {/if}
          </tbody>
        </table>

        {#if transfer && linkedLegs.length > 0}
          <div class="mt-3">
            <h3 class="section-title">
              Movimientos Vinculados de Transferencia #{transfer.co_trans_ban}
            </h3>
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 18%;">Rol</th>
                  <th style="width: 16%;">N° Mov.</th>
                  <th style="width: 34%;">Cuenta / Banco</th>
                  <th style="width: 12%;">Referencia</th>
                  <th style="width: 10%;">Crédito</th>
                  <th style="width: 10%;">Débito</th>
                </tr>
              </thead>
              <tbody>
                {#each linkedLegs as leg}
                  {@const rolLabel =
                    leg.mov_num === transfer.mov_ban_origen
                      ? "SALIDA ORIGEN (TR)"
                      : leg.mov_num === transfer.mov_ban_destino
                        ? "ENTRADA DESTINO (TP)"
                        : "COMISIÓN (ND)"}
                  <tr>
                    <td class="font-bold text-left">{rolLabel}</td>
                    <td class="font-mono font-bold">{leg.mov_num}</td>
                    <td class="text-left uppercase">{leg.cod_cta} · {leg.des_ban} ({leg.co_mone})</td>
                    <td class="font-mono">{leg.doc_num || "-"}</td>
                    <td class="text-right font-mono text-emerald-700">
                      {Number(leg.monto_h || 0) > 0 ? formatAmount(leg.monto_h) : "-"}
                    </td>
                    <td class="text-right font-mono text-red-700">
                      {Number(leg.monto_d || 0) > 0 ? formatAmount(leg.monto_d) : "-"}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>

      <!-- SUMMARY & FOOTER -->
      <div class="footer-block mt-auto">
        <div class="signatures-section">
          <div class="signature-box">
            <div class="signature-line"></div>
            <span class="signature-label">Elaborado por: {data.registeredByName}</span>
          </div>
          <div class="signature-box">
            <div class="signature-line"></div>
            <span class="signature-label">Revisado / Autorizado por:</span>
          </div>
        </div>

        <div class="footer-grid">
          <div class="remarks">
            {#if mov.descrip}
              <h4 class="section-title">Concepto / Observaciones</h4>
              <div class="remarks-content">{mov.descrip}</div>
            {/if}
            <div class="disclaimer mt-1">
              <p>* Comprobante generado en Sync2K · Módulo de Bancos (Profit Plus).</p>
              <p>
                * Tasa registrada: <strong>Bs. {formatAmount(tasaVal)}</strong> por 1 USD · Naturaleza:
                <strong>{mov.naturaleza}</strong>.
              </p>
            </div>
          </div>

          <div class="totals-box">
            <div class="total-row">
              <span>Crédito (+)</span>
              <span class="font-mono">{formatAmount(montoH)}</span>
            </div>
            <div class="total-row">
              <span>Débito (-)</span>
              <span class="font-mono">{formatAmount(montoD)}</span>
            </div>
            {#if montoIdb > 0}
              <div class="total-row text-amber-700">
                <span>IGTF / IDB</span>
                <span class="font-mono">{formatAmount(montoIdb)}</span>
              </div>
            {/if}
            <div class="grand-total-outline">
              <div class="bs-total">
                <span class="label">Impacto Neto</span>
                <span class="val font-mono {netoAfectacion >= 0 ? 'text-emerald-700' : 'text-red-700'}">
                  {netoAfectacion >= 0 ? "+" : "-"}{formatMoney(Math.abs(netoAfectacion))}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- PAGE INDICATOR -->
      <div class="page-footer">
        <span>Página 1 de 1</span>
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

  .watermark-anulado {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    font-size: 96px;
    font-weight: 900;
    letter-spacing: 12px;
    color: rgba(220, 38, 38, 0.12);
    transform: rotate(-30deg);
    z-index: 20;
  }

  .print-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
    z-index: 10;
  }

  .header-section {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #000;
    padding-bottom: 4px;
    margin-bottom: 6px;
  }

  .brand-info {
    display: flex;
    gap: 12px;
    max-width: 64%;
    align-items: center;
  }
  .logo-img {
    max-width: 96px;
    max-height: 52px;
    width: auto;
    object-fit: contain;
  }
  .company-details {
    display: flex;
    flex-direction: column;
  }
  .business-name {
    font-size: 14px;
    font-weight: 900;
    margin: 0 0 2px 0;
    text-transform: uppercase;
    color: #000;
    line-height: 1.15;
  }
  .fiscal-id {
    font-size: 11px;
    font-weight: 700;
    margin: 0;
    color: #1e293b;
  }
  .address {
    font-size: 10px;
    margin: 1px 0;
    color: #334155;
    line-height: 1.25;
  }

  .doc-info {
    text-align: right;
  }
  .doc-badge {
    border: 2px solid #000;
    padding: 4px 12px;
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
    font-size: 9.5px;
    color: #334155;
    line-height: 1.3;
    margin-top: 4px;
  }
  .dates p {
    margin: 1px 0;
  }
  .currency-line {
    font-size: 9.5px;
    color: #1e293b;
  }

  .info-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
    margin-bottom: 6px;
    width: 100%;
    box-sizing: border-box;
  }
  .section-title {
    font-size: 9.5px;
    font-weight: 900;
    text-transform: uppercase;
    border-bottom: 1.5px solid #cbd5e1;
    padding-bottom: 2px;
    margin-bottom: 4px;
    color: #0f172a;
    letter-spacing: 0.3px;
  }
  .client-box,
  .logistic-box {
    background: #f8fafc;
    padding: 6px 10px;
    border-radius: 5px;
    border: 1px solid #cbd5e1;
    min-width: 0;
    overflow: hidden;
    word-break: break-word;
  }
  .client-name {
    font-size: 11px;
    font-weight: 900;
    margin: 0 0 2px 0;
    text-transform: uppercase;
    color: #000;
    line-height: 1.2;
  }
  .client-rif,
  .client-address,
  .client-phone {
    font-size: 9px;
    margin: 1px 0;
    line-height: 1.25;
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
    font-size: 9px;
    margin-bottom: 2.5px;
    align-items: flex-start;
    line-height: 1.25;
  }
  .info-row .label {
    font-weight: 700;
    color: #475569;
    width: 78px;
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
    font-size: 8.5px;
    color: #0f172a;
  }
  .items-table td {
    border: 1px solid #cbd5e1;
    padding: 3px 5px;
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

  .footer-block {
    margin-top: auto;
  }
  .signatures-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 60px;
    margin-top: 4px;
    margin-bottom: 6px;
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
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    color: #0f172a;
    letter-spacing: 0.3px;
  }

  .footer-grid {
    display: grid;
    grid-template-columns: 1fr 230px;
    gap: 14px;
    align-items: start;
  }
  .remarks-content {
    font-size: 9.5px;
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
    font-size: 8.5px;
    color: #475569;
    line-height: 1.35;
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
    padding: 3px 8px;
    border-bottom: 1px solid #e2e8f0;
    font-size: 9.5px;
    font-weight: 700;
    color: #1e293b;
  }
  .grand-total-outline {
    padding: 5px 8px;
    text-align: right;
    border-top: 2px solid #000;
    background: #f8fafc;
  }
  .bs-total {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .bs-total .label {
    font-size: 8.5px;
    font-weight: 900;
    text-transform: uppercase;
    color: #475569;
    letter-spacing: 0.4px;
  }
  .bs-total .val {
    font-size: 15px;
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
