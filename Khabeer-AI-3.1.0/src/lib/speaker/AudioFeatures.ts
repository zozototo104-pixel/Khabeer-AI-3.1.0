import { SPEAKER_THRESHOLDS } from './types.ts';

/**
 * AudioFeatures: Extracts 128-dimensional acoustic Voice Embeddings from PCM audio.
 * Uses Mel-Frequency Cepstral Coefficients (MFCC), Liftering, Delta, Delta-Delta,
 * and Temporal Statistical Pooling followed by L2-normalization.
 */
export class AudioFeatures {
  private static readonly SAMPLE_RATE = SPEAKER_THRESHOLDS.SAMPLE_RATE; // 16000 Hz
  private static readonly FRAME_SIZE = 400; // 25ms @ 16kHz
  private static readonly HOP_SIZE = 160;   // 10ms @ 16kHz
  private static readonly NUM_MEL_FILTERS = 32;
  private static readonly NUM_MFCC = 20;
  private static readonly FFT_SIZE = 512;
  private static readonly LIFTER_L = 22;

  /**
   * Pre-emphasis filter: boosts high frequencies to balance the spectrum
   */
  private static preEmphasis(signal: Float32Array, alpha = 0.97): Float32Array {
    const output = new Float32Array(signal.length);
    output[0] = signal[0];
    for (let i = 1; i < signal.length; i++) {
      output[i] = signal[i] - alpha * signal[i - 1];
    }
    return output;
  }

