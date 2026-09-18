import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Generate placeholder procedural textures for MVP (farm tiles, animals, butcher, altar)
    const graphics = this.make.graphics({ x: 0, y: 0 });

    // 1. Grass Tile (32x32)
    graphics.clear();
    graphics.fillStyle(0x3f6212); // Dark olive green
    graphics.fillRect(0, 0, 32, 32);
    graphics.fillStyle(0x4d7c0f);
    graphics.fillRect(2, 2, 28, 28);
    graphics.fillStyle(0x65a30d);
    graphics.fillRect(6, 6, 4, 4);
    graphics.fillRect(20, 18, 4, 4);
    graphics.generateTexture('tile_grass', 32, 32);

    // 2. Mud Pit Tile (32x32)
    graphics.clear();
    graphics.fillStyle(0x78350f);
    graphics.fillRect(0, 0, 32, 32);
    graphics.fillStyle(0x92400e);
    graphics.fillCircle(16, 16, 12);
    graphics.generateTexture('tile_mud', 32, 32);

    // 3. Creek Water Tile (32x32)
    graphics.clear();
    graphics.fillStyle(0x0369a1);
    graphics.fillRect(0, 0, 32, 32);
    graphics.fillStyle(0x0ea5e9);
    graphics.fillRect(0, 10, 32, 12);
    graphics.generateTexture('tile_water', 32, 32);

    // 4. Fence Obstacle (32x32)
    graphics.clear();
    graphics.fillStyle(0x451a03);
    graphics.fillRect(4, 10, 24, 6);
    graphics.fillRect(4, 18, 24, 6);
    graphics.fillRect(8, 2, 4, 28);
    graphics.fillRect(20, 2, 4, 28);
    graphics.generateTexture('tile_fence', 32, 32);

    // 5. Crate Obstacle (32x32)
    graphics.clear();
    graphics.fillStyle(0xb45309);
    graphics.fillRect(2, 2, 28, 28);
    graphics.fillStyle(0xd97706);
    graphics.fillRect(5, 5, 22, 22);
    graphics.lineStyle(2, 0x78350f);
    graphics.lineBetween(5, 5, 27, 27);
    graphics.lineBetween(5, 27, 27, 5);
    graphics.generateTexture('tile_crate', 32, 32);

    // 6. Altar Base (160x160)
    graphics.clear();
    graphics.fillStyle(0x18181b);
    graphics.fillCircle(80, 80, 75);
    graphics.lineStyle(4, 0xdc2626);
    graphics.strokeCircle(80, 80, 70);
    graphics.fillStyle(0x7f1d1d);
    graphics.fillCircle(80, 80, 40);
    graphics.fillStyle(0xef4444);
    graphics.fillCircle(80, 80, 16);
    graphics.generateTexture('altar_base', 160, 160);

    // Animal avatar textures (colored circles with icons)
    const animalColors: Record<string, number> = {
      chicken: 0xfef08a,
      pig: 0xf472b6,
      goat: 0xd6d3d1,
      sheep: 0xf5f5f4,
      cow: 0xfbbf24,
      horse: 0xa16207,
      duck: 0x38bdf8,
      parrot: 0x10b981,
      butcher: 0xdc2626,
    };

    for (const [animal, color] of Object.entries(animalColors)) {
      graphics.clear();
      graphics.fillStyle(0x000000, 0.4);
      graphics.fillCircle(20, 24, 16); // Shadow
      graphics.fillStyle(color);
      graphics.fillCircle(20, 18, 16); // Body
      graphics.lineStyle(2, 0x000000, 0.8);
      graphics.strokeCircle(20, 18, 16);
      // Eye
      graphics.fillStyle(0x000000);
      graphics.fillCircle(24, 14, 3);
      graphics.generateTexture(`sprite_${animal}`, 40, 40);
    }

    // Custom Butcher texture (Red square with menacing cleaver blade)
    graphics.clear();
    graphics.fillStyle(0x000000, 0.4);
    graphics.fillRect(4, 8, 32, 32); // Shadow
    graphics.fillStyle(0xdc2626); // Crimson Red Square
    graphics.fillRect(2, 4, 32, 32);
    graphics.lineStyle(2, 0x7f1d1d);
    graphics.strokeRect(2, 4, 32, 32);
    // Glowing menacing eyes
    graphics.fillStyle(0xfef08a);
    graphics.fillRect(10, 12, 5, 4);
    graphics.fillRect(21, 12, 5, 4);
    // Cleaver Blade
    graphics.fillStyle(0x94a3b8);
    graphics.fillRect(28, 2, 10, 16);
    graphics.fillStyle(0x475569);
    graphics.fillRect(26, 12, 4, 12); // Handle
    graphics.fillStyle(0xef4444); // Blood splash on blade
    graphics.fillRect(34, 10, 4, 6);
    graphics.generateTexture('sprite_butcher', 44, 44);

    // Bear Snare Trap Texture (32x32)
    graphics.clear();
    graphics.lineStyle(3, 0x71717a);
    graphics.strokeCircle(16, 16, 12);
    graphics.fillStyle(0x52525b);
    graphics.fillCircle(16, 16, 4);
    // Teeth
    graphics.fillStyle(0xa1a1aa);
    graphics.fillTriangle(6, 16, 10, 12, 10, 20);
    graphics.fillTriangle(26, 16, 22, 12, 22, 20);
    graphics.fillTriangle(16, 6, 12, 10, 20, 10);
    graphics.fillTriangle(16, 26, 12, 22, 20, 22);
    graphics.generateTexture('trap_snare', 32, 32);

    // Hound Sprite (32x32)
    graphics.clear();
    graphics.fillStyle(0x000000, 0.3);
    graphics.fillCircle(16, 20, 12);
    graphics.fillStyle(0x78350f);
    graphics.fillCircle(16, 14, 11);
    graphics.fillStyle(0xd97706);
    graphics.fillCircle(20, 12, 5); // Snout
    // Red collar
    graphics.fillStyle(0xef4444);
    graphics.fillRect(10, 18, 12, 4);
    graphics.fillStyle(0xfacc15);
    graphics.fillCircle(18, 11, 2); // Eye
    graphics.generateTexture('hound_sprite', 32, 32);

    // 7. Sector 6 Grain & Fuel Silo (64x96)
    graphics.clear();
    graphics.fillStyle(0x000000, 0.4);
    graphics.fillRect(4, 12, 56, 80);
    // Metallic cylindrical body
    graphics.fillStyle(0x3f3f46);
    graphics.fillRect(6, 14, 52, 76);
    graphics.fillStyle(0x52525b);
    graphics.fillRect(10, 14, 44, 76);
    // Dome top
    graphics.fillStyle(0x71717a);
    graphics.fillCircle(32, 18, 24);
    // Steel reinforcement bands
    graphics.fillStyle(0x27272a);
    graphics.fillRect(6, 32, 52, 4);
    graphics.fillRect(6, 52, 52, 4);
    graphics.fillRect(6, 72, 52, 4);
    // Hazard warning stripes
    graphics.fillStyle(0xfacc15);
    graphics.fillRect(14, 40, 36, 6);
    graphics.fillStyle(0x000000);
    graphics.fillRect(18, 40, 6, 6);
    graphics.fillRect(28, 40, 6, 6);
    graphics.fillRect(38, 40, 6, 6);
    graphics.generateTexture('tile_silo', 64, 96);

    // 8. Dense Bramble / Camo Brush (48x48)
    graphics.clear();
    graphics.fillStyle(0x1e3a1e, 0.7);
    graphics.fillCircle(24, 24, 22);
    graphics.fillStyle(0x14532d, 0.85);
    graphics.fillCircle(16, 20, 14);
    graphics.fillCircle(32, 22, 15);
    graphics.fillCircle(24, 30, 13);
    graphics.fillStyle(0x166534, 0.9);
    graphics.fillCircle(20, 24, 9);
    graphics.fillCircle(28, 18, 8);
    // Thorns
    graphics.lineStyle(1.5, 0x854d0e);
    graphics.lineBetween(10, 14, 14, 10);
    graphics.lineBetween(34, 28, 38, 32);
    graphics.generateTexture('tile_bramble', 48, 48);

    // 9. Agricultural Hay Bale Roll (44x44)
    graphics.clear();
    graphics.fillStyle(0x000000, 0.35);
    graphics.fillCircle(22, 26, 18);
    graphics.fillStyle(0xa16207);
    graphics.fillCircle(22, 20, 18);
    graphics.fillStyle(0xca8a04);
    graphics.fillCircle(22, 20, 14);
    graphics.fillStyle(0xeab308);
    graphics.fillCircle(22, 20, 9);
    graphics.fillStyle(0xfef08a);
    graphics.fillCircle(22, 20, 4);
    graphics.generateTexture('tile_haystack', 44, 44);

    // 10. Generator / Terminal Console (40x40)
    graphics.clear();
    graphics.fillStyle(0x000000, 0.4);
    graphics.fillRect(4, 6, 32, 32);
    graphics.fillStyle(0x1e293b);
    graphics.fillRect(2, 4, 36, 32);
    graphics.lineStyle(2, 0x334155);
    graphics.strokeRect(2, 4, 36, 32);
    // Terminal screen
    graphics.fillStyle(0x0284c7);
    graphics.fillRect(8, 8, 24, 14);
    // Terminal glowing lines
    graphics.fillStyle(0x38bdf8);
    graphics.fillRect(10, 11, 14, 2);
    graphics.fillRect(10, 15, 18, 2);
    // Status LEDs
    graphics.fillStyle(0x22c55e); // Green
    graphics.fillCircle(10, 28, 3);
    graphics.fillStyle(0xef4444); // Red
    graphics.fillCircle(20, 28, 3);
    graphics.fillStyle(0xfacc15); // Yellow
    graphics.fillCircle(30, 28, 3);
    graphics.generateTexture('tile_generator', 40, 40);

    // 11. Coiled Barbed Wire Obstacle (32x32)
    graphics.clear();
    graphics.lineStyle(2, 0x71717a);
    graphics.strokeCircle(16, 16, 12);
    graphics.strokeCircle(16, 16, 8);
    graphics.fillStyle(0xef4444);
    // Spikes
    graphics.fillCircle(16, 4, 2);
    graphics.fillCircle(16, 28, 2);
    graphics.fillCircle(4, 16, 2);
    graphics.fillCircle(28, 16, 2);
    graphics.generateTexture('tile_barbed_wire', 32, 32);

    // 12. Derelict Tractor / Scrap Combine (72x48)
    graphics.clear();
    graphics.fillStyle(0x000000, 0.4);
    graphics.fillRect(4, 12, 64, 32);
    // Tractor body (rusty orange)
    graphics.fillStyle(0x9a3412);
    graphics.fillRect(8, 10, 44, 26);
    // Engine cabin
    graphics.fillStyle(0x451a03);
    graphics.fillRect(24, 2, 28, 20);
    // Window
    graphics.fillStyle(0x38bdf8, 0.7);
    graphics.fillRect(28, 6, 18, 12);
    // Large rear tire
    graphics.fillStyle(0x18181b);
    graphics.fillCircle(20, 28, 14);
    graphics.fillStyle(0x52525b);
    graphics.fillCircle(20, 28, 6);
    // Small front tire
    graphics.fillStyle(0x18181b);
    graphics.fillCircle(58, 32, 9);
    graphics.fillStyle(0x52525b);
    graphics.fillCircle(58, 32, 4);
    graphics.generateTexture('tile_tractor', 72, 48);

    // 13. Drainage Culvert / Sewer Outlet (54x36)
    graphics.clear();
    graphics.fillStyle(0x18181b);
    graphics.fillRect(2, 4, 50, 28);
    graphics.fillStyle(0x0f172a);
    graphics.fillCircle(27, 18, 14);
    // Iron grating
    graphics.lineStyle(2, 0x475569);
    graphics.lineBetween(17, 8, 17, 28);
    graphics.lineBetween(27, 4, 27, 32);
    graphics.lineBetween(37, 8, 37, 28);
    // Toxic dripping slime
    graphics.fillStyle(0x84cc16);
    graphics.fillCircle(27, 26, 4);
    graphics.fillCircle(33, 28, 3);
    graphics.generateTexture('tile_pipe_culvert', 54, 36);

    // 14. Sector 6 Heavy Evacuation Blast Gate (120x36)
    graphics.clear();
    graphics.fillStyle(0x000000, 0.5);
    graphics.fillRect(2, 6, 116, 28);
    // Steel gate doors
    graphics.fillStyle(0x27272a);
    graphics.fillRect(4, 4, 112, 26);
    graphics.lineStyle(3, 0xd97706);
    graphics.strokeRect(4, 4, 112, 26);
    // Hazard chevron lines
    graphics.fillStyle(0xfacc15);
    for (let x = 12; x < 100; x += 20) {
      graphics.fillRect(x, 8, 10, 18);
    }
    // Warning LED
    graphics.fillStyle(0xef4444);
    graphics.fillCircle(60, 17, 6);
    graphics.generateTexture('tile_blast_gate', 120, 36);

    // 15. Sector 6 Warning Signboard (80x36)
    graphics.clear();
    graphics.fillStyle(0x18181b);
    graphics.fillRect(4, 4, 72, 28);
    graphics.lineStyle(2, 0xdc2626);
    graphics.strokeRect(4, 4, 72, 28);
    graphics.fillStyle(0xef4444);
    graphics.fillRect(8, 8, 64, 4);
    graphics.fillStyle(0xfef08a);
    graphics.fillCircle(16, 20, 4);
    graphics.generateTexture('sector6_sign', 80, 36);

    // 16. Sector 6 Relic Core (32x32)
    graphics.clear();
    graphics.fillStyle(0x8b5cf6, 0.4);
    graphics.fillCircle(16, 16, 14);
    graphics.fillStyle(0xa855f7);
    graphics.fillCircle(16, 16, 9);
    graphics.fillStyle(0xf3e8ff);
    graphics.fillCircle(16, 16, 4);
    graphics.generateTexture('item_relic', 32, 32);

    // 17. Thrall / Minion Sprite (Infection Mode) (36x36)
    graphics.clear();
    graphics.fillStyle(0x000000, 0.35);
    graphics.fillCircle(18, 22, 14);
    graphics.fillStyle(0x450a0a); // Dark rotten flesh
    graphics.fillCircle(18, 16, 14);
    graphics.lineStyle(2, 0x991b1b);
    graphics.strokeCircle(18, 16, 14);
    // Glowing red pupil
    graphics.fillStyle(0xef4444);
    graphics.fillCircle(22, 14, 3);
    graphics.generateTexture('sprite_thrall', 36, 36);

    // 18. Weather visual particles
    // Raindrop (4x16)
    graphics.clear();
    graphics.fillStyle(0x84cc16, 0.7); // Toxic acid rain drop
    graphics.fillRect(1, 0, 2, 16);
    graphics.generateTexture('fx_raindrop', 4, 16);

    // Fog cloud puff (128x128)
    graphics.clear();
    graphics.fillStyle(0x64748b, 0.22);
    graphics.fillCircle(64, 64, 60);
    graphics.fillStyle(0x94a3b8, 0.18);
    graphics.fillCircle(50, 50, 35);
    graphics.fillCircle(78, 60, 40);
    graphics.generateTexture('fx_fog_cloud', 128, 128);

    // Smoke canister cloud (48x48)
    graphics.clear();
    graphics.fillStyle(0x64748b, 0.5);
    graphics.fillCircle(24, 24, 22);
    graphics.fillStyle(0x94a3b8, 0.4);
    graphics.fillCircle(20, 20, 14);
    graphics.generateTexture('fx_smoke_cloud', 48, 48);

    // 19. Strategic Tactical Item Textures (32x32)
    // Shock Mine (Electric blue with voltage ring)
    graphics.clear();
    graphics.fillStyle(0x0284c7, 0.4);
    graphics.fillCircle(16, 16, 14);
    graphics.fillStyle(0x0f172a);
    graphics.fillCircle(16, 16, 10);
    graphics.lineStyle(2, 0x38bdf8);
    graphics.strokeCircle(16, 16, 10);
    // Center lightning bolt
    graphics.fillStyle(0x38bdf8);
    graphics.fillTriangle(16, 8, 12, 16, 17, 16);
    graphics.fillTriangle(15, 15, 20, 15, 16, 24);
    graphics.generateTexture('item_shock_mine', 32, 32);

    // Decoy Noise-Maker (Mechanical clockwork pig with yellow radio mast)
    graphics.clear();
    graphics.fillStyle(0xf59e0b, 0.3);
    graphics.fillCircle(16, 16, 14);
    graphics.fillStyle(0xf472b6);
    graphics.fillCircle(15, 17, 9);
    graphics.fillStyle(0xd97706); // Gear cog rim
    graphics.fillRect(13, 4, 4, 6); // Antenna
    graphics.fillStyle(0xfef08a);
    graphics.fillCircle(15, 4, 3); // Flashing beacon
    graphics.generateTexture('item_decoy', 32, 32);

    // Medkit / Nanite Syringe (Emerald medical green with white cross)
    graphics.clear();
    graphics.fillStyle(0x10b981, 0.3);
    graphics.fillCircle(16, 16, 14);
    graphics.fillStyle(0x065f46);
    graphics.fillRect(8, 8, 16, 16);
    graphics.lineStyle(2, 0x34d399);
    graphics.strokeRect(8, 8, 16, 16);
    // Medical Cross
    graphics.fillStyle(0xffffff);
    graphics.fillRect(14, 11, 4, 10);
    graphics.fillRect(11, 14, 10, 4);
    graphics.generateTexture('item_medkit', 32, 32);

    // Camo Cloak / Phantom Mantle (Iridescent violet shimmering veil)
    graphics.clear();
    graphics.fillStyle(0x8b5cf6, 0.35);
    graphics.fillCircle(16, 16, 14);
    graphics.fillStyle(0x4c1d95, 0.8);
    graphics.fillTriangle(16, 6, 8, 26, 24, 26);
    graphics.lineStyle(1.5, 0xc084fc);
    graphics.strokeTriangle(16, 6, 8, 26, 24, 26);
    graphics.fillStyle(0xe9d5ff);
    graphics.fillCircle(16, 16, 3);
    graphics.generateTexture('item_camo_cloak', 32, 32);

    // 20. New Strategic Obstacles & Environmental POIs
    // Electrified Sector Puddle (48x48)
    graphics.clear();
    graphics.fillStyle(0x0284c7, 0.5);
    graphics.fillCircle(24, 24, 20);
    graphics.fillStyle(0x38bdf8, 0.7);
    graphics.fillCircle(24, 24, 14);
    // Electric discharge arcs
    graphics.lineStyle(2, 0xbae6fd);
    graphics.lineBetween(14, 18, 22, 22);
    graphics.lineBetween(22, 22, 26, 14);
    graphics.lineBetween(26, 14, 34, 26);
    graphics.generateTexture('tile_puddle_electric', 48, 48);

    // Toxic Spore Bloom Pod (36x36)
    graphics.clear();
    graphics.fillStyle(0x581c87, 0.4);
    graphics.fillCircle(18, 18, 16);
    graphics.fillStyle(0x7e22ce);
    graphics.fillCircle(18, 18, 12);
    graphics.fillStyle(0xa855f7);
    graphics.fillCircle(14, 14, 5);
    graphics.fillCircle(22, 16, 4);
    graphics.fillCircle(17, 22, 5);
    // Bioluminescent toxic pimple dots
    graphics.fillStyle(0x4ade80);
    graphics.fillCircle(14, 14, 2);
    graphics.fillCircle(22, 16, 2);
    graphics.fillCircle(17, 22, 2);
    graphics.generateTexture('tile_spore_pod', 36, 36);

    // Hydraulic Chokepoint Gate (Horizontal steel barrier 96x28)
    graphics.clear();
    graphics.fillStyle(0x09090b, 0.6);
    graphics.fillRect(2, 4, 92, 24);
    graphics.fillStyle(0x27272a);
    graphics.fillRect(4, 2, 88, 24);
    graphics.lineStyle(2, 0x71717a);
    graphics.strokeRect(4, 2, 88, 24);
    // Steel teeth / rebar
    graphics.fillStyle(0xd97706);
    for (let x = 12; x <= 80; x += 16) {
      graphics.fillRect(x, 6, 8, 16);
    }
    // Danger status LED
    graphics.fillStyle(0xef4444);
    graphics.fillCircle(48, 14, 4);
    graphics.generateTexture('tile_hydraulic_gate', 96, 28);

    // Interactive Lever Switch (32x32)
    graphics.clear();
    graphics.fillStyle(0x18181b);
    graphics.fillRect(6, 6, 20, 20);
    graphics.lineStyle(2, 0x52525b);
    graphics.strokeRect(6, 6, 20, 20);
    // Lever handle
    graphics.lineStyle(3, 0xf59e0b);
    graphics.lineBetween(16, 22, 22, 10);
    graphics.fillStyle(0x22c55e);
    graphics.fillCircle(22, 10, 4); // Green knob
    graphics.generateTexture('tile_lever_switch', 32, 32);

    // 21. Juicy VFX Textures
    // Spark Star (16x16)
    graphics.clear();
    graphics.fillStyle(0xfef08a);
    graphics.fillTriangle(8, 0, 6, 8, 10, 8);
    graphics.fillTriangle(8, 16, 6, 8, 10, 8);
    graphics.fillTriangle(0, 8, 8, 6, 8, 10);
    graphics.fillTriangle(16, 8, 8, 6, 8, 10);
    graphics.generateTexture('fx_spark', 16, 16);

    // Dust Puff (16x16)
    graphics.clear();
    graphics.fillStyle(0xa8a29e, 0.45);
    graphics.fillCircle(8, 8, 6);
    graphics.fillStyle(0xd6d3d1, 0.3);
    graphics.fillCircle(6, 7, 4);
    graphics.generateTexture('fx_dust_puff', 16, 16);

    // Blood Splatter Droplet (16x16)
    graphics.clear();
    graphics.fillStyle(0xdc2626, 0.85);
    graphics.fillCircle(8, 8, 5);
    graphics.fillCircle(12, 10, 3);
    graphics.fillCircle(5, 11, 2.5);
    graphics.fillStyle(0x7f1d1d);
    graphics.fillCircle(8, 8, 2.5);
    graphics.generateTexture('fx_blood_splat', 16, 16);

    // Floating Ember Particle for Blood Moon (8x8)
    graphics.clear();
    graphics.fillStyle(0xef4444, 0.85);
    graphics.fillCircle(4, 4, 3);
    graphics.fillStyle(0xfacc15);
    graphics.fillCircle(4, 4, 1.5);
    graphics.generateTexture('fx_ember', 8, 8);

    // Floating Firefly for Twilight (8x8)
    graphics.clear();
    graphics.fillStyle(0x38bdf8, 0.7);
    graphics.fillCircle(4, 4, 3);
    graphics.fillStyle(0xfef08a);
    graphics.fillCircle(4, 4, 1.5);
    graphics.generateTexture('fx_firefly', 8, 8);

    // Toxic Spore Particle (12x12)
    graphics.clear();
    graphics.fillStyle(0xa855f7, 0.6);
    graphics.fillCircle(6, 6, 5);
    graphics.fillStyle(0x4ade80, 0.75);
    graphics.fillCircle(6, 6, 2.5);
    graphics.generateTexture('fx_spore', 12, 12);

    // Shockwave Ring (64x64)
    graphics.clear();
    graphics.lineStyle(3, 0x38bdf8, 0.85);
    graphics.strokeCircle(32, 32, 28);
    graphics.lineStyle(1.5, 0xbae6fd, 0.95);
    graphics.strokeCircle(32, 32, 22);
    graphics.generateTexture('fx_shockwave_ring', 64, 64);

    // Sound Wave Ripple Ring (48x48)
    graphics.clear();
    graphics.lineStyle(2.5, 0xfacc15, 0.9);
    graphics.strokeCircle(24, 24, 20);
    graphics.lineStyle(1.5, 0xfef08a, 0.7);
    graphics.strokeCircle(24, 24, 12);
    graphics.generateTexture('fx_sound_wave', 48, 48);

    // Emote Music Note (16x16)
    graphics.clear();
    graphics.fillStyle(0x38bdf8);
    graphics.fillCircle(5, 12, 3);
    graphics.fillRect(6, 4, 2, 8);
    graphics.fillRect(6, 4, 7, 3);
    graphics.generateTexture('fx_note', 16, 16);

    // Sweat Drop (16x16)
    graphics.clear();
    graphics.fillStyle(0x60a5fa);
    graphics.fillTriangle(8, 2, 4, 10, 12, 10);
    graphics.fillCircle(8, 11, 4);
    graphics.generateTexture('fx_sweat_drop', 16, 16);

    // Zzz Sleep bubble (16x16)
    graphics.clear();
    graphics.fillStyle(0xa78bfa);
    graphics.fillCircle(8, 8, 7);
    graphics.fillStyle(0xffffff);
    graphics.fillCircle(8, 8, 5);
    graphics.generateTexture('fx_zzz', 16, 16);
  }

  create() {
    console.log('[BootScene] Preloaded assets ready.');
    this.scene.start('GameScene');
  }
}
