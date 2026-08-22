<script lang="ts">
  import { untrack } from "svelte";
  import { enhance } from "$app/forms";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { fade, slide, scale } from "svelte/transition";
  import {
    Package,
    Search,
    Store,
    Box,
    AlertCircle,
    ShoppingBag,
    ArrowDownAZ,
    ArrowUpAZ,
    Plus,
    Minus,
    ImagePlus,
    ListFilter,
    User,
    MapPin,
    Phone,
    Mail,
    Check,
    ChevronRight,
    ChevronLeft,
    ChevronDown,
    CreditCard,
    Tag,
    FileText,
    Trash2,
    Loader2,
    Info,
    ShoppingCart,
    Globe,
    LayoutGrid,
    ShieldCheck,
    UserCircle,
    Clock,
    Users,
    X,
    Briefcase,
    Building2,
    DollarSign,
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import SearchBar from "$lib/components/ui/SearchBar.svelte";
  import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";
  import ImageViewer from "$lib/components/ui/ImageViewer.svelte";
  import dayjs from "dayjs";
  import "dayjs/locale/es";
  import type { PageData } from "./$types";
  import { PUBLIC_SUPABASE_URL } from "$env/static/public";

  dayjs.locale("es");

  let { data }: { data: PageData } = $props();

  // --- ESTADO GLOBAL ---
  let activeTab = $state(0); // 0: Proveedor, 1: Artículos, 2: Confirmación
  let searchTerm = $state($page.url.searchParams.get("search") || "");
  let isSearching = $state(false);
  let viewerOpen = $state(false);
  let viewerUrl = $state("");

  // --- CONTEXTO (Sedes/Almacenes) ---
  let selectedBranch = $state(data.selectedBranchId || "");
  let selectedWarehouse = $state("");

  let selectedBranchConfig = $derived(
    Array.isArray(data.branches)
      ? data.branches.find((b: any) => b.id === selectedBranch)
      : null,
  );

  $effect(() => {
    const branches = data.branches || [];
    if (branches.length === 1) {
      selectedBranch = branches[0].id;
    } else {
      selectedBranch =
        data.context?.branchId || $page.url.searchParams.get("branch_id") || "";
    }

    selectedWarehouse =
      data.context?.warehouseId || $page.url.searchParams.get("co_alma") || "";
  });

  // Limpiar proveedor al cambiar de sede si estamos en el paso 1
  $effect(() => {
    if (activeTab === 0 && selectedBranch) {
      selectedSupplier = null;
      showRegistrationForm = false;
    }
  });
  let selectedLinea = $state($page.url.searchParams.get("linea") || "");
  let selectedCategoria = $state($page.url.searchParams.get("categoria") || "");

  const filteredCategorias = $derived(
    !selectedLinea
      ? data.context?.categorias || []
      : (data.context?.categorias || []).filter((c) =>
          c.co_cat?.startsWith(parseInt(selectedLinea, 10).toString()),
        ),
  );

  let sortOption = $state<"relevance" | "price_asc" | "price_desc">(
    ($page.url.searchParams.get("sort") as any) || "relevance",
  );
  let showUSD = $state(true);
  let dragX = $state(32);
  let dragY = $state(90);
  let activeDrag = false;
  let startX = 0;
  let startY = 0;
  let startDragX = 32;
  let startDragY = 90;

  $effect(() => {
    if (typeof window !== 'undefined') {
      const savedX = localStorage.getItem('currency_switch_x');
      const savedY = localStorage.getItem('currency_switch_y');
      if (savedX) dragX = parseInt(savedX, 10);
      if (savedY) dragY = parseInt(savedY, 10);
    }
  });

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    activeDrag = true;
    startX = e.clientX;
    startY = e.clientY;
    startDragX = dragX;
    startDragY = dragY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!activeDrag) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    dragX = Math.max(16, Math.min(window.innerWidth - 180, startDragX - dx));
    dragY = Math.max(16, Math.min(window.innerHeight - 80, startDragY - dy));
  }

  function onPointerUp(e: PointerEvent) {
    if (!activeDrag) return;
    activeDrag = false;
    localStorage.setItem('currency_switch_x', dragX.toString());
    localStorage.setItem('currency_switch_y', dragY.toString());
  }

  let orderTaxRate = $state(16);
  let orderDescription = $state("ORDEN DE COMPRA WEB");
  let orderComment = $state("");
  let orderNControl = $state("");
  let orderDeliveryAddress = $state("");
  let orderPaymentCondition = $state("01");
  let masterBranchId = $state("");

  // --- PASO 1: PROVEEDOR ---
  let rifInput = $state("");
  let searchingSupplier = $state(false);
  let selectedSupplier = $state<any>(null);
  let showRegistrationForm = $state(false);
  let matchingSuppliers = $state<any[]>([]);
  let showSupplierSelectionModal = $state(false);

  // --- PASO 2: ARTÍCULOS Y CARRITO ---
  let quantities = $state<Record<string, number>>({});
  let selectedItemWarehouse = $state<Record<string, string>>({});
  let selectedItemPriceIndex = $state<Record<string, number>>({});
  let itemCosts = $state<Record<string, number>>({});
  let cart = $state<any[]>([]);
  let lastLoadedDoc = $state("");
  let isInitializing = false;

  // --- BUSCADOR EN RENGLONES (CARRITO) ---
  let cartSearchTerm = $state('');

  let filteredCart = $derived.by(() => {
    const term = cartSearchTerm.trim().toLowerCase();
    if (!term) return cart.map((item, originalIndex) => ({ item, originalIndex }));
    return cart
      .map((item, originalIndex) => ({ item, originalIndex }))
      .filter(({ item }) => {
        const code = String(item.article?.co_art || item.article?.codigo || item.co_art || '').toLowerCase();
        const desc = String(item.article?.art_des || item.article?.descripcion || item.art_des || '').toLowerCase();
        return code.includes(term) || desc.includes(term);
      });
  });

  onMount(() => {
    const o = data.preloadedOrder;
    if (o && o.doc_num !== lastLoadedDoc) {
      if (isInitializing) return;
      isInitializing = true;
      activeTab = 2;
      lastLoadedDoc = o.doc_num;
      
      localStorage.removeItem("profit_order_draft");
      toast.info(`Editando Orden de Compra #${o.doc_num}`);

      try {
        rifInput = String(o.co_prov || o.rif || "").trim();
        showUSD = String(o.co_mone || "").toUpperCase().includes("US");
        orderTaxRate = (Number(o.monto_imp) || 0) === 0 ? 0 : 16;
        orderDescription = String(o.descrip || "ORDEN DE COMPRA WEB").trim();
        orderComment = String(o.comentario || "").trim();
        orderNControl = String(o.n_control || "").trim();
        orderDeliveryAddress = String(o.dir_ent || "").trim();
        orderPaymentCondition = String(o.co_cond || "01").trim();

        selectedSupplier = {
          co_prov: String(o.co_prov || "").trim(),
          prov_des: String(o.prov_des || "").trim(),
          descripcion: String(o.prov_des || "").trim(),
          rif: String(o.rif || o.co_prov || "").trim(),
          direc1: String(o.direc1 || o.dir_ent || "").trim(),
          telefonos: String(o.telefonos || "N/A").trim(),
          email: String(o.email || "N/A").trim(),
          co_zon: String(o.co_zon || "").trim(),
          zon_des: String(o.zon_des || "").trim(),
          contribu_e: !!o.contribu_e,
          porc_esp: Number(o.porc_esp || 0),
          co_cond: String(o.co_cond || "01").trim(),
          cond_des: String(o.cond_des || "Contado").trim(),
          co_mone: String(o.co_mone || "BS").trim(),
        };

        if (o.renglones && Array.isArray(o.renglones) && o.renglones.length > 0) {
          cart = o.renglones.map((r: any) => {
            const artId = String(r.co_art || "").trim();
            const almaId = String(r.co_alma || "").trim();

            quantities[artId] = Number(r.cantidad || 1);
            selectedItemWarehouse[artId] = almaId;
            selectedItemPriceIndex[artId] = 0;

            const realAlma = data.context?.warehouses?.find(
              (w: any) => String(w.co_alma || "").trim() === almaId,
            );

            const costVal = showUSD ? Number(r.cost_unit_om || (r.cost_unit / (o.tasa || 1)) || 0) : Number(r.cost_unit || r.precio || 0);

            return {
              co_art: artId,
              co_lin: String(r.co_lin || "").trim(),
              co_subl: String(r.co_subl || "").trim(),
              art_des: String(r.art_des || "").trim(),
              qty: Number(r.cantidad || 0),
              precio_ves: Number(r.cost_unit || r.precio || 0),
              precio_usd: Number(r.cost_unit_om || 0),
              porc_imp: Number(r.porc_imp ?? 16),
              co_alma_selected: almaId,
              co_uni: String(r.co_uni || "UND").trim(),
              unidad: String(r.unidad || r.co_uni || "UND").trim(),
              price_selected: {
                precio: Number(r.cost_unit_om || 0),
                precio_ves: Number(r.cost_unit || r.precio || 0),
                id_precio: "01",
              },
              co_precio: "01",
              disponibilidad: [
                {
                  co_alma: almaId,
                  des_alma: String(realAlma?.des_alma || almaId).trim(),
                  stock: Number(r.cantidad || 0),
                },
              ],
              precios: [
                {
                  id_precio: "01",
                  precio: Number(r.cost_unit_om || 0),
                  precio_ves: Number(r.cost_unit || r.precio || 0),
                  moneda: String(o.co_mone || "BS"),
                },
              ],
            };
          });
        }

        rehydrateCart();
      } catch (err: any) {
        console.error("Error preloading order:", err);
      } finally {
        isInitializing = false;
      }
    }
  });

  async function rehydrateCart() {
    if (!cart.length) return;
    const branchId = selectedBranch || data.selectedBranchId;

    for (let i = 0; i < cart.length; i++) {
      const item = cart[i];
      try {
        const co = item.co_art.trim();
        const res = await fetch(
          `/api/agent/articles?co_art=${encodeURIComponent(co)}&branch_id=${branchId}`,
        );
        const d = await res.json();
        if (d.success && d.data && d.data.length > 0) {
          const fresh = d.data.find((a: any) => a.co_art?.trim() === co) || d.data[0];
          const allowedIds = (data.context?.warehouses || []).map((w: any) =>
            String(w.co_alma || "").trim().toUpperCase(),
          );
          let validDispo = (fresh.disponibilidad || []).filter(
            (disp: any) =>
              allowedIds.includes(String(disp.co_alma || "").trim().toUpperCase()) && Number(disp.stock || 0) > 0,
          );

          const currentAlmaCode = String(item.co_alma_selected || "01").trim().toUpperCase();
          const hasCurrentInDispo = validDispo.some(
            (d: any) => String(d.co_alma || "").trim().toUpperCase() === currentAlmaCode,
          );

          if (!hasCurrentInDispo) {
            const freshSel = fresh.disponibilidad?.find(
              (d: any) => String(d.co_alma || "").trim().toUpperCase() === currentAlmaCode,
            );
            const contextSel = data.context?.warehouses?.find(
              (w: any) => String(w.co_alma || "").trim().toUpperCase() === currentAlmaCode,
            );
            validDispo.unshift({
              co_alma: item.co_alma_selected || currentAlmaCode,
              des_alma: String(freshSel?.des_alma || contextSel?.des_alma || contextSel?.nombre || currentAlmaCode).trim(),
              stock: Number(freshSel?.stock ?? 0),
            });
          }

          cart[i] = {
            ...cart[i],
            co_lin: fresh.co_lin || cart[i].co_lin,
            co_subl: fresh.co_subl || cart[i].co_subl,
            art_des: fresh.descripcion || fresh.art_des || cart[i].art_des,
            disponibilidad: validDispo,
            precios: fresh.precios && fresh.precios.length > 0 ? fresh.precios : cart[i].precios,
            unidad: fresh.unidad || cart[i].unidad,
            porc_imp: fresh.tipo_imp === "7" ? 0 : (fresh.porc_imp ?? cart[i].porc_imp),
          };
        }
      } catch (e) {
        console.error(`Error rehydrating ${item.co_art}:`, e);
      }
    }
  }

  let newSupplier = $state({
    co_prov: "",
    rif: "",
    descripcion: "",
    prov_des: "",
    respons: "",
    telefonos: "",
    email: "",
    direccion: "",
    direc1: "",
    co_zon: "",
    co_seg: "01",
    cond_pag: "01",
    tip_pro: "",
    contribuyente: false,
    contribu_e: false,
    tipo_per: "3",
    porc_esp: 75,
  });

  $effect(() => {
    newSupplier.prov_des = newSupplier.descripcion;
  });

  $effect(() => {
    newSupplier.direc1 = newSupplier.direccion;
  });

  $effect(() => {
    newSupplier.contribu_e = newSupplier.contribuyente;
  });

  $effect(() => {
    if (rifInput) {
      const standardized = rifInput.toUpperCase().replace(/[-\s]/g, "");
      if (standardized !== rifInput) rifInput = standardized;
    }
  });

  let localArticles = $state<any[]>(data.articles || []);
  let localPagination = $state(
    data.pagination || { total: 0, page: 1, limit: 12, totalPages: 0 },
  );
  let loadingArticles = $state(false);

  const displayArticles = $derived.by(() => {
    if (!localArticles || localArticles.length === 0) return [];
    return localArticles.filter(
      (a: any, i: number, ar: any[]) =>
        ar.findIndex((b) => (b.co_art || b.codigo) === (a.co_art || a.codigo)) === i,
    );
  });

  function getSuggestedUnitCost(art: any): number {
    // 1. Si tiene último costo de compra registrado en saFacturaCompra
    const ultCost = Number(art.ultimo_costo_om ?? art.cost_unit_om ?? 0);
    if (ultCost > 0) return ultCost;

    // 2. Si no tiene costo o es 0 -> calcular Precio 2 / Margen 2
    const pList = art.precios || [];
    const p2Obj = pList.find((p: any) => p.id_precio === '02' || p.id_precio === '2') || pList[1] || pList[0];
    const p2 = Number(p2Obj?.precio ?? art.prec2 ?? 0);
    const m2 = Number(p2Obj?.margen ?? art.margen2 ?? 0);

    if (p2 > 0 && m2 > 0) {
      const costCalculated = m2 > 1 ? (p2 / (1 + (m2 / 100))) : (p2 / m2);
      return Number(costCalculated.toFixed(2));
    }

    // 3. Fallback
    if (Number(art.costo_sugerido_usd ?? 0) > 0) return Number(art.costo_sugerido_usd);
    if (p2 > 0) return p2;
    const p1 = Number(pList[0]?.precio ?? 0);
    return p1 > 0 ? p1 : 0;
  }

  $effect(() => {
    if (localArticles && localArticles.length > 0) {
      localArticles.forEach((art) => {
        const co = art.co_art || art.codigo;
        if (itemCosts[co] === undefined) {
          const costUSD = getSuggestedUnitCost(art);
          const tasa = Number(art.tasa_bcv || 1);
          itemCosts[co] = showUSD ? costUSD : Number((costUSD * tasa).toFixed(2));
        }
        if (selectedItemWarehouse[co] === undefined) {
          selectedItemWarehouse[co] = art.disponibilidad?.[0]?.co_alma || (data.context?.warehouses?.[0]?.co_alma || "01");
        }
        const step = getStep(art);
        if (quantities[co] === undefined || quantities[co] < step) quantities[co] = step;
      });
    }
  });

  function getStep(art: any): number {
    const uni = String(art.unidad || art.co_uni || "").trim().toUpperCase();
    if (uni === "M" || uni === "KG" || uni === "L" || uni === "METRO") return 0.5;
    return 1;
  }

  function handleSearch(e?: Event) {
    if (e) e.preventDefault();
    const u = new URL($page.url);
    if (selectedBranch) u.searchParams.set("branch_id", selectedBranch);
    if (searchTerm) u.searchParams.set("search", searchTerm);
    else u.searchParams.delete("search");
    if (selectedLinea) u.searchParams.set("linea", selectedLinea);
    else u.searchParams.delete("linea");
    if (selectedCategoria) u.searchParams.set("categoria", selectedCategoria);
    else u.searchParams.delete("categoria");
    u.searchParams.set("page", "1");
    goto(u.toString());
  }

  // Carga reactiva de catálogo al cambiar parámetros
  $effect(() => {
    const pSearch = $page.url.searchParams.get("search") || "";
    const pLinea = $page.url.searchParams.get("linea") || "";
    const pCat = $page.url.searchParams.get("categoria") || "";
    const pSort = $page.url.searchParams.get("sort") || "";
    const pPage = $page.url.searchParams.get("page") || "1";
    const pBranch = $page.url.searchParams.get("branch_id") || selectedBranch;

    if (activeTab === 1 && pBranch) {
      loadArticles(pBranch, pSearch, pLinea, pCat, pSort, pPage);
    }
  });

  async function loadArticles(branch: string, search: string, linea: string, cat: string, sort: string, pageNum: string) {
    loadingArticles = true;
    try {
      const params = new URLSearchParams({
        branch_id: branch,
        search,
        linea,
        categoria: cat,
        sort,
        page: pageNum,
        limit: "12",
        in_stock: "all"
      });

      const res = await fetch(`/api/agent/articles?${params.toString()}`);
      const json = await res.json();
      if (json.success || Array.isArray(json.data) || json.items) {
        localArticles = json.data || json.items || [];
        localPagination = json.pagination || { total: localArticles.length, page: parseInt(pageNum), limit: 12, totalPages: Math.ceil(localArticles.length / 12) || 1 };
      }
    } catch (e) {
      console.error("Error loading articles:", e);
    } finally {
      loadingArticles = false;
    }
  }

  function addToCart(article: any) {
    const code = article.co_art || article.codigo;
    const qty = quantities[code] || getStep(article);
    const warehouse = selectedItemWarehouse[code] || article.disponibilidad?.[0]?.co_alma || (data.context?.warehouses?.[0]?.co_alma || "01");
    const tasa = Number(article.tasa_bcv || 1);

    const enteredCost = Number(itemCosts[code] ?? getSuggestedUnitCost(article));
    const costUSD = showUSD ? enteredCost : (tasa > 0 ? Number((enteredCost / tasa).toFixed(4)) : enteredCost);
    const costVES = showUSD ? Number((enteredCost * tasa).toFixed(2)) : enteredCost;

    const existingIndex = cart.findIndex(
      (item) => (item.article?.co_art || item.co_art) === code && (item.warehouse || item.co_alma_selected) === warehouse,
    );

    if (existingIndex >= 0) {
      cart[existingIndex].qty += qty;
      cart[existingIndex].precio_usd = costUSD;
      cart[existingIndex].precio_ves = costVES;
      cart[existingIndex].price_selected = {
        precio: costUSD,
        precio_ves: costVES,
        id_precio: "01"
      };
    } else {
      cart.push({
        article,
        co_art: code,
        art_des: article.art_des || article.descripcion,
        qty,
        precio_usd: costUSD,
        precio_ves: costVES,
        price_selected: {
          precio: costUSD,
          precio_ves: costVES,
          id_precio: "01"
        },
        co_alma_selected: warehouse,
        co_uni: article.unidad || article.co_uni || "UND",
        unidad: article.unidad || article.co_uni || "UND",
        porc_imp: article.tipo_imp === "7" ? 0 : 16,
        disponibilidad: article.disponibilidad || [],
        precios: article.precios || []
      });
    }

    toast.success(`${article.art_des || code} añadido a la orden`);
  }

  function removeFromCart(index: number) {
    cart.splice(index, 1);
  }

  function updateCartQty(index: number, newQty: number) {
    if (index < 0 || index >= cart.length) return;
    const item = cart[index];
    const step = getStep(item.article || item);
    if (newQty > 0) {
      item.qty = Math.round(newQty * 100) / 100;
    } else {
      removeFromCart(index);
    }
  }

  function updateCartWarehouse(index: number, co_alma: string) {
    if (index < 0 || index >= cart.length) return;
    cart[index].co_alma_selected = co_alma;
  }

  function updateCartCost(index: number, newCost: number) {
    if (index < 0 || index >= cart.length) return;
    const item = cart[index];
    const tasa = Number(item.article?.tasa_bcv || 1);
    const costUSD = showUSD ? newCost : (tasa > 0 ? Number((newCost / tasa).toFixed(4)) : newCost);
    const costVES = showUSD ? Number((newCost * tasa).toFixed(2)) : newCost;

    item.precio_usd = costUSD;
    item.precio_ves = costVES;
    item.price_selected = {
      precio: costUSD,
      precio_ves: costVES,
      id_precio: "01"
    };
  }

  const totals = $derived(() => {
    let subUSD = 0;
    let subBS = 0;
    let ivaUSD = 0;
    let ivaBS = 0;

    cart.forEach((item) => {
      const isStrictlyExempt =
        (item.co_subl || "").trim() === "0901" ||
        (item.co_art || "").startsWith("0901");

      const rate = isStrictlyExempt ? 0 : orderTaxRate;

      const pUSD = Number(item.price_selected?.precio || item.precio_usd || 0);
      const pBS = Number(item.price_selected?.precio_ves || item.precio_ves || 0);

      const baseUSD = (item.qty || 1) * pUSD;
      const baseBS = (item.qty || 1) * pBS;

      subUSD += baseUSD;
      subBS += baseBS;
      ivaUSD += baseUSD * (rate / 100);
      ivaBS += baseBS * (rate / 100);
    });

    const porcEsp = selectedSupplier?.porc_esp ? Number(selectedSupplier.porc_esp) : 0;
    const retencionUSD = ivaUSD * (porcEsp / 100);
    const retencionBS = ivaBS * (porcEsp / 100);

    const totalFacturaUSD = subUSD + ivaUSD;
    const totalFacturaBS = subBS + ivaBS;

    const totalUSD = totalFacturaUSD - retencionUSD;
    const totalBS = totalFacturaBS - retencionBS;

    return {
      subtotal: showUSD ? subUSD : subBS,
      iva: showUSD ? ivaUSD : ivaBS,
      retencion: showUSD ? retencionUSD : retencionBS,
      porc_esp: porcEsp,
      totalFactura: showUSD ? totalFacturaUSD : totalFacturaBS,
      total: showUSD ? totalUSD : totalBS,
      symbol: showUSD ? "$" : "Bs.",
      raw: {
        usd: { sub: subUSD, iva: ivaUSD, retencion: retencionUSD, totalFactura: totalFacturaUSD, total: totalUSD },
        bs: { sub: subBS, iva: ivaBS, retencion: retencionBS, totalFactura: totalFacturaBS, total: totalBS },
      },
    };
  });

  function toggleCurrency(usd: boolean) {
    if (showUSD === usd) return;
    const oldUSD = showUSD;
    showUSD = usd;

    if (localArticles && localArticles.length > 0) {
      localArticles.forEach((art) => {
        const co = art.co_art || art.codigo;
        const tasa = Number(art.tasa_bcv || 1);
        const currentCost = itemCosts[co] ?? 0;
        if (usd && !oldUSD) {
          itemCosts[co] = tasa > 0 ? Number((currentCost / tasa).toFixed(2)) : currentCost;
        } else if (!usd && oldUSD) {
          itemCosts[co] = Number((currentCost * tasa).toFixed(2));
        }
      });
    }
  }

  function nextStep() {
    if (activeTab === 0 && !selectedSupplier) {
      toast.error("Por favor seleccione o registre un proveedor.");
      return;
    }
    if (activeTab === 1 && cart.length === 0) {
      toast.error("El carrito está vacío. Agregue artículos para continuar.");
      return;
    }
    activeTab += 1;
  }

  let savingOrder = $state(false);
