<script lang="ts">
  import { fade } from "svelte/transition";
  import {
    Package,
    Search,
    Store,
    Plus,
    Edit2,
    AlertCircle,
    ListFilter,
    ImagePlus,
    Calendar,
    DollarSign,
    Truck,
  } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let selectedBranch = $state($page.url.searchParams.get("branch_id") || "");
  let searchTerm = $state($page.url.searchParams.get("search") || "");
  let isSearching = $state(false);

  const canCreate = data.crud?.create ?? false;
  const canUpdate = data.crud?.update ?? false;

  let selectedLinea = $state($page.url.searchParams.get("linea") || "");
  let selectedCategoria = $state($page.url.searchParams.get("categoria") || "");
  let showAll = $state($page.url.searchParams.get("show_all") === "true"); // Backward compatibility
  let stockFilter = $state($page.url.searchParams.get("stock_filter") || "true");
  let soloPendientes = $state($page.url.searchParams.get("solo_pendientes") === "true");
  let conCosto = $state($page.url.searchParams.get("con_costo") || ""); // "", "true", "false"

  $effect(() => {
    selectedBranch = $page.url.searchParams.get("branch_id") || "";
    searchTerm = $page.url.searchParams.get("search") || "";
    selectedLinea = $page.url.searchParams.get("linea") || "";
    selectedCategoria = $page.url.searchParams.get("categoria") || "";
    showAll = $page.url.searchParams.get("show_all") === "true";
    stockFilter = $page.url.searchParams.get("stock_filter") || "true";
    soloPendientes = $page.url.searchParams.get("solo_pendientes") === "true";
    conCosto = $page.url.searchParams.get("con_costo") || "";
  });

  const filteredCategorias = $derived(
    !selectedLinea
      ? data.catalogs?.categorias || []
      : (data.catalogs?.categorias || []).filter((c: any) =>
          c.co_cat?.startsWith(parseInt(selectedLinea, 10).toString()),
        ),
  );

  function handleSearch(e?: Event) {
    if (e) e.preventDefault();
    isSearching = true;
    const url = new URL($page.url);
    if (searchTerm) url.searchParams.set("search", searchTerm);
    else url.searchParams.delete("search");

    if (selectedBranch) url.searchParams.set("branch_id", selectedBranch);
    else url.searchParams.delete("branch_id");

    if (selectedLinea) url.searchParams.set("linea", selectedLinea);
    else url.searchParams.delete("linea");

    if (selectedCategoria) url.searchParams.set("categoria", selectedCategoria);
    else url.searchParams.delete("categoria");

    if (stockFilter) url.searchParams.set("stock_filter", stockFilter);
    else url.searchParams.delete("stock_filter");

    if (soloPendientes) url.searchParams.set("solo_pendientes", "true");
    else url.searchParams.delete("solo_pendientes");

    if (conCosto) url.searchParams.set("con_costo", conCosto);
    else url.searchParams.delete("con_costo");

    url.searchParams.set("page", "1");
    goto(url.toString(), { keepFocus: true, noScroll: true }).finally(
      () => (isSearching = false),
    );
  }

  function toggleShowAll(val: boolean) {
    showAll = val;
    handleSearch();
  }
</script>

