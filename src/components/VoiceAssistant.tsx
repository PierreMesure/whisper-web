import { useState, useEffect } from 'react';
import { useMoonshineConversation, type MoonshineConversationConfig } from '../hooks/useMoonshineConversation';

export default function VoiceAssistant() {
  const [showSettings, setShowSettings] = useState(false);
  // Use environment variable or localStorage
  const DEFAULT_OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';
  const [apiKey, setApiKey] = useState(localStorage.getItem('voiceai_api_key') || DEFAULT_OPENAI_KEY);
  // Use Kokoro TTS by default, but allow user to change it
  const [ttsEngine, setTtsEngine] = useState<'native' | 'kokoro'>('kokoro');
  const [selectedVoice, setSelectedVoice] = useState(localStorage.getItem('voiceai_voice') || '');
  const [kokoroVoice, setKokoroVoice] = useState<any>(
    localStorage.getItem('voiceai_kokoro_voice') || 'af_sky'
  );
  const [llmModel, setLLMModel] = useState(localStorage.getItem('voiceai_model') || 'gpt-4o-mini');
  const [moonshineModel, setMoonshineModel] = useState<'moonshine-tiny' | 'moonshine-base'>(
    (localStorage.getItem('voiceai_moonshine_model') as any) || 'moonshine-tiny'
  );
  const [systemPrompt] = useState(
    localStorage.getItem('voiceai_prompt') || 
    'You are a helpful voice assistant. Keep responses concise and conversational, typically 1-2 sentences unless more detail is specifically requested.'
  );

  // Create Moonshine conversation config
  const moonshineConfig: MoonshineConversationConfig = {
    llm: {
      apiKey,
      model: llmModel,
      systemPrompt,
      maxTokens: 500,
      temperature: 0.7,
    },
    tts: {
      engine: ttsEngine,
      voice: selectedVoice,
      kokoroVoice: kokoroVoice,
      kokoroDtype: 'fp32', // Use fp32 for faster generation when using Kokoro
      rate: 1.2,
      pitch: 1.0,
      volume: 0.9,
    },
    moonshine: {
      model: moonshineModel,
      device: 'gpu' in navigator ? 'webgpu' : 'wasm',
      quantization: 'q4',
      vadConfig: {
        positiveSpeechThreshold: 0.5,
        negativeSpeechThreshold: 0.35,
        minSpeechFrames: 9,
        preSpeechPadFrames: 3,
      },
    },
    autoSpeak: true,
    interruptible: true,
  };

  // Initialize Moonshine conversation
  const conversation = useMoonshineConversation(moonshineConfig);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('voiceai_api_key', apiKey);
    localStorage.setItem('voiceai_tts_engine', ttsEngine);
    localStorage.setItem('voiceai_voice', selectedVoice);
    localStorage.setItem('voiceai_kokoro_voice', kokoroVoice);
    localStorage.setItem('voiceai_model', llmModel);
    localStorage.setItem('voiceai_prompt', systemPrompt);
    localStorage.setItem('voiceai_moonshine_model', moonshineModel);
  }, [apiKey, ttsEngine, selectedVoice, kokoroVoice, llmModel, systemPrompt, moonshineModel]);

  return (
    <div className="flex flex-col gap-4">
      {/* Metrics Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* VAD Detection */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-blue-500/10">
          <div className="text-xs font-medium text-blue-400 mb-1">VAD Detection</div>
          <div className="text-lg font-bold text-white">
            {conversation.performance.vadDetectionTime > 0 ? `${(conversation.performance.vadDetectionTime / 1000).toFixed(1)}s` : '0.0s'}
          </div>
          {conversation.stats.avgVADTime > 0 && (
            <div className="text-xs text-slate-400 mt-0.5">
              Avg: {(conversation.stats.avgVADTime / 1000).toFixed(1)}s
            </div>
          )}
        </div>

        {/* STT Processing */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-green-500/10">
          <div className="text-xs font-medium text-green-400 mb-1">STT Processing</div>
          <div className="text-lg font-bold text-white">
            {conversation.performance.sttProcessingTime > 0 ? `${conversation.performance.sttProcessingTime}ms` : '0ms'}
          </div>
          {conversation.stats.avgSTTTime > 0 && (
            <div className="text-xs text-slate-400 mt-0.5">
              Avg: {conversation.stats.avgSTTTime}ms
            </div>
          )}
        </div>

        {/* LLM First Token */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-purple-500/10">
          <div className="text-xs font-medium text-purple-400 mb-1">LLM First Token</div>
          <div className="text-lg font-bold text-white">
            {conversation.performance.llmFirstTokenTime > 0 && conversation.performance.llmFirstTokenTime < 30000 
              ? `${conversation.performance.llmFirstTokenTime}ms` 
              : '--ms'}
          </div>
          {conversation.stats.avgLLMFirstTokenTime > 0 && (
            <div className="text-xs text-slate-400 mt-0.5">
              Avg: {conversation.stats.avgLLMFirstTokenTime}ms
            </div>
          )}
        </div>

        {/* TTS Generation */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-orange-500/10">
          <div className="text-xs font-medium text-orange-400 mb-1">
            TTS ({conversation.tts?.engine === 'kokoro' ? 'Kokoro' : 'Native'})
          </div>
          <div className="text-lg font-bold text-white">
            {conversation.performance?.ttsFirstSpeechTime > 0 ? `${conversation.performance.ttsFirstSpeechTime}ms` : '0ms'}
          </div>
          {conversation.stats.avgTTSTime > 0 && (
            <div className="text-xs text-slate-400 mt-0.5">
              Avg: {conversation.stats.avgTTSTime}ms
            </div>
          )}
        </div>

        {/* Perceived Latency */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-red-500/10">
          <div className="text-xs font-medium text-red-400 mb-1">Perceived Latency</div>
          <div className="text-lg font-bold text-white">
            {conversation.performance.totalPipelineTime > 0 ? `${conversation.performance.totalPipelineTime}ms` : '0ms'}
          </div>
          {conversation.stats.avgPerceivedLatency > 0 && (
            <div className="text-xs text-slate-400 mt-0.5">
              Avg: {conversation.stats.avgPerceivedLatency}ms
            </div>
          )}
          <div className="text-xs text-slate-500 mt-0.5">Speech end → Audio out</div>
        </div>

        {/* Conversation Stats */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-indigo-500/10">
          <div className="text-xs font-medium text-indigo-400 mb-1">Conversation</div>
          <div className="text-lg font-bold text-white">
            {conversation.stats.totalTurns || 0} turns
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            LLM Complete: {conversation.performance.llmCompletionTime > 0 ? `${conversation.performance.llmCompletionTime}ms` : '0ms'}
          </div>
        </div>
      </div>

      {/* Status Indicators */}
      <div className="flex items-center justify-center gap-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            conversation.isListening ? 'bg-green-500 animate-pulse' : 'bg-slate-600'
          }`}></div>
          <span className="text-xs text-slate-400">Listening</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            conversation.isTranscribing ? 'bg-yellow-500 animate-pulse' : 'bg-slate-600'
          }`}></div>
          <span className="text-xs text-slate-400">Transcribing</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            conversation.isProcessingLLM ? 'bg-purple-500 animate-pulse' : 'bg-slate-600'
          }`}></div>
          <span className="text-xs text-slate-400">Processing</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            conversation.isSpeaking ? 'bg-red-500 animate-pulse' : 'bg-slate-600'
          }`}></div>
          <span className="text-xs text-slate-400">Speaking</span>
        </div>
      </div>

      {/* Main Control */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => {
            if (conversation.isActive) {
              conversation.stopConversation();
            } else {
              conversation.startConversation();
            }
          }}
          disabled={!conversation.isActive && !apiKey}
          className={`
            px-6 py-3 rounded-xl font-medium text-white transition-all duration-200
            ${conversation.isActive 
              ? "bg-red-500 hover:bg-red-600" 
              : "bg-green-500 hover:bg-green-600"}
            ${(!conversation.isActive && !apiKey)
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
                OpenAI API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Moonshine Model
              </label>
              <select
                value={moonshineModel}
                onChange={(e) => setMoonshineModel(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
              >
                <option value="moonshine-tiny">Tiny (Fast)</option>
                <option value="moonshine-base">Base (Accurate)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  TTS Engine
                </label>
                <select
                  value={ttsEngine}
                  onChange={(e) => {
                    const newEngine = e.target.value as 'native' | 'kokoro';
                    setTtsEngine(newEngine);
                    localStorage.setItem('voiceai_tts_engine', newEngine);
                    // Reload page to reinitialize TTS engine
                    setTimeout(() => {
                      window.location.reload();
                    }, 100);
                  }}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                >
                  <option value="native">Browser TTS</option>
                  <option value="kokoro">Kokoro TTS (82M)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {ttsEngine === 'kokoro' ? 'Kokoro Voice' : 'Browser Voice'}
                </label>
                {ttsEngine === 'kokoro' ? (
                  <select
                    value={kokoroVoice}
                    onChange={(e) => {
                      const newVoice = e.target.value;
                      setKokoroVoice(newVoice);
                      localStorage.setItem('voiceai_kokoro_voice', newVoice);
                      // Reload page to reinitialize with new voice
                      setTimeout(() => {
                        window.location.reload();
                      }, 100);
                    }}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                  >
                    <optgroup label="American Female">
                      <option value="af_sky">Sky</option>
                      <option value="af_heart">Heart ❤️</option>
                      <option value="af_bella">Bella 🔥</option>
                      <option value="af_nicole">Nicole 🎧</option>
                      <option value="af_sarah">Sarah</option>
                      <option value="af_alloy">Alloy</option>
                    </optgroup>
                    <optgroup label="American Male">
                      <option value="am_michael">Michael</option>
                      <option value="am_echo">Echo</option>
                      <option value="am_fenrir">Fenrir</option>
                      <option value="am_onyx">Onyx</option>
                    </optgroup>
                    <optgroup label="British Female">
                      <option value="bf_emma">Emma</option>
                      <option value="bf_isabella">Isabella</option>
                      <option value="bf_alice">Alice</option>
                    </optgroup>
                    <optgroup label="British Male">
                      <option value="bm_george">George</option>
                      <option value="bm_lewis">Lewis</option>
                      <option value="bm_fable">Fable</option>
                    </optgroup>
                  </select>
                ) : (
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                  >
                    <option value="">System Default</option>
                    {typeof window !== 'undefined' && 'speechSynthesis' in window && 
                      window.speechSynthesis.getVoices()
                        .filter(voice => voice.lang.startsWith('en'))
                        .map(voice => (
                          <option key={voice.name} value={voice.name}>
                            {voice.name} ({voice.lang})
                          </option>
                        ))
                    }
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Current Interaction Display */}
      {conversation.isActive && (
        <div className="space-y-3">
          {/* User Input */}
          {(conversation.currentUserInput || conversation.interimTranscription) && (
            <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <div className="text-xs font-medium text-blue-400 mb-1">You:</div>
              <div className="text-sm text-white">
                {conversation.currentUserInput || conversation.interimTranscription}
              </div>
            </div>
          )}

          {/* Assistant Response */}
          {conversation.currentAssistantResponse && (
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
                {conversation.currentAssistantResponse}
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