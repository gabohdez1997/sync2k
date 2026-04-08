// src/lib/server/agent.ts
import { env } from '$env/dynamic/private';

export interface AgentResponse<T> {
	success: boolean;
	message?: string;
	data?: T;
	count?: number;
	details?: any;
	pagination?: {
		total: number;
		pages: number;
		currentPage: number;
		limit: number;
	};
}

/**
 * Cliente para interactuar con los Agentes Sync2k instalados en los servidores locales.
 */
export class AgentClient {
	private baseUrl: string;
	private apiKey: string;
	private sqlAuth: string | null = null;
	private profitUser: string | null = null;

	constructor(
		company: { slug: string; agent_url?: string; agent_api_key?: string }, 
		sqlCreds?: { profit_user?: string | null, profit_pass?: string | null }
	) {
		// Priorizar la URL y API Key configuradas en la empresa, 
		// con fallback al subdominio estándar y la clave privada de .env
		let rawUrl = company.agent_url || `https://${company.slug}.sync2k.com`;
		rawUrl = rawUrl.replace(/\/+$/, ''); // Remove any trailing slashes safely

		this.baseUrl = rawUrl.endsWith('/api/v1') 
			? rawUrl 
			: `${rawUrl}/api/v1`;
			
		this.apiKey = company.agent_api_key || env.PRIVATE_AGENT_API_KEY || '';

		if (sqlCreds?.profit_user && sqlCreds?.profit_pass) {
			this.sqlAuth = Buffer.from(`${sqlCreds.profit_user}:${sqlCreds.profit_pass}`).toString('base64');
		}

		// Guardar el código de usuario Profit para el header de auditoría
		this.profitUser = sqlCreds?.profit_user || null;
	}

	public async request<T>(endpoint: string, options: RequestInit = {}): Promise<AgentResponse<T>> {
		const url = `${this.baseUrl}${endpoint}`;
		const headers = new Headers(options.headers || {});
		if (!headers.has('Content-Type')) {
			headers.set('Content-Type', 'application/json');
		}
		headers.set('x-api-key', this.apiKey);

		if (this.sqlAuth) {
			headers.set('x-sql-auth', this.sqlAuth);
		}
		if (this.profitUser) {
			headers.set('x-profit-user', this.profitUser);
		}

		try {
			// Usamos fetch nativo (disponible en Node 18+ y SvelteKit)
			const response = await fetch(url, { ...options, headers });
			
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				return {
					success: false,
					message: errorData.message || `Error del Agente: ${response.statusText}`,
					details: errorData.results || errorData.error
				};
			}
			
			const data = await response.json();

			// Mapear campos de paginación si existen en el top-level
			if (data.total_items !== undefined) {
				data.pagination = {
					total: data.total_items,
					pages: data.total_pages,
					currentPage: data.page,
					limit: data.limit
				};
			}
			
			return data;
		} catch (error: any) {
			console.error(`Error calling agent at ${url}:`, error);
			return {
				success: false,
				message: `No se pudo conectar con el Agente en ${this.baseUrl}. Verifique que el servidor local de la empresa esté en línea.`
			};
		}
	}

	/**
	 * Obtiene el listado de clientes
	 */
	async getCustomers(page = 1, limit = 50) {
		return this.request<any[]>(`/clientes?page=${page}&limit=${limit}`);
	}

	/**
	 * Busca clientes con filtros
	 */
	async searchCustomers(filters: Record<string, string>, page = 1, limit = 50) {
		const params = new URLSearchParams(filters);
		return this.request<any[]>(`/clientes/search?${params.toString()}&page=${page}&limit=${limit}`);
	}

	/**
	 * Crea o actualiza un cliente
	 */
	async saveCustomer(customer: any, isNew: boolean = true, sedeId: string = '') {
		// Al CREAR: enviar a la sede seleccionada (o broadcast si no hay sede)
		// Al EDITAR: broadcast a TODAS las sedes para mantener consistencia
		const sedeParam = (isNew && sedeId) ? `?sede=${encodeURIComponent(sedeId)}` : '';
		const endpoint = isNew
			? `/clientes${sedeParam}`
			: `/clientes/${encodeURIComponent(customer.co_cli)}`;
		return this.request<any>(endpoint, {
			method: isNew ? 'POST' : 'PUT',
			body: JSON.stringify(customer)
		});
	}

	/**
	 * Elimina (inactiva) un cliente
	 */
	async deleteCustomer(co_cli: string) {
		return this.request<any>(`/clientes/${co_cli}`, {
			method: 'DELETE'
		});
	}

	/**
	 * Obtiene el detalle de un cliente específico
	 */
	async getCustomer(co_cli: string) {
		return this.request<any>(`/clientes/${co_cli}`);
	}

	/**
	 * Módulo de configuración de servidores (Dashboard -> Sucursales)
	 */
	async getDatabaseConfig() {
		return this.request<any>('/config/database');
	}

	/**
	 * Obtiene el catálogo de zonas
	 */
	async getZonas() {
		return this.request<any>('/catalogos/zonas');
	}
}
