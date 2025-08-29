import { KokoroTTS } from 'kokoro-js';

export type KokoroVoice = 
  | 'af_sky' 
  | 'af_heart' 
  | 'am_guy'
  | 'bf_emma'
  | 'bf_isabella' 
  | 'bm_george'
  | 'bm_lewis';

export interface KokoroConfig {
  voice?: KokoroVoice;
  model?: string;
  dtype?: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';
  speed?: number;
  device?: 'webgpu' | 'wasm' | 'auto';
  useWebWorker?: boolean;
}

export class KokoroTTSService {
  private tts: KokoroTTS | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  private currentVoice: KokoroVoice = 'af_sky';
  private audioContext: AudioContext | null = null;

  constructor() {
    // Audio context will be created when needed
    this.audioContext = null;
  }

  private async getOptimalDevice(preferred?: 'webgpu' | 'wasm' | 'auto'): Promise<'webgpu' | 'wasm'> {
    if (preferred === 'wasm') return 'wasm';
    
    // Try WebGPU first if available
    if ('gpu' in navigator) {
      try {
        const gpu = (navigator as any).gpu;
        const adapter = await gpu.requestAdapter();
        if (adapter) {
          // Check for known WebGPU issues with Kokoro
          const gpuInfo = adapter.info || {};
          console.log('[KokoroTTS] WebGPU adapter found:', gpuInfo);
          
          // Note: There's a known tensor operation issue with Kokoro in WebGPU
          // For now, we'll try it but may need to fallback
          console.warn('[KokoroTTS] WebGPU has known issues with Kokoro, may fallback to WASM');
          return 'webgpu';
        }
      } catch (e) {
        console.log('[KokoroTTS] WebGPU not available:', e);
      }
    }
    
    console.log('[KokoroTTS] Using WASM device');
    return 'wasm';
  }

  async initialize(config: KokoroConfig = {}): Promise<void> {
    // Return existing init promise if already initializing
    if (this.initPromise) return this.initPromise;
    
    if (this.tts && !config.dtype) {
      console.log('[KokoroTTS] Already initialized');
      return;
    }

    this.initPromise = this._doInitialize(config);
    return this.initPromise;
  }

  private async _doInitialize(config: KokoroConfig): Promise<void> {
    try {
      this.isInitializing = true;
      console.log('[KokoroTTS] Initializing...', config);

      // Detect optimal device
      const device = await this.getOptimalDevice(config.device);
      
      // Use q8 for optimal browser performance (research shows fp32 is too slow)
      const dtype = config.dtype || 'q8';
      
      console.log(`[KokoroTTS] Using device: ${device}, dtype: ${dtype}`);

      // Initialize Kokoro TTS with ONNX model
      this.tts = await KokoroTTS.from_pretrained(
        config.model || 'onnx-community/Kokoro-82M-v1.0-ONNX',
        { 
          dtype: dtype,
          device: device,
          progress_callback: (progress: any) => {
            console.log('[KokoroTTS] Loading:', progress);
          }
        }
      );

      this.currentVoice = config.voice || 'af_sky';
      console.log('[KokoroTTS] Initialized successfully');
      
      // list_voices might be a method or property
      try {
        const voices = typeof this.tts.list_voices === 'function' 
          ? this.tts.list_voices() 
          : this.tts.list_voices;
        console.log('[KokoroTTS] Available voices:', voices);
        
        // Also log the voices in a table format if available
        if (voices && typeof voices === 'object') {
          console.table(voices);
        }
      } catch (e) {
        console.log('[KokoroTTS] Could not get voices list:', e);
      }

    } catch (error) {
      console.error('[KokoroTTS] Initialization failed:', error);
      throw error;
    } finally {
      this.isInitializing = false;
      this.initPromise = null;
    }
  }

  async speak(text: string, config: KokoroConfig = {}): Promise<AudioBuffer | null> {
    if (!text.trim()) return null;

    // Auto-initialize if needed
    if (!this.tts) {
      await this.initialize(config);
    }

    // Re-create audio context if it was disposed
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('[KokoroTTS] Re-created AudioContext');
    }
    
