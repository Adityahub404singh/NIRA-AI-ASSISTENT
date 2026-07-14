import { motion, AnimatePresence } from 'motion/react';

interface OrbProps {
  state: 'disconnected' | 'connecting' | 'listening' | 'speaking' | 'processing' | 'error' | 'enrolling' | 'idle';
  volume?: number;
}

export const Orb = ({ state, volume = 0 }: OrbProps) => {
  const getOrbColor = () => {
    switch (state) {
      case 'speaking': return 'from-pink-500 via-purple-500 to-pink-600';
      case 'listening': return 'from-blue-400 via-cyan-400 to-blue-500';
      case 'connecting': return 'from-blue-600 via-indigo-600 to-blue-700';
      case 'processing': return 'from-amber-400 via-orange-400 to-amber-500';
      case 'error': return 'from-red-500 via-rose-500 to-red-600';
      case 'enrolling': return 'from-purple-500 via-indigo-500 to-purple-600';
      default: return 'from-white/10 via-white/5 to-transparent';
    }
  };

  const getGlowColor = () => {
    switch (state) {
      case 'speaking': return 'rgba(236, 72, 153, 0.5)';
      case 'listening': return 'rgba(34, 211, 238, 0.5)';
      case 'connecting': return 'rgba(79, 70, 229, 0.5)';
      case 'processing': return 'rgba(251, 191, 36, 0.5)';
      case 'error': return 'rgba(239, 68, 68, 0.5)';
      case 'enrolling': return 'rgba(139, 92, 246, 0.5)';
      default: return 'rgba(255, 255, 255, 0.1)';
    }
  };

  return (
    <div className="relative w-64 h-64 flex items-center justify-center">
      {/* Outer Glow */}
      <motion.div
        animate={{
          scale: state === 'speaking' || state === 'listening' ? 1 + volume * 0.5 : 1,
          opacity: state === 'disconnected' ? 0.2 : 0.6,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="absolute inset-0 rounded-full blur-[80px]"
        style={{ backgroundColor: getGlowColor() }}
      />

      {/* Main Orb */}
      <motion.div
        animate={{
          rotate: 360,
          scale: state === 'speaking' || state === 'listening' ? 1 + volume * 0.2 : 1,
        }}
        transition={{
          rotate: { duration: 10, repeat: Infinity, ease: "linear" },
          scale: { type: "spring", stiffness: 300, damping: 20 }
        }}
        className={`relative w-48 h-48 rounded-full bg-gradient-to-tr ${getOrbColor()} shadow-2xl overflow-hidden border border-white/10 z-10`}
      >
        {/* Inner Shimmer */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.4),transparent)]" />
        
        {/* Animated Swirls */}
        <motion.div
          animate={{
            x: [-20, 20, -20],
            y: [-20, 20, -20],
          }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 opacity-30 bg-[conic-gradient(from_0deg,transparent,white,transparent)]"
        />
      </motion.div>

      {/* Orbiting Rings */}
      <AnimatePresence>
        {(state === 'listening' || state === 'speaking' || state === 'processing') && (
          <>
            <motion.div
              initial={{ opacity: 0, rotateX: 70, rotateZ: 0 }}
              animate={{ opacity: 1, rotateZ: 360 }}
              exit={{ opacity: 0 }}
              transition={{ rotateZ: { duration: 4, repeat: Infinity, ease: "linear" } }}
              className="absolute w-72 h-72 border border-white/20 rounded-full pointer-events-none"
              style={{ transform: 'rotateX(70deg)' }}
            />
            <motion.div
              initial={{ opacity: 0, rotateX: 70, rotateZ: 0 }}
              animate={{ opacity: 1, rotateZ: -360 }}
              exit={{ opacity: 0 }}
              transition={{ rotateZ: { duration: 6, repeat: Infinity, ease: "linear" } }}
              className="absolute w-80 h-80 border border-white/10 rounded-full pointer-events-none"
              style={{ transform: 'rotateX(-70deg)' }}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
