import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface LandingPageProps {
  onComplete: () => void;
}

export function LandingPage({ onComplete }: LandingPageProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(onComplete, 500);
          return 100;
        }
        return prev + 2;
      });
    }, 30);

    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#F5F1E8]"
    >
      <div className="text-center">
        {/* Logo/Brand Name */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <h1 className="font-serif text-6xl md:text-7xl lg:text-8xl font-light tracking-tight text-[#1a1a1a] mb-4">
            Hannah Vanessa
          </h1>
          <p className="text-sm md:text-base tracking-[0.3em] uppercase text-[#6B5D4F] mb-12">
            Boutique
          </p>
        </motion.div>

        {/* Loading Bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="w-64 h-[1px] bg-[#E8DCC8] mx-auto relative overflow-hidden"
        >
          <motion.div
            className="absolute inset-y-0 left-0 bg-[#D4AF37]"
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </motion.div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1 }}
          className="mt-8 text-xs tracking-widest uppercase text-[#6B5D4F]"
        >
          Cadena de Amor, Taguig City
        </motion.p>
      </div>
    </motion.div>
  );
}