<div class="flex flex-col gap-8" in:fade>
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div class="flex flex-col gap-2">
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Package size={40} class="text-brand-500" />
        Maestro de Artículos
      </h1>
      <p class="text-text-muted text-lg">
        Consulta y gestiona el catálogo de productos de Profit Plus.
      </p>
    </div>

    {#if canCreate}
      <button
        onclick={() => goto("/dashboard/purchases/articles/editor")}
        class="h-14 px-8 bg-brand-600 hover:bg-brand-500 border-brand-500/50 shadow-lg shadow-brand-600/20 text-white border rounded-2xl font-bold transition-all active:scale-95 flex items-center gap-3 shrink-0"
      >
        <Plus size={20} />
        Crear Artículo
      </button>
    {/if}
  </div>

  <!-- Filtros -->
  <div
    class="glass p-4 rounded-3xl border border-white/5 shadow-2xl grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-center relative z-10 mb-8 w-full"
  >
    <!-- 1. Sede -->
    {#if data.branches && data.branches.length > 0}
      <div class="w-full">
        <Combobox
          options={data.branches.map((b: any) => ({
            value: b.id,
            label: b.name,
          }))}
          bind:value={selectedBranch}
          placeholder="Sucursal..."
          allLabel="Todas las Sucursales"
          icon={Store}
          class="w-full h-14"
          onchange={() => handleSearch()}
        />
      </div>
    {/if}

    <!-- 2. Buscador + Scanner -->
    <div class="w-full flex items-center gap-2">
      <form
        class="relative group h-14 flex-1"
        onsubmit={(e) => {
          e.preventDefault();
          handleSearch();
        }}
      >
        <input
          type="text"
          bind:value={searchTerm}
          placeholder="Buscar código o descripción..."
          class="w-full h-full bg-surface-base pl-6 pr-14 rounded-2xl border border-white/5 focus:border-brand-500/30 outline-none transition-all font-bold text-sm placeholder:font-normal placeholder:text-text-secondary/30"
        />
        <button
          type="submit"
          disabled={isSearching}
          class="absolute right-1 top-1 bottom-1 w-12 flex items-center justify-center bg-surface-soft hover:bg-surface-strong text-brand-400 rounded-xl transition-all border border-border-subtle active:scale-95 disabled:opacity-50"
          title="Buscar"
        >
          {#if isSearching}
            <span class="animate-pulse">...</span>
          {:else}
            <Search size={18} />
          {/if}
        </button>
      </form>
      <BarcodeScanner
        onScan={(code) => {
          searchTerm = code;
          handleSearch();
        }}
      />
    </div>

    <!-- 3. Linea -->
    <div class="w-full">
      <Combobox
        options={(data.catalogs?.lineas || []).map((l: any) => ({
          value: l.co_lin,
          label: l.lin_des,
        }))}
        bind:value={selectedLinea}
        placeholder="Línea..."
        allLabel="Todas las Líneas"
        icon={ListFilter}
        class="w-full h-14"
        onchange={() => {
          selectedCategoria = "";
          handleSearch();
        }}
      />
    </div>

    <!-- 4. Categoria -->
    <div class="w-full">
      <Combobox
        options={filteredCategorias.map((c: any) => ({
          value: c.co_cat,
          label: c.cat_des,
        }))}
        bind:value={selectedCategoria}
        placeholder="Categoría..."
        allLabel="Todas las Categorías"
        icon={ListFilter}
        class="w-full h-14"
        onchange={() => handleSearch()}
      />
    </div>

    <!-- 5. Filtros Switch -->
    <div class="xl:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-white/5 mt-2">
      <!-- Stock -->
      <div class="flex items-center bg-white/5 border border-white/5 p-1 rounded-xl h-12">
        <button
          onclick={() => { stockFilter = "true"; handleSearch(); }}
          class={`flex-1 h-full rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${stockFilter === "true" ? "bg-brand-500 text-white shadow-lg" : "text-text-muted hover:text-white"}`}
        >Con Stock</button>
        <button
          onclick={() => { stockFilter = "false"; handleSearch(); }}
          class={`flex-1 h-full rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${stockFilter === "false" ? "bg-red-500 text-white shadow-lg" : "text-text-muted hover:text-white"}`}
        >Sin Stock</button>
        <button
          onclick={() => { stockFilter = "all"; handleSearch(); }}
          class={`flex-1 h-full rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${stockFilter === "all" ? "bg-surface-soft text-white shadow-lg" : "text-text-muted hover:text-white"}`}
        >Todos</button>
      </div>

      <!-- Pendientes -->
      <div class="flex items-center bg-white/5 border border-white/5 p-1 rounded-xl h-12">
        <button
          onclick={() => { soloPendientes = true; handleSearch(); }}
          class={`flex-1 h-full rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${soloPendientes ? "bg-amber-500 text-white shadow-lg" : "text-text-muted hover:text-white"}`}
        >Solo por Llegar</button>
        <button
          onclick={() => { soloPendientes = false; handleSearch(); }}
          class={`flex-1 h-full rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${!soloPendientes ? "bg-surface-soft text-white" : "text-text-muted hover:text-white"}`}
        >Todos</button>
      </div>

      <!-- Costo -->
      <div class="flex items-center bg-white/5 border border-white/5 p-1 rounded-xl h-12">
        <button
          onclick={() => { conCosto = "true"; handleSearch(); }}
          class={`flex-1 h-full rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${conCosto === "true" ? "bg-emerald-500 text-white shadow-lg" : "text-text-muted hover:text-white"}`}
        >Con Costo</button>
        <button
          onclick={() => { conCosto = "false"; handleSearch(); }}
          class={`flex-1 h-full rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${conCosto === "false" ? "bg-red-500 text-white shadow-lg" : "text-text-muted hover:text-white"}`}
        >Sin Costo</button>
        <button
          onclick={() => { conCosto = ""; handleSearch(); }}
          class={`flex-1 h-full rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${conCosto === "" ? "bg-surface-soft text-white" : "text-text-muted hover:text-white"}`}
        >Todos</button>
      </div>
    </div>
  </div>

  {#if data.requireBranchSelection}
    <div
      class="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center gap-4 opacity-70"
    >
      <Store size={48} class="text-text-muted/30" />
      <div>
        <h3 class="text-xl font-bold">Selecciona una Sucursal</h3>
        <p class="text-text-muted mt-2">
          Usa el filtro para cargar los artículos de una sede.
        </p>
      </div>
    </div>
  {:else if data.error}
    <div
      class="p-8 rounded-3xl border border-red-500/20 bg-red-500/5 flex flex-col items-center justify-center text-center gap-4"
    >
      <div
        class="h-16 w-16 bg-red-500/10 text-red-500 flex items-center justify-center rounded-2xl"
      >
        <AlertCircle size={32} />
      </div>
      <div>
        <h3 class="text-xl font-bold text-red-500">Error Cargando Artículos</h3>
        <p class="text-text-muted mt-2 max-w-xl mx-auto">{data.error}</p>
      </div>
    </div>
  {:else if !data.articles?.length}
    <div
      class="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center gap-4 opacity-70"
    >
      <Package size={48} class="text-text-muted/30" />
      <div>
        <h3 class="text-xl font-bold">No se encontraron artículos</h3>
        <p class="text-text-muted mt-2">
          Verifica los filtros o intenta con otra búsqueda.
        </p>
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6">
      {#each data.articles as article}
        <div
          class="glass p-6 rounded-3xl border border-white/5 transition-all hover:shadow-2xl hover:border-brand-500/30 flex flex-col gap-4 relative group"
        >
          <!-- Top Row: Icon & Code -->
          <div class="flex justify-between items-start">
            <div
              class="h-12 w-12 rounded-2xl bg-brand-500/10 text-brand-500 flex items-center justify-center shrink-0"
            >
              <Package size={24} />
            </div>
            <span
              class="px-2 py-1 rounded-md bg-surface-base border border-border-subtle text-xs font-mono text-text-muted"
            >
              {article.co_art}
            </span>
          </div>

          <!-- Image Preview Space -->
          <div
            class="w-full aspect-video bg-surface-base/50 rounded-2xl border border-white/5 flex items-center justify-center mt-2 relative overflow-hidden group/img"
          >
            {#if article.image_base64 || article.image_url}
              <img
                src={article.image_base64 || article.image_url}
                alt={article.co_art}
                class="w-full h-full object-cover opacity-80"
              />
            {:else}
              <div class="flex flex-col items-center gap-2 text-text-muted/30">
                <ImagePlus size={32} />
                <span class="text-[10px] font-bold uppercase tracking-widest"
                  >Sin Imagen</span
                >
              </div>
            {/if}

            {#if canUpdate}
              <button
                onclick={() =>
                  goto(
                    `/dashboard/purchases/articles/editor?id=${encodeURIComponent(article.co_art)}&branch_id=${selectedBranch}`,
                  )}
                class="absolute inset-0 bg-brand-500/80 text-white opacity-0 group-hover/img:opacity-100 transition-all flex items-center justify-center gap-2 font-bold backdrop-blur-sm"
              >
                <Edit2 size={20} /> Editar Artículo
              </button>
            {/if}
          </div>

          <!-- Description -->
          <h3
            class="text-lg font-bold leading-tight mt-2 line-clamp-3"
            title={article.art_des || article.descripcion}
          >
            {article.art_des || article.descripcion || "Sin título"}
          </h3>

          <!-- Existencia por Sucursal -->
          <div class="mt-auto pt-4 border-t border-white/5 flex flex-col gap-2">
            <span class="text-[10px] uppercase font-black tracking-widest text-text-muted mb-1">Existencia por Sucursal</span>

            {#if article.existencia_por_sede && article.existencia_por_sede.length > 0}
              {#each article.existencia_por_sede as s}
                {#if s.stock > 0 || stockFilter === 'all'}
                  <div class="flex items-center justify-between py-1.5 bg-surface-base/50 px-3 rounded-xl border border-white/5">
                    <span class="text-xs text-text-muted truncate max-w-[150px] uppercase">{s.sede}</span>
                    <span class="font-bold {s.stock > 0 ? 'text-brand-400' : 'text-text-muted/30'} text-sm">{s.stock}</span>
                  </div>
                {/if}
              {/each}
            {:else}
              <div class="flex items-center justify-between py-1.5 bg-surface-base/50 px-3 rounded-xl border border-white/5 opacity-50">
                <span class="text-xs text-text-muted">Total (Global)</span>
                <span class="font-black text-brand-400 text-lg">0</span>
              </div>
            {/if}
          </div>

          <!-- Logística -->
          <div class="flex flex-col gap-2 pt-4 border-t border-white/5">
            <span
              class="text-[10px] uppercase font-black tracking-widest text-text-muted mb-1"
              >Logística de Compras</span
            >

            <div class="grid grid-cols-2 gap-2">
              <div
                class="bg-surface-base/30 p-2 rounded-xl border border-white/5 flex flex-col gap-1"
              >
                <div class="flex items-center gap-1.5 text-text-muted">
                  <Calendar size={12} class="text-brand-400" />
                  <span class="text-[9px] font-bold uppercase tracking-tighter"
                    >Última Compra</span
                  >
                </div>
                <span class="text-xs font-bold">
                  {article.fecha_ultima_compra
                    ? new Date(article.fecha_ultima_compra).toLocaleDateString(
                        "es-VE",
                        { day: "2-digit", month: "2-digit", year: "numeric" },
                      )
                    : "---"}
                </span>
              </div>

              <div
                class="bg-surface-base/30 p-2 rounded-xl border border-white/5 flex flex-col gap-1"
              >
                <div class="flex items-center gap-1.5 text-text-muted">
                  <DollarSign size={12} class="text-emerald-400" />
                  <span class="text-[9px] font-bold uppercase tracking-tighter"
                    >Costo (OM)</span
                  >
                </div>
                <span class="text-xs font-bold text-emerald-400">
                  {article.ultimo_costo_om ? `${Number(article.ultimo_costo_om).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '---'}
                </span>
              </div>
            </div>

            <div
              class="bg-surface-base/30 p-2 rounded-xl border border-white/5 flex items-center justify-between"
            >
              <div class="flex items-center gap-2 text-text-muted">
                <Truck
                  size={14}
                  class={article.cantidad_por_llegar > 0
                    ? "text-amber-400"
                    : "text-text-muted/30"}
                />
                <span class="text-[10px] font-bold uppercase tracking-tight"
                  >Cantidad por Llegar</span
                >
              </div>
              <span
                class={`text-sm font-black ${article.cantidad_por_llegar > 0 ? "text-amber-400" : "text-text-muted/30"}`}
              >
                {article.cantidad_por_llegar || 0}
              </span>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Paginación -->
    {#if data.pagination && data.pagination.totalPages > 1}
      <div class="flex justify-center gap-2 mt-8">
        <button
          disabled={data.pagination.page <= 1}
          onclick={() => {
            const u = new URL($page.url);
            u.searchParams.set("page", (data.pagination.page - 1).toString());
            goto(u.toString());
          }}
          class="px-4 py-2 rounded-xl bg-surface-base border border-border-subtle font-bold text-sm disabled:opacity-50 hover:bg-white/5 transition-colors"
        >
          Anterior
        </button>
        <span
          class="px-4 py-2 rounded-xl bg-brand-500/10 text-brand-500 font-bold border border-brand-500/20 text-sm"
        >
          Pág {data.pagination.page} de {data.pagination.totalPages}
        </span>
        <button
          disabled={data.pagination.page >= data.pagination.totalPages}
          onclick={() => {
            const u = new URL($page.url);
            u.searchParams.set("page", (data.pagination.page + 1).toString());
            goto(u.toString());
          }}
          class="px-4 py-2 rounded-xl bg-surface-base border border-border-subtle font-bold text-sm disabled:opacity-50 hover:bg-white/5 transition-colors"
        >
          Siguiente
        </button>
      </div>
    {/if}
  {/if}
</div>
