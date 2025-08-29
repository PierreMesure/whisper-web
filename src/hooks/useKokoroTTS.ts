import { useState, useCallback, useRef, useEffect } from 'react';
import { KokoroTTSService, type KokoroVoice, type KokoroConfig } from '../services/kokoroTTSService';

export interface KokoroTTSState {
  isInitialized: boolean;
  isInitializing: boolean;
  isSpeaking: boolean;
  isGenerating: boolean;
  currentVoice: KokoroVoice;
  availableVoices: string[];
  error: string | null;
  performanceMetrics: {
    firstSpeechTime?: number;
    lastGenerationTime?: number;
    lastSpeechStartTime?: number;
    lastSpeechEndTime?: number;
  };
}

export interface UseKokoroTTSConfig extends KokoroConfig {
  autoInitialize?: boolean;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onError?: (error: string) => void;
}

export function useKokoroTTS(config: UseKokoroTTSConfig = {}) {
  const [state, setState] = useState<KokoroTTSState>({
    isInitialized: false,
    isInitializing: false,
    isSpeaking: false,
    isGenerating: false,
    currentVoice: config.voice || 'af_sky',
    availableVoices: [],
    error: null,
    performanceMetrics: {},
  });

  const serviceRef = useRef<KokoroTTSService | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef(false);
  const streamingStateRef = useRef({
    currentStreamId: '',
    isStreaming: false,
  });

  // Initialize audio context - delay creation until user interaction
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('[useKokoroTTS] Created AudioContext, state:', audioContextRef.current.state);
    }
    return audioContextRef.current;
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Clean up on unmount only
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
        } catch (e) {
          // Ignore
        }
      }
    };
  }, []);

  // Initialize Kokoro service
  const initialize = useCallback(async () => {
    if (state.isInitialized || state.isInitializing) {
      console.log('[useKokoroTTS] Already initialized or initializing');
      return;
    }

    try {
      setState(prev => ({ ...prev, isInitializing: true, error: null }));
      
      if (!serviceRef.current) {
        serviceRef.current = new KokoroTTSService();
      }

      await serviceRef.current.initialize(config);
      
      const availableVoices = serviceRef.current.getAvailableVoices();
      
      setState(prev => ({ 
        ...prev, 
        isInitialized: true,
        isInitializing: false,
        availableVoices,
      }));
      
      console.log('[useKokoroTTS] Initialized successfully');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[useKokoroTTS] Initialization failed:', errorMsg);
      setState(prev => ({ 
        ...prev, 
        isInitializing: false,
        error: errorMsg 
      }));
      config.onError?.(errorMsg);
    }
  }, [config, state.isInitialized, state.isInitializing]);

  // Auto-initialize if configured
  useEffect(() => {
    if (config.autoInitialize && !state.isInitialized && !state.isInitializing) {
      initialize();
    }
  }, [config.autoInitialize, state.isInitialized, state.isInitializing, initialize]);

  // Play audio buffer
  const playAudioBuffer = useCallback(async (audioBuffer: AudioBuffer): Promise<void> => {
    // Ensure we have an audio context
    const audioContext = ensureAudioContext();
    if (!audioContext) return;

    // Resume audio context if it's suspended (happens on user interaction)
    if (audioContext.state === 'suspended') {
      console.log('[useKokoroTTS] Resuming suspended AudioContext');
      await audioContext.resume();
      console.log('[useKokoroTTS] AudioContext state after resume:', audioContext.state);
    }

    return new Promise((resolve, reject) => {
      try {
        const audioContext = audioContextRef.current!;
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // Create a gain node for volume control
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1.0; // Full volume
        
        // Connect source -> gain -> destination
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        console.log('[useKokoroTTS] Audio chain: source -> gain(1.0) -> destination');
        
        currentSourceRef.current = source;
        
        source.onended = () => {
          console.log('[useKokoroTTS] Audio source ended');
          currentSourceRef.current = null;
          resolve();
        };
        
        // Note: AudioBufferSourceNode doesn't have an onerror event
        // Errors are handled through the promise chain
        
        source.start(0);
        console.log('[useKokoroTTS] Started audio playback, context state:', audioContext.state, 'sample rate:', audioContext.sampleRate);
      } catch (error) {
        console.error('[useKokoroTTS] Failed to start audio playback:', error);
        reject(error);
      }
    });
  }, [ensureAudioContext]);

  // Process audio queue
  const processAudioQueue = useCallback(async () => {
    if (isPlayingRef.current) {
      console.log('[useKokoroTTS] Already playing, waiting for current playback to finish');
      // Wait for current playback to finish before processing next
      while (isPlayingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    if (audioQueueRef.current.length === 0) {
      console.log('[useKokoroTTS] Audio queue is empty');
      return;
    }

    console.log(`[useKokoroTTS] Processing audio queue with ${audioQueueRef.current.length} items`);
    isPlayingRef.current = true;
    setState(prev => ({ ...prev, isSpeaking: true }));
    console.log('[useKokoroTTS] Starting speech playback');
    config.onSpeechStart?.();

    const startTime = performance.now();
    let firstSpeechTime = state.performanceMetrics.firstSpeechTime;

    while (audioQueueRef.current.length > 0) {
      const audioBuffer = audioQueueRef.current.shift();
      if (audioBuffer) {
        // Debug: Check if buffer has actual audio data
        const channelData = audioBuffer.getChannelData(0);
        const hasSound = channelData.some(sample => Math.abs(sample) > 0.001);
        console.log(`[useKokoroTTS] Playing audio buffer (${audioBuffer.duration.toFixed(2)}s, hasSound: ${hasSound}, channels: ${audioBuffer.numberOfChannels}, sampleRate: ${audioBuffer.sampleRate})`);
        if (!firstSpeechTime) {
          firstSpeechTime = performance.now() - startTime;
          setState(prev => ({
            ...prev,
            performanceMetrics: {
              ...prev.performanceMetrics,
              firstSpeechTime,
              lastSpeechStartTime: performance.now(),
            }
          }));
        }
        try {
          await playAudioBuffer(audioBuffer);
          console.log('[useKokoroTTS] Audio buffer playback completed');
        } catch (error) {
          console.error('[useKokoroTTS] Error playing audio buffer:', error);
        }
      }
    }

    setState(prev => ({
      ...prev,
      isSpeaking: false,
      performanceMetrics: {
        ...prev.performanceMetrics,
        lastSpeechEndTime: performance.now(),
      }
    }));
    
    isPlayingRef.current = false;
    console.log('[useKokoroTTS] Speech playback finished');
    config.onSpeechEnd?.();
  }, [playAudioBuffer, config, state.performanceMetrics.firstSpeechTime]);

  // Speak text
  const speak = useCallback(async (text: string, interrupt: boolean = false): Promise<void> => {
    if (!text.trim()) return;

    // Initialize if needed
    if (!state.isInitialized) {
      await initialize();
    }

    if (!serviceRef.current) {
      console.error('[useKokoroTTS] Service not initialized');
      return;
    }

    if (interrupt) {
      stop();
    }
    
    // Ensure audio context exists
    ensureAudioContext();

    try {
      setState(prev => ({ ...prev, isGenerating: true, error: null }));
      
      const generationStart = performance.now();
      const audioBuffer = await serviceRef.current.speak(text, {
        voice: state.currentVoice,
        speed: config.speed,
      });
      
      const generationTime = performance.now() - generationStart;
      
      setState(prev => ({
        ...prev,
        isGenerating: false,
        performanceMetrics: {
          ...prev.performanceMetrics,
          lastGenerationTime: generationTime,
        }
      }));

      if (audioBuffer) {
        console.log('[useKokoroTTS] AudioBuffer received, queueing for playback');
        audioQueueRef.current.push(audioBuffer);
        // Process audio queue and wait for it to complete
        await processAudioQueue();
      } else {
        console.error('[useKokoroTTS] No AudioBuffer returned from speak');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[useKokoroTTS] Speak failed:', errorMsg);
      setState(prev => ({ 
        ...prev, 
        isGenerating: false,
        error: errorMsg 
      }));
      config.onError?.(errorMsg);
    }
  }, [state.isInitialized, state.currentVoice, config, initialize, processAudioQueue]);

  // Stream speak text
  const speakStream = useCallback(async (
    streamId: string, 
    textChunk: string, 
    isComplete: boolean = false
  ): Promise<void> => {
    if (!textChunk.trim() && !isComplete) return;

    // Reset for new stream
    if (streamingStateRef.current.currentStreamId !== streamId) {
      stop();
      streamingStateRef.current = {
        currentStreamId: streamId,
        isStreaming: true,
      };
    }

    // Initialize if needed
    if (!state.isInitialized) {
      await initialize();
    }

    if (!serviceRef.current) {
      console.error('[useKokoroTTS] Service not initialized');
      return;
    }

    // For streaming, we'll speak complete sentences
    const sentenceEndPattern = /^(.*?[.!?])\s*/;
    const match = textChunk.match(sentenceEndPattern);

    if (match || isComplete) {
      const textToSpeak = match ? match[1].trim() : textChunk.trim();
      if (textToSpeak) {
        await speak(textToSpeak, false);
      }
    }
  }, [state.isInitialized, initialize, speak]);

  // Stop speaking
  const stop = useCallback(() => {
    // Stop current audio
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      currentSourceRef.current = null;
    }

    // Clear audio queue
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    // Reset streaming state
    streamingStateRef.current = {
      currentStreamId: '',
      isStreaming: false,
    };

    setState(prev => ({
      ...prev,
      isSpeaking: false,
      isGenerating: false,
    }));

    console.log('[useKokoroTTS] Stopped audio playback');
  }, []);

  // Set voice
  const setVoice = useCallback((voice: KokoroVoice) => {
    setState(prev => ({ ...prev, currentVoice: voice }));
    serviceRef.current?.setVoice(voice);
    console.log('[useKokoroTTS] Voice changed to:', voice);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      stop();
      serviceRef.current?.dispose();
    };
  }, []);

  return {
    // State
    ...state,
    
    // Actions
    initialize,
    speak,
    speakStream,
    stop,
    setVoice,
    
    // Utils
    isReady: state.isInitialized && !state.isInitializing,
  };
}