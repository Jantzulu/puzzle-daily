import { useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Game } from './components/game/Game';
import { MapEditor } from './components/editor/MapEditor';
import { AssetManager } from './components/editor/AssetManager';
import { CloudSyncButton } from './components/editor/CloudSyncButton';
import { SoundSettings } from './components/shared/SoundSettings';

function Navigation() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const linkClass = (path: string) => `
    px-4 py-2 rounded transition-colors
    ${isActive(path)
      ? 'bg-blue-600 text-white'
      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}
  `;

  return (
    <nav className="bg-gray-800 border-b border-gray-700 px-4 md:px-6 py-3">
      <div className="flex items-center gap-4">
        <h1 className="text-lg md:text-xl font-bold text-white md:mr-6">Puzzle Daily</h1>

        {/* Desktop navigation */}
        <div className="hidden md:flex items-center gap-4">
          <Link to="/" className={linkClass('/')}>
            Play
          </Link>
          <Link to="/editor" className={linkClass('/editor')}>
            Map Editor
          </Link>
          <Link to="/assets" className={linkClass('/assets')}>
            Asset Manager
          </Link>
        </div>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-2">
          <SoundSettings />
          <CloudSyncButton />
        </div>

        {/* Mobile hamburger button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-gray-300 hover:text-white"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-3 pt-3 border-t border-gray-700 space-y-2">
          <Link
            to="/"
            className={`block ${linkClass('/')}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Play
          </Link>
          <Link
            to="/editor"
            className={`block ${linkClass('/editor')}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Map Editor
          </Link>
          <Link
            to="/assets"
            className={`block ${linkClass('/assets')}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Asset Manager
          </Link>
          <div className="pt-2 flex items-center gap-2">
            <SoundSettings />
            <CloudSyncButton />
          </div>
        </div>
      )}
    </nav>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-900">
        <Navigation />
        <Routes>
          <Route path="/" element={<Game />} />
          <Route path="/editor" element={<MapEditor />} />
          <Route path="/assets" element={<AssetManager />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
