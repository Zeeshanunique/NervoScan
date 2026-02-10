/**
 * Audio Processor — Web Audio API + feature extraction.
 * Captures 48kHz audio and extracts features for live + final ML inference.
 * Uses ScriptProcessorNode for continuous audio capture.
 */

export interface AudioFeatures {
  rms: number;
  pitch: number;
  energy: number;
  spectralCentroid: number;
  zeroCrossingRate: number;
  samples: Float32Array;
}

const MAX_BUFFER_SECONDS = 10; // Keep last 10 seconds of audio

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
  private isRecording = false;

  // Continuous audio capture buffer (ring buffer of chunks)
  private continuousBuffer: Float32Array[] = [];
  private sampleRate = 48000;

  async start(): Promise<void> {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 48000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: 48000 });
    this.sampleRate = this.audioContext.sampleRate;

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.sourceNode.connect(this.analyser);

    // Continuous audio capture via ScriptProcessorNode
    // Connect through a zero-gain node so user doesn't hear themselves
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0; // Mute output

    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.isRecording) return;
      const input = event.inputBuffer.getChannelData(0);
      this.continuousBuffer.push(new Float32Array(input));

      // Trim to last MAX_BUFFER_SECONDS
      const maxChunks = Math.ceil((this.sampleRate * MAX_BUFFER_SECONDS) / 4096);
      if (this.continuousBuffer.length > maxChunks) {
        this.continuousBuffer = this.continuousBuffer.slice(-maxChunks);
      }
    };

    this.sourceNode.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    this.isRecording = true;
    this.continuousBuffer = [];
  }

  /**
   * Extract features from the current audio window for live updates.
   */
  extractFeatures(): AudioFeatures {
    if (!this.analyser || !this.audioContext) {
      return { rms: 0, pitch: 0, energy: 0, spectralCentroid: 0, zeroCrossingRate: 0, samples: new Float32Array(0) };
    }

    const bufferLength = this.analyser.fftSize;
    const timeDomainData = new Float32Array(bufferLength);
    const frequencyData = new Float32Array(this.analyser.frequencyBinCount);

    this.analyser.getFloatTimeDomainData(timeDomainData);
    this.analyser.getFloatFrequencyData(frequencyData);

    // RMS (loudness)
    let sumSquares = 0;
    for (let i = 0; i < timeDomainData.length; i++) {
      sumSquares += timeDomainData[i] * timeDomainData[i];
    }
    const rms = Math.sqrt(sumSquares / timeDomainData.length);

    // Zero crossing rate
    let zeroCrossings = 0;
    for (let i = 1; i < timeDomainData.length; i++) {
      if ((timeDomainData[i] >= 0 && timeDomainData[i - 1] < 0) ||
          (timeDomainData[i] < 0 && timeDomainData[i - 1] >= 0)) {
        zeroCrossings++;
      }
    }
    const zeroCrossingRate = zeroCrossings / timeDomainData.length;

    // Pitch estimation (autocorrelation)
    const pitch = this.estimatePitch(timeDomainData, this.audioContext.sampleRate);

    // Energy
    const energy = rms * rms * timeDomainData.length;

    // Spectral centroid
    const spectralCentroid = this.computeSpectralCentroid(frequencyData, this.audioContext.sampleRate);

    return { rms, pitch, energy, spectralCentroid, zeroCrossingRate, samples: timeDomainData };
  }

  /**
   * Get recent audio samples for final ML analysis on the backend.
   * Returns downsampled audio (16kHz) as a regular number array.
   * @param durationSec How many seconds of recent audio to return (default: 5)
   */
  getRecentSamples(durationSec: number = 5): { samples: number[]; sample_rate: number } {
    if (this.continuousBuffer.length === 0) {
      return { samples: [], sample_rate: 16000 };
    }

    // Concatenate continuous buffer
    const totalSamples = this.continuousBuffer.reduce((sum, buf) => sum + buf.length, 0);
    const combined = new Float32Array(totalSamples);
    let offset = 0;
    for (const buf of this.continuousBuffer) {
      combined.set(buf, offset);
      offset += buf.length;
    }

    // Take last N seconds at original sample rate
    const samplesToTake = Math.min(combined.length, this.sampleRate * durationSec);
    const recent = combined.slice(-samplesToTake);

    // Downsample from 48kHz to 16kHz (factor of 3)
    const targetRate = 16000;
    const ratio = this.sampleRate / targetRate;
    const downsampled: number[] = [];

    for (let i = 0; i < recent.length; i += ratio) {
      const idx = Math.floor(i);
      if (idx < recent.length) {
        downsampled.push(Math.round(recent[idx] * 10000) / 10000); // 4 decimal places to reduce JSON size
      }
    }

    return { samples: downsampled, sample_rate: targetRate };
  }

  /**
   * Get the native sample rate.
   */
  getSampleRate(): number {
    return this.sampleRate;
  }

  stop(): void {
    this.isRecording = false;
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
    this.continuousBuffer = [];
  }

  private estimatePitch(buffer: Float32Array, sampleRate: number): number {
    const size = buffer.length;
    const maxLag = Math.floor(sampleRate / 50);
    const minLag = Math.floor(sampleRate / 500);

    let bestCorrelation = -1;
    let bestLag = -1;

    for (let lag = minLag; lag < Math.min(maxLag, size / 2); lag++) {
      let correlation = 0;
      for (let i = 0; i < size - lag; i++) {
        correlation += buffer[i] * buffer[i + lag];
      }
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }

    if (bestLag > 0 && bestCorrelation > 0) {
      return sampleRate / bestLag;
    }
    return 0;
  }

  private computeSpectralCentroid(frequencyData: Float32Array, sampleRate: number): number {
    let numerator = 0;
    let denominator = 0;
    const nyquist = sampleRate / 2;

    for (let i = 0; i < frequencyData.length; i++) {
      const magnitude = Math.pow(10, frequencyData[i] / 20);
      const frequency = (i / frequencyData.length) * nyquist;
      numerator += magnitude * frequency;
      denominator += magnitude;
    }

    return denominator > 0 ? numerator / denominator : 0;
  }
}
