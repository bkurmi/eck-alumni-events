import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { EventPage } from './pages/EventPage';
import { AdminPage } from './pages/AdminPage';
import { IdCardPage } from './pages/IdCardPage';
import { GatePage } from './pages/GatePage';
import { FeedbackPage } from './pages/FeedbackPage';
import { AlumniDirectoryPage } from './pages/AlumniDirectoryPage';

function App() {
  return (
    <div className="min-h-screen w-full bg-[#0a0c16] text-slate-100 flex flex-col overflow-x-hidden selection:bg-amber-500 selection:text-slate-950">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/events/:slug" element={<EventPage />} />
          <Route path="/directory" element={<AlumniDirectoryPage />} />
          <Route path="/alumni" element={<AlumniDirectoryPage />} />
          <Route path="/profile" element={<AlumniDirectoryPage autoOpenProfile />} />
          <Route path="/id-card" element={<IdCardPage />} />
          <Route path="/download-pass" element={<IdCardPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/gate" element={<GatePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
