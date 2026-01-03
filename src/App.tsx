import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Game } from './components/game/Game';
import { MapEditor } from './components/editor/MapEditor';
import { AssetManager } from './components/editor/AssetManager';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Game />} />
        <Route path="/editor" element={<MapEditor />} />
        <Route path="/assets" element={<AssetManager />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
