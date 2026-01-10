import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Game } from './components/game/Game';
import { MapEditor } from './components/editor/MapEditor';
import { AssetManager } from './components/editor/AssetManager';
import { CloudSyncButton } from './components/editor/CloudSyncButton';

function Navigation() {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const linkClass = (path: string) => `
    px-4 py-2 rounded transition-colors
    ${isActive(path)
      ? 'bg-blue-600 text-white'
      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}
  `;

  return (
    <nav className="bg-gray-800 border-b border-gray-700 px-6 py-3">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold text-white mr-6">Puzzle Daily</h1>
        <Link to="/" className={linkClass('/')}>
          Play
        </Link>
        <Link to="/editor" className={linkClass('/editor')}>
          Map Editor
        </Link>
        <Link to="/assets" className={linkClass('/assets')}>
          Asset Manager
        </Link>
        <div className="flex-1" />
        <CloudSyncButton />
      </div>
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
