<script lang="ts">
    import { fade, slide } from "svelte/transition";
    import {
        Wallet,
        FileText,
        Calendar,
        DollarSign,
        Clock,
        AlertTriangle,
        ChevronLeft,
        ChevronRight,
        Store,
        Search,
        Filter,
        FileDown,
        TrendingDown,
        TrendingUp,
        CheckCircle,
        RefreshCw,
        Loader2,
        User,
        Eye,
        X,
        FileSpreadsheet,
    } from "lucide-svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { toast } from "svelte-sonner";
    import SearchBar from "$lib/components/ui/SearchBar.svelte";
    import Combobox from "$lib/components/ui/Combobox.svelte";
    import dayjs from "dayjs";
    import "dayjs/locale/es";

    let { data } = $props();

    dayjs.locale("es");

    let isSearching = $state(false);
    let exporting = $state(false);

    // Filtros
    let filterSearch = $state("");
    let filterStatus = $state("all"); // all, vencidos, por_vencer
    let filterTipoDoc = $state("all"); // all, FACT, NDEB, etc.
    let filterSede = $state("");

    $effect(() => {
        filterSearch = $page.url.searchParams.get("search") || "";
        filterStatus = $page.url.searchParams.get("status") || "all";
        filterTipoDoc = $page.url.searchParams.get("tipo_doc") || "all";
        filterSede = data.selectedBranchId || "";
    });

    function applyFilters() {
        isSearching = true;
        const params = new URLSearchParams($page.url.searchParams);
        if (filterSearch) params.set("search", filterSearch);
        else params.delete("search");
        if (filterStatus && filterStatus !== "all")
            params.set("status", filterStatus);
        else params.delete("status");
        if (filterTipoDoc && filterTipoDoc !== "all")
            params.set("tipo_doc", filterTipoDoc);
        else params.delete("tipo_doc");
        if (filterSede) params.set("branch_id", filterSede);
        params.set("page", "1");

        goto(`?${params.toString()}`).finally(() => {
            isSearching = false;
        });
    }

    function changePage(p: number) {
        const params = new URLSearchParams($page.url.searchParams);
        params.set("page", p.toString());
        goto(`?${params.toString()}`);
    }

    function formatCurrency(val: number, code: string = "USD") {
        const formatter = new Intl.NumberFormat("es-VE", {
            style: "currency",
            currency: code === "USD" ? "USD" : "VES",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        return formatter.format(val);
    }

    // Tipo de documentos badges
    const docTypes: Record<string, { label: string; class: string }> = {
        FACT: {
            label: "Factura",
            class: "bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20",
        },
        NDEB: {
            label: "N/Débito",
            class: "bg-purple-500/10 text-purple-500 dark:text-purple-400 border-purple-500/20",
        },
        GIRO: {
            label: "Giro",
            class: "bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20",
        },
        "N/CR": {
            label: "N/Crédito",
            class: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20",
        },
        NCR: {
            label: "N/Crédito",
            class: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20",
        },
        default: {
            label: "Otro",
            class: "bg-gray-500/10 text-gray-500 border-gray-500/20",
        },
    };

    function getDocTypeBadge(type: string) {
        const t = String(type).trim().toUpperCase();
        return docTypes[t] || docTypes["default"];
    }

    // --- LOGICA DE AGRUPACIÓN POR PROVEEDOR ---
    let selectedSupplier = $state<any>(null);
    let showModal = $state(false);
    let currentPage = $state(1);
    const suppliersPerPage = 12;

    let groupedSuppliers = $derived.by(() => {
        const docs = data.cxp?.data || [];
        const groups: Record<string, any> = {};
        for (const doc of docs) {
            const coProv = (doc.co_prov || "").trim();
            const isCredit = ['ADEL', 'AJNA', 'AJNM', 'ISLR', 'IVAN', 'N/CR', 'NCR'].includes((doc.co_tipo_doc || "").trim().toUpperCase());

            if (isCredit) {
                doc.vencido = false;
                doc.dias_vencidos = 0;
            }

            if (!groups[coProv]) {
                groups[coProv] = {
                    co_prov: coProv,
                    prov_des: (doc.prov_des || "Proveedor Desconocido").trim(),
                    documents: [],
                    total_usd: 0,
                    total_bs: 0,
                    saldo_usd: 0,
                    saldo_bs: 0,
                    saldo_vencido_usd: 0,
                    saldo_vencido_bs: 0,
                    saldo_por_vencer_usd: 0,
                    saldo_por_vencer_bs: 0,
                    doc_count: 0,
                    max_dias_retraso: 0,
                };
            }

            const g = groups[coProv];
            g.documents.push(doc);
            g.total_usd += doc.total_usd;
            g.total_bs += doc.total_bs;
            g.saldo_usd += doc.saldo_usd;
            g.saldo_bs += doc.saldo_bs;

            if (doc.vencido) {
                g.saldo_vencido_usd += doc.saldo_usd;
                g.saldo_vencido_bs += doc.saldo_bs;
                if (doc.dias_vencidos > g.max_dias_retraso) {
                    g.max_dias_retraso = doc.dias_vencidos;
                }
            } else {
                g.saldo_por_vencer_usd += doc.saldo_usd;
                g.saldo_por_vencer_bs += doc.saldo_bs;
            }
            g.doc_count++;
        }

        // Ordenar de más negativo a más positivo (los proveedores a los que más les debemos primero)
        return Object.values(groups).sort(
            (a: any, b: any) => a.saldo_usd - b.saldo_usd,
        );
    });

    let paginatedSuppliers = $derived.by(() => {
        const offset = (currentPage - 1) * suppliersPerPage;
        return groupedSuppliers.slice(offset, offset + suppliersPerPage);
    });

    let totalSupplierPages = $derived(
        Math.ceil(groupedSuppliers.length / suppliersPerPage),
    );

    $effect(() => {
        // Reset local page if search / filter groups change
        const _len = groupedSuppliers.length;
        currentPage = 1;
    });

    function openSupplierDetail(supplier: any) {
        selectedSupplier = supplier;
        showModal = true;
    }

    async function updateProviderTasa(doc: any, newValue: string) {
        const val = parseFloat(newValue) || 0.0;
        if (val < 0) return;

        try {
            const res = await fetch("/api/agent/payables/tasa-proveedor", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    co_tipo_doc: doc.co_tipo_doc,
                    nro_doc: doc.nro_doc,
                    tasa: val,
                    sede_id: doc.sede_id,
                }),
            });
            const resData = await res.json();
            if (resData.success) {
                const sourceDoc = data.cxp?.data?.find(
                    (d: any) =>
                        d.nro_doc === doc.nro_doc &&
                        d.co_tipo_doc === doc.co_tipo_doc &&
                        d.sede_id === doc.sede_id
                );
                if (sourceDoc) {
                    sourceDoc.tasa_proveedor = val > 0 ? val : null;
                    if (val > 0) {
                        sourceDoc.saldo_bs = parseFloat((sourceDoc.saldo_usd * val).toFixed(2));
                    } else {
                        sourceDoc.saldo_bs = sourceDoc.saldo_original;
                    }
                    sourceDoc.total_bs = sourceDoc.total_original;
                    
                    doc.tasa_proveedor = sourceDoc.tasa_proveedor;
                    doc.saldo_bs = sourceDoc.saldo_bs;
                    doc.total_bs = sourceDoc.total_bs;
                }
            } else {
                alert("Error al actualizar la tasa: " + resData.message);
            }
        } catch (err) {
            console.error(err);
            alert("Error de conexión al actualizar la tasa del proveedor.");
        }
    }

    function closeSupplierDetail() {
        showModal = false;
        setTimeout(() => {
            selectedSupplier = null;
        }, 300);
    }
