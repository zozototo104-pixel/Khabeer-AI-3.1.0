# System Architecture

This project follows a modern, scalable, decoupled architecture to ensure Low Latency and High Modularity.

## Core Layers

1. **Frontend (React / Web)**
   - Connects to the backend via a single Realtime Voice WebSocket.
   - Handles UI/UX, microphone access, and audio playback.

2. **Realtime Voice Layer (WebSocket Gateway)**
   - `server.ts` manages the WebSocket (`ws`) layer.
   - Serves as the central nervous system connecting the frontend to the backend services.

3. **AI Provider Abstraction (`server/services/ai`)**
   - **`AIProvider.ts`**: The interface guaranteeing we are not locked into a single AI model. 
   - **`GeminiLiveProvider.ts`**: The current implementation using Gemini 3.1 Flash Live. This model natively supports *Ultra-Low Latency Streaming* by processing STT, Reasoning, and TTS in a single multi-modal pass, skipping the traditional cascading delays.

4. **Speech Recognition (STT) & Diarization (`server/services/stt`, `server/services/diarization`)**
   - Handles speaker identification. While Gemini Live processes audio natively, these layers allow for pre-processing (e.g., identifying who is speaking based on voice biometrics) before passing metadata to the AI Provider.

5. **Memory Engine (`server/services/memory`)**
   - Retrieves contextual memory (previous meetings, pending tasks) from the Database.
   - Dynamically injects context into the AI Provider session.

6. **RAG Engine (`server/services/rag`)**
   - Retrieval-Augmented Generation for internal company documents.

7. **Decision Engine (`server/services/decision`)**
   - Injects frameworks (SWOT, Risk Matrices) based on the meeting type to guide the AI's reasoning.

8. **Expert Panel (`server/services/expert/ExpertCatalog.ts`)**
   - Provides 29 governed expert profiles, a lead/reviewer panel model, evidence requirements, intervention triggers, and deterministic domain recommendations.

9. **Risk and Violation Control (`server/services/risk`)**
   - Scores risks through a deterministic 5×5 matrix.
   - Keeps findings, suspected violations, and human-confirmed violations as separate auditable states.

10. **External Consultation Gateway (`server/services/integrations`)**
   - Issues short-lived signed call sessions and bridges eligible Twilio/WhatsApp Business Calling μ-law media streams to Gemini Live.
   - Requires explicit recording consent and stores a caller hash instead of the raw telephone number.

## Latency & Streaming (Top Priority)
To achieve the lowest possible latency, the system utilizes **End-to-End Audio Streaming**. 
Instead of the traditional `STT -> Text -> LLM -> Text -> TTS -> Audio` cascade (which takes several seconds), the current implementation streams raw PCM audio directly to the Gemini Multimodal Live API via WebSockets. The model begins streaming PCM audio back the moment it starts reasoning.
