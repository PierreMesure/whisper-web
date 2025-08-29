import { useState, useCallback, useRef, useEffect } from 'react';
import { useMoonshine, type MoonshineConfig } from './useMoonshine';
import { useLLMStreaming, type LLMConfig } from './useLLMStreaming';
import { useSystemTTS } from './useSystemTTS';
import { useKokoroTTS } from './useKokoroTTS';
import type { KokoroVoice } from '../services/kokoroTTSService';
import { trackVoiceConversation, trackPerformanceMetric, trackVoiceComparison } from '../utils/analytics';

export interface TTSConfig {
  engine?: 'native' | 'kokoro';
  // Native TTS config
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: string;
  // Kokoro TTS config
  kokoroVoice?: KokoroVoice;
  kokoroModel?: string;
  kokoroDtype?: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';
}

export interface MoonshineConversationConfig {
  llm: LLMConfig;
  tts: TTSConfig;
  moonshine?: MoonshineConfig;
  autoSpeak?: boolean;
  interruptible?: boolean;
}

export interface MoonshinePerformanceMetrics {
  vadDetectionTime: number;
  sttProcessingTime: number;
  llmFirstTokenTime: number;
  llmCompletionTime: number;
  ttsFirstSpeechTime: number;
  ttsCompletionTime: number;
  totalPipelineTime: number;
  sttEngine: 'moonshine';
  modelUsed: string;
}

export interface MoonshineConversationState {
  isActive: boolean;
  isListening: boolean;
  isProcessingSTT: boolean;
  isProcessingLLM: boolean;
  isSpeaking: boolean;
  currentUserInput: string;
  currentAssistantResponse: string;
  error: string | null;
  stats: {
    totalTurns: number;
    avgResponseTime: number;
    lastResponseTime: number;
    avgSTTTime: number;
    avgVADTime: number;
    avgLLMFirstTokenTime: number;
    avgTTSTime: number;
    avgPerceivedLatency: number;
  };
  performance: MoonshinePerformanceMetrics;
}

