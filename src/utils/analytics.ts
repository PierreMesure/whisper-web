declare global {
  interface Window {
    gtag: (command: string, targetId: string, config?: any) => void;
  }
}

export const trackEvent = (eventName: string, parameters?: Record<string, any>) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, parameters);
  }
};

export const trackDemoInteraction = (action: string, details?: Record<string, any>) => {
  trackEvent('demo_interaction', {
    action,
    ...details,
  });
};

export const trackVoiceConversation = (
  provider: 'moonshine' | 'elevenlabs',
  action: 'started' | 'completed' | 'error',
  metadata?: Record<string, any>
) => {
  trackEvent('voice_conversation', {
    provider,
    action,
    ...metadata,
  });
};

export const trackPerformanceMetric = (
  metric: string,
  value: number,
  provider?: string
) => {
  trackEvent('performance_metric', {
    metric_name: metric,
    value,
    provider,
  });
};

export const trackFeatureUsage = (feature: string, details?: Record<string, any>) => {
  trackEvent('feature_usage', {
    feature_name: feature,
    ...details,
  });
};

// Comprehensive comparison tracking
export const trackVoiceComparison = (
  provider: 'moonshine' | 'elevenlabs',
  metrics: {
    sttLatency?: number;
    llmLatency?: number;
    ttsLatency?: number;
    totalLatency?: number;
    perceivedLatency?: number;
    vadDetectionTime?: number;
  },
  sessionId?: string
) => {
  trackEvent('voice_pipeline_comparison', {
    provider,
    session_id: sessionId || Date.now().toString(),
    // Core metrics
    stt_latency_ms: metrics.sttLatency,
    llm_latency_ms: metrics.llmLatency,
    tts_latency_ms: metrics.ttsLatency,
    total_latency_ms: metrics.totalLatency,
    perceived_latency_ms: metrics.perceivedLatency,
    vad_detection_ms: metrics.vadDetectionTime,
    // Categorized performance (for easy filtering)
    performance_category: 
      (metrics.totalLatency || 0) < 1000 ? 'excellent' :
      (metrics.totalLatency || 0) < 2000 ? 'good' :
      (metrics.totalLatency || 0) < 3000 ? 'acceptable' : 'slow',
    timestamp: new Date().toISOString(),
  });
};

// Track quality metrics
export const trackQualityMetric = (
  provider: 'moonshine' | 'elevenlabs',
  metric: 'transcription_accuracy' | 'voice_quality' | 'response_relevance',
  score: number,
  details?: Record<string, any>
) => {
  trackEvent('quality_metric', {
    provider,
    metric_type: metric,
    score,
    ...details,
  });
};