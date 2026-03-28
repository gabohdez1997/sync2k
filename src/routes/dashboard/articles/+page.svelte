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
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: any } = $props();

  $effect(() => {
    if (data.context?.branches) {
      console.log("[SYNC2K] Available Branches (Client):", data.context.branches.map((b: any) => ({ id: b.id.slice(0,4), name: b.name, code: b.co_sucu })));
    }
  });

  let searchTerm = $state($page.url.searchParams.get("search") || "");
  let showModal = $state(false);
  let selectedArticle = $state<any>(null);
  let formUbic1 = $state("");
  let formUbic2 = $state("");
  let formUbic3 = $state("");

  let searchUbic1 = $state("");
  let searchUbic2 = $state("");
  let searchUbic3 = $state("");

  const filteredUbic1 = $derived(
    data.context?.ubicaciones?.filter(u => 
      (`${u.co_ubicacion || u.id} ${u.descripcion || u.name}`).toLowerCase().includes(searchUbic1.toLowerCase())
    ) || []
  );
  const filteredUbic2 = $derived(
    data.context?.ubicaciones?.filter(u => 
      (`${u.co_ubicacion || u.id} ${u.descripcion || u.name}`).toLowerCase().includes(searchUbic2.toLowerCase())
    ) || []
  );
  const filteredUbic3 = $derived(
    data.context?.ubicaciones?.filter(u => 
      (`${u.co_ubicacion || u.id} ${u.descripcion || u.name}`).toLowerCase().includes(searchUbic3.toLowerCase())
    ) || []
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
    
    // Pre-populate branch and warehouse from existing locations if available
    const firstLoc = article.ubicaciones?.[0] || article.existencia?.[0];
    if (firstLoc) {
      if (firstLoc.sede_id) selectedBranch = firstLoc.sede_id;
      if (firstLoc.co_alma) selectedWarehouse = firstLoc.co_alma;
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

  let selectedBranch = $state("");
  let selectedTenant = $state("");
  let selectedWarehouse = $state("");
  let selectedLinea = $state($page.url.searchParams.get("linea") || "");
  let selectedCategoria = $state($page.url.searchParams.get("categoria") || "");
  let selectedUbicacion = $state($page.url.searchParams.get("co_ubicacion") || "");

  let currentWarehouseObj = $derived(
    data.context?.warehouses?.find(w => 
      selectedWarehouse ? (w.co_alma === selectedWarehouse || w.id === selectedWarehouse) : true
    )
  );
  let currentBranchObj = $derived(
    data.context?.branches?.find(b => b.id === selectedBranch)
  );
  let coSucuToSend = $derived(currentBranchObj?.co_sucu || "");
  let coAlmaToSend = $derived(selectedWarehouse || currentWarehouseObj?.co_alma || currentWarehouseObj?.id || "01");

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
    selectedTenant =
      data.context?.tenantId || $page.url.searchParams.get("tenant_id") || "";
    selectedWarehouse =
      data.context?.warehouseId || $page.url.searchParams.get("co_alma") || "";
    selectedLinea = $page.url.searchParams.get("linea") || "";
    selectedCategoria = $page.url.searchParams.get("categoria") || "";
    selectedUbicacion = $page.url.searchParams.get("co_ubicacion") || "";
  });

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

    if (selectedTenant) {
      url.searchParams.set("tenant_id", selectedTenant);
    } else {
      url.searchParams.delete("tenant_id");
    }

    if (selectedWarehouse) {
      url.searchParams.set("co_alma", selectedWarehouse);
    } else {
      url.searchParams.delete("co_alma");
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

    url.searchParams.set("page", "1");
    goto(url.toString(), { keepFocus: true }).finally(
      () => (isSearching = false),
    );
  }
</script>

