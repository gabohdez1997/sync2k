<script lang="ts">
  import { untrack } from "svelte";
  import { enhance } from "$app/forms";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
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
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { deserialize } from "$app/forms";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import SearchBar from "$lib/components/ui/SearchBar.svelte";
  import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";
  import dayjs from "dayjs";
  import "dayjs/locale/es";
  import type { PageData } from "./$types";

  dayjs.locale("es");

  let { data }: { data: PageData } = $props();

  // --- ESTADO GLOBAL ---
  let activeTab = $state(0); // 0: Cliente, 1: Artículos, 2: Confirmación
  let searchTerm = $state($page.url.searchParams.get("search") || "");
  let isSearching = $state(false);

  // --- CONTEXTO (Sedes/Almacenes) ---
  let selectedBranch = $state(data.selectedBranchId || "");
  let selectedWarehouse = $state("");

  let selectedBranchConfig = $derived(
    Array.isArray(data.branches)
      ? data.branches.find((b: any) => b.id === selectedBranch)
      : null,
  );

  $effect(() => {
    // Si solo hay una sucursal, seleccionarla por defecto
    const branches = data.context?.branches || [];
    if (branches.length === 1) {
      selectedBranch = branches[0].id;
    } else {
      selectedBranch =
        data.context?.branchId || $page.url.searchParams.get("branch_id") || "";
    }

    selectedWarehouse =
      data.context?.warehouseId || $page.url.searchParams.get("co_alma") || "";
  });

  // Limpiar cliente al cambiar de sede si estamos en el paso 1
  $effect(() => {
    if (activeTab === 0 && selectedBranch) {
      selectedClient = null;
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
  let quoteTaxRate = $state(16); // 16 o 0 (global para items no exentos)
  let quoteDescription = $state("");
  let masterBranchId = $state(""); // Sede donde se inició el pedido (dueña del cliente)

  // --- PASO 1: CLIENTE ---
  let rifInput = $state("");
  let searchingClient = $state(false);
  let selectedClient = $state<any>(null);
  let showRegistrationForm = $state(false);
  let matchingClients = $state<any[]>([]);
  let showClientSelectionModal = $state(false);

  // --- PASO 2: ARTÍCULOS Y CARRITO ---
  let quantities = $state<Record<string, number>>({});
  let selectedItemWarehouse = $state<Record<string, string>>({});
  let selectedItemPriceIndex = $state<Record<string, number>>({});
  let cart = $state<any[]>([]);
  let lastLoadedDoc = $state("");
  let isInitializing = false;

  // --- ESTADO IMPORTACIÓN ---
  let showImportModal = $state(false);
  let importBranch = $state("");
  let importSearch = $state("");
  let importQuotesList = $state<any[]>([]);
  let isSearchingQuotes = $state(false);
  let isLoadingQuoteDetail = $state(false);

  $effect(() => {
    if (showImportModal && !importBranch && selectedBranch) {
      importBranch = selectedBranch;
    }
  });

  async function searchQuotesForImport() {
    const targetBranch = importBranch || selectedBranch;
    if (!targetBranch) {
      toast.error("Seleccione una sucursal primero");
      return;
    }
    isSearchingQuotes = true;
    importQuotesList = []; // Limpiar antes de buscar
    
    const formData = new FormData();
    formData.append("branch_id", targetBranch);
    formData.append("search", importSearch);

    try {
      const response = await fetch("?/searchQuotes", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      
      console.log("🔍 [IMPORT] Resultado búsqueda:", result);

      if (result.type === "success") {
        // En SvelteKit 2, si la acción devuelve un objeto, result.data es el objeto
        // Pero si se usa fetch manual a la acción, a veces viene como string JSON o como el objeto directamente
        let payload = result.data;
        if (typeof payload === "string") {
          try {
            const parsed = JSON.parse(payload);
            // SvelteKit suele envolver en un array ["success", { ... }]
            payload = Array.isArray(parsed) ? parsed[1] : parsed;
          } catch(e) { console.error("Error parsing result.data", e); }
        }
        
        importQuotesList = payload?.quotes || [];
        if (importQuotesList.length === 0) {
          toast.info("No se encontraron cotizaciones con ese criterio.");
        }
      } else {
        const errorMsg = result.data?.message || "Error al buscar cotizaciones";
        toast.error(errorMsg);
      }
    } catch (e: any) {
      console.error("[IMPORT] Error:", e);
      toast.error("Error de conexión: " + e.message);
    } finally {
      isSearchingQuotes = false;
    }
  }

  async function loadQuoteIntoPedido(doc_num: string) {
    isLoadingQuoteDetail = true;
    const formData = new FormData();
    formData.append("branch_id", selectedBranch);
    formData.append("doc_num", doc_num);

    try {
      const response = await fetch("?/getQuoteDetail", {
        method: "POST",
        body: formData,
      });
      const result = deserialize(await response.text());

      if (result.type === "success") {
        const payload = result.data as any;
        const q = payload?.quote;

        if (q) {
          // 1. Cargar Cliente
          selectedClient = {
            co_cli: String(q.co_cli || "").trim(),
            cli_des: String(q.cli_des || "").trim(),
            rif: String(q.rif || q.co_cli || "").trim(),
            direc1: String(q.direc1 || q.dir_ent || "").trim(),
            telefonos: String(q.telefonos || "N/A").trim(),
            email: String(q.email || "N/A").trim(),
            co_zon: String(q.co_zon || "").trim(),
            co_ven: String(q.co_ven || "").trim(),
            cond_pag: String(q.co_cond || "").trim(),
          };

          // 2. Cargar Metadata
          showUSD = String(q.co_mone || "")
            .toUpperCase()
            .includes("US");
          quoteTaxRate = (Number(q.monto_imp) || 0) === 0 ? 0 : 16;
          quoteDescription =
            `Ref: Cotización ${q.doc_num} - ` + String(q.descrip || "").trim();

          // 3. Cargar Renglones al Carrito
          if (q.renglones && Array.isArray(q.renglones)) {
            cart = q.renglones.map((r: any) => {
              const artId = String(r.co_art || "").trim();
              const almaId = String(r.co_alma || "").trim();

              // Inicializar estados individuales para que el UI responda correctamente
              quantities[artId] = Number(r.cantidad || 0);
              selectedItemWarehouse[artId] = almaId;
              selectedItemPriceIndex[artId] = 0;

              return {
                co_art: artId,
                art_des: String(r.art_des || r.des_art || "").trim(),
                qty: Number(r.cantidad || 0),
                cantidad: Number(r.cantidad || 0),
                co_uni: String(r.co_uni || "").trim(),
                co_alma_selected: almaId,
                porc_imp: Number(r.porc_imp || 0),
                tipo_imp: String(r.tipo_imp || "1"),
                co_lin: String(r.co_lin || "").trim(),
                // Mapear precios
                price_selected: {
                  precio: showUSD
                    ? Number(r.prec_vta_om || 0)
                    : Number(r.precio || 0) / Number(q.tasa || 1),
                  precio_ves: Number(r.precio || 0),
                  id_precio: String(r.co_precio || "01").trim(),
                },
                precios: [
                  {
                    precio: showUSD
                      ? Number(r.prec_vta_om || 0)
                      : Number(r.precio || 0) / Number(q.tasa || 1),
                    precio_ves: Number(r.precio || 0),
                    des_tipo: "Precio Cotización",
                    id_precio: String(r.co_precio || "01").trim(),
                  },
                ],
              };
            });

            // Disparar rehidratación para traer existencias reales y precios actuales
            rehydrateCart();
          }

          showImportModal = false;
          activeTab = 1; // Ir a artículos para revisar
          toast.success(`Cotización ${doc_num} importada con éxito`);
        } else {
          toast.error("No se pudo obtener el detalle de la cotización");
        }
      } else {
        toast.error("Fallo al cargar datos de la cotización");
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Error: " + e.message);
    } finally {
      isLoadingQuoteDetail = false;
    }
  }

  $effect(() => {
    const q = data.preloadedOrder;
    if (q && q.doc_num !== lastLoadedDoc) {
      if (isInitializing) return;
      isInitializing = true;
      activeTab = 2;
      lastLoadedDoc = q.doc_num;
      
      // LIMPIEZA AGRESIVA: Si entramos a editar, borrar cualquier borrador previo
      localStorage.removeItem("profit_order_draft");

      console.log("🎁 [INIT] Iniciando precarga prioritaria:", q.doc_num);
      toast.info(`Editando Pedido ${q.doc_num}`);

      try {
        // 1. Estados Globales
        rifInput = String(q.co_cli || "").trim();
        showUSD = String(q.co_mone || "")
          .toUpperCase()
          .includes("US");
        quoteTaxRate = (Number(q.monto_imp) || 0) === 0 ? 0 : 16;
        quoteDescription = String(q.descrip || q.comentario || "").trim();

        // 2. Cliente (Campos Críticos)
        selectedClient = {
          co_cli: String(q.co_cli || "").trim(),
          cli_des: String(q.cli_des || "").trim(),
          rif: String(q.rif || q.co_cli || "").trim(),
          direc1: String(q.direc1 || q.dir_ent || "").trim(),
          telefonos: String(q.telefonos || "N/A").trim(),
          email: String(q.email || "N/A").trim(),
          co_zon: String(q.co_zon || "").trim(),
          zon_des: String(q.zon_des || "").trim(),
          contribu_e: !!q.contribu_e,
          co_ven: String(q.co_ven || "").trim(),
          ven_des: String(q.ven_des || "").trim(),
          co_mone: String(q.co_mone || "BS").trim(),
        };

        // 3. Renglones
        if (
          q.renglones &&
          Array.isArray(q.renglones) &&
          q.renglones.length > 0
        ) {
          const mappedCart = q.renglones.map((r: any) => {
            const artId = String(r.co_art || "").trim();
            const almaId = String(r.co_alma || "").trim();

            // Set individual states
            quantities[artId] = Number(r.cantidad || 1);
            selectedItemWarehouse[artId] = almaId;
            selectedItemPriceIndex[artId] = 0;

            const realAlma = data.context?.warehouses?.find(
              (w: any) => String(w.co_alma || "").trim() === almaId,
            );

            return {
              co_art: artId,
              art_des: String(r.art_des || "").trim(),
              qty: Number(r.cantidad || 0),
              precio_ves: Number(r.precio || 0),
              precio_usd: Number(r.prec_vta_om || 0),
              porc_imp: Number(r.porc_imp ?? 16),
              co_alma_selected: almaId,
              co_uni: String(r.co_uni || "").trim(),
              unidad: String(r.unidad || r.co_uni || "UND").trim(),
              price_selected: {
                precio: Number(r.prec_vta_om || 0),
                precio_ves: Number(r.precio || 0),
              },
              disponibilidad: [
                {
                  co_alma: almaId,
                  des_alma: String(realAlma?.des_alma || almaId).trim(),
                  stock: Number(r.cantidad || 0),
                },
              ],
              precios: [
                {
                  precio: Number(r.prec_vta_om || 0),
                  precio_ves: Number(r.precio || 0),
                  moneda: String(q.co_mone || "BS"),
                },
              ],
            };
          });
          cart = mappedCart;
        }

        console.log("âœ… [INIT] Carga completa. Rehidratando...");
        if (browser) rehydrateCart();
      } catch (err: any) {
        console.error("âŒ [INIT] Error mapeando datos:", err);
        toast.error("Error al procesar datos del pedido: " + err.message);
      } finally {
        isInitializing = false;
      }
    }
  });

  // --- Borradores y Persistencia ---
  $effect(() => {
    // Solo intentar cargar borrador si NO estamos inicializando una edición
    if (isInitializing) return;

    untrack(() => {
      const draftStr = localStorage.getItem("profit_order_draft");
      // Solo cargar borrador si NO estamos en una edición y el estado actual está virgen
      if (
        draftStr &&
        !data.preloadedOrder &&
        cart.length === 0 &&
        !selectedClient &&
        lastLoadedDoc === ""
      ) {
        try {
          const parsed = JSON.parse(draftStr);
          if (parsed.cart) cart = parsed.cart;
          if (parsed.selectedClient !== undefined)
            selectedClient = parsed.selectedClient;
          if (parsed.activeTab !== undefined) activeTab = parsed.activeTab;
          if (parsed.rifInput) rifInput = parsed.rifInput;
          console.log("ðŸ“ [DRAFT] Borrador cargado automáticamente");
        } catch (e) {
          console.error("Error loading draft", e);
        }
      }
    });
  });

  $effect(() => {
    // Este efecto SÃ debe reaccionar a cambios en cart, selectedClient, etc.
    // pero debemos evitar que el autoguardado se dispare durante la inicialización
    if (data.preloadedOrder || isInitializing || lastLoadedDoc !== "") return;

    // Accedemos a las variables para que el efecto sea dependiente de ellas
    const _cart = cart;
    const _client = selectedClient;
    const _tab = activeTab;
    const _rif = rifInput;

    untrack(() => {
      const draft = {
        cart: _cart,
        selectedClient: _client,
        activeTab: _tab,
        rifInput: _rif,
      };
      localStorage.setItem("profit_order_draft", JSON.stringify(draft));
    });
  });
  async function rehydrateCart() {
    if (!browser || !cart.length) return;

    console.log("ðŸ’§ Rehidratando existencias y precios del carrito...");
    const branchId = selectedBranch;

    for (let i = 0; i < cart.length; i++) {
      const item = cart[i];
      try {
        const co = item.co_art.trim();
        const res = await fetch(
          `/api/agent/articles?co_art=${encodeURIComponent(co)}&branch_id=${branchId}`,
        );
        const d = await res.json();

        console.log(`ðŸ” Rehidratando ${co}...`, d);

        if (d.success && d.data && d.data.length > 0) {
          // Buscar el match exacto por si la búsqueda trajo parecidos
          const fresh =
            d.data.find((a: any) => a.co_art?.trim() === co) || d.data[0];

          // --- FILTRADO DE ALMACENES POR PERMISO ---
          const allowedIds = (data.context?.warehouses || []).map((w: any) =>
            w.co_alma?.trim(),
          );
          const filteredDispo = (fresh.disponibilidad || []).filter(
            (disp: any) => allowedIds.includes(disp.co_alma?.trim()),
          );

          // --- BUSCAR ÍNDICE DE PRECIO QUE COINCIDA CON EL PEDIDO ---
          let matchedPriceIndex = 0;
          if (fresh.precios && fresh.precios.length > 0) {
            const targetOM = Number(cart[i].price_selected?.precio || 0);
            const targetVES = Number(cart[i].price_selected?.precio_ves || 0);
            
            console.log(`âš–ï¸ Buscando coincidencia para ${co}: OM=${targetOM}, VES=${targetVES}`);

            // Intentar buscar match por cualquiera de las dos monedas (con margen de error de 0.01)
            const idx = fresh.precios.findIndex((p: any) => {
              const matchOM = targetOM > 0 && Math.abs(Number(p.precio) - targetOM) < 0.05;
              const matchVES = targetVES > 0 && Math.abs(Number(p.precio_ves) - targetVES) < 0.05;
              return matchOM || matchVES;
            });

            if (idx !== -1) {
               matchedPriceIndex = idx;
               console.log(`ðŸŽ¯ Match encontrado en Tipo ${idx + 1} para ${co}`);
            } else {
               console.warn(`âš ï¸ No se encontró match de precio exacto para ${co}. Usando Tipo 1.`);
            }
          }

          // Actualizar estados reactivos globales
          selectedItemPriceIndex[co] = matchedPriceIndex;

          // Actualizar item en el carrito con RE-ASIGNACIÓN para Svelte kit
          const updatedItem = {
            ...cart[i],
            art_des: fresh.descripcion || fresh.art_des || cart[i].art_des,
            disponibilidad:
              filteredDispo.length > 0
                ? filteredDispo
                : fresh.disponibilidad || cart[i].disponibilidad,
            precios: fresh.precios || cart[i].precios,
            unidad: fresh.unidad || cart[i].unidad,
            porc_imp:
              fresh.tipo_imp === "7" ? 0 : (fresh.porc_imp ?? cart[i].porc_imp),
            price_index_selected: matchedPriceIndex,
            price_selected:
              fresh.precios?.[matchedPriceIndex] || cart[i].price_selected,
            co_alma_selected: item.co_alma_selected,
          };

          cart[i] = updatedItem;
          console.log(`âœ… Artículo ${co} REHIDRATADO exitosamente.`);
        }
      } catch (e) {
        console.error(`âŒ Error rehidratando ${item.co_art}:`, e);
      }
    }
  }

  // Datos para nuevo cliente
  let newClient = $state({
    rif: "",
    cli_des: "",
    email: "",
    telefonos: "",
    direc1: "",
    co_zon: "",
    contribuyente: false,
    contribu_e: false,
    porc_esp: 75,
    tipo_per: "1",
    id_precio: "01",
  });

  // Estandarizar rifInput reactivamente
  $effect(() => {
    if (rifInput) {
      const standardized = rifInput.toUpperCase().replace(/[-\s]/g, "");
      if (standardized !== rifInput) rifInput = standardized;
    }
  });

  const displayArticles = $derived.by(() => {
    if (!localArticles || localArticles.length === 0) return [];

    return localArticles.filter(
      (a: any, i: number, ar: any[]) =>
        ar.findIndex(
          (b) => (b.co_art || b.codigo) === (a.co_art || a.codigo),
        ) === i,
    );
  });

  // Inicializar estados para nuevos artículos de forma segura
  $effect(() => {
    if (localArticles && localArticles.length > 0) {
      localArticles.forEach((art) => {
        const co = art.co_art || art.codigo;
        if (selectedItemPriceIndex[co] === undefined)
          selectedItemPriceIndex[co] = 0;
        if (
          selectedItemWarehouse[co] === undefined &&
          art.disponibilidad?.length > 0
        ) {
          selectedItemWarehouse[co] = art.disponibilidad[0].co_alma;
        }
        const step = getStep(art);
        if (quantities[co] === undefined || quantities[co] < step)
          quantities[co] = step;
      });
    }
  });

  // --- PERSISTENCIA LOCAL ---
  let localArticles = $state<any[]>(data.articles || []);
  let localPagination = $state(
    data.pagination || { total: 0, page: 1, limit: 12, totalPages: 0 },
  );
  let loadingArticles = $state(false);

  async function fetchArticles(
    branchId: string,
    searchParams: URLSearchParams,
  ) {
    loadingArticles = true;
    try {
      // Usar estrictamente los parámetros recibidos
      const params = new URLSearchParams(searchParams);

      if (branchId) {
        params.set("branch_id", branchId);
      }

      // Asegurar límite de 12 si no viene en los params
      if (!params.has("limit")) {
        params.set("limit", "12");
      }

      const res = await fetch(`/api/agent/articles?${params.toString()}`);
      const d = await res.json();
      if (d.success) {
        localArticles = d.data;
        localPagination = d.pagination;
      }
    } catch (e) {
      console.error("Error fetching articles", e);
    } finally {
      loadingArticles = false;
    }
  }

  // Carga reactiva basada EN LA URL (Solo si estamos en esta página)
  $effect(() => {
    const params = $page.url.searchParams;
    const branch = selectedBranch;
    const currentPath = $page.url.pathname;

    // Solo disparar si estamos en la pestaña de artículos y seguimos en la ruta de cotizaciones
    if (browser && activeTab === 1 && currentPath.includes("/sales/orders")) {
      fetchArticles(branch, params);
    }
  });



  // --- ACCIONES ---
  function nextStep() {
    if (activeTab === 0) {
      if (!selectedClient) {
        toast.error("Seleccione o registre un cliente primero.");
        return;
      }
      // Bloquear la sede maestra al avanzar a artículos
      masterBranchId = selectedBranch;
    }
    if (activeTab < 2) activeTab++;
  }

  function prevStep() {
    if (activeTab > 0) activeTab--;
  }

  function clearQuote(avoidRedirect = false) {
    cart = [];
    selectedClient = null;
    activeTab = 0;
    rifInput = "";
    showRegistrationForm = false;
    quoteDescription = "";
    masterBranchId = "";
    localStorage.removeItem("profit_order_draft");
    lastLoadedDoc = ""; // Resetear rastreador de edición
    
    if (!avoidRedirect) {
      toast.success("Formulario limpiado");
      // Si estábamos editando, limpiar la URL para que no vuelva a precargar
      if ($page.url.searchParams.has("doc_num")) {
        goto("/dashboard/sales/orders");
      }
    }
  }

  // Detectar salida de edición para resetear estado
  $effect(() => {
    const docNumInUrl = $page.url.searchParams.get("doc_num");
    // Solo limpiar si venimos de haber cargado un documento (lastLoadedDoc) y ahora la URL está limpia (doc_num null)
    if (!docNumInUrl && lastLoadedDoc !== "" && !isInitializing) {
      console.log("🧹 [STATE] Detectada salida de edición. Limpiando para nuevo pedido.");
      clearQuote(true); 
      lastLoadedDoc = ""; // Resetear marca de carga
      activeTab = 0;
    }
  });

  function isDecimalAllowed(itemOrArticle: any) {
    const configStr = String(selectedBranchConfig?.allow_decimals_units || 'MTS, MTS2, KG');
    const allowed = configStr.split(',').map((s: string) => s.trim().toUpperCase());
    const co_uni = String(itemOrArticle?.co_uni || '').trim().toUpperCase();
    const unidad = String(itemOrArticle?.unidad || '').trim().toUpperCase();
    console.log("UNIT CHECK:", { co_uni, unidad, allowed, configStr });
    
    // Forzar coincidencia por si acaso hay un sub-string 
    return allowed.some(a => a && (co_uni.includes(a) || unidad.includes(a)));
  }

  function getStep(itemOrArticle: any) {
    return isDecimalAllowed(itemOrArticle) ? 0.5 : 1;
  }

  function addToCart(article: any) {
    const co_art = article.co_art || article.codigo || article.id;
    const step = getStep(article);
    const qty = quantities[co_art] || step;

    // Identify if it's a service (Linea 09 or code starts with 09)
    const isService = article.co_lin?.trim() === "09" || (co_art || "").startsWith("09");

    // Obtener almacén seleccionado
    let almId =
      selectedItemWarehouse[co_art] ||
      (() => {
        // First try the branch default warehouse
        if (isService && selectedBranchConfig?.default_warehouse) {
          return selectedBranchConfig.default_warehouse;
        }

        const disp = article.disponibilidad || [];
        if (!disp.length) {
          // Fallback to the branch default warehouse even if not in disp list for services
          if (isService && selectedBranchConfig?.default_warehouse) {
            return selectedBranchConfig.default_warehouse;
          }
          // Ultimate fallback to first available warehouse
          return data.context?.warehouses?.[0]?.co_alma || null;
        }

        let maxAlm = disp[0];
        for (let a of disp) {
          if (
            (a.stock || a.cant_stock || 0) >
            (maxAlm.stock || maxAlm.cant_stock || 0)
          )
            maxAlm = a;
        }
        return maxAlm.co_alma;
      })();

    // For services, if still no warehouse, force first one available in context
    if (isService && !almId) {
      almId = data.context?.warehouses?.[0]?.co_alma || "01";
    }

    if (!almId) {
      toast.error("Sin disponibilidad en ningún almacén.");
      return;
    }

    const availableStock =
      article.disponibilidad?.find((a: any) => a.co_alma === almId)?.stock || 0;
    const existingIndex = cart.findIndex(
      (i) =>
        (i.co_art || i.codigo || i.id) === co_art &&
        i.co_alma_selected === almId,
    );
    const currentCartQty = existingIndex >= 0 ? cart[existingIndex].qty : 0;

    // Skip stock validation for services
    if (!isService && currentCartQty + qty > availableStock) {
      toast.error(
        `Stock insuficiente. Disponible: ${availableStock - currentCartQty}`,
      );
      return;
    }

    // Obtener precio seleccionado
    const priceIndex = selectedItemPriceIndex[co_art] || 0;
    const selectedPriceObj =
      article.precios?.[priceIndex] || article.precios?.[0];

    if (!selectedPriceObj) {
      toast.error("Este artículo no tiene precios definidos.");
      return;
    }

    if (existingIndex >= 0) {
      cart[existingIndex].qty += qty;
    } else {
      cart = [
        ...cart,
        {
          ...article,
          qty,
          co_alma_selected: almId,
          price_index_selected: priceIndex,
          price_selected: selectedPriceObj,
        },
      ];
    }

    toast.success(`Agregado: ${article.art_des || article.descripcion}`);
  }

  function removeFromCart(index: number) {
    cart = cart.filter((_, i) => i !== index);
  }

  function updateCartQty(index: number, newQty: number) {
    const item = cart[index];
    const step = getStep(item);

    if (newQty < step || isNaN(newQty)) {
      cart[index].qty = step;
      return;
    }
    
    // Forzar escalón y evitar imprecisiones de coma flotante
    let roundedQty = Math.round(newQty / step) * step;

    const isService =
      item.co_lin?.trim() === "09" ||
      (item.co_art || item.codigo || "").startsWith("09");

    if (isService) {
      cart[index].qty = roundedQty;
      return;
    }

    const available =
      item.disponibilidad?.find((a: any) => a.co_alma === item.co_alma_selected)
        ?.stock || 0;

    if (roundedQty > available) {
      toast.error(`Stock insuficiente en este almacén. Máximo: ${available}`);
      cart[index].qty = Math.floor(available / step) * step || step;
    } else {
      cart[index].qty = roundedQty;
    }
  }

  function updateCartWarehouse(index: number, co_alma: string) {
    const item = cart[index];
    const newAlm = item.disponibilidad?.find((a: any) => a.co_alma === co_alma);
    if (!newAlm) return;

    item.co_alma_selected = co_alma;
    const stock = newAlm.stock || 0;
    if (item.qty > stock) {
      toast.warning(`Cantidad ajustada al stock de ${newAlm.des_alma}`);
      item.qty = Math.max(1, stock);
    }
    cart[index] = { ...item };
  }

  function updateCartPrice(index: number, priceIndex: number) {
    const item = cart[index];
    const newPrice = item.precios?.[priceIndex];
    if (!newPrice) return;

    item.price_index_selected = priceIndex;
    item.price_selected = newPrice;
    cart[index] = { ...item };
  }

  function handleSearch(e?: Event) {
    if (e) e.preventDefault();
    isSearching = true;
    const url = new URL($page.url);

    if (searchTerm?.trim()) url.searchParams.set("search", searchTerm.trim());
    else url.searchParams.delete("search");

    if (selectedBranch) url.searchParams.set("branch_id", selectedBranch);
    else url.searchParams.delete("branch_id");

    if (selectedWarehouse) url.searchParams.set("co_alma", selectedWarehouse);
    else url.searchParams.delete("co_alma");

    if (selectedLinea) url.searchParams.set("linea", selectedLinea);
    else url.searchParams.delete("linea");

    if (selectedCategoria) url.searchParams.set("categoria", selectedCategoria);
    else url.searchParams.delete("categoria");
    
    if (sortOption && sortOption !== "relevance")
      url.searchParams.set("sort", sortOption);
    else url.searchParams.delete("sort");

    url.searchParams.set("page", "1");

    // En Svelte 5, goto con los mismos params podría no disparar fetch si no cambiamos el estado
    // pero como dependemos de $page.url.search, debería funcionar si la URL cambia.
    goto(url.toString(), { keepFocus: true, replaceState: true }).finally(
      () => (isSearching = false),
    );
  }

  const totals = $derived(() => {
    let subUSD = 0;
    let subBS = 0;
    let ivaUSD = 0;
    let ivaBS = 0;

    cart.forEach((item) => {
      // Un ítem es estrictamente exento SOLO si es de la línea 09
      const isStrictlyExempt =
        (item.co_lin || "").trim() === "09" ||
        (item.co_art || "").startsWith("09");

      const rate = isStrictlyExempt ? 0 : quoteTaxRate;

      const pUSD =
        item.price_selected?.precio || item.precios?.[0]?.precio || 0;
      const pBS =
        item.price_selected?.precio_ves || item.precios?.[0]?.precio_ves || 0;

      const baseUSD = item.qty * pUSD;
      const baseBS = item.qty * pBS;

      subUSD += baseUSD;
      subBS += baseBS;
      ivaUSD += baseUSD * (rate / 100);
      ivaBS += baseBS * (rate / 100);
    });

    const porcEsp = selectedClient?.porc_esp ? Number(selectedClient.porc_esp) : 0;
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
</script>

<div class="flex flex-col gap-8 min-h-svh pb-20" in:fade>
  <!-- Header con botón de Historial -->
  <div
    class="w-full max-w-6xl mx-auto px-4 mt-6 flex flex-col md:flex-row justify-between md:items-center gap-4"
  >
    <div class="flex flex-col gap-2">
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <ShoppingBag size={40} class="text-brand-500" />
        {data.preloadedOrder ? `Editar Pedido` : "Nuevo Pedido"}
      </h1>
      <p class="text-text-muted text-lg">
        {data.preloadedOrder
          ? `Documento Nro: ${data.preloadedOrder.doc_num}`
          : "Generar nuevo documento"}
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

    <div class="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
      {#if !data.preloadedOrder}
        <button
          onclick={() => {
            if (!selectedBranch) {
              toast.error("Seleccione una sucursal primero");
              return;
            }
            showImportModal = true;
          }}
          class="flex items-center justify-center gap-2 px-5 py-3 h-14 rounded-2xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 transition-all font-bold active:scale-95 shadow-sm shrink-0 w-full md:w-auto"
        >
          <FileText size={18} />
          Importar Cotización
        </button>
      {/if}

      <a
        href="/dashboard/sales/orders/history"
        class="flex items-center justify-center gap-2 px-5 py-3 h-14 rounded-2xl bg-surface-soft hover:bg-surface-strong text-text-base border border-border-subtle transition-all font-bold active:scale-95 shadow-sm shrink-0 w-full md:w-auto"
      >
        <Clock size={18} class="text-brand-500" />
        Ver Historial
      </a>
    </div>
  </div>
  <!-- Step Progress Indicator -->
  <div class="w-full max-w-4xl mx-auto px-4 mt-2">
    <div class="flex items-center justify-between relative">
      <!-- Line Background -->
      <div
        class="absolute left-0 top-1/2 -translate-y-1/2 w-full h-[2px] bg-surface-soft z-0"
      ></div>
      <div
        class="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] bg-brand-500 transition-all duration-500 z-0"
        style="width: {activeTab === 0
          ? '0%'
          : activeTab === 1
            ? '50%'
            : '100%'}"
      ></div>

      <!-- Step 1: Cliente -->
      <button
        onclick={() => (activeTab = 0)}
        class="relative z-10 flex flex-col items-center gap-2 group"
      >
        <div
          class={`h-12 w-12 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 ${activeTab >= 0 ? "bg-brand-600 border-brand-500 shadow-lg shadow-brand-500/20" : "bg-surface-base border-border-subtle"}`}
        >
          <User
            size={20}
            class={activeTab >= 0 ? "text-white" : "text-text-muted"}
          />
        </div>
        <span
          class={`text-[10px] font-black uppercase tracking-widest ${activeTab === 0 ? "text-brand-400" : "text-text-muted"}`}
          >Cliente</span
        >
      </button>

      <!-- Step 2: Artículos -->
      <button
        onclick={() => selectedClient && (activeTab = 1)}
        disabled={!selectedClient}
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
        onclick={() => selectedClient && cart.length > 0 && (activeTab = 2)}
        disabled={!selectedClient || cart.length === 0}
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
      <!-- SECTION 1: IDENTIFICACIÓN DE CLIENTE -->
      <div class="space-y-8" in:fade>
        <div class="text-center max-w-2xl mx-auto">
          <h2 class="text-3xl font-black tracking-tight">
            Identificación del Cliente
          </h2>
          <p class="text-text-muted mt-2">
            Ingrese el RIF para buscar o registrar un nuevo cliente.
          </p>
        </div>

        <!-- Search Bar for RIF -->
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
                  placeholder="Sucursal de Venta..."
                  icon={Store}
                  class="w-full h-14"
                  onchange={() => handleSearch()}
                />
              </div>
            {/if}

            <div class="w-full md:w-[calc(50%-0.5rem)] xl:w-[25%]">
              <SearchBar
                bind:value={rifInput}
                isSearching={searchingClient}
                placeholder="V12345678"
                className="w-full h-14"
                onsubmit={(e: Event) => {
                  const form = document.querySelector(
                    'form[action="?/searchClient"]',
                  ) as HTMLFormElement;
                  if (form) form.requestSubmit();
                }}
              />
            </div>
          </div>

          <form
            method="POST"
            action="?/searchClient"
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
              searchingClient = true;
              return async ({ result, update }) => {
                searchingClient = false;
                if (result.type === "success") {
                  const payload = (result as any).data;
                  if (payload.client) {
                    selectedClient = payload.client;
                    showRegistrationForm = false;
                    toast.success(
                      "Cliente encontrado: " +
                        (selectedClient.descripcion || selectedClient.cli_des),
                    );
                  } else if (payload.clients && payload.clients.length > 1) {
                    matchingClients = payload.clients;
                    showClientSelectionModal = true;
                  } else {
                    selectedClient = null;
                    showRegistrationForm = true;
                    newClient.rif = rifInput;
                    toast.info(
                      "Cliente no registrado. Complete los datos para crear.",
                    );
                  }
                } else if (result.type === "failure") {
                  toast.error(
                    (result as any).data?.message || "Error en búsqueda",
                  );
                } else if (result.type === "error") {
                  toast.error(
                    "Error crítico en el servidor. Intente de nuevo.",
                  );
                }
              };
            }}
          >
            <input type="hidden" name="rif" value={rifInput} />
            <input type="hidden" name="branch_id" value={selectedBranch} />
          </form>
        </div>

        {#if selectedClient}
          <!-- Card Cliente Encontrado -->
          <div
            class="w-full animate-in fade-in slide-in-from-bottom-4 duration-500"
            in:scale={{ duration: 400, start: 0.98 }}
          >
            <div
              class="glass p-8 rounded-[40px] border border-brand-500/20 bg-brand-500/5 relative overflow-hidden"
            >
              <div class="absolute top-0 right-0 p-8 opacity-10">
                <User size={120} class="text-brand-400" />
              </div>

              <div class="relative z-10 flex flex-col gap-6">
                <div class="flex justify-between items-start">
                  <div
                    class="px-4 py-1.5 rounded-full bg-brand-500 text-white text-[10px] font-black uppercase tracking-widest mb-2 inline-block"
                  >
                    Cliente Registrado
                  </div>
                  <button
                    onclick={() => {
                      selectedClient = null;
                      rifInput = "";
                    }}
                    class="text-text-muted hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>

                <h3 class="text-3xl font-black tracking-tight">
                  {selectedClient.descripcion ||
                    selectedClient.cli_des ||
                    "Sin Nombre"}
                </h3>

                <div
                  class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mt-2"
                >
                  <!-- RIF -->
                  <!-- <div class="flex items-center gap-4 text-text-muted">
                    <div
                      class="h-10 w-10 rounded-xl bg-surface-soft flex items-center justify-center text-brand-400 shrink-0"
                    >
                      <Tag size={18} />
                    </div>
                    <div class="flex flex-col">
                      <span
                        class="text-[10px] uppercase font-black tracking-widest opacity-50"
                        >R.I.F. / Documento</span
                      >
                      <span class="font-bold text-text-base"
                        >{selectedClient.rif || selectedClient.co_cli}</span
                      >
                    </div>
                  </div> -->

                  <!-- Teléfono -->
                  <div class="flex items-center gap-4 text-text-muted">
                    <div
                      class="h-10 w-10 rounded-xl bg-surface-soft flex items-center justify-center text-brand-400 shrink-0"
                    >
                      <Phone size={18} />
                    </div>
                    <div class="flex flex-col">
                      <span
                        class="text-[10px] uppercase font-black tracking-widest opacity-50"
                        >Teléfono</span
                      >
                      <span class="font-bold text-text-base"
                        >{selectedClient.telefonos || "No registrado"}</span
                      >
                    </div>
                  </div>

                  <!-- Email -->
                  <div class="flex items-center gap-4 text-text-muted">
                    <div
                      class="h-10 w-10 rounded-xl bg-surface-soft flex items-center justify-center text-brand-400 shrink-0"
                    >
                      <Mail size={18} />
                    </div>
                    <div class="flex flex-col">
                      <span
                        class="text-[10px] uppercase font-black tracking-widest opacity-50"
                        >Email</span
                      >
                      <span class="font-bold text-text-base lowercase"
                        >{selectedClient.email || "No registrado"}</span
                      >
                    </div>
                  </div>

                  <!-- Zona -->
                  <div class="flex items-center gap-4 text-text-muted">
                    <div
                      class="h-10 w-10 rounded-xl bg-surface-soft flex items-center justify-center text-brand-400 shrink-0"
                    >
                      <Globe size={18} />
                    </div>
                    <div class="flex flex-col">
                      <span
                        class="text-[10px] uppercase font-black tracking-widest opacity-50"
                        >Zona / Región</span
                      >
                      <span class="font-bold text-text-base">
                        {selectedClient.zon_des ||
                          data.context?.zonas?.find(
                            (z: any) =>
                              z.co_zon?.trim() ===
                              selectedClient.co_zon?.trim(),
                          )?.zon_des ||
                          selectedClient.co_zon ||
                          "Sin zona"}
                      </span>
                    </div>
                  </div>

                  <!-- Estatus Fiscal -->
                  <div class="flex items-center gap-4 text-text-muted">
                    <div
                      class="h-10 w-10 rounded-xl bg-surface-soft flex items-center justify-center text-brand-400 shrink-0"
                    >
                      <ShieldCheck size={18} />
                    </div>
                    <div class="flex flex-col">
                      <span
                        class="text-[10px] uppercase font-black tracking-widest opacity-50"
                        >Estatus Fiscal</span
                      >
                      <span class="font-bold text-text-base">
                        {selectedClient.porc_esp > 0
                          ? `Contribuyente Especial (${selectedClient.porc_esp}%)`
                          : selectedClient.contribuyente
                            ? selectedClient.contribu_e
                              ? "Contribuyente Especial"
                              : "Contribuyente Ordinario"
                            : "No Contribuyente"}
                      </span>
                    </div>
                  </div>
                  <!-- Dirección -->
                  <div
                    class="flex items-start gap-4 text-text-muted md:col-span-2 pt-2"
                  >
                    <div
                      class="h-10 w-10 rounded-xl bg-surface-soft flex items-center justify-center text-brand-400 shrink-0"
                    >
                      <MapPin size={18} />
                    </div>
                    <div class="flex flex-col">
                      <span
                        class="text-[10px] uppercase font-black tracking-widest opacity-50"
                        >Dirección Fiscal</span
                      >
                      <span class="font-bold text-text-base leading-relaxed"
                        >{selectedClient.direc1 ||
                          "Sin dirección registrada"}</span
                      >
                    </div>
                  </div>
                </div>

                <!-- Registrado Por -->
                <div class="flex items-center gap-4 text-text-muted">
                  <div
                    class="h-10 w-10 rounded-xl bg-surface-soft flex items-center justify-center text-brand-400 shrink-0"
                  >
                    <UserCircle size={18} />
                  </div>
                  <div class="flex flex-col">
                    <span
                      class="text-[10px] uppercase font-black tracking-widest opacity-50"
                      >Registrado Por</span
                    >
                    <span class="font-bold text-text-base"
                      >{selectedClient.ven_des ||
                        selectedClient.co_ven ||
                        "No asignado"}</span
                    >
                  </div>
                </div>

                <div
                  class="pt-6 border-t border-border-subtle flex justify-end"
                >
                  <button
                    onclick={nextStep}
                    class="group bg-brand-600 hover:bg-brand-500 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-brand-500/20 flex items-center gap-3 transition-all active:scale-95"
                  >
                    Continuar a Artículos
                    <ChevronRight
                      size={20}
                      class="group-hover:translate-x-1 transition-transform"
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        {:else if showRegistrationForm}
          <!-- Formulario Creación Cliente (Paso 1b) -->
          <div
            class="w-full animate-in fade-in slide-in-from-bottom-4 duration-500"
            in:fade
          >
            <div class="glass p-10 rounded-[40px] border border-border-subtle">
              <div class="flex items-center gap-4 mb-8">
                <div
                  class="h-12 w-12 rounded-2xl bg-brand-500/20 text-brand-500 flex items-center justify-center"
                >
                  <Plus size={24} />
                </div>
                <div>
                  <h3 class="text-2xl font-black">Nuevo Cliente</h3>
                  <p class="text-text-muted text-sm">
                    El RIF ingresado no existe. Complete el registro para
                    proceder.
                  </p>
                </div>
              </div>

              <form
                method="POST"
                action="?/saveCustomer"
                use:enhance={() => {
                  searchingClient = true;
                  return async ({ result }) => {
                    searchingClient = false;
                    if (result.type === "success") {
                      selectedClient = (result as any).data.client;
                      showRegistrationForm = false;
                      toast.success(
                        "Cliente creado y seleccionado: " +
                          selectedClient.cli_des,
                      );
                    } else if (result.type === "failure") {
                      toast.error(
                        (result as any).data?.message ||
                          "Error al crear cliente",
                      );
                    }
                  };
                }}
                class="space-y-6"
              >
                <input type="hidden" name="branch_id" value={selectedBranch} />
                <input type="hidden" name="rif" value={rifInput} />
                <input type="hidden" name="co_cli" value={rifInput} />

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <!-- Nombre / R. Social -->
                  <div class="space-y-2 md:col-span-2">
                    <label
                      class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2"
                      >Razón Social</label
                    >
                    <div class="relative">
                      <User
                        class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
                        size={18}
                      />
                      <input
                        type="text"
                        name="cli_des"
                        required
                        placeholder="Nombre completo o Empresa"
                        class="w-full h-14 bg-surface-soft border border-border-bold rounded-2xl pl-12 pr-5 outline-none focus:border-brand-500/50 transition-all font-bold"
                      />
                    </div>
                  </div>

                  <!-- Email -->
                  <div class="space-y-2">
                    <label
                      class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2"
                      >Email</label
                    >
                    <div class="relative">
                      <Mail
                        class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
                        size={18}
                      />
                      <input
                        type="email"
                        name="email"
                        placeholder="ejemplo@correo.com"
                        class="w-full h-14 bg-surface-soft border border-border-bold rounded-2xl pl-12 pr-5 outline-none focus:border-brand-500/50 transition-all font-bold"
                      />
                    </div>
                  </div>

                  <!-- Telefono -->
                  <div class="space-y-2">
                    <label
                      class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2"
                      >Teléfono</label
                    >
                    <div class="relative">
                      <Phone
                        class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-40"
                        size={18}
                      />
                      <input
                        type="text"
                        name="telefonos"
                        placeholder="0412-0000000"
                        class="w-full h-14 bg-surface-soft border border-border-bold rounded-2xl pl-12 pr-5 outline-none focus:border-brand-500/50 transition-all font-bold"
                      />
                    </div>
                  </div>

                  <!-- Zona (Combobox) -->
                  <div class="space-y-2">
                    <label
                      class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2"
                      >Zona</label
                    >
                    <input
                      type="hidden"
                      name="co_zon"
                      value={newClient.co_zon}
                    />
                    <Combobox
                      options={(data.context?.zonas || []).map((z: any) => ({
                        value: z.co_zon,
                        label: z.zon_des || z.co_zon || "Sin nombre",
                      }))}
                      bind:value={newClient.co_zon}
                      placeholder="Seleccionar zona..."
                      allLabel="Sin zona"
                      icon={MapPin}
                    />
                  </div>

                  <!-- Dirección -->
                  <div class="space-y-2">
                    <label
                      class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2"
                      >Dirección Fiscal</label
                    >
                    <div class="relative">
                      <MapPin
                        class="absolute left-4 top-4 text-text-muted opacity-40"
                        size={18}
                      />
                      <textarea
                        name="direc1"
                        required
                        placeholder="Calle, Edificio, Referencias..."
                        class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 py-4 outline-none focus:border-brand-500/50 transition-all font-bold resize-none"
                      ></textarea>
                    </div>
                  </div>

                  <!-- Tributaria / Fiscal -->
                  <div class="md:col-span-2 space-y-4 pt-4">
                    <div
                      class="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl"
                    >
                      <label class="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          name="contribuyente"
                          bind:checked={newClient.contribuyente}
                          class="w-5 h-5 rounded border-white/20 text-brand-500 focus:ring-brand-500 bg-transparent"
                        />
                        <span class="text-sm font-bold">Es Contribuyente</span>
                      </label>

                      {#if newClient.contribuyente}
                        <label
                          class="flex items-center gap-3 cursor-pointer animate-in fade-in slide-in-from-right-2"
                        >
                          <input
                            type="checkbox"
                            name="contribu_e"
                            bind:checked={newClient.contribu_e}
                            class="w-5 h-5 rounded border-border-bold text-brand-500 focus:ring-brand-500 bg-transparent"
                          />
                          <span class="text-sm font-bold">Especial</span>
                        </label>
                      {/if}
                    </div>

                    {#if newClient.contribuyente}
                      <div
                        class="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300"
                      >
                        <!-- Tipo Persona -->
                        <div class="space-y-2">
                          <label
                            class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2"
                            >Tipo de Persona</label
                          >
                          <input
                            type="hidden"
                            name="tipo_per"
                            value={newClient.tipo_per}
                          />
                          <Combobox
                            options={[
                              { value: "1", label: "(PNR) Nat. Residente" },
                              { value: "2", label: "(PNNR) Nat. No Residente" },
                              { value: "3", label: "(PJD) Jur. Domiciliada" },
                              {
                                value: "4",
                                label: "(PJND) Jur. No Domiciliada",
                              },
                              { value: "5", label: "Exenta" },
                            ]}
                            bind:value={newClient.tipo_per}
                            placeholder="Tipo de persona..."
                          />
                        </div>

                        <!-- Retencion (si es especial) -->
                        {#if newClient.contribu_e}
                          <div
                            class="space-y-2 animate-in zoom-in-95 duration-200"
                          >
                            <label
                              class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2"
                              >% Retención</label
                            >
                            <div class="relative">
                              <input
                                type="number"
                                name="porc_esp"
                                bind:value={newClient.porc_esp}
                                min="0"
                                max="100"
                                class="w-full h-14 bg-surface-soft border border-border-bold rounded-2xl px-5 outline-none focus:border-brand-500/50 font-bold"
                              />
                              <span
                                class="absolute right-5 top-1/2 -translate-y-1/2 font-bold text-text-muted"
                                >%</span
                              >
                            </div>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
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
                    disabled={searchingClient}
                    class="flex-[2] h-14 bg-brand-600 hover:bg-brand-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-brand-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    {#if searchingClient}
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
      <!-- SECTION 2: SELECCIÓN DE ARTÃCULOS -->
      <div in:fade class="space-y-6">
        <div
          class="glass p-4 rounded-3xl border border-border-subtle shadow-2xl grid grid-cols-2 lg:grid-cols-4 gap-4 items-center relative z-10"
        >
          <!-- 0. Sucursal (Nuevo Selector en esta pestaña) -->
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

          <!-- 1. Buscador + Scanner -->
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

          <!-- 2. Linea -->
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

          <!-- 3. Categoria -->
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

          <!-- 4. Acciones (Precio + Moneda) -->
          <div
            class="flex items-center gap-2 w-full h-14 col-span-2 lg:col-span-1 justify-end"
          >
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
              class={`h-full px-5 rounded-2xl border flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
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

            <div
              class="flex items-center bg-white/5 border border-white/5 p-1 rounded-xl h-full"
            >
              <button
                onclick={() => (showUSD = true)}
                class={`px-3 h-full rounded-lg text-[10px] font-black transition-all ${showUSD ? "bg-brand-500 text-white" : "text-text-muted hover:text-white"}`}
                >USD</button
              >
              <button
                onclick={() => (showUSD = false)}
                class={`px-3 h-full rounded-lg text-[10px] font-black transition-all ${!showUSD ? "bg-brand-500 text-white" : "text-text-muted hover:text-white"}`}
                >Bs.</button
              >
            </div>
          </div>
        </div>

        <!-- Grid de Artículos -->
        {#if loadingArticles}
          <div
            class="glass p-20 rounded-[40px] border border-border-subtle text-center space-y-4"
          >
            <div
              class="w-12 h-12 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin mx-auto"
            ></div>
            <p class="text-xl font-bold text-text-muted">
              Cargando catálogo...
            </p>
          </div>
        {:else if localArticles.length === 0}
          <div
            class="glass p-20 rounded-[40px] border border-border-subtle text-center space-y-4"
          >
            <Box size={60} class="text-text-muted/20 mx-auto" />
            <p class="text-xl font-bold text-text-muted">
              No se encontraron artículos.
            </p>
          </div>
        {:else}
          <div
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            {#each displayArticles as article}
              {@const pIdx =
                selectedItemPriceIndex[article.co_art || article.codigo] || 0}
              {@const selPrice =
                article.precios?.[pIdx] || article.precios?.[0]}
              {@const curAlmId =
                selectedItemWarehouse[article.co_art || article.codigo]}
              {@const curAlm =
                article.disponibilidad?.find((a) => a.co_alma === curAlmId) ||
                article.disponibilidad?.[0]}
              <div
                class="glass p-4 rounded-3xl border border-border-subtle hover:border-brand-500/30 transition-all flex flex-col group relative overflow-hidden"
              >
                <!-- Stock Badge overlay -->
                <div
                  class="absolute top-4 right-4 z-10 flex flex-col items-end gap-1"
                >
                  <span
                    class="px-2 py-1 rounded-md bg-surface-soft backdrop-blur text-[10px] font-black text-brand-400 border border-border-bold uppercase"
                  >
                    {article.co_art || article.codigo}
                  </span>
                  {#if (article.co_lin || "").trim() === "09" || (article.co_art || article.codigo || "").startsWith("09")}
                    <span
                      class="px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 text-[8px] font-black uppercase tracking-tighter border border-green-500/20"
                    >
                      Servicio / Exento
                    </span>
                  {/if}
                </div>

                <div
                  class="h-40 bg-surface-soft rounded-[20px] flex items-center justify-center text-text-muted mb-4 group-hover:bg-brand-500/5 transition-colors"
                >
                  <Package
                    size={48}
                    class="opacity-30 group-hover:scale-110 group-hover:text-brand-500 transition-all duration-500"
                  />
                </div>

                <h3
                  class="font-black text-sm leading-tight group-hover:text-brand-400 transition-colors"
                >
                  {article.art_des || article.descripcion}
                </h3>
                <p
                  class="text-[10px] text-text-muted mt-1 font-bold uppercase tracking-wider"
                >
                  <span class="text-brand-400">{article.unidad || "UNID"}</span>
                </p>

                <div class="mt-4 flex flex-col gap-3">
                  <!-- Resaltado de Precio Seleccionado -->
                  <div class="flex flex-col gap-1">
                    <div class="flex justify-between items-end px-1">
                      <span
                        class="text-[9px] font-black text-text-muted uppercase tracking-wider"
                        >Precio</span
                      >
                      <span class="text-base font-black text-brand-400">
                        {(showUSD
                          ? selPrice?.precio
                          : selPrice?.precio_ves
                        )?.toLocaleString("de-DE", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        {showUSD ? " $" : " Bs."}
                      </span>
                    </div>

                    <div class="relative group/price">
                      <select
                        bind:value={
                          selectedItemPriceIndex[
                            article.co_art || article.codigo
                          ]
                        }
                        class="w-full h-11 bg-surface-soft hover:bg-surface-strong rounded-xl px-4 text-xs font-black outline-none border border-border-subtle appearance-none transition-all cursor-pointer text-text-muted hover:text-text-base"
                      >
                        {#each article.precios || [] as price, idx}
                          <option
                            value={idx}
                            class="bg-surface-dark text-white text-sm"
                          >
                            {price.des_precio || `Tipo ${idx + 1}`}
                          </option>
                        {/each}
                      </select>
                      <ChevronDown
                        size={14}
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted opacity-50 pointer-events-none"
                      />
                    </div>
                  </div>
                </div>

                <div class="mt-3 pt-3 border-t border-border-subtle space-y-3">
                  <!-- Selector Almacen Re-estilizado -->
                  <div class="flex flex-col gap-1">
                    <div class="flex justify-between items-end px-1">
                      <span
                        class="text-[9px] font-black text-text-muted uppercase tracking-wider"
                        >Disponibilidad</span
                      >
                      <span
                        class="text-sm font-black {article.co_lin?.trim() ===
                          '09' || (curAlm?.stock || 0) > 0
                          ? 'text-green-400'
                          : 'text-red-400'}"
                      >
                        {article.co_lin?.trim() === "09"
                          ? "Stock Ilimitado"
                          : curAlm?.stock || 0}
                      </span>
                    </div>

                    <div class="relative group">
                      <select
                        bind:value={
                          selectedItemWarehouse[
                            article.co_art || article.codigo
                          ]
                        }
                        class="w-full h-11 bg-surface-soft hover:bg-surface-strong rounded-xl px-4 text-xs font-black outline-none border border-border-subtle appearance-none transition-all cursor-pointer text-text-muted hover:text-text-base"
                      >
                        {#each article.disponibilidad || [] as alm}
                          <option
                            value={alm.co_alma}
                            class="bg-surface-dark text-white text-sm"
                          >
                            {alm.des_alma}
                          </option>
                        {/each}
                      </select>
                      <ChevronDown
                        size={14}
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted opacity-50 pointer-events-none"
                      />
                    </div>
                  </div>

                  <!-- Fila de Acción (FIXED ROW) -->
                  <div class="flex items-center gap-2 mt-4">
                    <!-- Selector Cantidad -->
                    <div
                      class="flex-1 flex items-center bg-surface-soft rounded-xl border border-border-bold h-11 focus-within:border-brand-500/30 transition-all overflow-hidden"
                    >
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          const step = getStep(article);
                          quantities[article.co_art] = Math.max(step, (quantities[article.co_art] || step) - step);
                        }}
                        class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 transition-colors bg-surface-soft"
                        title="Restar"><Minus size={12} /></button
                      >
                      <input
                        type="number"
                        min={getStep(article)}
                        step={getStep(article)}
                        bind:value={quantities[article.co_art]}
                        onclick={(e) => e.stopPropagation()}
                        oninput={(e) => {
                          const val = parseFloat((e.target as HTMLInputElement).value);
                          const step = getStep(article);
                          const stock = curAlm?.stock || 0;

                          if (!isNaN(val) && val > stock) {
                            quantities[article.co_art] = Math.floor(stock / step) * step || step;
                            toast.warning(`Máximo disponible: ${stock}`);
                          }
                        }}
                        onblur={(e) => {
                          let val = parseFloat((e.target as HTMLInputElement).value);
                          const step = getStep(article);
                          if (isNaN(val) || val < step) val = step;
                          quantities[article.co_art] = Math.round(val / step) * step;
                        }}
                        class="w-full flex-1 text-center text-base font-black bg-transparent outline-none no-arrows text-brand-400 px-1"
                      />
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          const isService = article.co_lin?.trim() === "09";
                          const stock = curAlm?.stock || 0;
                          const step = getStep(article);
                          const currentQty = quantities[article.co_art] || step;
                          
                          if (isService || currentQty + step <= stock) {
                            quantities[article.co_art] = currentQty + step;
                          } else {
                            toast.error("Alcanzó el límite de stock disponible");
                            quantities[article.co_art] = Math.floor(stock / step) * step || step;
                          }
                        }}
                        class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 transition-colors bg-surface-soft"
                        title="Sumar"><Plus size={12} /></button
                      >
                    </div>

                    {#if masterBranchId && selectedBranch !== masterBranchId}
                      <div class="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 flex-1">
                        <Info size={14} class="text-amber-400 shrink-0" />
                        <p class="text-[8px] font-bold text-amber-200 leading-tight">
                          Consulta de stock en { (data.branches?.find(b => b.id === selectedBranch))?.name }.
                          <br/>Regrese a { (data.branches?.find(b => b.id === masterBranchId))?.name } para facturar.
                        </p>
                      </div>
                    {:else}
                      <!-- Botón Agregar -->
                      <button
                        onclick={() => addToCart(article)}
                        class="h-11 w-14 shrink-0 bg-brand-600 hover:bg-brand-500 text-white rounded-xl shadow-lg shadow-brand-500/20 active:scale-95 transition-all flex items-center justify-center"
                        title="Agregar al Carrito"
                      >
                        <ShoppingCart size={20} />
                      </button>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Paginación Footer -->
        {#if localPagination && localPagination.totalPages > 1}
          <div class="flex justify-center gap-4 mt-8 pb-10">
            <button
              disabled={localPagination.page <= 1}
              onclick={() => {
                const u = new URL($page.url);
                u.searchParams.set(
                  "page",
                  (localPagination.page - 1).toString(),
                );
                goto(u.toString());
              }}
              class="h-12 px-6 rounded-2xl bg-surface-soft border border-border-subtle font-bold disabled:opacity-30 transition-all hover:bg-surface-strong"
              >Anterior</button
            >
            <div
              class="h-12 px-6 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center font-black text-brand-400"
            >
              {localPagination.page} / {localPagination.totalPages}
            </div>
            <button
              disabled={localPagination.page >= localPagination.totalPages}
              onclick={() => {
                const u = new URL($page.url);
                u.searchParams.set(
                  "page",
                  (localPagination.page + 1).toString(),
                );
                goto(u.toString());
              }}
              class="h-12 px-6 rounded-2xl bg-surface-soft border border-border-subtle font-bold disabled:opacity-30 transition-all hover:bg-surface-strong"
              >Siguiente</button
            >
          </div>
        {/if}

        <!-- Floating Cart (Mobile Friendly) -->
        {#if cart.length > 0}
          <div
            class="fixed bottom-28 md:bottom-8 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md"
            transition:slide
          >
            <div
              class="glass p-4 rounded-[32px] border border-brand-500/30 bg-brand-600/20 backdrop-blur-2xl shadow-2xl flex items-center justify-between gap-4"
            >
              <div class="flex items-center gap-4">
                <div
                  class="h-12 w-12 rounded-2xl bg-brand-500 text-white flex items-center justify-center relative shadow-lg"
                >
                  <ShoppingCart size={24} />
                  <span
                    class="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] w-6 h-6 rounded-full flex items-center justify-center font-black border-2 border-white"
                    >{cart.length}</span
                  >
                </div>
                <div>
                  <div
                    class="text-[10px] font-black uppercase tracking-widest text-brand-400"
                  >
                    Pedido en curso
                  </div>
                  <div class="text-sm font-black text-white">
                    $ {totals().total.toLocaleString("de-DE", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              </div>
              <button
                onclick={nextStep}
                class="bg-white text-brand-600 h-12 px-6 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all"
              >
                Confirmar
              </button>
            </div>
          </div>
        {/if}
      </div>
    {:else if activeTab === 2}
      <!-- SECTION 3: CONFIRMACIÓN Y GUARDADO (VERTICAL FULL WIDTH) -->
      <div in:fade class="max-w-4xl mx-auto space-y-8 pb-32 px-4">
        <div class="text-center">
          <h2
            class="text-3xl font-black tracking-tight text-text-base uppercase italic"
          >
            Cierre de Pedido
          </h2>
          <p class="text-text-muted mt-2 font-medium">
            Revise los detalles finales antes de procesar el documento.
          </p>
        </div>

        <div class="flex flex-col gap-8">
          <!-- Bloque 1: Resumen Cliente (Detailed Card) -->
          <div
            class="glass p-8 rounded-[40px] border border-border-bold space-y-8 relative overflow-hidden group bg-surface-soft/20"
          >
            <div
              class="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 rounded-full blur-[100px] -mr-32 -mt-32"
            ></div>

            <div
              class="flex items-center justify-between border-b border-border-subtle pb-6 relative z-10"
            >
              <div class="flex items-center gap-3">
                <User size={20} class="text-brand-400" />
                <h4
                  class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted"
                >
                  Información del Cliente
                </h4>
              </div>
              <button
                onclick={() => (activeTab = 0)}
                class="px-4 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong text-[10px] font-black uppercase text-brand-400 tracking-widest transition-all border border-border-subtle"
                >Cambiar Cliente</button
              >
            </div>

            <div class="space-y-6 relative z-10 w-full">
              <!-- Info Principal -->
              <div class="space-y-6">
                <div>
                  <div
                    class="text-[10px] font-black uppercase tracking-widest text-brand-400/60 mb-1"
                  >
                    Razón Social
                  </div>
                  <div
                    class="text-3xl font-black text-text-base tracking-tight"
                  >
                    {selectedClient.descripcion || selectedClient.cli_des}
                  </div>
                </div>

                <div
                  class="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-border-subtle pb-4"
                >
                  <div class="space-y-1">
                    <span
                      class="text-[10px] font-black uppercase tracking-widest text-text-muted block"
                      >R.I.F. / Identificación</span
                    >
                    <span class="font-mono text-sm font-bold text-brand-400"
                      >{selectedClient.rif || selectedClient.co_cli}</span
                    >
                  </div>
                  <div class="space-y-1">
                    <span
                      class="text-[10px] font-black uppercase tracking-widest text-text-muted block"
                      >Teléfono de Contacto</span
                    >
                    <span class="text-sm font-bold text-text-base"
                      >{selectedClient.telefonos || "No reg."}</span
                    >
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div class="space-y-1">
                    <span
                      class="text-[10px] font-black uppercase tracking-widest text-text-muted block"
                      >Correo Electrónico</span
                    >
                    <span class="text-sm font-bold text-text-base lowercase"
                      >{selectedClient.email || "No reg."}</span
                    >
                  </div>
                  <div class="space-y-1">
                    <span
                      class="text-[10px] font-black uppercase tracking-widest text-text-muted block"
                      >Zona / Región</span
                    >
                    <span
                      class="text-sm font-bold text-text-base text-brand-400"
                    >
                      {selectedClient.zon_des ||
                        data.context?.zonas?.find(
                          (z: any) =>
                            z.co_zon?.trim() === selectedClient.co_zon?.trim(),
                        )?.zon_des ||
                        selectedClient.co_zon ||
                        "Sin zona"}
                    </span>
                  </div>
                  <div class="space-y-1">
                    <span
                      class="text-[10px] font-black uppercase tracking-widest text-text-muted block"
                      >Estatus Fiscal</span
                    >
                    <span class="text-sm font-bold text-text-base">
                      {selectedClient.porc_esp > 0
                        ? `Contribuyente Especial (${selectedClient.porc_esp}%)`
                        : selectedClient.contribuyente
                          ? selectedClient.contribu_e
                            ? "Contribuyente Especial"
                            : "Contribuyente Ordinario"
                          : "No Contribuyente"}
                    </span>
                  </div>
                  <div class="space-y-1">
                    <span
                      class="text-[10px] font-black uppercase tracking-widest text-text-muted block"
                      >Registrado por</span
                    >
                    <span class="text-sm font-bold text-text-base"
                      >{selectedClient.ven_des ||
                        selectedClient.co_ven ||
                        "No asignado"}</span
                    >
                  </div>
                </div>

                <div class="pt-4 border-t border-border-subtle/30">
                  <span
                    class="text-[10px] font-black uppercase tracking-widest text-text-muted block mb-1"
                    >Dirección Fiscal</span
                  >
                  <p class="text-sm font-medium text-text-base leading-relaxed">
                    {selectedClient.direc1 || "Sin dirección registrada"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Bloque 2: Detalle de Renglones (Full Width) -->
          <div
            class="glass rounded-[32px] border border-border-subtle overflow-hidden"
          >
            <div
              class="p-8 border-b border-border-subtle flex items-center justify-between bg-surface-soft/50"
            >
              <div class="flex items-center gap-3">
                <Package size={20} class="text-text-muted" />
                <h4
                  class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted"
                >
                  Renglones ({cart.length})
                </h4>
              </div>
              <button
                onclick={() => (activeTab = 1)}
                class="px-4 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong text-[10px] font-black uppercase text-brand-400 tracking-widest transition-all border border-border-subtle"
                >Agregar Articulo</button
              >
            </div>
            <div class="divide-y border-border-subtle">
              {#each cart as item, i}
                <div
                  class="p-8 flex flex-col lg:flex-row items-start lg:items-center gap-8 transition-all hover:bg-surface-soft group relative border-b border-border-subtle last:border-0"
                >
                  <!-- Product Identity & Qty -->
                  <div
                    class="flex items-center gap-6 shrink-0 w-full lg:w-auto"
                  >
                    <div
                      class="h-16 w-16 rounded-2xl bg-surface-soft flex items-center justify-center text-brand-400 relative group-hover:scale-110 transition-transform duration-500"
                    >
                      <div
                        class="absolute inset-0 bg-brand-500/10 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      ></div>
                      <Package size={28} />
                    </div>
                    <div
                      class="flex items-center bg-surface-base/40 rounded-xl border border-border-subtle h-12 overflow-hidden shadow-inner"
                    >
                      <button
                        onclick={() => updateCartQty(i, item.qty - getStep(item))}
                        class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 hover:bg-surface-soft transition-all"
                        ><Minus size={14} /></button
                      >
                      <input
                        type="number"
                        min={getStep(item)}
                        step={getStep(item)}
                        value={item.qty}
                        oninput={(e) => {
                          const v = parseFloat((e.currentTarget as HTMLInputElement).value);
                          if (!isNaN(v)) updateCartQty(i, v);
                        }}
                        onblur={(e) => {
                          const v = parseFloat((e.currentTarget as HTMLInputElement).value);
                          updateCartQty(i, isNaN(v) ? getStep(item) : v);
                        }}
                        class="w-12 text-center text-base font-black bg-transparent outline-none no-arrows text-brand-400"
                      />
                      <button
                        onclick={() => updateCartQty(i, item.qty + getStep(item))}
                        class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 hover:bg-surface-soft transition-all"
                        ><Plus size={14} /></button
                      >
                    </div>
                  </div>

                  <!-- Item Details & Configuration -->
                  <div class="flex-1 min-w-0 space-y-4 w-full">
                    <div class="space-y-1">
                      <div
                        class="text-lg font-black text-text-base leading-tight"
                      >
                        {item.art_des || item.descripcion}
                      </div>
                      <div
                        class="flex items-center gap-4 text-[11px] font-bold uppercase tracking-[0.15em]"
                      >
                        <span class="text-brand-400 font-mono"
                          >{item.co_art}</span
                        >

                        {#if (item.co_lin || "").trim() === "09" || (item.co_art || "").startsWith("09")}
                          <span
                            class="px-2 py-0.5 rounded-md bg-green-500/10 text-green-500 text-[9px] font-black border border-green-500/20"
                            >EXENTO</span
                          >
                        {/if}

                        <span class="h-1 w-1 rounded-full bg-border-subtle"
                        ></span>
                        <span class="text-text-muted"
                          >{item.uni_venta ||
                            item.unidad ||
                            item.co_uni ||
                            "UNID"}</span
                        >
                      </div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div class="relative group/sel">
                        <select
                          value={item.co_alma_selected}
                          onchange={(e) =>
                            updateCartWarehouse(i, e.currentTarget.value)}
                          class="w-full h-11 bg-surface-soft rounded-xl px-4 text-sm font-black outline-none border border-border-subtle appearance-none cursor-pointer focus:border-brand-500/30 transition-all hover:bg-surface-strong"
                        >
                          {#each item.disponibilidad || [] as alm}
                            <option
                              value={alm.co_alma}
                              class="bg-surface-base text-text-base text-sm"
                              >{alm.des_alma} ({alm.stock})</option
                            >
                          {/each}
                        </select>
                        <ChevronDown
                          size={14}
                          class="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted group-hover/sel:text-brand-400 transition-colors pointer-events-none"
                        />
                      </div>
                      <div class="relative group/sel">
                        <select
                          value={item.price_index_selected}
                          onchange={(e) =>
                            updateCartPrice(i, parseInt(e.currentTarget.value))}
                          class="w-full h-11 bg-surface-soft rounded-xl px-4 text-sm font-black outline-none border border-border-subtle appearance-none cursor-pointer focus:border-brand-500/30 transition-all hover:bg-surface-strong"
                        >
                          {#each item.precios || [] as price, idx}
                            <option
                              value={idx}
                              class="bg-surface-base text-text-base text-sm"
                              >{price.des_precio || `Tipo ${idx + 1}`} - $ {price.precio.toLocaleString(
                                "de-DE",
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                },
                              )}</option
                            >
                          {/each}
                        </select>
                        <ChevronDown
                          size={14}
                          class="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted group-hover/sel:text-brand-400 transition-colors pointer-events-none"
                        />
                      </div>
                    </div>
                  </div>

                  <!-- Financial Detail per Row -->
                  <div
                    class="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center w-full lg:w-48 gap-4 border-t lg:border-t-0 border-border-subtle pt-6 lg:pt-0"
                  >
                    <div class="text-right space-y-1">
                      <div
                        class="text-xl font-black text-brand-400 leading-none"
                      >
                        {totals().symbol}
                        {(
                          (showUSD
                            ? item.price_selected?.precio ||
                              item.precios?.[0]?.precio ||
                              0
                            : item.price_selected?.precio_ves ||
                              item.precios?.[0]?.precio_ves ||
                              0) * item.qty
                        ).toLocaleString("de-DE", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <div
                        class="text-[10px] text-text-muted font-bold uppercase tracking-widest"
                      >
                        Total {totals().symbol}
                      </div>
                    </div>
                    <button
                      onclick={() => removeFromCart(i)}
                      class="h-10 w-10 rounded-xl flex items-center justify-center text-text-muted hover:bg-red-500/10 hover:text-red-500 transition-all border border-border-subtle"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <!-- Bloque 3: Resumen Final Consolidado (Full Width) -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <!-- Col Left: Notas & Comentarios -->
            <div
              class="glass p-8 rounded-[32px] border border-border-subtle space-y-6 flex flex-col h-full bg-surface-soft/20"
            >
              <div
                class="flex items-center gap-3 text-text-muted border-b border-border-subtle pb-4"
              >
                <FileText size={18} class="text-brand-400" />
                <h4 class="text-[10px] font-black uppercase tracking-[0.2em]">
                  Descripción Global / Notas
                </h4>
              </div>
              <textarea
                bind:value={quoteDescription}
                placeholder="Escriba aquí notas para el cliente o comentarios internos del pedido..."
                class="flex-1 w-full min-h-[220px] bg-surface-base/50 rounded-2xl p-6 text-sm text-text-base outline-none border border-border-subtle focus:border-brand-500/40 focus:bg-surface-base transition-all resize-none font-medium leading-relaxed placeholder:text-text-muted/30"
              ></textarea>
            </div>

            <!-- Col Right: Resumen & Acciones -->
            <div
              class="glass p-8 rounded-[32px] border border-border-subtle space-y-8 bg-brand-500/[0.03] backdrop-blur-3xl relative overflow-hidden flex flex-col"
            >
              <div
                class="absolute -top-12 -right-12 w-48 h-48 bg-brand-500/10 rounded-full blur-[80px]"
              ></div>

              <div
                class="flex items-center justify-between border-b border-border-subtle pb-6 relative z-10"
              >
                <h4
                  class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted"
                >
                  Total Documento
                </h4>
                <div
                  class="flex bg-surface-base p-1 rounded-xl border border-border-bold shadow-lg"
                >
                  <button
                    onclick={() => (showUSD = true)}
                    class={`px-5 py-2 rounded-lg text-xs font-black transition-all duration-300 ${showUSD ? "bg-brand-600 text-white shadow-lg scale-105" : "text-text-muted hover:text-text-base"}`}
                    >USD</button
                  >
                  <button
                    onclick={() => (showUSD = false)}
                    class={`px-5 py-2 rounded-lg text-xs font-black transition-all duration-300 ${!showUSD ? "bg-brand-600 text-white shadow-lg scale-105" : "text-text-muted hover:text-text-base"}`}
                    >BS</button
                  >
                </div>
              </div>

              <div class="space-y-6 relative z-10">
                <div
                  class="flex justify-between items-center text-base font-bold text-text-muted"
                >
                  <span>Sub-Total</span>
                  <span class="font-mono text-text-base"
                    >{totals().symbol}
                    {totals().subtotal.toLocaleString("de-DE", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}</span
                  >
                </div>

                <div
                  class="flex justify-between items-center text-base font-bold"
                >
                  <div class="flex items-center gap-3">
                    <span class="text-text-muted">I.V.A</span>
                    <select
                      bind:value={quoteTaxRate}
                      class="bg-surface-strong border border-border-bold text-[10px] font-black text-brand-400 cursor-pointer outline-none hover:bg-surface-soft rounded-lg px-3 py-1.5 transition-all shadow-sm"
                    >
                      <option
                        value={16}
                        class="bg-surface-base font-sans text-sm"
                        >Cargar 16%</option
                      >
                      <option
                        value={0}
                        class="bg-surface-base font-sans text-sm"
                        >Exento 0%</option
                      >
                    </select>
                  </div>
                  <span class="font-mono text-brand-400"
                    >{totals().symbol}
                    {totals().iva.toLocaleString("de-DE", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}</span
                  >
                </div>

                <div
                  class="flex justify-between items-center text-base font-bold text-text-muted"
                >
                  <span>Total Factura</span>
                  <span class="font-mono text-text-base"
                    >{totals().symbol}
                    {totals().totalFactura.toLocaleString("de-DE", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}</span
                  >
                </div>

                {#if totals().retencion > 0}
                  <div
                    class="flex justify-between items-center text-base font-bold text-amber-500/90"
                    transition:slide
                  >
                    <span>Retención ({totals().porc_esp}%)</span>
                    <span class="font-mono"
                      >- {totals().symbol}
                      {totals().retencion.toLocaleString("de-DE", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}</span
                    >
                  </div>
                {/if}

                <div
                  class="pt-8 border-t border-border-bold flex flex-col gap-2"
                >
                  <div class="flex justify-between items-end">
                    <div>
                      <span
                        class="text-[10px] font-black uppercase tracking-[0.2em] text-brand-400/60 block mb-2"
                        >Total a Pagar</span
                      >
                      <div
                        class="text-5xl font-black text-text-base drop-shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)] tracking-tight leading-none"
                      >
                        {totals().symbol}
                        {totals().total.toLocaleString("de-DE", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
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
                    isSearching = true;
                    return async ({ result }) => {
                      isSearching = false;
                      if (result.type === "success") {
                        toast.success(
                          (result as any).data?.message ||
                            "¡Pedido generado con éxito!",
                        );
                        clearQuote();
                        goto("/dashboard/sales/orders/history");
                      } else if (result.type === "failure") {
                        const data = (result as any).data;
                        const mainMsg =
                          data?.message || "No se pudo guardar el pedido";
                        const technicalDetails = data?.details
                          ? `\nDetalles: ${data.details}`
                          : "";
                        toast.error(mainMsg + technicalDetails, {
                          duration: 6000,
                        });
                        console.error("Save Quote Error:", data);
                      }
                    };
                  }}
                >
                  <input
                    type="hidden"
                    name="branch_id"
                    value={selectedBranch}
                  />
                  <input
                    type="hidden"
                    name="order_data"
                    value={JSON.stringify({
                      doc_num: data.preloadedOrder?.doc_num,
                      co_cli:
                        selectedClient.co_cli ||
                        selectedClient.rif
                          .replace(/[^a-zA-Z0-9]/g, "")
                          .substring(0, 10),
                      descrip: quoteDescription || "PEDIDO WEB",
                      comentario:
                        quoteDescription || "Pedido registrado vía portal web.",
                      showUSD: showUSD,
                      renglones: cart.map((item) => {
                        const isStrictlyExempt =
                          (item.co_lin || "").trim() === "09" ||
                          (item.co_art || "").startsWith("09");
                        const rate = isStrictlyExempt ? 0 : quoteTaxRate;
                        const taxType = rate === 16 ? "1" : "5";
                        return {
                          co_art: item.co_art || item.codigo,
                          art_des: item.art_des || item.descripcion,
                          cantidad: item.qty,
                          precio: showUSD
                            ? item.price_selected?.precio ||
                              item.precios?.[0]?.precio ||
                              0
                            : item.price_selected?.precio_ves ||
                              item.precios?.[0]?.precio_ves ||
                              0,
                          co_alma: item.co_alma_selected,
                          co_uni: item.co_uni || item.unidad,
                          co_precio: item.price_selected?.id_precio || "01",
                          tipo_imp: taxType,
                          porc_imp: rate,
                        };
                      }),
                    })}
                  />
                  <button
                    type="submit"
                    disabled={isSearching || cart.length === 0}
                    class="w-full h-20 bg-brand-600 hover:bg-brand-500 text-white rounded-[24px] font-black text-xl uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(var(--brand-rgb),0.3)] active:scale-[0.97] transition-all flex items-center justify-center gap-4 disabled:opacity-50 disabled:grayscale group"
                  >
                    {#if isSearching}
                      <Loader2
                        size={32}
                        class="animate-spin text-brand-400/40"
                      />
                      <span class="animate-pulse">Procesando...</span>
                    {:else}
                      <div
                        class="bg-surface-strong/50 p-2.5 rounded-xl group-hover:scale-110 transition-transform"
                      >
                        <Check size={28} />
                      </div>
                      Guardar
                    {/if}
                  </button>
                </form>

                <div class="grid grid-cols-2 gap-4">
                  <button
                    onclick={() => clearQuote(false)}
                    class="h-14 rounded-2xl text-text-muted hover:bg-red-500/10 hover:text-red-400 transition-all text-xs font-black uppercase tracking-widest border border-border-subtle"
                  >
                    Descartar todo
                  </button>
                  <button
                    onclick={() => (activeTab = 1)}
                    class="h-14 rounded-2xl text-brand-400 hover:bg-brand-500/10 transition-all text-xs font-black uppercase tracking-widest border border-brand-500/15"
                  >
                    Volver a edición
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

{#if showImportModal}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    in:fade
  >
    <div
      class="w-full max-w-2xl bg-surface-base border border-border-subtle rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh] relative"
      in:scale={{ duration: 200, start: 0.95 }}
    >
      <div
        class="p-8 border-b border-border-subtle flex justify-between items-center bg-surface-soft/50"
      >
        <div>
          <h2 class="text-2xl font-black tracking-tight">
            Importar Cotización
          </h2>
          <p class="text-text-muted text-sm">
            Selecciona una cotización para convertirla en pedido
          </p>
        </div>
        <button
          onclick={() => (showImportModal = false)}
          class="p-2 hover:bg-surface-strong rounded-full transition-colors"
        >
          <Plus size={24} class="rotate-45" />
        </button>
      </div>

      <div class="p-6 border-b border-border-subtle bg-surface-base">
        <form
          method="POST"
          action="?/searchQuotes"
          use:enhance={() => {
            isSearchingQuotes = true;
            importQuotesList = [];
            return async ({ result }) => {
              isSearchingQuotes = false;
              if (result.type === "success") {
                const data = result.data as any;
                importQuotesList = data?.quotes || [];
                if (importQuotesList.length === 0) {
                  toast.info("No se encontraron cotizaciones.");
                }
              } else if (result.type === "failure") {
                toast.error(
                  (result.data as any)?.message || "Error en la búsqueda",
                );
              }
            };
          }}
          class="flex flex-col md:flex-row gap-4"
        >
          <!-- Selector de Sucursal -->
          <div class="w-full md:w-60">
            <div class="relative group">
              <Store
                size={16}
                class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-brand-500 transition-colors pointer-events-none"
              />
              <select
                name="branch_id"
                bind:value={importBranch}
                class="w-full h-14 pl-10 pr-4 bg-surface-soft border border-border-subtle rounded-2xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium text-sm appearance-none cursor-pointer"
              >
                {#each data.branches || [] as b}
                  <option value={b.id}>{b.name}</option>
                {/each}
              </select>
              <ChevronDown
                size={16}
                class="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
            </div>
          </div>

          <div class="flex-1 relative group">
            <Search
              size={20}
              class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-brand-500 transition-colors"
            />
            <input
              type="text"
              name="search"
              bind:value={importSearch}
              placeholder="Buscar por Nro de Cotización o Cliente..."
              class="w-full h-14 pl-12 pr-32 bg-surface-soft border border-border-subtle rounded-2xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all font-medium"
            />
            <button
              type="submit"
              disabled={isSearchingQuotes}
              class="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-4 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              {isSearchingQuotes ? "..." : "BUSCAR"}
            </button>
          </div>
        </form>
      </div>

      <div
        class="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar min-h-[300px]"
      >
        {#if isSearchingQuotes}
          <div class="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 size={40} class="animate-spin text-brand-500" />
            <p class="text-text-muted font-bold animate-pulse">
              Buscando cotizaciones...
            </p>
          </div>
        {:else if importQuotesList.length === 0}
          <div
            class="flex flex-col items-center justify-center py-20 gap-3 text-text-muted opacity-50"
          >
            <FileText size={48} />
            <p class="font-bold">No se encontraron cotizaciones</p>
          </div>
        {:else}
          {#each importQuotesList as q}
            <button
              onclick={() => loadQuoteIntoPedido(q.doc_num)}
              disabled={isLoadingQuoteDetail}
              class="w-full p-4 rounded-2xl bg-surface-soft border border-border-subtle hover:border-brand-500/50 hover:bg-surface-strong transition-all flex items-center justify-between group text-left"
            >
              <div class="flex items-center gap-4">
                <div
                  class="bg-surface-strong p-3 rounded-xl group-hover:bg-brand-500/10 group-hover:text-brand-400 transition-colors"
                >
                  <FileText size={20} />
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-black text-text-base">{q.doc_num}</span>
                    <span
                      class="text-[10px] px-2 py-0.5 rounded-full bg-surface-strong text-text-muted font-bold uppercase"
                      >{q.sede_nombre || "N/A"}</span
                    >
                  </div>
                  <p
                    class="text-sm text-text-muted font-medium truncate max-w-[300px]"
                  >
                    {q.cli_des || q.co_cli}
                  </p>
                </div>
              </div>
              <div class="text-right">
                <p class="font-black text-text-base">
                  {q.total_neto.toLocaleString()}
                  {q.co_mone || "Bs."}
                </p>
                <p class="text-[10px] text-text-muted font-bold uppercase">
                  {new Date(q.fec_emis).toLocaleDateString()}
                </p>
              </div>
            </button>
          {/each}
        {/if}
      </div>

      {#if isLoadingQuoteDetail}
        <div
          class="absolute inset-0 bg-surface-base/80 backdrop-blur-[2px] flex items-center justify-center z-[110]"
          in:fade
        >
          <div class="flex flex-col items-center gap-4">
            <div class="relative">
              <Loader2 size={48} class="animate-spin text-brand-500" />
              <ShoppingCart
                size={20}
                class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-brand-400"
              />
            </div>
            <p class="font-black text-lg tracking-tight">IMPORTANDO DATOS...</p>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

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

  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>

{#if showClientSelectionModal}
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
            <Users size={24} class="text-brand-500" />
            Múltiples Clientes Encontrados
          </h2>
          <p class="text-text-muted mt-1 text-sm">
            Seleccione el cliente correcto de la lista ({matchingClients.length} resultados)
          </p>
        </div>
        <button
          onclick={() => (showClientSelectionModal = false)}
          class="p-2 hover:bg-white/10 rounded-xl transition-colors text-text-muted hover:text-white"
        >
          <X size={20} />
        </button>
      </div>

      <div class="overflow-y-auto p-4 custom-scrollbar space-y-2 flex-1">
        {#each matchingClients as client}
          <button
            class="w-full text-left p-4 rounded-2xl border border-border-subtle bg-surface-soft hover:bg-surface-strong hover:border-brand-500/50 transition-all flex flex-col gap-1 group relative overflow-hidden"
            onclick={() => {
              selectedClient = client;
              rifInput = client.rif || client.co_cli;
              showRegistrationForm = false;
              showClientSelectionModal = false;
              toast.success("Cliente seleccionado: " + (client.descripcion || client.cli_des));
            }}
          >
            <div class="absolute inset-0 bg-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div class="relative z-10 flex items-start justify-between w-full">
              <div>
                <h3 class="font-bold text-lg">{client.descripcion || client.cli_des}</h3>
                <div class="flex items-center gap-3 mt-2 text-sm text-text-muted">
                  <span class="flex items-center gap-1">
                    <User size={14} class="text-brand-400" />
                    {client.rif || client.co_cli}
                  </span>
                  {#if client.email}
                    <span class="flex items-center gap-1">
                      <Mail size={14} class="text-brand-400" />
                      {client.email}
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
