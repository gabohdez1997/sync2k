<script lang="ts">
  // Standalone layout for the labels/print page.
  // This completely overrides the dashboard layout so that NO sidebar,
  // top bar, or bottom mobile nav is rendered — only the page content.
  let { children }: { children: any } = $props();
</script>

{@render children?.()}

<style>
  /* Reset any global body padding/margin that the dashboard layout might inject */
  :global(body) {
    margin: 0;
    padding: 0;
    background: #f4f4f7;
  }
</style>
