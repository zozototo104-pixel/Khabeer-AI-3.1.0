import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { AudioFeatures } from '../../../src/lib/speaker/AudioFeatures.ts';

export type SpeakerEngineMode = 'NEURAL' | 'ACOUSTIC_FALLBACK' | 'UNAVAILABLE';

const OFFICIAL_MODEL_FILE = '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx';
const OFFICIAL_MODEL_SHA256 = '1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b';
const OFFICIAL_MODEL_SIZE = 39_593_761;
const EXPECTED_EMBEDDING_DIM = 512;
const OFFICIAL_MODEL_ID = `sherpa-onnx/3dspeaker-eres2net-base-16k@${OFFICIAL_MODEL_SHA256.slice(0, 12)}`;

const getModuleDir = () => {
  try {
    return typeof import.meta?.dirname === 'string' ? import.meta.dirname : path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
};

function safeThreadCount(): number {
  const requested = Number(process.env.SPEAKER_MODEL_THREADS || 2);
  return Number.isInteger(requested) ? Math.max(1, Math.min(8, requested)) : 2;
}

function fallbackAllowed(): boolean {
  // Safety-first default: do not silently create persistent voiceprints from a
  // different embedding space when the neural model is unavailable.
  return process.env.ALLOW_ACOUSTIC_FALLBACK === 'true';
}

const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const { createRequire } = require('node:module');
const path = require('node:path');

function l2Normalize(values) {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i] * values[i];
  const norm = Math.sqrt(sum);
  if (!Number.isFinite(norm) || norm < 1e-12) throw new Error('INVALID_NEURAL_EMBEDDING');
  return Array.from(values, (value) => value / norm);
}

let extractor = null;
try {
  const runtimeRequire = createRequire(path.join(workerData.cwd, 'package.json'));
  const sherpa = runtimeRequire('sherpa-onnx-node');
  extractor = new sherpa.SpeakerEmbeddingExtractor({
    model: workerData.modelPath,
    numThreads: workerData.numThreads,
    debug: workerData.debug,
    provider: workerData.provider,
  });
  const dim = Number(extractor.dim) || 0;
  if (dim !== 512) throw new Error('UNEXPECTED_EMBEDDING_DIM: got ' + dim + ', expected 512');
  parentPort.postMessage({ type: 'ready', dim, version: sherpa.version, onnxruntimeVersion: sherpa.onnxruntimeVersion });
} catch (error) {
  parentPort.postMessage({ type: 'init_error', error: error && error.message ? error.message : String(error) });
}

