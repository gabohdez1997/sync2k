<script lang="ts">
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
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // --- ESTADO GLOBAL ---
  let activeTab = $state(0); // 0: Cliente, 1: Artículos, 2: Confirmación
  let searchTerm = $state($page.url.searchParams.get("search") || "");
  let isSearching = $state(false);

  // --- CONTEXTO (Sedes/Almacenes) ---
  let selectedBranch = $state(data.selectedBranchId || "");
  let selectedWarehouse = $state("");

  let selectedBranchConfig = $derived(
    Array.isArray(data.branches) ? data.branches.find((b: any) => b.id === selectedBranch) : null
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
  let selectedLinea = $state($page.url.searchParams.get("linea") || "");
  let selectedCategoria = $state($page.url.searchParams.get("categoria") || "");

  const filteredCategorias = $derived(
    !selectedLinea
      ? data.context?.categorias || []
      : (data.context?.categorias || []).filter((c) =>
          c.co_cat?.startsWith(parseInt(selectedLinea, 10).toString()),
        ),
  );

  let sortOption = $state<"relevance" | "asc" | "desc">(
    ($page.url.searchParams.get("sort") as any) || "relevance",
  );
  let showUSD = $state(true);
  let quoteTaxRate = $state(16); // 16 o 0 (global para items no exentos)
  let quoteDescription = $state("");

  // --- PASO 1: CLIENTE ---
  let rifInput = $state("");
  let searchingClient = $state(false);
  let selectedClient = $state<any>(null);
  let showRegistrationForm = $state(false);

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

  // --- PASO 2: ARTÍCULOS Y CARRITO ---
  let quantities = $state<Record<string, number>>({});
  let selectedItemWarehouse = $state<Record<string, string>>({});
  let selectedItemPriceIndex = $state<Record<string, number>>({});
  let cart = $state<any[]>([]);

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
        if (quantities[co] === undefined || quantities[co] < 1)
          quantities[co] = 1;
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
    if (activeTab === 1 && currentPath.includes("/sales/quotes")) {
      fetchArticles(branch, params);
    }
  });

  $effect(() => {
    const draftStr = localStorage.getItem("profit_quote_draft");
    if (draftStr) {
      try {
        const parsed = JSON.parse(draftStr);
        if (parsed.cart) cart = parsed.cart;
        if (parsed.selectedClient !== undefined)
          selectedClient = parsed.selectedClient;
        if (parsed.activeTab !== undefined) activeTab = parsed.activeTab;
        if (parsed.rifInput) rifInput = parsed.rifInput;
      } catch (e) {
        console.error("Error loading draft", e);
      }
    }
  });

  $effect(() => {
    const draft = {
      cart,
      selectedClient,
      activeTab,
      rifInput,
    };
    localStorage.setItem("profit_quote_draft", JSON.stringify(draft));
  });

  // --- ACCIONES ---
  function nextStep() {
    if (activeTab === 0 && !selectedClient) {
      toast.error("Seleccione o registre un cliente primero.");
      return;
    }
    if (activeTab < 2) activeTab++;
  }

  function prevStep() {
    if (activeTab > 0) activeTab--;
  }

  function clearQuote() {
    cart = [];
    selectedClient = null;
    activeTab = 0;
    rifInput = "";
    showRegistrationForm = false;
    localStorage.removeItem("profit_quote_draft");
    toast.success("Formulario limpiado");
  }

  function addToCart(article: any) {
    const co_art = article.co_art || article.codigo || article.id;
    const qty = quantities[co_art] || 1;

    // Identify if it's a service (Linea 09)
    const isService = article.co_lin?.trim() === "09";

    // Obtener almacén seleccionado
    const almId =
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
    if (newQty < 1 || isNaN(newQty)) {
      cart[index].qty = 1;
      return;
    }
    const item = cart[index];
    const isService = item.co_lin?.trim() === '09' || (item.co_art || item.codigo || '').startsWith('09');
    
    if (isService) {
        cart[index].qty = newQty;
        return;
    }

    const available =
      item.disponibilidad?.find((a: any) => a.co_alma === item.co_alma_selected)
        ?.stock || 0;

    if (newQty > available) {
      toast.error(`Stock insuficiente en este almacén. Máximo: ${available}`);
      cart[index].qty = available || 1;
    } else {
      cart[index].qty = newQty;
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

    if (searchTerm) url.searchParams.set("search", searchTerm);
    else url.searchParams.delete("search");

    if (selectedBranch) url.searchParams.set("branch_id", selectedBranch);
    if (selectedWarehouse) url.searchParams.set("co_alma", selectedWarehouse);
    if (selectedLinea) url.searchParams.set("linea", selectedLinea);
    if (selectedCategoria) url.searchParams.set("categoria", selectedCategoria);
    if (sortOption && sortOption !== "relevance")
      url.searchParams.set("sort", sortOption);

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
      const isExempt = (item.co_lin || item.linea_id || "").trim() === "09" || (item.co_art ||item.codigo || '').startsWith('09');
      const rate = isExempt ? 0 : quoteTaxRate;

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

    return {
      subtotal: showUSD ? subUSD : subBS,
      iva: showUSD ? ivaUSD : ivaBS,
      total: showUSD ? subUSD + ivaUSD : subBS + ivaBS,
      symbol: showUSD ? "$" : "Bs.",
      raw: {
        usd: { sub: subUSD, iva: ivaUSD, total: subUSD + ivaUSD },
        bs: { sub: subBS, iva: ivaBS, total: subBS + ivaBS },
      },
    };
  });
