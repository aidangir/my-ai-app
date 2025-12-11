// components/BlockEditor.jsx
"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function BlockEditor({ block, isTeacher, onChange }) {
    const [localBlock, setLocalBlock] = useState(block);
    const [saving, setSaving] = useState(false);
    const [submission, setSubmission] = useState(null);
    const [answerState, setAnswerState] = useState(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        setLocalBlock(block);
    }, [block]);

    useEffect(() => {
        async function loadSubmission() {
            // Quick & dirty: get current user submission
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase
                .from('block_submissions')
                .select('*')
                .eq('block_id', block.id)
                .eq('student_id', user.id)
                .single()
                .maybeSingle();

            setSubmission(data);
            if (data && data.answer) {
                setAnswerState(data.answer);
            }
        }
        loadSubmission();
    }, [block.id]);

    async function saveBlock() {
        setSaving(true);
        await onChange(localBlock);
        setSaving(false);
    }

    // Generic change helpers
    function updateField(key, value) {
        setLocalBlock(prev => ({ ...prev, [key]: value }));
    }

    // Student answering yes/no or MCQ
    async function submitAnswer(answer) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        let score = null;
        // auto grading for yes/no + mcq
        if (block.type === 'yes_no' && block.correct_answer?.answer) {
            score = (answer === block.correct_answer.answer) ? block.max_points : 0;
        }
        if (block.type === 'mcq' && typeof block.correct_answer?.correct_index === 'number') {
            score = (answer === block.correct_answer.correct_index)
                ? block.max_points
                : 0;
        }

        const payload = {
            block_id: block.id,
            student_id: user.id,
            answer,
            score
        };

        const { data, error } = await supabase
            .from('block_submissions')
            .upsert(payload, {
                onConflict: 'block_id,student_id'
            })
            .select('*')
            .single();

        if (!error) {
            setSubmission(data);
            setAnswerState(answer);
        }
    }

    async function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const filePath = `${block.id}/${user.id}-${Date.now()}-${file.name}`;

        const { data, error } = await supabase.storage
            .from('videos')
            .upload(filePath, file);

        if (error) {
            console.error(error);
            setUploading(false);
            return;
        }

        const publicUrl = supabase.storage
            .from('videos')
            .getPublicUrl(data.path).data.publicUrl;

        const payload = {
            block_id: block.id,
            student_id: user.id,
            video_url: publicUrl
        };

        const { data: subData, error: subError } = await supabase
            .from('block_submissions')
            .upsert(payload, { onConflict: 'block_id,student_id' })
            .select('*')
            .single();

        if (!subError) {
            setSubmission(subData);
        }
        setUploading(false);
    }

    const optionsArray = (() => {
        try {
            if (!localBlock.options) return [];
            if (Array.isArray(localBlock.options)) return localBlock.options;
            return Array.isArray(JSON.parse(localBlock.options))
                ? JSON.parse(localBlock.options)
                : [];
        } catch {
            try {
                return JSON.parse(localBlock.options);
            } catch {
                return [];
            }
        }
    })();

    // Render helpers for each type

    function renderContent() {
        if (isTeacher) {
            return (
                <>
                    <input
                        className="w-full mb-2 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm"
                        value={localBlock.title || ''}
                        onChange={e => updateField('title', e.target.value)}
                        placeholder="Block title"
                        onBlur={saveBlock}
                    />
                    <textarea
                        className="w-full min-h-[80px] px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm"
                        value={localBlock.content || ''}
                        onChange={e => updateField('content', e.target.value)}
                        placeholder="Block content"
                        onBlur={saveBlock}
                    />
                    {saving && <p className="text-xs text-slate-400 mt-1">Saving…</p>}
                </>
            );
        } else {
            return (
                <>
                    <h3 className="font-semibold mb-1">{block.title}</h3>
                    <p className="text-sm whitespace-pre-wrap">{block.content}</p>
                </>
            );
        }
    }

    function renderYesNo() {
        const labels = (block.options && block.options.labels) || {
            yes: 'Yes',
            no: 'No'
        };

        if (isTeacher) {
            return (
                <div className="space-y-2">
                    <input
                        className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm"
                        value={localBlock.title || ''}
                        onChange={e => updateField('title', e.target.value)}
                        placeholder="Question"
                        onBlur={saveBlock}
                    />
                    <textarea
                        className="w-full min-h-[40px] px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs"
                        value={localBlock.content || ''}
                        onChange={e => updateField('content', e.target.value)}
                        placeholder="Extra instructions"
                        onBlur={saveBlock}
                    />
                    <div className="flex gap-2 text-xs items-center">
                        <span>Correct answer:</span>
                        <select
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
                            value={localBlock.correct_answer?.answer || 'yes'}
                            onChange={e =>
                                updateField('correct_answer', { answer: e.target.value })
                            }
                            onBlur={saveBlock}
                        >
                            <option value="yes">{labels.yes}</option>
                            <option value="no">{labels.no}</option>
                        </select>
                        <input
                            className="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs"
                            type="number"
                            step="0.5"
                            value={localBlock.max_points || ''}
                            onChange={e =>
                                updateField('max_points', Number(e.target.value || 0))
                            }
                            placeholder="pts"
                            onBlur={saveBlock}
                        />
                    </div>
                </div>
            );
        }

        const selected = answerState;

        return (
            <div className="space-y-2">
                <h3 className="font-semibold mb-1">{block.title}</h3>
                {block.content && (
                    <p className="text-xs text-slate-400">{block.content}</p>
                )}
                <div className="flex gap-3 mt-2">
                    <button
                        onClick={() => submitAnswer('yes')}
                        className={`px-3 py-1 rounded text-sm ${
                            selected === 'yes'
                                ? 'bg-indigo-600'
                                : 'bg-slate-800 hover:bg-slate-700'
                        }`}
                    >
                        {labels.yes}
                    </button>
                    <button
                        onClick={() => submitAnswer('no')}
                        className={`px-3 py-1 rounded text-sm ${
                            selected === 'no'
                                ? 'bg-indigo-600'
                                : 'bg-slate-800 hover:bg-slate-700'
                        }`}
                    >
                        {labels.no}
                    </button>
                </div>
                {submission?.score != null && (
                    <p className="text-xs mt-1">
                        Score: {submission.score} / {block.max_points}
                    </p>
                )}
            </div>
        );
    }

    function renderMCQ() {
        const opts = optionsArray.length > 0
            ? optionsArray
            : ['Option A', 'Option B', 'Option C', 'Option D'];

        if (isTeacher) {
            function updateOption(idx, value) {
                const newOpts = [...opts];
                newOpts[idx] = value;
                updateField('options', newOpts);
            }

            return (
                <div className="space-y-2">
                    <input
                        className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm"
                        value={localBlock.title || ''}
                        onChange={e => updateField('title', e.target.value)}
                        placeholder="MCQ Question"
                        onBlur={saveBlock}
                    />
                    <textarea
                        className="w-full min-h-[40px] px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs"
                        value={localBlock.content || ''}
                        onChange={e => updateField('content', e.target.value)}
                        placeholder="Extra instructions"
                        onBlur={saveBlock}
                    />
                    <div className="space-y-1 text-xs">
                        {opts.map((option, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                <span>{idx + 1}.</span>
                                <input
                                    className="flex-1 px-2 py-1 rounded bg-slate-800 border border-slate-700"
                                    value={option}
                                    onChange={e => updateOption(idx, e.target.value)}
                                    onBlur={saveBlock}
                                />
                                <input
                                    type="radio"
                                    name={`mcq-correct-${block.id}`}
                                    checked={localBlock.correct_answer?.correct_index === idx}
                                    onChange={() =>
                                        updateField('correct_answer', { correct_index: idx })
                                    }
                                    onBlur={saveBlock}
                                />
                                <span>correct</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs">
                        <span>Points:</span>
                        <input
                            className="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700"
                            type="number"
                            step="0.5"
                            value={localBlock.max_points || ''}
                            onChange={e =>
                                updateField('max_points', Number(e.target.value || 0))
                            }
                            onBlur={saveBlock}
                        />
                    </div>
                    {saving && <p className="text-xs text-slate-400 mt-1">Saving…</p>}
                </div>
            );
        }

        const selected = typeof answerState === 'number' ? answerState : null;

        return (
            <div className="space-y-2">
                <h3 className="font-semibold mb-1">{block.title}</h3>
                {block.content && (
                    <p className="text-xs text-slate-400">{block.content}</p>
                )}
                <div className="mt-1 space-y-1 text-sm">
                    {opts.map((option, idx) => (
                        <button
                            key={idx}
                            onClick={() => submitAnswer(idx)}
                            className={`w-full text-left px-3 py-1 rounded ${
                                selected === idx
                                    ? 'bg-indigo-600'
                                    : 'bg-slate-800 hover:bg-slate-700'
                            }`}
                        >
                            {idx + 1}. {option}
                        </button>
                    ))}
                </div>
                {submission?.score != null && (
                    <p className="text-xs mt-1">
                        Score: {submission.score} / {block.max_points}
                    </p>
                )}
            </div>
        );
    }

    function renderFileUpload() {
        if (isTeacher) {
            return (
                <div className="space-y-2">
                    <input
                        className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm"
                        value={localBlock.title || ''}
                        onChange={e => updateField('title', e.target.value)}
                        placeholder="File upload title"
                        onBlur={saveBlock}
                    />
                    <textarea
                        className="w-full min-h-[40px] px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs"
                        value={localBlock.content || ''}
                        onChange={e => updateField('content', e.target.value)}
                        placeholder="Instructions for file upload"
                        onBlur={saveBlock}
                    />
                </div>
            );
        }

        return (
            <div className="space-y-2">
                <h3 className="font-semibold mb-1">{block.title}</h3>
                {block.content && (
                    <p className="text-xs text-slate-400">{block.content}</p>
                )}
                <p className="text-xs text-slate-400">File upload not wired to storage yet (you can extend this similarly to videos).</p>
            </div>
        );
    }

    function renderVideo() {
        if (isTeacher) {
            return (
                <div className="space-y-2">
                    <input
                        className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm"
                        value={localBlock.title || ''}
                        onChange={e => updateField('title', e.target.value)}
                        placeholder="Video post assignment title"
                        onBlur={saveBlock}
                    />
                    <textarea
                        className="w-full min-h-[40px] px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs"
                        value={localBlock.content || ''}
                        onChange={e => updateField('content', e.target.value)}
                        placeholder="Instructions for student video"
                        onBlur={saveBlock}
                    />
                    {submission?.video_url && (
                        <video
                            src={submission.video_url}
                            controls
                            className="mt-2 w-full rounded border border-slate-700"
                        />
                    )}
                </div>
            );
        }

        // Student view
        return (
            <div className="space-y-2">
                <h3 className="font-semibold mb-1">{block.title}</h3>
                {block.content && (
                    <p className="text-xs text-slate-400">{block.content}</p>
                )}

                {submission?.video_url ? (
                    <div className="space-y-2">
                        <p className="text-xs text-slate-400">
                            Your submitted video (click to play):
                        </p>
                        <video
                            src={submission.video_url}
                            controls
                            className="w-full max-w-md rounded border border-slate-700"
                        />
                    </div>
                ) : (
                    <div className="space-y-1 text-xs">
                        <p>Record or upload a short video:</p>
                        <input
                            type="file"
                            accept="video/*"
                            capture="user"
                            onChange={handleFileUpload}
                        />
                        {uploading && <p>Uploading…</p>}
                    </div>
                )}
            </div>
        );
    }

    let content = null;
    if (block.type === 'content') content = renderContent();
    if (block.type === 'yes_no') content = renderYesNo();
    if (block.type === 'mcq') content = renderMCQ();
    if (block.type === 'file_upload') content = renderFileUpload();
    if (block.type === 'video') content = renderVideo();

    return content;
}