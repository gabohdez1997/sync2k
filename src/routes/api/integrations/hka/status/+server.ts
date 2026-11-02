// src/routes/api/integrations/hka/status/+server.ts
import { json } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import { getHkaDocumentStatus, downloadInvoicePdf } from '$lib/server/services/hka';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return json({ success: false, message: 'No autenticado.' }, { status: 401 });
  }

  const numeroDocumento = url.searchParams.get('numero_documento');
  const tipoDocumento = url.searchParams.get('tipo_documento') || '01';
  const serie = url.searchParams.get('serie') || '';
  const downloadPdf = url.searchParams.get('download_pdf') === 'true';

  if (!numeroDocumento) {
    return json({ success: false, message: 'Parámetro numero_documento requerido.' }, { status: 400 });
  }

  try {
    if (downloadPdf) {
      const pdfResult = await downloadInvoicePdf(tipoDocumento, serie, numeroDocumento);
      if (pdfResult.success && pdfResult.archivo) {
        return json({
          success: true,
          archivoBase64: pdfResult.archivo,
          mensaje: pdfResult.mensaje || 'PDF obtenido exitosamente.'
        });
      }
      return json({ success: false, message: pdfResult.mensaje || 'No se pudo descargar el PDF.' }, { status: 400 });
    }

    const statusResult = await getHkaDocumentStatus(numeroDocumento, tipoDocumento, serie);
    return json({
      success: statusResult.success,
      estatus: statusResult.estatus,
      codigo: statusResult.codigo,
      mensaje: statusResult.mensaje,
      resultado: statusResult.resultado
    });
  } catch (err: any) {
    return json({ success: false, message: `Error al consultar estado: ${err.message}` }, { status: 500 });
  }
};

