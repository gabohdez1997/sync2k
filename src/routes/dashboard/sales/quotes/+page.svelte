<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fade } from 'svelte/transition';
  import { Package, Search, Store, Box,    AlertCircle,
    ShoppingBag,
    ShoppingCart,
    ArrowDownAZ,
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

  let sortOption = $state<"relevance" | "asc" | "desc">($page.url.searchParams.get('sort') as any || "relevance");

  // Toggles de vista y orden
  let showUSD = $state(true);

  // Estado del Carrito y Cantidades
  let quantities = $state<Record<string, number>>({});
  // Almacen seleccionado temporal para este artículo (por defecto el que tenga mas stock o el primero)
  let selectedItemWarehouse = $state<Record<string, string>>({});  
  let cart = $state<any[]>([]);

  // Computado de artículos filtrados (ya vienen ordenados del server)
  const displayArticles = $derived(() => {
    return (data.articles || []).filter((a: any, i: number, ar: any[]) => 
      ar.findIndex(b => (b.co_art || b.codigo) === (a.co_art || a.codigo)) === i
    );
  });

  function addToCart(article: any) {
    const co_art = article.co_art || article.codigo || article.id;
    const qty = quantities[co_art] || 1;
    
    // Obtener almacén seleccionado
    const almId = selectedItemWarehouse[co_art] || (() => {
        // Fallback: seleccionar el almacen con mayor stock si no se eligió manualmente
        const disp = article.disponibilidad || [];
        if (!disp.length) return null;
        let maxAlm = disp[0];
        for (let a of disp) {
            if ((a.stock || a.cant_stock || 0) > (maxAlm.stock || maxAlm.cant_stock || 0)) maxAlm = a;
        }
        return maxAlm.co_alma;
    })();

    if (!almId) {
        toast.error('No hay disponibilidad en ningún almacén.', { style: 'background: rgba(220, 38, 38, 0.2); color: #ef4444; border-color: rgba(239, 68, 68, 0.4);' });
        return;
    }

    const availableStock = article.disponibilidad?.find((a:any) => a.co_alma === almId)?.stock || 0;

    // Verificar si ya existe en el carrito
    const existingIndex = cart.findIndex(i => (i.co_art || i.codigo || i.id) === co_art && i.co_alma_selected === almId);
    
    const currentCartQty = existingIndex >= 0 ? cart[existingIndex].qty : 0;
    
    if (currentCartQty + qty > availableStock) {
        toast.error(`Stock insuficiente en el almacén seleccionado. Disponible: ${availableStock - currentCartQty}`, { style: 'background: rgba(220, 38, 38, 0.2); color: #ef4444; border-color: rgba(239, 68, 68, 0.4);' });
        return;
    }

    if (existingIndex >= 0) {
       cart[existingIndex].qty += qty;
    } else {
       cart = [...cart, { ...article, qty, co_alma_selected: almId }];
    }
    
    // Resetear cantidad a 1 despues de agregar
    quantities[co_art] = 1;
    toast.success(`Se agregaron ${qty} unid. de ${article.art_des}`);
  }

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
      url.searchParams.set('branch_id', selectedBranch);
    } else {
      url.searchParams.delete('branch_id');
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

    if (sortOption && sortOption !== "relevance") {
      url.searchParams.set('sort', sortOption);
    } else {
      url.searchParams.delete('sort');
    }

    url.searchParams.set('page', '1');
    goto(url.toString(), { keepFocus: true, invalidateAll: true }).finally(() => isSearching = false);
  }
</script>

