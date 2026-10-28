export type PushToTalkBinding = { key: string; modifiers: ('Ctrl' | 'Alt' | 'Shift')[] };
export const DEFAULT_PUSH_TO_TALK: PushToTalkBinding;
export const PUSH_TO_TALK_KEYS: Record<string, { label: string; virtualKey: number }>;
export function normalizeHotkey(value?: unknown): PushToTalkBinding;
export function formatHotkey(value?: PushToTalkBinding): string;
export function hotkeyFromEvent(event: { code: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): PushToTalkBinding | null;
