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
    Image as ImageIcon,
    ImagePlus,
    ListFilter,
    X,
    UploadCloud,
    Loader2,
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import BarcodeScanner from "$lib/components/ui/BarcodeScanner.svelte";
  import { supabase } from "$lib/supabase";
  import { PUBLIC_SUPABASE_URL } from '$env/static/public';
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const canUpdate = data.crud?.update ?? false;

  let selectedBranch = $state($page.url.searchParams.get("branch_id") || "");
  $effect(() => {
    if (!selectedBranch && data.branches?.length === 1) {
      selectedBranch = data.branches[0].id;
      handleSearch();
    }
  });

  let searchTerm = $state($page.url.searchParams.get("search") || "");
  let selectedLinea = $state($page.url.searchParams.get("linea") || "");
  let selectedCategoria = $state($page.url.searchParams.get("categoria") || "");
  let isSearching = $state(false);

  const visibleArticles = $derived(
    (data.articles || []).filter(
      (a: any, i: number, arr: any[]) =>
        arr.findIndex(
          (b: any) => (b.co_art || b.codigo) === (a.co_art || a.codigo),
        ) === i,
    ),
  );

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
    selectedLinea = $page.url.searchParams.get("linea") || "";
    selectedCategoria = $page.url.searchParams.get("categoria") || "";
  });

  function handleSearch(e?: Event) {
    if (e) e.preventDefault();
    isSearching = true;
    const url = new URL($page.url);
    if (searchTerm) url.searchParams.set("search", searchTerm);
    else url.searchParams.delete("search");

    if (selectedBranch) url.searchParams.set("branch_id", selectedBranch);
    else url.searchParams.delete("branch_id");

    if (selectedLinea) url.searchParams.set("linea", selectedLinea);
    else url.searchParams.delete("linea");

    if (selectedCategoria) url.searchParams.set("categoria", selectedCategoria);
    else url.searchParams.delete("categoria");

    url.searchParams.set("page", "1");
    goto(url.toString(), { keepFocus: true, noScroll: true }).finally(
      () => (isSearching = false),
    );
  }

  // ── IMAGE UPLOAD LOGIC ──────────────────────────────────────────────────
  let uploadingArticleId = $state<string | null>(null);
  let fileInputRef: HTMLInputElement | null = null;
  let activeArticleForUpload: any = null;

  function triggerFileInput(article: any) {
    activeArticleForUpload = article;
    if (fileInputRef) {
      fileInputRef.click();
    }
  }

  async function processImage(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Max dimensions
        const MAX_SIZE = 800;
        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height *= MAX_SIZE / width));
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width *= MAX_SIZE / height));
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas ctx null"));

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("toBlob failed"));
          },
          "image/webp",
          0.85,
        ); // 85% quality WebP
      };
      img.onerror = () => reject(new Error("Error loading image"));
      img.src = url;
    });
  }

  async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0 || !activeArticleForUpload)
      return;

    const file = input.files[0];
    const article = activeArticleForUpload;
    const artCode = article.co_art || article.codigo || article.id;

    // Reset input
    input.value = "";
    activeArticleForUpload = null;
    uploadingArticleId = artCode;

    try {
      // 1. Process image to WebP
      const webpBlob = await processImage(file);
      
      // 2. Send to server action to upload and update agent
      const formData = new FormData();
      formData.append('co_art', artCode);
      formData.append('imageFile', webpBlob, `${artCode.trim()}.webp`);
      formData.append('branchId', selectedBranch);
      
      if (article.campo7 && article.campo7.trim() !== '' && !article.campo7.startsWith('http')) {
        formData.append('oldImageFile', article.campo7.trim());
      }

      const response = await fetch("?/updateImage", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      // La respuesta de sveltekit actions via fetch crudo viene en un formato específico,
      if (result.type === 'success' || (result.data && !result.data.error)) {
        toast.success(`Imagen actualizada para el artículo ${artCode}`);
        
        // Asignación directa para actualización instantánea en la UI
        const newUrl = result.data?.imageUrl;
        if (newUrl && activeArticleForUpload) {
          activeArticleForUpload.campo7 = newUrl;
        } else if (newUrl && article) {
          article.campo7 = newUrl;
        }

        // Forzar recarga de los datos de servidor en el background
        import('$app/navigation').then(n => n.invalidateAll());
      } else {
        const err = result.data?.error || "Error desconocido";
        throw new Error(`Error del Agente: ${err}`);
      }
    } catch (err: any) {
      toast.error(`Error al subir: ${err.message}`);
    } finally {
      uploadingArticleId = null;
    }
  }
