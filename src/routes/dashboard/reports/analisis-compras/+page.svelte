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
    } from "chart.js";
    import {
        Building,
        Calendar,
        AlertTriangle,
        TrendingUp,
        DollarSign,
        RefreshCw,
        X,
        Box,
        BarChart,
        Search,
        ShoppingCart,
        ShieldCheck,
        FileSpreadsheet,
    } from "lucide-svelte";
    import Combobox from "$lib/components/ui/Combobox.svelte";
    import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";
    import { invalidate } from "$app/navigation";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import dayjs from "dayjs";

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
    );

    let { data } = $props();

    let isSyncing = $state(false);
    let selectedArticle = $state<any>(null);
    let chartCanvas = $state<HTMLCanvasElement | null>(null);
    let chartInstance: ChartJS | null = null;
    let mounted = $state(false);

    onMount(() => {
        mounted = true;
    });

    // Filtros interactivos
    let startDate = $state(data.startDate);
    let endDate = $state(data.endDate);
    let selectedBranch = $state(data.branchId);

    // Filtros locales de artículos
    let searchTerm = $state("");
    let selectedLinea = $state("");
    let selectedSublinea = $state("");
    let selectedCategoria = $state("");
    let selectedABC = $state("");
    let selectedXYZ = $state("");
    let selectedAlertStatus = $state("");

    const abcOptions = [
        { value: "A", label: "Clase A (Alto Valor - 80% Ventas)" },
        { value: "B", label: "Clase B (Valor Medio - 15% Ventas)" },
        { value: "C", label: "Clase C (Bajo Valor - 5% Ventas)" },
    ];

    const xyzOptions = [
        { value: "X", label: "Clase X (Demanda Estable ≤ 20%)" },
        { value: "Y", label: "Clase Y (Demanda Variable ≤ 60%)" },
        { value: "Z", label: "Clase Z (Demanda Impredecible > 60%)" },
    ];

    const alertOptions = [
        { value: "sin_stock", label: "🚫 Sin Stock (SDR = 0)" },
        { value: "ruptura", label: "🔴 Ruptura Inminente (SDR ≤ ROP)" },
        { value: "riesgo", label: "🟡 Cerca de Ruptura (SDR ≤ ROP+SS)" },
        { value: "sano", label: "🟢 Stock Sano / Exceso" },
    ];

    // Sincronizar cuando data cambie (navegación)
    $effect(() => {
        startDate = data.startDate;
        endDate = data.endDate;
        selectedBranch = data.branchId;
    });

    // Datos filtrados y KPIs
    let items = $derived.by(() => {
        let list: any[] = data.analysisData || [];
        if (searchTerm && searchTerm.trim() !== "") {
            const term = searchTerm.trim().toLowerCase();
            list = list.filter(
                (i: any) =>
                    (i.co_art && i.co_art.toLowerCase().includes(term)) ||
                    (i.des_art && i.des_art.toLowerCase().includes(term)),
            );
        }
        if (selectedLinea) {
            list = list.filter(
                (i: any) =>
                    i.co_lin && i.co_lin.trim() === selectedLinea.trim(),
            );
        }
        if (selectedSublinea) {
            list = list.filter(
                (i: any) =>
                    i.co_subl && i.co_subl.trim() === selectedSublinea.trim(),
            );
        }
        if (selectedCategoria) {
            list = list.filter(
                (i: any) =>
                    i.co_cat && i.co_cat.trim() === selectedCategoria.trim(),
            );
        }
        if (selectedABC) {
            list = list.filter((i: any) => i.clasificacion_abc === selectedABC);
        }
        if (selectedXYZ) {
            list = list.filter((i: any) => i.clasificacion_xyz === selectedXYZ);
        }
        if (selectedAlertStatus) {
            if (selectedAlertStatus === "sin_stock") {
                list = list.filter((i: any) => (i.sdr || 0) <= 0);
            } else if (selectedAlertStatus === "ruptura") {
                list = list.filter((i: any) => i.sdr <= i.rop);
            } else if (selectedAlertStatus === "riesgo") {
                list = list.filter(
                    (i: any) => i.sdr > i.rop && i.sdr <= i.rop + i.ss,
                );
            } else if (selectedAlertStatus === "sano") {
                list = list.filter((i: any) => i.sdr > i.rop + i.ss);
            }
        }
        return list;
    });

    // KPIs derivados dinámicamente según los artículos filtrados por el usuario
    let kpis = $derived.by(() => {
        let capitalInmovilizado = 0;
        let capitalRequerido = 0;
        let alertasSDR = 0;

        items.forEach((item: any) => {
            if (item.sdr > item.rop + item.ss) {
                capitalInmovilizado +=
                    (item.sdr - (item.rop + item.ss)) *
                    (item.costo_actual || 0);
            }

            if (item.sdr <= item.rop) {
                alertasSDR++;
                const cantReponer = Math.max(0, item.rop + item.ss - item.sdr);
                capitalRequerido += cantReponer * (item.costo_actual || 0);
            }
        });

        return {
            capital_inmovilizado: capitalInmovilizado,
            capital_requerido_urgente: capitalRequerido,
            articulos_en_alerta: alertasSDR,
        };
    });

    async function applyFilters() {
        const params = new URLSearchParams();
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        if (selectedBranch && selectedBranch !== "default")
            params.set("branch_id", selectedBranch);
        goto(`?${params.toString()}`);
    }

    async function syncView() {
        if (
            !confirm(
                "¿Deseas enviar el script de la Vista SQL al Agente local? Esto actualizará la base de datos de Profit.",
            )
        )
            return;
        isSyncing = true;
        try {
            const res = await fetch(
                `/api/dashboard/agent-proxy?path=/analisis-compras/sync-view&method=POST&branch=${selectedBranch}`,
            );
            const json = await res.json();
            if (json.success) {
                alert("Vista SQL sincronizada exitosamente.");
                invalidate("app:analisis_compras");
            } else {
                alert("Error: " + json.error);
            }
        } catch (e) {
            alert("Error de conexión.");
        }
        isSyncing = false;
    }

    function getAlertColor(item: any) {
        if (item.sdr <= item.rop)
            return "bg-red-500/10 border-red-500/30 text-red-500";
        if (item.sdr > item.rop + item.ss)
            return "bg-brand-500/10 border-brand-500/30 text-brand-500";
        return "bg-yellow-500/10 border-yellow-500/30 text-yellow-500";
    }

    function formatCurrency(val: number) {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
        }).format(val);
    }

    function exportToExcel() {
        if (!items || items.length === 0) return;

        let csvContent = '\uFEFFsep=;\n';
        csvContent += "Codigo;Descripcion;Clase ABC/XYZ;SDR (Stock);ROP;SS;VPD;TR Promedio (Dias);Ventas Periodo;Pedir Recomendado;Inversion Est. (USD);Estado de Stock\n";

        for (const item of items) {
            const co_art = `="${String(item.co_art || '').trim().replace(/"/g, '""')}"`;
            const des_art = `"${String(item.des_art || '').trim().replace(/"/g, '""')}"`;
            const clase = `"${String(item.clase_conjunta || '').trim()}"`;
            
            const sdr = (Number(item.sdr) || 0).toString();
            const rop = (Number(item.rop) || 0).toString();
            const ss = (Number(item.ss) || 0).toString();
            const vpd = (Number(item.vpd) || 0).toFixed(2).replace('.', ',');
            const tr = (Number(item.tr) || 0).toFixed(1).replace('.', ',');
            const ventas = (Number(item.ventas_netas) || 0).toString();
            
            const cantReponer = Math.max(0, (item.rop + item.ss) - item.sdr);
            const costoInversion = (cantReponer * (item.costo_actual || 0)).toFixed(2).replace('.', ',');
            
            let estado = "Stock Sano";
            if (item.sdr <= 0) estado = "Sin Stock";
            else if (item.sdr <= item.rop) estado = "Ruptura Inminente";
            else if (item.sdr <= (item.rop + item.ss)) estado = "Cerca de Ruptura";

            csvContent += `${co_art};${des_art};${clase};${sdr};${rop};${ss};${vpd};${tr};${ventas};${cantReponer};${costoInversion};${estado}\n`;
        }

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const filename = `analisis_compras_${dayjs(startDate).format("YYYYMMDD")}_a_${dayjs(endDate).format("YYYYMMDD")}.csv`;

        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function setQuickDate(days: number) {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        startDate = start.toISOString().split("T")[0];
        endDate = end.toISOString().split("T")[0];
        applyFilters();
    }

    const classDescriptions: Record<
        string,
        { label: string; desc: string; priority: string }
    > = {
        AX: {
            label: "Alto Valor - Alta Predictibilidad",
            desc: "Aporta el 80% de ventas, demanda muy estable (CV ≤ 20%).",
            priority: "Prioridad Máxima",
        },
        AY: {
            label: "Alto Valor - Fluctuación Moderada",
            desc: "Aporta el 80% de ventas, demanda con variación (CV 20-60%).",
            priority: "Monitoreo Constante",
        },
        AZ: {
            label: "Alto Valor - Alta Volatilidad",
            desc: "Aporta el 80% de ventas, demanda impredecible (CV > 60%).",
            priority: "Riesgo de Ruptura",
        },
        BX: {
            label: "Valor Medio - Alta Predictibilidad",
            desc: "Aporta el 15% de ventas, demanda estable (CV ≤ 20%).",
            priority: "Automatizado",
        },
        BY: {
            label: "Valor Medio - Fluctuación Moderada",
            desc: "Aporta el 15% de ventas, demanda variable (CV 20-60%).",
            priority: "Reposición Estándar",
        },
        BZ: {
            label: "Valor Medio - Alta Volatilidad",
            desc: "Aporta el 15% de ventas, demanda impredecible (CV > 60%).",
            priority: "Compras en Lotes",
        },
        CX: {
            label: "Bajo Valor - Alta Predictibilidad",
            desc: "Aporta el 5% de ventas, demanda estable y predecible.",
            priority: "Compra por Volumen",
        },
        CY: {
            label: "Bajo Valor - Fluctuación Moderada",
            desc: "Aporta el 5% de ventas, demanda ocasional.",
            priority: "Revisión Periódica",
        },
        CZ: {
            label: "Bajo Valor - Alta Volatilidad",
            desc: "Aporta el 5% de ventas, demanda esporádica e impredecible.",
            priority: "Candidato a Salida",
        },
    };

    // Renderizar gráfico cuando cambie el artículo seleccionado
    $effect(() => {
        if (!mounted || !chartCanvas || !selectedArticle) return;

        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        const demandaEnTR = selectedArticle.vpd * selectedArticle.tr;

        chartInstance = new ChartJS(chartCanvas, {
            type: "bar",
            data: {
                labels: ["Situación Actual"],
                datasets: [
                    {
                        type: "bar" as const,
                        label: "Stock Disponible Real (SDR)",
                        backgroundColor: "rgba(59, 130, 246, 0.7)",
                        borderColor: "rgba(59, 130, 246, 1)",
                        borderWidth: 1,
                        data: [selectedArticle.sdr],
                    },
                    {
                        type: "bar" as const,
                        label: "Punto de Reorden (ROP)",
                        backgroundColor: "rgba(239, 68, 68, 0.7)",
                        borderColor: "rgba(239, 68, 68, 1)",
                        borderWidth: 1,
                        data: [selectedArticle.rop],
                    },
                    {
                        type: "line" as const,
                        label: "Demanda Proyectada en TR",
                        borderColor: "rgba(245, 158, 11, 1)",
                        borderWidth: 3,
                        borderDash: [5, 5],
                        fill: false,
                        data: [demandaEnTR],
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: "rgba(150, 150, 150, 0.15)" },
                        ticks: { color: "rgba(150, 150, 150, 0.9)" },
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: "rgba(150, 150, 150, 0.9)" },
                    },
                },
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: { color: "rgba(150, 150, 150, 0.9)" },
                    },
                },
            },
        });
    });
