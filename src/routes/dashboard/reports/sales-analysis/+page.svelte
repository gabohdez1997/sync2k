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
        ShoppingBag,
        Package,
        Award,
        Layers,
        Eye,
        EyeOff,
        Search,
        BarChart2,
        CheckCircle2,
        FileCheck,
        RefreshCw,
        X,
        Box,
        ShoppingCart,
        Tag,
        Filter,
        ArrowUpRight,
        Users,
        Flame,
        Sparkles,
        ChevronRight,
        Percent,
        Clock,
        FileText,
        ArrowUpDown,
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
    let selectedABC = $state("");
    let selectedXYZ = $state("");
    let selectedStockStatus = $state(""); // "con_stock", "sin_stock"
    let sortBy = $state<"ventas" | "vpd" | "stock" | "codigo" | "monto">("ventas");
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
            label: `${(l.lin_des || l.co_lin).trim()} (${l.co_lin.trim()})`,
        })),
    );

    const sublineasOptions = $derived(
        (data.catalogs?.sublineas || [])
            .filter((sl: any) => !selectedLinea || (sl.co_lin && sl.co_lin.trim() === selectedLinea.trim()))
            .map((sl: any) => ({
                value: sl.co_subl,
                label: `${(sl.subl_des || sl.co_subl).trim()} (${sl.co_subl.trim()})`,
            })),
    );

    const categoriasOptions = $derived(
        (data.catalogs?.categorias || []).map((c: any) => ({
            value: c.co_cat,
            label: `${(c.cat_des || c.co_cat).trim()} (${c.co_cat.trim()})`,
        })),
    );

    const abcOptions = [
        { value: "A", label: "Clase A (80% Valor de Ventas)" },
        { value: "B", label: "Clase B (15% Valor de Ventas)" },
        { value: "C", label: "Clase C (5% Valor de Ventas)" },
    ];

    const xyzOptions = [
        { value: "X", label: "Clase X (Demanda muy regular ≤ 20%)" },
        { value: "Y", label: "Clase Y (Demanda moderada ≤ 60%)" },
        { value: "Z", label: "Clase Z (Demanda esporádica > 60%)" },
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

    function formatCurrency(val: number): string {
        return Number(val || 0).toLocaleString("es-VE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
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

    function resetLocalFilters() {
        searchTerm = "";
        selectedLinea = "";
        selectedSublinea = "";
        selectedCategoria = "";
        selectedABC = "";
        selectedXYZ = "";
        selectedStockStatus = "";
    }

    const hasActiveLocalFilters = $derived(
        Boolean(
            searchTerm ||
            selectedLinea ||
            selectedSublinea ||
            selectedCategoria ||
            selectedABC ||
            selectedXYZ ||
            selectedStockStatus
        )
    );

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
        if (selectedABC) {
            list = list.filter((i: any) => i.clasificacion_abc === selectedABC);
        }
        if (selectedXYZ) {
            list = list.filter((i: any) => i.clasificacion_xyz === selectedXYZ);
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
            if (sortBy === "ventas") {
                res = (b.ventas_netas || 0) - (a.ventas_netas || 0);
            } else if (sortBy === "vpd") {
                res = (b.vpd || 0) - (a.vpd || 0);
            } else if (sortBy === "stock") {
                res = (b.stock_actual || 0) - (a.stock_actual || 0);
            } else if (sortBy === "monto") {
                res = (b.valor_ventas || 0) - (a.valor_ventas || 0);
            } else if (sortBy === "codigo") {
                res = a.co_art.localeCompare(b.co_art);
            }
            return sortAsc ? -res : res;
        });

        return sorted;
    });

    function toggleSort(type: "ventas" | "vpd" | "stock" | "codigo" | "monto") {
        if (sortBy === type) {
            sortAsc = !sortAsc;
        } else {
            sortBy = type;
            sortAsc = false;
        }
    }

    // Estadísticas de los datos filtrados
    const summaryStats = $derived.by(() => {
        const list = filteredItems;
        let totalVentas = 0;
        let totalMonto = 0;
        let conStock = 0;
        let sinStock = 0;

        for (const item of list) {
            totalVentas += Number(item.ventas_netas) || 0;
            totalMonto += Number(item.valor_ventas) || 0;
            if ((Number(item.stock_actual) || 0) > 0) {
                conStock++;
            } else {
                sinStock++;
            }
        }

        const businessDays = data.businessDays || 1;
        const vpdGlobal = businessDays > 0 ? totalVentas / businessDays : 0;

        return {
            totalArticulos: list.length,
            totalVentas,
            totalMonto,
            conStock,
            sinStock,
            vpdGlobal,
        };
    });

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
                // Inicializar gráfica cuando se cargue la data
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

        // Gradiente elegante
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, "rgba(59, 130, 246, 0.45)");
        gradient.addColorStop(1, "rgba(59, 130, 246, 0.0)");

        modalChartInstance = new ChartJS(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: `Ventas de ${selectedArticle.des_art || selectedArticle.co_art}`,
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
                                const idx = context.dataIndex;
                                const periodObj = timeline[idx];
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
                                const lines = ["", "Vendedores en este período:"];
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
        return articleData.ranking[0];
    });
