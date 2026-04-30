<script lang="ts">
    import dayjs from "dayjs";
    import "dayjs/locale/es";
    import { onMount } from "svelte";
    import type { PageData } from "./$types";

    dayjs.locale("es");

    let { data }: { data: PageData } = $props();
    const { articles, branch, settings, filters, catalogs } = data;

    const logoUrl = branch?.logo_url || settings?.app_logo_url;
    const branchName = branch?.business_name || branch?.name || 'Empresa';

    function formatCurrency(val: number | string) {
        return Number(val).toLocaleString("de-DE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    // ── TÍTULO DESCRIPTIVO ──────────────────────────────────────────────
    function buildTitle(): string {
        let parts: string[] = [];

        if (filters.ids) {
            parts.push('Artículos Seleccionados');
        } else {
            parts.push('Artículos');
        }

        if (filters.in_stock === 'true') parts.push('Con Stock');
        else if (filters.in_stock === 'false') parts.push('Sin Stock');

        if (filters.cost_type === 'real') parts.push('Costo Real');
        else if (filters.cost_type === 'calculated') parts.push('Costo Calculado');
        else if (filters.cost_type === 'none') parts.push('Sin Costo');

        if (filters.solo_pendientes === 'true') parts.push('Por Llegar');

        if (filters.search) parts.push(`"${filters.search}"`);

        if (filters.linea && filters.linea !== 'all' && filters.linea !== 'Todas' && filters.linea !== 'null' && filters.linea !== '') {
            const ln = catalogs?.lineas?.find((l: any) => l.co_lin === filters.linea);
            if (ln) parts.push(ln.lin_des);
        }

        if (filters.categoria && filters.categoria !== 'all' && filters.categoria !== 'Todas' && filters.categoria !== 'null' && filters.categoria !== '') {
            const ct = catalogs?.categorias?.find((c: any) => c.co_cat === filters.categoria);
            if (ct) parts.push(ct.cat_des);
        }

        // Nombre de la sucursal al final
        parts.push(`Sucursal ${branch?.name || ''}`);

        return parts.join(' · ');
    }

    const reportTitle = buildTitle();

    // Detectar si algún artículo tiene factura
    const hasAnyFactura = articles.some((a: any) => a.fact_doc_num);

    // Mostrar columna "Por Llegar" si el filtro está activo
    const showPorLlegar = filters.solo_pendientes === 'true';

    // Mostrar columna "Sucursal" si es Todas las Sucursales
    const isAllBranches = data.isAllBranches === true;

    // Calcular colspan dinámico
    const totalCols = 6 + (hasAnyFactura ? 1 : 0) + (showPorLlegar ? 1 : 0) + (isAllBranches ? 1 : 0);

    // --- LÓGICA DE PAGINACIÓN ---
    const LIMIT_PER_PAGE = 50; 

    function paginate(items: any[]) {
        let pages: any[] = [];
        let remaining = [...items];
        
        while (remaining.length > 0) {
            pages.push({ 
                items: remaining.splice(0, LIMIT_PER_PAGE), 
                expectedRows: LIMIT_PER_PAGE
            });
        }
        
        if (pages.length === 0) {
            pages.push({ items: [], expectedRows: LIMIT_PER_PAGE });
        }

        return pages;
    }

    const pages = paginate(articles);

    onMount(() => {
        window.scrollTo(0, 0);
    });
</script>

<svelte:head>
    <title>{reportTitle} - {branchName}</title>
</svelte:head>

<!-- FLOATING ACTIONS (NO PRINT) -->
<div class="no-print fixed bottom-6 left-4 right-4 md:left-auto md:right-8 flex flex-col md:flex-row gap-3 pointer-events-auto z-[99999] select-none touch-manipulation">
    <button onclick={() => { window.focus(); window.print(); }}
        class="w-full md:w-auto justify-center bg-blue-600 text-white px-10 py-5 rounded-2xl font-black shadow-2xl shadow-blue-600/40 hover:bg-blue-500 transition-all active:scale-95 flex items-center gap-3 cursor-pointer">
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
    {#if data.error}
        <div class="bg-white p-8 rounded-2xl text-red-500 font-bold max-w-xl text-center">
            {data.error}
        </div>
    {:else}
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
                                <h1 class="business-name">{branchName}</h1>
                                <p class="fiscal-id">RIF: {branch?.rif || "---"}</p>
                                <p class="address">{branch?.address || ""}</p>
                                {#if branch?.phone}<p class="phone">Tel: {branch.phone}</p>{/if}
                            </div>
                        </div>

                        <div class="doc-info">
                            <div class="doc-badge">
                                <span class="label">{dayjs().format("DD/MM/YYYY HH:mm")}</span>
                                <span class="number">{articles.length} Artículos</span>
                            </div>
                        </div>
                    </div>

                    <!-- TÍTULO DEL REPORTE -->
                    <div class="report-title-bar">
                        <h2>{reportTitle}</h2>
                    </div>

                    <!-- ITEMS TABLE -->
                    <div class="table-container">
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th class="col-code">Código</th>
                                    <th class="col-desc">Descripción</th>
                                    {#if isAllBranches}
                                        <th class="col-sucu">Sucursal</th>
                                    {/if}
                                    <th class="col-num">Precio 2 ($)</th>
                                    <th class="col-num">Margen 2</th>
                                    <th class="col-num">Costo ($)</th>
                                    {#if hasAnyFactura}
                                        <th class="col-fact">Factura</th>
                                    {/if}
                                    <th class="col-stock">Exist.</th>
                                    {#if showPorLlegar}
                                        <th class="col-stock">Por Llegar</th>
                                    {/if}
                                </tr>
                            </thead>
                            <tbody>
                                {#each page.items as item}
                                    <tr>
                                        <td class="font-mono text-left">{item.co_art}</td>
                                        <td class="text-left desc-cell truncate-desc">{item.descripcion}</td>
                                        {#if isAllBranches}
                                            <td class="text-center font-bold" style="font-size: 6.5px;">{item._branch_name}</td>
                                        {/if}
                                        <td class="text-right">{formatCurrency(item.prec2 || 0)}</td>
                                        <td class="text-right">{Number(item.margen2 || 0).toFixed(2)}%</td>
                                        <td class="text-right">{formatCurrency(item.ultimo_costo_om || item.costo_estimado || 0)}</td>
                                        {#if hasAnyFactura}
                                            <td class="font-mono text-center">{item.fact_doc_num || '—'}</td>
                                        {/if}
                                        <td class="text-center font-black {item.stock_sede > 0 ? 'stock-positive' : 'stock-zero'}">{item.stock_sede || 0}</td>
                                        {#if showPorLlegar}
                                            <td class="text-center font-black por-llegar">{item.cantidad_por_llegar || 0}</td>
                                        {/if}
                                    </tr>
                                {/each}
                                {#if page.items.length < page.expectedRows}
                                    {#each Array(page.expectedRows - page.items.length) as _}
                                        <tr class="empty-row"><td colspan="{totalCols}">&nbsp;</td></tr>
                                    {/each}
                                {/if}
                            </tbody>
                        </table>
                    </div>

                    <!-- PAGE INDICATOR -->
                    <div class="page-footer">
                        <span>Página {i + 1} de {pages.length}</span>
                    </div>
                </div>
            </div>
        {/each}
    {/if}
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
        padding: 0.5cm 0.7cm;
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
        padding-bottom: 4px;
        margin-bottom: 4px;
    }

    .brand-info { display: flex; gap: 10px; max-width: 70%; }
    .logo-img { height: 45px; width: auto; object-fit: contain; }
    .business-name { font-size: 11px; font-weight: 900; margin: 0; text-transform: uppercase; }
    .fiscal-id, .address, .phone { font-size: 7.5px; margin: 1px 0; color: #333; }
    
    .doc-info { text-align: right; }
    .doc-badge { border: 2px solid #000; padding: 3px 8px; border-radius: 6px; display: flex; flex-direction: column; align-items: center; }
    .doc-badge .label { font-size: 7px; font-weight: bold; text-transform: uppercase; color: #555; }
    .doc-badge .number { font-size: 13px; font-weight: 900; color: #1e293b; }

    .report-title-bar {
        border: 1px solid #ccc;
        padding: 3px 8px;
        margin-bottom: 4px;
        border-radius: 3px;
        background: #f9fafb;
    }
    .report-title-bar h2 {
        font-size: 8px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 0;
        color: #333;
    }

    .table-container { flex: 1; }
    .items-table { width: 100%; border-collapse: collapse; font-size: 8px; }
    .items-table th { background: #f3f4f6; border: 1px solid #000; padding: 3px 4px; text-transform: uppercase; font-weight: 900; font-size: 7px; }
    .items-table td { border: 1px solid #ddd; padding: 1px 4px; text-align: center; height: 14px; }
    .items-table .empty-row td { border-left: 1px solid #ddd; border-right: 1px solid #ddd; border-bottom: none; border-top: none; }
    
    .col-code { width: 12%; text-align: left; }
    .col-desc { width: auto; text-align: left; }
    .col-sucu { width: 10%; text-align: center; }
    .col-num { width: 9%; text-align: right; }
    .col-fact { width: 10%; text-align: center; }
    .col-stock { width: 7%; text-align: center; }

    .text-left { text-align: left !important; }
    .text-right { text-align: right !important; }
    .text-center { text-align: center !important; }
    .font-mono { font-family: monospace; font-size: 7px; }
    .font-black { font-weight: 900; }
    .desc-cell { font-weight: 700; text-transform: uppercase; font-size: 7.5px; }
    .truncate-desc { max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stock-positive { color: #2563eb; }
    .stock-zero { color: #94a3b8; }
    .por-llegar { color: #d97706; }

    .page-footer { position: absolute; bottom: 0.3cm; left: 0; right: 0; text-align: center; font-size: 7px; font-weight: bold; color: #999; border-top: 1px solid #eee; padding-top: 2px; margin: 0 0.7cm; }

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
