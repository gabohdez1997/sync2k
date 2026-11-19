<script lang="ts">
  import dayjs from "dayjs";
  import "dayjs/locale/es";
  import { onMount } from "svelte";

  dayjs.locale("es");

  let { data } = $props();

  const company = $derived(data.company);
  const movements = $derived<any[]>(data.movements || []);
  const filters = $derived(data.filters || {});

  function formatAmount(val: number | string) {
    return Number(val || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDateKey(val: any): string {
    if (!val) return "Sin Fecha";
    const s = String(val).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split("-");
      return `${d}/${m}/${y}`;
    }
    const parsed = dayjs(val);
    return parsed.isValid() ? parsed.format("DD/MM/YYYY") : s;
  }

  function formatFilterDate(val?: string | null) {
    if (!val) return "";
    const parsed = dayjs(val);
    return parsed.isValid() ? parsed.format("DD/MM/YYYY") : val;
  }

  const effectiveDesde = $derived.by(() => {
    if (filters.fecha_d) return formatFilterDate(filters.fecha_d);
    if (movements.length > 0) return formatDateKey(movements[0].fecha);
    return dayjs().startOf("month").format("DD/MM/YYYY");
  });

  const effectiveHasta = $derived.by(() => {
    if (filters.fecha_h) return formatFilterDate(filters.fecha_h);
    return dayjs(data.printedAt).format("DD/MM/YYYY");
  });

  const activeFilterChips = $derived.by(() => {
    const chips: string[] = [];
    if (data.selectedAccount) {
      chips.push(
        `Cuenta: ${data.selectedAccount.cod_cta} (${data.selectedAccount.des_ban})`
      );
    } else if (filters.cod_cta) {
      chips.push(`Cuenta: ${filters.cod_cta}`);
    }
    if (filters.tipo_op) chips.push(`Tipo: ${filters.tipo_op}`);
    if (filters.origen) chips.push(`Origen: ${filters.origen}`);
    if (filters.estado && filters.estado !== "all") {
      chips.push(`Estado: ${String(filters.estado).toUpperCase()}`);
    }
    if (filters.search) chips.push(`Filtro: "${filters.search}"`);
    return chips;
  });

  // Agrupar cronológicamente por fecha (estilo Profit Plus "MOVIMIENTOS DE BANCO POR FECHA")
  type ReportRow =
    | { kind: "date_header"; dateLabel: string; weight: number }
    | { kind: "movement"; mov: any; weight: number }
    | {
        kind: "subtotal";
        dateLabel: string;
        debe: number;
        haber: number;
        idb: number;
        count: number;
        weight: number;
      };

  const reportSummary = $derived.by(() => {
    const reportRows: ReportRow[] = [];
    let grandTotalDebe = 0;
    let grandTotalHaber = 0;
    let grandTotalIdb = 0;
    let activeCount = 0;
    let voidedCount = 0;

    const groupedByDate = new Map<string, any[]>();
    for (const m of movements) {
      const key = formatDateKey(m.fecha);
      if (!groupedByDate.has(key)) groupedByDate.set(key, []);
      groupedByDate.get(key)!.push(m);
    }

    for (const [dateLabel, groupMovs] of groupedByDate.entries()) {
      reportRows.push({ kind: "date_header", dateLabel, weight: 0.95 });

      let subDebe = 0;
      let subHaber = 0;
      let subIdb = 0;

      for (const m of groupMovs) {
        const isAnulado = Boolean(m.anulado);
        if (!isAnulado) {
          activeCount += 1;
          subDebe += Number(m.monto_h || 0);
          subHaber += Number(m.monto_d || 0);
          subIdb += Number(m.idb || 0);
        } else {
          voidedCount += 1;
        }

        const descLen = String(m.descrip || "").trim().length;
        const weight = descLen > 48 ? 1.45 : 1;
        reportRows.push({ kind: "movement", mov: m, weight });
      }

      grandTotalDebe += subDebe;
      grandTotalHaber += subHaber;
      grandTotalIdb += subIdb;

      reportRows.push({
        kind: "subtotal",
        dateLabel,
        debe: subDebe,
        haber: subHaber,
        idb: subIdb,
        count: groupMovs.length,
        weight: 1.05,
      });
    }

    return {
      reportRows,
      grandTotalDebe,
      grandTotalHaber,
      grandTotalIdb,
      grandSaldoNeto: grandTotalDebe - grandTotalHaber - grandTotalIdb,
      activeCount,
      voidedCount,
    };
  });

  const grandTotalDebe = $derived(reportSummary.grandTotalDebe);
  const grandTotalHaber = $derived(reportSummary.grandTotalHaber);
  const grandTotalIdb = $derived(reportSummary.grandTotalIdb);
  const grandSaldoNeto = $derived(reportSummary.grandSaldoNeto);
  const activeCount = $derived(reportSummary.activeCount);
  const voidedCount = $derived(reportSummary.voidedCount);

  // Paginación multipágina calibrada para hoja Carta (Vertical)
  const CAPACITY_WITH_TOTALS = 28;
  const CAPACITY_WITHOUT_TOTALS = 37;

  interface ReportPage {
    rows: ReportRow[];
    showTotals: boolean;
  }

  function paginateRows(allRows: ReportRow[]): ReportPage[] {
    if (allRows.length === 0) {
      return [{ rows: [], showTotals: true }];
    }

    const totalWeight = allRows.reduce((acc, r) => acc + r.weight, 0);
    if (totalWeight <= CAPACITY_WITH_TOTALS) {
      return [{ rows: allRows, showTotals: true }];
    }

    const pagesList: ReportPage[] = [];
    const remaining = [...allRows];

    while (remaining.length > 0) {
      const remWeight = remaining.reduce((acc, r) => acc + r.weight, 0);
      if (remWeight <= CAPACITY_WITH_TOTALS) {
        pagesList.push({ rows: remaining.splice(0, remaining.length), showTotals: true });
        break;
      }

      const pageRows: ReportRow[] = [];
      let currWeight = 0;

      while (remaining.length > 0) {
        const next = remaining[0];
        if (pageRows.length > 0 && currWeight + next.weight > CAPACITY_WITHOUT_TOTALS) {
          break;
        }
        // Evitar dejar un date_header huérfano al final de la página
        if (
          next.kind === "date_header" &&
          remaining[1] &&
          currWeight + next.weight + remaining[1].weight > CAPACITY_WITHOUT_TOTALS &&
          pageRows.length > 0
        ) {
          break;
        }
        pageRows.push(remaining.shift()!);
        currWeight += next.weight;
      }

      pagesList.push({ rows: pageRows, showTotals: false });
    }

    if (pagesList.length > 0 && !pagesList[pagesList.length - 1].showTotals) {
      pagesList.push({ rows: [], showTotals: true });
    }

    return pagesList;
  }

  const pages = $derived(paginateRows(reportSummary.reportRows));
  const totalPages = $derived(pages.length);

  onMount(() => {
    window.scrollTo(0, 0);
  });
</script>

<svelte:head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Movimientos de Banco por Fecha - {company.name}</title>
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
    IMPRIMIR REPORTE PDF
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
  {#each pages as pageData, pageIdx}
    <div class="page-sheet">
      <div class="print-container">
        <!-- HEADER ESTILO PROFIT PLUS / SYNC2K -->
        <div class="header-section">
          <div class="brand-info">
            {#if company.logo_url}
              <img src={company.logo_url} alt="Logo" class="logo-img" />
            {/if}
            <div class="company-details">
              <h1 class="business-name">{company.name}</h1>
              <p class="fiscal-id">R.I.F.: {company.rif || "---"} · {company.branch_name}</p>
              {#if company.address}
                <p class="address">{company.address}</p>
              {/if}
            </div>
          </div>

          <div class="report-title-center">
            <div class="report-main-title">MOVIMIENTOS DE BANCO POR FECHA</div>
            <div class="report-date-range">
              Fecha: Desde <strong>{effectiveDesde}</strong> Hasta <strong>{effectiveHasta}</strong>
            </div>
            {#if activeFilterChips.length > 0}
              <div class="report-filter-chips">
                {activeFilterChips.join(" · ")}
              </div>
            {/if}
          </div>

          <div class="meta-right">
            <div class="meta-row">
              <span>Usuario:</span>
              <strong>{data.printedBy}</strong>
            </div>
            <div class="meta-row">
              <span>Página:</span>
              <strong>{pageIdx + 1} de {totalPages}</strong>
            </div>
            <div class="meta-row">
              <span>Fecha:</span>
              <strong>{dayjs(data.printedAt).format("DD/MM/YYYY")}</strong>
            </div>
            <div class="meta-row">
              <span>Hora:</span>
              <strong>{dayjs(data.printedAt).format("hh:mm a")}</strong>
            </div>
          </div>
        </div>

        <!-- TABLA GLOBAL DE MOVIMIENTOS AGRUPADA POR FECHA -->
        <div class="table-container">
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 9.5%;" class="text-left">Número</th>
                <th style="width: 17.5%;" class="text-left">Cuenta</th>
                <th style="width: 4.5%;">Tipo</th>
                <th style="width: 9.5%;" class="text-left">Nro. Doc.</th>
                <th style="width: 4.5%;">Mon.</th>
                <th style="width: 24.5%;" class="text-left">Descripción</th>
                <th style="width: 4.5%;">Orig.</th>
                <th style="width: 9%;" class="text-right">Debe</th>
                <th style="width: 9.5%;" class="text-right">Haber</th>
                <th style="width: 7%;" class="text-right">I.G.T.F.</th>
              </tr>
            </thead>
            <tbody>
              {#if pageData.rows.length === 0 && movements.length === 0}
                <tr>
                  <td colspan="10" class="py-6 text-center text-slate-500 italic">
                    No existen movimientos bancarios registrados para los filtros seleccionados.
                  </td>
                </tr>
              {:else}
                {#each pageData.rows as row}
                  {#if row.kind === "date_header"}
                    <tr class="date-group-row">
                      <td colspan="10" class="text-left">
                        <span class="date-group-label">{row.dateLabel}</span>
                      </td>
                    </tr>
                  {:else if row.kind === "movement"}
                    {@const m = row.mov}
                    {@const debeVal = Number(m.monto_h || 0)}
                    {@const haberVal = Number(m.monto_d || 0)}
                    {@const idbVal = Number(m.idb || 0)}
                    <tr class="mov-row {m.anulado ? 'row-anulado' : ''}">
                      <td class="text-left font-mono font-bold">{m.mov_num}</td>
                      <td class="text-left font-mono">
                        <span class="font-bold">{m.cod_cta}</span>
                        <span class="cta-num">{m.num_cta || ""}</span>
                      </td>
                      <td class="font-mono font-bold">{m.tipo_op}</td>
                      <td class="text-left font-mono">{m.doc_num || "-"}</td>
                      <td class="font-mono">{m.co_mone || "BS"}</td>
                      <td class="text-left desc-cell">
                        {m.descrip || "-"}
                        {#if m.anulado}
                          <span class="badge-anulado">(ANULADO)</span>
                        {/if}
                      </td>
                      <td class="font-mono">{m.origen}</td>
                      <td class="text-right font-mono {debeVal > 0 && !m.anulado ? 'text-emerald-700 font-bold' : ''}">
                        {formatAmount(debeVal)}
                      </td>
                      <td class="text-right font-mono {haberVal > 0 && !m.anulado ? 'text-red-700 font-bold' : ''}">
                        {formatAmount(haberVal)}
                      </td>
                      <td class="text-right font-mono {idbVal > 0 && !m.anulado ? 'text-amber-700 font-bold' : ''}">
                        {formatAmount(idbVal)}
                      </td>
                    </tr>
                  {:else if row.kind === "subtotal"}
                    <tr class="subtotal-row">
                      <td colspan="7" class="text-right subtotal-label">
                        Sub-Totales ({row.dateLabel}):
                      </td>
                      <td class="text-right font-mono font-bold">{formatAmount(row.debe)}</td>
                      <td class="text-right font-mono font-bold">{formatAmount(row.haber)}</td>
                      <td class="text-right font-mono font-bold">{formatAmount(row.idb)}</td>
                    </tr>
                  {/if}
                {/each}
              {/if}
            </tbody>

            {#if pageData.showTotals && movements.length > 0}
              <tfoot>
                <tr class="grand-total-table-row">
                  <td colspan="7" class="text-right">TOTAL GENERAL ({activeCount} activos{voidedCount > 0 ? `, ${voidedCount} anulados` : ""}):</td>
                  <td class="text-right font-mono text-emerald-700">{formatAmount(grandTotalDebe)}</td>
                  <td class="text-right font-mono text-red-700">{formatAmount(grandTotalHaber)}</td>
                  <td class="text-right font-mono text-amber-700">{formatAmount(grandTotalIdb)}</td>
                </tr>
              </tfoot>
            {/if}
          </table>

          {#if !pageData.showTotals}
            <div class="continue-msg">Continúa en la siguiente página...</div>
          {/if}
        </div>

        <!-- TOTALES FINALES Y FIRMAS SOLO EN LA ÚLTIMA PÁGINA -->
        {#if pageData.showTotals}
          <div class="footer-block">
            <div class="footer-grid">
              <div class="remarks">
                <div class="signatures-section">
                  <div class="signature-box">
                    <div class="signature-line"></div>
                    <span class="signature-label">Emitido por: {data.printedBy}</span>
                  </div>
                  <div class="signature-box">
                    <div class="signature-line"></div>
                    <span class="signature-label">Revisado / Autorizado por:</span>
                  </div>
                </div>
                <div class="disclaimer">
                  <p>* Reporte global generado en Sync2K · Módulo de Bancos (Profit Plus Administrativos).</p>
                  <p>* Total registros listados: <strong>{movements.length}</strong> ({activeCount} activos, {voidedCount} anulados).</p>
                </div>
              </div>

              <div class="totals-box">
                <div class="total-row">
                  <span>Total Debe (Ingresos):</span>
                  <span class="font-mono text-emerald-700">{formatAmount(grandTotalDebe)}</span>
                </div>
                <div class="total-row">
                  <span>Total Haber (Egresos):</span>
                  <span class="font-mono text-red-700">{formatAmount(grandTotalHaber)}</span>
                </div>
                <div class="total-row">
                  <span>Total I.G.T.F. / IDB:</span>
                  <span class="font-mono text-amber-700">{formatAmount(grandTotalIdb)}</span>
                </div>
                <div class="grand-total-outline">
                  <div class="bs-total">
                    <span class="label">Saldo Neto</span>
                    <span class="val font-mono {grandSaldoNeto >= 0 ? 'text-emerald-700' : 'text-red-700'}">
                      {grandSaldoNeto < 0 ? "-" : ""}{formatAmount(Math.abs(grandSaldoNeto))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <div class="page-footer">
          <span>Página {pageIdx + 1} de {totalPages}</span>
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
    padding: 0.65cm 0.75cm 0.8cm 0.75cm;
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
    display: grid;
    grid-template-columns: 1.1fr 1.25fr 0.75fr;
    gap: 10px;
    align-items: start;
    border-bottom: 2px solid #000;
    padding-bottom: 6px;
    margin-bottom: 8px;
  }

  .brand-info {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }
  .logo-img {
    max-width: 58px;
    max-height: 44px;
    width: auto;
    object-fit: contain;
    flex-shrink: 0;
  }
  .company-details {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .business-name {
    font-size: 12px;
    font-weight: 900;
    margin: 0 0 1px 0;
    text-transform: uppercase;
    color: #000;
    line-height: 1.15;
  }
  .fiscal-id {
    font-size: 9px;
    font-weight: 700;
    margin: 0;
    color: #1e293b;
  }
  .address {
    font-size: 7.5px;
    margin: 1px 0 0 0;
    color: #475569;
    line-height: 1.2;
  }

  .report-title-center {
    text-align: center;
    padding-top: 2px;
  }
  .report-main-title {
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    color: #000;
    letter-spacing: 0.3px;
  }
  .report-date-range {
    font-size: 8.5px;
    color: #1e293b;
    margin-top: 2px;
  }
  .report-filter-chips {
    font-size: 7.5px;
    color: #475569;
    margin-top: 2px;
    font-weight: 600;
  }

  .meta-right {
    font-size: 8px;
    color: #1e293b;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .meta-row {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .meta-row span {
    color: #475569;
    font-weight: 600;
  }
  .meta-row strong {
    color: #000;
    font-weight: 800;
  }

  .table-container {
    flex: 1;
    margin-bottom: 6px;
  }
  .items-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 7.5px;
    table-layout: fixed;
  }
  .items-table th {
    background: #f1f5f9;
    border-top: 1.5px solid #000;
    border-bottom: 1.5px solid #000;
    padding: 3px 3px;
    text-transform: uppercase;
    font-weight: 900;
    font-size: 7.5px;
    color: #0f172a;
    text-align: center;
  }
  .items-table td {
    padding: 2px 3px;
    text-align: center;
    color: #000;
    vertical-align: top;
    line-height: 1.2;
  }

  .date-group-row td {
    padding-top: 5px;
    padding-bottom: 1.5px;
  }
  .date-group-label {
    font-weight: 900;
    font-size: 8px;
    color: #0f172a;
    border-bottom: 1px solid #334155;
    padding-bottom: 1px;
    display: inline-block;
  }

  .mov-row td {
    border-bottom: 1px dotted #e2e8f0;
  }
  .row-anulado td {
    color: #64748b !important;
    text-decoration: line-through;
  }
  .cta-num {
    display: block;
    font-size: 6.5px;
    color: #475569;
    word-break: break-all;
  }
  .desc-cell {
    text-transform: uppercase;
    word-break: break-word;
  }
  .badge-anulado {
    font-size: 6.5px;
    font-weight: 900;
    color: #b91c1c;
    text-decoration: none;
    display: inline-block;
    margin-left: 3px;
  }

  .subtotal-row td {
    border-top: 1px solid #000;
    padding-top: 2px;
    padding-bottom: 4px;
    font-size: 7.5px;
    background: #fafafa;
  }
  .subtotal-label {
    font-weight: 800;
    color: #334155;
    padding-right: 6px !important;
  }

  .grand-total-table-row td {
    border-top: 2px solid #000;
    border-bottom: 2px solid #000;
    background: #f1f5f9;
    padding: 4px 3px;
    font-weight: 900;
    font-size: 8px;
  }

  .text-left { text-align: left !important; }
  .text-right { text-align: right !important; }
  .font-mono { font-family: monospace; }

  .continue-msg {
    font-size: 8px;
    font-weight: bold;
    text-align: right;
    color: #64748b;
    margin-top: 4px;
    font-style: italic;
  }

  .footer-block {
    margin-top: auto;
    padding-top: 6px;
  }
  .footer-grid {
    display: grid;
    grid-template-columns: 1fr 240px;
    gap: 16px;
    align-items: end;
  }
  .signatures-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
    margin-bottom: 8px;
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
    height: 18px;
  }
  .signature-label {
    font-size: 8px;
    font-weight: 800;
    text-transform: uppercase;
    color: #0f172a;
  }
  .disclaimer {
    font-size: 7.5px;
    color: #475569;
    line-height: 1.3;
  }
  .disclaimer p { margin: 1px 0; }

  .totals-box {
    border: 1.5px solid #000;
    border-radius: 5px;
    overflow: hidden;
    background: #fff;
  }
  .total-row {
    display: flex;
    justify-content: space-between;
    padding: 3px 8px;
    border-bottom: 1px solid #e2e8f0;
    font-size: 8.5px;
    font-weight: 700;
    color: #1e293b;
  }
  .grand-total-outline {
    padding: 4px 8px;
    border-top: 1.5px solid #000;
    background: #f8fafc;
  }
  .bs-total {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .bs-total .label {
    font-size: 8px;
    font-weight: 900;
    text-transform: uppercase;
    color: #475569;
  }
  .bs-total .val {
    font-size: 12px;
    font-weight: 900;
  }

  .page-footer {
    position: absolute;
    bottom: 0.3cm;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 8px;
    font-weight: 800;
    color: #64748b;
    margin: 0 0.75cm;
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

