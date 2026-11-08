import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
  Trash2,
  X,
  Share2,
  Layers,
  ArrowRightLeft,
  Smartphone,
  Tv,
} from 'lucide-react';
import { DualCaptureSession } from '../types/camera';
import { formatBytes, formatDuration } from '../utils/cropMath';

interface DualMediaPreviewProps {
  session: DualCaptureSession;
  onClose: () => void;
  onDelete: (id: string) => void;
}

export const DualMediaPreview: React.FC<DualMediaPreviewProps> = ({
  session,
  onClose,
  onDelete,
}) => {
  // View mode: 'side-by-side' | 'toggle'
  const [activeAspect, setActiveAspect] = useState<'9:16' | '16:9'>('9:16');
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(session.duration || 0);

  const videoRefPortrait = useRef<HTMLVideoElement>(null);
  const videoRefLandscape = useRef<HTMLVideoElement>(null);

  const isVideo = session.type === 'video';

  // Synchronized playback controls
  const togglePlay = () => {
    if (isPlaying) {
      videoRefPortrait.current?.pause();
      videoRefLandscape.current?.pause();
      setIsPlaying(false);
    } else {
      videoRefPortrait.current?.play().catch(() => {});
      videoRefLandscape.current?.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRefPortrait.current) {
      setCurrentTime(videoRefPortrait.current.currentTime);
      if (!duration && videoRefPortrait.current.duration) {
        setDuration(videoRefPortrait.current.duration);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRefPortrait.current) videoRefPortrait.current.currentTime = time;
    if (videoRefLandscape.current) videoRefLandscape.current.currentTime = time;
  };

  // Download single file
  const downloadFile = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Download both files simultaneously
  const downloadBoth = () => {
    const ext = isVideo ? 'webm' : 'jpg';
    downloadFile(session.verticalMedia.url, `DualShot_${session.id}_Portrait_9-16.${ext}`);
    setTimeout(() => {
      downloadFile(session.horizontalMedia.url, `DualShot_${session.id}_Landscape_16-9.${ext}`);
    }, 400);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: session.title,
          text: 'Dual-aspect recording captured with DualShot (9:16 + 16:9)',
          url: window.location.href,
        });
      } catch {
        // User cancelled share
      }
    } else {
      // Fallback: download both
      downloadBoth();
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col text-white animate-in fade-in duration-200 select-none">
      {/* Top Header */}
      <div className="w-full px-4 py-3 flex items-center justify-between border-b border-neutral-800 bg-black/60">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-neutral-300 hover:text-white"
          title="Back to Gallery"
          aria-label="Back to Gallery"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center">
          <h3 className="text-xs font-semibold text-white tracking-wide">{session.title}</h3>
          <p className="text-[10px] text-neutral-400">
            {session.type.toUpperCase()} &bull; {new Date(session.createdAt).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleShare}
            className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-neutral-300 hover:text-white"
            title="Share"
            aria-label="Share Media"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this dual capture from gallery?')) {
                onDelete(session.id);
                onClose();
              }
            }}
            className="w-9 h-9 rounded-full bg-red-950/40 border border-red-800/40 flex items-center justify-center text-red-400 hover:bg-red-900/60"
            title="Delete Session"
            aria-label="Delete Capture"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Format Selector Pills: TikTok/Reels (9:16) vs YouTube (16:9) */}
      <div className="w-full px-4 py-2 flex items-center justify-center gap-2 bg-neutral-900/50 border-b border-neutral-800/50">
        <button
          onClick={() => setActiveAspect('9:16')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            activeAspect === '9:16'
              ? 'bg-amber-400 text-black shadow-md'
              : 'bg-neutral-800 text-neutral-300 hover:text-white'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>TikTok / Reels (9:16)</span>
        </button>

        <button
          onClick={() => setActiveAspect('16:9')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            activeAspect === '16:9'
              ? 'bg-amber-400 text-black shadow-md'
              : 'bg-neutral-800 text-neutral-300 hover:text-white'
          }`}
        >
          <Tv className="w-3.5 h-3.5" />
          <span>YouTube (16:9)</span>
        </button>
      </div>

      {/* Main View Area */}
      <div className="flex-1 relative flex items-center justify-center p-3 overflow-hidden bg-neutral-950">
        {activeAspect === '9:16' ? (
          /* Portrait 9:16 Container */
          <div className="relative h-full aspect-[9/16] max-h-[540px] rounded-2xl overflow-hidden bg-black border border-neutral-800 shadow-2xl">
            {isVideo ? (
              <video
                ref={videoRefPortrait}
                src={session.verticalMedia.url}
                playsInline
                loop
                autoPlay
                muted={isMuted}
                onTimeUpdate={handleTimeUpdate}
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={session.verticalMedia.url}
                alt="Portrait Dual Shot"
                className="w-full h-full object-cover"
              />
            )}
            {/* Aspect Overlay Tag */}
            <div className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-mono text-amber-300 border border-amber-400/30">
              9:16 &bull; {session.verticalMedia.width}×{session.verticalMedia.height}
            </div>
          </div>
        ) : (
          /* Landscape 16:9 Container */
          <div className="relative w-full aspect-[16/9] max-w-sm rounded-2xl overflow-hidden bg-black border border-neutral-800 shadow-2xl">
            {isVideo ? (
              <video
                ref={videoRefLandscape}
                src={session.horizontalMedia.url}
                playsInline
                loop
                autoPlay
                muted={isMuted}
                onTimeUpdate={handleTimeUpdate}
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={session.horizontalMedia.url}
                alt="Landscape Dual Shot"
                className="w-full h-full object-cover"
              />
            )}
            {/* Aspect Overlay Tag */}
            <div className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-mono text-amber-300 border border-amber-400/30">
              16:9 &bull; {session.horizontalMedia.width}×{session.horizontalMedia.height}
            </div>
          </div>
        )}
      </div>

      {/* Synchronized Media Controls (Matching Panel 1 in user's image) */}
      <div className="w-full px-5 py-4 bg-neutral-900 border-t border-neutral-800 space-y-3">
        {/* Scrubber for video */}
        {isVideo && (
          <div className="space-y-1">
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <div className="flex justify-between text-[10px] font-mono text-neutral-400">
              <span>{formatDuration(currentTime)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>
        )}

        {/* Video Transport Buttons */}
        {isVideo && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => setActiveAspect(activeAspect === '9:16' ? '16:9' : '9:16')}
              className="flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white"
            >
              <ArrowRightLeft className="w-4 h-4 text-amber-400" />
              <span>Switch Format</span>
            </button>

            <button
              onClick={togglePlay}
              className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"
              title={isPlaying ? 'Pause' : 'Play'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
            </button>

            <button
              onClick={() => setIsMuted(!isMuted)}
              className="text-neutral-300 hover:text-white"
              title={isMuted ? 'Unmute' : 'Mute'}
              aria-label="Toggle Sound"
            >
              {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
            </button>
          </div>
        )}

        {/* Export / Download Buttons */}
        <div className="pt-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              const file = activeAspect === '9:16' ? session.verticalMedia : session.horizontalMedia;
              const ext = isVideo ? 'webm' : 'jpg';
              downloadFile(file.url, `DualShot_${activeAspect}_${session.id}.${ext}`);
            }}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition-colors"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Save Current ({activeAspect})</span>
          </button>

          <button
            onClick={downloadBoth}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold transition-all shadow-md shadow-amber-400/20"
          >
            <Layers className="w-4 h-4" />
            <span>Save Both Formats</span>
          </button>
        </div>
      </div>
    </div>
  );
};
