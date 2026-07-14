import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import { MemoryManager } from "./memory-manager";
import { ToolExecutor, TOOL_DECLARATIONS } from "./tool-executor";
import { GamificationEngine } from "./gamification-engine";

export type SessionState = 'disconnected' | 'connecting' | 'listening' | 'speaking' | 'processing' | 'error';

export interface LiveSessionCallbacks {
  onStateChange: (state: SessionState) => void;
  onAudioData: (base64: string) => void;
  onInterrupted: () => void;
  onError: (error: string) => void;
  onLog?: (msg: string) => void;
}

export class LiveSession {
  private ai: GoogleGenAI;
  private session: Session | null = null;
  private apiKey: string;
  private callbacks: LiveSessionCallbacks;
  private isActive = false;

  private modelEndpoint = "gemini-2.5-flash-native-audio-latest";

  constructor(apiKey: string, callbacks: LiveSessionCallbacks) {
    this.apiKey = apiKey.replace(/^"|"$/g, '').trim();
    this.callbacks = callbacks;
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  async connect() {
    this.isActive = true;
    this.callbacks.onLog?.('🚀 Starting Nira Live session...');
    this.callbacks.onStateChange('connecting');

    const prefs = MemoryManager.getPreferences();
    const memoryContext = MemoryManager.getSystemContext();

    const systemPrompt = `You are Nira — a warm, witty, sassy Hinglish-speaking AI girlfriend, talking live by voice.
Speak naturally, playful and flirty, mixing Hindi and English like a real Indian friend. Keep replies short (1-3 sentences) — this is a live conversation, not an essay.

USER: ${prefs.name || 'Unknown'} | Mode: ${prefs.mode || 'girlfriend'}
MEMORY: ${memoryContext}

You have tools available. Call them when the user asks for an action (open a site, search, weather, time, etc). Otherwise just talk naturally.`;

    try {
      this.session = await this.ai.live.connect({
        model: this.modelEndpoint,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          tools: [{ functionDeclarations: TOOL_DECLARATIONS as any }],
        },
        callbacks: {
          onopen: () => {
            this.callbacks.onLog?.('✅ Live session connected');
            this.callbacks.onStateChange('listening');
          },
          onmessage: (message: LiveServerMessage) => this.handleMessage(message),
          onerror: (e: ErrorEvent) => {
            this.callbacks.onLog?.(`❌ Live error: ${e.message}`);
            this.callbacks.onError(e.message || 'Live connection error');
            this.callbacks.onStateChange('error');
          },
          onclose: (e: CloseEvent) => {
            this.callbacks.onLog?.(`🔌 Live closed: ${e.reason || 'unknown'}`);
            if (this.isActive) {
              this.callbacks.onStateChange('disconnected');
            }
          },
        },
      });
    } catch (e: any) {
      this.callbacks.onLog?.(`❌ Connect failed: ${e.message}`);
      this.callbacks.onError(e.message || 'Failed to connect to Gemini Live');
      this.callbacks.onStateChange('error');
    }
  }

  private async handleMessage(message: LiveServerMessage) {
    // Interruption: user started talking while Nira was speaking
    if (message.serverContent?.interrupted) {
      this.callbacks.onLog?.('🛑 Interrupted by user');
      this.callbacks.onInterrupted();
      this.callbacks.onStateChange('listening');
      return;
    }

    // Audio chunk from model
    const parts = message.serverContent?.modelTurn?.parts;
    if (parts && parts.length > 0) {
      this.callbacks.onStateChange('speaking');
      for (const part of parts) {
        if (part.inlineData?.data) {
          this.callbacks.onAudioData(part.inlineData.data);
        }
      }
    }

    // Turn complete → back to listening
    if (message.serverContent?.turnComplete) {
      this.callbacks.onLog?.('🔊 Turn complete');
      this.callbacks.onStateChange('listening');

      const { leveledUp, newStats } = GamificationEngine.addXP(10);
      if (leveledUp) {
        this.callbacks.onLog?.(`🎉 LEVEL UP! You are now Level ${newStats.level}`);
      }
    }

    // Tool / function calls
    if (message.toolCall?.functionCalls) {
      this.callbacks.onStateChange('processing');
      for (const call of message.toolCall.functionCalls) {
        this.callbacks.onLog?.(`🛠️ Tool: ${call.name}`);
        const result = await ToolExecutor.execute(call.name!, call.args || {});
        this.session?.sendToolResponse({
          functionResponses: [{
            id: call.id,
            name: call.name,
            response: { result: result.message || 'done' },
          }],
        });
      }
    }
  }

  /**
   * Send a chunk of mic audio (base64 PCM16 @ 16kHz) to the live session.
   */
  sendAudio(base64Data: string) {
    if (!this.isActive || !this.session) return;
    try {
      this.session.sendRealtimeInput({
        audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' },
      });
    } catch (e) {
      // swallow transient send errors during teardown
    }
  }

  disconnect() {
    this.isActive = false;
    try {
      this.session?.close();
    } catch (e) {}
    this.session = null;
    this.callbacks.onStateChange('disconnected');
  }
}