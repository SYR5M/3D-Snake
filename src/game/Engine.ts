import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// Extend Window interface for diagnostic tracking
declare global {
  interface Window {
    __renderCalls?: number;
  }
}
import {
  Difficulty,
  DIFFICULTY_CONFIGS,
  GameState,
  FoodType,
  PowerUpType,
  PowerUpState,
  RunStats,
  Objective,
  ArenaId,
  SnakeTheme,
  GemShape,
  ViewMode,
  ARENAS,
} from './types';
import {
  getHighScore,
  setHighScore,
  getStats,
  updateStats,
  getUnlockedArenas,
  unlockArena,
  getSettings,
} from './Storage';
import { createSoftParticleTexture, createGlowTexture } from './Textures';
import * as Audio from './Audio';
import { Minimap } from './Minimap';

// Color themes
const THEMES: Record<SnakeTheme, { head: number; mid: number; tail: number }> = {
  mint: { head: 0x7fffe0, mid: 0xa78bfa, tail: 0xff9ee8 },
  sunset: { head: 0xffb347, mid: 0xff6b9d, tail: 0xffd700 },
  galaxy: { head: 0x87ceeb, mid: 0x6a5acd, tail: 0xdda0dd },
};

const PALETTE = {
  bg: 0x1a1033,
  floor1: 0x1f3a5f,
  floor2: 0x3a2a5a,
  floor3: 0x4a2f6b,
  wallCyan: 0x7fd6ff,
  wallViolet: 0xb48cff,
  wallPink: 0xff9ee8,
  foodNormal: 0xffd479,
  foodGolden: 0xffe9a8,
  foodShrink: 0x8ecaff,
  foodShield: 0x8affd6,
  foodSlowmo: 0xc9a8ff,
  foodMagnet: 0xffb88c,
  obstacleRim: 0xff9e8c,
  obstacleCore: 0x7a3a4a,
  ambient: 0x6a4a9a,
  keyLight: 0xffd9b0,
  rimLight: 0x7fffe0,
  sky: 0xb48cff,
  ground: 0x1f3a5f,
};

interface PathPoint {
  position: THREE.Vector3;
  distance: number;
}

interface FoodOrb {
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  light: THREE.PointLight;
  type: FoodType;
  value: number;
  pulseOffset: number;
  baseY: number;
  lifetime: number;
  spawnTime: number;
}

interface Obstacle {
  mesh: THREE.Mesh;
  aura: THREE.Sprite;
  type: 'pillar' | 'orb';
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  radius: number;
  spawnTime: number;
  spawnScale: number;
}

interface SegmentPool {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  active: boolean;
  scaleAnim: number;
  flashAnim: number;
  wobblePhase: number;
  breathPhase: number;
}

class SpatialHash {
  private cells: Map<string, number[]> = new Map();
  private cellSize: number;

  constructor(cellSize: number = 2) {
    this.cellSize = cellSize;
  }

  clear() {
    this.cells.clear();
  }

  private getKey(x: number, z: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return `${cx},${cz}`;
  }

  insert(index: number, x: number, z: number) {
    const key = this.getKey(x, z);
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key)!.push(index);
  }

  query(x: number, z: number, radius: number): number[] {
    const result: number[] = [];
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCz = Math.floor((z - radius) / this.cellSize);
    const maxCz = Math.floor((z + radius) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const cell = this.cells.get(`${cx},${cz}`);
        if (cell) result.push(...cell);
      }
    }
    return result;
  }
}

export interface GameCallbacks {
  onScoreChange: (score: number) => void;
  onHighScoreChange: (highScore: number) => void;
  onStateChange: (state: GameState) => void;
  onLengthChange: (length: number) => void;
  onNewRecord: () => void;
  onEat: (points: number, isGolden: boolean, combo: number) => void;
  onComboChange: (combo: number, multiplier: number) => void;
  onPowerUp: (type: PowerUpType | null, remaining: number) => void;
  onObjectiveProgress: (objective: Objective | null, progress: number) => void;
  onObjectiveComplete: (objective: Objective) => void;
  onNearMiss: () => void;
  onDeath: (cause: 'wall' | 'self' | 'obstacle') => void;
  onSpeedRamp: (ramp: number) => void;
  onViewChange: (view: ViewMode) => void;
}

export class SnakeGameEngine {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private clock: THREE.Clock;

  private particleTexture!: THREE.Texture;
  private glowTexture!: THREE.Texture;

  private state: GameState = 'menu';
  private difficulty: Difficulty = 'normal';
  private arena: ArenaId = 'arena1';
  private snakeTheme: SnakeTheme = 'mint';
  private gemShape: GemShape = 'star';
  private viewMode: ViewMode = 'firstPerson';
  private viewTransition: number = 0; // 0-1 for smooth transitions
  private targetViewMode: ViewMode = 'firstPerson';
  private score: number = 0;
  private highScore: number = 0;
  private runStats: RunStats = {
    foodsEaten: 0, goldenEaten: 0, maxLength: 5,
    maxCombo: 0, survivalTime: 0, powerUpsUsed: 0,
  };
  private runStartTime: number = 0;
  private gracePeriod: number = 0; // Self-collision grace period

  private comboCount: number = 0;
  private comboTimer: number = 0;
  private readonly COMBO_WINDOW = 3;
  private readonly COMBO_MULTIPLIERS = [1, 1.5, 2, 2.5, 3];

  private speedRamp: number = 0;

  private currentObjective: Objective | null = null;
  private objectiveCompleted: boolean = false;

  // Snake
  private snakeHead!: THREE.Mesh;
  private headMaterial!: THREE.MeshStandardMaterial;
  private headEyes!: THREE.Group;
  private eyeLeft!: THREE.Mesh;
  private eyeRight!: THREE.Mesh;
  private pupilLeft!: THREE.Mesh;
  private pupilRight!: THREE.Mesh;
  private gem!: THREE.Mesh;
  private gemMaterial!: THREE.MeshStandardMaterial;
  private snakeHeadLight!: THREE.PointLight;
  private shieldAura: THREE.Mesh | null = null;
  private segmentPool: SegmentPool[] = [];
  private activeSegments: number = 0;
  private readonly MAX_SEGMENTS = 300;
  private readonly SEGMENT_SPACING = 0.45;
  private readonly HEAD_RADIUS = 0.3;
  private readonly SEGMENT_RADIUS = 0.2;
  private readonly SELF_COLLISION_SKIP = 2; // Only skip neck segments
  private readonly COLLISION_SAFETY_MARGIN = 1.15; // 15% safety margin
  private readonly GRACE_DISTANCE = 1.5; // Distance-based grace period (3 segments worth)

  private pathHistory: PathPoint[] = [];
  private totalDistance: number = 0;
  private headPosition: THREE.Vector3;
  private previousHeadPosition: THREE.Vector3; // For swept collision
  private distanceTraveled: number = 0; // Distance-based grace period
  private headYaw: number = 0;
  private headTilt: number = 0;
  private currentSpeed: number = 0;
  private targetSpeed: number = 0;
  private turnInput: number = 0;
  private forwardInput: number = 0;
  private boostActive: boolean = false;
  private stamina: number = 100;
  private bobPhase: number = 0;
  private blinkTimer: number = 0;
  private headScaleAnim: number = 0;
  private excitement: number = 0; // 0-1, based on food proximity

  private activePowerUp: PowerUpState | null = null;
  private magnetActive: boolean = false;
  private slowMoActive: boolean = false;
  private shieldActive: boolean = false;

  private foods: FoodOrb[] = [];
  private readonly MAX_FOODS = 10;

  private obstacles: Obstacle[] = [];
  private obstacleSpawnTimer: number = 0;
  private readonly MAX_OBSTACLES = 8;

  private arenaRadius: number = 30;
  private arenaMeshBaseRadius: number = 30;
  private wallMesh!: THREE.Mesh;
  private wallMaterial!: THREE.ShaderMaterial;
  private floorMesh!: THREE.Mesh;
  private floorMaterial!: THREE.ShaderMaterial;

  // World details
  private stars!: THREE.Points;
  private crystals: THREE.Mesh[] = [];
  private lightPillars: THREE.Mesh[] = [];
  private lightingPhase: number = 0;

  private fireflies!: THREE.Points;
  private fireflyPositions!: Float32Array;
  private fireflyPhases!: Float32Array;
  private eatParticles!: THREE.Points;
  private eatParticlePositions!: Float32Array;
  private eatParticleLifetimes!: Float32Array;
  private eatParticleActive: boolean = false;
  private eatParticleTimer: number = 0;

  private spatialHash: SpatialHash = new SpatialHash(2);

  private vignetteFlash: number = 0;
  private cameraFov: number = 75;
  private resizeObserver: ResizeObserver | null = null;
  private targetFov: number = 75;
  private screenShake: number = 0;
  private deathSlowMo: number = 0;
  private desaturation: number = 0;

  private keys: Set<string> = new Set();
  private mouseX: number = 0;
  private isPointerLocked: boolean = false;
  private joystickActive: boolean = false;
  private joystickX: number = 0;
  private joystickY: number = 0;
  private touchJoystickId: number | null = null;
  private touchJoystickStart: { x: number; y: number } = { x: 0, y: 0 };

  private frameCount: number = 0;
  private fpsCheckTime: number = 0;
  private lowEndDevice: boolean = false;

  private callbacks: GameCallbacks;
  private animationId: number = 0;
  private destroyed = false;
  private container: HTMLElement;
  private minimap: Minimap | null = null;

