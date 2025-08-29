import { useState, useRef, useCallback, useEffect } from 'react';
import { ElevenLabsService, ConversationMessage, ElevenLabsConfig } from '../services/elevenlabs';
import OpenAI from 'openai';
import { trackVoiceConversation, trackPerformanceMetric, trackVoiceComparison } from '../utils/analytics';

interface UseElevenLabsConversationConfig extends ElevenLabsConfig {
  onMessage?: (message: ConversationMessage) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: ConversationStatus) => void;
  autoSpeak?: boolean;
  openaiApiKey?: string;
  openaiModel?: string;
}

type ConversationStatus = 'idle' | 'listening' | 'processing-stt' | 'processing-llm' | 'speaking' | 'error';

interface ConversationStats {
  totalMessages: number;
  lastResponseTime: number;
  avgResponseTime: number;
}

export const useElevenLabsConversation = (config: UseElevenLabsConversationConfig) => {
  const [service, setService] = useState<ElevenLabsService | null>(null);
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<any[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [currentResponse, setCurrentResponse] = useState('');
  const [stats, setStats] = useState<ConversationStats>({
    totalMessages: 0,
    lastResponseTime: 0,
    avgResponseTime: 0,
  });
  const [isListening, setIsListening] = useState(false);
  const isActiveRef = useRef(false);

  console.log('[useElevenLabsConversation] Hook initialized with config:', {
    hasApiKey: !!config.apiKey,
    hasOpenaiKey: !!config.openaiApiKey,
    voiceId: config.voiceId,
    autoSpeak: config.autoSpeak
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const responseTimeRef = useRef<number>(0);
  const performanceRef = useRef<{
    conversationStart: number;
    sttStart: number;
    llmStart: number;
    ttsStart: number;
    ttsRequestStartTime?: number;
    lastMetrics: {
      sttLatency: number;
      llmLatency: number;
      ttsLatency: number;
      totalLatency: number;
      // Average tracking
      avgSttLatency: number;
      avgLlmLatency: number;
      avgTtsLatency: number;
      avgTotalLatency: number;
      sttCount: number;
      llmCount: number;
      ttsCount: number;
      totalCount: number;
    };
  }>({
    conversationStart: 0,
    sttStart: 0,
    llmStart: 0,
    ttsStart: 0,
    lastMetrics: {
      sttLatency: 0,
      llmLatency: 0,
      ttsLatency: 0,
      totalLatency: 0,
      // Initialize averages
      avgSttLatency: 0,
      avgLlmLatency: 0,
      avgTtsLatency: 0,
      avgTotalLatency: 0,
      sttCount: 0,
      llmCount: 0,
      ttsCount: 0,
      totalCount: 0,
    }
  });
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const SILENCE_THRESHOLD = 25; // dB threshold for silence detection (lowered for better sensitivity)
  const SILENCE_DURATION = 384; // ms of silence before stopping recording (matched to RunAnywhere/Moonshine for fair comparison)

  // Initialize service when API key changes
  useEffect(() => {
    console.log('[useElevenLabsConversation] Effect: Initializing service', {
      hasApiKey: !!config.apiKey,
      voiceId: config.voiceId
    });
    
    if (config.apiKey) {
      try {
        console.log('[useElevenLabsConversation] Creating new ElevenLabsService');
        const newService = new ElevenLabsService(config);
        setService(newService);
        setError(null);
        console.log('[useElevenLabsConversation] Service created successfully');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to initialize ElevenLabs service';
        console.error('[useElevenLabsConversation] Service creation failed:', errorMsg, err);
        setError(errorMsg);
      }
    } else {
      console.log('[useElevenLabsConversation] No API key provided, service not initialized');
    }
  }, [config.apiKey, config.voiceId, config.modelId]);

  // Load available voices
  useEffect(() => {
    const loadVoices = async () => {
      console.log('[useElevenLabsConversation] Effect: Loading voices', { hasService: !!service });
      
      if (service) {
        try {
          console.log('[useElevenLabsConversation] Fetching available voices...');
          const availableVoices = await service.getAvailableVoices();
          console.log('[useElevenLabsConversation] Voices loaded:', availableVoices.length);
          setVoices(availableVoices);
        } catch (err) {
          console.error('[useElevenLabsConversation] Failed to load voices:', err);
        }
      } else {
        console.log('[useElevenLabsConversation] No service available, skipping voice load');
      }
    };
    loadVoices();
  }, [service]);

  const updateStatus = useCallback((newStatus: ConversationStatus) => {
    setStatus(newStatus);
    config.onStatusChange?.(newStatus);
  }, [config.onStatusChange]);

  const addMessage = useCallback((message: ConversationMessage) => {
    setMessages(prev => [...prev, message]);
    config.onMessage?.(message);
    
    // Update stats
    const now = Date.now();
    if (message.role === 'assistant' && responseTimeRef.current > 0) {
      const responseTime = now - responseTimeRef.current;
      setStats(prev => ({
        totalMessages: prev.totalMessages + 1,
        lastResponseTime: responseTime,
        avgResponseTime: (prev.avgResponseTime * prev.totalMessages + responseTime) / (prev.totalMessages + 1),
      }));
    }
  }, [config.onMessage]);

  const handleError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    updateStatus('error');
    config.onError?.(errorMessage);
  }, [config.onError, updateStatus]);

  const playAudioResponse = useCallback(async (text: string) => {
    if (!service || !config.autoSpeak) return;

    try {
      updateStatus('speaking');
      
      // Stop any currently playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      const ttsStartTime = Date.now();
      const audioBuffer = await service.textToSpeech(text, config.voiceId || undefined);
      const ttsApiLatency = Date.now() - ttsStartTime;
      // Store TTS start time for measuring time to first audio playback
      performanceRef.current.ttsRequestStartTime = ttsStartTime;
      
      console.log('[useElevenLabsConversation] TTS API response in', ttsApiLatency, 'ms');
      console.log('[useElevenLabsConversation] Audio buffer received:', {
        bufferType: typeof audioBuffer,
        bufferSize: audioBuffer?.byteLength || 0,
        constructor: audioBuffer?.constructor?.name
      });
      
      // Ensure we have a proper ArrayBuffer
      let finalBuffer: ArrayBuffer;
      if (audioBuffer instanceof ArrayBuffer) {
        finalBuffer = audioBuffer;
      } else if (audioBuffer && typeof audioBuffer === 'object') {
        // Convert ReadableStream or other formats to ArrayBuffer
        finalBuffer = await new Response(audioBuffer as any).arrayBuffer();
      } else {
        throw new Error('Invalid audio buffer format received');
      }
      
      const audioBlob = new Blob([finalBuffer], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        updateStatus('idle');
        // Automatically resume listening after speaking
        if (isActiveRef.current) {
          setTimeout(() => startContinuousListening(), 500);
        }
      };
      
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        handleError('Failed to play audio response');
      };
      
      // Set up event to capture when audio actually starts playing
      audio.onplaying = () => {
        const audioStartTime = Date.now();
        console.log('[ElevenLabsConversation] Audio actually started playing');
        
        // Calculate actual TTS latency (from request to first audio playback)
        if (performanceRef.current.ttsRequestStartTime) {
          const ttsLatency = audioStartTime - performanceRef.current.ttsRequestStartTime;
          performanceRef.current.lastMetrics.ttsLatency = ttsLatency;
          
          // Update TTS average
          const metrics = performanceRef.current.lastMetrics;
          metrics.ttsCount++;
          metrics.avgTtsLatency = Math.round((metrics.avgTtsLatency * (metrics.ttsCount - 1) + ttsLatency) / metrics.ttsCount);
          
          console.log('[useElevenLabsConversation] TTS latency (request to audio start):', ttsLatency, 'ms');
        }
        
        // Calculate perceived latency when audio ACTUALLY starts playing
        if (performanceRef.current.conversationStart > 0) {
          const perceivedLatency = audioStartTime - performanceRef.current.conversationStart;
          performanceRef.current.lastMetrics.totalLatency = perceivedLatency;
          
          // Detailed timing log
          console.log('[ElevenLabsConversation] Detailed timing:', {
            conversationStart: performanceRef.current.conversationStart,
            audioStartTime: audioStartTime,
            perceivedLatency: perceivedLatency,
            breakdown: {
              stt: performanceRef.current.lastMetrics.sttLatency,
              llm: performanceRef.current.lastMetrics.llmLatency,
              tts: performanceRef.current.lastMetrics.ttsLatency,
              total: perceivedLatency
            }
          });
          
          // Update average
          const totalMetrics = performanceRef.current.lastMetrics;
          totalMetrics.totalCount++;
          totalMetrics.avgTotalLatency = Math.round((totalMetrics.avgTotalLatency * (totalMetrics.totalCount - 1) + perceivedLatency) / totalMetrics.totalCount);
          
          // Track analytics
          trackPerformanceMetric('total_pipeline_time', perceivedLatency, 'elevenlabs');
          trackVoiceComparison('elevenlabs', {
            totalLatency: perceivedLatency,
            perceivedLatency: perceivedLatency,
          });
          
          console.log('[useElevenLabsConversation] Perceived latency (speech end → audio start):', perceivedLatency, 'ms');
          
          // Reset for next turn
          performanceRef.current.conversationStart = 0;
        }
      };
      
      // Start playback
      await audio.play();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[useElevenLabsConversation] TTS Error:', errorMsg);
      
      // Check for voice not found error
      if (errorMsg.includes('voice_not_found')) {
        handleError('Selected voice not found. Please choose a different voice from settings.');
      } else if (errorMsg.includes('quota_exceeded')) {
        handleError('API quota exceeded for TTS. Please check your ElevenLabs account.');
      } else {
        handleError(`TTS Error: ${errorMsg}`);
      }
      
      // Resume listening even if TTS fails
      updateStatus('idle');
      if (isActiveRef.current) {
        setTimeout(() => startContinuousListening(), 1000);
      }
    }
  }, [service, config.autoSpeak, config.voiceId, updateStatus, handleError]);

  const processWithLLM = useCallback(async (userMessage: string): Promise<string> => {
    // Check if OpenAI API key is available
    const openaiKey = config.openaiApiKey || localStorage.getItem('openai_api_key');
    
    if (!openaiKey) {
      // Fallback to simple response if no OpenAI key
      return `I heard you say: "${userMessage}". Please set your OpenAI API key in settings to enable AI responses.`;
    }

    try {
      const openai = new OpenAI({
        apiKey: openaiKey,
        dangerouslyAllowBrowser: true, // Required for browser usage
      });

      const completion = await openai.chat.completions.create({
        model: config.openaiModel || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. Keep your responses concise and friendly.',
          },
          ...messages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          {
            role: 'user',
            content: userMessage,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      });

      return completion.choices[0]?.message?.content || 'Sorry, I could not process that.';
    } catch (error) {
      console.error('OpenAI API Error:', error);
      return `I heard: "${userMessage}". (AI processing error - check API key and try again)`;
    }
  }, [config.openaiApiKey, config.openaiModel, messages]);

  const processUserInput = useCallback(async (inputText: string) => {
    if (!service) return;

    try {
      // Don't reset conversationStart - it's already set when recording stopped
      responseTimeRef.current = Date.now();
      updateStatus('processing-llm');
      setCurrentInput(inputText);

      // Add user message
      const userMessage: ConversationMessage = {
        role: 'user',
        content: inputText,
        timestamp: new Date(),
      };
      addMessage(userMessage);
      service.addToConversationHistory(userMessage);

      // Process with LLM (you can integrate OpenAI, Anthropic, etc. here)
      performanceRef.current.llmStart = Date.now();
      const response = await processWithLLM(inputText);
      const llmLatency = Date.now() - performanceRef.current.llmStart;
      performanceRef.current.lastMetrics.llmLatency = llmLatency;
      // Note: LLM is handled separately from ElevenLabs API
      // Update LLM average for internal use only
      const llmMetrics = performanceRef.current.lastMetrics;
      llmMetrics.llmCount++;
      llmMetrics.avgLlmLatency = Math.round((llmMetrics.avgLlmLatency * (llmMetrics.llmCount - 1) + llmLatency) / llmMetrics.llmCount);
      
      console.log('[useElevenLabsConversation] LLM completed in', llmLatency, 'ms');
      setCurrentResponse(response);

      // Add assistant message
      const assistantMessage: ConversationMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      addMessage(assistantMessage);
      service.addToConversationHistory(assistantMessage);

      // Clear input after processing
      setCurrentInput('');

      // Play response if auto-speak is enabled
      performanceRef.current.ttsStart = Date.now();
      await playAudioResponse(response);
      // Note: Perceived latency is now calculated inside playAudioResponse when audio actually starts
      
    } catch (err) {
      handleError(`Processing Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [service, updateStatus, addMessage, processWithLLM, playAudioResponse, handleError]);

  // Helper function to check if we should resume listening
  const shouldResumeListening = useCallback(() => {
    const currentStatus = status;
    return isActiveRef.current && 
           currentStatus !== 'speaking' && 
           currentStatus !== 'processing-llm' && 
           currentStatus !== 'processing-stt';
  }, [status]);

  // Continuous listening with silence detection
  const startContinuousListening = useCallback(async () => {
    console.log('[useElevenLabsConversation] startContinuousListening called', {
      hasService: !!service,
      isActiveRef: isActiveRef.current,
      status,
      isRecording: isRecordingRef.current
    });
    
    if (!service) {
      console.log('[useElevenLabsConversation] No service, skipping continuous listening');
      return;
    }
    
    if (!isActiveRef.current) {
      console.log('[useElevenLabsConversation] Not active (ref), skipping continuous listening');
      return;
    }
    
    if (status === 'speaking' || status === 'processing-llm' || status === 'processing-stt') {
      console.log('[useElevenLabsConversation] Busy with status:', status);
      return;
    }

    if (isRecordingRef.current) {
      console.log('[useElevenLabsConversation] Already recording');
      return; // Already recording
    }

    try {
      console.log('[useElevenLabsConversation] Starting continuous listening...');
      // Get microphone stream
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          } 
        });
        streamRef.current = stream;

        // Set up audio analysis for VAD
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        source.connect(analyserRef.current);
      }

      // Start recording
      const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? { mimeType: 'audio/webm;codecs=opus' }
        : undefined;
      
      const mediaRecorder = new MediaRecorder(streamRef.current!, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      isRecordingRef.current = true;

      let isSpeaking = false;
      let speechStartTime = 0;
      
      // Monitor audio levels for VAD
      const checkAudioLevel = () => {
        if (!analyserRef.current || !isRecordingRef.current) return;

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate average volume
        const average = dataArray.reduce((acc, val) => acc + val, 0) / bufferLength;
        
        if (average > SILENCE_THRESHOLD) {
          if (!isSpeaking) {
            isSpeaking = true;
            speechStartTime = Date.now();
            setIsListening(true);
            updateStatus('listening');
          }
          // Clear any existing silence timer
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (isSpeaking) {
          // Start silence timer if not already started
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              // Check if we recorded enough speech (min 500ms)
              if (Date.now() - speechStartTime > 500 && mediaRecorderRef.current?.state === 'recording') {
                mediaRecorderRef.current.stop();
                isRecordingRef.current = false;
                isSpeaking = false;
                setIsListening(false);
              } else {
                // Speech was too short, continue listening
                isSpeaking = false;
                silenceTimerRef.current = null;
              }
            }, SILENCE_DURATION);
          }
        }

        // Continue monitoring
        if (isRecordingRef.current) {
          requestAnimationFrame(checkAudioLevel);
        }
      };

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (!service || audioChunksRef.current.length === 0) {
          // Resume listening after processing
          if (isActiveRef.current) {
            setTimeout(() => {
              if (shouldResumeListening()) {
                startContinuousListening();
              }
            }, 200);
          }
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorder.mimeType || 'audio/webm' 
        });
        
        if (audioBlob.size > 1000) { // Minimum size check
          try {
            // Mark when user stopped speaking (recording ended) - this is the start of perceived latency
            performanceRef.current.sttStart = Date.now();
            performanceRef.current.conversationStart = Date.now(); // Always set fresh for this turn
            updateStatus('processing-stt');
            const result = await service.speechToText(audioBlob);
            const sttLatency = Date.now() - performanceRef.current.sttStart;
            performanceRef.current.lastMetrics.sttLatency = sttLatency;
            // Note: STT is part of ElevenLabs integrated API
            // Update STT average for internal use only
            const sttMetrics = performanceRef.current.lastMetrics;
            sttMetrics.sttCount++;
            sttMetrics.avgSttLatency = Math.round((sttMetrics.avgSttLatency * (sttMetrics.sttCount - 1) + sttLatency) / sttMetrics.sttCount);
            
            console.log('[useElevenLabsConversation] STT completed in', sttLatency, 'ms');
            
            if (result.text.trim()) {
              await processUserInput(result.text);
            } else {
              updateStatus('idle');
              // Resume listening if still active
              if (isActiveRef.current) {
                // Use a longer delay and avoid immediate recursion
                setTimeout(() => {
                  if (shouldResumeListening()) {
                    startContinuousListening();
                  }
                }, 200);
              }
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            console.error('[useElevenLabsConversation] STT Error:', errorMsg);
            
            // Check for quota exceeded error
            if (errorMsg.includes('quota_exceeded')) {
              handleError('API quota exceeded. Please check your ElevenLabs account or use a different API key.');
            } else {
              handleError(`STT Error: ${errorMsg}`);
            }
            
            // Resume listening after error (with longer delay for quota errors)
            if (isActiveRef.current) {
              const delay = errorMsg.includes('quota_exceeded') ? 5000 : 1000;
              setTimeout(() => {
                if (shouldResumeListening()) {
                  startContinuousListening();
                }
              }, delay);
            }
          }
        } else {
          // Audio too short, resume listening
          updateStatus('idle');
          if (isActiveRef.current) {
            setTimeout(() => {
              if (shouldResumeListening()) {
                startContinuousListening();
              }
            }, 200);
          }
        }
      };

      mediaRecorder.start();
      updateStatus('idle'); // Start in idle, will change to listening when speech detected
      checkAudioLevel(); // Start VAD monitoring
      console.log('[useElevenLabsConversation] MediaRecorder started, VAD monitoring active');
      
    } catch (err) {
      const errorMsg = `Microphone Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('[useElevenLabsConversation] Error in startContinuousListening:', err);
      handleError(errorMsg);
    }
  }, [service, status, updateStatus, processUserInput, handleError, shouldResumeListening]);

  const startListening = useCallback(async () => {
    console.log('[useElevenLabsConversation] startListening called', {
      hasService: !!service,
      isActive,
      currentStatus: status
    });
    
    if (!service) {
      console.error('[useElevenLabsConversation] Cannot start listening: no service');
      return;
    }
    
    if (!isActive) {
      console.error('[useElevenLabsConversation] Cannot start listening: conversation not active');
      return;
    }
    
    try {
      console.log('[useElevenLabsConversation] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      streamRef.current = stream;

      // Use webm format which is widely supported
      const options = {
        mimeType: 'audio/webm;codecs=opus'
      };
      
      // Fallback to default if webm is not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.log('WebM not supported, using default format');
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
      } else {
        const mediaRecorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = mediaRecorder;
      }
      
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        if (!service || audioChunksRef.current.length === 0) return;

        // Create blob with proper MIME type
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorderRef.current?.mimeType || 'audio/webm' 
        });
        
        // Only process if we have actual audio data
        if (audioBlob.size > 0) {
          try {
            updateStatus('processing-stt');
            const result = await service.speechToText(audioBlob);
            
            if (result.text.trim()) {
              await processUserInput(result.text);
            } else {
              updateStatus('idle');
              // Resume continuous listening if active
              if (isActive) {
                setTimeout(() => startContinuousListening(), 100);
              }
            }
          } catch (err) {
            handleError(`STT Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        } else {
          updateStatus('idle');
        }
      };

      mediaRecorderRef.current.start();
      updateStatus('listening');
      console.log('[useElevenLabsConversation] Recording started successfully');
    } catch (err) {
      const errorMsg = `Microphone Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('[useElevenLabsConversation] Microphone error:', err);
      handleError(errorMsg);
    }
  }, [service, updateStatus, processUserInput, handleError, isActive, status]);

  const stopListening = useCallback(() => {
    console.log('[useElevenLabsConversation] stopListening called', {
      hasRecorder: !!mediaRecorderRef.current,
      recorderState: mediaRecorderRef.current?.state
    });
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      console.log('[useElevenLabsConversation] Recording stopped');
    } else {
      console.log('[useElevenLabsConversation] No active recording to stop');
    }
  }, []);

  const startConversation = useCallback(async () => {
    console.log('[useElevenLabsConversation] startConversation called', {
      hasService: !!service,
      hasApiKey: !!config.apiKey,
      currentStatus: status,
      currentIsActive: isActive
    });
    
    if (!service || !config.apiKey) {
      const errorMsg = 'ElevenLabs service not initialized or API key missing';
      console.error('[useElevenLabsConversation] Cannot start:', errorMsg, {
        service: service ? 'EXISTS' : 'NULL',
        apiKey: config.apiKey ? 'EXISTS' : 'MISSING'
      });
      handleError(errorMsg);
      return;
    }

    try {
      console.log('[useElevenLabsConversation] Starting conversation...');
      // Set both state and ref immediately
      isActiveRef.current = true;
      setIsActive(true);
      setError(null);
      setCurrentInput('');
      setCurrentResponse('');
      updateStatus('idle');
      
      // Track conversation start
      trackVoiceConversation('elevenlabs', 'started', {
        voice_id: config.voiceId,
        model_id: config.modelId,
      });
      
      // Start continuous listening immediately now that isActiveRef is set
      console.log('[useElevenLabsConversation] Starting continuous listening immediately...');
      await startContinuousListening();
      
      console.log('[useElevenLabsConversation] Conversation started successfully');
    } catch (err) {
      const errorMsg = `Failed to start conversation: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('[useElevenLabsConversation] Start conversation error:', err);
      handleError(errorMsg);
      isActiveRef.current = false;
      setIsActive(false);
    }
  }, [service, config.apiKey, handleError, updateStatus, startContinuousListening]);

  const stopConversation = useCallback(() => {
    console.log('[useElevenLabsConversation] stopConversation called');
    
    // Track conversation completion if it was running
    if (isActiveRef.current) {
      trackVoiceConversation('elevenlabs', 'completed', {
        voice_id: config.voiceId,
        model_id: config.modelId,
        message_count: messages.length,
      });
    }
    
    setIsActive(false);
    isActiveRef.current = false;
    isRecordingRef.current = false;
    updateStatus('idle');
    setIsListening(false);
    
    // Clear silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    
    // Stop recording
    stopListening();
    
    // Stop any playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      console.log('[useElevenLabsConversation] Audio playback stopped');
    }
    
    // Clean up audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      analyserRef.current = null;
    }
    
    // Clean up media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      console.log('[useElevenLabsConversation] Media stream cleaned up');
    }
    
    console.log('[useElevenLabsConversation] Conversation stopped successfully');
  }, [updateStatus, stopListening]);

  const sendTextMessage = useCallback(async (text: string) => {
    if (!isActive) return;
    await processUserInput(text);
  }, [isActive, processUserInput]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setCurrentInput('');
    setCurrentResponse('');
    setStats({
      totalMessages: 0,
      lastResponseTime: 0,
      avgResponseTime: 0,
    });
    service?.clearConversationHistory();
  }, [service]);

  const interrupt = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      updateStatus('idle');
      // Resume continuous listening after interruption
      if (isActiveRef.current) {
        setTimeout(() => startContinuousListening(), 100);
      }
    }
  }, [updateStatus, startContinuousListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopConversation();
    };
  }, [stopConversation]);

  return {
    // State
    isActive,
    status,
    error,
    voices,
    messages,
    currentInput,
    currentResponse,
    stats,
    
    // Performance metrics
    metrics: performanceRef.current.lastMetrics,
    
    // Actions
    startConversation,
    stopConversation,
    sendTextMessage,
    startListening,
    stopListening,
    clearHistory,
    interrupt,
    
    // Service methods
    service,
    
    // Status checks
    isListening: isListening || status === 'listening',
    isProcessingSTT: status === 'processing-stt',
    isProcessingLLM: status === 'processing-llm',
    isSpeaking: status === 'speaking',
  };
};