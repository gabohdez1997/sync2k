<!-- src/routes/dashboard/sales/price-checker/+page.svelte -->
<script lang="ts">
  import { fade, slide, scale } from "svelte/transition";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { toast } from "svelte-sonner";
  import {
    Search,
    QrCode,
    Camera,
    Loader2,
    AlertCircle,
    XCircle,
    X,
    Percent,
    Info,
    Sparkles,
    ArrowLeft,
    Layers,
    FileText,
    Calculator,
    Check,
    Store,
    Box,
    Package
  } from "lucide-svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // --- Reactividad Svelte 5 ---
  let selectedBranchId = $state("");
  let searchQuery = $state("");
  let searchInputRef = $state<HTMLInputElement | null>(null);

  // Estados del Lector QR/Barra
  let openScannerModal = $state(false);
  let scannerLoading = $state(false);
  let scannerInstance: any = $state(null);
  let cameraErrorMessage = $state<string | null>(null);

  // Estado de carga de búsqueda
  let searching = $state(false);

  // Obtener reactivamente los resultados y la paginación
  const searchResults = $derived(data.searchResults || []);
  const pagination = $derived(data.pagination || { total: 0, page: 1, limit: 12, totalPages: 0 });

  // Inicializar y observar cambios del servidor
  let initialized = false;
  $effect(() => {
    if (!initialized && data.selectedBranchId) {
      selectedBranchId = data.selectedBranchId;
      searchQuery = data.search || "";
      initialized = true;
    } else if (data.selectedBranchId) {
      selectedBranchId = data.selectedBranchId;
    }
  });

  // --- Manejo de Búsqueda y Paginación ---
  function handleBranchChange() {
    searching = true;
    const urlParams = new URLSearchParams($page.url.searchParams);
    urlParams.set("branch_id", selectedBranchId);
    urlParams.set("page", "1");
    if (searchQuery) {
      urlParams.set("q", searchQuery);
    }
    goto(`?${urlParams.toString()}`).then(() => {
      searching = false;
    });
  }

  function handleSearch(termOverride?: string) {
    const term = termOverride !== undefined ? termOverride : searchQuery;
    if (!term.trim()) {
      toast.error("Por favor ingresa un término de búsqueda.");
      return;
    }
    searching = true;
    const urlParams = new URLSearchParams();
    urlParams.set("branch_id", selectedBranchId);
    urlParams.set("q", term.trim());
    urlParams.set("page", "1");
    goto(`?${urlParams.toString()}`).then(() => {
      searching = false;
    });
  }

  function changePage(nextPage: number) {
    searching = true;
    const urlParams = new URLSearchParams($page.url.searchParams);
    urlParams.set("page", nextPage.toString());
    goto(`?${urlParams.toString()}`).then(() => {
      searching = false;
    });
  }

  function clearSearch() {
    searchQuery = "";
    searching = true;
    goto(`?branch_id=${selectedBranchId}`).then(() => {
      searching = false;
      if (searchInputRef) searchInputRef.focus();
    });
  }

  // --- Lector QR/Barra (html5-qrcode) ---
  function toggleScanner() {
    if (openScannerModal) {
      stopScanner();
    } else {
      openScannerModal = true;
      cameraErrorMessage = null;
      // Esperar a que el modal se renderice y cargar la cámara
      setTimeout(startScanner, 300);
    }
  }

  function startScanner() {
    if (typeof (window as any).Html5Qrcode === "undefined") {
      cameraErrorMessage = "Cargando componentes de cámara web... Por favor espera.";
      setTimeout(startScanner, 500);
      return;
    }

    scannerLoading = true;
    cameraErrorMessage = null;

    try {
      scannerInstance = new (window as any).Html5Qrcode("qr-reader-container");
      scannerInstance
        .start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (width: number, height: number) => {
              const size = Math.min(width, height) * 0.7;
              return { width: size, height: size };
            }
          },
          (decodedText: string) => {
            // Escaneo exitoso!
            toast.success("Código detectado con éxito.");
            searchQuery = decodedText.trim();
            stopScanner();
            handleSearch(decodedText);
          },
          () => {
            // Callback silencioso para cada frame no decodificado
          }
        )
        .then(() => {
          scannerLoading = false;
        })
        .catch((err: any) => {
          console.error("Error al iniciar cámara:", err);
          scannerLoading = false;
          cameraErrorMessage =
            "No se pudo acceder a la cámara. Por favor concede los permisos e intenta nuevamente.";
        });
    } catch (e: any) {
      console.error("Scanner exception:", e);
      scannerLoading = false;
      cameraErrorMessage = "Error de inicialización de cámara web.";
    }
  }

  function stopScanner() {
    if (scannerInstance && scannerInstance.isScanning) {
      scannerInstance
        .stop()
        .then(() => {
          scannerInstance = null;
          openScannerModal = false;
        })
        .catch((err: any) => {
          console.error("Error al detener cámara:", err);
          openScannerModal = false;
        });
    } else {
      openScannerModal = false;
    }
  }

  // --- Cálculos de Precios ---
  // Formato venezolano: punto para miles, coma para decimales, siempre 2 decimales
  function fmtVES(n: number): string {
    return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Helper para procesar Precio 1 y disponibilidad de cada artículo
  function getPriceDetails(article: any) {
    const activePriceObj = article.precios?.find(
      (p: any) => p.id_precio === "01" || p.id_precio === "1" || p.des_precio?.toLowerCase().includes("precio 1")
    ) || article.precios?.[0];

    const priceUSD = Number(activePriceObj?.precio || 0);
    const isUSD = activePriceObj?.moneda?.toUpperCase() !== "BS";

    // Conversión dinámica de divisa usando la tasa BCV
    const basePriceUSD = isUSD ? priceUSD : priceUSD / (data.tasa || 1);
    const basePriceBS = isUSD ? priceUSD * (data.tasa || 1) : priceUSD;

    // IVA 16%
    const ivaRate = 0.16;
    const ivaUSD = basePriceUSD * ivaRate;
    const ivaBS = basePriceBS * ivaRate;

    // Totales a Pagar con IVA Incluido
    const totalUSD = basePriceUSD + ivaUSD;
    const totalBS = basePriceBS + ivaBS;

    return {
      totalBS,
      totalUSD,
      isAvailable: Number(article.total_stock || 0) >= 1,
      ref: article.referencia || article.ref || ''
    };
  }
</script>

<svelte:head>
  <script src="https://unpkg.com/html5-qrcode" defer></script>
</svelte:head>

<div class="space-y-8" in:fade>
  <!-- Header principal de la vista -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <QrCode size={40} class="text-brand-500" />
        Consultor de Precios
      </h1>
    </div>

    <!-- Tasa BCV y Selector de Sucursal -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="bg-brand-500/10 border border-brand-500/20 px-4 py-2.5 rounded-2xl flex items-center gap-2">
        <Calculator size={16} class="text-brand-500" />
        <span class="text-xs font-bold text-brand-400">
          Tasa BCV: <strong class="text-text-base">{fmtVES(data.tasa)} Bs/$</strong>
        </span>
      </div>

      {#if data.branches && data.branches.length > 1}
        <div class="bg-surface-raised border border-border-subtle px-4 py-2.5 rounded-2xl flex items-center gap-3">
          <Store size={16} class="text-brand-500" />
          <span class="text-xs font-black uppercase text-brand-500 tracking-wider">Sede:</span>
          <select
            bind:value={selectedBranchId}
            onchange={handleBranchChange}
            class="bg-transparent text-sm font-bold focus:outline-none cursor-pointer text-text-base border-none p-0 pr-2"
          >
            {#each data.branches as branch}
              <option value={branch.id} class="bg-surface-raised font-bold text-text-base">{branch.name}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>
  </div>

  <!-- Buscador Principal -->
  <div class="grid grid-cols-1 gap-6">
    <div class="bg-surface-raised/40 backdrop-blur-xl border border-border-subtle p-6 rounded-3xl shadow-xl space-y-4">
      <div class="flex flex-col sm:flex-row gap-3">
        <div class="relative flex-1">
          <Search size={20} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-60" />
          <input
            bind:this={searchInputRef}
            type="text"
            bind:value={searchQuery}
            placeholder="Buscar por descripción, código o referencia del artículo..."
            onkeydown={(e) => e.key === "Enter" && handleSearch()}
            class="w-full h-14 pl-12 pr-12 bg-surface-base border border-border-subtle rounded-2xl text-text-base focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-bold placeholder:text-text-muted/40 placeholder:font-normal"
          />
          {#if searchQuery}
            <button
              onclick={clearSearch}
              class="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-brand-500 transition-colors"
            >
              <X size={20} />
            </button>
          {/if}
        </div>

        <button
          onclick={() => handleSearch()}
          disabled={searching}
          class="h-14 px-6 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-brand-500/20 active:scale-95 transition-all"
        >
          {#if searching}
            <Loader2 size={18} class="animate-spin" />
          {:else}
            <Search size={18} />
          {/if}
          Buscar
        </button>

        <button
          onclick={toggleScanner}
          class="h-14 px-6 bg-white/5 hover:bg-white/10 text-text-base border border-border-subtle rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <Camera size={18} class="text-brand-400" />
          Escanear QR
        </button>
      </div>
    </div>
  </div>

  <!-- Alertas de Error -->
  {#if data.error}
    <div
      class="bg-red-500/10 border border-red-500/20 p-5 rounded-3xl flex gap-3 text-red-400 font-medium"
      in:fade
    >
      <AlertCircle size={24} class="shrink-0 mt-0.5" />
      <div>
        <p class="font-bold">Error en la consulta</p>
        <p class="text-sm opacity-80 mt-1">{data.error}</p>
      </div>
    </div>
  {/if}

  <!-- Catálogo / Grilla de Resultados -->
  {#if searching}
    <div class="glass p-20 rounded-[40px] border border-border-subtle text-center space-y-4" in:fade>
      <Loader2 size={44} class="animate-spin text-brand-500 mx-auto" />
      <p class="text-xl font-bold text-text-muted">Buscando en catálogo...</p>
    </div>
  {:else if searchResults.length > 0}
    <div class="space-y-6" in:fade>
      <div class="flex justify-between items-center pl-1">
        <h3 class="text-xs uppercase font-black text-brand-500 tracking-widest">
          Artículos encontrados ({pagination.total})
        </h3>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" in:fade={{ duration: 150 }}>
        {#each searchResults as article}
          {@const priceInfo = getPriceDetails(article)}
          <div
            class="glass p-6 rounded-3xl border border-white/5 hover:border-brand-500/30 transition-all flex flex-col group relative overflow-hidden bg-gradient-to-b from-white/[0.04] to-white/[0.01] backdrop-blur-xl shadow-[0_12px_24px_rgba(0,0,0,0.25)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] duration-300 w-full max-w-md mx-auto md:mx-0"
          >
            <!-- Badge de Código en la esquina superior -->
            <div class="absolute top-4 right-4 z-10 flex flex-col items-end gap-1">
              <span class="px-2 py-0.5 rounded-md bg-surface-soft/80 backdrop-blur-md text-[10px] font-mono font-bold text-text-muted border border-border-subtle uppercase">
                {article.co_art || article.codigo}
              </span>
              {#if (article.co_lin || "").trim() === "09" || (article.co_art || "").startsWith("09")}
                <span class="px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 text-[9px] font-black uppercase tracking-tighter border border-green-500/20">
                  Servicio / Exento
                </span>
              {/if}
            </div>

            <!-- Contenedor del Icono/Imagen del Producto -->
            <div class="h-36 bg-surface-soft/40 rounded-[20px] flex items-center justify-center text-text-muted mb-4 group-hover:bg-brand-500/5 transition-colors relative overflow-hidden shrink-0">
              <Package
                size={40}
                class="opacity-30 group-hover:scale-110 group-hover:text-brand-500 transition-all duration-500"
              />
            </div>

            <!-- Nombre y Datos -->
            <div class="flex-1 space-y-1">
              <h3 class="font-black text-base sm:text-lg leading-tight text-text-base group-hover:text-brand-400 transition-colors line-clamp-2 min-h-[3rem]">
                {article.art_des || article.descripcion}
              </h3>
              
              <div class="flex flex-wrap items-center gap-2 text-[10px] uppercase font-bold text-text-muted pt-1">
                {#if priceInfo.ref}
                  <span class="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded font-mono text-[10px] text-text-secondary">
                    REF: {priceInfo.ref}
                  </span>
                {/if}
                <span class="text-brand-400/80 bg-brand-500/5 border border-brand-500/10 px-1.5 py-0.5 rounded">
                  {article.unidad || "UNID"}
                </span>
              </div>
            </div>

            <!-- Bloque de Precio Destacado (PROTAGONISTA) -->
            <div class="mt-4 p-5 bg-gradient-to-br from-brand-600/10 to-brand-500/5 border border-brand-500/15 group-hover:border-brand-500/25 rounded-2xl space-y-3 relative overflow-hidden transition-all duration-300 shadow-inner shrink-0">
              <div class="absolute -right-8 -bottom-8 w-20 h-20 bg-brand-500/5 rounded-full blur-xl pointer-events-none"></div>
              
              <div class="flex items-center justify-between gap-3 relative z-10">
                <span class="text-[10px] uppercase font-black text-text-muted tracking-wider">Total a Pagar</span>
                <div class="flex items-baseline gap-0.5">
                  <span class="text-2xl sm:text-3xl font-black text-brand-500 tracking-tight">
                    {fmtVES(priceInfo.totalBS)}
                  </span>
                  <span class="text-[11px] font-bold text-brand-500/70">Bs</span>
                </div>
              </div>

              <div class="flex items-center justify-between border-t border-white/5 pt-2.5 text-xs font-bold text-text-muted relative z-10">
                <span class="text-[10px] uppercase font-black tracking-wider opacity-85">Referencia</span>
                <span class="text-lg sm:text-xl font-black flex items-baseline gap-0.5">
                  $ {fmtVES(priceInfo.totalUSD)} <span class="text-[11px] font-normal text-text-muted">USD</span>
                </span>
              </div>

              <div class="text-[11px] text-text-muted/50 font-bold text-center pt-0.5 relative z-10">
                Precios incluyen IVA 16%
              </div>
            </div>

            <!-- Semáforo de Disponibilidad Consolidado -->
            <div class="mt-4 pt-3 border-t border-border-subtle/40 flex items-center justify-center shrink-0">
              {#if priceInfo.isAvailable}
                <div class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black rounded-xl text-[10px] tracking-wider uppercase">
                  <span class="relative flex h-1.5 w-1.5">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                  </span>
                  DISPONIBLE
                </div>
              {:else}
                <div class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 font-black rounded-xl text-[10px] tracking-wider uppercase">
                  <span class="h-1.5 w-1.5 rounded-full bg-red-400"></span>
                  AGOTADO
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <!-- Paginación Footer -->
      {#if pagination && pagination.totalPages > 1}
        <div class="flex justify-center gap-4 mt-8 pb-10">
          <button
            disabled={pagination.page <= 1}
            onclick={() => changePage(pagination.page - 1)}
            class="h-12 px-6 rounded-2xl bg-surface-soft border border-border-subtle font-bold disabled:opacity-30 transition-all hover:bg-surface-strong"
          >
            Anterior
          </button>
          <div class="h-12 px-6 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center font-black text-brand-400">
            {pagination.page} / {pagination.totalPages}
          </div>
          <button
            disabled={pagination.page >= pagination.totalPages}
            onclick={() => changePage(pagination.page + 1)}
            class="h-12 px-6 rounded-2xl bg-surface-soft border border-border-subtle font-bold disabled:opacity-30 transition-all hover:bg-surface-strong"
          >
            Siguiente
          </button>
        </div>
      {/if}
    </div>
  {:else if data.search}
    <!-- Estado de Búsqueda sin Resultados -->
    <div class="flex flex-col items-center justify-center p-20 text-center bg-surface-raised/30 border border-border-subtle rounded-3xl opacity-80 space-y-4" in:fade>
      <XCircle size={48} class="text-text-muted opacity-40" />
      <div>
        <h3 class="text-xl font-black text-text-base">No se encontraron artículos</h3>
        <p class="text-xs text-text-muted mt-2 max-w-sm mx-auto leading-relaxed">
          No se halló ningún artículo activo que coincida con "{data.search}" en esta sede. Intente con otro término o verifique los caracteres.
        </p>
      </div>
    </div>
  {:else}
    <!-- Estado Inicial / Instrucciones -->
    <div class="flex flex-col items-center justify-center p-20 text-center bg-surface-raised/30 border border-border-subtle rounded-3xl opacity-80 space-y-4" in:fade>
      <Sparkles size={48} class="text-brand-400 opacity-60 animate-pulse" />
      <div>
        <h3 class="text-xl font-black text-text-base">Consultor de Precios Activo</h3>
        <p class="text-xs text-text-muted mt-2 max-w-sm mx-auto leading-relaxed">
          Ingresa una descripción, código, referencia o presiona el lector QR para consultar al instante los precios finales de venta.
        </p>
      </div>
    </div>
  {/if}

  <!-- Lector QR/Barra Modal -->
  {#if openScannerModal}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      transition:fade={{ duration: 150 }}
    >
      <div
        class="bg-surface-raised border border-border-subtle max-w-md w-full rounded-3xl p-6 shadow-2xl relative space-y-4"
        transition:scale={{ start: 0.95, duration: 200 }}
      >
        <!-- Cerrar -->
        <button
          onclick={stopScanner}
          class="absolute top-4 right-4 text-text-muted hover:text-brand-500 transition-colors"
        >
          <X size={20} />
        </button>

        <div class="text-center space-y-1 pr-6">
          <h3 class="text-lg font-black text-text-base flex items-center justify-center gap-2">
            <Camera size={20} class="text-brand-500" />
            Lector QR / Barra Activo
          </h3>
          <p class="text-xs text-text-muted">
            Coloque el código frente a la cámara web de su dispositivo.
          </p>
        </div>

        <!-- Contenedor del Lector -->
        <div class="relative overflow-hidden rounded-2xl bg-black/10 border border-border-subtle aspect-square flex items-center justify-center">
          {#if scannerLoading}
            <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-raised/80 z-10">
              <Loader2 size={36} class="animate-spin text-brand-500" />
              <span class="text-xs text-text-muted font-bold">Encendiendo cámara...</span>
            </div>
          {/if}

          {#if cameraErrorMessage}
            <div class="absolute inset-0 p-6 flex flex-col items-center justify-center text-center gap-3 bg-surface-raised/95 z-20 text-red-400">
              <AlertCircle size={36} />
              <p class="text-xs font-bold leading-relaxed">{cameraErrorMessage}</p>
              <button
                onclick={startScanner}
                class="px-4 py-2 bg-white/5 border border-border-subtle hover:bg-white/10 text-xs font-bold rounded-xl active:scale-95 transition-all mt-2"
              >
                Reintentar
              </button>
            </div>
          {/if}

          <!-- Div destino para html5-qrcode -->
          <div id="qr-reader-container" class="w-full h-full object-cover"></div>
        </div>

        <!-- Botón Cancelar -->
        <button
          onclick={stopScanner}
          class="w-full py-3.5 bg-white/5 hover:bg-white/10 border border-border-subtle text-text-base rounded-2xl font-black text-xs uppercase tracking-wider transition-colors active:scale-98"
        >
          Cancelar Escaneo
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Personalización y mejoras visuales del visor de cámara de html5-qrcode */
  :global(#qr-reader-container video) {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
  }
  :global(#qr-reader-container__scan_region) {
    background: transparent !important;
  }
</style>
