"""Shared key catalog; no audio, hooks or inference is needed to validate a bind."""
import json
from pathlib import Path

CATALOG = json.loads((Path(__file__).resolve().parents[2] / 'packages/shared-types/push-to-talk.json').read_text(encoding='utf-8'))


def normalize_binding(value):
    if not isinstance(value, dict) or set(value) != {'key', 'modifiers'} or not isinstance(value['key'], str) or value['key'] not in CATALOG['keys']:
        raise ValueError('Invalid push-to-talk key.')
    modifiers = value['modifiers']
    if not isinstance(modifiers, list) or any(not isinstance(key, str) or key not in CATALOG['modifiers'] for key in modifiers) or len(set(modifiers)) != len(modifiers):
        raise ValueError('Invalid push-to-talk modifiers.')
    if value['key'] == 'F4' and any(key in modifiers for key in ['Ctrl', 'Alt']):
        raise ValueError('Application-closing shortcuts cannot be used for push-to-talk.')
    return {'key': value['key'], 'modifiers': [key for key in CATALOG['modifiers'] if key in modifiers]}


def binding_pressed(binding, key_down):
    return not (key_down(91) or key_down(92)) and key_down(CATALOG['keys'][binding['key']]['virtualKey']) and all(key_down(code) == (key in binding['modifiers']) for key, code in CATALOG['modifiers'].items())
