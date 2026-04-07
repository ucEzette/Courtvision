import { useRef, useState, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import { isTauri } from '../lib/platform';
import { uploadFile, getDownloadUrl, deleteFile } from '../lib/storage-web';

interface VideoPlayerProps {
    onVideoLoaded: (filePath: string, fileName: string) => void;
    activeClipType: 'Offense' | 'Defense' | null;
    previewRange: { start: number; end: number } | null;
    onPreviewEnd?: () => void;
    onVideoDeleted?: () => void;
    streamPort: number | null;
}

export interface VideoPlayerHandle {
    getCurrentTime: () => number;
    seekTo: (time: number) => void;
    isPlaying: () => boolean;
    playSegment: (start: number, end: number) => void;
    pause: () => void;
    play: () => void;
    setPlaybackRate: (rate: number) => void;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
    ({ onVideoLoaded, activeClipType, previewRange, onPreviewEnd, onVideoDeleted, streamPort }, ref) => {
        const videoRef = useRef<HTMLVideoElement>(null);
        const fileInputRef = useRef<HTMLInputElement>(null);
        const [videoSrc, setVideoSrc] = useState<string | null>(null);
        const [currentKey, setCurrentKey] = useState<string | null>(null);
        const [fileName, setFileName] = useState<string>('');
        const [playing, setPlaying] = useState(false);
        const [loading, setLoading] = useState(false);
        const [uploadProgress, setUploadProgress] = useState<number | null>(null);
        const [isResuming, setIsResuming] = useState(false);
        const [playbackRate, setPlaybackRateState] = useState<number>(1);
        const previewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

        useImperativeHandle(ref, () => ({
            getCurrentTime: () => videoRef.current?.currentTime ?? 0,
            seekTo: (time: number) => {
                if (videoRef.current) {
                    videoRef.current.currentTime = time;
                }
            },
            isPlaying: () => playing,
            playSegment: (start: number, end: number) => {
                if (!videoRef.current) return;
                videoRef.current.currentTime = start;
                videoRef.current.play();

                if (previewTimerRef.current) {
                    clearInterval(previewTimerRef.current);
                }

                previewTimerRef.current = setInterval(() => {
                    if (videoRef.current && videoRef.current.currentTime >= end) {
                        videoRef.current.pause();
                        if (previewTimerRef.current) {
                            clearInterval(previewTimerRef.current);
                            previewTimerRef.current = null;
                        }
                        if (onPreviewEnd) onPreviewEnd();
                    }
                }, 100);
            },
            pause: () => {
                if (videoRef.current) {
                    videoRef.current.pause();
                }
            },
            play: () => {
                if (videoRef.current) {
                    videoRef.current.play();
                }
            },
            setPlaybackRate: (rate: number) => {
                if (videoRef.current) {
                    videoRef.current.playbackRate = rate;
                    setPlaybackRateState(rate);
                }
            },
        }));

        const handleRateChange = useCallback((rate: number) => {
            if (videoRef.current) {
                videoRef.current.playbackRate = rate;
                setPlaybackRateState(rate);
            }
        }, []);

        const processFile = useCallback(async (filePath: string) => {
            const parts = filePath.split(/[/\\]/);
            const name = parts[parts.length - 1];

            setLoading(true);
            try {
                let streamUrl: string;
                const cleanPath = filePath.replace(/^file:\/\//i, '');
                
                if (isTauri()) {
                  if (navigator.userAgent.includes('Win')) {
                      const { convertFileSrc } = await import('@tauri-apps/api/core');
                      streamUrl = convertFileSrc(cleanPath);
                  } else {
                      if (!streamPort) {
                          console.error('Stream port is not available yet');
                          return;
                      }
                      const encodedSegments = cleanPath.split('/').map(encodeURIComponent);
                      const encodedPath = encodedSegments.join('/');
                      streamUrl = `http://127.0.0.1:${streamPort}${encodedPath.startsWith('/') ? '' : '/'}${encodedPath}`;
                  }
                } else {
                  // Web: In web mode, filePath is the R2 key
                  streamUrl = await getDownloadUrl(filePath);
                  setCurrentKey(filePath);
                }

                setVideoSrc(streamUrl);
                setFileName(name);
                onVideoLoaded(filePath, name);
            } catch (err) {
                console.error('Failed to construct video stream URL:', err);
            } finally {
                setLoading(false);
            }
        }, [onVideoLoaded, streamPort]);

        const handleDelete = useCallback(async () => {
            if (!isTauri() && !currentKey) return;
            
            const confirmed = window.confirm('Permanently delete this video and all its clips? This will clear its storage space.');
            if (!confirmed) return;

            setLoading(true);
            try {
                if (!isTauri() && currentKey) {
                    if (onVideoDeleted) await onVideoDeleted();
                    await deleteFile(currentKey);
                    alert('Video deleted successfully.');
                    window.location.reload();
                }
            } catch (err) {
                console.error('Deletion failed:', err);
                alert('Deletion failed. See console.');
            } finally {
                setLoading(false);
            }
        }, [currentKey]);

        const [uploadStatus, setUploadStatus] = useState<string>('Uploading...');
        const [uploadSpeed, setUploadSpeed] = useState<string>('');
        const startTimeRef = useRef<number>(0);

        const handleWebFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            setLoading(true);
            setUploadProgress(0);
            setUploadSpeed('');
            setUploadStatus('Processing...');
            setIsResuming(false); 
            startTimeRef.current = Date.now();
            
            try {
                const key = await uploadFile(file, (p, status) => {
                    setUploadProgress(p);
                    if (status) setUploadStatus(status);
                    
                    // Speed Calculation in MB/s
                    const elapsed = (Date.now() - startTimeRef.current) / 1000;
                    if (elapsed > 1 && status === 'Uploading...') {
                        const mbUploaded = (p / 100) * (file.size / (1024 * 1024));
                        const speed = (mbUploaded / elapsed).toFixed(1);
                        setUploadSpeed(`${speed} MB/s`);
                    }

                    if (p > 0 && p < 100 && status === 'Uploading...') setIsResuming(true);
                });
                setUploadProgress(null);
                setUploadSpeed('');
                setUploadStatus('');
                await processFile(key);
            } catch (err: any) {
                console.error('Upload failed:', err);
                alert(`Upload failed: ${err.message || 'Check your internet and CORS settings'}`);
            } finally {
                setLoading(false);
                setUploadProgress(null);
                setUploadStatus('Uploading...');
            }
        };

        const handleOpenFile = useCallback(async () => {
            if (isTauri()) {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const selected = await open({
                  multiple: false,
                  filters: [
                      {
                          name: 'Video',
                          extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'],
                      },
                  ],
              });

              if (selected && typeof selected === 'string') {
                  await processFile(selected);
              }
            } else {
              // Web: click the hidden file input
              fileInputRef.current?.click();
            }
        }, [processFile]);

        // Drag and drop support
        useEffect(() => {
            if (!isTauri()) return;

            let unlisten: () => void;
            const setupDragDrop = async () => {
                const { listen } = await import('@tauri-apps/api/event');
                unlisten = await listen<any>('tauri://drag-drop', (e) => {
                    const payload = e.payload as { paths: string[] };
                    const paths = payload.paths;
                    if (paths && paths.length > 0) {
                        let file = paths[0];
                        file = file.replace(/^file:\/\//i, '');
                        if (navigator.userAgent.includes('Win') && file.startsWith('/')) {
                            file = file.slice(1);
                        }
                        const ext = file.split('.').pop()?.toLowerCase() || '';
                        if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
                            processFile(file);
                        }
                    }
                });
            };

            setupDragDrop();
            return () => {
                if (unlisten) unlisten();
            };
        }, [processFile]);

        return (
            <div className="video-player">
                {/* Hidden input for Web selection */}
                {!isTauri() && (
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    accept="video/*" 
                    onChange={handleWebFileChange}
                  />
                )}

                {!videoSrc ? (
                    <div className="video-placeholder" onClick={handleOpenFile}>
                        <div className="placeholder-content">
                            {loading ? (
                                <>
                                    <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                        <div className="w-full max-w-xs bg-gray-200 rounded-full h-2.5 mb-4 overflow-hidden">
                                            <div
                                                className="bg-cyan-500 h-2.5 rounded-full transition-all duration-300"
                                                style={{ width: `${uploadProgress}%` }}
                                            ></div>
                                        </div>
                                        <p className="text-gray-600 font-medium">
                                            {uploadStatus === 'Processing Video...' ? `Processing: ${uploadProgress}%` : 
                                             (isResuming ? `Resuming: ${uploadProgress}%` : `${uploadStatus}: ${uploadProgress}% ${uploadSpeed ? `(@ ${uploadSpeed})` : ''}`)}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">Don't close this tab while uploading large videos.</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    <h3>Import Game Video</h3>
                                    <p>{isTauri() ? 'Click here or drag a video file' : 'Click to upload to Cloudflare'}</p>
                                    <p className="formats">MP4 · MOV · AVI · MKV · WebM</p>
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        <video
                            ref={videoRef}
                            src={videoSrc}
                            controls
                            crossOrigin="anonymous"
                            className="video-element"
                            onPlay={() => setPlaying(true)}
                            onPause={() => setPlaying(false)}
                        />
                        <div className="video-toolbar">
                            <span className="video-name">{fileName}</span>

                            <div className="playback-controls">
                                <button
                                    className={`btn-rate ${playbackRate === 0.5 ? 'active' : ''}`}
                                    onClick={() => handleRateChange(0.5)}
                                >0.5x</button>
                                <button
                                    className={`btn-rate ${playbackRate === 1 ? 'active' : ''}`}
                                    onClick={() => handleRateChange(1)}
                                >1x</button>
                                <button
                                    className={`btn-rate ${playbackRate === 2 ? 'active' : ''}`}
                                    onClick={() => handleRateChange(2)}
                                >2x</button>
                            </div>

                            <div className="toolbar-actions">
                                <button className="btn-secondary btn-sm" onClick={handleOpenFile}>
                                    {isTauri() ? 'Change Video' : 'Upload New'}
                                </button>
                                {!isTauri() && (
                                    <button className="btn-danger btn-sm" onClick={handleDelete}>
                                        Delete
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {activeClipType && (
                    <div className={`recording-badge ${activeClipType.toLowerCase()}`}>
                        <span className="rec-dot" />
                        REC: {activeClipType}
                    </div>
                )}

                {previewRange && (
                    <div className="preview-badge">
                        <span className="preview-icon">▶</span>
                        Preview: {previewRange.start.toFixed(1)}s — {previewRange.end.toFixed(1)}s
                    </div>
                )}
            </div>
        );
    }
);

VideoPlayer.displayName = 'VideoPlayer';

