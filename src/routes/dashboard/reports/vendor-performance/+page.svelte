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
        Percent,
        Truck,
        Scissors,
        EyeOff,
        PackageSearch,
        PackagePlus,
        FileSpreadsheet,
        Award,
        Search,
        BarChart2,
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

    let compChartCanvas = $state<HTMLCanvasElement | null>(null);
    let compChartInstance: ChartJS | null = null;

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

    // Estados de visibilidad de vendedores por cada gráfica
    let visibleVendorsDocs = $state<Set<string>>(new Set());
    let visibleVendorsDev = $state<Set<string>>(new Set());
    let visibleVendorsPctDev = $state<Set<string>>(new Set());
    let visibleVendorsPed = $state<Set<string>>(new Set());
    let visibleVendorsCot = $state<Set<string>>(new Set());
    let visibleVendorsFletes = $state<Set<string>>(new Set());
    let visibleVendorsCortes = $state<Set<string>>(new Set());
    let visibleVendorsArt = $state<Set<string>>(new Set());
    let visibleVendorsArtPed = $state<Set<string>>(new Set());
    let visibleVendorsArtCot = $state<Set<string>>(new Set());
    let lastData: any = null;

    $effect(() => {
        if (data !== lastData) {
            lastData = data;
            const vList = data.vendedores || [];
            const activeVendors = vList.filter((v: any) => !v.inactivo);
            const activeKeys = (activeVendors.length > 0 ? activeVendors : vList).map((v: any) => v.co_ven);
            visibleVendorsDocs = new Set(activeKeys);
            visibleVendorsDev = new Set(activeKeys);
            visibleVendorsPctDev = new Set(activeKeys);
            visibleVendorsPed = new Set(activeKeys);
            visibleVendorsCot = new Set(activeKeys);
            visibleVendorsFletes = new Set(activeKeys);
            visibleVendorsCortes = new Set(activeKeys);
            visibleVendorsArt = new Set(activeKeys);
            visibleVendorsArtPed = new Set(activeKeys);
            visibleVendorsArtCot = new Set(activeKeys);
        }
    });

    const vendorColorMap = $derived.by(() => {
        const map = new Map<string, string>();
        const list = data.vendedores || [];
        list.forEach((v: any, idx: number) => {
            map.set(v.co_ven, VENDOR_COLORS[idx % VENDOR_COLORS.length]);
        });
        return map;
    });

    function toggleVendorDocs(coVen: string) {
        const next = new Set(visibleVendorsDocs);
        if (next.has(coVen)) next.delete(coVen); else next.add(coVen);
        visibleVendorsDocs = next;
    }
    function selectAllDocs() {
        visibleVendorsDocs = new Set((data.vendedores || []).map((v: any) => v.co_ven));
    }
    function deselectAllDocs() {
        visibleVendorsDocs = new Set();
    }

    function toggleVendorDev(coVen: string) {
        const next = new Set(visibleVendorsDev);
        if (next.has(coVen)) next.delete(coVen); else next.add(coVen);
        visibleVendorsDev = next;
    }
    function selectAllDev() {
        visibleVendorsDev = new Set((data.vendedores || []).map((v: any) => v.co_ven));
    }
    function deselectAllDev() {
        visibleVendorsDev = new Set();
    }

    function toggleVendorPctDev(coVen: string) {
        const next = new Set(visibleVendorsPctDev);
        if (next.has(coVen)) next.delete(coVen); else next.add(coVen);
        visibleVendorsPctDev = next;
    }
    function selectAllPctDev() {
        visibleVendorsPctDev = new Set((data.vendedores || []).map((v: any) => v.co_ven));
    }
    function deselectAllPctDev() {
        visibleVendorsPctDev = new Set();
    }

    function toggleVendorPed(coVen: string) {
        const next = new Set(visibleVendorsPed);
        if (next.has(coVen)) next.delete(coVen); else next.add(coVen);
        visibleVendorsPed = next;
    }
    function selectAllPed() {
        visibleVendorsPed = new Set((data.vendedores || []).map((v: any) => v.co_ven));
    }
    function deselectAllPed() {
        visibleVendorsPed = new Set();
    }

    function toggleVendorCot(coVen: string) {
        const next = new Set(visibleVendorsCot);
        if (next.has(coVen)) next.delete(coVen); else next.add(coVen);
        visibleVendorsCot = next;
    }
    function selectAllCot() {
        visibleVendorsCot = new Set((data.vendedores || []).map((v: any) => v.co_ven));
    }
    function deselectAllCot() {
        visibleVendorsCot = new Set();
    }

    function toggleVendorFletes(coVen: string) {
        const next = new Set(visibleVendorsFletes);
        if (next.has(coVen)) next.delete(coVen); else next.add(coVen);
        visibleVendorsFletes = next;
    }
    function selectAllFletes() {
        visibleVendorsFletes = new Set((data.vendedores || []).map((v: any) => v.co_ven));
    }
    function deselectAllFletes() {
        visibleVendorsFletes = new Set();
    }

    function toggleVendorCortes(coVen: string) {
        const next = new Set(visibleVendorsCortes);
        if (next.has(coVen)) next.delete(coVen); else next.add(coVen);
        visibleVendorsCortes = next;
    }
    function selectAllCortes() {
        visibleVendorsCortes = new Set((data.vendedores || []).map((v: any) => v.co_ven));
    }
    function deselectAllCortes() {
        visibleVendorsCortes = new Set();
    }

    function toggleVendorArt(coVen: string) {
        const next = new Set(visibleVendorsArt);
        if (next.has(coVen)) next.delete(coVen); else next.add(coVen);
        visibleVendorsArt = next;
    }
    function selectAllArt() {
        visibleVendorsArt = new Set((data.vendedores || []).map((v: any) => v.co_ven));
    }
    function deselectAllArt() {
        visibleVendorsArt = new Set();
    }

    function toggleVendorArtPed(coVen: string) {
        const next = new Set(visibleVendorsArtPed);
        if (next.has(coVen)) next.delete(coVen); else next.add(coVen);
        visibleVendorsArtPed = next;
    }
    function selectAllArtPed() {
        visibleVendorsArtPed = new Set((data.vendedores || []).map((v: any) => v.co_ven));
    }
    function deselectAllArtPed() {
        visibleVendorsArtPed = new Set();
    }

    function toggleVendorArtCot(coVen: string) {
        const next = new Set(visibleVendorsArtCot);
        if (next.has(coVen)) next.delete(coVen); else next.add(coVen);
        visibleVendorsArtCot = next;
    }
    function selectAllArtCot() {
        visibleVendorsArtCot = new Set((data.vendedores || []).map((v: any) => v.co_ven));
    }
    function deselectAllArtCot() {
        visibleVendorsArtCot = new Set();
    }

    // Filtros interactivos
    let startDate = $state(data.startDate);
    let endDate = $state(data.endDate);
    let selectedBranch = $state(data.branchId);
    let selectedVendedor = $state(data.selectedCoVen || "");
    
    // Buscadores individuales por cada tabla de ranking
    let vendorFilterSearchDocs = $state("");
    let vendorFilterSearchDev = $state("");
    let vendorFilterSearchPctDev = $state("");
    let vendorFilterSearchPed = $state("");
    let vendorFilterSearchCot = $state("");
    let vendorFilterSearchFletes = $state("");
    let vendorFilterSearchCortes = $state("");
    let vendorFilterSearch = $state("");
    let vendorFilterSearchPedArt = $state("");
    let vendorFilterSearchCotArt = $state("");

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
            label: `${(v.ven_des || v.co_ven || "").trim().toUpperCase()} (${v.total_docs} docs)${v.inactivo ? " [INACTIVO]" : ""}`,
        })),
    );

    // Totales y Ranking
    const totales = $derived(
        data.totales || {
            facturas: 0,
            devoluciones: 0,
            docs_exitosos: 0,
            cotizaciones: 0,
            pedidos: 0,
            fletes: 0,
            cortes: 0,
            art_distintos: 0,
            art_pedidos: 0,
            art_cotizados: 0
        },
    );

    const rankingList = $derived(data.rankingVendedores || []);
    const rankingArtPedidos = $derived(data.rankingArtPedidos || []);
    const rankingArtCotizados = $derived(data.rankingArtCotizados || []);
    const totalArticulosActivos = $derived(data.totalArticulosActivos || 0);
    const totalArticulosDistintosGlobal = $derived(data.totalArticulosDistintosGlobal || 0);
    const totalArtPedidosGlobal = $derived(data.totalArtPedidosGlobal || 0);
    const totalArtCotizadosGlobal = $derived(data.totalArtCotizadosGlobal || 0);

    // Resumen acumulado de todo el rango por cada vendedor
    const vendorRankingSummary = $derived.by(() => {
        const map = new Map<string, {
            co_ven: string;
            ven_des: string;
            inactivo: boolean;
            docs_exitosos: number;
            facturas: number;
            devoluciones: number;
            pedidos: number;
            cotizaciones: number;
            fletes: number;
            cortes: number;
            pct_dev: number;
        }>();

        const vList = data.vendedores || [];
        vList.forEach((v: any) => {
            map.set(v.co_ven, {
                co_ven: v.co_ven,
                ven_des: (v.ven_des || v.co_ven).trim().toUpperCase(),
                inactivo: !!v.inactivo,
                docs_exitosos: 0,
                facturas: 0,
                devoluciones: 0,
                pedidos: 0,
                cotizaciones: 0,
                fletes: 0,
                cortes: 0,
                pct_dev: 0
            });
        });

        const vTimeline = data.vendedoresTimeline || [];
        for (const row of vTimeline) {
            const item = map.get(row.co_ven);
            if (item) {
                item.docs_exitosos += (Number(row.docs_exitosos) || 0);
                item.facturas += (Number(row.facturas) || 0);
                item.devoluciones += (Number(row.devoluciones) || 0);
                item.pedidos += (Number(row.pedidos) || 0);
                item.cotizaciones += (Number(row.cotizaciones) || 0);
                item.fletes += (Number(row.fletes) || 0);
                item.cortes += (Number(row.cortes) || 0);
            }
        }

        for (const item of map.values()) {
            if (item.docs_exitosos > 0) {
                item.pct_dev = Number(((item.devoluciones / item.docs_exitosos) * 100).toFixed(2));
            } else if (item.devoluciones > 0) {
                item.pct_dev = 100;
            } else {
                item.pct_dev = 0;
            }
        }

        return Array.from(map.values());
    });

    const rankingDocs = $derived([...vendorRankingSummary].sort((a, b) => b.docs_exitosos - a.docs_exitosos));
    const rankingDev = $derived([...vendorRankingSummary].sort((a, b) => b.devoluciones - a.devoluciones));
    const rankingPctDev = $derived([...vendorRankingSummary].sort((a, b) => b.pct_dev - a.pct_dev || b.devoluciones - a.devoluciones));
    const rankingPed = $derived([...vendorRankingSummary].sort((a, b) => b.pedidos - a.pedidos));
    const rankingCot = $derived([...vendorRankingSummary].sort((a, b) => b.cotizaciones - a.cotizaciones));
    const rankingFletes = $derived([...vendorRankingSummary].sort((a, b) => b.fletes - a.fletes));
    const rankingCortes = $derived([...vendorRankingSummary].sort((a, b) => b.cortes - a.cortes));

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
        if (compChartInstance) compChartInstance.destroy();
    });

    function createVendorChart(
        canvas: HTMLCanvasElement,
        labels: string[],
        metric: "docs_exitosos" | "cotizaciones" | "pedidos" | "devoluciones" | "fletes" | "cortes" | "art_distintos" | "art_pedidos" | "art_cotizados",
        metricLabel: string,
        visibleSet: Set<string>,
    ) {
        const vList = (data.vendedores || []).filter((v: any) => visibleSet.has(v.co_ven));
        const vTimeline = data.vendedoresTimeline || [];

        const venMap = new Map<string, Map<string, number>>();
        for (const row of vTimeline) {
            const cVen = row.co_ven;
            if (!venMap.has(cVen)) {
                venMap.set(cVen, new Map());
            }
            venMap.get(cVen)!.set(row.periodo, Number(row[metric]) || 0);
        }

        const datasets = vList.map((ven: any) => {
            const idx = (data.vendedores || []).findIndex((v: any) => v.co_ven === ven.co_ven);
            const color = VENDOR_COLORS[idx >= 0 ? idx % VENDOR_COLORS.length : 0];
            const vDataMap = venMap.get(ven.co_ven);
            const dataPoints = labels.map((p) =>
                vDataMap ? vDataMap.get(p) || 0 : 0,
            );

            return {
                label: (ven.ven_des || ven.co_ven || "").trim().toUpperCase(),
                data: dataPoints,
                borderColor: color,
                backgroundColor: color + "20",
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
                        display: false,
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
                                const unit = metric === "art_distintos" ? " artículos" : ` ${metricLabel.toLowerCase()}`;
                                return ` ${label}: ${val}${unit}`;
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
        metric: "docs_exitosos" | "cotizaciones" | "pedidos" | "devoluciones" | "fletes" | "cortes",
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

    function createVendorPctChart(
        canvas: HTMLCanvasElement,
        labels: string[],
        visibleSet: Set<string>,
    ) {
        const vList = (data.vendedores || []).filter((v: any) => visibleSet.has(v.co_ven));
        const vTimeline = data.vendedoresTimeline || [];

        const venMap = new Map<string, Map<string, { rate: number; dev: number; netDocs: number }>>();
        for (const row of vTimeline) {
            const cVen = row.co_ven;
            if (!venMap.has(cVen)) {
                venMap.set(cVen, new Map());
            }
            const dev = Number(row.devoluciones) || 0;
            const netDocs = Number(row.docs_exitosos) || 0;
            let rate = 0;
            if (netDocs > 0) {
                rate = Number(((dev / netDocs) * 100).toFixed(2));
            } else if (dev > 0) {
                rate = 100;
            }
            venMap.get(cVen)!.set(row.periodo, { rate, dev, netDocs });
        }

        const datasets = vList.map((ven: any) => {
            const idx = (data.vendedores || []).findIndex((v: any) => v.co_ven === ven.co_ven);
            const color = VENDOR_COLORS[idx >= 0 ? idx % VENDOR_COLORS.length : 0];
            const vDataMap = venMap.get(ven.co_ven);
            const dataPoints = labels.map((p) =>
                vDataMap && vDataMap.has(p) ? vDataMap.get(p)!.rate : 0,
            );

            return {
                label: (ven.ven_des || ven.co_ven || "").trim().toUpperCase(),
                data: dataPoints,
                borderColor: color,
                backgroundColor: color + "20",
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
                        display: false,
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
                                const val = (context.parsed.y || 0).toLocaleString("es-VE", {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 2,
                                });
                                return ` ${label}: ${val}%`;
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
                                return Number(value).toLocaleString() + "%";
                            },
                        },
                    },
                },
            },
        });
    }

    function getDevRateBreakdown() {
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

        const periodMap = new Map<string, Map<string, { dev: number; netDocs: number; rate: number }>>();
        for (const p of compLabels) {
            periodMap.set(p, new Map());
        }

        for (const row of vTimeline) {
            if (!periodMap.has(row.periodo)) {
                periodMap.set(row.periodo, new Map());
            }
            const dev = Number(row.devoluciones) || 0;
            const netDocs = Number(row.docs_exitosos) || 0;
            let rate = 0;
            if (netDocs > 0) {
                rate = Number(((dev / netDocs) * 100).toFixed(2));
            } else if (dev > 0) {
                rate = 100;
            }

            if (dev > 0 || netDocs > 0) {
                periodMap.get(row.periodo)!.set(row.co_ven, { dev, netDocs, rate });
            }
        }

        let grandTotalDev = 0;
        let grandTotalNet = 0;

        const periodsList = compLabels.map((p) => {
            const vMap = periodMap.get(p) || new Map();
            const vendorsInPeriod: Array<{
                co_ven: string;
                ven_des: string;
                rate: number;
                dev: number;
                netDocs: number;
                color: string;
            }> = [];
            let periodDev = 0;
            let periodNet = 0;

            for (const [co_ven, val] of vMap.entries()) {
                periodDev += val.dev;
                periodNet += val.netDocs;
                vendorsInPeriod.push({
                    co_ven,
                    ven_des: vendorNameMap.get(co_ven) || co_ven,
                    rate: val.rate,
                    dev: val.dev,
                    netDocs: val.netDocs,
                    color: vendorColorMap.get(co_ven) || "#3b82f6",
                });
            }

            vendorsInPeriod.sort((a, b) => b.rate - a.rate || b.dev - a.dev);
            grandTotalDev += periodDev;
            grandTotalNet += periodNet;

            const periodRate = periodNet > 0 
                ? Number(((periodDev / periodNet) * 100).toFixed(2))
                : (periodDev > 0 ? 100 : 0);

            return {
                periodo: p,
                rate: periodRate,
                dev: periodDev,
                netDocs: periodNet,
                vendors: vendorsInPeriod,
            };
        });

        const maxPeriodRate =
            periodsList.length > 0
                ? Math.max(...periodsList.map((p) => p.rate))
                : 0;

        const grandAvgRate = grandTotalNet > 0 
            ? Number(((grandTotalDev / grandTotalNet) * 100).toFixed(2))
            : (grandTotalDev > 0 ? 100 : 0);

        return {
            periods: periodsList,
            maxPeriodRate,
            grandAvgRate,
            grandTotalDev,
            grandTotalNet,
        };
    }

    const breakdownDocs = $derived(getPeriodBreakdown("docs_exitosos"));
    const breakdownCot = $derived(getPeriodBreakdown("cotizaciones"));
    const breakdownPed = $derived(getPeriodBreakdown("pedidos"));
    const breakdownDev = $derived(getPeriodBreakdown("devoluciones"));
    const breakdownPctDev = $derived(getDevRateBreakdown());
    const breakdownFletes = $derived(getPeriodBreakdown("fletes"));
    const breakdownCortes = $derived(getPeriodBreakdown("cortes"));
    const breakdownArt = $derived(getPeriodBreakdown("art_distintos"));
    const breakdownArtPed = $derived(getPeriodBreakdown("art_pedidos"));
    const breakdownArtCot = $derived(getPeriodBreakdown("art_cotizados"));

    let activeCompTab = $state<"docs_exitosos" | "devoluciones" | "pct_dev" | "pedidos" | "cotizaciones" | "fletes" | "cortes" | "art_distintos" | "art_pedidos" | "art_cotizados">("docs_exitosos");

    const compTabs = $derived([
        {
            id: "docs_exitosos" as const,
            label: "Docs. Exitosos",
            icon: FileCheck,
            activeBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
            activeBorder: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400 shadow-sm",
            activeText: "text-emerald-600 dark:text-emerald-400",
            iconColor: "text-emerald-500"
        },
        {
            id: "devoluciones" as const,
            label: "Devoluciones",
            icon: FileX,
            activeBg: "bg-red-500/10 dark:bg-red-500/15",
            activeBorder: "border-red-500/50 text-red-600 dark:text-red-400 shadow-sm",
            activeText: "text-red-600 dark:text-red-400",
            iconColor: "text-red-500"
        },
        {
            id: "pct_dev" as const,
            label: "% Devoluciones",
            icon: Percent,
            activeBg: "bg-amber-500/10 dark:bg-amber-500/15",
            activeBorder: "border-amber-500/50 text-amber-600 dark:text-amber-400 shadow-sm",
            activeText: "text-amber-600 dark:text-amber-400",
            iconColor: "text-amber-500"
        },
        {
            id: "pedidos" as const,
            label: "Pedidos",
            icon: ShoppingCart,
            activeBg: "bg-purple-500/10 dark:bg-purple-500/15",
            activeBorder: "border-purple-500/50 text-purple-600 dark:text-purple-400 shadow-sm",
            activeText: "text-purple-600 dark:text-purple-400",
            iconColor: "text-purple-500"
        },
        {
            id: "cotizaciones" as const,
            label: "Cotizaciones",
            icon: ClipboardList,
            activeBg: "bg-blue-500/10 dark:bg-blue-500/15",
            activeBorder: "border-blue-500/50 text-blue-600 dark:text-blue-400 shadow-sm",
            activeText: "text-blue-600 dark:text-blue-400",
            iconColor: "text-blue-500"
        },
        {
            id: "fletes" as const,
            label: "Fletes",
            icon: Truck,
            activeBg: "bg-cyan-500/10 dark:bg-cyan-500/15",
            activeBorder: "border-cyan-500/50 text-cyan-600 dark:text-cyan-400 shadow-sm",
            activeText: "text-cyan-600 dark:text-cyan-400",
            iconColor: "text-cyan-500"
        },
        {
            id: "cortes" as const,
            label: "Cortes",
            icon: Scissors,
            activeBg: "bg-rose-500/10 dark:bg-rose-500/15",
            activeBorder: "border-rose-500/50 text-rose-600 dark:text-rose-400 shadow-sm",
            activeText: "text-rose-600 dark:text-rose-400",
            iconColor: "text-rose-500"
        },
        {
            id: "art_distintos" as const,
            label: "Artículos Únicos Vendidos",
            icon: PackageSearch,
            activeBg: "bg-teal-500/10 dark:bg-teal-500/15",
            activeBorder: "border-teal-500/50 text-teal-600 dark:text-teal-400 shadow-sm",
            activeText: "text-teal-600 dark:text-teal-400",
            iconColor: "text-teal-500"
        },
        {
            id: "art_pedidos" as const,
            label: "Artículos Únicos Pedidos",
            icon: PackagePlus,
            activeBg: "bg-purple-500/10 dark:bg-purple-500/15",
            activeBorder: "border-purple-500/50 text-purple-600 dark:text-purple-400 shadow-sm",
            activeText: "text-purple-600 dark:text-purple-400",
            iconColor: "text-purple-500"
        },
        {
            id: "art_cotizados" as const,
            label: "Artículos Únicos Cotizados",
            icon: FileSpreadsheet,
            activeBg: "bg-indigo-500/10 dark:bg-indigo-500/15",
            activeBorder: "border-indigo-500/50 text-indigo-600 dark:text-indigo-400 shadow-sm",
            activeText: "text-indigo-600 dark:text-indigo-400",
            iconColor: "text-indigo-500"
        }
    ]);

    // Chart reactivo principal y comparativos
    // 1. Gráfica principal (histórica / vendedor único)
    $effect(() => {
        if (!mounted || !chartCanvas || !timeline.length) return;
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
                        pointHoverRadius: tipoAgrupacion === "diario" ? 6 : 8,
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
                        pointHoverRadius: tipoAgrupacion === "diario" ? 5 : 7,
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
                        pointHoverRadius: tipoAgrupacion === "diario" ? 5 : 7,
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
                        pointHoverRadius: tipoAgrupacion === "diario" ? 5 : 7,
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
    });

    // 2. Gráfica comparativa por vendedor (métrica activa)
    $effect(() => {
        if (!mounted || !compChartCanvas) return;
        if (compChartInstance) {
            compChartInstance.destroy();
            compChartInstance = null;
        }

        const compLabels =
            data.periodosComparativa && data.periodosComparativa.length > 0
                ? data.periodosComparativa
                : timeline.map((m: any) => m.periodo);

        if (!compLabels.length || !(data.vendedores || []).length) return;

        if (activeCompTab === "docs_exitosos") {
            compChartInstance = createVendorChart(
                compChartCanvas,
                compLabels,
                "docs_exitosos",
                "Docs. Exitosos",
                visibleVendorsDocs,
            );
        } else if (activeCompTab === "devoluciones") {
            compChartInstance = createVendorChart(
                compChartCanvas,
                compLabels,
                "devoluciones",
                "Devoluciones",
                visibleVendorsDev,
            );
        } else if (activeCompTab === "pct_dev") {
            compChartInstance = createVendorPctChart(
                compChartCanvas,
                compLabels,
                visibleVendorsPctDev,
            );
        } else if (activeCompTab === "pedidos") {
            compChartInstance = createVendorChart(
                compChartCanvas,
                compLabels,
                "pedidos",
                "Pedidos",
                visibleVendorsPed,
            );
        } else if (activeCompTab === "cotizaciones") {
            compChartInstance = createVendorChart(
                compChartCanvas,
                compLabels,
                "cotizaciones",
                "Cotizaciones",
                visibleVendorsCot,
            );
        } else if (activeCompTab === "fletes") {
            compChartInstance = createVendorChart(
                compChartCanvas,
                compLabels,
                "fletes",
                "Fletes",
                visibleVendorsFletes,
            );
        } else if (activeCompTab === "cortes") {
            compChartInstance = createVendorChart(
                compChartCanvas,
                compLabels,
                "cortes",
                "Cortes",
                visibleVendorsCortes,
            );
        } else if (activeCompTab === "art_distintos") {
            compChartInstance = createVendorChart(
                compChartCanvas,
                compLabels,
                "art_distintos",
                "Artículos Únicos Vendidos",
                visibleVendorsArt,
            );
        } else if (activeCompTab === "art_pedidos") {
            compChartInstance = createVendorChart(
                compChartCanvas,
                compLabels,
                "art_pedidos",
                "Artículos Únicos Pedidos",
                visibleVendorsArtPed,
            );
        } else if (activeCompTab === "art_cotizados") {
            compChartInstance = createVendorChart(
                compChartCanvas,
                compLabels,
                "art_cotizados",
                "Artículos Únicos Cotizados",
                visibleVendorsArtCot,
            );
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
                <BarChart2 size={40} class="text-brand-500 shrink-0" />
                Rendimiento de Vendedores
            </h1>
            <p class="text-text-muted text-sm max-w-2xl">
                Resumen temporal y comparativo de documentos de venta: facturas exitosas,
                cotizaciones, pedidos y devoluciones según el rango de fechas y vendedor seleccionado.
            </p>
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
                <div class="space-y-6">
                    <!-- NAVEGACIÓN DE TABS / MÉTRICAS -->
                    <div class="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2 pt-1">
                        {#each compTabs as tab}
                            <button
                                type="button"
                                onclick={() => (activeCompTab = tab.id)}
                                class="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl font-bold text-xs transition-all shrink-0 cursor-pointer border {activeCompTab === tab.id
                                    ? `${tab.activeBg} ${tab.activeBorder} ${tab.activeText}`
                                    : 'bg-surface-raised border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft'}"
                            >
                                <svelte:component
                                    this={tab.icon}
                                    size={16}
                                    class={activeCompTab === tab.id ? tab.iconColor : 'text-text-muted'}
                                />
                                <span>{tab.label}</span>
                            </button>
                        {/each}
                    </div>

                    {#if activeCompTab === 'docs_exitosos'}
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
                            <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                                <span
                                    class="text-[11px] font-mono font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20"
                                >
                                    Total: {formatNumber(breakdownDocs.grandTotal)}
                                </span>
                                <button
                                    type="button"
                                    onclick={selectAllDocs}
                                    class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                >
                                    Todos ({(data.vendedores || []).length})
                                </button>
                                <button
                                    type="button"
                                    onclick={deselectAllDocs}
                                    class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                >
                                    Ninguno
                                </button>
                            </div>
                        </div>

                        <!-- Barra de Pills / Vendedores -->
                        <div class="space-y-2">
                            <div class="flex items-center justify-between gap-2">
                                <span class="text-xs font-black uppercase tracking-wider text-text-muted">
                                    Filtrar Vendedores en Gráfica
                                </span>
                                <span class="text-xs text-text-muted">
                                    {visibleVendorsDocs.size} de {(data.vendedores || []).length} visibles
                                </span>
                            </div>
                            <div class="flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar p-1">
                                {#each (data.vendedores || []) as v}
                                    {@const isVisible = visibleVendorsDocs.has(v.co_ven)}
                                    {@const color = vendorColorMap.get(v.co_ven) || '#3b82f6'}
                                    <button
                                        type="button"
                                        onclick={() => toggleVendorDocs(v.co_ven)}
                                        class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer {isVisible
                                            ? 'bg-surface-raised border-border-subtle text-text-base shadow-sm'
                                            : 'bg-surface-base/50 border-border-subtle/40 text-text-muted/50 opacity-60'}"
                                    >
                                        <span
                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                            style="background-color: {isVisible ? color : '#94a3b8'}"
                                        ></span>
                                        <span class="truncate max-w-[150px]">{(v.ven_des || v.co_ven).trim().toUpperCase()}</span>
                                        {#if v.inactivo}
                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1 py-0.5 rounded">Inactivo</span>
                                        {/if}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <div class="relative w-full" style="height: 380px;">
                            {#if visibleVendorsDocs.size > 0}
                                <canvas bind:this={compChartCanvas}></canvas>
                            {:else}
                                <div class="h-full flex flex-col items-center justify-center text-center p-8 bg-surface-raised/50 rounded-2xl border border-dashed border-border-subtle">
                                    <EyeOff size={36} class="text-text-muted mb-2" />
                                    <p class="text-sm font-bold text-text-base">Ningún vendedor seleccionado</p>
                                    <p class="text-xs text-text-muted mt-1">Haz clic en los botones superiores para activar vendedores en la gráfica.</p>
                                </div>
                            {/if}
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

                            <!-- TABLA / RANKING DE DOCUMENTOS EXITOSOS POR ASESOR -->
                            <div class="mt-8 pt-6 border-t border-border-subtle/80 space-y-6">
                                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle/60">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                        >
                                            <Award size={22} />
                                        </div>
                                        <div>
                                            <h3 class="text-base sm:text-lg font-black text-text-base flex items-center gap-2">
                                                Ranking de Documentos Exitosos por Asesor
                                            </h3>
                                            <p class="text-xs text-text-muted">
                                                Total de facturas emitidas menos devoluciones por asesor en el rango de fechas seleccionado.
                                            </p>
                                        </div>
                                    </div>
                                    <div class="relative w-full sm:w-64">
                                        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <input
                                            type="text"
                                            bind:value={vendorFilterSearchDocs}
                                            placeholder="Buscar vendedor..."
                                            class="w-full bg-surface-base border border-border-subtle rounded-xl pl-9 pr-3 py-2 text-xs text-text-base focus:outline-none focus:border-brand-500"
                                        />
                                    </div>
                                </div>

                                <div class="overflow-x-auto custom-scrollbar">
                                    <table class="w-full text-left text-xs">
                                        <thead>
                                            <tr class="border-b border-border-subtle text-text-muted font-black uppercase text-[10px]">
                                                <th class="py-3 px-4">#</th>
                                                <th class="py-3 px-4">Código</th>
                                                <th class="py-3 px-4">Asesor Comercial</th>
                                                <th class="py-3 px-4 text-right">Docs. Exitosos (Rango)</th>
                                                <th class="py-3 px-4 text-right">% del Total</th>
                                                <th class="py-3 px-4 text-center">Estado en Gráfica</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-border-subtle/40 font-medium">
                                            {#each rankingDocs.filter((t) => !vendorFilterSearchDocs || t.ven_des.toLowerCase().includes(vendorFilterSearchDocs.toLowerCase()) || t.co_ven.toLowerCase().includes(vendorFilterSearchDocs.toLowerCase())) as item, idx}
                                                {@const pct = totales.docs_exitosos > 0 ? ((item.docs_exitosos / totales.docs_exitosos) * 100).toFixed(2) : '0.00'}
                                                {@const color = vendorColorMap.get(item.co_ven) || '#3b82f6'}
                                                {@const isVis = visibleVendorsDocs.has(item.co_ven)}
                                                <tr class="hover:bg-surface-soft/60 transition-colors">
                                                    <td class="py-3 px-4 font-mono font-bold text-text-muted">
                                                        {idx + 1}
                                                    </td>
                                                    <td class="py-3 px-4 font-mono text-text-muted">
                                                        {item.co_ven}
                                                    </td>
                                                    <td class="py-3 px-4 font-bold text-text-base flex items-center gap-2">
                                                        <span
                                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                                            style="background-color: {color}"
                                                        ></span>
                                                        {item.ven_des}
                                                        {#if item.inactivo}
                                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded">Inactivo</span>
                                                        {/if}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-black font-mono text-text-base">
                                                        {item.docs_exitosos.toLocaleString("es-VE")}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                                                        {pct}%
                                                    </td>
                                                    <td class="py-3 px-4 text-center">
                                                        <button
                                                            type="button"
                                                            onclick={() => toggleVendorDocs(item.co_ven)}
                                                            class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer {isVis
                                                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                                                                : 'bg-surface-raised text-text-muted border-border-subtle'}"
                                                        >
                                                            {isVis ? 'Visible' : 'Oculto'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            {/each}
                                            {#if rankingDocs.length === 0}
                                                <tr>
                                                    <td colspan="6" class="py-8 text-center text-text-muted font-bold">
                                                        No se encontraron datos para mostrar.
                                                    </td>
                                                </tr>
                                            {/if}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                    {:else if activeCompTab === 'devoluciones'}
                        <!-- 2. Devoluciones (100% Ancho) -->
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
                            <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                                <span
                                    class="text-[11px] font-mono font-bold text-red-500 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20"
                                >
                                    Total: {formatNumber(breakdownDev.grandTotal)}
                                </span>
                                <button
                                    type="button"
                                    onclick={selectAllDev}
                                    class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                >
                                    Todos ({(data.vendedores || []).length})
                                </button>
                                <button
                                    type="button"
                                    onclick={deselectAllDev}
                                    class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                >
                                    Ninguno
                                </button>
                            </div>
                        </div>

                        <!-- Barra de Pills / Vendedores -->
                        <div class="space-y-2">
                            <div class="flex items-center justify-between gap-2">
                                <span class="text-xs font-black uppercase tracking-wider text-text-muted">
                                    Filtrar Vendedores en Gráfica
                                </span>
                                <span class="text-xs text-text-muted">
                                    {visibleVendorsDev.size} de {(data.vendedores || []).length} visibles
                                </span>
                            </div>
                            <div class="flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar p-1">
                                {#each (data.vendedores || []) as v}
                                    {@const isVisible = visibleVendorsDev.has(v.co_ven)}
                                    {@const color = vendorColorMap.get(v.co_ven) || '#3b82f6'}
                                    <button
                                        type="button"
                                        onclick={() => toggleVendorDev(v.co_ven)}
                                        class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer {isVisible
                                            ? 'bg-surface-raised border-border-subtle text-text-base shadow-sm'
                                            : 'bg-surface-base/50 border-border-subtle/40 text-text-muted/50 opacity-60'}"
                                    >
                                        <span
                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                            style="background-color: {isVisible ? color : '#94a3b8'}"
                                        ></span>
                                        <span class="truncate max-w-[150px]">{(v.ven_des || v.co_ven).trim().toUpperCase()}</span>
                                        {#if v.inactivo}
                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1 py-0.5 rounded">Inactivo</span>
                                        {/if}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <div class="relative w-full" style="height: 380px;">
                            {#if visibleVendorsDev.size > 0}
                                <canvas bind:this={compChartCanvas}></canvas>
                            {:else}
                                <div class="h-full flex flex-col items-center justify-center text-center p-8 bg-surface-raised/50 rounded-2xl border border-dashed border-border-subtle">
                                    <EyeOff size={36} class="text-text-muted mb-2" />
                                    <p class="text-sm font-bold text-text-base">Ningún vendedor seleccionado</p>
                                    <p class="text-xs text-text-muted mt-1">Haz clic en los botones superiores para activar vendedores en la gráfica.</p>
                                </div>
                            {/if}
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

                            <!-- TABLA / RANKING DE DEVOLUCIONES POR ASESOR -->
                            <div class="mt-8 pt-6 border-t border-border-subtle/80 space-y-6">
                                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle/60">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="p-2.5 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20"
                                        >
                                            <Award size={22} />
                                        </div>
                                        <div>
                                            <h3 class="text-base sm:text-lg font-black text-text-base flex items-center gap-2">
                                                Ranking de Devoluciones por Asesor
                                            </h3>
                                            <p class="text-xs text-text-muted">
                                                Total de documentos de devolución de clientes registrados por asesor en el rango de fechas.
                                            </p>
                                        </div>
                                    </div>
                                    <div class="relative w-full sm:w-64">
                                        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <input
                                            type="text"
                                            bind:value={vendorFilterSearchDev}
                                            placeholder="Buscar vendedor..."
                                            class="w-full bg-surface-base border border-border-subtle rounded-xl pl-9 pr-3 py-2 text-xs text-text-base focus:outline-none focus:border-brand-500"
                                        />
                                    </div>
                                </div>

                                <div class="overflow-x-auto custom-scrollbar">
                                    <table class="w-full text-left text-xs">
                                        <thead>
                                            <tr class="border-b border-border-subtle text-text-muted font-black uppercase text-[10px]">
                                                <th class="py-3 px-4">#</th>
                                                <th class="py-3 px-4">Código</th>
                                                <th class="py-3 px-4">Asesor Comercial</th>
                                                <th class="py-3 px-4 text-right">Devoluciones (Rango)</th>
                                                <th class="py-3 px-4 text-right">% del Total</th>
                                                <th class="py-3 px-4 text-center">Estado en Gráfica</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-border-subtle/40 font-medium">
                                            {#each rankingDev.filter((t) => !vendorFilterSearchDev || t.ven_des.toLowerCase().includes(vendorFilterSearchDev.toLowerCase()) || t.co_ven.toLowerCase().includes(vendorFilterSearchDev.toLowerCase())) as item, idx}
                                                {@const pct = totales.devoluciones > 0 ? ((item.devoluciones / totales.devoluciones) * 100).toFixed(2) : '0.00'}
                                                {@const color = vendorColorMap.get(item.co_ven) || '#3b82f6'}
                                                {@const isVis = visibleVendorsDev.has(item.co_ven)}
                                                <tr class="hover:bg-surface-soft/60 transition-colors">
                                                    <td class="py-3 px-4 font-mono font-bold text-text-muted">
                                                        {idx + 1}
                                                    </td>
                                                    <td class="py-3 px-4 font-mono text-text-muted">
                                                        {item.co_ven}
                                                    </td>
                                                    <td class="py-3 px-4 font-bold text-text-base flex items-center gap-2">
                                                        <span
                                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                                            style="background-color: {color}"
                                                        ></span>
                                                        {item.ven_des}
                                                        {#if item.inactivo}
                                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded">Inactivo</span>
                                                        {/if}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-black font-mono text-text-base">
                                                        {item.devoluciones.toLocaleString("es-VE")}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-mono text-red-600 dark:text-red-400 font-bold">
                                                        {pct}%
                                                    </td>
                                                    <td class="py-3 px-4 text-center">
                                                        <button
                                                            type="button"
                                                            onclick={() => toggleVendorDev(item.co_ven)}
                                                            class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer {isVis
                                                                ? 'bg-red-500/10 text-red-500 border-red-500/30'
                                                                : 'bg-surface-raised text-text-muted border-border-subtle'}"
                                                        >
                                                            {isVis ? 'Visible' : 'Oculto'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            {/each}
                                            {#if rankingDev.length === 0}
                                                <tr>
                                                    <td colspan="6" class="py-8 text-center text-text-muted font-bold">
                                                        No se encontraron datos para mostrar.
                                                    </td>
                                                </tr>
                                            {/if}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                    {:else if activeCompTab === 'pct_dev'}
                        <!-- 3. % Devoluciones sobre Facturas Netas (100% Ancho) -->
                        <div
                            class="bg-surface-raised border border-border-subtle hover:border-amber-500/40 transition-all rounded-3xl p-6 sm:p-7 shadow-xl space-y-6"
                        >
                        <div
                            class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle/60 pb-4"
                        >
                            <div class="flex items-center gap-3">
                                <div
                                    class="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                >
                                    <Percent size={22} />
                                </div>
                                <div>
                                    <h3
                                        class="text-base sm:text-lg font-black text-text-base flex items-center gap-2"
                                    >
                                        % Devoluciones sobre Facturas Netas por Vendedor
                                    </h3>
                                    <p class="text-xs text-text-muted">
                                        Porcentaje que representan las devoluciones respecto a las facturas netas ((Devoluciones / Facturas Netas) × 100).
                                    </p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                                <span
                                    class="text-[11px] font-mono font-bold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20"
                                >
                                    Tasa Global: {breakdownPctDev.grandAvgRate.toLocaleString('es-VE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%
                                </span>
                                <button
                                    type="button"
                                    onclick={selectAllPctDev}
                                    class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                >
                                    Todos ({(data.vendedores || []).length})
                                </button>
                                <button
                                    type="button"
                                    onclick={deselectAllPctDev}
                                    class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                >
                                    Ninguno
                                </button>
                            </div>
                        </div>

                        <!-- Barra de Pills / Vendedores -->
                        <div class="space-y-2">
                            <div class="flex items-center justify-between gap-2">
                                <span class="text-xs font-black uppercase tracking-wider text-text-muted">
                                    Filtrar Vendedores en Gráfica
                                </span>
                                <span class="text-xs text-text-muted">
                                    {visibleVendorsPctDev.size} de {(data.vendedores || []).length} visibles
                                </span>
                            </div>
                            <div class="flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar p-1">
                                {#each (data.vendedores || []) as v}
                                    {@const isVisible = visibleVendorsPctDev.has(v.co_ven)}
                                    {@const color = vendorColorMap.get(v.co_ven) || '#3b82f6'}
                                    <button
                                        type="button"
                                        onclick={() => toggleVendorPctDev(v.co_ven)}
                                        class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer {isVisible
                                            ? 'bg-surface-raised border-border-subtle text-text-base shadow-sm'
                                            : 'bg-surface-base/50 border-border-subtle/40 text-text-muted/50 opacity-60'}"
                                    >
                                        <span
                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                            style="background-color: {isVisible ? color : '#94a3b8'}"
                                        ></span>
                                        <span class="truncate max-w-[150px]">{(v.ven_des || v.co_ven).trim().toUpperCase()}</span>
                                        {#if v.inactivo}
                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1 py-0.5 rounded">Inactivo</span>
                                        {/if}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <div class="relative w-full" style="height: 380px;">
                            {#if visibleVendorsPctDev.size > 0}
                                <canvas bind:this={compChartCanvas}></canvas>
                            {:else}
                                <div class="h-full flex flex-col items-center justify-center text-center p-8 bg-surface-raised/50 rounded-2xl border border-dashed border-border-subtle">
                                    <EyeOff size={36} class="text-text-muted mb-2" />
                                    <p class="text-sm font-bold text-text-base">Ningún vendedor seleccionado</p>
                                    <p class="text-xs text-text-muted mt-1">Haz clic en los botones superiores para activar vendedores en la gráfica.</p>
                                </div>
                            {/if}
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
                                          : 'Mensual'} por Vendedor (% Devoluciones)
                                </span>
                                <span
                                    class="text-[10px] text-text-muted font-medium lg:hidden"
                                >
                                    ← Desliza para ver todos los períodos →
                                </span>
                            </div>

                            <div class="w-full overflow-x-auto custom-scrollbar pb-2">
                                <div class="flex gap-2.5 min-w-full">
                                    {#each breakdownPctDev.periods as p}
                                        {@const isMax =
                                            p.rate === breakdownPctDev.maxPeriodRate &&
                                            breakdownPctDev.maxPeriodRate > 0}
                                        <div
                                            class="flex-1 min-w-[170px] sm:min-w-[200px] p-3 rounded-2xl border transition-all flex flex-col justify-between {isMax
                                                ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/20'
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
                                                    class="text-[11px] font-mono font-black text-amber-500 shrink-0"
                                                >
                                                    {p.rate.toLocaleString('es-VE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%
                                                </span>
                                            </div>

                                            <!-- Listado de vendedores en el período -->
                                            <div class="space-y-1.5 text-xs flex-1">
                                                {#if p.vendors.length === 0}
                                                    <p
                                                        class="text-[10px] text-text-muted/50 italic text-center py-2"
                                                    >
                                                        0% devoluciones
                                                    </p>
                                                {:else}
                                                    {#each p.vendors as ven}
                                                        <div
                                                            class="flex items-center justify-between gap-1.5 text-[10px]"
                                                            title="Dev: {ven.dev} / Netas: {ven.netDocs}"
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
                                                                    title="{ven.ven_des} ({ven.co_ven}) - Dev: {ven.dev} / Netas: {ven.netDocs}"
                                                                >
                                                                    {ven.ven_des}
                                                                </span>
                                                            </div>
                                                            <span
                                                                class="font-mono font-black text-text-base shrink-0"
                                                            >
                                                                {ven.rate.toLocaleString('es-VE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%
                                                            </span>
                                                        </div>
                                                    {/each}
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>

                            <!-- TABLA / RANKING DE TASA DE DEVOLUCIÓN POR ASESOR -->
                            <div class="mt-8 pt-6 border-t border-border-subtle/80 space-y-6">
                                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle/60">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                        >
                                            <Award size={22} />
                                        </div>
                                        <div>
                                            <h3 class="text-base sm:text-lg font-black text-text-base flex items-center gap-2">
                                                Ranking de Tasa de Devolución por Asesor
                                            </h3>
                                            <p class="text-xs text-text-muted">
                                                Porcentaje que representan las devoluciones sobre facturas netas ((Devoluciones / Docs. Exitosos) × 100) en el rango.
                                            </p>
                                        </div>
                                    </div>
                                    <div class="relative w-full sm:w-64">
                                        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <input
                                            type="text"
                                            bind:value={vendorFilterSearchPctDev}
                                            placeholder="Buscar vendedor..."
                                            class="w-full bg-surface-base border border-border-subtle rounded-xl pl-9 pr-3 py-2 text-xs text-text-base focus:outline-none focus:border-brand-500"
                                        />
                                    </div>
                                </div>

                                <div class="overflow-x-auto custom-scrollbar">
                                    <table class="w-full text-left text-xs">
                                        <thead>
                                            <tr class="border-b border-border-subtle text-text-muted font-black uppercase text-[10px]">
                                                <th class="py-3 px-4">#</th>
                                                <th class="py-3 px-4">Código</th>
                                                <th class="py-3 px-4">Asesor Comercial</th>
                                                <th class="py-3 px-4 text-right">Devoluciones</th>
                                                <th class="py-3 px-4 text-right">Docs. Exitosos</th>
                                                <th class="py-3 px-4 text-right">% Devolución</th>
                                                <th class="py-3 px-4 text-center">Estado en Gráfica</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-border-subtle/40 font-medium">
                                            {#each rankingPctDev.filter((t) => !vendorFilterSearchPctDev || t.ven_des.toLowerCase().includes(vendorFilterSearchPctDev.toLowerCase()) || t.co_ven.toLowerCase().includes(vendorFilterSearchPctDev.toLowerCase())) as item, idx}
                                                {@const color = vendorColorMap.get(item.co_ven) || '#3b82f6'}
                                                {@const isVis = visibleVendorsPctDev.has(item.co_ven)}
                                                <tr class="hover:bg-surface-soft/60 transition-colors">
                                                    <td class="py-3 px-4 font-mono font-bold text-text-muted">
                                                        {idx + 1}
                                                    </td>
                                                    <td class="py-3 px-4 font-mono text-text-muted">
                                                        {item.co_ven}
                                                    </td>
                                                    <td class="py-3 px-4 font-bold text-text-base flex items-center gap-2">
                                                        <span
                                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                                            style="background-color: {color}"
                                                        ></span>
                                                        {item.ven_des}
                                                        {#if item.inactivo}
                                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded">Inactivo</span>
                                                        {/if}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-mono text-text-base">
                                                        {item.devoluciones.toLocaleString("es-VE")}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-mono text-text-base">
                                                        {item.docs_exitosos.toLocaleString("es-VE")}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-black font-mono {item.pct_dev === 0 ? 'text-emerald-500' : item.pct_dev < 5 ? 'text-emerald-600 dark:text-emerald-400' : item.pct_dev < 10 ? 'text-amber-500' : 'text-rose-500'}">
                                                        {item.pct_dev.toLocaleString('es-VE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%
                                                    </td>
                                                    <td class="py-3 px-4 text-center">
                                                        <button
                                                            type="button"
                                                            onclick={() => toggleVendorPctDev(item.co_ven)}
                                                            class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer {isVis
                                                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                                                                : 'bg-surface-raised text-text-muted border-border-subtle'}"
                                                        >
                                                            {isVis ? 'Visible' : 'Oculto'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            {/each}
                                            {#if rankingPctDev.length === 0}
                                                <tr>
                                                    <td colspan="7" class="py-8 text-center text-text-muted font-bold">
                                                        No se encontraron datos para mostrar.
                                                    </td>
                                                </tr>
                                            {/if}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                    {:else if activeCompTab === 'pedidos'}
                        <!-- 4. Pedidos (100% Ancho) -->
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
                            <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                                <span
                                    class="text-[11px] font-mono font-bold text-purple-500 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20"
                                >
                                    Total: {formatNumber(breakdownPed.grandTotal)}
                                </span>
                                <button
                                    type="button"
                                    onclick={selectAllPed}
                                    class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                >
                                    Todos ({(data.vendedores || []).length})
                                </button>
                                <button
                                    type="button"
                                    onclick={deselectAllPed}
                                    class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                >
                                    Ninguno
                                </button>
                            </div>
                        </div>

                        <!-- Barra de Pills / Vendedores -->
                        <div class="space-y-2">
                            <div class="flex items-center justify-between gap-2">
                                <span class="text-xs font-black uppercase tracking-wider text-text-muted">
                                    Filtrar Vendedores en Gráfica
                                </span>
                                <span class="text-xs text-text-muted">
                                    {visibleVendorsPed.size} de {(data.vendedores || []).length} visibles
                                </span>
                            </div>
                            <div class="flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar p-1">
                                {#each (data.vendedores || []) as v}
                                    {@const isVisible = visibleVendorsPed.has(v.co_ven)}
                                    {@const color = vendorColorMap.get(v.co_ven) || '#3b82f6'}
                                    <button
                                        type="button"
                                        onclick={() => toggleVendorPed(v.co_ven)}
                                        class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer {isVisible
                                            ? 'bg-surface-raised border-border-subtle text-text-base shadow-sm'
                                            : 'bg-surface-base/50 border-border-subtle/40 text-text-muted/50 opacity-60'}"
                                    >
                                        <span
                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                            style="background-color: {isVisible ? color : '#94a3b8'}"
                                        ></span>
                                        <span class="truncate max-w-[150px]">{(v.ven_des || v.co_ven).trim().toUpperCase()}</span>
                                        {#if v.inactivo}
                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1 py-0.5 rounded">Inactivo</span>
                                        {/if}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <div class="relative w-full" style="height: 380px;">
                            {#if visibleVendorsPed.size > 0}
                                <canvas bind:this={compChartCanvas}></canvas>
                            {:else}
                                <div class="h-full flex flex-col items-center justify-center text-center p-8 bg-surface-raised/50 rounded-2xl border border-dashed border-border-subtle">
                                    <EyeOff size={36} class="text-text-muted mb-2" />
                                    <p class="text-sm font-bold text-text-base">Ningún vendedor seleccionado</p>
                                    <p class="text-xs text-text-muted mt-1">Haz clic en los botones superiores para activar vendedores en la gráfica.</p>
                                </div>
                            {/if}
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

                            <!-- TABLA / RANKING DE PEDIDOS POR ASESOR -->
                            <div class="mt-8 pt-6 border-t border-border-subtle/80 space-y-6">
                                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle/60">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="p-2.5 rounded-2xl bg-purple-500/10 text-purple-500 border border-purple-500/20"
                                        >
                                            <Award size={22} />
                                        </div>
                                        <div>
                                            <h3 class="text-base sm:text-lg font-black text-text-base flex items-center gap-2">
                                                Ranking de Pedidos por Asesor
                                            </h3>
                                            <p class="text-xs text-text-muted">
                                                Total de pedidos de venta emitidos por cada asesor comercial en el rango de fechas.
                                            </p>
                                        </div>
                                    </div>
                                    <div class="relative w-full sm:w-64">
                                        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <input
                                            type="text"
                                            bind:value={vendorFilterSearchPed}
                                            placeholder="Buscar vendedor..."
                                            class="w-full bg-surface-base border border-border-subtle rounded-xl pl-9 pr-3 py-2 text-xs text-text-base focus:outline-none focus:border-brand-500"
                                        />
                                    </div>
                                </div>

                                <div class="overflow-x-auto custom-scrollbar">
                                    <table class="w-full text-left text-xs">
                                        <thead>
                                            <tr class="border-b border-border-subtle text-text-muted font-black uppercase text-[10px]">
                                                <th class="py-3 px-4">#</th>
                                                <th class="py-3 px-4">Código</th>
                                                <th class="py-3 px-4">Asesor Comercial</th>
                                                <th class="py-3 px-4 text-right">Pedidos (Rango)</th>
                                                <th class="py-3 px-4 text-right">% del Total</th>
                                                <th class="py-3 px-4 text-center">Estado en Gráfica</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-border-subtle/40 font-medium">
                                            {#each rankingPed.filter((t) => !vendorFilterSearchPed || t.ven_des.toLowerCase().includes(vendorFilterSearchPed.toLowerCase()) || t.co_ven.toLowerCase().includes(vendorFilterSearchPed.toLowerCase())) as item, idx}
                                                {@const pct = totales.pedidos > 0 ? ((item.pedidos / totales.pedidos) * 100).toFixed(2) : '0.00'}
                                                {@const color = vendorColorMap.get(item.co_ven) || '#3b82f6'}
                                                {@const isVis = visibleVendorsPed.has(item.co_ven)}
                                                <tr class="hover:bg-surface-soft/60 transition-colors">
                                                    <td class="py-3 px-4 font-mono font-bold text-text-muted">
                                                        {idx + 1}
                                                    </td>
                                                    <td class="py-3 px-4 font-mono text-text-muted">
                                                        {item.co_ven}
                                                    </td>
                                                    <td class="py-3 px-4 font-bold text-text-base flex items-center gap-2">
                                                        <span
                                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                                            style="background-color: {color}"
                                                        ></span>
                                                        {item.ven_des}
                                                        {#if item.inactivo}
                                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded">Inactivo</span>
                                                        {/if}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-black font-mono text-text-base">
                                                        {item.pedidos.toLocaleString("es-VE")}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-mono text-purple-600 dark:text-purple-400 font-bold">
                                                        {pct}%
                                                    </td>
                                                    <td class="py-3 px-4 text-center">
                                                        <button
                                                            type="button"
                                                            onclick={() => toggleVendorPed(item.co_ven)}
                                                            class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer {isVis
                                                                ? 'bg-purple-500/10 text-purple-500 border-purple-500/30'
                                                                : 'bg-surface-raised text-text-muted border-border-subtle'}"
                                                        >
                                                            {isVis ? 'Visible' : 'Oculto'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            {/each}
                                            {#if rankingPed.length === 0}
                                                <tr>
                                                    <td colspan="6" class="py-8 text-center text-text-muted font-bold">
                                                        No se encontraron datos para mostrar.
                                                    </td>
                                                </tr>
                                            {/if}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                    {:else if activeCompTab === 'cotizaciones'}
                        <!-- 5. Cotizaciones (100% Ancho) -->
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
                            <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                                <span
                                    class="text-[11px] font-mono font-bold text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20"
                                >
                                    Total: {formatNumber(breakdownCot.grandTotal)}
                                </span>
                                <button
                                    type="button"
                                    onclick={selectAllCot}
                                    class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                >
                                    Todos ({(data.vendedores || []).length})
                                </button>
                                <button
                                    type="button"
                                    onclick={deselectAllCot}
                                    class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                >
                                    Ninguno
                                </button>
                            </div>
                        </div>

                        <!-- Barra de Pills / Vendedores -->
                        <div class="space-y-2">
                            <div class="flex items-center justify-between gap-2">
                                <span class="text-xs font-black uppercase tracking-wider text-text-muted">
                                    Filtrar Vendedores en Gráfica
                                </span>
                                <span class="text-xs text-text-muted">
                                    {visibleVendorsCot.size} de {(data.vendedores || []).length} visibles
                                </span>
                            </div>
                            <div class="flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar p-1">
                                {#each (data.vendedores || []) as v}
                                    {@const isVisible = visibleVendorsCot.has(v.co_ven)}
                                    {@const color = vendorColorMap.get(v.co_ven) || '#3b82f6'}
                                    <button
                                        type="button"
                                        onclick={() => toggleVendorCot(v.co_ven)}
                                        class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer {isVisible
                                            ? 'bg-surface-raised border-border-subtle text-text-base shadow-sm'
                                            : 'bg-surface-base/50 border-border-subtle/40 text-text-muted/50 opacity-60'}"
                                    >
                                        <span
                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                            style="background-color: {isVisible ? color : '#94a3b8'}"
                                        ></span>
                                        <span class="truncate max-w-[150px]">{(v.ven_des || v.co_ven).trim().toUpperCase()}</span>
                                        {#if v.inactivo}
                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1 py-0.5 rounded">Inactivo</span>
                                        {/if}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <div class="relative w-full" style="height: 380px;">
                            {#if visibleVendorsCot.size > 0}
                                <canvas bind:this={compChartCanvas}></canvas>
                            {:else}
                                <div class="h-full flex flex-col items-center justify-center text-center p-8 bg-surface-raised/50 rounded-2xl border border-dashed border-border-subtle">
                                    <EyeOff size={36} class="text-text-muted mb-2" />
                                    <p class="text-sm font-bold text-text-base">Ningún vendedor seleccionado</p>
                                    <p class="text-xs text-text-muted mt-1">Haz clic en los botones superiores para activar vendedores en la gráfica.</p>
                                </div>
                            {/if}
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

                            <!-- TABLA / RANKING DE COTIZACIONES POR ASESOR -->
                            <div class="mt-8 pt-6 border-t border-border-subtle/80 space-y-6">
                                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle/60">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="p-2.5 rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20"
                                        >
                                            <Award size={22} />
                                        </div>
                                        <div>
                                            <h3 class="text-base sm:text-lg font-black text-text-base flex items-center gap-2">
                                                Ranking de Cotizaciones por Asesor
                                            </h3>
                                            <p class="text-xs text-text-muted">
                                                Total de cotizaciones emitidas por cada asesor comercial en el rango de fechas.
                                            </p>
                                        </div>
                                    </div>
                                    <div class="relative w-full sm:w-64">
                                        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <input
                                            type="text"
                                            bind:value={vendorFilterSearchCot}
                                            placeholder="Buscar vendedor..."
                                            class="w-full bg-surface-base border border-border-subtle rounded-xl pl-9 pr-3 py-2 text-xs text-text-base focus:outline-none focus:border-brand-500"
                                        />
                                    </div>
                                </div>

                                <div class="overflow-x-auto custom-scrollbar">
                                    <table class="w-full text-left text-xs">
                                        <thead>
                                            <tr class="border-b border-border-subtle text-text-muted font-black uppercase text-[10px]">
                                                <th class="py-3 px-4">#</th>
                                                <th class="py-3 px-4">Código</th>
                                                <th class="py-3 px-4">Asesor Comercial</th>
                                                <th class="py-3 px-4 text-right">Cotizaciones (Rango)</th>
                                                <th class="py-3 px-4 text-right">% del Total</th>
                                                <th class="py-3 px-4 text-center">Estado en Gráfica</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-border-subtle/40 font-medium">
                                            {#each rankingCot.filter((t) => !vendorFilterSearchCot || t.ven_des.toLowerCase().includes(vendorFilterSearchCot.toLowerCase()) || t.co_ven.toLowerCase().includes(vendorFilterSearchCot.toLowerCase())) as item, idx}
                                                {@const pct = totales.cotizaciones > 0 ? ((item.cotizaciones / totales.cotizaciones) * 100).toFixed(2) : '0.00'}
                                                {@const color = vendorColorMap.get(item.co_ven) || '#3b82f6'}
                                                {@const isVis = visibleVendorsCot.has(item.co_ven)}
                                                <tr class="hover:bg-surface-soft/60 transition-colors">
                                                    <td class="py-3 px-4 font-mono font-bold text-text-muted">
                                                        {idx + 1}
                                                    </td>
                                                    <td class="py-3 px-4 font-mono text-text-muted">
                                                        {item.co_ven}
                                                    </td>
                                                    <td class="py-3 px-4 font-bold text-text-base flex items-center gap-2">
                                                        <span
                                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                                            style="background-color: {color}"
                                                        ></span>
                                                        {item.ven_des}
                                                        {#if item.inactivo}
                                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded">Inactivo</span>
                                                        {/if}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-black font-mono text-text-base">
                                                        {item.cotizaciones.toLocaleString("es-VE")}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-mono text-blue-600 dark:text-blue-400 font-bold">
                                                        {pct}%
                                                    </td>
                                                    <td class="py-3 px-4 text-center">
                                                        <button
                                                            type="button"
                                                            onclick={() => toggleVendorCot(item.co_ven)}
                                                            class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer {isVis
                                                                ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                                                                : 'bg-surface-raised text-text-muted border-border-subtle'}"
                                                        >
                                                            {isVis ? 'Visible' : 'Oculto'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            {/each}
                                            {#if rankingCot.length === 0}
                                                <tr>
                                                    <td colspan="6" class="py-8 text-center text-text-muted font-bold">
                                                        No se encontraron datos para mostrar.
                                                    </td>
                                                </tr>
                                            {/if}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                    {:else if activeCompTab === 'fletes'}
                        <!-- 6. Servicios de Flete por Vendedor (100% Ancho) -->
                        <div
                            class="bg-surface-raised border border-border-subtle hover:border-cyan-500/40 transition-all rounded-3xl p-6 sm:p-7 shadow-xl space-y-6"
                        >
                        <div
                            class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle/60 pb-4"
                        >
                            <div class="flex items-center gap-3">
                                <div
                                    class="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20"
                                >
                                    <Truck size={22} />
                                </div>
                                <div>
                                    <h3
                                        class="text-base sm:text-lg font-black text-text-base flex items-center gap-2"
                                    >
                                        Servicios de Flete por Vendedor
                                    </h3>
                                    <p class="text-xs text-text-muted">
                                        Servicios de flete (código 901001...) facturados con éxito (sin devoluciones) por cada vendedor en el período.
                                    </p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                                <span
                                    class="text-[11px] font-mono font-bold text-cyan-500 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20"
                                >
                                    Total: {formatNumber(breakdownFletes.grandTotal)}
                                </span>
                                <button
                                    type="button"
                                    onclick={selectAllFletes}
                                    class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                >
                                    Todos ({(data.vendedores || []).length})
                                </button>
                                <button
                                    type="button"
                                    onclick={deselectAllFletes}
                                    class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                >
                                    Ninguno
                                </button>
                            </div>
                        </div>

                        <!-- Barra de Pills / Vendedores -->
                        <div class="space-y-2">
                            <div class="flex items-center justify-between gap-2">
                                <span class="text-xs font-black uppercase tracking-wider text-text-muted">
                                    Filtrar Vendedores en Gráfica
                                </span>
                                <span class="text-xs text-text-muted">
                                    {visibleVendorsFletes.size} de {(data.vendedores || []).length} visibles
                                </span>
                            </div>
                            <div class="flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar p-1">
                                {#each (data.vendedores || []) as v}
                                    {@const isVisible = visibleVendorsFletes.has(v.co_ven)}
                                    {@const color = vendorColorMap.get(v.co_ven) || '#3b82f6'}
                                    <button
                                        type="button"
                                        onclick={() => toggleVendorFletes(v.co_ven)}
                                        class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer {isVisible
                                            ? 'bg-surface-raised border-border-subtle text-text-base shadow-sm'
                                            : 'bg-surface-base/50 border-border-subtle/40 text-text-muted/50 opacity-60'}"
                                    >
                                        <span
                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                            style="background-color: {isVisible ? color : '#94a3b8'}"
                                        ></span>
                                        <span class="truncate max-w-[150px]">{(v.ven_des || v.co_ven).trim().toUpperCase()}</span>
                                        {#if v.inactivo}
                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1 py-0.5 rounded">Inactivo</span>
                                        {/if}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <div class="relative w-full" style="height: 380px;">
                            {#if visibleVendorsFletes.size > 0}
                                <canvas bind:this={compChartCanvas}></canvas>
                            {:else}
                                <div class="h-full flex flex-col items-center justify-center text-center p-8 bg-surface-raised/50 rounded-2xl border border-dashed border-border-subtle">
                                    <EyeOff size={36} class="text-text-muted mb-2" />
                                    <p class="text-sm font-bold text-text-base">Ningún vendedor seleccionado</p>
                                    <p class="text-xs text-text-muted mt-1">Haz clic en los botones superiores para activar vendedores en la gráfica.</p>
                                </div>
                            {/if}
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
                                          : 'Mensual'} por Vendedor (Servicios de Flete)
                                </span>
                                <span
                                    class="text-[10px] text-text-muted font-medium lg:hidden"
                                >
                                    ← Desliza para ver todos los períodos →
                                </span>
                            </div>

                            <div class="w-full overflow-x-auto custom-scrollbar pb-2">
                                <div class="flex gap-2.5 min-w-full">
                                    {#each breakdownFletes.periods as p}
                                        {@const isMax =
                                            p.total === breakdownFletes.maxPeriodTotal &&
                                            breakdownFletes.maxPeriodTotal > 0}
                                        <div
                                            class="flex-1 min-w-[170px] sm:min-w-[200px] p-3 rounded-2xl border transition-all flex flex-col justify-between {isMax
                                                ? 'bg-cyan-500/10 border-cyan-500/50 ring-1 ring-cyan-500/20'
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
                                                    class="text-[11px] font-mono font-black text-cyan-500 shrink-0"
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
                                                        0 servicios de flete
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

                            <!-- TABLA / RANKING DE SERVICIOS DE FLETE POR ASESOR -->
                            <div class="mt-8 pt-6 border-t border-border-subtle/80 space-y-6">
                                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle/60">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20"
                                        >
                                            <Award size={22} />
                                        </div>
                                        <div>
                                            <h3 class="text-base sm:text-lg font-black text-text-base flex items-center gap-2">
                                                Ranking de Servicios de Flete por Asesor
                                            </h3>
                                            <p class="text-xs text-text-muted">
                                                Total de servicios de flete facturados en documentos exitosos por asesor en el rango de fechas.
                                            </p>
                                        </div>
                                    </div>
                                    <div class="relative w-full sm:w-64">
                                        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <input
                                            type="text"
                                            bind:value={vendorFilterSearchFletes}
                                            placeholder="Buscar vendedor..."
                                            class="w-full bg-surface-base border border-border-subtle rounded-xl pl-9 pr-3 py-2 text-xs text-text-base focus:outline-none focus:border-brand-500"
                                        />
                                    </div>
                                </div>

                                <div class="overflow-x-auto custom-scrollbar">
                                    <table class="w-full text-left text-xs">
                                        <thead>
                                            <tr class="border-b border-border-subtle text-text-muted font-black uppercase text-[10px]">
                                                <th class="py-3 px-4">#</th>
                                                <th class="py-3 px-4">Código</th>
                                                <th class="py-3 px-4">Asesor Comercial</th>
                                                <th class="py-3 px-4 text-right">Servicios de Flete (Rango)</th>
                                                <th class="py-3 px-4 text-right">% del Total</th>
                                                <th class="py-3 px-4 text-center">Estado en Gráfica</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-border-subtle/40 font-medium">
                                            {#each rankingFletes.filter((t) => !vendorFilterSearchFletes || t.ven_des.toLowerCase().includes(vendorFilterSearchFletes.toLowerCase()) || t.co_ven.toLowerCase().includes(vendorFilterSearchFletes.toLowerCase())) as item, idx}
                                                {@const pct = totales.fletes > 0 ? ((item.fletes / totales.fletes) * 100).toFixed(2) : '0.00'}
                                                {@const color = vendorColorMap.get(item.co_ven) || '#3b82f6'}
                                                {@const isVis = visibleVendorsFletes.has(item.co_ven)}
                                                <tr class="hover:bg-surface-soft/60 transition-colors">
                                                    <td class="py-3 px-4 font-mono font-bold text-text-muted">
                                                        {idx + 1}
                                                    </td>
                                                    <td class="py-3 px-4 font-mono text-text-muted">
                                                        {item.co_ven}
                                                    </td>
                                                    <td class="py-3 px-4 font-bold text-text-base flex items-center gap-2">
                                                        <span
                                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                                            style="background-color: {color}"
                                                        ></span>
                                                        {item.ven_des}
                                                        {#if item.inactivo}
                                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded">Inactivo</span>
                                                        {/if}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-black font-mono text-text-base">
                                                        {item.fletes.toLocaleString("es-VE")}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                                                        {pct}%
                                                    </td>
                                                    <td class="py-3 px-4 text-center">
                                                        <button
                                                            type="button"
                                                            onclick={() => toggleVendorFletes(item.co_ven)}
                                                            class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer {isVis
                                                                ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30'
                                                                : 'bg-surface-raised text-text-muted border-border-subtle'}"
                                                        >
                                                            {isVis ? 'Visible' : 'Oculto'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            {/each}
                                            {#if rankingFletes.length === 0}
                                                <tr>
                                                    <td colspan="6" class="py-8 text-center text-text-muted font-bold">
                                                        No se encontraron datos para mostrar.
                                                    </td>
                                                </tr>
                                            {/if}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                    {:else if activeCompTab === 'cortes'}
                        <!-- 7. Servicios de Cortes por Vendedor (100% Ancho) -->
                        <div
                            class="bg-surface-raised border border-border-subtle hover:border-rose-500/40 transition-all rounded-3xl p-6 sm:p-7 shadow-xl space-y-6"
                        >
                        <div
                            class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle/60 pb-4"
                        >
                            <div class="flex items-center gap-3">
                                <div
                                    class="p-2.5 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20"
                                >
                                    <Scissors size={22} />
                                </div>
                                <div>
                                    <h3
                                        class="text-base sm:text-lg font-black text-text-base flex items-center gap-2"
                                    >
                                        Servicios de Cortes por Vendedor
                                    </h3>
                                    <p class="text-xs text-text-muted">
                                        Servicios de corte (códigos 902001 y 902002 sumados) facturados con éxito (sin devoluciones) por cada vendedor en el período.
                                    </p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                                <span
                                    class="text-[11px] font-mono font-bold text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20"
                                >
                                    Total: {formatNumber(breakdownCortes.grandTotal)}
                                </span>
                                <button
                                    type="button"
                                    onclick={selectAllCortes}
                                    class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                >
                                    Todos ({(data.vendedores || []).length})
                                </button>
                                <button
                                    type="button"
                                    onclick={deselectAllCortes}
                                    class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                >
                                    Ninguno
                                </button>
                            </div>
                        </div>

                        <!-- Barra de Pills / Vendedores -->
                        <div class="space-y-2">
                            <div class="flex items-center justify-between gap-2">
                                <span class="text-xs font-black uppercase tracking-wider text-text-muted">
                                    Filtrar Vendedores en Gráfica
                                </span>
                                <span class="text-xs text-text-muted">
                                    {visibleVendorsCortes.size} de {(data.vendedores || []).length} visibles
                                </span>
                            </div>
                            <div class="flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar p-1">
                                {#each (data.vendedores || []) as v}
                                    {@const isVisible = visibleVendorsCortes.has(v.co_ven)}
                                    {@const color = vendorColorMap.get(v.co_ven) || '#3b82f6'}
                                    <button
                                        type="button"
                                        onclick={() => toggleVendorCortes(v.co_ven)}
                                        class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer {isVisible
                                            ? 'bg-surface-raised border-border-subtle text-text-base shadow-sm'
                                            : 'bg-surface-base/50 border-border-subtle/40 text-text-muted/50 opacity-60'}"
                                    >
                                        <span
                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                            style="background-color: {isVisible ? color : '#94a3b8'}"
                                        ></span>
                                        <span class="truncate max-w-[150px]">{(v.ven_des || v.co_ven).trim().toUpperCase()}</span>
                                        {#if v.inactivo}
                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1 py-0.5 rounded">Inactivo</span>
                                        {/if}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <div class="relative w-full" style="height: 380px;">
                            {#if visibleVendorsCortes.size > 0}
                                <canvas bind:this={compChartCanvas}></canvas>
                            {:else}
                                <div class="h-full flex flex-col items-center justify-center text-center p-8 bg-surface-raised/50 rounded-2xl border border-dashed border-border-subtle">
                                    <EyeOff size={36} class="text-text-muted mb-2" />
                                    <p class="text-sm font-bold text-text-base">Ningún vendedor seleccionado</p>
                                    <p class="text-xs text-text-muted mt-1">Haz clic en los botones superiores para activar vendedores en la gráfica.</p>
                                </div>
                            {/if}
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
                                          : 'Mensual'} por Vendedor (Servicios de Cortes)
                                </span>
                                <span
                                    class="text-[10px] text-text-muted font-medium lg:hidden"
                                >
                                    ← Desliza para ver todos los períodos →
                                </span>
                            </div>

                            <div class="w-full overflow-x-auto custom-scrollbar pb-2">
                                <div class="flex gap-2.5 min-w-full">
                                    {#each breakdownCortes.periods as p}
                                        {@const isMax =
                                            p.total === breakdownCortes.maxPeriodTotal &&
                                            breakdownCortes.maxPeriodTotal > 0}
                                        <div
                                            class="flex-1 min-w-[170px] sm:min-w-[200px] p-3 rounded-2xl border transition-all flex flex-col justify-between {isMax
                                                ? 'bg-rose-500/10 border-rose-500/50 ring-1 ring-rose-500/20'
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
                                                    class="text-[11px] font-mono font-black text-rose-500 shrink-0"
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
                                                        0 servicios de cortes
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

                            <!-- TABLA / RANKING DE SERVICIOS DE CORTE POR ASESOR -->
                            <div class="mt-8 pt-6 border-t border-border-subtle/80 space-y-6">
                                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle/60">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="p-2.5 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20"
                                        >
                                            <Award size={22} />
                                        </div>
                                        <div>
                                            <h3 class="text-base sm:text-lg font-black text-text-base flex items-center gap-2">
                                                Ranking de Servicios de Corte por Asesor
                                            </h3>
                                            <p class="text-xs text-text-muted">
                                                Total de servicios de corte facturados en documentos exitosos por asesor en el rango de fechas.
                                            </p>
                                        </div>
                                    </div>
                                    <div class="relative w-full sm:w-64">
                                        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <input
                                            type="text"
                                            bind:value={vendorFilterSearchCortes}
                                            placeholder="Buscar vendedor..."
                                            class="w-full bg-surface-base border border-border-subtle rounded-xl pl-9 pr-3 py-2 text-xs text-text-base focus:outline-none focus:border-brand-500"
                                        />
                                    </div>
                                </div>

                                <div class="overflow-x-auto custom-scrollbar">
                                    <table class="w-full text-left text-xs">
                                        <thead>
                                            <tr class="border-b border-border-subtle text-text-muted font-black uppercase text-[10px]">
                                                <th class="py-3 px-4">#</th>
                                                <th class="py-3 px-4">Código</th>
                                                <th class="py-3 px-4">Asesor Comercial</th>
                                                <th class="py-3 px-4 text-right">Servicios de Corte (Rango)</th>
                                                <th class="py-3 px-4 text-right">% del Total</th>
                                                <th class="py-3 px-4 text-center">Estado en Gráfica</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-border-subtle/40 font-medium">
                                            {#each rankingCortes.filter((t) => !vendorFilterSearchCortes || t.ven_des.toLowerCase().includes(vendorFilterSearchCortes.toLowerCase()) || t.co_ven.toLowerCase().includes(vendorFilterSearchCortes.toLowerCase())) as item, idx}
                                                {@const pct = totales.cortes > 0 ? ((item.cortes / totales.cortes) * 100).toFixed(2) : '0.00'}
                                                {@const color = vendorColorMap.get(item.co_ven) || '#3b82f6'}
                                                {@const isVis = visibleVendorsCortes.has(item.co_ven)}
                                                <tr class="hover:bg-surface-soft/60 transition-colors">
                                                    <td class="py-3 px-4 font-mono font-bold text-text-muted">
                                                        {idx + 1}
                                                    </td>
                                                    <td class="py-3 px-4 font-mono text-text-muted">
                                                        {item.co_ven}
                                                    </td>
                                                    <td class="py-3 px-4 font-bold text-text-base flex items-center gap-2">
                                                        <span
                                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                                            style="background-color: {color}"
                                                        ></span>
                                                        {item.ven_des}
                                                        {#if item.inactivo}
                                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded">Inactivo</span>
                                                        {/if}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-black font-mono text-text-base">
                                                        {item.cortes.toLocaleString("es-VE")}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-mono text-rose-600 dark:text-rose-400 font-bold">
                                                        {pct}%
                                                    </td>
                                                    <td class="py-3 px-4 text-center">
                                                        <button
                                                            type="button"
                                                            onclick={() => toggleVendorCortes(item.co_ven)}
                                                            class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer {isVis
                                                                ? 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                                                                : 'bg-surface-raised text-text-muted border-border-subtle'}"
                                                        >
                                                            {isVis ? 'Visible' : 'Oculto'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            {/each}
                                            {#if rankingCortes.length === 0}
                                                <tr>
                                                    <td colspan="6" class="py-8 text-center text-text-muted font-bold">
                                                        No se encontraron datos para mostrar.
                                                    </td>
                                                </tr>
                                            {/if}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                    {:else if activeCompTab === 'art_distintos'}
                        <!-- 8. Artículos Únicos Vendidos (100% Ancho) -->
                        <div
                            class="bg-surface-raised border border-border-subtle hover:border-teal-500/40 transition-all rounded-3xl p-6 sm:p-7 shadow-xl space-y-6"
                        >
                            <div
                                class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle/60 pb-4"
                            >
                                <div class="flex items-center gap-3">
                                    <div
                                        class="p-2.5 rounded-2xl bg-teal-500/10 text-teal-500 border border-teal-500/20"
                                    >
                                        <PackageSearch size={22} />
                                    </div>
                                    <div>
                                        <h3
                                            class="text-base sm:text-lg font-black text-text-base flex items-center gap-2"
                                        >
                                            Artículos Distintos por Vendedor (Documentos Exitosos)
                                        </h3>
                                        <p class="text-xs text-text-muted">
                                            Evolución temporal de cantidad de artículos distintos vendidos en documentos exitosos por cada vendedor en el período.
                                        </p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                                    <span
                                        class="text-[11px] font-mono font-bold text-teal-500 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/20"
                                    >
                                        Total: {totalArticulosDistintosGlobal.toLocaleString("es-VE")}
                                    </span>
                                    <button
                                        type="button"
                                        onclick={selectAllArt}
                                        class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                    >
                                        Todos ({(data.vendedores || []).length})
                                    </button>
                                    <button
                                        type="button"
                                        onclick={deselectAllArt}
                                        class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                    >
                                        Ninguno
                                    </button>
                                </div>
                            </div>

                            <!-- Barra de Pills / Vendedores -->
                            <div class="space-y-2">
                                <div class="flex items-center justify-between gap-2">
                                    <span class="text-xs font-black uppercase tracking-wider text-text-muted">
                                        Filtrar Vendedores en Gráfica
                                    </span>
                                    <span class="text-xs text-text-muted">
                                        {visibleVendorsArt.size} de {(data.vendedores || []).length} visibles
                                    </span>
                                </div>
                                <div class="flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar p-1">
                                    {#each (data.vendedores || []) as v}
                                        {@const isVisible = visibleVendorsArt.has(v.co_ven)}
                                        {@const color = vendorColorMap.get(v.co_ven) || '#3b82f6'}
                                        {@const rankItem = rankingList.find((t: any) => t.co_ven === v.co_ven)}
                                        <button
                                            type="button"
                                            onclick={() => toggleVendorArt(v.co_ven)}
                                            class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer {isVisible
                                                ? 'bg-surface-raised border-border-subtle text-text-base shadow-sm'
                                                : 'bg-surface-base/50 border-border-subtle/40 text-text-muted/50 opacity-60'}"
                                        >
                                            <span
                                                class="w-2.5 h-2.5 rounded-full shrink-0"
                                                style="background-color: {isVisible ? color : '#94a3b8'}"
                                            ></span>
                                            <span class="truncate max-w-[150px]">{(v.ven_des || v.co_ven).trim().toUpperCase()}</span>
                                            {#if v.inactivo}
                                                <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1 py-0.5 rounded">Inactivo</span>
                                            {/if}
                                            {#if rankItem}
                                                <span class="text-[10px] font-mono opacity-70">
                                                    ({rankItem.cant_articulos_unicos})
                                                </span>
                                            {/if}
                                        </button>
                                    {/each}
                                </div>
                            </div>

                            <div class="relative w-full" style="height: 380px;">
                                {#if visibleVendorsArt.size > 0}
                                    <canvas bind:this={compChartCanvas}></canvas>
                                {:else}
                                    <div class="h-full flex flex-col items-center justify-center text-center p-8 bg-surface-raised/50 rounded-2xl border border-dashed border-border-subtle">
                                        <EyeOff size={36} class="text-text-muted mb-2" />
                                        <p class="text-sm font-bold text-text-base">Ningún vendedor seleccionado</p>
                                        <p class="text-xs text-text-muted mt-1">Haz clic en los botones superiores para activar vendedores en la gráfica.</p>
                                    </div>
                                {/if}
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
                                              : 'Mensual'} por Vendedor (Artículos Distintos)
                                    </span>
                                    <span
                                        class="text-[10px] text-text-muted font-medium lg:hidden"
                                    >
                                        ← Desliza para ver todos los períodos →
                                    </span>
                                </div>

                                <div class="w-full overflow-x-auto custom-scrollbar pb-2">
                                    <div class="flex gap-2.5 min-w-full">
                                        {#each breakdownArt.periods as p}
                                            {@const isMax =
                                                p.total === breakdownArt.maxPeriodTotal &&
                                                breakdownArt.maxPeriodTotal > 0}
                                            <div
                                                class="flex-1 min-w-[170px] sm:min-w-[200px] p-3 rounded-2xl border transition-all flex flex-col justify-between {isMax
                                                    ? 'bg-teal-500/10 border-teal-500/50 ring-1 ring-teal-500/20'
                                                    : 'bg-surface-base/80 border-border-subtle/70 hover:border-border-subtle'}"
                                            >
                                                <div>
                                                    <div
                                                        class="flex items-center justify-between gap-1 mb-2 pb-1.5 border-b border-border-subtle/50"
                                                    >
                                                        <span
                                                            class="text-[11px] font-black text-text-base block truncate uppercase tracking-wider"
                                                        >
                                                            {p.periodo}
                                                        </span>
                                                        <span
                                                            class="text-[11px] font-mono font-black text-teal-500 shrink-0"
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
                                                                0 artículos
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
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            </div>

                            <!-- TABLA / RANKING DE VARIEDAD POR ASESOR -->
                            <div class="mt-8 pt-6 border-t border-border-subtle/80 space-y-6">
                                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle/60">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                        >
                                            <Award size={22} />
                                        </div>
                                        <div>
                                            <h3 class="text-base sm:text-lg font-black text-text-base flex items-center gap-2">
                                                Ranking de Variedad por Asesor
                                            </h3>
                                            <p class="text-xs text-text-muted">
                                                Cada artículo se contabiliza 1 sola vez por asesor en todo el rango de fechas seleccionado.
                                            </p>
                                        </div>
                                    </div>
                                    <div class="relative w-full sm:w-64">
                                        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <input
                                            type="text"
                                            bind:value={vendorFilterSearch}
                                            placeholder="Buscar vendedor..."
                                            class="w-full bg-surface-base border border-border-subtle rounded-xl pl-9 pr-3 py-2 text-xs text-text-base focus:outline-none focus:border-brand-500"
                                        />
                                    </div>
                                </div>

                                <div class="overflow-x-auto custom-scrollbar">
                                    <table class="w-full text-left text-xs">
                                        <thead>
                                            <tr class="border-b border-border-subtle text-text-muted font-black uppercase text-[10px]">
                                                <th class="py-3 px-4">#</th>
                                                <th class="py-3 px-4">Código</th>
                                                <th class="py-3 px-4">Asesor Comercial</th>
                                                <th class="py-3 px-4 text-right">Artículos Distintos (Rango)</th>
                                                <th class="py-3 px-4 text-right">% Catálogo Activo</th>
                                                <th class="py-3 px-4 text-center">Estado en Gráfica</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-border-subtle/40 font-medium">
                                            {#each rankingList.filter((t: any) => !vendorFilterSearch || (t.ven_des || '').toLowerCase().includes(vendorFilterSearch.toLowerCase()) || t.co_ven.toLowerCase().includes(vendorFilterSearch.toLowerCase())) as item, idx}
                                                {@const pctCatalogo = totalArticulosActivos > 0 ? ((item.cant_articulos_unicos / totalArticulosActivos) * 100).toFixed(2) : '0.00'}
                                                {@const color = vendorColorMap.get(item.co_ven) || '#3b82f6'}
                                                {@const isVis = visibleVendorsArt.has(item.co_ven)}
                                                <tr class="hover:bg-surface-soft/60 transition-colors">
                                                    <td class="py-3 px-4 font-mono font-bold text-text-muted">
                                                        {idx + 1}
                                                    </td>
                                                    <td class="py-3 px-4 font-mono text-text-muted">
                                                        {item.co_ven}
                                                    </td>
                                                    <td class="py-3 px-4 font-bold text-text-base flex items-center gap-2">
                                                        <span
                                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                                            style="background-color: {color}"
                                                        ></span>
                                                        {(item.ven_des || item.co_ven).trim().toUpperCase()}
                                                        {#if item.inactivo}
                                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded">Inactivo</span>
                                                        {/if}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-black font-mono text-text-base">
                                                        {item.cant_articulos_unicos.toLocaleString("es-VE")}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                                                        {pctCatalogo}%
                                                    </td>
                                                    <td class="py-3 px-4 text-center">
                                                        <button
                                                            type="button"
                                                            onclick={() => toggleVendorArt(item.co_ven)}
                                                            class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer {isVis
                                                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                                                                : 'bg-surface-raised text-text-muted border-border-subtle'}"
                                                        >
                                                            {isVis ? 'Visible' : 'Oculto'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            {/each}
                                            {#if rankingList.length === 0}
                                                <tr>
                                                    <td colspan="6" class="py-8 text-center text-text-muted font-bold">
                                                        No se encontraron datos para mostrar.
                                                    </td>
                                                </tr>
                                            {/if}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    {:else if activeCompTab === 'art_pedidos'}
                        <!-- 9. Artículos Únicos Pedidos (100% Ancho) -->
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
                                        <PackagePlus size={22} />
                                    </div>
                                    <div>
                                        <h3
                                            class="text-base sm:text-lg font-black text-text-base flex items-center gap-2"
                                        >
                                            Artículos Distintos por Vendedor (Pedidos de Venta)
                                        </h3>
                                        <p class="text-xs text-text-muted">
                                            Evolución temporal de cantidad de artículos distintos pedidos por cada vendedor en el período.
                                        </p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                                    <span
                                        class="text-[11px] font-mono font-bold text-purple-500 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20"
                                    >
                                        Total: {totalArtPedidosGlobal.toLocaleString("es-VE")}
                                    </span>
                                    <button
                                        type="button"
                                        onclick={selectAllArtPed}
                                        class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                    >
                                        Todos ({(data.vendedores || []).length})
                                    </button>
                                    <button
                                        type="button"
                                        onclick={deselectAllArtPed}
                                        class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                    >
                                        Ninguno
                                    </button>
                                </div>
                            </div>

                            <!-- Barra de Pills / Vendedores -->
                            <div class="space-y-2">
                                <div class="flex items-center justify-between gap-2">
                                    <span class="text-xs font-black uppercase tracking-wider text-text-muted">
                                        Filtrar Vendedores en Gráfica
                                    </span>
                                    <span class="text-xs text-text-muted">
                                        {visibleVendorsArtPed.size} de {(data.vendedores || []).length} visibles
                                    </span>
                                </div>
                                <div class="flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar p-1">
                                    {#each (data.vendedores || []) as v}
                                        {@const isVisible = visibleVendorsArtPed.has(v.co_ven)}
                                        {@const color = vendorColorMap.get(v.co_ven) || '#3b82f6'}
                                        {@const rankItem = rankingArtPedidos.find((t: any) => t.co_ven === v.co_ven)}
                                        <button
                                            type="button"
                                            onclick={() => toggleVendorArtPed(v.co_ven)}
                                            class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer {isVisible
                                                ? 'bg-surface-raised border-border-subtle text-text-base shadow-sm'
                                                : 'bg-surface-base/50 border-border-subtle/40 text-text-muted/50 opacity-60'}"
                                        >
                                            <span
                                                class="w-2.5 h-2.5 rounded-full shrink-0"
                                                style="background-color: {isVisible ? color : '#94a3b8'}"
                                            ></span>
                                            <span class="truncate max-w-[150px]">{(v.ven_des || v.co_ven).trim().toUpperCase()}</span>
                                            {#if v.inactivo}
                                                <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1 py-0.5 rounded">Inactivo</span>
                                            {/if}
                                            {#if rankItem}
                                                <span class="text-[10px] font-mono opacity-70">
                                                    ({rankItem.cant_articulos_unicos})
                                                </span>
                                            {/if}
                                        </button>
                                    {/each}
                                </div>
                            </div>

                            <div class="relative w-full" style="height: 380px;">
                                {#if visibleVendorsArtPed.size > 0}
                                    <canvas bind:this={compChartCanvas}></canvas>
                                {:else}
                                    <div class="h-full flex flex-col items-center justify-center text-center p-8 bg-surface-raised/50 rounded-2xl border border-dashed border-border-subtle">
                                        <EyeOff size={36} class="text-text-muted mb-2" />
                                        <p class="text-sm font-bold text-text-base">Ningún vendedor seleccionado</p>
                                        <p class="text-xs text-text-muted mt-1">Haz clic en los botones superiores para activar vendedores en la gráfica.</p>
                                    </div>
                                {/if}
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
                                              : 'Mensual'} por Vendedor (Artículos Pedidos)
                                    </span>
                                    <span
                                        class="text-[10px] text-text-muted font-medium lg:hidden"
                                    >
                                        ← Desliza para ver todos los períodos →
                                    </span>
                                </div>

                                <div class="w-full overflow-x-auto custom-scrollbar pb-2">
                                    <div class="flex gap-2.5 min-w-full">
                                        {#each breakdownArtPed.periods as p}
                                            {@const isMax =
                                                p.total === breakdownArtPed.maxPeriodTotal &&
                                                breakdownArtPed.maxPeriodTotal > 0}
                                            <div
                                                class="flex-1 min-w-[170px] sm:min-w-[200px] p-3 rounded-2xl border transition-all flex flex-col justify-between {isMax
                                                    ? 'bg-purple-500/10 border-purple-500/50 ring-1 ring-purple-500/20'
                                                    : 'bg-surface-base/80 border-border-subtle/70 hover:border-border-subtle'}"
                                            >
                                                <div>
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
                                                                0 artículos
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
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            </div>

                            <!-- TABLA / RANKING DE VARIEDAD POR ASESOR (PEDIDOS) -->
                            <div class="mt-8 pt-6 border-t border-border-subtle/80 space-y-6">
                                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle/60">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="p-2.5 rounded-2xl bg-purple-500/10 text-purple-500 border border-purple-500/20"
                                        >
                                            <Award size={22} />
                                        </div>
                                        <div>
                                            <h3 class="text-base sm:text-lg font-black text-text-base flex items-center gap-2">
                                                Ranking de Variedad por Asesor (Pedidos)
                                            </h3>
                                            <p class="text-xs text-text-muted">
                                                Cada artículo se contabiliza 1 sola vez por asesor en todos sus pedidos de venta del rango seleccionado.
                                            </p>
                                        </div>
                                    </div>
                                    <div class="relative w-full sm:w-64">
                                        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <input
                                            type="text"
                                            bind:value={vendorFilterSearchPedArt}
                                            placeholder="Buscar vendedor..."
                                            class="w-full bg-surface-base border border-border-subtle rounded-xl pl-9 pr-3 py-2 text-xs text-text-base focus:outline-none focus:border-brand-500"
                                        />
                                    </div>
                                </div>

                                <div class="overflow-x-auto custom-scrollbar">
                                    <table class="w-full text-left text-xs">
                                        <thead>
                                            <tr class="border-b border-border-subtle text-text-muted font-black uppercase text-[10px]">
                                                <th class="py-3 px-4">#</th>
                                                <th class="py-3 px-4">Código</th>
                                                <th class="py-3 px-4">Asesor Comercial</th>
                                                <th class="py-3 px-4 text-right">Artículos Distintos (Rango)</th>
                                                <th class="py-3 px-4 text-right">% Catálogo Activo</th>
                                                <th class="py-3 px-4 text-center">Estado en Gráfica</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-border-subtle/40 font-medium">
                                            {#each rankingArtPedidos.filter((t: any) => !vendorFilterSearchPedArt || (t.ven_des || '').toLowerCase().includes(vendorFilterSearchPedArt.toLowerCase()) || t.co_ven.toLowerCase().includes(vendorFilterSearchPedArt.toLowerCase())) as item, idx}
                                                {@const pctCatalogo = totalArticulosActivos > 0 ? ((item.cant_articulos_unicos / totalArticulosActivos) * 100).toFixed(2) : '0.00'}
                                                {@const color = vendorColorMap.get(item.co_ven) || '#3b82f6'}
                                                {@const isVis = visibleVendorsArtPed.has(item.co_ven)}
                                                <tr class="hover:bg-surface-soft/60 transition-colors">
                                                    <td class="py-3 px-4 font-mono font-bold text-text-muted">
                                                        {idx + 1}
                                                    </td>
                                                    <td class="py-3 px-4 font-mono text-text-muted">
                                                        {item.co_ven}
                                                    </td>
                                                    <td class="py-3 px-4 font-bold text-text-base flex items-center gap-2">
                                                        <span
                                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                                            style="background-color: {color}"
                                                        ></span>
                                                        {(item.ven_des || item.co_ven).trim().toUpperCase()}
                                                        {#if item.inactivo}
                                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded">Inactivo</span>
                                                        {/if}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-black font-mono text-text-base">
                                                        {item.cant_articulos_unicos.toLocaleString("es-VE")}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-mono text-purple-600 dark:text-purple-400 font-bold">
                                                        {pctCatalogo}%
                                                    </td>
                                                    <td class="py-3 px-4 text-center">
                                                        <button
                                                            type="button"
                                                            onclick={() => toggleVendorArtPed(item.co_ven)}
                                                            class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer {isVis
                                                                ? 'bg-purple-500/10 text-purple-500 border-purple-500/30'
                                                                : 'bg-surface-raised text-text-muted border-border-subtle'}"
                                                        >
                                                            {isVis ? 'Visible' : 'Oculto'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            {/each}
                                            {#if rankingArtPedidos.length === 0}
                                                <tr>
                                                    <td colspan="6" class="py-8 text-center text-text-muted font-bold">
                                                        No se encontraron datos para mostrar.
                                                    </td>
                                                </tr>
                                            {/if}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    {:else if activeCompTab === 'art_cotizados'}
                        <!-- 10. Artículos Únicos Cotizados (100% Ancho) -->
                        <div
                            class="bg-surface-raised border border-border-subtle hover:border-indigo-500/40 transition-all rounded-3xl p-6 sm:p-7 shadow-xl space-y-6"
                        >
                            <div
                                class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle/60 pb-4"
                            >
                                <div class="flex items-center gap-3">
                                    <div
                                        class="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20"
                                    >
                                        <FileSpreadsheet size={22} />
                                    </div>
                                    <div>
                                        <h3
                                            class="text-base sm:text-lg font-black text-text-base flex items-center gap-2"
                                        >
                                            Artículos Distintos por Vendedor (Cotizaciones)
                                        </h3>
                                        <p class="text-xs text-text-muted">
                                            Evolución temporal de cantidad de artículos distintos cotizados por cada vendedor en el período.
                                        </p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                                    <span
                                        class="text-[11px] font-mono font-bold text-indigo-500 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20"
                                    >
                                        Total: {totalArtCotizadosGlobal.toLocaleString("es-VE")}
                                    </span>
                                    <button
                                        type="button"
                                        onclick={selectAllArtCot}
                                        class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                    >
                                        Todos ({(data.vendedores || []).length})
                                    </button>
                                    <button
                                        type="button"
                                        onclick={deselectAllArtCot}
                                        class="px-3 py-1 rounded-xl text-xs font-bold bg-surface-raised border border-border-subtle text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                                    >
                                        Ninguno
                                    </button>
                                </div>
                            </div>

                            <!-- Barra de Pills / Vendedores -->
                            <div class="space-y-2">
                                <div class="flex items-center justify-between gap-2">
                                    <span class="text-xs font-black uppercase tracking-wider text-text-muted">
                                        Filtrar Vendedores en Gráfica
                                    </span>
                                    <span class="text-xs text-text-muted">
                                        {visibleVendorsArtCot.size} de {(data.vendedores || []).length} visibles
                                    </span>
                                </div>
                                <div class="flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar p-1">
                                    {#each (data.vendedores || []) as v}
                                        {@const isVisible = visibleVendorsArtCot.has(v.co_ven)}
                                        {@const color = vendorColorMap.get(v.co_ven) || '#3b82f6'}
                                        {@const rankItem = rankingArtCotizados.find((t: any) => t.co_ven === v.co_ven)}
                                        <button
                                            type="button"
                                            onclick={() => toggleVendorArtCot(v.co_ven)}
                                            class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer {isVisible
                                                ? 'bg-surface-raised border-border-subtle text-text-base shadow-sm'
                                                : 'bg-surface-base/50 border-border-subtle/40 text-text-muted/50 opacity-60'}"
                                        >
                                            <span
                                                class="w-2.5 h-2.5 rounded-full shrink-0"
                                                style="background-color: {isVisible ? color : '#94a3b8'}"
                                            ></span>
                                            <span class="truncate max-w-[150px]">{(v.ven_des || v.co_ven).trim().toUpperCase()}</span>
                                            {#if v.inactivo}
                                                <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1 py-0.5 rounded">Inactivo</span>
                                            {/if}
                                            {#if rankItem}
                                                <span class="text-[10px] font-mono opacity-70">
                                                    ({rankItem.cant_articulos_unicos})
                                                </span>
                                            {/if}
                                        </button>
                                    {/each}
                                </div>
                            </div>

                            <div class="relative w-full" style="height: 380px;">
                                {#if visibleVendorsArtCot.size > 0}
                                    <canvas bind:this={compChartCanvas}></canvas>
                                {:else}
                                    <div class="h-full flex flex-col items-center justify-center text-center p-8 bg-surface-raised/50 rounded-2xl border border-dashed border-border-subtle">
                                        <EyeOff size={36} class="text-text-muted mb-2" />
                                        <p class="text-sm font-bold text-text-base">Ningún vendedor seleccionado</p>
                                        <p class="text-xs text-text-muted mt-1">Haz clic en los botones superiores para activar vendedores en la gráfica.</p>
                                    </div>
                                {/if}
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
                                              : 'Mensual'} por Vendedor (Artículos Cotizados)
                                    </span>
                                    <span
                                        class="text-[10px] text-text-muted font-medium lg:hidden"
                                    >
                                        ← Desliza para ver todos los períodos →
                                    </span>
                                </div>

                                <div class="w-full overflow-x-auto custom-scrollbar pb-2">
                                    <div class="flex gap-2.5 min-w-full">
                                        {#each breakdownArtCot.periods as p}
                                            {@const isMax =
                                                p.total === breakdownArtCot.maxPeriodTotal &&
                                                breakdownArtCot.maxPeriodTotal > 0}
                                            <div
                                                class="flex-1 min-w-[170px] sm:min-w-[200px] p-3 rounded-2xl border transition-all flex flex-col justify-between {isMax
                                                    ? 'bg-indigo-500/10 border-indigo-500/50 ring-1 ring-indigo-500/20'
                                                    : 'bg-surface-base/80 border-border-subtle/70 hover:border-border-subtle'}"
                                            >
                                                <div>
                                                    <div
                                                        class="flex items-center justify-between gap-1 mb-2 pb-1.5 border-b border-border-subtle/50"
                                                    >
                                                        <span
                                                            class="text-[11px] font-black text-text-base block truncate uppercase tracking-wider"
                                                        >
                                                            {p.periodo}
                                                        </span>
                                                        <span
                                                            class="text-[11px] font-mono font-black text-indigo-500 shrink-0"
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
                                                                0 artículos
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
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            </div>

                            <!-- TABLA / RANKING DE VARIEDAD POR ASESOR (COTIZACIONES) -->
                            <div class="mt-8 pt-6 border-t border-border-subtle/80 space-y-6">
                                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle/60">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20"
                                        >
                                            <Award size={22} />
                                        </div>
                                        <div>
                                            <h3 class="text-base sm:text-lg font-black text-text-base flex items-center gap-2">
                                                Ranking de Variedad por Asesor (Cotizaciones)
                                            </h3>
                                            <p class="text-xs text-text-muted">
                                                Cada artículo se contabiliza 1 sola vez por asesor en todas sus cotizaciones del rango seleccionado.
                                            </p>
                                        </div>
                                    </div>
                                    <div class="relative w-full sm:w-64">
                                        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <input
                                            type="text"
                                            bind:value={vendorFilterSearchCotArt}
                                            placeholder="Buscar vendedor..."
                                            class="w-full bg-surface-base border border-border-subtle rounded-xl pl-9 pr-3 py-2 text-xs text-text-base focus:outline-none focus:border-brand-500"
                                        />
                                    </div>
                                </div>

                                <div class="overflow-x-auto custom-scrollbar">
                                    <table class="w-full text-left text-xs">
                                        <thead>
                                            <tr class="border-b border-border-subtle text-text-muted font-black uppercase text-[10px]">
                                                <th class="py-3 px-4">#</th>
                                                <th class="py-3 px-4">Código</th>
                                                <th class="py-3 px-4">Asesor Comercial</th>
                                                <th class="py-3 px-4 text-right">Artículos Distintos (Rango)</th>
                                                <th class="py-3 px-4 text-right">% Catálogo Activo</th>
                                                <th class="py-3 px-4 text-center">Estado en Gráfica</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-border-subtle/40 font-medium">
                                            {#each rankingArtCotizados.filter((t: any) => !vendorFilterSearchCotArt || (t.ven_des || '').toLowerCase().includes(vendorFilterSearchCotArt.toLowerCase()) || t.co_ven.toLowerCase().includes(vendorFilterSearchCotArt.toLowerCase())) as item, idx}
                                                {@const pctCatalogo = totalArticulosActivos > 0 ? ((item.cant_articulos_unicos / totalArticulosActivos) * 100).toFixed(2) : '0.00'}
                                                {@const color = vendorColorMap.get(item.co_ven) || '#3b82f6'}
                                                {@const isVis = visibleVendorsArtCot.has(item.co_ven)}
                                                <tr class="hover:bg-surface-soft/60 transition-colors">
                                                    <td class="py-3 px-4 font-mono font-bold text-text-muted">
                                                        {idx + 1}
                                                    </td>
                                                    <td class="py-3 px-4 font-mono text-text-muted">
                                                        {item.co_ven}
                                                    </td>
                                                    <td class="py-3 px-4 font-bold text-text-base flex items-center gap-2">
                                                        <span
                                                            class="w-2.5 h-2.5 rounded-full shrink-0"
                                                            style="background-color: {color}"
                                                        ></span>
                                                        {(item.ven_des || item.co_ven).trim().toUpperCase()}
                                                        {#if item.inactivo}
                                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded">Inactivo</span>
                                                        {/if}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-black font-mono text-text-base">
                                                        {item.cant_articulos_unicos.toLocaleString("es-VE")}
                                                    </td>
                                                    <td class="py-3 px-4 text-right font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                                                        {pctCatalogo}%
                                                    </td>
                                                    <td class="py-3 px-4 text-center">
                                                        <button
                                                            type="button"
                                                            onclick={() => toggleVendorArtCot(item.co_ven)}
                                                            class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer {isVis
                                                                ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30'
                                                                : 'bg-surface-raised text-text-muted border-border-subtle'}"
                                                        >
                                                            {isVis ? 'Visible' : 'Oculto'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            {/each}
                                            {#if rankingArtCotizados.length === 0}
                                                <tr>
                                                    <td colspan="6" class="py-8 text-center text-text-muted font-bold">
                                                        No se encontraron datos para mostrar.
                                                    </td>
                                                </tr>
                                            {/if}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    {/if}
</div>
