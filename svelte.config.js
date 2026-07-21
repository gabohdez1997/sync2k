import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// vitePreprocess needed for <style> processing in Svelte components
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter(),
		version: {
			pollInterval: 60000
		}
	},

	vitePlugin: {
		dynamicCompileOptions: ({ filename }) =>
			filename.includes('node_modules') ? undefined : { runes: true }
	}
};

export default config;