  constructor(container: HTMLElement, callbacks: GameCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.clock = new THREE.Clock();
    this.headPosition = new THREE.Vector3(0, 0.4, 0);
    this.previousHeadPosition = new THREE.Vector3(0, 0.4, 0);
    this.highScore = getHighScore(this.difficulty);

    // Load settings
    const settings = getSettings();
    this.snakeTheme = settings.snakeTheme;
    this.gemShape = settings.gemShape;

    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
      this.lowEndDevice = true;
    }

    this.particleTexture = createSoftParticleTexture(64);
    this.glowTexture = createGlowTexture(128);

    this.initRenderer();
    this.initScene();
    this.initPostProcessing();
    this.initArena();
    this.initSnake();
    this.initFood();
    this.initObstacles();
    this.initWorldDetails();
    this.initFireflies();
    this.initEatParticles();
    this.initControls(); // CRITICAL FIX: Initialize controls!
    
    // Initialize minimap with error handling - add to document.body for proper positioning
    try {
      this.minimap = new Minimap(document.body);
    } catch (error) {
      console.error('Failed to initialize minimap:', error);
      this.minimap = null;
    }

    this.clock.start();
    this.fpsCheckTime = performance.now();
    this.animate();
  }

  private initRenderer() {
    // Renderer owns the main game canvas.
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.lowEndDevice,
      alpha: false,
      powerPreference: 'high-performance',
    });

    this.renderer.setPixelRatio(Math.min(Math.max(1, window.devicePixelRatio || 1), this.lowEndDevice ? 1.5 : 2));
    this.renderer.setSize(Math.max(1, this.container.clientWidth), Math.max(1, this.container.clientHeight));

    this.renderer.shadowMap.enabled = !this.lowEndDevice;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', this.onResize);
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.container);
  }

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (this.destroyed || w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(Math.max(1, window.devicePixelRatio || 1), this.lowEndDevice ? 1.5 : 2));
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  };

  private initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.bg);
    this.scene.fog = new THREE.FogExp2(PALETTE.bg, 0.025);

    this.camera = new THREE.PerspectiveCamera(
      75,
      Math.max(1, this.container.clientWidth) / Math.max(1, this.container.clientHeight),
      0.1,
      100
    );
    this.camera.position.set(0, 0.4, 0);

    const keyLight = new THREE.DirectionalLight(PALETTE.keyLight, 0.7);
    keyLight.position.set(10, 20, 10);
    keyLight.castShadow = !this.lowEndDevice;
    if (!this.lowEndDevice) {
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 50;
      keyLight.shadow.camera.left = -30;
      keyLight.shadow.camera.right = 30;
      keyLight.shadow.camera.top = 30;
      keyLight.shadow.camera.bottom = -30;
    }
    this.scene.add(keyLight);

    const ambientLight = new THREE.AmbientLight(PALETTE.ambient, 0.4);
    this.scene.add(ambientLight);

    const rimLight = new THREE.DirectionalLight(PALETTE.rimLight, 0.3);
    rimLight.position.set(-5, 2, -10);
    this.scene.add(rimLight);

    const hemiLight = new THREE.HemisphereLight(PALETTE.sky, PALETTE.ground, 0.3);
    this.scene.add(hemiLight);
  }

  private initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, this.container.clientWidth), Math.max(1, this.container.clientHeight)),
      this.lowEndDevice ? 0.3 : 0.6,
      0.5,
      0.65
    );
    this.composer.addPass(this.bloomPass);
  }

  private initArena() {
    const config = DIFFICULTY_CONFIGS[this.difficulty];
    this.arenaRadius = config.arenaRadius;
    this.arenaMeshBaseRadius = this.arenaRadius;

    const floorGeo = new THREE.CircleGeometry(this.arenaRadius, 64);
    this.floorMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color(PALETTE.floor1) },
        uColor2: { value: new THREE.Color(PALETTE.floor2) },
        uColor3: { value: new THREE.Color(PALETTE.floor3) },
        uRadius: { value: this.arenaRadius },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPos;
        void main() {
          vUv = uv;
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        uniform float uRadius;
        varying vec2 vUv;
        varying vec3 vPos;

        float caustic(vec2 p, float t) {
          return sin(p.x * 3.0 + t) * sin(p.y * 3.0 + t * 0.7) * 0.5 + 0.5;
        }

        void main() {
          float dist = length(vPos.xy) / uRadius;
          vec3 baseColor = mix(uColor1, uColor2, dist);
          baseColor = mix(baseColor, uColor3, dist * dist);

          float c = caustic(vPos.xy * 0.3, uTime * 0.3);
          c += caustic(vPos.xy * 0.5 + 10.0, uTime * 0.2) * 0.5;
          c = c * 0.08;

          vec3 finalColor = baseColor + vec3(c * 0.3, c * 0.5, c * 0.8);
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
    this.floorMesh = new THREE.Mesh(floorGeo, this.floorMaterial);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.receiveShadow = true;
    this.scene.add(this.floorMesh);

    const wallGeo = new THREE.CylinderGeometry(this.arenaRadius, this.arenaRadius, 6, 64, 20, true);
    this.wallMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color(PALETTE.wallCyan) },
        uColor2: { value: new THREE.Color(PALETTE.wallViolet) },
        uColor3: { value: new THREE.Color(PALETTE.wallPink) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPos;
        uniform float uTime;
        void main() {
          vUv = uv;
          vec3 pos = position;
          pos.x += sin(pos.y * 2.0 + uTime) * 0.2;
          pos.z += cos(pos.y * 2.0 + uTime * 0.7) * 0.2;
          vPos = pos;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        varying vec2 vUv;
        varying vec3 vPos;

        void main() {
          float t = vUv.y;
          vec3 color = mix(uColor1, uColor2, t);
          color = mix(color, uColor3, t * t);

          float glow = 0.15 + sin(uTime * 0.5) * 0.05;
          float ribbon = sin(vUv.x * 20.0 + uTime * 0.3) * 0.5 + 0.5;
          ribbon = pow(ribbon, 3.0);

          float alpha = glow * (0.3 + ribbon * 0.4);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.wallMesh = new THREE.Mesh(wallGeo, this.wallMaterial);
    this.wallMesh.position.y = 3;
    this.scene.add(this.wallMesh);
  }

  private initSnake() {
    const theme = THEMES[this.snakeTheme];

    // Head - teardrop shape
    const headGeo = new THREE.SphereGeometry(this.HEAD_RADIUS, 24, 24);
    const positions = headGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      const z = positions.getZ(i);
      if (z > 0) {
        positions.setZ(i, z * 1.2); // Elongate forward
      }
      if (y > 0) {
        positions.setY(i, y * 0.85); // Flatten top
      }
    }
    headGeo.computeVertexNormals();

    this.headMaterial = new THREE.MeshStandardMaterial({
      color: theme.head,
      emissive: theme.head,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.3,
    });
    this.snakeHead = new THREE.Mesh(headGeo, this.headMaterial);
    this.snakeHead.castShadow = true;
    this.snakeHead.position.copy(this.headPosition);
    this.scene.add(this.snakeHead);

    // Eyes
    this.headEyes = new THREE.Group();
    const eyeGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.5,
    });
    this.eyeLeft = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeLeft.position.set(-0.12, 0.05, 0.22);
    this.eyeRight = new THREE.Mesh(eyeGeo, eyeMat.clone());
    this.eyeRight.position.set(0.12, 0.05, 0.22);

    // Pupils
    const pupilGeo = new THREE.SphereGeometry(0.04, 12, 12);
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a1033 });
    this.pupilLeft = new THREE.Mesh(pupilGeo, pupilMat);
    this.pupilLeft.position.set(0, 0, 0.05);
    this.pupilRight = new THREE.Mesh(pupilGeo, pupilMat.clone());
    this.pupilRight.position.set(0, 0, 0.05);

    this.eyeLeft.add(this.pupilLeft);
    this.eyeRight.add(this.pupilRight);
    this.headEyes.add(this.eyeLeft);
    this.headEyes.add(this.eyeRight);
    this.snakeHead.add(this.headEyes);

    // Gem on head
    const gemGeo = this.gemShape === 'star'
      ? new THREE.OctahedronGeometry(0.08, 0)
      : this.gemShape === 'gem'
        ? new THREE.OctahedronGeometry(0.1, 1)
        : new THREE.TorusGeometry(0.08, 0.02, 8, 16);
    this.gemMaterial = new THREE.MeshStandardMaterial({
      color: theme.head,
      emissive: theme.head,
      emissiveIntensity: 1.0,
      roughness: 0.1,
      metalness: 0.8,
    });
    this.gem = new THREE.Mesh(gemGeo, this.gemMaterial);
    this.gem.position.set(0, 0.25, 0);
    this.snakeHead.add(this.gem);

    this.snakeHeadLight = new THREE.PointLight(theme.head, 2, 8);
    this.snakeHeadLight.position.copy(this.headPosition);
    this.scene.add(this.snakeHeadLight);

    const shieldGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: PALETTE.foodShield,
      emissive: PALETTE.foodShield,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.shieldAura = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldAura.visible = false;
    this.scene.add(this.shieldAura);

    // Segment pool with graduated sizes
    this.segmentPool = [];
    for (let i = 0; i < this.MAX_SEGMENTS; i++) {
      const baseSize = 0.25;
      const sizeReduction = (i / this.MAX_SEGMENTS) * 0.3; // 30% reduction
      const size = baseSize * (1 - sizeReduction);
      const geo = new THREE.SphereGeometry(Math.max(size, 0.1), 16, 16);
      const t = i / 50;
      const color = new THREE.Color().lerpColors(
        new THREE.Color(theme.head),
        new THREE.Color(theme.tail),
        Math.min(t, 1)
      );
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.3,
        roughness: 0.3,
        metalness: 0.2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.visible = false;
      // CRITICAL FIX: Disable frustum culling so segments render even when behind camera
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.segmentPool.push({
        mesh, material: mat, active: false,
        scaleAnim: 0, flashAnim: 0,
        wobblePhase: Math.random() * Math.PI * 2,
        breathPhase: Math.random() * Math.PI * 2,
      });
    }

    if (!this.segmentPool || this.segmentPool.length !== this.MAX_SEGMENTS) {
      console.error('Segment pool initialization failed');
      return;
    }

    this.activeSegments = 0;
    for (let i = 0; i < 5; i++) {
      this.activateSegment(i);
    }

    this.pathHistory = [];
    for (let i = 19; i >= 0; i--) {
      const dist = -i * this.SEGMENT_SPACING;
      const pos = new THREE.Vector3(0, 0.4, i * this.SEGMENT_SPACING);
      this.pathHistory.push({ position: pos, distance: dist });
    }
    this.totalDistance = 0;
  }

  private activateSegment(index: number) {
    if (index >= this.MAX_SEGMENTS || index < 0) return;
    if (!this.segmentPool || !this.segmentPool[index]) return;
    const seg = this.segmentPool[index];
    if (!seg || !seg.mesh || !seg.material) return;

    seg.active = true;
    seg.mesh.visible = true;
    seg.scaleAnim = 0;
    seg.flashAnim = 1;
    this.activeSegments++;

    // CRITICAL FIX: Set initial position from path history
    const targetDist = (index + 1) * this.SEGMENT_SPACING;
    const targetTotalDist = this.totalDistance - targetDist;
    let pos = this.headPosition.clone();
    if (this.pathHistory.length > 0) {
      for (let j = this.pathHistory.length - 1; j >= 0; j--) {
        if (this.pathHistory[j].distance <= targetTotalDist) {
          pos = this.pathHistory[j].position.clone();
          break;
        }
      }
    }
    seg.mesh.position.copy(pos);

    const theme = THEMES[this.snakeTheme];
    const t = index / 50;
    const color = new THREE.Color().lerpColors(
      new THREE.Color(theme.head),
      new THREE.Color(theme.tail),
      Math.min(t, 1)
    );
    seg.material.color.copy(color);
    seg.material.emissive.copy(color);
  }

  private deactivateSegment(index: number) {
    if (index >= this.MAX_SEGMENTS || index < 0) return;
    if (!this.segmentPool || !this.segmentPool[index]) return;
    const seg = this.segmentPool[index];
    if (!seg || !seg.mesh) return;

    seg.active = false;
    seg.mesh.visible = false;
    if (this.activeSegments > 0) this.activeSegments--;
  }

  private initFood() {
    this.spawnFoods();
  }

  private spawnFoods() {
    this.foods.forEach(f => {
      this.scene.remove(f.mesh);
      this.scene.remove(f.glow);
      this.scene.remove(f.light);
      f.mesh.geometry.dispose();
      (f.mesh.material as THREE.Material).dispose();
      (f.glow.material as THREE.Material).dispose();
    });
    this.foods = [];

    const config = DIFFICULTY_CONFIGS[this.difficulty];
    for (let i = 0; i < config.foodCount; i++) {
      this.spawnOneFood();
    }
  }

  private spawnOneFood() {
    if (this.foods.length >= this.MAX_FOODS) return;

    const rand = Math.random();
    let type: FoodType;
    let value: number;
    let lifetime: number;

    if (rand < 0.08) { type = 'golden'; value = 50; lifetime = 12; }
    else if (rand < 0.10) { type = 'shrink'; value = 5; lifetime = -1; }
    else if (rand < 0.15) { type = 'shield'; value = 10; lifetime = -1; }
    else if (rand < 0.20) { type = 'slowmo'; value = 10; lifetime = -1; }
    else if (rand < 0.25) { type = 'magnet'; value = 10; lifetime = -1; }
    else { type = 'normal'; value = 10; lifetime = -1; }

    const color = this.getFoodColor(type);
    const geo = new THREE.SphereGeometry(0.3, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.6,
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Reject spawn points overlapping the snake, existing rewards or obstacles.
    let x = 0, z = 0;
    let found = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * Math.max(1, this.arenaRadius - 3);
      const px = Math.cos(angle) * dist;
      const pz = Math.sin(angle) * dist;
      const overlapsReward = this.foods.some(f => Math.hypot(f.mesh.position.x - px, f.mesh.position.z - pz) < 1.6);
      const overlapsObstacle = this.obstacles.some(o => Math.hypot(o.mesh.position.x - px, o.mesh.position.z - pz) < o.radius + 1);
      if (!this.isPositionNearSnake(px, pz, 2) && !overlapsReward && !overlapsObstacle) {
        x = px; z = pz; found = true; break;
      }
    }
    if (!found) { geo.dispose(); mat.dispose(); return; }

    const y = 0.5;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);

    const glowMat = new THREE.SpriteMaterial({
      map: this.glowTexture,
      color: color,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(1.5, 1.5, 1);
    glow.position.copy(mesh.position);
    this.scene.add(glow);

    const light = new THREE.PointLight(color, 1.5, 4);
    light.position.copy(mesh.position);
    this.scene.add(light);

    this.foods.push({
      mesh, glow, light, type, value,
      pulseOffset: Math.random() * Math.PI * 2,
      baseY: y, lifetime,
      spawnTime: this.clock.getElapsedTime(),
    });
  }

  private getFoodColor(type: FoodType): number {
    switch (type) {
      case 'normal': return PALETTE.foodNormal;
      case 'golden': return PALETTE.foodGolden;
      case 'shrink': return PALETTE.foodShrink;
      case 'shield': return PALETTE.foodShield;
      case 'slowmo': return PALETTE.foodSlowmo;
      case 'magnet': return PALETTE.foodMagnet;
    }
  }

  private initObstacles() {
    this.obstacles = [];
    this.obstacleSpawnTimer = 0;
  }

  private spawnObstacle() {
    if (this.obstacles.length >= this.MAX_OBSTACLES) return;

    const type = Math.random() < 0.7 ? 'pillar' : 'orb';
    const radius = type === 'pillar' ? 0.8 : 0.5;

    const geo = new THREE.SphereGeometry(radius, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: PALETTE.obstacleCore,
      emissive: PALETTE.obstacleRim,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);

    let x: number, z: number;
    let attempts = 0;
    do {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * (this.arenaRadius - 5) + 4;
      x = Math.cos(angle) * dist;
      z = Math.sin(angle) * dist;
      attempts++;
    } while (attempts < 20 && this.isPositionNearSnake(x, z, 4));

    const pos = new THREE.Vector3(x, 0.5, z);
    mesh.position.copy(pos);
    mesh.scale.set(0, 0, 0);
    this.scene.add(mesh);

    const auraMat = new THREE.SpriteMaterial({
      map: this.glowTexture,
      color: PALETTE.obstacleRim,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });
    const aura = new THREE.Sprite(auraMat);
    aura.scale.set(2, 2, 1);
    aura.position.copy(pos);
    this.scene.add(aura);

    const velocity = type === 'orb'
      ? new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)
      : undefined;

    this.obstacles.push({
      mesh, aura, type, position: pos, velocity, radius,
      spawnTime: this.clock.getElapsedTime(), spawnScale: 0,
    });
  }

  private initWorldDetails() {
    if (this.lowEndDevice) return;

    // Stars
    const starCount = 200;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = this.arenaRadius + 10 + Math.random() * 20;
      starPositions[i * 3] = Math.cos(angle) * dist;
      starPositions[i * 3 + 1] = 5 + Math.random() * 15;
      starPositions[i * 3 + 2] = Math.sin(angle) * dist;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      map: this.particleTexture,
      color: 0xffffff,
      size: 0.2,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(starGeo, starMat);
    this.scene.add(this.stars);

    // Floating crystals
    const crystalCount = 6;
    for (let i = 0; i < crystalCount; i++) {
      const angle = (i / crystalCount) * Math.PI * 2;
      const dist = this.arenaRadius * 0.7;
      const geo = new THREE.OctahedronGeometry(0.5, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: PALETTE.wallViolet,
        emissive: PALETTE.wallViolet,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.6,
      });
      const crystal = new THREE.Mesh(geo, mat);
      crystal.position.set(
        Math.cos(angle) * dist,
        3 + Math.random() * 2,
        Math.sin(angle) * dist
      );
      crystal.rotation.set(Math.random(), Math.random(), Math.random());
      this.scene.add(crystal);
      this.crystals.push(crystal);
    }

    // Light pillars at corners
    const pillarCount = 4;
    for (let i = 0; i < pillarCount; i++) {
      const angle = (i / pillarCount) * Math.PI * 2 + Math.PI / 4;
      const dist = this.arenaRadius - 2;
      const geo = new THREE.CylinderGeometry(0.1, 0.1, 8, 8);
      const mat = new THREE.MeshStandardMaterial({
        color: PALETTE.wallCyan,
        emissive: PALETTE.wallCyan,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.4,
      });
      const pillar = new THREE.Mesh(geo, mat);
      pillar.position.set(Math.cos(angle) * dist, 4, Math.sin(angle) * dist);
      this.scene.add(pillar);
      this.lightPillars.push(pillar);
    }
  }

  private initFireflies() {
    const count = this.lowEndDevice ? 150 : 300;
    const geo = new THREE.BufferGeometry();
    this.fireflyPositions = new Float32Array(count * 3);
    this.fireflyPhases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * this.arenaRadius;
      this.fireflyPositions[i * 3] = Math.cos(angle) * dist;
      this.fireflyPositions[i * 3 + 1] = Math.random() * 4 + 0.5;
      this.fireflyPositions[i * 3 + 2] = Math.sin(angle) * dist;
      this.fireflyPhases[i] = Math.random() * Math.PI * 2;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(this.fireflyPositions, 3));

    const mat = new THREE.PointsMaterial({
      map: this.particleTexture,
      color: 0xb48cff,
      size: 0.15,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.fireflies = new THREE.Points(geo, mat);
    this.scene.add(this.fireflies);
  }

  private initEatParticles() {
    const count = 40;
    const geo = new THREE.BufferGeometry();
    this.eatParticlePositions = new Float32Array(count * 3);
    this.eatParticleLifetimes = new Float32Array(count);

    geo.setAttribute('position', new THREE.BufferAttribute(this.eatParticlePositions, 3));

    const mat = new THREE.PointsMaterial({
      map: this.particleTexture,
      color: 0xffd479,
      size: 0.2,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.eatParticles = new THREE.Points(geo, mat);
    this.eatParticles.visible = false;
    this.scene.add(this.eatParticles);
  }

  private initControls() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.renderer.domElement.addEventListener('click', this.onCanvasClick);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.renderer.domElement.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.renderer.domElement.addEventListener('touchend', this.onTouchEnd);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.state === 'playing' && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, textarea, select, [contenteditable="true"]')) return;
    if (this.state === 'playing') this.keys.add(e.key.toLowerCase());
    if (e.repeat && [' ', 'Escape', 'r', 'v', 'n'].includes(e.key.toLowerCase())) return;
    if (e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    }
    if (e.key.toLowerCase() === 'r') {
      if (this.state !== 'menu') this.restart();
    }
    if (e.key.toLowerCase() === 'v') {
      if (this.state === 'playing' || this.state === 'paused') {
        this.cycleViewMode();
      }
    }
    if (e.key.toLowerCase() === 'n') {
      if (this.minimap) {
        this.minimap.toggle();
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  private onBlur = () => { this.keys.clear(); if (this.state === 'playing') this.pause(); };
  private onCanvasClick = () => {
    if (this.state === 'playing' && !this.isPointerLocked) {
      this.renderer.domElement.requestPointerLock?.();
    }
  };
  private onPointerLockChange = () => {
    this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (this.isPointerLocked && this.state === 'playing') {
      this.mouseX += e.movementX * 0.002;
    }
  };
  private onTouchStart = (e: TouchEvent) => {
    if (this.state !== 'playing') return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX < window.innerWidth / 2 && this.touchJoystickId === null) {
        this.touchJoystickId = touch.identifier;
        this.touchJoystickStart = { x: touch.clientX, y: touch.clientY };
        this.joystickActive = true;
        e.preventDefault();
      }
    }
  };
  private onTouchMove = (e: TouchEvent) => {
    if (this.state !== 'playing') return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.touchJoystickId) {
        const dx = touch.clientX - this.touchJoystickStart.x;
        const dy = touch.clientY - this.touchJoystickStart.y;
        this.joystickX = Math.max(-1, Math.min(1, dx / 50));
        this.joystickY = Math.max(-1, Math.min(1, -dy / 50));
        e.preventDefault();
      }
    }
  };
  private onTouchEnd = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.touchJoystickId) {
        this.touchJoystickId = null;
        this.joystickActive = false;
        this.joystickX = 0;
        this.joystickY = 0;
      }
    }
  };

  setDifficulty(diff: Difficulty) {
    this.difficulty = diff;
    this.highScore = getHighScore(diff);
    this.callbacks.onHighScoreChange(this.highScore);
  }

  setArena(a: ArenaId) { this.arena = a; }

  setSnakeTheme(theme: SnakeTheme) {
    this.snakeTheme = theme;
    // Update colors
    const colors = THEMES[theme];
    this.headMaterial.color.setHex(colors.head);
    this.headMaterial.emissive.setHex(colors.head);
    this.snakeHeadLight.color.setHex(colors.head);
    this.gemMaterial.color.setHex(colors.head);
    this.gemMaterial.emissive.setHex(colors.head);
    // Update segments
    for (let i = 0; i < this.activeSegments; i++) {
      const seg = this.segmentPool[i];
      const t = i / 50;
      const color = new THREE.Color().lerpColors(
        new THREE.Color(colors.head),
        new THREE.Color(colors.tail),
        Math.min(t, 1)
      );
      seg.material.color.copy(color);
      seg.material.emissive.copy(color);
    }
  }

  setGemShape(shape: GemShape) {
    this.gemShape = shape;
    // Recreate gem
    this.snakeHead.remove(this.gem);
    this.gem.geometry.dispose();
    const gemGeo = shape === 'star'
      ? new THREE.OctahedronGeometry(0.08, 0)
      : shape === 'gem'
        ? new THREE.OctahedronGeometry(0.1, 1)
        : new THREE.TorusGeometry(0.08, 0.02, 8, 16);
    this.gem = new THREE.Mesh(gemGeo, this.gemMaterial);
    this.gem.position.set(0, 0.25, 0);
    this.snakeHead.add(this.gem);
  }

  setViewMode(view: ViewMode) {
    this.targetViewMode = view;
    this.viewTransition = 0;
    this.viewMode = view;
    this.callbacks.onViewChange(view);
  }

  cycleViewMode() {
    const views: ViewMode[] = ['firstPerson', 'chase', 'shoulder', 'topDown'];
    const currentIndex = views.indexOf(this.viewMode);
    const nextIndex = (currentIndex + 1) % views.length;
    this.setViewMode(views[nextIndex]);
  }

  getViewMode(): ViewMode {
    return this.viewMode;
  }

  private updateMinimap(dt: number) {
    if (!this.minimap) return;
    
    // Collect body positions
    const bodyPositions: THREE.Vector3[] = [];
    for (let i = 0; i < this.activeSegments; i++) {
      if (this.segmentPool[i] && this.segmentPool[i].mesh) {
        bodyPositions.push(this.segmentPool[i].mesh.position.clone());
      }
    }
    
    // Collect items
    const items: Array<{position: THREE.Vector3, type: 'food' | 'golden' | 'powerup' | 'poison' | 'obstacle' | 'movingObstacle', color: string, icon?: string}> = [];
    
    // Add food items
    for (const food of this.foods) {
      const type = food.type === 'golden' ? 'golden' : 'food';
      const color = this.getFoodColorHex(food.type);
      items.push({
        position: food.mesh.position.clone(),
        type,
        color,
      });
    }
    
    // Add obstacles
    for (const obs of this.obstacles) {
      const type = obs.type === 'orb' ? 'movingObstacle' : 'obstacle';
      items.push({
        position: obs.mesh.position.clone(),
        type,
        color: '#ff9e8c',
      });
    }
    
    // Check if dangerous (HP < 30 or poison nearby)
    // TODO: Implement HP system
    const isDangerous = false;
    
    // Update minimap
    this.minimap.updateGameState(
      this.headPosition,
      this.headYaw,
      bodyPositions,
      items,
      this.arenaRadius,
      isDangerous
    );
    
    this.minimap.update(dt);
  }

  private getFoodColorHex(type: string): string {
    const colors: Record<string, string> = {
      'normal': '#ffd479',
      'golden': '#ffe9a8',
      'shrink': '#8ecaff',
      'shield': '#8affd6',
      'slowmo': '#c9a8ff',
      'magnet': '#ffb88c',
    };
    return colors[type] || '#ffd479';
  }

  getDifficulty(): Difficulty { return this.difficulty; }

  startGame() {
    Audio.initAudio();
    this.resetGame();
    this.state = 'playing';
    this.minimap?.setGameplayActive(true);
    this.callbacks.onStateChange('playing');
    this.targetSpeed = DIFFICULTY_CONFIGS[this.difficulty].speed;
    this.runStartTime = this.clock.getElapsedTime();
    this.gracePeriod = 0.5; // 0.5s grace period
  }

  pause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.keys.clear();
      this.minimap?.setGameplayActive(false);
      this.callbacks.onStateChange('paused');
      if (this.isPointerLocked) document.exitPointerLock();
    }
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.callbacks.onStateChange('playing');
    }
  }

  restart() {
    this.resetGame();
    this.state = 'playing';
    this.minimap?.setGameplayActive(true);
    this.callbacks.onStateChange('playing');
    this.targetSpeed = DIFFICULTY_CONFIGS[this.difficulty].speed;
    this.runStartTime = this.clock.getElapsedTime();
    this.gracePeriod = 0.5;
  }

  goToMenu() {
    this.state = 'menu';
    this.keys.clear();
    this.minimap?.setGameplayActive(false);
    this.callbacks.onStateChange('menu');
    if (this.isPointerLocked) document.exitPointerLock();
    this.resetGame();
  }

  private resetGame() {
    const config = DIFFICULTY_CONFIGS[this.difficulty];
    this.arenaRadius = config.arenaRadius;
    // Keep rendered arena, physics and minimap on the same difficulty radius.
    this.floorMesh.scale.setScalar(this.arenaRadius / this.arenaMeshBaseRadius);
    this.wallMesh.scale.set(this.arenaRadius / this.arenaMeshBaseRadius, 1, this.arenaRadius / this.arenaMeshBaseRadius);
    this.floorMaterial.uniforms.uRadius.value = this.arenaMeshBaseRadius;
    this.score = 0;
    this.totalDistance = 0;
    this.headYaw = 0;
    this.headTilt = 0;
    this.mouseX = 0;
    this.currentSpeed = 0;
    this.targetSpeed = config.speed;
    this.stamina = 100;
    this.boostActive = false;
    this.vignetteFlash = 0;
    this.screenShake = 0;
    this.deathSlowMo = 0;
    this.desaturation = 0;
    this.speedRamp = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.activePowerUp = null;
    this.magnetActive = false;
    this.slowMoActive = false;
    this.shieldActive = false;
    this.cameraFov = 75;
    this.targetFov = 75;
    this.camera.fov = 75;
    this.camera.updateProjectionMatrix();
    this.excitement = 0;

    this.runStats = {
      foodsEaten: 0, goldenEaten: 0, maxLength: 5,
      maxCombo: 0, survivalTime: 0, powerUpsUsed: 0,
    };
    this.currentObjective = null;
    this.objectiveCompleted = false;

    this.headPosition.set(0, 0.4, 0);
    this.previousHeadPosition.set(0, 0.4, 0);
    this.distanceTraveled = 0;
    
    this.pathHistory = [];
    for (let i = 19; i >= 0; i--) {
      const dist = -i * this.SEGMENT_SPACING;
      const pos = new THREE.Vector3(0, 0.4, i * this.SEGMENT_SPACING);
      this.pathHistory.push({ position: pos, distance: dist });
    }
    this.totalDistance = 0;

    if (this.segmentPool && this.segmentPool.length === this.MAX_SEGMENTS) {
      for (let i = 0; i < this.MAX_SEGMENTS; i++) this.deactivateSegment(i);
      for (let i = 0; i < 5; i++) this.activateSegment(i);
    }

    this.obstacles.forEach(o => {
      this.scene.remove(o.mesh);
      this.scene.remove(o.aura);
      o.mesh.geometry.dispose();
      (o.mesh.material as THREE.Material).dispose();
    });
    this.obstacles = [];
    this.obstacleSpawnTimer = 0;

    this.spawnFoods();

    this.callbacks.onScoreChange(0);
    this.callbacks.onLengthChange(5);
    this.callbacks.onComboChange(0, 1);
    this.callbacks.onPowerUp(null, 0);
    this.callbacks.onObjectiveProgress(null, 0);
    this.callbacks.onSpeedRamp(0);
    this.highScore = getHighScore(this.difficulty);
    this.callbacks.onHighScoreChange(this.highScore);
  }

  private processInput(dt: number) {
    const config = DIFFICULTY_CONFIGS[this.difficulty];
    let turnInput = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) turnInput -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) turnInput += 1;
    if (this.isPointerLocked) {
      turnInput += this.mouseX * 5;
      this.mouseX = 0;
    }
    if (this.joystickActive) turnInput += this.joystickX * 2;

    const maxTurn = config.turnRate * dt;
    this.turnInput = Math.max(-1, Math.min(1, turnInput));
    this.headYaw -= this.turnInput * maxTurn;
    this.headTilt += (-this.turnInput * 0.05 - this.headTilt) * 5 * dt;

    let forwardInput = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) forwardInput += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) forwardInput -= 0.3;
    if (this.joystickActive) forwardInput = Math.max(forwardInput, this.joystickY);
    this.forwardInput = Math.max(0.5, forwardInput);

    if (this.keys.has('shift') && this.stamina > 0) {
      this.boostActive = true;
      this.stamina = Math.max(0, this.stamina - 30 * dt);
    } else {
      this.boostActive = false;
      this.stamina = Math.min(100, this.stamina + 10 * dt);
    }
  }

  private updateSnake(dt: number) {
    const config = DIFFICULTY_CONFIGS[this.difficulty];
    const rampedSpeed = config.speed * (1 + this.speedRamp);
    let targetSpeed = rampedSpeed * this.forwardInput;
    if (this.boostActive) targetSpeed *= 1.4;
    if (this.slowMoActive) targetSpeed *= 0.6;
    this.currentSpeed += (targetSpeed - this.currentSpeed) * 3 * dt;

    // Store previous position for swept collision
    this.previousHeadPosition.copy(this.headPosition);

    const forward = new THREE.Vector3(Math.sin(this.headYaw), 0, Math.cos(this.headYaw));
    const movement = forward.multiplyScalar(this.currentSpeed * Math.min(dt, 0.05));
    this.headPosition.add(movement);
    this.distanceTraveled += movement.length();
    this.headPosition.y = 0.4;

    this.bobPhase += this.currentSpeed * dt * 2;
    this.headPosition.y += Math.sin(this.bobPhase) * 0.03;

    if (this.pathHistory.length > 0) {
      const lastPoint = this.pathHistory[this.pathHistory.length - 1];
      const dist = this.headPosition.distanceTo(lastPoint.position);
      if (dist > 0.05) {
        this.totalDistance += dist;
        this.pathHistory.push({ position: this.headPosition.clone(), distance: this.totalDistance });
        const maxPathLength = this.activeSegments * 1.0 + 5;
        while (this.pathHistory.length > 2 && this.totalDistance - this.pathHistory[0].distance > maxPathLength) {
          this.pathHistory.shift();
        }
      }
    }

    this.snakeHead.position.copy(this.headPosition);
    this.snakeHead.rotation.y = -this.headYaw;
    this.snakeHead.rotation.z = this.headTilt;
    this.snakeHeadLight.position.copy(this.headPosition);

    if (this.headScaleAnim > 0) {
      this.headScaleAnim -= dt * 4;
      const scale = 1 + Math.sin(this.headScaleAnim * Math.PI) * 0.15;
      this.snakeHead.scale.setScalar(scale);
    } else {
      this.snakeHead.scale.setScalar(1);
    }

    // Blink
    this.blinkTimer += dt;
    if (this.blinkTimer > 3 + Math.random() * 3) {
      this.blinkTimer = 0;
      this.eyeLeft.scale.y = 0.1;
      this.eyeRight.scale.y = 0.1;
      setTimeout(() => {
        if (this.eyeLeft) this.eyeLeft.scale.y = 1;
        if (this.eyeRight) this.eyeRight.scale.y = 1;
      }, 100);
    }

    // Gem rotation
    this.gem.rotation.y += dt * 2;

    // Excitement based on food proximity
    let minFoodDist = Infinity;
    for (const food of this.foods) {
      const dist = this.headPosition.distanceTo(food.mesh.position);
      if (dist < minFoodDist) minFoodDist = dist;
    }
    this.excitement = Math.max(0, 1 - minFoodDist / 3);

    // Eye scale based on excitement
    const eyeScale = 1 + this.excitement * 0.1;
    this.eyeLeft.scale.x = eyeScale;
    this.eyeRight.scale.x = eyeScale;

    // Update body
    if (this.segmentPool) {
      for (let i = 0; i < this.activeSegments; i++) {
        if (!this.segmentPool[i] || !this.segmentPool[i].mesh) continue;
        const seg = this.segmentPool[i];
        const targetDist = (i + 1) * this.SEGMENT_SPACING;
        const targetTotalDist = this.totalDistance - targetDist;

        let pos = this.headPosition.clone();
        if (this.pathHistory.length > 0) {
          pos = this.pathHistory[0].position.clone();
          for (let j = this.pathHistory.length - 1; j >= 0; j--) {
            if (this.pathHistory[j].distance <= targetTotalDist) {
              if (j < this.pathHistory.length - 1) {
                const p1 = this.pathHistory[j];
                const p2 = this.pathHistory[j + 1];
                const t = (targetTotalDist - p1.distance) / (p2.distance - p1.distance + 0.001);
                pos.lerpVectors(p1.position, p2.position, Math.min(1, Math.max(0, t)));
              } else {
                pos = this.pathHistory[j].position.clone();
              }
              break;
            }
          }
        }

        // CRITICAL FIX: Direct position assignment instead of lerp
        // lerp(0.5) caused segments to lag behind and disappear
        seg.mesh.position.copy(pos);
        seg.mesh.position.y = 0.3 - i * 0.01;

        seg.wobblePhase += dt * 3;
        const wobble = Math.sin(seg.wobblePhase) * 0.02;
        seg.mesh.position.x += wobble;

        // Breathing
        seg.breathPhase += dt * 2;
        const breath = 1 + Math.sin(seg.breathPhase) * 0.03;

        if (seg.scaleAnim < 1) {
          seg.scaleAnim += dt * 5;
          seg.mesh.scale.setScalar(Math.min(1, seg.scaleAnim) * breath);
        } else {
          seg.mesh.scale.setScalar(breath);
        }

        if (seg.flashAnim > 0) {
          seg.flashAnim -= dt * 4;
          seg.material.emissiveIntensity = 0.3 + seg.flashAnim * 0.7;
        }

        const tailFadeStart = this.activeSegments - 5;
        if (i > tailFadeStart) {
          const fade = 1 - (i - tailFadeStart) / 5;
          seg.mesh.scale.multiplyScalar(fade);
          seg.material.opacity = fade;
          seg.material.transparent = true;
        }
      }
    }

    // Distance-based grace period (more reliable than time-based)
    const graceActive = this.distanceTraveled < this.GRACE_DISTANCE;

    // Wall collision
    const distFromCenter = Math.sqrt(this.headPosition.x ** 2 + this.headPosition.z ** 2);
    if (distFromCenter > this.arenaRadius - 0.5) {
      this.gameOver('wall');
      return;
    }

    // Self collision with swept collision (prevents tunneling at high speeds)
    if (!graceActive && this.activeSegments > this.SELF_COLLISION_SKIP && this.segmentPool) {
      // Swept collision: check if head path intersects any segment
      const collisionRadius = (this.HEAD_RADIUS + this.SEGMENT_RADIUS) * this.COLLISION_SAFETY_MARGIN;
      
      for (let i = this.SELF_COLLISION_SKIP; i < this.activeSegments; i++) {
        if (!this.segmentPool[i] || !this.segmentPool[i].mesh) continue;
        const seg = this.segmentPool[i];
        
        // Swept collision: distance from segment to line segment (prev -> current head pos)
        const dist = this.distanceFromPointToLineSegment(
          seg.mesh.position,
          this.previousHeadPosition,
          this.headPosition
        );
        
        if (dist < collisionRadius) {
          if (this.shieldActive) {
            this.shieldActive = false;
            this.activePowerUp = null;
            this.callbacks.onPowerUp(null, 0);
            this.screenShake = 0.3;
          } else {
            this.gameOver('self');
            return;
          }
        }
      }
    }

    // Obstacle collision
    for (const obs of this.obstacles) {
      if (obs.spawnScale < 0.9) continue;
      const dist = this.headPosition.distanceTo(obs.position);
      if (dist < this.HEAD_RADIUS + obs.radius) {
        if (this.shieldActive) {
          this.shieldActive = false;
          this.activePowerUp = null;
          this.callbacks.onPowerUp(null, 0);
          this.screenShake = 0.3;
        } else {
          this.gameOver('obstacle');
          return;
        }
      }
    }

    if (this.segmentPool) {
      for (let i = this.SELF_COLLISION_SKIP; i < this.activeSegments; i++) {
        if (!this.segmentPool[i] || !this.segmentPool[i].mesh) continue;
        const seg = this.segmentPool[i];
        const dist = this.headPosition.distanceTo(seg.mesh.position);
        if (dist < 0.8 && dist > 0.5) {
          this.callbacks.onNearMiss();
          Audio.playNearMiss();
          break;
        }
      }
    }
  }

  private updateFood(dt: number, time: number) {
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const food = this.foods[i];
      if (!food || !food.mesh || !food.light) continue;

      if (food.lifetime > 0 && time - food.spawnTime > food.lifetime) {
        this.scene.remove(food.mesh);
        this.scene.remove(food.glow);
        this.scene.remove(food.light);
        food.mesh.geometry.dispose();
        (food.mesh.material as THREE.Material).dispose();
        (food.glow.material as THREE.Material).dispose();
        this.foods.splice(i, 1);
        this.spawnOneFood();
        continue;
      }

      if (this.magnetActive) {
        const toHead = new THREE.Vector3().subVectors(this.headPosition, food.mesh.position);
        const dist = toHead.length();
        if (dist < 4 && dist > 0.5) {
          toHead.normalize().multiplyScalar(dt * 3);
          food.mesh.position.add(toHead);
          food.glow.position.copy(food.mesh.position);
          food.light.position.copy(food.mesh.position);
        }
      }

      const pulse = 0.95 + Math.sin(time * 2 + food.pulseOffset) * 0.05;
      food.mesh.scale.setScalar(pulse);
      food.mesh.position.y = food.baseY + Math.sin(time * 1.5 + food.pulseOffset) * 0.1;
      food.mesh.rotation.y += dt * 1.5;
      food.glow.position.copy(food.mesh.position);
      food.light.position.copy(food.mesh.position);
      food.light.intensity = 1.5 + Math.sin(time * 3 + food.pulseOffset) * 0.3;

      const dist = this.headPosition.distanceTo(food.mesh.position);
      if (dist < 0.8) {
        this.eatFood(food);
      }
    }
  }

  private eatFood(food: FoodOrb) {
    const config = DIFFICULTY_CONFIGS[this.difficulty];
    const basePoints = food.value;
    const comboMultiplier = this.COMBO_MULTIPLIERS[Math.min(this.comboCount, this.COMBO_MULTIPLIERS.length - 1)];
    const points = Math.round(basePoints * config.scoreMultiplier * comboMultiplier);

    this.score += points;
    this.callbacks.onScoreChange(this.score);

    this.comboCount++;
    this.comboTimer = this.COMBO_WINDOW;
    this.runStats.maxCombo = Math.max(this.runStats.maxCombo, this.comboCount);
    this.callbacks.onComboChange(this.comboCount, comboMultiplier);

    this.runStats.foodsEaten++;
    if (food.type === 'golden') this.runStats.goldenEaten++;

    switch (food.type) {
      case 'normal': this.growSnake(1); break;
      case 'golden': this.growSnake(2); break;
      case 'shrink': this.shrinkSnake(3); break;
      case 'shield': this.activatePowerUp('shield', 8); break;
      case 'slowmo': this.activatePowerUp('slowmo', 4); break;
      case 'magnet': this.activatePowerUp('magnet', 6); break;
    }

    const isNewRecord = setHighScore(this.difficulty, this.score);
    if (isNewRecord) {
      this.highScore = this.score;
      this.callbacks.onHighScoreChange(this.highScore);
      this.callbacks.onNewRecord();
      Audio.playNewRecord();
    }

    this.triggerEatEffect(food.mesh.position.clone(), this.comboCount);
    this.headMaterial.emissiveIntensity = 2.0;
    this.headScaleAnim = 1;
    this.vignetteFlash = 0.2;
    this.targetFov = 77;
    this.screenShake = 0.05;
    
    // Trigger minimap eat pulse
    if (this.minimap) {
      this.minimap.triggerEatPulse();
    }

    Audio.playEat(this.comboCount);

    this.scene.remove(food.mesh);
    this.scene.remove(food.glow);
    this.scene.remove(food.light);
    food.mesh.geometry.dispose();
    (food.mesh.material as THREE.Material).dispose();
    (food.glow.material as THREE.Material).dispose();

    const idx = this.foods.indexOf(food);
    if (idx > -1) this.foods.splice(idx, 1);
    this.spawnOneFood();

    this.callbacks.onEat(points, food.type === 'golden', this.comboCount);
    this.checkObjective();
  }

  private growSnake(count: number) {
    for (let i = 0; i < count; i++) {
      if (this.activeSegments < this.MAX_SEGMENTS) {
        this.activateSegment(this.activeSegments);
      }
    }
    this.runStats.maxLength = Math.max(this.runStats.maxLength, this.activeSegments + 1);
    this.callbacks.onLengthChange(this.activeSegments + 1);
    this.speedRamp = Math.min(0.6, (this.activeSegments / 3) * 0.02);
    this.callbacks.onSpeedRamp(this.speedRamp);
  }

  private shrinkSnake(count: number) {
    for (let i = 0; i < count; i++) {
      if (this.activeSegments > 5) {
        this.deactivateSegment(this.activeSegments - 1);
      }
    }
    this.speedRamp = Math.min(0.6, (this.activeSegments / 3) * 0.02);
    this.callbacks.onSpeedRamp(this.speedRamp);
    this.callbacks.onLengthChange(this.activeSegments + 1);
  }

  private activatePowerUp(type: PowerUpType, duration: number) {
    // Only one timed power-up can be active; switching must remove old effects.
    this.shieldActive = false;
    this.slowMoActive = false;
    this.magnetActive = false;
    this.activePowerUp = { type, remaining: duration };
    this.runStats.powerUpsUsed++;
    switch (type) {
      case 'shield': this.shieldActive = true; break;
      case 'slowmo': this.slowMoActive = true; break;
      case 'magnet': this.magnetActive = true; break;
    }
    this.callbacks.onPowerUp(type, duration);
    Audio.playPowerUp();
  }

  private updatePowerUps(dt: number) {
    if (this.activePowerUp) {
      this.activePowerUp.remaining -= dt;
      if (this.activePowerUp.remaining <= 0) {
        this.activePowerUp = null;
        this.shieldActive = false;
        this.slowMoActive = false;
        this.magnetActive = false;
        this.callbacks.onPowerUp(null, 0);
      } else {
        this.callbacks.onPowerUp(this.activePowerUp.type, this.activePowerUp.remaining);
      }
    }

    if (this.shieldAura) {
      if (this.shieldActive) {
        this.shieldAura.visible = true;
        this.shieldAura.position.copy(this.headPosition);
        (this.shieldAura.material as THREE.MeshStandardMaterial).opacity = 0.3 + Math.sin(this.clock.getElapsedTime() * 5) * 0.1;
      } else {
        this.shieldAura.visible = false;
      }
    }
  }

  private updateObstacles(dt: number, time: number) {
    const config = DIFFICULTY_CONFIGS[this.difficulty];
    this.obstacleSpawnTimer += dt;
    const spawnInterval = 60 / config.obstacleRate;
    if (this.obstacleSpawnTimer > spawnInterval && this.obstacles.length < this.MAX_OBSTACLES) {
      this.obstacleSpawnTimer = 0;
      this.spawnObstacle();
    }

    for (const obs of this.obstacles) {
      if (obs.spawnScale < 1) {
        obs.spawnScale += dt * 2;
        obs.mesh.scale.setScalar(Math.min(1, obs.spawnScale));
      }

      if (obs.velocity && obs.type === 'orb') {
        obs.position.add(obs.velocity.clone().multiplyScalar(dt));
        const dist = Math.sqrt(obs.position.x ** 2 + obs.position.z ** 2);
        if (dist > this.arenaRadius - obs.radius) {
          const angle = Math.atan2(obs.position.z, obs.position.x);
          obs.velocity.x = -Math.cos(angle) * 2;
          obs.velocity.z = -Math.sin(angle) * 2;
        }
        obs.mesh.position.copy(obs.position);
        obs.aura.position.copy(obs.position);
      }

      obs.mesh.rotation.y += dt * 2;

      const distToHead = this.headPosition.distanceTo(obs.position);
      if (distToHead < 3) {
        const pulse = 1 + Math.sin(time * 8) * 0.3;
        obs.aura.scale.setScalar(2 * pulse);
        (obs.aura.material as THREE.SpriteMaterial).opacity = 0.5;
      } else {
        obs.aura.scale.setScalar(2);
        (obs.aura.material as THREE.SpriteMaterial).opacity = 0.3;
      }
    }
  }

  private updateCombo(dt: number) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.callbacks.onComboChange(0, 1);
        Audio.playComboBreak();
      }
    }
  }

  private checkObjective() {
    if (!this.currentObjective || this.objectiveCompleted) return;
    const progress = this.currentObjective.progress(this.runStats);
    this.callbacks.onObjectiveProgress(this.currentObjective, progress);

    if (this.currentObjective.check(this.runStats)) {
      this.objectiveCompleted = true;
      this.score += this.currentObjective.reward;
      this.callbacks.onScoreChange(this.score);
      this.callbacks.onObjectiveComplete(this.currentObjective);
    }
  }

  private triggerEatEffect(pos: THREE.Vector3, combo: number) {
    if (!this.eatParticles || !this.eatParticlePositions || !this.eatParticleLifetimes) return;
    this.eatParticleActive = true;
    this.eatParticleTimer = 0;

    const count = Math.min(30 + combo * 5, 50);
    for (let i = 0; i < count; i++) {
      this.eatParticlePositions[i * 3] = pos.x;
      this.eatParticlePositions[i * 3 + 1] = pos.y;
      this.eatParticlePositions[i * 3 + 2] = pos.z;
      this.eatParticleLifetimes[i] = Math.random() * 0.5 + 0.3;
    }

    this.eatParticles.visible = true;
    (this.eatParticles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private gameOver(cause: 'wall' | 'self' | 'obstacle') {
    this.state = 'gameover';
    this.callbacks.onStateChange('gameover');
    this.callbacks.onDeath(cause);

    this.vignetteFlash = 0.8;
    this.deathSlowMo = 0.4;
    this.desaturation = 0.3;
    this.screenShake = 0.3;

    if (this.isPointerLocked) document.exitPointerLock();
    Audio.playDeath();

    const stats = getStats();
    updateStats({
      totalFoods: stats.totalFoods + this.runStats.foodsEaten,
      longestSnake: Math.max(stats.longestSnake, this.runStats.maxLength),
      bestCombo: Math.max(stats.bestCombo, this.runStats.maxCombo),
      totalRuns: stats.totalRuns + 1,
      totalTimePlayed: stats.totalTimePlayed + this.runStats.survivalTime,
      totalScore: stats.totalScore + this.score,
    });

    const totalScore = stats.totalScore + this.score;
    ARENAS.forEach((a) => {
      if (totalScore >= a.unlockScore) unlockArena(a.id);
    });
  }

  private updateCamera() {
    if (this.state === 'menu') return;
    if (!this.camera || !this.headPosition) return;

    // Update FOV based on view mode
    const targetFov = this.viewMode === 'firstPerson' ? 85 : 70;
    this.targetFov += (targetFov - this.targetFov) * 0.05;
    this.cameraFov += (this.targetFov - this.cameraFov) * 0.1;
    if (Math.abs(this.cameraFov - this.camera.fov) > 0.05) {
      this.camera.fov = this.cameraFov;
      this.camera.updateProjectionMatrix();
    }

    // Screen shake
    let shakeX = 0, shakeY = 0;
    if (this.screenShake > 0) {
      shakeX = (Math.random() - 0.5) * this.screenShake * 0.02;
      shakeY = (Math.random() - 0.5) * this.screenShake * 0.02;
      this.screenShake *= 0.9;
      if (this.screenShake < 0.01) this.screenShake = 0;
    }

    // Calculate forward direction based on headYaw
    const forward = new THREE.Vector3(
      Math.sin(this.headYaw),
      0,
      Math.cos(this.headYaw)
    );

    // Camera position based on view mode
    let cameraPos = new THREE.Vector3();
    let lookTarget = new THREE.Vector3();

    switch (this.viewMode) {
      case 'firstPerson':
        // First-person: at head, slightly above and forward
        const eyeOffset = new THREE.Vector3(0, 0.35, 0);
        const forwardOffset = forward.clone().multiplyScalar(0.15);
        cameraPos.copy(this.headPosition).add(eyeOffset).add(forwardOffset);
        lookTarget.copy(this.headPosition)
          .add(forward.clone().multiplyScalar(10))
          .add(new THREE.Vector3(0, -0.5, 0));
        
        // Head bob (only in first-person)
        if (this.currentSpeed > 0.1) {
          const bobT = this.clock.getElapsedTime() * 6;
          const bobAmplitude = Math.min(this.currentSpeed / 10, 1) * 0.02;
          cameraPos.y += Math.sin(bobT) * bobAmplitude;
        }
        break;

      case 'chase':
        // Chase camera: 3.5 units behind, 2.2 above
        const backOffset = forward.clone().multiplyScalar(-3.5);
        cameraPos.copy(this.headPosition).add(backOffset).add(new THREE.Vector3(0, 2.2, 0));
        lookTarget.copy(this.headPosition).add(new THREE.Vector3(0, 0.5, 0));
        break;

      case 'shoulder':
        // Shoulder camera: 1.5 units behind, 1.2 above
        const shoulderBack = forward.clone().multiplyScalar(-1.5);
        cameraPos.copy(this.headPosition).add(shoulderBack).add(new THREE.Vector3(0, 1.2, 0));
        lookTarget.copy(this.headPosition).add(forward.clone().multiplyScalar(5));
        
        // Lighter head bob for shoulder view
        if (this.currentSpeed > 0.1) {
          const bobT = this.clock.getElapsedTime() * 6;
          const bobAmplitude = Math.min(this.currentSpeed / 10, 1) * 0.01;
          cameraPos.y += Math.sin(bobT) * bobAmplitude;
        }
        break;

      case 'topDown':
        // Top-down: 8 units above, looking straight down
        cameraPos.copy(this.headPosition).add(new THREE.Vector3(0, 8, 0));
        lookTarget.copy(this.headPosition);
        break;
    }

    // Apply screen shake
    cameraPos.x += shakeX;
    cameraPos.y += shakeY;

    // Smooth camera transition
    this.camera.position.lerp(cameraPos, 0.1);
    
    // Smooth look-at transition
    const currentLookAt = new THREE.Vector3();
    this.camera.getWorldDirection(currentLookAt);
    const targetDirection = lookTarget.clone().sub(this.camera.position).normalize();
    currentLookAt.lerp(targetDirection, 0.1);
    this.camera.lookAt(this.camera.position.clone().add(currentLookAt));

    // Set near/far planes based on view mode
    const nearPlane = this.viewMode === 'firstPerson' ? 0.05 : 0.1;
    if (Math.abs(this.camera.near - nearPlane) > 0.01 || this.camera.far !== 500) {
      this.camera.near = nearPlane;
      this.camera.far = 500;
      this.camera.updateProjectionMatrix();
    }
  }

  private updateFireflies(dt: number, time: number) {
    if (!this.fireflies || !this.fireflyPositions) return;
    const count = this.fireflyPositions.length / 3;
    for (let i = 0; i < count; i++) {
      this.fireflyPositions[i * 3] += Math.sin(time + this.fireflyPhases[i]) * dt * 0.2;
      this.fireflyPositions[i * 3 + 1] += dt * 0.1;
      this.fireflyPositions[i * 3 + 2] += Math.cos(time + this.fireflyPhases[i]) * dt * 0.2;

      const x = this.fireflyPositions[i * 3];
      const z = this.fireflyPositions[i * 3 + 2];
      const dist = Math.sqrt(x * x + z * z);
      if (dist > this.arenaRadius) {
        const angle = Math.random() * Math.PI * 2;
        const newDist = Math.random() * this.arenaRadius * 0.5;
        this.fireflyPositions[i * 3] = Math.cos(angle) * newDist;
        this.fireflyPositions[i * 3 + 2] = Math.sin(angle) * newDist;
      }
      if (this.fireflyPositions[i * 3 + 1] > 5) {
        this.fireflyPositions[i * 3 + 1] = 0.5;
      }
    }
    (this.fireflies.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateEatParticles(dt: number) {
    if (!this.eatParticleActive) return;
    if (!this.eatParticles || !this.eatParticlePositions) return;

    this.eatParticleTimer += dt;
    let allDead = true;
    for (let i = 0; i < 40; i++) {
      this.eatParticleLifetimes[i] -= dt;
      if (this.eatParticleLifetimes[i] > 0) {
        allDead = false;
        const angle1 = (i / 40) * Math.PI * 2;
        const speed = 3 * (1 - this.eatParticleTimer);
        this.eatParticlePositions[i * 3] += Math.cos(angle1) * speed * dt;
        this.eatParticlePositions[i * 3 + 1] += speed * dt;
        this.eatParticlePositions[i * 3 + 2] += Math.sin(angle1) * speed * dt;
      }
    }
    (this.eatParticles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    if (allDead || this.eatParticleTimer > 1) {
      this.eatParticleActive = false;
      this.eatParticles.visible = false;
    }
  }

  private updateWorldDetails(dt: number, time: number) {
    if (this.lowEndDevice) return;

    // Crystals rotation
    for (const crystal of this.crystals) {
      crystal.rotation.x += dt * 0.3;
      crystal.rotation.y += dt * 0.5;
      crystal.position.y += Math.sin(time + crystal.position.x) * dt * 0.1;
    }

    // Light pillars pulse
    for (let i = 0; i < this.lightPillars.length; i++) {
      const pillar = this.lightPillars[i];
      const mat = pillar.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.3 + Math.sin(time * 2 + i) * 0.1;
    }

    // Dynamic lighting shift
    this.lightingPhase += dt * 0.05; // Slow cycle
    const lightShift = Math.sin(this.lightingPhase) * 0.1;
    this.scene.background = new THREE.Color(PALETTE.bg).offsetHSL(lightShift, 0, 0);
  }

  private updateEffects(dt: number, time: number) {
    if (this.wallMaterial) {
      this.wallMaterial.uniforms.uTime.value = time;
    }
    if (this.floorMaterial) {
      this.floorMaterial.uniforms.uTime.value = time;
    }

    if (this.headMaterial) {
      this.headMaterial.emissiveIntensity += (0.6 - this.headMaterial.emissiveIntensity) * 3 * dt;
    }

    this.vignetteFlash = Math.max(0, this.vignetteFlash - dt * 2);
    this.desaturation = Math.max(0, this.desaturation - dt);

    if (this.deathSlowMo > 0) this.deathSlowMo -= dt;
  }

  private isPositionNearSnake(x: number, z: number, minDist: number): boolean {
    const dx = x - this.headPosition.x;
    const dz = z - this.headPosition.z;
    if (Math.sqrt(dx * dx + dz * dz) < minDist) return true;
    if (!this.segmentPool) return false;
    for (let i = 0; i < this.activeSegments; i++) {
      if (!this.segmentPool[i] || !this.segmentPool[i].mesh) continue;
      const seg = this.segmentPool[i];
      const sdx = x - seg.mesh.position.x;
      const sdz = z - seg.mesh.position.z;
      if (Math.sqrt(sdx * sdx + sdz * sdz) < minDist) return true;
    }
    return false;
  }

  // Swept collision helper: distance from point to line segment
  private distanceFromPointToLineSegment(
    point: THREE.Vector3,
    lineStart: THREE.Vector3,
    lineEnd: THREE.Vector3
  ): number {
    const lineDir = new THREE.Vector3().subVectors(lineEnd, lineStart);
    const lineLengthSq = lineDir.lengthSq();
    
    if (lineLengthSq === 0) {
      // Line segment is a point
      return point.distanceTo(lineStart);
    }
    
    // Project point onto line, clamped to segment
    let t = new THREE.Vector3().subVectors(point, lineStart).dot(lineDir) / lineLengthSq;
    t = Math.max(0, Math.min(1, t));
    
    const closestPoint = new THREE.Vector3().copy(lineStart).add(lineDir.multiplyScalar(t));
    return point.distanceTo(closestPoint);
  }

  private animate = () => {
    if (this.destroyed) return;
    this.animationId = requestAnimationFrame(this.animate);
    if (document.hidden) { this.clock.getDelta(); return; }
    
    // Diagnostic: Track render calls
    if (!window.__renderCalls) window.__renderCalls = 0;
    window.__renderCalls++;
    if (window.__renderCalls <= 5) {

    }
    
    if (!this.renderer || !this.scene || !this.camera || !this.snakeHead || !this.headPosition) {
      console.error('[DIAGNOSTIC] Missing required objects:', {
        renderer: !!this.renderer,
        scene: !!this.scene,
        camera: !!this.camera,
        snakeHead: !!this.snakeHead,
        headPosition: !!this.headPosition
      });
      return;
    }

    let dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.getElapsedTime();

    if (this.deathSlowMo > 0) dt *= 0.3;

    this.frameCount++;
    if (this.frameCount === 120) {
      const elapsed = (performance.now() - this.fpsCheckTime) / 1000;
      const fps = 120 / elapsed;

      if (fps < 45) {
        this.lowEndDevice = true;
        this.bloomPass.strength = 0.3;
      }
    }
    
    if (this.state === 'playing') {
      this.processInput(dt);
      this.updateSnake(dt);
      this.updateFood(dt, time);
      this.updateObstacles(dt, time);
      this.updatePowerUps(dt);
      this.updateCombo(dt);
      this.runStats.survivalTime = time - this.runStartTime;
    } else if (this.state === 'menu') {
      const idleSpeed = 4;
      this.totalDistance += dt * idleSpeed;
      const t = time * 0.4;
      const radius = 8;
      const x = Math.sin(t) * radius;
      const z = Math.sin(t * 2) * radius * 0.5;
      const prevX = this.headPosition.x;
      const prevZ = this.headPosition.z;
      this.headPosition.set(x, 0.4, z);
      const dx = x - prevX;
      const dz = z - prevZ;
      if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
        this.headYaw = Math.atan2(dx, dz);
      }
      this.snakeHead.position.copy(this.headPosition);
      this.snakeHead.rotation.y = -this.headYaw;
      this.snakeHeadLight.position.copy(this.headPosition);

      if (this.pathHistory.length > 0) {
        const lastPoint = this.pathHistory[this.pathHistory.length - 1];
        const dist = this.headPosition.distanceTo(lastPoint.position);
        if (dist > 0.1) {
          this.pathHistory.push({ position: this.headPosition.clone(), distance: this.totalDistance });
          if (this.pathHistory.length > 100) this.pathHistory.shift();
        }
      }

      if (this.segmentPool) {
        for (let i = 0; i < this.activeSegments; i++) {
          if (!this.segmentPool[i] || !this.segmentPool[i].mesh) continue;
          const seg = this.segmentPool[i];
          const targetDist = (i + 1) * this.SEGMENT_SPACING;
          const targetTotalDist = this.totalDistance - targetDist;
          let pos = this.headPosition.clone();
          if (this.pathHistory.length > 0) {
            pos = this.pathHistory[0].position.clone();
            for (let j = this.pathHistory.length - 1; j >= 0; j--) {
              if (this.pathHistory[j].distance <= targetTotalDist) {
                if (j < this.pathHistory.length - 1) {
                  const p1 = this.pathHistory[j];
                  const p2 = this.pathHistory[j + 1];
                  const frac = (targetTotalDist - p1.distance) / (p2.distance - p1.distance + 0.001);
                  pos.lerpVectors(p1.position, p2.position, Math.min(1, Math.max(0, frac)));
                } else {
                  pos = this.pathHistory[j].position.clone();
                }
                break;
              }
            }
          }
          seg.mesh.position.lerp(pos, 0.4);
          seg.mesh.position.y = 0.3 - i * 0.005;
        }
      }

      const camAngle = time * 0.15;
      const camRadius = 15;
      this.camera.position.set(
        Math.cos(camAngle) * camRadius,
        6 + Math.sin(time * 0.3) * 1,
        Math.sin(camAngle) * camRadius
      );
      this.camera.lookAt(0, 1, 0);
    }

    this.updateCamera();
    this.updateFireflies(dt, time);
    this.updateEatParticles(dt);
    this.updateWorldDetails(dt, time);
    this.updateEffects(dt, time);
    
    // Update minimap
    if (this.minimap && this.state === 'playing') {
      this.updateMinimap(dt);
    }

    this.composer.render();
  };

  getStamina(): number { return this.stamina; }
  getBoostActive(): boolean { return this.boostActive; }
  getVignetteFlash(): number { return this.vignetteFlash; }
  getComboTimer(): number { return this.comboTimer; }
  getRunStats(): RunStats { return this.runStats; }
  getCurrentObjective(): Objective | null { return this.currentObjective; }
  isObjectiveCompleted(): boolean { return this.objectiveCompleted; }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock?.();
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.removeEventListener('click', this.onCanvasClick);
    this.renderer.domElement.removeEventListener('touchstart', this.onTouchStart);
    this.renderer.domElement.removeEventListener('touchmove', this.onTouchMove);
    this.renderer.domElement.removeEventListener('touchend', this.onTouchEnd);
    
    // Cleanup minimap
    if (this.minimap) {
      this.minimap.destroy();
      this.minimap = null;
    }
    
    this.composer.dispose();
    this.particleTexture.dispose();
    this.glowTexture.dispose();
    this.foods.forEach(f => (f.glow.material as THREE.Material).dispose());
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material?.dispose();
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
