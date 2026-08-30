import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import './index.css';
import Viewer from './viewer/Viewer.jsx';
import Admin from './admin/Admin.jsx';
import Schedule from './public/Schedule.jsx';

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/admin" replace /> },
  { path: '/admin', element: <Admin /> },
  { path: '/display/:screenId', element: <Viewer /> },
  { path: '/s', element: <Schedule /> },
  { path: '/s/:screenId', element: <Schedule /> },
  {
    path: '*',
    element: (
      <div className="flex h-full items-center justify-center p-8 text-center text-muted">
        <div>
          <p className="text-2xl font-semibold text-ink">Siden finnes ikke</p>
          <p className="mt-2">
            Prøv <code className="rounded bg-hair px-1">/admin</code> eller{' '}
            <code className="rounded bg-hair px-1">/display/&lt;skjermId&gt;</code>
          </p>
        </div>
      </div>
    )
  }
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
