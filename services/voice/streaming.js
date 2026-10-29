import { Readable } from 'node:stream';

const CHUNK_CHARACTERS = 180;
export function speechChunks(text) {
  const sentences = [...new Intl.Segmenter('en', { granularity:'sentence' }).segment(text)].map(value=>value.segment.trim()).filter(Boolean);
  return sentences.flatMap(sentence=>{
    const result=[]; let chunk='';
    for(const word of sentence.split(/\s+/)) {
      if(chunk && chunk.length+word.length+1>CHUNK_CHARACTERS){result.push(chunk);chunk='';}
      chunk += (chunk?' ':'')+word;
    }
    if(chunk)result.push(chunk);
    return result;
  });
}

// Each line contains one complete WAV. Playback can begin while the next
// sentence is synthesized; no partially validated model actions are executed.
export function speechStream({ text, synthesize, signal, gate, firstAudio }) {
  return Readable.from((async function* () {
    let index=0;
    for(const chunk of speechChunks(text)) {
      signal.throwIfAborted(); gate();
      const audio=await synthesize(chunk,signal);
      signal.throwIfAborted(); gate();
      if(index===0)firstAudio?.();
      yield JSON.stringify({ index:index++, audio:audio.toString('base64') })+'\n';
    }
  })(), { highWaterMark:1, signal });
}
