<script lang="ts">
    import {
        Chart as ChartJS,
        Title,
        Tooltip,
        Legend,
        CategoryScale,
        LinearScale,
        LineElement,
        PointElement,
        LineController,
        Filler,
    } from "chart.js";
    import {
        Building,
        Calendar,
        AlertTriangle,
        TrendingUp,
        FileText,
        FileCheck,
        FileX,
        ClipboardList,
        ShoppingCart,
        Users,
    } from "lucide-svelte";
    import Combobox from "$lib/components/ui/Combobox.svelte";
    import { goto } from "$app/navigation";
    import { onMount, onDestroy } from "svelte";

    ChartJS.register(
        Title,
        Tooltip,
        Legend,
        CategoryScale,
        LinearScale,
        LineElement,
        PointElement,
        LineController,
        Filler,
    );

    let { data } = $props();

    let mounted = $state(false);
    let chartCanvas = $state<HTMLCanvasElement | null>(null);
    let chartInstance: ChartJS | null = null;

    let chartDocsCanvas = $state<HTMLCanvasElement | null>(null);
    let chartDocsInstance: ChartJS | null = null;

    let chartCotCanvas = $state<HTMLCanvasElement | null>(null);
    let chartCotInstance: ChartJS | null = null;

    let chartPedCanvas = $state<HTMLCanvasElement | null>(null);
    let chartPedInstance: ChartJS | null = null;

    let chartDevCanvas = $state<HTMLCanvasElement | null>(null);
    let chartDevInstance: ChartJS | null = null;

    const VENDOR_COLORS = [
        "#3b82f6", // Blue
        "#10b981", // Emerald
        "#8b5cf6", // Violet
        "#f59e0b", // Amber
        "#ec4899", // Pink
        "#06b6d4", // Cyan
        "#f97316", // Orange
        "#14b8a6", // Teal
        "#6366f1", // Indigo
        "#84cc16", // Lime
        "#e11d48", // Rose
        "#a855f7", // Purple
        "#0ea5e9", // Sky
        "#eab308", // Yellow
        "#64748b", // Slate
    ];

    // Filtros interactivos
    let startDate = $state(data.startDate);
    let endDate = $state(data.endDate);
    let selectedBranch = $state(data.branchId);
    let selectedVendedor = $state(data.selectedCoVen || "");

    // Sincronizar filtros cuando data cambie
    $effect(() => {
        startDate = data.startDate;
        endDate = data.endDate;
        selectedBranch = data.branchId;
        selectedVendedor = data.selectedCoVen || "";
    });

    // Opciones de vendedores cruzados
    const vendedoresOptions = $derived(
        (data.vendedores || []).map((v: any) => ({
            value: v.co_ven,
            label: `${(v.ven_des || v.co_ven || "").trim().toUpperCase()} (${v.total_docs} docs)`,
        })),
    );

    // Totales
    const totales = $derived(
        data.totales || {
            facturas: 0,
            devoluciones: 0,
            docs_exitosos: 0,
            cotizaciones: 0,
            pedidos: 0,
        },
    );

    const timeline = $derived(data.timeline || data.mensual || []);
    const tipoAgrupacion = $derived(data.tipoAgrupacion || "mensual");

    const maxDocsExitosos = $derived(
        timeline.length > 0
            ? Math.max(...timeline.map((m: any) => Number(m.docs_exitosos) || 0))
            : 0,
    );

    function formatNumber(val: number) {
        return val.toLocaleString("es-VE");
    }

    async function applyFilters(overrideVen?: string) {
        const params = new URLSearchParams();
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        if (selectedBranch && selectedBranch !== "default")
            params.set("branch_id", selectedBranch);

        const venToApply =
            overrideVen !== undefined ? overrideVen : selectedVendedor;
        if (venToApply) params.set("co_ven", venToApply);

        goto(`?${params.toString()}`);
    }

    function handleVendedorChange(newVen: string) {
        selectedVendedor = newVen;
        applyFilters(newVen);
    }

    function setQuickDate(days: number) {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        startDate = start.toISOString().split("T")[0];
        endDate = end.toISOString().split("T")[0];
        applyFilters();
    }

    onMount(() => {
        mounted = true;
    });

    onDestroy(() => {
        if (chartInstance) chartInstance.destroy();
        if (chartDocsInstance) chartDocsInstance.destroy();
        if (chartCotInstance) chartCotInstance.destroy();
        if (chartPedInstance) chartPedInstance.destroy();
        if (chartDevInstance) chartDevInstance.destroy();
    });

    function createVendorChart(
        canvas: HTMLCanvasElement,
        labels: string[],
        metric: "docs_exitosos" | "cotizaciones" | "pedidos" | "devoluciones",
        metricLabel: string,
    ) {
        const vList = data.vendedores || [];
        const vTimeline = data.vendedoresTimeline || [];

        const venMap = new Map<string, Map<string, number>>();
        for (const row of vTimeline) {
            const cVen = row.co_ven;
            if (!venMap.has(cVen)) {
                venMap.set(cVen, new Map());
            }
            venMap.get(cVen)!.set(row.periodo, Number(row[metric]) || 0);
        }

        const datasets = vList.map((ven: any, idx: number) => {
            const color = VENDOR_COLORS[idx % VENDOR_COLORS.length];
            const vDataMap = venMap.get(ven.co_ven);
            const dataPoints = labels.map((p) =>
                vDataMap ? vDataMap.get(p) || 0 : 0,
            );

            return {
                label: (ven.ven_des || ven.co_ven || "").trim().toUpperCase(),
                data: dataPoints,
                borderColor: color,
                backgroundColor: color,
                borderWidth: 2.2,
                pointRadius: tipoAgrupacion === "diario" ? 3 : 4,
                pointHoverRadius: tipoAgrupacion === "diario" ? 5 : 6,
                pointBackgroundColor: color,
                pointBorderColor: "#fff",
                pointBorderWidth: 1.5,
                tension: 0.35,
                fill: false,
            };
        });

        return new ChartJS(canvas, {
            type: "line",
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: "index",
                    intersect: false,
                },
                plugins: {
                    legend: {
                        position: "top",
                        labels: {
                            usePointStyle: true,
                            pointStyle: "circle",
                            padding: 12,
                            font: { size: 10, weight: "bold" },
                            boxWidth: 8,
                        },
                    },
                    tooltip: {
                        backgroundColor: "rgba(15, 15, 20, 0.95)",
                        titleFont: { size: 12, weight: "bold" },
                        bodyFont: { size: 11 },
                        padding: 10,
                        cornerRadius: 10,
                        displayColors: true,
                        itemSort: function (a, b) {
                            return (b.parsed.y || 0) - (a.parsed.y || 0);
                        },
                        filter: function (tooltipItem) {
                            return (tooltipItem.parsed.y || 0) > 0;
                        },
                        callbacks: {
                            label: function (context) {
                                const label = context.dataset.label || "";
                                const val = (
                                    context.parsed.y || 0
                                ).toLocaleString("es-VE");
                                return ` ${label}: ${val} ${metricLabel.toLowerCase()}`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10, weight: "bold" } },
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: "rgba(128, 128, 128, 0.08)" },
                        ticks: {
                            font: { size: 10 },
                            callback: function (value) {
                                return Number(value).toLocaleString();
                            },
                        },
                    },
                },
            },
        });
    }

    function getPeriodBreakdown(
        metric: "docs_exitosos" | "cotizaciones" | "pedidos" | "devoluciones",
    ) {
        const vList = data.vendedores || [];
        const vTimeline = data.vendedoresTimeline || [];
        const compLabels =
            data.periodosComparativa && data.periodosComparativa.length > 0
                ? data.periodosComparativa
                : timeline.map((m: any) => m.periodo);

        const vendorColorMap = new Map<string, string>();
        const vendorNameMap = new Map<string, string>();
        vList.forEach((v: any, idx: number) => {
            vendorColorMap.set(
                v.co_ven,
                VENDOR_COLORS[idx % VENDOR_COLORS.length],
            );
            vendorNameMap.set(
                v.co_ven,
                (v.ven_des || v.co_ven || "").trim().toUpperCase(),
            );
        });

        const periodMap = new Map<string, Map<string, number>>();
        for (const p of compLabels) {
            periodMap.set(p, new Map());
        }

        for (const row of vTimeline) {
            if (!periodMap.has(row.periodo)) {
                periodMap.set(row.periodo, new Map());
            }
            const val = Number(row[metric]) || 0;
            if (val > 0) {
                periodMap.get(row.periodo)!.set(row.co_ven, val);
            }
        }

        let grandTotal = 0;
        const periodsList = compLabels.map((p) => {
            const vMap = periodMap.get(p) || new Map();
            const vendorsInPeriod: Array<{
                co_ven: string;
                ven_des: string;
                qty: number;
                color: string;
            }> = [];
            let totalPeriod = 0;

            for (const [co_ven, qty] of vMap.entries()) {
                totalPeriod += qty;
                vendorsInPeriod.push({
                    co_ven,
                    ven_des: vendorNameMap.get(co_ven) || co_ven,
                    qty,
                    color: vendorColorMap.get(co_ven) || "#3b82f6",
                });
            }

            vendorsInPeriod.sort((a, b) => b.qty - a.qty);
            grandTotal += totalPeriod;

            return {
                periodo: p,
                total: totalPeriod,
                vendors: vendorsInPeriod,
            };
        });

        const maxPeriodTotal =
            periodsList.length > 0
                ? Math.max(...periodsList.map((p) => p.total))
                : 0;

        return {
            periods: periodsList,
            maxPeriodTotal,
            grandTotal,
        };
    }

    const breakdownDocs = $derived(getPeriodBreakdown("docs_exitosos"));
    const breakdownCot = $derived(getPeriodBreakdown("cotizaciones"));
    const breakdownPed = $derived(getPeriodBreakdown("pedidos"));
    const breakdownDev = $derived(getPeriodBreakdown("devoluciones"));

    // Chart reactivo principal y comparativos
    $effect(() => {
        if (!mounted) return;

        // 1. Gráfica principal
        if (chartCanvas && timeline.length) {
            if (chartInstance) {
                chartInstance.destroy();
                chartInstance = null;
            }

            const labels = timeline.map((m: any) => m.periodo);

            chartInstance = new ChartJS(chartCanvas, {
                type: "line",
                data: {
                    labels,
                    datasets: [
                        {
                            label: "Docs. Exitosos",
                            data: timeline.map((m: any) => m.docs_exitosos),
                            borderColor: "#22c55e",
                            backgroundColor: "rgba(34, 197, 94, 0.08)",
                            borderWidth: 3,
                            pointRadius: tipoAgrupacion === "diario" ? 3.5 : 5,
                            pointHoverRadius:
                                tipoAgrupacion === "diario" ? 6 : 8,
                            pointBackgroundColor: "#22c55e",
                            pointBorderColor: "#fff",
                            pointBorderWidth: 2,
                            tension: 0.35,
                            fill: true,
                        },
                        {
                            label: "Cotizaciones",
                            data: timeline.map((m: any) => m.cotizaciones),
                            borderColor: "#3b82f6",
                            backgroundColor: "rgba(59, 130, 246, 0.06)",
                            borderWidth: 2.5,
                            pointRadius: tipoAgrupacion === "diario" ? 2.5 : 4,
                            pointHoverRadius:
                                tipoAgrupacion === "diario" ? 5 : 7,
                            pointBackgroundColor: "#3b82f6",
                            pointBorderColor: "#fff",
                            pointBorderWidth: 2,
                            tension: 0.35,
                            fill: true,
                        },
                        {
                            label: "Pedidos",
                            data: timeline.map((m: any) => m.pedidos),
                            borderColor: "#a855f7",
                            backgroundColor: "rgba(168, 85, 247, 0.06)",
                            borderWidth: 2.5,
                            pointRadius: tipoAgrupacion === "diario" ? 2.5 : 4,
                            pointHoverRadius:
                                tipoAgrupacion === "diario" ? 5 : 7,
                            pointBackgroundColor: "#a855f7",
                            pointBorderColor: "#fff",
                            pointBorderWidth: 2,
                            tension: 0.35,
                            fill: true,
                        },
                        {
                            label: "Devoluciones",
                            data: timeline.map((m: any) => m.devoluciones),
                            borderColor: "#ef4444",
                            backgroundColor: "rgba(239, 68, 68, 0.06)",
                            borderWidth: 2,
                            pointRadius: tipoAgrupacion === "diario" ? 2.5 : 4,
                            pointHoverRadius:
                                tipoAgrupacion === "diario" ? 5 : 7,
                            pointBackgroundColor: "#ef4444",
                            pointBorderColor: "#fff",
                            pointBorderWidth: 2,
                            tension: 0.35,
                            fill: true,
                            borderDash: [6, 3],
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: "index",
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            position: "top",
                            labels: {
                                usePointStyle: true,
                                pointStyle: "circle",
                                padding: 20,
                                font: { size: 12, weight: "bold" },
                            },
                        },
                        tooltip: {
                            backgroundColor: "rgba(15, 15, 20, 0.95)",
                            titleFont: { size: 13, weight: "bold" },
                            bodyFont: { size: 12 },
                            padding: 14,
                            cornerRadius: 12,
                            displayColors: true,
                            callbacks: {
                                label: function (context) {
                                    const label = context.dataset.label || "";
                                    const val = (
                                        context.parsed.y || 0
                                    ).toLocaleString();
                                    return ` ${label}: ${val}`;
                                },
                            },
                        },
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false,
                            },
                            ticks: {
                                font: { size: 11, weight: "bold" },
                            },
                        },
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: "rgba(128, 128, 128, 0.08)",
                            },
                            ticks: {
                                font: { size: 11 },
                                callback: function (value) {
                                    return Number(value).toLocaleString();
                                },
                            },
                        },
                    },
                },
            });
        }

        // 2. Gráficas comparativas por vendedor
        const compLabels =
            data.periodosComparativa && data.periodosComparativa.length > 0
                ? data.periodosComparativa
                : timeline.map((m: any) => m.periodo);

        if (compLabels.length > 0 && (data.vendedores || []).length > 0) {
            if (chartDocsCanvas) {
                if (chartDocsInstance) chartDocsInstance.destroy();
                chartDocsInstance = createVendorChart(
                    chartDocsCanvas,
                    compLabels,
                    "docs_exitosos",
                    "Docs. Exitosos",
                );
            }
            if (chartCotCanvas) {
                if (chartCotInstance) chartCotInstance.destroy();
                chartCotInstance = createVendorChart(
                    chartCotCanvas,
                    compLabels,
                    "cotizaciones",
                    "Cotizaciones",
                );
            }
            if (chartPedCanvas) {
                if (chartPedInstance) chartPedInstance.destroy();
                chartPedInstance = createVendorChart(
                    chartPedCanvas,
                    compLabels,
                    "pedidos",
                    "Pedidos",
                );
            }
            if (chartDevCanvas) {
                if (chartDevInstance) chartDevInstance.destroy();
                chartDevInstance = createVendorChart(
                    chartDevCanvas,
                    compLabels,
                    "devoluciones",
                    "Devoluciones",
                );
            }
        }
    });
