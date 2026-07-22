<!-- src/routes/dashboard/warehouse/transfers/new/+page.svelte -->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { 
    ArrowRightLeft, Plus, Minus, Search, Trash2, Store, 
    Box, Check, AlertCircle, RefreshCw, ChevronRight, ChevronLeft, ChevronDown,
    ShoppingBag, Package, Clock, Tag, Layers, Loader2, ShoppingCart
  } from "lucide-svelte";
  import { fade, slide, scale } from "svelte/transition";
  import { toast } from "svelte-sonner";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";

  let { data, form } = $props();

  // --- ESTADO DE PASOS ---
  let activeTab = $state(0); // 0: Sedes, 1: Artículos, 2: Confirmación

  // --- FORMULARIO PRINCIPAL ---
  let sourceBranchId = $state(data.userBranchId || (data.branches[0]?.id ?? ''));
  let targetBranchId = $state('');
  let motivo = $state('Traslado de inventario entre sedes');

  // --- BUSQUEDA Y FILTROS DE ARTICULOS (EXACTO A COTIZACIONES) ---
  let searchTerm = $state('');
  let selectedLinea = $state('');
  let selectedCategoria = $state('');
  let loadingArticles = $state(false);
  let localArticles = $state<any[]>([]);
  let localPagination = $state({ total: 0, page: 1, limit: 24, totalPages: 0 });

  // Filtrar categorías según la línea seleccionada (EXACTO A COTIZACIONES)
  const filteredCategorias = $derived(
    !selectedLinea
      ? (data.context?.categorias || [])
      : (data.context?.categorias || []).filter((c: any) =>
          c.co_cat?.startsWith(parseInt(selectedLinea, 10).toString())
        )
  );

  // Almacén y cantidad seleccionados por artículo en las cards
  let selectedWarehouses = $state<Record<string, string>>({});
  let qtyPerArticle = $state<Record<string, number>>({});

  // --- CARRITO / ARTICULOS SELECCIONADOS ---
  let selectedItems = $state<any[]>([]);
  let isSubmitting = $state(false);

  // === FETCH ARTICLES (REPLICADO DE COTIZACIONES) ===
  async function fetchArticles() {
    if (!sourceBranchId) return;
    loadingArticles = true;
    try {
      const params = new URLSearchParams();
      params.set('branch_id', sourceBranchId);
      params.set('limit', '24');
      params.set('page', String(localPagination.page || 1));
      params.set('sort', 'default');

      if (searchTerm?.trim()) params.set('search', searchTerm.trim());
      if (selectedLinea) params.set('linea', selectedLinea);
      if (selectedCategoria) params.set('categoria', selectedCategoria);

      const res = await fetch(`/api/agent/articles?${params.toString()}`);
      const d = await res.json();
      if (d.success) {
        localArticles = d.data || [];
        localPagination = d.pagination || localPagination;
      } else {
        localArticles = [];
      }
    } catch (e) {
      console.error("Error fetching articles:", e);
      localArticles = [];
    } finally {
      loadingArticles = false;
    }
  }

  // Deduplicar artículos (EXACTO A COTIZACIONES)
  const displayArticles = $derived.by(() => {
    if (!localArticles || localArticles.length === 0) return [];
    return localArticles.filter(
      (a: any, i: number, ar: any[]) =>
        ar.findIndex((b) => (b.co_art || b.codigo) === (a.co_art || a.codigo)) === i
    );
  });

  function isDecimalAllowed(article: any) {
    if (!article) return false;
    const configStr = String(data.selectedBranchConfig?.allow_decimals_units || 'MTS, MTS2, KG, M, MT, M2, M3');
    const allowed = configStr.split(',').map((s: string) => s.trim().toUpperCase());
    const co_uni = String(article?.co_uni || '').trim().toUpperCase();
    const unidad = String(article?.unidad || article?.uni_venta || '').trim().toUpperCase();
    return allowed.some(a => a && (co_uni.includes(a) || unidad.includes(a)));
  }

  function getStep(article: any) {
    return isDecimalAllowed(article) ? 0.5 : 1;
  }

  // Inicializar estados para nuevos artículos (EXACTO A COTIZACIONES)
  $effect(() => {
    if (localArticles && localArticles.length > 0) {
      localArticles.forEach((art) => {
        const co = (art.co_art || art.codigo || '').trim();
        if (!co) return;
        const step = getStep(art);
        if (qtyPerArticle[co] === undefined || qtyPerArticle[co] < step) {
          qtyPerArticle[co] = step;
        }
        if (selectedWarehouses[co] === undefined && art.disponibilidad?.length > 0) {
          selectedWarehouses[co] = art.disponibilidad[0].co_alma;
        }
      });
    }
  });

  // Carga reactiva al entrar a la pestaña de artículos
  $effect(() => {
    if (activeTab === 1 && sourceBranchId && localArticles.length === 0 && !loadingArticles) {
      fetchArticles();
    }
  });

  // handleSearch: disparar búsqueda (EXACTO A COTIZACIONES)
  function handleSearch(e?: Event) {
    if (e) e.preventDefault();
    localPagination.page = 1;
    fetchArticles();
  }

  function addItem(article: any) {
    const code = (article.co_art || article.codigo || '').trim();
    const almaCode = selectedWarehouses[code] || article.disponibilidad?.[0]?.co_alma || '01';
    const curAlm = article.disponibilidad?.find((a: any) => a.co_alma === almaCode) || article.disponibilidad?.[0];
    const currentStock = Number(curAlm?.stock ?? article.stock_global ?? article.stock ?? 0);
    const step = getStep(article);
    const qtyToAdd = qtyPerArticle[code] || step;

    const existingIndex = selectedItems.findIndex(i => i.co_art === code && i.co_alma_source === almaCode);
    if (existingIndex >= 0) {
      const newQty = selectedItems[existingIndex].total_art + qtyToAdd;
      if (currentStock > 0 && newQty > currentStock) {
        toast.error(`Stock insuficiente. Disponible en origen: ${currentStock}`);
        return;
      }
      selectedItems[existingIndex].total_art = newQty;
      toast.success(`Actualizado: ${code} (Cantidad: ${newQty})`);
    } else {
      if (currentStock > 0 && qtyToAdd > currentStock) {
        toast.error(`Stock insuficiente. Disponible en origen: ${currentStock}`);
        return;
      }
      selectedItems.push({
        co_art: code,
        art_des: (article.art_des || article.descripcion || '').trim(),
        stock_origen: currentStock,
        co_alma_source: almaCode,
        co_alma_target: '01',
        total_art: qtyToAdd,
        costo_unit: Number(article.costo || 0)
      });
      toast.success(`Agregado al traslado: ${code}`);
    }
  }

  function removeItem(index: number) {
    selectedItems.splice(index, 1);
  }

  // --- VALIDACIONES DE NAVEGACION ---
  function goToStep(step: number) {
    if (step === 1) {
      if (!sourceBranchId || !targetBranchId) {
        toast.error('Debe seleccionar Sede Origen y Sede Destino.');
        return;
      }
      if (sourceBranchId === targetBranchId) {
        toast.error('La Sede Origen y la Sede Destino no pueden ser la misma.');
        return;
      }
    } else if (step === 2) {
      if (selectedItems.length === 0) {
        toast.error('Debe incluir al menos un artículo en el traslado.');
        return;
      }
    }
    activeTab = step;
  }

  let totalUnits = $derived.by(() => {
    return selectedItems.reduce((acc, item) => acc + Number(item.total_art || 0), 0);
  });

  let isFormValid = $derived.by(() => {
    return sourceBranchId && 
           targetBranchId && 
           sourceBranchId !== targetBranchId && 
           selectedItems.length > 0 && 
           selectedItems.every(i => i.total_art > 0);
  });

  let sourceBranchName = $derived.by(() => {
    return data.branches.find((b: any) => b.id === sourceBranchId)?.name || '---';
  });

  let targetBranchName = $derived.by(() => {
    return data.branches.find((b: any) => b.id === targetBranchId)?.name || '---';
  });
