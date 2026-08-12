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
    Save,
    Check,
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData; form?: any } = $props();

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
  let selectedPrintFormat = $state("standard");

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
      const next = new Set(selectedCodes);
      visibleArticles.forEach((a: any) =>
        next.delete(a.co_art || a.codigo || a.id),
      );
      selectedCodes = next;
    } else {
      const next = new Set(selectedCodes);
      visibleArticles.forEach((a: any) =>
        next.add(a.co_art || a.codigo || a.id),
      );
      selectedCodes = next;
    }
  }

  // ── UBICACIONES CATALOG & LAZY LOADING ────────────────────────────────────
  let ubicacionesList = $state<any[]>(data.context?.ubicaciones || []);
  let isLoadingUbicaciones = $state(false);

  $effect(() => {
    if (data.context?.ubicaciones && data.context.ubicaciones.length > 0) {
      ubicacionesList = data.context.ubicaciones;
    }
  });

  const ubicacionesOptions = $derived(
    (ubicacionesList || []).filter(Boolean).map((u: any) => ({
      value: String(u?.co_ubicacion || u?.id || ''),
      label: `${u?.co_ubicacion || u?.id || ''} - ${u?.des_ubicacion || u?.descripcion || u?.name || u?.co_ubicacion || u?.id || ''}`,
    })),
  );

  const warehouseOptions = $derived(
    (data.context?.warehouses || [])
      .filter((a: any) => !data.context?.finalWarehouseIds?.length || (data.context?.finalWarehouseIds || []).includes(a?.co_alma || a?.id))
      .map((w: any) => ({
        value: String(w?.co_alma || w?.id || ''),
        label: String(w?.des_alma || w?.nombre || w?.id || ''),
      }))
  );

  async function ensureUbicacionesLoaded() {
    if (ubicacionesList.length > 0) return;
    if (!selectedBranch) return;
    isLoadingUbicaciones = true;
    try {
      const res = await fetch(`/api/agent/catalogos/ubicaciones?branch_id=${selectedBranch}`);
      if (res.ok) {
        const json = await res.json();
        ubicacionesList = json.data || [];
      }
    } catch (e) {
      console.error('[LOCATIONS] Error loading ubicaciones catalog:', e);
    } finally {
      isLoadingUbicaciones = false;
    }
  }

  // ── PER-CARD WAREHOUSE LOCATION SWITCHER & SAVER ───────────────────────────
  let cardWarehouse = $state<Record<string, string>>({});
  let cardLocations = $state<Record<string, { u1: string; u2: string; u3: string }>>({});
  let cardOriginalLocations = $state<Record<string, { u1: string; u2: string; u3: string; warehouse: string }>>({});
  let cardLoadingMap = $state<Record<string, boolean>>({});
  let cardSavingMap = $state<Record<string, boolean>>({});

  function getCardWarehouse(artCode: string, article: any): string {
    if (cardWarehouse[artCode] !== undefined) return cardWarehouse[artCode];
    const firstLoc = article.ubicaciones?.[0] || article.existencia?.[0];
    const defaultWh = firstLoc?.co_alma || firstLoc?.id || data.context?.warehouses?.[0]?.co_alma || data.context?.warehouses?.[0]?.id || "01";
    return defaultWh;
  }

  function getCardLocations(artCode: string, article: any) {
    if (cardLocations[artCode]) return cardLocations[artCode];
    return {
      u1: article.co_ubicacion || "",
      u2: article.co_ubicacion2 || "",
      u3: article.co_ubicacion3 || "",
    };
  }

  function updateCardLocation(artCode: string, article: any, field: 'u1' | 'u2' | 'u3', val: string) {
    const current = getCardLocations(artCode, article);
    const wh = getCardWarehouse(artCode, article);

    if (!cardOriginalLocations[artCode]) {
      cardOriginalLocations = {
        ...cardOriginalLocations,
        [artCode]: { ...current, warehouse: wh },
      };
    }

    cardLocations = {
      ...cardLocations,
      [artCode]: {
        ...current,
        [field]: val,
      },
    };
  }

  function hasCardChanges(artCode: string, article: any): boolean {
    const orig = cardOriginalLocations[artCode];
    if (!orig) return false;
    const current = getCardLocations(artCode, article);
    const currentWh = getCardWarehouse(artCode, article);
    return (
      orig.warehouse !== currentWh ||
      orig.u1 !== current.u1 ||
      orig.u2 !== current.u2 ||
      orig.u3 !== current.u3
    );
  }

  async function onCardWarehouseChange(artCode: string, newAlma: string, article: any) {
    cardWarehouse = { ...cardWarehouse, [artCode]: newAlma };
    if (!newAlma || !selectedBranch) return;

    cardLoadingMap = { ...cardLoadingMap, [artCode]: true };
    try {
      const params = new URLSearchParams();
      params.set('branch_id', selectedBranch);
      params.set('co_art', artCode);
      params.set('co_alma', newAlma);
      params.set('in_stock', 'all');
      params.set('limit', '1');
      const res = await fetch(`/api/agent/articles?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const items = json.data || [];
        if (items.length > 0) {
          const art = items[0];
          const locObj = {
            u1: art.co_ubicacion || "",
            u2: art.co_ubicacion2 || "",
            u3: art.co_ubicacion3 || "",
          };
          cardLocations = {
            ...cardLocations,
            [artCode]: locObj,
          };
          cardOriginalLocations = {
            ...cardOriginalLocations,
            [artCode]: { ...locObj, warehouse: newAlma },
          };
        } else {
          const emptyObj = { u1: "", u2: "", u3: "" };
          cardLocations = {
            ...cardLocations,
            [artCode]: emptyObj,
          };
          cardOriginalLocations = {
            ...cardOriginalLocations,
            [artCode]: { ...emptyObj, warehouse: newAlma },
          };
        }
      }
    } catch (e) {
      console.error('[CARD LOCATIONS] Error:', e);
    } finally {
      cardLoadingMap = { ...cardLoadingMap, [artCode]: false };
    }
  }

  async function saveCardLocations(artCode: string, article: any) {
    if (!selectedBranch) {
      toast.error("Selecciona una sucursal");
      return;
    }
    const currentWh = getCardWarehouse(artCode, article);
    if (!currentWh) {
      toast.error("Selecciona un almacén");
      return;
    }
    const locs = getCardLocations(artCode, article);

    cardSavingMap = { ...cardSavingMap, [artCode]: true };
    try {
      const formData = new FormData();
      formData.append('co_art', artCode);
      formData.append('co_alma', currentWh);
      formData.append('branchId', selectedBranch);
      formData.append('co_ubicacion', locs.u1);
      formData.append('co_ubicacion2', locs.u2);
      formData.append('co_ubicacion3', locs.u3);

      const res = await fetch('?/assignLocations', {
        method: 'POST',
        body: formData,
      });

      const raw = await res.text();
      let result: any = null;
      try {
        result = JSON.parse(raw);
      } catch {
        result = { success: res.ok };
      }

      if (res.ok && result?.type !== 'failure') {
        toast.success(`Ubicaciones guardadas para ${artCode}`);
        article.co_ubicacion = locs.u1;
        article.co_ubicacion2 = locs.u2;
        article.co_ubicacion3 = locs.u3;
        cardOriginalLocations = {
          ...cardOriginalLocations,
          [artCode]: { ...locs, warehouse: currentWh },
        };
      } else {
        const errMsg = result?.data?.error || result?.error || "Error al guardar ubicaciones";
        toast.error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
      }
    } catch (e: any) {
      console.error('[SAVE LOCATIONS] Error:', e);
      toast.error(`Error: ${e.message}`);
    } finally {
      cardSavingMap = { ...cardSavingMap, [artCode]: false };
    }
  }
  let isSearching = $state(false);

  let selectedLinea = $state($page.url.searchParams.get("linea") || "");
  let selectedCategoria = $state($page.url.searchParams.get("categoria") || "");
  let selectedUbicacion = $state(
    $page.url.searchParams.get("co_ubicacion") || "",
  );


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

  function handlePrintLabels(format: string = "standard") {
    // Points to printable standalone HTML endpoints
    const endpoint = format === "small" ? "/api/labels/small" : "/api/labels";
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

    <div class="flex items-center gap-3 shrink-0 bg-surface-raised/40 backdrop-blur-xl border border-white/5 rounded-2xl p-1.5 shadow-2xl">
      <!-- Premium Dropdown Selector -->
      <div class="relative flex items-center">
        <select
          bind:value={selectedPrintFormat}
          class="bg-transparent text-text-base text-sm font-black pl-4 pr-10 h-11 rounded-xl outline-none cursor-pointer appearance-none relative min-w-[210px] hover:text-brand-400 transition-colors"
          style="background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23a1a1aa%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E'); background-repeat: no-repeat; background-position: right 14px top 50%; background-size: 10px auto;"
        >
          <option value="standard" class="bg-[#18181b] text-text-base font-bold py-2">Etiquetas Estándar</option>
          <option value="small" class="bg-[#18181b] text-text-base font-bold py-2">Etiquetas Pequeñas (6x3)</option>
        </select>
      </div>

      <!-- Single Primary Action Button with Printer Icon -->
      <button
        onclick={() => handlePrintLabels(selectedPrintFormat)}
        class="h-11 px-6 bg-brand-600 hover:bg-brand-500 border border-brand-500/30 text-white rounded-xl font-bold transition-all active:scale-95 flex items-center gap-2.5 shadow-lg shadow-brand-600/25 group"
        title={selectedCodes.size > 0
          ? `Imprimir ${selectedCodes.size} etiqueta(s) seleccionada(s)`
          : "Imprimir todas las etiquetas filtradas (hasta 500)"}
      >
        <Printer
          size={18}
          class="text-white group-hover:scale-110 transition-transform"
        />
        <span>Imprimir</span>
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
          placeholder="Buscar código, descripción o referencia..."
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
    {#if ubicacionesOptions.length > 0}
      <div class="w-full">
        <Combobox
          options={ubicacionesOptions}
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
        {@const currentWh = getCardWarehouse(artCode, article)}
        {@const locs = getCardLocations(artCode, article)}
        {@const isModified = hasCardChanges(artCode, article)}
        {@const isSaving = cardSavingMap[artCode] || false}
        {@const isLoadingCard = cardLoadingMap[artCode] || false}

        <div
          class="glass p-6 rounded-3xl border transition-all hover:shadow-2xl flex flex-col gap-4 select-none
            {isSelected
            ? 'border-brand-500/60 shadow-brand-500/10 bg-brand-500/5'
            : 'border-white/5 hover:border-brand-500/30 hover:shadow-brand-500/5'}"
        >
          <div class="flex justify-between items-start relative group">
            <button
              type="button"
              onclick={() => toggleArticle(artCode)}
              class="h-12 w-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer active:scale-95
                {isSelected
                ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                : 'bg-brand-500/10 text-brand-500 hover:bg-brand-500/20'}"
              title={isSelected ? "Deseleccionar artículo" : "Seleccionar artículo para impresión"}
            >
              {#if isSelected}
                <CheckSquare size={22} />
              {:else}
                <Square size={22} />
              {/if}
            </button>
            <span
              class="px-2.5 py-1 rounded-lg bg-surface-base border border-border-subtle text-xs font-mono text-text-muted"
            >
              {artCode || "N/A"}
            </span>
          </div>

          <div class="mt-1 text-sm">
            <h3 class="text-lg font-bold leading-tight mb-1 text-text-base">
              {article.art_des ||
                article.descripcion ||
                article.name ||
                "Sin título"}
            </h3>
            {#if article.referencia || article.ref}
              <div class="text-[11px] text-text-muted mb-3 font-mono">
                REF: <span class="font-bold text-text-primary">{article.referencia || article.ref}</span>
              </div>
            {:else}
              <div class="h-2 font-mono"></div>
            {/if}

            <div class="flex flex-col gap-2.5 mt-2 mb-2">
              <!-- 1. Almacén Combobox -->
              <div class="space-y-1">
                <label
                  class="text-[10px] uppercase font-black tracking-widest text-brand-400 ml-0.5"
                  >Almacén / Depósito Profit</label
                >
                <Combobox
                  options={warehouseOptions}
                  value={currentWh}
                  placeholder="-- Seleccionar Almacén --"
                  icon={Package}
                  buttonClass="h-11 rounded-xl text-xs bg-surface-base/60 border border-white/5"
                  class="w-full"
                  onchange={(val) => onCardWarehouseChange(artCode, val, article)}
                />
              </div>

              <!-- 2. Location Selectors -->
              {#if isLoadingCard}
                <div class="flex items-center justify-center gap-2 py-8 text-brand-400 bg-surface-base/30 rounded-2xl border border-white/5">
                  <span class="animate-spin text-base">⟳</span>
                  <span class="text-xs font-bold">Cargando ubicaciones...</span>
                </div>
              {:else}
                <!-- Ubicación Principal -->
                <div class="space-y-1">
                  <label class="text-[10px] uppercase font-black tracking-widest text-text-muted ml-0.5">Ubicación Principal</label>
                  <Combobox
                    options={ubicacionesOptions}
                    value={locs.u1}
                    placeholder="-- Ninguna --"
                    allLabel="-- Ninguna --"
                    icon={MapPin}
                    buttonClass="h-11 rounded-xl text-xs bg-surface-base/60 border border-white/5"
                    class="w-full"
                    onopen={ensureUbicacionesLoaded}
                    loading={isLoadingUbicaciones}
                    onchange={(val) => updateCardLocation(artCode, article, 'u1', val)}
                  />
                </div>

                <!-- Ubicación Secundaria -->
                <div class="space-y-1">
                  <label class="text-[10px] uppercase font-black tracking-widest text-text-muted ml-0.5">Ubicación Secundaria</label>
                  <Combobox
                    options={ubicacionesOptions}
                    value={locs.u2}
                    placeholder="-- Ninguna --"
                    allLabel="-- Ninguna --"
                    icon={MapPin}
                    buttonClass="h-11 rounded-xl text-xs bg-surface-base/60 border border-white/5"
                    class="w-full"
                    onopen={ensureUbicacionesLoaded}
                    loading={isLoadingUbicaciones}
                    onchange={(val) => updateCardLocation(artCode, article, 'u2', val)}
                  />
                </div>

                <!-- Ubicación Terciaria -->
                <div class="space-y-1">
                  <label class="text-[10px] uppercase font-black tracking-widest text-text-muted ml-0.5">Ubicación Terciaria</label>
                  <Combobox
                    options={ubicacionesOptions}
                    value={locs.u3}
                    placeholder="-- Ninguna --"
                    allLabel="-- Ninguna --"
                    icon={MapPin}
                    buttonClass="h-11 rounded-xl text-xs bg-surface-base/60 border border-white/5"
                    class="w-full"
                    onopen={ensureUbicacionesLoaded}
                    loading={isLoadingUbicaciones}
                    onchange={(val) => updateCardLocation(artCode, article, 'u3', val)}
                  />
                </div>
              {/if}

              <!-- 3. Botón Guardar Ubicaciones -->
              {#if canUpdate}
                <button
                  type="button"
                  onclick={() => saveCardLocations(artCode, article)}
                  disabled={isSaving || !currentWh || isLoadingCard}
                  class="mt-1 w-full h-11 font-bold rounded-xl transition-all text-xs active:scale-95 flex items-center justify-center gap-2 shadow-md
                    {isSaving
                      ? 'bg-brand-500/30 text-brand-300 cursor-wait'
                      : !currentWh
                        ? 'bg-white/5 text-text-muted/40 cursor-not-allowed'
                        : isModified
                          ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-500/25 border border-brand-500/40'
                          : 'bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/20'}"
                >
                  {#if isSaving}
                    <span class="animate-spin text-sm">⟳</span>
                    <span>Guardando...</span>
                  {:else if isModified}
                    <Save size={15} />
                    <span>Guardar Cambios</span>
                  {:else}
                    <Save size={15} />
                    <span>Guardar Ubicaciones</span>
                  {/if}
                </button>
              {/if}
            </div>
          </div>

          <div
            class="mt-auto pt-4 border-t border-white/5 flex flex-col gap-2"
          >
            <span
              class="text-[10px] uppercase font-black tracking-widest text-text-muted mb-1"
              >Existencia por Almacén</span
            >

            {#if article.disponibilidad && Array.isArray(article.disponibilidad)}
              {#each article.disponibilidad.filter((alm: any) => !data.context?.finalWarehouseIds?.length || (data.context?.finalWarehouseIds || []).includes(alm?.co_alma)) as alm}
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
        </div>
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

