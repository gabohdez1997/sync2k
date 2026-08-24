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
        AlertTriangle,
        TrendingUp,
        RefreshCw,
        X,
        Box,
        BarChart,
        BarChart2,
        Search,
        ShoppingCart,
        ShieldCheck,
        FileSpreadsheet,
        Activity,
        ArrowUpRight,
        FileText,
        Package,
    } from "lucide-svelte";
    import Combobox from "$lib/components/ui/Combobox.svelte";
    import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";
    import { invalidate } from "$app/navigation";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import dayjs from "dayjs";
    import * as XLSX from "xlsx";
    import { toast } from "svelte-sonner";

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

    let isSyncing = $state(false);
    let selectedArticle = $state<any>(null);
    let detailModalOpen = $state(false);
    let chartCanvas = $state<HTMLCanvasElement | null>(null);
    let chartInstance: ChartJS | null = null;
    let mounted = $state(false);

    // Histórico por período
    let historyLoading = $state(false);
    let historyData = $state<any[]>([]);
    let historyTipoAgrupacion = $state<string>("mensual");
    let historyError = $state<string | null>(null);
    let historyChartCanvas = $state<HTMLCanvasElement | null>(null);
    let historyChartInstance: ChartJS | null = null;

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
        { value: "sin_stock", label: "🔴 Sin Stock (SDR = 0)" },
        { value: "quebrado", label: "🟠 Stock Quebrado (SDR ≤ ROP)" },
        { value: "ruptura", label: "🟡 Ruptura Inminente (SDR ≤ ROP+SS)" },
        { value: "saludable", label: "🟢 Stock Saludable (SDR > ROP+SS)" },
    ];

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

    // Sincronizar cuando data cambie (navegación)
    $effect(() => {
        startDate = data.startDate;
        endDate = data.endDate;
        selectedBranch = data.branchId;
    });

    // Artículos filtrados por atributos base (búsqueda, líneas, sub-líneas, categorías, ABC/XYZ)
    let filteredBaseItems = $derived.by(() => {
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
        return list;
    });

    // Artículos finales para la tabla (aplica filtro de escala de calor de stock)
    let items = $derived.by(() => {
        let list = filteredBaseItems;
        if (selectedAlertStatus) {
            if (selectedAlertStatus === "sin_stock") {
                list = list.filter((i: any) => (Number(i.sdr) || 0) <= 0);
            } else if (selectedAlertStatus === "quebrado") {
                list = list.filter((i: any) => {
                    const sdr = Number(i.sdr) || 0;
                    const rop = Number(i.rop) || 0;
                    return sdr > 0 && sdr <= rop;
                });
            } else if (
                selectedAlertStatus === "ruptura" ||
                selectedAlertStatus === "riesgo"
            ) {
                list = list.filter((i: any) => {
                    const sdr = Number(i.sdr) || 0;
                    const rop = Number(i.rop) || 0;
                    const ss = Number(i.ss) || 0;
                    return sdr > rop && sdr <= rop + ss;
                });
            } else if (
                selectedAlertStatus === "saludable" ||
                selectedAlertStatus === "sano"
            ) {
                list = list.filter((i: any) => {
                    const sdr = Number(i.sdr) || 0;
                    const rop = Number(i.rop) || 0;
                    const ss = Number(i.ss) || 0;
                    return sdr > rop + ss;
                });
            }
        }
        return list;
    });

    // Mapeo dinámico y semántico de unidades fraccionables
    const fractionalCodes = ["06", "07", "08", "10", "25"];
    const fractionalKeywords = [
        "MTS2",
        "MTS",
        "LTS",
        "KG",
        "ML",
        "M2",
        "M3",
        "MT",
        "LT",
        "KGS",
        "KILO",
        "KILOS",
        "KILOGRAMO",
        "KILOGRAMOS",
        "GR",
        "GRS",
        "GRAMO",
        "GRAMOS",
        "METRO",
        "METROS",
        "LITRO",
        "LITROS",
        "MILILITRO",
        "MILILITROS",
        "TON",
        "TONELADA",
        "CENTIMETRO",
        "CM",
        "MM",
        "PULG",
        "PULGADA",
        "YARDA",
    ];
    function isFractionalUnit(co_uni?: string, des_uni?: string): boolean {
        const code = String(co_uni || "")
            .trim()
            .toUpperCase();
        const desc = String(des_uni || "")
            .trim()
            .toUpperCase();

        // 1. Configuración dinámica por Sede (allow_decimals_units)
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

        // 2. Códigos de Profit conocidos y reglas semánticas
        return (
            fractionalCodes.includes(code) ||
            fractionalKeywords.includes(code) ||
            fractionalKeywords.includes(desc)
        );
    }

    function formatUnitQty(
        val: number,
        itemOrCoUni?: any,
        des_uni?: string,
    ): string {
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

    function getUnitLabel(item: any): string {
        if (!item) return "unidades";
        if (item.des_uni && item.des_uni.trim()) return item.des_uni.trim();
        if (item.co_uni && item.co_uni.trim()) return item.co_uni.trim();
        return "unidades";
    }

    function getCantReponer(item: any): number {
        if (!item) return 0;
        if (typeof item.cant_sugerida === "number") {
            return item.cant_sugerida;
        }
        const sdr = Number(item.sdr) || 0;
        const rop = Number(item.rop) || 0;
        const ss = Number(item.ss) || 0;
        const vpd = Number(item.vpd) || 0;
        const isFrac = isFractionalUnit(item.co_uni, item.des_uni);

        if (vpd <= 0 && (Number(item.ventas_netas) || 0) <= 0) return 0;

        if (sdr <= rop || sdr <= 0) {
            const target = Math.max(rop + ss, rop);
            const diff = target - sdr;
            return isFrac
                ? Math.max(0.01, Number(diff.toFixed(2)))
                : Math.max(1, Math.ceil(diff));
        } else if (sdr < rop + ss) {
            const diff = rop + ss - sdr;
            return isFrac ? Number(diff.toFixed(2)) : Math.ceil(diff);
        }
        return 0;
    }

    // KPIs derivados dinámicamente según la Escala de Calor (Artículos Activos)
    let kpis = $derived.by(() => {
        let sinStockCount = 0;
        let quebradoCount = 0;
        let rupturaCount = 0;
        let saludableCount = 0;
        let totalActivos = 0;

        filteredBaseItems.forEach((item: any) => {
            totalActivos++;
            const sdr = Number(item.sdr) || 0;
            const rop = Number(item.rop) || 0;
            const ss = Number(item.ss) || 0;

            if (sdr <= 0) {
                sinStockCount++;
            } else if (sdr <= rop) {
                quebradoCount++;
            } else if (sdr <= rop + ss) {
                rupturaCount++;
            } else {
                saludableCount++;
            }
        });

        return {
            sin_stock: sinStockCount,
            quebrado: quebradoCount,
            ruptura: rupturaCount,
            saludable: saludableCount,
            total_activos: totalActivos,
        };
    });

    // Resumen histórico del artículo seleccionado
    let historySummary = $derived.by(() => {
        if (!historyData || historyData.length === 0) {
            return {
                total: 0,
                avg: 0,
                max: 0,
                min: 0,
                maxMonth: "",
                totalDocs: 0,
                totalRecep: 0,
                totalAent: 0,
                totalAsal: 0,
                latestStock: 0,
            };
        }
        let total = 0;
        let totalDocs = 0;
        let totalRecep = 0;
        let totalAent = 0;
        let totalAsal = 0;
        let max = -Infinity;
        let min = Infinity;
        let maxMonth = "";

        historyData.forEach((h: any) => {
            const v = Number(h.cant_real_vendida) || 0;
            const d = Number(h.docs_exitosos) || 0;
            const r = Number(h.cant_recepcionada) || 0;
            const aent = Number(h.cant_ajuste_entrada) || 0;
            const asal = Number(h.cant_ajuste_salida) || 0;
            total += v;
            totalDocs += d;
            totalRecep += r;
            totalAent += aent;
            totalAsal += asal;
            if (v > max) {
                max = v;
                maxMonth = h.mes_nombre;
            }
            if (v < min) {
                min = v;
            }
        });

        const avg = historyData.length > 0 ? total / historyData.length : 0;
        const latestStock =
            historyData[historyData.length - 1]?.stock_inicial || 0;

        return {
            total,
            avg,
            totalDocs,
            totalRecep,
            totalAent,
            totalAsal,
            max: max === -Infinity ? 0 : max,
            min: min === Infinity ? 0 : min,
            maxMonth,
            latestStock,
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

    function getAlertBadge(item: any) {
        const sdr = Number(item.sdr) || 0;
        const rop = Number(item.rop) || 0;
        const ss = Number(item.ss) || 0;

        if (sdr <= 0) {
            return {
                key: "sin_stock",
                label: "Sin Stock",
                fullLabel: "Sin Stock (SDR = 0)",
                shortLabel: "Sin Stock",
                class: "text-red-600 dark:text-red-400 font-bold",
                badgeClass:
                    "bg-transparent border border-red-500/40 text-red-600 dark:text-red-400 font-bold",
                color: "red",
            };
        }
        if (sdr <= rop) {
            return {
                key: "quebrado",
                label: "Stock Quebrado",
                fullLabel: "Stock Quebrado (SDR ≤ ROP)",
                shortLabel: "Stock Quebrado",
                class: "text-orange-600 dark:text-orange-400 font-bold",
                badgeClass:
                    "bg-transparent border border-orange-500/40 text-orange-600 dark:text-orange-400 font-bold",
                color: "orange",
            };
        }
        if (sdr <= rop + ss) {
            return {
                key: "ruptura",
                label: "Ruptura Inminente",
                fullLabel: "Ruptura Inminente (SDR ≤ ROP+SS)",
                shortLabel: "Ruptura Inminente",
                class: "text-amber-700 dark:text-yellow-400 font-bold",
                badgeClass:
                    "bg-transparent border border-amber-500/50 dark:border-yellow-500/40 text-amber-700 dark:text-yellow-400 font-bold",
                color: "yellow",
            };
        }
        return {
            key: "saludable",
            label: "Stock Saludable",
            fullLabel: "Stock Saludable (SDR > ROP+SS)",
            shortLabel: "Stock Saludable",
            class: "text-emerald-700 dark:text-emerald-400 font-bold",
            badgeClass:
                "bg-transparent border border-emerald-500/40 text-emerald-700 dark:text-emerald-400 font-bold",
            color: "emerald",
        };
    }

    function formatCurrency(val: number) {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
        }).format(val);
    }

    function exportToExcel() {
        if (!items || items.length === 0) {
            toast.warning("No hay datos para exportar.");
            return;
        }

        try {
            const headerRows = [
                ["REPORTE DE ANÁLISIS DE COMPRAS E INVENTARIO (ABC / XYZ)"],
                ["Período Analizado:", `${dayjs(startDate).format("DD/MM/YYYY")} al ${dayjs(endDate).format("DD/MM/YYYY")}`, "", "Días Hábiles:", data.businessDays || ""],
                ["Sucursal / Sede:", data.selectedBranch?.name || data.branchId || "Todas", "", "Fecha de Generación:", dayjs().format("DD/MM/YYYY HH:mm:ss")],
                ["Total Artículos:", items.length, "", "Artículos en Alerta:", data.kpis?.articulos_en_alerta || 0],
                [],
                [
                    "Código",
                    "Descripción",
                    "Modelo",
                    "Línea",
                    "Sublínea",
                    "Categoría",
                    "Unidad",
                    "Clase ABC/XYZ",
                    "SDR (Stock Actual)",
                    "ROP (Punto Reorden)",
                    "SS (Stock Seguridad)",
                    "VPD (Venta Prom. Diaria)",
                    "TR Promedio (Días)",
                    "Ventas Período",
                    "Cant. Documentos Exitosos",
                    "Cant. Máx en 1 Doc",
                    "Cant. Mín en 1 Doc",
                    "Pedir Recomendado",
                    "Costo Actual (USD)",
                    "Inversión Est. (USD)",
                    "Estado de Stock"
                ]
            ];

            const rows = items.map((item: any) => {
                const cantReponer = getCantReponer(item);
                const costoInversion = Number((cantReponer * (item.costo_actual || 0)).toFixed(2));
                const alertInfo = getAlertBadge(item);

                return [
                    item.co_art ? String(item.co_art).trim() : "",
                    item.des_art || "",
                    item.modelo || "",
                    item.des_lin || "",
                    item.des_subl || "",
                    item.des_cat || "",
                    item.des_uni || item.co_uni || "UND",
                    item.clase_conjunta || "",
                    Number(item.sdr) || 0,
                    Number(item.rop) || 0,
                    Number(item.ss) || 0,
                    Number(Number(item.vpd || 0).toFixed(2)),
                    Number(Number(item.tr || 0).toFixed(1)),
                    Number(item.ventas_netas) || 0,
                    Number(item.cant_docs_exitosos) || 0,
                    Number(item.cant_max_doc) || 0,
                    Number(item.cant_min_doc) || 0,
                    Number(cantReponer),
                    Number(Number(item.costo_actual || 0).toFixed(2)),
                    costoInversion,
                    alertInfo.label || ""
                ];
            });

            const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...rows]);

            // Configurar anchos de columnas
            ws["!cols"] = [
                { wch: 16 }, // Código
                { wch: 42 }, // Descripción
                { wch: 18 }, // Modelo
                { wch: 18 }, // Línea
                { wch: 22 }, // Sublínea
                { wch: 22 }, // Categoría
                { wch: 10 }, // Unidad
                { wch: 14 }, // Clase
                { wch: 18 }, // SDR
                { wch: 18 }, // ROP
                { wch: 18 }, // SS
                { wch: 22 }, // VPD
                { wch: 18 }, // TR
                { wch: 16 }, // Ventas
                { wch: 24 }, // Cant. Docs Exitosos
                { wch: 20 }, // Cant. Máx Doc
                { wch: 20 }, // Cant. Mín Doc
                { wch: 18 }, // Pedir Recomendado
                { wch: 18 }, // Costo
                { wch: 20 }, // Inversión
                { wch: 22 }  // Estado
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Análisis de Compras");

            const fileName = `Analisis_Compras_${dayjs(startDate).format("YYYYMMDD")}_al_${dayjs(endDate).format("YYYYMMDD")}.xlsx`;
            XLSX.writeFile(wb, fileName);
            toast.success(`Reporte Excel exportado exitosamente (${items.length.toLocaleString()} artículos).`);
        } catch (e: any) {
            console.error("Error al exportar a Excel:", e);
            toast.error("Ocurrió un error al exportar: " + e.message);
        }
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

    async function fetchArticleHistory(coArt: string) {
        historyLoading = true;
        historyError = null;
        historyData = [];
        try {
            const branchParam =
                selectedBranch && selectedBranch !== "default"
                    ? `&branch_id=${selectedBranch}`
                    : "";
            const dateParams = `&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
            const res = await fetch(
                `/api/agent/purchases-analysis/article-history?co_art=${encodeURIComponent(coArt)}${branchParam}${dateParams}`,
            );
            const json = await res.json();
            if (json.success && Array.isArray(json.history)) {
                historyData = json.history;
                historyTipoAgrupacion = json.tipoAgrupacion || "mensual";
            } else {
                historyError =
                    json.error ||
                    json.message ||
                    "No se pudo cargar el histórico.";
            }
        } catch (e: any) {
            historyError = "Error de conexión al consultar histórico.";
        } finally {
            historyLoading = false;
        }
    }

    function openArticleModal(item: any) {
        selectedArticle = item;
        detailModalOpen = true;
        fetchArticleHistory(item.co_art);
    }

    function closeArticleModal() {
        detailModalOpen = false;
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
        if (historyChartInstance) {
            historyChartInstance.destroy();
            historyChartInstance = null;
        }
        historyData = [];
        historyError = null;
    }

    // 1. Renderizar gráfico superior (SDR vs ROP)
    $effect(() => {
        if (!mounted || !detailModalOpen || !chartCanvas || !selectedArticle)
            return;

        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        const demandaEnTR = Math.round(
            (Number(selectedArticle.vpd) || 0) *
                (Number(selectedArticle.tr) || 0),
        );

        chartInstance = new ChartJS(chartCanvas, {
            type: "bar",
            data: {
                labels: ["Situación Actual"],
                datasets: [
                    {
                        type: "bar" as const,
                        label: "Stock Real (SDR)",
                        backgroundColor: "rgba(59, 130, 246, 0.75)",
                        borderColor: "rgba(59, 130, 246, 1)",
                        borderWidth: 1.5,
                        borderRadius: 8,
                        data: [selectedArticle.sdr],
                    },
                    {
                        type: "bar" as const,
                        label: "Pto. Reorden (ROP)",
                        backgroundColor: "rgba(239, 68, 68, 0.75)",
                        borderColor: "rgba(239, 68, 68, 1)",
                        borderWidth: 1.5,
                        borderRadius: 8,
                        data: [selectedArticle.rop],
                    },
                    {
                        type: "line" as const,
                        label: "Demanda en TR",
                        borderColor: "rgba(245, 158, 11, 1)",
                        backgroundColor: "rgba(245, 158, 11, 0.2)",
                        borderWidth: 3,
                        borderDash: [6, 4],
                        pointRadius: 6,
                        pointBackgroundColor: "rgba(245, 158, 11, 1)",
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
                        grid: { color: "rgba(150, 150, 150, 0.12)" },
                        ticks: {
                            color: "rgba(150, 150, 150, 0.9)",
                            font: { size: 10 },
                        },
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: "rgba(150, 150, 150, 0.9)",
                            font: { size: 11, weight: "bold" },
                        },
                    },
                },
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            boxWidth: 10,
                            padding: 8,
                            color: "rgba(150, 150, 150, 0.9)",
                            font: { size: 10, weight: "bold" },
                        },
                    },
                    tooltip: {
                        backgroundColor: "rgba(15, 23, 42, 0.95)",
                        titleFont: { weight: "bold" },
                        padding: 10,
                        cornerRadius: 10,
                    },
                },
            },
        });
    });

    // 2. Renderizar gráfico inferior de línea (Ventas Reales + Stock Inicial + Documentos)
    $effect(() => {
        if (
            !mounted ||
            !detailModalOpen ||
            !historyChartCanvas ||
            historyData.length === 0
        )
            return;

        if (historyChartInstance) {
            historyChartInstance.destroy();
            historyChartInstance = null;
        }

        const labels = historyData.map((h) => h.mes_nombre);
        const initialStockData = historyData.map((h) => h.stock_inicial);
        const realSoldData = historyData.map((h) => h.cant_real_vendida);
        const docsData = historyData.map((h) => h.docs_exitosos);
        const recepData = historyData.map((h) => h.cant_recepcionada);
        const aentData = historyData.map((h) => h.cant_ajuste_entrada);
        const asalData = historyData.map((h) => h.cant_ajuste_salida);

        historyChartInstance = new ChartJS(historyChartCanvas, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        type: "line" as const,
                        label: "Stock Inicial (Stk)",
                        data: initialStockData,
                        borderColor: "#3b82f6",
                        backgroundColor: "rgba(59, 130, 246, 0.05)",
                        borderWidth: 2.5,
                        tension: 0.25,
                        fill: false,
                        pointBackgroundColor: "#3b82f6",
                        pointBorderColor: "#ffffff",
                        pointBorderWidth: 2,
                        pointRadius: 4.5,
                        pointHoverRadius: 6.5,
                    },
                    {
                        type: "line" as const,
                        label: "Cant. Real Vendida (Vta)",
                        data: realSoldData,
                        borderColor: "#10b981",
                        backgroundColor: "rgba(16, 185, 129, 0.12)",
                        borderWidth: 3,
                        tension: 0.35,
                        fill: true,
                        pointBackgroundColor: "#10b981",
                        pointBorderColor: "#ffffff",
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                    },
                    {
                        type: "line" as const,
                        label: "Documentos Exitosos (Docs)",
                        data: docsData,
                        borderColor: "#eab308",
                        backgroundColor: "transparent",
                        borderWidth: 1.5,
                        borderDash: [3, 3],
                        tension: 0.3,
                        fill: false,
                        pointBackgroundColor: "#eab308",
                        pointBorderColor: "#ffffff",
                        pointBorderWidth: 1.5,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                    },
                    {
                        type: "line" as const,
                        label: "Recepción Compras (Rec)",
                        data: recepData,
                        borderColor: "#a855f7",
                        backgroundColor: "rgba(168, 85, 247, 0.08)",
                        borderWidth: 2.5,
                        tension: 0.3,
                        fill: false,
                        pointBackgroundColor: "#a855f7",
                        pointBorderColor: "#ffffff",
                        pointBorderWidth: 2,
                        pointRadius: 4.5,
                        pointHoverRadius: 6.5,
                    },
                    {
                        type: "line" as const,
                        label: "Ajuste Entrada (Aent)",
                        data: aentData,
                        borderColor: "#f97316",
                        backgroundColor: "transparent",
                        borderWidth: 2,
                        borderDash: [5, 4],
                        tension: 0.3,
                        fill: false,
                        pointBackgroundColor: "#f97316",
                        pointBorderColor: "#ffffff",
                        pointBorderWidth: 2,
                        pointRadius: 4.5,
                        pointHoverRadius: 6.5,
                    },
                    {
                        type: "line" as const,
                        label: "Ajuste Salida (Asal)",
                        data: asalData,
                        borderColor: "#ef4444",
                        backgroundColor: "transparent",
                        borderWidth: 2,
                        borderDash: [5, 4],
                        tension: 0.3,
                        fill: false,
                        pointBackgroundColor: "#ef4444",
                        pointBorderColor: "#ffffff",
                        pointBorderWidth: 2,
                        pointRadius: 4.5,
                        pointHoverRadius: 6.5,
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
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: "rgba(150, 150, 150, 0.12)" },
                        ticks: {
                            color: "rgba(150, 150, 150, 0.9)",
                            font: { size: 10 },
                            callback: function (val) {
                                return Number(val).toLocaleString();
                            },
                        },
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: "rgba(150, 150, 150, 0.9)",
                            font: { size: 10, weight: "bold" },
                        },
                    },
                },
                plugins: {
                    legend: {
                        position: "top",
                        align: "end",
                        labels: {
                            boxWidth: 12,
                            padding: 12,
                            color: "rgba(150, 150, 150, 0.9)",
                            font: { size: 11, weight: "bold" },
                        },
                    },
                    tooltip: {
                        backgroundColor: "rgba(15, 23, 42, 0.95)",
                        titleFont: { weight: "bold", size: 12 },
                        bodyFont: { size: 11 },
                        padding: 12,
                        cornerRadius: 12,
                        callbacks: {
                            label: function (context) {
                                const label = context.dataset.label || "";
                                const val = Number(
                                    context.parsed.y || 0,
                                ).toLocaleString();
                                return ` ${label} : ${val}`;
                            },
                        },
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
                class="flex items-center justify-center gap-2.5 px-8 h-14 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-black shadow-xl shadow-brand-500/20 transition-all active:scale-95 cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                title="Exportar reporte a Excel (.xlsx)"
            >
                <FileSpreadsheet size={20} />
                <span>Exportar Excel</span>
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
        <!-- ESCALA DE CALOR: 4 CARDS DE ESTADO DE STOCK (ROJO, NARANJA, AMARILLO, VERDE) -->
        <div
            class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5"
        >
            <!-- 1. ROJO: SIN STOCK -->
            <div
                class="bg-surface-raised border transition-all rounded-3xl p-5 relative overflow-hidden group cursor-pointer {selectedAlertStatus ===
                'sin_stock'
                    ? 'border-red-500 ring-2 ring-red-500/20 bg-red-500/10'
                    : 'border-border-subtle hover:border-red-500/40'}"
                onclick={() =>
                    (selectedAlertStatus =
                        selectedAlertStatus === "sin_stock" ? "" : "sin_stock")}
                title="Filtrar por artículos sin stock"
            >
                <div
                    class="absolute right-0 top-0 w-28 h-28 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-colors"
                ></div>
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="p-2 rounded-xl bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20"
                    >
                        <AlertTriangle size={20} />
                    </div>
                    <span
                        class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full {selectedAlertStatus ===
                        'sin_stock'
                            ? 'bg-red-600 text-white'
                            : 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'}"
                    >
                        {selectedAlertStatus === "sin_stock"
                            ? "Filtrando"
                            : "SDR = 0"}
                    </span>
                </div>
                <p
                    class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5"
                >
                    Sin Stock
                </p>
                <p
                    class="text-2xl sm:text-3xl font-black text-red-700 dark:text-red-400"
                >
                    {kpis.sin_stock.toLocaleString()}
                </p>
                <p class="text-[10px] text-text-muted mt-1.5 line-clamp-1">
                    Inventario físico en cero.
                </p>
            </div>

            <!-- 2. NARANJA: STOCK QUEBRADO -->
            <div
                class="bg-surface-raised border transition-all rounded-3xl p-5 relative overflow-hidden group cursor-pointer {selectedAlertStatus ===
                'quebrado'
                    ? 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-500/10'
                    : 'border-border-subtle hover:border-orange-500/40'}"
                onclick={() =>
                    (selectedAlertStatus =
                        selectedAlertStatus === "quebrado" ? "" : "quebrado")}
                title="Filtrar por artículos con stock quebrado"
            >
                <div
                    class="absolute right-0 top-0 w-28 h-28 bg-orange-500/5 rounded-full blur-2xl group-hover:bg-orange-500/10 transition-colors"
                ></div>
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="p-2 rounded-xl bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20"
                    >
                        <AlertTriangle size={20} />
                    </div>
                    <span
                        class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full {selectedAlertStatus ===
                        'quebrado'
                            ? 'bg-orange-600 text-white'
                            : 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20'}"
                    >
                        {selectedAlertStatus === "quebrado"
                            ? "Filtrando"
                            : "SDR ≤ ROP"}
                    </span>
                </div>
                <p
                    class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5"
                >
                    Stock Quebrado
                </p>
                <p
                    class="text-2xl sm:text-3xl font-black text-orange-700 dark:text-orange-400"
                >
                    {kpis.quebrado.toLocaleString()}
                </p>
                <p class="text-[10px] text-text-muted mt-1.5 line-clamp-1">
                    Stock bajo el Punto de Reorden.
                </p>
            </div>

            <!-- 3. AMARILLO: RUPTURA INMINENTE -->
            <div
                class="bg-surface-raised border transition-all rounded-3xl p-5 relative overflow-hidden group cursor-pointer {selectedAlertStatus ===
                'ruptura'
                    ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-500/10'
                    : 'border-border-subtle hover:border-amber-500/40'}"
                onclick={() =>
                    (selectedAlertStatus =
                        selectedAlertStatus === "ruptura" ? "" : "ruptura")}
                title="Filtrar por artículos con ruptura inminente"
            >
                <div
                    class="absolute right-0 top-0 w-28 h-28 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-colors"
                ></div>
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="p-2 rounded-xl bg-amber-500/15 text-amber-800 dark:text-yellow-300 border border-amber-500/30"
                    >
                        <Activity size={20} />
                    </div>
                    <span
                        class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full {selectedAlertStatus ===
                        'ruptura'
                            ? 'bg-amber-600 text-white'
                            : 'bg-amber-500/15 text-amber-900 dark:text-yellow-300 border border-amber-500/30'}"
                    >
                        {selectedAlertStatus === "ruptura"
                            ? "Filtrando"
                            : "SDR ≤ ROP+SS"}
                    </span>
                </div>
                <p
                    class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5"
                >
                    Ruptura Inminente
                </p>
                <p
                    class="text-2xl sm:text-3xl font-black text-amber-800 dark:text-yellow-300"
                >
                    {kpis.ruptura.toLocaleString()}
                </p>
                <p class="text-[10px] text-text-muted mt-1.5 line-clamp-1">
                    Consumiendo colchón de seguridad.
                </p>
            </div>

            <!-- 4. VERDE: STOCK SALUDABLE -->
            <div
                class="bg-surface-raised border transition-all rounded-3xl p-5 relative overflow-hidden group cursor-pointer {selectedAlertStatus ===
                'saludable'
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/10'
                    : 'border-border-subtle hover:border-emerald-500/40'}"
                onclick={() =>
                    (selectedAlertStatus =
                        selectedAlertStatus === "saludable" ? "" : "saludable")}
                title="Filtrar por artículos con stock saludable"
            >
                <div
                    class="absolute right-0 top-0 w-28 h-28 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors"
                ></div>
                <div class="flex items-center justify-between mb-3">
                    <div
                        class="p-2 rounded-xl bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30"
                    >
                        <ShieldCheck size={20} />
                    </div>
                    <span
                        class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full {selectedAlertStatus ===
                        'saludable'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-300 border border-emerald-500/30'}"
                    >
                        {selectedAlertStatus === "saludable"
                            ? "Filtrando"
                            : "SDR > ROP+SS"}
                    </span>
                </div>
                <p
                    class="text-text-muted text-[11px] font-bold uppercase tracking-wider mb-0.5"
                >
                    Stock Saludable
                </p>
                <p
                    class="text-2xl sm:text-3xl font-black text-emerald-800 dark:text-emerald-300"
                >
                    {kpis.saludable.toLocaleString()}
                </p>
                <p class="text-[10px] text-text-muted mt-1.5 line-clamp-1">
                    Inventario óptimo que cubre demanda.
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
                class="flex flex-col xl:flex-row gap-4 items-stretch xl:items-center justify-between pt-2 border-t border-border-subtle/50"
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
                        onclick={applyFilters}
                        class="h-12 px-8 rounded-2xl bg-brand-500 text-white font-black hover:scale-105 transition-all shadow-[0_0_20px_rgba(var(--brand-500-rgb),0.3)] w-full sm:w-auto shrink-0 cursor-pointer"
                    >
                        Calcular
                    </button>
                </div>
            </div>
        </div>

        <!-- TABLA PRINCIPAL 100% ANCHO -->
        <div
            class="w-full bg-surface-raised border border-border-subtle rounded-3xl overflow-hidden shadow-xl"
        >
            <div
                class="overflow-x-auto h-[82vh] min-h-[500px] custom-scrollbar"
            >
                <table class="w-full text-left border-collapse relative">
                    <thead
                        class="sticky top-0 bg-surface-base/95 backdrop-blur-md z-20 shadow-sm"
                    >
                        <tr class="border-b border-border-subtle">
                            <th
                                class="px-6 py-4 text-xs font-bold uppercase tracking-widest text-text-muted"
                                >Artículo</th
                            >
                            <th
                                class="px-4 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-center"
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
                                            <b>ABC:</b> Importancia por aporte a
                                            ventas (A: 80%, B: 15%, C: 5%).<br
                                            />
                                            <b>XYZ:</b> Predictibilidad de demanda
                                            (X: Estable ≤20%, Y: Variable ≤60%, Z:
                                            Impredecible >60%).
                                        </p>
                                        <div
                                            class="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-border-subtle"
                                        ></div>
                                    </div>
                                </div>
                            </th>
                            <th
                                class="px-4 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-right"
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
                                            Inventario físico real disponible en
                                            Almacén.
                                        </p>
                                        <div
                                            class="absolute bottom-full right-4 border-4 border-transparent border-b-border-subtle"
                                        ></div>
                                    </div>
                                </div>
                            </th>
                            <th
                                class="px-4 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-right"
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
                                            Fórmula: <b>(VPD × TR) + SS</b>.<br
                                            />
                                            Alerta cuando SDR ≤ ROP (Requiere reponer
                                            stock inmediatamente).
                                        </p>
                                        <div
                                            class="absolute bottom-full right-4 border-4 border-transparent border-b-border-subtle"
                                        ></div>
                                    </div>
                                </div>
                            </th>
                            <th
                                class="px-4 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-right"
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
                                            variabilidad de ventas (95% nivel de
                                            confianza).
                                        </p>
                                        <div
                                            class="absolute bottom-full right-4 border-4 border-transparent border-b-border-subtle"
                                        ></div>
                                    </div>
                                </div>
                            </th>
                            <th
                                class="px-4 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-right"
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
                                            días hábiles del período.
                                        </p>
                                        <div
                                            class="absolute bottom-full right-4 border-4 border-transparent border-b-border-subtle"
                                        ></div>
                                    </div>
                                </div>
                            </th>
                            <th
                                class="px-4 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-right"
                                >TR Prom.</th
                            >
                            <th
                                class="px-4 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-right"
                                >Ventas</th
                            >
                            <th
                                class="px-4 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-right"
                                >Pedir Sugerido</th
                            >
                            <th
                                class="px-4 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-right"
                                >Inversión Est.</th
                            >
                            <th
                                class="px-4 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-center"
                                >Estado</th
                            >
                            <th
                                class="px-4 py-4 text-xs font-bold uppercase tracking-widest text-text-muted text-center"
                                >Gráfica</th
                            >
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border-subtle">
                        {#each items as item}
                            {@const cantReponer = getCantReponer(item)}
                            {@const costoInversion =
                                cantReponer * (item.costo_actual || 0)}
                            {@const alertInfo = getAlertBadge(item)}
                            {@const classInfo = classDescriptions[
                                item.clase_conjunta
                            ] || {
                                label: "Clasificación Combinada",
                                desc: "Matriz ABC/XYZ",
                                priority: "Estándar",
                            }}
                            <tr
                                class="hover:bg-surface-soft/80 cursor-pointer transition-all group {selectedArticle?.co_art ===
                                    item.co_art && detailModalOpen
                                    ? 'bg-brand-500/10'
                                    : ''}"
                                onclick={() => openArticleModal(item)}
                            >
                                <td class="px-6 py-3.5">
                                    <div class="flex flex-col">
                                        <span
                                            class="text-sm font-bold text-text-base group-hover:text-brand-500 transition-colors"
                                            >{item.des_art}</span
                                        >
                                        <div class="flex items-center gap-2 text-[10px] text-text-muted flex-wrap">
                                            <span class="font-mono">{item.co_art}</span>
                                            {#if item.des_lin}
                                                <span>•</span>
                                                <span class="truncate max-w-[120px]">{item.des_lin}</span>
                                            {/if}
                                            {#if item.des_cat}
                                                <span>•</span>
                                                <span class="truncate max-w-[120px]">{item.des_cat}</span>
                                            {/if}
                                        </div>
                                    </div>
                                </td>
                                <td class="px-4 py-3.5 text-center">
                                    <span
                                        class="inline-flex px-2.5 py-0.5 rounded-lg text-xs font-black {item.clasificacion_abc ===
                                        'A'
                                            ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/30'
                                            : 'bg-surface-base border border-border-subtle text-text-base'}"
                                    >
                                        {item.clase_conjunta}
                                    </span>
                                </td>
                                <td
                                    class="px-4 py-3.5 text-right font-mono text-sm font-black {alertInfo.class}"
                                >
                                    {formatUnitQty(item.sdr, item.co_uni)}
                                </td>
                                <td
                                    class="px-4 py-3.5 text-right font-mono text-sm text-text-base font-bold"
                                >
                                    {formatUnitQty(item.rop, item.co_uni)}
                                </td>
                                <td
                                    class="px-4 py-3.5 text-right font-mono text-xs text-text-muted"
                                >
                                    {formatUnitQty(item.ss, item.co_uni)}
                                </td>
                                <td
                                    class="px-4 py-3.5 text-right font-mono text-xs font-bold text-brand-600 dark:text-brand-400"
                                >
                                    {item.vpd.toFixed(2)}
                                </td>
                                <td
                                    class="px-4 py-3.5 text-right font-mono text-xs text-text-muted"
                                >
                                    {item.tr.toFixed(1)}d
                                </td>
                                <td
                                    class="px-4 py-3.5 text-right font-mono text-xs font-bold text-text-base"
                                >
                                    {item.ventas_netas.toLocaleString()}
                                </td>
                                <td class="px-4 py-3.5 text-right">
                                    {#if cantReponer > 0}
                                        <span
                                            class="inline-flex items-center gap-1 font-mono font-black text-xs px-2 py-0.5 rounded-lg border bg-transparent {item.sdr <=
                                            0
                                                ? 'border-red-500/40 text-red-600 dark:text-red-400'
                                                : item.sdr <= item.rop
                                                  ? 'border-orange-500/40 text-orange-600 dark:text-orange-400'
                                                  : 'border-amber-500/40 dark:border-yellow-500/40 text-amber-700 dark:text-yellow-400'}"
                                        >
                                            +{formatUnitQty(
                                                cantReponer,
                                                item.co_uni,
                                            )}
                                        </span>
                                    {:else}
                                        <span
                                            class="text-[11px] font-bold text-emerald-700 dark:text-emerald-400"
                                        >
                                            Cubierto
                                        </span>
                                    {/if}
                                </td>
                                <td
                                    class="px-4 py-3.5 text-right font-mono text-xs font-bold text-text-base"
                                >
                                    {cantReponer > 0
                                        ? formatCurrency(costoInversion)
                                        : "—"}
                                </td>
                                <td class="px-4 py-3.5 text-center">
                                    <span
                                        class="inline-flex px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border {alertInfo.badgeClass}"
                                    >
                                        {alertInfo.label}
                                    </span>
                                </td>
                                <td class="px-4 py-3.5 text-center">
                                    <button
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            openArticleModal(item);
                                        }}
                                        class="p-2 rounded-xl bg-surface-soft hover:bg-brand-500 hover:text-white text-text-muted transition-all cursor-pointer shadow-sm"
                                        title="Ver Gráfica y Detalle de Análisis"
                                    >
                                        <BarChart2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}
</div>

<!-- MODAL DE ANÁLISIS DETALLADO Y GRÁFICO (ABARCA CASI TODA LA PANTALLA) -->
{#if detailModalOpen && selectedArticle}
    {@const cantReponer = getCantReponer(selectedArticle)}
    {@const costoInversion = cantReponer * (selectedArticle.costo_actual || 0)}
    {@const demandaTR = Number(
        (selectedArticle.vpd * selectedArticle.tr).toFixed(2),
    )}
    {@const alertInfo = getAlertBadge(selectedArticle)}
    {@const isSinStock = selectedArticle.sdr <= 0}
    {@const isQuebrado =
        selectedArticle.sdr > 0 && selectedArticle.sdr <= selectedArticle.rop}
    {@const isRuptura =
        selectedArticle.sdr > selectedArticle.rop &&
        selectedArticle.sdr <= selectedArticle.rop + selectedArticle.ss}
    {@const isFrac = isFractionalUnit(
        selectedArticle.co_uni,
        selectedArticle.des_uni,
    )}
    {@const unitLabel = getUnitLabel(selectedArticle)}
    {@const classInfo = classDescriptions[selectedArticle.clase_conjunta] || {
        label: "Clasificación Combinada",
        desc: "Matriz ABC/XYZ",
        priority: "Estándar",
    }}

    <!-- BACKDROP -->
    <div
        class="fixed inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 md:p-6 animate-fade-in"
        onclick={(e) => {
            if (e.target === e.currentTarget) closeArticleModal();
        }}
    >
        <!-- MODAL CONTAINER (100% en teléfonos, 90% de pantalla en PC) -->
        <div
            class="bg-surface-raised border-0 sm:border border-border-subtle rounded-none sm:rounded-[32px] md:rounded-[36px] shadow-2xl w-full md:w-[90vw] md:max-w-[90vw] h-full sm:h-auto sm:max-h-[94vh] flex flex-col overflow-hidden animate-scale-in"
            role="dialog"
            aria-modal="true"
        >
            <!-- MODAL HEADER -->
            <div
                class="px-6 py-5 border-b border-border-subtle bg-surface-base/80 backdrop-blur-md flex items-start justify-between gap-4 shrink-0"
            >
                <div class="space-y-1.5 flex-1 min-w-0">
                    <div class="flex items-center flex-wrap gap-2">
                        <span
                            class="px-3 py-1 rounded-xl text-xs font-black bg-surface-soft border border-border-subtle text-text-base"
                        >
                            Clase {selectedArticle.clase_conjunta}
                        </span>
                        <span
                            class="px-3 py-1 rounded-xl text-xs font-black border {alertInfo.class}"
                        >
                            {alertInfo.label}
                        </span>
                        <span
                            class="text-xs font-mono text-text-muted font-bold px-2.5 py-1 rounded-xl bg-surface-base border border-border-subtle"
                        >
                            Cód: {selectedArticle.co_art}
                        </span>
                        <span
                            class="text-xs font-bold text-text-muted px-2.5 py-1 rounded-xl bg-surface-base border border-border-subtle"
                        >
                            Unidad: <b>{unitLabel}</b> ({isFrac
                                ? "Fraccionable"
                                : "Entera / Discreta"})
                        </span>
                        {#if selectedArticle.costo_actual}
                            <span
                                class="text-xs font-bold text-text-muted px-2.5 py-1 rounded-xl bg-surface-base border border-border-subtle"
                            >
                                Costo Unit.: <b
                                    >{formatCurrency(
                                        selectedArticle.costo_actual,
                                    )}</b
                                >
                            </span>
                        {/if}
                    </div>
                    <h2
                        class="text-xl sm:text-2xl font-black text-text-base tracking-tight truncate"
                        title={selectedArticle.des_art}
                    >
                        {selectedArticle.des_art}
                    </h2>
                </div>

                <button
                    onclick={closeArticleModal}
                    class="p-2.5 rounded-2xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base border border-border-subtle transition-all cursor-pointer shrink-0"
                    title="Cerrar (Esc)"
                >
                    <X size={20} />
                </button>
            </div>

            <!-- MODAL BODY -->
            <div
                class="p-6 sm:p-8 overflow-y-auto custom-scrollbar flex-1 space-y-8"
            >
                <!-- SECCIÓN 1: Gráfico de Stock (25% en PC / 100% en tlf) vs Detalle de Compra (75% en PC / 100% en tlf) -->
                <div class="flex flex-col lg:flex-row gap-6 items-stretch">
                    <!-- COLUMNA GRÁFICO DE STOCK: 25% ancho en PC, 100% en tlf -->
                    <div
                        class="w-full lg:w-1/4 shrink-0 flex flex-col bg-surface-base border border-border-subtle rounded-3xl p-5 shadow-sm"
                    >
                        <div class="flex items-center justify-between mb-3">
                            <span
                                class="text-xs font-black uppercase tracking-wider text-text-muted flex items-center gap-2"
                            >
                                <BarChart size={16} class="text-brand-500" />
                                Gráfica de Stock
                            </span>
                            <span
                                class="text-[10px] font-bold text-text-muted bg-surface-raised px-2 py-0.5 rounded-md border border-border-subtle"
                            >
                                SDR vs ROP
                            </span>
                        </div>

                        <div
                            class="flex-1 w-full min-h-[280px] sm:min-h-[300px] lg:min-h-[320px] relative"
                        >
                            <canvas bind:this={chartCanvas}></canvas>
                        </div>

                        <div
                            class="mt-3 pt-3 border-t border-border-subtle/60 grid grid-cols-3 gap-1.5 text-center"
                        >
                            <div class="p-2 rounded-xl bg-blue-500/10">
                                <span
                                    class="text-[9px] font-bold text-blue-500 block uppercase"
                                    >SDR</span
                                >
                                <span class="text-xs font-black text-text-base"
                                    >{formatUnitQty(
                                        selectedArticle.sdr,
                                        selectedArticle.co_uni,
                                    )}</span
                                >
                            </div>
                            <div class="p-2 rounded-xl bg-orange-500/10">
                                <span
                                    class="text-[9px] font-bold text-orange-500 block uppercase"
                                    >ROP</span
                                >
                                <span class="text-xs font-black text-text-base"
                                    >{formatUnitQty(
                                        selectedArticle.rop,
                                        selectedArticle.co_uni,
                                    )}</span
                                >
                            </div>
                            <div class="p-2 rounded-xl bg-yellow-500/10">
                                <span
                                    class="text-[9px] font-bold text-yellow-500 block uppercase"
                                    >Dem. TR</span
                                >
                                <span class="text-xs font-black text-text-base"
                                    >{formatUnitQty(
                                        demandaTR,
                                        selectedArticle.co_uni,
                                    )}</span
                                >
                            </div>
                        </div>
                    </div>

                    <!-- COLUMNA DETALLES & MÉTRICAS: 75% ancho en PC, 100% en tlf -->
                    <div class="w-full lg:w-3/4 flex-1 flex flex-col gap-5">
                        <!-- CUADRÍCULA DE 6 MÉTRICAS PRINCIPALES -->
                        <div
                            class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
                        >
                            <div
                                class="bg-surface-base p-4 rounded-2xl border border-border-subtle"
                            >
                                <p
                                    class="text-[10px] text-text-muted font-bold uppercase mb-1"
                                >
                                    Ventas Período
                                </p>
                                <p class="text-lg font-black text-text-base">
                                    {formatUnitQty(
                                        selectedArticle.ventas_netas,
                                        selectedArticle.co_uni,
                                    )}
                                </p>
                                <p
                                    class="text-[10px] text-text-muted font-medium"
                                >
                                    {data.businessDays || 0}d hábiles
                                </p>
                            </div>
                            <div
                                class="bg-surface-base p-4 rounded-2xl border border-border-subtle"
                            >
                                <p
                                    class="text-[10px] text-text-muted font-bold uppercase mb-1"
                                >
                                    Venta Diaria (VPD)
                                </p>
                                <p class="text-lg font-black text-brand-500">
                                    {selectedArticle.vpd.toFixed(2)}
                                </p>
                                <p
                                    class="text-[10px] text-text-muted font-medium"
                                >
                                    {unitLabel} / día
                                </p>
                            </div>
                            <div
                                class="bg-surface-base p-4 rounded-2xl border border-border-subtle"
                            >
                                <p
                                    class="text-[10px] text-text-muted font-bold uppercase mb-1"
                                >
                                    Tiempo Reposición (TR)
                                </p>
                                <p class="text-lg font-black text-text-base">
                                    {selectedArticle.tr.toFixed(1)}
                                </p>
                                <p
                                    class="text-[10px] text-text-muted font-medium"
                                >
                                    días prom.
                                </p>
                            </div>
                            <div
                                class="bg-surface-base p-4 rounded-2xl border border-border-subtle"
                            >
                                <p
                                    class="text-[10px] text-text-muted font-bold uppercase mb-1"
                                >
                                    Stock Seguridad (SS)
                                </p>
                                <p class="text-lg font-black text-text-base">
                                    {formatUnitQty(
                                        selectedArticle.ss,
                                        selectedArticle.co_uni,
                                    )}
                                </p>
                                <p
                                    class="text-[10px] text-text-muted font-medium"
                                >
                                    colchón 95%
                                </p>
                            </div>
                            <div
                                class="bg-surface-base p-4 rounded-2xl border border-border-subtle"
                            >
                                <p
                                    class="text-[10px] text-text-muted font-bold uppercase mb-1"
                                >
                                    Punto Reorden (ROP)
                                </p>
                                <p class="text-lg font-black text-orange-500">
                                    {formatUnitQty(
                                        selectedArticle.rop,
                                        selectedArticle.co_uni,
                                    )}
                                </p>
                                <p
                                    class="text-[10px] text-text-muted font-medium"
                                >
                                    (VPD×TR) + SS
                                </p>
                            </div>
                            <div
                                class="bg-surface-base p-4 rounded-2xl border border-border-subtle"
                            >
                                <p
                                    class="text-[10px] text-text-muted font-bold uppercase mb-1"
                                >
                                    Stock Actual (SDR)
                                </p>
                                <p
                                    class="text-lg font-black {alertInfo.class} border-0 p-0"
                                >
                                    {formatUnitQty(
                                        selectedArticle.sdr,
                                        selectedArticle.co_uni,
                                    )}
                                </p>
                                <p
                                    class="text-[10px] text-text-muted font-medium"
                                >
                                    disponible almacén
                                </p>
                            </div>
                        </div>

                        <!-- ESTRATEGIA ABC / XYZ -->
                        <div
                            class="bg-surface-base p-5 rounded-3xl border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                            <div class="space-y-1">
                                <div class="flex items-center gap-2">
                                    <span
                                        class="font-black text-brand-500 text-sm"
                                        >Clasificación {selectedArticle.clase_conjunta}
                                        — {classInfo.label}</span
                                    >
                                    <span
                                        class="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-surface-soft text-text-base border border-border-subtle"
                                    >
                                        {classInfo.priority}
                                    </span>
                                </div>
                                <p
                                    class="text-xs text-text-muted leading-relaxed"
                                >
                                    {classInfo.desc}
                                </p>
                            </div>
                        </div>

                        <!-- CUADRO DE RECOMENDACIÓN DE COMPRA & INVERSIÓN SEGÚN ESCALA DE CALOR -->
                        <div
                            class="p-6 rounded-3xl border transition-all {isSinStock
                                ? 'bg-red-500/10 dark:bg-red-500/15 border-red-500/30'
                                : isQuebrado
                                  ? 'bg-orange-500/10 dark:bg-orange-500/15 border-orange-500/30'
                                  : isRuptura
                                    ? 'bg-amber-500/15 dark:bg-yellow-500/15 border-amber-500/40 dark:border-yellow-500/30'
                                    : 'bg-emerald-500/15 dark:bg-emerald-500/15 border-emerald-500/40 dark:border-emerald-500/30'}"
                        >
                            <div
                                class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4"
                            >
                                <div
                                    class="flex items-center gap-2.5 font-bold {isSinStock
                                        ? 'text-red-700 dark:text-red-400'
                                        : isQuebrado
                                          ? 'text-orange-700 dark:text-orange-400'
                                          : isRuptura
                                            ? 'text-amber-800 dark:text-yellow-300'
                                            : 'text-emerald-800 dark:text-emerald-300'}"
                                >
                                    {#if isSinStock}
                                        <div
                                            class="p-2 rounded-xl bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/20"
                                        >
                                            <AlertTriangle size={20} />
                                        </div>
                                        <div>
                                            <h4
                                                class="text-sm font-black uppercase tracking-wider"
                                            >
                                                Alerta Crítica: Sin Stock (SDR =
                                                0)
                                            </h4>
                                            <p
                                                class="text-xs text-text-muted font-normal"
                                            >
                                                Inventario en cero. Se requiere
                                                reabastecimiento urgente para no
                                                perder ventas.
                                            </p>
                                        </div>
                                    {:else if isQuebrado}
                                        <div
                                            class="p-2 rounded-xl bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/20"
                                        >
                                            <AlertTriangle size={20} />
                                        </div>
                                        <div>
                                            <h4
                                                class="text-sm font-black uppercase tracking-wider"
                                            >
                                                Alerta: Stock Quebrado (SDR ≤
                                                ROP)
                                            </h4>
                                            <p
                                                class="text-xs text-text-muted font-normal"
                                            >
                                                El stock actual cayó por debajo
                                                del Punto de Reorden. Emitir
                                                orden de compra.
                                            </p>
                                        </div>
                                    {:else if isRuptura}
                                        <div
                                            class="p-2 rounded-xl bg-amber-500/20 text-amber-800 dark:text-yellow-300 border border-amber-500/30"
                                        >
                                            <Activity size={20} />
                                        </div>
                                        <div>
                                            <h4
                                                class="text-sm font-black uppercase tracking-wider"
                                            >
                                                Alerta Preventiva: Ruptura
                                                Inminente (SDR ≤ ROP+SS)
                                            </h4>
                                            <p
                                                class="text-xs text-text-muted font-normal"
                                            >
                                                El inventario está consumiendo
                                                el colchón de seguridad.
                                            </p>
                                        </div>
                                    {:else}
                                        <div
                                            class="p-2 rounded-xl bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30"
                                        >
                                            <ShieldCheck size={20} />
                                        </div>
                                        <div>
                                            <h4
                                                class="text-sm font-black uppercase tracking-wider"
                                            >
                                                Inventario Óptimo y Seguro
                                            </h4>
                                            <p
                                                class="text-xs text-text-muted font-normal"
                                            >
                                                El stock actual cubre
                                                holgadamente la demanda
                                                esperada.
                                            </p>
                                        </div>
                                    {/if}
                                </div>
                                <span
                                    class="text-xs font-black px-3 py-1 rounded-xl uppercase tracking-wider self-start sm:self-auto {isSinStock
                                        ? 'bg-red-500/15 text-red-800 dark:text-red-300 border border-red-500/30'
                                        : isQuebrado
                                          ? 'bg-orange-500/15 text-orange-800 dark:text-orange-300 border border-orange-500/30'
                                          : isRuptura
                                            ? 'bg-amber-500/20 text-amber-900 dark:text-yellow-300 border border-amber-500/40'
                                            : 'bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 border border-emerald-500/40'}"
                                >
                                    {isSinStock
                                        ? "Reabastecimiento Urgente"
                                        : isQuebrado
                                          ? "Stock Quebrado"
                                          : isRuptura
                                            ? "Ruptura Inminente"
                                            : "Stock Saludable"}
                                </span>
                            </div>

                            <div
                                class="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4 p-4 rounded-2xl bg-surface-raised/80 border border-border-subtle/50"
                            >
                                <div>
                                    <p
                                        class="text-xs text-text-muted font-bold uppercase mb-1"
                                    >
                                        Cantidad Sugerida a Pedir
                                    </p>
                                    <p
                                        class="text-3xl font-black {cantReponer >
                                        0
                                            ? isSinStock
                                                ? 'text-red-700 dark:text-red-400'
                                                : isQuebrado
                                                  ? 'text-orange-700 dark:text-orange-400'
                                                  : 'text-amber-800 dark:text-yellow-300'
                                            : 'text-emerald-800 dark:text-emerald-400'}"
                                    >
                                        {formatUnitQty(
                                            cantReponer,
                                            selectedArticle.co_uni,
                                        )}
                                        <span
                                            class="text-sm font-bold text-text-muted"
                                            >{unitLabel}</span
                                        >
                                    </p>
                                </div>
                                <div>
                                    <p
                                        class="text-xs text-text-muted font-bold uppercase mb-1"
                                    >
                                        Inversión Estimada Total
                                    </p>
                                    <p
                                        class="text-3xl font-black text-text-base"
                                    >
                                        {formatCurrency(costoInversion)}
                                    </p>
                                </div>
                            </div>

                            <p class="text-xs text-text-muted leading-relaxed">
                                {#if cantReponer > 0}
                                    {#if isSinStock}
                                        El inventario actual es <b
                                            >0 {unitLabel}</b
                                        >
                                        a pesar de registrar una venta diaria
                                        promedio de
                                        <b
                                            >{selectedArticle.vpd.toFixed(2)}
                                            {unitLabel}/día</b
                                        >. Pedir
                                        <b
                                            >{formatUnitQty(
                                                cantReponer,
                                                selectedArticle,
                                            )}
                                            {unitLabel}</b
                                        >
                                        ({isFrac
                                            ? "fraccionable por unidad " +
                                              unitLabel
                                            : "mínimo indivisible por unidad " +
                                              unitLabel}) cubrirá la demanda
                                        proyectada de
                                        <b>{demandaTR} {unitLabel}</b>
                                        durante los {selectedArticle.tr.toFixed(
                                            1,
                                        )} días de reposición y evitará pérdidas
                                        de ventas.
                                    {:else}
                                        Pedir <b
                                            >{formatUnitQty(
                                                cantReponer,
                                                selectedArticle,
                                            )}
                                            {unitLabel}</b
                                        >
                                        cubrirá los
                                        <b>{demandaTR} {unitLabel}</b>
                                        de demanda proyectada durante el tiempo
                                        de reposición del proveedor ({selectedArticle.tr.toFixed(
                                            1,
                                        )} días) y garantizará mantener el colchón
                                        de seguridad de
                                        <b
                                            >{formatUnitQty(
                                                selectedArticle.ss,
                                                selectedArticle,
                                            )}
                                            {unitLabel}</b
                                        >
                                        (<i>SS</i>).
                                    {/if}
                                {:else}
                                    El stock actual ({formatUnitQty(
                                        selectedArticle.sdr,
                                        selectedArticle,
                                    )}
                                    {unitLabel}) cubre holgadamente el Punto de
                                    Reorden ({formatUnitQty(
                                        selectedArticle.rop,
                                        selectedArticle,
                                    )}
                                    {unitLabel}) y el colchón de seguridad ({formatUnitQty(
                                        selectedArticle.ss,
                                        selectedArticle,
                                    )}
                                    {unitLabel}). No se requiere emitir pedido
                                    en este momento.
                                {/if}
                            </p>
                        </div>
                    </div>
                </div>

                <!-- SECCIÓN 2: HISTÓRICO DE VENTAS, RECEPCIONES, AJUSTES, STOCK INICIAL Y DOCUMENTOS -->
                <div
                    class="bg-surface-base border border-border-subtle rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm"
                >
                    <div
                        class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border-subtle"
                    >
                        <div class="space-y-1">
                            <div class="flex items-center gap-2.5">
                                <Activity size={20} class="text-brand-500" />
                                <h3
                                    class="text-lg font-black text-text-base tracking-tight"
                                >
                                    Histórico de Ventas, Recepción de Compras,
                                    Ajustes, Stock Inicial y Documentos ({historyTipoAgrupacion === 'diario' ? 'Diario' : historyTipoAgrupacion === 'semanal' ? 'Semanal' : 'Mensual'})
                                </h3>
                            </div>
                            <p class="text-xs text-text-muted">
                                Evolución {historyTipoAgrupacion === 'diario' ? 'diaria' : historyTipoAgrupacion === 'semanal' ? 'semanal' : 'mensual'} de <b class="text-emerald-500"
                                    >Ventas</b
                                >, <b class="text-purple-500">Recepciones</b>,
                                <b class="text-orange-500">Ajustes Entrada</b>,
                                <b class="text-red-500">Ajustes Salida</b>,
                                <b class="text-blue-500">Stock Inicial</b>
                                y <b class="text-amber-500">Documentos</b>.
                            </p>
                        </div>

                        <!-- MÉTRICAS RESUMEN HISTÓRICO -->
                        <div class="flex items-center flex-wrap gap-2">
                            <div
                                class="px-3 py-1 rounded-2xl bg-surface-raised border border-border-subtle flex items-center gap-1.5"
                            >
                                <span
                                    class="text-[10px] font-bold uppercase text-text-muted"
                                    >Ventas:</span
                                >
                                <span
                                    class="text-xs font-black text-emerald-500"
                                >
                                    {historySummary.total.toLocaleString()}
                                </span>
                            </div>
                            <div
                                class="px-3 py-1 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center gap-1.5 text-purple-700 dark:text-purple-400"
                            >
                                <span class="text-[10px] font-bold uppercase"
                                    >Recep:</span
                                >
                                <span class="text-xs font-black">
                                    {historySummary.totalRecep.toLocaleString()}
                                </span>
                            </div>
                            <div
                                class="px-3 py-1 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center gap-1.5 text-orange-700 dark:text-orange-400"
                            >
                                <span class="text-[10px] font-bold uppercase"
                                    >A.Ent:</span
                                >
                                <span class="text-xs font-black">
                                    {historySummary.totalAent.toLocaleString()}
                                </span>
                            </div>
                            <div
                                class="px-3 py-1 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-1.5 text-red-700 dark:text-red-400"
                            >
                                <span class="text-[10px] font-bold uppercase"
                                    >A.Sal:</span
                                >
                                <span class="text-xs font-black">
                                    {historySummary.totalAsal.toLocaleString()}
                                </span>
                            </div>
                            <div
                                class="px-3 py-1 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-1.5 text-amber-600 dark:text-amber-400"
                            >
                                <FileText size={13} />
                                <span class="text-[10px] font-bold uppercase"
                                    >Docs:</span
                                >
                                <span class="text-xs font-black">
                                    {historySummary.totalDocs.toLocaleString()}
                                </span>
                            </div>
                            {#if historySummary.maxMonth}
                                <div
                                    class="px-3 py-1 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
                                >
                                    <ArrowUpRight size={13} />
                                    <span
                                        class="text-[10px] font-bold uppercase"
                                        >Pico:</span
                                    >
                                    <span class="text-xs font-black">
                                        {historySummary.max.toLocaleString()} ({historySummary.maxMonth})
                                    </span>
                                </div>
                            {/if}
                        </div>
                    </div>

                    <!-- CONTENEDOR DEL GRÁFICO MULTI-EJE DE LÍNEAS -->
                    {#if historyLoading}
                        <div
                            class="w-full h-72 flex flex-col items-center justify-center gap-3 text-text-muted opacity-70"
                        >
                            <RefreshCw
                                size={28}
                                class="animate-spin text-brand-500"
                            />
                            <p class="text-xs font-bold">
                                Reconstruyendo histórico y movimientos de stock
                                en Profit...
                            </p>
                        </div>
                    {:else if historyError}
                        <div
                            class="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-between gap-4"
                        >
                            <div class="flex items-center gap-3">
                                <AlertTriangle size={20} />
                                <span class="text-xs font-bold"
                                    >{historyError}</span
                                >
                            </div>
                            <button
                                onclick={() =>
                                    fetchArticleHistory(selectedArticle.co_art)}
                                class="px-4 py-1.5 rounded-xl bg-surface-raised border border-border-subtle text-xs font-black hover:bg-surface-soft transition-all cursor-pointer"
                            >
                                Reintentar
                            </button>
                        </div>
                    {:else if historyData.length > 0}
                        <!-- CONTENEDOR CON SCROLL HORIZONTAL RESPONSIVO EN MÓVIL -->
                        <div
                            class="w-full overflow-x-auto custom-scrollbar pb-2"
                        >
                            <div
                                class="min-w-[680px] lg:min-w-full h-72 sm:h-80 relative"
                            >
                                <canvas bind:this={historyChartCanvas}></canvas>
                            </div>
                        </div>

                        <!-- DESGLOSE EN MINI-CARDS ESTANDARIZADAS DE LOS PERIODOS -->
                        <div
                            class="pt-4 border-t border-border-subtle/60 space-y-2"
                        >
                            <div class="flex items-center justify-between">
                                <span
                                    class="text-xs font-black uppercase tracking-wider text-text-muted"
                                >
                                    Detalle {historyTipoAgrupacion === 'diario' ? 'Diario' : historyTipoAgrupacion === 'semanal' ? 'Semanal' : 'Mensual'} ({historyData.length} {historyTipoAgrupacion === 'diario' ? (historyData.length === 1 ? 'día' : 'días') : historyTipoAgrupacion === 'semanal' ? (historyData.length === 1 ? 'semana' : 'semanas') : (historyData.length === 1 ? 'mes' : 'meses')})
                                </span>
                                <span
                                    class="text-[10px] text-text-muted font-medium"
                                >
                                    ← Desliza para ver todos los períodos →
                                </span>
                            </div>
                            <div
                                class="w-full overflow-x-auto custom-scrollbar pb-2"
                            >
                                <div
                                    class="flex gap-2 min-w-max pb-1"
                                >
                                    {#each historyData as m}
                                        {@const isMax =
                                            m.mes_nombre ===
                                                historySummary.maxMonth &&
                                            historySummary.max > 0}
                                        <div
                                            class="p-2.5 rounded-2xl border transition-all min-w-[95px] flex-1 {isMax
                                                ? 'bg-emerald-500/15 border-emerald-500/40 shadow-sm'
                                                : 'bg-surface-raised border-border-subtle/70'}"
                                        >
                                            <span
                                                class="text-[11px] font-black text-text-base block truncate mb-1.5 pb-1 border-b border-border-subtle/50 text-center"
                                            >
                                                {m.mes_nombre}
                                            </span>
                                            <div
                                                class="space-y-1 text-[10px] font-mono"
                                            >
                                                <div
                                                    class="flex items-center justify-between gap-1 text-blue-600 dark:text-blue-400 font-bold"
                                                    title="Stock Inicial del Período"
                                                >
                                                    <span
                                                        class="text-text-muted font-semibold text-[9px]"
                                                        >Stk :</span
                                                    >
                                                    <span
                                                        >{m.stock_inicial.toLocaleString()}</span
                                                    >
                                                </div>
                                                <div
                                                    class="flex items-center justify-between gap-1 text-emerald-600 dark:text-emerald-400 font-bold"
                                                    title="Ventas Reales"
                                                >
                                                    <span
                                                        class="text-text-muted font-semibold text-[9px]"
                                                        >Vta :</span
                                                    >
                                                    <span
                                                        >{m.cant_real_vendida.toLocaleString()}</span
                                                    >
                                                </div>
                                                <div
                                                    class="flex items-center justify-between gap-1 {m.docs_exitosos >
                                                    0
                                                        ? 'text-amber-600 dark:text-amber-400 font-bold'
                                                        : 'text-text-muted/60'}"
                                                    title="Documentos Exitosos"
                                                >
                                                    <span
                                                        class="text-text-muted font-semibold text-[9px]"
                                                        >Docs :</span
                                                    >
                                                    <span
                                                        >{m.docs_exitosos.toLocaleString()}</span
                                                    >
                                                </div>
                                                <div
                                                    class="flex items-center justify-between gap-1 {m.cant_recepcionada >
                                                    0
                                                        ? 'text-purple-600 dark:text-purple-400 font-bold'
                                                        : 'text-text-muted/60'}"
                                                    title="Recepción de Compras"
                                                >
                                                    <span
                                                        class="text-text-muted font-semibold text-[9px]"
                                                        >Rec :</span
                                                    >
                                                    <span
                                                        >{m.cant_recepcionada.toLocaleString()}</span
                                                    >
                                                </div>
                                                <div
                                                    class="flex items-center justify-between gap-1 {m.cant_ajuste_entrada >
                                                    0
                                                        ? 'text-orange-600 dark:text-orange-400 font-bold'
                                                        : 'text-text-muted/60'}"
                                                    title="Ajustes de Entrada"
                                                >
                                                    <span
                                                        class="text-text-muted font-semibold text-[9px]"
                                                        >Aent :</span
                                                    >
                                                    <span
                                                        >{m.cant_ajuste_entrada.toLocaleString()}</span
                                                    >
                                                </div>
                                                <div
                                                    class="flex items-center justify-between gap-1 {m.cant_ajuste_salida >
                                                    0
                                                        ? 'text-red-600 dark:text-red-400 font-bold'
                                                        : 'text-text-muted/60'}"
                                                    title="Ajustes de Salida"
                                                >
                                                    <span
                                                        class="text-text-muted font-semibold text-[9px]"
                                                        >Asal :</span
                                                    >
                                                    <span
                                                        >{m.cant_ajuste_salida.toLocaleString()}</span
                                                    >
                                                </div>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        </div>
                    {:else}
                        <div
                            class="p-8 rounded-2xl bg-surface-raised text-center text-text-muted text-xs font-bold"
                        >
                            No hay movimientos registrados para este artículo en el rango de fechas seleccionado.
                        </div>
                    {/if}
                </div>
            </div>

            <!-- MODAL FOOTER -->
            <div
                class="px-6 py-4 border-t border-border-subtle bg-surface-base/80 backdrop-blur-md flex items-center justify-between shrink-0"
            >
                <span class="text-xs text-text-muted font-medium">
                    Presiona <kbd
                        class="px-2 py-0.5 rounded bg-surface-raised border border-border-subtle text-[11px] font-mono font-bold text-text-base"
                        >ESC</kbd
                    > o haz clic fuera para cerrar
                </span>
                <button
                    onclick={closeArticleModal}
                    class="px-6 py-2.5 rounded-2xl bg-surface-soft hover:bg-surface-strong text-text-base font-black text-xs border border-border-subtle transition-all cursor-pointer"
                >
                    Cerrar
                </button>
            </div>
        </div>
    </div>
{/if}
