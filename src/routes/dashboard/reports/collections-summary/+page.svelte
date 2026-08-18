<!-- src/routes/dashboard/reports/collections-summary/+page.svelte -->
<script lang="ts">
    import { fade, slide } from "svelte/transition";
    import {
        RefreshCw,
        AlertTriangle,
        FileSpreadsheet,
        ClipboardList,
        Wallet,
        Calendar,
        User
    } from "lucide-svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import dayjs from "dayjs";
    import "dayjs/locale/es";

    let { data } = $props();

    dayjs.locale("es");

    let isSearching = $state(false);

    // Fechas por defecto: hoy
    const today = new Date().toISOString().split('T')[0];

    // Estados
    let filterBranch = $state('all');
    let filterDate = $state(today);
    let filterType = $state('resumen'); // 'resumen' | 'detallado'

    $effect(() => {
        filterBranch = $page.url.searchParams.get("branch_id") || data.selectedBranchId || "all";
        filterDate = $page.url.searchParams.get("fecha") || today;
        filterType = $page.url.searchParams.get("tipo") || "resumen";
    });

    function applyFilters() {
        isSearching = true;
        const params = new URLSearchParams($page.url.searchParams);

        if (filterBranch && filterBranch !== "all") {
            params.set("branch_id", filterBranch);
        } else {
            params.delete("branch_id");
        }

        if (filterDate) {
            params.set("fecha", filterDate);
        } else {
            params.delete("fecha");
        }

        params.set("tipo", filterType);

        goto(`?${params.toString()}`).finally(() => {
            isSearching = false;
        });
    }

    const reportData = $derived(data.report?.data || []);
    const tasaDia = $derived(data.report?.tasa_dia || 1);

    // Grouping by User
    const groupedByUser = $derived.by(() => {
        const map = new Map();
        for (const row of reportData) {
            const uid = row.usuario;
            if (!map.has(uid)) {
                map.set(uid, {
                    usuario: uid,
                    usuario_nombre: row.usuario_nombre,
                    items: [],
                    total_bs: 0,
                    total_usd: 0
                });
            }
            const userGroup = map.get(uid);

            if (filterType === 'resumen') {
                // Agrupar por forma_pag (ignorar detalle)
                const existing = userGroup.items.find((i: any) => i.forma_pag === row.forma_pag);
                if (existing) {
                    existing.total_bs += Number(row.total_bs);
                    existing.total_usd += Number(row.total_usd);
                } else {
                    userGroup.items.push({ 
                        forma_pag: row.forma_pag, 
                        detalle: '---', 
                        total_bs: Number(row.total_bs), 
                        total_usd: Number(row.total_usd) 
                    });
                }
            } else {
                // Detallado (mantener filas originales)
                userGroup.items.push({ 
                    forma_pag: row.forma_pag, 
                    detalle: row.detalle || '---', 
                    total_bs: Number(row.total_bs), 
                    total_usd: Number(row.total_usd) 
                });
            }

            userGroup.total_bs += Number(row.total_bs);
            userGroup.total_usd += Number(row.total_usd);
        }
        return Array.from(map.values());
    });

    const stats = $derived.by(() => {
        let totalBs = 0;
        let totalUsd = 0;

        for (const userGroup of groupedByUser) {
            totalBs += userGroup.total_bs;
            totalUsd += userGroup.total_usd;
        }

        return { totalBs, totalUsd, count: groupedByUser.length };
    });

    function formatBS(val: number | string) {
        const num = Number(val);
        if (isNaN(num)) return 'Bs. 0,00';
        return (
            "Bs. " +
            num.toLocaleString("de-DE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            })
        );
    }

    function formatUSD(val: number | string) {
        const num = Number(val);
        if (isNaN(num)) return '$ 0,00';
        return (
            "$ " +
            num.toLocaleString("de-DE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            })
        );
    }

    function exportToExcel() {
        if (groupedByUser.length === 0) return;

        let csvContent = '\uFEFFsep=;\n';

        if (filterType === 'resumen') {
            csvContent += "Usuario ID;Nombre de Usuario;Forma de Pago;Total (BS);Total (USD)\n";
        } else {
            csvContent += "Usuario ID;Nombre de Usuario;Forma de Pago;Detalle (Caja/Cta/Tarj);Total (BS);Total (USD)\n";
        }

        for (const userGroup of groupedByUser) {
            const userId = `="${String(userGroup.usuario || "").trim().replace(/"/g, '""')}"`;
            const userName = `"${String(userGroup.usuario_nombre || "").trim().replace(/"/g, '""')}"`;

            for (const item of userGroup.items) {
                const formPay = `"${String(item.forma_pag || "").trim().replace(/"/g, '""')}"`;
                const detalle = `="${String(item.detalle || "").trim().replace(/"/g, '""')}"`;
                const totalBs = item.total_bs.toFixed(2).replace(".", ",");
                const totalUsd = item.total_usd.toFixed(2).replace(".", ",");

                if (filterType === 'resumen') {
                    csvContent += `${userId};${userName};${formPay};${totalBs};${totalUsd}\n`;
                } else {
                    csvContent += `${userId};${userName};${formPay};${detalle};${totalBs};${totalUsd}\n`;
                }
            }
        }

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const branchName = data.branches.find((b: any) => b.id === filterBranch)?.name || "general";
        const formattedBranch = branchName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        const filename = `resumen_cobros_${filterType}_${formattedBranch}_${dayjs().format("YYYY-MM-DD_HHmmss")}.csv`;

        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
</script>

<div class="space-y-8 print:space-y-4" in:fade>
    {#if data.error}
        <div class="glass border-red-500/20 p-6 rounded-3xl flex items-center gap-6 bg-red-500/5 shadow-xl shadow-red-500/10 print:hidden" in:slide>
            <div class="h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                <AlertTriangle size={24} />
            </div>
            <div class="flex-1">
                <h3 class="text-sm font-black text-red-500 uppercase tracking-widest mb-1">Error de Comunicación</h3>
                <p class="text-text-muted font-bold text-sm leading-relaxed">{data.error}</p>
            </div>
            <button onclick={() => window.location.reload()} class="px-5 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-xs font-black transition-all cursor-pointer">
                Reintentar
            </button>
        </div>
    {/if}

    <!-- TOP HEADER -->
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6 print:flex-row print:justify-between">
        <div class="flex flex-col gap-2">
            <h1 class="text-4xl font-black tracking-tight flex items-center gap-3 print:text-2xl">
                <Wallet size={40} class="text-brand-500 print:h-8 print:w-8" />
                Resumen de Cobros por Cajero
            </h1>
            <p class="text-text-muted text-lg print:text-xs">
                Montos cobrados por usuario. Tasa del día aplicada: <strong>{formatBS(tasaDia)}</strong>
            </p>
            <div class="hidden print:block text-[10px] text-text-muted">
                <span>Sucursal: <strong>{data.branches.find((b: any) => b.id === filterBranch)?.name || "General"}</strong></span>
                <span class="mx-2">|</span>
                <span>Fecha: <strong>{dayjs(filterDate).format("DD/MM/YYYY")}</strong></span>
                <span class="mx-2">|</span>
                <span>Tipo: <strong>{filterType.toUpperCase()}</strong></span>
                <span class="mx-2">|</span>
                <span>Generado el: <strong>{dayjs().format("DD/MM/YYYY hh:mm A")}</strong></span>
            </div>
        </div>

        <div class="flex items-center gap-3 print:hidden">
            <button
                onclick={exportToExcel}
                disabled={groupedByUser.length === 0}
                class="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-black rounded-xl shadow-lg shadow-brand-600/20 hover:shadow-brand-500/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar a Excel (XLS)"
            >
                <FileSpreadsheet size={16} />
                Exportar Excel
            </button>
        </div>
    </div>

    <!-- METRICS CARDS -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 print:grid-cols-3 print:gap-3">
        <!-- Card 1: Usuarios -->
        <div class="bg-surface-raised border border-border-subtle hover:border-brand-500/30 transition-all rounded-3xl p-5 relative overflow-hidden group print:p-3 print:rounded-xl">
            <div class="absolute right-0 top-0 w-28 h-28 bg-brand-500/5 rounded-full blur-2xl group-hover:bg-brand-500/10 transition-colors print:hidden"></div>
            <div class="flex items-center justify-between mb-3">
                <div class="p-2 rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-400 border border-brand-500/20 print:hidden">
                    <User size={20} />
                </div>
            </div>
            <p class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5 print:text-[9px]">Cajas / Usuarios</p>
            <p class="text-2xl sm:text-3xl font-black text-text-base tracking-tight print:text-lg">{stats.count}</p>
            <p class="text-[10px] text-text-muted font-bold mt-1.5 line-clamp-1">Operadores con cobros</p>
        </div>

        <!-- Card 2: Total BS -->
        <div class="bg-surface-raised border border-border-subtle hover:border-blue-500/30 transition-all rounded-3xl p-5 relative overflow-hidden group print:p-3 print:rounded-xl">
            <div class="absolute right-0 top-0 w-28 h-28 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors print:hidden"></div>
            <div class="flex items-center justify-between mb-3">
                <div class="p-2 rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 print:hidden">
                    <Wallet size={20} />
                </div>
            </div>
            <p class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5 text-blue-600 dark:text-blue-400 print:text-[9px]">Total Cobrado (BS)</p>
            <p class="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 tracking-tight print:text-lg">{formatBS(stats.totalBs)}</p>
            <p class="text-[10px] text-text-muted font-bold mt-1.5 line-clamp-1">Moneda Nacional</p>
        </div>

        <!-- Card 3: Total USD -->
        <div class="bg-surface-raised border border-border-subtle hover:border-emerald-500/30 transition-all rounded-3xl p-5 relative overflow-hidden group print:p-3 print:rounded-xl">
            <div class="absolute right-0 top-0 w-28 h-28 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors print:hidden"></div>
            <div class="flex items-center justify-between mb-3">
                <div class="p-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 print:hidden">
                    <Wallet size={20} />
                </div>
            </div>
            <p class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5 text-emerald-600 dark:text-emerald-400 print:text-[9px]">Equivalente (USD)</p>
            <p class="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight print:text-lg">{formatUSD(stats.totalUsd)}</p>
            <p class="text-[10px] text-text-muted font-bold mt-1.5 line-clamp-1">A tasa de cambio del día</p>
        </div>
    </div>

    <!-- FILTERS BAR -->
    <div class="glass p-4 rounded-3xl border border-border-subtle shadow-xl print:hidden flex flex-wrap items-end gap-4">
        {#if data.branches.length > 1}
        <div class="flex-1 min-w-[200px] flex flex-col gap-2">
            <label class="text-[10px] font-black uppercase tracking-wider text-text-muted ml-1">Sucursal</label>
            <div class="relative group">
                <select 
                    bind:value={filterBranch} 
                    onchange={applyFilters}
                    class="w-full bg-surface-base border border-border-subtle rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all appearance-none cursor-pointer group-hover:border-border-base"
                >
                    {#each data.branches as b}
                        <option value={b.id}>{b.name}</option>
                    {/each}
                </select>
            </div>
        </div>
        {/if}

        <div class="flex-1 min-w-[200px] flex flex-col gap-2">
            <label class="text-[10px] font-black uppercase tracking-wider text-text-muted ml-1">Fecha</label>
            <div class="relative">
                <Calendar size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input 
                    type="date" 
                    bind:value={filterDate} 
                    onchange={applyFilters}
                    class="w-full bg-surface-base border border-border-subtle rounded-xl pl-10 pr-4 py-3 text-sm font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all cursor-pointer"
                />
            </div>
        </div>

        <div class="flex-1 min-w-[200px] flex flex-col gap-2">
            <label class="text-[10px] font-black uppercase tracking-wider text-text-muted ml-1">Tipo de Reporte</label>
            <div class="relative group">
                <select 
                    bind:value={filterType} 
                    onchange={applyFilters}
                    class="w-full bg-surface-base border border-border-subtle rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all appearance-none cursor-pointer group-hover:border-border-base"
                >
                    <option value="resumen">Resumen (Por Forma de Pago)</option>
                    <option value="detallado">Detallado (Por Cuenta)</option>
                </select>
            </div>
        </div>
    </div>

    <!-- REPORT TABLES BY USER -->
    {#if groupedByUser.length > 0}
        <div class="space-y-6">
            {#each groupedByUser as userGroup}
                <div class="glass rounded-3xl border border-border-subtle overflow-hidden shadow-2xl relative">
                    <!-- User Header -->
                    <div class="bg-surface-soft/80 px-6 py-4 border-b border-border-subtle flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="h-8 w-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-500">
                                <User size={16} />
                            </div>
                            <div>
                                <h3 class="text-sm font-black tracking-tight text-text-base">
                                    {userGroup.usuario_nombre} <span class="text-brand-500 text-xs font-mono ml-2">({userGroup.usuario})</span>
                                </h3>
                            </div>
                        </div>
                        <div class="flex items-center gap-4 text-xs font-black">
                            <div class="text-blue-500 bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20">
                                {formatBS(userGroup.total_bs)}
                            </div>
                            <div class="text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                                {formatUSD(userGroup.total_usd)}
                            </div>
                        </div>
                    </div>

                    <!-- Items Table -->
                    <div class="overflow-x-auto w-full">
                        <table class="w-full border-collapse text-left text-sm print:text-xs">
                            <thead>
                                <tr class="bg-surface-base text-text-muted font-black uppercase tracking-wider text-[10px] print:bg-gray-100 print:text-black border-b border-border-subtle">
                                    <th class="px-6 py-3 font-black print:px-3 print:py-2 w-[30%]">Forma de Pago</th>
                                    {#if filterType === 'detallado'}
                                        <th class="px-6 py-3 font-black print:px-3 print:py-2 w-[30%]">Detalle (Caja / Cta / Tarj.)</th>
                                    {/if}
                                    <th class="px-6 py-3 font-black text-right print:px-3 print:py-2">Monto (BS)</th>
                                    <th class="px-6 py-3 font-black text-right print:px-3 print:py-2">Equivalente (USD)</th>
                                </tr>
                            </thead>
                            <tbody class="text-text-base print:divide-gray-200 print:text-black">
                                {#each userGroup.items as item}
                                    <tr class="hover:bg-surface-soft/30 transition-colors group print:hover:bg-transparent border-b border-border-subtle last:border-b-0">
                                        <td class="px-6 py-3 font-mono font-bold text-xs print:px-3 print:py-2">
                                            <span class="px-2 py-1 rounded bg-surface-strong/50 border border-border-subtle">
                                                {item.forma_pag || 'N/A'}
                                            </span>
                                        </td>
                                        {#if filterType === 'detallado'}
                                            <td class="px-6 py-3 font-mono text-xs text-text-muted print:text-black print:px-3 print:py-2">
                                                {item.detalle}
                                            </td>
                                        {/if}
                                        <td class="px-6 py-3 text-right font-bold text-blue-400 print:text-black print:px-3 print:py-2">
                                            {formatBS(item.total_bs)}
                                        </td>
                                        <td class="px-6 py-3 text-right font-black text-emerald-400 print:text-black print:px-3 print:py-2">
                                            {formatUSD(item.total_usd)}
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            {/each}
        </div>
    {:else}
        <div class="glass rounded-3xl border border-border-subtle overflow-hidden shadow-2xl relative p-16 flex justify-center">
            {#if isSearching}
                <div class="flex flex-col items-center gap-3 text-text-muted font-bold">
                    <RefreshCw size={24} class="animate-spin text-brand-500" />
                    <span>Consultando datos...</span>
                </div>
            {:else}
                <div class="flex flex-col items-center gap-2 text-text-muted font-bold">
                    <AlertTriangle size={32} class="text-amber-500/60" />
                    <span>No se encontraron cobros en la fecha seleccionada.</span>
                </div>
            {/if}
        </div>
    {/if}
</div>