    // Resume audio context if it's suspended
    if (this.audioContext && this.audioContext.state === 'suspended') {
      console.log('[KokoroTTS] Resuming suspended AudioContext');
      await this.audioContext.resume();
    }

    if (!this.tts || !this.audioContext) {
      console.error('[KokoroTTS] TTS or AudioContext not initialized');
      return null;
    }

    try {
      const startTime = performance.now();
      const voice = config.voice || this.currentVoice;
      
      console.log(`[KokoroTTS] Generating speech for: "${text.substring(0, 50)}..." with voice ${voice}`);
      
      // Generate audio with Kokoro
      // Note: Using higher speed can reduce quality but improve performance
      const audio = await this.tts.generate(text, {
        voice: voice as any,
        speed: config.speed || 1.0,
      });

      // Debug logging
      if (!audio) {
        console.error('[KokoroTTS] No audio generated');
        return null;
      }
      
      console.log('[KokoroTTS] Audio generated successfully');
      console.log('[KokoroTTS] Audio type:', typeof audio);
      console.log('[KokoroTTS] Has toWav:', typeof audio.toWav === 'function');
      console.log('[KokoroTTS] Has toBlob:', typeof audio.toBlob === 'function');
      console.log('[KokoroTTS] Has audio property:', 'audio' in audio);
      console.log('[KokoroTTS] Has sampling_rate:', 'sampling_rate' in audio);

      // Convert to AudioBuffer for web playback
      const audioBuffer = await this.convertToAudioBuffer(audio);
      
      const synthesisTime = performance.now() - startTime;
      const rtf = audioBuffer ? synthesisTime / (audioBuffer.duration * 1000) : 0;
      console.log(`[KokoroTTS] Generated ${text.length} chars in ${synthesisTime.toFixed(0)}ms, RTF: ${rtf.toFixed(2)}, AudioBuffer: ${audioBuffer ? `${audioBuffer.duration.toFixed(2)}s` : 'null'}`);
      
      return audioBuffer;
    } catch (error) {
      console.error('[KokoroTTS] Speech generation failed:', error);
      return null;
    }
  }

  async speakStream(
    text: string, 
    onChunk: (chunk: AudioBuffer) => void,
    config: KokoroConfig = {}
  ): Promise<void> {
    if (!text.trim()) return;

    // Auto-initialize if needed
    if (!this.tts) {
      await this.initialize(config);
    }

    // Re-create audio context if it was disposed
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('[KokoroTTS] Re-created AudioContext');
    }

    if (!this.tts) {
      console.error('[KokoroTTS] TTS not initialized');
      return;
    }

    try {
      const voice = config.voice || this.currentVoice;
      console.log(`[KokoroTTS] Starting stream generation for voice ${voice}`);
      
      // Check if streaming is actually supported
      if (typeof this.tts.stream === 'function') {
        // Use streaming API if available
        const stream = this.tts.stream(text, {
          voice: voice as any,
          speed: config.speed || 1.0,
        });

        let chunkIndex = 0;
        for await (const { audio } of stream) {
          console.log(`[KokoroTTS] Generated chunk ${++chunkIndex}`);
          const audioBuffer = await this.convertToAudioBuffer(audio);
          if (audioBuffer) {
            onChunk(audioBuffer);
          }
        }
      } else {
        // Fallback to sentence-based chunking for streaming effect
        console.log('[KokoroTTS] Stream API not available, using sentence chunking');
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        
        for (const sentence of sentences) {
          const trimmedSentence = sentence.trim();
          if (trimmedSentence) {
            const audio = await this.tts.generate(trimmedSentence, {
              voice: voice as any,
              speed: config.speed || 1.0,
            });
            
            const audioBuffer = await this.convertToAudioBuffer(audio);
            if (audioBuffer) {
              onChunk(audioBuffer);
            }
          }
        }
      }
    } catch (error) {
      console.error('[KokoroTTS] Stream generation failed:', error);
    }
  }

  private async convertToAudioBuffer(kokoroAudio: any): Promise<AudioBuffer | null> {
    // Ensure we have an audio context for decoding
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (!this.audioContext) {
      console.error('[KokoroTTS] No AudioContext for conversion');
      return null;
    }

    try {
      console.log('[KokoroTTS] Converting Kokoro audio to AudioBuffer...');
      
      // Method 1: Use the toWav() method if available (RawAudio object from Transformers.js)
      if (typeof kokoroAudio.toWav === 'function') {
        console.log('[KokoroTTS] Using toWav() method to get WAV data...');
        try {
          const wavArrayBuffer = await kokoroAudio.toWav();
          const audioBuffer = await this.audioContext.decodeAudioData(wavArrayBuffer);
          console.log('[KokoroTTS] AudioBuffer created from WAV:', audioBuffer.duration, 'seconds');
          return audioBuffer;
        } catch (wavError) {
          console.warn('[KokoroTTS] toWav() failed, trying alternative methods:', wavError);
        }
      }
      
      // Method 2: Use toBlob() method if available
      if (typeof kokoroAudio.toBlob === 'function') {
        console.log('[KokoroTTS] Using toBlob() method...');
        try {
          const blob = await kokoroAudio.toBlob();
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
          console.log('[KokoroTTS] AudioBuffer created from Blob:', audioBuffer.duration, 'seconds');
          return audioBuffer;
        } catch (blobError) {
          console.warn('[KokoroTTS] toBlob() failed, trying raw data:', blobError);
        }
      }
      
      // Method 3: Use raw audio data and sampling_rate properties
      if (kokoroAudio.audio && kokoroAudio.sampling_rate) {
        console.log('[KokoroTTS] Using raw audio data with sampling rate...');
        const audioData = kokoroAudio.audio;
        const sampleRate = kokoroAudio.sampling_rate || 24000; // Default to 24kHz for Kokoro
        
        // Create audio buffer from raw PCM data
        const audioBuffer = this.audioContext.createBuffer(
          1, // mono
          audioData.length,
          sampleRate
        );
        
        // Copy the audio data to the buffer
        const channelData = audioBuffer.getChannelData(0);
        if (audioData instanceof Float32Array) {
          channelData.set(audioData);
        } else {
          for (let i = 0; i < audioData.length; i++) {
            channelData[i] = audioData[i];
          }
        }
        
        console.log('[KokoroTTS] AudioBuffer created from raw data:', audioBuffer.duration, 'seconds');
        return audioBuffer;
      }
      
      // Debug: Log the actual structure of the audio object
      console.log('[KokoroTTS] Audio object structure:', Object.keys(kokoroAudio || {}));
      console.log('[KokoroTTS] Audio object methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(kokoroAudio || {})));
      console.error('[KokoroTTS] Could not find compatible audio data format');
      return null;
      
    } catch (error) {
      console.error('[KokoroTTS] Audio conversion failed:', error);
      console.log('[KokoroTTS] Audio object:', kokoroAudio);
      return null;
    }
  }

  async playAudioBuffer(audioBuffer: AudioBuffer): Promise<void> {
    if (!this.audioContext || !audioBuffer) return;

    return new Promise((resolve) => {
      const source = this.audioContext!.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext!.destination);
      source.onended = () => resolve();
      source.start(0);
    });
  }

  getAvailableVoices(): string[] {
    if (!this.tts) return [];
    try {
      const voices = typeof this.tts.list_voices === 'function' 
        ? this.tts.list_voices() 
        : this.tts.list_voices;
      
      // If voices is an object with voice data, extract the keys
      if (voices && typeof voices === 'object' && !Array.isArray(voices)) {
        return Object.keys(voices);
      }
      
      // If it's already an array, return it
      if (Array.isArray(voices)) {
        return voices;
      }
      
      // Fallback to known voices
      return ['af_sky', 'af_heart', 'af_bella', 'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis', 'am_michael', 'am_echo'];
    } catch {
      return ['af_sky', 'af_heart', 'af_bella', 'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis', 'am_michael', 'am_echo'];
    }
  }

  isReady(): boolean {
    return this.tts !== null && !this.isInitializing;
  }

  getCurrentVoice(): KokoroVoice {
    return this.currentVoice;
  }

  setVoice(voice: KokoroVoice): void {
    this.currentVoice = voice;
  }

  dispose(): void {
    // Clean up resources
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.tts = null;
  }
}

// Singleton instance for easy access
export const kokoroTTS = new KokoroTTSService();