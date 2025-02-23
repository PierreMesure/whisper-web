import { AudioManager } from "./components/AudioManager";
import Transcript from "./components/Transcript";
import { useTranscriber } from "./hooks/useTranscriber";

function App() {
    const transcriber = useTranscriber();

    return (
        <div className='flex justify-center items-center min-h-screen'>
            <div className='container flex flex-col justify-center items-center'>
                <div className='flex items-center mb-4'>
                    <img src='flag.svg' alt='flag' className='h-12 w-12 sm:h-20 sm:w-20' />
                    <h1 className='text-5xl font-extrabold tracking-tight text-slate-900 sm:text-7xl text-center ml-4'>
                    KB-Whisper
                </h1>
                </div>
                <h2 className='mt-3 mb-5 px-4 text-center text-1xl font-semibold tracking-tight text-slate-900 sm:text-2xl'>
                    Transkribera svenskt ljud direkt i din webbläsare
                </h2>
                <AudioManager transcriber={transcriber} />
                <Transcript transcribedData={transcriber.output} />
            </div>

            <div className='absolute bottom-4'>
                Skapad av Pierre Mesure med färska Whisper-modeller från {" "}
                <a
                    className='underline'
                    href='https://www.kb.se/samverkan-och-utveckling/nytt-fran-kb/nyheter-samverkan-och-utveckling/2025-02-20-valtranad-ai-modell-forvandlar-tal-till-text.html'
                >
                    Kungliga Bibliotekets KBLab
                </a> ♥️ och {" "}
                <a
                    className='underline'
                    href='https://github.com/PierreMesure/whisper-web'
                >
                    öppen källkod
                </a> 🤗
            </div>
        </div>
    );
}

export default App;
