<script lang="ts">
  import dayjs from "dayjs";
  import "dayjs/locale/es";
  import { onMount } from "svelte";

  dayjs.locale("es");

  let { data } = $props();

  const MONTH_NAMES = [
    "",
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];

  const rec = data.reconciliation;
  const cuenta = rec?.cuenta;
  const resumen = rec?.resumen;
  const rawMovs: any[] = rec?.movimientos || [];
  const company = data.company;
  const coMone = cuenta?.co_mone || "BS";

  function isUSD(currency: string) {
    return Boolean(currency && !["BS", "BSS", "BS.", "VEF", "VES"].includes(currency.toUpperCase()));
  }

  const usdMode = isUSD(coMone);

  function formatAmount(val: number | string) {
    return Number(val || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatMoney(val: number | string) {
    return `${usdMode ? "$" : "Bs."} ${formatAmount(val)}`;
  }

  function round2(n: number) {
    return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
  }

  const conciliados = rawMovs.filter((m) => Boolean(m.conciliado));
  const pendientes = rawMovs.filter((m) => !m.conciliado);
  // Primero conciliados del mes y luego partidas en tránsito para facilitar auditoría
  const orderedMovements = [
    ...conciliados.map((m) => ({ ...m, _estadoConc: "CONCILIADO" })),
    ...pendientes.map((m) => ({ ...m, _estadoConc: "EN TRÁNSITO" })),
  ];

  const saldoFinalLibrosConc = Number(resumen?.saldo_final_conciliado || 0);
  const diffBanco =
    data.saldoBanco !== null ? round2(Number(data.saldoBanco) - saldoFinalLibrosConc) : null;

  // --- LÓGICA DE PAGINACIÓN DINÁMICA CALIBRADA (MISMO PATRÓN QUE PEDIDOS / ÓRDENES) ---
  const CAPACITY_WITH_TOTALS = 24;
  const CAPACITY_WITHOUT_TOTALS = 35;

  function getItemWeight(item: any): number {
    const desc = String(item?.descrip || "").trim();
    if (desc.length > 90) return 2.1;
    if (desc.length > 44) return 1.45;
    return 1;
  }

  function paginate(items: any[]) {
    const pages: any[] = [];
    const remaining = [...items];

    const totalWeight = remaining.reduce((acc, it) => acc + getItemWeight(it), 0);
    if (totalWeight <= CAPACITY_WITH_TOTALS) {
      return [
        {
          items: remaining,
          showTotals: true,
          emptyRowsCount: Math.max(0, Math.floor(CAPACITY_WITH_TOTALS - totalWeight)),
        },
      ];
    }

    while (remaining.length > 0) {
      const remainingWeight = remaining.reduce((acc, it) => acc + getItemWeight(it), 0);

      if (remainingWeight <= CAPACITY_WITH_TOTALS) {
        pages.push({
          items: remaining.splice(0, remaining.length),
          showTotals: true,
          emptyRowsCount: Math.max(0, Math.floor(CAPACITY_WITH_TOTALS - remainingWeight)),
        });
        break;
      }

      const pageItems: any[] = [];
      let currentWeight = 0;

      while (remaining.length > 0) {
        const nextWeight = getItemWeight(remaining[0]);
        if (pageItems.length > 0 && currentWeight + nextWeight > CAPACITY_WITHOUT_TOTALS) {
          break;
        }
        const futureRemainingWeight = remaining
          .slice(1)
          .reduce((acc, it) => acc + getItemWeight(it), 0);
        if (
          futureRemainingWeight > 0 &&
          futureRemainingWeight <= CAPACITY_WITH_TOTALS &&
          currentWeight + nextWeight >= 14
        ) {
          pageItems.push(remaining.shift());
          currentWeight += nextWeight;
          break;
        }

        currentWeight += nextWeight;
        pageItems.push(remaining.shift());
      }

      pages.push({
        items: pageItems,
        showTotals: false,
        emptyRowsCount: Math.max(0, Math.floor(CAPACITY_WITHOUT_TOTALS - currentWeight)),
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

  const pages = paginate(orderedMovements);

  onMount(() => {
    window.scrollTo(0, 0);
  });
</script>

<svelte:head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>
    Conciliación Bancaria {cuenta?.cod_cta || ""} - {MONTH_NAMES[data.mes]} {data.anio} - {company.name}
  </title>
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
    IMPRIMIR CONCILIACIÓN
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
  {#each pages as page, i}
    <div class="page-sheet">
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
              <span class="label">Conciliación Bancaria</span>
              <span class="number">{MONTH_NAMES[data.mes]} {data.anio}</span>
            </div>
            <div class="dates mt-2">
              <p>Emisión: <strong>{dayjs(data.printedAt).format("DD/MM/YYYY hh:mm A")}</strong></p>
              <p class="currency-line uppercase">
                Cuenta / Moneda: <strong>{cuenta.cod_cta} · {usdMode ? "DÓLARES (USD)" : "BOLÍVARES (BS.)"}</strong>
              </p>
            </div>
          </div>
        </div>

        <!-- ACCOUNT & SUMMARY INFO GRID -->
        <div class="info-grid">
          <div class="client-box">
            <h3 class="section-title">Datos de la Cuenta Bancaria</h3>
            <p class="client-name">{cuenta.des_ban}</p>
            <p class="client-rif">CÓDIGO: {cuenta.cod_cta} · TIPO: {cuenta.tipo_cu || "CT"}</p>
            <p class="client-address font-medium">N° DE CUENTA: {cuenta.num_cta || "No registrado"}</p>
            <p class="client-phone mt-1">
              SALDO TOTAL LIBROS: {formatMoney(resumen.saldo_total_libros)}
            </p>
          </div>
          <div class="logistic-box">
            <h3 class="section-title">Datos del Período y Operación</h3>
            <div class="info-row">
              <span class="label">Sucursal:</span>
              <span class="val text-blue-900 font-black">{company.branch_name}</span>
            </div>
            <div class="info-row">
              <span class="label">Período:</span>
              <span class="val">{MONTH_NAMES[data.mes]} {data.anio}</span>
            </div>
            <div class="info-row">
              <span class="label">Movimientos:</span>
              <span class="val">{conciliados.length} Conciliados · {pendientes.length} En Tránsito</span>
            </div>
            <div class="info-row">
              <span class="label">Elaborado:</span>
              <span class="val">{data.printedBy}</span>
            </div>
          </div>
        </div>

        <!-- MOVEMENTS TABLE -->
        <div class="table-container">
          <table class="items-table">
            <thead>
              <tr>
                <th class="col-date">Fecha</th>
                <th class="col-mov">N° Mov.</th>
                <th class="col-type">Tipo/Orig</th>
                <th class="col-ref">Referencia</th>
                <th class="col-desc">Descripción</th>
                <th class="col-status">Estatus</th>
                <th class="col-deb">Débito / IDB</th>
                <th class="col-cred">Crédito (+)</th>
              </tr>
            </thead>
            <tbody>
              {#each page.items as m}
                {@const debitTotal = Number(m.monto_d || 0) + Number(m.idb || 0)}
                {@const creditTotal = Number(m.monto_h || 0)}
                <tr>
                  <td class="whitespace-nowrap">{dayjs(m.fecha).format("DD/MM/YYYY")}</td>
                  <td class="font-mono font-bold whitespace-nowrap">{m.mov_num}</td>
                  <td class="font-mono whitespace-nowrap">{m.tipo_op}/{m.origen}</td>
                  <td class="font-mono whitespace-nowrap">{m.doc_num || "-"}</td>
                  <td class="text-left font-bold uppercase">{m.descrip || "-"}</td>
                  <td class="whitespace-nowrap font-black {m._estadoConc === 'CONCILIADO' ? 'text-emerald-700' : 'text-amber-700'}">
                    {m._estadoConc}
                  </td>
                  <td class="text-right font-mono font-bold whitespace-nowrap {debitTotal > 0 ? 'text-red-700' : 'text-slate-400'}">
                    {debitTotal > 0 ? formatAmount(debitTotal) : "-"}
                  </td>
                  <td class="text-right font-mono font-bold whitespace-nowrap {creditTotal > 0 ? 'text-emerald-700' : 'text-slate-400'}">
                    {creditTotal > 0 ? formatAmount(creditTotal) : "-"}
                  </td>
                </tr>
              {/each}
              {#if page.emptyRowsCount > 0}
                {#each Array(page.emptyRowsCount) as _}
                  <tr class="empty-row"><td colspan="8">&nbsp;</td></tr>
                {/each}
              {/if}
            </tbody>
          </table>
          {#if !page.showTotals}
            <p class="continue-msg">CONTINUA EN LA SIGUIENTE PAGINA...</p>
          {/if}
        </div>

        {#if page.showTotals}
          <!-- SUMMARY & FOOTER -->
          <div class="footer-block mt-auto">
            <div class="signatures-section">
              <div class="signature-box">
                <div class="signature-line"></div>
                <span class="signature-label">Elaborado por: {data.printedBy}</span>
              </div>
              <div class="signature-box">
                <div class="signature-line"></div>
                <span class="signature-label">Revisado / Autorizado por:</span>
              </div>
            </div>

            <div class="footer-grid">
              <div class="remarks">
                <h4 class="section-title">Partidas en Tránsito y Observaciones</h4>
                <div class="remarks-content">
                  INGRESOS EN TRÁNSITO ({pendientes.filter((p) => Number(p.monto_h || 0) > 0).length}):
                  {formatMoney(resumen.ingresos_pendientes)} | EGRESOS + IDB EN TRÁNSITO:
                  {formatMoney(Number(resumen.egresos_pendientes || 0) + Number(resumen.idb_pendientes || 0))}
                  {#if data.filteredByOwnership}
                    | FILTRADO POR USUARIO ACTUAL
                  {/if}
                </div>
                <div class="disclaimer mt-1">
                  <p>* Conciliación generada directamente desde el historial bancario de Profit Plus.</p>
                  <p>
                    * Saldo conciliado acumulado global de la cuenta:
                    <strong>{formatMoney(resumen.saldo_conciliado_global)}</strong>.
                  </p>
                </div>
              </div>

              <div class="totals-box">
                <div class="total-row">
                  <span>Saldo Inicial ({rec.periodo?.prev_mes}/{rec.periodo?.prev_anio})</span>
                  <span class="font-mono">{formatAmount(resumen.saldo_inicial_conciliado)}</span>
                </div>
                <div class="total-row text-emerald-700">
                  <span>(+) Ingresos Conciliados</span>
                  <span class="font-mono">{formatAmount(resumen.ingresos_conciliados)}</span>
                </div>
                <div class="total-row text-red-700">
                  <span>(-) Egresos Conciliados</span>
                  <span class="font-mono">- {formatAmount(resumen.egresos_conciliados)}</span>
                </div>
                {#if Number(resumen.idb_conciliados || 0) > 0}
                  <div class="total-row text-amber-700">
                    <span>(-) IDB / IGTF Conciliados</span>
                    <span class="font-mono">- {formatAmount(resumen.idb_conciliados)}</span>
                  </div>
                {/if}
                <div class="grand-total-outline">
                  <div class="bs-total">
                    <span class="label">Saldo Final Conciliado</span>
                    <span class="val font-mono">{formatMoney(saldoFinalLibrosConc)}</span>
                  </div>
                  {#if data.saldoBanco !== null}
                    <div class="usd-reference">
                      <span>Estado de Cuenta Banco</span>
                      <strong class="font-mono">{formatMoney(data.saldoBanco)}</strong>
                    </div>
                    <div class="usd-reference {Math.abs(diffBanco || 0) < 0.01 ? 'text-emerald-700' : 'text-red-700'}">
                      <span>Diferencia</span>
                      <strong class="font-mono">
                        {Math.abs(diffBanco || 0) < 0.01 ? "CUADRADO (0,00)" : formatMoney(diffBanco || 0)}
                      </strong>
                    </div>
                  {/if}
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
    font-size: 16px;
    font-weight: 900;
    color: #dc2626 !important;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    line-height: 1.15;
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
    font-size: 8px;
  }
  .items-table th {
    background: #f1f5f9;
    border: 1px solid #000;
    padding: 3px 4px;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 8px;
    color: #0f172a;
  }
  .items-table td {
    border: 1px solid #cbd5e1;
    padding: 2px 4px;
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

  .col-date { width: 8.5%; }
  .col-mov { width: 12%; }
  .col-type { width: 8.5%; }
  .col-ref { width: 10%; }
  .col-desc { width: 27%; }
  .col-status { width: 10%; }
  .col-deb { width: 12%; }
  .col-cred { width: 12%; }

  .continue-msg {
    font-size: 8px;
    font-weight: bold;
    text-align: right;
    color: #64748b;
    margin-top: 3px;
    font-style: italic;
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
    grid-template-columns: 1fr 250px;
    gap: 14px;
    align-items: start;
  }
  .remarks-content {
    font-size: 9px;
    font-weight: 700;
    background: #f8fafc;
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    min-height: 22px;
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
    font-size: 14px;
    font-weight: 900;
    color: #000;
    line-height: 1.1;
  }
  .usd-reference {
    margin-top: 3px;
    padding-top: 3px;
    border-top: 1px dashed #cbd5e1;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    font-weight: 800;
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
