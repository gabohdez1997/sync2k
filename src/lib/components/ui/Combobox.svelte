<!-- src/lib/components/ui/Combobox.svelte -->
<script lang="ts">
  import { ChevronDown, Search, X } from 'lucide-svelte';
  import { tick } from 'svelte';

  interface Option {
    value: string;
    label: string;
  }

  interface Props {
    options: Option[];
    value?: string;
    placeholder?: string;
    allLabel?: string;
    icon?: any;
    onchange?: (value: string) => void;
    class?: string;
    id?: string;
    name?: string;
  }

  let {
    options = [],
    value = $bindable(''),
    placeholder = 'Seleccionar...',
    allLabel = '',
    icon: Icon = null,
    onchange,
    class: extraClass = '',
    id = '',
    name = ''
  }: Props = $props();

  let isOpen = $state(false);
  let searchTerm = $state('');
  let inputEl: HTMLInputElement | null = $state(null);
  let containerEl: HTMLDivElement | null = $state(null);
  let activeIndex = $state(-1);

  const selectedLabel = $derived(
    options.find(o => o.value === value)?.label ?? ''
  );

  const filtered = $derived(
    searchTerm.trim() === ''
      ? options
      : options.filter(o =>
          o.label.toLowerCase().includes(searchTerm.toLowerCase())
        )
  );

  async function open() {
    isOpen = true;
    activeIndex = filtered.findIndex(o => o.value === value);
    await tick();
    inputEl?.focus();
  }

  function close() {
    isOpen = false;
    searchTerm = '';
    activeIndex = -1;
  }

  function select(option: Option) {
    value = option.value;
    onchange?.(option.value);
    close();
  }

  function clear(e: MouseEvent) {
    e.stopPropagation();
    value = '';
    onchange?.('');
    close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    const total = filtered.length + (allLabel ? 1 : 0);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, total - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (allLabel && activeIndex === 0) {
          value = ''; onchange?.(''); close();
        } else {
          const idx = allLabel ? activeIndex - 1 : activeIndex;
          if (idx >= 0 && filtered[idx]) select(filtered[idx]);
        }
        break;
      case 'Escape':
        close();
        break;
    }
  }

  function handleClickOutside(e: MouseEvent) {
    if (containerEl && !containerEl.contains(e.target as Node)) {
      close();
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div bind:this={containerEl} class="relative {extraClass}" {id}>
  {#if name}<input type="hidden" {name} {value} />{/if}
  <!-- Trigger button -->
  <button
    type="button"
    onclick={() => (isOpen ? close() : open())}
    class="w-full h-14 bg-surface-base/80 rounded-2xl border transition-all font-bold text-sm cursor-pointer hover:bg-surface-soft flex items-center gap-0 pr-4 text-left
      {isOpen ? 'border-brand-500/50 ring-1 ring-brand-500/20' : 'border-border-subtle'}
      {value ? 'text-brand-500' : 'text-text-muted'}"
  >
    {#if Icon}
      <span class="flex-shrink-0 pl-4 pr-2.5 text-brand-400">
        <Icon size={18} />
      </span>
    {:else}
      <span class="pl-4"></span>
    {/if}

    <span class="flex-1 truncate">
      {selectedLabel || placeholder}
    </span>

    {#if value}
      <button
        type="button"
        onclick={clear}
        class="flex-shrink-0 p-1 mr-1 text-text-muted hover:text-red-400 rounded-lg hover:bg-red-400/10 transition-colors"
        title="Limpiar"
      >
        <X size={14} />
      </button>
    {/if}

    <span class="flex-shrink-0 text-text-muted transition-transform duration-200 {isOpen ? 'rotate-180' : ''}">
      <ChevronDown size={16} />
    </span>
  </button>

  <!-- Dropdown panel (position: absolute, elevado con z-[200]) -->
  {#if isOpen}
    <div
      class="absolute z-[200] mt-2 w-full bg-surface-raised border border-border-subtle rounded-2xl shadow-2xl shadow-black/40 overflow-hidden"
      style="min-width: 220px;"
    >
      <!-- Search input -->
      <div class="p-2 border-b border-border-subtle relative">
        <Search size={14} class="absolute left-5 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          bind:this={inputEl}
          bind:value={searchTerm}
          type="text"
          placeholder="Buscar..."
          autocomplete="off"
          class="w-full h-9 bg-surface-soft border border-border-subtle rounded-xl pl-8 pr-3 text-sm outline-none focus:border-brand-500/40 transition-colors placeholder:text-text-muted/50 text-text-base"
        />
      </div>

      <!-- Options list -->
      <ul class="max-h-60 overflow-y-auto py-1 custom-scrollbar">
        {#if allLabel}
          <li>
            <button
              type="button"
              onclick={() => { value = ''; onchange?.(''); close(); }}
              onmouseenter={() => (activeIndex = 0)}
              class="w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2
                {!value
                  ? 'bg-brand-500/20 text-brand-300 font-bold'
                  : activeIndex === 0
                    ? 'bg-white/5 text-text-base'
                    : 'text-text-muted hover:bg-white/5 hover:text-text-base'}"
            >
              <span class="w-1.5 h-1.5 rounded-full {!value ? 'bg-brand-400' : ''} flex-shrink-0"></span>
              <span class="truncate italic opacity-80">{allLabel}</span>
            </button>
          </li>
        {/if}

        {#if filtered.length === 0}
          <li class="px-4 py-3 text-sm text-text-muted/50 italic text-center">
            Sin resultados para "{searchTerm}"
          </li>
        {:else}
          {#each filtered as option, i}
            {@const rowIndex = allLabel ? i + 1 : i}
            <li>
              <button
                type="button"
                onclick={() => select(option)}
                onmouseenter={() => (activeIndex = rowIndex)}
                class="w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2
                  {value === option.value
                    ? 'bg-brand-500/20 text-brand-500 font-bold'
                    : activeIndex === rowIndex
                      ? 'bg-surface-soft text-text-base'
                      : 'text-text-muted hover:bg-surface-soft hover:text-text-base'}"
              >
                <span class="w-1.5 h-1.5 rounded-full {value === option.value ? 'bg-brand-400' : ''} flex-shrink-0"></span>
                <span class="truncate">{option.label}</span>
              </button>
            </li>
          {/each}
        {/if}
      </ul>

      <!-- Footer -->
      <div class="px-4 py-2 border-t border-border-subtle flex items-center justify-between">
        <span class="text-[10px] text-text-muted/50 font-mono">
          {filtered.length} de {options.length} opciones
        </span>
        {#if searchTerm}
          <button
            type="button"
            onclick={() => { searchTerm = ''; inputEl?.focus(); }}
            class="text-[10px] text-brand-400/70 hover:text-brand-400 transition-colors"
          >
            Limpiar búsqueda
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>
