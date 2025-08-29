import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId?: string;
  modelId?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface SpeechToTextResult {
  text: string;
  confidence: number;
  isFinal: boolean;
}

export class ElevenLabsService {
  private client: ElevenLabsClient;
  private config: ElevenLabsConfig;
  private conversationHistory: ConversationMessage[] = [];

  constructor(config: ElevenLabsConfig) {
    console.log('[ElevenLabsService] Constructor called with:', {
      hasApiKey: !!config.apiKey,
      apiKeyLength: config.apiKey?.length,
      voiceId: config.voiceId,
      modelId: config.modelId
    });
    
    if (!config.apiKey) {
      throw new Error('[ElevenLabsService] API key is required');
    }
    
    this.config = {
      modelId: 'eleven_multilingual_v2',
      ...config,
      voiceId: config.voiceId || 'JBFqnCBsd6RMkjVDRZzb', // Default voice if none provided
    };
    
    console.log('[ElevenLabsService] Creating ElevenLabsClient...');
    try {
      this.client = new ElevenLabsClient({
        apiKey: this.config.apiKey,
      });
      console.log('[ElevenLabsService] Client created successfully');
    } catch (error) {
      console.error('[ElevenLabsService] Failed to create client:', error);
      throw error;
    }
  }

  async getAvailableVoices() {
    console.log('[ElevenLabsService] getAvailableVoices called');
    try {
      console.log('[ElevenLabsService] Fetching voices from API...');
      const response = await this.client.voices.getAll();
      console.log('[ElevenLabsService] Voices response:', {
        hasVoices: !!response?.voices,
        count: response?.voices?.length || 0
      });
      return response.voices || [];
    } catch (error) {
      console.error('[ElevenLabsService] Failed to fetch voices:', error);
      return [];
    }
  }

  async textToSpeech(text: string, voiceId?: string): Promise<ArrayBuffer> {
    const finalVoiceId = voiceId || this.config.voiceId;
    console.log('[ElevenLabsService] textToSpeech called:', {
      textLength: text.length,
      voiceId: finalVoiceId,
      modelId: this.config.modelId
    });
    
    if (!finalVoiceId) {
      throw new Error('No voice ID available. Please select a voice or ensure default voice is configured.');
    }
    
    try {
      console.log('[ElevenLabsService] Calling client.textToSpeech.convert...');
      
      const audioResponse = await this.client.textToSpeech.convert(
        finalVoiceId,
        {
          text,
          modelId: this.config.modelId,
        }
      );

      console.log('[ElevenLabsService] TTS response received:', {
        hasResponse: !!audioResponse,
        responseType: typeof audioResponse
      });
      
      return audioResponse as unknown as ArrayBuffer;
    } catch (error) {
      console.error('[ElevenLabsService] Text-to-speech conversion failed:', error);
      throw error;
    }
  }

  async streamTextToSpeech(text: string, voiceId?: string) {
    try {
      const audioStream = await this.client.textToSpeech.stream(
        voiceId || this.config.voiceId!,
        {
          text,
          modelId: this.config.modelId,
        }
      );

      return audioStream;
    } catch (error) {
      console.error('Streaming text-to-speech failed:', error);
      throw error;
    }
  }

  async speechToText(audioBlob: Blob): Promise<SpeechToTextResult> {
    console.log('[ElevenLabsService] speechToText called:', {
      blobSize: audioBlob.size,
      blobType: audioBlob.type,
      timestamp: new Date().toISOString()
    });
    
    if (audioBlob.size === 0) {
      console.error('[ElevenLabsService] Empty audio blob received');
      throw new Error('Cannot process empty audio');
    }
    
    try {
      // Determine file extension based on MIME type
      let filename = 'recording';
      const mimeType = audioBlob.type || 'audio/webm';
      
      if (mimeType.includes('webm')) {
        filename = 'recording.webm';
      } else if (mimeType.includes('wav')) {
        filename = 'recording.wav';
      } else if (mimeType.includes('mp3')) {
        filename = 'recording.mp3';
      } else if (mimeType.includes('ogg')) {
        filename = 'recording.ogg';
      } else {
        // Default to webm
        filename = 'recording.webm';
      }
      
      console.log(`[ElevenLabsService] Preparing audio file: ${filename}, type: ${mimeType}, size: ${audioBlob.size} bytes`);
      
      const audioFile = new File([audioBlob], filename, { type: mimeType });
      
      const formData = new FormData();
      formData.append('file', audioFile);
      formData.append('model_id', 'scribe_v1'); // Required model ID
      formData.append('tag_audio_events', 'false'); // Disable audio event tagging for cleaner output
      
      const url = 'https://api.elevenlabs.io/v1/speech-to-text';
      console.log('[ElevenLabsService] Sending STT request to:', url);
      console.log('[ElevenLabsService] FormData contents:', {
        file: filename,
        model_id: 'scribe_v1',
        tag_audio_events: 'false'
      });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.config.apiKey,
        },
        body: formData,
      });
      
      console.log('[ElevenLabsService] STT response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('STT API Error:', response.status, errorText);
        throw new Error(`Speech-to-text failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('[ElevenLabsService] STT result:', {
        hasText: !!data.text,
        textLength: data.text?.length || 0,
        text: data.text
      });
      
      return {
        text: data.text || '',
        confidence: data.confidence || 0.9,
        isFinal: true,
      };
    } catch (error) {
      console.error('[ElevenLabsService] Speech-to-text conversion failed:', error);
      if (error instanceof Error) {
        console.error('[ElevenLabsService] Error stack:', error.stack);
      }
      throw error;
    }
  }

  addToConversationHistory(message: ConversationMessage) {
    this.conversationHistory.push(message);
  }

  getConversationHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  clearConversationHistory() {
    this.conversationHistory = [];
  }

  setVoice(voiceId: string) {
    this.config.voiceId = voiceId;
  }

  setModel(modelId: string) {
    this.config.modelId = modelId;
  }

  getConfig(): ElevenLabsConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<ElevenLabsConfig>) {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.apiKey) {
      this.client = new ElevenLabsClient({
        apiKey: newConfig.apiKey,
      });
    }
  }
}

export const createElevenLabsService = (config: ElevenLabsConfig): ElevenLabsService => {
  return new ElevenLabsService(config);
};