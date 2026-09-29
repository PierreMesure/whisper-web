import { pipeline, WhisperTextStreamer } from "@huggingface/transformers";
import { PARAKEET_MODELS } from "./utils/ParakeetModels";

let parakeet = null;
let parakeetKey = null;

async function releaseParakeet() {
    if (parakeet) {
        await Promise.all([
            parakeet.encoderSession.release(),
            parakeet.joinerSession.release(),
        ]);
        parakeet = null;
        parakeetKey = null;
    }
}

async function getParakeet(model, dtype, gpu) {
    const encoderQuant = dtype === "fp32" ? "fp32" : gpu ? "fp16" : "int8";
    const key = `${model}:${encoderQuant}:${gpu}`;
    if (parakeetKey === key) return parakeet;

    await releaseParakeet();
    const { getParakeetModel, fromUrls } = await import("parakeet.js");
    const backend = gpu ? "webgpu" : "wasm";
    self.postMessage({ status: "initiate", file: model, progress: 0 });
    try {
        const assets = await getParakeetModel(model, {
            backend,
            encoderQuant,
            decoderQuant: "int8",
            progress: ({ loaded, total }) => {
                self.postMessage({
                    status: "progress",
                    file: model,
                    progress: (loaded / total) * 100,
                });
            },
        });
        try {
            parakeet = await fromUrls({
                ...assets.urls,
                filenames: assets.filenames,
                preprocessorBackend: "js",
                backend,
            });
        } finally {
            Object.values(assets.urls).forEach((url) => {
                if (url) URL.revokeObjectURL(url);
            });
        }
        parakeetKey = key;
        return parakeet;
    } finally {
        self.postMessage({ status: "done", file: model });
        self.postMessage({ status: "ready" });
    }
}

// Define model factories
// Ensures only one model is created of each type
class PipelineFactory {
    static task = null;
    static model = null;
    static dtype = null;
    static gpu = false;
    static instance = null;

    constructor(tokenizer, model, dtype, gpu) {
        this.tokenizer = tokenizer;
        this.model = model;
        this.dtype = dtype;
        this.gpu = gpu;
    }

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = pipeline(this.task, this.model, {
                dtype: this.dtype,
                device: this.gpu ? "webgpu" : "wasm",
                progress_callback,
            });
        }

        return this.instance;
    }
}

self.addEventListener("message", async (event) => {
    const message = event.data;

    try {
        let transcript = await transcribe(message);
        if (transcript === null) return;

        self.postMessage({
            status: "complete",
            data: transcript,
        });
    } catch (error) {
        self.postMessage({ status: "error", data: { message: error.message } });
    }
});

class AutomaticSpeechRecognitionPipelineFactory extends PipelineFactory {
    static task = "automatic-speech-recognition";
    static model = null;
    static dtype = null;
    static gpu = false;
}

const transcribe = async ({ audio, model, dtype, gpu, subtask, language }) => {
    if (model in PARAKEET_MODELS) {
        const instance = await getParakeet(model, dtype, gpu);
        const result = await instance.transcribeLongAudio(audio, 16000, {
            returnTimestamps: true,
        });
        return {
            text: result.text,
            chunks: result.chunks.map((chunk, index) => ({
                ...chunk,
                text: `${index ? " " : ""}${chunk.text}`,
            })),
        };
    }

    await releaseParakeet();
    const isDistilWhisper = model.startsWith("distil-whisper/");

    const p = AutomaticSpeechRecognitionPipelineFactory;
    if (p.model !== model || p.dtype !== dtype || p.gpu !== gpu) {
        // Invalidate model if different model, dtype, or gpu setting
        p.model = model;
        p.dtype = dtype;
        p.gpu = gpu;

        if (p.instance !== null) {
            (await p.getInstance()).dispose();
            p.instance = null;
        }
    }

    // Load transcriber model
    const transcriber = await p.getInstance((data) => {
        self.postMessage(data);
    });

    const time_precision =
        transcriber.processor.feature_extractor.config.chunk_length /
        transcriber.model.config.max_source_positions;

    // Storage for chunks to be processed. Initialise with an empty chunk.
    /** @type {{ text: string; offset: number, timestamp: [number, number | null] }[]} */
    const chunks = [];

    // TODO: Storage for fully-processed and merged chunks
    // let decoded_chunks = [];

    const chunk_length_s = isDistilWhisper ? 20 : 30;
    const stride_length_s = isDistilWhisper ? 3 : 5;

    let chunk_count = 0;
    let start_time;
    let num_tokens = 0;
    let tps;
    const streamer = new WhisperTextStreamer(transcriber.tokenizer, {
        time_precision,
        on_chunk_start: (x) => {
            const offset = (chunk_length_s - stride_length_s) * chunk_count;
            chunks.push({
                text: "",
                timestamp: [offset + x, null],
                finalised: false,
                offset,
            });
        },
        token_callback_function: (x) => {
            start_time ??= performance.now();
            if (num_tokens++ > 0) {
                tps = (num_tokens / (performance.now() - start_time)) * 1000;
            }
        },
        callback_function: (x) => {
            if (chunks.length === 0) return;
            // Append text to the last chunk
            chunks.at(-1).text += x;

            self.postMessage({
                status: "update",
                data: {
                    text: "", // No need to send full text yet
                    chunks,
                    tps,
                },
            });
        },
        on_chunk_end: (x) => {
            const current = chunks.at(-1);
            current.timestamp[1] = x + current.offset;
            current.finalised = true;
        },
        on_finalize: () => {
            start_time = null;
            num_tokens = 0;
            ++chunk_count;
        },
    });

    // Actually run transcription
    const output = await transcriber(audio, {
        // Greedy
        top_k: 0,
        do_sample: false,

        // Sliding window
        chunk_length_s,
        stride_length_s,

        // Language and task
        language,
        task: subtask,

        // Return timestamps
        return_timestamps: true,
        force_full_sequences: false,

        // Callback functions
        streamer, // after each generation step
    }).catch((error) => {
        console.error(error);
        self.postMessage({
            status: "error",
            data: error,
        });
        return null;
    });

    return {
        tps,
        ...output,
    };
};
