import React, { useState } from 'react';
import {
  X,
  Play,
  Image as ImageIcon,
  Video,
  Download,
  Trash2,
  Layers,
  Sparkles,
} from 'lucide-react';
import { DualCaptureSession } from '../types/camera';
import { formatBytes, formatDuration } from '../utils/cropMath';
import { DualMediaPreview } from './DualMediaPreview';

interface GalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: DualCaptureSession[];
  onDeleteSession: (id: string) => void;
  onSelectCapture: (session: DualCaptureSession) => void;
}

export const GalleryModal: React.FC<GalleryModalProps> = ({
  isOpen,
  onClose,
  sessions,
  onDeleteSession,
}) => {
  const [filter, setFilter] = useState<'all' | 'video' | 'photo'>('all');
  const [activeSession, setActiveSession] = useState<DualCaptureSession | null>(null);

  if (!isOpen) return null;

  const filtered = sessions.filter((s) => {
    if (filter === 'video') return s.type === 'video';
    if (filter === 'photo') return s.type === 'photo';
    return true;
  });

  const downloadFile = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadBoth = (s: DualCaptureSession, e: React.MouseEvent) => {
    e.stopPropagation();
    const ext = s.type === 'video' ? 'webm' : 'jpg';
    downloadFile(s.verticalMedia.url, `DualShot_${s.id}_Portrait_9-16.${ext}`);
    setTimeout(() => {
      downloadFile(s.horizontalMedia.url, `DualShot_${s.id}_Landscape_16-9.${ext}`);
    }, 400);
  };

  return (
    <div className="absolute inset-0 z-50 bg-neutral-950 flex flex-col text-white animate-in fade-in duration-200">
      {/* Header */}
      <div className="w-full px-5 py-4 flex items-center justify-between border-b border-neutral-800 bg-black/60 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-white tracking-wide">Dual Gallery</h2>
          <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-[11px] font-mono text-neutral-400 border border-neutral-700">
            {sessions.length}
          </span>
        </div>

        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-neutral-300 hover:text-white"
          title="Close Gallery"
          aria-label="Close Gallery"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="w-full px-5 py-2.5 flex items-center gap-2 border-b border-neutral-800/80 bg-neutral-900/30">
        {(['all', 'video', 'photo'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
              filter === tab
                ? 'bg-amber-400 text-black shadow-md shadow-amber-400/20'
                : 'bg-neutral-900 text-neutral-400 hover:text-white'
            }`}
          >
            {tab === 'all' ? 'All Captures' : tab === 'video' ? 'Videos' : 'Photos'}
          </button>
        ))}
      </div>

      {/* Gallery Cards Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-500">
            <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-3">
              <Layers className="w-8 h-8 text-neutral-600" />
            </div>
            <p className="text-sm font-medium text-neutral-300">No dual captures found</p>
            <p className="text-xs text-neutral-500 mt-1 max-w-xs">
              Snap photos or record videos to generate simultaneous vertical (9:16) and horizontal (16:9) files!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filtered.map((s) => (
              <div
                key={s.id}
                onClick={() => setActiveSession(s)}
                className="group p-3 rounded-2xl bg-neutral-900 border border-neutral-800/80 hover:border-amber-400/50 transition-all cursor-pointer shadow-lg hover:shadow-amber-400/5"
              >
                {/* Dual Media Preview Row */}
                <div className="flex items-center gap-2 mb-2.5">
                  {/* Portrait (9:16) Thumbnail */}
                  <div className="relative w-20 h-32 rounded-xl overflow-hidden bg-black border border-neutral-800 shrink-0">
                    <img
                      src={s.verticalMedia.url}
                      alt="Vertical Version"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/75 text-[8px] font-mono text-amber-300 border border-amber-400/30">
                      9:16
                    </div>
                  </div>

                  {/* Horizontal (16:9) Thumbnail & Info */}
                  <div className="flex-1 flex flex-col justify-between h-32 py-0.5">
                    {/* 16:9 Thumbnail */}
                    <div className="relative w-full h-20 rounded-xl overflow-hidden bg-black border border-neutral-800">
                      <img
                        src={s.horizontalMedia.url}
                        alt="Horizontal Version"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/75 text-[8px] font-mono text-amber-300 border border-amber-400/30">
                        16:9 YouTube
                      </div>
                      {s.type === 'video' && (
                        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-mono text-white flex items-center gap-1">
                          <Play className="w-2.5 h-2.5 fill-white" />
                          <span>{formatDuration(s.duration || 0)}</span>
                        </div>
                      )}
                    </div>

                    {/* Metadata & Actions */}
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-white text-xs truncate max-w-[130px]">
                          {s.title}
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &bull;{' '}
                          {s.lensMode === 'dual' ? 'Dual Lens' : 'Single Lens'}
                        </div>
                      </div>

                      {/* Download Both quick button */}
                      <button
                        onClick={(e) => downloadBoth(s, e)}
                        className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-amber-400 transition-colors"
                        title="Download Both Formats"
                        aria-label="Download Both"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Platform Tagline Footer */}
                <div className="pt-2 border-t border-neutral-800/60 flex items-center justify-between text-[10px] text-neutral-400">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>TikTok (9:16) + YouTube (16:9) ready</span>
                  </div>
                  <span className="font-mono text-neutral-500">
                    {formatBytes((s.verticalMedia.fileSize || 0) + (s.horizontalMedia.fileSize || 0))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Session Full Player Modal */}
      {activeSession && (
        <DualMediaPreview
          session={activeSession}
          onClose={() => setActiveSession(null)}
          onDelete={(id) => {
            onDeleteSession(id);
            setActiveSession(null);
          }}
        />
      )}
    </div>
  );
};
