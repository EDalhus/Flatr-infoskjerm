import React, { Suspense, lazy, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import './index.css';

// Hver del lastes først når den trengs: en skjerm henter bare spilleren, ikke
// admin og forsiden, og starter raskere på trege smart-TV-er.
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const legal = () => import('./platform/Legal.jsx');
const authPages = () => import('./platform/AuthPages.jsx');
const Viewer = lazy(() => import('./viewer/Viewer.jsx'));
const WidgetView = lazy(() => import('./viewer/WidgetView.jsx'));
const Admin = lazy(() => import('./admin/Admin.jsx'));
const Schedule = lazy(() => import('./public/Schedule.jsx'));
const Landing = lazy(() => import('./platform/Landing.jsx'));
const AppsPage = lazy(() => import('./platform/AppsPage.jsx'));
const SuperAdmin = lazy(() => import('./platform/SuperAdmin.jsx'));
const HelpAppleTv = lazy(() => import('./platform/HelpAppleTv.jsx'));
const TvPair = lazy(() => import('./platform/TvPair.jsx'));
const Privacy = named(legal, 'Privacy');
const Terms = named(legal, 'Terms');
const Signup = named(authPages, 'Signup');
const PlatformLogin = named(authPages, 'PlatformLogin');
const PlatformAdminRedirect = named(authPages, 'PlatformAdminRedirect');
const ForgotPassword = named(authPages, 'ForgotPassword');
const ResetPassword = named(authPages, 'ResetPassword');
const InvitePage = named(authPages, 'InvitePage');

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
    { path: '/apps', element: <AppsPage /> },
    { path: '/signup', element: <Signup baseDomain={ctx.base_domain} /> },
    { path: '/login', element: <PlatformLogin baseDomain={ctx.base_domain} /> },
    { path: '/invite', element: <InvitePage platform baseDomain={ctx.base_domain} /> },
    { path: '/forgot-password', element: <ForgotPassword /> },
    { path: '/reset-password', element: <ResetPassword /> },
    { path: '/admin', element: <PlatformAdminRedirect baseDomain={ctx.base_domain} /> },
    { path: '/superadmin', element: <SuperAdmin /> },
    { path: '/personvern', element: <Privacy /> },
    { path: '/vilkar', element: <Terms /> },
    { path: '/hjelp/apple-tv', element: <HelpAppleTv /> },
    // Koble en nettleser eller Android TV til en skjerm med kode.
    { path: '/tv', element: <TvPair /> },
    { path: '*', element: <NotFound /> }
  ]);

// Kundens subdomene – eller Worker-oppsettet uten plattform (ctx = null).
const appRouter = (ctx) =>
  createBrowserRouter([
    { path: '/', element: <Navigate to="/admin" replace /> },
    { path: '/admin', element: <Admin context={ctx} /> },
    { path: '/invite', element: <InvitePage baseDomain={ctx?.base_domain} /> },
    { path: '/forgot-password', element: <ForgotPassword /> },
    { path: '/reset-password', element: <ResetPassword /> },
    { path: '/display/:screenId', element: <Viewer /> },
    { path: '/preview/:playlistId', element: <Viewer /> },
    { path: '/widget/:elementId', element: <WidgetView /> },
    { path: '/personvern', element: <Privacy /> },
    { path: '/vilkar', element: <Terms /> },
    { path: '/s', element: <Schedule /> },
    { path: '/s/:screenId', element: <Schedule /> },
    { path: '*', element: <NotFound /> }
  ]);

// Skjermvisning og offentlig program trenger ikke plattform-konteksten.
const isPublicPath = (p) =>
  p.startsWith('/display/') || p.startsWith('/preview/') || p.startsWith('/widget/') || p === '/s' || p.startsWith('/s/');
const isScreenPath = (p) => p.startsWith('/display/') || p.startsWith('/preview/') || p.startsWith('/widget/');

function App() {
  const [router, setRouter] = useState(() => {
    // Admin, innlogging og flatr.no bruker alltid det mørke «Presis»-temaet.
    if (!isPublicPath(window.location.pathname)) {
      document.documentElement.dataset.theme = 'presis';
      return null;
    }
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

  // Skjermer er svarte mens spilleren lastes, alt annet har vanlig bakgrunn.
  const blank = <div className={`h-full ${isScreenPath(window.location.pathname) ? 'bg-black' : 'bg-paper'}`} />;
  if (!router) return blank;
  return (
    <Suspense fallback={blank}>
      <RouterProvider router={router} />
    </Suspense>
  );
}

// Etter en ny versjon av Flatr finnes ikke de gamle filene lenger: en side som er
// åpen fra før, lastes inn på nytt (høyst hvert 30. sekund, så den ikke går i ring).
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (Date.now() - (Number(sessionStorage.getItem('flatr.reloadedAt')) || 0) < 30_000) return;
    sessionStorage.setItem('flatr.reloadedAt', String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

// Henvisningsprogrammet: flatr.no/?ref=<kode> huskes til registreringen.
try {
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (ref && /^[a-z0-9]{6,12}$/i.test(ref)) localStorage.setItem('flatr.ref', ref.toLowerCase());
} catch {
  /* privat modus e.l. */
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
