import React, { useRef, useState, useEffect } from 'react';
import { LensMode } from '../types/camera';
import { calculateLandscapeGuideInPortrait } from '../utils/cropMath';
import { playFocusBeep } from '../utils/audioSfx';

interface CameraViewfinderProps {
  lensMode: LensMode;
  isRecording: boolean;
  recordingTime: number;
  formatDuration: (sec: number) => string;
  isFlashing: boolean;
  videoRefA: React.RefObject<HTMLVideoElement | null>;
  videoRefB: React.RefObject<HTMLVideoElement | null>;
  canvasDisplayRef: React.RefObject<HTMLCanvasElement | null>;
  isSimulated: boolean;
  zoom: number;
  exposure: number;
  onUpdateExposure?: (ev: number) => void;
  focusMode: 'auto' | 'manual';
  focusDistance: number;
  digitalStabilization?: boolean;
  onTapFocus?: () => void;
}

export const CameraViewfinder: React.FC<CameraViewfinderProps> = ({
  lensMode,
  isRecording,
  recordingTime,
  formatDuration,
  isFlashing,
  videoRefA,
  videoRefB,
  canvasDisplayRef,
  isSimulated,
  zoom,
  exposure,
  onUpdateExposure,
  focusMode,
  focusDistance,
  digitalStabilization = true,
  onTapFocus,
}) => {
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [isAdjustingExposure, setIsAdjustingExposure] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const guide = calculateLandscapeGuideInPortrait();

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // If clicking on exposure slider thumb, don't reset focus
    if ((e.target as HTMLElement).closest('.exposure-slider-container')) {
      return;
    }

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(30, Math.min(rect.width - 60, e.clientX - rect.left));
    const y = Math.max(60, Math.min(rect.height - 80, e.clientY - rect.top));

    setFocusPoint({ x, y });
    playFocusBeep();
    if (onTapFocus) onTapFocus();

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      if (!isAdjustingExposure) {
        setFocusPoint(null);
      }
    }, 3500);
  };

  const handleExposureDrag = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (onUpdateExposure) onUpdateExposure(val);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setFocusPoint(null);
      setIsAdjustingExposure(false);
    }, 2500);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      className="relative flex-1 w-full bg-neutral-950 overflow-hidden cursor-crosshair select-none"
    >
      {/* Hidden real video elements for hardware streams */}
      <video
        ref={videoRefA}
        playsInline
        muted
        autoPlay
        className="hidden"
      />
      <video
        ref={videoRefB}
        playsInline
        muted
        autoPlay
        className="hidden"
      />

      {/* Main Display Canvas (Direct 9:16 Feed) */}
      <canvas
        ref={canvasDisplayRef}
        width={1080}
        height={1920}
        className="w-full h-full object-cover pointer-events-none"
      />

      {/* Recording Timer Pill at Top-Left (Matching Panel 3 in user image) */}
      {isRecording && (
        <div className="absolute top-3 left-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600/90 backdrop-blur-md border border-red-400/50 text-white font-mono text-xs font-semibold shadow-lg shadow-red-950/50 animate-pulse">
          <div className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
          <span>{formatDuration(recordingTime)}</span>
          <span className="text-[10px] text-red-200 tracking-wider uppercase font-sans font-bold">REC DUAL</span>
        </div>
      )}

      {/* Single Lens Mode: 16:9 Landscape Safe Area Guide (Matching Panel 3) */}
      {lensMode === 'single' && (
        <div
          className="absolute inset-x-0 pointer-events-none transition-all duration-300"
          style={{
            top: `${guide.topPercent}%`,
            height: `${guide.heightPercent}%`,
          }}
        >
          {/* Subtle horizontal framing guidelines */}
          <div className="absolute inset-0 border-y border-amber-400/60 shadow-[0_0_12px_rgba(251,191,36,0.25)]">
            {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-amber-400" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-amber-400" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-amber-400" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-amber-400" />

            {/* Subtle center crosshair */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none opacity-40">
              <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white" />
              <div className="absolute left-1/2 top-0 h-full w-[1px] bg-white" />
            </div>

            {/* Badge Indicator */}
            <div className="absolute -top-6 right-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-mono text-amber-300 border border-amber-400/30">
              16:9 YouTube Cut
            </div>
          </div>
        </div>
      )}

      {/* Dual Lens Mode: Floating Picture-in-Picture Lens Window (Matching Panel 2) */}
      {lensMode === 'dual' && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 w-44 h-24 rounded-xl border-2 border-amber-400/80 bg-neutral-900/90 shadow-2xl overflow-hidden backdrop-blur-md transition-all duration-300">
          {/* Secondary preview or mini simulated view */}
          <div className="relative w-full h-full flex items-center justify-center bg-sky-950/40">
            {/* If videoB has a stream, show it, else mini landscape indicator */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
              <div className="text-[11px] font-semibold text-amber-300 tracking-wide uppercase">
                Camera B (16:9)
              </div>
              <div className="text-[9px] text-neutral-300 mt-0.5">
                Horizontal Cut Stream
              </div>
              <div className="mt-1 px-1.5 py-0.5 rounded bg-amber-400/20 text-[9px] font-mono text-amber-300 border border-amber-400/40">
                1920 × 1080
              </div>
            </div>
            {/* Corner badge */}
            <div className="absolute top-1 left-1.5 px-1 rounded bg-black/70 text-[8px] font-bold text-white uppercase">
              PiP
            </div>
          </div>
        </div>
      )}

      {/* Top Floating Status Badges (Zoom, EV, MF, STEADY) */}
      <div className="absolute top-3 right-4 z-30 flex items-center gap-1.5 pointer-events-none">
        {digitalStabilization && (
          <div className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-emerald-400/50 text-[10px] font-mono font-bold text-emerald-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>STEADY</span>
          </div>
        )}
        {zoom > 1.0 && (
          <div className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-amber-400/50 text-[10px] font-mono font-bold text-amber-300">
            {zoom.toFixed(1)}x ZOOM
          </div>
        )}
        {exposure !== 0 && (
          <div className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[10px] font-mono text-neutral-200">
            {exposure > 0 ? `+${exposure.toFixed(1)}` : exposure.toFixed(1)} EV
          </div>
        )}
        {focusMode === 'manual' && (
          <div className="px-2 py-0.5 rounded-full bg-amber-400/90 text-black text-[10px] font-mono font-bold">
            MF {Math.round(focusDistance * 100)}%
          </div>
        )}
      </div>

      {/* Tap-to-Focus Reticle with Interactive Exposure Slider */}
      {focusPoint && (
        <div
          className="absolute z-40 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 select-none"
          style={{ left: focusPoint.x, top: focusPoint.y }}
        >
          {/* Golden Focus Box */}
          <div className="relative w-16 h-16 pointer-events-none">
            <div className="w-16 h-16 border-2 border-amber-400 rounded-lg animate-ping opacity-75" />
            <div className="absolute inset-0 w-16 h-16 border border-amber-300 rounded-lg flex items-center justify-center shadow-lg shadow-amber-400/40 bg-black/10">
              <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
              {/* Corner tick marks */}
              <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-amber-300" />
              <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-amber-300" />
              <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-amber-300" />
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-amber-300" />
            </div>
          </div>

          {/* Interactive Vertical Exposure Slider Container (Pointer events enabled!) */}
          <div
            className="exposure-slider-container pointer-events-auto flex flex-col items-center p-1.5 rounded-full bg-black/75 backdrop-blur-md border border-amber-400/60 shadow-xl"
            onPointerDown={(e) => {
              e.stopPropagation();
              setIsAdjustingExposure(true);
            }}
          >
            <div className="text-amber-300 text-xs mb-1">☀</div>
            <input
              type="range"
              min={-3.0}
              max={3.0}
              step={0.1}
              value={exposure}
              onChange={handleExposureDrag}
              aria-label="Direct Exposure Slider"
              className="w-1.5 h-24 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-amber-400 [writing-mode:vertical-lr] [direction:rtl]"
            />
            <span className="text-[8px] font-mono font-bold text-amber-300 mt-1">
              {exposure > 0 ? `+${exposure.toFixed(1)}` : exposure.toFixed(1)}
            </span>
          </div>
        </div>
      )}

      {/* Screen Flash on Photo Shutter */}
      {isFlashing && (
        <div className="absolute inset-0 bg-white z-50 pointer-events-none transition-opacity duration-150 animate-out fade-out" />
      )}

      {/* Simulation indicator badge if active */}
      {isSimulated && (
        <div className="absolute bottom-24 right-3 z-20 px-2 py-0.5 rounded-full bg-neutral-900/70 backdrop-blur-md border border-neutral-700/50 text-[10px] text-neutral-300 flex items-center gap-1.5 pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          <span>Live Demo Feed</span>
        </div>
      )}
    </div>
  );
};
