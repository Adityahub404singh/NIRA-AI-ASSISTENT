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
  private startId: number = 0; // 🔥 FIX: Race condition guard — har start() call ka unique ID

  constructor(
    private onAudioData: (base64Data: string) => void,
    private onVolume?: (volume: number) => void
  ) {}

  async start(options?: { wakeWord?: boolean; onWakeWord?: () => void }) {
    // 🔥 FIX 1: Increment ID taaki purane async calls khud ko cancel kar sakein
    const myId = ++this.startId;

    try {
      this.isWakeWordMode = options?.wakeWord || false;
      this.onWakeWord = options?.onWakeWord || null;

      // 🔥 FIX 2: Closed context ko bhi recreate karo (pehle sirf null check tha)
      if (!this.audioContext || this.audioContext.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioCtx({ sampleRate: 16000 });
      }

      // Local reference — stop() iske baad null set kare toh bhi local variable safe rehta hai
      const ctx = this.audioContext;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // 🔥 FIX 3: getUserMedia se PEHLE ID check — agar stop() call ho chuka hai toh bail
      if (myId !== this.startId) {
        console.warn('[AudioRecorder] start() superseded, aborting');
        return;
      }

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 🔥 FIX 4: getUserMedia ke BAAD bhi check — yahi pehle crash hota tha
      if (myId !== this.startId || !this.audioContext || this.audioContext.state === 'closed') {
        console.warn('[AudioRecorder] Context closed during getUserMedia, cleaning up');
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
        return;
      }

      this.source = ctx.createMediaStreamSource(this.stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;

      this.processor = ctx.createScriptProcessor(2048, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);

        if (this.isEnrolling) {
          this.enrollmentBuffer.push(new Float32Array(inputData));
        }

        // Volume calculation
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        this.onVolume?.(Math.sqrt(sum / inputData.length));

        // Wake word detection
        if (this.isWakeWordMode && this.analyser) {
          const bufferLength = this.analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          this.analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / bufferLength;
          if (average > 60) {
            console.log('[AudioRecorder] Wake word detected');
            this.isWakeWordMode = false;
            this.onWakeWord?.();
          }
        }

        const pcm16 = this.floatToPcm16(inputData);
        const base64 = this.arrayBufferToBase64(pcm16.buffer as ArrayBuffer);
        this.onAudioData(base64);
      };

      this.source.connect(this.analyser);
      this.analyser.connect(this.processor);
      this.processor.connect(ctx.destination);

      console.log('[AudioRecorder] Started successfully');
    } catch (err) {
      // 🔥 FIX 5: Agar yeh stale call hai toh error log mat karo
      if (myId !== this.startId) return;
      console.error('[AudioRecorder] Failed to start:', err);
      this.stop();
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
    // 🔥 FIX 6: startId increment karo taaki koi bhi in-flight start() bail out kare
    this.startId++;

    try {
      if (this.processor) this.processor.disconnect();
      if (this.source) this.source.disconnect();
      if (this.analyser) this.analyser.disconnect();
      if (this.stream) this.stream.getTracks().forEach(track => track.stop());
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(() => {}); // Promise ignore — cleanup only
      }
    } catch (e) {
      console.error('[AudioRecorder] Error during stop:', e);
    }

    this.source = null;
    this.processor = null;
    this.analyser = null;
    this.stream = null;
    this.audioContext = null;
  }

  private floatToPcm16(float32Array: Float32Array): Int16Array {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm16;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;

  constructor(private onVolume?: (volume: number) => void) {
    // 🔥 FIX 7: AudioContext ko constructor mein mat banao —
    // browser policy: AudioContext creation requires a user gesture.
    // init() ab pehli playChunk() call pe hoga.
  }

  private ensureContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(this.audioContext.destination);
      this.nextStartTime = 0;
      this.startVolumeMonitor();
    }
  }

  private startVolumeMonitor() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);

    const update = () => {
      if (!this.analyser || !this.audioContext || this.audioContext.state !== 'running') {
        this.rafId = requestAnimationFrame(update);
        return;
      }
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      this.onVolume?.(average / 128);
      this.rafId = requestAnimationFrame(update);
    };

    this.rafId = requestAnimationFrame(update);
  }

  playChunk(base64Data: string) {
    this.ensureContext();
    if (!this.audioContext || !this.analyser) return;

    try {
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const pcm16 = new Int16Array(bytes.buffer as ArrayBuffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 0x8000;

      const audioBuffer = this.audioContext.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.analyser);

      const now = this.audioContext.currentTime;
      if (this.nextStartTime < now) this.nextStartTime = now + 0.02;

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
    } catch (e) {
      console.error('[AudioPlayer] playChunk error:', e);
    }
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
    this.analyser = null;
    this.nextStartTime = 0;
    // 🔥 FIX 8: stop() ke baad init() mat bulao — ensureContext() lazily karta hai yeh kaam
  }
}