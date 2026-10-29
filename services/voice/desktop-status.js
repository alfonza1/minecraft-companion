const PHASES = new Set(['ready', 'listening', 'transcribing', 'thinking', 'speaking', 'error']);
const ERRORS = {
  short: 'Hold your push-to-talk button while speaking, then release it.',
  silence: 'No speech was heard. Check the desktop microphone selection and its mute switch.',
  transcribing: 'Could not transcribe your microphone. Try again or check local speech diagnostics.',
  thinking: 'Your speech was received, but the AI could not reply. Check model sign-in and usage limits.',
  speaking: 'The reply could not play. Check desktop speakers and the selected local voice.',
  microphone: 'Could not open the desktop microphone. Check its permissions and device selection.',
};

export function createDesktopStatus(onChange = () => {}) {
  let value = { phase: 'starting', error: null };
  let remainder = '';
  return {
    snapshot: () => ({ ...value }),
    receive(chunk) {
      remainder += chunk;
      if (remainder.length > 8192) { remainder = ''; return; }
      const lines = remainder.split('\n'); remainder = lines.pop();
      for (const line of lines) {
        let event; try { event = JSON.parse(line); } catch { continue; }
        if (!event || typeof event !== 'object' || !PHASES.has(event.phase)) continue;
        const error = typeof event.code === 'string' && Object.hasOwn(ERRORS,event.code) ? ERRORS[event.code] : 'Desktop voice failed. Disable and enable it to retry.';
        value = { phase: event.phase, error: event.phase === 'error' ? error : null };
        onChange();
      }
    },
  };
}
