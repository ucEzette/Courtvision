import { useState, useCallback, useRef, useEffect } from 'react';
import { VideoPlayer, VideoPlayerHandle } from './components/VideoPlayer';
import { ClipsList } from './components/ClipsList';
import { TaggingForm } from './components/TaggingForm';
import { ExportButton } from './components/ExportButton';
import {
  addVideo,
  saveClip,
  getClips,
  deleteClip,
  addTag,
  ClipRecord,
  updateClipLabel,
} from './database';

type ClipType = 'Offense' | 'Defense';

export default function App() {
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);

  const [videoId, setVideoId] = useState<number | null>(null);
  const [clips, setClips] = useState<ClipRecord[]>([]);

  // Local HTTP Streaming Server Port
  const [streamPort, setStreamPort] = useState<number | null>(null);

  useEffect(() => {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<number>('get_stream_port').then(setStreamPort).catch(console.error);
    });
  }, []);

  // Hotkey engine state
  const [activeClipType, setActiveClipType] = useState<ClipType | null>(null);
  const clipStartRef = useRef<number | null>(null);


  // Tagging form state
  const [taggingClip, setTaggingClip] = useState<ClipRecord | null>(null);
  const [showTagForm, setShowTagForm] = useState(false);

  // Auto-pause video when the tag form opens
  useEffect(() => {
    if (showTagForm) {
      videoPlayerRef.current?.pause();
    }
  }, [showTagForm]);

  // Clip preview state
  const [previewRange, setPreviewRange] = useState<{ start: number; end: number } | null>(null);

  const handlePreviewEnd = useCallback(() => {
    setPreviewRange(null);
  }, []);

  // Load clips whenever videoId changes
  const refreshClips = useCallback(async () => {
    if (videoId === null) return;
    const data = await getClips(videoId);
    setClips(data);
  }, [videoId]);

  useEffect(() => {
    refreshClips();
  }, [refreshClips]);

  // Handle video loaded
  const handleVideoLoaded = useCallback(async (filePath: string, fileName: string) => {
    const id = await addVideo(filePath, fileName);
    setVideoId(id);
  }, []);

  // ─── HOTKEY ENGINE LOGIC (inline for direct access to video element) ───

  const stopRecording = useCallback(async () => {
    if (activeClipType && clipStartRef.current !== null && videoId !== null) {
      // Get current time from the video player handle
      const endTime = videoPlayerRef.current?.getCurrentTime() ?? 0;
      await saveClip(videoId, activeClipType, clipStartRef.current, endTime);

      // Refresh clips
      const updatedClips = await getClips(videoId);
      setClips(updatedClips);

      // Clips are now saved silently so the user can continue watching the game uninterrupted
    }



    setActiveClipType(null);
    clipStartRef.current = null;
  }, [activeClipType, videoId]);

  const startRecording = useCallback((type: ClipType) => {
    const startTime = videoPlayerRef.current?.getCurrentTime() ?? 0;
    clipStartRef.current = startTime;
    setActiveClipType(type);


  }, [videoId]);

  // Global keydown listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs or when tag form is shown
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        showTagForm
      ) {
        return;
      }

      // Only when a video is loaded
      if (videoId === null) return;

      const key = e.key.toLowerCase();

      // Playback speed hotkeys
      if (key === '[' || key === '{') {
        videoPlayerRef.current?.setPlaybackRate(0.5);
        return;
      }
      if (key === ']' || key === '}') {
        videoPlayerRef.current?.setPlaybackRate(2.0);
        return;
      }
      if (key === '\\' || key === '|') {
        videoPlayerRef.current?.setPlaybackRate(1.0);
        return;
      }

      if (key === ' ') {
        e.preventDefault();
        if (videoPlayerRef.current?.isPlaying()) {
          videoPlayerRef.current?.pause();
        } else {
          videoPlayerRef.current?.play();
        }
        return;
      }

      if (key !== 'o' && key !== 'd') return;

      e.preventDefault();

      // Auto-start video play when a tag hotkey is pressed
      videoPlayerRef.current?.play();

      const pressedType: ClipType = key === 'o' ? 'Offense' : 'Defense';

      if (activeClipType === pressedType) {
        // Toggle off — save clip
        stopRecording();
      } else {
        if (activeClipType !== null) {
          // Auto-stop and save the current clip first
          // Inline the save logic to avoid stale closures
          if (clipStartRef.current !== null) {
            const endTime = videoPlayerRef.current?.getCurrentTime() ?? 0;
            saveClip(videoId, activeClipType, clipStartRef.current, endTime).then(async () => {
              const updatedClips = await getClips(videoId);
              setClips(updatedClips);

            });

          }
        }
        // Start recording the new type
        startRecording(pressedType);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeClipType, videoId, showTagForm, stopRecording, startRecording]);

  // Handle tag submission
  const handleTagSubmit = useCallback(
    async (tag: { player: string; action: string; result: string; shotType?: string }) => {
      if (!taggingClip) return;

      await addTag(taggingClip.id, tag.player, tag.action, tag.result, tag.shotType);

      // Refresh clips and update tagging clip
      await refreshClips();
      if (videoId !== null) {
        const updated = await getClips(videoId);
        setClips(updated);
        const refreshedClip = updated.find((c) => c.id === taggingClip.id);
        if (refreshedClip) {
          setTaggingClip(refreshedClip);
        }
      }
    },
    [taggingClip, videoId, refreshClips]
  );

  const handleDeleteClip = useCallback(
    async (clipId: number) => {
      await deleteClip(clipId);
      await refreshClips();
    },
    [refreshClips]
  );

  const handleSeek = useCallback((time: number) => {
    videoPlayerRef.current?.seekTo(time);
  }, []);

  const handleTagClip = useCallback((clip: ClipRecord) => {
    setTaggingClip(clip);
    setShowTagForm(true);
  }, []);

  const handleUpdateLabel = useCallback(async (clipId: number, label: string) => {
    await updateClipLabel(clipId, label);
    await refreshClips();
  }, [refreshClips]);

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <img src="/courtvisionlogo.png" alt="Courtvision" className="header-logo" />
        </div>
        <div className="header-status">
          {activeClipType && (
            <div className={`status-recording ${activeClipType.toLowerCase()}`}>
              <span className="rec-dot" />
              Recording {activeClipType}
            </div>
          )}
          {videoId && (
            <span className="clip-counter">{clips.length} clip{clips.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {/* Video Panel */}
        <section className="panel-video">
          <VideoPlayer
            ref={videoPlayerRef}
            onVideoLoaded={handleVideoLoaded}
            activeClipType={activeClipType}
            previewRange={previewRange}
            onPreviewEnd={handlePreviewEnd}
            streamPort={streamPort}
          />
        </section>

        {/* Sidebar */}
        <aside className="panel-sidebar">
          {/* Controls */}
          <div className="sidebar-section controls-section">
            <h2 className="section-title">Hotkeys</h2>
            <div className="hotkey-grid">
              <div className={`hotkey-card ${activeClipType === 'Offense' ? 'active' : ''}`}>
                <kbd>O</kbd>
                <span>Offense</span>
              </div>
              <div className={`hotkey-card ${activeClipType === 'Defense' ? 'active' : ''}`}>
                <kbd>D</kbd>
                <span>Defense</span>
              </div>
            </div>
            <p className="hotkey-hint">Press to toggle · Auto-switch between O/D</p>
          </div>

          {/* Clips List */}
          <div className="sidebar-section clips-section">
            <h2 className="section-title">Clips</h2>
            <ClipsList
              clips={clips}
              onSeek={handleSeek}
              onDelete={handleDeleteClip}
              onTagClip={handleTagClip}
              onUpdateLabel={handleUpdateLabel}
            />
          </div>

          {/* Export */}
          <ExportButton
            videoId={videoId}
            clipCount={clips.length}
            disabled={!videoId || clips.length === 0}
          />
        </aside>
      </main>

      {/* Tagging Form Modal */}
      {showTagForm && taggingClip && (
        <TaggingForm
          clipId={taggingClip.id}
          clipType={taggingClip.clip_type as ClipType}
          currentTagCount={taggingClip.tags.length}
          onSubmit={handleTagSubmit}
          onClose={() => {
            setShowTagForm(false);
            setTaggingClip(null);
          }}
        />
      )}
    </div>
  );
}
