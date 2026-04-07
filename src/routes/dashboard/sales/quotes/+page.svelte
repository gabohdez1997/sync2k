<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fade } from 'svelte/transition';
  import { Package, Search, Store, Box,    AlertCircle,
    ShoppingBag,
    Plus,
    Minus,
    ImagePlus,
    ListFilter
  } from "lucide-svelte";
  import { toast } from 'svelte-sonner';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let searchTerm = $state($page.url.searchParams.get('search') || "");
  let isSearching = $state(false);

  let selectedBranch = $state(data.context?.branchId || $page.url.searchParams.get('branch_id') || "");
  let selectedTenant = $state(data.context?.tenantId || $page.url.searchParams.get('tenant_id') || "");
  let selectedWarehouse = $state(data.context?.warehouseId || $page.url.searchParams.get('co_alma') || "");
  let selectedLinea = $state($page.url.searchParams.get('linea') || "");
  let selectedCategoria = $state($page.url.searchParams.get('categoria') || "");

  const filteredCategorias = $derived(
    !selectedLinea 
      ? (data.context?.categorias || []) 
      : (data.context?.categorias || []).filter(c => 
          c.co_cat?.startsWith(parseInt(selectedLinea, 10).toString())
        )
  );

  $effect(() => {
    selectedBranch = data.context?.branchId || $page.url.searchParams.get('branch_id') || "";
    selectedTenant = data.context?.tenantId || $page.url.searchParams.get('tenant_id') || "";
    selectedWarehouse = data.context?.warehouseId || $page.url.searchParams.get('co_alma') || "";
    selectedLinea = $page.url.searchParams.get('linea') || "";
    selectedCategoria = $page.url.searchParams.get('categoria') || "";
  });

  // Ya no necesitamos tasa en el estado global si viene en el artículo,
  // pero mantendremos el toggle de USD/Bs.
  let showUSD = $state(true);

  function handleSearch(e?: Event) {
    if (e) e.preventDefault();
    isSearching = true;
    const url = new URL($page.url);
    if (searchTerm) {
      url.searchParams.set('search', searchTerm);
    } else {
      url.searchParams.delete('search');
    }
    
    if (selectedBranch) {
      // Usamos tanto branch_id como sede_id en los params de la vista por si acaso
      url.searchParams.set('branch_id', selectedBranch);
    } else {
      url.searchParams.delete('branch_id');
    }

    if (selectedTenant) {
      url.searchParams.set('tenant_id', selectedTenant);
    } else {
      url.searchParams.delete('tenant_id');
    }

    if (selectedWarehouse) {
      url.searchParams.set('co_alma', selectedWarehouse);
    } else {
      url.searchParams.delete('co_alma');
    }

    if (selectedLinea) {
      url.searchParams.set('linea', selectedLinea);
    } else {
      url.searchParams.delete('linea');
    }

    if (selectedCategoria) {
      url.searchParams.set('categoria', selectedCategoria);
    } else {
      url.searchParams.delete('categoria');
    }

    url.searchParams.set('page', '1');
    goto(url.toString(), { keepFocus: true }).finally(() => isSearching = false);
  }
</script>

