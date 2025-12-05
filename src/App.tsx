import { t } from "i18next";
import { AudioManager } from "./components/AudioManager";
import Transcript from "./components/Transcript";
import { useTranscriber } from "./hooks/useTranscriber";
import { Trans, useTranslation } from "react-i18next";
import LanguageSelector from "./components/LanguageSelector";

function App() {
    const transcriber = useTranscriber();

    const { i18n } = useTranslation();

    const handleChangeLanguage = (newLanguage: string) => {
        i18n.changeLanguage(newLanguage);
    };

    return (
        <>
            <div className='flex flex-col justify-center items-center min-h-screen py-4'>
                <div className='container flex flex-col justify-center items-center'>
                    <h1 className='text-5xl font-extrabold tracking-tight text-slate-900 sm:text-7xl text-center'>
                        {t("app.title")}
                    </h1>
                    <h2 className='mt-3 mb-5 px-4 text-center text-1xl font-semibold tracking-tight text-slate-900 sm:text-2xl'>
                        {t("app.subtitle")}
                    </h2>
                    <AudioManager transcriber={transcriber} />
                    <Transcript transcribedData={transcriber.output} />
                </div>

                <footer className='text-center m-4'>
                    <b>{t("app.footer")}</b>
                    <br />
                    <Trans
                        i18nKey='app.footer_credits'
                        components={{
                            authorLink: (
                                <a
                                    className='underline'
                                    href='https://github.com/PierreMesure/whisper-web'
                                />
                            ),
                            demoLink: (
                                <a
                                    className='underline'
                                    href='https://github.com/Xenova/whisper-web'
                                />
                            ),
                        }}
                    />
                </footer>
            </div>
            <LanguageSelector
                className='fixed bottom-4 right-16'
                currentLanguage={i18n.language}
                onChangeLanguage={handleChangeLanguage}
            />
        </>
    );
}

export default App;