</script>

<svelte:head>
  <title>{data.preloadedOrder ? `Editar Orden #${data.preloadedOrder.doc_num}` : 'Nueva Orden de Compra'} | Profit Cloud</title>
</svelte:head>

<!-- Modal Lightbox para Imagenes -->
<ImageViewer bind:open={viewerOpen} imageUrl={viewerUrl} />

<div class="flex flex-col gap-8 min-h-svh pb-20" in:fade>
  <!-- Header con botón de Historial -->
  <div
    class="w-full max-w-6xl mx-auto px-4 mt-6 flex flex-col md:flex-row justify-between md:items-center gap-4"
  >
    <div class="flex flex-col gap-2">
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <ShoppingCart size={40} class="text-brand-500" />
        {data.preloadedOrder ? `Editar Orden de Compra` : "Nueva Orden de Compra"}
      </h1>
      <p class="text-text-muted text-lg">
        {data.preloadedOrder
          ? `Documento Nro: ${data.preloadedOrder.doc_num}`
          : "Generar nueva orden de compra para proveedores"}
      </p>
      {#if data.preloadedOrder}
        <div class="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
          <div class="flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 px-3 py-1.5 rounded-xl text-xs font-bold text-brand-400">
            <span class="font-black uppercase tracking-wider opacity-60">Creación:</span>
            <span>{dayjs(data.preloadedOrder.fec_reg || data.preloadedOrder.fec_emis).format('DD/MM/YYYY hh:mm A')}</span>
          </div>
          {#if data.preloadedOrder.fec_us_mo}
            <div class="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-400">
              <span class="font-black uppercase tracking-wider opacity-60">Última Edición:</span>
              <span>{dayjs(data.preloadedOrder.fec_us_mo).format('DD/MM/YYYY hh:mm A')}</span>
            </div>
          {:else}
            <div class="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-xs font-bold text-text-muted opacity-60">
              <span class="font-black uppercase tracking-wider opacity-60">Última Edición:</span>
              <span>Sin modificar</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <a
      href="/dashboard/purchases/orders/history"
      class="flex items-center justify-center gap-2 px-5 py-3 h-14 rounded-2xl bg-surface-soft hover:bg-surface-strong text-text-base border border-border-subtle transition-all font-bold active:scale-95 shadow-sm shrink-0 w-full md:w-auto"
    >
      <Clock size={18} class="text-brand-500" />
      Ver Historial
    </a>
  </div>

  <!-- Step Progress Indicator -->
  <div class="w-full max-w-4xl mx-auto px-4 mt-2">
    <div class="flex items-center justify-between relative">
      <!-- Background Connecting Line -->
      <div
        class="absolute left-0 top-1/2 -translate-y-1/2 w-full h-[2px] bg-surface-soft z-0"
      ></div>
      <div
        class="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] bg-brand-500 transition-all duration-500 z-0"
        style={`width: ${activeTab === 0 ? "0%" : activeTab === 1 ? "50%" : "100%"}`}
      ></div>

      <!-- Step 1: Proveedor -->
      <button
        onclick={() => (activeTab = 0)}
        class="relative z-10 flex flex-col items-center gap-2 group cursor-pointer"
      >
        <div
          class={`h-12 w-12 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 ${activeTab >= 0 ? "bg-brand-600 border-brand-500 shadow-lg shadow-brand-500/20" : "bg-surface-base border-white/5"}`}
        >
          <Building2
            size={20}
            class={activeTab >= 0 ? "text-white" : "text-text-muted"}
          />
        </div>
        <span
          class={`text-[10px] font-black uppercase tracking-widest ${activeTab === 0 ? "text-brand-400" : "text-text-muted"}`}
          >Proveedor</span
        >
      </button>

      <!-- Step 2: Artículos -->
      <button
        onclick={() => selectedSupplier && (activeTab = 1)}
        disabled={!selectedSupplier}
        class="relative z-10 flex flex-col items-center gap-2 group disabled:opacity-50"
      >
        <div
          class={`h-12 w-12 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 ${activeTab >= 1 ? "bg-brand-600 border-brand-500 shadow-lg shadow-brand-500/20" : "bg-surface-base border-white/5"}`}
        >
          <Package
            size={20}
            class={activeTab >= 1 ? "text-white" : "text-text-muted"}
          />
        </div>
        <span
          class={`text-[10px] font-black uppercase tracking-widest ${activeTab === 1 ? "text-brand-400" : "text-text-muted"}`}
          >Artículos</span
        >
      </button>

      <!-- Step 3: Confirmación -->
      <button
        onclick={() => selectedSupplier && cart.length > 0 && (activeTab = 2)}
        disabled={!selectedSupplier || cart.length === 0}
        class="relative z-10 flex flex-col items-center gap-2 group disabled:opacity-50"
      >
        <div
          class={`h-12 w-12 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 ${activeTab >= 2 ? "bg-brand-600 border-brand-500 shadow-lg shadow-brand-500/20" : "bg-surface-base border-white/5"}`}
        >
          <Check
            size={20}
            class={activeTab >= 2 ? "text-white" : "text-text-muted"}
          />
        </div>
        <span
          class={`text-[10px] font-black uppercase tracking-widest ${activeTab === 2 ? "text-brand-400" : "text-text-muted"}`}
          >Confirmar</span
        >
      </button>
    </div>
  </div>

  <div class="flex-1 w-full max-w-6xl mx-auto px-4 mt-4">
    {#if activeTab === 0}
      <!-- SECCIÓN 1: IDENTIFICACIÓN DEL PROVEEDOR -->
      <div class="space-y-8" in:fade>
        <div class="text-center max-w-2xl mx-auto">
          <h2 class="text-3xl font-black tracking-tight">
            Identificación del Proveedor
          </h2>
          <p class="text-text-muted mt-2">
            Ingrese el RIF o razón social para buscar o registrar un nuevo proveedor.
          </p>
        </div>

        <!-- Barra de Búsqueda -->
        <div class="w-full mt-8">
          <div class="glass p-4 rounded-3xl border border-white/5 shadow-2xl flex flex-col md:flex-row justify-center gap-4 items-center relative z-10 w-full">
            {#if data.branches && data.branches.length > 1}
              <div class="w-full md:w-[calc(50%-0.5rem)] xl:w-[25%]">
                <Combobox
                  options={(data.branches || []).map((b: any) => ({
                    value: b.id,
                    label: b.name,
                  }))}
                  bind:value={selectedBranch}
                  placeholder="Sucursal de Compra..."
                  icon={Store}
                  class="w-full h-14"
                  onchange={() => handleSearch()}
                />
              </div>
            {/if}

            <div class="w-full md:w-[calc(50%-0.5rem)] xl:w-[25%]">
              <SearchBar
                bind:value={rifInput}
                isSearching={searchingSupplier}
                placeholder="J123456789"
                className="w-full h-14"
                onsubmit={(e: Event) => {
                  const form = document.querySelector(
                    'form[action="?/searchSupplier"]',
                  ) as HTMLFormElement;
                  if (form) form.requestSubmit();
                }}
              />
            </div>
          </div>

          <form
            method="POST"
            action="?/searchSupplier"
            class="hidden"
            use:enhance={() => {
              if (!selectedBranch) {
                toast.error("Por favor seleccione una sucursal");
                return;
              }
              if (!rifInput) {
                toast.error("Por favor ingrese un RIF para buscar");
                return;
              }
              searchingSupplier = true;
              return async ({ result }) => {
                searchingSupplier = false;
                if (result.type === "success") {
                  const payload = (result as any).data;
                  if (payload.supplier) {
                    selectedSupplier = payload.supplier;
                    showRegistrationForm = false;
                    toast.success(
                      "Proveedor encontrado: " +
                        (selectedSupplier.descripcion || selectedSupplier.prov_des),
                    );
                  } else if (payload.suppliers && payload.suppliers.length > 1) {
                    matchingSuppliers = payload.suppliers;
                    showSupplierSelectionModal = true;
                  } else {
                    selectedSupplier = null;
                    showRegistrationForm = true;
                    newSupplier.rif = rifInput;
                    toast.info(
                      "Proveedor no registrado. Complete los datos para crear.",
                    );
                  }
                } else if (result.type === "failure") {
                  toast.error((result as any).data?.message || "Error en búsqueda");
                }
              };
            }}
          >
            <input type="hidden" name="rif" value={rifInput} />
            <input type="hidden" name="branch_id" value={selectedBranch} />
          </form>
        </div>

        {#if selectedSupplier}
          <!-- Card Proveedor Encontrado -->
          <div
            class="w-full animate-in fade-in slide-in-from-bottom-4 duration-500"
            in:scale={{ duration: 400, start: 0.98 }}
          >
            <div
              class="glass p-8 rounded-[40px] border border-brand-500/20 bg-brand-500/5 relative overflow-hidden"
            >
              <div class="absolute top-0 right-0 p-8 opacity-10">
                <Building2 size={120} class="text-brand-400" />
              </div>

              <div class="relative z-10 flex flex-col gap-6">
                <div class="flex justify-between items-start">
                  <div
                    class="px-4 py-1.5 rounded-full bg-brand-500 text-white text-[10px] font-black uppercase tracking-widest mb-2 inline-block"
                  >
                    Proveedor Seleccionado
                  </div>
                  <button
                    onclick={() => {
                      selectedSupplier = null;
                      rifInput = "";
                    }}
                    class="text-text-muted hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>

                <h3 class="text-3xl font-black tracking-tight">
                  {selectedSupplier.descripcion || selectedSupplier.prov_des || "Sin Nombre"}
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mt-2">
                  <!-- RIF -->
                  <div class="flex items-center gap-4 text-text-muted">
                    <div class="h-10 w-10 rounded-xl bg-surface-soft flex items-center justify-center text-brand-400 shrink-0">
                      <Tag size={18} />
                    </div>
                    <div class="flex flex-col">
                      <span class="text-[10px] uppercase font-black tracking-widest opacity-50">R.I.F. / Documento</span>
                      <span class="font-bold text-text-base">{selectedSupplier.rif || selectedSupplier.co_prov}</span>
                    </div>
                  </div>

                  <!-- Teléfono -->
                  <div class="flex items-center gap-4 text-text-muted">
                    <div class="h-10 w-10 rounded-xl bg-surface-soft flex items-center justify-center text-brand-400 shrink-0">
                      <Phone size={18} />
                    </div>
                    <div class="flex flex-col">
                      <span class="text-[10px] uppercase font-black tracking-widest opacity-50">Teléfono</span>
                      <span class="font-bold text-text-base">{selectedSupplier.telefonos || "No registrado"}</span>
                    </div>
                  </div>

                  <!-- Email -->
                  <div class="flex items-center gap-4 text-text-muted">
                    <div class="h-10 w-10 rounded-xl bg-surface-soft flex items-center justify-center text-brand-400 shrink-0">
                      <Mail size={18} />
                    </div>
                    <div class="flex flex-col">
                      <span class="text-[10px] uppercase font-black tracking-widest opacity-50">Email</span>
                      <span class="font-bold text-text-base lowercase">{selectedSupplier.email || "No registrado"}</span>
                    </div>
                  </div>

                  <!-- Estatus Fiscal -->
                  <div class="flex items-center gap-4 text-text-muted">
                    <div class="h-10 w-10 rounded-xl bg-surface-soft flex items-center justify-center text-brand-400 shrink-0">
                      <ShieldCheck size={18} />
                    </div>
                    <div class="flex flex-col">
                      <span class="text-[10px] uppercase font-black tracking-widest opacity-50">Estatus Fiscal</span>
                      <span class="font-bold text-text-base">
                        {selectedSupplier.porc_esp > 0
                          ? `Contribuyente Especial (${selectedSupplier.porc_esp}%)`
                          : selectedSupplier.contribu_e
                            ? "Contribuyente Especial"
                            : "Contribuyente Ordinario"}
                      </span>
                    </div>
                  </div>

                  <!-- Dirección -->
                  <div class="flex items-start gap-4 text-text-muted md:col-span-2 pt-2">
                    <div class="h-10 w-10 rounded-xl bg-surface-soft flex items-center justify-center text-brand-400 shrink-0">
                      <MapPin size={18} />
                    </div>
                    <div class="flex flex-col">
                      <span class="text-[10px] uppercase font-black tracking-widest opacity-50">Dirección Fiscal</span>
                      <span class="font-bold text-text-base leading-relaxed">{selectedSupplier.direc1 || "Sin dirección registrada"}</span>
                    </div>
                  </div>
                </div>

                <div class="pt-6 border-t border-border-subtle flex justify-end">
                  <button
                    onclick={nextStep}
                    class="group bg-brand-600 hover:bg-brand-500 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-brand-500/20 flex items-center gap-3 transition-all active:scale-95 cursor-pointer"
                  >
                    Continuar a Artículos
                    <ChevronRight size={20} class="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        {:else if showRegistrationForm}
          <!-- Formulario Creación Proveedor -->
          <div class="w-full animate-in fade-in slide-in-from-bottom-4 duration-500" in:fade>
            <div class="glass p-10 rounded-[40px] border border-border-subtle">
              <div class="flex items-center gap-4 mb-8">
                <div class="h-12 w-12 rounded-2xl bg-brand-500/20 text-brand-500 flex items-center justify-center">
                  <Plus size={24} />
                </div>
                <div>
                  <h3 class="text-2xl font-black">Nuevo Proveedor</h3>
                  <p class="text-text-muted text-sm">El RIF ingresado no existe en esta sede. Complete el registro para continuar.</p>
                </div>
              </div>

              <form
                method="POST"
                action="?/saveSupplier"
                use:enhance={() => {
                  searchingSupplier = true;
                  return async ({ result }) => {
                    searchingSupplier = false;
                    if (result.type === "success") {
                      selectedSupplier = (result as any).data.supplier;
                      showRegistrationForm = false;
                      toast.success("Proveedor creado y seleccionado: " + (selectedSupplier.prov_des || selectedSupplier.descripcion));
                    } else if (result.type === "failure") {
                      toast.error((result as any).data?.message || "Error al crear proveedor");
                    }
                  };
                }}
                class="space-y-6"
              >
                <input type="hidden" name="_isNew" value="true" />
                <input type="hidden" name="branch_id" value={selectedBranch} />
                <input type="hidden" name="rif" value={newSupplier.rif} />
                <input type="hidden" name="co_prov" value={newSupplier.rif} />
                <input type="hidden" name="tip_pro" value={newSupplier.tip_pro} />
                <input type="hidden" name="prov_des" value={newSupplier.descripcion} />
                <input type="hidden" name="direc1" value={newSupplier.direccion} />

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <!-- RIF -->
                  <div class="space-y-2">
                    <label for="rif_input" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2">RIF / IDENTIFICACIÓN</label>
                    <div class="relative">
                      <Tag class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" size={18} />
                      <input
                        id="rif_input"
                        type="text"
                        required
                        bind:value={newSupplier.rif}
                        placeholder="Ej: J123456789"
                        class="w-full h-14 bg-surface-soft border border-border-bold rounded-2xl pl-12 pr-5 outline-none focus:border-brand-500/50 font-bold"
                      />
                    </div>
                  </div>

                  <!-- Tipo Proveedor -->
                  <div class="space-y-2">
                    <label for="tip_pro_input" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2">TIPO DE PROVEEDOR</label>
                    <Combobox
                      options={(data.context?.tiposProveedor || []).map((tp: any) => ({ value: tp.tip_pro, label: tp.des_tipo }))}
                      bind:value={newSupplier.tip_pro}
                      placeholder="Seleccione tipo de proveedor..."
                      allLabel="Sin tipo"
                      icon={Briefcase}
                    />
                  </div>

                  <!-- Razón Social -->
                  <div class="space-y-2 md:col-span-2">
                    <label for="descripcion_input" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2">RAZÓN SOCIAL / NOMBRE</label>
                    <div class="relative">
                      <Building2 class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" size={18} />
                      <input
                        id="descripcion_input"
                        name="descripcion"
                        type="text"
                        required
                        bind:value={newSupplier.descripcion}
                        placeholder="NOMBRE DEL PROVEEDOR"
                        class="w-full h-14 bg-surface-soft border border-border-bold rounded-2xl pl-12 pr-5 outline-none focus:border-brand-500/50 font-bold"
                      />
                    </div>
                  </div>

                  <!-- Contacto / Responsable -->
                  <div class="space-y-2">
                    <label for="respons_input" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2">CONTACTO (PERSONA DE CONTACTO)</label>
                    <div class="relative">
                      <User class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" size={18} />
                      <input
                        id="respons_input"
                        type="text"
                        name="respons"
                        bind:value={newSupplier.respons}
                        placeholder="Ej: Juan Pérez"
                        class="w-full h-14 bg-surface-soft border border-border-bold rounded-2xl pl-12 pr-5 outline-none focus:border-brand-500/50 font-bold"
                      />
                    </div>
                  </div>

                  <!-- Teléfonos -->
                  <div class="space-y-2">
                    <label for="telefonos_input" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2">TELÉFONOS</label>
                    <div class="relative">
                      <Phone class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" size={18} />
                      <input
                        id="telefonos_input"
                        type="text"
                        name="telefonos"
                        bind:value={newSupplier.telefonos}
                        placeholder="+584120000000"
                        class="w-full h-14 bg-surface-soft border border-border-bold rounded-2xl pl-12 pr-5 outline-none focus:border-brand-500/50 font-bold"
                      />
                    </div>
                  </div>

                  <!-- Email -->
                  <div class="space-y-2 md:col-span-2">
                    <label for="email_input" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2">CORREO ELECTRÓNICO</label>
                    <div class="relative">
                      <Mail class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40" size={18} />
                      <input
                        id="email_input"
                        type="email"
                        name="email"
                        bind:value={newSupplier.email}
                        placeholder="proveedor@ejemplo.com"
                        class="w-full h-14 bg-surface-soft border border-border-bold rounded-2xl pl-12 pr-5 outline-none focus:border-brand-500/50 font-bold"
                      />
                    </div>
                  </div>

                  <!-- Dirección Fiscal -->
                  <div class="space-y-2 md:col-span-2">
                    <label for="direccion_input" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2">DIRECCIÓN FISCAL</label>
                    <div class="relative">
                      <MapPin class="absolute left-4 top-4 text-text-muted opacity-40" size={18} />
                      <textarea
                        id="direccion_input"
                        name="direccion"
                        rows="3"
                        bind:value={newSupplier.direccion}
                        placeholder="Calle, Av, Edificio..."
                        class="w-full h-24 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 py-4 outline-none focus:border-brand-500/50 font-bold resize-none"
                      ></textarea>
                    </div>
                  </div>

                  <!-- Zona Geográfica -->
                  <div class="space-y-2">
                    <label for="co_zon_input" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2">ZONA GEOGRÁFICA</label>
                    <input type="hidden" name="co_zon" value={newSupplier.co_zon} />
                    <Combobox
                      options={(data.context?.zonas || []).map((z: any) => ({ value: z.co_zon, label: z.zon_des || z.co_zon }))}
                      bind:value={newSupplier.co_zon}
                      placeholder="Seleccione una zona..."
                      allLabel="Sin zona"
                      icon={MapPin}
                    />
                  </div>

                  <!-- Segmento -->
                  <div class="space-y-2">
                    <label for="co_seg_input" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2">SEGMENTO</label>
                    <input type="hidden" name="co_seg" value={newSupplier.co_seg} />
                    <Combobox
                      options={(data.context?.segmentos && data.context.segmentos.length > 0)
                        ? data.context.segmentos.map((s: any) => ({ value: s.co_seg, label: `${s.co_seg} - ${s.seg_des}` }))
                        : [
                            { value: "01", label: "01 - Detal" },
                            { value: "02", label: "02 - Mayor" }
                          ]}
                      bind:value={newSupplier.co_seg}
                      placeholder="Seleccione segmento..."
                      icon={Tag}
                    />
                  </div>

                  <!-- Condición de Pago -->
                  <div class="space-y-2 md:col-span-2">
                    <label for="cond_pag_input" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2">CONDICIÓN DE PAGO</label>
                    <input type="hidden" name="cond_pag" value={newSupplier.cond_pag} />
                    <Combobox
                      options={(data.context?.condicionesPago || []).map((cp: any) => ({
                        value: cp.co_cond,
                        label: `${cp.co_cond} - ${cp.cond_des}${cp.dias_cred ? ` (${cp.dias_cred} días)` : ''}`
                      }))}
                      bind:value={newSupplier.cond_pag}
                      placeholder="Seleccione condición de pago..."
                      allLabel="Sin condición"
                      icon={CreditCard}
                    />
                  </div>

                  <!-- Contribuyente Toggle -->
                  <div class="space-y-2 md:col-span-2">
                    <div class="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl h-14">
                      <span class="text-sm font-bold text-text-base">Contribuyente Especial / Retención</span>
                      <label class="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          name="contribuyente"
                          value="true"
                          bind:checked={newSupplier.contribuyente}
                          class="sr-only peer"
                        />
                        <div
                          class="w-11 h-6 bg-border-bold peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"
                        ></div>
                      </label>
                    </div>
                  </div>

                  {#if newSupplier.contribuyente}
                    <div class="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                      <input type="hidden" name="contribu_e" value="true" />
                      
                      <!-- Tipo de Persona -->
                      <div class="space-y-2">
                        <label for="tipo_per_input" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2">TIPO DE PERSONA</label>
                        <input type="hidden" name="tipo_per" value={newSupplier.tipo_per} />
                        <Combobox
                          options={[
                            { value: '1', label: '(PNR) Persona Natural Residente' },
                            { value: '2', label: '(PNNR) Persona Natural No Residente' },
                            { value: '3', label: '(PJD) Persona Jurídica Domiciliada' },
                            { value: '4', label: '(PJND) Persona Jurídica No Domiciliada' },
                            { value: '5', label: 'Exenta' },
                            { value: '6', label: 'Tesorería Nacional' },
                            { value: '7', label: 'Otros 1' },
                            { value: '8', label: 'Otros 2' }
                          ]}
                          bind:value={newSupplier.tipo_per}
                          placeholder="Tipo de Persona..."
                        />
                      </div>

                      <!-- Porcentaje de Retención -->
                      <div class="space-y-2">
                        <label for="porc_esp_input" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2">PORCENTAJE DE RETENCIÓN</label>
                        <div class="relative">
                          <input
                            id="porc_esp_input"
                            name="porc_esp"
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            bind:value={newSupplier.porc_esp}
                            class="w-full h-14 bg-surface-soft border border-border-bold rounded-2xl px-5 outline-none focus:border-brand-500/50 font-bold"
                          />
                          <span class="absolute right-5 top-1/2 -translate-y-1/2 font-bold text-text-muted">%</span>
                        </div>
                      </div>
                    </div>
                  {/if}
                </div>

                <div class="pt-6 flex gap-4">
                  <button
                    type="button"
                    onclick={() => (showRegistrationForm = false)}
                    class="flex-1 h-14 border border-border-bold rounded-2xl font-bold hover:bg-surface-soft transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={searchingSupplier}
                    class="flex-[2] h-14 bg-brand-600 hover:bg-brand-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-brand-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {#if searchingSupplier}
                      <Loader2 size={24} class="animate-spin" />
                    {:else}
                      Guardar y Continuar
                      <ChevronRight size={20} />
                    {/if}
                  </button>
                </div>
              </form>
            </div>
          </div>
        {/if}
      </div>
    {:else if activeTab === 1}
      <!-- SECCIÓN 2: SELECCIÓN DE ARTÍCULOS -->
      <div in:fade class="space-y-6">
        <div class="glass p-4 rounded-3xl border border-border-subtle shadow-2xl grid grid-cols-2 lg:grid-cols-4 gap-4 items-center relative z-10">
          <!-- Sucursal -->
          {#if data.branches && data.branches.length > 1}
            <div class="col-span-2 lg:col-span-1">
              <Combobox
                options={(data.branches || []).map((b: any) => ({
                  value: b.id,
                  label: b.name,
                }))}
                bind:value={selectedBranch}
                placeholder="Sucursal..."
                icon={Store}
                onchange={() => handleSearch()}
                class="w-full h-14"
              />
            </div>
          {/if}

          <!-- Buscador + Scanner -->
          <div class="flex items-center gap-2 col-span-2 {data.branches?.length > 1 ? 'lg:col-span-1' : 'lg:col-span-2'}">
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
                handleSearch(new Event("submit") as any);
              }}
            />
          </div>

          <!-- Línea -->
          <div class="col-span-1 lg:col-span-1">
            <Combobox
              options={(data.context?.lineas || []).map((l: any) => ({
                value: l.co_lin,
                label: l.lin_des,
              }))}
              bind:value={selectedLinea}
              placeholder="Líneas (Todas)"
              allLabel="Líneas (Todas)"
              onchange={handleSearch}
              class="w-full h-14"
            />
          </div>

          <!-- Categoría -->
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

          <!-- Orden / Moneda -->
          <div class="flex items-center gap-2 w-full h-14 col-span-2 lg:col-span-1 justify-end">
            <button
              onclick={() => {
                const u = new URL($page.url);
                const currentSort = u.searchParams.get("sort");
                let nextSort = null;

                if (currentSort === "price_asc") nextSort = "price_desc";
                else if (currentSort === "price_desc") nextSort = null;
                else nextSort = "price_asc";

                if (nextSort) u.searchParams.set("sort", nextSort);
                else u.searchParams.delete("sort");
                sortOption = (nextSort as any) || "relevance";

                u.searchParams.set("page", "1");
                goto(u.toString());
              }}
              class={`h-full px-5 rounded-2xl border flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                $page.url.searchParams.get("sort")?.startsWith("price")
                  ? "bg-brand-500 border-brand-500 text-white shadow-[0_10px_20px_-5px_rgba(var(--brand-rgb),0.3)]"
                  : "bg-white/5 border-white/5 text-text-muted hover:bg-white/10"
              }`}
            >
              {#if $page.url.searchParams.get("sort") === "price_asc"}
                <ArrowUpAZ size={14} />
                <span>Menor</span>
              {:else if $page.url.searchParams.get("sort") === "price_desc"}
                <ArrowDownAZ size={14} />
                <span>Mayor</span>
              {:else}
                <ArrowDownAZ size={14} class="opacity-50" />
                <span>Precio</span>
              {/if}
            </button>

            <div class="flex items-center bg-white/5 border border-white/5 p-1 rounded-xl h-full">
              <button
                onclick={() => toggleCurrency(true)}
                class={`px-3 h-full rounded-lg text-[10px] font-black transition-all cursor-pointer ${showUSD ? "bg-brand-500 text-white" : "text-text-muted hover:text-white"}`}
              >USD</button>
              <button
                onclick={() => toggleCurrency(false)}
                class={`px-3 h-full rounded-lg text-[10px] font-black transition-all cursor-pointer ${!showUSD ? "bg-brand-500 text-white" : "text-text-muted hover:text-white"}`}
              >Bs.</button>
            </div>
          </div>
        </div>

        <!-- Grid de Artículos -->
        {#if loadingArticles}
          <div class="glass p-20 rounded-[40px] border border-border-subtle text-center space-y-4">
            <div class="w-12 h-12 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin mx-auto"></div>
            <p class="text-xl font-bold text-text-muted">Cargando catálogo de compras...</p>
          </div>
        {:else if localArticles.length === 0}
          <div class="glass p-20 rounded-[40px] border border-border-subtle text-center space-y-4">
            <Box size={60} class="text-text-muted/20 mx-auto" />
            <p class="text-xl font-bold text-text-muted">No se encontraron artículos.</p>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {#each displayArticles as article}
              {@const pIdx = selectedItemPriceIndex[article.co_art || article.codigo] || 0}
              {@const selPrice = article.precios?.[pIdx] || article.precios?.[0]}
              {@const curAlmId = selectedItemWarehouse[article.co_art || article.codigo]}
              {@const curAlm = article.disponibilidad?.find((a: any) => a.co_alma === curAlmId) || article.disponibilidad?.[0]}
              <div class="glass p-4 rounded-3xl border border-border-subtle hover:border-brand-500/30 transition-all flex flex-col group relative overflow-hidden">
                <div class="absolute top-4 right-4 z-10 flex flex-col items-end gap-1">
                  <span class="px-2 py-1 rounded-md bg-surface-soft backdrop-blur text-[10px] font-black text-brand-400 border border-border-bold uppercase">
                    {article.co_art || article.codigo}
                  </span>
                </div>

                <div class="h-40 bg-surface-soft rounded-[20px] flex items-center justify-center text-text-muted mb-4 group-hover:bg-brand-500/5 transition-colors overflow-hidden">
                  {#if article.campo7 && article.campo7.trim() !== ""}
                    <img
                      src={article.campo7.startsWith("http") ? article.campo7 : `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/articulos/${article.campo7}`}
                      alt={article.art_des || article.descripcion}
                      class="w-full h-full object-contain p-2 drop-shadow-md group-hover:scale-105 transition-transform duration-500 cursor-pointer"
                      onclick={() => {
                        viewerUrl = article.campo7.startsWith("http") ? article.campo7 : `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/articulos/${article.campo7}`;
                        viewerOpen = true;
                      }}
                      onerror={(e) => { const el = e.currentTarget as HTMLElement; if (el) el.style.display = "none"; }}
                    />
                  {:else}
                    <Package size={48} class="opacity-30 group-hover:scale-110 group-hover:text-brand-500 transition-all duration-500" />
                  {/if}
                </div>

                <h3 class="font-black text-sm leading-tight group-hover:text-brand-400 transition-colors">
                  {article.art_des || article.descripcion}
                </h3>
                <p class="text-[10px] text-text-muted mt-1 font-bold uppercase tracking-wider">
                  <span class="text-brand-400">{article.unidad || "UNID"}</span>
                </p>

                <!-- Costo Unitario Editable (Real o Calculado) -->
                <div class="mt-4 flex flex-col gap-1.5">
                  <div class="flex justify-between items-center px-1">
                    <span class="text-[10px] font-black uppercase tracking-wider flex items-center gap-1 {article.ultimo_costo_om > 0 ? 'text-emerald-400' : article.costo_estimado > 0 ? 'text-amber-400' : 'text-text-muted'}">
                      <DollarSign size={13} class={article.ultimo_costo_om > 0 ? 'text-emerald-400' : article.costo_estimado > 0 ? 'text-amber-400' : 'text-brand-400'} />
                      {article.ultimo_costo_om > 0 ? 'Costo Real' : article.costo_estimado > 0 ? 'Costo Calculado' : 'Costo Unitario'} ({showUSD ? 'USD' : 'Bs.'})
                    </span>
                    {#if article.ultimo_costo_om > 0}
                      <span class="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20" title="Último costo de compra registrado en factura">
                        Real
                      </span>
                    {:else if article.costo_estimado > 0}
                      <span class="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20" title="Calculado de Precio 2 / Margen 2">
                        Calculado
                      </span>
                    {/if}
                  </div>

                  <div class="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      bind:value={itemCosts[article.co_art || article.codigo]}
                      placeholder="0.00"
                      class="w-full h-11 bg-surface-soft hover:bg-surface-strong focus:bg-surface-strong rounded-xl pl-4 pr-12 text-sm font-black outline-none border border-border-bold focus:border-brand-500/50 transition-all {article.ultimo_costo_om > 0 ? 'text-emerald-400' : 'text-brand-400'}"
                    />
                    <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-text-muted pointer-events-none">
                      {showUSD ? '$' : 'Bs.'}
                    </span>
                  </div>
                </div>

                <!-- Almacén Destino y Stock -->
                <div class="mt-3 pt-3 border-t border-border-subtle space-y-3">
                  <div class="flex flex-col gap-1">
                    <div class="flex justify-between items-end px-1">
                      <span class="text-[9px] font-black text-text-muted uppercase tracking-wider">Almacén Destino</span>
                      <span class="text-xs font-black {(curAlm?.stock || 0) > 0 ? 'text-green-400' : 'text-text-muted'}">
                        Stock: {curAlm?.stock || 0}
                      </span>
                    </div>

                    <div class="relative group">
                      <select
                        bind:value={selectedItemWarehouse[article.co_art || article.codigo]}
                        class="w-full h-11 bg-surface-soft hover:bg-surface-strong rounded-xl px-4 text-xs font-black outline-none border border-border-subtle appearance-none transition-all cursor-pointer text-text-muted hover:text-text-base"
                      >
                        {#if article.disponibilidad && article.disponibilidad.length > 0}
                          {#each article.disponibilidad as alm}
                            <option value={alm.co_alma} class="bg-surface-dark text-white text-sm">
                              {alm.des_alma || alm.co_alma} ({alm.stock || 0})
                            </option>
                          {/each}
                        {:else if data.context?.warehouses && data.context.warehouses.length > 0}
                          {#each data.context.warehouses as alm}
                            <option value={alm.co_alma} class="bg-surface-dark text-white text-sm">
                              {alm.des_alma || alm.co_alma} (0)
                            </option>
                          {/each}
                        {:else}
                          <option value="01" class="bg-surface-dark text-white text-sm">Principal (01)</option>
                        {/if}
                      </select>
                      <ChevronDown size={14} class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted opacity-50 pointer-events-none" />
                    </div>
                  </div>

                  <div class="flex items-center gap-2 mt-4">
                    <div class="flex-1 flex items-center bg-surface-soft rounded-xl border border-border-bold h-11 focus-within:border-brand-500/30 transition-all overflow-hidden">
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          const step = getStep(article);
                          quantities[article.co_art] = Math.max(step, (quantities[article.co_art] || step) - step);
                        }}
                        class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 transition-colors bg-surface-soft"
                        title="Restar"><Minus size={12} /></button>
                      <input
                        type="number"
                        min={getStep(article)}
                        step={getStep(article)}
                        bind:value={quantities[article.co_art]}
                        onclick={(e) => e.stopPropagation()}
                        class="w-full flex-1 text-center text-base font-black bg-transparent outline-none no-arrows text-brand-400 px-1"
                      />
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          const step = getStep(article);
                          quantities[article.co_art] = (quantities[article.co_art] || step) + step;
                        }}
                        class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 transition-colors bg-surface-soft"
                        title="Sumar"><Plus size={12} /></button>
                    </div>

                    <button
                      onclick={() => addToCart(article)}
                      class="h-11 w-14 shrink-0 bg-brand-600 hover:bg-brand-500 text-white rounded-xl shadow-lg shadow-brand-500/20 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                      title="Agregar a la Orden de Compra"
                    >
                      <ShoppingCart size={20} />
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Paginación -->
        {#if localPagination && localPagination.totalPages > 1}
          <div class="flex justify-center gap-4 mt-8 pb-10">
            <button
              disabled={localPagination.page <= 1}
              onclick={() => {
                const u = new URL($page.url);
                u.searchParams.set("page", (localPagination.page - 1).toString());
                goto(u.toString());
              }}
              class="h-12 px-6 rounded-2xl bg-surface-soft border border-border-subtle font-bold disabled:opacity-30 transition-all hover:bg-surface-strong"
            >Anterior</button>
            <div class="h-12 px-6 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center font-black text-brand-400">
              {localPagination.page} / {localPagination.totalPages}
            </div>
            <button
              disabled={localPagination.page >= localPagination.totalPages}
              onclick={() => {
                const u = new URL($page.url);
                u.searchParams.set("page", (localPagination.page + 1).toString());
                goto(u.toString());
              }}
              class="h-12 px-6 rounded-2xl bg-surface-soft border border-border-subtle font-bold disabled:opacity-30 transition-all hover:bg-surface-strong"
            >Siguiente</button>
          </div>
        {/if}

        <!-- Floating Cart Bar -->
        {#if cart.length > 0}
          <div class="fixed bottom-28 md:bottom-8 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md" transition:slide>
            <div class="p-4 rounded-[32px] border border-brand-400/25 bg-brand-600 shadow-2xl flex items-center justify-between gap-4 text-white">
              <div class="flex items-center gap-4">
                <div class="h-12 w-12 rounded-2xl bg-white/15 text-white flex items-center justify-center relative shadow-sm border border-white/10">
                  <ShoppingCart size={24} />
                  <span class="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] w-6 h-6 rounded-full flex items-center justify-center font-black border-2 border-brand-600">
                    {cart.length}
                  </span>
                </div>
                <div>
                  <div class="text-[10px] font-black uppercase tracking-widest text-white/70">Orden de Compra</div>
                  <div class="text-sm font-black text-white">
                    {totals().symbol} {totals().total.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              <button
                onclick={nextStep}
                class="bg-white text-brand-600 hover:bg-brand-50 h-12 px-6 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        {/if}
      </div>
    {:else if activeTab === 2}
      <!-- SECCIÓN 3: CONFIRMACIÓN Y CIERRE (FULL WIDTH) -->
      <div in:fade class="max-w-4xl mx-auto space-y-8 pb-32 px-4">
        <div class="text-center">
          <h2 class="text-3xl font-black tracking-tight text-text-base uppercase italic">
            Cierre de Orden de Compra
          </h2>
          <p class="text-text-muted mt-2 font-medium">
            Revise los detalles finales antes de procesar el documento en Profit Plus.
          </p>
        </div>

        <div class="flex flex-col gap-8">
          <!-- Bloque 1: Resumen Proveedor (Detailed Card) -->
          <div class="glass p-8 rounded-[40px] border border-border-bold space-y-8 relative overflow-hidden group bg-surface-soft/20">
            <div class="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 rounded-full blur-[100px] -mr-32 -mt-32"></div>

            <div class="flex items-center justify-between border-b border-border-subtle pb-6 relative z-10">
              <div class="flex items-center gap-3">
                <Building2 size={20} class="text-brand-400" />
                <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Información del Proveedor</h4>
              </div>
              <button
                onclick={() => (activeTab = 0)}
                class="px-4 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong text-[10px] font-black uppercase text-brand-400 tracking-widest transition-all border border-border-subtle cursor-pointer"
              >Cambiar Proveedor</button>
            </div>

            <div class="space-y-6 relative z-10 w-full">
              <!-- Info Principal -->
              <div class="space-y-6">
                <div>
                  <div class="text-[10px] font-black uppercase tracking-widest text-brand-400/60 mb-1">Razón Social</div>
                  <div class="text-3xl font-black text-text-base tracking-tight">
                    {selectedSupplier?.descripcion || selectedSupplier?.prov_des}
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-border-subtle pb-4">
                  <div class="space-y-1">
                    <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block">R.I.F. / Identificación</span>
                    <span class="font-mono text-sm font-bold text-brand-400">{selectedSupplier?.rif || selectedSupplier?.co_prov}</span>
                  </div>
                  <div class="space-y-1">
                    <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block">Teléfono de Contacto</span>
                    <span class="text-sm font-bold text-text-base">{selectedSupplier?.telefonos || "No reg."}</span>
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div class="space-y-1">
                    <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block">Correo Electrónico</span>
                    <span class="text-sm font-bold text-text-base lowercase">{selectedSupplier?.email || "No reg."}</span>
                  </div>
                  <div class="space-y-1">
                    <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block">Zona / Región</span>
                    <span class="text-sm font-bold text-text-base text-brand-400">
                      {selectedSupplier?.zon_des ||
                        data.context?.zonas?.find(
                          (z: any) => z.co_zon?.trim() === selectedSupplier?.co_zon?.trim(),
                        )?.zon_des ||
                        selectedSupplier?.co_zon ||
                        "Sin zona"}
                    </span>
                  </div>
                  <div class="space-y-1">
                    <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block">Estatus Fiscal</span>
                    <span class="text-sm font-bold text-text-base">
                      {selectedSupplier?.porc_esp > 0
                        ? `Contribuyente Especial (${selectedSupplier?.porc_esp}%)`
                        : selectedSupplier?.contribu_e || selectedSupplier?.contribuyente
                          ? "Contribuyente Especial"
                          : "Contribuyente Ordinario"}
                    </span>
                  </div>
                  <div class="space-y-1">
                    <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block">Sede Destino</span>
                    <span class="text-sm font-bold text-text-base">
                      {data.branches?.find((b: any) => b.id === selectedBranch)?.name || selectedBranch}
                    </span>
                  </div>
                </div>

                <div class="pt-4 border-t border-border-subtle/30">
                  <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block mb-1">Dirección Fiscal</span>
                  <p class="text-sm font-medium text-text-base leading-relaxed">
                    {selectedSupplier?.direc1 || "Sin dirección registrada"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Bloque 2: Detalle de Renglones (Full Width) -->
          <div class="glass rounded-[32px] border border-border-subtle overflow-hidden">
            <div class="p-6 md:p-8 border-b border-border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-surface-soft/50">
              <!-- Buscador en Renglones -->
              <div class="relative flex-1 max-w-xl">
                <Search size={16} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  bind:value={cartSearchTerm}
                  placeholder={`Buscar artículo en renglones (${cart.length})...`}
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
                onclick={() => (activeTab = 1)}
                class="px-5 py-3 rounded-2xl bg-surface-soft hover:bg-surface-strong text-xs font-black uppercase text-brand-400 tracking-wider transition-all border border-border-subtle cursor-pointer shrink-0 flex items-center justify-center gap-2 shadow-sm"
              >
                <Plus size={14} />
                Agregar Artículo
              </button>
            </div>

            <div class="divide-y border-border-subtle">
              {#if cart.length === 0}
                <div class="p-12 text-center text-text-muted text-sm font-bold">
                  No hay artículos en la orden de compra.
                </div>
              {:else if filteredCart.length === 0}
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
                {#each filteredCart as { item, originalIndex: i } (item.co_art + '_' + (item.co_alma_selected || '') + '_' + i)}
                  {@const unitCost = Number(showUSD ? (item.price_selected?.precio || item.precio_usd || 0) : (item.price_selected?.precio_ves || item.precio_ves || 0))}
                  <div class="p-8 flex flex-col lg:flex-row items-start lg:items-center gap-8 transition-all hover:bg-surface-soft group relative border-b border-border-subtle last:border-0">
                    <!-- Product Identity & Qty -->
                    <div class="flex items-center gap-6 shrink-0 w-full lg:w-auto">
                      <div class="h-16 w-16 rounded-2xl bg-surface-soft flex items-center justify-center text-brand-400 relative group-hover:scale-110 transition-transform duration-500">
                        <div class="absolute inset-0 bg-brand-500/10 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <Package size={28} />
                      </div>

                      <div class="flex items-center bg-surface-base/40 rounded-xl border border-border-subtle h-12 overflow-hidden shadow-inner">
                        <button
                          onclick={() => updateCartQty(i, (item.qty || 1) - getStep(item.article || item))}
                          class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 hover:bg-surface-soft transition-all cursor-pointer"
                        ><Minus size={14} /></button>
                        <input
                          type="number"
                          min={getStep(item.article || item)}
                          step={getStep(item.article || item)}
                          value={item.qty}
                          oninput={(e) => {
                            const v = parseFloat((e.currentTarget as HTMLInputElement).value);
                            if (!isNaN(v)) updateCartQty(i, v);
                          }}
                          onblur={(e) => {
                            const v = parseFloat((e.currentTarget as HTMLInputElement).value);
                            updateCartQty(i, isNaN(v) ? getStep(item.article || item) : v);
                          }}
                          class="w-14 text-center text-base font-black bg-transparent outline-none no-arrows text-brand-400 font-mono"
                        />
                        <button
                          onclick={() => updateCartQty(i, (item.qty || 1) + getStep(item.article || item))}
                          class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 hover:bg-surface-soft transition-all cursor-pointer"
                        ><Plus size={14} /></button>
                      </div>
                    </div>

                    <!-- Item Details & Controls -->
                    <div class="flex-1 min-w-0 space-y-4 w-full">
                      <div class="space-y-1">
                        <div class="text-lg font-black text-text-base leading-tight">
                          {item.art_des || item.descripcion}
                        </div>
                        <div class="flex items-center gap-4 text-[11px] font-bold uppercase tracking-[0.15em]">
                          <span class="text-brand-400 font-mono">{item.co_art}</span>
                          <span class="h-1 w-1 rounded-full bg-border-subtle"></span>
                          <span class="text-text-muted">{item.unidad || item.co_uni || "UNID"}</span>
                          <span class="h-1 w-1 rounded-full bg-border-subtle"></span>
                          <span class={item.article?.ultimo_costo_om > 0 ? "text-emerald-400" : "text-amber-400"}>
                            {item.article?.ultimo_costo_om > 0 ? "Costo Real" : "Costo Calculado"}
                          </span>
                        </div>
                      </div>

                      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <!-- Almacén Selector con descripción -->
                        <div class="relative group/sel">
                          <select
                            value={item.co_alma_selected}
                            onchange={(e) => updateCartWarehouse(i, e.currentTarget.value)}
                            class="w-full h-11 bg-surface-soft rounded-xl px-4 text-sm font-black outline-none border border-border-subtle appearance-none cursor-pointer focus:border-brand-500/30 transition-all hover:bg-surface-strong"
                          >
                            {#if item.disponibilidad && item.disponibilidad.length > 0}
                              {#each item.disponibilidad as alm}
                                <option value={alm.co_alma} class="bg-surface-base text-text-base text-sm">
                                  {alm.des_alma || alm.co_alma} ({alm.stock || 0})
                                </option>
                              {/each}
                            {:else if data.context?.warehouses && data.context.warehouses.length > 0}
                              {#each data.context.warehouses as alm}
                                <option value={alm.co_alma} class="bg-surface-base text-text-base text-sm">
                                  {alm.des_alma || alm.co_alma} (0)
                                </option>
                              {/each}
                            {:else}
                              <option value="01" class="bg-surface-base text-text-base text-sm">Principal (01)</option>
                            {/if}
                          </select>
                          <ChevronDown size={14} class="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted group-hover/sel:text-brand-400 transition-colors pointer-events-none" />
                        </div>

                        <!-- Costo Unitario Editable en Renglón -->
                        <div class="relative group/sel">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={unitCost}
                            oninput={(e) => {
                              const v = parseFloat((e.currentTarget as HTMLInputElement).value);
                              if (!isNaN(v)) updateCartCost(i, v);
                            }}
                            class="w-full h-11 bg-surface-soft rounded-xl pl-4 pr-12 text-sm font-black outline-none border border-border-subtle focus:border-brand-500/30 transition-all hover:bg-surface-strong text-brand-400 font-mono"
                            placeholder="Costo Unitario..."
                          />
                          <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-text-muted pointer-events-none">
                            {showUSD ? '$' : 'Bs.'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <!-- Financial Detail per Row -->
                    <div class="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center w-full lg:w-48 gap-4 border-t lg:border-t-0 border-border-subtle pt-6 lg:pt-0">
                      <div class="text-right space-y-1">
                        <div class="text-xl font-black text-brand-400 leading-none">
                          {totals().symbol}
                          {((unitCost || 0) * (item.qty || 1)).toLocaleString("de-DE", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                        <div class="text-[10px] text-text-muted font-bold uppercase tracking-widest">
                          Total {totals().symbol}
                        </div>
                      </div>
                      <button
                        onclick={() => removeFromCart(i)}
                        class="h-10 w-10 rounded-xl flex items-center justify-center text-text-muted hover:bg-red-500/10 hover:text-red-500 transition-all border border-border-subtle cursor-pointer"
                        title="Eliminar de la orden"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </div>

          <!-- Bloque 3: Resumen Final Consolidado (Full Width) -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <!-- Col Left: Notas & Comentarios -->
            <div class="glass p-8 rounded-[32px] border border-border-subtle space-y-6 flex flex-col h-full bg-surface-soft/20">
              <div class="flex items-center gap-3 text-text-muted border-b border-border-subtle pb-4">
                <FileText size={18} class="text-brand-400" />
                <h4 class="text-[10px] font-black uppercase tracking-[0.2em]">
                  Descripción Global / Observaciones
                </h4>
              </div>

              <div class="space-y-4">
                <div class="space-y-2">
                  <label for="descrip_doc" class="text-[10px] font-black uppercase tracking-widest text-text-muted">Descripción</label>
                  <input
                    id="descrip_doc"
                    type="text"
                    bind:value={orderDescription}
                    class="w-full h-12 bg-surface-base/50 rounded-2xl px-4 text-xs font-bold text-text-base outline-none border border-border-subtle focus:border-brand-500/40 focus:bg-surface-base transition-all"
                  />
                </div>

                <div class="space-y-2">
                  <label for="n_control_doc" class="text-[10px] font-black uppercase tracking-widest text-text-muted">N° Control / Ref Proveedor</label>
                  <input
                    id="n_control_doc"
                    type="text"
                    bind:value={orderNControl}
                    placeholder="Opcional..."
                    class="w-full h-12 bg-surface-base/50 rounded-2xl px-4 text-xs font-bold font-mono text-text-base outline-none border border-border-subtle focus:border-brand-500/40 focus:bg-surface-base transition-all"
                  />
                </div>

                <div class="space-y-2">
                  <label for="comment_doc" class="text-[10px] font-black uppercase tracking-widest text-text-muted">Observaciones / Comentarios</label>
                  <textarea
                    id="comment_doc"
                    bind:value={orderComment}
                    rows="3"
                    placeholder="Condiciones de entrega, acuerdos o notas internas..."
                    class="w-full min-h-[120px] bg-surface-base/50 rounded-2xl p-4 text-sm text-text-base outline-none border border-border-subtle focus:border-brand-500/40 focus:bg-surface-base transition-all resize-none font-medium leading-relaxed placeholder:text-text-muted/30"
                  ></textarea>
                </div>
              </div>
            </div>

            <!-- Col Right: Resumen Financiero & Acciones -->
            <div class="glass p-8 rounded-[32px] border border-border-subtle space-y-8 bg-brand-500/[0.03] backdrop-blur-3xl relative overflow-hidden flex flex-col">
              <div class="absolute -top-12 -right-12 w-48 h-48 bg-brand-500/10 rounded-full blur-[80px]"></div>

              <div class="flex items-center justify-between border-b border-border-subtle pb-6 relative z-10">
                <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                  Total Documento
                </h4>
                <div class="flex bg-surface-base p-1 rounded-xl border border-border-bold shadow-lg">
                  <button
                    onclick={() => toggleCurrency(true)}
                    class={`px-5 py-2 rounded-lg text-xs font-black transition-all duration-300 cursor-pointer ${showUSD ? "bg-brand-600 text-white shadow-lg scale-105" : "text-text-muted hover:text-text-base"}`}
                  >USD</button>
                  <button
                    onclick={() => toggleCurrency(false)}
                    class={`px-5 py-2 rounded-lg text-xs font-black transition-all duration-300 cursor-pointer ${!showUSD ? "bg-brand-600 text-white shadow-lg scale-105" : "text-text-muted hover:text-text-base"}`}
                  >BS</button>
                </div>
              </div>

              <div class="space-y-6 relative z-10">
                <div class="flex justify-between items-center text-base font-bold text-text-muted">
                  <span>Sub-Total</span>
                  <span class="font-mono text-text-base">
                    {totals().symbol} {totals().subtotal.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div class="flex justify-between items-center text-base font-bold">
                  <div class="flex items-center gap-3">
                    <span class="text-text-muted">I.V.A</span>
                    <select
                      bind:value={orderTaxRate}
                      class="bg-surface-strong border border-border-bold text-[10px] font-black text-brand-400 cursor-pointer outline-none hover:bg-surface-soft rounded-lg px-3 py-1.5 transition-all shadow-sm"
                    >
                      <option value={16} class="bg-surface-base font-sans text-sm">Cargar 16%</option>
                      <option value={0} class="bg-surface-base font-sans text-sm">Exento 0%</option>
                    </select>
                  </div>
                  <span class="font-mono text-brand-400">
                    {totals().symbol} {totals().iva.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div class="flex justify-between items-center text-base font-bold text-text-muted">
                  <span>Total Factura</span>
                  <span class="font-mono text-text-base">
                    {totals().symbol} {totals().totalFactura.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {#if totals().retencion > 0}
                  <div class="flex justify-between items-center text-base font-bold text-amber-500/90" transition:slide>
                    <span>Retención ({totals().porc_esp}%)</span>
                    <span class="font-mono">
                      - {totals().symbol} {totals().retencion.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                {/if}

                <div class="pt-8 border-t border-border-bold flex flex-col gap-2">
                  <div class="flex justify-between items-end">
                    <div>
                      <span class="text-[10px] font-black uppercase tracking-[0.2em] text-brand-400/60 block mb-2">Total a Pagar</span>
                      <div class="text-5xl font-black text-text-base drop-shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)] tracking-tight leading-none">
                        {totals().symbol} {totals().total.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="pt-6 space-y-4 relative z-10">
                <form
                  method="POST"
                  action="?/saveOrder"
                  use:enhance={() => {
                    savingOrder = true;
                    return async ({ result }) => {
                      savingOrder = false;
                      if (result.type === "success") {
                        toast.success("¡Orden de compra procesada exitosamente!");
                        goto(`/dashboard/purchases/orders/history?branch_id=${selectedBranch}`);
                      } else if (result.type === "failure") {
                        const data = (result as any).data;
                        const mainMsg = data?.message || "Error al procesar la orden.";
                        const technicalDetails = data?.details ? `\nDetalles: ${data.details}` : "";
                        toast.error(mainMsg + technicalDetails, { duration: 6000 });
                        console.error("Save Order Error:", data);
                      }
                    };
                  }}
                >
                  <input type="hidden" name="branch_id" value={selectedBranch} />
                  <input
                    type="hidden"
                    name="order_data"
                    value={JSON.stringify({
                      doc_num: data.preloadedOrder?.doc_num || null,
                      co_prov: selectedSupplier?.co_prov,
                      co_cond: orderPaymentCondition,
                      descrip: orderDescription,
                      comentario: orderComment,
                      n_control: orderNControl,
                      dir_ent: orderDeliveryAddress,
                      showUSD: showUSD,
                      co_mone: showUSD ? 'USD' : 'BS',
                      renglones: cart.map((c, i) => {
                        const isStrictlyExempt =
                          (c.co_subl || "").trim() === "0901" ||
                          (c.co_art || "").startsWith("0901");
                        const rate = isStrictlyExempt ? 0 : orderTaxRate;
                        const taxType = rate === 16 ? "1" : "5";
                        return {
                          reng_num: i + 1,
                          co_art: c.co_art || c.codigo,
                          art_des: c.art_des || c.descripcion,
                          cantidad: c.qty,
                          precio: showUSD ? Number(c.price_selected?.precio || c.precio_usd || 0) : Number(c.price_selected?.precio_ves || c.precio_ves || 0),
                          cost_unit: showUSD ? Number(c.price_selected?.precio || c.precio_usd || 0) : Number(c.price_selected?.precio_ves || c.precio_ves || 0),
                          co_alma: c.co_alma_selected || selectedWarehouse || '01',
                          co_uni: c.co_uni || c.unidad || 'UND',
                          tipo_imp: taxType,
                          porc_imp: rate,
                          comentario: ''
                        };
                      })
                    })}
                  />

                  <button
                    type="submit"
                    disabled={savingOrder || cart.length === 0 || !selectedSupplier}
                    class="w-full h-20 bg-brand-600 hover:bg-brand-500 text-white rounded-[24px] font-black text-xl uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(var(--brand-rgb),0.3)] active:scale-[0.97] transition-all flex items-center justify-center gap-4 disabled:opacity-50 disabled:grayscale group cursor-pointer"
                  >
                    {#if savingOrder}
                      <Loader2 size={32} class="animate-spin text-brand-400/40" />
                      <span class="animate-pulse">Procesando en Profit Plus...</span>
                    {:else}
                      <div class="bg-surface-strong/50 p-2.5 rounded-xl group-hover:scale-110 transition-transform">
                        <Check size={28} />
                      </div>
                      {data.preloadedOrder ? 'Actualizar Orden de Compra' : 'Confirmar y Guardar Orden'}
                    {/if}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

{#if showSupplierSelectionModal}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    in:fade={{ duration: 200 }}
    out:fade={{ duration: 200 }}
  >
    <div
      class="bg-surface-base w-full max-w-2xl rounded-3xl border border-border-subtle shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      in:scale={{ duration: 300, start: 0.95 }}
    >
      <div
        class="flex items-center justify-between p-6 border-b border-border-subtle bg-surface-soft"
      >
        <div>
          <h2 class="text-2xl font-black tracking-tight flex items-center gap-2">
            <Building2 size={24} class="text-brand-500" />
            Múltiples Proveedores Encontrados
          </h2>
          <p class="text-text-muted mt-1 text-sm">
            Seleccione el proveedor correcto de la lista ({matchingSuppliers.length} resultados)
          </p>
        </div>
        <button
          onclick={() => (showSupplierSelectionModal = false)}
          class="p-2 hover:bg-white/10 rounded-xl transition-colors text-text-muted hover:text-white cursor-pointer"
        >
          <X size={20} />
        </button>
      </div>

      <div class="overflow-y-auto p-4 custom-scrollbar space-y-2 flex-1">
        {#each matchingSuppliers as supplier}
          <button
            class="w-full text-left p-4 rounded-2xl border border-border-subtle bg-surface-soft hover:bg-surface-strong hover:border-brand-500/50 transition-all flex flex-col gap-1 group relative overflow-hidden cursor-pointer"
            onclick={() => {
              selectedSupplier = supplier;
              rifInput = supplier.rif || supplier.co_prov;
              showRegistrationForm = false;
              showSupplierSelectionModal = false;
              toast.success("Proveedor seleccionado: " + (supplier.descripcion || supplier.prov_des));
            }}
          >
            <div class="absolute inset-0 bg-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div class="relative z-10 flex items-start justify-between w-full">
              <div>
                <h3 class="font-bold text-lg">{supplier.descripcion || supplier.prov_des}</h3>
                <div class="flex items-center gap-3 mt-2 text-sm text-text-muted">
                  <span class="flex items-center gap-1">
                    <Tag size={14} class="text-brand-400" />
                    {supplier.rif || supplier.co_prov}
                  </span>
                  {#if supplier.telefonos}
                    <span class="flex items-center gap-1">
                      <Phone size={14} class="text-brand-400" />
                      {supplier.telefonos}
                    </span>
                  {/if}
                  {#if supplier.email}
                    <span class="flex items-center gap-1">
                      <Mail size={14} class="text-brand-400" />
                      {supplier.email}
                    </span>
                  {/if}
                </div>
              </div>
              <div class="h-8 w-8 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity -translate-x-4 group-hover:translate-x-0">
                <ChevronRight size={18} />
              </div>
            </div>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

{#if activeTab === 1 || activeTab === 2}
  <div
    class="fixed z-[100] touch-none select-none animate-in fade-in slide-in-from-bottom-8 duration-500"
    style="bottom: {dragY}px; right: {dragX}px;"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    transition:fade
  >
    <div
      class="flex items-center gap-1 bg-surface-raised/95 border border-border-bold p-1.5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl cursor-grab active:cursor-grabbing"
    >
      <!-- Grab handle dots on the left -->
      <div class="flex flex-col gap-0.5 px-1.5 opacity-40 shrink-0">
        <div class="flex gap-0.5">
          <span class="w-1 h-1 bg-text-base rounded-full"></span>
          <span class="w-1 h-1 bg-text-base rounded-full"></span>
        </div>
        <div class="flex gap-0.5">
          <span class="w-1 h-1 bg-text-base rounded-full"></span>
          <span class="w-1 h-1 bg-text-base rounded-full"></span>
        </div>
        <div class="flex gap-0.5">
          <span class="w-1 h-1 bg-text-base rounded-full"></span>
          <span class="w-1 h-1 bg-text-base rounded-full"></span>
        </div>
      </div>
      
      <button
        onclick={() => toggleCurrency(true)}
        class={`h-11 px-5 rounded-xl text-xs font-black tracking-widest transition-all duration-300 flex items-center gap-2 cursor-pointer ${
          showUSD
            ? "bg-brand-600 text-white shadow-lg shadow-brand-500/20 scale-105"
            : "text-text-muted hover:text-text-base hover:bg-white/5"
        }`}
      >
        USD
      </button>
      <button
        onclick={() => toggleCurrency(false)}
        class={`h-11 px-5 rounded-xl text-xs font-black tracking-widest transition-all duration-300 flex items-center gap-2 cursor-pointer ${
          !showUSD
            ? "bg-brand-600 text-white shadow-lg shadow-brand-500/20 scale-105"
            : "text-text-muted hover:text-text-base hover:bg-white/5"
        }`}
      >
        BS
      </button>
    </div>
  </div>
{/if}

<ImageViewer bind:isOpen={viewerOpen} imageUrl={viewerUrl} />
