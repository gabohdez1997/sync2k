<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { fade } from "svelte/transition";
  import {
    Package,
    Search,
    Store,
    Box,
    AlertCircle,
    ShoppingBag,
    Plus,
    Minus,
    ImagePlus,
    ListFilter,
    MapPin,
    X,
    CheckSquare,
    Square,
    Printer,
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: any } = $props();

  // Permisos CRUD del usuario para esta sección
  const canUpdate = data.crud?.update ?? false;

  $effect(() => {
    if (data.branches) {
      console.log(
        "[SYNC2K] Available Branches (Client):",
        data.branches.map((b: any) => ({
          id: b.id.slice(0, 4),
          name: b.name,
          code: b.co_sucu,
        })),
      );
    }
  });

  let selectedBranch = $state($page.url.searchParams.get("branch_id") || "");

  // Auto-selección si solo hay una sucursal
  $effect(() => {
    if (!selectedBranch && data.branches?.length === 1) {
      selectedBranch = data.branches[0].id;
      handleSearch();
    }
  });

  let searchTerm = $state($page.url.searchParams.get("search") || "");

  // ── ARTICLE SELECTION ──────────────────────────────────────────────────────
  let selectedCodes = $state(new Set<string>());

  const visibleArticles = $derived(
    (data.articles || []).filter(
      (a: any, i: number, arr: any[]) =>
        arr.findIndex(
          (b: any) => (b.co_art || b.codigo) === (a.co_art || a.codigo),
        ) === i,
    ),
  );

  const allVisibleSelected = $derived(
    visibleArticles.length > 0 &&
      visibleArticles.every((a: any) =>
        selectedCodes.has(a.co_art || a.codigo || a.id),
      ),
  );

  function toggleArticle(code: string) {
    const next = new Set(selectedCodes);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    selectedCodes = next;
  }

  function toggleAll() {
    if (allVisibleSelected) {
      // deselect all visible
      const next = new Set(selectedCodes);
      visibleArticles.forEach((a: any) =>
        next.delete(a.co_art || a.codigo || a.id),
      );
      selectedCodes = next;
    } else {
      // select all visible
      const next = new Set(selectedCodes);
      visibleArticles.forEach((a: any) =>
        next.add(a.co_art || a.codigo || a.id),
      );
      selectedCodes = next;
    }
  }
  let showModal = $state(false);
  let selectedArticle = $state<any>(null);
  let formWarehouse = $state("");
  let formUbic1 = $state("");
  let formUbic2 = $state("");
  let formUbic3 = $state("");

  let searchUbic1 = $state("");
  let searchUbic2 = $state("");
  let searchUbic3 = $state("");

  const filteredUbic1 = $derived(
    data.context?.ubicaciones?.filter((u) =>
      `${u.co_ubicacion || u.id} ${u.descripcion || u.name}`
        .toLowerCase()
        .includes(searchUbic1.toLowerCase()),
    ) || [],
  );
  const filteredUbic2 = $derived(
    data.context?.ubicaciones?.filter((u) =>
      `${u.co_ubicacion || u.id} ${u.descripcion || u.name}`
        .toLowerCase()
        .includes(searchUbic2.toLowerCase()),
    ) || [],
  );
  const filteredUbic3 = $derived(
    data.context?.ubicaciones?.filter((u) =>
      `${u.co_ubicacion || u.id} ${u.descripcion || u.name}`
        .toLowerCase()
        .includes(searchUbic3.toLowerCase()),
    ) || [],
  );

  $effect(() => {
    if (form?.success) {
      toast.success("Ubicaciones actualizadas correctamente");
      showModal = false;
      handleSearch();
    } else if (form?.error) {
      toast.error(form.error as string);
    }
  });

  function openLocationModal(article: any) {
    selectedArticle = article;

    // Si no hay sede o almacén seleccionados en los filtros principales,
    // intentamos tomarlos de la primera ubicación o existencia del artículo.
    const firstLoc = article.ubicaciones?.[0] || article.existencia?.[0];
    if (firstLoc) {
      if (!selectedBranch && firstLoc.sede_id)
        selectedBranch = firstLoc.sede_id;
      if (!formWarehouse && (firstLoc.co_alma || firstLoc.id)) {
        formWarehouse = firstLoc.co_alma || firstLoc.id;
      }
    }

    formUbic1 = article.co_ubicacion || "";
    formUbic2 = article.co_ubicacion2 || "";
    formUbic3 = article.co_ubicacion3 || "";
    searchUbic1 = "";
    searchUbic2 = "";
    searchUbic3 = "";
    showModal = true;
  }
  let isSearching = $state(false);

  let selectedLinea = $state($page.url.searchParams.get("linea") || "");
  let selectedCategoria = $state($page.url.searchParams.get("categoria") || "");
  let selectedUbicacion = $state(
    $page.url.searchParams.get("co_ubicacion") || "",
  );

  let currentBranchObj = $derived(
    data.context?.branches?.find((b) => b.id === selectedBranch),
  );
  let coSucuToSend = $derived(currentBranchObj?.co_sucu || "");
  let coAlmaToSend = $derived(formWarehouse || "01");

  const filteredCategorias = $derived(
    !selectedLinea
      ? data.context?.categorias || []
      : (data.context?.categorias || []).filter((c) =>
          c.co_cat?.startsWith(parseInt(selectedLinea, 10).toString()),
        ),
  );

  $effect(() => {
    selectedBranch =
      data.context?.branchId || $page.url.searchParams.get("branch_id") || "";
    selectedLinea = $page.url.searchParams.get("linea") || "";
    selectedCategoria = $page.url.searchParams.get("categoria") || "";
    selectedUbicacion = $page.url.searchParams.get("co_ubicacion") || "";
  });

  let showAll = $state($page.url.searchParams.get("show_all") === "true");

  // Ya no necesitamos tasa en el estado global si viene en el artículo,
  // pero mantendremos el toggle de USD/Bs.
  let showUSD = $state(true);

  function handleSearch(e?: Event) {
    if (e) e.preventDefault();
    isSearching = true;
    const url = new URL($page.url);
    if (searchTerm) {
      url.searchParams.set("search", searchTerm);
    } else {
      url.searchParams.delete("search");
    }

    if (selectedBranch) {
      // Usamos tanto branch_id como sede_id en los params de la vista por si acaso
      url.searchParams.set("branch_id", selectedBranch);
    } else {
      url.searchParams.delete("branch_id");
    }

    if (selectedLinea) {
      url.searchParams.set("linea", selectedLinea);
    } else {
      url.searchParams.delete("linea");
    }

    if (selectedCategoria) {
      url.searchParams.set("categoria", selectedCategoria);
    } else {
      url.searchParams.delete("categoria");
    }

    if (selectedUbicacion) {
      url.searchParams.set("co_ubicacion", selectedUbicacion);
    } else {
      url.searchParams.delete("co_ubicacion");
    }

    if (showAll) {
      url.searchParams.set("show_all", "true");
    } else {
      url.searchParams.delete("show_all");
    }

    url.searchParams.set("page", "1");
    goto(url.toString(), { keepFocus: true, noScroll: true }).finally(
      () => (isSearching = false),
    );
  }

  function toggleShowAll(val: boolean) {
    showAll = val;
    handleSearch();
  }

  function handlePrintLabels(isSmall = false) {
    // Points to printable standalone HTML endpoints
    const endpoint = isSmall ? "/api/labels/small" : "/api/labels";
    const url = new URL($page.url.origin + endpoint);
    if (selectedBranch) url.searchParams.set("branch_id", selectedBranch);

    if (selectedCodes.size > 0) {
      // Print only selected articles — pass codes directly, skip filters
      url.searchParams.set("co_arts", Array.from(selectedCodes).join(","));
    } else {
      // No selection → print ALL matching the current filters (up to 500)
      if (searchTerm) url.searchParams.set("search", searchTerm);
      if (selectedLinea) url.searchParams.set("linea", selectedLinea);
      if (selectedCategoria)
        url.searchParams.set("categoria", selectedCategoria);
      if (selectedUbicacion)
        url.searchParams.set("co_ubicacion", selectedUbicacion);
    }

    window.open(url.toString(), "_blank");
  }
