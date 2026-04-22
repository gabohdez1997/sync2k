<script lang="ts">
  import { Search } from "lucide-svelte";

  let { 
    value = $bindable(''), 
    placeholder = "Buscar...", 
    isSearching = false, 
    onsubmit,
    className = ""
  } = $props();

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (onsubmit) onsubmit(e);
  }
</script>

<form onsubmit={handleSubmit} class="relative group h-14 {className}">
  <input
    type="text"
    {placeholder}
    bind:value
    class="w-full h-full bg-black pl-6 pr-16 rounded-2xl border border-white/5 focus:border-brand-500/50 outline-none transition-all font-bold text-lg placeholder:font-normal placeholder:text-text-muted"
  />
  <button
    type="submit"
    disabled={isSearching}
    class="absolute right-2 top-2 bottom-2 w-10 flex items-center justify-center bg-white/5 hover:bg-white/10 text-brand-400 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 border border-white/10"
    title="Buscar"
  >
    {#if isSearching}
      <span class="animate-pulse">...</span>
    {:else}
      <Search size={20} />
    {/if}
  </button>
</form>