</script>

<svelte:head>
  <title>{data.title} — GalpeApp</title>
</svelte:head>

<div class="flex flex-col gap-8 min-h-svh pb-20" in:fade={{ duration: 150 }}>

  <!-- HEADER CON BOTÓN DE HISTORIAL (ESTILO EXACTO A COTIZACIONES) -->
  <div class="w-full max-w-6xl mx-auto px-4 mt-6 flex flex-col md:flex-row justify-between md:items-center gap-4">
    <div class="flex flex-col gap-2">
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3 text-text-base">
        <ArrowRightLeft size={40} class="text-brand-500" />
        Nuevo Traslado
      </h1>
      <p class="text-text-muted text-lg">
        Generar nuevo traslado de mercancía entre sedes
      </p>
    </div>

    <a
      href="/dashboard/warehouse/transfers"
      class="flex items-center justify-center gap-2 px-5 py-3 h-14 rounded-2xl bg-surface-soft hover:bg-surface-strong text-text-base border border-border-subtle transition-all font-bold active:scale-95 shadow-sm shrink-0 w-full md:w-auto"
    >
      <Clock size={18} class="text-brand-500" />
      Ver Historial
    </a>
  </div>

  <!-- STEP PROGRESS INDICATOR (SIN NUMEROS, EXACTO A COTIZACIONES) -->
  <div class="w-full max-w-4xl mx-auto px-4 mt-2">
    <div class="flex items-center justify-between relative">
      <!-- Linea Conectora -->
      <div class="absolute left-0 top-1/2 -translate-y-1/2 w-full h-[2px] bg-surface-soft z-0"></div>
      <div 
        class="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] bg-brand-500 transition-all duration-500 z-0"
        style="width: {activeTab === 0 ? '0%' : activeTab === 1 ? '50%' : '100%'}"
      ></div>

      <!-- Step 1: Sedes -->
      <button 
        type="button"
        onclick={() => goToStep(0)} 
        class="relative z-10 flex flex-col items-center gap-2 group cursor-pointer"
      >
        <div class="h-12 w-12 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 {activeTab >= 0 ? 'bg-brand-600 border-brand-500 shadow-lg shadow-brand-500/20 text-white' : 'bg-surface-base border-border-subtle text-text-muted'}">
          <Store size={20} />
        </div>
        <span class="text-[10px] font-black uppercase tracking-widest {activeTab === 0 ? 'text-brand-400' : 'text-text-muted'}">
          SEDES
        </span>
      </button>

      <!-- Step 2: Artículos -->
      <button 
        type="button"
        onclick={() => goToStep(1)} 
        class="relative z-10 flex flex-col items-center gap-2 group cursor-pointer"
      >
        <div class="h-12 w-12 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 {activeTab >= 1 ? 'bg-brand-600 border-brand-500 shadow-lg shadow-brand-500/20 text-white' : 'bg-surface-base border-border-subtle text-text-muted'}">
          <Package size={20} />
        </div>
        <span class="text-[10px] font-black uppercase tracking-widest {activeTab === 1 ? 'text-brand-400' : 'text-text-muted'}">
          ARTÍCULOS
        </span>
      </button>

      <!-- Step 3: Confirmación -->
      <button 
        type="button"
        onclick={() => goToStep(2)} 
        class="relative z-10 flex flex-col items-center gap-2 group cursor-pointer"
      >
        <div class="h-12 w-12 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 {activeTab >= 2 ? 'bg-brand-600 border-brand-500 shadow-lg shadow-brand-500/20 text-white' : 'bg-surface-base border-border-subtle text-text-muted'}">
          <Check size={20} />
        </div>
        <span class="text-[10px] font-black uppercase tracking-widest {activeTab === 2 ? 'text-brand-400' : 'text-text-muted'}">
          CONFIRMAR
        </span>
      </button>
    </div>
  </div>

  {#if form?.error}
    <div class="max-w-4xl mx-auto px-4 w-full">
      <div class="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3 text-red-400 font-bold text-sm">
        <AlertCircle size={20} class="shrink-0" />
        {form.error}
      </div>
    </div>
  {/if}

  <form 
    method="POST" 
    use:enhance={() => {
      isSubmitting = true;
      return async ({ update }) => {
        isSubmitting = false;
        await update();
      };
    }} 
    class="w-full max-w-6xl mx-auto px-4 space-y-8"
  >
    <input type="hidden" name="source_branch_id" value={sourceBranchId} />
    <input type="hidden" name="target_branch_id" value={targetBranchId} />
    <input type="hidden" name="motivo" value={motivo} />
    <input type="hidden" name="items" value={JSON.stringify(selectedItems)} />

    <!-- ========================================== -->
    <!-- PASO 1: SELECCION DE SEDES Y MOTIVO        -->
    <!-- ========================================== -->
    {#if activeTab === 0}
      <div class="space-y-6 max-w-4xl mx-auto" transition:fade={{ duration: 150 }}>
        
        <!-- SUBTITULOS FUERA DE LA CARD -->
        <div class="text-center space-y-2">
          <h2 class="text-3xl font-black text-text-base">Configuración de Sedes</h2>
          <p class="text-text-muted text-sm max-w-md mx-auto">Selecciona la sede de origen desde donde sale la mercancía y la sede de destino.</p>
        </div>

        <!-- CARD CON INPUTS EXCLUSIVAMENTE -->
        <div class="glass p-8 md:p-10 rounded-[32px] border border-white/5 shadow-2xl space-y-6 relative z-30">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Sede Origen -->
            <div class="space-y-2">
              <label class="text-xs font-bold uppercase tracking-wider text-text-muted ml-1">Sede Origen (Salida)</label>
              <Combobox
                options={data.branches.map((b: any) => ({ value: b.id, label: b.name }))}
                bind:value={sourceBranchId}
                placeholder="Seleccionar Sede Origen..."
                icon={Store}
                class="w-full h-14"
              />
            </div>

            <!-- Sede Destino -->
            <div class="space-y-2">
              <label class="text-xs font-bold uppercase tracking-wider text-text-muted ml-1">Sede Destino (Recepción)</label>
              <Combobox
                options={data.branches.filter((b: any) => b.id !== sourceBranchId).map((b: any) => ({ value: b.id, label: b.name }))}
                bind:value={targetBranchId}
                placeholder="Seleccionar Sede Destino..."
                icon={Store}
                class="w-full h-14"
              />
            </div>
          </div>

          <!-- Motivo -->
          <div class="space-y-2">
            <label class="text-xs font-bold uppercase tracking-wider text-text-muted ml-1">Motivo / Observaciones del Traslado</label>
            <input 
              type="text" 
              bind:value={motivo}
              placeholder="Ej. Reabastecimiento de inventario tienda central..."
              class="w-full h-14 bg-white/5 border border-white/5 rounded-2xl px-5 text-sm font-bold text-text-base focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            />
          </div>

          <!-- BOTON CONTINUAR A ARTICULOS (ESTILO EXACTO A COTIZACIONES) -->
          <div class="pt-6 flex justify-end">
            <button 
              type="button"
              onclick={() => goToStep(1)}
              class="px-8 py-4 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-500/20 hover:shadow-brand-500/40 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              Continuar a Artículos
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

      </div>
    {/if}

    <!-- ========================================== -->
    <!-- PASO 2: CATÁLOGO DE ARTÍCULOS (REPLICADO DE COTIZACIONES, SIN PRECIOS) -->
    <!-- ========================================== -->
    {#if activeTab === 1}
      <div class="space-y-6" transition:fade={{ duration: 150 }}>
        
        <!-- SUBTITULOS FUERA DE LA CARD -->
        <div class="text-center space-y-2">
          <h2 class="text-3xl font-black text-text-base">Selección de Artículos</h2>
          <p class="text-text-muted text-sm max-w-md mx-auto">Busca e incluye la mercancía que deseas trasladar desde {sourceBranchName}.</p>
        </div>

        <!-- BARRA DE FILTROS (GRID EXACTO A COTIZACIONES: 4 columnas lg) -->
        <div class="glass p-4 rounded-3xl border border-border-subtle shadow-2xl grid grid-cols-2 lg:grid-cols-4 gap-4 items-center relative z-10">

          <!-- 0. Sede Origen Badge -->
          <div class="col-span-2 lg:col-span-1">
            <div class="h-14 bg-surface-base rounded-2xl px-4 flex items-center gap-3 text-text-base font-bold text-sm border border-border-subtle">
              <Store size={18} class="text-brand-500 shrink-0" />
              <span class="truncate">{sourceBranchName}</span>
            </div>
          </div>

          <!-- 1. Buscador + Scanner -->
          <div class="flex items-center gap-2 col-span-2 lg:col-span-1">
            <form onsubmit={handleSearch} class="relative group flex-1 h-14">
              <input
                type="text"
                placeholder="Buscar código o descripción..."
                bind:value={searchTerm}
                class="w-full h-full bg-surface-base pl-6 pr-14 rounded-2xl border border-border-subtle focus:border-brand-500/30 outline-none transition-all font-bold text-sm placeholder:font-normal placeholder:text-text-secondary/30"
              />
              <button
                type="submit"
                class="absolute right-1 top-1 bottom-1 w-12 flex items-center justify-center bg-surface-soft hover:bg-surface-strong text-brand-400 rounded-xl transition-all border border-border-subtle active:scale-95"
                title="Buscar Artículos"
              >
                <Search size={18} />
              </button>
            </form>
            <BarcodeScanner
              onScan={(code) => {
                searchTerm = code;
                handleSearch();
              }}
            />
          </div>

          <!-- 2. Línea -->
          <div class="col-span-1 lg:col-span-1">
            <Combobox
              options={(data.context?.lineas || []).map((l: any) => ({
                value: l.co_lin,
                label: l.lin_des,
              }))}
              bind:value={selectedLinea}
              placeholder="Líneas (Todas)"
              allLabel="Líneas (Todas)"
              onchange={() => handleSearch()}
              class="w-full h-14"
            />
          </div>

          <!-- 3. Categoría -->
          <div class="col-span-1 lg:col-span-1">
            <Combobox
              options={(filteredCategorias || []).map((c: any) => ({
                value: c.co_cat,
                label: c.cat_des,
              }))}
              bind:value={selectedCategoria}
              placeholder="Categorías (Todas)"
              allLabel="Categorías (Todas)"
              onchange={() => handleSearch()}
              class="w-full h-14"
            />
          </div>
        </div>

        <!-- Grid de Artículos -->
        {#if loadingArticles}
          <div class="glass p-20 rounded-[40px] border border-border-subtle text-center space-y-4">
            <div class="w-12 h-12 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin mx-auto"></div>
            <p class="text-xl font-bold text-text-muted">Cargando catálogo...</p>
          </div>
        {:else if localArticles.length === 0}
          <div class="glass p-20 rounded-[40px] border border-border-subtle text-center space-y-4">
            <Box size={60} class="text-text-muted/20 mx-auto" />
            <p class="text-xl font-bold text-text-muted">No se encontraron artículos.</p>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {#each displayArticles as article}
              {@const code = (article.co_art || article.codigo || '').trim()}
              {@const curAlmId = selectedWarehouses[code]}
              {@const curAlm = article.disponibilidad?.find((a: any) => a.co_alma === curAlmId) || article.disponibilidad?.[0]}
              {@const isAdded = selectedItems.some(i => i.co_art === code)}

              <div class="glass p-4 rounded-3xl border border-border-subtle hover:border-brand-500/30 transition-all flex flex-col group relative overflow-hidden">
                <!-- Stock Badge overlay -->
                <div class="absolute top-4 right-4 z-10 flex flex-col items-end gap-1">
                  <span class="px-2 py-1 rounded-md bg-surface-soft backdrop-blur text-[10px] font-black text-brand-400 border border-border-bold uppercase">
                    {code}
                  </span>
                </div>

                <div class="h-40 bg-surface-soft rounded-[20px] flex items-center justify-center text-text-muted mb-4 group-hover:bg-brand-500/5 transition-colors">
                  <Package size={48} class="opacity-30 group-hover:scale-110 group-hover:text-brand-500 transition-all duration-500" />
                </div>

                <h3 class="font-black text-sm leading-tight group-hover:text-brand-400 transition-colors">
                  {article.art_des || article.descripcion || ''}
                </h3>
                <p class="text-[10px] text-text-muted mt-1 font-bold uppercase tracking-wider">
                  <span class="text-brand-400">{article.unidad || 'UNID'}</span>
                </p>

                <div class="mt-3 pt-3 border-t border-border-subtle space-y-3">
                  <!-- Selector Almacén (EXACTO A COTIZACIONES) -->
                  <div class="flex flex-col gap-1">
                    <div class="flex justify-between items-end px-1">
                      <span class="text-[9px] font-black text-text-muted uppercase tracking-wider">Disponibilidad</span>
                      <span class="text-sm font-black {(curAlm?.stock || 0) > 0 ? 'text-green-400' : 'text-red-400'}">
                        {curAlm?.stock || 0}
                      </span>
                    </div>

                    <div class="relative group">
                      <select
                        bind:value={selectedWarehouses[code]}
                        class="w-full h-11 bg-surface-soft hover:bg-surface-strong rounded-xl px-4 text-xs font-black outline-none border border-border-subtle appearance-none transition-all cursor-pointer text-text-muted hover:text-text-base"
                      >
                        {#each article.disponibilidad || [] as alm}
                          <option value={alm.co_alma} class="bg-surface-dark text-white text-sm">
                            {alm.des_alma || alm.co_alma}
                          </option>
                        {/each}
                      </select>
                      <ChevronDown size={14} class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted opacity-50 pointer-events-none" />
                    </div>
                  </div>

                  <!-- Fila de Acción: Cantidad + Agregar con Icono de Carrito -->
                  <div class="flex items-center gap-2 mt-4">
                    <!-- Selector Cantidad -->
                    <div class="flex-1 flex items-center bg-surface-soft rounded-xl border border-border-bold h-11 focus-within:border-brand-500/30 transition-all overflow-hidden">
                      <button
                        type="button"
                        onclick={() => {
                          const step = getStep(article);
                          const cur = qtyPerArticle[code] || step;
                          qtyPerArticle[code] = Math.max(step, Math.round((cur - step) * 10) / 10);
                        }}
                        class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 transition-colors bg-surface-soft shrink-0"
                        title="Restar"><Minus size={12} /></button>
                      <input
                        type="number"
                        step={getStep(article)}
                        min={getStep(article)}
                        bind:value={qtyPerArticle[code]}
                        onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
                        oninput={(e) => {
                          const step = getStep(article);
                          const stock = curAlm?.stock || 0;
                          let val = parseFloat((e.currentTarget as HTMLInputElement).value);
                          if (isNaN(val) || val < step) return;
                          if (stock > 0 && val > stock) {
                            toast.warning(`Cantidad ajustada al stock (${stock})`);
                            qtyPerArticle[code] = Math.floor(stock / step) * step || step;
                          }
                        }}
                        onblur={(e) => {
                          const step = getStep(article);
                          const v = parseFloat((e.currentTarget as HTMLInputElement).value);
                          if (isNaN(v) || v < step) {
                            qtyPerArticle[code] = step;
                          } else {
                            qtyPerArticle[code] = Math.round(v / step) * step;
                          }
                        }}
                        class="w-full flex-1 text-center text-base font-black bg-transparent outline-none no-arrows text-brand-400 px-1"
                      />
                      <button
                        type="button"
                        onclick={() => {
                          const step = getStep(article);
                          const stock = curAlm?.stock || 0;
                          const currentQty = qtyPerArticle[code] || step;
                          if (stock > 0 && currentQty + step > stock) {
                            toast.error('Alcanzó el límite de stock disponible');
                          } else {
                            qtyPerArticle[code] = Math.round((currentQty + step) * 10) / 10;
                          }
                        }}
                        class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 transition-colors bg-surface-soft shrink-0"
                        title="Sumar"><Plus size={12} /></button>
                    </div>

                    <!-- Botón Agregar con Icono de Carrito de Compras -->
                    <button
                      type="button"
                      onclick={() => addItem(article)}
                      class="h-11 w-12 rounded-xl text-white transition-all flex items-center justify-center cursor-pointer active:scale-95 shrink-0 {isAdded ? 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20' : 'bg-brand-600 hover:bg-brand-500 shadow-lg shadow-brand-500/20'}"
                      title={isAdded ? 'Agregar más al traslado' : 'Agregar al traslado'}
                    >
                      <ShoppingCart size={18} />
                    </button>
                  </div>
                </div>

              </div>
            {/each}
          </div>
        {/if}

        <!-- BARRA DE NAVEGACIÓN INFERIOR PESTAÑA 2 -->
        <div class="glass p-6 rounded-3xl border border-white/5 flex items-center justify-between gap-4 mt-8">
          <button 
            type="button"
            onclick={() => activeTab = 0}
            class="px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-xs font-bold text-text-muted hover:text-text-base transition-all flex items-center gap-2 cursor-pointer"
          >
            <ChevronLeft size={18} />
            Anterior
          </button>

          <div class="flex items-center gap-4">
            {#if selectedItems.length > 0}
              <span class="px-4 py-2 rounded-xl bg-brand-500/10 border border-brand-500/20 font-mono font-bold text-xs text-brand-400">
                {selectedItems.length} artículos agregados ({totalUnits} ud)
              </span>
            {/if}

            <button 
              type="button"
              onclick={() => goToStep(2)}
              disabled={selectedItems.length === 0}
              class="px-8 py-4 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-500/20 hover:shadow-brand-500/40 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              Continuar a Confirmar
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

      </div>
    {/if}

    <!-- ========================================== -->
    <!-- PASO 3: RESUMEN Y ARTICULOS EN TRASLADO (AQUÍ VA LA CARD DE ÍTEMS AGREGADOS) -->
    <!-- ========================================== -->
    {#if activeTab === 2}
      <div class="space-y-6 max-w-4xl mx-auto" transition:fade={{ duration: 150 }}>
        
        <!-- SUBTITULOS FUERA DE LA CARD -->
        <div class="text-center space-y-2">
          <h2 class="text-3xl font-black text-text-base">Confirmación del Traslado</h2>
          <p class="text-text-muted text-sm max-w-md mx-auto">Revisa la mercancía agregada antes de generar el Ajuste de Salida en la Sede Origen.</p>
        </div>

        <div class="glass p-6 md:p-8 rounded-[32px] border border-white/5 shadow-2xl space-y-8">
          <!-- Cards Resumen de Sedes -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-1">
              <span class="text-xs text-text-muted uppercase font-bold tracking-wider">Sede Origen (Salida)</span>
              <div class="text-lg font-black text-amber-400">{sourceBranchName}</div>
            </div>

            <div class="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-1">
              <span class="text-xs text-text-muted uppercase font-bold tracking-wider">Sede Destino (Recepción)</span>
              <div class="text-lg font-black text-emerald-400">{targetBranchName}</div>
            </div>
          </div>

          <!-- Motivo -->
          <div class="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-1">
            <span class="text-xs text-text-muted uppercase font-bold tracking-wider">Motivo / Observaciones</span>
            <div class="text-sm font-semibold text-text-base">{motivo || 'Sin observaciones'}</div>
          </div>

          <!-- TABLA COMPLETA DE ARTÍCULOS EN TRASLADO (AQUÍ ESTÁ LA DETALLADA) -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-black uppercase tracking-widest text-text-muted">Artículos Incluidos en el Traslado ({selectedItems.length})</h4>
              <span class="text-xs font-mono font-bold text-brand-400">Total Unidades: {totalUnits}</span>
            </div>

            <div class="border border-white/5 rounded-2xl overflow-hidden">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="bg-white/5 text-text-muted font-bold border-b border-white/5">
                    <th class="p-4">Código</th>
                    <th class="p-4">Descripción</th>
                    <th class="p-4 text-center">Almacén Origen</th>
                    <th class="p-4 text-center">Almacén Destino</th>
                    <th class="p-4 text-center w-32">Cantidad</th>
                    <th class="p-4 text-center">Eliminar</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5 font-semibold">
                  {#each selectedItems as item, idx}
                    <tr class="hover:bg-white/[0.02]">
                      <td class="p-4 font-mono text-brand-400 font-bold">{item.co_art}</td>
                      <td class="p-4 text-text-base">{item.art_des}</td>
                      <td class="p-4 text-center font-mono">
                        <input 
                          type="text" 
                          bind:value={item.co_alma_source}
                          class="w-14 h-8 bg-white/5 border border-white/5 rounded text-center text-text-base focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </td>
                      <td class="p-4 text-center font-mono">
                        <input 
                          type="text" 
                          bind:value={item.co_alma_target}
                          class="w-14 h-8 bg-white/5 border border-white/5 rounded text-center text-text-base focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </td>
                      <td class="p-4 text-center">
                        <input 
                          type="number"
                          step={getStep(item)}
                          min={getStep(item)}
                          bind:value={item.total_art}
                          class="w-20 h-9 bg-white/5 border border-white/10 rounded-xl text-center font-mono font-black text-sm text-text-base focus:outline-none focus:ring-2 focus:ring-brand-500 no-arrows"
                        />
                      </td>
                      <td class="p-4 text-center">
                        <button 
                          type="button"
                          onclick={() => removeItem(idx)}
                          class="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all cursor-pointer"
                          title="Eliminar ítem"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Acciones Finales -->
          <div class="pt-6 border-t border-white/5 flex items-center justify-between">
            <button 
              type="button"
              onclick={() => activeTab = 1}
              class="px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-text-muted font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft size={16} />
              Volver a Artículos
            </button>

            <button 
              type="submit"
              disabled={!isFormValid || isSubmitting}
              class="px-10 py-4 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-500/20 hover:shadow-brand-500/40 transition-all active:scale-95 flex items-center gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if isSubmitting}
                <RefreshCw size={18} class="animate-spin" />
                Generando Ajuste de Salida...
              {:else}
                <Check size={18} />
                Registrar y Enviar Traslado
              {/if}
            </button>
          </div>

        </div>
      </div>
    {/if}

  </form>
</div>

<style>
  /* Chrome, Safari, Edge, Opera */
  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  /* Firefox */
  input[type="number"] {
    -moz-appearance: textfield;
  }
</style>
