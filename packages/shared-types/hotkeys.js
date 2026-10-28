import catalog from './push-to-talk.json' with { type: 'json' };

export const DEFAULT_PUSH_TO_TALK = catalog.default;
export const PUSH_TO_TALK_KEYS = catalog.keys;
export function normalizeHotkey(value = DEFAULT_PUSH_TO_TALK) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['key', 'modifiers'].includes(key)) || !Object.hasOwn(catalog.keys, value.key) || !Array.isArray(value.modifiers) || value.modifiers.length > 3 || new Set(value.modifiers).size !== value.modifiers.length || value.modifiers.some(key => !Object.hasOwn(catalog.modifiers, key))) throw new Error('Choose a supported push-to-talk key and optional Ctrl, Alt or Shift modifiers.');
  if (value.key === 'F4' && (value.modifiers.includes('Alt') || value.modifiers.includes('Ctrl'))) throw new Error('Choose a shortcut that does not close applications or tabs.');
  return { key: value.key, modifiers: Object.keys(catalog.modifiers).filter(key => value.modifiers.includes(key)) };
}
export function formatHotkey(value = DEFAULT_PUSH_TO_TALK) { const binding = normalizeHotkey(value); return [...binding.modifiers, catalog.keys[binding.key].label].join(' + '); }
export function hotkeyFromEvent(event) {
  if (event.metaKey || !Object.hasOwn(catalog.keys, event.code)) return null;
  return normalizeHotkey({ key: event.code, modifiers: [['Ctrl', event.ctrlKey], ['Alt', event.altKey], ['Shift', event.shiftKey]].filter(([, held]) => held).map(([key]) => key) });
}
