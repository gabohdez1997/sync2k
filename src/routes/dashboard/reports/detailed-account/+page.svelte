<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { 
        Wallet, FileText, Calendar, DollarSign, Clock, AlertTriangle, 
        ChevronLeft, ChevronRight, Store, Search, Filter, FileDown,
        TrendingDown, TrendingUp, CheckCircle, RefreshCw, Loader2,
        User, Eye, X, FileSpreadsheet
    } from 'lucide-svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { toast } from 'svelte-sonner';
    import SearchBar from '$lib/components/ui/SearchBar.svelte';
    import Combobox from '$lib/components/ui/Combobox.svelte';
    import dayjs from 'dayjs';
    import 'dayjs/locale/es';

    let { data } = $props();

    dayjs.locale('es');

    let isSearching = $state(false);
    let exporting = $state(false);

    // Filtros
    let filterSearch = $state('');
    let filterStatus = $state('all'); // all, vencidos, por_vencer
    let filterSede = $state('');

    $effect(() => {
        filterSearch = $page.url.searchParams.get('search') || '';
        filterStatus = $page.url.searchParams.get('status') || 'all';
        filterSede = data.selectedBranchId || '';
    });

    function applyFilters() {
        isSearching = true;
        const params = new URLSearchParams($page.url.searchParams);
        if (filterSearch) params.set('search', filterSearch); else params.delete('search');
        if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus); else params.delete('status');
        if (filterSede) params.set('branch_id', filterSede);
        params.set('page', '1');
        
        goto(`?${params.toString()}`).finally(() => {
            isSearching = false;
        });
    }

    function changePage(p: number) {
        const params = new URLSearchParams($page.url.searchParams);
        params.set('page', p.toString());
        goto(`?${params.toString()}`);
    }

    function formatCurrency(val: number, code: string = 'USD') {
        const formatter = new Intl.NumberFormat('es-VE', {
            style: 'currency',
            currency: code === 'USD' ? 'USD' : 'VES',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        return formatter.format(val);
    }

    const docTypes: Record<string, { label: string, class: string }> = {
        'FACT': { label: 'Factura', class: 'bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20' },
        'NDEB': { label: 'N/Débito', class: 'bg-purple-500/10 text-purple-500 dark:text-purple-400 border-purple-500/20' },
        'N/DB': { label: 'N/Débito', class: 'bg-purple-500/10 text-purple-500 dark:text-purple-400 border-purple-500/20' },
        'GIRO': { label: 'Giro', class: 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20' },
        'N/CR': { label: 'N/Crédito', class: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20' },
        'NCR': { label: 'N/Crédito', class: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20' },
        'IVAP': { label: 'I.V.A. P.', class: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
        'AJPA': { label: 'Ajuste P.', class: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
        'AJNA': { label: 'Ajuste N.', class: 'bg-red-500/10 text-red-400 border-red-500/20' },
        'AJNM': { label: 'Ajuste N.M.', class: 'bg-red-500/10 text-red-400 border-red-500/20' },
        'IVAN': { label: 'I.V.A. N.', class: 'bg-red-500/10 text-red-400 border-red-500/20' },
        'ISLR': { label: 'I.S.L.R.', class: 'bg-red-500/10 text-red-400 border-red-500/20' },
        'ADEL': { label: 'Adelanto', class: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20' },
        'default': { label: 'Otro', class: 'bg-gray-500/10 text-gray-500 border-gray-500/20' }
    };

    function getDocTypeBadge(type: string) {
        const t = String(type).trim().toUpperCase();
        return docTypes[t] || docTypes['default'];
    }

    let selectedClient = $state<any>(null);
    let showModal = $state(false);
    let currentPage = $state(1);
    const clientsPerPage = 12;

    let groupedClients = $derived.by(() => {
        const docs = data.report?.data || [];
        const groups: Record<string, any> = {};
        for (const doc of docs) {
            const coCli = (doc.co_cli || "").trim();
            
            if (!groups[coCli]) {
                groups[coCli] = {
                    co_cli: coCli,
                    cli_des: (doc.cli_des || 'Cliente Desconocido').trim(),
                    documents: [],
                    total_usd: 0,
                    total_bs: 0,
                    saldo_usd: 0,
                    saldo_bs: 0,
                    doc_count: 0
                };
            }
            
            const g = groups[coCli];
            g.documents.push(doc);
            g.total_usd += doc.total_usd;
            g.total_bs += doc.total_bs;
            g.saldo_usd += doc.saldo_usd;
            g.saldo_bs += doc.saldo_bs;
            g.doc_count++;
        }
        
        return Object.values(groups).sort((a: any, b: any) => b.saldo_usd - a.saldo_usd);
    });

    let paginatedClients = $derived.by(() => {
        const offset = (currentPage - 1) * clientsPerPage;
        return groupedClients.slice(offset, offset + clientsPerPage);
    });

    let totalClientPages = $derived(Math.ceil(groupedClients.length / clientsPerPage));

    $effect(() => {
        const _len = groupedClients.length;
        currentPage = 1;
    });

    function openClientDetail(client: any) {
        selectedClient = client;
        showModal = true;
    }

    function closeClientDetail() {
        showModal = false;
        setTimeout(() => { selectedClient = null; }, 300);
    }

    function exportToPDF() {
        if (!selectedClient) return;
        
        const client = selectedClient;
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast.error('No se pudo abrir la ventana de impresión. Por favor, permite las ventanas emergentes.');
            return;
        }

        const documentsHtml = client.documents.map((doc: any) => {
            const badge = getDocTypeBadge(doc.co_tipo_doc);
            const isAnulado = doc.anulado;
            const morStr = doc.vencido ? doc.dias_vencidos + ' días' : 'Al día';
            
            let origHtml = '—';
            if (doc.nro_orig && doc.nro_orig.trim()) {
                origHtml = '<strong>' + doc.nro_orig.trim() + '</strong><br/>' +
                           '<span style="font-size: 10px; color: #666;">' + (doc.doc_orig || '').trim() + '</span>';
            }

            const td_saldo_usd_and_bs = '<td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; color: ' + (doc.saldo_usd !== 0 ? '#d9534f' : '#333') + '; font-weight: bold;">' +
                '<strong>' + formatCurrency(doc.saldo_usd, 'USD') + '</strong><br/>' +
                '<span style="font-size: 10px; color: ' + (doc.saldo_usd !== 0 ? '#d9534f' : '#666') + ';">' + formatCurrency(doc.saldo_bs, 'VES') + '</span>' +
            '</td>';

            return '<tr>' +
                '<td style="padding: 8px; border-bottom: 1px solid #ddd;">' +
                    '<strong>' + doc.nro_doc + '</strong><br/>' +
                    '<span style="font-size: 10px; color: #666; border: 1px solid #ccc; padding: 1px 4px; border-radius: 3px; background: #f0f0f0;">' +
                        doc.co_tipo_doc.trim() +
                    '</span>' +
                '</td>' +
                '<td style="padding: 8px; border-bottom: 1px solid #ddd;">' + dayjs(doc.fec_emis).format('DD MMM YYYY') + '</td>' +
                '<td style="padding: 8px; border-bottom: 1px solid #ddd;">' + origHtml + '</td>' +
                '<td style="padding: 8px; border-bottom: 1px solid #ddd;">' + dayjs(doc.fec_venc).format('DD MMM YYYY') + '</td>' +
                '<td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">' +
                    '<span style="color: ' + (isAnulado ? '#d9534f' : '#5cb85c') + '; font-weight: bold; font-size: 10px;">' +
                        (isAnulado ? 'ANULADO' : 'ACTIVO') +
                    '</span>' +
                '</td>' +
                '<td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">' +
                    '<strong>' + formatCurrency(doc.total_usd, 'USD') + '</strong><br/>' +
                    '<span style="font-size: 10px; color: #666;">' + formatCurrency(doc.total_bs, 'VES') + '</span>' +
                '</td>' +
                td_saldo_usd_and_bs +
                '<td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">' +
                    '<span style="padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; background: ' + (doc.vencido ? '#f2dede' : '#dff0d8') + '; color: ' + (doc.vencido ? '#a94442' : '#3c763d') + ';">' +
                        morStr +
                    '</span>' +
                '</td>' +
            '</tr>';
        }).join('');

        const html = [
            '<html>',
            '<head>',
            '    <title>Cuenta Detallada - ' + client.cli_des + '</title>',
            '    <style>',
            '        body { font-family: \'Helvetica Neue\', Helvetica, Arial, sans-serif; color: #333; margin: 30px; }',
            '        .header { margin-bottom: 30px; border-bottom: 3px solid #222; padding-bottom: 15px; }',
            '        .header h1 { margin: 0 0 5px 0; font-size: 24px; }',
            '        .header p { margin: 0; color: #666; font-size: 12px; }',
            '        .summary-box { display: flex; gap: 20px; margin-bottom: 30px; }',
            '        .card { flex: 1; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background: #fafafa; }',
            '        .card span { font-size: 10px; text-transform: uppercase; color: #666; font-weight: bold; }',
            '        .card h3 { margin: 5px 0; font-size: 18px; }',
            '        .card p { margin: 0; font-size: 11px; color: #666; }',
            '        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }',
            '        th { padding: 10px 8px; background: #222; color: #fff; text-align: left; text-transform: uppercase; font-size: 10px; border: 1px solid #ddd; }',
            '        td { border: 1px solid #ddd; }',
            '        tr:nth-child(even) { background: #fafafa; }',
            '        @media print {',
            '            body { margin: 0; }',
            '            button { display: none; }',
            '        }',
            '    </style>',
            '</head>',
            '<body>',
            '    <div class="header">',
            '        <h1>' + client.cli_des + '</h1>',
            '        <p><strong>Código / RIF:</strong> ' + client.co_cli + ' &nbsp;|&nbsp; <strong>Fecha Emisión Reporte:</strong> ' + dayjs().format('DD/MM/YYYY HH:mm') + '</p>',
            '    </div>',
            '    ',
            '    <div class="summary-box">',
            '        <div class="card">',
            '            <span>Saldo Neto Pendiente</span>',
            '            <h3 style="color: ' + (client.saldo_usd !== 0 ? '#d9534f' : '#333') + ';">' + formatCurrency(client.saldo_usd, 'USD') + '</h3>',
            '            <p>' + formatCurrency(client.saldo_bs, 'VES') + '</p>',
            '        </div>',
            '        <div class="card">',
            '            <span>Documentos Registrados</span>',
            '            <h3>' + client.doc_count + ' asociados</h3>',
            '        </div>',
            '    </div>',
            '',
            '    <h3 style="text-transform: uppercase; font-size: 14px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Detalle de Documentos</h3>',
            '    <table>',
            '        <thead>',
            '            <tr>',
            '                <th style="width: 15%;">Documento</th>',
            '                <th style="width: 12%;">Emisión</th>',
            '                <th style="width: 15%;">Origen</th>',
            '                <th style="width: 12%;">Vencimiento</th>',
            '                <th style="text-align: center; width: 10%;">Estado</th>',
            '                <th style="text-align: right; width: 13%;">Monto Original</th>',
            '                <th style="text-align: right; width: 13%;">Saldo Pendiente</th>',
            '                <th style="text-align: center; width: 10%;">Días Mora</th>',
            '            </tr>',
            '        </thead>',
            '        <tbody>',
            documentsHtml,
            '        </tbody>',
            '    </table>',
            '    <' + 'script>',
            '        window.onload = function() {',
            '            window.print();',
            '            setTimeout(function() { window.close(); }, 500);',
            '        };',
            '    </' + 'script>',
            '</body>',
            '</html>'
        ].join('\n');

        printWindow.document.write(html);
        printWindow.document.close();
    }
</script>

<div class="space-y-8" in:fade>
    
    {#if data.error}
        <div class="glass border-red-500/20 p-6 rounded-3xl flex items-center gap-6 bg-red-500/5 shadow-xl shadow-red-500/10" in:slide>
            <div class="h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                <AlertTriangle size={24} />
            </div>
            <div class="flex-1">
                <h3 class="text-sm font-black text-red-500 uppercase tracking-widest mb-1">Error de Comunicación</h3>
                <p class="text-text-muted font-bold text-sm leading-relaxed">{data.error}</p>
            </div>
            <button onclick={() => window.location.reload()} class="px-5 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-xs font-black transition-all cursor-pointer">Reintentar</button>
        </div>
    {/if}

    <!-- TOP HEADER -->
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div class="flex flex-col gap-2">
            <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
                <FileSpreadsheet size={40} class="text-brand-500" />
                Cuenta Detallada (Historial y Documentos)
            </h1>
            <p class="text-text-muted text-lg">
                Visualización consolidada detallando créditos y débitos asociados por cliente.
            </p>
        </div>
    </div>

    <!-- METRICS CARDS -->
    {#if data.report?.metrics}
        {@const metrics = data.report.metrics}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6" in:slide>
            
            <!-- Card 1: Documentos Activos -->
            <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group">
                <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"></div>
                <div class="flex items-start justify-between">
                    <div class="space-y-2">
                        <span class="text-xs font-black uppercase tracking-widest text-text-muted">Documentos Totales</span>
                        <h2 class="text-2xl font-black text-text-base tracking-tight">{metrics.doc_count}</h2>
                        <p class="text-xs text-text-muted font-bold">Registrados en Sistema</p>
                    </div>
                    <div class="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                        <FileText size={20} />
                    </div>
                </div>
            </div>

            <!-- Card 2: Clientes Registrados -->
            <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group">
                <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-green-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"></div>
                <div class="flex items-start justify-between">
                    <div class="space-y-2">
                        <span class="text-xs font-black uppercase tracking-widest text-text-muted">Clientes Encontrados</span>
                        <h2 class="text-2xl font-black text-text-base tracking-tight">{groupedClients.length}</h2>
                        <p class="text-xs text-text-muted font-bold">Asociados a Documentos</p>
                    </div>
                    <div class="h-10 w-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500">
                        <User size={20} />
                    </div>
                </div>
            </div>

        </div>
    {/if}

    <!-- FILTERS BAR -->
    <div class="glass p-5 rounded-3xl border border-border-subtle shadow-2xl flex flex-col xl:flex-row gap-4 items-center w-full relative z-10">
        
        <!-- Sede Selector -->
        {#if data.branches && data.branches.length > 1}
            <div class="w-full xl:w-72">
                <Combobox
                    options={data.branches.map((b: any) => ({ value: b.id, label: b.name }))}
                    bind:value={filterSede}
                    placeholder="Sucursal..."
                    allLabel="Todas las Sucursales"
                    icon={Store}
                    class="w-full h-12"
                    onchange={() => applyFilters()}
                />
            </div>
        {/if}

        <!-- Status Filter -->
        <div class="w-full xl:w-64">
            <div class="relative w-full h-12 bg-surface-soft border border-border-subtle rounded-xl flex items-center px-3 group focus-within:border-brand-500/50 transition-all">
                <Clock size={16} class="text-text-muted mr-2.5 shrink-0" />
                <select 
                    bind:value={filterStatus} 
                    onchange={applyFilters}
                    class="w-full h-full bg-transparent outline-none text-sm text-text-base font-bold cursor-pointer appearance-none pr-8"
                >
                    <option value="all" class="bg-surface-raised text-text-base">Todos los Saldos</option>
                    <option value="vencidos" class="bg-surface-raised text-text-base">Vencidos (Overdue)</option>
                    <option value="por_vencer" class="bg-surface-raised text-text-base">Por Vencer (Upcoming)</option>
                </select>
                <div class="pointer-events-none absolute right-3 flex items-center text-text-muted">
                    <Filter size={14} />
                </div>
            </div>
        </div>

        <!-- Search Bar -->
        <div class="w-full xl:flex-1">
            <SearchBar 
                bind:value={filterSearch} 
                isSearching={isSearching} 
                onsubmit={applyFilters} 
                placeholder="Buscar por cliente, RIF o documento..."
                className="w-full h-12"
            />
        </div>

        <button 
            onclick={() => applyFilters()} 
            class="h-12 w-full xl:w-auto px-6 bg-surface-soft border border-border-subtle hover:bg-surface-strong text-text-base font-black rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
            <RefreshCw size={16} class={isSearching ? 'animate-spin' : ''} />
            Actualizar
        </button>

    </div>

    <!-- MAIN LIST - CLIENT CARDS GRID -->
    {#if isSearching}
        <div class="glass p-20 rounded-[32px] border border-border-subtle shadow-2xl flex flex-col items-center justify-center gap-4 min-h-[400px]">
            <Loader2 size={48} class="animate-spin text-brand-500" />
            <p class="text-base font-black text-text-muted">Consultando cuenta detallada con el agente Profit...</p>
        </div>
    {:else if groupedClients.length === 0}
        <div class="glass p-20 rounded-[32px] border border-border-subtle shadow-2xl flex flex-col items-center justify-center gap-3 text-center min-h-[400px]" in:fade>
            <CheckCircle size={56} class="text-brand-500 mb-2 animate-bounce" />
            <h3 class="text-2xl font-black text-text-base">¡Cartera 100% al Día!</h3>
            <p class="text-sm text-text-muted font-bold max-w-md">No se encontraron clientes con movimientos pendientes bajo los filtros seleccionados.</p>
        </div>
    {:else}
        <!-- Grid of Client Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" in:fade>
            {#each paginatedClients as client (client.co_cli)}
                <div class="glass p-6 rounded-3xl border border-border-subtle shadow-xl hover:border-brand-500/30 hover:shadow-brand-500/5 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
                    <div class="absolute -right-10 -top-10 w-28 h-28 bg-brand-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"></div>

                    <div class="space-y-5 relative z-10">
                        <!-- Card Header -->
                        <div class="flex items-start justify-between gap-3">
                            <div class="flex items-center gap-3 min-w-0">
                                <div class="h-10 w-10 rounded-xl flex items-center justify-center bg-brand-500/10 text-brand-500 shrink-0">
                                    <User size={20} />
                                </div>
                                <div class="flex flex-col min-w-0">
                                    <h3 class="font-black text-base tracking-tight text-text-base truncate group-hover:text-brand-400 transition-colors" title={client.cli_des}>
                                        {client.cli_des}
                                    </h3>
                                    <span class="text-[10px] text-text-muted font-mono font-black mt-0.5">{client.co_cli}</span>
                                </div>
                            </div>
                            <span class="px-2 py-1 bg-surface-soft border border-border-subtle text-[10px] font-black rounded-lg text-text-muted shrink-0">
                                {client.doc_count} {client.doc_count === 1 ? 'doc' : 'docs'}
                            </span>
                        </div>

                        <!-- Outstanding Balance -->
                        <div class="p-4 rounded-2xl bg-surface-soft border border-border-subtle space-y-1">
                            <span class="text-[10px] font-black uppercase tracking-widest text-text-muted">Saldo Neto</span>
                            <div class="flex items-baseline gap-2">
                                <span class="text-2xl font-black tracking-tight {client.saldo_usd !== 0 ? 'text-text-red' : 'text-text-green'}">
                                    {formatCurrency(client.saldo_usd, 'USD')}
                                </span>
                            </div>
                            <p class="text-xs font-bold {client.saldo_bs !== 0 ? 'text-text-red' : 'text-text-muted'}">{formatCurrency(client.saldo_bs, 'VES')}</p>
                        </div>
                    </div>

                    <!-- Card Footer Actions -->
                    <div class="mt-6 pt-4 border-t border-border-subtle flex items-center justify-end gap-3 relative z-10">
                        <button 
                            onclick={() => openClientDetail(client)}
                            class="flex items-center gap-1.5 text-xs font-black text-brand-400 hover:text-brand-300 transition-colors uppercase tracking-wider group/btn"
                        >
                            Ver Documentos
                            <Eye size={14} class="group-hover/btn:translate-x-0.5 transition-transform" />
                        </button>
                    </div>
                </div>
            {/each}
        </div>

        <!-- CLIENTS PAGINATION BAR -->
        {#if totalClientPages > 1}
            <div class="px-6 py-5 bg-surface-raised/50 backdrop-blur-md rounded-3xl border border-border-subtle shadow-xl flex items-center justify-between gap-4 mt-8" in:fade>
                <span class="text-xs font-bold text-text-muted">
                    Mostrando clientes <strong class="text-text-base font-black">{(currentPage - 1) * clientsPerPage + 1}</strong> a <strong class="text-text-base font-black">{Math.min(currentPage * clientsPerPage, groupedClients.length)}</strong> de <strong class="text-text-base font-black">{groupedClients.length}</strong> (Consolidado: {data.report?.data?.length || 0} docs)
                </span>

                <div class="flex items-center gap-1.5">
                    <button 
                        onclick={() => { if (currentPage > 1) currentPage--; }}
                        disabled={currentPage === 1}
                        class="p-2 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-text-muted hover:text-text-base transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                    >
                        <ChevronLeft size={16} />
                    </button>

                    {#each Array.from({ length: totalClientPages }, (_, i) => i + 1) as p}
                        {#if p === 1 || p === totalClientPages || (p >= currentPage - 1 && p <= currentPage + 1)}
                            <button 
                                onclick={() => currentPage = p}
                                class="h-9 w-9 rounded-xl text-xs font-black transition border {p === currentPage ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-500/20' : 'bg-surface-soft hover:bg-surface-strong border-border-subtle text-text-muted hover:text-text-base cursor-pointer'}"
                            >
                                {p}
                            </button>
                        {:else if p === currentPage - 2 || p === currentPage + 2}
                            <span class="px-1 text-text-muted text-xs font-bold">...</span>
                        {/if}
                    {/each}

                    <button 
                        onclick={() => { if (currentPage < totalClientPages) currentPage++; }}
                        disabled={currentPage === totalClientPages}
                        class="p-2 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-text-muted hover:text-text-base transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        {/if}
    {/if}

    <!-- MODAL DE DETALLES DEL CLIENTE -->
    {#if showModal && selectedClient}
        {@const client = selectedClient}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md" style="background-color: var(--modal-backdrop);" transition:fade={{ duration: 200 }}>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="fixed inset-0" onclick={closeClientDetail}></div>

            <div class="glass bg-surface-raised border border-border-subtle rounded-[32px] max-w-6xl w-full max-h-[85vh] flex flex-col shadow-2xl relative z-10 overflow-hidden" 
                 transition:slide={{ duration: 300 }}>
                
                <!-- Modal Header -->
                <div class="px-8 py-6 border-b border-border-subtle flex items-center justify-between gap-4 bg-surface-soft">
                    <div class="flex items-center gap-4 min-w-0">
                        <div class="h-12 w-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500 shrink-0">
                            <User size={24} />
                        </div>
                        <div class="flex flex-col min-w-0">
                            <span class="text-xs font-black uppercase tracking-widest text-brand-400">Cuenta Detallada</span>
                            <h2 class="text-xl font-black tracking-tight text-text-base truncate" title={client.cli_des}>
                                {client.cli_des}
                            </h2>
                            <span class="text-xs text-text-muted font-mono font-bold mt-0.5">Código / RIF: {client.co_cli}</span>
                        </div>
                    </div>
                    
                    <button 
                        onclick={closeClientDetail}
                        class="p-3 rounded-2xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base transition-all cursor-pointer"
                        aria-label="Cerrar"
                    >
                        <X size={20} />
                    </button>
                </div>

                <!-- Modal Content Scrollable -->
                <div class="p-8 overflow-y-auto space-y-8 flex-1">
                    
                    <!-- Client Quick Totals Grid -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <!-- Total outstanding -->
                        <div class="p-5 rounded-2xl bg-surface-soft border border-border-subtle space-y-1 relative overflow-hidden">
                            <span class="text-[10px] font-black uppercase tracking-widest text-text-muted">Saldo Neto (USD)</span>
                            <h3 class="text-xl font-black tracking-tight {client.saldo_usd !== 0 ? 'text-text-red' : 'text-text-green'}">
                                {formatCurrency(client.saldo_usd, 'USD')}
                            </h3>
                            <p class="text-[11px] font-bold {client.saldo_bs !== 0 ? 'text-text-red' : 'text-text-muted'}">{formatCurrency(client.saldo_bs, 'VES')}</p>
                        </div>
                        <!-- Docs count -->
                        <div class="p-5 rounded-2xl bg-surface-soft border border-border-subtle flex items-center justify-between">
                            <div>
                                <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block">Documentos Registrados</span>
                                <span class="text-xl font-black text-text-base">{client.doc_count} asociados</span>
                            </div>
                            <div class="p-3 bg-brand-500/10 text-brand-400 rounded-2xl">
                                <FileText size={24} />
                            </div>
                        </div>
                    </div>

                    <!-- Documents Table -->
                    <div class="space-y-4">
                        <h3 class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                            <FileSpreadsheet size={16} />
                            Detalle de Documentos
                        </h3>
                        
                        <div class="bg-surface-soft rounded-2xl border border-border-subtle overflow-hidden">
                            <div class="overflow-x-auto">
                                <table class="w-full text-left border-collapse">
                                    <thead>
                                        <tr class="bg-surface-strong border-b border-border-subtle text-xs font-black uppercase tracking-wider text-text-muted">
                                            <th class="px-6 py-4">Documento</th>
                                            <th class="px-6 py-4">Emisión</th>
                                            <th class="px-6 py-4">Origen</th>
                                            <th class="px-6 py-4">Vencimiento</th>
                                            <th class="px-6 py-4 text-center">Estado</th>
                                            <th class="px-6 py-4 text-right">Monto Original</th>
                                            <th class="px-6 py-4 text-right">Saldo Pendiente</th>
                                            <th class="px-6 py-4 text-center">Días Mora</th>
                                            {#if data.hasOthers}
                                                <th class="px-6 py-4 text-center">Vendedor</th>
                                            {/if}
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-border-subtle text-xs">
                                        {#each client.documents as doc (doc.nro_doc + doc.co_tipo_doc)}
                                            {@const badge = getDocTypeBadge(doc.co_tipo_doc)}
                                            <tr class="hover:bg-surface-soft transition-colors">
                                                <!-- Documento / Tipo -->
                                                <td class="px-6 py-4">
                                                    <div class="flex items-center gap-3">
                                                        <div class="p-2 rounded-lg bg-surface-soft text-text-muted">
                                                            <FileText size={14} />
                                                        </div>
                                                        <div class="flex flex-col gap-1.5">
                                                            <span class="font-black text-text-base">{doc.nro_doc}</span>
                                                            <span class="px-1.5 py-0.5 border text-[9px] font-black uppercase tracking-wider rounded text-center max-w-[70px] {badge.class}">
                                                                {doc.co_tipo_doc.trim()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                
                                                <!-- Emision -->
                                                <td class="px-6 py-4 whitespace-nowrap text-text-muted font-bold">
                                                    {dayjs(doc.fec_emis).format('DD MMM YYYY')}
                                                </td>
 
                                                <!-- Origen -->
                                                <td class="px-6 py-4 whitespace-nowrap text-text-muted">
                                                    <div class="flex flex-col gap-1.5">
                                                        {#if doc.nro_orig && doc.nro_orig.trim()}
                                                            <span class="font-black text-text-base">{doc.nro_orig.trim()}</span>
                                                            {#if doc.doc_orig && doc.doc_orig.trim()}
                                                                {@const origBadge = getDocTypeBadge(doc.doc_orig)}
                                                                <span class="px-1.5 py-0.5 border text-[9px] font-black uppercase tracking-wider rounded text-center max-w-[70px] {origBadge.class}">
                                                                    {doc.doc_orig.trim()}
                                                                </span>
                                                            {/if}
                                                        {:else}
                                                            <span class="text-text-muted/40 italic font-medium">—</span>
                                                        {/if}
                                                    </div>
                                                </td>

                                                <!-- Vencimiento -->
                                                <td class="px-6 py-4 whitespace-nowrap font-bold {doc.vencido ? 'text-text-red' : 'text-text-muted'}">
                                                    {dayjs(doc.fec_venc).format('DD MMM YYYY')}
                                                </td>

                                                <!-- Estado / Anulado -->
                                                <td class="px-6 py-4 text-center whitespace-nowrap">
                                                    {#if doc.anulado}
                                                        <span class="inline-flex items-center justify-center h-7 w-7 rounded-full bg-red-500/10 text-red-500 border border-red-500/20" title="Anulado">
                                                            <X size={14} />
                                                        </span>
                                                    {:else}
                                                        <span class="inline-flex items-center justify-center h-7 w-7 rounded-full bg-green-500/10 text-green-500 border border-green-500/20" title="Activo">
                                                            <CheckCircle size={14} />
                                                        </span>
                                                    {/if}
                                                </td>

                                                <!-- Monto Original -->
                                                <td class="px-6 py-4 text-right whitespace-nowrap font-bold">
                                                    <div class="flex flex-col items-end">
                                                        <span class="text-text-base">{formatCurrency(doc.total_usd, 'USD')}</span>
                                                        <span class="text-[9px] text-text-muted mt-0.5">{formatCurrency(doc.total_bs, 'VES')}</span>
                                                    </div>
                                                </td>

                                                <!-- Saldo Pendiente -->
                                                <td class="px-6 py-4 text-right whitespace-nowrap font-black">
                                                    <div class="flex flex-col items-end">
                                                        <span class="{doc.saldo_usd !== 0 ? 'text-text-red' : 'text-text-green'}">
                                                            {formatCurrency(doc.saldo_usd, 'USD')}
                                                        </span>
                                                        <span class="text-[9px] mt-0.5 font-bold {doc.saldo_bs !== 0 ? 'text-text-red' : 'text-text-muted'}">
                                                            {formatCurrency(doc.saldo_bs, 'VES')}
                                                        </span>
                                                    </div>
                                                </td>

                                                <!-- Mora -->
                                                <td class="px-6 py-4 text-center whitespace-nowrap">
                                                    {#if doc.vencido}
                                                        <span class="px-2 py-0.5 font-bold rounded bg-red-500/10 text-red-500 border border-red-500/20">
                                                            {doc.dias_vencidos} días
                                                        </span>
                                                    {:else}
                                                        <span class="px-2 py-0.5 font-bold rounded inline-flex items-center gap-1 bg-green-500/10 text-green-500 border border-green-500/20">
                                                            <CheckCircle size={8} />
                                                            Al día
                                                        </span>
                                                    {/if}
                                                </td>

                                                <!-- Vendedor -->
                                                {#if data.hasOthers}
                                                    <td class="px-6 py-4 text-center whitespace-nowrap font-mono font-bold text-text-muted">
                                                        {doc.co_ven}
                                                    </td>
                                                {/if}
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Modal Footer -->
                <div class="px-8 py-5 border-t border-border-subtle flex justify-end gap-3 bg-surface-soft/50 font-bold text-xs">
                    <button 
                        onclick={exportToPDF}
                        class="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-black transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-brand-500/20"
                    >
                        <FileDown size={16} />
                        Exportar PDF
                    </button>
                    <button 
                        onclick={closeClientDetail}
                        class="px-6 py-2.5 rounded-xl bg-surface-soft hover:bg-surface-strong text-sm font-black transition-all cursor-pointer"
                    >
                        Cerrar Detalle
                    </button>
                </div>
            </div>
        </div>
    {/if}

</div>

<style>
    :global(.glass) {
        background: var(--glass-bg);
        backdrop-filter: blur(var(--blur-glass));
        -webkit-backdrop-filter: blur(var(--blur-glass));
        border-color: var(--border-color);
    }
</style>