<div class="flex flex-col gap-8" in:fade>
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Package size={40} class="text-brand-500" />
        Cotizaciones
      </h1>
      <p class="text-text-muted mt-2 text-lg">
        Genera cotizaciones a clientes con precios y disponibilidad en tiempo real.
      </p>
    </div>

    <!-- Controles Menu Derecha -->
    <div class="flex flex-col md:flex-row items-center gap-3 shrink-0 self-start md:self-auto">
      
      <!-- Toggle Ordenamiento Estilo Dropdown -->
      <div class="relative w-full md:w-56 shrink-0 z-10">
        <ArrowDownAZ class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400" size={16} />
        <select 
          bind:value={sortOption}
          onchange={() => handleSearch()}
          class="w-full h-10 bg-surface-base/80 pl-10 pr-10 rounded-xl border border-border-subtle focus:border-brand-500/50 outline-none appearance-none font-bold text-sm cursor-pointer hover:bg-white/5 transition-all text-text-muted hover:text-text-base"
        >
          <option value="relevance">Relevancia</option>
          <option value="desc">Mayor Precio</option>
          <option value="asc">Menor Precio</option>
        </select>
      </div>

      <!-- Toggle Moneda -->
      <div class="flex items-center bg-surface-base border border-border-subtle p-1 rounded-xl shrink-0">
        <button 
          onclick={() => showUSD = true} 
          class={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${showUSD ? 'bg-brand-500 text-white shadow-lg' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
        >
          USD
        </button>
        <button 
          onclick={() => showUSD = false} 
          class={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${!showUSD ? 'bg-brand-500 text-white shadow-lg' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
        >
          Bs.
        </button>
      </div>
    </div>
  </div>

  <!-- SEARCH & FILTERS SECTION -->
  <div class="flex flex-col gap-4 mb-8">
    
    <!-- FIRST ROW: BRANCH, WAREHOUSE, SEARCH AND CART inline -->
    <div class="flex flex-col lg:flex-row gap-4 items-center">

      {#if data.context?.branches && data.context.branches.length > 1}
      <div class="relative w-full lg:w-64 shrink-0">
        <Store class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400" size={18} />
        <select 
          bind:value={selectedBranch}
          onchange={() => handleSearch()}
          class="w-full h-14 bg-surface-base pl-11 pr-10 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none appearance-none font-bold text-sm cursor-pointer hover:bg-white/5 transition-all text-brand-100"
        >
           {#each data.context.branches as branch}
             <option value={branch.id} class="bg-surface-base text-text-base">
               {branch.name}
             </option>
           {/each}
        </select>
      </div>
      {:else if data.context?.branches && data.context.branches.length === 1}
      <div class="h-14 bg-surface-base border border-white/10 rounded-2xl px-6 flex items-center gap-3 shrink-0 mr-2">
        <Store class="text-brand-400" size={18} />
        <span class="font-bold text-sm text-brand-100">{data.context.branches[0].name}</span>
      </div>
      {/if}

      <!-- Search Bar Integrated -->
      <form onsubmit={handleSearch} class="flex-1 relative group w-full">
        <Search class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-brand-500 transition-colors" size={20} />
        <input 
          type="text" 
          placeholder="Buscar por código, descripción, bloque..." 
          bind:value={searchTerm}
          class="w-full h-14 bg-surface-base pl-12 pr-28 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none transition-all font-medium text-text-base"
        />
        <button
          type="submit"
          disabled={isSearching}
          class="absolute right-2 top-1/2 -translate-y-1/2 bg-white/5 hover:bg-white/10 disabled:opacity-50 px-5 py-2 rounded-xl text-sm font-bold transition-all text-text-base"
        >
          {isSearching ? "..." : "Buscar"}
        </button>
      </form>

      <!-- Inline Cart Button -->
      <button
        class={`h-14 shrink-0 flex items-center justify-center gap-3 px-6 rounded-2xl font-black transition-all border ${cart.length > 0 ? 'bg-brand-600 border-brand-500 hover:bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'bg-surface-base border-white/5 text-text-muted opacity-50 cursor-not-allowed'}`}
        disabled={cart.length === 0}
      >
        <div class="relative">
          <ShoppingCart size={20} />
          {#if cart.length > 0}
            <span class="absolute -top-3 -right-3 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold border-2 border-surface-raised shadow-md">
              {cart.reduce((sum, item) => sum + item.qty, 0)}
            </span>
          {/if}
        </div>
        <span class="hidden md:inline whitespace-nowrap">Ver Cotización</span>
      </button>

    </div>

    <!-- SECOND ROW: LINEA, CATEGORIA -->
    <div class="flex flex-col md:flex-row gap-4">
      <!-- WAREHOUSE SELECTOR -->
      {#if data.context?.warehouses && data.context.warehouses.length > 0}
      <div class="relative w-full md:w-64 shrink-0">
        <Package class="absolute left-4 top-1/2 -translate-y-1/2 text-brand-400" size={16} />
        <select 
          bind:value={selectedWarehouse}
          onchange={() => handleSearch()}
          class="w-full h-12 bg-surface-base/50 pl-11 pr-10 rounded-xl border border-white/5 focus:border-brand-500/50 outline-none appearance-none text-xs font-bold text-text-muted cursor-pointer hover:bg-white/5 transition-all"
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
  {#if data.error}
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
      {#each displayArticles() as article}
        <div class="glass p-6 rounded-3xl border border-white/5 hover:border-brand-500/30 transition-all hover:shadow-2xl hover:shadow-brand-500/5 flex flex-col gap-4">
          
          <div class="flex justify-between items-start relative group">
            <div class="h-12 w-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 overflow-hidden relative">
               <Package size={24} />
            </div>
            <span class="px-2 py-1 rounded-md bg-surface-base border border-border-subtle text-xs font-mono text-brand-400 font-bold">
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
                       <span class="font-black text-base text-brand-400">
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

          <div class="mt-auto pt-4 border-t border-white/5 flex flex-col gap-4">
            <!-- Selector de Almacen -->
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black tracking-widest text-text-muted ml-1">Seleccionar Origen</label>
              <select 
                bind:value={selectedItemWarehouse[article.co_art || article.codigo || article.id]}
                class="w-full h-10 bg-surface-base/60 border border-white/5 rounded-xl px-3 text-sm font-medium text-text-base outline-none focus:border-brand-500/50 transition-colors"
                onchange={(e) => {
                  const target = e.target as HTMLSelectElement;
                  const selectedVal = target.value;
                  const available = article.disponibilidad?.find((a:any) => a.co_alma === selectedVal)?.stock || 0;
                  const currentInput = quantities[article.co_art || article.codigo || article.id] || 1;
                  // Si tiene un almacen y la cantidad actual es superior a lo que hay en ese almacén, autocorregir.
                  if (currentInput > available && available > 0) {
                     quantities[article.co_art || article.codigo || article.id] = available;
                     toast.info('Cantidad reajustada a disp. máxima del almacén', { style: 'background: rgba(59, 130, 246, 0.2); border-color: rgba(96, 165, 250, 0.4); color: #60a5fa;' });
                  }
                }}
              >
                <!-- Solo mostrar opciones válidas para el dropdown -->
                {#if article.disponibilidad && Array.isArray(article.disponibilidad)}
                  {#each article.disponibilidad.filter((alm: any) => 
                    selectedWarehouse 
                      ? alm.co_alma === selectedWarehouse
                      : (!data.context?.finalWarehouseIds?.length || data.context.finalWarehouseIds.includes(alm.co_alma))
                  ).sort((a: any, b: any) => (b.stock || b.cant_stock || 0) - (a.stock || a.cant_stock || 0)) as alm}
                    <!-- Pre-seleccionar el que tenga mayor stock si no se ha seteado -->
                    <option value={alm.co_alma} selected={selectedItemWarehouse[article.co_art || article.codigo || article.id] ? selectedItemWarehouse[article.co_art || article.codigo || article.id] === alm.co_alma : undefined}>
                      {alm.des_alma} • Disp: {alm.stock ?? alm.cant_stock ?? 0}
                    </option>
                  {/each}
                {:else}
                  <option value="" disabled>Sin stock validado</option>
                {/if}
              </select>
            </div>

            <!-- Controles de Cantidad y Carrito -->
            <div class="flex items-center gap-2 mt-2">
              <div class="flex-1 flex items-center bg-surface-base border border-white/10 rounded-xl overflow-hidden h-12 shrink-0">
                <button 
                  onclick={(e) => {
                    const id = article.co_art || article.codigo || article.id;
                    const current = quantities[id] !== undefined ? quantities[id] : 1;
                    if (current > 1) quantities[id] = current - 1;
                  }}
                  class="w-12 h-full flex items-center justify-center text-text-muted hover:text-white hover:bg-white/5 transition-colors font-black"
                >
                  <Minus size={14} />
                </button>
                <input 
                  type="number" 
                  min="1"
                  value={quantities[article.co_art || article.codigo || article.id] !== undefined ? quantities[article.co_art || article.codigo || article.id] : 1}
                  oninput={(e) => {
                     const id = article.co_art || article.codigo || article.id;
                     const val = parseInt((e.target as HTMLInputElement).value);
                     
                     // Limitar por stock del almacen seleccionado
                     const selAlm = selectedItemWarehouse[id] || (article.disponibilidad?.[0]?.co_alma);
                     const available = article.disponibilidad?.find((a:any) => a.co_alma === selAlm)?.stock || 0;
                     
                     if (isNaN(val) || val < 1) {
                        quantities[id] = 1;
                     } else if (val > available && available > 0) {
                        quantities[id] = available;
                        toast.error(`Solo hay ${available} disponibles en este almacén.`);
                     } else {
                        quantities[id] = val;
                     }
                  }}
                  onblur={(e) => {
                     const id = article.co_art || article.codigo || article.id;
                     if (!quantities[id] || quantities[id] < 1) quantities[id] = 1;
                  }}
                  class="flex-1 w-full h-full bg-transparent text-center font-black text-sm outline-none no-arrows"
                />
                <button 
                  onclick={() => {
                     const id = article.co_art || article.codigo || article.id;
                     const current = quantities[id] !== undefined ? quantities[id] : 1;
                     
                     const selAlm = selectedItemWarehouse[id] || (article.disponibilidad?.[0]?.co_alma);
                     const available = article.disponibilidad?.find((a:any) => a.co_alma === selAlm)?.stock || 0;
                     
                     if (current < available || available === 0) {
                         quantities[id] = current + 1;
                     } else {
                         toast.error(`Solo hay ${available} disponibles en este almacén.`);
                     }
                  }}
                  class="w-12 h-full flex items-center justify-center text-text-muted hover:text-white hover:bg-white/5 transition-colors font-black"
                >
                  <Plus size={14} />
                </button>
              </div>

              <!-- Boton de acción principal -->
              <button
                onclick={() => addToCart(article)}
                class="w-12 h-12 shrink-0 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold flex items-center justify-center transition-all active:scale-95 shadow-md shadow-brand-500/20"
              >
                <ShoppingCart size={20} />
              </button>
            </div>
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

<style>
  /* Esconder flachas de inputs numéricos */
  input[type="number"].no-arrows::-webkit-inner-spin-button,
  input[type="number"].no-arrows::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type="number"].no-arrows {
    -moz-appearance: textfield;
  }
</style>
