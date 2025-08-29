import { useState, useCallback, useRef } from 'react';
import OpenAI from 'openai';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface LLMConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  baseUrl?: string;
}

export interface LLMState {
  isStreaming: boolean;
  currentResponse: string;
  isComplete: boolean;
  error: string | null;
  messages: LLMMessage[];
  tokensGenerated: number;
  responseTime: number;
}

export function useLLMStreaming(config: LLMConfig = {}) {
  const [state, setState] = useState<LLMState>({
    isStreaming: false,
    currentResponse: '',
    isComplete: false,
    error: null,
    messages: [],
    tokensGenerated: 0,
    responseTime: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const responseStartTimeRef = useRef<number>(0);
  const clientRef = useRef<OpenAI | null>(null);

  // Initialize OpenAI client when API key is available
  const getClient = useCallback(() => {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    if (!clientRef.current || clientRef.current.apiKey !== config.apiKey) {
      clientRef.current = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        dangerouslyAllowBrowser: true, // Required for browser usage
      });
    }

    return clientRef.current;
  }, [config.apiKey, config.baseUrl]);

  // Send message and stream response using Chat Completions API (primary method)
  const sendMessage = useCallback(async (
    userMessage: string, 
    onChunk?: (chunk: string, fullResponse: string) => void,
    onComplete?: (fullResponse: string) => void
  ) => {
    if (state.isStreaming) {
      console.warn('[LLM] Already streaming, aborting previous request');
      abortControllerRef.current?.abort();
    }

    console.log('[LLM] Starting streaming request with Chat Completions API:', userMessage);
    
    // Create abort controller for this request
    abortControllerRef.current = new AbortController();
    responseStartTimeRef.current = Date.now();

    // Add user message to history
    const newMessages: LLMMessage[] = [
      ...state.messages,
      {
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
      }
    ];

    setState(prev => ({
      ...prev,
      isStreaming: true,
      currentResponse: '',
      isComplete: false,
      error: null,
      messages: newMessages,
      tokensGenerated: 0,
    }));

    try {
      const client = getClient();
      
      // Prepare messages for Chat Completions API
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      
      if (config.systemPrompt) {
        messages.push({
          role: 'system',
          content: config.systemPrompt
        });
      }

      // Add conversation history
      newMessages.forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });

      console.log('[LLM] Using Chat Completions API with model:', config.model || 'gpt-4o');

      const stream = await client.chat.completions.create({
        model: config.model || 'gpt-4o',
        messages,
        stream: true,
        max_tokens: config.maxTokens || 1000,
        temperature: config.temperature || 0.7,
      });

      let fullResponse = '';
      let tokenCount = 0;

      for await (const chunk of stream) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          tokenCount++;
          
          setState(prev => ({
            ...prev,
            currentResponse: fullResponse,
            tokensGenerated: tokenCount,
          }));

          onChunk?.(content, fullResponse);
        }
      }

      // Complete the response
      const responseTime = Date.now() - responseStartTimeRef.current;
      
      setState(prev => ({
        ...prev,
        isStreaming: false,
        isComplete: true,
        messages: [
          ...prev.messages,
          {
            role: 'assistant',
            content: fullResponse,
            timestamp: Date.now(),
          }
        ],
        responseTime,
      }));

      console.log('[LLM] Response completed:', {
        tokens: tokenCount,
        time: `${responseTime}ms`,
        throughput: `${(tokenCount / (responseTime / 1000)).toFixed(1)} tokens/s`
      });

      onComplete?.(fullResponse);

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[LLM] Request aborted');
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[LLM] Chat Completions API failed:', errorMessage);

      setState(prev => ({
        ...prev,
        isStreaming: false,
        isComplete: true,
        error: errorMessage,
      }));
    }
  }, [config, state.messages, state.isStreaming, getClient]);
  // Stop streaming
  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log('[LLM] Streaming stopped by user');
    }
  }, []);

  // Clear conversation
  const clearMessages = useCallback(() => {
    setState(prev => ({
      ...prev,
      messages: [],
      currentResponse: '',
      isComplete: false,
      error: null,
      tokensGenerated: 0,
      responseTime: 0,
    }));
  }, []);

  // Add message without sending (for system messages, etc.)
  const addMessage = useCallback((message: Omit<LLMMessage, 'timestamp'>) => {
    setState(prev => ({
      ...prev,
      messages: [
        ...prev.messages,
        {
          ...message,
          timestamp: Date.now(),
        }
      ]
    }));
  }, []);

  return {
    ...state,
    sendMessage,
    processMessage: sendMessage, // Alias for compatibility
    stopStreaming,
    stop: stopStreaming, // Alias for compatibility
    clearMessages,
    clearHistory: clearMessages, // Alias for compatibility
    addMessage,
  };
}