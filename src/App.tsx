import { useEffect } from "react";
import VoiceAssistant from "./components/VoiceAssistant";
import ElevenLabsAssistant from "./components/ElevenLabsAssistant";
import ThemeToggle from "./components/ThemeToggle";
import { trackDemoInteraction, trackFeatureUsage } from "./utils/analytics";

function App() {
    // Track page load
    useEffect(() => {
        trackDemoInteraction('page_loaded');
        trackFeatureUsage('voice_demo_access');
    }, []);

    return (
        <div className='min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900'>
            {/* Experimental Notice Banner */}
            <div className='bg-yellow-500/10 border-b border-yellow-500/20 py-2 px-4 text-center'>
                <p className='text-xs text-yellow-400'>
                    ⚠️ <strong>Experimental Feature:</strong> This voice pipeline is under active development. 
                    Features and performance metrics may change frequently as we optimize the system.
                </p>
            </div>
            
            {/* Subtle gradient overlay */}
            <div className='absolute inset-0 bg-gradient-to-t from-blue-600/5 via-transparent to-purple-600/5 pointer-events-none' />
            
            {/* Header */}
            <header className='relative z-10 w-full py-6 px-6 border-b border-blue-500/10'>
                <div className='max-w-[1600px] mx-auto flex items-center justify-between'>
                    <div className='flex items-center gap-3'>
                        {/* RunAnywhere Logo */}
                        <div className='w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center'>
                            <svg className='w-6 h-6 text-white' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M13 10V3L4 14h7v7l9-11h-7z' />
                            </svg>
                        </div>
                        <div>
                            <h1 className='text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent'>
                                RunAnywhere Voice Pipeline
                                <span className='ml-2 text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full align-middle'>
                                    EXPERIMENTAL
                                </span>
                            </h1>
                            <p className='text-xs text-slate-400 mt-0.5'>Compare AI Voice Solutions in Real-Time • Features under active development</p>
                        </div>
                    </div>
                    <div className='flex items-center gap-4'>
                        <a 
                            href="https://runanywhere.ai" 
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-xs text-slate-400 hover:text-blue-400 transition-colors'
                            onClick={() => trackDemoInteraction('external_link_click', { destination: 'runanywhere.ai' })}
                        >
                            runanywhere.ai →
                        </a>
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            {/* Main Content - Split View */}
            <main className='relative z-10 flex-1 p-6'>
                <div className='max-w-[1600px] mx-auto'>
                    <div className='grid lg:grid-cols-2 gap-6 h-[calc(100vh-140px)]'>
                        {/* Left Side - RunAnywhere Voice AI */}
                        <div className='flex flex-col'>
                            <div className='bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-xl rounded-2xl border border-blue-500/20 overflow-hidden flex flex-col h-full'>
                                {/* Section Header */}
                                <div className='bg-gradient-to-r from-blue-600/10 to-purple-600/10 px-6 py-4 border-b border-blue-500/20'>
                                    <div className='flex items-center justify-between'>
                                        <div>
                                            <h2 className='text-lg font-semibold text-white flex items-center gap-2'>
                                                <span className='w-2 h-2 bg-blue-500 rounded-full animate-pulse' />
                                                RunAnywhere Voice AI
                                            </h2>
                                            <p className='text-xs text-slate-400 mt-1'>
                                                Local STT (Moonshine) • Cloud LLM • Local TTS (Piper)
                                            </p>
                                        </div>
                                        <div className='flex items-center gap-2'>
                                            <span className='px-2 py-1 text-xs font-medium text-blue-400 bg-blue-500/10 rounded-full'>
                                                On-Device AI
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Component Container */}
                                <div className='flex-1 p-6 overflow-auto'>
                                    <VoiceAssistant />
                                </div>
                            </div>
                        </div>

                        {/* Right Side - ElevenLabs */}
                        <div className='flex flex-col'>
                            <div className='bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-xl rounded-2xl border border-purple-500/20 overflow-hidden flex flex-col h-full'>
                                {/* Section Header */}
                                <div className='bg-gradient-to-r from-purple-600/10 to-pink-600/10 px-6 py-4 border-b border-purple-500/20'>
                                    <div className='flex items-center justify-between'>
                                        <div>
                                            <h2 className='text-lg font-semibold text-white flex items-center gap-2'>
                                                <span className='w-2 h-2 bg-purple-500 rounded-full animate-pulse' />
                                                ElevenLabs AI
                                            </h2>
                                            <p className='text-xs text-slate-400 mt-1'>
                                                Cloud-Based Conversational AI
                                            </p>
                                        </div>
                                        <div className='flex items-center gap-2'>
                                            <span className='px-2 py-1 text-xs font-medium text-purple-400 bg-purple-500/10 rounded-full'>
                                                Cloud API
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Component Container */}
                                <div className='flex-1 p-6 overflow-auto'>
                                    <ElevenLabsAssistant />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer Info */}
                    <div className='mt-6 text-center'>
                        <p className='text-xs text-slate-500'>
                            Compare latency, accuracy, and user experience between on-device and cloud solutions
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;