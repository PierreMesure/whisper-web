import { useState, useCallback, useRef, useEffect } from 'react';
import { PiperTTSService } from '../services/piperTTSService';
type VoiceId = string;

export interface TTSConfig {
  engine?: 'native' | 'piper';
  piperVoiceId?: VoiceId;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
}

export interface TTSState {
  isSpeaking: boolean;
  isPaused: boolean;
  isSupported: boolean;
  isPiperReady: boolean;
  currentEngine: 'native' | 'piper';
  error: string | null;
  performanceMetrics?: {
    firstSpeechTime: number;
    lastSpeechStartTime: number;
    lastSpeechEndTime: number;
  };
}

export function useTTSWithPiper(config: TTSConfig = {}) {
  const [state, setState] = useState<TTSState>({
    isSpeaking: false,
    isPaused: false,
    isSupported: typeof speechSynthesis !== 'undefined',
    isPiperReady: false,
    currentEngine: config.engine || 'native',
    error: null,
  });

  const piperService = useRef<PiperTTSService | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const currentSource = useRef<AudioBufferSourceNode | null>(null);
  const streamingState = useRef({
    currentStreamId: '',
    spokenText: '',
    accumulatedText: '',
  });

  // Initialize Piper if selected
  useEffect(() => {
    if (config.engine === 'piper') {
      if (!piperService.current) {
        piperService.current = new PiperTTSService();
      }
      
      piperService.current
        .initialize(config.piperVoiceId || 'en_US-hfc_female-medium')
        .then(() => {
          setState(prev => ({ ...prev, isPiperReady: true }));
          console.log('[TTS] Piper TTS ready');
        })
        .catch(err => {
          console.error('[TTS] Piper initialization failed, falling back to native:', err);
          setState(prev => ({ 
            ...prev, 
            currentEngine: 'native',
            error: 'Piper TTS failed to initialize'
          }));
        });
    }
  }, [config.engine, config.piperVoiceId]);

  // Initialize audio context
  useEffect(() => {
    audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      audioContext.current?.close();
    };
  }, []);

  // Speak with Piper
  const speakWithPiper = useCallback(async (text: string): Promise<void> => {
    if (!piperService.current || !audioContext.current) return;
    
    try {
      setState(prev => ({ ...prev, isSpeaking: true, error: null }));
      
      const startTime = performance.now();
      const audioBuffer = await piperService.current.speak(text);
      
      if (audioBuffer) {
        // Play the audio
        const source = audioContext.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.current.destination);
        
        currentSource.current = source;
        
        source.onended = () => {
          setState(prev => ({ 
            ...prev, 
            isSpeaking: false,
            performanceMetrics: {
              ...prev.performanceMetrics,
              lastSpeechEndTime: performance.now(),
              firstSpeechTime: prev.performanceMetrics?.firstSpeechTime || 0,
              lastSpeechStartTime: startTime,
            }
          }));
          currentSource.current = null;
        };
        
        source.start(0);
        
        setState(prev => ({ 
          ...prev,
          performanceMetrics: {
            ...prev.performanceMetrics,
            lastSpeechStartTime: startTime,
            firstSpeechTime: prev.performanceMetrics?.firstSpeechTime || (performance.now() - startTime),
            lastSpeechEndTime: prev.performanceMetrics?.lastSpeechEndTime || 0,
          }
        }));
      }
    } catch (error) {
      console.error('[TTS] Piper speak failed:', error);
      setState(prev => ({ 
        ...prev, 
        isSpeaking: false, 
        error: `Piper TTS error: ${error}` 
      }));
    }
  }, []);

  // Speak with native TTS
  const speakWithNative = useCallback((text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (config.voice) utterance.voice = speechSynthesis.getVoices().find(v => v.name === config.voice) || null;
    if (config.rate) utterance.rate = config.rate;
    if (config.pitch) utterance.pitch = config.pitch;
    if (config.volume) utterance.volume = config.volume;
    if (config.lang) utterance.lang = config.lang;
    
    utterance.onstart = () => {
      setState(prev => ({ ...prev, isSpeaking: true, error: null }));
    };
    
    utterance.onend = () => {
      setState(prev => ({ ...prev, isSpeaking: false }));
    };
    
    utterance.onerror = (event) => {
      setState(prev => ({ 
        ...prev, 
        isSpeaking: false, 
        error: `Native TTS error: ${event.error}` 
      }));
    };
    
    speechSynthesis.speak(utterance);
  }, [config]);

  // Main speak function
  const speak = useCallback(async (text: string, interrupt: boolean = false) => {
    if (!text.trim()) return;
    
    if (interrupt) {
      stop();
    }
    
    // Use Piper if ready, otherwise fall back to native
    if (state.currentEngine === 'piper' && state.isPiperReady) {
      console.log('[TTS] Speaking with Piper');
      await speakWithPiper(text);
    } else {
      console.log('[TTS] Speaking with native TTS');
      speakWithNative(text);
    }
  }, [state.currentEngine, state.isPiperReady, speakWithPiper, speakWithNative]);

  // Stream speak function
  const speakStream = useCallback(async (streamId: string, textChunk: string, isComplete: boolean = false) => {
    console.log('[TTS] Stream chunk:', { streamId, chunk: textChunk.substring(0, 50), isComplete });
    
    // Reset for new stream
    if (streamingState.current.currentStreamId !== streamId) {
      stop();
      streamingState.current = {
        currentStreamId: streamId,
        accumulatedText: '',
        spokenText: '',
      };
    }
    
    streamingState.current.accumulatedText = textChunk;
    
    // Get unspoken text
    const spokenLength = streamingState.current.spokenText.length;
    const unspokenText = textChunk.slice(spokenLength);
    
    if (unspokenText.trim()) {
      // Look for complete sentences
      const sentenceEndPattern = /^(.*?[.!?])\s*/;
      const match = unspokenText.match(sentenceEndPattern);
      
      if (match) {
        const sentenceToSpeak = match[1].trim();
        if (sentenceToSpeak && !state.isSpeaking) {
          console.log('[TTS] Speaking sentence:', sentenceToSpeak);
          await speak(sentenceToSpeak);
          streamingState.current.spokenText = textChunk.slice(0, spokenLength + match[0].length);
        }
      } else if (isComplete && unspokenText.trim()) {
        // Speak remaining text when complete
        if (!state.isSpeaking) {
          console.log('[TTS] Speaking final text:', unspokenText.trim());
          await speak(unspokenText.trim());
          streamingState.current.spokenText = textChunk;
        }
      }
    }
  }, [speak, state.isSpeaking]);

  // Stop function
  const stop = useCallback(() => {
    // Stop Piper audio
    if (currentSource.current) {
      currentSource.current.stop();
      currentSource.current = null;
    }
    
    // Stop native TTS
    speechSynthesis.cancel();
    
    // Reset state
    streamingState.current = {
      currentStreamId: '',
      spokenText: '',
      accumulatedText: '',
    };
    
    setState(prev => ({ 
      ...prev, 
      isSpeaking: false, 
      isPaused: false 
    }));
    
    console.log('[TTS] Stopped');
  }, []);

  // Switch engine
  const setEngine = useCallback((engine: 'native' | 'piper') => {
    stop();
    setState(prev => ({ ...prev, currentEngine: engine }));
    console.log('[TTS] Switched to engine:', engine);
  }, [stop]);

  return {
    ...state,
    speak,
    speakStream,
    stop,
    setEngine,
    pause: () => speechSynthesis.pause(),
    resume: () => speechSynthesis.resume(),
  };
}