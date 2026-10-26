import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import './index.css';
import Viewer from './viewer/Viewer.jsx';
import Admin from './admin/Admin.jsx';
import Schedule from './public/Schedule.jsx';
import Landing from './platform/Landing.jsx';
import { Signup, PlatformLogin, PlatformAdminRedirect } from './platform/AuthPages.jsx';

const NotFound = () => (
  <div className="flex h-full items-center justify-center p-8 text-center text-muted">
    <div>
      <p className="text-2xl font-semibold text-ink">Siden finnes ikke</p>
      <p className="mt-2">
        Prøv <code className="rounded bg-hair px-1">/admin</code> eller{' '}
        <code className="rounded bg-hair px-1">/display/&lt;kanalId&gt;</code>
      </p>
    </div>
  </div>
);

// Hoveddomenet (flatr.no): landingsside, registrering og innlogging.
const platformRouter = (ctx) =>
  createBrowserRouter([
    { path: '/', element: <Landing /> },
    { path: '/signup', element: <Signup baseDomain={ctx.base_domain} /> },
    { path: '/login', element: <PlatformLogin /> },
    { path: '/admin', element: <PlatformAdminRedirect baseDomain={ctx.base_domain} /> },
    { path: '*', element: <NotFound /> }
  ]);

// Kundens subdomene – eller Worker-oppsettet uten plattform (ctx = null).
const appRouter = (ctx) =>
  createBrowserRouter([
    { path: '/', element: <Navigate to="/admin" replace /> },
    { path: '/admin', element: <Admin context={ctx} /> },
    { path: '/display/:screenId', element: <Viewer /> },
    { path: '/s', element: <Schedule /> },
    { path: '/s/:screenId', element: <Schedule /> },
    { path: '*', element: <NotFound /> }
  ]);

// Skjermvisning og offentlig program trenger ikke plattform-konteksten.
const isPublicPath = (p) => p.startsWith('/display/') || p === '/s' || p.startsWith('/s/');

function App() {
  const [router, setRouter] = useState(() => {
    if (!isPublicPath(window.location.pathname)) return null;
    // Skjermvisning og offentlig program skal ikke arve admin-temaet.
    delete document.documentElement.dataset.theme;
    return appRouter(null);
  });

  useEffect(() => {
    if (router) return;
    fetch('/api/context', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((ctx) => {
        // Brukerens tema gjelder bare admin; flatr.no har alltid standardutseendet.
        if (ctx?.mode === 'platform') delete document.documentElement.dataset.theme;
        setRouter(ctx?.mode === 'platform' ? platformRouter(ctx) : appRouter(ctx));
      });
  }, [router]);

  if (!router) return <div className="h-full bg-paper" />;
  return <RouterProvider router={router} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