</script>

<div
  class="h-full flex flex-col pt-[72px]"
  in:fade={{ duration: 200, delay: 150 }}
>
  <!-- ── HEADER ──────────────────────────────────────────────────────────── -->
  <header class="flex-none px-6 py-6 pb-2 relative z-20">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1
          class="text-3xl font-black tracking-tight flex items-center gap-3 drop-shadow-md"
        >
          <div
            class="p-2.5 rounded-2xl bg-brand-500/10 text-brand-500 shadow-sm border border-brand-500/20"
          >
            <ImageIcon size={24} />
          </div>
          Imágenes de Artículos
        </h1>
        <p class="text-text-muted mt-2">
          Gestione las imágenes de los productos. Se sincronizarán en todas las
          sedes.
        </p>
      </div>

      <div class="flex items-center gap-4">
        <!-- Selector de sede removido según requerimiento -->
      </div>
    </div>

    <!-- ── FILTERS ────────────────────────────────────────────────────────── -->
    <div
      class="glass p-4 rounded-3xl border border-white/5 shadow-2xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-50"
    >
      <!-- Búsqueda y Escáner -->
      <div
        class="col-span-1 md:col-span-2 lg:col-span-1 flex items-center gap-2 z-[60]"
      >
        <form onsubmit={handleSearch} class="relative group h-[46px] flex-1">
          <input
            type="text"
            bind:value={searchTerm}
            placeholder="Buscar código, descripción o referencia..."
            class="w-full h-full bg-surface-raised pl-4 pr-12 rounded-2xl text-sm border border-white/5 focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50 transition-all outline-none shadow-inner"
          />
          <button
            type="submit"
            disabled={isSearching}
            class="absolute right-1 top-1 bottom-1 w-10 flex items-center justify-center bg-surface-soft hover:bg-surface-strong text-brand-400 rounded-xl transition-all border border-white/5 active:scale-95 disabled:opacity-50"
            title="Buscar"
          >
            {#if isSearching}
              <span class="animate-pulse text-xs">...</span>
            {:else}
              <Search size={16} />
            {/if}
          </button>
        </form>
        <BarcodeScanner
          onScan={(code) => {
            searchTerm = code;
            handleSearch();
          }}
        />
      </div>

      <!-- Línea -->
      <div class="col-span-1 z-[55]">
        <Combobox
          options={(data.context?.lineas || []).map((l: any) => ({
            value: l.co_lin,
            label: l.lin_des || l.des_lin,
          }))}
          bind:value={selectedLinea}
          placeholder="Línea..."
          allLabel="Todas las Líneas"
          searchPlaceholder="Buscar línea..."
          icon={ListFilter}
          onchange={() => {
            selectedCategoria = "";
            handleSearch();
          }}
        />
      </div>

      <!-- Sublínea -->
      <div class="col-span-1 z-[50]">
        <Combobox
          options={(filteredCategorias || []).map((c: any) => ({
            value: c.co_cat,
            label: c.cat_des || c.des_cat,
          }))}
          bind:value={selectedCategoria}
          placeholder="Sublínea..."
          allLabel="Todas las Sublíneas"
          searchPlaceholder="Buscar sublínea..."
          icon={ListFilter}
          disabled={!selectedLinea}
          onchange={handleSearch}
        />
      </div>

      <!-- Input oculto para carga de imágenes -->
      <input
        type="file"
        accept="image/*"
        class="hidden"
        bind:this={fileInputRef}
        onchange={handleFileSelect}
      />
    </div>
  </header>

  <!-- ── CONTENT ─────────────────────────────────────────────────────────── -->
  <main class="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar relative z-10">
    {#if isSearching}
      <div class="h-64 flex items-center justify-center">
        <div class="animate-spin text-brand-500">
          <Loader2 size={32} />
        </div>
      </div>
    {:else if !data.articles || visibleArticles.length === 0}
      <div
        class="h-64 flex flex-col items-center justify-center text-text-muted border-2 border-dashed border-white/5 rounded-3xl glass"
      >
        <Package size={48} class="mb-4 opacity-20" />
        <p class="text-lg font-medium">
          {data.requireBranchSelection
            ? "Seleccione una sede para ver los artículos"
            : "No se encontraron artículos con estos filtros."}
        </p>
      </div>
    {:else}
      <div
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
      >
        {#each visibleArticles as article}
          {@const artCode =
            article.co_art || article.codigo || article.id || ""}
          {@const imageUrl =
            article.campo7 && article.campo7.startsWith("http")
              ? article.campo7
              : null}
          {@const isUploading = uploadingArticleId === artCode}

          <div
            class="glass p-0 rounded-3xl border border-white/5 transition-all hover:shadow-2xl hover:border-brand-500/30 flex flex-col overflow-hidden"
          >
            <!-- Card Image Header -->
            <div
              class="h-48 bg-surface-raised relative flex items-center justify-center group overflow-hidden border-b border-white/5"
            >
              {#if isUploading}
                <div
                  class="absolute inset-0 bg-surface-base/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3 text-brand-500"
                >
                  <Loader2 size={32} class="animate-spin" />
                  <span class="text-sm font-bold animate-pulse"
                    >Subiendo...</span
                  >
                </div>
              {/if}

              {#if article.campo7 && article.campo7.trim() !== ''}
                <img
                  src={article.campo7.startsWith('http') ? article.campo7 : `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/articulos/${article.campo7}`}
                  alt={article.descripcion}
                  class="w-full h-full object-cover"
                  onerror={(e) => (e.currentTarget.src = "")}
                />
              {:else}
                <div
                  class="text-text-muted/30 flex flex-col items-center gap-2"
                >
                  <ImageIcon size={48} />
                  <span class="text-xs font-bold tracking-widest uppercase"
                    >Sin Imagen</span
                  >
                </div>
              {/if}

              <!-- Hover Overlay for Upload -->
              {#if canUpdate && !isUploading}
                <div
                  class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
                >
                  <button
                    onclick={() => triggerFileInput(article)}
                    class="btn-primary rounded-xl px-6 py-2 flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-all text-white font-bold"
                  >
                    <UploadCloud size={18} />
                    {imageUrl ? "Cambiar Imagen" : "Subir Imagen"}
                  </button>
                </div>
              {/if}
            </div>

            <!-- Card Body -->
            <div class="p-5 flex-1 flex flex-col">
              <div class="flex justify-between items-start mb-3">
                <span
                  class="px-2 py-1 rounded-md bg-surface-base border border-border-subtle text-xs font-mono text-text-muted"
                >
                  {artCode}
                </span>
                {#if article.referencia || article.ref}
                  <span
                    class="text-[10px] text-text-muted font-mono bg-white/5 px-2 py-1 rounded"
                  >
                    REF: <span class="font-bold text-text-primary"
                      >{article.referencia || article.ref}</span
                    >
                  </span>
                {/if}
              </div>

              <h3
                class="text-base font-bold leading-tight mb-3 text-text-primary"
              >
                {article.art_des ||
                  article.descripcion ||
                  article.name ||
                  "Sin título"}
              </h3>

              <div
                class="flex items-center gap-4 mt-auto border-t border-white/5 pt-3"
              >
                {#if article.modelo}
                  <div class="flex flex-col">
                    <span
                      class="text-[10px] uppercase font-black tracking-widest text-text-muted"
                      >Modelo</span
                    >
                    <span class="text-xs font-bold text-brand-400"
                      >{article.modelo}</span
                    >
                  </div>
                {/if}
                <div class="flex flex-col">
                  <span
                    class="text-[10px] uppercase font-black tracking-widest text-text-muted"
                    >Unidad</span
                  >
                  <span class="text-xs font-bold text-brand-400"
                    >{article.unidad || article.co_uni || "N/A"}</span
                  >
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>

      <!-- Paginación Simple -->
      {#if data.pagination && data.pagination.totalPages > 1}
        <div class="flex justify-center gap-2 mt-8 pb-8">
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
  </main>
</div>
