function mobileTabletCheck() {
    // https://stackoverflow.com/questions/11381673/detecting-a-mobile-browser
    let check = false;
    (function (a: string) {
        if (
            /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(
                a,
            ) ||
            /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw-(n|u)|c55\/|capi|ccwa|cdm-|cell|chtm|cldc|cmd-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc-s|devi|dica|dmob|do(c|p)o|ds(12|-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(-|_)|g1 u|g560|gene|gf-5|g-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd-(m|p|t)|hei-|hi(pt|ta)|hp( i|ip)|hs-c|ht(c(-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i-(20|go|ma)|i230|iac( |-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|-[a-w])|libw|lynx|m1-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|-([1-8]|c))|phil|pire|pl(ay|uc)|pn-2|po(ck|rt|se)|prox|psio|pt-g|qa-a|qc(07|12|21|32|60|-[2-7]|i-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h-|oo|p-)|sdk\/|se(c(-|0|1)|47|mc|nd|ri)|sgh-|shar|sie(-|m)|sk-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h-|v-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl-|tdg-|tel(i|m)|tim-|t-mo|to(pl|sh)|ts(70|m-|m3|m5)|tx-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas-|your|zeto|zte-/i.test(
                a.slice(0, 4),
            )
        ) {
            check = true;
        }
    })(
        navigator.userAgent ||
            navigator.vendor ||
            ("opera" in window && typeof window.opera === "string"
                ? window.opera
                : ""),
    );
    return check;
}

// List of supported languages:
// https://help.openai.com/en/articles/7031512-whisper-api-faq
// https://github.com/openai/whisper/blob/248b6cb124225dd263bb9bd32d060b6517e067f8/whisper/tokenizer.py#L79
export const LANGUAGES = {
    en: "english",
    zh: "chinese",
    de: "german",
    es: "spanish/castilian",
    ru: "russian",
    ko: "korean",
    fr: "french",
    ja: "japanese",
    pt: "portuguese",
    tr: "turkish",
    pl: "polish",
    ca: "catalan/valencian",
    nl: "dutch/flemish",
    ar: "arabic",
    sv: "swedish",
    it: "italian",
    id: "indonesian",
    hi: "hindi",
    fi: "finnish",
    vi: "vietnamese",
    he: "hebrew",
    uk: "ukrainian",
    el: "greek",
    ms: "malay",
    cs: "czech",
    ro: "romanian/moldavian/moldovan",
    da: "danish",
    hu: "hungarian",
    ta: "tamil",
    no: "norwegian",
    th: "thai",
    ur: "urdu",
    hr: "croatian",
    bg: "bulgarian",
    lt: "lithuanian",
    la: "latin",
    mi: "maori",
    ml: "malayalam",
    cy: "welsh",
    sk: "slovak",
    te: "telugu",
    fa: "persian",
    lv: "latvian",
    bn: "bengali",
    sr: "serbian",
    az: "azerbaijani",
    sl: "slovenian",
    kn: "kannada",
    et: "estonian",
    mk: "macedonian",
    br: "breton",
    eu: "basque",
    is: "icelandic",
    hy: "armenian",
    ne: "nepali",
    mn: "mongolian",
    bs: "bosnian",
    kk: "kazakh",
    sq: "albanian",
    sw: "swahili",
    gl: "galician",
    mr: "marathi",
    pa: "punjabi/panjabi",
    si: "sinhala/sinhalese",
    km: "khmer",
    sn: "shona",
    yo: "yoruba",
    so: "somali",
    af: "afrikaans",
    oc: "occitan",
    ka: "georgian",
    be: "belarusian",
    tg: "tajik",
    sd: "sindhi",
    gu: "gujarati",
    am: "amharic",
    yi: "yiddish",
    lo: "lao",
    uz: "uzbek",
    fo: "faroese",
    ht: "haitian creole/haitian",
    ps: "pashto/pushto",
    tk: "turkmen",
    nn: "nynorsk",
    mt: "maltese",
    sa: "sanskrit",
    lb: "luxembourgish/letzeburgesch",
    my: "myanmar/burmese",
    bo: "tibetan",
    tl: "tagalog",
    mg: "malagasy",
    as: "assamese",
    tt: "tatar",
    haw: "hawaiian",
    ln: "lingala",
    ha: "hausa",
    ba: "bashkir",
    jw: "javanese",
    su: "sundanese",
};

export const MODELS: { [key: string]: [string, string] } = {
    // Original checkpoints
    "onnx-community/whisper-tiny": ["tiny", ""],
    "onnx-community/whisper-base": ["base", ""],
    "onnx-community/whisper-small": ["small", ""],
    "onnx-community/whisper-medium-ONNX": ["medium", ""],
    "onnx-community/whisper-large-v3-turbo": ["large-v3-turbo", ""],
    "onnx-community/distil-small.en": ["distil-small.en", "en"],
    "KBLab/kb-whisper-tiny": ["kb-whisper-tiny", "sv"],
    "KBLab/kb-whisper-base": ["kb-whisper-base", "sv"],
    "KBLab/kb-whisper-small": ["kb-whisper-small", "sv"],
    "KBLab/kb-whisper-medium": ["kb-whisper-medium", "sv"],
    "KBLab/kb-whisper-large": ["kb-whisper-large", "sv"],
    "PierreMesure/nb-whisper-tiny-onnx": ["nb-whisper-tiny", "no"],
    "PierreMesure/nb-whisper-base-onnx": ["nb-whisper-base", "no"],
    "PierreMesure/nb-whisper-small-onnx": ["nb-whisper-small", "no"],
};

export const DTYPES: string[] = [
    "fp32",
    "fp16",
    "q8",
    "int8",
    "uint8",
    "q4",
    "bnb4",
    "q4f16",
];

export enum AudioSource {
    URL = "URL",
    FILE = "FILE",
    RECORDING = "RECORDING",
}

const isMobileOrTablet = mobileTabletCheck();

function getDefaultAudioUrl(language: string): string {
    switch (language) {
        case "sv":
            return "https://raw.githubusercontent.com/PierreMesure/whisper-web/refs/heads/main/public/palme.wav";
        case "no":
            return "https://raw.githubusercontent.com/NbAiLab/nb-whisper/main/audio/king.mp3";
        case "es":
            return "https://raw.githubusercontent.com/PierreMesure/whisper-web/refs/heads/main/public/espanol.mp3";
        default:
            return `https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/${
                isMobileOrTablet ? "jfk" : "ted_60_16k"
            }.wav`;
    }
}

function getDefaultModel(language: string): string {
    switch (language) {
        case "sv":
            return `KBLab/kb-whisper-${isMobileOrTablet ? "tiny" : "base"}`;
        case "no":
            return `PierreMesure/nb-whisper-${
                isMobileOrTablet ? "tiny" : "base"
            }`;
        default:
            return `onnx-community/whisper-${
                isMobileOrTablet ? "tiny" : "base"
            }`;
    }
}

function getDefaultLanguage(language: string): string {
    return (language as keyof typeof LANGUAGES) || "en";
}

export default {
    SAMPLING_RATE: 16000,
    getDefaultAudioUrl,
    getDefaultModel,
    DEFAULT_SUBTASK: "transcribe",
    getDefaultLanguage,
    DEFAULT_QUANTIZED: isMobileOrTablet,
    DEFAULT_DTYPE: "q8",
    DEFAULT_GPU: false,
};
