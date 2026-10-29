import type { CompanionState } from '../../../packages/shared-types';

export function desktopVoiceLabel(status: CompanionState['voice']['desktop']) {
  const labels: Record<string, string> = {
    starting: 'Opening desktop microphone…',
    ready: 'Desktop push to talk ready',
    listening: 'Listening…',
    transcribing: 'Transcribing your speech…',
    thinking: 'Companion thinking…',
    speaking: 'Companion speaking',
    error: 'Desktop voice needs attention',
  };
  return labels[status?.phase ?? 'ready'] ?? 'Desktop push to talk ready';
}
