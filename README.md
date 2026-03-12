# StudioMaster AI 🎚️🤖

StudioMaster AI is a professional-grade web application designed for automated audio mastering using the **Web Audio API** and simulated AI-driven analysis. It provides a high-fidelity environment for engineers and producers to polish their tracks directly in the browser.

## 🎧 Sound Engineering Features

### 1. Neural Mastering Chain
The application implements a serial processing chain designed for maximum transparency and impact:
- **Input Stage (GainNode):** Precise gain staging to ensure optimal headroom before processing.
- **Dynamics Control (DynamicsCompressorNode):** A soft-knee compressor with AI-calculated thresholding to control transients and increase perceived loudness.
- **Spectral Balance (BiquadFilterNode):** A high-shelf filter tuned at 10kHz to add "Air" and clarity to the high-frequency spectrum.
- **Real-time Monitoring (AnalyserNode):** Fast Fourier Transform (FFT) analysis for visual frequency representation.

### 2. AI-Driven Analysis
The "AI" engine performs a two-pass analysis of the uploaded audio buffer:
- **Peak Detection:** Identifies the absolute maximum amplitude to prevent digital clipping (0 dBFS).
- **RMS (Root Mean Square) Calculation:** Measures the average power of the signal to estimate perceived loudness.
- **LUFS Normalization:** Automatically adjusts the compressor threshold to target a standard **-14 LUFS** (Integrated), optimized for streaming platforms like Spotify and Apple Music.

### 3. Analog Modeling Controls
- **Drive:** Simulates input transformer saturation by increasing the gain stage.
- **Clarity:** Adjusts the high-shelf gain to enhance presence and definition.
- **Width:** (Simulated) Adjusts the stereo correlation for a more immersive soundstage.

## 🛠️ Technical Stack

- **Framework:** React + Vite
- **Processing:** Web Audio API (Native Browser DSP)
- **Visuals:** HTML5 Canvas (Spectrum) + Wavesurfer.js (Waveform)
- **Styling:** Tailwind CSS (Professional Dark Theme)
- **Animations:** Framer Motion

## 📚 Sound Engineering Glossary

- **Headroom:** The safety zone between your highest peak and the point of digital distortion (0 dBFS).
- **LUFS (Loudness Units Full Scale):** An international standard for measuring perceived loudness.
- **Threshold:** The level at which a compressor begins to reduce the volume of a signal.
- **Knee:** Controls how the compressor transitions from uncompressed to compressed states (Soft Knee = Subtle).
- **High-Shelf:** A filter that boosts or cuts all frequencies above a specific cutoff point.

---
Built for the next generation of independent producers. 🚀
