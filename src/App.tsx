import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Power, AlertCircle, Volume2, VolumeX, Settings, History, Lock, Unlock, User, UserPlus, WifiOff, ShieldAlert, Trophy, Zap } from 'lucide-react';
import { AudioRecorder, AudioPlayer } from '@/src/lib/audio-utils';
import { LiveSession, SessionState } from '@/src/lib/live-session';
import { ToolExecutor } from '@/src/lib/tool-executor';
import { MemoryManager } from '@/src/lib/memory-manager';
import { Orb } from '@/src/components/Orb';
import { AuthManager, UserProfile } from '@/src/lib/auth-manager';
import { VoiceIdentityEngine } from '@/src/lib/voice-identity-engine';
import { GamificationEngine, UserStats } from '@/src/lib/gamification-engine';
import { EmergencyManager } from '@/src/lib/emergency-manager';

export default function App() {
  const [state, setState] = useState<SessionState | 'enrolling' | 'idle'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [prefs, setPrefs] = useState(MemoryManager.getPreferences());
  const [logs, setLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(AuthManager.getCurrentUser());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [stats, setStats] = useState<UserStats>(GamificationEngine.getStats());
  const [volume, setVolume] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>(["Search Google", "Open YouTube", "Check Weather", "What's the time?"]);
  
  const addLog = (msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 50));
  };

  const sessionRef = useRef<LiveSession | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  const handleModelAudio = useCallback((base64: string) => {
    if (playerRef.current && !isMuted) {
      addLog("🔊 Playing audio chunk");
      playerRef.current.playChunk(base64);
    }
  }, [isMuted]);

  const handleInterruption = useCallback(() => {
    addLog("🛑 Interrupted");
    if (playerRef.current) {
      playerRef.current.stop();
    }
  }, []);

  const startSession = async () => {
    if (!isOnline) {
      addLog("🔴 Offline mode active. Basic commands only.");
      setState('listening');
      setTimeout(() => {
        addLog("🤖 Offline: I'm here, but I need internet for full sassy mode.");
        setState('speaking');
      }, 1000);
      return;
    }

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      setError("Gemini API Key is missing. Please add it to your secrets.");
      addLog("❌ Error: API Key missing");
      return;
    }

    try {
      setError(null);
      addLog("🚀 Starting Ultimate session...");
      
      if (!playerRef.current) {
        playerRef.current = new AudioPlayer((v) => setVolume(v));
      }

      sessionRef.current = new LiveSession(apiKey, {
        onStateChange: (newState) => {
          setState(newState);
          addLog(`🔄 State: ${newState}`);
          setPrefs(MemoryManager.getPreferences());
          setStats(GamificationEngine.getStats());
        },
        onAudioData: handleModelAudio,
        onInterrupted: handleInterruption,
        onError: (msg) => {
          setError(msg);
          addLog(`❌ Error: ${msg}`);
        },
        onLog: addLog,
      });

      await sessionRef.current.connect();

      recorderRef.current = new AudioRecorder((data) => {
        sessionRef.current?.sendAudio(data);
      }, (v) => setVolume(v));

      await recorderRef.current.start();

      addLog("✅ Ultimate Session connected");

    } catch (err: any) {
      setError(err.message || "Failed to start session");
      addLog(`❌ Crash: ${err.message}`);
      setState('error');
    }
  };

  const stopSession = () => {
    addLog("🔌 Session disconnected");
    recorderRef.current?.stop();
    sessionRef.current?.disconnect();
    playerRef.current?.stop();
    
    recorderRef.current = null;
    sessionRef.current = null;
    setState('disconnected');
  };

  const triggerEmergency = async () => {
    const res = await EmergencyManager.triggerEmergency();
    addLog(`🚨 EMERGENCY: ${res.message}`);
    setError("EMERGENCY MODE ACTIVE");
  };

  const toggleSession = () => {
    if (state === 'disconnected' || state === 'error') {
      startSession();
    } else {
      stopSession();
    }
  };

  const startEnrollment = async () => {
    if (!recorderRef.current) {
      recorderRef.current = new AudioRecorder(() => {}, (v) => setVolume(v));
      await recorderRef.current.start();
    }
    setState('enrolling');
    addLog("🎙️ Enrollment started. Speak clearly...");
    recorderRef.current.startEnrollment();
    
    setTimeout(async () => {
      const audioData = await recorderRef.current!.stopEnrollment();
      const audioContext = new AudioContext();
      const audioBuffer = audioContext.createBuffer(1, audioData.length, 16000);
      audioBuffer.getChannelData(0).set(audioData);
      
      const signature = await VoiceIdentityEngine.generateSignature(audioBuffer);
      
      const name = prompt("What's your name, babe?") || "User";
      const newUser = AuthManager.register(name, AuthManager.getUsers().length === 0);
      AuthManager.updateVoicePrint(newUser.id, {
        id: crypto.randomUUID(),
        name,
        signature,
        enrolledAt: Date.now()
      });
      
      AuthManager.login(newUser.id);
      setCurrentUser(newUser);
      setPrefs(MemoryManager.getPreferences());
      setState('disconnected');
      addLog(`✅ Voice enrolled for ${name}`);
    }, 3000);
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      stopSession();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getStatusText = () => {
    if (!isOnline) return "Offline Mode";
    if (state === 'enrolling') return "Enrolling Voice...";
    switch (state) {
      case 'disconnected': return currentUser ? `Hey ${currentUser.name}.` : "Hey stranger.";
      case 'connecting': return "Waking up...";
      case 'listening': return "I'm listening...";
      case 'speaking': return "Nira's talking.";
      case 'processing': return "Thinking, babe...";
      case 'error': return "Oops, something's wrong.";
      default: return "";
    }
  };

  const getSubText = () => {
    switch (state) {
      case 'disconnected': return "Ready to talk?";
      case 'listening': return "Don't be shy.";
      case 'speaking': return "Listen closely, babe.";
      case 'processing': return "Just a sec...";
      case 'error': return error;
      default: return "";
    }
  };

  return (
    <div className={`fixed inset-0 transition-colors duration-1000 flex flex-col overflow-hidden font-sans selection:bg-pink-500/30 ${
      state === 'speaking' ? 'bg-[#0a0508]' : 
      state === 'listening' ? 'bg-[#05080a]' : 'bg-[#050505]'
    }`}>
      {/* Enrollment Overlay */}
      <AnimatePresence>
        {state === 'enrolling' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center gap-8"
          >
            <div className="relative">
              <motion.div 
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.2, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-pink-500 rounded-full blur-3xl"
              />
              <div className="relative w-32 h-32 rounded-full bg-pink-500 flex items-center justify-center shadow-[0_0_50px_rgba(236,72,153,0.5)]">
                <Mic size={48} className="text-white animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-light tracking-widest uppercase">Capturing Voice</h2>
              <p className="text-sm text-white/40 font-mono italic">"Say something sassy, babe..."</p>
            </div>
            <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 3, ease: "linear" }}
                className="h-full bg-pink-500"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-600/10 blur-[120px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full animate-pulse delay-1000" />
      
      {/* Header */}
      <header className="relative z-10 p-6 flex justify-between items-center backdrop-blur-md bg-black/20 border-b border-white/5">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full shadow-[0_0_10px_rgba(236,72,153,0.8)] transition-colors duration-500 ${
              state === 'speaking' ? 'bg-pink-500' : state === 'listening' ? 'bg-blue-400' : 'bg-white/20'
            }`} />
            <span className="text-[10px] font-mono tracking-[0.3em] uppercase opacity-40">Nira Ultimate</span>
            {!isOnline && <WifiOff size={12} className="text-red-500 ml-2 animate-pulse" />}
          </div>
          <AnimatePresence>
            {prefs.mode && (
              <motion.span 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                className="text-[9px] font-mono uppercase tracking-widest mt-1 flex items-center gap-1"
              >
                {prefs.isLocked ? <Lock size={8} /> : <Unlock size={8} />}
                Mode: {prefs.mode}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Gamification Stats */}
        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 text-[10px] font-mono opacity-60">
              <Trophy size={12} className="text-yellow-500" />
              <span>LVL {stats.level}</span>
              <Zap size={12} className="text-orange-500 ml-2" />
              <span>{stats.streak} DAY STREAK</span>
            </div>
            <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-pink-500 to-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${(stats.xp % 1000) / 10}%` }}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20">
                <User size={14} className="text-pink-400" />
                <span className="text-[10px] font-mono text-white/80">{currentUser.name}</span>
                <button 
                  onClick={() => { AuthManager.logout(); setCurrentUser(null); setPrefs(MemoryManager.getPreferences()); addLog("👤 Logged out"); }}
                  className="ml-1 p-1 hover:text-red-400 transition-colors"
                  title="Logout"
                >
                  <Power size={10} />
                </button>
              </div>
            ) : (
              <button 
                onClick={startEnrollment}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.4)] hover:bg-pink-600 transition-all active:scale-95"
              >
                <UserPlus size={16} />
                <span className="text-[11px] font-bold uppercase tracking-wider">Enroll Now</span>
              </button>
            )}
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className={`p-2.5 rounded-full transition-all border ${showDebug ? 'bg-pink-500 text-white border-pink-500' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'}`}
              title="Debug Console"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col items-center justify-center p-6">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className="w-[80%] h-[80%] border border-white/5 rounded-full animate-[spin_20s_linear_infinite]" />
          <div className="absolute w-[60%] h-[60%] border border-white/5 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-12">
          <Orb state={state} volume={volume} />
          
          <div className="flex flex-col items-center gap-4">
            <motion.h1 
              key={getStatusText()}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl md:text-3xl font-light tracking-tight text-center max-w-md px-4"
            >
              {getStatusText()}
            </motion.h1>
            
            <p className="text-[10px] font-mono uppercase tracking-[0.4em] opacity-30">
              {getSubText()}
            </p>
          </div>

          {/* Suggestions Bar */}
          <AnimatePresence>
            {(state === 'disconnected' || state === 'listening') && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="flex flex-wrap justify-center gap-2 max-w-sm"
              >
                {suggestions.map((s, i) => (
                  <button 
                    key={i}
                    onClick={async () => {
                      addLog(`💡 Suggestion tapped: ${s}`);
                      if (s === 'Search Google') { window.open('https://www.google.com', '_blank'); }
                      else if (s === 'Open YouTube') { window.open('https://www.youtube.com', '_blank'); }
                      else if (s === "What's the time?") {
                        const r = await ToolExecutor.execute('getTime', {});
                        addLog(`🕐 ${r.message}`);
                      } else if (s === 'Check Weather') { addLog('🌤️ Session shuru karo aur city ka naam bolo'); }
                    }}
                    className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono opacity-40 hover:opacity-100 hover:bg-white/10 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer Controls */}
      <footer className="relative z-10 p-12 flex flex-col items-center gap-8">
        <div className="flex items-center gap-8">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={`p-4 rounded-full border transition-all duration-300 ${
              isMuted 
                ? 'bg-red-500/10 border-red-500/20 text-red-500' 
                : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
            }`}
          >
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>

          <button 
            onClick={toggleSession}
            disabled={state === 'connecting' || state === 'processing'}
            className={`group relative p-8 rounded-full transition-all duration-500 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
              state === 'disconnected' || state === 'error'
                ? 'bg-white text-black shadow-[0_0_40px_rgba(255,255,255,0.3)]'
                : 'bg-pink-500 text-white shadow-[0_0_40px_rgba(236,72,153,0.5)]'
            }`}
          >
            <div className="absolute inset-0 rounded-full bg-current opacity-0 group-hover:opacity-20 animate-ping" />
            {state === 'disconnected' || state === 'error' ? <Power size={32} /> : <Mic size={32} />}
          </button>

          <button 
            onClick={triggerEmergency}
            className="p-5 rounded-full border-2 border-red-500 bg-red-500/20 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:bg-red-500 hover:text-white transition-all duration-300 active:scale-90"
            title="EMERGENCY ALERT"
          >
            <ShieldAlert size={28} />
          </button>
        </div>

        <div className="flex gap-4">
          <button className="text-[10px] font-mono uppercase tracking-widest opacity-20 hover:opacity-100 transition-opacity flex items-center gap-2">
            <History size={12} />
            History
          </button>
        </div>
      </footer>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg flex items-center gap-2 text-xs text-red-400 backdrop-blur-md z-50"
          >
            <AlertCircle size={14} />
            {error}
            <button onClick={() => setError(null)} className="ml-2 hover:text-white">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Debug Console */}
      <AnimatePresence>
        {showDebug && (
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="absolute right-4 top-24 bottom-24 w-64 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl z-40 flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
              <span className="text-[10px] font-mono uppercase tracking-widest opacity-60">Debug Console</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    localStorage.clear();
                    window.location.reload();
                  }}
                  className="text-[9px] text-red-400 hover:text-red-300 transition-colors"
                >
                  RESET ALL
                </button>
                <button onClick={() => setLogs([])} className="text-[9px] hover:text-pink-400 transition-colors">CLEAR</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-2">
              {logs.length === 0 && <div className="opacity-20 italic">No logs yet...</div>}
              {logs.map((log, i) => (
                <div key={i} className="border-b border-white/5 pb-1 last:border-0">
                  <span className="opacity-30 mr-2">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                  <span className="opacity-80">{log}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}