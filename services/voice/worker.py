"""Local-only CPU speech. Audio exists only in request temporary directories."""
import argparse
import json
import os
from pathlib import Path
import wave
import io
import sys

PIPER_REVISION = '5041a7a49ae5b3a0f30e6837769eb03fdbb231bd'
PIPER_MODEL = 'en/en_US/ljspeech/high/en_US-ljspeech-high.onnx'


def model_directory():
    return Path(os.environ.get('LOCALAPPDATA', str(Path.home() / '.cache'))) / 'MinecraftCompanion' / 'voice-models'


def decode_bounded_audio(source, max_seconds=45):
    import av
    import numpy as np
    chunks = []
    total = 0
    resampler = av.AudioResampler(format='s16', layout='mono', rate=16000)
    with av.open(source, mode='r') as container:
        for frame in container.decode(audio=0):
            for converted in resampler.resample(frame):
                samples = converted.to_ndarray().reshape(-1)
                total += samples.size
                if total > 16000 * max_seconds:
                    raise ValueError('Recordings must be 45 seconds or shorter.')
                chunks.append(samples)
        for converted in resampler.resample(None):
            samples = converted.to_ndarray().reshape(-1)
            total += samples.size
            if total > 16000 * max_seconds:
                raise ValueError('Recordings must be 45 seconds or shorter.')
            chunks.append(samples)
    return np.concatenate(chunks).astype(np.float32) / 32768 if chunks else np.empty(0, dtype=np.float32)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['prepare', 'status', 'transcribe', 'devices', 'synthesize'])
    parser.add_argument('--input')
    parser.add_argument('--output')
    parser.add_argument('--speed', type=float, default=1)
    parser.add_argument('--voice', default='auto')
    args = parser.parse_args()
    if args.mode == 'status':
        import faster_whisper
        import importlib.util
        kokoro = importlib.util.find_spec('kokoro_onnx') is not None and all((model_directory() / 'kokoro' / name).is_file() for name in ['kokoro-v1.0.onnx', 'voices-v1.0.bin'])
        print(json.dumps({'ready': (model_directory() / 'models--Systran--faster-whisper-tiny.en').exists(), 'piper': (model_directory() / 'piper' / PIPER_MODEL).is_file(), 'kokoro': kokoro, 'stt': 'faster-whisper tiny.en CPU int8', 'vad': 'Silero'}))
    elif args.mode == 'devices':
        import sounddevice as sd
        print(json.dumps([dict(d, id=i) for i, d in enumerate(sd.query_devices())]))
    elif args.mode == 'synthesize':
        if not 0.5 <= args.speed <= 2:
            raise ValueError('Speech speed out of range.')
        text = Path(args.input).read_text(encoding='utf-8')
        if not text.strip() or len(text) > 4000:
            raise ValueError('Speech text exceeds limit.')
        voices = json.loads(Path(__file__).with_name('voices.json').read_text(encoding='utf-8'))
        selected = args.voice
        if selected == 'auto':
            selected = 'kokoro:af_heart' if (model_directory() / 'kokoro/kokoro-v1.0.onnx').is_file() else 'piper:ljspeech'
        entry = next((voice for voice in voices if voice['id'] == selected), None)
        if entry is None:
            raise ValueError('Unknown local voice.')
        if entry['provider'] == 'kokoro':
            import numpy as np
            import onnxruntime as rt
            from kokoro_onnx import Kokoro
            config = rt.SessionOptions()
            config.intra_op_num_threads = 2
            config.inter_op_num_threads = 1
            session = rt.InferenceSession(str(model_directory() / 'kokoro/kokoro-v1.0.onnx'), sess_options=config, providers=['CPUExecutionProvider'])
            voice = Kokoro.from_session(session, str(model_directory() / 'kokoro/voices-v1.0.bin'))
            samples, rate = voice.create(text, voice=selected.split(':')[1], speed=args.speed, lang=entry['language'])
            with wave.open(args.output, 'wb') as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(rate)
                output.writeframes((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
            voice.voices.close()
        else:
            from piper import PiperVoice, SynthesisConfig
            voice = PiperVoice.load(str(model_directory() / 'piper' / PIPER_MODEL), use_cuda=False)
            with wave.open(args.output, 'wb') as output:
                voice.synthesize_wav(text, output, syn_config=SynthesisConfig(length_scale=1 / args.speed))
        print(json.dumps({'provider': entry['provider'], 'voice': selected}))
    else:
        from faster_whisper import WhisperModel
        model = WhisperModel('tiny.en', device='cpu', compute_type='int8', cpu_threads=2, num_workers=1,
                             download_root=str(model_directory()), local_files_only=args.mode != 'prepare')
        if args.mode == 'prepare':
            from huggingface_hub import hf_hub_download
            for filename in [PIPER_MODEL, PIPER_MODEL + '.json', 'en/en_US/ljspeech/high/MODEL_CARD']:
                hf_hub_download('rhasspy/piper-voices', filename, revision=PIPER_REVISION,
                                local_dir=str(model_directory() / 'piper'))
            print(json.dumps({'ready': True}))
            return
        if args.input == '-':
            recording = sys.stdin.buffer.read(12 * 1024 * 1024 + 1)
            if len(recording) > 12 * 1024 * 1024:
                raise ValueError('Audio input exceeds 12 MiB.')
            source = io.BytesIO(recording)
        else:
            source_path = Path(args.input)
            if not source_path.is_file() or source_path.stat().st_size > 12 * 1024 * 1024:
                raise ValueError('Audio input missing or exceeds 12 MiB.')
            source = str(source_path)
        # Decode before inference and cap duration to prevent tiny compressed files
        # from expanding into unlimited audio work.
        audio = decode_bounded_audio(source)
        segments, info = model.transcribe(audio, beam_size=1, language='en', vad_filter=True,
                                          vad_parameters={'min_silence_duration_ms': 500})
        print(json.dumps({'text': ''.join(s.text for s in segments).strip(), 'language': info.language}))


if __name__ == '__main__':
    main()
