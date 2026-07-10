import { Howl } from 'howler';

/**
 * Audio Engine Industrial — Frecuencias de corte para entorno de almacén.
 * 
 * Instancias singleton para evitar memory leaks.
 * En producción, reemplazar las URLs por archivos locales en /public/sounds/.
 */

let successSound: Howl | null = null;
let errorSound: Howl | null = null;
let alertSound: Howl | null = null;
let syncErrorSound: Howl | null = null;

function getSuccessSound(): Howl {
  if (!successSound) {
    successSound = new Howl({
      src: ['/sounds/success.mp3'],
      volume: 0.8,
      preload: true,
    });
  }
  return successSound;
}

function getErrorSound(): Howl {
  if (!errorSound) {
    errorSound = new Howl({
      src: ['/sounds/error.mp3'],
      volume: 1.0,
      preload: true,
    });
  }
  return errorSound;
}

function getAlertSound(): Howl {
  if (!alertSound) {
    alertSound = new Howl({
      src: ['/sounds/alert.mp3'],
      volume: 0.7,
      preload: true,
    });
  }
  return alertSound;
}

function getSyncErrorSound(): Howl {
  if (!syncErrorSound) {
    syncErrorSound = new Howl({
      src: ['/sounds/sync-error.mp3'],
      volume: 0.9,
      preload: true,
    });
  }
  return syncErrorSound;
}

export const audioService = {
  /** Tono agudo (2500Hz), corto — Escaneo exitoso */
  playSuccess: () => getSuccessSound().play(),

  /** Tono grave (500Hz), doble pulso — SKU incorrecto */
  playError: () => getErrorSound().play(),

  /** Sirena suave — Supervisor requerido */
  playAlert: () => getAlertSound().play(),

  /** Tono distinto — Error de sincronización / red */
  playSyncError: () => getSyncErrorSound().play(),
};
