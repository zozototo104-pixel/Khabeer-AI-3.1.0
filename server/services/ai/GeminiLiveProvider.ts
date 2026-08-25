import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { AIProvider, AIProviderConfig, AudioChunk } from './AIProvider';

export class GeminiLiveProvider implements AIProvider {
  private client: GoogleGenAI;
  private session: any | null = null;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error("Missing GEMINI_API_KEY environment variable");
    }
    this.client = new GoogleGenAI({
      apiKey: this.apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
  }

  async connect(config: AIProviderConfig): Promise<void> {
    this.session = await this.client.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceName || "Zephyr" } },
        },
        systemInstruction: config.systemInstruction || "",
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          const textParts = message.serverContent?.modelTurn?.parts?.filter(p => p.text).map(p => p.text).join("");
          const interrupted = message.serverContent?.interrupted;
          
          config.onMessage({
            audio,
            text: textParts,
            interrupted
          });
        },
        onerror: config.onError,
        onclose: config.onClose
      },
    });
  }

  sendRealtimeInput(audio: AudioChunk): void {
    if (this.session) {
      this.session.sendRealtimeInput({
        audio: { data: audio.data, mimeType: "audio/pcm;rate=16000" },
      });
    }
  }

  disconnect(): void {
    if (this.session) {
      // Logic to close session gracefully
      this.session = null;
    }
  }
}
