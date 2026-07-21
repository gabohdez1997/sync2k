import type { HandleError } from '@sveltejs/kit';

export const handleError: HandleError = ({ error }) => {
	const errorMsg = error instanceof Error ? error.message : String(error);

	if (
		errorMsg.includes('Failed to fetch dynamically imported module') ||
		errorMsg.includes('Importing a module script failed') ||
		errorMsg.includes('_app/immutable')
	) {
		if (typeof window !== 'undefined') {
			window.location.reload();
		}
	}

	return {
		message: 'Ocurrió un error al cargar los componentes. La aplicación se recargará de forma automática.'
	};
};