export function useMoonshineConversation(config: MoonshineConversationConfig) {
  const [state, setState] = useState<MoonshineConversationState>({
    isActive: false,
    isListening: false,
    isProcessingSTT: false,
    isProcessingLLM: false,
    isSpeaking: false,
    currentUserInput: '',
    currentAssistantResponse: '',
    error: null,
    stats: {
      totalTurns: 0,
      avgResponseTime: 0,
      lastResponseTime: 0,
      avgSTTTime: 0,
      avgVADTime: 0,
      avgLLMFirstTokenTime: 0,
      avgTTSTime: 0,
      avgPerceivedLatency: 0,
    },
    performance: {
      vadDetectionTime: 0,
      sttProcessingTime: 0,
      llmFirstTokenTime: 0,
      llmCompletionTime: 0,
      ttsFirstSpeechTime: 0,
      ttsCompletionTime: 0,
      totalPipelineTime: 0,
      sttEngine: 'moonshine',
      modelUsed: config.moonshine?.model || 'moonshine-tiny',
    },
  });

  const responseTimesRef = useRef<number[]>([]);
  const sttTimesRef = useRef<number[]>([]);
  const lastTTSEndTimeRef = useRef<number>(0);
  const processedSentencesRef = useRef<number>(0);
  const spokenSentencesRef = useRef<Set<string>>(new Set());
  
  // Average tracking for all pipeline stages
  const vadTimesRef = useRef<number[]>([]);
  const llmFirstTokenTimesRef = useRef<number[]>([]);
  const ttsTimesRef = useRef<number[]>([]);
  const perceivedLatencyTimesRef = useRef<number[]>([]);
  const TTS_COOLDOWN_MS = 300;

  // Extract complete sentences from text for streaming TTS
  const extractCompleteSentences = useCallback((text: string): string[] => {
    // Match sentences ending with .!? followed by space or end of string
    const sentencePattern = /[^.!?]*[.!?]+(?:\s|$)/g;
    const matches = text.match(sentencePattern);
    return matches ? matches.map(s => s.trim()).filter(s => s.length > 0) : [];
  }, []);

  // Performance tracking refs
  // 
  // PIPELINE TIMING METHODOLOGY:
  // The total pipeline time represents user-perceived latency - the time from when
  // the user stops talking until they hear the first audio response from the AI.
  //
  // Timeline:
  // 1. User speaks -> speechStartTime recorded
  // 2. User stops speaking -> speechEndTime + pipelineStartTime recorded (processing begins)
  // 3. STT processes audio -> sttProcessingTime calculated
  // 4. LLM receives text and starts processing -> llmStartTime recorded
  // 5. LLM returns first token -> llmFirstTokenTime recorded
  // 6. TTS begins generation (Kokoro) or starts speaking (native) -> ttsStartTime recorded
  // 7. TTS audio starts playing -> ttsFirstSpeechTime recorded + TOTAL PIPELINE TIME CALCULATED
  // 8. LLM completes -> llmCompletionTime calculated
  // 9. TTS finishes speaking -> ttsCompletionTime calculated
  //
  // Key insight: Total pipeline time = pipelineStartTime to ttsFirstSpeechTime
  // This captures the user's actual waiting experience from speech end to hearing the first audio.
  //
  const performanceRef = useRef({
    speechStartTime: 0,
    speechEndTime: 0,
    sttStartTime: 0,
    sttEndTime: 0,
    llmStartTime: 0,
    llmFirstTokenTime: 0,
    llmEndTime: 0,
    ttsFirstSpeechTime: 0,
    ttsStartTime: 0,
    ttsEndTime: 0,
    pipelineStartTime: 0, // Set when user stops speaking (processing begins)
  });

  // Initialize Moonshine with custom config
  const moonshine = useMoonshine({
    ...config.moonshine,
    onSpeechStart: () => {
      // Reset performance metrics for new turn
      performanceRef.current.speechStartTime = Date.now();
      performanceRef.current.llmFirstTokenTime = 0;
      performanceRef.current.llmStartTime = 0;
      performanceRef.current.sttEndTime = 0;
      performanceRef.current.pipelineStartTime = 0; // Reset pipeline timing for new turn
      performanceRef.current.ttsFirstSpeechTime = 0;
      setState(prev => ({ ...prev, isListening: true, isProcessingSTT: true }));
    },
    onSpeechEnd: () => {
      performanceRef.current.speechEndTime = Date.now();
      performanceRef.current.pipelineStartTime = Date.now(); // Start pipeline timing when user stops speaking
      const vadTime = performanceRef.current.speechEndTime - performanceRef.current.speechStartTime;
      setState(prev => ({
        ...prev,
        performance: { ...prev.performance, vadDetectionTime: vadTime }
      }));
    },
    onTranscription: (text: string) => {
      handleTranscription(text);
    },
    onError: (error: string) => {
      setState(prev => ({ ...prev, error }));
    },
  });

  // Initialize LLM
  const llm = useLLMStreaming(config.llm);

  // Initialize TTS based on engine selection
  const nativeTTS = useSystemTTS(config.tts);
  const kokoroTTS = useKokoroTTS({
    voice: config.tts.kokoroVoice || 'af_sky',
    model: config.tts.kokoroModel,
    dtype: config.tts.kokoroDtype || 'q8', // Default to q8 for optimal browser performance
    device: 'auto', // Auto-detect WebGPU or fallback to WASM
    speed: 1.15,  // Slightly faster speech rate to match ElevenLabs
    autoInitialize: config.tts.engine === 'kokoro',
  });
  
  // Use the selected TTS engine
  const tts = config.tts.engine === 'kokoro' ? kokoroTTS : nativeTTS;

  // Update statistics
  const updateStats = useCallback((responseTime: number) => {
    responseTimesRef.current.push(responseTime);
    if (responseTimesRef.current.length > 10) {
      responseTimesRef.current.shift();
    }
    
    const avgResponseTime = responseTimesRef.current.reduce((a, b) => a + b, 0) / responseTimesRef.current.length;
    
    setState(prev => ({
      ...prev,
      stats: {
        ...prev.stats,
        totalTurns: prev.stats.totalTurns + 1,
        avgResponseTime: Math.round(avgResponseTime),
        lastResponseTime: Math.round(responseTime),
      }
    }));
  }, []);

  // Monitor TTS state changes for performance tracking and VAD control
  const prevTTSStateRef = useRef({ isSpeaking: false, isGenerating: false });
  useEffect(() => {
    const wasSpeaking = prevTTSStateRef.current.isSpeaking;
    const isSpeaking = tts.isSpeaking;
    const wasGenerating = prevTTSStateRef.current.isGenerating;
    const isGenerating = config.tts.engine === 'kokoro' ? kokoroTTS.isGenerating : false;
    
    // Track when TTS generation starts (for Kokoro)
    if (!wasGenerating && isGenerating) {
      console.log('[MoonshineConversation] Kokoro TTS generation started');
      // Don't set ttsStartTime here - it's already set when speakResponse is called
    }
    
    // TTS started speaking
    if (!wasSpeaking && isSpeaking) {
      // Don't set ttsStartTime here - it's already set when speakResponse is called
      
      setState(prev => ({ ...prev, isSpeaking: true }));
      moonshine.pauseVAD();
      
      // Track first speech time and calculate total pipeline time
      if (!performanceRef.current.ttsFirstSpeechTime) {
        performanceRef.current.ttsFirstSpeechTime = Date.now();
        const ttsProcessingTime = performanceRef.current.ttsStartTime ? 
          Date.now() - performanceRef.current.ttsStartTime : 0;
        
        // TOTAL PIPELINE TIME: From user speech end to first TTS audio output
        // This is the true end-to-end latency that users experience
        const totalPipelineTime = performanceRef.current.pipelineStartTime > 0 ? 
          Date.now() - performanceRef.current.pipelineStartTime : 0;
        
        // Debug logging to verify calculation
        const sttTime = performanceRef.current.sttEndTime - performanceRef.current.speechEndTime;
        const llmTime = performanceRef.current.llmFirstTokenTime - performanceRef.current.llmStartTime;
        const sumOfParts = sttTime + llmTime + ttsProcessingTime;
        
        // Calculate gaps between stages
        const sttToLLMGap = performanceRef.current.llmStartTime - performanceRef.current.sttEndTime;
        const llmToTTSGap = performanceRef.current.ttsStartTime - performanceRef.current.llmEndTime;
        
        console.log('[MoonshineConversation] Pipeline timing breakdown:', {
          pipelineStartTime: performanceRef.current.pipelineStartTime,
          currentTime: Date.now(),
          totalPipelineTime: totalPipelineTime,
          stages: {
            stt: sttTime,
            llm: llmTime,
            tts: ttsProcessingTime
          },
          gaps: {
            sttToLLM: sttToLLMGap,
            llmToTTS: llmToTTSGap
          },
          sumOfParts: sumOfParts,
          sumWithGaps: sumOfParts + sttToLLMGap + llmToTTSGap,
          difference: totalPipelineTime - sumOfParts,
          calculation: `${sttTime} + ${llmTime} + ${ttsProcessingTime} = ${sumOfParts} (actual: ${totalPipelineTime})`
        });
        
        // Track averages for all pipeline stages - only if values are valid
        if (totalPipelineTime > 0 && totalPipelineTime < 30000) { // Reasonable upper bound (30 seconds)
          const currentVadTime = performanceRef.current.speechEndTime - performanceRef.current.speechStartTime;
          const llmFirstTokenTime = performanceRef.current.llmFirstTokenTime > 0 ? 
            performanceRef.current.llmFirstTokenTime - performanceRef.current.llmStartTime : 0;
          
          // Only track valid positive values
          if (currentVadTime > 0 && currentVadTime < 10000) vadTimesRef.current.push(currentVadTime);
          if (llmFirstTokenTime > 0 && llmFirstTokenTime < 10000) llmFirstTokenTimesRef.current.push(llmFirstTokenTime);  
          if (ttsProcessingTime > 0 && ttsProcessingTime < 10000) ttsTimesRef.current.push(ttsProcessingTime);
          if (totalPipelineTime > 0) perceivedLatencyTimesRef.current.push(totalPipelineTime);
        }
        
        // Keep only last 10 measurements for rolling average
        [vadTimesRef, llmFirstTokenTimesRef, ttsTimesRef, perceivedLatencyTimesRef].forEach(ref => {
          if (ref.current.length > 10) ref.current.shift();
        });
        
        // Calculate averages - only if we have valid data
        const avgVAD = vadTimesRef.current.length > 0 ? 
          vadTimesRef.current.reduce((a, b) => a + b, 0) / vadTimesRef.current.length : 0;
        const avgLLMFirstToken = llmFirstTokenTimesRef.current.length > 0 ? 
          llmFirstTokenTimesRef.current.reduce((a, b) => a + b, 0) / llmFirstTokenTimesRef.current.length : 0;
        const avgTTS = ttsTimesRef.current.length > 0 ? 
          ttsTimesRef.current.reduce((a, b) => a + b, 0) / ttsTimesRef.current.length : 0;
        const avgPerceivedLatency = perceivedLatencyTimesRef.current.length > 0 ? 
          perceivedLatencyTimesRef.current.reduce((a, b) => a + b, 0) / perceivedLatencyTimesRef.current.length : 0;

        // Only update state if we have a valid pipeline time
        if (totalPipelineTime > 0) {
          setState(prev => ({
            ...prev,
            performance: { 
              ...prev.performance, 
              ttsFirstSpeechTime: ttsProcessingTime,
              totalPipelineTime: totalPipelineTime
            },
            stats: {
              ...prev.stats,
              avgVADTime: Math.round(avgVAD),
              avgLLMFirstTokenTime: Math.round(avgLLMFirstToken),
              avgTTSTime: Math.round(avgTTS),
              avgPerceivedLatency: Math.round(avgPerceivedLatency)
            }
          }));
        }
        
        // Track performance metrics
        trackPerformanceMetric('total_pipeline_time', totalPipelineTime, 'moonshine');
        trackPerformanceMetric('stt_processing_time', sttTime, 'moonshine');
        trackPerformanceMetric('llm_processing_time', llmTime, 'moonshine');
        trackPerformanceMetric('tts_processing_time', ttsProcessingTime, 'moonshine');
        
        // Track comprehensive comparison metrics
        const vadTime = performanceRef.current.speechEndTime - performanceRef.current.speechStartTime;
        trackVoiceComparison('moonshine', {
          sttLatency: sttTime,
          llmLatency: llmTime,
          ttsLatency: ttsProcessingTime,
          totalLatency: totalPipelineTime,
          perceivedLatency: totalPipelineTime, // Speech end to first audio
          vadDetectionTime: vadTime,
        });
        
        console.log(`[MoonshineConversation] Pipeline complete - Total: ${totalPipelineTime}ms (Speech→Audio)`);
      }
    }
    
    // TTS stopped speaking
    if (wasSpeaking && !isSpeaking) {
      performanceRef.current.ttsEndTime = Date.now();
      const ttsTime = performanceRef.current.ttsStartTime ? 
        performanceRef.current.ttsEndTime - performanceRef.current.ttsStartTime : 0;
      
      setState(prev => ({
        ...prev,
        isSpeaking: false,
        performance: { 
          ...prev.performance, 
          ttsCompletionTime: ttsTime
        }
      }));
      
      // Reset TTS timing (but NOT pipeline timing - that resets on new speech)
      performanceRef.current.ttsStartTime = 0;
      performanceRef.current.ttsFirstSpeechTime = 0;
      
      lastTTSEndTimeRef.current = Date.now();
      // Resume VAD after TTS finishes for both native and Kokoro
      setTimeout(() => {
        console.log('[MoonshineConversation] Resuming VAD from monitoring effect');
        moonshine.resumeVAD();
      }, TTS_COOLDOWN_MS);

      // Update stats with the final pipeline time (which includes TTS)
      const finalPipelineTime = performanceRef.current.ttsEndTime - performanceRef.current.pipelineStartTime;
      if (finalPipelineTime > 0 && finalPipelineTime < 30000) {
        updateStats(finalPipelineTime);
      }
    }
    
    prevTTSStateRef.current.isSpeaking = isSpeaking;
    prevTTSStateRef.current.isGenerating = isGenerating;
  }, [tts.isSpeaking, kokoroTTS.isGenerating, moonshine, updateStats, config.tts.engine]);

  // Handle TTS errors
  useEffect(() => {
    if (tts.error) {
      setState(prev => {
        // Only update if the error is different
        if (prev.error !== `TTS Error: ${tts.error}`) {
          moonshine.resumeVAD();
          return {
            ...prev,
            error: `TTS Error: ${tts.error}`,
          };
        }
        return prev;
      });
    }
  }, [tts.error, moonshine]);

  // Speak the response
  const speakResponse = useCallback(async (text: string) => {
    if (!text || text.trim().length === 0) return;
    
    // Prevent speaking if already speaking or generating (additional safeguard)
    if (tts.isSpeaking || (config.tts.engine === 'kokoro' && kokoroTTS.isGenerating)) {
      console.log('[MoonshineConversation] Skipping TTS - already speaking/generating:', text.substring(0, 50));
      return;
    }
    
    // Mark when TTS is requested (right after LLM completion)
    if (!performanceRef.current.ttsStartTime) {
      performanceRef.current.ttsStartTime = Date.now();
      console.log('[MoonshineConversation] TTS requested at:', performanceRef.current.ttsStartTime);
    }
    
    const timeSinceLastTTS = Date.now() - lastTTSEndTimeRef.current;
    if (timeSinceLastTTS < TTS_COOLDOWN_MS) {
      await new Promise(resolve => setTimeout(resolve, TTS_COOLDOWN_MS - timeSinceLastTTS));
    }
    
    // Pause VAD before speaking to prevent echo/feedback
    if (moonshine.isListening) {
      console.log('[MoonshineConversation] Pausing VAD before TTS');
      moonshine.pauseVAD();
    }
    
    // Speak using the selected TTS engine
    if (config.tts.engine === 'kokoro') {
      // For Kokoro, we need to wait for it to finish
      // VAD resume is handled by the monitoring effect (same as native TTS)
      try {
        await kokoroTTS.speak(text, true);
      } catch (error) {
        console.error('[MoonshineConversation] Kokoro TTS error:', error);
      }
    } else {
      // For native TTS, the monitoring effect will handle VAD resume
      tts.speak(text);
    }
  }, [tts, kokoroTTS, moonshine, config.tts.engine]);

  // Handle transcription from Moonshine
  const handleTranscription = useCallback(async (text: string) => {
    // Clear spoken sentences when a new transcription starts (new conversation turn)
    spokenSentencesRef.current.clear();
    processedSentencesRef.current = 0;
    
    performanceRef.current.sttEndTime = Date.now();
    const sttTime = performanceRef.current.sttEndTime - performanceRef.current.speechEndTime;
    
    console.log('[MoonshineConversation] STT Complete:', {
      speechEndTime: performanceRef.current.speechEndTime,
      sttEndTime: performanceRef.current.sttEndTime,
      sttTime: sttTime
    });
    
    // Update STT times for averaging
    sttTimesRef.current.push(sttTime);
    if (sttTimesRef.current.length > 10) {
      sttTimesRef.current.shift();
    }
    const avgSTTTime = sttTimesRef.current.reduce((a, b) => a + b, 0) / sttTimesRef.current.length;

    setState(prev => ({
      ...prev,
      isProcessingSTT: false,
      currentUserInput: text,
      performance: { ...prev.performance, sttProcessingTime: sttTime },
      stats: { ...prev.stats, avgSTTTime: Math.round(avgSTTTime) }
    }));

    console.log(`[MoonshineConversation] Transcription complete: "${text}" (${sttTime}ms)`);

    // Process with LLM if we have text
    if (text && text.trim()) {
      performanceRef.current.llmStartTime = Date.now();
      performanceRef.current.llmFirstTokenTime = 0;
      
      setState(prev => ({
        ...prev,
        isProcessingLLM: true,
        currentAssistantResponse: '',
      }));

      try {
        await llm.sendMessage(
          text,
          // onChunk callback
          (token: string, fullResponse: string) => {
            if (!performanceRef.current.llmFirstTokenTime && token && performanceRef.current.llmStartTime > 0) {
              performanceRef.current.llmFirstTokenTime = Date.now();
              const firstTokenTime = performanceRef.current.llmFirstTokenTime - performanceRef.current.llmStartTime;
              
              setState(prev => ({
                ...prev,
                performance: { 
                  ...prev.performance, 
                  llmFirstTokenTime: firstTokenTime
                  // Note: totalPipelineTime is calculated when TTS actually starts speaking
                }
              }));
            }

            // Early TTS triggering on sentence boundaries
            if (config.autoSpeak !== false) {
              const sentences = extractCompleteSentences(fullResponse);
              if (sentences.length > processedSentencesRef.current) {
                const newSentence = sentences[processedSentencesRef.current];
                if (newSentence && newSentence.trim().length > 0) {
                  // Check if this sentence has already been spoken to prevent loops
                  const sentenceKey = newSentence.trim().toLowerCase();
                  if (!spokenSentencesRef.current.has(sentenceKey)) {
                    console.log('[MoonshineConversation] Early TTS trigger for sentence:', newSentence);
                    spokenSentencesRef.current.add(sentenceKey);
                    speakResponse(newSentence);
                    processedSentencesRef.current++;
                  }
                }
              }
            }

            setState(prev => ({
              ...prev,
              currentAssistantResponse: fullResponse,
            }));
          },
          // onComplete callback
          (fullText: string) => {
            performanceRef.current.llmEndTime = Date.now();
            const llmTime = performanceRef.current.llmEndTime - performanceRef.current.llmStartTime;
            
            console.log('[MoonshineConversation] LLM timing:', {
              llmStartTime: performanceRef.current.llmStartTime,
              llmEndTime: performanceRef.current.llmEndTime,
              llmTime: llmTime
            });
            
            setState(prev => ({
              ...prev,
              isProcessingLLM: false,
              currentAssistantResponse: fullText,
              performance: { 
                ...prev.performance, 
                llmCompletionTime: llmTime
                // Note: totalPipelineTime already calculated at first token
              }
            }));

            if (config.autoSpeak !== false) {
              // Speak any remaining text that wasn't processed as complete sentences
              const sentences = extractCompleteSentences(fullText);
              const remainingText = sentences.slice(processedSentencesRef.current).join(' ').trim();
              
              if (remainingText.length > 0) {
                const remainingKey = remainingText.toLowerCase();
                if (!spokenSentencesRef.current.has(remainingKey)) {
                  console.log('[MoonshineConversation] Speaking remaining text:', remainingText);
                  spokenSentencesRef.current.add(remainingKey);
                  speakResponse(remainingText);
                }
              } else if (sentences.length === 0) {
                // No complete sentences, speak the full text
                const fullTextKey = fullText.trim().toLowerCase();
                if (!spokenSentencesRef.current.has(fullTextKey)) {
                  console.log('[MoonshineConversation] No complete sentences, speaking full text');
                  spokenSentencesRef.current.add(fullTextKey);
                  speakResponse(fullText);
                }
              }
            }
            
            // Reset sentence counter for next response (but NOT spoken sentences - they clear when new transcription starts)
            processedSentencesRef.current = 0;
          }
        );
      } catch (error) {
        console.error('[MoonshineConversation] LLM error:', error);
        setState(prev => ({
          ...prev,
          isProcessingLLM: false,
          error: `LLM Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }));
      }
    }
  }, [llm, config.autoSpeak, speakResponse]);

  // Start conversation
  const startConversation = useCallback(async () => {
    console.log('[MoonshineConversation] 🟢 Starting conversation...');
    console.log('[MoonshineConversation] Current state before start:', { isActive: state.isActive, moonshine: { isInitialized: moonshine.isInitialized, isListening: moonshine.isListening } });
    setState(prev => ({ ...prev, isActive: true, error: null }));
    
    // Track conversation start
    trackVoiceConversation('moonshine', 'started', {
      tts_engine: config.tts.engine,
    });
    
    // Reset sentence processing counter and spoken sentences
    processedSentencesRef.current = 0;
    spokenSentencesRef.current.clear();
    
    // Initialize Kokoro TTS if selected with optimized settings
    if (config.tts.engine === 'kokoro' && !kokoroTTS.isInitialized) {
      console.log('[MoonshineConversation] Initializing Kokoro TTS with optimized settings...');
      // Note: useKokoroTTS hook is already configured with optimized settings
      // The initialize function will use the config passed to the hook
      await kokoroTTS.initialize();
    }
    
    // Initialize moonshine components
    await moonshine.initialize();
    
    // Start listening
    await moonshine.startListening();
    
    console.log('[MoonshineConversation] ✅ Conversation started successfully');
  }, [config.tts.engine, kokoroTTS, moonshine]);

  // Stop conversation
  const stopConversation = useCallback(() => {
    console.error('[MoonshineConversation] ⚠️ stopConversation called - Stack trace:', new Error().stack);
    console.log('[MoonshineConversation] Stopping conversation...');
    
    // Track conversation completion if it was running
    if (state.isActive) {
      trackVoiceConversation('moonshine', 'completed', {
        duration: Date.now() - performanceRef.current.speechStartTime,
        tts_engine: config.tts.engine,
      });
    }
    
    moonshine.stopListening();
    llm.stop();
    tts.stop();
    
    setState(prev => ({
      ...prev,
      isActive: false,
      isListening: false,
      isProcessingSTT: false,
      isProcessingLLM: false,
      isSpeaking: false,
    }));
    
    console.log('[MoonshineConversation] Conversation stopped');
  }, [moonshine, llm, tts]);

  // Toggle conversation
  const toggleConversation = useCallback(() => {
    if (state.isActive) {
      stopConversation();
    } else {
      startConversation();
    }
  }, [state.isActive, startConversation, stopConversation]);

  // Interrupt current speech
  const interrupt = useCallback(() => {
    if (state.isSpeaking && config.interruptible !== false) {
      console.log('[MoonshineConversation] Interrupting speech...');
      tts.stop();
      moonshine.resumeVAD();
      setState(prev => ({ ...prev, isSpeaking: false }));
    }
  }, [state.isSpeaking, config.interruptible, tts, moonshine]);

  // Clear conversation
  const clearConversation = useCallback(() => {
    llm.clearHistory();
    setState(prev => ({
      ...prev,
      currentUserInput: '',
      currentAssistantResponse: '',
      stats: {
        totalTurns: 0,
        avgResponseTime: 0,
        lastResponseTime: 0,
        avgSTTTime: 0,
        avgVADTime: 0,
        avgLLMFirstTokenTime: 0,
        avgTTSTime: 0,
        avgPerceivedLatency: 0,
      }
    }));
    responseTimesRef.current = [];
    sttTimesRef.current = [];
    vadTimesRef.current = [];
    llmFirstTokenTimesRef.current = [];
    ttsTimesRef.current = [];
    perceivedLatencyTimesRef.current = [];
  }, [llm]);

  return {
    // State
    ...state,
    
    // Moonshine specific state
    interimTranscription: moonshine.interimTranscription,
    isTranscribing: moonshine.isTranscribing,
    
    // TTS info
    tts: {
      engine: config.tts.engine || 'native',
      isReady: config.tts.engine === 'kokoro' ? kokoroTTS.isReady : true,
      currentVoice: config.tts.engine === 'kokoro' ? kokoroTTS.currentVoice : config.tts.voice,
      performanceMetrics: config.tts.engine === 'kokoro' ? kokoroTTS.performanceMetrics : undefined,
    },
    
    // Actions
    startConversation,
    stopConversation,
    toggleConversation,
    interrupt,
    clearConversation,
  };
}