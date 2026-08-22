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
	private customFetch: typeof fetch | null = null;
	private baseUrl: string;
	private apiKey: string;
	private sqlAuth: string | null = null;
	private branchId: string | null = null;

	constructor(
		company: { slug: string; agent_url?: string; agent_api_key?: string; agent_token?: string }, 
		sqlCreds?: { profit_user?: string | null, profit_pass?: string | null },
		fetchFn?: typeof fetch
	) {
		this.customFetch = fetchFn || null;
		this.branchId = company.slug || null;
		// Priorizar la URL y API Key configuradas en la empresa, 
		// con fallback al subdominio estándar y la clave privada de .env
		let rawUrl = company.agent_url || `https://${company.slug}.sync2k.com`;
		rawUrl = rawUrl.replace(/\/+$/, ''); // Remove any trailing slashes safely

		this.baseUrl = rawUrl.endsWith('/api/v1') 
			? rawUrl 
			: `${rawUrl}/api/v1`;
			
		this.apiKey = company.agent_api_key || company.agent_token || env.PRIVATE_AGENT_API_KEY || '';

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

		if (this.branchId) {
			headers.set('x-branch-id', this.branchId);
		}
		if (this.sqlAuth) {
			headers.set('x-sql-auth', this.sqlAuth);
		}
		if (this.profitUser) {
			headers.set('x-profit-user', this.profitUser);
		}

		const maxRetries = 2;
		let lastError: any = null;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const fetchToUse = this.customFetch || fetch;
				if (!fetchToUse) throw new Error("Fetch method not available");

				console.log(`[AgentClient] -> ${options.method || 'GET'} ${url}`);
				const response = await fetchToUse(url, { 
					cache: 'no-store',
					...options, 
					headers 
				});
				console.log(`[AgentClient] <- ${response.status} ${response.statusText}`);
				
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
				lastError = error;
				console.warn(`[AgentClient] Intento ${attempt}/${maxRetries} fallido en ${url}:`, error.message);
				
				if (attempt < maxRetries) {
					// Pequeña espera antes de reintentar (500ms)
					await new Promise(resolve => setTimeout(resolve, 500));
				}
			}
		}

		console.error(`[AgentClient] Error fatal tras ${maxRetries} intentos en ${url}:`, lastError);
		return {
			success: false,
			message: `No se pudo conectar con el Agente en ${this.baseUrl} tras varios intentos. Verifique que el servidor local de la empresa esté en línea.`
		};
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
	/**
	 * Crea o actualiza un cliente (por defecto broadcast a todas las sedes)
	 */
	async saveCustomer(customer: any, isNew: boolean = true, sedeId: string = '') {
		const sedeParam = sedeId ? `?sede=${encodeURIComponent(sedeId)}` : '';
		const endpoint = isNew
			? `/clientes${sedeParam}`
			: `/clientes/${encodeURIComponent(customer.co_cli)}${sedeParam}`;
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
	 * Prueba la conexión SQL a una sede específica
	 */
	async testConnection(serverId: string) {
		return this.request<any>(`/config/test-connection/${encodeURIComponent(serverId)}`);
	}

	/**
	 * Actualiza la tasa cambiaria (BCV) en el sistema local
	 */
	async updateTasa(tasa: number) {
		return this.request<any>('/catalogos/tasa', {
			method: 'POST',
			body: JSON.stringify({ tasa })
		});
	}

	/**
	 * Obtiene el catálogo de zonas
	 */
	async getZonas() {
		return this.request<any>('/catalogos/zonas');
	}

	/**
	 * Obtiene el catálogo de tipos de cliente
	 */
	async getTiposCliente() {
		return this.request<any>('/catalogos/tipos_cliente');
	}

	/**
	 * Obtiene el listado de proveedores
	 */
	async getSuppliers(page = 1, limit = 50) {
		return this.request<any[]>(`/proveedores?page=${page}&limit=${limit}`);
	}

	/**
	 * Busca proveedores con filtros
	 */
	async searchSuppliers(filters: Record<string, string>, page = 1, limit = 50) {
		const params = new URLSearchParams(filters);
		return this.request<any[]>(`/proveedores/search?${params.toString()}&page=${page}&limit=${limit}`);
	}

	/**
	 * Crea o actualiza un proveedor (por defecto broadcast a todas las sedes)
	 */
	async saveSupplier(supplier: any, isNew: boolean = true, sedeId: string = '') {
		const sedeParam = sedeId ? `?sede=${encodeURIComponent(sedeId)}` : '';
		const endpoint = isNew
			? `/proveedores${sedeParam}`
			: `/proveedores/${encodeURIComponent(supplier.co_prov)}${sedeParam}`;
		return this.request<any>(endpoint, {
			method: isNew ? 'POST' : 'PUT',
			body: JSON.stringify(supplier)
		});
	}

	/**
	 * Elimina (inactiva) un proveedor
	 */
	async deleteSupplier(co_prov: string) {
		return this.request<any>(`/proveedores/${encodeURIComponent(co_prov)}`, {
			method: 'DELETE'
		});
	}

	/**
	 * Obtiene el detalle de un proveedor específico
	 */
	async getSupplier(co_prov: string) {
		return this.request<any>(`/proveedores/${encodeURIComponent(co_prov)}`);
	}

	/**
	 * Obtiene el catálogo de tipos de proveedor
	 */
	async getTiposProveedor() {
		return this.request<any>('/catalogos/tipos_proveedor');
	}

	/**
	 * Obtiene el catálogo de condiciones de pago
	 */
	async getCondicionesPago(sedeId?: string) {
		const query = sedeId ? `?sede_id=${encodeURIComponent(sedeId)}` : '';
		return this.request<any>(`/catalogos/condiciones_pago${query}`);
	}

	/**
	 * Obtiene estadísticas de conteo por sede (artículos, clientes, proveedores)
	 */
	async getBranchStats(sedeId?: string) {
		const query = sedeId ? `?sede_id=${encodeURIComponent(sedeId)}` : '';
		return this.request<any>(`/catalogos/stats${query}`);
	}

	/**
	 * Sincroniza proveedores entre sucursales validando consistencia referencial
	 */
	async syncSuppliers() {
		return this.request<any>('/proveedores/sync', {
			method: 'POST'
		});
	}

	/**
	 * Sincroniza clientes entre sucursales validando consistencia referencial
	 */
	async syncCustomers() {
		return this.request<any>('/clientes/sync', {
			method: 'POST'
		});
	}

	/**
	 * Sincroniza artículos entre sucursales validando consistencia referencial
	 */
	async syncArticles() {
		return this.request<any>('/articulos/sync', {
			method: 'POST'
		});
	}

	/**
	 * Exporta todos los registros de una entidad desde la sede conectada
	 */
	async exportAll(endpoint: string, sedeId?: string) {
		const query = sedeId ? `?sede=${encodeURIComponent(sedeId)}` : '';
		return this.request<any>(`/${endpoint}/export-all${query}`, {
			method: 'GET'
		});
	}

	/**
	 * Importa un lote de registros faltantes hacia la sede conectada
	 */
	async importBatch(endpoint: string, items: any[], sedeId?: string) {
		const query = sedeId ? `?sede=${encodeURIComponent(sedeId)}` : '';
		return this.request<any>(`/${endpoint}/import-batch${query}`, {
			method: 'POST',
			body: JSON.stringify({ items })
		});
	}

	/**
	 * Obtiene el listado de órdenes de compra
	 */
	async getPurchaseOrders(filters: Record<string, string> = {}, page = 1, limit = 12) {
		const params = new URLSearchParams({ ...filters, page: String(page), limit: String(limit) });
		return this.request<any>(`/ordenes-compras?${params.toString()}`);
	}

	/**
	 * Obtiene el detalle de una orden de compra
	 */
	async getPurchaseOrder(doc_num: string, sedeId?: string) {
		const query = sedeId ? `?sede=${encodeURIComponent(sedeId)}` : '';
		return this.request<any>(`/ordenes-compras/${encodeURIComponent(doc_num)}${query}`);
	}

	/**
	 * Guarda o actualiza una orden de compra en la sede destino
	 */
	async savePurchaseOrder(orderData: any, sedeId?: string) {
		const query = sedeId ? `?sede=${encodeURIComponent(sedeId)}` : '';
		return this.request<any>(`/ordenes-compras${query}`, {
			method: 'POST',
			body: JSON.stringify(orderData)
		});
	}

	/**
	 * Elimina una orden de compra
	 */
	async deletePurchaseOrder(doc_num: string, sedeId?: string) {
		const query = sedeId ? `?sede=${encodeURIComponent(sedeId)}` : '';
		return this.request<any>(`/ordenes-compras/${encodeURIComponent(doc_num)}${query}`, {
			method: 'DELETE'
		});
	}

	/**
	 * Anula una orden de compra
	 */
	async anularPurchaseOrder(doc_num: string, sedeId?: string) {
		const query = sedeId ? `?sede=${encodeURIComponent(sedeId)}` : '';
		return this.request<any>(`/ordenes-compras/${encodeURIComponent(doc_num)}/anular${query}`, {
			method: 'POST'
		});
	}
}

