/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  Square, 
  Play, 
  Pause, 
  Trash2, 
  FileText, 
  Sparkles, 
  Download,
  Volume2,
  Clock,
  ChevronRight,
  AlertCircle,
  Mail,
  MessageCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

// --- Types ---

interface Recording {
  id: string;
  blob: Blob;
  url: string;
  timestamp: number;
  duration: number;
  name: string;
  transcription?: string;
  analysis?: string;
  isAnalyzing?: boolean;
}

// --- Constants ---

const THEME = {
  bg: 'bg-[#0A0A0B]',
  card: 'bg-[#151619]',
  accent: 'text-[#FF4444]',
  accentBg: 'bg-[#FF4444]',
  textPrimary: 'text-white',
  textSecondary: 'text-[#8E9299]',
  border: 'border-[#2A2B2F]',
  mono: 'font-mono'
};

// --- App Component ---

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSpeakerMode, setIsSpeakerMode] = useState(true);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // --- Recording Logic ---

  const startRecording = async () => {
    try {
      // Optimized constraints for recording speakerphone calls
      // When isSpeakerMode is true, we DISABLE echo cancellation so the mic can "hear" the speaker
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: !isSpeakerMode,
          noiseSuppression: !isSpeakerMode,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 44100
        } 
      });

      // Try to request a Wake Lock to keep the app alive in background if supported
      if ('wakeLock' in navigator) {
        try {
          await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.log("Wake Lock request failed:", err);
        }
      }

      // VU Meter Setup
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        // Scale and smooth the volume value
        setVolume(Math.min(100, (average / 80) * 100));
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // Determine best supported mime type for maximum compatibility
      const mimeTypes = [
        'audio/mp4',
        'audio/aac',
        'audio/mpeg',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus'
      ];
      const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';

      const mediaRecorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const extension = supportedMimeType.includes('mp4') ? 'm4a' : 
                         supportedMimeType.includes('webm') ? 'webm' : 
                         supportedMimeType.includes('ogg') ? 'ogg' : 'aac';
        
        const blob = new Blob(chunksRef.current, { type: supportedMimeType });
        const url = URL.createObjectURL(blob);
        const newRecording: Recording = {
          id: crypto.randomUUID(),
          blob,
          url,
          timestamp: Date.now(),
          duration: recordingTime,
          name: `Grabación ${recordings.length + 1}.${extension}`,
        };
        setRecordings(prev => [newRecording, ...prev]);
        setRecordingTime(0);
        setIsPaused(false);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000); // Record in 1s chunks for better persistence
      setIsRecording(true);
      setIsPaused(false);
      setError(null);
      
      // Update MediaSession for better background control if supported
      if ('mediaSession' in navigator) {
        (navigator as any).mediaSession.metadata = new (window as any).MediaMetadata({
          title: 'Grabando Audio...',
          artist: 'Revox-rec',
          album: 'Grabación en curso',
          artwork: [{ src: 'https://picsum.photos/seed/mic/512/512', sizes: '512x512', type: 'image/png' }]
        });
      }

      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("No se pudo acceder al micrófono. Por favor, asegúrate de dar los permisos necesarios.");
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) clearInterval(timerRef.current);
      
      // VU Meter Cleanup
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      setVolume(0);
    }
  };

  const deleteRecording = (id: string) => {
    setRecordings(prev => {
      const recording = prev.find(r => r.id === id);
      if (recording) URL.revokeObjectURL(recording.url);
      return prev.filter(r => r.id !== id);
    });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- AI Analysis Logic ---

  const analyzeAudio = async (recording: Recording) => {
    const apiKey = "AIzaSyAJrMMbe5QJald6Si3zAZmsbQUXIf8yylg";

    // Update state to show loading
    setRecordings(prev => prev.map(r => 
      r.id === recording.id ? { ...r, isAnalyzing: true } : r
    ));

    try {
      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-3-flash-preview";

      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          resolve(base64String);
        };
      });
      reader.readAsDataURL(recording.blob);
      const base64Data = await base64Promise;

      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/webm",
                  data: base64Data
                }
              },
              {
                text: "Por favor, transcribe este audio palabra por palabra y luego proporciona un resumen detallado de lo que se dice y el tono de la conversación. Responde en español."
              }
            ]
          }
        ]
      });

      const resultText = response.text || "No se pudo generar el análisis.";
      
      // Split transcription and analysis if possible, or just store all
      setRecordings(prev => prev.map(r => 
        r.id === recording.id ? { 
          ...r, 
          transcription: resultText, 
          isAnalyzing: false 
        } : r
      ));

    } catch (err) {
      console.error("AI Analysis error:", err);
      setError("Error al analizar el audio con IA.");
      setRecordings(prev => prev.map(r => 
        r.id === recording.id ? { ...r, isAnalyzing: false } : r
      ));
    }
  };

  return (
    <div className={`min-h-screen ${THEME.bg} ${THEME.textPrimary} p-4 md:p-8 font-sans`}>
      <div className="max-w-2xl mx-auto">
        
        {/* Header */}
        <header className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">Revox-<span className={THEME.accent}>rec</span></h1>
            <p className={THEME.textSecondary + " text-sm"}>Captura y analiza con IA avanzada.</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-[#2A2B2F] bg-[#151619]">
            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
            <span className={`text-xs font-medium uppercase tracking-wider ${THEME.mono}`}>
              {isRecording ? 'En Vivo' : 'Listo'}
            </span>
          </div>
        </header>

        {/* Error Message */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400 text-sm"
          >
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </motion.div>
        )}

        {/* Call Recording Tip */}
        <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <Volume2 className="w-4 h-4" />
            Truco para grabar llamadas
          </div>
          <p className="text-xs text-emerald-100/70 leading-relaxed">
            Para grabar una llamada, activa el <b>Modo Altavoz</b> abajo, inicia la grabación y pon tu llamada en <b>manos libres (altavoz)</b>. El micrófono captará ambas voces.
          </p>
        </div>

        {/* Recording Interface */}
        <section className={`glass rounded-[2.5rem] p-8 md:p-10 shadow-2xl mb-12 relative overflow-hidden transition-all duration-500 ${isRecording ? 'recording-active' : ''}`}>
          {/* Decorative Grid Background */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
               style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          
          <div className="relative z-10 flex flex-col items-center">
            {/* VU Meter */}
            <div className="w-full max-w-[200px] h-12 flex items-center justify-center gap-1 mb-4">
              {Array.from({ length: 15 }).map((_, i) => {
                const threshold = (i / 15) * 100;
                const isActive = volume > threshold;
                let color = 'bg-emerald-500';
                if (i > 11) color = 'bg-red-500';
                else if (i > 8) color = 'bg-yellow-500';

                return (
                  <div
                    key={i}
                    style={{ 
                      height: isActive ? `${Math.max(15, volume * 0.8)}%` : '4px',
                      opacity: isActive ? 1 : 0.1,
                      transition: 'height 0.1s ease-out, opacity 0.1s ease-out'
                    }}
                    className={`w-1.5 rounded-full ${color}`}
                  />
                );
              })}
            </div>

            <div className={`text-6xl font-bold mb-10 ${THEME.mono} tabular-nums tracking-tighter`}>
              {formatTime(recordingTime)}
            </div>

            {/* Mode Toggle */}
            <div className="mb-10 flex items-center gap-4 bg-black/20 p-2 rounded-2xl border border-white/5">
              <button
                onClick={() => !isRecording && setIsSpeakerMode(false)}
                className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${!isSpeakerMode ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'}`}
                disabled={isRecording}
              >
                Estándar
              </button>
              <button
                onClick={() => !isRecording && setIsSpeakerMode(true)}
                className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${isSpeakerMode ? 'bg-[#FF4444] text-white shadow-[0_0_15px_rgba(255,68,68,0.3)]' : 'text-white/40 hover:text-white/60'}`}
                disabled={isRecording}
              >
                Modo Altavoz (Llamadas)
              </button>
            </div>

            <div className="flex items-center justify-center gap-8 md:gap-12">
              {!isRecording ? (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={startRecording}
                  className="group flex flex-col items-center gap-3"
                >
                  <div className={`w-28 h-28 md:w-32 md:h-32 rounded-full ${THEME.accentBg} flex items-center justify-center shadow-[0_0_40px_rgba(255,68,68,0.4)] transition-all group-hover:shadow-[0_0_60px_rgba(255,68,68,0.6)]`}>
                    <div className="w-10 h-10 rounded-full bg-white" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-white/60 group-hover:text-white transition-colors">Grabar</span>
                </motion.button>
              ) : (
                <>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={isPaused ? resumeRecording : pauseRecording}
                    className="group flex flex-col items-center gap-3"
                  >
                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white/10 border border-white/20 flex items-center justify-center transition-all hover:bg-white/20">
                      {isPaused ? (
                        <Play className="w-8 h-8 text-white fill-white" />
                      ) : (
                        <Pause className="w-8 h-8 text-white fill-white" />
                      )}
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest text-white/60 group-hover:text-white transition-colors">
                      {isPaused ? 'Continuar' : 'Pausar'}
                    </span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={stopRecording}
                    className="group flex flex-col items-center gap-3"
                  >
                    <div className="w-28 h-28 md:w-32 md:h-32 rounded-3xl bg-white flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.2)] transition-all group-hover:shadow-[0_0_60px_rgba(255,255,255,0.4)]">
                      <div className="w-12 h-12 bg-black rounded-sm" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest text-white/60 group-hover:text-white transition-colors">Parar</span>
                  </motion.button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Recordings List */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Recientes</h2>
            <span className={`text-xs ${THEME.textSecondary} ${THEME.mono}`}>{recordings.length} archivos</span>
          </div>

          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {recordings.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12 border-2 border-dashed border-[#2A2B2F] rounded-3xl"
                >
                  <Volume2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className={THEME.textSecondary}>No hay grabaciones aún.</p>
                </motion.div>
              ) : (
                recordings.map((rec) => (
                  <motion.div
                    key={rec.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="glass rounded-3xl p-6 hover:border-white/10 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">{rec.name}</h3>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded bg-[#2A2B2F] ${THEME.textSecondary} ${THEME.mono}`}>
                            {formatTime(rec.duration)}
                          </span>
                        </div>
                        <div className={`flex items-center gap-3 text-xs ${THEME.textSecondary}`}>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span>•</span>
                          <span>{(rec.blob.size / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => deleteRecording(rec.id)}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-[#8E9299] hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <a 
                          href={rec.url} 
                          download={`${rec.name}.webm`}
                          className="p-2 rounded-lg hover:bg-white/5 text-[#8E9299] hover:text-white transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    </div>

                    {/* Custom Audio Player */}
                    <CustomAudioPlayer url={rec.url} />

                    {/* AI Actions */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a 
                        href={rec.url} 
                        download={rec.name}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#2A2B2F] text-white hover:bg-[#3A3B3F] transition-all"
                      >
                        <Download className="w-3 h-3" />
                        Guardar en Dispositivo
                      </a>

                      {!rec.transcription ? (
                        <button
                          disabled={rec.isAnalyzing}
                          onClick={() => analyzeAudio(rec)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                            rec.isAnalyzing 
                              ? 'bg-[#2A2B2F] text-[#8E9299] cursor-not-allowed' 
                              : 'bg-white text-black hover:bg-[#E0E0E0]'
                          }`}
                        >
                          {rec.isAnalyzing ? (
                            <>
                              <div className="w-3 h-3 border-2 border-[#8E9299] border-t-transparent rounded-full animate-spin" />
                              Analizando...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3" />
                              Transcribir y Analizar con IA
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="w-full mt-2 space-y-3">
                          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                              <FileText className="w-3 h-3" />
                              Resultado de IA
                            </div>
                            <div className="text-sm leading-relaxed text-[#D1D1D1] whitespace-pre-wrap max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                              {rec.transcription}
                            </div>
                            
                            <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-2">
                              <a 
                                href={`mailto:?subject=Transcripción: ${rec.name}&body=${encodeURIComponent(rec.transcription || '')}`}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-white/5 text-white hover:bg-white/10 transition-all"
                              >
                                <Mail className="w-3 h-3" />
                                Enviar por Email
                              </a>
                              <a 
                                href={`https://wa.me/?text=${encodeURIComponent('Transcripción de ' + rec.name + ':\n\n' + (rec.transcription || ''))}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-all"
                              >
                                <MessageCircle className="w-3 h-3" />
                                WhatsApp
                              </a>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Footer Note */}
        <footer className="mt-16 pt-8 border-t border-[#2A2B2F] text-center">
          <p className={`text-[10px] uppercase tracking-widest ${THEME.textSecondary} font-bold`}>
            Limitación Técnica: Solo grabación de micrófono permitida por seguridad del sistema.
          </p>
        </footer>
      </div>
    </div>
  );
}

// --- Custom Audio Player Component ---

function CustomAudioPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', onEnded);
    };
  }, [url]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mt-4 bg-black/40 rounded-2xl p-6 border border-white/5">
      <audio ref={audioRef} src={url} />
      
      <div className="flex flex-col gap-4">
        {/* Progress Bar */}
        <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-white h-full transition-all duration-100 ease-linear"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-white/40 uppercase tracking-widest">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-8">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={stopPlayback}
            className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <Square className="w-5 h-5 text-white/60 fill-white/60" />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={togglePlay}
            className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg"
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 text-black fill-black" />
            ) : (
              <Play className="w-8 h-8 text-black fill-black ml-1" />
            )}
          </motion.button>

          <div className="w-12" /> {/* Spacer for symmetry */}
        </div>
      </div>
    </div>
  );
}
