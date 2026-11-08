import React from 'react';
import {
  SlidersHorizontal,
  Sun,
  Eye,
  ZoomIn,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AdvancedControlsState, FocusMode, WhiteBalancePreset } from '../types/camera';
import { formatExposure } from '../utils/cropMath';

interface AdvancedControlsDrawerProps {
  controls: AdvancedControlsState;
  onChange: (patch: Partial<AdvancedControlsState>) => void;
  isRecording: boolean;
}

export const AdvancedControlsDrawer: React.FC<AdvancedControlsDrawerProps> = ({
  controls,
  onChange,
  isRecording,
}) => {
  const { zoom, exposure, focusMode, focusDistance, whiteBalance, proDrawerOpen, activeControlTab } = controls;

  // Zoom presets
  const zoomPresets = [1.0, 2.0, 3.0, 5.0];

  const handleReset = () => {
    onChange({
      zoom: 1.0,
      exposure: 0.0,
      focusMode: 'auto',
      focusDistance: 0.5,
      whiteBalance: 'auto',
    });
  };

  return (
    <div className="w-full pointer-events-auto flex flex-col items-center select-none">
      {/* 1. Quick Zoom Preset Bar (Always accessible right above controls) */}
      <div className="flex items-center gap-1.5 px-3 py-1 mb-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 shadow-lg">
        {zoomPresets.map((z) => (
          <button
            key={z}
            onClick={() => onChange({ zoom: z })}
            className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-bold transition-all ${
              Math.abs(zoom - z) < 0.05
                ? 'bg-amber-400 text-black shadow-md shadow-amber-400/30 scale-105'
                : 'text-neutral-300 hover:text-white'
            }`}
            title={`Zoom ${z}x`}
          >
            {z.toFixed(0)}x
          </button>
        ))}

        <div className="w-[1px] h-3 bg-white/20 mx-1" />

        {/* Pro Mode Toggle Button */}
        <button
          onClick={() => onChange({ proDrawerOpen: !proDrawerOpen })}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
            proDrawerOpen
              ? 'bg-amber-400 text-black shadow-md shadow-amber-400/30'
              : 'text-neutral-300 hover:text-white'
          }`}
          title="Toggle Pro Camera Controls"
          aria-label="Toggle Pro Controls"
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span>PRO</span>
          {proDrawerOpen ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronUp className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* 2. Expandable Pro Control Drawer */}
      {proDrawerOpen && (
        <div className="w-full mx-auto max-w-sm px-4 py-3 mb-2 bg-black/85 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl animate-in slide-in-from-bottom duration-200">
          {/* Tab Selector & Reset */}
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-white/10 text-xs">
            <div className="flex items-center gap-1">
              <button
                onClick={() => onChange({ activeControlTab: 'zoom' })}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-all ${
                  activeControlTab === 'zoom'
                    ? 'bg-amber-400 text-black font-bold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <ZoomIn className="w-3 h-3" />
                <span>Zoom</span>
              </button>

              <button
                onClick={() => onChange({ activeControlTab: 'exposure' })}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-all ${
                  activeControlTab === 'exposure'
                    ? 'bg-amber-400 text-black font-bold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Sun className="w-3 h-3" />
                <span>EV</span>
              </button>

              <button
                onClick={() => onChange({ activeControlTab: 'focus' })}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-all ${
                  activeControlTab === 'focus'
                    ? 'bg-amber-400 text-black font-bold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>Focus</span>
              </button>

              <button
                onClick={() => onChange({ activeControlTab: 'wb' })}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-all ${
                  activeControlTab === 'wb'
                    ? 'bg-amber-400 text-black font-bold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>WB</span>
              </button>
            </div>

            {/* Reset All */}
            <button
              onClick={handleReset}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Reset Advanced Settings"
              aria-label="Reset Controls"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Active Tab Panel */}
          {activeControlTab === 'zoom' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-neutral-300">
                <span>Digital Zoom</span>
                <span className="font-bold text-amber-400 text-xs">{zoom.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={1.0}
                max={5.0}
                step={0.1}
                value={zoom}
                onChange={(e) => onChange({ zoom: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
              <div className="flex justify-between text-[9px] text-neutral-500 font-mono">
                <span>1.0x</span>
                <span>2.0x</span>
                <span>3.0x</span>
                <span>4.0x</span>
                <span>5.0x</span>
              </div>
            </div>
          )}

          {activeControlTab === 'exposure' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-neutral-300">
                <span className="flex items-center gap-1">
                  <Sun className="w-3 h-3 text-amber-400" />
                  <span>Exposure Compensation</span>
                </span>
                <span className="font-bold text-amber-400 text-xs">{formatExposure(exposure)}</span>
              </div>
              <input
                type="range"
                min={-3.0}
                max={3.0}
                step={0.1}
                value={exposure}
                onChange={(e) => onChange({ exposure: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
              <div className="flex justify-between text-[9px] text-neutral-500 font-mono">
                <span>-3.0 EV</span>
                <button
                  onClick={() => onChange({ exposure: 0.0 })}
                  className="text-neutral-400 hover:text-amber-300 underline cursor-pointer"
                >
                  0.0 EV
                </button>
                <span>+3.0 EV</span>
              </div>
            </div>
          )}

          {activeControlTab === 'focus' && (
            <div className="space-y-2">
              {/* AF / MF Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-neutral-900 border border-white/10">
                  <button
                    onClick={() => onChange({ focusMode: 'auto' })}
                    className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      focusMode === 'auto'
                        ? 'bg-amber-400 text-black font-bold shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Auto Focus (AF)
                  </button>
                  <button
                    onClick={() => onChange({ focusMode: 'manual' })}
                    className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      focusMode === 'manual'
                        ? 'bg-amber-400 text-black font-bold shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Manual Focus (MF)
                  </button>
                </div>

                <span className="text-[10px] font-mono text-neutral-400">
                  {focusMode === 'auto' ? 'Tap viewfinder' : 'Dial active'}
                </span>
              </div>

              {/* Manual Focus Slider */}
              {focusMode === 'manual' && (
                <div className="pt-1 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-neutral-400">
                    <span>🌷 Macro</span>
                    <span className="font-mono text-amber-300 font-bold">
                      {Math.round(focusDistance * 100)}%
                    </span>
                    <span>⛰️ Infinity</span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.01}
                    value={focusDistance}
                    onChange={(e) => onChange({ focusDistance: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                  />
                </div>
              )}
            </div>
          )}

          {activeControlTab === 'wb' && (
            <div className="space-y-2">
              <div className="grid grid-cols-5 gap-1">
                {(
                  [
                    { id: 'auto', label: 'Auto', icon: '⚡' },
                    { id: 'daylight', label: '5500K', icon: '☀️' },
                    { id: 'cloudy', label: '6500K', icon: '☁️' },
                    { id: 'tungsten', label: '3200K', icon: '💡' },
                    { id: 'fluorescent', label: '4000K', icon: '🔦' },
                  ] as const
                ).map((wb) => (
                  <button
                    key={wb.id}
                    onClick={() => onChange({ whiteBalance: wb.id as WhiteBalancePreset })}
                    className={`flex flex-col items-center justify-center p-1.5 rounded-lg border transition-all ${
                      whiteBalance === wb.id
                        ? 'bg-amber-400 text-black border-amber-300 shadow-md font-bold'
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <span className="text-sm">{wb.icon}</span>
                    <span className="text-[9px] mt-0.5">{wb.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pro Camera Status readout bar */}
          <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[9px] font-mono text-neutral-400">
            <span>ZOOM {zoom.toFixed(1)}x</span>
            <span>EV {formatExposure(exposure)}</span>
            <span>{focusMode === 'auto' ? 'AF-C' : `MF ${(focusDistance * 100).toFixed(0)}%`}</span>
            <span className="uppercase">WB {whiteBalance}</span>
          </div>
        </div>
      )}
    </div>
  );
};