</script>

<div class="flex flex-col gap-8" in:fade>
  <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
    <div class="flex flex-col gap-2">
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <MapPin size={40} class="text-brand-500" />
        Gestión de Ubicaciones
      </h1>
      <p class="text-text-muted text-lg">
        Asigna y visualiza las ubicaciones físicas de los artículos en el
        almacén.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-3 md:gap-4 shrink-0">
      <!-- Standard Large Labels Button -->
      <button
        onclick={() => handlePrintLabels(false)}
        class="h-14 px-6 md:px-8 {selectedCodes.size > 0
          ? 'bg-brand-600 hover:bg-brand-500 border-brand-500/50 shadow-lg shadow-brand-600/20 text-white'
          : 'bg-surface-raised hover:bg-white/5 border-white/5 hover:border-white/10 text-text-base'} border rounded-2xl font-bold transition-all active:scale-95 flex items-center gap-3 group"
        title={selectedCodes.size > 0
          ? `Imprimir ${selectedCodes.size} artículo(s) seleccionado(s)`
          : "Imprimir todos los artículos del filtro (hasta 500)"}
      >
        <Printer
          size={20}
          class={selectedCodes.size > 0
            ? "text-white"
            : "text-brand-400 group-hover:text-brand-300"}
        />
        <span>Etiquetas Estándar</span>
        {#if selectedCodes.size > 0}
          <span
            class="bg-white/20 text-white text-xs font-black px-2 py-0.5 rounded-full"
            >{selectedCodes.size}</span
          >
        {/if}
      </button>

      <!-- New Small 6x3cm Labels Button -->
      <button
        onclick={() => handlePrintLabels(true)}
        class="h-14 px-6 md:px-8 {selectedCodes.size > 0
          ? 'bg-amber-600 hover:bg-amber-500 border-amber-500/50 shadow-lg shadow-amber-600/20 text-white'
          : 'bg-surface-raised hover:bg-white/5 border-white/5 hover:border-white/10 text-text-base'} border rounded-2xl font-bold transition-all active:scale-95 flex items-center gap-3 group"
        title={selectedCodes.size > 0
          ? `Imprimir ${selectedCodes.size} etiqueta(s) pequeña(s) (6x3)`
          : "Imprimir todas las etiquetas pequeñas del filtro (hasta 500)"}
      >
        <Printer
          size={20}
          class={selectedCodes.size > 0
            ? "text-white"
            : "text-amber-400 group-hover:text-amber-300"}
        />
        <span>Etiquetas Pequeñas (6x3)</span>
        {#if selectedCodes.size > 0}
          <span
            class="bg-white/20 text-white text-xs font-black px-2 py-0.5 rounded-full"
            >{selectedCodes.size}</span
          >
        {/if}
      </button>
    </div>
  </div>

  <!-- SEARCH & FILTERS SECTION -->
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
        options={(data.context?.lineas || []).map((l: any) => ({
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

    <!-- 5. Ubicación -->
    {#if data.context?.ubicaciones && data.context.ubicaciones.length > 0}
      {@const ubicOptions = [
        ...(data.context.ubicaciones || []).map((u: any) => ({
          value: u.id || u.co_ubicacion,
          label: `${u.co_ubicacion || u.id} - ${u.descripcion || u.name || u.co_ubicacion || u.id}`,
        })),
      ]}
      <div class="w-full">
        <Combobox
          options={ubicOptions}
          bind:value={selectedUbicacion}
          placeholder="Ubicación..."
          allLabel="Todas las Ubicaciones"
          icon={MapPin}
          class="w-full h-14"
          onchange={() => handleSearch()}
        />
      </div>
    {/if}

    <!-- 6. Switch Stock (Estilo USD/BS) -->
    <div class="w-full h-14 flex items-center justify-start xl:justify-center">
      <div
        class="flex items-center bg-white/5 border border-white/5 p-1 rounded-xl h-full"
      >
        <button
          onclick={() => toggleShowAll(false)}
          class={`px-4 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${!showAll ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20" : "text-text-muted hover:text-white"}`}
          >Con Stock</button
        >
        <button
          onclick={() => toggleShowAll(true)}
          class={`px-4 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showAll ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20" : "text-text-muted hover:text-white"}`}
          >Sin Stock</button
        >
      </div>
    </div>
  </div>

  <!-- Resultados -->
  {#if data.requireBranchSelection}
    <div
      class="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center gap-4 opacity-70 mt-8"
    >
      <Store size={48} class="text-text-muted/30" />
      <div>
        <h3 class="text-xl font-bold">
          Selecciona una Sucursal (Nodo de Datos)
        </h3>
        <p class="text-text-muted mt-2">
          Utiliza el menú desplegable superior para elegir la sucursal de la
          cual extraeremos el listado de inventario.
        </p>
      </div>
    </div>
  {:else if data.error}
    <div
      class="p-8 rounded-3xl border border-red-500/20 bg-red-500/5 flex flex-col items-center justify-center text-center gap-4 mt-8"
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
  {:else if data.articles?.length === 0}
    <div
      class="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center gap-4 opacity-70"
    >
      <Package size={48} class="text-text-muted/30" />
      <div>
        <h3 class="text-xl font-bold">No se encontraron artículos</h3>
        <p class="text-text-muted mt-2">
          Prueba con otra búsqueda o asegúrate de que el Agente esté en línea.
        </p>
      </div>
    </div>
  {:else}
    <!-- Selection toolbar -->
    <div class="flex items-center justify-between gap-4 mb-2">
      <div class="flex items-center gap-3">
        <button
          onclick={toggleAll}
          class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border
            {allVisibleSelected
            ? 'bg-brand-500/20 border-brand-500/40 text-brand-300 hover:bg-brand-500/30'
            : 'bg-surface-raised border-white/5 text-text-muted hover:bg-white/5 hover:text-text-base'}"
        >
          {#if allVisibleSelected}
            <CheckSquare size={16} />
            Deseleccionar todo
          {:else}
            <Square size={16} />
            Seleccionar todo
          {/if}
        </button>
        {#if selectedCodes.size > 0}
          <span class="text-sm text-brand-400 font-bold"
            >{selectedCodes.size} artículo(s) seleccionado(s)</span
          >
          <button
            onclick={() => (selectedCodes = new Set())}
            class="text-xs text-text-muted hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <X size={12} /> Limpiar
          </button>
        {/if}
      </div>
      {#if selectedCodes.size === 0}
        <span class="text-xs text-text-muted italic">
          Sin selección → imprime todos los del filtro (hasta 500)
        </span>
      {/if}
    </div>

    <div
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
    >
      {#each visibleArticles as article}
        {@const artCode = article.co_art || article.codigo || article.id || ""}
        {@const isSelected = selectedCodes.has(artCode)}
        <label
          for="select-{artCode}"
          class="glass p-6 rounded-3xl border transition-all hover:shadow-2xl flex flex-col gap-4 cursor-pointer select-none
            {isSelected
            ? 'border-brand-500/60 shadow-brand-500/10 bg-brand-500/5'
            : 'border-white/5 hover:border-brand-500/30 hover:shadow-brand-500/5'}"
        >
          <input
            id="select-{artCode}"
            type="checkbox"
            class="sr-only"
            checked={isSelected}
            onchange={() => toggleArticle(artCode)}
          />
          <div class="flex justify-between items-start relative group">
            <div
              class="h-12 w-12 rounded-2xl flex items-center justify-center transition-all
                {isSelected
                ? 'bg-brand-500 text-white'
                : 'bg-brand-500/10 text-brand-500'}"
            >
              {#if isSelected}
                <CheckSquare size={22} />
              {:else}
                <MapPin size={24} />
              {/if}
            </div>
            <span
              class="px-2 py-1 rounded-md bg-surface-base border border-border-subtle text-xs font-mono text-text-muted"
            >
              {artCode || "N/A"}
            </span>
          </div>

          <div class="mt-2 text-sm">
            <h3 class="text-lg font-bold leading-tight mb-4">
              {article.art_des ||
                article.descripcion ||
                article.name ||
                "Sin título"}
            </h3>

            <div class="flex flex-col gap-2 mt-3 mb-2">
              <span
                class="text-[10px] uppercase font-black tracking-widest text-brand-400"
                >Ubicaciones Asignadas</span
              >

              <div class="grid grid-cols-1 gap-2">
                <div
                  class="flex items-center justify-between bg-surface-base/40 p-2 rounded-xl border border-white/5"
                >
                  <span class="text-[10px] text-text-muted uppercase font-bold"
                    >Principal</span
                  >
                  <span class="font-bold text-sm text-brand-400"
                    >{article.co_ubicacion || "Ninguna"}</span
                  >
                </div>
                <div
                  class="flex items-center justify-between bg-surface-base/40 p-2 rounded-xl border border-white/5"
                >
                  <span class="text-[10px] text-text-muted uppercase font-bold"
                    >Secundaria</span
                  >
                  <span class="font-bold text-sm text-brand-400"
                    >{article.co_ubicacion2 || "Ninguna"}</span
                  >
                </div>
                <div
                  class="flex items-center justify-between bg-surface-base/40 p-2 rounded-xl border border-white/5"
                >
                  <span class="text-[10px] text-text-muted uppercase font-bold"
                    >Terciaria</span
                  >
                  <span class="font-bold text-sm text-brand-400"
                    >{article.co_ubicacion3 || "Ninguna"}</span
                  >
                </div>
              </div>

              {#if canUpdate}
                <button
                  onclick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openLocationModal(article);
                  }}
                  class="mt-3 w-full py-2 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 font-bold rounded-xl transition-colors border border-brand-500/20 text-sm"
                >
                  Modificar Ubicaciones
                </button>
              {/if}
            </div>
          </div>

          <div
            class="mt-auto pt-4 border-t border-white/5 flex flex-col gap-2 pointer-events-none"
          >
            <span
              class="text-[10px] uppercase font-black tracking-widest text-text-muted mb-1"
              >Existencia por Almacén</span
            >

            {#if article.disponibilidad && Array.isArray(article.disponibilidad)}
              {#each article.disponibilidad.filter((alm: any) => !data.context?.finalWarehouseIds?.length || data.context.finalWarehouseIds.includes(alm.co_alma)) as alm}
                <div
                  class="flex items-center justify-between py-1 bg-surface-base/50 px-2 rounded-md border border-white/5"
                >
                  <span class="text-xs text-text-muted">{alm.des_alma}</span>
                  <span class="font-bold text-brand-400 text-sm"
                    >{alm.stock ?? alm.cant_stock ?? 0}</span
                  >
                </div>
              {/each}
            {:else}
              <div
                class="flex items-center justify-between py-1 bg-surface-base/50 px-2 rounded-md border border-white/5"
              >
                <span class="text-xs text-text-muted">Total (Global)</span>
                <span class="text-lg font-black text-brand-400">
                  {article.stock !== undefined
                    ? article.stock
                    : article.s_actual || "0"}
                </span>
              </div>
            {/if}
          </div>
        </label>
      {/each}
    </div>

    <!-- Paginación Simple -->
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

{#if showModal && selectedArticle}
  <div
    class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    transition:fade
  >
    <div
      class="glass border border-border-subtle rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden"
    >
      <div
        class="p-6 border-b border-white/5 flex items-center justify-between bg-surface-raised"
      >
        <div>
          <h2 class="text-xl font-bold flex items-center gap-2 text-brand-500">
            <MapPin size={20} />
            Asignar Ubicaciones
          </h2>
          <p class="text-xs text-text-muted font-mono mt-1">
            {selectedArticle.co_art || selectedArticle.codigo}
          </p>
        </div>
        <button
          onclick={() => (showModal = false)}
          class="p-2 text-text-muted hover:text-white bg-white/5 rounded-full hover:bg-red-500/20 hover:text-red-400 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <form
        method="POST"
        action="?/assignLocations"
        use:enhance
        class="p-6 flex flex-col gap-6"
      >
        <input
          type="hidden"
          name="co_art"
          value={selectedArticle.co_art || selectedArticle.codigo}
        />
        <input type="hidden" name="co_alma" value={coAlmaToSend} />
        <input type="hidden" name="branchId" value={selectedBranch} />

        {#if form && typeof form === "object" && "error" in form}
          <div
            class="p-4 mb-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-sm flex flex-col gap-2"
          >
            <div class="flex items-center gap-2 font-bold">
              <Plus class="rotate-45" size={16} />
              {(form as any).error}
            </div>
            {#if (form as any).detail}
              <div
                class="text-[10px] font-mono bg-black/20 p-2 rounded-lg opacity-80 break-all max-h-24 overflow-auto"
              >
                {(form as any).detail}
              </div>
            {/if}
          </div>
        {/if}

        <!-- SELECTOR DE ALMACÉN (OBLIGATORIO) -->
        <div class="space-y-1">
          <label
            class="text-[10px] uppercase font-black tracking-widest text-brand-400 ml-1"
            >Almacén / Depósito Profit</label
          >
          <Combobox
            options={(data.context?.warehouses || []).map((a: any) => ({
              value: a.co_alma || a.id,
              label: a.des_alma || a.nombre || a.id,
            }))}
            bind:value={formWarehouse}
            placeholder="-- Seleccionar Almacén --"
            allLabel="-- Sin seleccionar --"
            icon={Package}
          />
        </div>

        <div class="space-y-4">
          <!-- UBICACION 1 -->
          <div class="space-y-1">
            <label
              class="text-[10px] uppercase font-black tracking-widest text-text-muted ml-1"
              >Ubicación Principal</label
            >
            <input type="hidden" name="co_ubicacion" value={formUbic1} />
            <Combobox
              options={(data.context?.ubicaciones || []).map((u: any) => ({
                value: u.id || u.co_ubicacion,
                label: `${u.co_ubicacion || u.id} - ${u.descripcion || u.name}`,
              }))}
              bind:value={formUbic1}
              placeholder="-- Ninguna --"
              allLabel="-- Ninguna --"
              icon={MapPin}
            />
          </div>

          <!-- UBICACION 2 -->
          <div class="space-y-1">
            <label
              class="text-[10px] uppercase font-black tracking-widest text-text-muted ml-1"
              >Ubicación Secundaria</label
            >
            <input type="hidden" name="co_ubicacion2" value={formUbic2} />
            <Combobox
              options={(data.context?.ubicaciones || []).map((u: any) => ({
                value: u.id || u.co_ubicacion,
                label: `${u.co_ubicacion || u.id} - ${u.descripcion || u.name}`,
              }))}
              bind:value={formUbic2}
              placeholder="-- Ninguna --"
              allLabel="-- Ninguna --"
              icon={MapPin}
            />
          </div>

          <!-- UBICACION 3 -->
          <div class="space-y-1">
            <label
              class="text-[10px] uppercase font-black tracking-widest text-text-muted ml-1"
              >Ubicación Terciaria</label
            >
            <input type="hidden" name="co_ubicacion3" value={formUbic3} />
            <Combobox
              options={(data.context?.ubicaciones || []).map((u: any) => ({
                value: u.id || u.co_ubicacion,
                label: `${u.co_ubicacion || u.id} - ${u.descripcion || u.name}`,
              }))}
              bind:value={formUbic3}
              placeholder="-- Ninguna --"
              allLabel="-- Ninguna --"
              icon={MapPin}
            />
          </div>
        </div>

        <div class="pt-4 border-t border-white/5 flex gap-3 mt-2">
          <button
            type="button"
            onclick={() => (showModal = false)}
            class="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-colors"
            >Cancelar</button
          >
          <button
            type="submit"
            disabled={!selectedBranch}
            class="flex-1 py-3 bg-brand-600 hover:bg-brand-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors shadow-lg shadow-brand-500/20 active:scale-95"
            >Guardar</button
          >
        </div>
      </form>
    </div>
  </div>
{/if}
