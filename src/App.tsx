import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, Square, Play, Pause, Trash2, FileText, Sparkles, 
  Download, Volume2, Clock, Mail, MessageCircle, AlertCircle,
  History
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from "framer-motion";

// --- CONFIG ---
const APP_NAME = "grabadora";
const GEMINI_API_KEY = "AIzaSyAJrMMbe5QJald6Si3zAZmsbQUXIf8yylg"; 

interface Recording {
  id: string;
  blob: Blob;
  url: string;
  timestamp: number;
  duration: number;
  name: string;
  transcription?: string;
  isAnalyzing?: boolean;
}

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
  const timerRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // --- Recording Logic ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: !isSpeakerMode,
          noiseSuppression: !isSpeakerMode,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 44100
        } 
      });

      // VU Meter
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
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const avg = sum / bufferLength;
        setVolume(Math.min(100, (avg / 128) * 100));
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // Wake Lock
      if ('wakeLock' in navigator) {
        try { await (navigator as any).wakeLock.request('screen'); } catch (e) {}
      }

      const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const extension = mimeType.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const newRecording: Recording = {
          id: crypto.randomUUID(),
          blob, url, timestamp: Date.now(),
          duration: recordingTime,
          name: `Grabación ${new Date().toLocaleTimeString()}.${extension}`
        };
        setRecordings(prev => [newRecording, ...prev]);
        setRecordingTime(0);
        setIsPaused(false);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);
      setError(null);
      
      if ('mediaSession' in navigator) {
        (navigator as any).mediaSession.metadata = new MediaMetadata({
          title: 'Grabando...',
          artist: APP_NAME,
          artwork: [{ src: 'https://picsum.photos/seed/mic/512/512', sizes: '512x512', type: 'image/png' }]
        });
      }

      timerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);

    } catch (err: any) {
      setError("Error de acceso al micro: " + err.message);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      setVolume(0);
    }
  };

  const deleteRecording = (id: string) => {
    setRecordings(prev => {
      const rec = prev.find(r => r.id === id);
      if (rec) URL.revokeObjectURL(rec.url);
      return prev.filter(r => r.id !== id);
    });
  };

  const analyzeAudio = async (recording: Recording) => {
    const key = GEMINI_API_KEY;
    if (!key) return;

    setRecordings(prev => prev.map(r => r.id === recording.id ? { ...r, isAnalyzing: true } : r));

    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const model = "gemini-3-flash-preview";

      const reader = new FileReader();
      const base64Promise = new Promise<string>(res => {
        reader.onloadend = () => res((reader.result as string).split(',')[1]);
      });
      reader.readAsDataURL(recording.blob);
      const base64Data = await base64Promise;

      const response = await ai.models.generateContent({
        model,
        contents: [{
          parts: [
            { inlineData: { mimeType: recording.blob.type, data: base64Data } },
            { text: "Eres un asistente experto en transcripción. Transcribe este audio palabra por palabra en español y luego añade un breve resumen de los puntos clave." }
          ]
        }]
      });

      setRecordings(prev => prev.map(r => r.id === recording.id ? { 
        ...r, transcription: response.text, isAnalyzing: false 
      } : r));
    } catch (err: any) {
      alert("Error IA: " + err.message);
      setRecordings(prev => prev.map(r => r.id === recording.id ? { ...r, isAnalyzing: false } : r));
    }
  };

  const formatTime = (s: number) => `${Math.floor(s/60).toString().padStart(2,'0')}:${((s%60)).toString().padStart(2,'0')}`;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto font-sans pb-24 w-full">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-white">grabadora<span className="text-[#FF4444]">.</span></h1>
          <p className="text-gray-500 text-[10px] uppercase tracking-[0.3em] font-bold mt-1">Inteligencia Artificial</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5">
            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
              {isRecording ? 'Grabando' : 'Listo'}
            </span>
          </div>
        </div>
      </header>

      {error && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-3">
          <AlertCircle size={16} /> {error}
        </motion.div>
      )}

      {/* Tip for calls */}
      <div className="mb-8 p-5 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] leading-relaxed">
        <div className="font-bold mb-1 uppercase tracking-wider flex items-center gap-2">
          <Volume2 size={14} /> Tip para llamadas
        </div>
        Para grabar llamadas, activa el <b>Modo Altavoz</b> y pon tu llamada en manos libres. La grabadora capturará ambas voces a través del micrófono.
      </div>

      {/* Recording Panel */}
      <div className={`glass rounded-[3rem] p-8 md:p-12 mb-12 transition-all duration-700 relative overflow-hidden ${isRecording ? 'recording-active' : ''}`}>
        {isRecording && (
          <div className="absolute inset-0 opacity-5 pointer-events-none">
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-red-500 to-transparent" />
          </div>
        )}

        <div className="flex flex-col items-center relative z-10">
          {/* VU Meter */}
          <div className="flex gap-1.5 h-12 items-center mb-8">
            {Array.from({length: 20}).map((_, i) => (
              <div key={i} 
                className={`w-1.5 rounded-full transition-all duration-100 ${i > 16 ? 'bg-red-500' : i > 12 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                style={{ 
                  height: volume > (i/20)*100 ? `${Math.max(15, volume*0.8)}%` : '6px',
                  opacity: volume > (i/20)*100 ? 1 : 0.1
                }}
              />
            ))}
          </div>

          <div className="text-7xl md:text-8xl font-bold font-mono tracking-tighter mb-12 tabular-nums text-white">
            {formatTime(recordingTime)}
          </div>

          <div className="flex items-center gap-3 mb-12 bg-black/40 p-2 rounded-2xl border border-white/5">
            <button onClick={() => !isRecording && setIsSpeakerMode(false)} className={`px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${!isSpeakerMode ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>Estándar</button>
            <button onClick={() => !isRecording && setIsSpeakerMode(true)} className={`px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${isSpeakerMode ? 'bg-[#FF4444] text-white shadow-[0_0_20px_rgba(255,68,68,0.3)]' : 'text-gray-500 hover:text-gray-300'}`}>Altavoz</button>
          </div>

          <div className="flex items-center gap-8 md:gap-12">
            {!isRecording ? (
              <motion.button 
                whileHover={{ scale: 1.05 }} 
                whileTap={{ scale: 0.95 }} 
                onClick={startRecording} 
                className="group flex flex-col items-center gap-4"
              >
                <div className="w-32 h-32 md:w-36 md:h-36 rounded-full bg-[#FF4444] flex items-center justify-center shadow-[0_0_60px_rgba(255,68,68,0.4)] transition-all group-hover:shadow-[0_0_80px_rgba(255,68,68,0.6)]">
                  <div className="w-12 h-12 rounded-full bg-white" />
                </div>
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 group-hover:text-white transition-colors">Grabar</span>
              </motion.button>
            ) : (
              <>
                <motion.button 
                  whileTap={{ scale: 0.9 }} 
                  onClick={isPaused ? resumeRecording : pauseRecording} 
                  className="group flex flex-col items-center gap-4"
                >
                  <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-md">
                    {isPaused ? <Play fill="white" size={28} /> : <Pause fill="white" size={28} />}
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">{isPaused ? 'Seguir' : 'Pausa'}</span>
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.9 }} 
                  onClick={stopRecording} 
                  className="group flex flex-col items-center gap-4"
                >
                  <div className="w-32 h-32 md:w-36 md:h-36 rounded-[2.5rem] bg-white flex items-center justify-center shadow-2xl">
                    <div className="w-12 h-12 bg-black rounded-lg" />
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">Parar</span>
                </motion.button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recordings List */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-4 mb-6">
          <div className="flex items-center gap-3">
            <History size={20} className="text-[#FF4444]" />
            <h2 className="text-2xl font-bold tracking-tight">Historial</h2>
          </div>
          <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full border border-white/5">
            {recordings.length} Archivos
          </span>
        </div>
        
        <AnimatePresence mode="popLayout">
          {recordings.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="text-center py-24 text-gray-600 border-2 border-dashed border-white/5 rounded-[3rem] bg-white/[0.02]"
            >
              <Volume2 size={48} className="mx-auto mb-6 opacity-5" />
              <p className="text-xs uppercase tracking-[0.3em] font-black">Sin grabaciones</p>
              <p className="text-[10px] mt-2 opacity-40">Toca el botón rojo para empezar</p>
            </motion.div>
          )}
          {recordings.map(rec => (
            <motion.div 
              key={rec.id} 
              layout 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="glass rounded-[2.5rem] p-7 border border-white/5 hover:border-white/10 transition-all group"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-base truncate pr-4 text-white group-hover:text-[#FF4444] transition-colors">{rec.name}</h3>
                  <div className="flex gap-4 text-[10px] text-gray-500 font-mono uppercase mt-2">
                    <span className="flex items-center gap-1.5"><Clock size={12}/> {formatTime(rec.duration)}</span>
                    <span className="opacity-20">|</span>
                    <span className="flex items-center gap-1.5"><Download size={12}/> {(rec.blob.size/1024/1024).toFixed(2)} MB</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => deleteRecording(rec.id)} className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-500/10 transition-all"><Trash2 size={18}/></button>
                  <a href={rec.url} download={rec.name} className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-all"><Download size={18}/></a>
                </div>
              </div>

              <CustomPlayer url={rec.url} />

              <div className="mt-8">
                {!rec.transcription ? (
                  <button 
                    onClick={() => analyzeAudio(rec)} 
                    disabled={rec.isAnalyzing} 
                    className="w-full bg-white text-black h-14 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-gray-200 disabled:opacity-50 transition-all shadow-xl active:scale-[0.98]"
                  >
                    {rec.isAnalyzing ? (
                      <><div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" /> Procesando con IA...</>
                    ) : (
                      <><Sparkles size={16} className="text-[#FF4444]"/> Analizar con IA</>
                    )}
                  </button>
                ) : (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-5">
                    <div className="bg-black/40 border border-white/10 rounded-3xl p-6 text-sm leading-relaxed text-gray-300 whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar shadow-inner">
                      <div className="text-[#FF4444] font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2 text-[10px]">
                        <FileText size={14}/> Transcripción & Análisis
                      </div>
                      {rec.transcription}
                    </div>
                    <div className="flex gap-3">
                      <button 
                        onClick={() => {
                          const text = `Transcripción de grabadora:\n\n${rec.transcription}`;
                          window.location.href = `mailto:?subject=Transcripción de Audio&body=${encodeURIComponent(text)}`;
                        }}
                        className="flex-1 bg-white/5 h-12 rounded-2xl text-[10px] font-bold uppercase flex items-center justify-center gap-2 hover:bg-white/10 transition-all border border-white/5"
                      >
                        <Mail size={14}/> Email
                      </button>
                      <button 
                        onClick={() => {
                          const text = `Transcripción de grabadora:\n\n${rec.transcription}`;
                          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                        }}
                        className="flex-1 bg-[#25D366]/10 text-[#25D366] h-12 rounded-2xl text-[10px] font-bold uppercase flex items-center justify-center gap-2 hover:bg-[#25D366]/20 transition-all border border-[#25D366]/10"
                      >
                        <MessageCircle size={14}/> WhatsApp
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      <footer className="mt-24 py-12 border-t border-white/5 text-center">
        <p className="text-[10px] text-gray-600 uppercase tracking-[0.5em] font-black">grabadora • IA Audio Intelligence</p>
        <p className="text-[8px] text-gray-700 mt-4 uppercase tracking-widest">Desarrollado para GitHub Pages</p>
      </footer>
    </div>
  );
}

function CustomPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const up = () => setTime(a.currentTime);
    const ld = () => setDur(a.duration);
    const ed = () => setPlaying(false);
    a.addEventListener('timeupdate', up);
    a.addEventListener('loadedmetadata', ld);
    a.addEventListener('ended', ed);
    return () => { a.removeEventListener('timeupdate', up); a.removeEventListener('loadedmetadata', ld); a.removeEventListener('ended', ed); };
  }, [url]);

  const toggle = () => { if (audioRef.current) { playing ? audioRef.current.pause() : audioRef.current.play(); setPlaying(!playing); } };
  const stop = () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; setPlaying(false); } };
  const fmt = (s: number) => isNaN(s) ? "00:00" : `${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;

  return (
    <div className="bg-black/40 rounded-3xl p-6 border border-white/5 shadow-inner">
      <audio ref={audioRef} src={url} />
      <div className="w-full bg-white/10 h-2 rounded-full mb-4 overflow-hidden relative">
        <div 
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#FF4444] to-red-400 transition-all duration-100 rounded-full" 
          style={{ width: `${(time/dur)*100}%` }} 
        />
      </div>
      <div className="flex justify-between text-[10px] font-mono text-gray-500 mb-6 uppercase tracking-widest font-bold">
        <span>{fmt(time)}</span>
        <span>{fmt(dur)}</span>
      </div>
      <div className="flex justify-center gap-8 items-center">
        <motion.button whileTap={{ scale: 0.9 }} onClick={stop} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors border border-white/5"><Square size={16} fill="gray" className="text-gray-500" /></motion.button>
        <motion.button 
          whileTap={{ scale: 0.9 }} 
          onClick={toggle} 
          className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-2xl active:shadow-none transition-all"
        >
          {playing ? <Pause size={32} fill="black" className="text-black" /> : <Play size={32} fill="black" className="ml-1 text-black" />}
        </motion.button>
        <div className="w-12" />
      </div>
    </div>
  );
}
