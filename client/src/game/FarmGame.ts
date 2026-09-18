import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { GameScene } from './scenes/GameScene.ts';

let existingGame: Phaser.Game | null = null;

export function createFarmGame(parentContainerId: string): Phaser.Game {
  if (existingGame) {
    return existingGame;
  }

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: parentContainerId,
    width: window.innerWidth,
    height: window.innerHeight,
    pixelArt: true,
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: [BootScene, GameScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    backgroundColor: '#1c1917',
  };

  existingGame = new Phaser.Game(config);
  return existingGame;
}
