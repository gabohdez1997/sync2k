<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { X } from "lucide-svelte";
  import { onMount } from "svelte";

  let { 
    isOpen = $bindable(false), 
    imageUrl = "", 
    altText = "Imagen a pantalla completa" 
  } = $props();

  // Cerrar con la tecla ESC
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && isOpen) {
      isOpen = false;
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-8 cursor-zoom-out"
    in:fade={{ duration: 200 }}
    out:fade={{ duration: 200 }}
    onclick={() => (isOpen = false)}
  >
    <button
      class="absolute top-4 right-4 sm:top-6 sm:right-6 text-white/70 hover:text-white bg-black/20 hover:bg-black/50 p-2 rounded-full transition-all"
      onclick={(e) => {
        e.stopPropagation();
        isOpen = false;
      }}
      aria-label="Cerrar"
    >
      <X size={28} />
    </button>

    <img
      src={imageUrl}
      alt={altText}
      class="max-w-full max-h-full object-contain drop-shadow-2xl rounded-lg cursor-default select-none"
      in:scale={{ duration: 300, start: 0.9, opacity: 0, easing: (t) => t * (2 - t) }}
      onclick={(e) => e.stopPropagation()}
    />
  </div>
{/if}
