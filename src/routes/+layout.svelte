<script lang="ts">
	import '../app.css';
	import { Toaster } from 'svelte-sonner';
	import { initTheme } from '$lib/theme.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		initTheme();
	});
</script>

<Toaster richColors position="top-right" />

{@render children()}
