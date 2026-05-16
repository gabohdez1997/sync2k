<script lang="ts">
  import { enhance } from '$app/forms';
  import { fade, fly } from 'svelte/transition';
  import { toast } from 'svelte-sonner';
  import {
    Tag,
    Plus,
    Search,
    Pencil,
    Save,
    X,
    Loader2,
    Hash,
    Type,
    AlertTriangle
  } from 'lucide-svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData, form: ActionData } = $props();

  let categories = $derived((data as any).categories ?? []);
  let crud = $derived((data as any).crud ?? { create: false, update: false });

  // ── Search ──
  let searchQuery = $state('');
  let filteredCategories = $derived(
    categories.filter((c: any) =>
      c.co_cat?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.cat_des?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  // ── Modal State ──
  let showModal = $state(false);
  let isNew = $state(true);
  let modalCode = $state('');
  let modalDesc = $state('');
  let saving = $state(false);

  function openCreate() {
    isNew = true;
    modalCode = '';
    modalDesc = '';
    showModal = true;
  }

  function openEdit(cat: any) {
    isNew = false;
    modalCode = cat.co_cat?.trim() || '';
    modalDesc = cat.cat_des?.trim() || '';
    showModal = true;
  }

  function closeModal() {
    showModal = false;
  }

  // ── Feedback ──
  $effect(() => {
    if (form) {
      if ('success' in form && form.success) {
        toast.success('Categoría guardada exitosamente en todas las sedes.');
        if ((form as any).warning) toast.warning((form as any).warning);
        showModal = false;
      } else if ('error' in form && form.error) {
        toast.error(form.error as string);
      }
    }
  });
</script>

<div class="space-y-8" in:fade>
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Tag size={40} class="text-brand-500" />
        Categorías de Artículos
      </h1>
      <p class="text-text-muted mt-2 text-lg">Gestiona las categorías de artículos en todas las sedes.</p>
    </div>
    {#if crud.create}
      <button
        onclick={openCreate}
        class="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-2xl font-bold hover:shadow-lg hover:shadow-brand-500/30 transition-all active:scale-95"
      >
        <Plus size={20} />
        Nueva Categoría
      </button>
    {/if}
  </div>

  <!-- Search -->
  <div class="relative max-w-xl">
    <Search size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Buscar por código o descripción..."
      class="w-full bg-surface-raised border border-border-subtle rounded-2xl pl-12 pr-4 py-3 text-text-base focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all placeholder:text-text-muted/40"
    />
  </div>

  <!-- Stats -->
  <div class="flex items-center gap-6">
    <div class="px-5 py-3 bg-surface-raised border border-border-subtle rounded-2xl flex items-center gap-3">
      <div class="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
        <Tag size={20} />
      </div>
      <div>
        <p class="text-2xl font-black text-text-base">{categories.length}</p>
        <p class="text-[10px] uppercase font-bold tracking-widest text-text-muted">Total Categorías</p>
      </div>
    </div>
  </div>

  <!-- Table -->
  <div class="bg-surface-raised rounded-[32px] border border-border-subtle overflow-hidden shadow-xl">
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-surface-base/50">
            <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-subtle">Código</th>
            <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-subtle">Descripción</th>
            {#if crud.update}
              <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-subtle text-right">Acciones</th>
            {/if}
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle">
          {#each filteredCategories as cat (cat.co_cat)}
            <tr class="hover:bg-brand-500/5 transition-colors group" in:fade={{ duration: 150 }}>
              <td class="px-8 py-5">
                <span class="font-mono text-sm font-bold text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg">{cat.co_cat?.trim()}</span>
              </td>
              <td class="px-8 py-5">
                <span class="text-sm font-medium text-text-base">{cat.cat_des?.trim()}</span>
              </td>
              {#if crud.update}
                <td class="px-8 py-5 text-right">
                  <button
                    onclick={() => openEdit(cat)}
                    class="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-white/5 hover:bg-brand-500/10 text-text-muted hover:text-brand-400 transition-all active:scale-95"
                    title="Editar"
                  >
                    <Pencil size={16} />
                  </button>
                </td>
              {/if}
            </tr>
          {:else}
            <tr>
              <td colspan="3" class="px-8 py-20 text-center text-text-muted opacity-50 italic">
                No se encontraron categorías.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- ═══ MODAL ═══ -->
{#if showModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" in:fade>
    <div
      class="absolute inset-0 bg-black/80 backdrop-blur-md"
      onclick={closeModal}
      onkeydown={(e) => e.key === 'Escape' && closeModal()}
      role="button"
      tabindex="-1"
    ></div>

    <div
      class="glass w-full max-w-lg rounded-[32px] border border-white/10 shadow-2xl relative z-10 overflow-hidden"
      in:fly={{ y: 20, duration: 300 }}
    >
      <!-- Header -->
      <div class="p-8 border-b border-white/5 bg-brand-500/5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Tag size={24} />
            </div>
            <div>
              <h2 class="text-2xl font-black tracking-tight">{isNew ? 'Nueva Categoría' : 'Editar Categoría'}</h2>
              <p class="text-text-muted text-sm">{isNew ? 'Se creará en todas las sedes' : `Editando: ${modalCode}`}</p>
            </div>
          </div>
          <button onclick={closeModal} class="p-3 hover:bg-white/10 rounded-full text-text-muted transition-colors">
            <X size={24} />
          </button>
        </div>
      </div>

      <!-- Form -->
      <form
        method="POST"
        action="?/saveCategory"
        use:enhance={() => {
          saving = true;
          return async ({ update }) => {
            await update();
            saving = false;
          };
        }}
      >
        <input type="hidden" name="is_new" value={isNew ? 'true' : 'false'} />

        <div class="p-8 space-y-6">
          <!-- Código -->
          <div class="space-y-2">
            <label for="co_cat" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1 flex items-center gap-1.5">
              <Hash size={12} />
              Código de Categoría
            </label>
            <input
              id="co_cat"
              name="co_cat"
              type="text"
              bind:value={modalCode}
              maxlength="6"
              required
              disabled={!isNew}
              placeholder="Ej: 101001"
              class="w-full h-14 bg-surface-base border border-border-subtle rounded-2xl px-5 text-sm font-bold focus:outline-none focus:border-brand-500/50 transition-all placeholder:text-text-muted/40 disabled:opacity-50 disabled:cursor-not-allowed font-mono tracking-wider uppercase"
            />
          </div>

          <!-- Descripción -->
          <div class="space-y-2">
            <label for="cat_des" class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1 flex items-center gap-1.5">
              <Type size={12} />
              Descripción
            </label>
            <input
              id="cat_des"
              name="cat_des"
              type="text"
              bind:value={modalDesc}
              maxlength="60"
              required
              placeholder="Ej: ALAMBRON ESTRIADO"
              class="w-full h-14 bg-surface-base border border-border-subtle rounded-2xl px-5 text-sm font-bold focus:outline-none focus:border-brand-500/50 transition-all placeholder:text-text-muted/40 uppercase"
            />
          </div>

          {#if !isNew}
            <div class="p-4 bg-brand-500/5 rounded-2xl border border-brand-500/10 flex gap-3">
              <AlertTriangle size={18} class="text-brand-500 shrink-0 mt-0.5" />
              <p class="text-[11px] text-text-muted leading-relaxed">
                El código de categoría <strong>no es editable</strong>. Solo se puede modificar la descripción. Los cambios se propagarán a <strong>todas las sedes</strong>.
              </p>
            </div>
          {/if}
        </div>

        <!-- Footer -->
        <div class="p-8 border-t border-white/5 bg-black/20 flex justify-end gap-3">
          <button
            type="button"
            onclick={closeModal}
            class="px-6 py-3 rounded-xl font-bold bg-white/5 hover:bg-white/10 transition-all text-text-muted border border-transparent hover:border-white/10"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !modalCode || !modalDesc}
            class="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-xl font-bold hover:shadow-lg hover:shadow-brand-500/30 transition-all active:scale-95 disabled:opacity-60"
          >
            {#if saving}
              <Loader2 size={18} class="animate-spin" />
            {:else}
              <Save size={18} />
            {/if}
            {isNew ? 'Crear Categoría' : 'Guardar Cambios'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
