<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { fade } from "svelte/transition";
  import {
    Package,
    Search,
    Store,
    Box,
    AlertCircle,
    Plus,
    ListFilter,
    MapPin,
    Calendar,
    DollarSign,
    TrendingUp,
    Percent,
    Eye,
    Edit,
    Trash2,
    CheckSquare,
    Square,
    Printer,
    ChevronLeft,
    ChevronRight,
  } from "lucide-svelte";
  import { enhance } from "$app/forms";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const canCreate = data.crud?.create ?? true;
  const canEdit = data.crud?.update ?? true;
  const canDelete = data.crud?.delete ?? true;

  let selectedBranch = $state($page.url.searchParams.get("branch_id") || (data.branches?.[0]?.id || ""));
  let searchTerm = $state($page.url.searchParams.get("search") || "");
  let selectedLinea = $state($page.url.searchParams.get("linea") || "");
  let selectedCategoria = $state($page.url.searchParams.get("categoria") || "");
  let costFilter = $state($page.url.searchParams.get("cost_type") || "all");
  let stockFilter = $state($page.url.searchParams.get("in_stock") || "all");
  let pendingFilter = $state($page.url.searchParams.get("solo_pendientes") || "all");

  let isSearching = $state(false);

  // ── ARTICLE SELECTION ──────────────────────────────────────────────────────
  let selectedCodes = $state(new Set<string>());

  const visibleArticles = $derived(
    (data.articles || []).filter(
      (a: any, i: number, arr: any[]) =>
        arr.findIndex((b: any) => b.co_art === a.co_art) === i,
    ),
  );

  const allVisibleSelected = $derived(
    visibleArticles.length > 0 &&
      visibleArticles.every((a: any) => selectedCodes.has(a.co_art)),
  );

  function toggleArticle(code: string) {
    const next = new Set(selectedCodes);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    selectedCodes = next;
  }

  function toggleAll() {
    const next = new Set(selectedCodes);
    if (allVisibleSelected) {
      visibleArticles.forEach((a: any) => next.delete(a.co_art));
    } else {
      visibleArticles.forEach((a: any) => next.add(a.co_art));
    }
    selectedCodes = next;
  }

  function openReport() {
    const url = new URL("/dashboard/purchases/articles/report", window.location.origin);
    // Siempre enviar branch_id para que el reporte sepa qué sucursal consultar
    const activeBranch = selectedBranch || data.branches?.[0]?.id || '';
    if (activeBranch) url.searchParams.set("branch_id", activeBranch);
    if (searchTerm) url.searchParams.set("search", searchTerm);
    if (selectedLinea) url.searchParams.set("linea", selectedLinea);
    if (selectedCategoria) url.searchParams.set("categoria", selectedCategoria);
    if (costFilter !== 'all') url.searchParams.set("cost_type", costFilter);
    if (stockFilter !== 'all') url.searchParams.set("in_stock", stockFilter);
    if (pendingFilter !== 'all') url.searchParams.set("solo_pendientes", pendingFilter);
    if (selectedCodes.size > 0) {
      url.searchParams.set("ids", Array.from(selectedCodes).join(","));
    }
    window.open(url.toString(), "_blank");
  }

  function handleSearch() {
    isSearching = true;
    const url = new URL($page.url);
    
    if (selectedBranch) url.searchParams.set("branch_id", selectedBranch);
    else url.searchParams.delete("branch_id");

    if (searchTerm) url.searchParams.set("search", searchTerm);
    else url.searchParams.delete("search");

    if (selectedLinea) url.searchParams.set("linea", selectedLinea);
    else url.searchParams.delete("linea");

    if (selectedCategoria) url.searchParams.set("categoria", selectedCategoria);
    else url.searchParams.delete("categoria");

    url.searchParams.set("cost_type", costFilter);
    url.searchParams.set("in_stock", stockFilter);
    url.searchParams.set("solo_pendientes", pendingFilter);

    url.searchParams.set("page", "1");
    goto(url.toString(), { keepFocus: true, noScroll: true }).finally(() => (isSearching = false));
  }

  function updateFilter(key: string, value: string) {
    if (key === "cost_type") costFilter = value;
    if (key === "in_stock") stockFilter = value;
    if (key === "solo_pendientes") pendingFilter = value;
    handleSearch();
  }
