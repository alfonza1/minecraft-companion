"""Opt-in Windows push-to-talk, independent of Minecraft/browser focus.

No key hook installation: GetAsyncKeyState observes the selected key/modifiers.
Audio stays in RAM; local API deletes temporary transcription files.
"""
import argparse
import ctypes
import io
import json
import threading
import time
import urllib.request
import urllib.parse
import uuid
import wave
from hotkeys import CATALOG, normalize_binding, binding_pressed

import numpy as np
import sounddevice as sd

BASE = 'http://127.0.0.1:4365'
RATE = 16000
MAX_SAMPLES = RATE * 30


def api(route, body=None, content_type='application/json'):
    payload = json.dumps(body).encode() if isinstance(body, dict) else body
    req = urllib.request.Request(BASE + route, data=payload, headers={'Origin': BASE, 'Content-Type': content_type})
    with urllib.request.urlopen(req, timeout=180) as result:
        return result.read()


def main():
    global BASE
    parser = argparse.ArgumentParser()
    parser.add_argument('--api-url', default=BASE)
    parser.add_argument('--input-device', type=int)
    parser.add_argument('--output-device', type=int)
    parser.add_argument('--hotkey', default=json.dumps(CATALOG['default']))
    args = parser.parse_args()
    parsed = urllib.parse.urlparse(args.api_url)
    if parsed.scheme != 'http' or parsed.hostname != '127.0.0.1' or parsed.username or parsed.password or parsed.path not in ['', '/'] or parsed.query or parsed.fragment or not parsed.port:
        raise ValueError('Desktop bridge API must be an explicit loopback HTTP origin.')
    BASE = args.api_url.rstrip('/')
    if not hasattr(ctypes, 'windll'):
        raise RuntimeError('Native push-to-talk currently supports Windows only.')
    binding = normalize_binding(json.loads(args.hotkey))
    generation = [0]
    frames = []
    held = False
    armed = False
    audio_busy = threading.Lock()
    poll_busy = threading.Lock()
    last_notice = [None]

    def play_text(text, token):
        if token != generation[0] or held:
            return
        if not audio_busy.acquire(blocking=False):
            return
        try:
            settings = json.loads(api('/api/state'))['settings'].get('voice', {})
            if token != generation[0] or held:
                return
            speech = api('/api/voice/speak', {'text': text, 'speed': settings.get('speed', 1)})
            if token != generation[0]:
                return
            with wave.open(io.BytesIO(speech), 'rb') as source:
                samples = np.frombuffer(source.readframes(source.getnframes()), dtype=np.int16)
                samples = samples.reshape(-1, source.getnchannels())
                sd.play(samples.astype(np.float32) / 32768 * settings.get('volume', .8), source.getframerate(), device=args.output_device)
                sd.wait()
        finally:
            audio_busy.release()

    def check_updates():
        try:
            state = json.loads(api('/api/state'))
            notices = [message for message in state.get('conversation', []) if message.get('kind')]
            newest = notices[-1] if notices else None
            if newest and newest['id'] != last_notice[0]:
                previous = last_notice[0]
                last_notice[0] = newest['id']
                if previous is not None and not held and state.get('state') in ['ACTIVE', 'BUSY']:
                    play_text(newest['text'], generation[0])
            elif not newest:
                last_notice[0] = 'initialized'
        except Exception:
            pass  # Optional updates must never stop push-to-talk capture.
        finally:
            poll_busy.release()

    def cancel_remote():
        for endpoint in ['/api/voice/cancel', '/api/conversation/cancel']:
            try:
                api(endpoint, {})
            except Exception:
                pass

    def converse(samples, token):
        try:
            wav = io.BytesIO()
            with wave.open(wav, 'wb') as out:
                out.setnchannels(1)
                out.setsampwidth(2)
                out.setframerate(RATE)
                out.writeframes(samples.tobytes())
            boundary = uuid.uuid4().hex
            body = (f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="utterance.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode() + wav.getvalue() + f'\r\n--{boundary}--\r\n'.encode())
            transcript = json.loads(api('/api/voice/transcribe', body, f'multipart/form-data; boundary={boundary}'))['text']
            if not transcript or token != generation[0]:
                return
            result = json.loads(api('/api/conversation', {'text': transcript}))
            if token != generation[0]:
                return
            text = result.get('reply', result.get('text'))
            if not text:
                return
            play_text(text, token)
        except Exception as error:
            # No transcript/audio content is logged.
            print(json.dumps({'type': 'error', 'message': str(error)}), flush=True)

    def capture(indata, _frames, _timing, _status):
        if held and len(frames) * 512 < MAX_SAMPLES:
            frames.append(indata.copy())

    try:
        with sd.InputStream(samplerate=RATE, channels=1, dtype='int16', blocksize=512, device=args.input_device, callback=capture):
            print(json.dumps({'type': 'ready', 'binding': binding, 'mode': 'push-to-talk'}), flush=True)
            next_update = 0
            while True:
                pressed = binding_pressed(binding, lambda key: bool(ctypes.windll.user32.GetAsyncKeyState(key) & 0x8000))
                if not pressed:
                    armed = True
                if pressed and not held and armed:
                    generation[0] += 1
                    sd.stop()
                    threading.Thread(target=cancel_remote, daemon=True).start()
                    frames.clear()
                    held = True
                elif held and not pressed:
                    held = False
                    if len(frames) >= 8:
                        samples = np.concatenate(frames).reshape(-1).copy()
                        threading.Thread(target=converse, args=(samples, generation[0]), daemon=True).start()
                    frames.clear()
                if time.monotonic() >= next_update:
                    next_update = time.monotonic() + 2
                    if poll_busy.acquire(blocking=False):
                        threading.Thread(target=check_updates, daemon=True).start()
                time.sleep(.025)
    finally:
        sd.stop()


if __name__ == '__main__':
    main()
