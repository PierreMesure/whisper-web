import { AudioManager } from "./components/AudioManager";
import Transcript from "./components/Transcript";
import { useTranscriber } from "./hooks/useTranscriber";

function App() {
    const transcriber = useTranscriber();

    return (
        <div className='flex flex-col justify-center items-center min-h-screen'>
            <div className='container flex flex-col justify-center items-center'>
                <div className='flex items-center'>
                    <img src='elk-black.svg' alt='flag' className='h-20 w-20 sm:h-28 sm:w-28 sm:mb-2' />
                    <h1 className='text-5xl font-extrabold tracking-tight text-slate-900 sm:text-7xl text-center mt-11'>
                    KB-Whisper
                </h1>
                </div>
                <h2 className='mb-5 px-4 text-center text-1xl font-semibold tracking-tight text-slate-900 sm:text-2xl'>
                    Transkribera svenskt ljud direkt i din webbläsare
                </h2>
                <AudioManager transcriber={transcriber} />
                <Transcript transcribedData={transcriber.output} />
            </div>

            <footer className='text-center mt-4'>
                <b>OBS: Ljudet transkriberas helt lokalt. För att göra det laddar webbsidan ner en AI-modell.</b>
                <br/>Skapad av {" "}
                <a
                    className='underline'
                    href='https://www.linkedin.com/in/pierremesure/'
                >
                    Pierre Mesure
                </a> med färska Whisper-modeller från {" "}
                <a
                    className='underline'
                    href='https://www.kb.se/samverkan-och-utveckling/nytt-fran-kb/nyheter-samverkan-och-utveckling/2025-02-20-valtranad-ai-modell-forvandlar-tal-till-text.html'
                >
                    Kungliga Bibliotekets KBLab
                </a> ♥️
                <br/>och {" "}
                <a
                    className='underline'
                    href='https://github.com/PierreMesure/whisper-web'
                >
                    öppen källkod
                </a> 🤗. Hosted i 🇪🇺 med {" "}
                <a
                    className='underline'
                    href='https://statichost.eu'
                >
                    statichost.eu
                </a>.
            </footer>
        </div>
    );
}

export default App;
