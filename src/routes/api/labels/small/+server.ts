// src/routes/api/labels/small/+server.ts
// Returns a self-contained HTML page with printable small labels (6cm x 3cm)
// grouped in a 3x7 grid on Letter size sheets (21 labels per sheet).

import type { RequestHandler } from './$types';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ url, locals }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return htmlError('No autorizado. Por favor inicia sesión.', 401);
  }

  try {
    // ── 1. Resolve branch ───────────────────────────────────────────────────
    const branchId = url.searchParams.get('branch_id');
    if (!branchId) return htmlError('Sede no especificada.');

    const { data: dbBranch, error: branchErr } = await supabaseAdmin
      .from('branches')
      .select('id, name, agent_url, agent_token, logo_url')
      .eq('id', branchId)
      .single();

    if (branchErr || !dbBranch?.agent_url) {
      return htmlError('No se encontró la configuración del Agente para esta sede.');
    }

    const agentClient = new AgentClient({
      slug: dbBranch.id,
      agent_url: dbBranch.agent_url,
      agent_api_key: dbBranch.agent_token
    }, profile || undefined);

    const warehouseId = url.searchParams.get('co_alma');
    const coArtsParam = url.searchParams.get('co_arts');

    let articles: any[] = [];

    if (coArtsParam) {
      // Selection mode: fetch specific codes in parallel
      const codes = coArtsParam.split(',').map((c) => c.trim()).filter(Boolean);
      const baseP = new URLSearchParams();
      if (branchId) { baseP.set('sede_id', branchId); baseP.set('sede', branchId); }
      if (warehouseId) baseP.set('co_alma', warehouseId);

      const results = await Promise.allSettled(
        codes.map((code) => {
          const p = new URLSearchParams(baseP);
          p.set('co_art', code);
          p.set('limit', '1');
          return agentClient.request<any>(`/articulos/search?${p.toString()}`);
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const res = r.value as any;
          const items = res?.data?.items || res?.items || res?.data || (Array.isArray(res) ? res : []);
          if (Array.isArray(items) && items.length > 0) articles.push(items[0]);
        }
      }
    } else {
      // Filter mode: fetch up to 500
      const searchTerm = url.searchParams.get('search') || '';
      const lineaId = url.searchParams.get('linea') || '';
      const categoriaId = url.searchParams.get('categoria') || '';
      const ubicacionId = url.searchParams.get('co_ubicacion');

      const params = new URLSearchParams();
      params.set('limit', '500');
      if (searchTerm) {
        const isCode = /^\d/.test(searchTerm.trim());
        params.set(isCode ? 'co_art' : 'descripcion', searchTerm);
      }
      if (lineaId) params.set('linea', lineaId);
      if (categoriaId) params.set('categoria', categoriaId);
      if (branchId) { params.set('sede_id', branchId); params.set('sede', branchId); }
      if (warehouseId) params.set('co_alma', warehouseId);
      if (ubicacionId) params.set('co_ubicacion', ubicacionId);

      const endpoint =
        searchTerm || lineaId || categoriaId || ubicacionId
          ? `/articulos/search?${params.toString()}`
          : `/articulos?${params.toString()}`;

      const resData = await agentClient.request<any>(endpoint);
      const rawItems =
        (resData as any).data?.items ||
        (resData as any).items ||
        (resData as any).data ||
        (Array.isArray(resData) ? resData : []);
      articles = Array.isArray(rawItems) ? rawItems : [];
    }

    // ── 3. Generate HTML ───────────────────────────────────────────────────
    const companyName = dbBranch.name || 'Galpe';
    const companyLogo: string = dbBranch.logo_url || '';

    const html = buildHtml(articles, companyName, companyLogo);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (e: any) {
    console.error('[API/LABELS/SMALL] Error:', e);
    return htmlError(`Error interno: ${e.message}`);
  }
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function htmlError(msg: string, status = 400): Response {
  return new Response(
    `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Error</title>
     <style>body{font-family:sans-serif;padding:3rem;background:#fff0f0;color:#c00}</style></head>
     <body><h2>⚠️ ${esc(msg)}</h2><button onclick="window.close()">Cerrar</button></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function qrUrl(code: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(code)}`;
}

function esc(str: string) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(articles: any[], companyName: string, companyLogo: string): string {
  // Chunk articles into arrays of 21 to perfectly fit on a 3x7 grid per Letter page
  const sheets: any[][] = [];
  for (let i = 0; i < articles.length; i += 21) {
    sheets.push(articles.slice(i, i + 21));
  }

  const sheetsHtml = sheets
    .map((sheetArticles) => {
      const labelsHtml = sheetArticles
        .map((article) => {
          const code = esc(article.co_art || article.codigo || article.id || '');
          const name = esc(article.art_des || article.descripcion || article.name || 'SIN DESCRIPCIÓN');
          const logoHtml = companyLogo
            ? `<img src="${companyLogo}" alt="Logo" class="logo-img" />`
            : `<span class="logo-text">${esc(companyName)}</span>`;

          return `
          <div class="label-box">
            <!-- Top Row: Description (Full Width) -->
            <div class="label-desc">
              ${name}
            </div>
            
            <!-- Bottom Row: Split horizontally -->
            <div class="label-bottom">
              <!-- Bottom Left: Logo + Code -->
              <div class="bottom-left">
                <div class="logo-area">
                  ${logoHtml}
                </div>
                <div class="code-area">
                  <span class="code-value">${code}</span>
                </div>
              </div>
              
              <!-- Bottom Right: QR Code -->
              <div class="bottom-right">
                <img src="${qrUrl(article.co_art || article.codigo || article.id || '')}" alt="QR" class="qr-img" />
              </div>
            </div>
          </div>`;
        })
        .join('');

      return `
      <div class="sheet">
        <div class="label-grid">
          ${labelsHtml}
        </div>
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Etiquetas Pequeñas (6x3cm) — ${esc(companyName)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #f4f4f7;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    }

    .sheet {
      background: white;
      box-shadow: 0 0 50px rgba(0,0,0,.12);
      width: 21.59cm;
      height: 27.94cm;
      margin: 40px auto;
      padding: 1.5cm;
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
    }

    .label-grid {
      display: grid;
      grid-template-columns: repeat(3, 6cm);
      grid-template-rows: repeat(7, 3cm);
      gap: 0.29cm;
      justify-content: center;
      align-content: center;
      height: 100%;
    }

    .label-box {
      width: 6cm;
      height: 3cm;
      border: 1px solid #000;
      background: white;
      padding: 5px 8px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      position: relative;
    }

    .label-desc {
      font-size: 8px;
      font-weight: 800;
      line-height: 1.1;
      text-transform: uppercase;
      text-align: center;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      height: 0.9cm;
      color: #000;
      margin-bottom: 2px;
    }

    .label-bottom {
      display: flex;
      height: 1.8cm;
      justify-content: space-between;
      align-items: stretch;
    }

    .bottom-left {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-width: 0;
      padding-right: 4px;
    }

    .logo-area {
      height: 2.5cm;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      overflow: hidden;
    }

    .logo-img {
      max-height: 2.5cm;
      margin-top: 0.3cm;
      max-width: 100%;
      object-fit: contain;
    }

    .logo-text {
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
      color: #333;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .code-area {
      height: 0.9cm;
      display: flex;
      align-items: flex-end;
      justify-content: flex-start;
    }

    .code-value {
      font-size: 11px;
      font-weight: 950;
      letter-spacing: 0.3px;
      color: #000;
      font-family: "Courier New", Courier, monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .bottom-right {
      width: 1.7cm;
      height: 1.7cm;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-left: 2px;
      align-self: center;
    }

    .qr-img {
      width: 1.7cm;
      height: 1.7cm;
      display: block;
      image-rendering: pixelated;
    }

    /* Toolbar */
    .toolbar {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      display: flex;
      gap: 1rem;
      z-index: 999;
      pointer-events: auto;
    }

    .btn {
      border: none;
      cursor: pointer;
      border-radius: 1rem;
      padding: 1rem 2rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #fff;
      transition: all 0.2s;
    }

    .btn:active {
      transform: scale(0.95);
    }

    .btn-print {
      background: #d97706; /* Amber-600 */
      font-weight: 900;
      box-shadow: 0 25px 50px -12px rgba(217,119,6,0.4);
    }

    .btn-print:hover {
      background: #b45309;
    }

    .btn-close {
      background: rgba(31, 41, 55, 0.8);
      backdrop-filter: blur(12px);
      font-weight: 700;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    }

    .btn-close:hover {
      background: rgba(55, 65, 81, 1);
    }

    /* ──── Print Layout ──── */
    @media print {
      body {
        background: white !important;
      }

      .toolbar {
        display: none !important;
      }

      .sheet {
        width: 21.59cm !important;
        height: 27.94cm !important;
        margin: 0 !important;
        padding: 1.5cm !important;
        box-shadow: none !important;
        background: transparent !important;
      }

      .label-box {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      @page {
        size: letter;
        margin: 0;
      }
    }
  </style>
</head>
<body>
  ${sheetsHtml}
  <div class="toolbar">
    <button class="btn btn-print" onclick="window.print()">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14" rx="1"/><path d="M6 8V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/></svg>
      IMPRIMIR ETIQUETAS (6x3)
    </button>
    <button class="btn btn-close" onclick="window.close()">CERRAR</button>
  </div>
</body>
</html>`;
}
