# Local speech

`setup.ps1` creates a Python 3.12 environment under `%LOCALAPPDATA%/MinecraftCompanion/voice-venv`; it does not change the system Python or Minecraft. Models live beside that environment, outside Git. Re-run the script to repair missing dependencies/models.

Default transcription is faster-whisper tiny.en on two CPU threads, INT8, with Silero VAD. Default speech is Piper LJ Speech, CPU ONNX. Windows SAPI is an explicitly labeled fallback when Piper is unavailable. No paid speech API is used. Speech inference loads on demand and the process exits after each request, trading some latency for low idle memory. Audio requests are at most 12 MiB and 45 seconds; microphone audio is piped through RAM into the worker and is never written to disk. Decoding stops at the duration limit before accumulating unbounded decompressed audio. Temporary synthesized speech files are deleted on success, failure, and cancellation. Audio is never sent to Codex; transcribed text is sent only when the user speaks to the active companion.

The dashboard microphone button requests explicit browser permission. Input/output devices, hold-to-talk, hands-free activity detection, speed, and volume are controlled by the dashboard hook. Browser echo cancellation/noise suppression depend on browser/device support; use headphones. Hands-free activity thresholds are in `apps/desktop-voice/useVoice.ts`. This is utterance-by-utterance speech, not streaming synthesis or realtime simultaneous dialogue.

For Minecraft in the foreground, enable desktop F8 push-to-talk in the dashboard. That explicitly starts `apps/desktop-voice/bridge.py`, which captures through PortAudio without stealing focus. It observes only F8 with Windows `GetAsyncKeyState`; it does not install a global keyboard hook or alter shortcuts. Hold F8, speak, release. Pressing F8 interrupts playback/model work. Native device IDs come from `/api/voice/devices`; they differ from browser device IDs. Native capture is push-to-talk only, without browser noise suppression. Pause/stop/disconnect terminate the native bridge; explicitly enable it again after resume. Physical microphone/speaker operation and F8 conflicts with a user's game bindings still require user testing.

Pause and stop abort the actual backend processes and wait for exit. `/api/voice/cancel` cancels inference; `stopVoice()` additionally closes native capture. Mic recording remains opt-in; paused browser capture stops all media tracks.

## Licenses and sources

- faster-whisper: MIT, https://github.com/SYSTRAN/faster-whisper
- tiny.en converted model: MIT, https://huggingface.co/Systran/faster-whisper-tiny.en
- sounddevice: MIT, https://python-sounddevice.readthedocs.io/en/0.5.3/
- Piper runtime: GPL-3.0, installed separately through pip, https://github.com/OHF-Voice/piper1-gpl
- Piper voice: https://huggingface.co/rhasspy/piper-voices/tree/5041a7a49ae5b3a0f30e6837769eb03fdbb231bd/en/en_US/ljspeech/high
- LJ Speech recordings/text/annotations: public domain; Linda Johnson and Keith Ito, https://keithito.com/LJ-Speech-Dataset/

## Observed smoke evidence

On this Windows workstation, SAPI generated a 198,004-byte valid RIFF WAV. Local faster-whisper transcribed its sentence exactly: `Hello friend. Let us collect wood and build a house.` Piper generated a 117,804-byte WAV, and faster-whisper transcribed it exactly as `Yo, I found a pretty good cave over here.` These are synthetic-audio pipeline tests, not proof of the physical microphone/headphones or a Realm session.

PyAV 19 rejected faster-whisper's `metadata_errors` parameter in a real round-trip test. PyAV 16.0.1 is pinned after the corrected round trip passed.
