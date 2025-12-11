// app/layout.jsx
import './globals.css';

export const metadata = {
    title: 'LMS App',
    description: 'Simple LMS with Supabase and Next.js',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
        <body className="min-h-screen bg-slate-900 text-slate-100">
        {children}
        </body>
        </html>
    );
}