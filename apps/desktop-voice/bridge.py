"""Opt-in Windows push-to-talk, independent of Minecraft/browser focus.

No key hook installation: GetAsyncKeyState observes the selected key/modifiers.
Audio stays in RAM; local API deletes temporary transcription files.
"""
import base64
import argparse
import ctypes
import io
import json
import threading
import time
import urllib.request
import urllib.error
import urllib.parse
import uuid
import wave
from hotkeys import CATALOG, normalize_binding, binding_pressed

import numpy as np
import sounddevice as sd

BASE = 'http://127.0.0.1:4365'
RATE = 16000
MAX_SAMPLES = RATE * 30


def api(route, body=None, content_type='application/json', timeout=180):
    payload = json.dumps(body).encode() if isinstance(body, dict) else body
    req = urllib.request.Request(BASE + route, data=payload, headers={'Origin': BASE, 'Content-Type': content_type})
    with urllib.request.urlopen(req, timeout=timeout) as result:
        return result.read()


def emit_status(phase, code=None):
    # Fixed metadata only: no audio, transcripts, prompts or credentials.
    print(json.dumps({'phase': phase, **({'code': code} if code else {})}), flush=True)


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
    cancel_busy = threading.Lock()
    cancellation = [None]
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
            payload = json.dumps({'text': text, 'speed': settings.get('speed', 1)}).encode()
            req = urllib.request.Request(BASE + '/api/voice/speak-stream', data=payload,
                                         headers={'Origin': BASE, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=60) as response:
                for line in response:
                    if token != generation[0] or held:
                        return
                    chunk = json.loads(line)
                    speech = base64.b64decode(chunk['audio'], validate=True)
                    with wave.open(io.BytesIO(speech), 'rb') as source:
                        samples = np.frombuffer(source.readframes(source.getnframes()), dtype=np.int16)
                        samples = samples.reshape(-1, source.getnchannels())
                        if token != generation[0] or held:
                            return
                        emit_status('speaking')
                        sd.play(samples.astype(np.float32) / 32768 * settings.get('volume', .8), source.getframerate(), device=args.output_device)
                        sd.wait()
            if token == generation[0]:
                emit_status('ready')
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

    def cancel_remote(token):
        with cancel_busy:
            for endpoint in ['/api/voice/cancel', '/api/conversation/cancel']:
                if token != generation[0]:
                    return
                try:
                    api(endpoint, {}, timeout=5)
                except Exception:
                    pass

    def converse(samples, token, cancel_thread):
        stage = 'transcribing'
        try:
            # A late barge-in cancellation must never cancel this new utterance.
            cancel_thread.join()
            if token != generation[0]:
                return
            emit_status('transcribing')
            wav = io.BytesIO()
            with wave.open(wav, 'wb') as out:
                out.setnchannels(1)
                out.setsampwidth(2)
                out.setframerate(RATE)
                out.writeframes(samples.tobytes())
            boundary = uuid.uuid4().hex
            body = (f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="utterance.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode() + wav.getvalue() + f'\r\n--{boundary}--\r\n'.encode())
            transcript = json.loads(api('/api/voice/transcribe', body, f'multipart/form-data; boundary={boundary}'))['text']
            if token != generation[0]:
                return
            if not transcript:
                emit_status('error', 'silence')
                return
            stage = 'thinking'
            emit_status('thinking')
            result = json.loads(api('/api/conversation', {'text': transcript}))
            if token != generation[0]:
                return
            text = result.get('reply', result.get('text'))
            if not text:
                emit_status('error', 'thinking')
                return
            stage = 'speaking'
            play_text(text, token)
        except urllib.error.HTTPError as error:
            if token == generation[0]:
                try:
                    code = json.loads(error.read(8192)).get('code')
                except Exception:
                    code = None
                emit_status('error', {'INPUT_TOKEN_BUDGET': 'token_budget', 'MODEL_REQUEST_LIMIT': 'request_limit'}.get(code, stage) if isinstance(code, str) else stage)
        except Exception:
            if token == generation[0]:
                emit_status('error', stage)

    def capture(indata, _frames, _timing, _status):
        if held and len(frames) * 512 < MAX_SAMPLES:
            frames.append(indata.copy())

    try:
        with sd.InputStream(samplerate=RATE, channels=1, dtype='int16', blocksize=512, device=args.input_device, callback=capture):
            emit_status('ready')
            next_update = 0
            while True:
                pressed = binding_pressed(binding, lambda key: bool(ctypes.windll.user32.GetAsyncKeyState(key) & 0x8000))
                if not pressed:
                    armed = True
                if pressed and not held and armed:
                    generation[0] += 1
                    sd.stop()
                    cancellation[0] = threading.Thread(target=cancel_remote, args=(generation[0],), daemon=True)
                    cancellation[0].start()
                    frames.clear()
                    held = True
                    emit_status('listening')
                elif held and not pressed:
                    held = False
                    if len(frames) >= 8:
                        samples = np.concatenate(frames).reshape(-1).copy()
                        threading.Thread(target=converse, args=(samples, generation[0], cancellation[0]), daemon=True).start()
                    else:
                        emit_status('error', 'short')
                    frames.clear()
                if time.monotonic() >= next_update:
                    next_update = time.monotonic() + 2
                    if poll_busy.acquire(blocking=False):
                        threading.Thread(target=check_updates, daemon=True).start()
                time.sleep(.025)
    except Exception:
        emit_status('error', 'microphone')
        raise
    finally:
        sd.stop()


if __name__ == '__main__':
    main()
