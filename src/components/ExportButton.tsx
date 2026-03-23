import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getClips, getVideo } from '../database';

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
            // Ask user to select purely a directory
            const outputDir = await open({
                directory: true,
                multiple: false,
                title: 'Select Export Folder',
            });

            if (!outputDir || typeof outputDir !== 'string') return;

            setExporting(true);
            setError('');
            setProgress('Starting export...');

            const video = await getVideo(videoId);
            if (!video) throw new Error("Source video not found in database.");

            const clips = await getClips(videoId);
            let successCount = 0;

            for (const clip of clips) {
                try {
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
                } catch (e) {
                    console.error("Failed to export clip ID:", clip.id, e);
                    throw new Error(`Failed on clip ${successCount + 1}: ${e}`);
                }
            }

            setProgress(`✓ Exported ${successCount} clip(s) successfully!`);
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
                        Exporting...
                    </>
                ) : (
                    <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        Export Clips (MP4)
                    </>
                )}
            </button>

            {progress && <p className="export-progress">{progress}</p>}
            {error && <p className="export-error">{error}</p>}

            {clipCount === 0 && videoId && (
                <p className="export-hint">Create clips first using hotkeys</p>
            )}
        </div>
    );
}
