<script lang="ts">
  import { fade } from "svelte/transition";
  import { Package, Search, Store, Plus, Edit2, AlertCircle } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import Combobox from "$lib/components/ui/Combobox.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let selectedBranch = $state($page.url.searchParams.get("branch_id") || "");
  let searchTerm = $state($page.url.searchParams.get("search") || "");
  let isSearching = $state(false);

  const canCreate = data.crud?.create ?? false;
  const canUpdate = data.crud?.update ?? false;

  function handleSearch(e?: Event) {
    if (e) e.preventDefault();
    isSearching = true;
    const url = new URL($page.url);
    if (searchTerm) url.searchParams.set("search", searchTerm);
    else url.searchParams.delete("search");

    if (selectedBranch) url.searchParams.set("branch_id", selectedBranch);
    else url.searchParams.delete("branch_id");

    url.searchParams.set("page", "1");
    goto(url.toString(), { keepFocus: true }).finally(() => (isSearching = false));
  }
</script>

<div class="flex flex-col gap-8" in:fade>
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div class="flex flex-col gap-2">
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Package size={40} class="text-brand-500" />
        Maestro de Artículos
      </h1>
      <p class="text-text-muted text-lg">
        Consulta y gestiona el catálogo de productos de Profit Plus.
      </p>
    </div>

    {#if canCreate}
      <button
        onclick={() => goto("/dashboard/purchases/articles/editor")}
        class="h-14 px-8 bg-brand-600 hover:bg-brand-500 border-brand-500/50 shadow-lg shadow-brand-600/20 text-white border rounded-2xl font-bold transition-all active:scale-95 flex items-center gap-3 shrink-0"
      >
        <Plus size={20} />
        Crear Artículo
      </button>
    {/if}
  </div>

  <div class="glass p-4 rounded-3xl border border-white/5 shadow-2xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-center relative z-10">
    {#if data.branches && data.branches.length > 0}
      <div class="col-span-1 md:col-span-1 lg:col-span-3">
        <Combobox
          options={data.branches.map((b: any) => ({
            value: b.id,
            label: b.name,
          }))}
          bind:value={selectedBranch}
          placeholder="Sucursal..."
          allLabel="Todas las Sucursales"
          icon={Store}
          class="w-full h-12"
          onchange={() => handleSearch()}
        />
      </div>
    {/if}

    <div class="col-span-1 md:col-span-1 lg:col-span-9">
      <form class="relative group h-14 w-full" onsubmit={handleSearch}>
        <input
          type="text"
          bind:value={searchTerm}
          placeholder="Buscar código o descripción del artículo..."
          class="w-full h-full bg-surface-base pl-6 pr-14 rounded-2xl border border-white/5 focus:border-brand-500/30 outline-none transition-all font-bold text-sm"
        />
        <button
          type="submit"
          disabled={isSearching}
          class="absolute right-1 top-1 bottom-1 w-12 flex items-center justify-center bg-surface-soft hover:bg-surface-strong text-brand-400 rounded-xl transition-all border border-border-subtle active:scale-95 disabled:opacity-50"
        >
          {#if isSearching}
            <span class="animate-pulse">...</span>
          {:else}
            <Search size={18} />
          {/if}
        </button>
      </form>
    </div>
  </div>

  {#if data.requireBranchSelection}
    <div class="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center gap-4 opacity-70">
      <Store size={48} class="text-text-muted/30" />
      <div>
        <h3 class="text-xl font-bold">Selecciona una Sucursal</h3>
        <p class="text-text-muted mt-2">Usa el filtro para cargar los artículos de una sede.</p>
      </div>
    </div>
  {:else if data.error}
    <div class="p-8 rounded-3xl border border-red-500/20 bg-red-500/5 flex flex-col items-center justify-center text-center gap-4">
      <div class="h-16 w-16 bg-red-500/10 text-red-500 flex items-center justify-center rounded-2xl">
        <AlertCircle size={32} />
      </div>
      <div>
        <h3 class="text-xl font-bold text-red-500">Error Cargando Artículos</h3>
        <p class="text-text-muted mt-2 max-w-xl mx-auto">{data.error}</p>
      </div>
    </div>
  {:else if !data.articles?.length}
    <div class="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center gap-4 opacity-70">
      <Package size={48} class="text-text-muted/30" />
      <div>
        <h3 class="text-xl font-bold">No se encontraron artículos</h3>
        <p class="text-text-muted mt-2">Verifica los filtros o intenta con otra búsqueda.</p>
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {#each data.articles as article}
        <div class="glass p-6 rounded-3xl border border-white/5 transition-all hover:shadow-2xl hover:border-brand-500/30 flex flex-col gap-4">
          <div class="flex justify-between items-start">
            <div class="flex items-center gap-3">
              <div class="h-12 w-12 rounded-2xl bg-brand-500/10 text-brand-500 flex items-center justify-center shrink-0">
                <Package size={24} />
              </div>
              <div>
                <span class="px-2 py-0.5 rounded-md bg-surface-base border border-border-subtle text-xs font-mono text-text-muted">
                  {article.co_art}
                </span>
                <h3 class="text-lg font-bold leading-tight mt-1 truncate max-w-[200px]" title={article.art_des}>
                  {article.art_des}
                </h3>
              </div>
            </div>
            
            {#if canUpdate}
              <button 
                onclick={() => goto(`/dashboard/purchases/articles/editor?id=${encodeURIComponent(article.co_art)}&branch_id=${selectedBranch}`)}
                class="p-2 bg-surface-base hover:bg-brand-500 hover:text-white text-text-muted border border-border-subtle rounded-xl transition-all"
                title="Editar Artículo"
              >
                <Edit2 size={16} />
              </button>
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-2 mt-2">
            <div class="bg-surface-base/40 p-3 rounded-xl border border-white/5">
              <span class="text-[10px] text-text-muted uppercase font-bold block mb-1">Línea</span>
              <span class="font-bold text-sm text-text-base truncate block" title={article.co_lin}>{article.co_lin || 'N/A'}</span>
            </div>
            <div class="bg-surface-base/40 p-3 rounded-xl border border-white/5">
              <span class="text-[10px] text-text-muted uppercase font-bold block mb-1">Precio Principal</span>
              <span class="font-bold text-sm text-brand-400">
                Bs. {Number(article.prec_vta1 || 0).toLocaleString('de-DE', {minimumFractionDigits: 2})}
              </span>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Paginación -->
    {#if data.pagination && data.pagination.totalPages > 1}
      <div class="flex justify-center gap-2 mt-8">
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
        <span class="px-4 py-2 rounded-xl bg-brand-500/10 text-brand-500 font-bold border border-brand-500/20 text-sm">
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
</div>
