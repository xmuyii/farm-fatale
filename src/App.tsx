import { useEffect } from 'react';
import { bootstrap } from '../client/src/main.ts';

export default function App() {
  useEffect(() => {
    bootstrap().catch((err) => {
      console.error('[FarmFatale] Failed to bootstrap game:', err);
    });
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-stone-900 select-none">
      <div id="game-container" className="w-full h-full" />
    </main>
  );
}
