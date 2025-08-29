// Piper TTS Service - Currently disabled due to missing EXTERNAL dependencies
// To enable: Add piper-tts-web to EXTERNAL folder

export class PiperTTSService {
  private currentVoiceId: string = 'en_US-hfc_female-medium';
  private initPromise: Promise<void> | null = null;
  
  async initialize(
    voiceId: string = 'en_US-hfc_female-medium',
    onProgress?: (progress: any) => void
  ): Promise<void> {
    // Return existing init promise if already initializing
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = this._doInitialize(voiceId, onProgress);
    return this.initPromise;
  }

  private async _doInitialize(_voiceId: string, _onProgress?: (progress: any) => void): Promise<void> {
    console.log('[PiperTTS] Service currently disabled - missing dependencies');
    throw new Error('Piper TTS not available - missing EXTERNAL dependencies');
  }

  async speak(_text: string): Promise<AudioBuffer | null> {
    console.log('[PiperTTS] Service currently disabled');
    return null;
  }

  async speakAndPlay(_text: string): Promise<void> {
    console.log('[PiperTTS] Service currently disabled');
  }

  async speakStream(
    _text: string, 
    _onSentence?: (sentence: string, audio: AudioBuffer) => void
  ): Promise<void> {
    console.log('[PiperTTS] Service currently disabled');
  }

  isReady(): boolean {
    return false;
  }

  getCurrentVoice(): string {
    return this.currentVoiceId;
  }
}

// Singleton instance for easy access
export const piperTTS = new PiperTTSService();