<script lang="ts">
	import '../app.css';
	import { Toaster } from 'svelte-sonner';
	import { initTheme } from '$lib/theme.svelte';
	import { onMount } from 'svelte';

	let { data, children } = $props();

	onMount(() => {
		initTheme();
	});
</script>

<svelte:head>
	<title>{data.systemSettings?.app_title || 'GalpeApp'}</title>
	{#if data.systemSettings?.app_logo_url}
		<link rel="icon" href={data.systemSettings.app_logo_url} />
		<link rel="apple-touch-icon" href={data.systemSettings.app_logo_url} />
	{/if}
</svelte:head>

<Toaster richColors position="top-right" />

{@render children()}
