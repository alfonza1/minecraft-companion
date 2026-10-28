const DEVICE_ERRORS = new Set(['NotAllowedError', 'SecurityError', 'NotFoundError', 'AbortError']);
const OUTPUT_HELP = 'The selected speakers are unavailable or not permitted in this app. Choose an audio output in Settings, or select System default.';
const PREVIEW_NOTICE = 'The selected speakers are unavailable or not permitted in this app. Preview is using the system default. Choose an audio output in Settings to use a specific device.';

export async function configureAudioOutput(player, deviceId, { fallbackToDefault = false } = {}) {
  if (!deviceId || deviceId === 'default') return { notice: null };
  if (typeof player.setSinkId !== 'function') {
    if (!fallbackToDefault) throw new Error(OUTPUT_HELP);
    return { notice: PREVIEW_NOTICE };
  }
  try { await player.setSinkId(deviceId); return { notice: null }; }
  catch (error) {
    if (!DEVICE_ERRORS.has(error?.name)) throw error;
    if (!fallbackToDefault) throw new Error(OUTPUT_HELP, { cause: error });
    // Fresh audio elements already use the default. Do not request device
    // permission again when speaker selection itself is disallowed.
    if (player.sinkId) await player.setSinkId('');
    return { notice: PREVIEW_NOTICE };
  }
}
