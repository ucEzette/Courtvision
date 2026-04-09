import { useState } from 'react';
import { isWeb } from '../lib/platform';
import { getClips, getVideo } from '../database';
import { getDownloadUrl } from '../lib/storage-web';

interface ExportButtonProps {
    videoId: number | null;
    clipCount: number;
    disabled: boolean;
}

export function ExportButton({ videoId, clipCount, disabled }: ExportButtonProps) {
    const [exporting, setExporting] = useState(false);
    const [progress, setProgress] = useState<string>('');
    const [error, setError] = useState<string>('');

    const handleExport = async () => {
        if (!videoId || clipCount === 0) return;

        try {
            setExporting(true);
            setError('');
            setProgress('Initializing...');

            if (isWeb()) {
                const { loadFFmpeg } = await import('../lib/ffmpeg');
                const { fetchFile } = await import('@ffmpeg/util');
                
                const ffmpeg = await loadFFmpeg();
                const videoData = await getVideo(videoId);
                if (!videoData) throw new Error("Video not found");

                setProgress('Fetching video from Cloudflare...');
                const downloadUrl = await getDownloadUrl(videoData.file_path);
                const fileBlob = await fetch(downloadUrl).then(r => r.blob());
                
                setProgress('Loading video into FFmpeg...');
                await ffmpeg.writeFile('input.mp4', await fetchFile(fileBlob));

                const clips = await getClips(videoId);
                let successCount = 0;

                for (const clip of clips) {
                    const outputName = `clip-${successCount + 1}-${clip.clip_type}.mp4`;
                    setProgress(`Processing ${outputName}...`);
                    
                    // Command to cut: -ss (start), -to (end), -c copy (fast, no re-encoding)
                    await ffmpeg.exec([
                        '-i', 'input.mp4',
                        '-ss', clip.start_time.toString(),
                        '-to', clip.end_time.toString(),
                        '-c', 'copy',
                        outputName
                    ]);

                    const data = await ffmpeg.readFile(outputName);
                    const url = URL.createObjectURL(new Blob([(data as any).buffer], { type: 'video/mp4' }));
                    
                    // Trigger download
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = outputName;
                    a.click();
                    
                    successCount++;
                }

                setProgress(`✓ Exported ${successCount} clip(s) to your downloads!`);
            } else {
                // Desktop / Tauri flow
                const { open } = await import('@tauri-apps/plugin-dialog');
                const { invoke } = await import('@tauri-apps/api/core');

                const outputDir = await open({
                    directory: true,
                    multiple: false,
                    title: 'Select Export Folder',
                });

                if (!outputDir || typeof outputDir !== 'string') {
                    setExporting(false);
                    return;
                }

                setProgress('Starting desktop export...');
                const video = await getVideo(videoId);
                if (!video) throw new Error("Source video not found.");

                const clips = await getClips(videoId);
                let successCount = 0;

                for (const clip of clips) {
                    setProgress(`Exporting clip ${successCount + 1} of ${clips.length}...`);
                    await invoke('export_clip', {
                        videoPath: video.file_path,
                        clipType: clip.label || clip.clip_type,
                        startTime: clip.start_time,
                        endTime: clip.end_time,
                        fileName: video.file_name,
                        outputDir: outputDir,
                    });
                    successCount++;
                }
                setProgress(`✓ Exported ${successCount} clip(s) successfully!`);
            }

            setTimeout(() => {
                setProgress('');
                setExporting(false);
            }, 3000);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
            setExporting(false);
            setProgress('');
        }
    };

    return (
        <div className="export-section">
            <button
                className="btn-export"
                onClick={handleExport}
                disabled={disabled || exporting || !videoId || clipCount === 0}
            >
                {exporting ? (
                    <>
                        <span className="spinner" />
                        Processing...
                    </>
                ) : (
                    <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        {isWeb() ? 'Export Clips (WASM)' : 'Export Clips (MP4)'}
                    </>
                )}
            </button>

            {progress && <p className="export-progress">{progress}</p>}
            {error && <p className="export-error">{error}</p>}

            {clipCount === 0 && videoId && (
                <p className="export-hint">Create clips first using hotkeys</p>
            )}
            {isWeb() && videoId && (
                <p className="export-hint">Note: This will download the full original video once to process clips.</p>
            )}
        </div>
    );
}


