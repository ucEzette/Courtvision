// ClipsList component
import { useState } from 'react';
import { ClipRecord } from '../database';

interface ClipsListProps {
    clips: ClipRecord[];
    onSeek: (time: number) => void;
    onDelete: (clipId: number) => void;
    onTagClip: (clip: ClipRecord) => void;
    onUpdateLabel: (clipId: number, label: string) => void;
}

export function ClipsList({ clips, onSeek, onDelete, onTagClip, onUpdateLabel }: ClipsListProps) {
    const [editingClipId, setEditingClipId] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const handleEditStart = (e: React.MouseEvent, clip: ClipRecord) => {
        e.stopPropagation();
        setEditingClipId(clip.id);
        setEditValue(clip.label || clip.clip_type);
    };

    const handleEditCommit = (clip: ClipRecord) => {
        setEditingClipId(null);
        if (editValue.trim() !== (clip.label || clip.clip_type)) {
            onUpdateLabel(clip.id, editValue.trim() || clip.clip_type);
        }
    };

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (clips.length === 0) {
        return (
            <div className="clips-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                    <path d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                </svg>
                <p>No clips yet</p>
                <p className="sub">Press <kbd>O</kbd> for Offense or <kbd>D</kbd> for Defense</p>
            </div>
        );
    }

    const filteredClips = clips.filter(clip => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        
        const titleMatch = (clip.label || clip.clip_type).toLowerCase().includes(q);
        
        const tagsMatch = clip.tags.some(tag => 
            tag.player.toLowerCase().includes(q) ||
            tag.action.toLowerCase().includes(q) ||
            tag.result.toLowerCase().includes(q) ||
            (tag.shot_type && tag.shot_type.toLowerCase().includes(q))
        );

        return titleMatch || tagsMatch;
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '0 15px 15px' }}>
                <input 
                    type="text" 
                    placeholder="Search tags, players, actions..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ 
                        width: '100%', 
                        padding: '10px 14px', 
                        borderRadius: '6px', 
                        background: 'var(--bg-elevated)', 
                        border: '1px solid var(--border-default)', 
                        color: 'white', 
                        outline: 'none',
                        fontSize: '14px'
                    }}
                />
            </div>
            <div className="clips-list" style={{ overflowY: 'auto', paddingBottom: '100px' }}>
                {filteredClips.map((clip) => (
                <div
                    key={clip.id}
                    className={`clip-card ${clip.clip_type.toLowerCase()}`}
                    onClick={() => onSeek(clip.start_time)}
                >
                    <div className="clip-card-header">
                        {editingClipId === clip.id ? (
                            <input
                                autoFocus
                                className="clip-label-input"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={() => handleEditCommit(clip)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleEditCommit(clip);
                                    if (e.key === 'Escape') setEditingClipId(null);
                                }}
                            />
                        ) : (
                            <span 
                                className={`clip-type-badge ${clip.clip_type.toLowerCase()}`}
                                onClick={(e) => handleEditStart(e, clip)}
                                title="Click to edit title"
                                style={{ cursor: 'text' }}
                            >
                                {clip.clip_type === 'Offense' ? '⚡' : '🛡️'} {clip.label || clip.clip_type}
                            </span>
                        )}
                        <button
                            className="btn-icon-delete"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(clip.id);
                            }}
                            title="Delete clip"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="clip-time-range">
                        <span>{formatTime(clip.start_time)}</span>
                        <span className="time-arrow">→</span>
                        <span>{formatTime(clip.end_time)}</span>
                        <span className="clip-duration">
                            ({(clip.end_time - clip.start_time).toFixed(1)}s)
                        </span>
                    </div>

                    <div className="clip-tags-row">
                        <span className="tag-count">{clip.tags.length}/3 tags</span>
                        {clip.tags.length < 3 && (
                            <button
                                className="btn-add-tag"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTagClip(clip);
                                }}
                            >
                                + Tag
                            </button>
                        )}
                    </div>

                    {clip.tags.length > 0 && (
                        <div className="clip-tag-list">
                            {clip.tags.map((tag) => (
                                <div key={tag.id} className="tag-pill">
                                    <span className="tag-player">{tag.player}</span>
                                    <span className="tag-separator">·</span>
                                    <span className="tag-action">{tag.action}</span>
                                    <span className="tag-separator">·</span>
                                    <span className={`tag-result ${tag.result.toLowerCase()}`}>{tag.result}</span>
                                    {tag.shot_type && (
                                        <>
                                            <span className="tag-separator">·</span>
                                            <span className="tag-shot">{tag.shot_type}</span>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
            {filteredClips.length === 0 && (
                <div className="clips-empty" style={{ marginTop: '20px', minHeight: '100px' }}>
                    <p style={{ opacity: 0.6 }}>No clips match search "{searchQuery}"</p>
                </div>
            )}
        </div>
        </div>
    );
}
