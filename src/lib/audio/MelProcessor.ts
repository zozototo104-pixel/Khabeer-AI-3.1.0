
/**
 * MelProcessor.ts
 * Specialized Digital Signal Processing for Deep Speaker Embedding Models (ERes2Net/Wespeaker)
 */

export interface MelProcessorOptions {
  sampleRate: number;
  nFft: number;
  winLength: number;
  hopLength: number;
  nMels: number;
  fMin: number;
  fMax: number;
}

export const DEFAULT_MEL_OPTIONS: MelProcessorOptions = {
  sampleRate: 16000,
  nFft: 512,
  winLength: 400, // 25ms
  hopLength: 160, // 10ms
  nMels: 80,
  fMin: 0,
  fMax: 8000,
};

export class MelProcessor {
  private options: MelProcessorOptions;
  private melBasis: number[][];
  private window: Float32Array;

  constructor(options: Partial<MelProcessorOptions> = {}) {
    this.options = { ...DEFAULT_MEL_OPTIONS, ...options };
    this.melBasis = this.createMelBasis();
    this.window = this.createHammingWindow(this.options.winLength);
  }

  /**
   * Main entry point: Raw PCM -> Mel Spectrogram [Time, nMels]
   */
  public process(pcm: Float32Array): Float32Array[] {
    // 1. Pre-emphasis
    const emphasized = this.preEmphasis(pcm);

    // 2. Framing & Windowing & FFT -> Magnitude Spectrogram
    const spectrogram = this.stft(emphasized);

    // 3. Apply Mel Filterbank
    const melSpectrogram = this.applyMelFilters(spectrogram);

    // 4. Log scale
    const logMel = melSpectrogram.map(frame => 
      frame.map(val => Math.log(Math.max(val, 1e-10)))
    );

    // 5. CMVN (Cepstral Mean and Variance Normalization) - Global per segment
    return this.applyCMVN(logMel);
  }

  private preEmphasis(pcm: Float32Array, coeff: number = 0.97): Float32Array {
    const out = new Float32Array(pcm.length);
    out[0] = pcm[0];
    for (let i = 1; i < pcm.length; i++) {
      out[i] = pcm[i] - coeff * pcm[i - 1];
    }
    return out;
  }

  private createHammingWindow(length: number): Float32Array {
    const win = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      win[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (length - 1));
    }
    return win;
  }

  private stft(pcm: Float32Array): number[][] {
    const { nFft, winLength, hopLength } = this.options;
    const frames: number[][] = [];
    
    for (let start = 0; start + winLength <= pcm.length; start += hopLength) {
      const real = new Float32Array(nFft).fill(0);
      const imag = new Float32Array(nFft).fill(0);
      
      for (let i = 0; i < winLength; i++) {
        real[i] = pcm[start + i] * this.window[i];
      }
      
      this.fft(real, imag);
      
      const magnitude = new Array(nFft / 2 + 1);
      for (let k = 0; k <= nFft / 2; k++) {
        magnitude[k] = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
      }
      frames.push(magnitude);
    }
    return frames;
  }

  private fft(real: Float32Array, imag: Float32Array): void {
    const n = real.length;
    if (n <= 1) return;

    for (let i = 0, j = 0; i < n; i++) {
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
      let m = n >> 1;
      while (m >= 1 && j >= m) {
        j -= m;
        m >>= 1;
      }
      j += m;
    }

    for (let len = 2; len <= n; len <<= 1) {
      const ang = (2 * Math.PI) / len;
      const wlen_real = Math.cos(ang);
      const wlen_imag = -Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let w_real = 1;
        let w_imag = 0;
        for (let j = 0; j < len / 2; j++) {
          const u_real = real[i + j];
          const u_imag = imag[i + j];
          const v_real = real[i + j + len / 2] * w_real - imag[i + j + len / 2] * w_imag;
          const v_imag = real[i + j + len / 2] * w_imag + imag[i + j + len / 2] * w_real;
          real[i + j] = u_real + v_real;
          imag[i + j] = u_imag + v_imag;
          real[i + j + len / 2] = u_real - v_real;
          imag[i + j + len / 2] = u_imag - v_imag;
          const tmp_real = w_real * wlen_real - w_imag * wlen_imag;
          w_imag = w_real * wlen_imag + w_imag * wlen_real;
          w_real = tmp_real;
        }
      }
    }
  }

  private createMelBasis(): number[][] {
    const { nFft, sampleRate, nMels, fMin, fMax } = this.options;
    const melMin = this.hzToMel(fMin);
    const melMax = this.hzToMel(fMax);
    
    const melPoints = new Float32Array(nMels + 2);
    for (let i = 0; i < nMels + 2; i++) {
      melPoints[i] = this.melToHz(melMin + (i * (melMax - melMin)) / (nMels + 1));
    }
    
    const binPoints = melPoints.map(hz => Math.floor(((nFft + 1) * hz) / sampleRate));
    const basis: number[][] = Array.from({ length: nMels }, () => new Array(nFft / 2 + 1).fill(0));
    
    for (let m = 1; m <= nMels; m++) {
      for (let k = binPoints[m - 1]; k < binPoints[m]; k++) {
        basis[m - 1][k] = (k - binPoints[m - 1]) / (binPoints[m] - binPoints[m - 1]);
      }
      for (let k = binPoints[m]; k < binPoints[m + 1]; k++) {
        basis[m - 1][k] = (binPoints[m + 1] - k) / (binPoints[m + 1] - binPoints[m]);
      }
    }
    return basis;
  }

  private hzToMel(hz: number): number {
    return 2595 * Math.log10(1 + hz / 700);
  }

  private melToHz(mel: number): number {
    return 700 * (Math.pow(10, mel / 2595) - 1);
  }

  private applyMelFilters(spectrogram: number[][]): number[][] {
    return spectrogram.map(frame => {
      return this.melBasis.map(filter => {
        let sum = 0;
        for (let i = 0; i < filter.length; i++) {
          sum += filter[i] * frame[i];
        }
        return sum;
      });
    });
  }

  private applyCMVN(melSpec: number[][]): Float32Array[] {
    if (melSpec.length === 0) return [];
    const nMels = melSpec[0].length;
    const numFrames = melSpec.length;
    const means = new Float32Array(nMels).fill(0);
    
    for (let i = 0; i < nMels; i++) {
      let sum = 0;
      for (let f = 0; f < numFrames; f++) {
        sum += melSpec[f][i];
      }
      means[i] = sum / numFrames;
    }

    return melSpec.map(frame => {
      const out = new Float32Array(nMels);
      for (let i = 0; i < nMels; i++) {
        out[i] = frame[i] - means[i];
      }
      return out;
    });
  }
}