</script>

<svelte:head>
    <title>Análisis de Ventas por Artículo | Profit Web</title>
</svelte:head>

<div class="space-y-6 max-w-[1600px] mx-auto pb-16">
    <!-- CABECERA PRINCIPAL Y FILTROS GENERALES -->
    <div
        class="bg-surface-raised border border-border-subtle rounded-3xl p-6 shadow-xl space-y-6"
    >
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
                <div class="flex items-center gap-3 mb-1">
                    <div
                        class="p-2.5 rounded-2xl bg-brand-500/10 text-brand-500 border border-brand-500/20"
                    >
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <h1 class="text-xl sm:text-2xl font-black text-text-base flex items-center gap-2">
                            Análisis de Ventas por Artículo
                        </h1>
                        <p class="text-xs text-text-muted">
                            Monitoreo de rotación, stock disponible, promedio diario de ventas y rendimiento por asesor comercial.
                        </p>
                    </div>
                </div>
            </div>

            <!-- CONTROLES SUPERIORES (SEDE Y RANGOS RÁPIDOS) -->
            <div class="flex flex-wrap items-center gap-2.5">
                {#if (data.branches || []).length > 1}
                    <div class="w-full sm:w-56">
                        <Combobox
                            options={branchesOptions}
                            bind:value={selectedBranch}
                            onchange={applyFilters}
                            placeholder="Seleccionar sede..."
                            icon={Building}
                            buttonClass="h-10 text-xs"
                        />
                    </div>
                {/if}

                <div class="flex items-center bg-surface-base p-1 rounded-2xl border border-border-subtle">
                    <button
                        type="button"
                        onclick={() => setQuickDate(30)}
                        class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                    >
                        30D
                    </button>
                    <button
                        type="button"
                        onclick={() => setQuickDate(60)}
                        class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                    >
                        60D
                    </button>
                    <button
                        type="button"
                        onclick={() => setQuickDate(90)}
                        class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                    >
                        90D
                    </button>
                    <button
                        type="button"
                        onclick={() => setQuickDate(180)}
                        class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                    >
                        180D
                    </button>
                    <button
                        type="button"
                        onclick={() => setQuickDate(365)}
                        class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer"
                    >
                        1 Año
                    </button>
                </div>
            </div>
        </div>

        <!-- SELECTORES DE FECHA Y BOTÓN APLICAR -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pt-4 border-t border-border-subtle/60">
            <div class="lg:col-span-4 flex items-center gap-2 bg-surface-base border border-border-subtle rounded-2xl px-3 py-1.5">
                <Calendar size={16} class="text-text-muted shrink-0" />
                <div class="flex-1">
                    <label for="startDateInput" class="block text-[9px] font-black uppercase tracking-wider text-text-muted">Desde</label>
                    <input
                        id="startDateInput"
                        type="date"
                        bind:value={startDate}
                        class="w-full bg-transparent text-xs font-bold text-text-base focus:outline-none"
                    />
                </div>
            </div>

            <div class="lg:col-span-4 flex items-center gap-2 bg-surface-base border border-border-subtle rounded-2xl px-3 py-1.5">
                <Calendar size={16} class="text-text-muted shrink-0" />
                <div class="flex-1">
                    <label for="endDateInput" class="block text-[9px] font-black uppercase tracking-wider text-text-muted">Hasta</label>
                    <input
                        id="endDateInput"
                        type="date"
                        bind:value={endDate}
                        class="w-full bg-transparent text-xs font-bold text-text-base focus:outline-none"
                    />
                </div>
            </div>

            <div class="lg:col-span-4 flex items-center gap-2">
                <button
                    type="button"
                    onclick={applyFilters}
                    disabled={isSyncing}
                    class="w-full h-11 rounded-2xl bg-brand-500 hover:bg-brand-600 active:scale-[0.98] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                    <RefreshCw size={16} class={isSyncing ? "animate-spin" : ""} />
                    <span>{isSyncing ? "Consultando..." : "Actualizar Reporte"}</span>
                </button>
            </div>
        </div>
    </div>

    <!-- CARDS DE RESUMEN KPI -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Total Artículos -->
        <div class="bg-surface-raised border border-border-subtle rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-brand-500/40 transition-all">
            <div class="flex items-center justify-between mb-3">
                <div class="p-2.5 rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                    <Package size={22} />
                </div>
                <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-surface-base text-text-muted border border-border-subtle">
                    Catálogo
                </span>
            </div>
            <p class="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-0.5">Artículos Analizados</p>
            <p class="text-2xl sm:text-3xl font-black text-text-base">
                {summaryStats.totalArticulos.toLocaleString("es-VE")}
            </p>
            <p class="text-[10px] text-text-muted mt-1.5 flex items-center gap-1.5">
                <span class="text-emerald-500 font-bold">{summaryStats.conStock} con stock</span> • 
                <span class="text-rose-500 font-bold">{summaryStats.sinStock} sin stock</span>
            </p>
        </div>

        <!-- Unidades Vendidas -->
        <div class="bg-surface-raised border border-border-subtle rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-emerald-500/40 transition-all">
            <div class="flex items-center justify-between mb-3">
                <div class="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    <ShoppingCart size={22} />
                </div>
                <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Neto Facturado
                </span>
            </div>
            <p class="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-0.5">Unidades Vendidas</p>
            <p class="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {Number(summaryStats.totalVentas.toFixed(2)).toLocaleString("es-VE")}
            </p>
            <p class="text-[10px] text-text-muted mt-1.5">
                Total acumulado en el rango seleccionado.
            </p>
        </div>

        <!-- Monto Total Ventas -->
        <div class="bg-surface-raised border border-border-subtle rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-purple-500/40 transition-all">
            <div class="flex items-center justify-between mb-3">
                <div class="p-2.5 rounded-2xl bg-purple-500/10 text-purple-500 border border-purple-500/20">
                    <ShoppingBag size={22} />
                </div>
                <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    Total Facturado
                </span>
            </div>
            <p class="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-0.5">Valor de Ventas</p>
            <p class="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400">
                ${formatCurrency(summaryStats.totalMonto)}
            </p>
            <p class="text-[10px] text-text-muted mt-1.5">
                Facturas menos devoluciones en el rango.
            </p>
        </div>

        <!-- Promedio Diario Global (VPD) -->
        <div class="bg-surface-raised border border-border-subtle rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-amber-500/40 transition-all">
            <div class="flex items-center justify-between mb-3">
                <div class="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    <Clock size={22} />
                </div>
                <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    {data.businessDays || 1} días hábiles
                </span>
            </div>
            <p class="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-0.5">Promedio de Ventas Diario</p>
            <p class="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
                {Number(summaryStats.vpdGlobal.toFixed(2)).toLocaleString("es-VE")}
            </p>
            <p class="text-[10px] text-text-muted mt-1.5">
                Ritmo promedio global de unidades / día.
            </p>
        </div>
    </div>

    <!-- SECCIÓN DE TABLA Y FILTROS AVANZADOS (LÍNEA, SUBLÍNEA, CATEGORÍA, ABC, XYZ, BUSCADOR) -->
    <div class="bg-surface-raised border border-border-subtle rounded-3xl p-6 shadow-xl space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle/60">
            <div>
                <h2 class="text-lg font-black text-text-base flex items-center gap-2">
                    <Layers size={20} class="text-brand-500" />
                    Listado de Artículos Categorizados
                </h2>
                <p class="text-xs text-text-muted">
                    Haz clic en cualquier artículo para abrir su gráfica histórica y ver qué asesor comercial lo vendió más.
                </p>
            </div>

            {#if hasActiveLocalFilters}
                <button
                    type="button"
                    onclick={resetLocalFilters}
                    class="self-start sm:self-auto px-3 py-1.5 rounded-xl text-xs font-bold bg-surface-base border border-border-subtle text-text-muted hover:text-rose-500 hover:border-rose-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                    <X size={14} />
                    <span>Limpiar Filtros</span>
                </button>
            {/if}
        </div>

        <!-- BARRA DE FILTROS AVANZADOS -->
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <!-- Buscador -->
            <div class="sm:col-span-2 relative">
                <Search size={16} class="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                    type="text"
                    bind:value={searchTerm}
                    placeholder="Buscar código, descripción..."
                    class="w-full bg-surface-base border border-border-subtle rounded-2xl pl-10 pr-10 py-2.5 text-xs text-text-base focus:outline-none focus:border-brand-500"
                />
                {#if searchTerm}
                    <button
                        type="button"
                        onclick={() => (searchTerm = "")}
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-base cursor-pointer"
                    >
                        <X size={14} />
                    </button>
                {/if}
            </div>

            <!-- Línea -->
            <div>
                <Combobox
                    options={lineasOptions}
                    bind:value={selectedLinea}
                    placeholder="Todas las Líneas"
                    allLabel="Todas las Líneas"
                    icon={Tag}
                    buttonClass="h-10 text-xs"
                />
            </div>

            <!-- Sublínea -->
            <div>
                <Combobox
                    options={sublineasOptions}
                    bind:value={selectedSublinea}
                    placeholder="Todas las Sublíneas"
                    allLabel="Todas las Sublíneas"
                    icon={Tag}
                    buttonClass="h-10 text-xs"
                />
            </div>

            <!-- Categoría -->
            <div>
                <Combobox
                    options={categoriasOptions}
                    bind:value={selectedCategoria}
                    placeholder="Todas las Categorías"
                    allLabel="Todas las Categorías"
                    icon={Layers}
                    buttonClass="h-10 text-xs"
                />
            </div>

            <!-- Clasificación ABC -->
            <div>
                <Combobox
                    options={abcOptions}
                    bind:value={selectedABC}
                    placeholder="Clasificación ABC"
                    allLabel="Todos (ABC)"
                    icon={Award}
                    buttonClass="h-10 text-xs"
                />
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            <!-- Clasificación XYZ -->
            <div>
                <Combobox
                    options={xyzOptions}
                    bind:value={selectedXYZ}
                    placeholder="Clasificación XYZ"
                    allLabel="Todos (XYZ)"
                    icon={TrendingUp}
                    buttonClass="h-10 text-xs"
                />
            </div>

            <!-- Estado de Stock -->
            <div>
                <Combobox
                    options={stockStatusOptions}
                    bind:value={selectedStockStatus}
                    placeholder="Estado de Stock"
                    allLabel="Todos los Stocks"
                    icon={Box}
                    buttonClass="h-10 text-xs"
                />
            </div>

            <!-- Total de resultados -->
            <div class="sm:col-span-2 flex items-center justify-end gap-3 text-xs text-text-muted font-bold">
                <span>
                    Mostrando <strong class="text-text-base">{filteredItems.length}</strong> de <strong class="text-text-base">{(data.analysisData || []).length}</strong> artículos
                </span>
            </div>
        </div>

        <!-- TABLA DE ARTÍCULOS CATEGORIZADOS -->
        <div class="overflow-x-auto custom-scrollbar border border-border-subtle/80 rounded-2xl">
            <table class="w-full text-left text-xs border-collapse">
                <thead>
                    <tr class="bg-surface-base/80 border-b border-border-subtle text-text-muted font-black uppercase text-[10px] tracking-wider">
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
                        <th class="py-3.5 px-4 text-center">Categorización</th>
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
                        <th class="py-3.5 px-4 text-right">
                            <button
                                type="button"
                                onclick={() => toggleSort("vpd")}
                                class="inline-flex items-center gap-1.5 hover:text-text-base uppercase cursor-pointer"
                            >
                                Promedio Diario (VPD)
                                <ArrowUpDown size={12} class={sortBy === "vpd" ? "text-brand-500" : "opacity-40"} />
                            </button>
                        </th>
                        <th class="py-3.5 px-4 text-right">
                            <button
                                type="button"
                                onclick={() => toggleSort("monto")}
                                class="inline-flex items-center gap-1.5 hover:text-text-base uppercase cursor-pointer"
                            >
                                Monto ($)
                                <ArrowUpDown size={12} class={sortBy === "monto" ? "text-brand-500" : "opacity-40"} />
                            </button>
                        </th>
                        <th class="py-3.5 px-4 text-center">Acción</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle/40 font-medium">
                    {#each filteredItems as item, idx}
                        {@const stockVal = Number(item.stock_actual) || 0}
                        {@const hasStock = stockVal > 0}
                        {@const unit = getUnitLabel(item)}
                        <tr
                            onclick={() => openArticleModal(item)}
                            class="hover:bg-surface-soft/80 transition-colors cursor-pointer group"
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
                                            <span class="truncate max-w-[130px]">{item.des_lin}</span>
                                        {/if}
                                        {#if item.des_cat}
                                            <span>•</span>
                                            <span class="truncate max-w-[130px]">{item.des_cat}</span>
                                        {/if}
                                    </div>
                                </div>
                            </td>

                            <!-- Categorización ABC / XYZ -->
                            <td class="py-3.5 px-4 text-center">
                                <div class="inline-flex items-center gap-1.5">
                                    <!-- ABC -->
                                    <span
                                        class="text-[10px] font-black px-2 py-0.5 rounded-lg border {item.clasificacion_abc === 'A'
                                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                            : item.clasificacion_abc === 'B'
                                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                              : 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30'}"
                                        title="Clasificación ABC por Valor de Ventas"
                                    >
                                        {item.clasificacion_abc || 'C'}
                                    </span>
                                    <!-- XYZ -->
                                    <span
                                        class="text-[10px] font-black px-2 py-0.5 rounded-lg border {item.clasificacion_xyz === 'X'
                                            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                                            : item.clasificacion_xyz === 'Y'
                                              ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
                                              : 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30'}"
                                        title="Clasificación XYZ por Regularidad de Demanda"
                                    >
                                        {item.clasificacion_xyz || 'Z'}
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
                                {formatUnitQty(item.ventas_netas, item)}
                            </td>

                            <!-- Promedio Diario (VPD) -->
                            <td class="py-3.5 px-4 text-right font-mono">
                                <span class="font-bold text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                                    {Number((item.vpd || 0).toFixed(2)).toLocaleString("es-VE")} / día
                                </span>
                            </td>

                            <!-- Monto ($) -->
                            <td class="py-3.5 px-4 text-right font-mono font-black text-xs text-purple-600 dark:text-purple-400">
                                ${formatCurrency(item.valor_ventas)}
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
                            <td colspan="8" class="py-16 text-center text-text-muted space-y-2">
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
</div>

<!-- MODAL: DETALLE DE ARTÍCULO Y RENDIMIENTO POR VENDEDOR -->
{#if detailModalOpen && selectedArticle}
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
                        {#if selectedArticle.clasificacion_abc}
                            <span class="text-xs font-black px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                                Clase {selectedArticle.clasificacion_abc}{selectedArticle.clasificacion_xyz || ''}
                            </span>
                        {/if}
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
                    <!-- MINI KPIS DEL ARTÍCULO -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                            <span class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Promedio Diario (VPD)</span>
                            <p class="text-lg sm:text-xl font-black text-amber-500">
                                {Number((selectedArticle.vpd || 0).toFixed(2)).toLocaleString("es-VE")} / día
                            </p>
                        </div>

                        <div class="p-4 rounded-2xl bg-surface-base/80 border border-border-subtle/80 space-y-1">
                            <span class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Monto Total</span>
                            <p class="text-lg sm:text-xl font-black text-purple-500">
                                ${formatCurrency(articleData.totals?.total_monto_vendidos || 0)}
                            </p>
                        </div>
                    </div>

                    <!-- HERO: TOP VENDEDOR DEL ARTÍCULO -->
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
                                <p class="text-[10px] font-mono text-text-muted">
                                    ${formatCurrency(topArticleSeller.monto_total)} ({topArticleSeller.facturas_count} docs)
                                </p>
                            </div>
                        </div>
                    {/if}

                    <!-- GRÁFICA DE EVOLUCIÓN TEMPORAL -->
                    <div class="p-5 rounded-3xl bg-surface-base/80 border border-border-subtle space-y-4 shadow-sm">
                        <div class="flex items-center justify-between">
                            <h3 class="text-sm font-black text-text-base flex items-center gap-2">
                                <TrendingUp size={18} class="text-blue-500" />
                                Evolución Temporal de Ventas ({articleData.tipoAgrupacion === 'diario' ? 'Diaria' : articleData.tipoAgrupacion === 'semanal' ? 'Semanal' : 'Mensual'})
                            </h3>
                            <span class="text-xs text-text-muted font-bold">
                                {articleData.timeline?.length || 0} períodos
                            </span>
                        </div>

                        <div class="relative w-full" style="height: 280px;">
                            <canvas bind:this={modalChartCanvas}></canvas>
                        </div>
                    </div>

                    <!-- RANKING COMPLETO DE VENDEDORES PARA ESTE ARTÍCULO -->
                    <div class="space-y-4">
                        <div class="flex items-center justify-between pb-2 border-b border-border-subtle/60">
                            <h3 class="text-sm font-black text-text-base flex items-center gap-2">
                                <Users size={18} class="text-purple-500" />
                                Desglose y Ranking de Ventas por Asesor Comercial
                            </h3>
                            <span class="text-xs text-text-muted">
                                {articleData.ranking?.length || 0} asesores con ventas
                            </span>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {#each (articleData.ranking || []) as ven, rankIdx}
                                {@const isTop = rankIdx === 0}
                                {@const color = VENDOR_COLORS[rankIdx % VENDOR_COLORS.length]}
                                <div class="p-4 rounded-2xl border transition-all flex flex-col justify-between {isTop
                                    ? 'bg-brand-500/10 border-brand-500/40 shadow-sm'
                                    : 'bg-surface-base/80 border-border-subtle hover:border-border-subtle/80'}">
                                    <div class="flex items-start justify-between gap-2 mb-2">
                                        <div class="flex items-center gap-2.5 min-w-0">
                                            <span class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 {isTop
                                                ? 'bg-brand-500 text-white shadow-sm'
                                                : 'bg-surface-raised text-text-muted border border-border-subtle'}">
                                                {rankIdx + 1}
                                            </span>
                                            <div class="min-w-0">
                                                <h4 class="font-bold text-xs text-text-base truncate flex items-center gap-1.5">
                                                    {ven.ven_des}
                                                    {#if ven.inactivo}
                                                        <span class="text-[8px] font-bold text-rose-500 bg-rose-500/10 px-1 py-0.2 rounded">Inactivo</span>
                                                    {/if}
                                                </h4>
                                                <p class="text-[10px] font-mono text-text-muted">{ven.co_ven} • {ven.facturas_count} facturas</p>
                                            </div>
                                        </div>

                                        <div class="text-right shrink-0">
                                            <span class="font-mono font-black text-sm text-text-base">
                                                {formatUnitQty(ven.cant_vendida, selectedArticle)}
                                            </span>
                                            <span class="text-[10px] text-text-muted block">
                                                ${formatCurrency(ven.monto_total)}
                                            </span>
                                        </div>
                                    </div>

                                    <!-- Barra de progreso de participación -->
                                    <div class="space-y-1 mt-1">
                                        <div class="flex items-center justify-between text-[10px] font-mono">
                                            <span class="text-text-muted">Participación</span>
                                            <span class="font-bold text-brand-500">{ven.pct_participacion}%</span>
                                        </div>
                                        <div class="w-full bg-surface-raised h-2 rounded-full overflow-hidden border border-border-subtle/50">
                                            <div
                                                class="h-full rounded-full transition-all duration-500 {isTop ? 'bg-brand-500' : 'bg-blue-500/80'}"
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
