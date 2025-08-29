import { useState, useCallback, useRef, useEffect } from 'react';
import { MicVAD, type RealTimeVADOptions } from '@ricky0123/vad-web';
import { pipeline, type Pipeline } from '@huggingface/transformers';

export interface MoonshineConfig {
  model?: 'moonshine-tiny' | 'moonshine-base';
  device?: 'webgpu' | 'wasm';
  quantization?: 'q4' | 'q8' | 'fp32';
  vadConfig?: {
    positiveSpeechThreshold?: number;
    negativeSpeechThreshold?: number;
    minSpeechFrames?: number;
    preSpeechPadFrames?: number;
  };
  onTranscription?: (text: string) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onError?: (error: string) => void;
}

interface MoonshineState {
  isInitialized: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isTranscribing: boolean;
  currentTranscription: string;
  interimTranscription: string;
  error: string | null;
}

export function useMoonshine(config: MoonshineConfig = {}) {
  const [state, setState] = useState<MoonshineState>({
    isInitialized: false,
    isListening: false,
    isSpeaking: false,
    isTranscribing: false,
    currentTranscription: '',
    interimTranscription: '',
    error: null,
  });

  const vadRef = useRef<MicVAD | null>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const performanceRef = useRef({
    speechStartTime: 0,
    transcriptionStartTime: 0,
  });

  // Enhanced WebGPU detection with capability testing
  const detectOptimalDevice = useCallback(async (preferredDevice?: 'webgpu' | 'wasm'): Promise<'webgpu' | 'wasm'> => {
    if (preferredDevice === 'wasm') return 'wasm';
    
    try {
      // Check basic WebGPU availability
      if (!('gpu' in navigator)) return 'wasm';
      
      // Test WebGPU adapter availability
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (!adapter) return 'wasm';
      
      // Test device creation
      const device = await adapter.requestDevice();
      if (!device) return 'wasm';
      
      console.log('[Moonshine] WebGPU detected and verified');
      return 'webgpu';
    } catch (error) {
      console.warn('[Moonshine] WebGPU detection failed, falling back to WASM:', error);
      return 'wasm';
    }
  }, []);

  // Initialize Moonshine STT pipeline
  const initializePipeline = useCallback(async () => {
    if (pipelineRef.current) {
      console.log('[Moonshine] Pipeline already initialized');
      return;
    }

    try {
      console.log('[Moonshine] Initializing STT pipeline...');
      
      // Select model based on config
      const modelName = config.model === 'moonshine-base' 
        ? 'onnx-community/moonshine-base-ONNX'
        : 'onnx-community/moonshine-tiny-ONNX';

      // Enhanced device detection with capability testing
      let device = await detectOptimalDevice(config.device);
      // Optimize dtype based on device - use fp16 for WebGPU when available
      let dtype = device === 'webgpu' && config.quantization !== 'fp32' ? 'fp16' : 
                  config.quantization === 'q4' ? 'q4' : 
                  config.quantization === 'fp32' ? 'fp32' : 'q8';
                   
      console.log('[Moonshine] Using device:', device, 'with dtype:', dtype);

      // Create pipeline with fallback logic
      try {
        pipelineRef.current = await (pipeline as any)(
          'automatic-speech-recognition',
          modelName,
          {
            device,
            dtype: dtype,
            // Moonshine-specific optimizations
            chunk_length_s: 5, // Even shorter chunks for better responsiveness
            stride_length_s: 1,
          }
        );
      } catch (error) {
        console.warn('[Moonshine] Pipeline creation failed with', device, dtype, '- falling back to WASM with q8:', error);
        // Fallback to WASM with q8
        device = 'wasm';
        dtype = 'q8';
        pipelineRef.current = await (pipeline as any)(
          'automatic-speech-recognition',
          modelName,
          {
            device,
            dtype: dtype,
            chunk_length_s: 5,
            stride_length_s: 1,
          }
        );
      }

      console.log('[Moonshine] STT pipeline initialized', { model: modelName, device });
      
      // Warm up the model with a very small audio to reduce initial delay
      const warmupAudio = new Float32Array(8000); // 0.5 seconds of silence
      if (pipelineRef.current) {
        console.log('[Moonshine] Warming up model...');
        const warmupStart = Date.now();
        await pipelineRef.current(warmupAudio, {
          language: 'english',
          task: 'transcribe',
          return_timestamps: false,
        });
        console.log(`[Moonshine] Model warmed up in ${Date.now() - warmupStart}ms`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[Moonshine] Pipeline initialization error:', errorMessage);
      setState(prev => ({ ...prev, error: errorMessage }));
      config.onError?.(errorMessage);
    }
  }, [config]);

  // Initialize VAD with Moonshine-optimized settings
  const initializeVAD = useCallback(async () => {
    if (vadRef.current) {
      console.log('[Moonshine] VAD already initialized');
      return;
    }

    try {
      console.log('[Moonshine] Initializing VAD...');

      const vadOptions: Partial<RealTimeVADOptions> = {
        positiveSpeechThreshold: config.vadConfig?.positiveSpeechThreshold ?? 0.6,
        negativeSpeechThreshold: config.vadConfig?.negativeSpeechThreshold ?? 0.4,
        minSpeechFrames: config.vadConfig?.minSpeechFrames ?? 9,
        preSpeechPadFrames: config.vadConfig?.preSpeechPadFrames ?? 3,
        redemptionFrames: 12, // Reduced from 24 to 12 (384ms vs 768ms wait)
        frameSamples: 512, // V5 requirement
        model: 'v5', // Use Silero V5 for better accuracy

        // Use CDN for model assets
        baseAssetPath: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.24/dist/',
        onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/',

        onSpeechStart: () => {
          console.log('[Moonshine] Speech started');
          performanceRef.current.speechStartTime = Date.now();
          setState(prev => ({ ...prev, isSpeaking: true }));
          config.onSpeechStart?.();
        },

        onSpeechEnd: async (audio: Float32Array) => {
          const speechDuration = Date.now() - performanceRef.current.speechStartTime;
          console.log('[Moonshine] Speech ended', { 
            duration: `${speechDuration}ms`,
            audioLength: audio.length 
          });
          
          setState(prev => ({ ...prev, isSpeaking: false, isTranscribing: true }));
          config.onSpeechEnd?.();
          
          // Process with Moonshine STT
          await transcribeAudio(audio);
        },

        onFrameProcessed: (probabilities: { isSpeech: number }) => {
          // Optional: Update UI with speech probability for visualization
          if (probabilities.isSpeech > 0.8) {
            setState(prev => ({ 
              ...prev, 
              interimTranscription: prev.isSpeaking ? '...' : prev.interimTranscription 
            }));
          }
        },

        onVADMisfire: () => {
          console.log('[Moonshine] VAD misfire (speech too short)');
        },
      };

      vadRef.current = await MicVAD.new(vadOptions);
      console.log('[Moonshine] VAD initialized successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[Moonshine] VAD initialization error:', errorMessage);
      setState(prev => ({ ...prev, error: errorMessage }));
      config.onError?.(errorMessage);
    }
  }, [config]);

  // Transcribe audio using Moonshine
  const transcribeAudio = useCallback(async (audio: Float32Array) => {
    if (!pipelineRef.current || isProcessingRef.current) {
      console.log('[Moonshine] Pipeline not ready or already processing', {
        pipeline: !!pipelineRef.current,
        processing: isProcessingRef.current
      });
      return;
    }

    isProcessingRef.current = true;
    performanceRef.current.transcriptionStartTime = Date.now();

    try {
      console.log('[Moonshine] Starting transcription...', {
        audioLength: audio.length,
        audioDuration: `${(audio.length / 16000).toFixed(2)}s`
      });
      setState(prev => ({ ...prev, isTranscribing: true, interimTranscription: 'Processing...' }));

      const result = await pipelineRef.current(audio, {
        language: 'english',
        task: 'transcribe',
        return_timestamps: false,
      });

      const transcriptionTime = Date.now() - performanceRef.current.transcriptionStartTime;
      const text = result?.text?.trim() || '';
      
      console.log('[Moonshine] Transcription complete', { 
        text: text || '(empty)',
        result,
        time: `${transcriptionTime}ms`,
        realTimeFactor: transcriptionTime / (audio.length / 16) // ms per second of audio
      });

      setState(prev => ({ 
        ...prev, 
        currentTranscription: text,
        interimTranscription: '',
        isTranscribing: false 
      }));
      
      config.onTranscription?.(text);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[Moonshine] Transcription error:', errorMessage);
      setState(prev => ({ 
        ...prev, 
        error: errorMessage,
        isTranscribing: false,
        interimTranscription: '' 
      }));
      config.onError?.(errorMessage);
    } finally {
      isProcessingRef.current = false;
    }
  }, [config]);

  // Initialize everything
  const initialize = useCallback(async () => {
    if (state.isInitialized) {
      console.log('[Moonshine] Already initialized');
      return;
    }

    try {
      setState(prev => ({ ...prev, error: null }));
      
      // Initialize both pipeline and VAD
      await Promise.all([
        initializePipeline(),
        initializeVAD()
      ]);

      setState(prev => ({ ...prev, isInitialized: true }));
      console.log('[Moonshine] Fully initialized');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[Moonshine] Initialization error:', errorMessage);
      setState(prev => ({ ...prev, error: errorMessage }));
    }
  }, [state.isInitialized, initializePipeline, initializeVAD]);

  // Start listening
  const startListening = useCallback(async () => {
    if (!state.isInitialized) {
      console.log('[Moonshine] Not initialized, initializing first...');
      await initialize();
    }

    if (state.isListening || !vadRef.current) {
      console.log('[Moonshine] Already listening or VAD not available');
      return;
    }

    try {
      console.log('[Moonshine] Starting listening...');
      vadRef.current.start();
      setState(prev => ({ 
        ...prev, 
        isListening: true, 
        error: null,
        currentTranscription: '',
        interimTranscription: '' 
      }));
      console.log('[Moonshine] Listening started');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[Moonshine] Start error:', errorMessage);
      setState(prev => ({ ...prev, error: errorMessage }));
    }
  }, [state.isInitialized, state.isListening, initialize]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (!vadRef.current || !state.isListening) {
      console.log('[Moonshine] Not listening or VAD not available');
      return;
    }

    try {
      console.log('[Moonshine] Stopping...');
      vadRef.current.pause();
      setState(prev => ({ 
        ...prev, 
        isListening: false, 
        isSpeaking: false,
        isTranscribing: false,
        interimTranscription: '' 
      }));
      console.log('[Moonshine] Stopped');
    } catch (err) {
      console.error('[Moonshine] Stop error:', err);
    }
  }, [state.isListening]);

  // Pause VAD (for echo prevention during TTS)
  const pauseVAD = useCallback(() => {
    if (!vadRef.current || !state.isListening) return;
    vadRef.current.pause();
  }, [state.isListening]);

  // Resume VAD after TTS
  const resumeVAD = useCallback(() => {
    if (!vadRef.current || !state.isListening) return;
    vadRef.current.start();
  }, [state.isListening]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (vadRef.current) {
        try {
          vadRef.current.destroy();
        } catch (err) {
          console.error('[Moonshine] VAD cleanup error:', err);
        }
        vadRef.current = null;
      }
      // Pipeline cleanup handled by transformers.js
      pipelineRef.current = null;
    };
  }, []);

  return {
    // State
    isInitialized: state.isInitialized,
    isListening: state.isListening,
    isSpeaking: state.isSpeaking,
    isTranscribing: state.isTranscribing,
    currentTranscription: state.currentTranscription,
    interimTranscription: state.interimTranscription,
    error: state.error,

    // Actions
    initialize,
    startListening,
    stopListening,
    pauseVAD,
    resumeVAD,
  };
}