parentPort.on('message', (message) => {
  if (!message || message.type !== 'embed') return;
  const id = message.id;
  try {
    if (!extractor) throw new Error('SPEAKER_WORKER_NOT_READY');
    const samples = new Float32Array(message.buffer);
    const stream = extractor.createStream();
    stream.acceptWaveform({ sampleRate: 16000, samples });
    stream.inputFinished();
    if (!extractor.isReady(stream)) throw new Error('INSUFFICIENT_AUDIO_FOR_NEURAL_EMBEDDING');
    const embedding = extractor.compute(stream, false);
    parentPort.postMessage({ type: 'result', id, embedding: l2Normalize(embedding) });
  } catch (error) {
    parentPort.postMessage({ type: 'error', id, error: error && error.message ? error.message : String(error) });
  }
});
`;

/**
 * Neural speaker embedding service.
 *
 * Important realtime invariant: all sherpa/ONNX inference happens inside a
 * dedicated Worker Thread. The websocket event loop that carries microphone
 * and AI audio never runs extractor.compute() itself.
 */
export class SpeakerRecognitionService {
  private modelPath: string;
  private worker: Worker | null = null;
  private workerReady: Promise<boolean> | null = null;
  private neuralAvailable = false;
  private loadError = '';
  private embeddingDimension = 512;
  private modelHash = '';
  private runtimeVersion = '';
  private onnxRuntimeVersion = '';
  private requestCounter = 0;
  private pending = new Map<number, { resolve: (value: number[]) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

  constructor(modelPath?: string) {
    this.modelPath = modelPath ? path.resolve(modelPath) : this.resolveBestModelPath();
  }

  private resolveBestModelPath(): string {
    const moduleDir = getModuleDir();
    const candidates = [
      process.env.SPEAKER_MODEL_PATH,
      path.join(process.cwd(), 'models', OFFICIAL_MODEL_FILE),
      path.join(process.cwd(), 'dist', 'models', OFFICIAL_MODEL_FILE),
      path.join(moduleDir, '..', '..', '..', 'models', OFFICIAL_MODEL_FILE),
      path.join(moduleDir, '..', '..', 'models', OFFICIAL_MODEL_FILE),
      path.join(moduleDir, '..', 'models', OFFICIAL_MODEL_FILE),
      path.join(moduleDir, 'models', OFFICIAL_MODEL_FILE),
      path.join('/app/applet/models', OFFICIAL_MODEL_FILE),
      path.join('/app/models', OFFICIAL_MODEL_FILE),
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          const stats = fs.statSync(candidate);
          if (stats.isFile() && stats.size > 1_000_000) return path.resolve(candidate);
        }
      } catch {}
    }
    return path.resolve(candidates[1] || path.join(process.cwd(), 'models', OFFICIAL_MODEL_FILE));
  }

  private expectedHash(): string {
    return (process.env.SPEAKER_MODEL_SHA256 || (path.basename(this.modelPath) === OFFICIAL_MODEL_FILE ? OFFICIAL_MODEL_SHA256 : '')).toLowerCase();
  }

  private hashModel(): string {
    if (!this.modelHash && fs.existsSync(this.modelPath)) {
      this.modelHash = crypto.createHash('sha256').update(fs.readFileSync(this.modelPath)).digest('hex');
    }
    return this.modelHash;
  }

  private validateModel(): void {
    this.modelPath = this.resolveBestModelPath();
    if (!fs.existsSync(this.modelPath)) throw new Error(`SPEAKER_MODEL_FILE_NOT_FOUND at ${this.modelPath}`);
    const stats = fs.statSync(this.modelPath);
    if (!stats.isFile() || stats.size < 1_000_000) throw new Error(`SPEAKER_MODEL_MISSING_OR_TRUNCATED (Size: ${stats.size} bytes)`);
    const actualHash = this.hashModel();
    const expectedHash = this.expectedHash();
    if (expectedHash && actualHash !== expectedHash) {
      throw new Error(`SPEAKER_MODEL_HASH_MISMATCH: expected ${expectedHash}, got ${actualHash}`);
    }
  }

  private async ensureWorker(): Promise<boolean> {
    if (this.worker && this.neuralAvailable) return true;
    if (this.workerReady) return this.workerReady;

    this.workerReady = new Promise<boolean>((resolve) => {
      try {
        this.validateModel();
        const worker = new Worker(WORKER_SOURCE, {
          eval: true,
          workerData: {
            cwd: process.cwd(),
            modelPath: this.modelPath,
            numThreads: safeThreadCount(),
            debug: process.env.SPEAKER_MODEL_DEBUG === 'true',
            provider: process.env.SPEAKER_EXECUTION_PROVIDER || 'cpu',
          },
        });
        this.worker = worker;

        const failInit = (message: string) => {
          this.loadError = message;
          this.neuralAvailable = false;
          if (this.worker === worker) this.worker = null;
          try { void worker.terminate(); } catch {}
          resolve(false);
        };

        worker.on('message', (message: any) => {
          if (message?.type === 'ready') {
            const dim = Number(message.dim);
            if (dim !== EXPECTED_EMBEDDING_DIM) {
              failInit(`UNEXPECTED_EMBEDDING_DIM: got ${dim}, expected ${EXPECTED_EMBEDDING_DIM}`);
              return;
            }
            this.embeddingDimension = dim;
            this.runtimeVersion = String(message.version || '');
            this.onnxRuntimeVersion = String(message.onnxruntimeVersion || '');
            this.neuralAvailable = true;
            this.loadError = '';
            console.log(`[SpeakerRecognition] Neural worker ready from ${this.modelPath} (Dimension: ${this.embeddingDimension})`);
            resolve(true);
            return;
          }
          if (message?.type === 'init_error') {
            failInit(String(message.error || 'SPEAKER_WORKER_INIT_FAILED'));
            return;
          }
          if (message?.type === 'result' || message?.type === 'error') {
            const pending = this.pending.get(Number(message.id));
            if (!pending) return;
            clearTimeout(pending.timer);
            this.pending.delete(Number(message.id));
            if (message.type === 'result') {
              const embedding = Array.isArray(message.embedding) ? message.embedding : [];
              if (embedding.length !== EXPECTED_EMBEDDING_DIM) {
                pending.reject(new Error(`UNEXPECTED_EMBEDDING_DIM: got ${embedding.length}, expected ${EXPECTED_EMBEDDING_DIM}`));
              } else {
                pending.resolve(embedding);
              }
            } else pending.reject(new Error(String(message.error || 'SPEAKER_WORKER_INFERENCE_FAILED')));
          }
        });

        worker.on('error', (error) => {
          this.loadError = error.message;
          this.neuralAvailable = false;
          for (const [, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(error);
          }
          this.pending.clear();
          if (!this.neuralAvailable) failInit(error.message);
        });

        worker.on('exit', (code) => {
          if (this.worker === worker) this.worker = null;
          if (code !== 0) {
            this.neuralAvailable = false;
            this.loadError = `SPEAKER_WORKER_EXIT_${code}`;
          }
          this.workerReady = null;
        });
      } catch (error: any) {
        this.loadError = error?.message || String(error);
        this.neuralAvailable = false;
        resolve(false);
      }
    }).finally(() => {
      // Keep a resolved ready promise only while the worker is alive.
      if (!this.worker) this.workerReady = null;
    });

    return this.workerReady;
  }

  public async checkHealth(): Promise<Record<string, unknown>> {
    const neuralAvailable = await this.ensureWorker();
    let sizeBytes = 0;
    try { sizeBytes = fs.statSync(this.modelPath).size; } catch {}

    return {
      available: neuralAvailable || fallbackAllowed(),
      neuralAvailable,
      mode: this.getMode(),
      engine: neuralAvailable ? 'sherpa-onnx-node-worker' : (fallbackAllowed() ? 'acoustic-fallback' : 'none'),
      runtimeVersion: this.runtimeVersion || undefined,
      onnxRuntimeVersion: this.onnxRuntimeVersion || undefined,
      model: neuralAvailable ? '3D-Speaker ERes2Net Base 16kHz' : (fallbackAllowed() ? 'Acoustic Fallback Embedding Engine' : 'غير متاح'),
      modelId: this.getModelId(),
      path: this.modelPath,
      sizeBytes,
      expectedSizeBytes: path.basename(this.modelPath) === OFFICIAL_MODEL_FILE ? OFFICIAL_MODEL_SIZE : undefined,
      sha256: this.modelHash || undefined,
      expectedSha256: this.expectedHash() || undefined,
      embeddingDimension: this.embeddingDimension,
      sampleRate: 16_000,
      realtimeIsolation: 'worker-thread',
      warning: neuralAvailable ? undefined : (fallbackAllowed() ? 'Using acoustic fallback embedding engine.' : this.loadError || 'Install the verified ERes2Net model.'),
    };
  }

  public async getEmbedding(pcmData: Float32Array): Promise<number[]> {
    const quality = AudioFeatures.checkAudioQuality(pcmData);
    if (!quality.isValid) throw new Error(`LOW_AUDIO_QUALITY:${quality.reason}`);

    const neuralReady = await this.ensureWorker();
    if (!neuralReady || !this.worker) {
      if (fallbackAllowed()) {
        const fallback = AudioFeatures.extractEmbedding(pcmData);
        this.embeddingDimension = fallback.length;
        return fallback;
      }
      throw new Error(`NEURAL_SPEAKER_MODEL_UNAVAILABLE:${this.loadError || 'MODEL_NOT_LOADED'}`);
    }

    const id = ++this.requestCounter;
    // Copy into an isolated transferable buffer so the caller keeps ownership
    // of its live PCM segment while inference runs off-thread.
    const copy = new Float32Array(pcmData);
    return new Promise<number[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('SPEAKER_WORKER_TIMEOUT'));
      }, 4500);
      this.pending.set(id, { resolve, reject, timer });
      this.worker!.postMessage({ type: 'embed', id, buffer: copy.buffer }, [copy.buffer]);
    });
  }

  public getMode(): SpeakerEngineMode {
    if (this.neuralAvailable) return 'NEURAL';
    return fallbackAllowed() ? 'ACOUSTIC_FALLBACK' : 'UNAVAILABLE';
  }

  public getEmbeddingDimension(): number {
    return this.embeddingDimension;
  }

  public getModelId(): string {
    if (this.neuralAvailable || path.basename(this.modelPath) === OFFICIAL_MODEL_FILE) return OFFICIAL_MODEL_ID;
    return this.getMode() === 'ACOUSTIC_FALLBACK' ? 'acoustic-fallback-v1' : 'unavailable';
  }
}

export const speakerRecognitionService = new SpeakerRecognitionService();
export const OFFICIAL_SPEAKER_MODEL = {
  fileName: OFFICIAL_MODEL_FILE,
  sha256: OFFICIAL_MODEL_SHA256,
  sizeBytes: OFFICIAL_MODEL_SIZE,
  modelId: OFFICIAL_MODEL_ID,
} as const;
