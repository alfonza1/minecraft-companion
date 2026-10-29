"""Bounded local TTS worker. Retains model weights, never conversation/audio history."""
import base64
import io
import json
import sys
import wave
from pathlib import Path
from worker import model_directory, decode_bounded_audio

kokoro = None
piper = None
whisper = None
voices = json.loads(Path(__file__).with_name('voices.json').read_text(encoding='utf-8'))
print(json.dumps({'ready': True}), flush=True)
for line in sys.stdin:
    try:
        request = json.loads(line)
        if request.get('mode') == 'transcribe':
            recording = base64.b64decode(request['audio'], validate=True)
            if len(recording) > 12 * 1024 * 1024:
                raise ValueError('Audio exceeds limit')
            if whisper is None:
                from faster_whisper import WhisperModel
                whisper = WhisperModel('tiny.en', device='cpu', compute_type='int8', cpu_threads=2, num_workers=1, download_root=str(model_directory()), local_files_only=True)
            audio = decode_bounded_audio(io.BytesIO(recording))
            segments, info = whisper.transcribe(audio, beam_size=1, language='en', vad_filter=True, vad_parameters={'min_silence_duration_ms': 500})
            print(json.dumps({'text': ''.join(segment.text for segment in segments).strip(), 'language': info.language}), flush=True)
            continue
        text, speed, selected = request['text'], request['speed'], request['voice']
        if not isinstance(text, str) or not text.strip() or len(text) > 4000 or not .5 <= speed <= 2:
            raise ValueError('Invalid speech request')
        if selected == 'auto':
            selected = 'kokoro:af_heart' if (model_directory() / 'kokoro/kokoro-v1.0.onnx').is_file() else 'piper:ljspeech'
        entry = next((voice for voice in voices if voice['id'] == selected), None)
        if not entry:
            raise ValueError('Unknown voice')
        output = io.BytesIO()
        if entry['provider'] == 'kokoro':
            import numpy as np
            if kokoro is None:
                import onnxruntime as rt
                from kokoro_onnx import Kokoro
                config = rt.SessionOptions()
                config.intra_op_num_threads, config.inter_op_num_threads = 2, 1
                session = rt.InferenceSession(str(model_directory() / 'kokoro/kokoro-v1.0.onnx'), sess_options=config, providers=['CPUExecutionProvider'])
                kokoro = Kokoro.from_session(session, str(model_directory() / 'kokoro/voices-v1.0.bin'))
            samples, rate = kokoro.create(text, voice=selected.split(':')[1], speed=speed, lang=entry['language'])
            with wave.open(output, 'wb') as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(rate)
                wav.writeframes((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
        else:
            from piper import PiperVoice, SynthesisConfig
            if piper is None:
                piper = PiperVoice.load(str(model_directory() / 'piper/en/en_US/ljspeech/high/en_US-ljspeech-high.onnx'), use_cuda=False)
            with wave.open(output, 'wb') as wav:
                piper.synthesize_wav(text, wav, syn_config=SynthesisConfig(length_scale=1 / speed))
        print(json.dumps({'audio': base64.b64encode(output.getvalue()).decode('ascii')}), flush=True)
    except Exception:
        print(json.dumps({'error': True}), flush=True)
    finally:
        line, request, text, output, samples, recording, audio, segments = None, None, None, None, None, None, None, None
if kokoro is not None:
    kokoro.voices.close()
