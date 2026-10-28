# Local speech

`setup.ps1` creates a Python 3.12 environment under `%LOCALAPPDATA%/MinecraftCompanion/voice-venv`; it does not change the system Python or Minecraft. Models live beside that environment, outside Git. Re-run the script to repair missing dependencies/models.

Default transcription is faster-whisper tiny.en on two CPU threads, INT8, with Silero VAD. Recommended speech is Kokoro Heart, using the full-precision82M CPU ONNX model. Settings offers nine American/British masculine/feminine Kokoro voices and Piper LJ Speech as a lightweight alternative. Selection applies to both desktop and browser responses and persists in SQLite. Windows SAPI is a fallback when neither neural provider is installed. No paid speech API is used. Speech inference loads on demand and exits after each request, trading some latency for low idle memory. The Kokoro session uses two intra-op threads and one inter-op thread to limit contention with Minecraft. Audio requests are at most12MiB and45seconds; microphone audio is piped through RAM into the worker and is never written to disk. Temporary synthesized speech files are deleted on success, failure and cancellation. Audio is never sent to Codex; transcribed text is sent only when the user speaks to the active companion.

`kokoro-models.json` pins the fixed release, sizes and SHA256 hashes of the full-precision ONNX model and NPZ voice vectors. `prepare-kokoro.py` verifies downloads before atomic replacement, outside Git. No pickle checkpoints or remote Python code are loaded. The model assets total about354MB. `requirements-lock.txt` includes kokoro-onnx0.6.1, phonemizer3.4.0 and a private Windows eSpeak-NG loader; it does not install system audio hooks or change CUDA/ROCm. These are quality-focused free local options, not a claim that one voice is universally best; Preview lets the user choose. Previews use a fixed sample, request no microphone permission and make no Codex call. They are blocked while paused.

The dashboard microphone button requests explicit browser permission. Input/output devices, hold-to-talk, hands-free activity detection, speed, and volume are controlled by the dashboard hook. Browser echo cancellation/noise suppression depend on browser/device support; use headphones. Hands-free activity thresholds are in `apps/desktop-voice/useVoice.ts`. This is utterance-by-utterance speech, not streaming synthesis or realtime simultaneous dialogue.

For Minecraft in the foreground, choose **Push-to-talk key → Change key**, then **Enable desktop voice**. F8 is the default. Keys F1–F24, letters, digits, Space/Tab/CapsLock, Mouse4/5 and optional Ctrl/Alt/Shift chords share one validated catalog across TypeScript/Node/Python. Escape cancels rebinding, and application-closing chords are rejected. Rebinding/resetting stops capture before accepting the new key; explicitly re-enable voice afterward. The native bridge observes only the bound key and modifier states using GetAsyncKeyState; it installs no keyboard hook and does not suppress Minecraft input. It waits for release if the shortcut is already held when enabled. The browser hook uses the same binding while focused, avoids ordinary text inputs and stops PTT on blur. Hold to record, release to transcribe. Native pressing also interrupts playback/model work. Native device IDs come from `/api/voice/devices`; they differ from browser device IDs. Native capture remains PTT-only without browser noise suppression. Pause/stop/disconnect terminate it. Physical microphone/headphones and shortcut conflicts still require user testing.

Pause and stop abort the actual backend processes and wait for exit. `/api/voice/cancel` cancels inference; `stopVoice()` additionally closes native capture. Mic recording remains opt-in; paused browser capture stops all media tracks.

## Licenses and sources

- faster-whisper: MIT, https://github.com/SYSTRAN/faster-whisper
- tiny.en converted model: MIT, https://huggingface.co/Systran/faster-whisper-tiny.en
- sounddevice: MIT, https://python-sounddevice.readthedocs.io/en/0.5.3/
- Kokoro model/voices: Apache-2.0, https://huggingface.co/hexgrad/Kokoro-82M
- ONNX model/voice assets: https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1 (fixed checksums in kokoro-models.json)
- kokoro-onnx runtime: MIT, https://github.com/thewh1teagle/kokoro-onnx
- phonemizer/eSpeak-NG: GPL-family runtime components, https://github.com/bootphon/phonemizer and https://github.com/espeak-ng/espeak-ng; installed separately, with their package licenses retained. Voice-model licensing is separate from runtime licensing.
- Piper runtime: GPL-3.0, installed separately through pip, https://github.com/OHF-Voice/piper1-gpl
- Piper voice: https://huggingface.co/rhasspy/piper-voices/tree/5041a7a49ae5b3a0f30e6837769eb03fdbb231bd/en/en_US/ljspeech/high
- LJ Speech recordings/text/annotations: public domain; Linda Johnson and Keith Ito, https://keithito.com/LJ-Speech-Dataset/

## Observed smoke evidence

On this Windows workstation, SAPI generated a 198,004-byte valid RIFF WAV. Local faster-whisper transcribed its sentence exactly: `Hello friend. Let us collect wood and build a house.` Piper generated a 117,804-byte WAV, and faster-whisper transcribed it exactly as `Yo, I found a pretty good cave over here.` These are synthetic-audio pipeline tests, not proof of the physical microphone/headphones or a Realm session.

PyAV 19 rejected faster-whisper's `metadata_errors` parameter in a real round-trip test. PyAV 16.0.1 is pinned after the corrected round trip passed.

`node scripts/test-voice-options.mjs` generated actual non-silent, distinct PCM output for all nine Kokoro choices and Piper. Kokoro output was24kHz and the short fixed cave sentence took about3.1–4.1seconds per cold request on this workstation; Piper took4.6seconds in that run. Quality preference and physical output are not established by waveform checks. The local TTS→Whisper round trip and the actual HTTP/UI Kokoro preview also passed. Browser tests used Chromium's synthetic microphone and explicitly empty transcription fixtures to verify F8/chord hold/release, reset stopping capture, and pause without recording a real microphone or making model calls.
