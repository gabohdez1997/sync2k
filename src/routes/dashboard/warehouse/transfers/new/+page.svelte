<!-- src/routes/dashboard/warehouse/transfers/new/+page.svelte -->
<script lang="ts">
  import { enhance } from "$app/forms";
  import * as XLSX from "xlsx";
  import { 
    ArrowRightLeft, Plus, Minus, Search, Trash2, Store, 
    Box, Check, AlertCircle, RefreshCw, ChevronRight, ChevronLeft, ChevronDown,
    ShoppingBag, Package, Clock, Tag, Layers, Loader2, Truck,
    FileSpreadsheet, UploadCloud, X, FileText, CheckCircle2, AlertTriangle, ArrowRight, Upload
  } from "lucide-svelte";
  import { fade, slide, scale } from "svelte/transition";
  import { toast } from "svelte-sonner";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";
  import ImageViewer from "$lib/components/ui/ImageViewer.svelte";
  import { PUBLIC_SUPABASE_URL } from "$env/static/public";

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
  let viewerOpen = $state(false);
  let viewerUrl = $state("");
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

  // --- BUSCADOR EN RENGLONES (CARRITO) ---
  let cartSearchTerm = $state('');

  let filteredSelectedItems = $derived.by(() => {
    const term = cartSearchTerm.trim().toLowerCase();
    if (!term) return selectedItems.map((item, originalIndex) => ({ item, originalIndex }));
    return selectedItems
      .map((item, originalIndex) => ({ item, originalIndex }))
      .filter(({ item }) => {
        const code = String(item.co_art || '').toLowerCase();
        const desc = String(item.art_des || '').toLowerCase();
        return code.includes(term) || desc.includes(term);
      });
  });

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

  let currentBranchConfig = $derived.by(() => {
    return data.branches?.find((b: any) => b.id === sourceBranchId) || data.branches?.[0];
  });

  function isDecimalAllowed(article: any): boolean {
    if (!article) return false;
    const configStr = String(currentBranchConfig?.allow_decimals_units || (data as any).selectedBranchConfig?.allow_decimals_units || 'MTS, MTS2, KG');
    const allowedTokens = configStr.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean);
    const co_uni = String(article?.co_uni || '').trim().toUpperCase();
    const unidad = String(article?.unidad || article?.uni_venta || article?.des_uni || '').trim().toUpperCase();
    
    return allowedTokens.some(token => token === co_uni || token === unidad || (token.length >= 2 && (co_uni === token || unidad === token)));
  }

  function getStep(article: any): number {
    return isDecimalAllowed(article) ? 0.5 : 1;
  }

  function roundQuantity(val: number, articleOrItem: any): number {
    if (isNaN(val) || val <= 0) {
      return isDecimalAllowed(articleOrItem) ? 0.5 : 1;
    }
    if (isDecimalAllowed(articleOrItem)) {
      // Redondeo a pasos de 0.5 con mínimo de 0.5 (ej. 12.4 -> 12.5, 0.06 -> 0.5, 12.1 -> 12.0)
      return Math.max(0.5, Math.round(val * 2) / 2);
    }
    // Para unidades no decimales (UND, etc.): entero con mínimo 1
    return Math.max(1, Math.round(val));
  }

  function getFilteredDisponibilidad(article: any) {
    const rawList = article?.disponibilidad || [];
    const allowed: string[] = data.allowedWarehouses || data.context?.allowedWarehouses || [];
    const isAdmin = data.isAdmin ?? data.context?.isAdmin ?? (allowed.length === 0);

    let baseList = (isAdmin || allowed.length === 0)
      ? rawList
      : rawList.filter((alm: any) => {
          const almaId = String(alm.co_alma || alm.id || '').trim();
          return allowed.some((w: string) => String(w).trim() === almaId);
        });

    // Si sourceWarehouses está disponible, asegurar nombres completos y que todos los almacenes de la sede estén listados
    if (sourceWarehouses && sourceWarehouses.length > 0) {
      const mergedList: any[] = [];
      sourceWarehouses.forEach((sw: any) => {
        const swCode = String(sw.co_alma || sw.id || '').trim();
        if (!isAdmin && allowed.length > 0 && !allowed.some((w: string) => String(w).trim() === swCode)) {
          return;
        }
        const existing = baseList.find((a: any) => String(a.co_alma || a.id || '').trim() === swCode);
        mergedList.push({
          co_alma: swCode,
          des_alma: String(sw.des_alma || sw.des_sub || sw.nombre || existing?.des_alma || swCode).trim(),
          stock: Number(existing?.stock || 0)
        });
      });
      if (mergedList.length > 0) {
        baseList = mergedList;
      }
    }

    // Si estamos editando un traslado, sumamos la cantidad del ajuste de salida original al stock actual
    if (data.editingTransfer) {
      const artCode = String(article?.co_art || article?.codigo || '').trim();
      return baseList.map((alm: any) => {
        const almaId = String(alm.co_alma || alm.id || '').trim();
        const originalItem = (data.editingTransfer.items || []).find((it: any) =>
          String(it.co_art || '').trim() === artCode &&
          String(it.co_alma_source || '01').trim() === almaId
        );
        if (originalItem) {
          const originalQty = Number(originalItem.total_art || 0);
          return {
            ...alm,
            stock: Number(alm.stock || 0) + originalQty
          };
        }
        return alm;
      });
    }

    return baseList;
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

  // Almacenes de la Sede Origen
  let sourceWarehouses = $state<any[]>([]);
  let loadingSourceWarehouses = $state(false);
  let globalSourceWarehouse = $state(data.editingTransfer?.items?.[0]?.co_alma_source || '');

  $effect(() => {
    if (sourceBranchId) {
      loadingSourceWarehouses = true;
      fetch(`/api/agent/warehouses?branch_id=${sourceBranchId}`)
        .then((res) => res.json())
        .then((d) => {
          if (d.warehouses && Array.isArray(d.warehouses)) {
            sourceWarehouses = d.warehouses;
            if (sourceWarehouses.length > 0) {
              if (!globalSourceWarehouse || !sourceWarehouses.some(w => String(w.co_alma || w.id || '').trim() === String(globalSourceWarehouse).trim())) {
                globalSourceWarehouse = sourceWarehouses[0].co_alma;
              }
            }
          } else {
            sourceWarehouses = [];
          }
        })
        .catch((err) => {
          console.error('Error fetching source branch warehouses:', err);
          sourceWarehouses = [];
        })
        .finally(() => {
          loadingSourceWarehouses = false;
        });
    } else {
      sourceWarehouses = [];
      globalSourceWarehouse = '';
    }
  });

  function getSourceWarehouseName(coAlma: string): string {
    const clean = String(coAlma || '').trim();
    if (!clean) return '---';
    const found = sourceWarehouses.find(w => String(w.co_alma || w.id || '').trim() === clean);
    return found?.des_alma || found?.des_sub || found?.nombre || clean;
  }

  function handleGlobalSourceWarehouseChange(newSourceAlma: string) {
    globalSourceWarehouse = newSourceAlma;
    selectedItems.forEach((it) => {
      it.co_alma_source = newSourceAlma;
      it.stock_origen = getItemStock(it, newSourceAlma);
    });
    toast.info(`Almacén origen actualizado a "${getSourceWarehouseName(newSourceAlma)}" para todos los renglones`);
  }

  // Almacenes de la Sede Destino
  let targetWarehouses = $state<any[]>([]);
  let loadingTargetWarehouses = $state(false);
  let globalTargetWarehouse = $state(data.editingTransfer?.items?.[0]?.co_alma_target || '');

  $effect(() => {
    if (targetBranchId) {
      loadingTargetWarehouses = true;
      fetch(`/api/agent/warehouses?branch_id=${targetBranchId}`)
        .then((res) => res.json())
        .then((d) => {
          if (d.warehouses && Array.isArray(d.warehouses)) {
            targetWarehouses = d.warehouses;
            if (targetWarehouses.length > 0) {
              if (!globalTargetWarehouse || !targetWarehouses.some(w => String(w.co_alma || w.id || '').trim() === String(globalTargetWarehouse).trim())) {
                globalTargetWarehouse = targetWarehouses[0].co_alma;
              }
              selectedItems.forEach((it) => {
                if (!it.co_alma_target || it.co_alma_target === '01') {
                  it.co_alma_target = globalTargetWarehouse;
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
      globalTargetWarehouse = '';
    }
  });

  function getTargetWarehouseName(coAlma: string): string {
    const clean = String(coAlma || '').trim();
    if (!clean) return '---';
    const found = targetWarehouses.find(w => String(w.co_alma || w.id || '').trim() === clean);
    return found?.des_alma || found?.des_sub || found?.nombre || clean;
  }

  function handleGlobalTargetWarehouseChange(newTargetAlma: string) {
    globalTargetWarehouse = newTargetAlma;
    selectedItems.forEach((it) => {
      it.co_alma_target = newTargetAlma;
    });
    toast.info(`Almacén destino actualizado a "${getTargetWarehouseName(newTargetAlma)}" para todos los renglones`);
  }

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
    const rawQtyToAdd = qtyPerArticle[code] || getStep(article);
    const qtyToAdd = roundQuantity(rawQtyToAdd, article);

    const existingIndex = selectedItems.findIndex(i => i.co_art === code && i.co_alma_source === almaCode);
    if (existingIndex >= 0) {
      const newQty = roundQuantity(selectedItems[existingIndex].total_art + qtyToAdd, article);
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
        co_alma_target: globalTargetWarehouse || targetWarehouses[0]?.co_alma || '01',
        total_art: qtyToAdd,
        costo_unit: Number(article.costo || 0),
        co_uni: article.co_uni || article.unidad || 'UND',
        article,
        disponibilidad: JSON.parse(JSON.stringify(validDispo))
      });
      toast.success(`Agregado al traslado: "${artDesc}" (${qtyToAdd} ud)`);
    }
  }

  // Cargar disponibilidad de stock en tiempo real para items precargados en modo edición
  $effect(() => {
    if (data.editingTransfer && selectedItems.length > 0 && sourceBranchId) {
      selectedItems.forEach(async (it) => {
        if (it.disponibilidad === undefined && !it._loadingStock) {
          it._loadingStock = true;
          try {
            const res = await fetch(`/api/agent/articles?branch_id=${sourceBranchId}&search=${encodeURIComponent(it.co_art)}`);
            const d = await res.json();
            if (d.success && d.data && d.data.length > 0) {
              const matchedArt = d.data.find((a: any) => String(a.co_art || a.codigo || '').trim() === String(it.co_art).trim()) || d.data[0];
              if (matchedArt) {
                const dispo = getFilteredDisponibilidad(matchedArt);
                it.disponibilidad = dispo;
                it.article = matchedArt;
                const matchedAlm = dispo.find((a: any) => String(a.co_alma || a.id || '').trim() === String(it.co_alma_source).trim());
                if (matchedAlm) {
                  it.stock_origen = Number(matchedAlm.stock);
                  it._stockAlreadyAdjusted = true;
                }
              }
            }
          } catch (e) {
            console.error('Error cargando stock de item en edición:', e);
          } finally {
            it._loadingStock = false;
          }
        }
      });
    }
  });

  function getItemStock(item: any, coAlma?: string): number {
    const targetAlma = String(coAlma || item.co_alma_source || '').trim();
    const art = displayArticles.find((a: any) => String(a.co_art || a.codigo || '').trim() === String(item.co_art || '').trim()) || item.article;
    const avail = art ? getFilteredDisponibilidad(art) : (item.disponibilidad || []);
    const matched = avail.find((a: any) => String(a.co_alma || a.id || '').trim() === targetAlma);
    if (matched && matched.stock !== undefined && matched.stock !== null) {
      return Number(matched.stock);
    }
    if (item.stock_origen !== undefined && item.stock_origen !== null) {
      let base = Number(item.stock_origen);
      if (data.editingTransfer && !item._stockAlreadyAdjusted) {
        const originalItem = (data.editingTransfer.items || []).find((it: any) =>
          String(it.co_art || '').trim() === String(item.co_art || '').trim() &&
          String(it.co_alma_source || '01').trim() === targetAlma
        );
        if (originalItem) {
          return base + Number(originalItem.total_art || 0);
        }
      }
      return base;
    }
    if (data.editingTransfer) {
      return Number(item.total_art || 1);
    }
    return 0;
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
      toast.warning(`Cantidad de "${item.art_des}" ajustada a ${maxAllowed} por disponibilidad en el almacén "${getSourceWarehouseName(cleanAlma)}"`);
    }
    if (realStock === 0) {
      toast.error(`El almacén "${getSourceWarehouseName(cleanAlma)}" no tiene stock disponible para "${item.art_des}"`);
    }
  }

  function updateItemQty(index: number, newQty: number) {
    const item = selectedItems[index];
    if (!item) return;
    const minStep = isDecimalAllowed(item) ? 0.5 : 1;
    const realStock = getItemStock(item, item.co_alma_source);
    item.stock_origen = realStock;

    if (isNaN(newQty) || newQty < minStep) {
      item.total_art = minStep;
      return;
    }
    if (newQty > realStock && realStock > 0) {
      const maxAllowed = roundQuantity(realStock, item);
      item.total_art = Math.max(minStep, maxAllowed > realStock ? realStock : maxAllowed);
      toast.error(`Stock insuficiente para "${item.art_des}". Cantidad ajustada a la disponible (${item.total_art} ud)`);
      return;
    }
    item.total_art = roundQuantity(newQty, item);
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
      if (globalTargetWarehouse) {
        selectedItems.forEach((it) => {
          if (!it.co_alma_target || it.co_alma_target === '01') {
            it.co_alma_target = globalTargetWarehouse;
          }
        });
      }
      // Permitir pasar a la confirmación para revisar/corregir, alertando si hay stock insuficiente
      const invalidCount = selectedItems.filter(i => {
        const stock = getItemStock(i, i.co_alma_source);
        return Number(i.total_art) > stock || Number(i.total_art) <= 0;
      }).length;
      if (invalidCount > 0) {
        toast.warning(`Atención: Hay ${invalidCount} artículo(s) con cantidad superior al stock disponible. Por favor revísalos en el resumen.`);
      }
    }
    activeTab = step;
  }

  let invalidStockItems = $derived.by(() => {
    return selectedItems.filter(item => {
      const stock = getItemStock(item, item.co_alma_source);
      return Number(item.total_art) > stock || Number(item.total_art) <= 0;
    });
  });

  function autoFixStock() {
    let fixed = 0;
    for (const item of selectedItems) {
      const stock = getItemStock(item, item.co_alma_source);
      if (Number(item.total_art) > stock) {
        item.total_art = stock > 0 ? stock : 0;
        fixed++;
      }
    }
    toast.success(`Se ajustaron las cantidades de ${fixed} artículo(s) al stock disponible.`);
  }

  function removeOutOfStockItems() {
    const prevCount = selectedItems.length;
    selectedItems = selectedItems.filter(item => {
      const stock = getItemStock(item, item.co_alma_source);
      return stock > 0 && Number(item.total_art) <= stock;
    });
    const diff = prevCount - selectedItems.length;
    toast.success(`Se eliminaron ${diff} artículo(s) con problemas de stock.`);
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
             return Number(i.total_art) > 0 && Number(i.total_art) <= stock;
           });
  });

  let sourceBranchName = $derived.by(() => {
    return data.branches.find((b: any) => b.id === sourceBranchId)?.name || '---';
  });

  let targetBranchName = $derived.by(() => {
    return data.branches.find((b: any) => b.id === targetBranchId)?.name || '---';
  });

  // ==========================================
  // --- ESTADOS DE IMPORTACIÓN MASIVA (EXCEL / CSV) ---
  // ==========================================
  let showImportModal = $state(false);
  let importStage = $state<'upload' | 'mapping'>('upload');
  let importFileName = $state('');
  let importWorkbook = $state<any>(null);
  let importSheets = $state<string[]>([]);
  let selectedSheet = $state<string>('');
  let parsedRawRows = $state<any[]>([]);
  let detectedColumns = $state<string[]>([]);
  let selectedCodeCol = $state<string>('');
  let selectedQtyCol = $state<string>('');
  let isDragging = $state(false);
  let isReadingFile = $state(false);
  let isImportingToCart = $state(false);
  let importErrorMsg = $state<string | null>(null);

  function resetImportState() {
    importStage = 'upload';
    importFileName = '';
    importWorkbook = null;
    importSheets = [];
    selectedSheet = '';
    parsedRawRows = [];
    detectedColumns = [];
    selectedCodeCol = '';
    selectedQtyCol = '';
    isDragging = false;
    isReadingFile = false;
    isImportingToCart = false;
    importErrorMsg = null;
  }

  function openImportModal() {
    if (!sourceBranchId) {
      toast.error('Por favor seleccione la Sede Origen antes de importar.');
      return;
    }
    resetImportState();
    showImportModal = true;
  }

  function closeImportModal() {
    showImportModal = false;
    resetImportState();
  }

  function normalizeHeader(str: string): string {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function autoDetectColumns(cols: string[]) {
    const codeCandidates = ['codigo', 'co_art', 'coart', 'cod', 'articulo', 'art_des', 'item', 'referencia', 'ref', 'sku', 'code', 'material', 'id'];
    const qtyCandidates = ['cantidad', 'cant', 'qty', 'total_art', 'unidades', 'cant.', 'total', 'count', 'quantity', 'bultos', 'piezas', 'uds', 'und', 'cant_enviada'];

    let foundCode = '';
    for (const cand of codeCandidates) {
      const match = cols.find(c => {
        const norm = normalizeHeader(c);
        return norm === cand || norm.startsWith(cand) || norm.includes(cand);
      });
      if (match) {
        foundCode = match;
        break;
      }
    }

    let foundQty = '';
    for (const cand of qtyCandidates) {
      const match = cols.find(c => {
        const norm = normalizeHeader(c);
        return norm === cand || norm.startsWith(cand) || norm.includes(cand);
      });
      if (match && match !== foundCode) {
        foundQty = match;
        break;
      }
    }

    selectedCodeCol = foundCode || cols[0] || '';
    selectedQtyCol = foundQty || cols.find(c => c !== selectedCodeCol) || cols[1] || cols[0] || '';
  }

  function parseSheetData(sheetName: string) {
    if (!importWorkbook) return;
    const worksheet = importWorkbook.Sheets[sheetName];
    if (!worksheet) return;

    const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
    if (!json || json.length === 0) {
      importErrorMsg = 'La hoja seleccionada está vacía o no contiene filas de datos.';
      return;
    }

    parsedRawRows = json;
    const colSet = new Set<string>();
    json.forEach(row => {
      Object.keys(row).forEach(k => {
        const cleanK = String(k).trim();
        if (cleanK && !cleanK.startsWith('__EMPTY')) {
          colSet.add(cleanK);
        }
      });
    });

    const cols = Array.from(colSet);
    if (cols.length === 0) {
      importErrorMsg = 'No se detectaron columnas con encabezados válidos en el archivo.';
      return;
    }

    detectedColumns = cols;
    autoDetectColumns(cols);
    importErrorMsg = null;
    importStage = 'mapping';
  }

  function handleSheetChange(newSheet: string) {
    selectedSheet = newSheet;
    parseSheetData(newSheet);
  }

  async function handleFileUpload(file: File) {
    if (!file) return;
    importErrorMsg = null;
    isReadingFile = true;
    importFileName = file.name;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });

      if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
        throw new Error('No se encontraron hojas de datos en el archivo cargado.');
      }

      importWorkbook = wb;
      importSheets = wb.SheetNames;
      selectedSheet = wb.SheetNames[0];
      parseSheetData(selectedSheet);
    } catch (err: any) {
      console.error('Error reading Excel/CSV file:', err);
      importErrorMsg = 'Error al leer el archivo: ' + (err?.message || 'Formato no soportado.');
    } finally {
      isReadingFile = false;
    }
  }

  function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }

  function handleFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input && input.files && input.files.length > 0) {
      handleFileUpload(input.files[0]);
    }
  }

  const mappingPreview = $derived.by(() => {
    if (!parsedRawRows || parsedRawRows.length === 0 || !selectedCodeCol) return [];
    return parsedRawRows.slice(0, 5).map((row, idx) => {
      const rawCode = String(row[selectedCodeCol] ?? '').trim();
      const rawQty = selectedQtyCol ? String(row[selectedQtyCol] ?? '').trim() : '1';
      const numQty = parseFloat(rawQty.replace(',', '.'));
      return {
        rowNumber: idx + 1,
        rawCode,
        rawQty,
        isValidQty: !isNaN(numQty) && numQty > 0,
        parsedQty: !isNaN(numQty) && numQty > 0 ? numQty : 1
      };
    });
  });

  const totalValidRowsInFile = $derived.by(() => {
    if (!parsedRawRows || parsedRawRows.length === 0 || !selectedCodeCol) return 0;
    return parsedRawRows.filter(row => {
      const c = String(row[selectedCodeCol] ?? '').trim();
      const q = selectedQtyCol ? parseFloat(String(row[selectedQtyCol] ?? '').replace(',', '.')) : 1;
      return c.length > 0 && !isNaN(q) && q > 0;
    }).length;
  });

  async function processAndImportItems() {
    if (!sourceBranchId) {
      toast.error('Debe seleccionar la Sede Origen antes de importar.');
      return;
    }
    if (!selectedCodeCol) {
      toast.error('Debe seleccionar la columna del código de artículo.');
      return;
    }

    const itemsMap = new Map<string, number>();
    let invalidCount = 0;

    for (const row of parsedRawRows) {
      const code = String(row[selectedCodeCol] ?? '').trim();
      if (!code) {
        invalidCount++;
        continue;
      }
      const rawQty = selectedQtyCol ? String(row[selectedQtyCol] ?? '').trim() : '1';
      const parsedQty = parseFloat(rawQty.replace(',', '.'));
      if (isNaN(parsedQty) || parsedQty <= 0) {
        invalidCount++;
        continue;
      }
      const current = itemsMap.get(code) || 0;
      itemsMap.set(code, Math.round((current + parsedQty) * 100) / 100);
    }

    if (itemsMap.size === 0) {
      toast.error('No se encontraron artículos con código y cantidad válidos para importar.');
      return;
    }

    isImportingToCart = true;
    try {
      const codesToQuery = Array.from(itemsMap.keys());
      const res = await fetch('/api/agent/articles/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: sourceBranchId,
          codes: codesToQuery
        })
      });

      const json = await res.json();
      if (!json.success && (!json.data || json.data.length === 0)) {
        throw new Error(json.message || 'No fue posible consultar los artículos en el agente.');
      }

      const returnedArticles: any[] = json.data || [];
      const foundCodesSet = new Set<string>();
      let addedCount = 0;
      let updatedCount = 0;

      const defaultTargetAlma = globalTargetWarehouse || targetWarehouses[0]?.co_alma || '01';

      for (const art of returnedArticles) {
        const artCode = String(art.co_art || art.codigo || '').trim();
        if (!artCode) continue;
        foundCodesSet.add(artCode);

        const rawQtyToAdd = itemsMap.get(artCode) || 1;
        const qtyToAdd = roundQuantity(rawQtyToAdd, art);
        const validDispo = getFilteredDisponibilidad(art);
        
        // Priorizar almacén origen global configurado
        let almaCode = globalSourceWarehouse || '01';
        let matchedDispo = (validDispo || []).find((d: any) => String(d.co_alma || d.id || '').trim() === String(almaCode).trim());
        
        if (!matchedDispo) {
          const preferredAlm = (validDispo || []).find((d: any) => Number(d.stock || 0) > 0) || validDispo?.[0] || sourceWarehouses?.[0];
          almaCode = preferredAlm?.co_alma || sourceWarehouses?.[0]?.co_alma || '01';
          matchedDispo = preferredAlm;
        }
        
        const currentStock = Number(matchedDispo?.stock ?? 0);
        const unitName = String(art.unidad || art.des_uni || (art.co_uni && art.co_uni !== '01' ? art.co_uni : 'UND')).trim();

        const existingIdx = selectedItems.findIndex(i => i.co_art === artCode && i.co_alma_source === almaCode);
        if (existingIdx >= 0) {
          const combined = selectedItems[existingIdx].total_art + qtyToAdd;
          selectedItems[existingIdx].total_art = roundQuantity(combined, art);
          selectedItems[existingIdx].stock_origen = currentStock;
          selectedItems[existingIdx].disponibilidad = JSON.parse(JSON.stringify(validDispo));
          selectedItems[existingIdx].article = art;
          selectedItems[existingIdx].co_uni = unitName;
          selectedItems[existingIdx].co_alma_target = defaultTargetAlma;
          updatedCount++;
        } else {
          selectedItems.push({
            co_art: artCode,
            art_des: String(art.art_des || art.descripcion || artCode).trim(),
            stock_origen: currentStock,
            co_alma_source: almaCode,
            co_alma_target: defaultTargetAlma,
            total_art: qtyToAdd,
            costo_unit: Number(art.costo || 0),
            co_uni: unitName,
            article: art,
            disponibilidad: JSON.parse(JSON.stringify(validDispo))
          });
          addedCount++;
        }
      }

      const notFoundCodes = codesToQuery.filter(c => !foundCodesSet.has(c));

      closeImportModal();

      if (addedCount > 0 || updatedCount > 0) {
        toast.success(`Importación completada: ${addedCount} artículo(s) agregado(s)${updatedCount > 0 ? `, ${updatedCount} actualizado(s)` : ''}.`);
        goToStep(2);
      }

      if (notFoundCodes.length > 0) {
        toast.warning(`${notFoundCodes.length} código(s) no existen en el catálogo: ${notFoundCodes.slice(0, 5).join(', ')}${notFoundCodes.length > 5 ? '...' : ''}`);
      }

    } catch (err: any) {
      console.error('Error al procesar la importación:', err);
      toast.error('Error al importar artículos: ' + (err?.message || 'Error desconocido'));
    } finally {
      isImportingToCart = false;
    }
  }
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

    <div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
      {#if activeTab === 1}
        <button
          type="button"
          onclick={openImportModal}
          class="flex items-center justify-center gap-2 px-5 py-3 h-14 rounded-2xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 transition-all font-bold active:scale-95 shadow-sm shrink-0 w-full sm:w-auto cursor-pointer"
        >
          <FileSpreadsheet size={18} />
          Importar Artículos
        </button>
      {/if}

      <a
        href="/dashboard/warehouse/transfers"
        class="flex items-center justify-center gap-2 px-5 py-3 h-14 rounded-2xl bg-surface-soft hover:bg-surface-strong text-text-base border border-border-subtle transition-all font-bold active:scale-95 shadow-sm shrink-0 w-full sm:w-auto"
      >
        <Clock size={18} class="text-brand-500" />
        Ver Historial
      </a>
    </div>
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
      <div class="space-y-6 max-w-5xl mx-auto" transition:fade={{ duration: 150 }}>
        
        <!-- SUBTITULOS FUERA DE LA CARD -->
        <div class="text-center space-y-2">
          <h2 class="text-3xl font-black text-text-base">Configuración de Sedes</h2>
          <p class="text-text-muted text-sm max-w-md mx-auto">Selecciona la sede y almacenes de origen y destino del traslado.</p>
        </div>

        <!-- CARD CON INPUTS EXCLUSIVAMENTE -->
        <div class="glass p-8 md:p-10 rounded-[32px] border border-white/5 shadow-2xl space-y-6 relative z-30">
          
          <!-- FILA 1: 4 SELECTS (25% en PC / lg:grid-cols-4, 50% en tablet / sm:grid-cols-2, 100% en móvil) -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <!-- 1. Sede Origen -->
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

            <!-- 2. Almacén Origen Global -->
            <div class="space-y-2">
              <label class="text-xs font-bold uppercase tracking-wider text-text-muted ml-1 flex items-center justify-between">
                <span>Almacén Origen (Salida)</span>
                {#if loadingSourceWarehouses}
                  <span class="text-[10px] text-brand-400 font-bold animate-pulse flex items-center gap-1">
                    <Loader2 size={12} class="animate-spin" /> Cargando...
                  </span>
                {/if}
              </label>
              <div class="relative">
                <select
                  value={globalSourceWarehouse}
                  onchange={(e) => handleGlobalSourceWarehouseChange(e.currentTarget.value)}
                  disabled={!sourceBranchId || sourceWarehouses.length === 0}
                  class="w-full h-14 bg-white/5 border border-white/5 rounded-2xl px-5 text-sm font-bold text-text-base focus:outline-none focus:ring-2 focus:ring-brand-500/50 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed pr-10"
                >
                  {#if sourceWarehouses.length === 0}
                    <option value="01">
                      {loadingSourceWarehouses ? 'Cargando almacenes...' : sourceBranchId ? 'ALMACEN PRINCIPAL (01)' : 'Seleccione Sede Origen'}
                    </option>
                  {:else}
                    {#each sourceWarehouses as alm}
                      <option value={alm.co_alma} class="bg-surface-dark text-white">
                        {alm.des_alma || alm.des_sub || alm.nombre || alm.co_alma} ({alm.co_alma})
                      </option>
                    {/each}
                  {/if}
                </select>
                <ChevronDown size={16} class="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            </div>

            <!-- 3. Sede Destino -->
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

            <!-- 4. Almacén Destino Global -->
            <div class="space-y-2">
              <label class="text-xs font-bold uppercase tracking-wider text-text-muted ml-1 flex items-center justify-between">
                <span>Almacén Destino (Entrada)</span>
                {#if loadingTargetWarehouses}
                  <span class="text-[10px] text-brand-400 font-bold animate-pulse flex items-center gap-1">
                    <Loader2 size={12} class="animate-spin" /> Cargando...
                  </span>
                {/if}
              </label>
              <div class="relative">
                <select
                  value={globalTargetWarehouse}
                  onchange={(e) => handleGlobalTargetWarehouseChange(e.currentTarget.value)}
                  disabled={!targetBranchId || targetWarehouses.length === 0}
                  class="w-full h-14 bg-white/5 border border-white/5 rounded-2xl px-5 text-sm font-bold text-text-base focus:outline-none focus:ring-2 focus:ring-brand-500/50 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed pr-10"
                >
                  {#if targetWarehouses.length === 0}
                    <option value="01">
                      {loadingTargetWarehouses ? 'Cargando almacenes...' : targetBranchId ? 'ALMACEN PRINCIPAL (01)' : 'Seleccione Sede Destino'}
                    </option>
                  {:else}
                    {#each targetWarehouses as alm}
                      <option value={alm.co_alma} class="bg-surface-dark text-white">
                        {alm.des_alma || alm.des_sub || alm.nombre || alm.co_alma} ({alm.co_alma})
                      </option>
                    {/each}
                  {/if}
                </select>
                <ChevronDown size={16} class="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            </div>
          </div>

          <!-- FILA 2: MOTIVO / OBSERVACIONES (100% en PC y Móvil) -->
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

        <!-- BARRA DE FILTROS (GRID ADAPTABLE CON BOTÓN IMPORTAR) -->
        <div class="glass p-4 rounded-3xl border border-border-subtle shadow-2xl flex flex-col xl:flex-row gap-4 items-stretch xl:items-center justify-between relative z-10">

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
            <!-- 0. Sede Origen Badge -->
            <div class="col-span-2 md:col-span-1">
              <div class="h-14 bg-surface-base rounded-2xl px-4 flex items-center gap-3 text-text-base font-bold text-sm border border-border-subtle">
                <Store size={18} class="text-brand-500 shrink-0" />
                <span class="truncate">{sourceBranchName}</span>
              </div>
            </div>

            <!-- 1. Buscador + Scanner -->
            <div class="flex items-center gap-2 col-span-2 md:col-span-1">
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
            <div class="col-span-1 md:col-span-1">
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
            <div class="col-span-1 md:col-span-1">
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

          <!-- Botón Importar Artículos en Barra de Filtros -->
          <button
            type="button"
            onclick={openImportModal}
            class="flex items-center justify-center gap-2 px-6 h-14 rounded-2xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 transition-all font-bold active:scale-95 shadow-sm shrink-0 cursor-pointer w-full xl:w-auto"
          >
            <FileSpreadsheet size={18} />
            Importar Artículos
          </button>
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

                <div class="h-40 bg-surface-soft rounded-[20px] flex items-center justify-center text-text-muted mb-4 group-hover:bg-brand-500/5 transition-colors overflow-hidden">
                  {#if article.campo7 && article.campo7.trim() !== ""}
                    <img
                      src={article.campo7.startsWith("http")
                        ? article.campo7
                        : `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/articulos/${article.campo7}`}
                      alt={article.art_des || article.descripcion}
                      class="w-full h-full object-contain p-2 drop-shadow-md group-hover:scale-105 transition-transform duration-500 cursor-pointer"
                      onclick={() => {
                        viewerUrl = article.campo7.startsWith("http")
                          ? article.campo7
                          : `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/articulos/${article.campo7}`;
                        viewerOpen = true;
                      }}
                      onerror={(e) => {
                        const target = e.currentTarget as HTMLElement;
                        if (target) target.style.display = "none";
                      }}
                    />
                  {:else}
                    <Package size={48} class="opacity-30 group-hover:scale-110 group-hover:text-brand-500 transition-all duration-500" />
                  {/if}
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
                        step={isDecimalAllowed(article) ? "0.5" : "1"}
                        min={isDecimalAllowed(article) ? "0.5" : "1"}
                        bind:value={qtyPerArticle[code]}
                        onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
                        onkeydown={(e) => {
                          if (!isDecimalAllowed(article) && (e.key === '.' || e.key === ',' || e.key === 'e' || e.key === 'E')) {
                            e.preventDefault();
                          }
                        }}
                        oninput={(e) => {
                          const inputEl = e.currentTarget as HTMLInputElement;
                          const minStep = isDecimalAllowed(article) ? 0.5 : 1;
                          const stock = curAlm?.stock || 0;
                          let val = parseFloat(inputEl.value);
                          if (isNaN(val) || val < minStep) return;
                          if (stock > 0 && val > stock) {
                            toast.warning(`Cantidad ajustada al stock (${stock})`);
                            qtyPerArticle[code] = roundQuantity(stock, article);
                          } else {
                            qtyPerArticle[code] = val;
                          }
                        }}
                        onblur={(e) => {
                          const inputEl = e.currentTarget as HTMLInputElement;
                          const v = parseFloat(inputEl.value);
                          qtyPerArticle[code] = roundQuantity(v, article);
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

        {#if invalidStockItems.length > 0}
          <div class="bg-red-500/10 border border-red-500/30 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-red-400">
            <div class="flex items-start gap-4">
              <div class="h-12 w-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                <AlertCircle size={24} />
              </div>
              <div>
                <h4 class="text-base font-black text-white">Stock Insuficiente Detectado ({invalidStockItems.length} artículo{invalidStockItems.length > 1 ? 's' : ''})</h4>
                <p class="text-xs text-red-300/80 mt-0.5">
                  Hay artículos cuya cantidad supera el stock disponible en el almacén de salida. Debes ajustar las cantidades o eliminarlos antes de procesar el traslado.
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0 w-full md:w-auto">
              <button
                type="button"
                onclick={autoFixStock}
                class="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer active:scale-95 shadow-lg shadow-red-500/20"
              >
                Ajustar al Máximo
              </button>
              <button
                type="button"
                onclick={removeOutOfStockItems}
                class="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-surface-soft hover:bg-red-500/20 text-red-300 hover:text-red-200 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer border border-red-500/30"
              >
                Eliminar Sin Stock
              </button>
            </div>
          </div>
        {/if}

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
              <!-- Sedes & Almacenes -->
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 border-b border-border-subtle pb-6">
                <div class="space-y-1">
                  <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block">Sede Origen (Salida)</span>
                  <span class="text-xl font-black text-brand-400">{sourceBranchName}</span>
                </div>
                <div class="space-y-1">
                  <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block">Almacén Origen (Salida)</span>
                  <span class="text-lg font-black text-text-base">{getSourceWarehouseName(globalSourceWarehouse)}</span>
                </div>
                <div class="space-y-1">
                  <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block">Sede Destino (Recepción)</span>
                  <span class="text-xl font-black text-brand-400">{targetBranchName}</span>
                </div>
                <div class="space-y-1">
                  <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block">Almacén Destino (Entrada)</span>
                  <span class="text-lg font-black text-text-base">{getTargetWarehouseName(globalTargetWarehouse)}</span>
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

          <!-- CARD 2: DETALLE DE RENGLONES -->
          <div class="glass rounded-[32px] border border-border-subtle overflow-hidden">
            <div class="p-6 md:p-8 border-b border-border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-surface-soft/50">
              <!-- Buscador en Renglones (reemplaza texto Renglones) -->
              <div class="relative flex-1 max-w-xl">
                <Search size={16} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  bind:value={cartSearchTerm}
                  placeholder={`Buscar artículo en renglones (${selectedItems.length})...`}
                  class="w-full h-12 pl-11 pr-10 rounded-2xl bg-surface-base border border-border-subtle focus:border-brand-500/50 outline-none text-xs font-bold text-text-base transition-all placeholder:text-text-muted"
                />
                {#if cartSearchTerm}
                  <button
                    type="button"
                    onclick={() => (cartSearchTerm = '')}
                    class="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors cursor-pointer"
                    title="Limpiar búsqueda"
                  >
                    <X size={14} />
                  </button>
                {/if}
              </div>

              <!-- Botón Agregar Artículo -->
              <button
                type="button"
                onclick={() => (activeTab = 1)}
                class="px-5 py-3 rounded-2xl bg-surface-soft hover:bg-surface-strong text-xs font-black uppercase text-brand-400 tracking-wider transition-all border border-border-subtle cursor-pointer shrink-0 flex items-center justify-center gap-2 shadow-sm"
              >
                <Plus size={14} />
                Agregar Artículo
              </button>
            </div>

            <div class="divide-y border-border-subtle">
              {#if selectedItems.length === 0}
                <div class="p-12 text-center text-text-muted text-sm font-bold">
                  No hay artículos en el traslado.
                </div>
              {:else if filteredSelectedItems.length === 0}
                <div class="p-12 text-center text-text-muted text-sm font-bold space-y-3">
                  <Search size={32} class="mx-auto text-text-muted opacity-40" />
                  <p>No se encontraron artículos que coincidan con "<span class="text-white font-black">{cartSearchTerm}</span>"</p>
                  <button
                    type="button"
                    onclick={() => (cartSearchTerm = '')}
                    class="text-xs font-bold text-brand-400 hover:underline cursor-pointer"
                  >
                    Limpiar búsqueda
                  </button>
                </div>
              {:else}
                {#each filteredSelectedItems as { item, originalIndex: idx } (item.co_art + '_' + item.co_alma_source + '_' + idx)}
                {@const artObj = displayArticles.find((a: any) => (a.co_art || a.codigo || '').trim() === item.co_art) || item.article}
                {@const rawAvail = getFilteredDisponibilidad(artObj)}
                {@const availList = (() => {
                  let list = Array.isArray(rawAvail) ? [...rawAvail] : [];
                  if (item.co_alma_source && !list.some((a: any) => (a.co_alma || a.id) === item.co_alma_source)) {
                    const realAlma = (data.context as any)?.warehouses?.find((w: any) => (w.co_alma || w.id) === item.co_alma_source);
                    list.unshift({
                      co_alma: item.co_alma_source,
                      des_alma: String(realAlma?.des_alma || realAlma?.des_sub || realAlma?.nombre || item.co_alma_source).trim(),
                      stock: item.stock_origen || 0
                    });
                  }
                  return list;
                })()}
                {@const stock = getItemStock(item, item.co_alma_source)}
                {@const hasStockError = Number(item.total_art) > stock || Number(item.total_art) <= 0}

                <div class="p-8 flex flex-col lg:flex-row items-start lg:items-center gap-8 transition-all group relative border-b border-border-subtle last:border-0 {hasStockError ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-surface-soft'}">
                  
                  <!-- Identidad del Producto y Selector de Cantidad -->
                  <div class="flex items-center gap-6 shrink-0 w-full lg:w-auto">
                    <div class="h-16 w-16 rounded-2xl flex items-center justify-center relative group-hover:scale-110 transition-transform duration-500 shrink-0 {hasStockError ? 'bg-red-500/15 text-red-400' : 'bg-surface-soft text-brand-400'}">
                      <div class="absolute inset-0 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity {hasStockError ? 'bg-red-500/20' : 'bg-brand-500/10'}"></div>
                      <Package size={28} />
                    </div>

                    <!-- Controles de Cantidad (- qty +) -->
                    <div class="flex items-center rounded-xl border h-12 overflow-hidden shadow-inner shrink-0 {hasStockError ? 'border-red-500/50 bg-red-500/10 ring-1 ring-red-500/30' : 'bg-surface-base/40 border-border-subtle'}">
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
                        min={isDecimalAllowed(item) ? "0.5" : "1"}
                        max={stock > 0 ? stock : undefined}
                        step={isDecimalAllowed(item) ? "0.5" : "1"}
                        bind:value={item.total_art}
                        onkeydown={(e) => {
                          if (!isDecimalAllowed(item) && (e.key === '.' || e.key === ',' || e.key === 'e' || e.key === 'E')) {
                            e.preventDefault();
                          }
                        }}
                        oninput={(e) => {
                          const inputEl = e.currentTarget as HTMLInputElement;
                          let v = parseFloat(inputEl.value);
                          if (!isNaN(v)) {
                            updateItemQty(idx, v);
                            if (inputEl.value !== String(item.total_art)) {
                              inputEl.value = String(item.total_art);
                            }
                          }
                        }}
                        onblur={(e) => {
                          const inputEl = e.currentTarget as HTMLInputElement;
                          let v = parseFloat(inputEl.value);
                          const rounded = roundQuantity(v, item);
                          updateItemQty(idx, rounded);
                          inputEl.value = String(item.total_art);
                        }}
                        class="w-16 text-center text-base font-black bg-transparent outline-none no-arrows {hasStockError ? 'text-red-400' : 'text-brand-400'}"
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
                        <span class="text-text-muted">{item.co_uni && item.co_uni !== '01' ? item.co_uni : (item.article?.unidad || item.article?.des_uni || 'UND')}</span>
                        <span class="h-1 w-1 rounded-full bg-border-subtle"></span>
                        <span class="{stock > 0 ? 'text-emerald-400' : 'text-red-400'} font-mono">Stock en {getSourceWarehouseName(item.co_alma_source)}: {stock} ud</span>
                      </div>

                      {#if hasStockError}
                        <div class="flex flex-wrap items-center gap-2 text-xs font-bold text-red-400 bg-red-500/10 px-3 py-1.5 rounded-xl border border-red-500/20 mt-2">
                          <AlertCircle size={14} class="shrink-0" />
                          <span>
                            {stock <= 0
                              ? `Sin stock disponible en almacén "${getSourceWarehouseName(item.co_alma_source)}"`
                              : `Cantidad (${item.total_art}) excede el stock disponible en "${getSourceWarehouseName(item.co_alma_source)}" (${stock} ud)`}
                          </span>
                          {#if stock > 0}
                            <button
                              type="button"
                              onclick={() => updateItemQty(idx, stock)}
                              class="ml-auto px-2 py-0.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                            >
                              Ajustar a {stock} ud
                            </button>
                          {:else}
                            <button
                              type="button"
                              onclick={() => removeItem(idx)}
                              class="ml-auto px-2 py-0.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                            >
                              Quitar
                            </button>
                          {/if}
                        </div>
                      {/if}
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
                              {alm.des_alma || getSourceWarehouseName(alm.co_alma)} ({alm.stock ?? item.stock_origen ?? 0})
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
              {/if}
            </div>
          </div>

          <!-- BOTONES DE ACCIÓN (3 BOTONES EXACTO A COTIZACIONES) -->
          <div class="pt-6 space-y-4 relative z-10">
            {#if !isFormValid}
              <div class="text-center text-xs font-bold text-red-400 flex items-center justify-center gap-2 py-1 bg-red-500/10 border border-red-500/20 rounded-xl px-4">
                <AlertCircle size={15} class="shrink-0" />
                {#if invalidStockItems.length > 0}
                  <span>No se puede procesar: Hay {invalidStockItems.length} artículo(s) con cantidad superior al stock disponible.</span>
                {:else if selectedItems.length === 0}
                  <span>Debes incluir al menos un artículo en el traslado.</span>
                {:else}
                  <span>Verifica que las sedes de origen y destino sean válidas y distintas.</span>
                {/if}
              </div>
            {/if}

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

<!-- ========================================== -->
<!-- MODAL DE IMPORTACIÓN DE ARTÍCULOS (EXCEL / CSV) -->
<!-- ========================================== -->
{#if showImportModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
    in:fade={{ duration: 150 }}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0"
      onclick={closeImportModal}
    ></div>

    <div
      class="w-full max-w-2xl bg-surface-base border border-border-subtle rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative z-10"
      in:scale={{ duration: 200, start: 0.95 }}
    >
      <!-- Modal Header -->
      <div class="p-6 md:p-8 border-b border-border-subtle flex justify-between items-center bg-surface-soft/50">
        <div class="flex items-center gap-3">
          <div class="h-12 w-12 rounded-2xl bg-brand-500/10 text-brand-400 flex items-center justify-center border border-brand-500/20">
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <h2 class="text-xl md:text-2xl font-black tracking-tight text-text-base">
              Importar Artículos
            </h2>
            <p class="text-text-muted text-xs md:text-sm">
              Carga un archivo Excel (.xlsx, .xls) o CSV para añadir artículos al traslado
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={closeImportModal}
          class="p-2 hover:bg-surface-strong rounded-full transition-colors cursor-pointer text-text-muted hover:text-text-base"
        >
          <X size={22} />
        </button>
      </div>

      <!-- Contenido Modal -->
      <div class="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar">

        {#if importErrorMsg}
          <div class="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3 text-red-400 font-bold text-xs md:text-sm" transition:slide>
            <AlertCircle size={20} class="shrink-0" />
            <span>{importErrorMsg}</span>
          </div>
        {/if}

        <!-- ETAPA 1: SUBIDA / DROPZONE -->
        {#if importStage === 'upload'}
          <div class="space-y-6">
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="border-2 border-dashed rounded-[28px] p-8 md:p-12 flex flex-col items-center justify-center text-center transition-all cursor-pointer group {isDragging ? 'border-brand-500 bg-brand-500/10' : 'border-border-subtle hover:border-brand-500/50 bg-surface-soft/30 hover:bg-surface-soft/60'}"
              ondragover={(e) => { e.preventDefault(); isDragging = true; }}
              ondragleave={() => (isDragging = false)}
              ondrop={handleFileDrop}
              onclick={() => document.getElementById('excelFileInput')?.click()}
            >
              <input
                id="excelFileInput"
                type="file"
                accept=".xlsx,.xls,.csv"
                class="hidden"
                onchange={handleFileInputChange}
              />

              <div class="h-20 w-20 rounded-3xl bg-brand-500/10 text-brand-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 border border-brand-500/20 shadow-lg shadow-brand-500/5">
                {#if isReadingFile}
                  <Loader2 size={36} class="animate-spin text-brand-500" />
                {:else}
                  <UploadCloud size={40} />
                {/if}
              </div>

              <h3 class="text-lg font-black text-text-base mb-1">
                Arrastra tu archivo aquí o <span class="text-brand-400 underline decoration-brand-500/40">selecciónalo</span>
              </h3>
              <p class="text-xs text-text-muted font-medium max-w-sm">
                Formatos compatibles: Microsoft Excel (.xlsx, .xls) y archivos delimitados (.csv).
              </p>

              <div class="mt-6 flex flex-wrap items-center justify-center gap-2">
                <span class="px-3 py-1 rounded-xl bg-surface-base border border-border-subtle text-[11px] font-mono font-bold text-text-muted">
                  .XLSX
                </span>
                <span class="px-3 py-1 rounded-xl bg-surface-base border border-border-subtle text-[11px] font-mono font-bold text-text-muted">
                  .XLS
                </span>
                <span class="px-3 py-1 rounded-xl bg-surface-base border border-border-subtle text-[11px] font-mono font-bold text-text-muted">
                  .CSV
                </span>
              </div>
            </div>

            <!-- Tips & Information Box -->
            <div class="p-4 rounded-2xl bg-surface-soft/40 border border-border-subtle flex items-start gap-3">
              <div class="p-2 rounded-xl bg-brand-500/10 text-brand-400 shrink-0">
                <Tag size={16} />
              </div>
              <div class="text-xs space-y-1">
                <p class="font-bold text-text-base">Mapeo flexible de columnas:</p>
                <p class="text-text-muted leading-relaxed">
                  Tu archivo solo necesita contener una columna con los <strong>códigos de artículo</strong> y otra con las <strong>cantidades</strong>. En el siguiente paso podrás elegir exactamente qué columnas usar.
                </p>
              </div>
            </div>
          </div>
        {/if}

        <!-- ETAPA 2: MAPEO DE COLUMNAS & PREVIEW -->
        {#if importStage === 'mapping'}
          <div class="space-y-6" transition:fade={{ duration: 150 }}>
            
            <!-- Info del archivo cargado -->
            <div class="p-4 rounded-2xl bg-surface-soft border border-border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <div class="h-10 w-10 rounded-xl bg-brand-500/10 text-brand-400 flex items-center justify-center shrink-0 border border-brand-500/20">
                  <FileText size={20} />
                </div>
                <div class="min-w-0">
                  <p class="text-xs font-black text-text-base truncate">{importFileName}</p>
                  <p class="text-[10px] text-text-muted font-bold">
                    {parsedRawRows.length} fila(s) detectada(s) · {detectedColumns.length} columna(s)
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                {#if importSheets.length > 1}
                  <select
                    value={selectedSheet}
                    onchange={(e) => handleSheetChange(e.currentTarget.value)}
                    class="h-9 px-3 rounded-xl bg-surface-base text-xs font-bold text-text-base border border-border-subtle outline-none cursor-pointer"
                  >
                    {#each importSheets as sheet}
                      <option value={sheet}>Hoja: {sheet}</option>
                    {/each}
                  </select>
                {/if}

                <button
                  type="button"
                  onclick={() => (importStage = 'upload')}
                  class="px-3 py-1.5 rounded-xl bg-surface-base hover:bg-surface-strong text-[11px] font-bold text-text-muted hover:text-text-base border border-border-subtle transition-all cursor-pointer"
                >
                  Cambiar archivo
                </button>
              </div>
            </div>

            <!-- SELECTORES DE COLUMNAS (INTERACTIVO) -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              <!-- Selector Columna Código -->
              <div class="glass p-5 rounded-2xl border border-border-subtle space-y-2 relative">
                <div class="flex items-center justify-between">
                  <label class="text-[10px] font-black uppercase tracking-wider text-brand-400 block">
                    Columna de Código *
                  </label>
                  <span class="text-[9px] font-bold text-text-muted uppercase">Requerido</span>
                </div>
                <div class="relative">
                  <select
                    bind:value={selectedCodeCol}
                    class="w-full h-12 bg-surface-base rounded-xl px-4 text-xs font-black text-text-base border border-border-subtle appearance-none cursor-pointer focus:border-brand-500/50 outline-none transition-all pr-10"
                  >
                    {#each detectedColumns as col}
                      <option value={col}>{col}</option>
                    {/each}
                  </select>
                  <ChevronDown size={16} class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
                <p class="text-[10px] text-text-muted">Identifica el código o SKU del producto en Profit.</p>
              </div>

              <!-- Selector Columna Cantidad -->
              <div class="glass p-5 rounded-2xl border border-border-subtle space-y-2 relative">
                <div class="flex items-center justify-between">
                  <label class="text-[10px] font-black uppercase tracking-wider text-brand-400 block">
                    Columna de Cantidad *
                  </label>
                  <span class="text-[9px] font-bold text-text-muted uppercase">Requerido</span>
                </div>
                <div class="relative">
                  <select
                    bind:value={selectedQtyCol}
                    class="w-full h-12 bg-surface-base rounded-xl px-4 text-xs font-black text-text-base border border-border-subtle appearance-none cursor-pointer focus:border-brand-500/50 outline-none transition-all pr-10"
                  >
                    {#each detectedColumns as col}
                      <option value={col}>{col}</option>
                    {/each}
                  </select>
                  <ChevronDown size={16} class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
                <p class="text-[10px] text-text-muted">Unidades numéricas a transferir por artículo.</p>
              </div>

            </div>

            <!-- PREVISUALIZACIÓN EN VIVO DE LAS PRIMERAS 5 FILAS -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-black uppercase tracking-wider text-text-muted flex items-center gap-2">
                  <Layers size={14} />
                  Previsualización (Primeras 5 filas)
                </h4>
                <span class="text-[11px] font-bold text-brand-400">
                  {totalValidRowsInFile} fila(s) listas para procesar
                </span>
              </div>

              <div class="border border-border-subtle rounded-2xl overflow-hidden bg-surface-base/50">
                <table class="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr class="bg-surface-soft/80 border-b border-border-subtle text-[10px] font-black uppercase tracking-wider text-text-muted">
                      <th class="p-3 w-12 text-center">Fila</th>
                      <th class="p-3">Código ({selectedCodeCol || '---'})</th>
                      <th class="p-3 text-right">Cantidad ({selectedQtyCol || '---'})</th>
                      <th class="p-3 text-center w-28">Estado</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border-subtle">
                    {#if mappingPreview.length === 0}
                      <tr>
                        <td colspan="4" class="p-4 text-center text-text-muted">
                          No hay datos disponibles para previsualizar.
                        </td>
                      </tr>
                    {:else}
                      {#each mappingPreview as row}
                        <tr class="hover:bg-surface-soft/40 transition-colors font-mono text-[11px]">
                          <td class="p-3 text-center text-text-muted">{row.rowNumber}</td>
                          <td class="p-3 font-bold text-text-base font-sans">
                            {row.rawCode || '<vacío>'}
                          </td>
                          <td class="p-3 text-right font-black text-brand-400">
                            {row.rawQty || '0'}
                          </td>
                          <td class="p-3 text-center">
                            {#if row.rawCode && row.isValidQty}
                              <span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                                Válido
                              </span>
                            {:else}
                              <span class="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold">
                                Omitir
                              </span>
                            {/if}
                          </td>
                        </tr>
                      {/each}
                    {/if}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        {/if}

      </div>

      <!-- Modal Footer -->
      <div class="p-6 border-t border-border-subtle bg-surface-soft/40 flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          type="button"
          onclick={closeImportModal}
          class="w-full sm:w-auto px-6 h-12 rounded-xl text-text-muted hover:bg-surface-strong text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
        >
          Cancelar
        </button>

        {#if importStage === 'mapping'}
          <button
            type="button"
            disabled={isImportingToCart || !selectedCodeCol || totalValidRowsInFile === 0}
            onclick={processAndImportItems}
            class="w-full sm:w-auto px-8 h-12 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50 disabled:grayscale"
          >
            {#if isImportingToCart}
              <Loader2 size={16} class="animate-spin" />
              <span>Consultando Artículos...</span>
            {:else}
              <Check size={16} />
              <span>Importar y Validar en Confirmación</span>
              <ArrowRight size={14} />
            {/if}
          </button>
        {/if}
      </div>

    </div>
  </div>
{/if}

<ImageViewer bind:isOpen={viewerOpen} imageUrl={viewerUrl} />

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
