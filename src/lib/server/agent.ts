// src/lib/server/agent.ts
import { PRIVATE_AGENT_API_KEY } from '$env/static/private';

export interface AgentResponse<T> {
	success: boolean;
	message?: string;
	data?: T;
	count?: number;
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

	constructor(company: { slug: string; agent_url?: string; agent_api_key?: string }) {
		// Priorizar la URL y API Key configuradas en la empresa, 
		// con fallback al subdominio estándar y la clave privada de .env
		this.baseUrl = company.agent_url 
			? (company.agent_url.endsWith('/api/v1') ? company.agent_url : `${company.agent_url}/api/v1`)
			: `https://${company.slug}.sync2k.com/api/v1`;
			
		this.apiKey = company.agent_api_key || PRIVATE_AGENT_API_KEY;
	}

	private async request<T>(endpoint: string, options: RequestInit = {}): Promise<AgentResponse<T>> {
		const url = `${this.baseUrl}${endpoint}`;
		const headers = {
			'Content-Type': 'application/json',
			'x-api-key': this.apiKey,
			...options.headers
		};

		try {
			// Usamos fetch nativo (disponible en Node 18+ y SvelteKit)
			const response = await fetch(url, { ...options, headers });
			
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				return {
					success: false,
					message: errorData.message || `Error del Agente: ${response.statusText}`
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
	async saveCustomer(customer: any, isNew: boolean = true) {
		return this.request<any>(isNew ? '/clientes' : `/clientes/${customer.co_cli}`, {
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
}
