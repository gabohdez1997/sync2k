<script lang="ts">
	import '../app.css';
	import { Toaster } from 'svelte-sonner';
	import { initTheme } from '$lib/theme.svelte';
	import { onMount } from 'svelte';

	let { data, children } = $props();

	onMount(() => {
		initTheme();

		const handleChunkError = (event: ErrorEvent | PromiseRejectionEvent) => {
			const errorMsg = 'reason' in event ? event.reason?.message : event.message;
			if (
				errorMsg &&
				(errorMsg.includes('Failed to fetch dynamically imported module') ||
					errorMsg.includes('Importing a module script failed') ||
					errorMsg.includes('_app/immutable'))
			) {
				console.warn('Nueva versión detectada en producción. Recargando aplicación...');
				window.location.reload();
			}
		};

		window.addEventListener('error', handleChunkError);
		window.addEventListener('unhandledrejection', handleChunkError);

		return () => {
			window.removeEventListener('error', handleChunkError);
			window.removeEventListener('unhandledrejection', handleChunkError);
		};
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
