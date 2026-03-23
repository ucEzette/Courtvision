import { useState } from 'react';

interface TaggingFormProps {
    clipId: number;
    clipType: 'Offense' | 'Defense';
    currentTagCount: number;
    onSubmit: (tag: {
        player: string;
        action: string;
        result: string;
        shotType?: string;
    }) => void;
    onClose: () => void;
}

const ACTIONS = [
    'Drive',
    '2-Pointer',
    '3-Pointer',
    'Post Up',
    'Fast Break',
    'Pick & Roll',
    'Isolation',
    'Transition',
    'Free Throw',
];

const RESULTS = ['Score', 'Miss', 'Foul', 'Turnover'] as const;

const SHOT_TYPES = ['Layup', 'Mid-Range', 'Three', 'Free Throw', 'Dunk', 'Hook Shot', 'Floater'];

export function TaggingForm({ clipType, currentTagCount, onSubmit, onClose }: TaggingFormProps) {
    const [step, setStep] = useState(1);
    const [player, setPlayer] = useState('');
    const [action, setAction] = useState('');
    const [customAction, setCustomAction] = useState('');
    const [result, setResult] = useState('');
    const [shotType, setShotType] = useState('');

    const maxTags = 3;
    const canAddMore = currentTagCount < maxTags;

    const handleSubmit = () => {
        if (!player.trim() || !action || !result) return;

        onSubmit({
            player: player.trim(),
            action,
            result,
            shotType: shotType || undefined,
        });

        // Reset for next tag
        setStep(1);
        setPlayer('');
        setAction('');
        setCustomAction('');
        setResult('');
        setShotType('');
    };

    if (!canAddMore) {
        return (
            <div className="tagging-form-overlay">
                <div className="tagging-form">
                    <div className="form-header">
                        <h3>Tags Complete</h3>
                        <button className="btn-close" onClick={onClose}>✕</button>
                    </div>
                    <div className="form-body">
                        <div className="tag-limit-reached">
                            <span className="tag-count-badge">{currentTagCount}/{maxTags}</span>
                            <p>Maximum tags reached for this clip.</p>
                        </div>
                    </div>
                    <div className="form-footer">
                        <button className="btn-primary" onClick={onClose}>Done</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="tagging-form-overlay">
            <div className="tagging-form">
                <div className="form-header">
                    <div className="form-header-left">
                        <span className={`clip-type-badge ${clipType.toLowerCase()}`}>{clipType}</span>
                        <h3>Tag Clip</h3>
                    </div>
                    <div className="form-header-right">
                        <span className="tag-count-badge">{currentTagCount}/{maxTags}</span>
                        <button className="btn-close" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div className="form-body">
                    <div className="form-steps">
                        <div className={`step-indicator ${step >= 1 ? 'active' : ''}`}>1</div>
                        <div className={`step-line ${step >= 2 ? 'active' : ''}`} />
                        <div className={`step-indicator ${step >= 2 ? 'active' : ''}`}>2</div>
                        <div className={`step-line ${step >= 3 ? 'active' : ''}`} />
                        <div className={`step-indicator ${step >= 3 ? 'active' : ''}`}>3</div>
                        <div className={`step-line ${step >= 4 ? 'active' : ''}`} />
                        <div className={`step-indicator ${step >= 4 ? 'active' : ''}`}>4</div>
                    </div>

                    {/* Step 1: Player */}
                    {step >= 1 && (
                        <div className={`form-step ${step === 1 ? 'current' : 'completed'}`}>
                            <label>Player Name or Notes <span className="required">*</span></label>
                            <textarea
                                value={player}
                                onChange={(e) => setPlayer(e.target.value)}
                                placeholder="e.g. #23 or Amara Diallo (or extensive clip notes)"
                                autoFocus
                                rows={3}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey && player.trim()) {
                                        e.preventDefault();
                                        setStep(2);
                                    }
                                }}
                            />
                            {step === 1 && (
                                <button
                                    className="btn-next"
                                    disabled={!player.trim()}
                                    onClick={() => setStep(2)}
                                >
                                    Next →
                                </button>
                            )}
                        </div>
                    )}

                    {/* Step 2: Action */}
                    {step >= 2 && (
                        <div className={`form-step ${step === 2 ? 'current' : 'completed'}`}>
                            <label>Action <span className="required">*</span></label>
                            <div className="action-grid">
                                {ACTIONS.map((a) => (
                                    <button
                                        key={a}
                                        className={`action-chip ${action === a ? 'selected' : ''}`}
                                        onClick={() => {
                                            setAction(a);
                                            setCustomAction('');
                                            if (step === 2) setStep(3);
                                        }}
                                    >
                                        {a}
                                    </button>
                                ))}
                            </div>
                            {step === 2 && (
                                <div style={{ marginTop: '12px' }}>
                                    <input
                                        type="text"
                                        placeholder="Or type custom action..."
                                        value={customAction}
                                        onChange={(e) => {
                                            setCustomAction(e.target.value);
                                            setAction(e.target.value.trim());
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && customAction.trim()) {
                                                e.preventDefault();
                                                setStep(3);
                                            }
                                        }}
                                        style={{ width: '100%', padding: '10px', borderRadius: '4px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'white', outline: 'none' }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: Result */}
                    {step >= 3 && (
                        <div className={`form-step ${step === 3 ? 'current' : 'completed'}`}>
                            <label>Result <span className="required">*</span></label>
                            <div className="result-group">
                                {RESULTS.map((r) => (
                                    <button
                                        key={r}
                                        className={`result-btn ${result === r ? 'selected' : ''} ${r.toLowerCase()}`}
                                        onClick={() => {
                                            setResult(r);
                                            if (step === 3) setStep(4);
                                        }}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 4: Shot Type (Optional) */}
                    {step >= 4 && (
                        <div className={`form-step ${step === 4 ? 'current' : ''}`}>
                            <label>Shot Type <span className="optional">(optional)</span></label>
                            <div className="action-grid">
                                {SHOT_TYPES.map((s) => (
                                    <button
                                        key={s}
                                        className={`action-chip ${shotType === s ? 'selected' : ''}`}
                                        onClick={() => setShotType(shotType === s ? '' : s)}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="form-footer">
                    {step > 1 && (
                        <button className="btn-secondary" onClick={() => setStep(step - 1)}>
                            ← Back
                        </button>
                    )}
                    <div className="form-footer-right">
                        <button className="btn-ghost" onClick={onClose}>Skip</button>
                        {step === 4 && (
                            <button
                                className="btn-primary"
                                disabled={!player.trim() || !action || !result}
                                onClick={handleSubmit}
                            >
                                Save Tag
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
