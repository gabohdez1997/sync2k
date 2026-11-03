// src/routes/dashboard/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/api/agent/tasa');
		if (res.ok) {
			const data = await res.json();
			if (data.success && data.tasa) {
				return {
					tasaBcv: Number(data.tasa)
				};
			}
		}
	} catch (e) {
		// Fallback silencioso: el cliente consultará /api/agent/tasa de forma reactiva
	}

	return {
		tasaBcv: null
	};
};
