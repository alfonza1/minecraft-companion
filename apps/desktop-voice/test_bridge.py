"""Exercise the actual bridge loop with isolated audio, keys and local API fixtures."""
import contextlib
import ctypes
import io
import json
import threading
import unittest
import urllib.error
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import bridge


class BridgeTests(unittest.TestCase):
    def run_bridge(self, transcript='hello', fail=None, hold_ticks=14):
        tick = [0]
        calls = []
        cancelled = threading.Event()
        released = threading.Event()
        raced = []
        finished = threading.Event()
        output = io.StringIO()
        callback = [None]

        class Input:
            def __init__(self, **options):
                callback[0] = options['callback']

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

        def request(route, *_args, **_kwargs):
            calls.append(route)
            if route == '/api/state':
                return b'{"conversation":[]}'
            if route == '/api/conversation/cancel':
                # The release happens before cancellation finishes.
                released.wait(1)
                threading.Event().wait(.08)
                cancelled.set()
            if route == '/api/voice/transcribe':
                if not cancelled.is_set():
                    raced.append(True)
                if fail == 'transcribing':
                    finished.set()
                    raise RuntimeError('private fixture must never appear in status')
                if not transcript:
                    finished.set()
                return json.dumps({'text': transcript}).encode()
            if route == '/api/conversation':
                finished.set()
                if fail == 'budget':
                    raise urllib.error.HTTPError('http://127.0.0.1',409,'Conflict',None,io.BytesIO(b'{"code":"INPUT_TOKEN_BUDGET","error":"private fixture"}'))
                if fail == 'thinking':
                    raise RuntimeError('private fixture must never appear in status')
                return b'{"text":""}'
            return b'{}'

        def sleep(_):
            tick[0] += 1
            if tick[0] >= 3 + hold_ticks:
                released.set()
            callback[0](np.zeros((512, 1), dtype=np.int16), 512, None, None)
            threading.Event().wait(.002)
            if tick[0] > 150:
                raise KeyboardInterrupt()

        def key_state(key):
            return 0x8000 if key == 119 and 3 <= tick[0] < 3 + hold_ticks else 0

        native = SimpleNamespace(user32=SimpleNamespace(GetAsyncKeyState=key_state))
        with patch.object(bridge.sd, 'InputStream', Input), patch.object(bridge.sd, 'stop'), patch.object(bridge, 'api', request), patch.object(bridge.time, 'sleep', sleep), patch.object(ctypes, 'windll', native, create=True), patch('sys.argv', ['bridge.py']), contextlib.redirect_stdout(output):
            with self.assertRaises(KeyboardInterrupt):
                bridge.main()
            if hold_ticks >= 8:
                self.assertTrue(finished.wait(1))
        events = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertFalse(raced, 'New speech raced its barge-in cancellation')
        self.assertNotIn('private fixture', output.getvalue())
        return events, calls

    def test_capture_works_without_browser_and_waits_for_cancellation(self):
        events, calls = self.run_bridge()
        self.assertIn('/api/conversation', calls)
        self.assertEqual([event['phase'] for event in events[:4]], ['ready', 'listening', 'transcribing', 'thinking'])

    def test_empty_microphone_and_short_hold_are_visible(self):
        for transcript, ticks, code in [('', 14, 'silence'), ('hello', 2, 'short')]:
            events, calls = self.run_bridge(transcript=transcript, hold_ticks=ticks)
            self.assertIn({'phase': 'error', 'code': code}, events)
            self.assertNotIn('/api/conversation', calls)

    def test_transcription_and_model_errors_are_visible_without_private_data(self):
        for stage in ['transcribing', 'thinking', 'budget']:
            events, _ = self.run_bridge(fail=stage)
            self.assertIn({'phase': 'error', 'code': 'token_budget' if stage == 'budget' else stage}, events)


if __name__ == '__main__':
    unittest.main()
