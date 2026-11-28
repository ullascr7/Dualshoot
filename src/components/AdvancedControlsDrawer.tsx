import React from 'react';
import {
  SlidersHorizontal,
  Sun,
  Eye,
  ZoomIn,
  RotateCcw,
  Thermometer,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AdvancedControlsState, WhiteBalancePreset } from '../types/camera';
import { formatExposure } from '../utils/cropMath';

interface AdvancedControlsDrawerProps {
  controls: AdvancedControlsState;
  onChange: (patch: Partial<AdvancedControlsState>) => void;
  maxZoom?: number;
}

export const AdvancedControlsDrawer: React.FC<AdvancedControlsDrawerProps> = React.memo(({
  controls,
  onChange,
  maxZoom = 5.0,
}) => {
  const {
    zoom,
    exposure,
    focusMode,
    focusDistance,
    whiteBalance,
    proDrawerOpen,
    activeControlTab,
  } = controls;

  const zoomPresets = [1.0, 2.0, 3.0, Math.min(5.0, Math.max(4.0, Math.floor(maxZoom)))];

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
      {/* Quick Zoom Pills + PRO Trigger */}
      <div className="flex items-center gap-1 p-1 rounded-full bg-neutral-950/95 border border-white/12 shadow-xl">
        {zoomPresets.map((z) => {
          const isActive = Math.abs(zoom - z) < 0.15;
          return (
            <button
              key={z}
              type="button"
              onClick={() => onChange({ zoom: z })}
              className={`min-w-[40px] h-8 px-2.5 rounded-full text-xs font-mono tabular-nums font-semibold transition-transform duration-150 ease-flagship whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-amber-400 text-black shadow-sm scale-105'
                  : 'text-white/80 hover:text-white active:scale-95'
              }`}
              aria-label={`Zoom ${z.toFixed(0)}x`}
            >
              {isActive && zoom !== z ? `${zoom.toFixed(1)}x` : `${z.toFixed(0)}x`}
            </button>
          );
        })}

        <div className="w-[1px] h-4 bg-white/15 mx-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={() => onChange({ proDrawerOpen: !proDrawerOpen })}
          className={`flex items-center gap-1 h-8 px-3 rounded-full text-xs font-semibold transition-colors duration-150 ease-flagship whitespace-nowrap shrink-0 ${
            proDrawerOpen
              ? 'bg-white text-black shadow-sm'
              : 'text-white/85 hover:text-white hover:bg-white/10'
          }`}
          aria-label="Toggle Pro Controls"
          aria-expanded={proDrawerOpen}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>PRO</span>
          {proDrawerOpen ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Expandable Pitch-Black AMOLED Pro Drawer */}
      {proDrawerOpen && (
        <div className="w-full mx-auto max-w-md mt-2 px-4 py-3 bg-neutral-950/95 border border-white/12 rounded-3xl shadow-2xl">
          {/* Control Tabs + Reset */}
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-white/10">
            <div className="flex items-center gap-1">
              {[
                { id: 'zoom' as const, label: 'Zoom', icon: ZoomIn },
                { id: 'exposure' as const, label: 'EV', icon: Sun },
                { id: 'focus' as const, label: 'Focus', icon: Eye },
                { id: 'wb' as const, label: 'WB', icon: Thermometer },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeControlTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onChange({ activeControlTab: tab.id })}
                    className={`flex items-center gap-1.5 min-h-[36px] px-3 rounded-full text-xs font-medium transition-all duration-150 ease-flagship whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-amber-400 text-black font-semibold'
                        : 'text-neutral-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="min-w-[36px] min-h-[36px] rounded-full flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Reset Pro Controls"
              aria-label="Reset Controls"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Zoom Slider */}
          {activeControlTab === 'zoom' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-300">
                <span>Zoom Magnification</span>
                <span className="font-mono tabular-nums font-semibold text-amber-400">
                  {zoom.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min={1.0}
                max={Math.max(5.0, maxZoom)}
                step={0.1}
                value={zoom}
                onChange={(e) => onChange({ zoom: parseFloat(e.target.value) })}
                aria-label="Zoom Slider"
                className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
              <div className="flex justify-between text-[10px] text-neutral-500 font-mono tabular-nums">
                <span>1.0x</span>
                <span>2.0x</span>
                <span>3.0x</span>
                <span>4.0x</span>
                <span>{Math.max(5.0, maxZoom).toFixed(1)}x</span>
              </div>
            </div>
          )}

          {/* Exposure Compensation */}
          {activeControlTab === 'exposure' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-300">
                <span>Exposure Compensation</span>
                <span className="font-mono tabular-nums font-semibold text-amber-400">
                  {formatExposure(exposure)}
                </span>
              </div>
              <input
                type="range"
                min={-3.0}
                max={3.0}
                step={0.1}
                value={exposure}
                onChange={(e) => onChange({ exposure: parseFloat(e.target.value) })}
                aria-label="Exposure Compensation Slider"
                className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
              <div className="flex justify-between text-[10px] text-neutral-500 font-mono tabular-nums">
                <span>-3.0 EV</span>
                <button
                  type="button"
                  onClick={() => onChange({ exposure: 0.0 })}
                  className="text-neutral-300 hover:text-amber-300 underline"
                >
                  0.0 EV
                </button>
                <span>+3.0 EV</span>
              </div>
            </div>
          )}

          {/* Focus Controls */}
          {activeControlTab === 'focus' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 p-1 rounded-full bg-neutral-900 border border-white/10">
                  <button
                    type="button"
                    onClick={() => onChange({ focusMode: 'auto' })}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                      focusMode === 'auto'
                        ? 'bg-amber-400 text-black'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Auto Focus
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ focusMode: 'manual' })}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                      focusMode === 'manual'
                        ? 'bg-amber-400 text-black'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Manual Focus
                  </button>
                </div>

                <span className="text-[11px] font-mono text-neutral-400">
                  {focusMode === 'auto' ? 'AF Continuous' : 'MF Locked'}
                </span>
              </div>

              {focusMode === 'manual' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400">
                    <span>Macro</span>
                    <span className="font-mono tabular-nums text-amber-300 font-semibold">
                      {Math.round(focusDistance * 100)}%
                    </span>
                    <span>Infinity</span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.01}
                    value={focusDistance}
                    onChange={(e) => onChange({ focusDistance: parseFloat(e.target.value) })}
                    aria-label="Manual Focus Distance"
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                  />
                </div>
              )}
            </div>
          )}

          {/* White Balance */}
          {activeControlTab === 'wb' && (
            <div className="grid grid-cols-5 gap-1.5">
              {(
                [
                  { id: 'auto', label: 'Auto', kelvin: 'AWB' },
                  { id: 'daylight', label: 'Sun', kelvin: '5500K' },
                  { id: 'cloudy', label: 'Cloud', kelvin: '6500K' },
                  { id: 'tungsten', label: 'Warm', kelvin: '3200K' },
                  { id: 'fluorescent', label: 'Cool', kelvin: '4000K' },
                ] as const
              ).map((wb) => (
                <button
                  key={wb.id}
                  type="button"
                  onClick={() => onChange({ whiteBalance: wb.id as WhiteBalancePreset })}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border transition-all duration-150 ${
                    whiteBalance === wb.id
                      ? 'bg-amber-400 text-black border-amber-300 font-semibold'
                      : 'bg-neutral-900/90 border-white/10 text-neutral-300 hover:text-white'
                  }`}
                >
                  <span className="text-[11px] leading-tight">{wb.label}</span>
                  <span className="text-[9px] font-mono opacity-75 mt-0.5">{wb.kelvin}</span>
                </button>
              ))}
            </div>
          )}

          {/* Clean unboxed summary footer */}
          <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] font-mono tabular-nums text-neutral-400">
            <span>{zoom.toFixed(1)}x</span>
            <span>·</span>
            <span>{formatExposure(exposure)}</span>
            <span>·</span>
            <span>{focusMode === 'auto' ? 'AF-C' : `MF ${Math.round(focusDistance * 100)}%`}</span>
            <span>·</span>
            <span className="uppercase">{whiteBalance}</span>
          </div>
        </div>
      )}
    </div>
  );
});
