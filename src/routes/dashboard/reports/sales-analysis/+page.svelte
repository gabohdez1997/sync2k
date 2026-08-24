<script lang="ts">
    import {
        Chart as ChartJS,
        Title,
        Tooltip,
        Legend,
        BarElement,
        CategoryScale,
        LinearScale,
        LineElement,
        PointElement,
        LineController,
        BarController,
        Filler,
    } from "chart.js";
    import {
        Building,
        Calendar,
        TrendingUp,
        Package,
        Search,
        BarChart2,
        RefreshCw,
        X,
        Users,
        Flame,
        ArrowUpDown,
        FileSpreadsheet,
        AlertTriangle,
        ShoppingBag,
    } from "lucide-svelte";
    import Combobox from "$lib/components/ui/Combobox.svelte";
    import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";
    import { goto } from "$app/navigation";
    import { onMount, onDestroy } from "svelte";

    ChartJS.register(
        Title,
        Tooltip,
        Legend,
        BarElement,
        BarController,
        CategoryScale,
        LinearScale,
        LineElement,
        PointElement,
        LineController,
        Filler,
    );

    let { data } = $props();

    let mounted = $state(false);
    let isSyncing = $state(false);

    // Filtros interactivos de consulta (URL)
    let startDate = $state(data.startDate);
    let endDate = $state(data.endDate);
    let selectedBranch = $state(data.branchId);

    // Filtros locales en la tabla
    let searchTerm = $state("");
    let selectedLinea = $state("");
    let selectedSublinea = $state("");
    let selectedCategoria = $state("");
    let selectedCategorizacion = $state(""); // "A", "B", "C", "D", "F"
    let selectedStockStatus = $state(""); // "con_stock", "sin_stock"
    let sortBy = $state<"ventas" | "stock" | "codigo" | "categorizacion">("categorizacion");
    let sortAsc = $state(false);

    // Modal de Detalle por Artículo y Vendedores
    let detailModalOpen = $state(false);
    let selectedArticle = $state<any>(null);
    let articleLoading = $state(false);
    let articleData = $state<any>(null);
    let articleError = $state<string | null>(null);
    let modalChartCanvas = $state<HTMLCanvasElement | null>(null);
    let modalChartInstance: ChartJS | null = null;

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

    onMount(() => {
        mounted = true;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && detailModalOpen) {
                closeArticleModal();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
        };
    });

    onDestroy(() => {
        if (modalChartInstance) {
            modalChartInstance.destroy();
            modalChartInstance = null;
        }
    });

    // Sincronizar filtros cuando cambie data
    $effect(() => {
        startDate = data.startDate;
        endDate = data.endDate;
        selectedBranch = data.branchId;
    });

    // Opciones para filtros
    const branchesOptions = $derived(
        (data.branches || []).map((b: any) => ({
            value: b.id,
            label: b.name,
        })),
    );

    const lineasOptions = $derived(
        (data.catalogs?.lineas || []).map((l: any) => ({
            value: l.co_lin,
            label: l.lin_des ? `${l.lin_des.trim()} (${l.co_lin.trim()})` : l.co_lin,
        })),
    );

    const sublineasOptions = $derived(
        (data.catalogs?.sublineas || [])
            .filter(
                (sl: any) =>
                    !selectedLinea ||
                    (sl.co_lin && sl.co_lin.trim() === selectedLinea.trim()),
            )
            .map((sl: any) => ({
                value: sl.co_subl,
                label: sl.subl_des ? `${sl.subl_des.trim()} (${sl.co_subl.trim()})` : sl.co_subl,
            })),
    );

    const categoriasOptions = $derived.by(() => {
        const cats: any[] = data.catalogs?.categorias || [];
        const analysisCats = (data.analysisData || []).map((a: any) => ({
            co_cat: a.co_cat,
            cat_des: a.des_cat,
            co_subl: a.co_subl,
            co_lin: a.co_lin,
        }));
        const combined = [...cats, ...analysisCats];

        let filtered = combined;
        if (selectedSublinea) {
            filtered = filtered.filter(
                (c: any) =>
                    c.co_subl &&
                    c.co_subl.trim() === selectedSublinea.trim(),
            );
        } else if (selectedLinea) {
            filtered = filtered.filter(
                (c: any) =>
                    c.co_lin &&
                    c.co_lin.trim() === selectedLinea.trim(),
            );
        }

        const seen = new Set();
        const result: { value: string; label: string }[] = [];
        for (const c of filtered) {
            const val = (c.co_cat || "").trim();
            if (val && !seen.has(val)) {
                seen.add(val);
                const desc = (c.cat_des || val).trim();
                result.push({
                    value: val,
                    label: desc ? `${desc} (${val})` : val,
                });
            }
        }
        result.sort((a, b) => a.label.localeCompare(b.label));
        return result;
    });

    // Auto-limpiar sublínea si la línea seleccionada cambia y ya no coincide
    $effect(() => {
        if (selectedLinea && selectedSublinea) {
            const valid = (data.catalogs?.sublineas || []).some(
                (sl: any) =>
                    sl.co_lin &&
                    sl.co_lin.trim() === selectedLinea.trim() &&
                    sl.co_subl &&
                    sl.co_subl.trim() === selectedSublinea.trim(),
            );
            if (!valid) {
                selectedSublinea = "";
            }
        }
    });

    // Auto-limpiar categoría si la sublínea o línea cambia y la categoría ya no pertenece a las opciones disponibles
    $effect(() => {
        if (selectedCategoria && (selectedSublinea || selectedLinea)) {
            const valid = categoriasOptions.some(
                (c) => c.value.trim() === selectedCategoria.trim(),
            );
            if (!valid) {
                selectedCategoria = "";
            }
        }
    });

    const categorizacionOptions = [
        { value: "A", label: "Clase A (> 75% de vendedores)" },
        { value: "B", label: "Clase B (50% a 75% de vendedores)" },
        { value: "C", label: "Clase C (25% a 50% de vendedores)" },
        { value: "D", label: "Clase D (< 25% de vendedores)" },
        { value: "F", label: "Clase F (Sin ventas - 0% de vendedores)" },
    ];

    const stockStatusOptions = [
        { value: "con_stock", label: "🟢 Con Stock Disponible" },
        { value: "sin_stock", label: "🔴 Sin Stock (Agotado)" },
    ];

    // Mapeo dinámico y semántico de unidades fraccionables
    const fractionalCodes = ["06", "07", "08", "10", "25"];
    const fractionalKeywords = [
        "MTS2", "MTS", "LTS", "KG", "ML", "M2", "M3", "MT", "LT", "KGS",
        "KILO", "KILOS", "KILOGRAMO", "KILOGRAMOS", "GR", "GRS", "GRAMO",
        "GRAMOS", "METRO", "METROS", "LITRO", "LITROS", "MILILITRO", "MILILITROS",
        "TON", "TONELADA", "CENTIMETRO", "CM", "MM", "PULG", "PULGADA", "YARDA",
    ];

    function isFractionalUnit(co_uni?: string, des_uni?: string): boolean {
        const code = String(co_uni || "").trim().toUpperCase();
        const desc = String(des_uni || "").trim().toUpperCase();
        const branchConfigStr = String(
            data.selectedBranch?.allow_decimals_units ||
            data.selectedBranchConfig?.allow_decimals_units ||
            "",
        );
        if (branchConfigStr) {
            const allowedCustom = branchConfigStr
                .split(",")
                .map((s: string) => s.trim().toUpperCase())
                .filter(Boolean);
            if (
                allowedCustom.some(
                    (a: string) =>
                        a === code ||
                        a === desc ||
                        desc.includes(a) ||
                        code.includes(a),
                )
            ) {
                return true;
            }
        }
        return (
            fractionalCodes.includes(code) ||
            fractionalKeywords.includes(code) ||
            fractionalKeywords.includes(desc)
        );
    }

    function formatUnitQty(val: number, itemOrCoUni?: any, des_uni?: string): string {
        let isFrac = false;
        if (typeof itemOrCoUni === "object" && itemOrCoUni !== null) {
            isFrac = isFractionalUnit(itemOrCoUni.co_uni, itemOrCoUni.des_uni);
        } else {
            isFrac = isFractionalUnit(itemOrCoUni, des_uni);
        }
        if (isFrac) {
            return Number(val.toFixed(2)).toLocaleString("es-VE", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
            });
        }
        return Math.ceil(val).toLocaleString("es-VE");
    }

    function setQuickDate(days: number) {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        startDate = start.toISOString().split("T")[0];
        endDate = end.toISOString().split("T")[0];
        applyFilters();
    }

    async function applyFilters() {
        isSyncing = true;
        const params = new URLSearchParams();
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        if (selectedBranch && selectedBranch !== "default")
            params.set("branch_id", selectedBranch);
        await goto(`?${params.toString()}`);
        isSyncing = false;
    }

    function getCategorizacion(item: any) {
        if (item.categorizacion) {
            const grade = item.categorizacion;
            const ventas = Number(item.ventas_netas) || 0;
            const cant = (grade === "F" || ventas <= 0) ? 0 : (Number(item.cant_vendedores) || 0);
            const pct = (grade === "F" || ventas <= 0) ? 0 : (Number(item.pct_vendedores) || 0);
            const total = Number(item.total_vendedores) || (data.totalVendedores || 1);
            const configs: Record<string, { label: string; badgeClass: string; desc: string }> = {
                A: {
                    label: "Clase A",
                    desc: "Más del 75% de vendedores",
                    badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
                },
                B: {
                    label: "Clase B",
                    desc: "50% a 75% de vendedores",
                    badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
                },
                C: {
                    label: "Clase C",
                    desc: "25% a 50% de vendedores",
                    badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
                },
                D: {
                    label: "Clase D",
                    desc: "Menos del 25% de vendedores",
                    badgeClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
                },
                F: {
                    label: "Clase F",
                    desc: "Sin ventas (0% de vendedores)",
                    badgeClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
                },
            };
            const cfg = configs[grade] || configs.F;
            return {
                grade,
                label: cfg.label,
                desc: cfg.desc,
                badgeClass: cfg.badgeClass,
                pct,
                cant,
                total,
            };
        }

        const total = Number(data.totalVendedores || data.kpis?.total_vendedores || 1);
        const cant = Number(item.cant_vendedores) || 0;
        const ventas = Number(item.ventas_netas) || 0;
        const pct = total > 0 ? (cant / total) * 100 : 0;

        if (ventas <= 0 || cant <= 0) {
            return {
                grade: "F",
                label: "Clase F",
                desc: "Sin ventas (0% de vendedores)",
                badgeClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
                pct: 0,
                cant: 0,
                total,
            };
        }
        if (pct > 75) {
            return {
                grade: "A",
                label: "Clase A",
                desc: "Más del 75% de vendedores",
                badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
                pct,
                cant,
                total,
            };
        }
        if (pct >= 50) {
            return {
                grade: "B",
                label: "Clase B",
                desc: "50% a 75% de vendedores",
                badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
                pct,
                cant,
                total,
            };
        }
        if (pct >= 25) {
            return {
                grade: "C",
                label: "Clase C",
                desc: "25% a 50% de vendedores",
                badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
                pct,
                cant,
                total,
            };
        }
        return {
            grade: "D",
            label: "Clase D",
            desc: "Menos del 25% de vendedores",
            badgeClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
            pct,
            cant,
            total,
        };
    }

    function exportToExcel() {
        if (!filteredItems || filteredItems.length === 0) return;

        let csvContent = "\uFEFFsep=;\n";
        csvContent +=
            "Codigo;Descripcion;Linea;Categoria;Unidad;Categorizacion;Vendedores que vendieron;Total Vendedores;Pct Participacion Vendedores;Stock Actual;Ventas Netas;Estado\n";

        for (const item of filteredItems) {
            const co_art = `="${String(item.co_art || "").trim().replace(/"/g, '""')}"`;
            const des_art = `"${String(item.des_art || "").trim().replace(/"/g, '""')}"`;
            const des_lin = `"${String(item.des_lin || "").trim().replace(/"/g, '""')}"`;
            const des_cat = `"${String(item.des_cat || "").trim().replace(/"/g, '""')}"`;
            const uni = `"${getUnitLabel(item)}"`;
            const catInfo = getCategorizacion(item);
            const cat = `"${catInfo.grade}"`;
            const cantVend = catInfo.cant.toString();
            const totVend = catInfo.total.toString();
            const pctVend = `${catInfo.pct.toFixed(2)}%`.replace(".", ",");

            const stock = formatUnitQty(Number(item.stock_actual) || 0, item).replace(".", ",");
            const ventas = formatUnitQty(Number(item.ventas_netas) || 0, item).replace(".", ",");
            const estado = (Number(item.stock_actual) || 0) > 0 ? "Con Stock" : "Sin Stock";

            csvContent += `${co_art};${des_art};${des_lin};${des_cat};${uni};${cat};${cantVend};${totVend};${pctVend};${stock};${ventas};${estado}\n`;
        }

        const blob = new Blob([csvContent], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const filename = `analisis_ventas_${startDate.replace(/-/g, "")}_a_${endDate.replace(/-/g, "")}.csv`;

        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Filtrado de artículos
    const filteredItems = $derived.by(() => {
        let list: any[] = data.analysisData || [];
        if (searchTerm && searchTerm.trim() !== "") {
            const term = searchTerm.trim().toLowerCase();
            list = list.filter(
                (i: any) =>
                    (i.co_art && i.co_art.toLowerCase().includes(term)) ||
                    (i.des_art && i.des_art.toLowerCase().includes(term)) ||
                    (i.des_lin && i.des_lin.toLowerCase().includes(term)) ||
                    (i.des_cat && i.des_cat.toLowerCase().includes(term)),
            );
        }
        if (selectedLinea) {
            list = list.filter(
                (i: any) => i.co_lin && i.co_lin.trim() === selectedLinea.trim(),
            );
        }
        if (selectedSublinea) {
            list = list.filter(
                (i: any) => i.co_subl && i.co_subl.trim() === selectedSublinea.trim(),
            );
        }
        if (selectedCategoria) {
            list = list.filter(
                (i: any) => i.co_cat && i.co_cat.trim() === selectedCategoria.trim(),
            );
        }
        if (selectedCategorizacion) {
            list = list.filter((i: any) => {
                const cat = getCategorizacion(i);
                if (selectedCategorizacion === "CD") {
                    return cat.grade === "C" || cat.grade === "D";
                }
                return cat.grade === selectedCategorizacion;
            });
        }
        if (selectedStockStatus) {
            if (selectedStockStatus === "con_stock") {
                list = list.filter((i: any) => (Number(i.stock_actual) || 0) > 0);
            } else if (selectedStockStatus === "sin_stock") {
                list = list.filter((i: any) => (Number(i.stock_actual) || 0) <= 0);
            }
        }

        // Ordenamiento
        const sorted = [...list];
        sorted.sort((a, b) => {
            let res = 0;
            if (sortBy === "categorizacion") {
                const weights: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
                const catA = getCategorizacion(a);
                const catB = getCategorizacion(b);
                const wA = weights[catA.grade] || 0;
                const wB = weights[catB.grade] || 0;
                res = (wB - wA) || (catB.pct - catA.pct) || ((Number(b.ventas_netas) || 0) - (Number(a.ventas_netas) || 0));
            } else if (sortBy === "ventas") {
                res = (Number(b.ventas_netas) || 0) - (Number(a.ventas_netas) || 0);
            } else if (sortBy === "stock") {
                res = (Number(b.stock_actual) || 0) - (Number(a.stock_actual) || 0);
            } else if (sortBy === "codigo") {
                res = (a.co_art || "").localeCompare(b.co_art || "");
            }
            return sortAsc ? -res : res;
        });

        return sorted;
    });

    const stats = $derived.by(() => {
        const items: any[] = data.analysisData || [];
        let countA = 0;
        let countB = 0;
        let countCD = 0;
        let countF = 0;
        let countConStock = 0;
        let countSinStock = 0;
        let totalVentasNetas = 0;

        for (const item of items) {
            const cat = getCategorizacion(item);
            if (cat.grade === "A") countA++;
            else if (cat.grade === "B") countB++;
            else if (cat.grade === "C" || cat.grade === "D") countCD++;
            else if (cat.grade === "F") countF++;

            const stock = Number(item.stock_actual) || 0;
            if (stock > 0) countConStock++;
            else countSinStock++;

            totalVentasNetas += Number(item.ventas_netas) || 0;
        }

        return {
            total: items.length,
            countA,
            countB,
            countCD,
            countF,
            countConStock,
            countSinStock,
            totalVentasNetas,
        };
    });

    function toggleSort(type: "ventas" | "stock" | "codigo" | "categorizacion") {
        if (sortBy === type) {
            sortAsc = !sortAsc;
        } else {
            sortBy = type;
            sortAsc = false;
        }
    }

    // Abrir Modal de Detalle de Artículo y Vendedores
    async function openArticleModal(item: any) {
        selectedArticle = item;
        detailModalOpen = true;
        articleLoading = true;
        articleError = null;
        articleData = null;

        if (modalChartInstance) {
            modalChartInstance.destroy();
            modalChartInstance = null;
        }

        try {
            const branch = selectedBranch || data.branchId || "default";
            const res = await fetch(
                `/api/agent/sales-analysis?branch_id=${encodeURIComponent(branch)}&co_art=${encodeURIComponent(item.co_art)}&startDate=${startDate}&endDate=${endDate}`,
            );
            const json = await res.json();
            if (res.ok && json.success) {
                articleData = json;
                setTimeout(() => {
                    renderModalChart();
                }, 80);
            } else {
                articleError = json.error || json.message || "Error cargando datos del artículo.";
            }
        } catch (e: any) {
            articleError = e.message || "Error al conectar con el servidor.";
        } finally {
            articleLoading = false;
        }
    }

    function closeArticleModal() {
        detailModalOpen = false;
        selectedArticle = null;
        articleData = null;
        if (modalChartInstance) {
            modalChartInstance.destroy();
            modalChartInstance = null;
        }
    }

    function renderModalChart() {
        if (!modalChartCanvas || !articleData) return;
        if (modalChartInstance) {
            modalChartInstance.destroy();
            modalChartInstance = null;
        }

        const timeline = articleData.timeline || [];
        const labels = timeline.map((t: any) => t.periodo);
        const dataPoints = timeline.map((t: any) => t.total_art);

        const ctx = modalChartCanvas.getContext("2d");
        if (!ctx) return;

        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, "rgba(59, 130, 246, 0.45)");
        gradient.addColorStop(1, "rgba(59, 130, 246, 0.0)");

        modalChartInstance = new ChartJS(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: `Unidades vendidas de ${selectedArticle.des_art || selectedArticle.co_art}`,
                        data: dataPoints,
                        borderColor: "#3b82f6",
                        backgroundColor: gradient,
                        borderWidth: 3,
                        pointBackgroundColor: "#3b82f6",
                        pointBorderColor: "#ffffff",
                        pointBorderWidth: 2,
                        pointRadius: timeline.length > 25 ? 2.5 : 5,
                        pointHoverRadius: 7,
                        tension: 0.3,
                        fill: true,
                        stepped: false,
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
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "rgba(15, 15, 20, 0.95)",
                        titleFont: { size: 12, weight: "bold" },
                        bodyFont: { size: 11 },
                        padding: 12,
                        cornerRadius: 12,
                        callbacks: {
                            label: function (context) {
                                const total = Number(context.parsed.y || 0);
                                const unit = getUnitLabel(selectedArticle);
                                return ` Total Período: ${formatUnitQty(total, selectedArticle)} ${unit}`;
                            },
                            afterBody: function (tooltipItems) {
                                if (tooltipItems.length === 0) return [];
                                const idx = tooltipItems[0].dataIndex;
                                const periodObj = timeline[idx];
                                if (!periodObj || !periodObj.vendedores || periodObj.vendedores.length === 0) {
                                    return [];
                                }
                                const lines = ["", "Asesores con ventas en este período:"];
                                periodObj.vendedores.forEach((v: any) => {
                                    lines.push(` • ${v.ven_des}: ${formatUnitQty(v.cant, selectedArticle)}`);
                                });
                                return lines;
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
                            callback: function (val) {
                                return Number(val).toLocaleString("es-VE");
                            },
                        },
                    },
                },
            },
        });
    }

    function getUnitLabel(item: any): string {
        if (!item) return "UND";
        if (item.des_uni && item.des_uni.trim()) return item.des_uni.trim().toUpperCase();
        if (item.co_uni && item.co_uni.trim()) return item.co_uni.trim().toUpperCase();
        return "UND";
    }

    const topArticleSeller = $derived.by(() => {
        if (!articleData || !articleData.ranking || articleData.ranking.length === 0) return null;
        const activeList = articleData.ranking.filter((r: any) => !r.inactivo && (Number(r.cant_vendida) || 0) > 0);
        if (activeList.length > 0) return activeList[0];
        const anySellerWithSales = articleData.ranking.filter((r: any) => (Number(r.cant_vendida) || 0) > 0);
        return anySellerWithSales.length > 0 ? anySellerWithSales[0] : null;
    });
