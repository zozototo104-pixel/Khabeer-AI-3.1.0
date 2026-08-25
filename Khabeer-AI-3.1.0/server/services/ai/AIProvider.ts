export interface AudioChunk {
  data: string; // Base64 encoded PCM audio
}

export interface AIResponse {
  audio?: string;
  text?: string;
  interrupted?: boolean;
}

export interface AIProviderConfig {
  systemInstruction?: string;
  voiceName?: string;
  onMessage: (msg: AIResponse) => void;
  onError: (err: any) => void;
  onClose: () => void;
}

export interface AIProvider {
  /**
   * Initializes the AI streaming session
   */
  connect(config: AIProviderConfig): Promise<void>;
  
  /**
   * Sends real-time audio input to the AI model
   */
  sendRealtimeInput(audio: AudioChunk): void;
  
  /**
   * Closes the connection
   */
  disconnect(): void;
}
