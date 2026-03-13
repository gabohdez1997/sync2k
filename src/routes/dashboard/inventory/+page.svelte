<!-- src/routes/dashboard/inventory/+page.svelte -->
<script lang="ts">
	let { data } = $props();
</script>

<div class="space-y-6">
	<div>
		<h2 class="text-2xl font-bold text-white">Inventario de Stock</h2>
		<p class="text-zinc-400">Control de productos y niveles de existencias.</p>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
		{#each data.products as product}
			<div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3 hover:border-zinc-700 transition">
				<div class="flex justify-between items-start">
					<span class="text-xs font-medium text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded-full">
						{product.sku}
					</span>
					<span class="text-lg font-bold text-white">${product.price}</span>
				</div>
				<h3 class="text-sm font-semibold text-white truncate">{product.name}</h3>
				<div class="flex items-center justify-between border-t border-zinc-800 pt-3">
					<span class="text-xs text-zinc-500">Existencias</span>
					<span class="text-sm font-bold {product.stock > 0 ? 'text-zinc-200' : 'text-red-400'}">
						{product.stock} un.
					</span>
				</div>
				{#if product.stock === 0}
					<p class="text-[10px] text-red-500 font-medium">⚠️ Sin Stock / Reordenar</p>
				{/if}
			</div>
		{/each}
	</div>
</div>
