# KB-Whisper Web

Whisper-web is a webapplication that allows you to transcribe sound files to text completely locally in your web browser.

![A screenshot of the application](./screenshot.png)

This repository is a fork of [Xenova/whisper-web](https://github.com/xenova/whisper-web).

Here are the main differences:

- Actively maintained
- Up-to-date dependencies, including transformers.js
- Ability to use WebGPU or CPU
- More user-friendly interface

The main application is available at [whisper-web.mesu.re](https://whisper-web.mesu.re). It is hosted on Github Pages.

## KB-Whisper

I have also translated the website to Swedish and added the [Swedish KB-Whisper models](https://huggingface.co/collections/KBLab/kb-whisper-67af9eafb24da903b63cc4aa) fine-tuned by the [Swedish National library](https://www.kb.se/samverkan-och-utveckling/nytt-fran-kb/nyheter-samverkan-och-utveckling/2025-02-20-valtranad-ai-modell-forvandlar-tal-till-text.html) ♥️ for easy transcription of Swedish audio.

This version is available at [kb-whisper.mesu.re](https://kb-whisper.mesu.re) (hosted in the EU by [statichost.eu](https://statichost.eu)) and the source code is on the [swedish branch](https://github.com/PierreMesure/whisper-web/tree/swedish).

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

3. Open the link (e.g., [localhost:5173/](http://localhost:5173/)) in your browser.