</script>

<div class="flex flex-col gap-8 min-h-svh pb-20" in:fade>
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
        <div class="max-w-xl mx-auto space-y-6">
          {#if data.context?.branches && data.context.branches.length > 1}
            <div
            class="glass p-4 rounded-2xl border border-border-subtle flex items-center gap-4"
            >
              <Store class="text-brand-400" size={24} />
              <div class="flex-1">
                <p class="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1">Sucursal de Venta</p>
                <Combobox
                  options={(data.context?.branches || []).map((b: any) => ({ value: b.id, label: b.name }))}
                  bind:value={selectedBranch}
                  placeholder="Seleccionar sucursal..."
                />
              </div>
            </div>
          {/if}

          <form
            method="POST"
            action="?/searchClient"
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
              return async ({ result }) => {
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
            class="relative group h-20"
          >
            <input type="hidden" name="branch_id" value={selectedBranch} />
            <Search
              class="absolute left-8 top-1/2 -translate-y-1/2 text-brand-500"
              size={28}
            />
            <input
              type="text"
              name="rif"
              bind:value={rifInput}
              placeholder="V123456789"
              class="w-full h-full bg-surface-base pl-20 pr-40 rounded-full border border-border-subtle focus:border-brand-500/50 outline-none transition-all font-black text-2xl uppercase tracking-widest text-text-base placeholder:text-text-secondary/30"
              autocomplete="off"
            />
            <button
              type="submit"
              class="absolute right-2 top-2 bottom-2 bg-surface-soft hover:bg-surface-strong border border-border-subtle px-10 rounded-full font-bold text-text-base transition-all active:scale-95"
            >
              {#if searchingClient}
                <Loader2 size={24} class="animate-spin" />
              {:else}
                Buscar
              {/if}
            </button>
          </form>
        </div>

        {#if selectedClient}
          <!-- Card Cliente Encontrado -->
          <div
            class="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500"
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
                  <div class="flex items-center gap-4 text-text-muted">
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
                  </div>

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

                  <!-- Vendedor -->
                  <div class="flex items-center gap-4 text-text-muted">
                    <div
                      class="h-10 w-10 rounded-xl bg-surface-soft flex items-center justify-center text-brand-400 shrink-0"
                    >
                      <UserCircle size={18} />
                    </div>
                    <div class="flex flex-col">
                      <span
                        class="text-[10px] uppercase font-black tracking-widest opacity-50"
                        >Vendedor</span
                      >
                      <span class="font-bold text-text-base"
                        >{selectedClient.co_ven || "No asignado"}</span
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
                        {data.context?.zonas?.find(
                          (z) => z.co_zon === selectedClient.co_zon,
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
                        {selectedClient.contribuyente
                          ? selectedClient.contribu_e
                            ? "Especial"
                            : "Contribuyente"
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

                <div class="pt-6 border-t border-border-subtle flex justify-end">
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
            class="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500"
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
                    <label class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2">Zona</label>
                    <input type="hidden" name="co_zon" value={newClient.co_zon} />
                    <Combobox
                      options={(data.context?.zonas || []).map((z: any) => ({ value: z.co_zon, label: z.zon_des }))}
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
                          <label class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2">Tipo de Persona</label>
                          <input type="hidden" name="tipo_per" value={newClient.tipo_per} />
                          <Combobox
                            options={[
                              { value: '1', label: '(PNR) Nat. Residente' },
                              { value: '2', label: '(PNNR) Nat. No Residente' },
                              { value: '3', label: '(PJD) Jur. Domiciliada' },
                              { value: '4', label: '(PJND) Jur. No Domiciliada' },
                              { value: '5', label: 'Exenta' }
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
      <!-- SECTION 2: SELECCIÓN DE ARTÍCULOS -->
      <div in:fade class="space-y-6">
        <!-- Dashboard for filtering (Compact) -->
        <div
          class="glass p-4 rounded-3xl border border-border-subtle shadow-2xl grid grid-cols-2 lg:grid-cols-4 gap-4 items-center relative z-10"
        >
          <!-- 1. Buscador + Scanner -->
          <div class="flex items-center gap-2 col-span-2 lg:col-span-1">
            <form onsubmit={handleSearch} class="relative group flex-1 h-12">
              <Search
                class="absolute left-5 top-1/2 -translate-y-1/2 text-brand-500"
                size={20}
              />
              <input
                type="text"
                placeholder="Buscar código o descripción..."
                bind:value={searchTerm}
                class="w-full h-full bg-surface-base pl-14 pr-24 rounded-full border border-border-subtle focus:border-brand-500/30 outline-none transition-all font-bold text-sm placeholder:font-normal placeholder:text-text-secondary/30"
              />
              <button
                type="submit"
                class="absolute right-1 top-1 bottom-1 px-4 bg-surface-soft hover:bg-surface-strong text-text-base rounded-full text-xs font-bold transition-all border border-border-subtle"
              >
                Buscar
              </button>
            </form>
            <BarcodeScanner onScan={(code) => { 
                searchTerm = code;
                handleSearch(new Event('submit') as any);
            }} />
          </div>

          <!-- 2. Linea -->
          <div class="col-span-1 lg:col-span-1">
            <Combobox
              options={(data.context?.lineas || []).map((l: any) => ({ value: l.co_lin, label: l.lin_des }))}
              bind:value={selectedLinea}
              placeholder="Líneas (Todas)"
              allLabel="Líneas (Todas)"
              onchange={handleSearch}
              class="w-full h-12"
            />
          </div>

          <!-- 3. Categoria -->
          <div class="col-span-1 lg:col-span-1">
            <Combobox
              options={(filteredCategorias || []).map((c: any) => ({ value: c.co_cat, label: c.cat_des }))}
              bind:value={selectedCategoria}
              placeholder="Categorías (Todas)"
              allLabel="Categorías (Todas)"
              onchange={handleSearch}
              class="w-full h-12"
            />
          </div>

          <!-- 4. Acciones (Precio + Moneda) -->
          <div class="flex items-center gap-2 w-full h-12 col-span-2 lg:col-span-1">
            <button
              type="button"
              onclick={() => {
                const u = new URL($page.url);
                const cur = u.searchParams.get("sort");
                const next =
                  cur === "asc" ? "desc" : cur === "desc" ? "" : "asc";
                if (next) u.searchParams.set("sort", next);
                else u.searchParams.delete("sort");
                u.searchParams.set("page", "1");
                goto(u.toString());
              }}
              class={`flex-1 h-full rounded-xl border transition-all flex items-center justify-center gap-2 font-bold text-[10px] uppercase tracking-wider ${
                $page.url.searchParams.get("sort")
                  ? "bg-brand-500/10 border-brand-500/30 text-brand-400"
                  : "bg-white/5 border-white/5 text-text-muted hover:bg-white/10"
              }`}
            >
              {#if $page.url.searchParams.get("sort") === "asc"}
                <ArrowUpAZ size={14} />
                <span>Menor</span>
              {:else if $page.url.searchParams.get("sort") === "desc"}
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
                <div class="absolute top-4 right-4 z-10 flex flex-col items-end gap-1">
                  <span
                    class="px-2 py-1 rounded-md bg-surface-soft backdrop-blur text-[10px] font-black text-brand-400 border border-border-bold uppercase"
                  >
                    {article.co_art || article.codigo}
                  </span>
                  {#if (article.co_lin || '').trim() === '09' || (article.co_art || article.codigo || '').startsWith('09')}
                    <span class="px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 text-[8px] font-black uppercase tracking-tighter border border-green-500/20">
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
                  Unidad: <span class="text-brand-400"
                    >{article.uni_venta || article.unidad || "UNID"}</span
                  >
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
                        class="text-sm font-black {article.co_lin?.trim() === '09' || (curAlm?.stock || 0) > 0
                          ? 'text-green-400'
                          : 'text-red-400'}"
                      >
                        {article.co_lin?.trim() === "09" ? "Stock Ilimitado" : (curAlm?.stock || 0)}
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
                        onclick={() =>
                          (quantities[article.co_art] = Math.max(
                            1,
                            (quantities[article.co_art] || 1) - 1,
                          ))}
                        class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 transition-colors bg-surface-soft"
                        title="Restar"><Minus size={12} /></button
                      >
                      <input
                        type="number"
                        min="1"
                        bind:value={quantities[article.co_art]}
                        oninput={(e) => {
                          const val = parseInt(
                            (e.target as HTMLInputElement).value,
                          );
                          const stock = curAlm?.stock || 0;

                          if (isNaN(val) || val < 1) {
                            quantities[article.co_art] = 1;
                          } else if (val > stock) {
                            quantities[article.co_art] = stock;
                            toast.warning(`Máximo disponible: ${stock}`);
                          } else {
                            quantities[article.co_art] = val;
                          }
                        }}
                        class="w-full flex-1 text-center text-base font-black bg-transparent outline-none no-arrows text-brand-400 px-1"
                      />
                      <button
                        onclick={() => {
                          const isService = article.co_lin?.trim() === "09";
                          const stock = curAlm?.stock || 0;
                          if (isService || (quantities[article.co_art] || 1) < stock) {
                            quantities[article.co_art] =
                              (quantities[article.co_art] || 1) + 1;
                          } else {
                            toast.error(
                              "Alcanzó el límite de stock disponible",
                            );
                          }
                        }}
                        class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 transition-colors bg-surface-soft"
                        title="Sumar"><Plus size={12} /></button
                      >
                    </div>

                    <!-- Botón Agregar -->
                    <button
                      onclick={() => addToCart(article)}
                      class="h-11 w-14 shrink-0 bg-brand-600 hover:bg-brand-500 text-white rounded-xl shadow-lg shadow-brand-500/20 active:scale-95 transition-all flex items-center justify-center"
                      title="Agregar al Carrito"
                    >
                      <ShoppingCart size={20} />
                    </button>
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
                    Cotización en curso
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
          <h2 class="text-3xl font-black tracking-tight text-text-base uppercase italic">
            Cierre de Cotización
          </h2>
          <p class="text-text-muted mt-2 font-medium">
            Revise los detalles finales antes de procesar el documento.
          </p>
        </div>

        <div class="flex flex-col gap-8">
          <!-- Bloque 1: Resumen Cliente (Detailed Card) -->
          <div class="glass p-8 rounded-[40px] border border-border-bold space-y-8 relative overflow-hidden group bg-surface-soft/20">
            <div class="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 rounded-full blur-[100px] -mr-32 -mt-32"></div>

            <div class="flex items-center justify-between border-b border-border-subtle pb-6 relative z-10">
              <div class="flex items-center gap-3">
                <User size={20} class="text-brand-400" />
                <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                  Información del Cliente
                </h4>
              </div>
              <button
                onclick={() => (activeTab = 0)}
                class="px-4 py-2 rounded-xl bg-surface-soft hover:bg-surface-strong text-[10px] font-black uppercase text-brand-400 tracking-widest transition-all border border-border-subtle"
                >Cambiar Cliente</button
              >
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
              <!-- Info Principal -->
              <div class="lg:col-span-2 space-y-6">
                <div>
                  <div class="text-[10px] font-black uppercase tracking-widest text-brand-400/60 mb-1">
                    Razón Social
                  </div>
                  <div class="text-3xl font-black text-text-base tracking-tight">
                    {selectedClient.descripcion || selectedClient.cli_des}
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-border-subtle pb-4">
                  <div class="space-y-1">
                    <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block"
                      >R.I.F. / Identificación</span
                    >
                    <span class="font-mono text-sm font-bold text-brand-400"
                      >{selectedClient.rif || selectedClient.co_cli}</span
                    >
                  </div>
                  <div class="space-y-1">
                    <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block"
                      >Teléfono de Contacto</span
                    >
                    <span class="text-sm font-bold text-text-base"
                      >{selectedClient.telefonos || "No reg."}</span
                    >
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div class="space-y-1">
                    <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block"
                      >Correo Electrónico</span
                    >
                    <span class="text-sm font-bold text-text-base lowercase"
                      >{selectedClient.email || "No reg."}</span
                    >
                  </div>
                  <div class="space-y-1">
                    <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block"
                      >Zona / Región</span
                    >
                    <span class="text-sm font-bold text-text-base text-brand-400">
                      {data.context?.zonas?.find(
                        (z) => z.co_zon === selectedClient.co_zon,
                      )?.zon_des ||
                        selectedClient.co_zon ||
                        "Sin zona"}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Info Lateral / Fiscal -->
              <div class="space-y-6 p-6 rounded-3xl bg-surface-soft/30 border border-border-subtle">
                <div class="space-y-4">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-black uppercase tracking-widest text-text-muted"
                      >Estatus</span
                    >
                    <span class="px-2 py-1 rounded-md bg-brand-500/10 text-brand-400 text-[10px] font-black uppercase tracking-widest border border-brand-500/20">
                      {selectedClient.contribuyente
                        ? "Contribuyente"
                        : "No Cont."}
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-black uppercase tracking-widest text-text-muted"
                      >Vendedor</span
                    >
                    <span class="text-xs font-bold text-text-base">
                      {selectedClient.co_ven || "No asignado"}
                    </span>
                  </div>
                </div>
                <div class="pt-4 border-t border-border-subtle">
                  <span class="text-[10px] font-black uppercase tracking-widest text-text-muted block mb-2"
                    >Dirección Fiscal</span
                  >
                  <p class="text-sm font-medium text-text-muted leading-relaxed line-clamp-3 italic">
                    {selectedClient.direc1 || "Sin dirección registrada"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Bloque 2: Detalle de Renglones (Full Width) -->
          <div class="glass rounded-[32px] border border-border-subtle overflow-hidden">
            <div class="p-8 border-b border-border-subtle flex items-center justify-between bg-surface-soft/50">
              <div class="flex items-center gap-3">
                <Package size={20} class="text-text-muted" />
                <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
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
                <div class="p-8 flex flex-col lg:flex-row items-start lg:items-center gap-8 transition-all hover:bg-surface-soft group relative border-b border-border-subtle last:border-0">
                  <!-- Product Identity & Qty -->
                  <div class="flex items-center gap-6 shrink-0 w-full lg:w-auto">
                    <div class="h-16 w-16 rounded-2xl bg-surface-soft flex items-center justify-center text-brand-400 relative group-hover:scale-110 transition-transform duration-500">
                      <div class="absolute inset-0 bg-brand-500/10 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <Package size={28} />
                    </div>
                    <div class="flex items-center bg-surface-base/40 rounded-xl border border-border-subtle h-12 overflow-hidden shadow-inner">
                      <button
                        onclick={() => updateCartQty(i, item.qty - 1)}
                        class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 hover:bg-surface-soft transition-all"
                        ><Minus size={14} /></button
                      >
                      <input
                        type="number"
                        value={item.qty}
                        oninput={(e) => updateCartQty(i, parseInt(e.currentTarget.value))}
                        class="w-12 text-center text-base font-black bg-transparent outline-none no-arrows text-brand-400"
                      />
                      <button
                        onclick={() => updateCartQty(i, item.qty + 1)}
                        class="w-10 h-full flex items-center justify-center text-text-muted hover:text-brand-400 hover:bg-surface-soft transition-all"
                        ><Plus size={14} /></button
                      >
                    </div>
                  </div>

                  <!-- Item Details & Configuration -->
                  <div class="flex-1 min-w-0 space-y-4 w-full">
                    <div class="space-y-1">
                      <div class="text-lg font-black text-text-base leading-tight">
                        {item.art_des || item.descripcion}
                      </div>
                      <div class="flex items-center gap-4 text-[11px] font-bold uppercase tracking-[0.15em]">
                        <span class="text-brand-400 font-mono">{item.co_art}</span>
                        <span class="h-1 w-1 rounded-full bg-border-subtle"></span>
                        <span class="text-text-muted">{item.uni_venta || item.unidad || "UNID"}</span>
                      </div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div class="relative group/sel">
                        <select
                          value={item.co_alma_selected}
                          onchange={(e) => updateCartWarehouse(i, e.currentTarget.value)}
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
                        <ChevronDown size={14} class="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted group-hover/sel:text-brand-400 transition-colors pointer-events-none" />
                      </div>
                      <div class="relative group/sel">
                        <select
                          value={item.price_index_selected}
                          onchange={(e) => updateCartPrice(i, parseInt(e.currentTarget.value))}
                          class="w-full h-11 bg-surface-soft rounded-xl px-4 text-sm font-black outline-none border border-border-subtle appearance-none cursor-pointer focus:border-brand-500/30 transition-all hover:bg-surface-strong"
                        >
                          {#each item.precios || [] as price, idx}
                            <option
                              value={idx}
                              class="bg-surface-base text-text-base text-sm"
                              >{price.des_precio || `Tipo ${idx + 1}`} - $ {price.precio.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</option
                            >
                          {/each}
                        </select>
                        <ChevronDown size={14} class="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted group-hover/sel:text-brand-400 transition-colors pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <!-- Financial Detail per Row -->
                  <div class="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center w-full lg:w-48 gap-4 border-t lg:border-t-0 border-border-subtle pt-6 lg:pt-0">
                    <div class="text-right space-y-1">
                      <div class="text-xl font-black text-brand-400 leading-none">
                        {totals().symbol}
                        {(
                          (showUSD
                            ? item.price_selected?.precio || item.precios?.[0]?.precio || 0
                            : item.price_selected?.precio_ves || item.precios?.[0]?.precio_ves || 0) * item.qty
                        ).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div class="text-[10px] text-text-muted font-bold uppercase tracking-widest">
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
            <div class="glass p-8 rounded-[32px] border border-border-subtle space-y-6 flex flex-col h-full bg-surface-soft/20">
              <div class="flex items-center gap-3 text-text-muted border-b border-border-subtle pb-4">
                <FileText size={18} class="text-brand-400" />
                <h4 class="text-[10px] font-black uppercase tracking-[0.2em]">
                  Descripción Global / Notas
                </h4>
              </div>
              <textarea
                bind:value={quoteDescription}
                placeholder="Escriba aquí notas para el cliente o comentarios internos de la cotización..."
                class="flex-1 w-full min-h-[220px] bg-surface-base/50 rounded-2xl p-6 text-sm text-text-base outline-none border border-border-subtle focus:border-brand-500/40 focus:bg-surface-base transition-all resize-none font-medium leading-relaxed placeholder:text-text-muted/30"
              ></textarea>
            </div>

            <!-- Col Right: Resumen & Acciones -->
            <div class="glass p-8 rounded-[32px] border border-border-subtle space-y-8 bg-brand-500/[0.03] backdrop-blur-3xl relative overflow-hidden flex flex-col">
              <div class="absolute -top-12 -right-12 w-48 h-48 bg-brand-500/10 rounded-full blur-[80px]"></div>

              <div class="flex items-center justify-between border-b border-border-subtle pb-6 relative z-10">
                <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                  Total Documento
                </h4>
                <div class="flex bg-surface-base p-1 rounded-xl border border-border-bold shadow-lg">
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
                <div class="flex justify-between items-center text-base font-bold text-text-muted">
                  <span>Sub-Total</span>
                  <span class="font-mono text-text-base"
                    >{totals().symbol}
                    {totals().subtotal.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span
                  >
                </div>

                <div class="flex justify-between items-center text-base font-bold">
                  <div class="flex items-center gap-3">
                    <span class="text-text-muted">I.V.A</span>
                    <select
                      bind:value={quoteTaxRate}
                      class="bg-surface-strong border border-border-bold text-[10px] font-black text-brand-400 cursor-pointer outline-none hover:bg-surface-soft rounded-lg px-3 py-1.5 transition-all shadow-sm"
                    >
                      <option value={16} class="bg-surface-base font-sans text-sm">Cargar 16%</option>
                      <option value={0} class="bg-surface-base font-sans text-sm">Exento 0%</option>
                    </select>
                  </div>
                  <span class="font-mono text-brand-400"
                    >{totals().symbol}
                    {totals().iva.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span
                  >
                </div>

                <div class="pt-8 border-t border-border-bold flex flex-col gap-2">
                  <div class="flex justify-between items-end">
                    <div>
                      <span class="text-[10px] font-black uppercase tracking-[0.2em] text-brand-400/60 block mb-2">Total a Pagar</span>
                      <div class="text-5xl font-black text-text-base drop-shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)] tracking-tight leading-none">
                        {totals().symbol}
                        {totals().total.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div class="text-right pb-1">
                      <div class="text-[10px] font-black uppercase tracking-widest text-text-muted italic mb-1">
                        Ref. {showUSD ? "Bolívares" : "Dólares"}
                      </div>
                      <div class="text-lg font-black font-mono text-brand-400/80">
                        {showUSD ? "Bs." : "$"}
                        {(showUSD ? totals().raw.bs.total : totals().raw.usd.total).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="pt-6 space-y-4 relative z-10">
                <form
                  method="POST"
                  action="?/saveQuote"
                  use:enhance={() => {
                    isSearching = true;
                    return async ({ result }) => {
                      isSearching = false;
                      if (result.type === "success") {
                        toast.success((result as any).data?.message || "¡Cotización generada con éxito!");
                        clearQuote();
                        goto("/dashboard/sales/quotes");
                      } else if (result.type === "failure") {
                        toast.error((result as any).data?.message || "No se pudo guardar la cotización");
                      }
                    };
                  }}
                >
                  <input type="hidden" name="branch_id" value={selectedBranch} />
                  <input
                    type="hidden"
                    name="quote_data"
                    value={JSON.stringify({
                      co_cli: selectedClient.co_cli || selectedClient.rif.replace(/[^a-zA-Z0-9]/g, "").substring(0, 10),
                      descrip: (quoteDescription ? quoteDescription + " - " : "") + "COTIZACION APP WEB - " + (selectedClient.descripcion || selectedClient.cli_des),
                      comentario: quoteDescription || "Pedido registrado vía portal web.",
                      renglones: cart.map((item) => {
                        const isExempt = (item.co_lin || item.linea_id || "").trim() === "09";
                        const rate = isExempt ? 0 : quoteTaxRate;
                        const taxType = rate === 16 ? "1" : "5";
                        return {
                          co_art: item.co_art || item.codigo,
                          art_des: item.art_des || item.descripcion,
                          cantidad: item.qty,
                          precio: item.price_selected?.precio || item.precios?.[0]?.precio || 0,
                          co_alma: item.co_alma_selected,
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
                      <Loader2 size={32} class="animate-spin text-brand-400/40" />
                      <span class="animate-pulse">Procesando...</span>
                    {:else}
                      <div class="bg-surface-strong/50 p-2.5 rounded-xl group-hover:scale-110 transition-transform">
                        <Check size={28} />
                      </div>
                      Guardar
                    {/if}
                  </button>
                </form>

                <div class="grid grid-cols-2 gap-4">
                  <button
                    onclick={clearQuote}
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
