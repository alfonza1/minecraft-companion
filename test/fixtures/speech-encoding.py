"""Exercise the real resident protocol under a Windows legacy code page."""
import runpy
import sys
import types
from pathlib import Path

resident, expected = sys.argv[1:3]
sys.path.insert(0, str(Path(resident).parent))
sys.stdin.reconfigure(encoding='cp1252')
sys.stdout.reconfigure(encoding='cp1252')


class CheckedVoice:
    def synthesize_wav(self, text, output, syn_config):
        if text != expected:
            raise ValueError('Speech text changed before reaching the renderer')
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(22050)
        output.writeframes(b'\0' * 40)


piper = types.ModuleType('piper')
piper.PiperVoice = types.SimpleNamespace(load=lambda *args, **kwargs: CheckedVoice())
piper.SynthesisConfig = lambda **kwargs: kwargs
sys.modules['piper'] = piper
runpy.run_path(resident, run_name='__main__')
