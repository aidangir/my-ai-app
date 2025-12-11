// app/app/page.jsx
"use client";

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
    DragDropContext,
    Droppable,
    Draggable
} from '@hello-pangea/dnd';
import { BlockEditor } from '@/components/BlockEditor';

export default function AppPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    const [courses, setCourses] = useState([]);
    const [sections, setSections] = useState([]);
    const [pages, setPages] = useState([]);
    const [blocks, setBlocks] = useState([]);

    const [selectedCourseId, setSelectedCourseId] = useState(null);
    const [selectedSectionId, setSelectedSectionId] = useState(null);
    const [selectedPageId, setSelectedPageId] = useState(null);

    const isTeacherOrAdmin = profile &&
        (profile.role === 'teacher' || profile.role === 'admin');

    useEffect(() => {
        async function init() {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (!user || error) {
                router.push('/');
                return;
            }
            setUser(user);

            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            setProfile(profileData);

            // Load courses/sections/pages/blocks
            const [{ data: coursesData }, { data: sectionsData },
                { data: pagesData }, { data: blocksData }] = await Promise.all([
                supabase.from('courses').select('*').order('id'),
                supabase.from('course_sections').select('*').order('id'),
                supabase.from('pages').select('*').order('position'),
                supabase.from('blocks').select('*').order('position')
            ]);

            setCourses(coursesData || []);
            setSections(sectionsData || []);
            setPages(pagesData || []);
            setBlocks(blocksData || []);

            if (coursesData && coursesData.length > 0) {
                const firstCourseId = coursesData[0].id;
                setSelectedCourseId(firstCourseId);

                const sec = (sectionsData || []).find(
                    s => s.course_id === firstCourseId
                );
                if (sec) {
                    setSelectedSectionId(sec.id);
                    const secPages = (pagesData || []).filter(
                        p => p.section_id === sec.id
                    );
                    if (secPages.length > 0) {
                        setSelectedPageId(secPages[0].id);
                    }
                }
            }

            setLoading(false);
        }

        init();
    }, [router]);

    async function handleLogout() {
        await supabase.auth.signOut();
        router.push('/');
    }

    const visibleSections = useMemo(
        () => sections.filter(s => s.course_id === selectedCourseId),
        [sections, selectedCourseId]
    );

    const visiblePages = useMemo(
        () => pages.filter(p => p.section_id === selectedSectionId)
            .sort((a, b) => a.position - b.position),
        [pages, selectedSectionId]
    );

    const currentPage = useMemo(
        () => visiblePages.find(p => p.id === selectedPageId) || visiblePages[0],
        [visiblePages, selectedPageId]
    );

    const currentBlocks = useMemo(
        () => blocks.filter(b => b.page_id === currentPage?.id)
            .sort((a, b) => a.position - b.position),
        [blocks, currentPage]
    );

    function handlePageNav(direction) {
        if (!currentPage || visiblePages.length === 0) return;
        const idx = visiblePages.findIndex(p => p.id === currentPage.id);
        const newIdx = idx + direction;
        if (newIdx >= 0 && newIdx < visiblePages.length) {
            setSelectedPageId(visiblePages[newIdx].id);
        }
    }

    async function onDragEnd(result) {
        if (!result.destination) return;
        const { source, destination, type } = result;

        if (type === 'PAGE') {
            const items = Array.from(visiblePages);
            const [moved] = items.splice(source.index, 1);
            items.splice(destination.index, 0, moved);

            const updated = pages.map(p =>
                p.section_id === selectedSectionId
                    ? { ...p, position: items.findIndex(i => i.id === p.id) }
                    : p
            );
            setPages(updated);

            if (isTeacherOrAdmin) {
                await Promise.all(
                    items.map((p, index) =>
                        supabase
                            .from('pages')
                            .update({ position: index })
                            .eq('id', p.id)
                    )
                );
            }
        }

        if (type === 'BLOCK') {
            const items = Array.from(currentBlocks);
            const [moved] = items.splice(source.index, 1);
            items.splice(destination.index, 0, moved);

            const updated = blocks.map(b =>
                b.page_id === currentPage.id
                    ? { ...b, position: items.findIndex(i => i.id === b.id) }
                    : b
            );
            setBlocks(updated);

            if (isTeacherOrAdmin) {
                await Promise.all(
                    items.map((b, index) =>
                        supabase
                            .from('blocks')
                            .update({ position: index })
                            .eq('id', b.id)
                    )
                );
            }
        }
    }

    async function addBlock(type = 'content') {
        if (!currentPage || !isTeacherOrAdmin) return;
        const nextPos = currentBlocks.length;
        const { data, error } = await supabase
            .from('blocks')
            .insert({
                page_id: currentPage.id,
                type,
                title: type === 'content' ? 'New Block' : `New ${type} block`,
                content: type === 'content' ? 'Edit me…' : '',
                position: nextPos
            })
            .select('*')
            .single();

        if (!error && data) {
            setBlocks(prev => [...prev, data]);
        }
    }

    async function updateBlock(updatedBlock) {
        setBlocks(prev => prev.map(
            b => b.id === updatedBlock.id ? updatedBlock : b
        ));
        await supabase
            .from('blocks')
            .update({
                title: updatedBlock.title,
                content: updatedBlock.content,
                options: updatedBlock.options,
                correct_answer: updatedBlock.correct_answer,
                max_points: updatedBlock.max_points
            })
            .eq('id', updatedBlock.id);
    }

    if (loading) {
        return (
            <main className="flex items-center justify-center min-h-screen">
                <p className="text-slate-300">Loading your LMS…</p>
            </main>
        );
    }

    if (!user) return null;

    return (
        <main className="min-h-screen flex flex-col">
            {/* Top bar */}
            <header className="h-14 flex items-center justify-between px-4 bg-slate-950 border-b border-slate-800">
                <div className="flex items-center gap-4">
                    <span className="font-semibold text-lg">LMS</span>
                    <select
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
                        value={selectedCourseId || ''}
                        onChange={e => {
                            const cid = Number(e.target.value);
                            setSelectedCourseId(cid);
                            const sec = sections.find(s => s.course_id === cid);
                            if (sec) {
                                setSelectedSectionId(sec.id);
                                const secPages = pages.filter(p => p.section_id === sec.id)
                                    .sort((a, b) => a.position - b.position);
                                if (secPages[0]) setSelectedPageId(secPages[0].id);
                            }
                        }}
                    >
                        {courses.map(c => (
                            <option key={c.id} value={c.id}>
                                {c.code} – {c.title}
                            </option>
                        ))}
                    </select>

                    <select
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
                        value={selectedSectionId || ''}
                        onChange={e => {
                            const sid = Number(e.target.value);
                            setSelectedSectionId(sid);
                            const secPages = pages.filter(p => p.section_id === sid)
                                .sort((a, b) => a.position - b.position);
                            if (secPages[0]) setSelectedPageId(secPages[0].id);
                        }}
                    >
                        {visibleSections.map(s => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                        ))}
                    </select>
                </div>

                {/* Profile dropdown */}
                <div className="relative group">
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-sm">
                        <span>{profile?.full_name || user.email}</span>
                        <span className="text-xs opacity-70">({profile?.role})</span>
                        <span>▾</span>
                    </button>
                    <div className="absolute right-0 mt-1 w-40 bg-slate-900 border border-slate-700 rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition">
                        <button
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-800"
                            onClick={handleLogout}
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* Main layout */}
            <div className="flex flex-1 min-h-0">
                {/* LEFT: Pages list */}
                <DragDropContext onDragEnd={onDragEnd}>
                    <aside className="w-72 border-r border-slate-800 bg-slate-950 flex flex-col">
                        <div className="p-3 border-b border-slate-800 text-sm font-semibold">
                            Pages
                        </div>
                        <Droppable droppableId="page-list" type="PAGE">
                            {(provided) => (
                                <ul
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                    className="flex-1 overflow-y-auto"
                                >
                                    {visiblePages.map((p, index) => (
                                        <Draggable
                                            key={p.id}
                                            draggableId={`page-${p.id}`}
                                            index={index}
                                            isDragDisabled={!isTeacherOrAdmin}
                                        >
                                            {(prov, snapshot) => (
                                                <li
                                                    ref={prov.innerRef}
                                                    {...prov.draggableProps}
                                                    {...prov.dragHandleProps}
                                                    className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between ${
                                                        selectedPageId === p.id
                                                            ? 'bg-slate-800 text-white'
                                                            : 'hover:bg-slate-900'
                                                    } ${snapshot.isDragging ? 'bg-slate-700' : ''}`}
                                                    onClick={() => setSelectedPageId(p.id)}
                                                >
                                                    <span className="truncate">{p.title}</span>
                                                    {isTeacherOrAdmin && (
                                                        <span className="text-xs opacity-60">↕</span>
                                                    )}
                                                </li>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </ul>
                            )}
                        </Droppable>
                    </aside>

                    {/* RIGHT: Page content */}
                    <section className="flex-1 flex flex-col">
                        {/* Page header with left/right nav */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handlePageNav(-1)}
                                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sm"
                                >
                                    ←
                                </button>
                                <button
                                    onClick={() => handlePageNav(1)}
                                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sm"
                                >
                                    →
                                </button>
                                <h2 className="ml-3 text-lg font-semibold">
                                    {currentPage?.title || 'No page selected'}
                                </h2>
                            </div>

                            {isTeacherOrAdmin && (
                                <div className="flex items-center gap-2 text-xs">
                                    <button
                                        onClick={() => addBlock('content')}
                                        className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500"
                                    >
                                        + Text Block
                                    </button>
                                    <button
                                        onClick={() => addBlock('yes_no')}
                                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
                                    >
                                        + Yes/No
                                    </button>
                                    <button
                                        onClick={() => addBlock('mcq')}
                                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
                                    >
                                        + MCQ
                                    </button>
                                    <button
                                        onClick={() => addBlock('file_upload')}
                                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
                                    >
                                        + File Upload
                                    </button>
                                    <button
                                        onClick={() => addBlock('video')}
                                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
                                    >
                                        + Video Post
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* BLOCKS list with DnD */}
                        <Droppable droppableId="block-list" type="BLOCK">
                            {(provided) => (
                                <div
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                    className="flex-1 overflow-y-auto p-4 space-y-3"
                                >
                                    {currentBlocks.map((block, index) => (
                                        <Draggable
                                            key={block.id}
                                            draggableId={`block-${block.id}`}
                                            index={index}
                                            isDragDisabled={!isTeacherOrAdmin}
                                        >
                                            {(prov, snapshot) => (
                                                <div
                                                    ref={prov.innerRef}
                                                    {...prov.draggableProps}
                                                    className={`rounded-lg border border-slate-800 bg-slate-900 p-3 ${
                                                        snapshot.isDragging ? 'bg-slate-800' : ''
                                                    }`}
                                                >
                                                    {isTeacherOrAdmin && (
                                                        <div
                                                            {...prov.dragHandleProps}
                                                            className="text-xs mb-2 cursor-grab opacity-60"
                                                        >
                                                            ↕ Drag
                                                        </div>
                                                    )}

                                                    <BlockEditor
                                                        block={block}
                                                        isTeacher={isTeacherOrAdmin}
                                                        onChange={updateBlock}
                                                    />
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>

                        {/* Add block at bottom */}
                        {isTeacherOrAdmin && (
                            <div className="border-t border-slate-800 p-3 bg-slate-950 flex gap-2 text-sm">
                                <span className="opacity-70 mr-2">Add block:</span>
                                <button
                                    onClick={() => addBlock('content')}
                                    className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500"
                                >
                                    Text
                                </button>
                                <button
                                    onClick={() => addBlock('yes_no')}
                                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
                                >
                                    Yes/No
                                </button>
                                <button
                                    onClick={() => addBlock('mcq')}
                                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
                                >
                                    MCQ
                                </button>
                                <button
                                    onClick={() => addBlock('file_upload')}
                                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
                                >
                                    File
                                </button>
                                <button
                                    onClick={() => addBlock('video')}
                                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
                                >
                                    Video
                                </button>
                            </div>
                        )}
                    </section>
                </DragDropContext>
            </div>
        </main>
    );
}