<div class="flex flex-col gap-8" in:fade>
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <MapPin size={40} class="text-brand-500" />
        Gestión de Ubicaciones
      </h1>
      <p class="text-text-muted mt-2 text-lg">
        Asigna y visualiza las ubicaciones físicas de los artículos en el
        almacén.
        {#if data.articles?.length}
          <span class="block text-[10px] text-brand-500/50 font-mono mt-1">
            Mostrando {data.articles.length} artículos en esta página
          </span>
        {/if}
      </p>
    </div>
  </div>

  <!-- SEARCH & FILTERS SECTION -->
  <div class="flex flex-col gap-4 mb-8">
    <!-- FIRST ROW: TENANT, BRANCH, WAREHOUSE, SEARCH -->
    <div class="flex flex-col lg:flex-row gap-4 items-center">
      {#if (data.tenants?.length ?? 0) > 1}
        <div class="relative w-full lg:w-72 shrink-0">
          <Box
            class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400"
            size={18}
          />
          <select
            bind:value={selectedTenant}
            onchange={() => handleSearch()}
            class="w-full h-14 bg-surface-base/80 pl-11 pr-10 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none appearance-none font-bold text-sm cursor-pointer hover:bg-white/5 transition-all text-brand-100"
          >
            <option value="">Seleccionar Empresa...</option>
            {#each data.tenants || [] as t}
              <option value={t.id} class="bg-surface-base text-text-base"
                >{t.name}</option
              >
            {/each}
          </select>
        </div>
      {:else}
        <div
          class="h-14 bg-white/5 border border-white/10 rounded-2xl px-6 flex items-center gap-3 shrink-0"
        >
          <Box class="text-brand-400" size={18} />
          <span class="font-bold text-sm text-brand-100">
            {data.tenants?.[0]?.name || data.context?.tenantId || "Empresa"}
          </span>
        </div>
      {/if}

      {#if data.context?.branches && data.context.branches.length > 0}
        <div class="relative w-full lg:w-64 shrink-0">
          <Store
            class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400"
            size={18}
          />
          <select
            bind:value={selectedBranch}
            onchange={() => handleSearch()}
            class="w-full h-14 bg-surface-base/80 pl-11 pr-10 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none appearance-none font-bold text-sm cursor-pointer hover:bg-white/5 transition-all text-brand-300"
          >
            {#each data.context.branches as branch}
              <option value={branch.id} class="bg-surface-base text-text-base">
                {branch.name}
              </option>
            {/each}
          </select>
        </div>
      {/if}

      {#if data.context?.warehouses && data.context.warehouses.length > 0}
        <div class="relative w-full lg:w-64 shrink-0">
          <Package
            class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400"
            size={18}
          />
          <select
            bind:value={selectedWarehouse}
            onchange={() => handleSearch()}
            class="w-full h-14 bg-surface-base/80 pl-11 pr-10 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none appearance-none font-bold text-sm cursor-pointer hover:bg-white/5 transition-all text-brand-300"
          >
            <option value="">Todos los Almacenes</option>
            {#each data.context.warehouses as alma}
              <option
                value={alma.co_alma || alma.id}
                class="bg-surface-base text-text-base"
              >
                {alma.des_alma || alma.nombre || alma.co_alma || alma.id}
              </option>
            {/each}
          </select>
        </div>
      {/if}

      <div class="relative flex-1 w-full lg:w-auto">
        <Search
          class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
          size={20}
        />
        <input
          type="text"
          bind:value={searchTerm}
          placeholder="Buscar articulo por código o descripción"
          class="w-full h-14 bg-surface-base pl-12 pr-4 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none font-medium placeholder:text-text-muted transition-all"
          onkeydown={(e) => e.key === "Enter" && handleSearch(e)}
        />
      </div>

      <button
        onclick={() => handleSearch()}
        disabled={isSearching}
        class="h-14 px-8 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-brand-600/20 shrink-0"
      >
        {isSearching ? "Buscando..." : "Buscar"}
      </button>
    </div>

    <!-- SECOND ROW: LINEA, CATEGORIA -->
    <div class="flex flex-col md:flex-row gap-4">
      <!-- UBICACION SELECTOR -->
      {#if data.context?.ubicaciones && data.context.ubicaciones.length > 0}
      <div class="relative w-full md:w-80 shrink-0">
        <MapPin class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400" size={18} />
        <select 
          bind:value={selectedUbicacion}
          onchange={() => handleSearch()}
          class="w-full h-14 bg-surface-base/80 pl-11 pr-10 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none appearance-none font-bold text-sm cursor-pointer hover:bg-white/5 transition-all text-brand-300"
        >
           <option value="">Todas las Ubicaciones</option>
           {#each data.context.ubicaciones as ubic}
             <option value={ubic.id || ubic.co_ubicacion} class="bg-surface-base text-text-base">
                {ubic.descripcion || ubic.name || (ubic.id || ubic.co_ubicacion)}
             </option>
           {/each}
        </select>
      </div>
      {/if}

      <!-- LINEA SELECTOR -->
      {#if data.context?.lineas && data.context.lineas.length > 0}
        <div class="relative w-full md:w-80 shrink-0">
          <ListFilter class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400" size={18} />
          <select
            bind:value={selectedLinea}
            onchange={() => {
              selectedCategoria = "";
              handleSearch();
            }}
            class="w-full h-14 bg-surface-base/80 pl-11 pr-10 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none appearance-none font-bold text-sm cursor-pointer hover:bg-white/5 transition-all text-brand-300"
          >
            <option value="">Todas las Líneas</option>
            {#each data.context.lineas as linea}
              <option value={linea.co_lin} class="bg-surface-base text-text-base">
                {linea.lin_des}
              </option>
            {/each}
          </select>
        </div>
      {/if}

      <!-- CATEGORIA SELECTOR -->
      {#if filteredCategorias && filteredCategorias.length > 0}
        <div class="relative w-full md:w-80 shrink-0">
          <ListFilter class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400" size={18} />
          <select
            bind:value={selectedCategoria}
            onchange={() => handleSearch()}
            class="w-full h-14 bg-surface-base/80 pl-11 pr-10 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none appearance-none font-bold text-sm cursor-pointer hover:bg-white/5 transition-all text-brand-300"
          >
            <option value="">Todas las Categorías</option>
            {#each filteredCategorias as cat}
              <option value={cat.co_cat} class="bg-surface-base text-text-base">
                {cat.cat_des}
              </option>
            {/each}
          </select>
        </div>
      {/if}
    </div>
  </div>

  <!-- Resultados -->
  {#if data.requireTenantSelection}
    <div
      class="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center gap-4 opacity-70 mt-8"
    >
      <Package size={48} class="text-text-muted/30" />
      <div>
        <h3 class="text-xl font-bold">Selecciona una Empresa</h3>
        <p class="text-text-muted mt-2">
          Utiliza el menú desplegable superior para elegir la empresa a
          consultar.
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
    <div
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
    >
      {#each data.articles.filter((a, i, arr) => arr.findIndex((b) => (b.co_art || b.codigo) === (a.co_art || a.codigo)) === i) as article}
        <div
          class="glass p-6 rounded-3xl border border-white/5 hover:border-brand-500/30 transition-all hover:shadow-2xl hover:shadow-brand-500/5 flex flex-col gap-4"
        >
          <div class="flex justify-between items-start relative group">
            <div
              class="h-12 w-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500"
            >
              <MapPin size={24} />
            </div>
            <span
              class="px-2 py-1 rounded-md bg-surface-base border border-border-subtle text-xs font-mono text-text-muted"
            >
              {article.co_art || article.codigo || article.id || "N/A"}
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
                  <span class="font-bold text-sm text-text-base"
                    >{article.co_ubicacion || "Ninguna"}</span
                  >
                </div>
                <div
                  class="flex items-center justify-between bg-surface-base/40 p-2 rounded-xl border border-white/5"
                >
                  <span class="text-[10px] text-text-muted uppercase font-bold"
                    >Secundaria</span
                  >
                  <span class="font-bold text-sm text-text-base"
                    >{article.co_ubicacion2 || "Ninguna"}</span
                  >
                </div>
                <div
                  class="flex items-center justify-between bg-surface-base/40 p-2 rounded-xl border border-white/5"
                >
                  <span class="text-[10px] text-text-muted uppercase font-bold"
                    >Terciaria</span
                  >
                  <span class="font-bold text-sm text-text-base"
                    >{article.co_ubicacion3 || "Ninguna"}</span
                  >
                </div>
              </div>

              <button
                onclick={() => openLocationModal(article)}
                class="mt-3 w-full py-2 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 font-bold rounded-xl transition-colors border border-brand-500/20 text-sm"
              >
                Modificar Ubicaciones
              </button>
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
              {#each article.disponibilidad.filter( (alm: any) => (selectedWarehouse ? alm.co_alma === selectedWarehouse : !data.context?.finalWarehouseIds?.length || data.context.finalWarehouseIds.includes(alm.co_alma)), ) as alm}
                <div
                  class="flex items-center justify-between py-1 bg-surface-base/50 px-2 rounded-md border border-white/5"
                >
                  <span class="text-xs text-text-muted">{alm.des_alma}</span>
                  <span class="font-bold text-green-400 text-sm"
                    >{alm.stock ?? alm.cant_stock ?? 0}</span
                  >
                </div>
              {/each}
            {:else}
              <div
                class="flex items-center justify-between py-1 bg-surface-base/50 px-2 rounded-md border border-white/5"
              >
                <span class="text-xs text-text-muted">Total (Global)</span>
                <span class="text-lg font-black text-green-400">
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
        <input type="hidden" name="co_art" value={selectedArticle.co_art || selectedArticle.codigo} />
        <input type="hidden" name="tenantId" value={selectedTenant} />
        <input type="hidden" name="co_alma" value={coAlmaToSend} />
        <input type="hidden" name="co_sucu" value={coSucuToSend} />
        <input type="hidden" name="sede_id" value={selectedBranch} />
        <input type="hidden" name="sede_name" value={currentBranchObj?.name || ""} />

        {#if form && typeof form === 'object' && 'error' in form}
          <div class="p-4 mb-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-sm flex flex-col gap-2">
            <div class="flex items-center gap-2 font-bold">
              <Plus class="rotate-45" size={16} />
              {(form as any).error}
            </div>
            {#if (form as any).detail}
              <div class="text-[10px] font-mono bg-black/20 p-2 rounded-lg opacity-80 break-all max-h-24 overflow-auto">
                {(form as any).detail}
              </div>
            {/if}
          </div>
        {/if}

        <!-- SELECTOR DE SEDE/SUCURSAL (OBLIGATORIO) -->
        <div class="space-y-1">
          <label for="formSede" class="text-[10px] uppercase font-black tracking-widest text-brand-400 ml-1">Sucursal / Sede Profit</label>
          <div class="relative">
            <Store class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400" size={18} />
            <select 
              id="formSede"
              bind:value={selectedBranch}
              required
              class="w-full h-12 bg-surface-raised border border-white/10 rounded-xl pl-12 pr-4 text-sm font-medium focus:border-brand-500 transition-colors cursor-pointer"
            >
              <option value="">-- Seleccionar Sucursal --</option>
              {#each data.context?.branches || [] as branch}
                <option value={branch.id}>{branch.name}</option>
              {/each}
            </select>
          </div>
        </div>

        <div class="space-y-4">
          <!-- UBICACION 1 -->
          <div class="space-y-1">
            <label for="formUbic1" class="text-[10px] uppercase font-black tracking-widest text-text-muted ml-1">Ubicación Principal</label>
            <div class="flex flex-col gap-1">
              <input 
                type="text" 
                bind:value={searchUbic1} 
                placeholder="Filtrar ubicaciones..." 
                class="w-full h-9 bg-white/5 border border-white/5 rounded-xl px-3 text-[11px] outline-none focus:border-brand-500/30 transition-colors"
              />
              <select id="formUbic1" name="co_ubicacion" bind:value={formUbic1} class="w-full h-12 bg-surface-raised border border-white/10 rounded-xl px-4 text-sm font-medium focus:border-brand-500 transition-colors cursor-pointer">
                <option value="">-- Ninguna --</option>
                {#each filteredUbic1 as ubic}
                   <option value={ubic.id || ubic.co_ubicacion}>
                      {ubic.co_ubicacion || ubic.id} - {ubic.descripcion || ubic.name}
                   </option>
                {/each}
              </select>
            </div>
          </div>

          <!-- UBICACION 2 -->
          <div class="space-y-1">
            <label for="formUbic2" class="text-[10px] uppercase font-black tracking-widest text-text-muted ml-1">Ubicación Secundaria</label>
            <div class="flex flex-col gap-1">
              <input 
                type="text" 
                bind:value={searchUbic2} 
                placeholder="Filtrar ubicaciones..." 
                class="w-full h-9 bg-white/5 border border-white/5 rounded-xl px-3 text-[11px] outline-none focus:border-brand-500/30 transition-colors"
              />
              <select id="formUbic2" name="co_ubicacion2" bind:value={formUbic2} class="w-full h-12 bg-surface-raised border border-white/10 rounded-xl px-4 text-sm font-medium focus:border-brand-500 transition-colors cursor-pointer">
                <option value="">-- Ninguna --</option>
                {#each filteredUbic2 as ubic}
                   <option value={ubic.id || ubic.co_ubicacion}>
                      {ubic.co_ubicacion || ubic.id} - {ubic.descripcion || ubic.name}
                   </option>
                {/each}
              </select>
            </div>
          </div>

          <!-- UBICACION 3 -->
          <div class="space-y-1">
            <label for="formUbic3" class="text-[10px] uppercase font-black tracking-widest text-text-muted ml-1">Ubicación Terciaria</label>
            <div class="flex flex-col gap-1">
              <input 
                type="text" 
                bind:value={searchUbic3} 
                placeholder="Filtrar ubicaciones..." 
                class="w-full h-9 bg-white/5 border border-white/5 rounded-xl px-3 text-[11px] outline-none focus:border-brand-500/30 transition-colors"
              />
              <select id="formUbic3" name="co_ubicacion3" bind:value={formUbic3} class="w-full h-12 bg-surface-raised border border-white/10 rounded-xl px-4 text-sm font-medium focus:border-brand-500 transition-colors cursor-pointer">
                <option value="">-- Ninguna --</option>
                {#each filteredUbic3 as ubic}
                   <option value={ubic.id || ubic.co_ubicacion}>
                      {ubic.co_ubicacion || ubic.id} - {ubic.descripcion || ubic.name}
                   </option>
                {/each}
              </select>
            </div>
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
