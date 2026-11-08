import React, { useState } from 'react';
import { Smartphone, Monitor } from 'lucide-react';

interface PhoneFrameProps {
  children: React.ReactNode;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({ children }) => {
  const [frameEnabled, setFrameEnabled] = useState(true);

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-0 sm:p-4 select-none overflow-x-hidden">
      {/* Top Bar for Desktop Preview */}
      <header className="hidden sm:flex items-center justify-between w-full max-w-4xl px-4 py-2 mb-2 bg-neutral-900/60 backdrop-blur-md rounded-xl border border-neutral-800 text-xs text-neutral-300">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-white tracking-wide">DualShot Recorder</span>
          <span className="text-neutral-500">|</span>
          <span className="text-neutral-400">Simultaneous 9:16 Portrait + 16:9 Landscape Capture</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFrameEnabled(!frameEnabled)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
            title="Toggle Android Device Frame"
          >
            {frameEnabled ? (
              <>
                <Monitor className="w-3.5 h-3.5 text-amber-400" />
                <span>Fullscreen View</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                <span>Phone Frame</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      {frameEnabled ? (
        <div className="relative w-full sm:w-[410px] h-[100dvh] sm:h-[844px] bg-black sm:rounded-[50px] sm:border-[10px] sm:border-neutral-900 sm:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.08)] flex flex-col overflow-hidden">
          {/* Android Punch Hole Camera */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-black border border-neutral-800 z-50 pointer-events-none flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-950/80" />
          </div>

          {/* Android Status Bar */}
          <div className="relative z-40 w-full px-7 pt-2.5 pb-1 flex items-center justify-between text-[11px] font-medium text-white/80 pointer-events-none">
            <span>09:41</span>
            <div className="flex items-center gap-1.5 text-white/80">
              <span className="text-[10px] font-bold">5G</span>
              {/* Signal bars */}
              <div className="flex items-end gap-0.5 h-2.5">
                <span className="w-0.5 h-1 bg-white rounded-full" />
                <span className="w-0.5 h-1.5 bg-white rounded-full" />
                <span className="w-0.5 h-2 bg-white rounded-full" />
                <span className="w-0.5 h-2.5 bg-white rounded-full" />
              </div>
              {/* Battery pill */}
              <div className="w-5 h-2.5 rounded-[4px] border border-white/80 p-0.5 flex items-center">
                <div className="w-3.5 h-full bg-white rounded-[2px]" />
              </div>
            </div>
          </div>

          {/* Content container */}
          <div className="relative flex-1 w-full h-full overflow-hidden flex flex-col">
            {children}
          </div>

          {/* Android Home Navigation Bar */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/40 rounded-full z-50 pointer-events-none" />
        </div>
      ) : (
        <div className="relative w-full max-w-2xl h-[100dvh] sm:h-[860px] bg-black sm:rounded-2xl overflow-hidden flex flex-col border sm:border-neutral-800 shadow-2xl">
          {children}
        </div>
      )}
    </div>
  );
};
