"""Creates a tiny owned video fixture from locally rendered cards, no downloads."""
import sys
import av
from fractions import Fraction

with av.open(sys.argv[1], 'w') as output:
    stream = output.add_stream('mpeg4', rate=2)
    stream.width, stream.height, stream.pix_fmt = 960, 640, 'yuv420p'
    index = 0
    for image in sys.argv[2:]:
        with av.open(image) as source:
            frame = next(source.decode(video=0)).reformat(960, 640, 'yuv420p')
        for _ in range(8):
            current = av.VideoFrame.from_ndarray(frame.to_ndarray(format='rgb24'), format='rgb24')
            current.pts, current.time_base = index, Fraction(1, 2)
            index += 1
            for packet in stream.encode(current):
                output.mux(packet)
    for packet in stream.encode():
        output.mux(packet)
