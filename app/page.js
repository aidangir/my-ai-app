// app/page.jsx
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('teacher1@example.com');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleLogin(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        setLoading(false);
        if (error) {
            setError(error.message);
            return;
        }
        router.push('/app');
    }

    return (
        <main className="flex items-center justify-center min-h-screen">
            <div className="bg-slate-800 p-8 rounded-xl shadow-xl w-full max-w-md">
                <h1 className="text-2xl font-bold mb-6 text-center">LMS Login</h1>
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm mb-1">Email</label>
                        <input
                            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-500"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Password</label>
                        <input
                            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-500"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2 rounded bg-indigo-600 hover:bg-indigo-500 font-semibold disabled:opacity-60"
                    >
                        {loading ? 'Logging in…' : 'Log in'}
                    </button>
                </form>
            </div>
        </main>
    );
}