  /**
   * Hamming Window function
   */
  private static applyHammingWindow(frame: Float32Array): Float32Array {
    const N = frame.length;
    const windowed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
      windowed[i] = frame[i] * w;
    }
    return windowed;
  }

  /**
   * Real-valued Fast Fourier Transform (Cooley-Tukey Radix-2)
   */
  private static fft(input: Float32Array): { real: Float32Array; imag: Float32Array } {
    const N = this.FFT_SIZE;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);

    const len = Math.min(input.length, N);
    for (let i = 0; i < len; i++) {
      real[i] = input[i];
    }

    let j = 0;
    for (let i = 0; i < N - 1; i++) {
      if (i < j) {
        const tempR = real[i];
        real[i] = real[j];
        real[j] = tempR;
      }
      let k = N >> 1;
      while (k <= j) {
        j -= k;
        k >>= 1;
      }
      j += k;
    }

    for (let step = 1; step < N; step <<= 1) {
      const jump = step << 1;
      const deltaAngle = -Math.PI / step;
      for (let group = 0; group < step; group++) {
        const angle = group * deltaAngle;
        const cosW = Math.cos(angle);
        const sinW = Math.sin(angle);

        for (let pair = group; pair < N; pair += jump) {
          const match = pair + step;
          const tr = cosW * real[match] - sinW * imag[match];
          const ti = sinW * real[match] + cosW * imag[match];

          real[match] = real[pair] - tr;
          imag[match] = imag[pair] - ti;
          real[pair] += tr;
          imag[pair] += ti;
        }
      }
    }

    return { real, imag };
  }

  /**
   * Compute Power Spectrum: |X(f)|^2
   */
  private static powerSpectrum(real: Float32Array, imag: Float32Array): Float32Array {
    const numBins = this.FFT_SIZE / 2 + 1;
    const power = new Float32Array(numBins);
    for (let i = 0; i < numBins; i++) {
      power[i] = (real[i] * real[i] + imag[i] * imag[i]) / this.FFT_SIZE;
    }
    return power;
  }

  private static hzToMel(hz: number): number {
    return 2595 * Math.log10(1 + hz / 700);
  }

  private static melToHz(mel: number): number {
    return 700 * (Math.pow(10, mel / 2595) - 1);
  }

  private static createMelFilterbanks(): Float32Array[] {
    const numFilters = this.NUM_MEL_FILTERS;
    const numBins = this.FFT_SIZE / 2 + 1;
    const lowFreq = 80;
    const highFreq = 7600;

    const lowMel = this.hzToMel(lowFreq);
    const highMel = this.hzToMel(highFreq);
    const melPoints = new Float32Array(numFilters + 2);
    const binPoints = new Int32Array(numFilters + 2);

    for (let i = 0; i < numFilters + 2; i++) {
      melPoints[i] = lowMel + (i * (highMel - lowMel)) / (numFilters + 1);
      const hz = this.melToHz(melPoints[i]);
      binPoints[i] = Math.floor(((this.FFT_SIZE + 1) * hz) / this.SAMPLE_RATE);
    }

    const filters: Float32Array[] = [];
    for (let m = 1; m <= numFilters; m++) {
      const filter = new Float32Array(numBins);
      const left = binPoints[m - 1];
      const center = binPoints[m];
      const right = binPoints[m + 1];

      for (let k = left; k < center; k++) {
        filter[k] = (k - left) / (center - left);
      }
      for (let k = center; k < right; k++) {
        filter[k] = (right - k) / (right - center);
      }
      filters.push(filter);
    }
    return filters;
  }

  private static melFilterbanksCache: Float32Array[] | null = null;

  private static getMelFilterbanks(): Float32Array[] {
    if (!this.melFilterbanksCache) {
      this.melFilterbanksCache = this.createMelFilterbanks();
    }
    return this.melFilterbanksCache;
  }

  /**
   * Discrete Cosine Transform (DCT-II) with Cepstral Liftering for Speaker Characterization
   */
  private static dct(logEnergies: Float32Array, numCoeffs: number): Float32Array {
    const N = logEnergies.length;
    const coeffs = new Float32Array(numCoeffs);
    for (let k = 0; k < numCoeffs; k++) {
      let sum = 0;
      for (let n = 0; n < N; n++) {
        sum += logEnergies[n] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N));
      }
      const rawCoeff = sum * (k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N));
      // Apply cepstral lifter to suppress constant DC and balance higher formants
      const lifter = k === 0 ? 0.2 : (1 + (this.LIFTER_L / 2) * Math.sin((Math.PI * k) / this.LIFTER_L));
      coeffs[k] = rawCoeff * lifter;
    }
    return coeffs;
  }

  /**
   * Compute first and second order delta coefficients
   */
  private static computeDeltas(features: Float32Array[], N = 2): Float32Array[] {
    const numFrames = features.length;
    if (numFrames === 0) return [];
    const featDim = features[0].length;
    const deltas: Float32Array[] = [];

    const denom = 2 * Array.from({ length: N }, (_, i) => (i + 1) * (i + 1)).reduce((a, b) => a + b, 0);

    for (let t = 0; t < numFrames; t++) {
      const delta = new Float32Array(featDim);
      for (let d = 0; d < featDim; d++) {
        let num = 0;
        for (let n = 1; n <= N; n++) {
          const prev = Math.max(0, t - n);
          const next = Math.min(numFrames - 1, t + n);
          num += n * (features[next][d] - features[prev][d]);
        }
        delta[d] = num / denom;
      }
      deltas.push(delta);
    }
    return deltas;
  }

  /**
   * Extract Mel filterbank profile and MFCC frame features
   */
  
  public static checkAudioQuality(pcmAudio: Float32Array): { isValid: boolean, reason?: string, rms: number, zcr: number } {
    if (pcmAudio.length < 16000 * 0.4) {
      return { isValid: false, reason: 'TOO_SHORT', rms: 0, zcr: 0 };
    }
    
    let energy = 0;
    let zcr = 0;
    for (let i = 0; i < pcmAudio.length; i++) {
      if (!Number.isFinite(pcmAudio[i])) {
        return { isValid: false, reason: 'INVALID_PCM', rms: 0, zcr: 0 };
      }
      energy += pcmAudio[i] * pcmAudio[i];
      if (i > 0) {
        if ((pcmAudio[i] >= 0 && pcmAudio[i - 1] < 0) || (pcmAudio[i] < 0 && pcmAudio[i - 1] >= 0)) {
          zcr++;
        }
      }
    }
    const rms = Math.sqrt(energy / pcmAudio.length);
    const zcrRate = zcr / pcmAudio.length;

    if (!Number.isFinite(rms) || !Number.isFinite(zcrRate)) {
      return { isValid: false, reason: 'INVALID_PCM', rms: 0, zcr: 0 };
    }

    if (rms < 0.003) {
      return { isValid: false, reason: 'LOW_ENERGY', rms, zcr: zcrRate };
    }

    if (zcrRate > 0.4 || zcrRate < 0.001) {
      return { isValid: false, reason: 'NOISE_OR_TONE', rms, zcr: zcrRate };
    }

    return { isValid: true, rms, zcr: zcrRate };
  }

  public static extractFrameFeatures(pcmAudio: Float32Array): { mfccs: Float32Array[]; melProfiles: Float32Array[] } {
    if (pcmAudio.length < this.FRAME_SIZE) {
      return { mfccs: [], melProfiles: [] };
    }

    const preEmphasized = this.preEmphasis(pcmAudio);
    const filterbanks = this.getMelFilterbanks();
    const frameCount = Math.floor((preEmphasized.length - this.FRAME_SIZE) / this.HOP_SIZE) + 1;
    const staticMfccs: Float32Array[] = [];
    const staticMels: Float32Array[] = [];

    for (let i = 0; i < frameCount; i++) {
      const start = i * this.HOP_SIZE;
      const rawFrame = preEmphasized.subarray(start, start + this.FRAME_SIZE);

      let frameEnergy = 0;
      for (let j = 0; j < rawFrame.length; j++) {
        frameEnergy += rawFrame[j] * rawFrame[j];
      }
      const rms = Math.sqrt(frameEnergy / rawFrame.length);
      if (rms < 0.005) {
        continue;
      }

      const windowed = this.applyHammingWindow(rawFrame);
      const { real, imag } = this.fft(windowed);
      const power = this.powerSpectrum(real, imag);

      const logMelEnergies = new Float32Array(this.NUM_MEL_FILTERS);
      for (let m = 0; m < this.NUM_MEL_FILTERS; m++) {
        let filterEnergy = 0;
        const filter = filterbanks[m];
        for (let k = 0; k < power.length; k++) {
          filterEnergy += power[k] * filter[k];
        }
        logMelEnergies[m] = Math.log(Math.max(filterEnergy, 1e-10));
      }

      const mfcc = this.dct(logMelEnergies, this.NUM_MFCC);
      staticMfccs.push(mfcc);
      staticMels.push(logMelEnergies);
    }

    return { mfccs: staticMfccs, melProfiles: staticMels };
  }

  /**
   * Generates a 128-dimensional Voice Embedding via Cepstral Mean Subtraction,
   * Mel filterbank envelope pooling, dynamic trajectories, and L2 Normalization.
   */
  public static extractEmbedding(pcmAudio: Float32Array): number[] {
    const { mfccs, melProfiles } = this.extractFrameFeatures(pcmAudio);
    const embedding = new Float32Array(SPEAKER_THRESHOLDS.EMBEDDING_DIM);

    if (mfccs.length === 0) {
      return Array.from(this.l2Normalize(embedding));
    }

    const numFrames = mfccs.length;
    const numMfcc = this.NUM_MFCC; // 20

    // 1. Cepstral Mean Subtraction (CMS) across frames to remove channel offset
    const mfccMeans = new Float32Array(numMfcc);
    for (let t = 0; t < numFrames; t++) {
      for (let d = 0; d < numMfcc; d++) {
        mfccMeans[d] += mfccs[t][d];
      }
    }
    for (let d = 0; d < numMfcc; d++) {
      mfccMeans[d] /= numFrames;
    }

    const normalizedMfccs: Float32Array[] = [];
    for (let t = 0; t < numFrames; t++) {
      const norm = new Float32Array(numMfcc);
      for (let d = 0; d < numMfcc; d++) {
        norm[d] = mfccs[t][d] - (d === 0 ? 0 : mfccMeans[d]); // Keep energy variation
      }
      normalizedMfccs.push(norm);
    }

    const deltas = this.computeDeltas(normalizedMfccs);
    const deltaDeltas = this.computeDeltas(deltas);

    // 2. Mean Pooling of MFCCs (Dims 0..19), Deltas (Dims 20..39), Delta-Deltas (Dims 40..59)
    for (let t = 0; t < numFrames; t++) {
      for (let d = 0; d < numMfcc; d++) {
        embedding[d] += normalizedMfccs[t][d];
        embedding[20 + d] += deltas[t][d];
        embedding[40 + d] += deltaDeltas[t][d];
      }
    }
    for (let d = 0; d < numMfcc; d++) {
      embedding[d] /= numFrames;
      embedding[20 + d] /= numFrames;
      embedding[40 + d] /= numFrames;
    }

    // 3. Variance / StdDev Pooling (Dims 60..79 for MFCCs, Dims 80..95 for Mel Filterbank envelope)
    for (let t = 0; t < numFrames; t++) {
      for (let d = 0; d < numMfcc; d++) {
        const diff = normalizedMfccs[t][d] - embedding[d];
        embedding[60 + d] += diff * diff;
      }
    }
    for (let d = 0; d < numMfcc; d++) {
      embedding[60 + d] = Math.sqrt(embedding[60 + d] / numFrames);
    }

    // 4. Mel Filterbank Spectral Envelope Shape (Dims 80..111: 32 Mel filter energies normalized)
    const melMean = new Float32Array(this.NUM_MEL_FILTERS);
    for (let t = 0; t < melProfiles.length; t++) {
      for (let m = 0; m < this.NUM_MEL_FILTERS; m++) {
        melMean[m] += melProfiles[t][m];
      }
    }
    let melSum = 0;
    for (let m = 0; m < this.NUM_MEL_FILTERS; m++) {
      melMean[m] /= melProfiles.length;
      melSum += melMean[m];
    }
    const melAvg = melSum / this.NUM_MEL_FILTERS;
    for (let m = 0; m < this.NUM_MEL_FILTERS; m++) {
      embedding[80 + m] = (melMean[m] - melAvg) * 1.5; // Relative spectral slope
    }

    // 5. Fine Acoustic Signatures & Harmonic Dynamics (Dims 112..127)
    let zcr = 0;
    for (let i = 1; i < pcmAudio.length; i++) {
      if ((pcmAudio[i] >= 0 && pcmAudio[i - 1] < 0) || (pcmAudio[i] < 0 && pcmAudio[i - 1] >= 0)) {
        zcr++;
      }
    }
    const zcrRate = zcr / Math.max(1, pcmAudio.length);

    embedding[112] = zcrRate * 8.0;
    embedding[113] = (embedding[1] - embedding[2]) * 2.0; // 1st/2nd formant ratio
    embedding[114] = (embedding[2] - embedding[3]) * 2.0; // 2nd/3rd formant ratio
    embedding[115] = (embedding[80] - embedding[95]) * 1.5; // Low-to-high spectral tilt
    embedding[116] = (embedding[85] - embedding[105]) * 1.5; // Mid-to-high spectral tilt

    for (let i = 117; i < 128; i++) {
      embedding[i] = (embedding[i - 37] || 0) * 0.5;
    }

    // 6. L2 Normalization
    return Array.from(this.l2Normalize(embedding));
  }

  public static l2Normalize(vector: Float32Array | number[]): Float32Array {
    const len = vector.length;
    const output = new Float32Array(len);
    let sumSq = 0;
    for (let i = 0; i < len; i++) {
      sumSq += vector[i] * vector[i];
    }
    const norm = Math.sqrt(sumSq);
    if (norm > 1e-12) {
      for (let i = 0; i < len; i++) {
        output[i] = vector[i] / norm;
      }
    }
    return output;
  }

  public static cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return Math.max(-1, Math.min(1, dot));
  }

  public static computeCentroid(embeddings: number[][]): number[] {
    if (!embeddings || embeddings.length === 0) {
      return new Array(SPEAKER_THRESHOLDS.EMBEDDING_DIM).fill(0);
    }
    if (embeddings.length === 1) {
      return [...embeddings[0]];
    }

    const dim = embeddings[0].length;
    const sum = new Float32Array(dim);
    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        sum[i] += emb[i];
      }
    }
    for (let i = 0; i < dim; i++) {
      sum[i] /= embeddings.length;
    }
    return Array.from(this.l2Normalize(sum));
  }
}
