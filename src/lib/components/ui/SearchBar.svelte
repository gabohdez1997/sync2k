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
  <Search
    class="absolute left-6 top-1/2 -translate-y-1/2 text-brand-500"
    size={20}
  />
  <input
    type="text"
    {placeholder}
    bind:value
    class="w-full h-full bg-black pl-14 pr-28 rounded-full border border-white/5 focus:border-brand-500/50 outline-none transition-all font-bold text-lg placeholder:font-normal placeholder:text-text-muted"
  />
  <button
    type="submit"
    disabled={isSearching}
    class="absolute right-2 top-2 bottom-2 px-6 bg-white/5 hover:bg-white/10 text-white rounded-full text-sm font-bold transition-all active:scale-95 disabled:opacity-50 border border-white/10"
  >
    {isSearching ? "..." : "Buscar"}
  </button>
</form>