</script>

<div class="space-y-8" in:fade>
    {#if data.error}
        <div
            class="glass border-red-500/20 p-6 rounded-3xl flex items-center gap-6 bg-red-500/5 shadow-xl shadow-red-500/10"
            in:slide
        >
            <div
                class="h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0"
            >
                <AlertTriangle size={24} />
            </div>
            <div class="flex-1">
                <h3
                    class="text-sm font-black text-red-500 uppercase tracking-widest mb-1"
                >
                    Error de Comunicación
                </h3>
                <p class="text-text-muted font-bold text-sm leading-relaxed">
                    {data.error}
                </p>
            </div>
            <button
                onclick={() => window.location.reload()}
                class="px-5 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-xs font-black transition-all cursor-pointer"
                >Reintentar</button
            >
        </div>
    {/if}

    <!-- TOP HEADER -->
    <div
        class="flex flex-col lg:flex-row lg:items-center justify-between gap-6"
    >
        <div class="flex flex-col gap-2">
            <h1
                class="text-4xl font-black tracking-tight flex items-center gap-3"
            >
                <Wallet size={40} class="text-brand-500" />
                Cuentas por Pagar (CxP)
            </h1>
            <p class="text-text-muted text-lg">
                Visualización consolidada y análisis de cartera de proveedores
                pendiente.
            </p>
        </div>
    </div>

    <!-- METRICS CARDS -->
    {#if data.cxp?.metrics}
        {@const metrics = data.cxp.metrics}
        <div
            class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6"
            in:slide
        >
            <!-- Card 1: Cartera Total -->
            <div
                class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group"
            >
                <div
                    class="absolute -right-4 -bottom-4 w-24 h-24 bg-brand-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"
                ></div>
                <div class="flex items-start justify-between">
                    <div class="space-y-2">
                        <span
                            class="text-xs font-black uppercase tracking-widest text-text-muted"
                            >Saldo Total</span
                        >
                        <h2
                            class="text-2xl font-black text-text-base tracking-tight"
                        >
                            {formatCurrency(
                                metrics.total_outstanding_usd,
                                "USD",
                            )}
                        </h2>
                        <p class="text-xs text-text-muted font-bold">
                            {formatCurrency(
                                metrics.total_outstanding_bs,
                                "VES",
                            )}
                        </p>
                    </div>
                    <div
                        class="h-10 w-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500"
                    >
                        <Wallet size={20} />
                    </div>
                </div>
            </div>

            <!-- Card 2: Cartera Vencida -->
            <div
                class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group"
            >
                <div
                    class="absolute -right-4 -bottom-4 w-24 h-24 bg-red-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"
                ></div>
                <div class="flex items-start justify-between">
                    <div class="space-y-2">
                        <span
                            class="text-xs font-black uppercase tracking-widest text-red-500/80"
                            >Saldo Vencido</span
                        >
                        <h2
                            class="text-2xl font-black text-red-500 tracking-tight"
                        >
                            {formatCurrency(metrics.total_overdue_usd, "USD")}
                        </h2>
                        <p class="text-xs text-text-muted font-bold">
                            {formatCurrency(metrics.total_overdue_bs, "VES")}
                        </p>
                    </div>
                    <div
                        class="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500"
                    >
                        <TrendingDown size={20} />
                    </div>
                </div>
            </div>

            <!-- Card 3: Cartera Por Vencer -->
            <div
                class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group"
            >
                <div
                    class="absolute -right-4 -bottom-4 w-24 h-24 bg-green-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"
                ></div>
                <div class="flex items-start justify-between">
                    <div class="space-y-2">
                        <span
                            class="text-xs font-black uppercase tracking-widest text-green-500/80"
                            >Saldo por Vencer</span
                        >
                        <h2
                            class="text-2xl font-black text-green-500 tracking-tight"
                        >
                            {formatCurrency(metrics.total_upcoming_usd, "USD")}
                        </h2>
                        <p class="text-xs text-text-muted font-bold">
                            {formatCurrency(metrics.total_upcoming_bs, "VES")}
                        </p>
                    </div>
                    <div
                        class="h-10 w-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500"
                    >
                        <TrendingUp size={20} />
                    </div>
                </div>
            </div>

            <!-- Card 4: Conteo Documentos -->
            <div
                class="glass p-6 rounded-3xl border border-border-subtle shadow-xl relative overflow-hidden group"
            >
                <div
                    class="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"
                ></div>
                <div class="flex items-start justify-between">
                    <div class="space-y-2">
                        <span
                            class="text-xs font-black uppercase tracking-widest text-text-muted"
                            >Documentos Activos</span
                        >
                        <h2
                            class="text-2xl font-black text-text-base tracking-tight"
                        >
                            {metrics.doc_count}
                        </h2>
                        <p class="text-xs text-text-muted font-bold">
                            Facturas / Notas
                        </p>
                    </div>
                    <div
                        class="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500"
                    >
                        <FileText size={20} />
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- FILTERS BAR -->
    <div
        class="glass p-5 rounded-3xl border border-border-subtle shadow-2xl flex flex-col xl:flex-row gap-4 items-center w-full relative z-10"
    >
        <!-- Sede Selector -->
        {#if data.branches && data.branches.length > 1}
            <div class="w-full xl:w-72">
                <Combobox
                    options={data.branches.map((b: any) => ({
                        value: b.id,
                        label: b.name,
                    }))}
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
            <div
                class="relative w-full h-12 bg-surface-soft border border-border-subtle rounded-xl flex items-center px-3 group focus-within:border-brand-500/50 transition-all"
            >
                <Clock size={16} class="text-text-muted mr-2.5 shrink-0" />
                <select
                    bind:value={filterStatus}
                    onchange={applyFilters}
                    class="w-full h-full bg-transparent outline-none text-sm text-text-base font-bold cursor-pointer appearance-none pr-8"
                >
                    <option value="all" class="bg-surface-raised text-text-base"
                        >Todos los Saldos</option
                    >
                    <option
                        value="vencidos"
                        class="bg-surface-raised text-text-base"
                        >Vencidos (Overdue)</option
                    >
                    <option
                        value="por_vencer"
                        class="bg-surface-raised text-text-base"
                        >Por Vencer (Upcoming)</option
                    >
                </select>
                <div
                    class="pointer-events-none absolute right-3 flex items-center text-text-muted"
                >
                    <Filter size={14} />
                </div>
            </div>
        </div>

        <!-- Search Bar -->
        <div class="w-full xl:flex-1">
            <SearchBar
                bind:value={filterSearch}
                {isSearching}
                onsubmit={applyFilters}
                placeholder="Buscar por proveedor, documento o RIF..."
                className="w-full h-12"
            />
        </div>

        <button
            onclick={() => applyFilters()}
            class="h-12 w-full xl:w-auto px-6 bg-surface-soft border border-border-subtle hover:bg-surface-strong text-text-base font-black rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
            <RefreshCw size={16} class={isSearching ? "animate-spin" : ""} />
            Actualizar
        </button>
    </div>

    <!-- MAIN LIST - SUPPLIER CARDS GRID -->
    {#if isSearching}
        <div
            class="glass p-20 rounded-[32px] border border-border-subtle shadow-2xl flex flex-col items-center justify-center gap-4 min-h-[400px]"
        >
            <Loader2 size={48} class="animate-spin text-brand-500" />
            <p class="text-base font-black text-text-muted">
                Consultando cuentas por pagar con el agente Profit...
            </p>
        </div>
    {:else if groupedSuppliers.length === 0}
        <div
            class="glass p-20 rounded-[32px] border border-border-subtle shadow-2xl flex flex-col items-center justify-center gap-3 text-center min-h-[400px]"
            in:fade
        >
            <CheckCircle size={56} class="text-brand-500 mb-2 animate-bounce" />
            <h3 class="text-2xl font-black text-text-base">
                ¡Cartera 100% al Día!
            </h3>
            <p class="text-sm text-text-muted font-bold max-w-md">
                No se encontraron proveedores con cuentas por pagar pendientes
                en esta sede bajo los filtros seleccionados.
            </p>
        </div>
    {:else}
        <!-- Grid of Supplier Cards -->
        <div
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            in:fade
        >
            {#each paginatedSuppliers as supplier (supplier.co_prov)}
                {@const hasOverdue = supplier.saldo_vencido_usd < 0}
                <div
                    class="glass p-6 rounded-3xl border border-border-subtle shadow-xl hover:border-brand-500/30 hover:shadow-brand-500/5 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden"
                >
                    <!-- Background ambient glow -->
                    {#if hasOverdue}
                        <div
                            class="absolute -right-10 -top-10 w-28 h-28 bg-red-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"
                        ></div>
                    {:else}
                        <div
                            class="absolute -right-10 -top-10 w-28 h-28 bg-green-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500"
                        ></div>
                    {/if}

                    <div class="space-y-5 relative z-10">
                        <!-- Card Header -->
                        <div class="flex items-start justify-between gap-3">
                            <div class="flex items-center gap-3 min-w-0">
                                <div
                                    class="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-colors {hasOverdue
                                        ? 'bg-red-500/10 text-red-500'
                                        : 'bg-green-500/10 text-green-500'}"
                                >
                                    <User size={20} />
                                </div>
                                <div class="flex flex-col min-w-0">
                                    <h3
                                        class="font-black text-base tracking-tight text-text-base truncate group-hover:text-brand-400 transition-colors"
                                        title={supplier.prov_des}
                                    >
                                        {supplier.prov_des}
                                    </h3>
                                    <span
                                        class="text-[10px] text-text-muted font-mono font-black mt-0.5"
                                        >{supplier.co_prov}</span
                                    >
                                </div>
                            </div>
                            <!-- Documents count badge -->
                            <span
                                class="px-2 py-1 bg-surface-soft border border-border-subtle text-[10px] font-black rounded-lg text-text-muted shrink-0"
                            >
                                {supplier.doc_count}
                                {supplier.doc_count === 1 ? "doc" : "docs"}
                            </span>
                        </div>

                        <!-- Outstanding Balance -->
                        <div
                            class="p-4 rounded-2xl bg-surface-soft border border-border-subtle space-y-1"
                        >
                            <span
                                class="text-[10px] font-black uppercase tracking-widest text-text-muted"
                                >Monto por Pagar</span
                            >
                            <div class="flex items-baseline gap-2">
                                <span
                                    class="text-2xl font-black tracking-tight {hasOverdue
                                        ? 'text-text-red'
                                        : 'text-text-green'}"
                                >
                                    {formatCurrency(supplier.saldo_usd, "USD")}
                                </span>
                            </div>
                            <p class="text-xs text-text-muted font-bold">
                                {formatCurrency(supplier.saldo_bs, "VES")}
                            </p>
                        </div>

                        <!-- Overdue & Upcoming split -->
                        <div class="grid grid-cols-2 gap-4 text-xs font-bold">
                            <!-- Vencido -->
                            <div class="flex flex-col gap-0.5">
                                <span
                                    class="text-[9px] uppercase tracking-wider text-text-muted"
                                    >Vencido</span
                                >
                                {#if hasOverdue}
                                    <span class="text-text-red font-black"
                                        >{formatCurrency(
                                            supplier.saldo_vencido_usd,
                                            "USD",
                                        )}</span
                                    >
                                {:else}
                                    <span
                                        class="text-green-500 font-black flex items-center gap-1"
                                    >
                                        <CheckCircle size={10} /> Al día
                                    </span>
                                {/if}
                            </div>
                            <!-- Por vencer -->
                            <div class="flex flex-col gap-0.5">
                                <span
                                    class="text-[9px] uppercase tracking-wider text-text-muted"
                                    >Por Vencer</span
                                >
                                <span class="text-text-base font-black"
                                    >{formatCurrency(
                                        supplier.saldo_por_vencer_usd,
                                        "USD",
                                    )}</span
                                >
                            </div>
                        </div>
                    </div>

                    <!-- Card Footer Actions -->
                    <div
                        class="mt-6 pt-4 border-t border-border-subtle flex items-center justify-between gap-3 relative z-10"
                    >
                        <!-- Delay indicator -->
                        {#if hasOverdue}
                            <span
                                class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 text-[10px] font-black"
                            >
                                <Clock size={12} />
                                Máx: {supplier.max_dias_retraso} días
                            </span>
                        {:else}
                            <span
                                class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/10 text-green-500 border border-green-500/20 text-[10px] font-black"
                            >
                                <CheckCircle size={12} />
                                Sin mora
                            </span>
                        {/if}

                        <button
                            onclick={() => openSupplierDetail(supplier)}
                            class="flex items-center gap-1.5 text-xs font-black text-brand-400 hover:text-brand-300 transition-colors uppercase tracking-wider group/btn"
                        >
                            Ver Detalles
                            <Eye
                                size={14}
                                class="group-hover/btn:translate-x-0.5 transition-transform"
                            />
                        </button>
                    </div>
                </div>
            {/each}
        </div>

        <!-- SUPPLIERS PAGINATION BAR -->
        {#if totalSupplierPages > 1}
            <div
                class="px-6 py-5 bg-surface-raised/50 backdrop-blur-md rounded-3xl border border-border-subtle shadow-xl flex items-center justify-between gap-4 mt-8"
                in:fade
            >
                <span class="text-xs font-bold text-text-muted">
                    Mostrando proveedores <strong
                        class="text-text-base font-black"
                        >{(currentPage - 1) * suppliersPerPage + 1}</strong
                    >
                    a
                    <strong class="text-text-base font-black"
                        >{Math.min(
                            currentPage * suppliersPerPage,
                            groupedSuppliers.length,
                        )}</strong
                    >
                    de
                    <strong class="text-text-base font-black"
                        >{groupedSuppliers.length}</strong
                    >
                    (Consolidado: {data.cxp?.data?.length || 0} docs)
                </span>

                <div class="flex items-center gap-1.5">
                    <button
                        onclick={() => {
                            if (currentPage > 1) currentPage--;
                        }}
                        disabled={currentPage === 1}
                        class="p-2 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-text-muted hover:text-text-base transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                    >
                        <ChevronLeft size={16} />
                    </button>

                    {#each Array.from({ length: totalSupplierPages }, (_, i) => i + 1) as p}
                        {#if p === 1 || p === totalSupplierPages || (p >= currentPage - 1 && p <= currentPage + 1)}
                            <button
                                onclick={() => (currentPage = p)}
                                class="h-9 w-9 rounded-xl text-xs font-black transition border {p ===
                                currentPage
                                    ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-500/20'
                                    : 'bg-surface-soft hover:bg-surface-strong border-border-subtle text-text-muted hover:text-text-base cursor-pointer'}"
                            >
                                {p}
                            </button>
                        {:else if p === currentPage - 2 || p === currentPage + 2}
                            <span class="px-1 text-text-muted text-xs font-bold"
                                >...</span
                            >
                        {/if}
                    {/each}

                    <button
                        onclick={() => {
                            if (currentPage < totalSupplierPages) currentPage++;
                        }}
                        disabled={currentPage === totalSupplierPages}
                        class="p-2 rounded-xl bg-surface-soft hover:bg-surface-strong border border-border-subtle text-text-muted hover:text-text-base transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        {/if}
    {/if}

    <!-- MODAL DE DETALLES DEL PROVEEDOR -->
    {#if showModal && selectedSupplier}
        {@const supplier = selectedSupplier}
        <div
            class="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
            style="background-color: var(--modal-backdrop);"
            transition:fade={{ duration: 200 }}
        >
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="fixed inset-0" onclick={closeSupplierDetail}></div>

            <div
                class="glass bg-surface-raised border border-border-subtle rounded-[32px] max-w-6xl w-full max-h-[85vh] flex flex-col shadow-2xl relative z-10 overflow-hidden"
                transition:slide={{ duration: 300 }}
            >
                <!-- Modal Header -->
                <div
                    class="px-8 py-6 border-b border-border-subtle flex items-center justify-between gap-4 bg-surface-soft"
                >
                    <div class="flex items-center gap-4 min-w-0">
                        <div
                            class="h-12 w-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500 shrink-0"
                        >
                            <User size={24} />
                        </div>
                        <div class="flex flex-col min-w-0">
                            <span
                                class="text-xs font-black uppercase tracking-widest text-brand-400"
                                >Detalle de Cuenta por Pagar</span
                            >
                            <h2
                                class="text-xl font-black tracking-tight text-text-base truncate"
                                title={supplier.prov_des}
                            >
                                {supplier.prov_des}
                            </h2>
                            <span
                                class="text-xs text-text-muted font-mono font-bold mt-0.5"
                                >Código / RIF: {supplier.co_prov}</span
                            >
                        </div>
                    </div>

                    <button
                        onclick={closeSupplierDetail}
                        class="p-3 rounded-2xl bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base transition-all cursor-pointer"
                        aria-label="Cerrar"
                    >
                        <X size={20} />
                    </button>
                </div>

                <!-- Modal Content Scrollable -->
                <div class="p-8 overflow-y-auto space-y-8 flex-1">
                    <!-- Supplier Quick Totals Grid -->
                    <div
                        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
                    >
                        <!-- Total outstanding -->
                        <div
                            class="p-5 rounded-2xl bg-surface-soft border border-border-subtle space-y-1 relative overflow-hidden"
                        >
                            <span
                                class="text-[10px] font-black uppercase tracking-widest text-text-muted"
                                >Total Pendiente</span
                            >
                            <h3
                                class="text-xl font-black text-text-base tracking-tight"
                            >
                                {formatCurrency(supplier.saldo_usd, "USD")}
                            </h3>
                            <p class="text-[11px] text-text-muted font-bold">
                                {formatCurrency(supplier.saldo_bs, "VES")}
                            </p>
                        </div>
                        <!-- Overdue -->
                        <div
                            class="p-5 rounded-2xl bg-surface-soft border border-border-subtle space-y-1"
                        >
                            <span
                                class="text-[10px] font-black uppercase tracking-widest text-red-500/80"
                                >Saldo Vencido</span
                            >
                            <h3
                                class="text-xl font-black text-text-red tracking-tight"
                            >
                                {supplier.saldo_vencido_usd < 0
                                    ? formatCurrency(
                                          supplier.saldo_vencido_usd,
                                          "USD",
                                      )
                                    : "Al día"}
                            </h3>
                            <p class="text-[11px] text-text-muted font-bold">
                                {formatCurrency(
                                    supplier.saldo_vencido_bs,
                                    "VES",
                                )}
                            </p>
                        </div>
                        <!-- Upcoming -->
                        <div
                            class="p-5 rounded-2xl bg-surface-soft border border-border-subtle space-y-1"
                        >
                            <span
                                class="text-[10px] font-black uppercase tracking-widest text-green-500/80"
                                >Por Vencer</span
                            >
                            <h3
                                class="text-xl font-black text-text-green tracking-tight"
                            >
                                {formatCurrency(
                                    supplier.saldo_por_vencer_usd,
                                    "USD",
                                )}
                            </h3>
                            <p class="text-[11px] text-text-muted font-bold">
                                {formatCurrency(
                                    supplier.saldo_por_vencer_bs,
                                    "VES",
                                )}
                            </p>
                        </div>
                        <!-- Documents counts and delay -->
                        <div
                            class="p-5 rounded-2xl bg-surface-soft border border-border-subtle flex flex-col justify-between"
                        >
                            <div class="flex justify-between items-center">
                                <span
                                    class="text-[10px] font-black uppercase tracking-widest text-text-muted"
                                    >Docs Activos</span
                                >
                                <span
                                    class="px-2 py-0.5 bg-brand-500/10 text-brand-400 border border-brand-500/20 text-[10px] font-black rounded-md"
                                >
                                    {supplier.doc_count}
                                </span>
                            </div>
                            <div class="pt-2 text-xs font-bold text-text-muted">
                                {#if supplier.saldo_vencido_usd < 0}
                                    <span
                                        class="text-text-red font-black flex items-center gap-1"
                                    >
                                        <AlertTriangle size={12} />
                                        {supplier.max_dias_retraso} días retraso
                                        máx.
                                    </span>
                                {:else}
                                    <span
                                        class="text-text-green font-black flex items-center gap-1"
                                    >
                                        <CheckCircle size={12} /> Cartera al día
                                    </span>
                                {/if}
                            </div>
                        </div>
                    </div>

                    <!-- Documents Table -->
                    <div class="space-y-4">
                        <h3
                            class="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2"
                        >
                            <FileSpreadsheet size={16} />
                            Desglose de Documentos Pendientes
                        </h3>

                        <div
                            class="bg-surface-soft rounded-2xl border border-border-subtle overflow-hidden"
                        >
                            <div class="overflow-x-auto">
                                <table class="w-full text-left border-collapse">
                                    <thead>
                                        <tr
                                            class="bg-surface-strong border-b border-border-subtle text-[10px] font-black uppercase tracking-wider text-text-muted"
                                        >
                                            <th class="px-3 py-3">Documento</th>
                                            <th class="px-3 py-3">Emisión</th>
                                            <th class="px-3 py-3">Origen</th>
                                            <th class="px-3 py-3">Vencimiento</th>
                                            <th class="px-3 py-3 text-right">Monto Original</th>
                                            <th class="px-3 py-3 text-right">Saldo Pendiente</th>
                                            <th class="px-3 py-3 text-center">Tasa Prov.</th>
                                            <th class="px-3 py-3 text-center">Días Mora</th>
                                        </tr>
                                    </thead>
                                    <tbody
                                        class="divide-y divide-border-subtle text-xs"
                                    >
                                        {#each supplier.documents as doc (doc.nro_doc + doc.co_tipo_doc)}
                                            {@const badge = getDocTypeBadge(
                                                doc.co_tipo_doc,
                                            )}
                                            {@const isCredit = ['ADEL', 'AJNA', 'AJNM', 'ISLR', 'IVAN', 'N/CR', 'NCR'].includes(doc.co_tipo_doc.trim().toUpperCase())}
                                            <tr
                                                class="hover:bg-surface-soft transition-colors"
                                            >
                                                <!-- Documento / Tipo -->
                                                <td class="px-3 py-3">
                                                    <div
                                                        class="flex items-center gap-3"
                                                    >
                                                        <div
                                                            class="p-2 rounded-lg bg-surface-soft text-text-muted"
                                                        >
                                                            <FileText
                                                                size={14}
                                                            />
                                                        </div>
                                                        <div
                                                            class="flex flex-col gap-1.5"
                                                        >
                                                            <span
                                                                class="font-black text-text-base"
                                                                >{doc.nro_doc}</span
                                                            >
                                                            <span
                                                                class="px-1.5 py-0.5 border text-[9px] font-black uppercase tracking-wider rounded text-center max-w-[55px] {badge.class}"
                                                            >
                                                                {doc.co_tipo_doc.trim()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>

                                                <!-- Emision -->
                                                <td
                                                    class="px-3 py-3 whitespace-nowrap text-text-muted font-bold"
                                                >
                                                    {dayjs(doc.fec_emis).format(
                                                        "DD MMM YYYY",
                                                    )}
                                                </td>

                                                <!-- Origen -->
                                                <td
                                                    class="px-3 py-3 whitespace-nowrap text-text-muted"
                                                >
                                                    <div
                                                        class="flex flex-col gap-1.5"
                                                    >
                                                        {#if doc.nro_orig && doc.nro_orig.trim()}
                                                            <span
                                                                class="font-black text-text-base"
                                                                >{doc.nro_orig.trim()}</span
                                                            >
                                                            {#if doc.doc_orig && doc.doc_orig.trim()}
                                                                {@const origBadge =
                                                                    getDocTypeBadge(
                                                                        doc.doc_orig,
                                                                    )}
                                                                <span
                                                                    class="px-1.5 py-0.5 border text-[9px] font-black uppercase tracking-wider rounded text-center max-w-[55px] {origBadge.class}"
                                                                >
                                                                    {doc.doc_orig.trim()}
                                                                </span>
                                                            {/if}
                                                        {:else}
                                                            <span
                                                                class="text-text-muted/40 italic font-medium"
                                                                >—</span
                                                            >
                                                        {/if}
                                                    </div>
                                                </td>

                                                <!-- Vencimiento -->
                                                <td
                                                    class="px-3 py-3 whitespace-nowrap font-bold {doc.vencido
                                                        ? 'text-text-red'
                                                        : 'text-text-muted'}"
                                                >
                                                    {dayjs(doc.fec_venc).format(
                                                        "DD MMM YYYY",
                                                    )}
                                                </td>

                                                <!-- Monto Original -->
                                                <td
                                                    class="px-3 py-3 text-right whitespace-nowrap font-bold"
                                                >
                                                    <div
                                                        class="flex flex-col items-end"
                                                    >
                                                        <span
                                                            class="text-text-base"
                                                            >{formatCurrency(
                                                                doc.total_usd,
                                                                "USD",
                                                            )}</span
                                                        >
                                                        <span
                                                            class="text-[9px] text-text-muted mt-0.5"
                                                            >{formatCurrency(
                                                                doc.total_bs,
                                                                "VES",
                                                            )}</span
                                                        >
                                                    </div>
                                                </td>

                                                <!-- Saldo Pendiente -->
                                                <td
                                                    class="px-3 py-3 text-right whitespace-nowrap font-black"
                                                >
                                                    <div
                                                        class="flex flex-col items-end"
                                                    >
                                                        <span
                                                            class={doc.vencido &&
                                                            !isCredit
                                                                ? "text-text-red"
                                                                : isCredit
                                                                  ? "text-text-emerald"
                                                                  : "text-text-green"}
                                                        >
                                                            {formatCurrency(
                                                                doc.saldo_usd,
                                                                "USD",
                                                            )}
                                                        </span>
                                                        <span
                                                            class="text-[9px] mt-0.5 font-bold {isCredit
                                                                ? 'text-emerald-500/80'
                                                                : 'text-text-muted'}"
                                                        >
                                                            {formatCurrency(
                                                                doc.saldo_bs,
                                                                "VES",
                                                            )}
                                                        </span>
                                                    </div>
                                                </td>

                                                <!-- Tasa Proveedor -->
                                                <td
                                                    class="px-3 py-3 text-center whitespace-nowrap"
                                                >
                                                    <input 
                                                        type="number" 
                                                        step="0.01" 
                                                        min="0"
                                                        placeholder="Tasa"
                                                        disabled={!data.canEdit}
                                                        value={doc.tasa_proveedor || ""} 
                                                        onchange={(e) => updateProviderTasa(doc, e.currentTarget.value)}
                                                        class="w-18 bg-surface-base border border-border-subtle rounded-lg px-1 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-brand-500/50 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                                                    />
                                                </td>

                                                <!-- Mora -->
                                                <td
                                                    class="px-3 py-3 text-center whitespace-nowrap"
                                                >
                                                    {#if doc.vencido}
                                                        <span
                                                            class="px-2 py-0.5 font-bold rounded {isCredit
                                                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                                                : 'bg-red-500/10 text-red-500 border border-red-500/20'}"
                                                        >
                                                            {doc.dias_vencidos} días
                                                        </span>
                                                    {:else}
                                                        <span
                                                            class="px-2 py-0.5 font-bold rounded inline-flex items-center gap-1 {isCredit
                                                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                                                : 'bg-green-500/10 text-green-500 border border-green-500/20'}"
                                                        >
                                                            {#if !isCredit}
                                                                <CheckCircle
                                                                    size={8}
                                                                />
                                                            {/if}
                                                            Al día
                                                        </span>
                                                    {/if}
                                                </td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Modal Footer -->
                <div
                    class="px-8 py-5 border-t border-border-subtle flex justify-end gap-3 bg-surface-soft/50 font-bold text-xs"
                >
                    {#if supplier.documents.some((d) => d.tasa_proveedor && d.tasa_proveedor > 0)}
                        <a
                            href="/dashboard/reports/payables/{supplier.co_prov}/print?branch_id={data.selectedBranchId}&only_provider_rates=true"
                            target="_blank"
                            class="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                        >
                            <FileDown size={16} />
                            Exportar PDF en BS
                        </a>
                    {/if}

                    <a
                        href="/dashboard/reports/payables/{supplier.co_prov}/print?branch_id={data.selectedBranchId}"
                        target="_blank"
                        class="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-brand-500/20"
                    >
                        <FileDown size={16} />
                        Exportar PDF
                    </a>

                    <button
                        onclick={closeSupplierDetail}
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