<div class="flex flex-col gap-8" in:fade>
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Package size={40} class="text-brand-500" />
        Catálogo de Artículos
      </h1>
      <p class="text-text-muted mt-2 text-lg">
        Consulta el inventario y disponibilidad en tiempo real.
        {#if data.endpoint}
          <span class="block text-[10px] text-brand-500/50 font-mono mt-1 opacity-50 hover:opacity-100 transition-opacity">
            DEBUG: {data.endpoint}
          </span>
        {/if}
      </p>
    </div>

    <!-- Controles de moneda -->
    <div class="flex items-center bg-surface-base border border-border-subtle p-1 rounded-xl shrink-0 self-start md:self-auto">
      <button 
        onclick={() => showUSD = true} 
        class={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${showUSD ? 'bg-brand-500 text-white shadow-lg' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
      >
        USD
      </button>
      <button 
        onclick={() => showUSD = false} 
        class={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${!showUSD ? 'bg-blue-600 text-white shadow-lg' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
      >
        Bs.
      </button>
    </div>
  </div>

  <!-- SEARCH & FILTERS SECTION -->
  <div class="flex flex-col gap-4 mb-8">
    
    <!-- FIRST ROW: TENANT, BRANCH, WAREHOUSE, SEARCH -->
    <div class="flex flex-col lg:flex-row gap-4 items-center">
      {#if (data.tenants?.length ?? 0) > 1}
      <div class="relative w-full lg:w-72 shrink-0">
        <Box class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400" size={18} />
        <select 
          bind:value={selectedTenant}
          onchange={() => handleSearch()}
          class="w-full h-14 bg-surface-base/80 pl-11 pr-10 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none appearance-none font-bold text-sm cursor-pointer hover:bg-white/5 transition-all text-brand-100"
        >
          <option value="">Seleccionar Empresa...</option>
          {#each data.tenants || [] as t}
            <option value={t.id} class="bg-surface-base text-text-base">{t.name}</option>
          {/each}
        </select>
      </div>
      {:else}
      <div class="h-14 bg-white/5 border border-white/10 rounded-2xl px-6 flex items-center gap-3 shrink-0">
        <Box class="text-brand-400" size={18} />
        <span class="font-bold text-sm text-brand-100">
          {data.tenants?.[0]?.name || data.context?.tenantId || 'Empresa'}
        </span>
      </div>
      {/if}

      {#if data.context?.branches && data.context.branches.length > 0}
      <div class="relative w-full lg:w-64 shrink-0">
        <Store class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400" size={18} />
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
        <Package class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400" size={18} />
        <select 
          bind:value={selectedWarehouse}
          onchange={() => handleSearch()}
          class="w-full h-14 bg-surface-base/80 pl-11 pr-10 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none appearance-none font-bold text-sm cursor-pointer hover:bg-white/5 transition-all text-brand-300"
        >
           <option value="">Todos los Almacenes</option>
           {#each data.context.warehouses as alma}
             <option value={alma.co_alma || alma.id} class="bg-surface-base text-text-base">
                {alma.des_alma || alma.nombre || alma.co_alma || alma.id}
             </option>
           {/each}
        </select>
      </div>
      {/if}

      <div class="relative flex-1 w-full lg:w-auto">
        <Search class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
        <input 
          type="text" 
          bind:value={searchTerm}
          placeholder="Buscar por código, descripción, bloque..."
          class="w-full h-14 bg-surface-base pl-12 pr-4 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none font-medium placeholder:text-text-muted transition-all"
          onkeydown={(e) => e.key === 'Enter' && handleSearch(e)}
        />
      </div>

      <button 
        onclick={() => handleSearch()}
        disabled={isSearching}
        class="h-14 px-8 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-brand-600/20 shrink-0"
      >
        {isSearching ? 'Buscando...' : 'Buscar'}
      </button>
    </div>

    <!-- SECOND ROW: LINEA, CATEGORIA -->
    <div class="flex flex-col md:flex-row gap-4">
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
    <div class="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center gap-4 opacity-70 mt-8">
      <Package size={48} class="text-text-muted/30" />
      <div>
        <h3 class="text-xl font-bold">Selecciona una Empresa</h3>
        <p class="text-text-muted mt-2">Utiliza el menú desplegable superior para elegir la empresa a consultar.</p>
      </div>
    </div>
  {:else if data.error}
    <div class="p-8 rounded-3xl border border-red-500/20 bg-red-500/5 flex flex-col items-center justify-center text-center gap-4 mt-8">
      <div class="h-16 w-16 bg-red-500/10 text-red-500 flex items-center justify-center rounded-2xl">
        <AlertCircle size={32} />
      </div>
      <div>
        <h3 class="text-xl font-bold text-red-500">Error Cargando Artículos</h3>
        <p class="text-text-muted mt-2 max-w-xl mx-auto">{data.error}</p>
      </div>
    </div>
  {:else if data.articles?.length === 0}
    <div class="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center gap-4 opacity-70">
      <Package size={48} class="text-text-muted/30" />
      <div>
        <h3 class="text-xl font-bold">No se encontraron artículos</h3>
        <p class="text-text-muted mt-2">Prueba con otra búsqueda o asegúrate de que el Agente esté en línea.</p>
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {#each data.articles.filter((a, i, arr) => arr.findIndex(b => (b.co_art || b.codigo) === (a.co_art || a.codigo)) === i) as article}
        <div class="glass p-6 rounded-3xl border border-white/5 hover:border-brand-500/30 transition-all hover:shadow-2xl hover:shadow-brand-500/5 flex flex-col gap-4">
          
          <div class="flex justify-between items-start relative group">
            <div class="h-12 w-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 overflow-hidden relative">
               <Box size={24} />
               <input type="file" id={`img-${article.co_art || article.codigo || article.id}`} class="hidden" accept="image/*" onchange={() => toast.info(`Función de subida próxima. Código: ${article.co_art || article.codigo || article.id}`)} />
               <button 
                 onclick={() => document.getElementById(`img-${article.co_art || article.codigo || article.id}`)?.click()}
                 class="absolute inset-0 bg-brand-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                 title="Subir / Actualizar Imagen"
               >
                 <ImagePlus size={18} />
               </button>
            </div>
            <span class="px-2 py-1 rounded-md bg-surface-base border border-border-subtle text-xs font-mono text-text-muted">
              {article.co_art || article.codigo || article.id || 'N/A'}
            </span>
          </div>

          <div class="mt-2 text-sm">
            <h3 class="text-lg font-bold leading-tight mb-4">{article.art_des || article.descripcion || article.name || 'Sin título'}</h3>
            
            <div class="flex flex-col gap-2 mt-3 mb-2">
               {#if article.precios && article.precios.length > 0}
                 <div class="flex flex-col gap-2 w-full">
                   {#each article.precios as price}
                     <div class="flex items-center justify-between bg-surface-base/40 p-3 rounded-2xl border border-white/5 w-full">
                       <span class="text-[10px] text-text-muted uppercase font-black">Precio {price.id_precio}</span>
                       <span class="font-black text-base {showUSD ? 'text-green-400' : 'text-blue-400'}">
                         {#if showUSD}
                           ${price.precio.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                         {:else}
                           {price.precio_ves.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small class="text-[10px]">Bs.</small>
                         {/if}
                       </span>
                     </div>
                   {/each}
                 </div>
               {:else}
                 <span class="text-text-muted/50 italic text-sm">No definido</span>
               {/if}
            </div>
          </div>

          <div class="mt-auto pt-4 border-t border-white/5 flex flex-col gap-2 pointer-events-none">
            <span class="text-[10px] uppercase font-black tracking-widest text-text-muted mb-1">Existencia por Almacén</span>
            
            {#if article.disponibilidad && Array.isArray(article.disponibilidad)}
              {#each article.disponibilidad.filter((alm: any) => 
                selectedWarehouse 
                  ? alm.co_alma === selectedWarehouse
                  : (!data.context?.finalWarehouseIds?.length || data.context.finalWarehouseIds.includes(alm.co_alma))
              ) as alm}
                <div class="flex items-center justify-between py-1 bg-surface-base/50 px-2 rounded-md border border-white/5">
                  <span class="text-xs text-text-muted">{alm.des_alma}</span>
                  <span class="font-bold text-green-400 text-sm">{alm.stock ?? alm.cant_stock ?? 0}</span>
                </div>
              {/each}
            {:else}
              <div class="flex items-center justify-between py-1 bg-surface-base/50 px-2 rounded-md border border-white/5">
                <span class="text-xs text-text-muted">Total (Global)</span>
                <span class="text-lg font-black text-green-400">
                  {article.stock !== undefined ? article.stock : (article.s_actual || '0')}
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
          onclick={() => { const u = new URL($page.url); u.searchParams.set('page', (data.pagination.page - 1).toString()); goto(u.toString()); }}
          class="px-4 py-2 rounded-xl bg-surface-base border border-border-subtle font-bold text-sm disabled:opacity-50 hover:bg-white/5 transition-colors"
        >
          Anterior
        </button>
        <span class="px-4 py-2 rounded-xl bg-brand-500/10 text-brand-500 font-bold border border-brand-500/20 text-sm">
          Pág {data.pagination.page} de {data.pagination.totalPages}
        </span>
        <button 
          disabled={data.pagination.page >= data.pagination.totalPages}
          onclick={() => { const u = new URL($page.url); u.searchParams.set('page', (data.pagination.page + 1).toString()); goto(u.toString()); }}
          class="px-4 py-2 rounded-xl bg-surface-base border border-border-subtle font-bold text-sm disabled:opacity-50 hover:bg-white/5 transition-colors"
        >
          Siguiente
        </button>
      </div>
    {/if}
  {/if}
</div>
