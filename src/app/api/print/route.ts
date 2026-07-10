import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fetchLabel, extractFirstPage } from '@/lib/label-service';

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { mlId } = await req.json();
    if (!mlId) return NextResponse.json({ error: 'Falta mlId' }, { status: 400 });

    const printerName = process.env.LABEL_PRINTER_NAME;

    // 1. Obtener el PDF con multi-intento (gateway → ML directo → fallback local)
    const { buffer, source } = await fetchLabel(mlId);
    
    // 2. Extraer solo la primera página
    const singlePage = await extractFirstPage(buffer);

    const sourceLabel = 
      source === 'gateway' ? 'ML Gateway' :
      source === 'ml-direct' ? 'ML Directo' :
      'Local (fallback)';

    console.log(`[PrintRoute] Etiqueta obtenida desde ${sourceLabel} para ${mlId}`);

    // 3. Guardar temporalmente
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `label-${mlId}-${Date.now()}.pdf`);
    await fs.writeFile(tempFilePath, singlePage);

    // 4. Mandar a imprimir vía comando 'lp'
    // Si no hay printerName, usa la predeterminada del sistema
    const printerFlag = printerName ? `-d ${printerName}` : '';
    const command = `lp ${printerFlag} ${tempFilePath}`;
    
    console.log(`[PrintRoute] Ejecutando: ${command}`);
    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stderr.includes('request id is')) {
      console.warn('[PrintRoute] Advertencia:', stderr);
    }

    // 5. Limpiar archivo temporal
    setTimeout(() => fs.unlink(tempFilePath).catch(() => {}), 5000);

    return NextResponse.json({ 
      success: true, 
      message: 'Trabajo de impresión enviado',
      source: sourceLabel,
      stdout 
    });

  } catch (error: any) {
    console.error('[PrintRoute] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
