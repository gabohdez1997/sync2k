<!-- src/routes/dashboard/cash/credits/+page.svelte -->
<script lang="ts">
  import { RotateCcw, Search, Filter, Plus } from 'lucide-svelte';
  let { data } = $props();
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <RotateCcw size={40} class="text-red-500" />
        {data.title}
      </h1>
      <p class="text-text-muted mt-2 text-lg">Gestión de devoluciones de mercancía y créditos.</p>
    </div>
  </div>

  <div class="glass p-12 rounded-[40px] border border-white/5 flex flex-col items-center justify-center text-center space-y-4 min-h-[400px]">
    <div class="h-20 w-20 rounded-3xl bg-white/5 flex items-center justify-center text-text-muted/20">
      <RotateCcw size={48} />
    </div>
    <h2 class="text-2xl font-bold text-text-muted">Área en construcción</h2>
    <p class="text-text-muted/60 max-w-sm">Este módulo requiere validación de inventario en tiempo real.</p>
  </div>
</div>
