import { prepareVoicePreviews, stopVoice } from './index.js';
process.once('SIGINT', () => { void stopVoice(); process.exitCode = 1; });
try { await prepareVoicePreviews(result => console.log(`${result.voice}: ${result.cached ? 'ready' : 'prepared'}`)); }
finally { await stopVoice(); }