</script>

<svelte:head>
    <title>Analisis de Compras | Gestor</title>
</svelte:head>

<div class="p-6 md:p-8 space-y-8 animate-fade-in pb-32">
    <!-- HEADER -->
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div class="space-y-2">
            <h1
                class="text-3xl md:text-5xl font-black text-text-base tracking-tight flex items-center gap-3"
            >
                <TrendingUp size={40} class="text-brand-500 shrink-0" />
                Análisis de Compras
            </h1>
            <p class="text-text-muted text-sm max-w-2xl">
                Evalúa el rendimiento de los inventarios mediante la Matriz
                ABC/XYZ, puntos de reorden (ROP) y stocks de seguridad. Basado
                en <b>{data.businessDays || "?"} días hábiles</b> históricos.
            </p>
        </div>

        <div class="flex items-center gap-3 shrink-0">
            <button
                onclick={exportToExcel}
                disabled={!items || items.length === 0}
                class="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-black rounded-xl shadow-lg shadow-brand-600/20 hover:shadow-brand-500/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar a Excel (CSV)"
            >
                <FileSpreadsheet size={16} />
                Exportar Excel
            </button>
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
                            class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-base"
                        >
                            <X size={14} />
                        </button>
                    {/if}
                </div>
                <BarcodeScanner onScan={(code) => (searchTerm = code)} />
            </div>

            <!-- 2. Líneas -->
            <Combobox
                options={(data.catalogs?.lineas || []).map((l: any) => ({
                    value: l.co_lin,
                    label: l.lin_des,
                }))}
                bind:value={selectedLinea}
                placeholder="Líneas (Todas)"
                allLabel="Líneas (Todas)"
            />

            <!-- 3. Sub-Líneas -->
            <Combobox
                options={(data.catalogs?.sublineas || []).map((s: any) => ({
                    value: s.co_subl,
                    label: s.subl_des,
                }))}
                bind:value={selectedSublinea}
                placeholder="Sub-Líneas (Todas)"
                allLabel="Sub-Líneas (Todas)"
            />

            <!-- 4. Categorías -->
            <Combobox
                options={(data.catalogs?.categorias || []).map((c: any) => ({
                    value: c.co_cat,
                    label: c.cat_des,
                }))}
                bind:value={selectedCategoria}
                placeholder="Categorías (Todas)"
                allLabel="Categorías (Todas)"
            />
        </div>

        <!-- Fila 2: Matriz ABC / XYZ & Estado de Alerta de Stock -->
        <div
            class="grid grid-cols-1 md:grid-cols-3 gap-4 items-center pt-2 border-t border-border-subtle/50"
        >
            <Combobox
                options={abcOptions}
                bind:value={selectedABC}
                placeholder="Clase de Ventas (Todas)"
                allLabel="Clase ABC (Todas)"
            />
            <Combobox
                options={xyzOptions}
                bind:value={selectedXYZ}
                placeholder="Predictibilidad Demanda (Todas)"
                allLabel="Clase XYZ (Todas)"
            />
            <Combobox
                options={alertOptions}
                bind:value={selectedAlertStatus}
                placeholder="Estado de Stock (Todos)"
                allLabel="Estado de Stock (Todos)"
            />
        </div>

        <!-- Fila 3: Sucursal, Fechas & Botón Calcular -->
        <div
            class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center pt-2 border-t border-border-subtle/50"
        >
            <div class="w-full">
                <Combobox
                    options={(data.branches || []).map((b: any) => ({
                        value: b.id,
                        label: b.name,
                    }))}
                    bind:value={selectedBranch}
                    placeholder="Sucursal por defecto"
                    allLabel="Predeterminada"
                    icon={Building}
                />
            </div>

            <div
                class="flex flex-col sm:flex-row gap-3 items-center w-full justify-end"
            >
                <div
                    class="flex items-center gap-2 bg-surface-raised border border-border-subtle rounded-2xl px-3 h-12 w-full sm:w-auto flex-1"
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
                    class="flex items-center gap-1 bg-surface-raised border border-border-subtle rounded-2xl p-1 shrink-0"
                >
                    <button
                        onclick={() => setQuickDate(7)}
                        class="px-3 py-1.5 text-xs font-bold rounded-xl hover:bg-surface-soft text-text-muted hover:text-text-base transition-colors"
                        >7d</button
                    >
                    <button
                        onclick={() => setQuickDate(30)}
                        class="px-3 py-1.5 text-xs font-bold rounded-xl hover:bg-surface-soft text-text-muted hover:text-text-base transition-colors"
                        >30d</button
                    >
                    <button
                        onclick={() => setQuickDate(90)}
                        class="px-3 py-1.5 text-xs font-bold rounded-xl hover:bg-surface-soft text-text-muted hover:text-text-base transition-colors"
                        >90d</button
                    >
                </div>

                <button
                    onclick={applyFilters}
                    class="h-12 px-8 rounded-2xl bg-brand-500 text-white font-black hover:scale-105 transition-all shadow-[0_0_20px_rgba(var(--brand-500-rgb),0.3)] w-full sm:w-auto shrink-0"
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
        <!-- KPIs EN UNA SOLA FILA DE 3 COLUMNAS -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
                class="bg-surface-raised border border-border-subtle rounded-3xl p-6 relative overflow-hidden group"
            >
                <div
                    class="absolute right-0 top-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl group-hover:bg-red-500/10 transition-colors"
                ></div>
                <AlertTriangle size={24} class="text-red-500 mb-4" />
                <p
                    class="text-text-muted text-xs font-bold uppercase tracking-widest mb-1"
                >
                    Quiebre de Stock
                </p>
                <p class="text-3xl font-black text-text-base">
                    {kpis.articulos_en_alerta}
                </p>
                <p class="text-[10px] text-text-muted mt-2">
                    Artículos con SDR menor o igual al Punto de Reorden.
                </p>
            </div>
            <div
                class="bg-surface-raised border border-border-subtle rounded-3xl p-6 relative overflow-hidden group"
            >
                <div
                    class="absolute right-0 top-0 w-32 h-32 bg-yellow-500/5 rounded-full blur-3xl group-hover:bg-yellow-500/10 transition-colors"
                ></div>
                <DollarSign size={24} class="text-yellow-500 mb-4" />
                <p
                    class="text-text-muted text-xs font-bold uppercase tracking-widest mb-1"
                >
                    Capital Requerido (Reposición)
                </p>
                <p class="text-3xl font-black text-text-base">
                    {formatCurrency(kpis.capital_requerido_urgente)}
                </p>
                <p class="text-[10px] text-text-muted mt-2">
                    Costo estimado para reponer al nivel seguro todos los
                    artículos en alerta.
                </p>
            </div>
            <div
                class="bg-surface-raised border border-border-subtle rounded-3xl p-6 relative overflow-hidden group"
            >
                <div
                    class="absolute right-0 top-0 w-32 h-32 bg-brand-500/5 rounded-full blur-3xl group-hover:bg-brand-500/10 transition-colors"
                ></div>
                <Box size={24} class="text-brand-500 mb-4" />
                <p
                    class="text-text-muted text-xs font-bold uppercase tracking-widest mb-1"
                >
                    Exceso (Inmovilizado)
                </p>
                <p class="text-3xl font-black text-text-base">
                    {formatCurrency(kpis.capital_inmovilizado)}
                </p>
                <p class="text-[10px] text-text-muted mt-2">
                    Costo del inventario que supera ampliamente el ROP + SS.
                </p>
            </div>
        </div>

        <!-- TABLA PRINCIPAL Y GRÁFICO DETALLE (h-[90vh]) -->
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <!-- TABLA (2/3 del ancho en xl) -->
            <div
                class="xl:col-span-2 bg-surface-raised border border-border-subtle rounded-3xl overflow-hidden shadow-xl"
            >
                <div
                    class="overflow-x-auto h-[90vh] min-h-[500px] custom-scrollbar"
                >
                    <table class="w-full text-left border-collapse relative">
                        <thead
                            class="sticky top-0 bg-surface-base/90 backdrop-blur-md z-20"
                        >
                            <tr class="border-b border-border-subtle">
                                <th
                                    class="px-6 py-4 text-xs font-bold uppercase tracking-widest text-text-muted"
                                    >Artículo</th
                                >
                                <th
                                    class="px-6 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-center"
                                >
                                    <div
                                        class="relative group/tooltip inline-flex items-center gap-1 cursor-help justify-center"
                                    >
                                        <span>Clase ABC/XYZ</span>
                                        <div
                                            class="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-surface-raised border border-border-subtle p-3 rounded-2xl text-xs font-normal text-text-base shadow-2xl z-40 pointer-events-none transition-all w-64 text-left"
                                        >
                                            <p
                                                class="font-bold text-text-base mb-1"
                                            >
                                                Matriz ABC / XYZ
                                            </p>
                                            <p
                                                class="text-[11px] text-text-muted leading-relaxed"
                                            >
                                                <b>ABC:</b> Importancia por
                                                aporte a ventas (A: 80%, B: 15%,
                                                C: 5%).<br />
                                                <b>XYZ:</b> Predictibilidad de demanda
                                                (X: Estable ≤20%, Y: Variable ≤60%,
                                                Z: Impredecible >60%).
                                            </p>
                                            <div
                                                class="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-border-subtle"
                                            ></div>
                                        </div>
                                    </div>
                                </th>
                                <th
                                    class="px-6 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-right"
                                >
                                    <div
                                        class="relative group/tooltip inline-flex items-center gap-1 cursor-help justify-end"
                                    >
                                        <span>SDR</span>
                                        <div
                                            class="absolute top-full right-0 mt-2 hidden group-hover/tooltip:block bg-surface-raised border border-border-subtle p-3 rounded-2xl text-xs font-normal text-text-base shadow-2xl z-40 pointer-events-none transition-all w-64 text-left"
                                        >
                                            <p
                                                class="font-bold text-text-base mb-1"
                                            >
                                                Stock Disponible Real (SDR)
                                            </p>
                                            <p
                                                class="text-[11px] text-text-muted leading-relaxed"
                                            >
                                                Inventario físico disponible en
                                                Almacén.
                                            </p>
                                            <div
                                                class="absolute bottom-full right-4 border-4 border-transparent border-b-border-subtle"
                                            ></div>
                                        </div>
                                    </div>
                                </th>
                                <th
                                    class="px-6 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-right"
                                >
                                    <div
                                        class="relative group/tooltip inline-flex items-center gap-1 cursor-help justify-end"
                                    >
                                        <span>ROP</span>
                                        <div
                                            class="absolute top-full right-0 mt-2 hidden group-hover/tooltip:block bg-surface-raised border border-border-subtle p-3 rounded-2xl text-xs font-normal text-text-base shadow-2xl z-40 pointer-events-none transition-all w-64 text-left"
                                        >
                                            <p
                                                class="font-bold text-text-base mb-1"
                                            >
                                                Punto de Reorden (ROP)
                                            </p>
                                            <p
                                                class="text-[11px] text-text-muted leading-relaxed"
                                            >
                                                Fórmula: <b>(VPD × TR) + SS</b
                                                >.<br />
                                                Alerta cuando SDR ≤ ROP (Requiere
                                                reponer stock inmediatamente).
                                            </p>
                                            <div
                                                class="absolute bottom-full right-4 border-4 border-transparent border-b-border-subtle"
                                            ></div>
                                        </div>
                                    </div>
                                </th>
                                <th
                                    class="px-6 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-right"
                                >
                                    <div
                                        class="relative group/tooltip inline-flex items-center gap-1 cursor-help justify-end"
                                    >
                                        <span>SS</span>
                                        <div
                                            class="absolute top-full right-0 mt-2 hidden group-hover/tooltip:block bg-surface-raised border border-border-subtle p-3 rounded-2xl text-xs font-normal text-text-base shadow-2xl z-40 pointer-events-none transition-all w-64 text-left"
                                        >
                                            <p
                                                class="font-bold text-text-base mb-1"
                                            >
                                                Stock de Seguridad (SS)
                                            </p>
                                            <p
                                                class="text-[11px] text-text-muted leading-relaxed"
                                            >
                                                Colchón de inventario para
                                                imprevistos basado en la
                                                variabilidad de ventas (95%
                                                nivel de confianza).
                                            </p>
                                            <div
                                                class="absolute bottom-full right-4 border-4 border-transparent border-b-border-subtle"
                                            ></div>
                                        </div>
                                    </div>
                                </th>
                                <th
                                    class="px-6 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-right"
                                >
                                    <div
                                        class="relative group/tooltip inline-flex items-center gap-1 cursor-help justify-end"
                                    >
                                        <span>VPD</span>
                                        <div
                                            class="absolute top-full right-0 mt-2 hidden group-hover/tooltip:block bg-surface-raised border border-border-subtle p-3 rounded-2xl text-xs font-normal text-text-base shadow-2xl z-40 pointer-events-none transition-all w-64 text-left"
                                        >
                                            <p
                                                class="font-bold text-text-base mb-1"
                                            >
                                                Venta Promedio Diaria (VPD)
                                            </p>
                                            <p
                                                class="text-[11px] text-text-muted leading-relaxed"
                                            >
                                                Ventas netas divididas entre los
                                                días hábiles del período
                                                (excluye domingos y feriados
                                                VE).
                                            </p>
                                            <div
                                                class="absolute bottom-full right-4 border-4 border-transparent border-b-border-subtle"
                                            ></div>
                                        </div>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-border-subtle">
                            {#each items as item}
                                {@const classInfo = classDescriptions[
                                    item.clase_conjunta
                                ] || {
                                    label: "Clasificación Combinada",
                                    desc: "Matriz ABC/XYZ",
                                    priority: "Estándar",
                                }}
                                <tr
                                    class="hover:bg-surface-soft/60 cursor-pointer transition-colors {selectedArticle?.co_art ===
                                    item.co_art
                                        ? 'bg-brand-500/10'
                                        : ''}"
                                    onclick={() => (selectedArticle = item)}
                                >
                                    <td class="px-6 py-4">
                                        <div class="flex flex-col">
                                            <span
                                                class="text-sm font-bold text-text-base"
                                                >{item.des_art}</span
                                            >
                                            <span
                                                class="text-[10px] text-text-muted font-mono"
                                                >{item.co_art}</span
                                            >
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 text-center">
                                        <div
                                            class="relative group/tooltip inline-block"
                                        >
                                            <span
                                                class="inline-flex px-3 py-1 rounded-lg text-xs font-black cursor-help transition-all hover:scale-105 {item.clasificacion_abc ===
                                                'A'
                                                    ? 'bg-brand-500/20 text-brand-500 border border-brand-500/30'
                                                    : 'bg-surface-base border border-border-subtle text-text-base'}"
                                            >
                                                {item.clase_conjunta}
                                            </span>
                                            <div
                                                class="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-surface-raised border border-border-subtle p-3 rounded-2xl text-xs text-text-base shadow-2xl z-40 pointer-events-none transition-all w-64 text-left"
                                            >
                                                <div
                                                    class="flex items-center justify-between gap-2 mb-1"
                                                >
                                                    <span
                                                        class="font-black text-brand-500 text-sm"
                                                        >Clase {item.clase_conjunta}</span
                                                    >
                                                    <span
                                                        class="text-[10px] font-bold px-2 py-0.5 rounded bg-surface-soft text-text-base"
                                                        >{classInfo.priority}</span
                                                    >
                                                </div>
                                                <p
                                                    class="font-bold text-text-base text-xs mb-1"
                                                >
                                                    {classInfo.label}
                                                </p>
                                                <p
                                                    class="text-[11px] text-text-muted leading-normal"
                                                >
                                                    {classInfo.desc}
                                                </p>
                                                <div
                                                    class="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-border-subtle"
                                                ></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 text-right">
                                        <span
                                            class="inline-flex px-3 py-1 rounded-full text-xs font-black border {getAlertColor(
                                                item,
                                            )}"
                                        >
                                            {item.sdr.toLocaleString()}
                                        </span>
                                    </td>
                                    <td
                                        class="px-6 py-4 text-right font-mono text-sm text-text-base"
                                    >
                                        {item.rop.toLocaleString()}
                                    </td>
                                    <td
                                        class="px-6 py-4 text-right font-mono text-sm text-text-muted"
                                    >
                                        {item.ss.toLocaleString()}
                                    </td>
                                    <td
                                        class="px-6 py-4 text-right font-mono text-sm text-brand-500 font-bold"
                                    >
                                        {item.vpd.toFixed(1)}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- DETALLE DEL ARTÍCULO (1/3 del ancho en xl, h-[90vh]) -->
            <div
                class="bg-surface-raised border border-border-subtle rounded-3xl p-6 h-[90vh] min-h-[500px] overflow-y-auto custom-scrollbar flex flex-col justify-between"
            >
                {#if selectedArticle}
                    {@const cantReponer = Math.max(
                        0,
                        selectedArticle.rop +
                            selectedArticle.ss -
                            selectedArticle.sdr,
                    )}
                    {@const costoInversion =
                        cantReponer * (selectedArticle.costo_actual || 0)}
                    {@const demandaTR = Math.round(
                        selectedArticle.vpd * selectedArticle.tr,
                    )}

                    <div>
                        <div
                            class="flex justify-between items-start mb-4 pb-4 border-b border-border-subtle"
                        >
                            <div>
                                <h3
                                    class="text-lg font-bold text-text-base mb-1 leading-tight"
                                >
                                    {selectedArticle.des_art}
                                </h3>
                                <p class="text-xs text-text-muted font-mono">
                                    {selectedArticle.co_art}
                                </p>
                            </div>
                            <span
                                class="px-3 py-1 rounded-lg text-xs font-black bg-surface-soft border border-border-subtle text-text-base shrink-0"
                            >
                                Clase {selectedArticle.clase_conjunta}
                            </span>
                        </div>

                        <div class="w-full aspect-square relative my-2">
                            <canvas bind:this={chartCanvas}></canvas>
                        </div>

                        <div class="mt-4 grid grid-cols-2 gap-3 text-xs">
                            <div
                                class="bg-surface-base p-3 rounded-2xl border border-border-subtle"
                            >
                                <p
                                    class="text-[10px] text-text-muted font-bold uppercase mb-0.5"
                                >
                                    Ventas ({data.businessDays || 0}d hábiles)
                                </p>
                                <p class="font-black text-text-base text-base">
                                    {selectedArticle.ventas_netas.toLocaleString()}
                                    <span
                                        class="text-xs font-normal text-text-muted"
                                        >unds</span
                                    >
                                </p>
                            </div>
                            <div
                                class="bg-surface-base p-3 rounded-2xl border border-border-subtle"
                            >
                                <p
                                    class="text-[10px] text-text-muted font-bold uppercase mb-0.5"
                                >
                                    TR Promedio
                                </p>
                                <p class="font-black text-text-base text-base">
                                    {selectedArticle.tr.toFixed(1)} días
                                </p>
                            </div>
                        </div>

                        <!-- CUADRO DE RECOMENDACIÓN DE COMPRA -->
                        <div
                            class="mt-4 p-4 rounded-2xl border transition-all {cantReponer >
                            0
                                ? 'bg-brand-500/10 border-brand-500/30'
                                : 'bg-green-500/10 border-green-500/30'}"
                        >
                            <div class="flex items-center justify-between mb-2">
                                <div
                                    class="flex items-center gap-2 text-xs font-bold {cantReponer >
                                    0
                                        ? 'text-brand-500'
                                        : 'text-green-500'}"
                                >
                                    {#if cantReponer > 0}
                                        <ShoppingCart size={16} />
                                        <span>Sugerencia de Pedido</span>
                                    {:else}
                                        <ShieldCheck size={16} />
                                        <span>Stock Cubierto</span>
                                    {/if}
                                </div>
                                <span
                                    class="text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider {cantReponer >
                                    0
                                        ? 'bg-brand-500/20 text-brand-500'
                                        : 'bg-green-500/20 text-green-500'}"
                                >
                                    {cantReponer > 0
                                        ? "Pedir Orden"
                                        : "Suficiente"}
                                </span>
                            </div>

                            <div class="grid grid-cols-2 gap-3 my-2">
                                <div>
                                    <p
                                        class="text-[10px] text-text-muted font-bold uppercase"
                                    >
                                        Pedir Recomendado
                                    </p>
                                    <p
                                        class="text-2xl font-black {cantReponer >
                                        0
                                            ? 'text-brand-500'
                                            : 'text-green-500'}"
                                    >
                                        {cantReponer.toLocaleString()}
                                        <span
                                            class="text-xs font-normal text-text-muted"
                                            >unds</span
                                        >
                                    </p>
                                </div>
                                <div>
                                    <p
                                        class="text-[10px] text-text-muted font-bold uppercase"
                                    >
                                        Inversión Est.
                                    </p>
                                    <p
                                        class="text-lg font-black text-text-base"
                                    >
                                        {formatCurrency(costoInversion)}
                                    </p>
                                </div>
                            </div>

                            <p
                                class="text-[11px] text-text-muted leading-relaxed pt-2 border-t border-border-subtle/50"
                            >
                                {#if cantReponer > 0}
                                    Cubre <b>{demandaTR} unds</b> de demanda
                                    esperada durante la entrega ({selectedArticle.tr}d)
                                    y garantiza quedar con un colchón de
                                    <b>{selectedArticle.ss} unds</b> ($SS$).
                                {:else}
                                    El inventario actual ({selectedArticle.sdr} unds)
                                    cubre holgadamente el ROP ({selectedArticle.rop}
                                    unds) sin riesgo de quiebre.
                                {/if}
                            </p>
                        </div>
                    </div>
                {:else}
                    <div
                        class="flex-1 flex flex-col items-center justify-center text-center text-text-muted opacity-50 p-6"
                    >
                        <BarChart size={48} class="mb-4" />
                        <p class="font-bold">Selecciona un artículo</p>
                        <p class="text-xs mt-2">
                            Haz clic en una fila de la tabla para ver su
                            sugerencia de compra y gráfico de stock.
                        </p>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>