</script>

<div class="flex flex-col gap-8 pb-20" in:fade>
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div class="flex flex-col gap-2">
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Package size={40} class="text-brand-500" />
        Maestro de Artículos
        {#if data.pagination?.total > 0}
          <span class="text-sm font-black bg-brand-500/10 text-brand-500 px-3 py-1 rounded-full border border-brand-500/20">
            {data.pagination.total}
          </span>
        {/if}
      </h1>
      <p class="text-text-muted text-lg">Consulta y gestiona el catálogo de productos de Profit Plus.</p>
    </div>

    {#if canCreate}
      <button onclick={() => goto("/dashboard/purchases/articles/editor")} class="h-14 px-8 bg-brand-600 hover:bg-brand-500 border-brand-500/50 shadow-lg shadow-brand-600/20 text-white border rounded-2xl font-bold transition-all active:scale-95 flex items-center gap-3 shrink-0">
        <Plus size={20} /> Crear Artículo
      </button>
    {/if}
  </div>

  {#if data.error || (data.form && data.form.deleteError)}
    <div class="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl flex items-center gap-4 text-red-400">
      <AlertCircle size={32} />
      <div class="flex flex-col">
        <span class="font-black uppercase tracking-widest text-[10px]">Error de Sistema</span>
        <p class="font-bold">{data.error || data.form?.deleteError}</p>
      </div>
    </div>
  {/if}

  {#if data.form && data.form.success}
    <div class="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-3xl flex items-center gap-4 text-emerald-400">
      <div class="flex flex-col">
        <span class="font-black uppercase tracking-widest text-[10px]">Éxito</span>
        <p class="font-bold">{data.form.message}</p>
      </div>
    </div>
  {/if}

  <!-- FILTROS ESTILO UBICACIONES -->
  <div class="glass p-6 rounded-[2.5rem] border border-white/5 shadow-2xl flex flex-col gap-6 relative z-10 w-full">
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-center">
      <Combobox 
        options={(data.branches || []).map((b: any) => ({ value: b.id, label: b.name }))} 
        bind:value={selectedBranch} 
        placeholder="Sucursal..." 
        icon={Store} 
        class="w-full h-14" 
        onchange={handleSearch} 
      />

      <div class="w-full flex items-center gap-2">
        <form class="relative group h-14 flex-1" onsubmit={(e) => { e.preventDefault(); handleSearch(); }}>
          <input type="text" bind:value={searchTerm} placeholder="Buscar código o descripción..." class="w-full h-full bg-surface-base pl-6 pr-14 rounded-2xl border border-white/5 focus:border-brand-500/30 outline-none transition-all font-bold text-sm placeholder:font-normal placeholder:text-text-secondary/30" />
          <button type="submit" class="absolute right-1 top-1 bottom-1 w-12 flex items-center justify-center bg-surface-soft hover:bg-surface-strong text-brand-400 rounded-xl transition-all border border-border-subtle active:scale-95">
            {#if isSearching} <span class="animate-pulse">...</span> {:else} <Search size={18} /> {/if}
          </button>
        </form>
        <BarcodeScanner onScan={(code) => { searchTerm = code; handleSearch(); }} />
      </div>

      <Combobox 
        options={(data.catalogs?.lineas || []).map((l: any) => ({ value: l.co_lin, label: l.lin_des }))} 
        bind:value={selectedLinea} 
        placeholder="Línea..." 
        allLabel="Todas las Líneas" 
        icon={ListFilter} 
        class="w-full h-14" 
        onchange={handleSearch} 
      />

      <Combobox 
        options={(data.catalogs?.categorias || []).map((c: any) => ({ value: c.co_cat, label: c.cat_des }))} 
        bind:value={selectedCategoria} 
        placeholder="Categoría..." 
        allLabel="Todas las Categorías" 
        icon={ListFilter} 
        class="w-full h-14" 
        onchange={handleSearch} 
      />
    </div>

    <!-- SELECTORES DE ESTADO (FILA 2) -->
    <div class="flex flex-wrap items-center gap-4 border-t border-white/5 pt-6">
      <!-- Stock -->
      <div class="flex items-center bg-white/5 border border-white/5 p-1 rounded-xl h-11">
        <button onclick={() => updateFilter("in_stock", "true")} class="px-4 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all {stockFilter === 'true' ? 'bg-brand-500 text-white shadow-lg' : 'text-text-muted hover:text-white'}">Con Stock</button>
        <button onclick={() => updateFilter("in_stock", "false")} class="px-4 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all {stockFilter === 'false' ? 'bg-brand-500 text-white shadow-lg' : 'text-text-muted hover:text-white'}">Sin Stock</button>
        <button onclick={() => updateFilter("in_stock", "all")} class="px-4 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all {stockFilter === 'all' ? 'bg-brand-500 text-white shadow-lg' : 'text-text-muted hover:text-white'}">Todos</button>
      </div>

      <!-- Por Llegar -->
      <div class="flex items-center bg-white/5 border border-white/5 p-1 rounded-xl h-11">
        <button onclick={() => updateFilter("solo_pendientes", "true")} class="px-4 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all {pendingFilter === 'true' ? 'bg-brand-500 text-white shadow-lg' : 'text-text-muted hover:text-white'}">Por Llegar</button>
        <button onclick={() => updateFilter("solo_pendientes", "all")} class="px-4 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all {pendingFilter === 'all' ? 'bg-brand-500 text-white shadow-lg' : 'text-text-muted hover:text-white'}">Todos</button>
      </div>

      <!-- Tipo Costo -->
      <div class="flex items-center bg-white/5 border border-white/5 p-1 rounded-xl h-11">
        <button onclick={() => updateFilter("cost_type", "real")} class="px-4 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all {costFilter === 'real' ? 'bg-brand-500 text-white shadow-lg' : 'text-text-muted hover:text-white'}">Costo Real</button>
        <button onclick={() => updateFilter("cost_type", "calculated")} class="px-4 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all {costFilter === 'calculated' ? 'bg-brand-500 text-white shadow-lg' : 'text-text-muted hover:text-white'}">Calculado</button>
        <button onclick={() => updateFilter("cost_type", "none")} class="px-4 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all {costFilter === 'none' ? 'bg-brand-500 text-white shadow-lg' : 'text-text-muted hover:text-white'}">Sin Costo</button>
        <button onclick={() => updateFilter("cost_type", "all")} class="px-4 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all {costFilter === 'all' ? 'bg-brand-500 text-white shadow-lg' : 'text-text-muted hover:text-white'}">Todos</button>
      </div>

      <div class="flex items-center gap-2 ml-auto">
        <button onclick={toggleAll} class="h-11 px-4 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-text-muted">
          {#if allVisibleSelected}<CheckSquare size={16} class="text-brand-400" />{:else}<Square size={16} />{/if}
          <span class="hidden sm:inline">{allVisibleSelected ? 'Desmarcar Todos' : 'Marcar Todos'}</span>
        </button>
        <button onclick={openReport} class="h-11 px-6 bg-brand-600 hover:bg-brand-500 text-white font-black uppercase tracking-widest text-[10px] rounded-xl border border-brand-500/50 shadow-lg flex items-center gap-2 transition-all">
          <Printer size={16} /> <span class="hidden sm:inline">Imprimir Reporte</span>
        </button>
      </div>
    </div>
  </div>

  <!-- GRID DE TARJETAS (ESTILO UBICACIONES) -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
    {#each data.articles as article}
      <div class="glass p-6 rounded-[2.5rem] border border-white/5 hover:border-brand-500/30 transition-all group flex flex-col gap-4 shadow-xl hover:shadow-brand-500/5">
        <div class="flex justify-between items-start">
          <div class="flex items-center gap-3">
            <button onclick={() => toggleArticle(article.co_art)} class="h-12 w-12 rounded-2xl bg-surface-base/50 border border-white/5 flex items-center justify-center hover:bg-white/5 transition-all">
              {#if selectedCodes.has(article.co_art)}
                <CheckSquare size={24} class="text-brand-500" />
              {:else}
                <Square size={24} class="text-text-muted" />
              {/if}
            </button>
            <div class="h-12 w-12 rounded-2xl bg-brand-500/10 text-brand-500 flex items-center justify-center group-hover:bg-brand-500 group-hover:text-white transition-all">
              <Package size={24} />
            </div>
          </div>
          <span class="px-3 py-1 rounded-full bg-surface-base border border-white/5 text-[10px] font-mono text-text-muted uppercase tracking-wider">{article.co_art}</span>
        </div>

        <div class="flex flex-col gap-1">
          <h3 class="text-lg font-black leading-tight text-white line-clamp-none">{article.descripcion}</h3>
          <div class="flex items-center gap-2 text-[10px] text-text-muted font-bold uppercase tracking-widest">
            <Box size={12} /> {article.linea} | {article.categoria}
          </div>
        </div>

        <!-- COSTOS Y PRECIOS -->
        <div class="grid grid-cols-2 gap-3 mt-2">
          <div class="bg-surface-base/50 p-3 rounded-2xl border border-white/5 flex flex-col gap-1">
            <span class="text-[9px] uppercase font-black tracking-widest text-text-muted">Precio 2</span>
            <span class="text-sm font-bold text-brand-400">${Number(article.prec2 || 0).toLocaleString()}</span>
          </div>
          <div class="bg-surface-base/50 p-3 rounded-2xl border border-white/5 flex flex-col gap-1">
            <span class="text-[9px] uppercase font-black tracking-widest text-text-muted">Margen 2</span>
            <span class="text-sm font-bold text-brand-400">{Number(article.margen2 || 0)}%</span>
          </div>
        </div>

        <div class="bg-brand-500/5 p-4 rounded-3xl border border-brand-500/10 flex flex-col gap-2">
          <div class="flex justify-between items-center">
            <span class="text-[10px] uppercase font-black tracking-widest text-brand-400">Costo Final</span>
            {#if article.ultimo_costo_om > 0}
              <span class="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400">REAL</span>
            {:else if article.costo_estimado > 0}
              <span class="text-[10px] font-black px-2 py-0.5 rounded-md bg-brand-500/20 text-brand-400">CALCULADO</span>
            {:else}
              <span class="text-[10px] font-black px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 text-center">SIN COSTO</span>
            {/if}
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-2xl font-black text-white">${Number(article.ultimo_costo_om || article.costo_estimado || 0).toFixed(2)}</span>
            {#if article.fecha_ultima_compra}
              <span class="text-[9px] text-text-muted font-bold flex items-center gap-1 uppercase"><Calendar size={10} /> {new Date(article.fecha_ultima_compra).toLocaleDateString()}</span>
            {/if}
          </div>
        </div>

        <!-- EXISTENCIA CONSOLIDADA POR SUCURSAL -->
        <div class="flex flex-col gap-2 pt-4 border-t border-white/5">
          <span class="text-[10px] uppercase font-black tracking-widest text-text-muted">Existencia por Sucursal</span>
          {#if article.existencia_consolidada?.length > 0}
            <div class="flex flex-col gap-1.5">
              {#each article.existencia_consolidada as sede}
                <div class="flex justify-between items-center py-2 px-3 bg-surface-base/30 rounded-xl border border-white/5 transition-all hover:bg-brand-500/5 hover:border-brand-500/20">
                  <div class="flex items-center gap-2">
                    <Store size={12} class="text-brand-500" />
                    <span class="text-[11px] font-bold text-text-base uppercase tracking-tight">{sede.nombre}</span>
                  </div>
                  <span class="text-sm font-black {sede.stock > 0 ? 'text-brand-400' : 'text-text-muted'}">{sede.stock}</span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="py-2 text-center text-[10px] text-text-muted italic bg-surface-base/20 rounded-xl">Sin existencias registradas</div>
          {/if}
        </div>

        {#if article.cantidad_por_llegar > 0}
          <div class="mt-auto bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl flex items-center justify-between">
            <span class="text-[10px] font-black text-amber-500 uppercase tracking-widest">Por Llegar</span>
            <span class="text-sm font-black text-amber-500">{article.cantidad_por_llegar}</span>
          </div>
        {/if}

        <div class="mt-2 flex items-center gap-2">
          {#if canEdit}
            <button onclick={() => goto(`/dashboard/purchases/articles/editor?id=${article.co_art}`)} class="flex-1 h-11 bg-white/5 hover:bg-brand-500/20 text-white font-bold rounded-xl border border-white/5 hover:border-brand-500/30 transition-all flex items-center justify-center gap-2 text-sm">
              <Edit size={16} /> Editar
            </button>
          {/if}
          {#if canDelete}
            <form action="?/deleteArticle" method="POST" use:enhance={() => {
              return async ({ result, update }) => {
                if (result.type === 'failure') {
                  alert(result.data?.deleteError || 'Error al eliminar');
                } else if (result.type === 'success') {
                  alert('Artículo eliminado exitosamente.');
                  handleSearch(); // Recargar datos
                }
                update();
              };
            }}>
              <input type="hidden" name="co_art" value={article.co_art} />
              <button type="submit" onclick={(e) => { if (!confirm(`¿Estás seguro de que deseas eliminar el artículo ${article.co_art}? Esta acción no se puede deshacer y fallará si el artículo tiene movimientos en Profit Plus.`)) e.preventDefault(); }} class="h-11 px-4 bg-white/5 hover:bg-red-500/20 text-red-400 font-bold rounded-xl border border-white/5 hover:border-red-500/30 transition-all flex items-center justify-center gap-2 text-sm" title="Eliminar artículo">
                <Trash2 size={16} />
              </button>
            </form>
          {/if}
        </div>
      </div>
    {:else}
      <div class="col-span-full py-20 flex flex-col items-center justify-center text-center gap-4 opacity-50">
        <Package size={64} />
        <h3 class="text-xl font-bold">No se encontraron artículos</h3>
      </div>
    {/each}
  </div>

  <!-- PAGINACIÓN -->
  {#if data.pagination?.totalPages > 1}
    <div class="flex justify-center items-center gap-4 mt-8">
      <button disabled={data.pagination.page === 1} onclick={() => { const u = new URL($page.url); u.searchParams.set("page", (data.pagination.page - 1).toString()); goto(u.toString()); }} class="h-12 w-12 rounded-xl bg-surface-base border border-white/5 flex items-center justify-center hover:bg-white/5 disabled:opacity-30 transition-all">
        <ChevronLeft size={20} />
      </button>
      <div class="h-12 px-6 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center font-black text-brand-500">
        Página {data.pagination.page} de {data.pagination.totalPages}
      </div>
      <button disabled={data.pagination.page === data.pagination.totalPages} onclick={() => { const u = new URL($page.url); u.searchParams.set("page", (data.pagination.page + 1).toString()); goto(u.toString()); }} class="h-12 w-12 rounded-xl bg-surface-base border border-white/5 flex items-center justify-center hover:bg-white/5 disabled:opacity-30 transition-all">
        <ChevronRight size={20} />
      </button>
    </div>
  {/if}
</div>