</script>

<svelte:head>
    <title>Análisis de Ventas por Artículo | Profit Web</title>
</svelte:head>

<div class="p-6 md:p-8 space-y-8 animate-fade-in pb-32 max-w-[1600px] mx-auto">
    <!-- HEADER -->
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div class="space-y-2">
            <h1
                class="text-3xl md:text-5xl font-black text-text-base tracking-tight flex items-center gap-3"
            >
                <ShoppingBag size={40} class="text-brand-500 shrink-0" />
                Análisis de Ventas
            </h1>
            <p class="text-text-muted text-sm max-w-2xl">
                Monitoreo de rotación, stock disponible y categorización de artículos según la cantidad de vendedores que los comercializan. Basado en <b>{data.businessDays || "?"} días hábiles</b> históricos.
            </p>
        </div>

        <div class="flex items-center gap-3 shrink-0">
            <button
                onclick={exportToExcel}
                disabled={!filteredItems || filteredItems.length === 0}
                class="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-black rounded-xl shadow-lg shadow-brand-600/20 hover:shadow-brand-500/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar a Excel (CSV)"
            >
                <FileSpreadsheet size={16} />
                Exportar Excel
            </button>
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
        <!-- CARDS RESUMEN DE ROTACIÓN / PENETRACIÓN DE VENTAS -->
        <div
            class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5"
        >
            <!-- 1. VERDE: CLASE A -->
            <div
                class="bg-surface-raised border transition-all rounded-3xl p-5 relative overflow-hidden group cursor-pointer {selectedCategorizacion ===
                'A'
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/10'
                    : 'border-border-subtle hover:border-emerald-500/40'}"
                onclick={() =>
                    (selectedCategorizacion =
                        selectedCategorizacion === 'A' ? '' : 'A')}
                title="Filtrar por artículos Clase A"
            >
                <div
                    class="absolute right-0 top-0 w-28 h-28 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors"
                ></div>
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="p-2 rounded-xl bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30"
                    >
                        <Flame size={20} />
                    </div>
                    <span
                        class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full {selectedCategorizacion ===
                        'A'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-300 border border-emerald-500/30'}"
                    >
                        {selectedCategorizacion === 'A'
                            ? 'Filtrando'
                            : '> 75% Asesores'}
                    </span>
                </div>
                <p
                    class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5"
                >
                    Clase A (Líderes)
                </p>
                <p
                    class="text-2xl sm:text-3xl font-black text-emerald-800 dark:text-emerald-300"
                >
                    {stats.countA.toLocaleString()}
                </p>
                <p class="text-[10px] text-text-muted mt-1.5 line-clamp-1">
                    Vendidos por más del 75% del equipo.
                </p>
            </div>

            <!-- 2. AZUL: CLASE B -->
            <div
                class="bg-surface-raised border transition-all rounded-3xl p-5 relative overflow-hidden group cursor-pointer {selectedCategorizacion ===
                'B'
                    ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-500/10'
                    : 'border-border-subtle hover:border-blue-500/40'}"
                onclick={() =>
                    (selectedCategorizacion =
                        selectedCategorizacion === 'B' ? '' : 'B')}
                title="Filtrar por artículos Clase B"
            >
                <div
                    class="absolute right-0 top-0 w-28 h-28 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors"
                ></div>
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="p-2 rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                    >
                        <Users size={20} />
                    </div>
                    <span
                        class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full {selectedCategorizacion ===
                        'B'
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20'}"
                    >
                        {selectedCategorizacion === 'B'
                            ? 'Filtrando'
                            : '50% - 75% Asesores'}
                    </span>
                </div>
                <p
                    class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5"
                >
                    Clase B (Populares)
                </p>
                <p
                    class="text-2xl sm:text-3xl font-black text-blue-700 dark:text-blue-400"
                >
                    {stats.countB.toLocaleString()}
                </p>
                <p class="text-[10px] text-text-muted mt-1.5 line-clamp-1">
                    Vendidos por el 50% al 75% de asesores.
                </p>
            </div>

            <!-- 3. ÁMBAR: CLASE C / D -->
            <div
                class="bg-surface-raised border transition-all rounded-3xl p-5 relative overflow-hidden group cursor-pointer {selectedCategorizacion ===
                'CD' ||
                selectedCategorizacion === 'C' ||
                selectedCategorizacion === 'D'
                    ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-500/10'
                    : 'border-border-subtle hover:border-amber-500/40'}"
                onclick={() =>
                    (selectedCategorizacion =
                        selectedCategorizacion === 'CD' ||
                        selectedCategorizacion === 'C' ||
                        selectedCategorizacion === 'D'
                            ? ''
                            : 'CD')}
                title="Filtrar por artículos Clase C y D"
            >
                <div
                    class="absolute right-0 top-0 w-28 h-28 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-colors"
                ></div>
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="p-2 rounded-xl bg-amber-500/15 text-amber-800 dark:text-yellow-300 border border-amber-500/30"
                    >
                        <Package size={20} />
                    </div>
                    <span
                        class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full {selectedCategorizacion ===
                        'CD' ||
                        selectedCategorizacion === 'C' ||
                        selectedCategorizacion === 'D'
                            ? 'bg-amber-600 text-white'
                            : 'bg-amber-500/15 text-amber-900 dark:text-yellow-300 border border-amber-500/30'}"
                    >
                        {selectedCategorizacion === 'CD' ||
                        selectedCategorizacion === 'C' ||
                        selectedCategorizacion === 'D'
                            ? 'Filtrando'
                            : '< 50% Asesores'}
                    </span>
                </div>
                <p
                    class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5"
                >
                    Clase C / D (Ocasionales)
                </p>
                <p
                    class="text-2xl sm:text-3xl font-black text-amber-800 dark:text-yellow-300"
                >
                    {stats.countCD.toLocaleString()}
                </p>
                <p class="text-[10px] text-text-muted mt-1.5 line-clamp-1">
                    Vendidos por menos del 50% de asesores.
                </p>
            </div>

            <!-- 4. ROJO / ROSE: CLASE F -->
            <div
                class="bg-surface-raised border transition-all rounded-3xl p-5 relative overflow-hidden group cursor-pointer {selectedCategorizacion ===
                'F'
                    ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-500/10'
                    : 'border-border-subtle hover:border-rose-500/40'}"
                onclick={() =>
                    (selectedCategorizacion =
                        selectedCategorizacion === 'F' ? '' : 'F')}
                title="Filtrar por artículos Clase F (Sin ventas)"
            >
                <div
                    class="absolute right-0 top-0 w-28 h-28 bg-rose-500/5 rounded-full blur-2xl group-hover:bg-rose-500/10 transition-colors"
                ></div>
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="p-2 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20"
                    >
                        <AlertTriangle size={20} />
                    </div>
                    <span
                        class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full {selectedCategorizacion ===
                        'F'
                            ? 'bg-rose-600 text-white'
                            : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'}"
                    >
                        {selectedCategorizacion === 'F'
                            ? 'Filtrando'
                            : '0% Ventas'}
                    </span>
                </div>
                <p
                    class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5"
                >
                    Clase F (Sin Ventas)
                </p>
                <p
                    class="text-2xl sm:text-3xl font-black text-rose-700 dark:text-rose-400"
                >
                    {stats.countF.toLocaleString()}
                </p>
                <p class="text-[10px] text-text-muted mt-1.5 line-clamp-1">
                    Artículos sin ventas en el período.
                </p>
            </div>
        </div>

        <!-- FILTROS Y BÚSQUEDA -->
        <div
            class="bg-surface-base border border-border-subtle rounded-[32px] p-6 shadow-xl space-y-4"
        >
            <!-- Fila 1: Buscador (con escáner), Líneas, Sub-Líneas, Categorías -->
            <div
                class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-center"
            >
                <!-- 1. Buscador + Escáner -->
                <div class="flex items-center gap-2 w-full">
                    <div class="relative flex-1 h-12">
                        <input
                            type="text"
                            placeholder="Buscar por código o descripción..."
                            bind:value={searchTerm}
                            class="w-full h-full bg-surface-raised pl-10 pr-8 rounded-2xl border border-border-subtle focus:border-brand-500/30 outline-none text-text-base text-sm font-bold placeholder:font-normal placeholder:text-text-muted transition-all"
                        />
                        <Search
                            size={18}
                            class="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
                        />
                        {#if searchTerm}
                            <button
                                onclick={() => (searchTerm = "")}
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-base cursor-pointer"
                            >
                                <X size={14} />
                            </button>
                        {/if}
                    </div>
                    <BarcodeScanner onScan={(code) => (searchTerm = code)} />
                </div>

                <!-- 2. Líneas -->
                <Combobox
                    options={lineasOptions}
                    bind:value={selectedLinea}
                    placeholder="Líneas (Todas)"
                    allLabel="Líneas (Todas)"
                />

                <!-- 3. Sub-Líneas -->
                <Combobox
                    options={sublineasOptions}
                    bind:value={selectedSublinea}
                    placeholder="Sub-Líneas (Todas)"
                    allLabel="Sub-Líneas (Todas)"
                />

                <!-- 4. Categorías -->
                <Combobox
                    options={categoriasOptions}
                    bind:value={selectedCategoria}
                    placeholder="Categorías (Todas)"
                    allLabel="Categorías (Todas)"
                />
            </div>

            <!-- Fila 2: Categorización (por vendedores) & Estado de Stock -->
            <div
                class="grid grid-cols-1 md:grid-cols-2 gap-4 items-center pt-2 border-t border-border-subtle/50"
            >
                <Combobox
                    options={categorizacionOptions}
                    bind:value={selectedCategorizacion}
                    placeholder="Categorización (Todas)"
                    allLabel="Categorización (Todas)"
                />
                <Combobox
                    options={stockStatusOptions}
                    bind:value={selectedStockStatus}
                    placeholder="Estado de Stock (Todos)"
                    allLabel="Estado de Stock (Todos)"
                />
            </div>

            <!-- Fila 3: Sucursal, Fechas & Botón Calcular -->
            <div
                class="flex flex-col xl:flex-row gap-4 items-stretch xl:items-center justify-between pt-2 border-t border-border-subtle/50"
            >
                <!-- Select de Sucursal -->
                <div class="w-full xl:w-80 shrink-0">
                    <Combobox
                        options={branchesOptions}
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
                        onclick={applyFilters}
                        disabled={isSyncing}
                        class="h-12 px-8 rounded-2xl bg-brand-500 text-white font-black hover:scale-105 transition-all shadow-[0_0_20px_rgba(var(--brand-500-rgb),0.3)] w-full sm:w-auto shrink-0 cursor-pointer flex items-center justify-center gap-2"
                    >
                        {#if isSyncing}
                            <RefreshCw size={16} class="animate-spin" />
                        {/if}
                        Calcular
                    </button>
                </div>
            </div>
        </div>
        <!-- TABLA PRINCIPAL 100% ANCHO DE LA CARD -->
        <div class="w-full bg-surface-raised border border-border-subtle rounded-3xl overflow-hidden shadow-xl">
            <div class="overflow-x-auto h-[78vh] min-h-[500px] custom-scrollbar">
                <table class="w-full text-left text-xs border-collapse relative">
                    <thead class="sticky top-0 bg-surface-base/95 backdrop-blur-md z-20 shadow-sm">
                        <tr class="border-b border-border-subtle text-text-muted font-black uppercase text-[10px] tracking-wider">
                            <th class="py-3.5 px-4 w-12 text-center">#</th>
                            <th class="py-3.5 px-4">
                                <button
                                    type="button"
                                    onclick={() => toggleSort("codigo")}
                                    class="flex items-center gap-1.5 hover:text-text-base uppercase cursor-pointer"
                                >
                                    Artículo
                                    <ArrowUpDown size={12} class={sortBy === "codigo" ? "text-brand-500" : "opacity-40"} />
                                </button>
                            </th>
                            <th class="py-3.5 px-4 text-center">
                                <button
                                    type="button"
                                    onclick={() => toggleSort("categorizacion")}
                                    class="inline-flex items-center gap-1.5 hover:text-text-base uppercase cursor-pointer justify-center"
                                >
                                    Categorización
                                    <ArrowUpDown size={12} class={sortBy === "categorizacion" ? "text-brand-500" : "opacity-40"} />
                                </button>
                            </th>
                            <th class="py-3.5 px-4 text-right">
                                <button
                                    type="button"
                                    onclick={() => toggleSort("stock")}
                                    class="inline-flex items-center gap-1.5 hover:text-text-base uppercase cursor-pointer"
                                >
                                    Stock Actual
                                    <ArrowUpDown size={12} class={sortBy === "stock" ? "text-brand-500" : "opacity-40"} />
                                </button>
                            </th>
                            <th class="py-3.5 px-4 text-right">
                                <button
                                    type="button"
                                    onclick={() => toggleSort("ventas")}
                                    class="inline-flex items-center gap-1.5 hover:text-text-base uppercase cursor-pointer"
                                >
                                    Ventas (Rango)
                                    <ArrowUpDown size={12} class={sortBy === "ventas" ? "text-brand-500" : "opacity-40"} />
                                </button>
                            </th>
                            <th class="py-3.5 px-4 text-center">Acción</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border-subtle font-medium">
                        {#each filteredItems as item, idx}
                            {@const stockVal = Number(item.stock_actual) || 0}
                            {@const hasStock = stockVal > 0}
                            {@const unit = getUnitLabel(item)}
                            {@const catInfo = getCategorizacion(item)}
                            <tr
                                onclick={() => openArticleModal(item)}
                                class="hover:bg-surface-soft/80 transition-colors cursor-pointer group {selectedArticle?.co_art === item.co_art && detailModalOpen ? 'bg-brand-500/10' : ''}"
                            >
                                <!-- Índice -->
                                <td class="py-3.5 px-4 text-center font-mono font-bold text-text-muted text-[11px]">
                                    {idx + 1}
                                </td>

                                <!-- Artículo (Código + Descripción + Categorías) -->
                                <td class="py-3.5 px-4 min-w-[280px]">
                                    <div class="space-y-0.5">
                                        <div class="flex items-center gap-2">
                                            <span class="font-mono font-black text-brand-600 dark:text-brand-400 text-xs">
                                                {item.co_art}
                                            </span>
                                            <span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-surface-base text-text-muted border border-border-subtle">
                                                {unit}
                                            </span>
                                        </div>
                                        <p class="font-bold text-text-base text-xs group-hover:text-brand-500 transition-colors line-clamp-2">
                                            {item.des_art || item.co_art}
                                        </p>
                                        <div class="flex items-center gap-2 text-[10px] text-text-muted">
                                            {#if item.des_lin}
                                                <span class="truncate max-w-[150px]">{item.des_lin}</span>
                                            {/if}
                                            {#if item.des_cat}
                                                <span>•</span>
                                                <span class="truncate max-w-[150px]">{item.des_cat}</span>
                                            {/if}
                                        </div>
                                    </div>
                                </td>

                                <!-- Categorización según vendedores -->
                                <td class="py-3.5 px-4 text-center">
                                    <div class="inline-flex flex-col items-center gap-0.5">
                                        <span
                                            class="text-xs font-black px-2.5 py-0.5 rounded-lg border {catInfo.badgeClass}"
                                            title="{catInfo.label}: {catInfo.desc} ({catInfo.cant}/{catInfo.total} asesores)"
                                        >
                                            {catInfo.label}
                                        </span>
                                        <span class="text-[10px] text-text-muted font-mono font-bold">
                                            {catInfo.pct.toFixed(0)}% ({catInfo.cant}/{catInfo.total} vend.)
                                        </span>
                                    </div>
                                </td>

                                <!-- Stock Actual -->
                                <td class="py-3.5 px-4 text-right font-mono">
                                    <div class="inline-flex flex-col items-end">
                                        <span class="font-black text-xs {hasStock ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}">
                                            {formatUnitQty(stockVal, item)}
                                        </span>
                                        <span class="text-[9px] font-bold {hasStock ? 'text-emerald-600/70 dark:text-emerald-400/70' : 'text-rose-500/70'}">
                                            {hasStock ? 'Disponible' : 'Agotado'}
                                        </span>
                                    </div>
                                </td>

                                <!-- Ventas Netas Totales -->
                                <td class="py-3.5 px-4 text-right font-mono font-black text-xs text-text-base">
                                    {formatUnitQty(Number(item.ventas_netas) || 0, item)}
                                </td>

                                <!-- Botón Acción -->
                                <td class="py-3.5 px-4 text-center">
                                    <button
                                        type="button"
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            openArticleModal(item);
                                        }}
                                        class="px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-500/10 hover:bg-brand-500 hover:text-white text-brand-500 border border-brand-500/20 transition-all flex items-center gap-1.5 mx-auto cursor-pointer"
                                    >
                                        <BarChart2 size={13} />
                                        <span>Vendedores</span>
                                    </button>
                                </td>
                            </tr>
                        {/each}

                        {#if filteredItems.length === 0}
                            <tr>
                                <td colspan="6" class="py-16 text-center text-text-muted space-y-2">
                                    <Package size={36} class="mx-auto opacity-30 mb-2" />
                                    <p class="text-sm font-bold text-text-base">No se encontraron artículos</p>
                                    <p class="text-xs">Prueba ajustando los filtros de búsqueda, categorías o rango de fechas.</p>
                                </td>
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}
</div>

<!-- MODAL: DETALLE DE ARTÍCULO Y RENDIMIENTO POR VENDEDOR -->
{#if detailModalOpen && selectedArticle}
    {@const catModal = getCategorizacion(selectedArticle)}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
        onclick={closeArticleModal}
        role="dialog"
        aria-modal="true"
    >
        <div
            class="bg-surface-raised border border-border-subtle w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
            onclick={(e) => e.stopPropagation()}
            role="document"
        >
            <!-- CABECERA DEL MODAL -->
            <div class="p-6 border-b border-border-subtle/70 flex items-start justify-between gap-4 bg-surface-base/50">
                <div class="space-y-1.5">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-mono font-black text-sm text-brand-500 bg-brand-500/10 px-2.5 py-0.5 rounded-lg border border-brand-500/20">
                            {selectedArticle.co_art}
                        </span>
                        <span class="text-xs font-black uppercase px-2 py-0.5 rounded-lg bg-surface-raised text-text-muted border border-border-subtle">
                            {getUnitLabel(selectedArticle)}
                        </span>
                        <span class="text-xs font-black px-2.5 py-0.5 rounded-lg border {catModal.badgeClass}">
                            {catModal.label} ({catModal.pct.toFixed(0)}% asesores)
                        </span>
                    </div>
                    <h2 class="text-lg sm:text-xl font-black text-text-base">
                        {selectedArticle.des_art || selectedArticle.co_art}
                    </h2>
                    <div class="flex items-center gap-2 text-xs text-text-muted">
                        {#if selectedArticle.des_lin}
                            <span>Línea: <strong>{selectedArticle.des_lin}</strong></span>
                        {/if}
                        {#if selectedArticle.des_cat}
                            <span>•</span>
                            <span>Categoría: <strong>{selectedArticle.des_cat}</strong></span>
                        {/if}
                    </div>
                </div>

                <button
                    type="button"
                    onclick={closeArticleModal}
                    class="p-2 rounded-2xl text-text-muted hover:text-text-base hover:bg-surface-soft border border-border-subtle transition-colors cursor-pointer"
                    aria-label="Cerrar modal"
                >
                    <X size={20} />
                </button>
            </div>

            <!-- CONTENIDO DEL MODAL -->
            <div class="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1">
                {#if articleLoading}
                    <div class="flex flex-col items-center justify-center py-20 text-text-muted space-y-3">
                        <RefreshCw size={36} class="animate-spin text-brand-500" />
                        <p class="text-sm font-bold text-text-base">Consultando ventas y asesores comerciales...</p>
                        <p class="text-xs opacity-70">Procesando histórico de facturas y devoluciones.</p>
                    </div>
                {:else if articleError}
                    <div class="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-center space-y-2">
                        <p class="text-sm font-bold">{articleError}</p>
                        <button
                            type="button"
                            onclick={() => openArticleModal(selectedArticle)}
                            class="px-4 py-1.5 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition-colors cursor-pointer"
                        >
                            Reintentar
                        </button>
                    </div>
                {:else if articleData}
                    <!-- MINI KPIS DEL ARTÍCULO (SOLO CANTIDADES Y VENDEDORES) -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div class="p-4 rounded-2xl bg-surface-base/80 border border-border-subtle/80 space-y-1">
                            <span class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Stock Actual</span>
                            <p class="text-lg sm:text-xl font-black {selectedArticle.stock_actual > 0 ? 'text-emerald-500' : 'text-rose-500'}">
                                {formatUnitQty(selectedArticle.stock_actual, selectedArticle)} {getUnitLabel(selectedArticle)}
                            </p>
                        </div>

                        <div class="p-4 rounded-2xl bg-surface-base/80 border border-border-subtle/80 space-y-1">
                            <span class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Ventas Netas (Rango)</span>
                            <p class="text-lg sm:text-xl font-black text-text-base">
                                {formatUnitQty(articleData.totals?.total_art_vendidos || 0, selectedArticle)} {getUnitLabel(selectedArticle)}
                            </p>
                        </div>

                        <div class="p-4 rounded-2xl bg-surface-base/80 border border-border-subtle/80 space-y-1">
                            <span class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Asesores Activos</span>
                            <p class="text-lg sm:text-xl font-black text-blue-500">
                                {(articleData.ranking || []).filter((r) => !r.inactivo).length} / {catModal.total} ({catModal.pct.toFixed(0)}%)
                            </p>
                        </div>
                    </div>

                    <!-- HERO: TOP VENDEDOR DEL ARTÍCULO (SIN MONTO EN $) -->
                    {#if topArticleSeller}
                        <div class="p-5 rounded-3xl bg-gradient-to-r from-brand-500/15 via-purple-500/10 to-transparent border border-brand-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
                            <div class="flex items-center gap-3.5">
                                <div class="p-3 rounded-2xl bg-brand-500 text-white shadow-lg shadow-brand-500/30 shrink-0">
                                    <Flame size={24} />
                                </div>
                                <div>
                                    <div class="flex items-center gap-2">
                                        <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-600 dark:text-brand-400">
                                            🥇 Asesor Líder de este Artículo
                                        </span>
                                        {#if topArticleSeller.inactivo}
                                            <span class="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded">Inactivo</span>
                                        {/if}
                                    </div>
                                    <h3 class="text-base sm:text-lg font-black text-text-base mt-0.5">
                                        {topArticleSeller.ven_des} ({topArticleSeller.co_ven})
                                    </h3>
                                    <p class="text-xs text-text-muted">
                                        Ha vendido el <strong class="text-brand-500">{topArticleSeller.pct_participacion}%</strong> del total de este artículo en el período.
                                    </p>
                                </div>
                            </div>

                            <div class="text-left sm:text-right bg-surface-raised/80 p-3 rounded-2xl border border-border-subtle shrink-0">
                                <p class="text-[10px] font-bold text-text-muted uppercase">Volumen Vendido</p>
                                <p class="text-xl font-black text-brand-500">
                                    {formatUnitQty(topArticleSeller.cant_vendida, selectedArticle)} {getUnitLabel(selectedArticle)}
                                </p>
                                <p class="text-[10px] font-mono text-text-muted font-bold">
                                    {topArticleSeller.facturas_count} {topArticleSeller.facturas_count === 1 ? 'documento' : 'documentos'}
                                </p>
                            </div>
                        </div>
                    {/if}

                    <!-- GRÁFICA DE EVOLUCIÓN TEMPORAL EN CANTIDAD VENDIDA -->
                    <div class="p-5 rounded-3xl bg-surface-base/80 border border-border-subtle space-y-4 shadow-sm">
                        <div class="flex items-center justify-between">
                            <h3 class="text-sm font-black text-text-base flex items-center gap-2">
                                <TrendingUp size={18} class="text-blue-500" />
                                Evolución Temporal de Unidades Vendidas ({articleData.tipoAgrupacion === 'diario' ? 'Diaria' : articleData.tipoAgrupacion === 'semanal' ? 'Semanal' : 'Mensual'})
                            </h3>
                            <span class="text-xs text-text-muted font-bold">
                                {articleData.timeline?.length || 0} períodos
                            </span>
                        </div>

                        <div class="relative w-full" style="height: 280px;">
                            <canvas bind:this={modalChartCanvas}></canvas>
                        </div>
                    </div>

                    <!-- RANKING COMPLETO DE VENDEDORES (SOLO CANTIDADES Y DOCUMENTOS) -->
                    <div class="space-y-4">
                        <div class="flex items-center justify-between pb-2 border-b border-border-subtle/60">
                            <h3 class="text-sm font-black text-text-base flex items-center gap-2">
                                <Users size={18} class="text-purple-500" />
                                Desglose y Ranking de Unidades Vendidas por Asesor Comercial
                            </h3>
                            <span class="text-xs text-text-muted">
                                {articleData.ranking?.length || 0} asesores registrados
                            </span>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {#each (articleData.ranking || []) as ven, rankIdx}
                                {@const hasSales = (Number(ven.cant_vendida) || 0) > 0}
                                {@const isTop = rankIdx === 0 && hasSales && !ven.inactivo}
                                <div class="p-4 rounded-2xl border transition-all flex flex-col justify-between {isTop
                                    ? 'bg-brand-500/10 border-brand-500/40 shadow-sm'
                                    : hasSales
                                    ? 'bg-surface-base/80 border-border-subtle hover:border-border-subtle/80'
                                    : 'bg-surface-base/40 border-border-subtle/50 opacity-80'}">
                                    <div class="flex items-start justify-between gap-2 mb-2">
                                        <div class="flex items-center gap-2.5 min-w-0">
                                            <span class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 {isTop
                                                ? 'bg-brand-500 text-white shadow-sm'
                                                : hasSales
                                                ? 'bg-surface-raised text-text-muted border border-border-subtle'
                                                : 'bg-surface-base text-text-muted/60 border border-border-subtle/40'}">
                                                {rankIdx + 1}
                                            </span>
                                            <div class="min-w-0">
                                                <h4 class="font-bold text-xs text-text-base truncate flex items-center gap-1.5">
                                                    {ven.ven_des}
                                                    {#if ven.inactivo}
                                                        <span class="text-[8px] font-bold text-rose-500 bg-rose-500/10 px-1 py-0.2 rounded">Inactivo</span>
                                                    {:else if !hasSales}
                                                        <span class="text-[8px] font-bold text-amber-500 bg-amber-500/10 px-1 py-0.2 rounded">Sin ventas</span>
                                                    {/if}
                                                </h4>
                                                <p class="text-[10px] font-mono text-text-muted">{ven.co_ven} • {ven.facturas_count} {ven.facturas_count === 1 ? 'factura' : 'facturas'}</p>
                                            </div>
                                        </div>

                                        <div class="text-right shrink-0">
                                            <span class="font-mono font-black text-sm {hasSales ? 'text-text-base' : 'text-text-muted'}">
                                                {formatUnitQty(ven.cant_vendida, selectedArticle)} {getUnitLabel(selectedArticle)}
                                            </span>
                                            <span class="text-[10px] text-text-muted block font-medium">
                                                {hasSales ? `${ven.facturas_count} ${ven.facturas_count === 1 ? 'doc' : 'docs'}` : '0 docs'}
                                            </span>
                                        </div>
                                    </div>

                                    <!-- Barra de progreso de participación -->
                                    <div class="space-y-1 mt-1">
                                        <div class="flex items-center justify-between text-[10px] font-mono">
                                            <span class="text-text-muted">Participación</span>
                                            <span class="font-bold {hasSales ? 'text-brand-500' : 'text-text-muted'}">{ven.pct_participacion}%</span>
                                        </div>
                                        <div class="w-full bg-surface-raised h-2 rounded-full overflow-hidden border border-border-subtle/50">
                                            <div
                                                class="h-full rounded-full transition-all duration-500 {isTop ? 'bg-brand-500' : hasSales ? 'bg-blue-500/80' : 'bg-transparent'}"
                                                style="width: {ven.pct_participacion}%"
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            {/each}

                            {#if (articleData.ranking || []).length === 0}
                                <div class="col-span-2 py-10 text-center text-text-muted text-xs">
                                    No se registraron ventas para este artículo en el rango de fechas seleccionado.
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>

            <!-- PIE DEL MODAL -->
            <div class="p-4 border-t border-border-subtle/70 bg-surface-base/50 flex items-center justify-between">
                <p class="text-[11px] text-text-muted">
                    Rango evaluado: <strong>{startDate}</strong> al <strong>{endDate}</strong>
                </p>
                <button
                    type="button"
                    onclick={closeArticleModal}
                    class="px-5 py-2 rounded-2xl bg-surface-raised hover:bg-surface-soft border border-border-subtle text-text-base font-bold text-xs transition-colors cursor-pointer"
                >
                    Cerrar
                </button>
            </div>
        </div>
    </div>
{/if}
