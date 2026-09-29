# Whisper Web

Whisper-web is a webapplication that allows you to transcribe sound files to text completely locally in your web browser.

![A screenshot of the application](./screenshot.png)

This repository is a fork of [Xenova/whisper-web](https://github.com/xenova/whisper-web).

Here are the main differences:

- Actively maintained
- Up-to-date dependencies, including transformers.js
- Ability to use WebGPU or CPU
- More user-friendly interface
- User interface in several languages
- Available as a progressive web app (so usable offline if added to your homescreen)
- Whisper transcription is rendered continuously
- Export to SRT
- Choose between a larger range of models (for example Swedish and Norwegian finetunes from the countries' national libraries)
- Choose your own quantization level for the model
- Clear cache with a button

The main application is available at [whisper-web.mesu.re](https://whisper-web.mesu.re). It is hosted on [statichost.eu](https://statichost.eu).

## KB-Whisper

Initially, this project aimed at making the [Swedish KB-Whisper models](https://huggingface.co/collections/KBLab/kb-whisper-67af9eafb24da903b63cc4aa) fine-tuned by the [Swedish National library](https://www.kb.se/samverkan-och-utveckling/nytt-fran-kb/nyheter-samverkan-och-utveckling/2025-02-20-valtranad-ai-modell-forvandlar-tal-till-text.html) ♥️ more available for easy transcription of Swedish audio.

A version of the website with Swedish as default language is still available at [kb-whisper.mesu.re](https://kb-whisper.mesu.re) (hosted in the EU by [statichost.eu](https://statichost.eu)) and the source code is on the [swedish branch](https://github.com/PierreMesure/whisper-web/tree/swedish) but it is identical to the other version at [whisper-web.mesu.re](https://whisper-web.mesu.re).

## Parakeet TDT

The model selector includes [NVIDIA Parakeet TDT 0.6B v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) and the Swedish fine-tune [Pianissimo](https://huggingface.co/KlangAI/pianissimo-sv). These run through [parakeet.js](https://github.com/ysdede/parakeet.js) in the browser. NVIDIA's original repository does not contain browser-ready ONNX files, so the app loads [ysdede's ONNX conversion](https://huggingface.co/ysdede/parakeet-tdt-0.6b-v3-onnx); Pianissimo loads [Klang's ONNX release](https://huggingface.co/KlangAI/pianissimo-sv-onnx).

Parakeet TDT supports transcription and returns timestamped segments when processing finishes. On CPU, choose int8 or fp32. With WebGPU, choose fp16 or fp32 for the encoder; the decoder uses int8 on WASM. These models require a substantially larger download than the default Whisper models.

## Running locally

1. Clone the repo and install dependencies:

    ```bash
    git clone https://github.com/PierreMesure/whisper-web.git
    cd whisper-web
    npm install
    ```

2. Run the development server:

    ```bash
    npm run dev
    ```

3. Open the link (e.g., [http://localhost:5173/](http://localhost:5173/)) in your browser.
