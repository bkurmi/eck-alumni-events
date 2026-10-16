import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { EventPage } from './pages/EventPage';
import { AdminPage } from './pages/AdminPage';
import { IdCardPage } from './pages/IdCardPage';
import { GatePage } from './pages/GatePage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/events/:slug" element={<EventPage />} />
        <Route path="/id-card" element={<IdCardPage />} />
        <Route path="/download-pass" element={<IdCardPage />} />
        <Route path="/gate" element={<GatePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
