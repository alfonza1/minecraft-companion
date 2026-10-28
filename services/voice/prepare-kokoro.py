"""Download fixed local ONNX assets. Never download Python code or pickle models."""
import hashlib
import json
import os
from pathlib import Path
import urllib.request
from concurrent.futures import ThreadPoolExecutor

manifest = json.loads(Path(__file__).with_name('kokoro-models.json').read_text(encoding='utf-8'))
target = Path(os.environ['LOCALAPPDATA']) / 'MinecraftCompanion/voice-models/kokoro'
target.mkdir(parents=True, exist_ok=True)


def digest(filename):
    hasher = hashlib.sha256()
    with filename.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            hasher.update(chunk)
    return hasher.hexdigest()


def prepare(file):
    filename = target / file['name']
    if filename.is_file() and filename.stat().st_size == file['bytes'] and digest(filename) == file['sha256']:
        return
    temporary = filename.with_suffix(filename.suffix + '.download')
    try:
        url = f"https://github.com/thewh1teagle/kokoro-onnx/releases/download/{manifest['release']}/{file['name']}"
        with urllib.request.urlopen(url, timeout=60) as response, temporary.open('wb') as output:
            total = 0
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > file['bytes']:
                    raise ValueError('Model download exceeds its pinned size.')
                output.write(chunk)
        if total != file['bytes'] or digest(temporary) != file['sha256']:
            raise ValueError('Kokoro model checksum mismatch.')
        temporary.replace(filename)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(prepare, manifest['files']))
    print(json.dumps({'ready': True, 'provider': 'kokoro', 'precision': 'float32', 'license': manifest['license']}))
