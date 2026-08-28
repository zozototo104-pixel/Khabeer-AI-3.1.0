import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SAMPLE_RATE = 16_000;

export interface SortformerRegion {
  speaker: string;
  startSec: number;
  endSec: number;
  pcm: Float32Array;
}

function pcm16Wav(samples: Float32Array): Buffer {
  const dataBytes = samples.length * 2;
  const out = Buffer.allocUnsafe(44 + dataBytes);
  out.write('RIFF', 0); out.writeUInt32LE(36 + dataBytes, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22); out.writeUInt32LE(SAMPLE_RATE, 24);
  out.writeUInt32LE(SAMPLE_RATE * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), 44 + i * 2);
  }
  return out;
}

export class SortformerDiarizationService {
  private readonly binary = process.env.NEMO_SPEECH_BIN || '/opt/nemo/bin/nemo-speech';
  private readonly model = process.env.SORTFORMER_MODEL || '/opt/nemo/models/sortformer-v2.q8_0.gguf';

  public async diarize(pcm: Float32Array): Promise<SortformerRegion[]> {
    if (pcm.length < SAMPLE_RATE) return [];
    const dir = await mkdtemp(path.join(os.tmpdir(), 'khabeer-sortformer-'));
    const wav = path.join(dir, 'speech.wav');
    const rttm = path.join(dir, 'speech.rttm');
    try {
      await writeFile(wav, pcm16Wav(pcm));
      await execFileAsync(this.binary, ['diarize', wav, '--model', this.model, '--format', 'rttm', '--output', rttm], {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      });
      const text = await readFile(rttm, 'utf8');
      return text.split(/\r?\n/).flatMap((line) => {
        const f = line.trim().split(/\s+/);
        if (f[0] !== 'SPEAKER' || f.length < 8) return [];
        const startSec = Number(f[3]);
        const durationSec = Number(f[4]);
        if (!Number.isFinite(startSec) || !Number.isFinite(durationSec) || durationSec < 0.35) return [];
        const from = Math.max(0, Math.floor(startSec * SAMPLE_RATE));
        const to = Math.min(pcm.length, Math.ceil((startSec + durationSec) * SAMPLE_RATE));
        if (to - from < SAMPLE_RATE * 0.35) return [];
        return [{ speaker: f[7], startSec, endSec: startSec + durationSec, pcm: pcm.slice(from, to) }];
      });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export const sortformerDiarizationService = new SortformerDiarizationService();
