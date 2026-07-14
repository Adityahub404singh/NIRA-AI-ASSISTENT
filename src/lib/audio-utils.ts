/**
 * Audio processing utilities for Gemini Live API
 */

export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private isWakeWordMode: boolean = false;
  private onWakeWord: (() => void) | null = null;
  private enrollmentBuffer: Float32Array[] = [];
  private isEnrolling: boolean = false;

  constructor(private onAudioData: (base64Data: string) => void, private onVolume?: (volume: number) => void) {}

  async start(options?: { wakeWord?: boolean, onWakeWord?: () => void }) {
    try {
      this.isWakeWordMode = options?.wakeWord || false;
      this.onWakeWord = options?.onWakeWord || null;

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      
      this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        if (this.isEnrolling) {
          this.enrollmentBuffer.push(new Float32Array(inputData));
        }

        // Calculate volume for visual feedback
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const volume = Math.sqrt(sum / inputData.length);
        this.onVolume?.(volume);

        if (this.isWakeWordMode) {
          // Simple Wake Word Detection: Check for sustained volume + frequency profile
          const bufferLength = this.analyser!.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          this.analyser!.getByteFrequencyData(dataArray);
          
          const average = dataArray.reduce((a, b) => a + b) / bufferLength;
          if (average > 60) { // Slightly higher threshold to reduce false triggers
            console.log("Wake word detected (volume-based)");
            this.isWakeWordMode = false;
            this.onWakeWord?.();
          }
          // Still send audio data even in wake word mode so session gets input
          const pcm16 = this.floatToPcm16(inputData);
          const base64 = this.arrayBufferToBase64(pcm16.buffer);
          this.onAudioData(base64);
          return;
        }

        // Check if there's actual audio (not just silence)
        const hasAudio = inputData.some(v => Math.abs(v) > 0.01);
        if (hasAudio && Math.random() < 0.01) { // Log occasionally
          console.log("Capturing audio data...");
        }

        const pcm16 = this.floatToPcm16(inputData);
        const base64 = this.arrayBufferToBase64(pcm16.buffer);
        this.onAudioData(base64);
      };

      this.source.connect(this.analyser);
      this.analyser.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
      console.log("Audio recorder started successfully");
    } catch (err) {
      console.error("Failed to start audio recorder:", err);
      throw err;
    }
  }

  startEnrollment() {
    this.isEnrolling = true;
    this.enrollmentBuffer = [];
  }

  async stopEnrollment(): Promise<Float32Array> {
    this.isEnrolling = false;
    const totalLength = this.enrollmentBuffer.reduce((acc, b) => acc + b.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const b of this.enrollmentBuffer) {
      result.set(b, offset);
      offset += b.length;
    }
    return result;
  }

  stop() {
    this.source?.disconnect();
    this.processor?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    this.audioContext?.close();
    
    this.source = null;
    this.processor = null;
    this.stream = null;
    this.audioContext = null;
  }

  private floatToPcm16(float32Array: Float32Array): Int16Array {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm16;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private analyser: AnalyserNode | null = null;

  constructor(private onVolume?: (volume: number) => void) {
    this.audioContext = new AudioContext({ sampleRate: 24000 });
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.connect(this.audioContext.destination);
    
    // Start volume monitoring loop
    this.monitorVolume();
  }

  private monitorVolume() {
    if (!this.audioContext || !this.analyser) return;
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    const update = () => {
      if (this.audioContext?.state === 'running') {
        this.analyser!.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        this.onVolume?.(average / 128); // Normalize to 0-1 approx
      }
      requestAnimationFrame(update);
    };
    update();
  }

  async playChunk(base64Data: string) {
    if (!this.audioContext || !this.analyser) return;
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const binary = atob(base64Data);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 0x8000;
    }

    const audioBuffer = this.audioContext.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.analyser); // Connect to analyser instead of destination directly

    const now = this.audioContext.currentTime;
    if (this.nextStartTime < now) {
      this.nextStartTime = now + 0.02; // Reduced buffer for lower latency
    }

    console.log("Playing audio chunk at", this.nextStartTime);
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }

  stop() {
    this.audioContext?.close();
    this.audioContext = new AudioContext({ sampleRate: 24000 });
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.connect(this.audioContext.destination);
    this.nextStartTime = 0;
    this.monitorVolume();
  }
}
