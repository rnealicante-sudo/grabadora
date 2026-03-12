import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, 
  Square, 
  RotateCcw, 
  Volume2, 
  VolumeX,
  Clock, 
  Upload, 
  Radio, 
  Settings, 
  Info,
  ChevronLeft,
  ChevronRight,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

interface CartSettings {
  volume: number;
  isLooping: boolean;
  isLinked: boolean;
  fileName?: string;
}

// --- Components ---

interface CartItemProps {
  index: number;
  outputDeviceId: string;
  masterVolume: number;
  onTrigger?: (fn: (forcePlay?: boolean) => void) => void;
  onStateChange: (isPlaying: boolean) => void;
  onNext?: () => void;
}

const CartItem: React.FC<CartItemProps> = ({ index, outputDeviceId, masterVolume, onTrigger, onStateChange, onNext }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isLinked, setIsLinked] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [vuLevel, setVuLevel] = useState(0);
  const [timeMode, setTimeMode] = useState<'elapsed' | 'remaining'>('remaining');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update actual volume when master volume changes
  useEffect(() => {
    if (gainRef.current) {
      const ctx = audioCtxRef.current;
      if (ctx) {
        gainRef.current.gain.setTargetAtTime(masterVolume, ctx.currentTime, 0.05);
      } else {
        gainRef.current.gain.value = masterVolume;
      }
    }
    if (audioRef.current) {
      audioRef.current.volume = masterVolume;
    }
  }, [masterVolume]);

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`cart_settings_${index}`);
    if (saved) {
      const settings: CartSettings = JSON.parse(saved);
      setIsLooping(settings.isLooping);
      setIsLinked(settings.isLinked || false);
    }
  }, [index]);

  // Save settings to localStorage
  useEffect(() => {
    const settings: CartSettings = { 
      volume: 1, 
      isLooping, 
      isLinked,
      fileName: file?.name 
    };
    localStorage.setItem(`cart_settings_${index}`, JSON.stringify(settings));
  }, [isLooping, isLinked, file, index]);

  // Handle Output Device Change
  useEffect(() => {
    const setSink = async () => {
      if (audioRef.current && (audioRef.current as any).setSinkId && outputDeviceId) {
        try {
          await (audioRef.current as any).setSinkId(outputDeviceId);
        } catch (err) {
          console.error("Error setting sink ID:", err);
        }
      }
      if (audioCtxRef.current && (audioCtxRef.current as any).setSinkId && outputDeviceId) {
        try {
          await (audioCtxRef.current as any).setSinkId(outputDeviceId);
        } catch (err) {
          console.error("Error setting AudioContext sink ID:", err);
        }
      }
    };
    setSink();
  }, [outputDeviceId]);

  const setupAudioContext = async () => {
    if (!audioRef.current) return;
    
    if (!audioCtxRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = ctx.createMediaElementSource(audioRef.current);
      const analyser = ctx.createAnalyser();
      const gain = ctx.createGain();

      source.connect(gain);
      gain.connect(analyser);
      analyser.connect(ctx.destination);
      
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      gainRef.current = gain;
      
      gain.gain.value = masterVolume;

      const updateVu = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += data[i] * data[i];
        }
        const rms = Math.sqrt(sum / data.length);
        setVuLevel(rms / 128);
        
        animationFrameRef.current = requestAnimationFrame(updateVu);
      };
      updateVu();
    }

    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setHasPlayed(false);
      if (audioRef.current) {
        audioRef.current.src = URL.createObjectURL(f);
      }
    }
  };

  const fadeIn = () => {
    if (!gainRef.current || !audioCtxRef.current) return;
    gainRef.current.gain.setTargetAtTime(masterVolume, audioCtxRef.current.currentTime, 0.05);
  };

  const fadeOut = (stopImmediate = false) => {
    if (!audioRef.current || !gainRef.current || !audioCtxRef.current) return;

    if (stopImmediate) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      onStateChange(false);
      return;
    }

    const ctx = audioCtxRef.current;
    gainRef.current.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setIsPlaying(false);
        onStateChange(false);
      }
    }, 200);
  };

  const play = useCallback(async () => {
    if (!audioRef.current || !file) return;
    await setupAudioContext();
    fadeIn();
    audioRef.current.play().catch(err => {
      console.error("Playback failed:", err);
      setIsPlaying(false);
      onStateChange(false);
    });
    setIsPlaying(true);
    setHasPlayed(true);
    onStateChange(true);
  }, [file, onStateChange, masterVolume]);

  const stop = useCallback(() => {
    fadeOut();
  }, [masterVolume]);

  const togglePlay = useCallback(async (forcePlay?: boolean) => {
    if (forcePlay === true) {
      await play();
    } else if (isPlaying) {
      stop();
    } else {
      await play();
    }
  }, [isPlaying, play, stop]);

  // Register trigger for hotkeys
  useEffect(() => {
    if (onTrigger) {
      onTrigger(togglePlay);
    }
  }, [togglePlay, onTrigger]);

  const formatTime = (time: number) => {
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    };
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const remainingTime = duration - currentTime;
  const isEnding = isPlaying && remainingTime > 0 && remainingTime <= 5;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  return (
    <div 
      className={`group relative border border-zinc-700 transition-all flex h-[85px] select-none overflow-hidden rounded-sm
        ${isPlaying ? 'bg-[#2a2a2a]' : 'bg-[#1a1a1a]'} shadow-inner`}
    >
      {/* Left Number Section */}
      <div 
        onClick={() => file && togglePlay()}
        className={`w-14 flex items-center justify-center border-r border-zinc-700 transition-colors cursor-pointer
          ${isPlaying ? 'bg-blue-900/40' : 'bg-[#252525] hover:bg-[#333]'}`}
      >
        <span className={`text-4xl font-bold ${isPlaying ? 'text-blue-400' : 'text-zinc-500'}`}>
          {index + 1}
        </span>
      </div>

      {/* Center Section: Name & Seek Bar */}
      <div className="flex-1 flex flex-col px-3 py-2 justify-center gap-2 relative">
        {file ? (
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold truncate text-zinc-400 uppercase tracking-wider max-w-[150px]">
              {file.name}
            </h3>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <label className="cursor-pointer flex flex-col items-center gap-1 text-zinc-500 hover:text-blue-400 transition-all group/load">
              <Upload className="w-6 h-6 group-hover/load:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">CARGAR AUDIO</span>
              <input type="file" className="hidden" accept="audio/*" onChange={handleFileChange} />
            </label>
          </div>
        )}
        
        <div className={`relative flex items-center ${!file ? 'opacity-20 pointer-events-none' : ''}`}>
          <input 
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-4 bg-zinc-800 rounded-sm appearance-none cursor-pointer accent-zinc-300 border border-zinc-700"
            style={{
              background: `linear-gradient(to right, #5dade2 ${progress}%, #333 ${progress}%)`
            }}
          />
        </div>
      </div>

      {/* Right Section: Controls & Timer */}
      <div className="w-28 flex flex-col p-1.5 gap-1 border-l border-zinc-700 bg-[#222]">
        <div className="flex items-center justify-end gap-2 px-1">
          <label onClick={(e) => e.stopPropagation()} className="cursor-pointer">
            <input type="checkbox" className="hidden" checked={isLooping} onChange={(e) => setIsLooping(e.target.checked)} />
            <RotateCcw className={`w-3 h-3 ${isLooping ? 'text-blue-400' : 'text-zinc-600'}`} />
          </label>
          <label onClick={(e) => e.stopPropagation()} className="cursor-pointer">
            <input type="checkbox" className="hidden" checked={isLinked} onChange={(e) => setIsLinked(e.target.checked)} />
            <Zap className={`w-3 h-3 ${isLinked ? 'text-blue-400 fill-blue-400/20' : 'text-zinc-600'}`} />
          </label>
          
          <button 
            onClick={(e) => { e.stopPropagation(); file && togglePlay(); }}
            className={`w-5 h-5 rounded-sm flex items-center justify-center transition-all border border-black/40
              ${!file ? 'bg-zinc-800' : 
                isPlaying ? 'bg-red-600 shadow-[inset_0_0_5px_rgba(0,0,0,0.5)]' : 'bg-zinc-700 hover:bg-zinc-600'}`}
          >
            <div className={`w-2 h-2 bg-white rounded-sm ${isPlaying ? 'opacity-100' : 'opacity-20'}`} />
          </button>
        </div>

        <div 
          onClick={() => setTimeMode(prev => prev === 'elapsed' ? 'remaining' : 'elapsed')}
          className="bg-[#3498db] border border-blue-400/30 rounded-sm flex-1 flex items-center justify-end pr-1 cursor-pointer shadow-inner"
        >
          <span className="text-sm font-mono font-black text-white leading-none tracking-tighter">
            {timeMode === 'elapsed' ? formatTime(currentTime) : `-${formatTime(remainingTime)}`}
          </span>
        </div>
      </div>

      <audio 
        ref={audioRef} 
        loop={isLooping}
        playsInline
        crossOrigin="anonymous"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => {
          setIsPlaying(false);
          onStateChange(false);
          if (isLinked && onNext) onNext();
        }}
      />
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedOutput, setSelectedOutput] = useState('');
  const [playingCount, setPlayingCount] = useState(0);
  const [masterVolume, setMasterVolume] = useState(1);
  const [globalVu, setGlobalVu] = useState(0);
  
  const cartTriggers = useRef<{ [key: number]: (forcePlay?: boolean) => void }>({});
  const cartsPerPage = 8;

  // ON AIR logic
  const isOnAir = playingCount > 0;

  useEffect(() => {
    const loadDevices = async () => {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setOutputDevices(devices.filter(d => d.kind === 'audiooutput'));
        }
      } catch (err) {
        console.error("Error loading devices:", err);
      }
    };
    loadDevices();
  }, []);

  // Hotkeys logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const keys = '123456qwerty'.split('');
      const keyIndex = keys.indexOf(e.key.toLowerCase());
      
      if (keyIndex !== -1 && keyIndex < cartsPerPage) {
        const trigger = cartTriggers.current[keyIndex];
        if (trigger) {
          e.preventDefault();
          trigger();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleStateChange = (isPlaying: boolean) => {
    setPlayingCount(prev => isPlaying ? prev + 1 : Math.max(0, prev - 1));
  };

  useEffect(() => {
    if (playingCount === 0) {
      setGlobalVu(0);
      return;
    }
    const interval = setInterval(() => {
      setGlobalVu(0.3 + Math.random() * 0.5);
    }, 100);
    return () => clearInterval(interval);
  }, [playingCount]);

  const triggerNext = (currentIndex: number) => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= cartsPerPage) return;

    const trigger = cartTriggers.current[nextIndex];
    if (trigger) {
      trigger(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#222] text-zinc-100 font-sans selection:bg-blue-900/30 flex flex-col">
      {/* Global VU Meter Bar */}
      <div className="h-1 w-full bg-black overflow-hidden flex fixed top-0 z-[60]">
        <motion.div 
          className="h-full bg-blue-600"
          animate={{ width: `${globalVu * 100}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Header */}
      <header className="bg-[#1a1a1a] border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-[800px] mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1 bg-zinc-700 rounded border border-zinc-600">
              <Radio className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xs font-black tracking-widest uppercase leading-none text-zinc-300">OnAir Multi <span className="text-blue-500">- EMISIÓN</span></h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <AnimatePresence>
              {isOnAir && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="px-2 py-0.5 bg-red-900/40 rounded border border-red-600 flex items-center gap-1.5"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-red-400 font-bold uppercase text-[8px]">ON AIR</span>
                </motion.div>
              )}
            </AnimatePresence>
            
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('stop-all-carts'))}
              className="p-1.5 bg-zinc-800 hover:bg-red-900/40 text-zinc-400 hover:text-red-500 rounded border border-zinc-700 transition-all"
              title="Panic Stop"
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[800px] w-full mx-auto p-3 flex-1 overflow-hidden">
        <div className="h-full flex flex-col gap-2">
          {Array.from({ length: cartsPerPage }).map((_, i) => {
            return (
              <div key={i} className="flex-1 min-h-0">
                <CartItem 
                  index={i} 
                  outputDeviceId={selectedOutput}
                  masterVolume={masterVolume}
                  onTrigger={(fn) => {
                    cartTriggers.current[i] = fn;
                  }}
                  onStateChange={handleStateChange}
                  onNext={() => triggerNext(i)}
                />
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer & Master Fader */}
      <div className="bg-[#1a1a1a] border-t border-zinc-800 p-3 shadow-2xl z-50">
        <div className="max-w-[800px] mx-auto flex flex-col gap-3">
          <div className="flex items-center gap-4">
            <div className={`p-2 rounded bg-zinc-800 border border-zinc-700 transition-colors ${masterVolume > 0 ? 'text-blue-400' : 'text-zinc-600'}`}>
              {masterVolume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </div>
            
            <div className="flex-1 relative h-8 flex items-center">
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={masterVolume}
                onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-blue-500"
                style={{
                  background: `linear-gradient(to right, #3498db ${masterVolume * 100}%, #333 ${masterVolume * 100}%)`
                }}
              />
            </div>

            <div className="flex flex-col items-end min-w-[40px]">
              <span className="text-[10px] font-bold text-zinc-400">{Math.round(masterVolume * 100)}%</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-600">Salida Audio</span>
              <select 
                value={selectedOutput}
                onChange={(e) => setSelectedOutput(e.target.value)}
                className="bg-transparent text-[10px] font-bold text-blue-400 outline-none cursor-pointer max-w-[150px] truncate"
              >
                <option value="">Salida Predeterminada</option>
                {outputDevices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || 'Unknown Device'}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-emerald-500 uppercase">Sistema Listo</span>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
