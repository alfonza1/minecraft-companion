import unittest
from hotkeys import normalize_binding, binding_pressed


class HotkeyTests(unittest.TestCase):
    def test_chord_requires_its_key_and_exact_modifiers(self):
        binding = normalize_binding({'key': 'KeyV', 'modifiers': ['Shift', 'Ctrl']})
        self.assertEqual(binding['modifiers'], ['Ctrl', 'Shift'])
        self.assertTrue(binding_pressed(binding, lambda code: code in {86, 17, 16}))
        for keys in [{86}, {17, 16}, {86, 17, 16, 18}, {86, 17, 16, 91}]:
            self.assertFalse(binding_pressed(binding, lambda code: code in keys))

    def test_mouse_side_buttons_use_windows_xbutton_codes(self):
        self.assertTrue(binding_pressed(normalize_binding({'key': 'Mouse4', 'modifiers': []}), lambda code: code == 5))
        self.assertFalse(binding_pressed(normalize_binding({'key': 'Mouse5', 'modifiers': []}), lambda code: code == 5))

    def test_invalid_and_application_closing_bindings_are_rejected(self):
        for value in [None, {}, {'key': [], 'modifiers': []}, {'key': 'Escape', 'modifiers': []}, {'key': 'F4', 'modifiers': ['Alt']}, {'key': 'F8', 'modifiers': ['Ctrl', 'Ctrl']}, {'key': 'F8', 'modifiers': ['Win']}]:
            with self.assertRaises(ValueError):
                normalize_binding(value)


if __name__ == '__main__':
    unittest.main()
