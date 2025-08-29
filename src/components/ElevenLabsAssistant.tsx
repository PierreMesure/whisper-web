import { useState, useEffect, useMemo, useCallback } from 'react';
import { useElevenLabsConversation } from '../hooks/useElevenLabsConversation';

export default function ElevenLabsAssistant() {
  const [showSettings, setShowSettings] = useState(false);
  // Use environment variables or localStorage - users can override with their own keys
  const DEFAULT_ELEVENLABS_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY || '';
  const DEFAULT_OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';
  const [apiKey, setApiKey] = useState(localStorage.getItem('elevenlabs_api_key') || DEFAULT_ELEVENLABS_KEY);
  const [openaiApiKey, setOpenaiApiKey] = useState(localStorage.getItem('openai_api_key') || DEFAULT_OPENAI_KEY);
  const [selectedVoice, setSelectedVoice] = useState(() => {
    const savedVoice = localStorage.getItem('elevenlabs_voice');
    // Clear invalid voice IDs that are actually names
    if (savedVoice && !savedVoice.includes('-') && savedVoice.length < 20) {
      localStorage.removeItem('elevenlabs_voice');
      return '';
    }
    return savedVoice || '';
  });
  const [autoSpeak, setAutoSpeak] = useState(localStorage.getItem('elevenlabs_autospeak') !== 'false');
  
  const [metrics, setMetrics] = useState({
    sttLatency: 0,
    llmLatency: 0,
    ttsLatency: 0,
    totalLatency: 0,
    conversationTurns: 0,
  });

  // Stable callbacks
  const handleError = useCallback((error: string) => {
    console.error('[ElevenLabsAssistant] Error:', error);
  }, []);

  const handleStatusChange = useCallback((status: string) => {
    console.log('[ElevenLabsAssistant] Status:', status);
    // Update metrics based on status changes
    if (status === 'speaking') {
      setMetrics(prev => ({
        ...prev,
        conversationTurns: prev.conversationTurns + 1
      }));
    }
  }, []);

  // Use useMemo to create stable config that only updates when necessary
  const conversationConfig = useMemo(() => {
    const voiceId = selectedVoice && selectedVoice.trim() ? selectedVoice.trim() : 'JBFqnCBsd6RMkjVDRZzb';
    console.log('[ElevenLabsAssistant] Creating config with voiceId:', voiceId, 'selectedVoice:', selectedVoice);
    return {
      apiKey,
      openaiApiKey,
      voiceId,
      autoSpeak,
      onError: handleError,
      onStatusChange: handleStatusChange,
    };
  }, [apiKey, openaiApiKey, selectedVoice, autoSpeak, handleError, handleStatusChange]);

  // Initialize ElevenLabs conversation
  const conversation = useElevenLabsConversation(conversationConfig);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('elevenlabs_api_key', apiKey);
    localStorage.setItem('openai_api_key', openaiApiKey);
    localStorage.setItem('elevenlabs_voice', selectedVoice);
    localStorage.setItem('elevenlabs_autospeak', autoSpeak.toString());
  }, [apiKey, openaiApiKey, selectedVoice, autoSpeak]);

  // Handle start/stop conversation
  const handleToggleConversation = async () => {
    if (conversation.isActive) {
      conversation.stopConversation();
    } else {
      try {
        await conversation.startConversation();
        console.log('[ElevenLabsAssistant] Conversation started, ready to listen');
      } catch (error) {
        console.error('[ElevenLabsAssistant] Failed to start conversation:', error);
      }
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Metrics Display - Full pipeline metrics for ElevenLabs */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-slate-800/50 rounded-lg p-3 border border-purple-500/10">
          <div className="text-xs font-medium text-yellow-400 mb-1">STT Processing</div>
          <div className="text-lg font-bold text-white">
            {conversation.metrics?.sttLatency ? `${conversation.metrics.sttLatency}ms` : '--ms'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Avg: {conversation.metrics?.avgSttLatency ? `${conversation.metrics.avgSttLatency}ms` : '--ms'}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-purple-500/10">
          <div className="text-xs font-medium text-blue-400 mb-1">LLM Processing</div>
          <div className="text-lg font-bold text-white">
            {conversation.metrics?.llmLatency ? `${conversation.metrics.llmLatency}ms` : '--ms'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Avg: {conversation.metrics?.avgLlmLatency ? `${conversation.metrics.avgLlmLatency}ms` : '--ms'}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-slate-800/50 rounded-lg p-3 border border-purple-500/10">
          <div className="text-xs font-medium text-green-400 mb-1">TTS Processing</div>
          <div className="text-lg font-bold text-white">
            {conversation.metrics?.ttsLatency ? `${conversation.metrics.ttsLatency}ms` : '--ms'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Avg: {conversation.metrics?.avgTtsLatency ? `${conversation.metrics.avgTtsLatency}ms` : '--ms'}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-purple-500/10">
          <div className="text-xs font-medium text-orange-400 mb-1">Perceived Latency</div>
          <div className="text-lg font-bold text-white">
            {conversation.metrics?.totalLatency ? `${conversation.metrics.totalLatency}ms` : '--ms'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Avg: {conversation.metrics?.avgTotalLatency ? `${conversation.metrics.avgTotalLatency}ms` : '--ms'}
            <br />Speech end → Audio out
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/50 rounded-lg p-3 border border-purple-500/10">
          <div className="text-xs font-medium text-red-400 mb-1">API Status</div>
          <div className="text-lg font-bold text-white capitalize">
            {conversation.status || 'idle'}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-purple-500/10">
          <div className="text-xs font-medium text-indigo-400 mb-1">Conversation Turns</div>
          <div className="text-lg font-bold text-white">
            {metrics.conversationTurns || 0}
          </div>
        </div>
      </div>

      {/* Status Indicators */}
      <div className="flex items-center justify-center gap-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            conversation.status === 'listening' ? 'bg-green-500 animate-pulse' : 'bg-slate-600'
          }`}></div>
          <span className="text-xs text-slate-400">Listening</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            conversation.status === 'processing-stt' ? 'bg-yellow-500 animate-pulse' : 'bg-slate-600'
          }`}></div>
          <span className="text-xs text-slate-400">Transcribing</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            conversation.status === 'processing-llm' ? 'bg-purple-500 animate-pulse' : 'bg-slate-600'
          }`}></div>
          <span className="text-xs text-slate-400">Processing</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            conversation.status === 'speaking' ? 'bg-red-500 animate-pulse' : 'bg-slate-600'
          }`}></div>
          <span className="text-xs text-slate-400">Speaking</span>
        </div>
      </div>

      {/* Main Control */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={handleToggleConversation}
          disabled={!apiKey || !openaiApiKey}
          className={`
            px-6 py-3 rounded-xl font-medium text-white transition-all duration-200
            ${conversation.isActive 
              ? "bg-red-500 hover:bg-red-600" 
              : "bg-purple-500 hover:bg-purple-600"}
            ${(!apiKey || !openaiApiKey)
              ? "opacity-50 cursor-not-allowed" 
              : "hover:scale-105 active:scale-95"}
          `}
        >
          {conversation.isActive ? "Stop Assistant" : "Start Assistant"}
        </button>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors"
          title="Settings"
        >
          <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
          <h3 className="font-medium text-white mb-3">Settings</h3>
          
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                ElevenLabs API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="xi-..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                OpenAI API Key
              </label>
              <input
                type="password"
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Voice ({conversation.voices.length} available)
              </label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
              >
                <option value="">Default Voice</option>
                {conversation.voices.map((voice) => (
                  <option key={voice.voice_id || voice.name} value={voice.voice_id}>
                    {voice.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autospeak"
                checked={autoSpeak}
                onChange={(e) => setAutoSpeak(e.target.checked)}
                className="rounded text-purple-500"
              />
              <label htmlFor="autospeak" className="text-xs text-slate-400">
                Auto-speak responses
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Current Interaction Display */}
      {conversation.isActive && (
        <div className="space-y-3">
          {/* User Input */}
          {conversation.currentInput && (
            <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <div className="text-xs font-medium text-blue-400 mb-1">You:</div>
              <div className="text-sm text-white">
                {conversation.currentInput}
              </div>
            </div>
          )}

          {/* Assistant Response */}
          {conversation.currentResponse && (
            <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
              <div className="text-xs font-medium text-purple-400 mb-1 flex items-center gap-2">
                Assistant:
                {conversation.isSpeaking && (
                  <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded animate-pulse">
                    Speaking
                  </span>
                )}
              </div>
              <div className="text-sm text-white whitespace-pre-wrap">
                {conversation.currentResponse}
                {conversation.isProcessingLLM && <span className="animate-pulse">|</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {conversation.error && (
        <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
          <div className="text-sm text-red-400">{conversation.error}</div>
        </div>
      )}
    </div>
  );
}