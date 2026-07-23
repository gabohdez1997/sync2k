<!-- src/routes/dashboard/warehouse/transfers/new/+page.svelte -->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { 
    ArrowRightLeft, Plus, Minus, Search, Trash2, Store, 
    Box, Check, AlertCircle, RefreshCw, ChevronRight, ChevronLeft, ChevronDown,
    ShoppingBag, Package, Clock, Tag, Layers, Loader2, Truck
  } from "lucide-svelte";
  import { fade, slide, scale } from "svelte/transition";
  import { toast } from "svelte-sonner";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";

  let { data, form } = $props();

  // --- ESTADO DE PASOS ---
  let activeTab = $state(0); // 0: Sedes, 1: Artículos, 2: Confirmación

  // --- FORMULARIO PRINCIPAL ---
  let sourceBranchId = $state(data.editingTransfer?.source_branch_id || data.userBranchId || (data.branches[0]?.id ?? ''));
  let targetBranchId = $state(data.editingTransfer?.target_branch_id || '');
  let motivo = $state(data.editingTransfer?.motivo || 'Traslado de inventario entre sedes');

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
  const initialItems = (data.editingTransfer?.items || []).map((it: any) => ({
    co_art: it.co_art,
    art_des: it.art_des,
    co_alma_source: it.co_alma_source || '01',
    co_alma_target: it.co_alma_target || '01',
    total_art: Number(it.total_art),
    costo_unit: Number(it.costo_unit || 0),
    co_uni: it.co_uni || 'UND'
  }));

  let selectedItems = $state<any[]>(initialItems);
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

  function getFilteredDisponibilidad(article: any) {
    const rawList = article?.disponibilidad || [];
    const allowed: string[] = data.allowedWarehouses || data.context?.allowedWarehouses || [];
    const isAdmin = data.isAdmin ?? data.context?.isAdmin ?? (allowed.length === 0);

    if (isAdmin || allowed.length === 0) {
      return rawList;
    }

    return rawList.filter((alm: any) => {
      const almaId = String(alm.co_alma || alm.id || '').trim();
      return allowed.some((w: string) => String(w).trim() === almaId);
    });
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
        const validDispo = getFilteredDisponibilidad(art);
        if (selectedWarehouses[co] === undefined && validDispo?.length > 0) {
          selectedWarehouses[co] = validDispo[0].co_alma;
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

  // Almacenes de la Sede Destino
  let targetWarehouses = $state<any[]>([]);
  let loadingTargetWarehouses = $state(false);

  $effect(() => {
    if (targetBranchId) {
      loadingTargetWarehouses = true;
      fetch(`/api/agent/warehouses?branch_id=${targetBranchId}`)
        .then((res) => res.json())
        .then((d) => {
          if (d.warehouses && Array.isArray(d.warehouses)) {
            targetWarehouses = d.warehouses;
            if (targetWarehouses.length > 0) {
              const defaultTargetAlma = targetWarehouses[0].co_alma;
              selectedItems.forEach((it) => {
                if (!it.co_alma_target || it.co_alma_target === '01') {
                  it.co_alma_target = defaultTargetAlma;
                }
              });
            }
          } else {
            targetWarehouses = [];
          }
        })
        .catch((err) => {
          console.error('Error fetching target branch warehouses:', err);
          targetWarehouses = [];
        })
        .finally(() => {
          loadingTargetWarehouses = false;
        });
    } else {
      targetWarehouses = [];
    }
  });

  function addItem(article: any) {
    const code = (article.co_art || article.codigo || '').trim();
    const artDesc = (article.art_des || article.descripcion || article.co_art || article.codigo || '').trim();
    const validDispo = getFilteredDisponibilidad(article);

    if (!validDispo || validDispo.length === 0) {
      toast.error(`No posee permisos para los almacenes origen con disponibilidad de "${artDesc}".`);
      return;
    }

    const almaCode = selectedWarehouses[code] || validDispo[0]?.co_alma || '01';
    const curAlm = validDispo.find((a: any) => String(a.co_alma).trim() === String(almaCode).trim()) || validDispo[0];
    const currentStock = Number(curAlm?.stock ?? article.stock_global ?? article.stock ?? 0);
    const step = getStep(article);
    const qtyToAdd = qtyPerArticle[code] || step;

    const existingIndex = selectedItems.findIndex(i => i.co_art === code && i.co_alma_source === almaCode);
    if (existingIndex >= 0) {
      const newQty = selectedItems[existingIndex].total_art + qtyToAdd;
      if (currentStock > 0 && newQty > currentStock) {
        toast.error(`Stock insuficiente para "${artDesc}". Disponible en origen: ${currentStock}`);
        return;
      }
      selectedItems[existingIndex].total_art = newQty;
      toast.success(`Actualizado: "${artDesc}" (${newQty} ud)`);
    } else {
      if (currentStock > 0 && qtyToAdd > currentStock) {
        toast.error(`Stock insuficiente para "${artDesc}". Disponible en origen: ${currentStock}`);
        return;
      }
      selectedItems.push({
        co_art: code,
        art_des: artDesc,
        stock_origen: currentStock,
        co_alma_source: almaCode,
        co_alma_target: targetWarehouses[0]?.co_alma || '01',
        total_art: qtyToAdd,
        costo_unit: Number(article.costo || 0),
        article,
        disponibilidad: JSON.parse(JSON.stringify(validDispo))
      });
      toast.success(`Agregado al traslado: "${artDesc}" (${qtyToAdd} ud)`);
    }
  }

  function getItemStock(item: any, coAlma?: string): number {
    const targetAlma = String(coAlma || item.co_alma_source || '').trim();
    const art = displayArticles.find((a: any) => String(a.co_art || a.codigo || '').trim() === String(item.co_art || '').trim()) || item.article;
    const avail = art?.disponibilidad || item.disponibilidad || [];
    const matched = avail.find((a: any) => String(a.co_alma || a.id || '').trim() === targetAlma);
    if (matched && matched.stock !== undefined && matched.stock !== null) {
      return Number(matched.stock);
    }
    return Number(item.stock_origen || 0);
  }

  function updateItemSourceWarehouse(index: number, newCoAlma: string) {
    const item = selectedItems[index];
    if (!item) return;
    const cleanAlma = String(newCoAlma || '').trim();
    item.co_alma_source = cleanAlma;

    const realStock = getItemStock(item, cleanAlma);
    item.stock_origen = realStock;

    if (item.total_art > realStock) {
      const maxAllowed = realStock > 0 ? realStock : getStep(item);
      item.total_art = maxAllowed;
      toast.warning(`Cantidad de "${item.art_des}" ajustada a ${maxAllowed} por disponibilidad en el almacén ${cleanAlma}`);
    }
    if (realStock === 0) {
      toast.error(`El almacén ${cleanAlma} no tiene stock disponible para "${item.art_des}"`);
    }
  }

  function updateItemQty(index: number, newQty: number) {
    const item = selectedItems[index];
    if (!item) return;
    const step = getStep(item);
    const realStock = getItemStock(item, item.co_alma_source);
    item.stock_origen = realStock;

    if (isNaN(newQty) || newQty < step) {
      item.total_art = step;
      return;
    }
    if (newQty > realStock) {
      const maxAllowed = realStock > 0 ? realStock : step;
      item.total_art = maxAllowed;
      toast.error(`Stock insuficiente para "${item.art_des}". Cantidad ajustada a la disponible (${maxAllowed} ud)`);
      return;
    }
    item.total_art = Math.round(newQty * 10) / 10;
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
      // Validar stock de todos los artículos antes de pasar al resumen final
      for (const item of selectedItems) {
        const stock = getItemStock(item, item.co_alma_source);
        if (item.total_art > stock) {
          toast.error(`La cantidad de "${item.art_des}" (${item.total_art}) excede el stock disponible en ${item.co_alma_source} (${stock})`);
          return;
        }
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
           selectedItems.every(i => {
             const stock = getItemStock(i, i.co_alma_source);
             return i.total_art > 0 && i.total_art <= stock;
           });
  });

  let sourceBranchName = $derived.by(() => {
    return data.branches.find((b: any) => b.id === sourceBranchId)?.name || '---';
  });

  let targetBranchName = $derived.by(() => {
    return data.branches.find((b: any) => b.id === targetBranchId)?.name || '---';
  });
</script>



<div class="flex flex-col gap-8 min-h-svh pb-20" in:fade={{ duration: 150 }}>

  <!-- HEADER CON BOTÓN DE HISTORIAL (ESTILO EXACTO A COTIZACIONES) -->
  <div class="w-full max-w-6xl mx-auto px-4 mt-6 flex flex-col md:flex-row justify-between md:items-center gap-4">
    <div class="flex flex-col gap-2">
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3 text-text-base">
        <ArrowRightLeft size={40} class="text-brand-500" />
        {data.editingTransfer ? `Editar Traslado ${data.editingTransfer.transfer_number}` : 'Nuevo Traslado'}
      </h1>
      <p class="text-text-muted text-lg">
        {data.editingTransfer ? `Modificando detalle de ${data.editingTransfer.transfer_number}` : 'Generar nuevo traslado de mercancía entre sedes'}
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
    use:enhance={({ formData, cancel }) => {
      isSubmitting = true;
      formData.set('source_branch_id', sourceBranchId);
      formData.set('target_branch_id', targetBranchId);
      formData.set('motivo', motivo);
      formData.set('items', JSON.stringify(selectedItems));
      if (data.editingTransfer) {
        formData.set('editing_id', data.editingTransfer.id);
      }
      
      for (const item of selectedItems) {
        const stock = getItemStock(item, item.co_alma_source);
        if (item.total_art > stock) {
          toast.error(`No se puede procesar: "${item.art_des}" (${item.total_art} ud) excede el stock disponible en ${item.co_alma_source} (${stock} ud).`);
          cancel();
          return;
        }
      }
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
              {@const validDispo = getFilteredDisponibilidad(article)}
              {@const curAlmId = selectedWarehouses[code]}
              {@const curAlm = validDispo.find((a: any) => String(a.co_alma).trim() === String(curAlmId).trim()) || validDispo[0]}
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
                      {#if validDispo.length === 0}
                        <div class="w-full h-11 bg-red-500/10 border border-red-500/30 rounded-xl px-3 flex items-center text-[10px] font-black text-red-400 uppercase">
                          Sin almacén permitido
                        </div>
                      {:else}
                        <select
                          bind:value={selectedWarehouses[code]}
                          class="w-full h-11 bg-surface-soft hover:bg-surface-strong rounded-xl px-4 text-xs font-black outline-none border border-border-subtle appearance-none transition-all cursor-pointer text-text-muted hover:text-text-base"
                        >
                          {#each validDispo as alm}
                            <option value={alm.co_alma} class="bg-surface-dark text-white text-sm">
                              {alm.des_alma || alm.co_alma}
                            </option>
                          {/each}
                        </select>
                        <ChevronDown size={14} class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted opacity-50 pointer-events-none" />
                      {/if}
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

                    <!-- Botón Agregar con Icono de Camión (Traslado) -->
                    <button
                      type="button"
                      disabled={validDispo.length === 0}
                      onclick={() => addItem(article)}
                      class="h-11 w-12 rounded-xl text-white transition-all flex items-center justify-center cursor-pointer active:scale-95 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed {isAdded ? 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20' : 'bg-brand-600 hover:bg-brand-500 shadow-lg shadow-brand-500/20'}"
                      title={validDispo.length === 0 ? 'Sin permisos en almacenes origen' : isAdded ? 'Agregar más al traslado' : 'Agregar al traslado'}
                    >
                      <Truck size={18} />
                    </button>
                  </div>
                </div>

              </div>
            {/each}
          </div>
        {/if}

        <!-- Paginación Footer (EXACTO A COTIZACIONES) -->
        {#if localPagination && localPagination.totalPages > 1}
          <div class="flex justify-center gap-4 mt-8 pb-10">
            <button
              type="button"
              disabled={localPagination.page <= 1}
              onclick={() => {
                localPagination.page -= 1;
                fetchArticles();
              }}
              class="h-12 px-6 rounded-2xl bg-surface-soft border border-border-subtle font-bold text-sm text-text-base disabled:opacity-30 transition-all hover:bg-surface-strong cursor-pointer"
              >Anterior</button
            >
            <div
              class="h-12 px-6 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center font-black text-brand-400 font-mono text-sm"
            >
              {localPagination.page} / {localPagination.totalPages}
            </div>
            <button
              type="button"
              disabled={localPagination.page >= localPagination.totalPages}
              onclick={() => {
                localPagination.page += 1;
                fetchArticles();
              }}
              class="h-12 px-6 rounded-2xl bg-surface-soft border border-border-subtle font-bold text-sm text-text-base disabled:opacity-30 transition-all hover:bg-surface-strong cursor-pointer"
              >Siguiente</button
            >
          </div>
        {/if}

        <!-- Floating Transfer Cart Pill (EXACTO A COTIZACIONES) -->
        {#if selectedItems.length > 0}
          <div
            class="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md"
            transition:slide
          >
            <div
              class="p-4 rounded-[32px] border border-brand-400/25 bg-brand-600 shadow-2xl flex items-center justify-between gap-4 text-white"
            >
              <div class="flex items-center gap-4">
                <div
                  class="h-12 w-12 rounded-2xl bg-white/15 text-white flex items-center justify-center relative shadow-sm border border-white/10 shrink-0"
                >
                  <Truck size={24} />
                  <span
                    class="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] w-6 h-6 rounded-full flex items-center justify-center font-black border-2 border-brand-600"
                    >{selectedItems.length}</span
                  >
                </div>
                <div>
                  <div
                    class="text-[10px] font-black uppercase tracking-widest text-white/70"
                  >
                    Traslado en curso
                  </div>
                  <div class="text-sm font-black text-white">
                    {selectedItems.length} {selectedItems.length === 1 ? 'artículo' : 'artículos'} ({totalUnits} ud)
                  </div>
                </div>
              </div>
              <button
                type="button"
                onclick={() => goToStep(2)}
                class="bg-white text-brand-600 hover:bg-brand-50 h-12 px-6 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
              >
                Confirmar
              </button>
            </div>
          </div>
        {/if}

      </div>
    {/if}

    <!-- ========================================== -->
    <!-- PASO 3: CONFIRMACIÓN Y GUARDADO DE TRASLADO -->
    <!-- ========================================== -->
    {#if activeTab === 2}
      <div in:fade class="max-w-4xl mx-auto space-y-8 pb-32 px-4">
        <!-- Subtítulo -->
        <div class="text-center">
          <h2 class="text-3xl font-black tracking-tight text-text-base uppercase italic">
            Cierre de Traslado
          </h2>
          <p class="text-text-muted mt-2 font-medium">
            Revise los detalles de las sedes, almacenes y renglones antes de procesar el documento.
          </p>
        </div>

        <div class="flex flex-col gap-8">
          <!-- CARD 1: MEMBRETE (Sede Origen, Sede Destino, Motivo) -->
          <div class="glass p-8 rounded-[40px] border border-border-bold space-y-8 relative overflow-hidden bg-surface-soft/20">
            <div class="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 rounded-full blur-[100px] -mr-32 -mt-32"></div>

            <div class="flex items-center justify-between border-b border-border-subtle pb-6 relative z-10">
              <div class="flex items-center gap-3">
                <Store size={20} class="text-brand-400" />
                <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                  Membrete del Traslado
                </h4>
              </div>
              <button
                type="button"
                onclick={() => (activeTab = 0)}
                class="px-4 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong text-[10px] font-black uppercase text-brand-400 tracking-widest transition-all border border-border-subtle cursor-pointer"
              >
                Cambiar Sedes
              </button>
            </div>

            <div class="space-y-6 relative z-10 w-full">
              <!-- Sedes -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-border-subtle pb-6">
                <div class="space-y-1">
                  <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block">Sede Origen (Salida)</span>
                  <span class="text-2xl font-black text-brand-400">{sourceBranchName}</span>
                </div>
                <div class="space-y-1">
                  <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block">Sede Destino (Recepción)</span>
                  <span class="text-2xl font-black text-brand-400">{targetBranchName}</span>
                </div>
              </div>

              <!-- Motivo -->
              <div class="space-y-2 pt-2">
                <label class="text-[10px] font-black uppercase tracking-widest text-text-muted block ml-1">
                  Motivo / Observaciones del Traslado
                </label>
                <input
                  type="text"
                  bind:value={motivo}
                  placeholder="Escribe el motivo del traslado..."
                  class="w-full h-12 bg-surface-base px-4 rounded-xl border border-border-subtle focus:border-brand-500/40 outline-none text-sm font-bold text-text-base transition-all"
                />
              </div>
            </div>
          </div>

          <!-- CARD 2: DETALLE DE RENGLONES (REPLICANDO DISEÑO EXACTO DE COTIZACIONES) -->
          <div class="glass rounded-[32px] border border-border-subtle overflow-hidden">
            <div class="p-8 border-b border-border-subtle flex items-center justify-between bg-surface-soft/50">
              <div class="flex items-center gap-3">
                <Package size={20} class="text-text-muted" />
                <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                  Renglones ({selectedItems.length})
                </h4>
              </div>
              <button
                type="button"
                onclick={() => (activeTab = 1)}
                class="px-4 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong text-[10px] font-black uppercase text-brand-400 tracking-widest transition-all border border-border-subtle cursor-pointer"
              >
                Agregar Articulo
              </button>
            </div>

            <div class="divide-y border-border-subtle">
              {#each selectedItems as item, idx}
                {@const artObj = displayArticles.find((a: any) => (a.co_art || a.codigo || '').trim() === item.co_art) || item.article}
                {@const rawAvail = getFilteredDisponibilidad(artObj)}
                {@const availList = (() => {
                  let list = Array.isArray(rawAvail) ? [...rawAvail] : [];
                  if (item.co_alma_source && !list.some((a: any) => (a.co_alma || a.id) === item.co_alma_source)) {
                    const realAlma = data.context?.warehouses?.find((w: any) => (w.co_alma || w.id) === item.co_alma_source);
                    list.unshift({
                      co_alma: item.co_alma_source,
                      des_alma: String(realAlma?.des_alma || realAlma?.des_sub || realAlma?.nombre || item.co_alma_source).trim(),
                      stock: item.stock_origen || 0
                    });
                  }
                  return list;
                })()}

                <div class="p-8 flex flex-col lg:flex-row items-start lg:items-center gap-8 transition-all hover:bg-surface-soft group relative border-b border-border-subtle last:border-0">
                  
                  <!-- Identidad del Producto y Selector de Cantidad -->
                  <div class="flex items-center gap-6 shrink-0 w-full lg:w-auto">
                    <div class="h-16 w-16 rounded-2xl bg-surface-soft flex items-center justify-center text-brand-400 relative group-hover:scale-110 transition-transform duration-500 shrink-0">
                      <div class="absolute inset-0 bg-brand-500/10 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <Package size={28} />
                    </div>

                    <!-- Controles de Cantidad (- qty +) -->
                    <div class="flex items-center bg-surface-base/40 rounded-xl border border-border-subtle h-12 overflow-hidden shadow-inner shrink-0">
                      <button
                        type="button"
                        onclick={() => updateItemQty(idx, item.total_art - getStep(item))}
                        class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 hover:bg-surface-soft transition-all cursor-pointer"
                        title="Restar"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        min={getStep(item)}
                        max={getItemStock(item, item.co_alma_source)}
                        step={getStep(item)}
                        bind:value={item.total_art}
                        oninput={(e) => {
                          const inputEl = e.currentTarget as HTMLInputElement;
                          const v = parseFloat(inputEl.value);
                          if (!isNaN(v)) {
                            updateItemQty(idx, v);
                            if (inputEl.value !== String(item.total_art)) {
                              inputEl.value = String(item.total_art);
                            }
                          }
                        }}
                        onblur={(e) => {
                          const inputEl = e.currentTarget as HTMLInputElement;
                          const v = parseFloat(inputEl.value);
                          updateItemQty(idx, isNaN(v) ? getStep(item) : v);
                          inputEl.value = String(item.total_art);
                        }}
                        class="w-14 text-center text-base font-black bg-transparent outline-none no-arrows text-brand-400"
                      />
                      <button
                        type="button"
                        onclick={() => updateItemQty(idx, item.total_art + getStep(item))}
                        class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 hover:bg-surface-soft transition-all cursor-pointer"
                        title="Sumar"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  <!-- Detalles del Artículo y Selects de Almacén -->
                  <div class="flex-1 min-w-0 space-y-4 w-full">
                    <div class="space-y-1">
                      <div class="text-lg font-black text-text-base leading-tight">
                        {item.art_des}
                      </div>
                      <div class="flex items-center gap-4 text-[11px] font-bold uppercase tracking-[0.15em]">
                        <span class="text-brand-400 font-mono">{item.co_art}</span>
                        <span class="h-1 w-1 rounded-full bg-border-subtle"></span>
                        <span class="text-text-muted">{item.co_uni || "UND"}</span>
                      </div>
                    </div>

                    <!-- Selects de Almacén Origen y Destino -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <!-- Select Almacén Origen -->
                      <div class="relative group/sel">
                        <label class="text-[9px] font-black uppercase tracking-wider text-text-muted block mb-1">
                          Almacén Origen (Salida)
                        </label>
                        <select
                          value={item.co_alma_source}
                          onchange={(e) => updateItemSourceWarehouse(idx, e.currentTarget.value)}
                          class="w-full h-11 bg-surface-soft rounded-xl px-4 text-sm font-black outline-none border border-border-subtle appearance-none cursor-pointer focus:border-brand-500/30 transition-all hover:bg-surface-strong text-text-base pr-8"
                        >
                          {#each availList as alm}
                            <option value={alm.co_alma} class="bg-surface-dark text-white">
                              {alm.des_alma || alm.co_alma} ({alm.stock ?? item.stock_origen ?? 0})
                            </option>
                          {/each}
                        </select>
                        <ChevronDown size={14} class="absolute right-3 bottom-3 text-text-muted opacity-50 pointer-events-none" />
                      </div>

                      <!-- Select Almacén Destino -->
                      <div class="relative group/sel">
                        <label class="text-[9px] font-black uppercase tracking-wider text-text-muted block mb-1">
                          Almacén Destino (Entrada)
                        </label>
                        <select
                          bind:value={item.co_alma_target}
                          class="w-full h-11 bg-surface-soft rounded-xl px-4 text-sm font-black outline-none border border-border-subtle appearance-none cursor-pointer focus:border-brand-500/30 transition-all hover:bg-surface-strong text-text-base pr-8"
                        >
                          {#if targetWarehouses.length === 0}
                            <option value="01" class="bg-surface-dark text-white">ALMACEN PRINCIPAL (01)</option>
                          {:else}
                            {#each targetWarehouses as alm}
                              <option value={alm.co_alma} class="bg-surface-dark text-white">
                                {alm.des_alma || alm.des_sub || alm.nombre || alm.co_alma}
                              </option>
                            {/each}
                          {/if}
                        </select>
                        <ChevronDown size={14} class="absolute right-3 bottom-3 text-text-muted opacity-50 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <!-- Botón Eliminar Renglón -->
                  <button
                    type="button"
                    onclick={() => removeItem(idx)}
                    class="h-10 w-10 rounded-xl bg-surface-soft hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-all flex items-center justify-center border border-border-subtle shrink-0 cursor-pointer lg:self-center"
                    title="Eliminar ítem"
                  >
                    <Trash2 size={18} />
                  </button>

                </div>
              {/each}
            </div>
          </div>

          <!-- BOTONES DE ACCIÓN (3 BOTONES EXACTO A COTIZACIONES) -->
          <div class="pt-6 space-y-4 relative z-10">
            <!-- Botón Principal: Registrar y Enviar Traslado -->
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              class="w-full h-20 bg-brand-600 hover:bg-brand-500 text-white rounded-[24px] font-black text-xl uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(var(--brand-rgb),0.3)] active:scale-[0.97] transition-all flex items-center justify-center gap-4 disabled:opacity-50 disabled:grayscale cursor-pointer group"
            >
              {#if isSubmitting}
                <Loader2 size={32} class="animate-spin text-brand-400/40" />
                <span class="animate-pulse">Generando Ajuste...</span>
              {:else}
                <div class="bg-surface-strong/50 p-2.5 rounded-xl group-hover:scale-110 transition-transform">
                  <Check size={28} />
                </div>
                Registrar y Enviar Traslado
              {/if}
            </button>

            <!-- Botones Secundarios: Descartar todo | Volver a Edición -->
            <div class="grid grid-cols-2 gap-4">
              <button
                type="button"
                onclick={() => {
                  selectedItems = [];
                  activeTab = 0;
                  toast.info('Traslado descartado');
                }}
                class="h-14 rounded-2xl text-text-muted hover:bg-red-500/10 hover:text-red-400 transition-all text-xs font-black uppercase tracking-widest border border-border-subtle cursor-pointer"
              >
                Descartar todo
              </button>

              <button
                type="button"
                onclick={() => (activeTab = 1)}
                class="h-14 rounded-2xl text-brand-400 hover:bg-brand-500/10 transition-all text-xs font-black uppercase tracking-widest border border-brand-500/15 cursor-pointer"
              >
                Volver a Edición
              </button>
            </div>
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
