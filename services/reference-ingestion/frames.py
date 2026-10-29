"""Bounded local decoding of archived user media. Never opens a network URL."""
import argparse
import json
import math
import io
from pathlib import Path
import av

MAX_PIXELS = 4096 * 4096
MAX_SECONDS = 3600
FRAME_COUNT = 24
MAX_EDGE = 960


def png_frame(frame, destination):
    if frame.width * frame.height > MAX_PIXELS:
        raise ValueError('Source frame exceeds the pixel limit.')
    ratio = min(1, MAX_EDGE / max(frame.width, frame.height))
    frame = frame.reformat(width=max(1, int(frame.width * ratio)), height=max(1, int(frame.height * ratio)), format='rgb24')
    codec = av.CodecContext.create('png', 'w')
    codec.width, codec.height, codec.pix_fmt = frame.width, frame.height, 'rgb24'
    destination.write_bytes(b''.join(bytes(packet) for packet in [*codec.encode(frame), *codec.encode(None)]))


def extract(source, output):
    source = Path(source).resolve(strict=True)
    if source.suffix not in ['.mp4', '.webm', '.png', '.jpg', '.webp']:
        raise ValueError('Unsupported archived media type.')
    if source.stat().st_size > 32 * 1024 * 1024:
        raise ValueError('Source exceeds the decoder input limit.')
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    with av.open(io.BytesIO(source.read_bytes()), options={'protocol_whitelist': 'pipe'}) as container:
        stream = container.streams.video[0]
        if stream.width * stream.height > MAX_PIXELS:
            raise ValueError('Source dimensions exceed the pixel limit.')
        stream.codec_context.thread_count = 2
        duration = float(stream.duration * stream.time_base) if stream.duration else (container.duration or 0) / av.time_base
        if source.suffix in ['.png', '.jpg', '.webp']:
            duration = 0
        elif not math.isfinite(duration) or duration <= 0 or duration > MAX_SECONDS:
            raise ValueError('Videos need a known duration of at most 60 minutes.')
        times = [0] if not duration else [duration * i / FRAME_COUNT for i in range(FRAME_COUNT)]
        result, seen = [], set()
        for target in times:
            if duration:
                container.seek(int(target / stream.time_base), stream=stream, backward=True)
            for index, frame in enumerate(container.decode(stream)):
                actual = float(frame.time or 0)
                if index > 600:
                    raise ValueError('Video keyframes are too sparse for bounded decoding.')
                if duration and actual + .05 < target:
                    continue
                key = round(actual, 3)
                if key not in seen:
                    seen.add(key)
                    filename = f'frame-{len(result):02}.png'
                    png_frame(frame, output / filename)
                    result.append({'filename': filename, 'seconds': key})
                break
        if not result:
            raise ValueError('No video frames could be decoded.')
        return {'duration': duration, 'frames': result, 'coverage': 'Sampled visuals only; audio is not transcribed. Fast changes and hidden blocks may be missed.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('output')
    args = parser.parse_args()
    try:
        print(json.dumps(extract(args.source, args.output)))
    except Exception:
        raise SystemExit('Media decoding failed. Use a supported local image or a video of at most 60 minutes, up to 4096×4096 pixels.')