</script>

<svelte:head>
    <title>Rendimiento de Vendedores | Gestor</title>
</svelte:head>

<div class="p-6 md:p-8 space-y-8 animate-fade-in pb-32">
    <!-- HEADER -->
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div class="space-y-2">
            <h1
                class="text-3xl md:text-5xl font-black text-text-base tracking-tight flex items-center gap-3"
            >
                <TrendingUp size={40} class="text-brand-500 shrink-0" />
                Rendimiento de Vendedores
            </h1>
            <p class="text-text-muted text-sm max-w-2xl">
                Resumen temporal y comparativo de documentos de venta: facturas exitosas,
                cotizaciones, pedidos y devoluciones según el rango de fechas y vendedor seleccionado.
            </p>
        </div>
    </div>

    <!-- FILTROS PRINCIPALES -->
    <div
        class="bg-surface-base border border-border-subtle rounded-[32px] p-6 shadow-xl space-y-4"
    >
        <div
            class="flex flex-col xl:flex-row gap-4 items-stretch xl:items-center justify-between"
        >
            <!-- Select de Sucursal -->
            <div class="w-full xl:w-80 shrink-0">
                <Combobox
                    options={(data.branches || []).map((b: any) => ({
                        value: b.id,
                        label: b.name,
                    }))}
                    bind:value={selectedBranch}
                    placeholder="Sucursal por defecto"
                    allLabel="Predeterminada"
                    icon={Building}
                    buttonClass="h-12"
                />
            </div>

            <!-- Fechas, Atajos y Botón Calcular -->
            <div
                class="flex flex-wrap lg:flex-nowrap gap-3 items-center w-full xl:w-auto justify-end"
            >
                <div
                    class="flex items-center gap-2 bg-surface-raised border border-border-subtle rounded-2xl px-3 h-12 w-full sm:w-auto min-w-[250px] flex-1 lg:flex-initial"
                >
                    <Calendar size={16} class="text-text-muted shrink-0" />
                    <input
                        type="date"
                        bind:value={startDate}
                        class="bg-transparent border-0 text-text-base focus:outline-none text-xs cursor-pointer font-bold w-full"
                    />
                    <span class="text-text-muted font-bold text-xs shrink-0"
                        >a</span
                    >
                    <input
                        type="date"
                        bind:value={endDate}
                        class="bg-transparent border-0 text-text-base focus:outline-none text-xs cursor-pointer font-bold w-full"
                    />
                </div>

                <div
                    class="flex items-center gap-1 bg-surface-raised border border-border-subtle rounded-2xl p-1 shrink-0 overflow-x-auto"
                >
                    <button
                        type="button"
                        onclick={() => setQuickDate(7)}
                        class="px-3 py-1.5 text-xs font-bold rounded-xl hover:bg-surface-soft text-text-muted hover:text-text-base transition-colors cursor-pointer"
                        >7d</button
                    >
                    <button
                        type="button"
                        onclick={() => setQuickDate(30)}
                        class="px-3 py-1.5 text-xs font-bold rounded-xl hover:bg-surface-soft text-text-muted hover:text-text-base transition-colors cursor-pointer"
                        >30d</button
                    >
                    <button
                        type="button"
                        onclick={() => setQuickDate(90)}
                        class="px-3 py-1.5 text-xs font-bold rounded-xl hover:bg-surface-soft text-text-muted hover:text-text-base transition-colors cursor-pointer"
                        >90d</button
                    >
                    <button
                        type="button"
                        onclick={() => setQuickDate(180)}
                        class="px-3 py-1.5 text-xs font-bold rounded-xl hover:bg-surface-soft text-text-muted hover:text-text-base transition-colors cursor-pointer"
                        >6m</button
                    >
                    <button
                        type="button"
                        onclick={() => setQuickDate(365)}
                        class="px-3 py-1.5 text-xs font-bold rounded-xl hover:bg-surface-soft text-text-muted hover:text-text-base transition-colors cursor-pointer"
                        >1a</button
                    >
                </div>

                <button
                    type="button"
                    onclick={() => applyFilters()}
                    class="h-12 px-8 rounded-2xl bg-brand-500 text-white font-black hover:scale-105 transition-all shadow-[0_0_20px_rgba(var(--brand-500-rgb),0.3)] w-full sm:w-auto shrink-0 cursor-pointer"
                >
                    Calcular
                </button>
            </div>
        </div>
    </div>

    {#if data.error}
        <div
            class="bg-red-500/10 border border-red-500/30 text-red-500 p-6 rounded-2xl flex items-start gap-4"
        >
            <AlertTriangle size={24} class="shrink-0 mt-1" />
            <div>
                <h3 class="font-bold text-lg mb-1">
                    Error al procesar el reporte
                </h3>
                <p class="text-sm opacity-80">{data.error}</p>
            </div>
        </div>
    {:else}
        <!-- CARDS RESUMEN -->
        <div
            class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5"
        >
            <!-- Docs Exitosos -->
            <div
                class="bg-surface-raised border border-border-subtle hover:border-green-500/40 transition-all rounded-3xl p-5 relative overflow-hidden group"
            >
                <div
                    class="absolute right-0 top-0 w-28 h-28 bg-green-500/5 rounded-full blur-2xl group-hover:bg-green-500/10 transition-colors"
                ></div>
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="p-2 rounded-xl bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20"
                    >
                        <FileCheck size={20} />
                    </div>
                    <span
                        class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20"
                    >
                        Fact - Dev
                    </span>
                </div>
                <p
                    class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5"
                >
                    Docs. Exitosos
                </p>
                <p
                    class="text-2xl sm:text-3xl font-black text-green-700 dark:text-green-400"
                >
                    {formatNumber(totales.docs_exitosos)}
                </p>
                <p class="text-[10px] text-text-muted mt-1.5 line-clamp-1">
                    Facturas menos devoluciones en el período.
                </p>
            </div>

            <!-- Cotizaciones -->
            <div
                class="bg-surface-raised border border-border-subtle hover:border-blue-500/40 transition-all rounded-3xl p-5 relative overflow-hidden group"
            >
                <div
                    class="absolute right-0 top-0 w-28 h-28 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors"
                ></div>
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="p-2 rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                    >
                        <ClipboardList size={20} />
                    </div>
                    <span
                        class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                    >
                        Cotizaciones
                    </span>
                </div>
                <p
                    class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5"
                >
                    Cotizaciones
                </p>
                <p
                    class="text-2xl sm:text-3xl font-black text-blue-700 dark:text-blue-400"
                >
                    {formatNumber(totales.cotizaciones)}
                </p>
                <p class="text-[10px] text-text-muted mt-1.5 line-clamp-1">
                    Cotizaciones emitidas en el período.
                </p>
            </div>

            <!-- Pedidos -->
            <div
                class="bg-surface-raised border border-border-subtle hover:border-purple-500/40 transition-all rounded-3xl p-5 relative overflow-hidden group"
            >
                <div
                    class="absolute right-0 top-0 w-28 h-28 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-colors"
                ></div>
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="p-2 rounded-xl bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20"
                    >
                        <ShoppingCart size={20} />
                    </div>
                    <span
                        class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20"
                    >
                        Pedidos
                    </span>
                </div>
                <p
                    class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5"
                >
                    Pedidos
                </p>
                <p
                    class="text-2xl sm:text-3xl font-black text-purple-700 dark:text-purple-400"
                >
                    {formatNumber(totales.pedidos)}
                </p>
                <p class="text-[10px] text-text-muted mt-1.5 line-clamp-1">
                    Pedidos de venta en el período.
                </p>
            </div>

            <!-- Devoluciones -->
            <div
                class="bg-surface-raised border border-border-subtle hover:border-red-500/40 transition-all rounded-3xl p-5 relative overflow-hidden group"
            >
                <div
                    class="absolute right-0 top-0 w-28 h-28 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-colors"
                ></div>
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="p-2 rounded-xl bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20"
                    >
                        <FileX size={20} />
                    </div>
                    <span
                        class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20"
                    >
                        Dev. Clientes
                    </span>
                </div>
                <p
                    class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5"
                >
                    Devoluciones
                </p>
                <p
                    class="text-2xl sm:text-3xl font-black text-red-700 dark:text-red-400"
                >
                    {formatNumber(totales.devoluciones)}
                </p>
                <p class="text-[10px] text-text-muted mt-1.5 line-clamp-1">
                    Devoluciones de clientes en el período.
                </p>
            </div>
        </div>

        <!-- LINE CHART: Documentos Mensuales/Semanales/Diarios + Filtro de Vendedor -->
        <div
            class="bg-surface-raised border border-border-subtle rounded-3xl p-6 shadow-xl"
        >
            <div
                class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
            >
                <div class="space-y-1">
                    <h2
                        class="text-lg font-black text-text-base flex items-center gap-2 flex-wrap"
                    >
                        <FileText size={20} class="text-brand-500 shrink-0" />
                        {#if tipoAgrupacion === 'diario'}
                            Documentos Diarios
                        {:else if tipoAgrupacion === 'semanal'}
                            Documentos Semanales
                        {:else}
                            Documentos Mensuales
                        {/if}
                        <span
                            class="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20"
                        >
                            Vista {tipoAgrupacion === 'diario' ? 'Diaria' : tipoAgrupacion === 'semanal' ? 'Semanal' : 'Mensual'}
                        </span>
                        {#if selectedVendedor}
                            {@const currVen = (data.vendedores || []).find(
                                (v: any) => v.co_ven === selectedVendedor,
                            )}
                            <span
                                class="text-xs font-bold text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full border border-brand-500/20"
                            >
                                {currVen ? currVen.ven_des : selectedVendedor}
                            </span>
                        {/if}
                    </h2>
                    <p class="text-text-muted text-xs">
                        {#if selectedVendedor}
                            Evolución {tipoAgrupacion === 'diario' ? 'diaria' : tipoAgrupacion === 'semanal' ? 'semanal' : 'mensual'} histórica de documentos del
                            vendedor seleccionado.
                        {:else}
                            Evolución {tipoAgrupacion === 'diario' ? 'diaria (días con actividad)' : tipoAgrupacion === 'semanal' ? 'semanal' : 'mensual'} de facturas exitosas,
                            cotizaciones, pedidos y devoluciones (Todos los
                            vendedores).
                        {/if}
                    </p>
                </div>

                <!-- SELECTOR DE VENDEDORES EN EL TÍTULO DE LA GRÁFICA -->
                {#if (data.vendedores || []).length > 0}
                    <div class="w-full sm:w-80 shrink-0">
                        <Combobox
                            options={vendedoresOptions}
                            bind:value={selectedVendedor}
                            onchange={handleVendedorChange}
                            placeholder="Todos los Vendedores"
                            allLabel="Todos los Vendedores"
                            icon={Users}
                            buttonClass="h-11 text-xs"
                        />
                    </div>
                {/if}
            </div>

            {#if timeline.length === 0}
                <div
                    class="flex flex-col items-center justify-center py-16 text-text-muted"
                >
                    <FileText size={48} class="opacity-30 mb-4" />
                    <p class="text-sm font-bold">
                        No hay datos para el rango o vendedor seleccionado
                    </p>
                    <p class="text-xs opacity-60 mt-1">
                        Intenta seleccionar un rango de fechas más amplio o
                        cambiar de vendedor.
                    </p>
                </div>
            {:else}
                <div class="relative w-full" style="height: 400px;">
                    <canvas bind:this={chartCanvas}></canvas>
                </div>

                <!-- CARDS DETALLE INTEGRADO DEBAJO DE LA GRÁFICA -->
                <div
                    class="mt-6 pt-5 border-t border-border-subtle/60 space-y-3"
                >
                    <div class="flex items-center justify-between">
                        <span
                            class="text-xs font-black uppercase tracking-wider text-text-muted"
                        >
                            Detalle {tipoAgrupacion === 'diario' ? 'Diario' : tipoAgrupacion === 'semanal' ? 'Semanal' : 'Mensual'} del Período
                            {#if selectedVendedor}
                                (Filtrado por Vendedor)
                            {/if}
                        </span>
                        <span
                            class="text-[10px] text-text-muted font-medium lg:hidden"
                        >
                            ← Desliza para ver todos los períodos →
                        </span>
                    </div>

                    <div class="w-full overflow-x-auto custom-scrollbar pb-2">
                        <div class="flex gap-2.5 min-w-full">
                            {#each timeline as m}
                                {@const isMax =
                                    Number(m.docs_exitosos) ===
                                        maxDocsExitosos && maxDocsExitosos > 0}
                                <div
                                    class="flex-1 min-w-[110px] sm:min-w-[125px] p-3 rounded-2xl border transition-all relative {isMax
                                        ? 'bg-emerald-500/15 border-emerald-500/60 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/10'
                                        : 'bg-surface-base/80 border-border-subtle/70 hover:border-border-subtle'}"
                                >
                                    {#if isMax}
                                        <div
                                            class="absolute -top-2 right-2 px-1.5 py-0.5 bg-emerald-500 text-[8px] font-black uppercase text-white rounded-full shadow"
                                        ></div>
                                    {/if}
                                    <span
                                        class="text-[11px] font-black text-text-base block truncate mb-2 pb-1 border-b border-border-subtle/50 text-center uppercase tracking-wider"
                                    >
                                        {m.periodo}
                                    </span>
                                    <div
                                        class="space-y-1.5 text-[10px] font-mono"
                                    >
                                        <div
                                            class="flex items-center justify-between gap-1 text-emerald-600 dark:text-emerald-400 font-bold"
                                            title="Documentos Exitosos (Facturas - Devoluciones)"
                                        >
                                            <span
                                                class="text-text-muted font-semibold text-[9px]"
                                                >Docs :</span
                                            >
                                            <span
                                                >{formatNumber(
                                                    m.docs_exitosos,
                                                )}</span
                                            >
                                        </div>
                                        <div
                                            class="flex items-center justify-between gap-1 text-text-base font-bold"
                                            title="Facturas Emitidas"
                                        >
                                            <span
                                                class="text-text-muted font-semibold text-[9px]"
                                                >Fact :</span
                                            >
                                            <span
                                                >{formatNumber(
                                                    m.facturas,
                                                )}</span
                                            >
                                        </div>
                                        <div
                                            class="flex items-center justify-between gap-1 text-blue-600 dark:text-blue-400 font-bold"
                                            title="Cotizaciones"
                                        >
                                            <span
                                                class="text-text-muted font-semibold text-[9px]"
                                                >Cot :</span
                                            >
                                            <span
                                                >{formatNumber(
                                                    m.cotizaciones,
                                                )}</span
                                            >
                                        </div>
                                        <div
                                            class="flex items-center justify-between gap-1 text-purple-600 dark:text-purple-400 font-bold"
                                            title="Pedidos"
                                        >
                                            <span
                                                class="text-text-muted font-semibold text-[9px]"
                                                >Ped :</span
                                            >
                                            <span
                                                >{formatNumber(m.pedidos)}</span
                                            >
                                        </div>
                                        <div
                                            class="flex items-center justify-between gap-1 {m.devoluciones >
                                            0
                                                ? 'text-red-500 font-bold'
                                                : 'text-text-muted/60'}"
                                            title="Devoluciones de Clientes"
                                        >
                                            <span
                                                class="text-text-muted font-semibold text-[9px]"
                                                >Dev :</span
                                            >
                                            <span
                                                >{formatNumber(
                                                    m.devoluciones,
                                                )}</span
                                            >
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            {/if}
        </div>

        <!-- SECCIÓN COMPARATIVA DE VENDEDORES (4 GRÁFICAS) -->
        <div class="space-y-6 pt-6 border-t border-border-subtle/80">
            <div
                class="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
                <div class="space-y-1">
                    <h2
                        class="text-xl sm:text-2xl font-black text-text-base flex items-center gap-2.5 flex-wrap"
                    >
                        <Users size={26} class="text-brand-500 shrink-0" />
                        Comparativa por Vendedor
                        <span
                            class="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20"
                        >
                            Vista {tipoAgrupacion === 'diario'
                                ? 'Diaria'
                                : tipoAgrupacion === 'semanal'
                                  ? 'Semanal'
                                  : 'Mensual'}
                        </span>
                    </h2>
                    <p class="text-text-muted text-xs">
                        Comparación temporal de cada vendedor según tipo de
                        documento. Haz clic en el nombre de un vendedor en la
                        leyenda para ocultarlo o destacarlo.
                    </p>
                </div>
                {#if (data.vendedores || []).length > 0}
                    <div
                        class="flex items-center gap-2 bg-surface-raised px-3.5 py-1.5 rounded-2xl border border-border-subtle shrink-0 self-start sm:self-auto"
                    >
                        <span
                            class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
                        ></span>
                        <span class="text-xs font-bold text-text-muted">
                            {(data.vendedores || []).length} vendedores con actividad
                        </span>
                    </div>
                {/if}
            </div>

            {#if (data.vendedores || []).length === 0}
                <div
                    class="bg-surface-raised border border-border-subtle rounded-3xl p-12 text-center text-text-muted space-y-2"
                >
                    <Users size={40} class="opacity-30 mx-auto mb-2" />
                    <p class="text-sm font-bold">
                        No hay datos de vendedores para el rango seleccionado
                    </p>
                    <p class="text-xs opacity-60">
                        Prueba ajustando el rango de fechas.
                    </p>
                </div>
            {:else}
                <div class="space-y-8">
                    <!-- 1. Documentos Exitosos (100% Ancho) -->
                    <div
                        class="bg-surface-raised border border-border-subtle hover:border-emerald-500/40 transition-all rounded-3xl p-6 sm:p-7 shadow-xl space-y-6"
                    >
                        <div
                            class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle/60 pb-4"
                        >
                            <div class="flex items-center gap-3">
                                <div
                                    class="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                >
                                    <FileCheck size={22} />
                                </div>
                                <div>
                                    <h3
                                        class="text-base sm:text-lg font-black text-text-base flex items-center gap-2"
                                    >
                                        Documentos Exitosos por Vendedor
                                    </h3>
                                    <p class="text-xs text-text-muted">
                                        Evolución de facturas menos devoluciones
                                        por cada vendedor en el período.
                                    </p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 self-start sm:self-auto">
                                <span
                                    class="text-[11px] font-mono font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20"
                                >
                                    Total: {formatNumber(breakdownDocs.grandTotal)}
                                </span>
                                <span
                                    class="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-surface-soft text-text-muted border border-border-subtle"
                                >
                                    Fact - Dev
                                </span>
                            </div>
                        </div>

                        <div class="relative w-full" style="height: 380px;">
                            <canvas bind:this={chartDocsCanvas}></canvas>
                        </div>

                        <!-- CARDS DE LEYENDA AGRUPADAS POR TEMPORALIDAD CON VENDEDORES -->
                        <div class="pt-5 border-t border-border-subtle/60 space-y-3">
                            <div class="flex items-center justify-between">
                                <span
                                    class="text-xs font-black uppercase tracking-wider text-text-muted flex items-center gap-2"
                                >
                                    Detalle {tipoAgrupacion === 'diario'
                                        ? 'Diario'
                                        : tipoAgrupacion === 'semanal'
                                          ? 'Semanal'
                                          : 'Mensual'} por Vendedor (Docs. Exitosos)
                                </span>
                                <span
                                    class="text-[10px] text-text-muted font-medium lg:hidden"
                                >
                                    ← Desliza para ver todos los períodos →
                                </span>
                            </div>

                            <div class="w-full overflow-x-auto custom-scrollbar pb-2">
                                <div class="flex gap-2.5 min-w-full">
                                    {#each breakdownDocs.periods as p}
                                        {@const isMax =
                                            p.total === breakdownDocs.maxPeriodTotal &&
                                            breakdownDocs.maxPeriodTotal > 0}
                                        <div
                                            class="flex-1 min-w-[170px] sm:min-w-[200px] p-3 rounded-2xl border transition-all flex flex-col justify-between {isMax
                                                ? 'bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/20'
                                                : 'bg-surface-base/80 border-border-subtle/70 hover:border-border-subtle'}"
                                        >
                                            <div
                                                class="flex items-center justify-between gap-1 mb-2 pb-1.5 border-b border-border-subtle/50"
                                            >
                                                <span
                                                    class="text-[11px] font-black text-text-base block truncate uppercase tracking-wider"
                                                >
                                                    {p.periodo}
                                                </span>
                                                <span
                                                    class="text-[11px] font-mono font-black text-emerald-500 shrink-0"
                                                >
                                                    {formatNumber(p.total)}
                                                </span>
                                            </div>

                                            <!-- Listado de vendedores en el período -->
                                            <div
                                                class="space-y-1.5 text-xs flex-1"
                                            >
                                                {#if p.vendors.length === 0}
                                                    <p
                                                        class="text-[10px] text-text-muted/50 italic text-center py-2"
                                                    >
                                                        0 documentos
                                                    </p>
                                                {:else}
                                                    {#each p.vendors as ven}
                                                        <div
                                                            class="flex items-center justify-between gap-1.5 text-[10px]"
                                                        >
                                                            <div
                                                                class="flex items-center gap-1.5 min-w-0"
                                                            >
                                                                <span
                                                                    class="w-2 h-2 rounded-full shrink-0 shadow-sm"
                                                                    style="background-color: {ven.color}"
                                                                ></span>
                                                                <span
                                                                    class="font-bold text-text-base truncate"
                                                                    title="{ven.ven_des} ({ven.co_ven})"
                                                                >
                                                                    {ven.ven_des}
                                                                </span>
                                                            </div>
                                                            <span
                                                                class="font-mono font-black text-text-base shrink-0"
                                                            >
                                                                {formatNumber(
                                                                    ven.qty,
                                                                )}
                                                            </span>
                                                        </div>
                                                    {/each}
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 2. Cotizaciones (100% Ancho) -->
                    <div
                        class="bg-surface-raised border border-border-subtle hover:border-blue-500/40 transition-all rounded-3xl p-6 sm:p-7 shadow-xl space-y-6"
                    >
                        <div
                            class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle/60 pb-4"
                        >
                            <div class="flex items-center gap-3">
                                <div
                                    class="p-2.5 rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20"
                                >
                                    <ClipboardList size={22} />
                                </div>
                                <div>
                                    <h3
                                        class="text-base sm:text-lg font-black text-text-base flex items-center gap-2"
                                    >
                                        Cotizaciones por Vendedor
                                    </h3>
                                    <p class="text-xs text-text-muted">
                                        Cotizaciones emitidas por cada vendedor en
                                        el período.
                                    </p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 self-start sm:self-auto">
                                <span
                                    class="text-[11px] font-mono font-bold text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20"
                                >
                                    Total: {formatNumber(breakdownCot.grandTotal)}
                                </span>
                                <span
                                    class="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-surface-soft text-text-muted border border-border-subtle"
                                >
                                    Cotizaciones
                                </span>
                            </div>
                        </div>

                        <div class="relative w-full" style="height: 380px;">
                            <canvas bind:this={chartCotCanvas}></canvas>
                        </div>

                        <!-- CARDS DE LEYENDA AGRUPADAS POR TEMPORALIDAD CON VENDEDORES -->
                        <div class="pt-5 border-t border-border-subtle/60 space-y-3">
                            <div class="flex items-center justify-between">
                                <span
                                    class="text-xs font-black uppercase tracking-wider text-text-muted flex items-center gap-2"
                                >
                                    Detalle {tipoAgrupacion === 'diario'
                                        ? 'Diario'
                                        : tipoAgrupacion === 'semanal'
                                          ? 'Semanal'
                                          : 'Mensual'} por Vendedor (Cotizaciones)
                                </span>
                                <span
                                    class="text-[10px] text-text-muted font-medium lg:hidden"
                                >
                                    ← Desliza para ver todos los períodos →
                                </span>
                            </div>

                            <div class="w-full overflow-x-auto custom-scrollbar pb-2">
                                <div class="flex gap-2.5 min-w-full">
                                    {#each breakdownCot.periods as p}
                                        {@const isMax =
                                            p.total === breakdownCot.maxPeriodTotal &&
                                            breakdownCot.maxPeriodTotal > 0}
                                        <div
                                            class="flex-1 min-w-[170px] sm:min-w-[200px] p-3 rounded-2xl border transition-all flex flex-col justify-between {isMax
                                                ? 'bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/20'
                                                : 'bg-surface-base/80 border-border-subtle/70 hover:border-border-subtle'}"
                                        >
                                            <div
                                                class="flex items-center justify-between gap-1 mb-2 pb-1.5 border-b border-border-subtle/50"
                                            >
                                                <span
                                                    class="text-[11px] font-black text-text-base block truncate uppercase tracking-wider"
                                                >
                                                    {p.periodo}
                                                </span>
                                                <span
                                                    class="text-[11px] font-mono font-black text-blue-500 shrink-0"
                                                >
                                                    {formatNumber(p.total)}
                                                </span>
                                            </div>

                                            <!-- Listado de vendedores en el período -->
                                            <div
                                                class="space-y-1.5 text-xs flex-1"
                                            >
                                                {#if p.vendors.length === 0}
                                                    <p
                                                        class="text-[10px] text-text-muted/50 italic text-center py-2"
                                                    >
                                                        0 cotizaciones
                                                    </p>
                                                {:else}
                                                    {#each p.vendors as ven}
                                                        <div
                                                            class="flex items-center justify-between gap-1.5 text-[10px]"
                                                        >
                                                            <div
                                                                class="flex items-center gap-1.5 min-w-0"
                                                            >
                                                                <span
                                                                    class="w-2 h-2 rounded-full shrink-0 shadow-sm"
                                                                    style="background-color: {ven.color}"
                                                                ></span>
                                                                <span
                                                                    class="font-bold text-text-base truncate"
                                                                    title="{ven.ven_des} ({ven.co_ven})"
                                                                >
                                                                    {ven.ven_des}
                                                                </span>
                                                            </div>
                                                            <span
                                                                class="font-mono font-black text-text-base shrink-0"
                                                            >
                                                                {formatNumber(
                                                                    ven.qty,
                                                                )}
                                                            </span>
                                                        </div>
                                                    {/each}
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 3. Pedidos (100% Ancho) -->
                    <div
                        class="bg-surface-raised border border-border-subtle hover:border-purple-500/40 transition-all rounded-3xl p-6 sm:p-7 shadow-xl space-y-6"
                    >
                        <div
                            class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle/60 pb-4"
                        >
                            <div class="flex items-center gap-3">
                                <div
                                    class="p-2.5 rounded-2xl bg-purple-500/10 text-purple-500 border border-purple-500/20"
                                >
                                    <ShoppingCart size={22} />
                                </div>
                                <div>
                                    <h3
                                        class="text-base sm:text-lg font-black text-text-base flex items-center gap-2"
                                    >
                                        Pedidos por Vendedor
                                    </h3>
                                    <p class="text-xs text-text-muted">
                                        Pedidos generados por cada vendedor en el
                                        período.
                                    </p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 self-start sm:self-auto">
                                <span
                                    class="text-[11px] font-mono font-bold text-purple-500 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20"
                                >
                                    Total: {formatNumber(breakdownPed.grandTotal)}
                                </span>
                                <span
                                    class="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-surface-soft text-text-muted border border-border-subtle"
                                >
                                    Pedidos
                                </span>
                            </div>
                        </div>

                        <div class="relative w-full" style="height: 380px;">
                            <canvas bind:this={chartPedCanvas}></canvas>
                        </div>

                        <!-- CARDS DE LEYENDA AGRUPADAS POR TEMPORALIDAD CON VENDEDORES -->
                        <div class="pt-5 border-t border-border-subtle/60 space-y-3">
                            <div class="flex items-center justify-between">
                                <span
                                    class="text-xs font-black uppercase tracking-wider text-text-muted flex items-center gap-2"
                                >
                                    Detalle {tipoAgrupacion === 'diario'
                                        ? 'Diario'
                                        : tipoAgrupacion === 'semanal'
                                          ? 'Semanal'
                                          : 'Mensual'} por Vendedor (Pedidos)
                                </span>
                                <span
                                    class="text-[10px] text-text-muted font-medium lg:hidden"
                                >
                                    ← Desliza para ver todos los períodos →
                                </span>
                            </div>

                            <div class="w-full overflow-x-auto custom-scrollbar pb-2">
                                <div class="flex gap-2.5 min-w-full">
                                    {#each breakdownPed.periods as p}
                                        {@const isMax =
                                            p.total === breakdownPed.maxPeriodTotal &&
                                            breakdownPed.maxPeriodTotal > 0}
                                        <div
                                            class="flex-1 min-w-[170px] sm:min-w-[200px] p-3 rounded-2xl border transition-all flex flex-col justify-between {isMax
                                                ? 'bg-purple-500/10 border-purple-500/50 ring-1 ring-purple-500/20'
                                                : 'bg-surface-base/80 border-border-subtle/70 hover:border-border-subtle'}"
                                        >
                                            <div
                                                class="flex items-center justify-between gap-1 mb-2 pb-1.5 border-b border-border-subtle/50"
                                            >
                                                <span
                                                    class="text-[11px] font-black text-text-base block truncate uppercase tracking-wider"
                                                >
                                                    {p.periodo}
                                                </span>
                                                <span
                                                    class="text-[11px] font-mono font-black text-purple-500 shrink-0"
                                                >
                                                    {formatNumber(p.total)}
                                                </span>
                                            </div>

                                            <!-- Listado de vendedores en el período -->
                                            <div
                                                class="space-y-1.5 text-xs flex-1"
                                            >
                                                {#if p.vendors.length === 0}
                                                    <p
                                                        class="text-[10px] text-text-muted/50 italic text-center py-2"
                                                    >
                                                        0 pedidos
                                                    </p>
                                                {:else}
                                                    {#each p.vendors as ven}
                                                        <div
                                                            class="flex items-center justify-between gap-1.5 text-[10px]"
                                                        >
                                                            <div
                                                                class="flex items-center gap-1.5 min-w-0"
                                                            >
                                                                <span
                                                                    class="w-2 h-2 rounded-full shrink-0 shadow-sm"
                                                                    style="background-color: {ven.color}"
                                                                ></span>
                                                                <span
                                                                    class="font-bold text-text-base truncate"
                                                                    title="{ven.ven_des} ({ven.co_ven})"
                                                                >
                                                                    {ven.ven_des}
                                                                </span>
                                                            </div>
                                                            <span
                                                                class="font-mono font-black text-text-base shrink-0"
                                                            >
                                                                {formatNumber(
                                                                    ven.qty,
                                                                )}
                                                            </span>
                                                        </div>
                                                    {/each}
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 4. Devoluciones (100% Ancho) -->
                    <div
                        class="bg-surface-raised border border-border-subtle hover:border-red-500/40 transition-all rounded-3xl p-6 sm:p-7 shadow-xl space-y-6"
                    >
                        <div
                            class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle/60 pb-4"
                        >
                            <div class="flex items-center gap-3">
                                <div
                                    class="p-2.5 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20"
                                >
                                    <FileX size={22} />
                                </div>
                                <div>
                                    <h3
                                        class="text-base sm:text-lg font-black text-text-base flex items-center gap-2"
                                    >
                                        Devoluciones por Vendedor
                                    </h3>
                                    <p class="text-xs text-text-muted">
                                        Devoluciones de clientes registradas por
                                        cada vendedor en el período.
                                    </p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 self-start sm:self-auto">
                                <span
                                    class="text-[11px] font-mono font-bold text-red-500 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20"
                                >
                                    Total: {formatNumber(breakdownDev.grandTotal)}
                                </span>
                                <span
                                    class="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-surface-soft text-text-muted border border-border-subtle"
                                >
                                    Devoluciones
                                </span>
                            </div>
                        </div>

                        <div class="relative w-full" style="height: 380px;">
                            <canvas bind:this={chartDevCanvas}></canvas>
                        </div>

                        <!-- CARDS DE LEYENDA AGRUPADAS POR TEMPORALIDAD CON VENDEDORES -->
                        <div class="pt-5 border-t border-border-subtle/60 space-y-3">
                            <div class="flex items-center justify-between">
                                <span
                                    class="text-xs font-black uppercase tracking-wider text-text-muted flex items-center gap-2"
                                >
                                    Detalle {tipoAgrupacion === 'diario'
                                        ? 'Diario'
                                        : tipoAgrupacion === 'semanal'
                                          ? 'Semanal'
                                          : 'Mensual'} por Vendedor (Devoluciones)
                                </span>
                                <span
                                    class="text-[10px] text-text-muted font-medium lg:hidden"
                                >
                                    ← Desliza para ver todos los períodos →
                                </span>
                            </div>

                            <div class="w-full overflow-x-auto custom-scrollbar pb-2">
                                <div class="flex gap-2.5 min-w-full">
                                    {#each breakdownDev.periods as p}
                                        {@const isMax =
                                            p.total === breakdownDev.maxPeriodTotal &&
                                            breakdownDev.maxPeriodTotal > 0}
                                        <div
                                            class="flex-1 min-w-[170px] sm:min-w-[200px] p-3 rounded-2xl border transition-all flex flex-col justify-between {isMax
                                                ? 'bg-red-500/10 border-red-500/50 ring-1 ring-red-500/20'
                                                : 'bg-surface-base/80 border-border-subtle/70 hover:border-border-subtle'}"
                                        >
                                            <div
                                                class="flex items-center justify-between gap-1 mb-2 pb-1.5 border-b border-border-subtle/50"
                                            >
                                                <span
                                                    class="text-[11px] font-black text-text-base block truncate uppercase tracking-wider"
                                                >
                                                    {p.periodo}
                                                </span>
                                                <span
                                                    class="text-[11px] font-mono font-black text-red-500 shrink-0"
                                                >
                                                    {formatNumber(p.total)}
                                                </span>
                                            </div>

                                            <!-- Listado de vendedores en el período -->
                                            <div
                                                class="space-y-1.5 text-xs flex-1"
                                            >
                                                {#if p.vendors.length === 0}
                                                    <p
                                                        class="text-[10px] text-text-muted/50 italic text-center py-2"
                                                    >
                                                        0 devoluciones
                                                    </p>
                                                {:else}
                                                    {#each p.vendors as ven}
                                                        <div
                                                            class="flex items-center justify-between gap-1.5 text-[10px]"
                                                        >
                                                            <div
                                                                class="flex items-center gap-1.5 min-w-0"
                                                            >
                                                                <span
                                                                    class="w-2 h-2 rounded-full shrink-0 shadow-sm"
                                                                    style="background-color: {ven.color}"
                                                                ></span>
                                                                <span
                                                                    class="font-bold text-text-base truncate"
                                                                    title="{ven.ven_des} ({ven.co_ven})"
                                                                >
                                                                    {ven.ven_des}
                                                                </span>
                                                            </div>
                                                            <span
                                                                class="font-mono font-black text-text-base shrink-0"
                                                            >
                                                                {formatNumber(
                                                                    ven.qty,
                                                                )}
                                                            </span>
                                                        </div>
                                                    {/each}
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    {/if}
</div>
