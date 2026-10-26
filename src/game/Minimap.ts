import * as THREE from 'three';
import { getMinimapSettings, saveMinimapSettings, MinimapSettings } from './Storage';

interface MinimapItem {
  position: THREE.Vector3;
  type: 'food' | 'golden' | 'powerup' | 'poison' | 'obstacle' | 'movingObstacle';
  color: string;
  icon?: string;
}

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private container: HTMLElement;
  private settings: MinimapSettings;
  
  // Cached static elements
  private backgroundCanvas: HTMLCanvasElement | null = null;
  private backgroundCtx: CanvasRenderingContext2D | null = null;
  
  // Game state
  private headPosition: THREE.Vector3 = new THREE.Vector3();
  private headYaw: number = 0;
  private bodyPositions: THREE.Vector3[] = [];
  private items: MinimapItem[] = [];
  private arenaRadius: number = 30;
  private visible: boolean = true;
  private gameplayActive = false;
  
  // Animation state
  private pulseTime: number = 0;
  private eatPulseTime: number = 0;
  private dangerPulseTime: number = 0;
  private isDangerous: boolean = false;
  
  // Performance
  private lastUpdateTime: number = 0;
  private readonly UPDATE_INTERVAL = 1000 / 30; // 30 FPS
  private isMobile: boolean = false;
  
  // Size presets
  private readonly SIZES = {
    small: { desktop: 140, mobile: 90 },
    medium: { desktop: 180, mobile: 110 },
    large: { desktop: 220, mobile: 140 },
  };

  constructor(container: HTMLElement) {
    this.container = container;
    
    // Defensive check for settings
    const settings = getMinimapSettings();
    this.settings = settings || {
      show: true,
      mode: 'rotating' as const,
      opacity: 0.8,
      size: 'medium' as const,
    };
    
    this.visible = this.settings.show !== false;
    this.isMobile = window.innerWidth < 768 || 'ontouchstart' in window;
    
    // Create main canvas
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap-canvas';
    this.canvas.id = 'minimap';
    this.canvas.style.position = 'fixed';
    this.canvas.style.zIndex = '1000';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.display = 'none';
    this.updateCanvasSize();
    this.updateCanvasPosition();
    
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      console.error('Failed to get 2D context for minimap');
      return;
    }
    this.ctx = ctx;
    
    // Create background cache canvas
    this.backgroundCanvas = document.createElement('canvas');
    this.backgroundCanvas.width = this.canvas.width;
    this.backgroundCanvas.height = this.canvas.height;
    const bgCtx = this.backgroundCanvas.getContext('2d');
    if (!bgCtx) {
      console.error('Failed to get background 2D context for minimap');
      return;
    }
    this.backgroundCtx = bgCtx;
    
    // Cache static background
    this.cacheBackground();
    
    // Add to container
    container.appendChild(this.canvas);
    
    // Setup interactions
    this.setupInteractions();
    
    // Fade in
    this.canvas.style.opacity = '0';
    setTimeout(() => {
      if (this.canvas) {
        this.canvas.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        this.canvas.style.opacity = String(this.visible ? this.settings.opacity : 0);
        this.canvas.style.transform = 'scale(1)';
      }
    }, 100);
  }

  private updateCanvasSize() {
    const size = this.SIZES[this.settings.size] || this.SIZES.medium;
    const displaySize = this.isMobile ? size.mobile : size.desktop;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    
    this.canvas.style.width = `${displaySize}px`;
    this.canvas.style.height = `${displaySize}px`;
    this.canvas.width = displaySize * dpr;
    this.canvas.height = displaySize * dpr;
    
    if (this.backgroundCanvas) {
      this.backgroundCanvas.width = this.canvas.width;
      this.backgroundCanvas.height = this.canvas.height;
    }
  }

  private updateCanvasPosition() {
    if (this.isMobile) {
      // Top-right on mobile, below pause/camera buttons
      this.canvas.style.top = '80px';
      this.canvas.style.right = '16px';
      this.canvas.style.bottom = 'auto';
      this.canvas.style.left = 'auto';
    } else {
      // Bottom-right on desktop
      this.canvas.style.bottom = '16px';
      this.canvas.style.right = '16px';
      this.canvas.style.top = 'auto';
      this.canvas.style.left = 'auto';
    }
  }

  private cacheBackground() {
    if (!this.backgroundCtx || !this.backgroundCanvas) return;
    
    const ctx = this.backgroundCtx;
    const width = this.backgroundCanvas.width;
    const height = this.backgroundCanvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 4;
    
    ctx.clearRect(0, 0, width, height);
    
    // Glassmorphism background
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, 'rgba(30, 20, 50, 0.6)');
    gradient.addColorStop(1, 'rgba(20, 10, 40, 0.7)');
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Soft inner glow
    const glowGradient = ctx.createRadialGradient(centerX, centerY, radius * 0.8, centerX, centerY, radius);
    glowGradient.addColorStop(0, 'rgba(180, 140, 255, 0)');
    glowGradient.addColorStop(1, 'rgba(180, 140, 255, 0.1)');
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = glowGradient;
    ctx.fill();
    
    // Glassy border
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(180, 140, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private setupInteractions() {
    // Desktop: hover effect
    if (!this.isMobile) {
      this.canvas.addEventListener('mouseenter', () => {
        this.canvas.style.transform = 'scale(1.04)';
        this.canvas.title = 'Minimap — N to toggle';
      });
      
      this.canvas.addEventListener('mouseleave', () => {
        this.canvas.style.transform = 'scale(1)';
      });
    }
    
    // Mobile: long-press to toggle
    if (this.isMobile) {
      let pressTimer: number | null = null;
      
      this.canvas.addEventListener('touchstart', (e) => {
        pressTimer = window.setTimeout(() => {
          this.toggle();
          e.preventDefault();
        }, 500);
      });
      
      this.canvas.addEventListener('touchend', () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      });
      
      this.canvas.addEventListener('touchmove', () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      });
    }
  }

  public setGameplayActive(active: boolean) {
    this.gameplayActive = active;
    this.canvas.style.display = active && this.visible ? 'block' : 'none';
  }

  public toggle() {
    this.visible = !this.visible;
    this.settings.show = this.visible;
    this.canvas.style.display = this.gameplayActive && this.visible ? 'block' : 'none';
    saveMinimapSettings({ show: this.visible });
    
    if (this.visible) {
      this.canvas.style.opacity = String(this.settings.opacity);
      this.canvas.style.transform = 'scale(1)';
    } else {
      this.canvas.style.opacity = '0';
      this.canvas.style.transform = 'scale(0.85)';
    }
  }

  public updateSettings(newSettings: Partial<MinimapSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    saveMinimapSettings(newSettings);
    
    if ('size' in newSettings) {
      this.updateCanvasSize();
      this.updateCanvasPosition();
      this.cacheBackground();
    }
    
    if ('opacity' in newSettings && this.visible) {
      this.canvas.style.opacity = String(this.settings.opacity);
    }
  }

  public updateGameState(
    headPos: THREE.Vector3,
    headYaw: number,
    bodyPositions: THREE.Vector3[],
    items: MinimapItem[],
    arenaRadius: number,
    isDangerous: boolean = false
  ) {
    this.headPosition.copy(headPos);
    this.headYaw = headYaw;
    this.bodyPositions = bodyPositions;
    this.items = items;
    this.arenaRadius = arenaRadius;
    this.isDangerous = isDangerous;
  }

  public triggerEatPulse() {
    this.eatPulseTime = 0.2; // 200ms pulse
  }

  public update(deltaTime: number) {
    if (!this.visible) return;
    
    const now = performance.now();
    const updateInterval = this.isMobile ? 1000 / 20 : this.UPDATE_INTERVAL;
    
    if (now - this.lastUpdateTime < updateInterval) return;
    this.lastUpdateTime = now;
    
    // Update animation timers
    this.pulseTime += deltaTime;
    if (this.eatPulseTime > 0) {
      this.eatPulseTime = Math.max(0, this.eatPulseTime - deltaTime);
    }
    if (this.isDangerous) {
      this.dangerPulseTime += deltaTime;
    }
    
    this.render();
  }

  private render() {
    if (!this.ctx || !this.backgroundCanvas) return;
    
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const mapRadius = Math.min(width, height) / 2 - 8;
    
    // Clear and draw cached background
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(this.backgroundCanvas, 0, 0);
    
    // Calculate scale and rotation
    const scale = mapRadius / this.arenaRadius;
    const rotation = this.settings.mode === 'rotating' ? -this.headYaw : 0;
    
    // Save context state
    ctx.save();
    
    // Translate to center and rotate
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    
    // Draw arena boundary
    ctx.beginPath();
    ctx.arc(-this.headPosition.x * scale, -this.headPosition.z * scale, mapRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(180, 140, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // Draw items
    this.renderItems(ctx, scale);
    
    // Draw body trail
    this.renderBodyTrail(ctx, scale);
    
    // Draw player head
    this.renderPlayerHead(ctx);
    
    // Restore context
    ctx.restore();
    
    // Draw eat pulse (not rotated)
    if (this.eatPulseTime > 0) {
      this.renderEatPulse(ctx, centerX, centerY, mapRadius);
    }
    
    // Draw danger pulse on border
    if (this.isDangerous) {
      this.renderDangerPulse(ctx, centerX, centerY, mapRadius);
    }
  }

  private renderItems(ctx: CanvasRenderingContext2D, scale: number) {
    const time = this.pulseTime;
    
    for (const item of this.items) {
      // Transform world position to minimap position
      const relX = (item.position.x - this.headPosition.x) * scale;
      const relZ = (item.position.z - this.headPosition.z) * scale;
      
      // Clamp to map boundary
      const dist = Math.sqrt(relX * relX + relZ * relZ);
      const maxDist = Math.min(this.canvas.width, this.canvas.height) / 2 - 12;
      
      let drawX = relX;
      let drawZ = relZ;
      
      if (dist > maxDist) {
        // Draw as chevron at edge
        const angle = Math.atan2(relZ, relX);
        drawX = Math.cos(angle) * maxDist;
        drawZ = Math.sin(angle) * maxDist;
        this.renderChevron(ctx, drawX, drawZ, angle, item.color);
        continue;
      }
      
      // Render based on type
      switch (item.type) {
        case 'food':
          this.renderFoodDot(ctx, drawX, drawZ, 3, item.color, time, item.position.x + item.position.z);
          break;
          
        case 'golden':
          this.renderGoldenFood(ctx, drawX, drawZ, 4, item.color, time, item.position.x + item.position.z);
          break;
          
        case 'powerup':
          this.renderPowerupDot(ctx, drawX, drawZ, 3, item.color, item.icon || '?');
          break;
          
        case 'poison':
          this.renderPoisonSkull(ctx, drawX, drawZ, 5);
          break;
          
        case 'obstacle':
          this.renderObstacle(ctx, drawX, drawZ, 4, item.color, false);
          break;
          
        case 'movingObstacle':
          this.renderObstacle(ctx, drawX, drawZ, 4, item.color, true);
          break;
      }
    }
  }

  private renderFoodDot(ctx: CanvasRenderingContext2D, x: number, z: number, size: number, color: string, time: number, phase: number) {
    const pulse = 1 + Math.sin(time * 2 + phase) * 0.1;
    const drawSize = size * pulse;
    
    ctx.beginPath();
    ctx.arc(x, z, drawSize, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  private renderGoldenFood(ctx: CanvasRenderingContext2D, x: number, z: number, size: number, color: string, time: number, phase: number) {
    const pulse = 1 + Math.sin(time * 3 + phase) * 0.15;
    const drawSize = size * pulse;
    
    // Pulsing ring
    ctx.beginPath();
    ctx.arc(x, z, drawSize + 2, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5 + Math.sin(time * 3 + phase) * 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;
    
    // Core dot
    ctx.beginPath();
    ctx.arc(x, z, drawSize, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  private renderPowerupDot(ctx: CanvasRenderingContext2D, x: number, z: number, size: number, color: string, icon: string) {
    // Dot
    ctx.beginPath();
    ctx.arc(x, z, size, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    
    // Icon text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size * 1.5}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x, z);
  }

  private renderPoisonSkull(ctx: CanvasRenderingContext2D, x: number, z: number, size: number) {
    // Skull shape (simplified)
    ctx.fillStyle = '#3a1a5a';
    ctx.strokeStyle = '#8aff6b';
    ctx.lineWidth = 1;
    
    // Head
    ctx.beginPath();
    ctx.arc(x, z - size * 0.2, size * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Eyes
    ctx.fillStyle = '#8aff6b';
    ctx.beginPath();
    ctx.arc(x - size * 0.2, z - size * 0.3, size * 0.15, 0, Math.PI * 2);
    ctx.arc(x + size * 0.2, z - size * 0.3, size * 0.15, 0, Math.PI * 2);
    ctx.fill();
    
    // Jaw
    ctx.fillStyle = '#3a1a5a';
    ctx.fillRect(x - size * 0.3, z, size * 0.6, size * 0.4);
    ctx.strokeRect(x - size * 0.3, z, size * 0.6, size * 0.4);
  }

  private renderObstacle(ctx: CanvasRenderingContext2D, x: number, z: number, size: number, color: string, isMoving: boolean) {
    ctx.fillStyle = color;
    
    if (isMoving) {
      // Triangle for moving obstacles
      ctx.beginPath();
      ctx.moveTo(x, z - size);
      ctx.lineTo(x - size, z + size);
      ctx.lineTo(x + size, z + size);
      ctx.closePath();
      ctx.fill();
      
      // Trail line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, z + size);
      ctx.lineTo(x, z + size * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      // Square for static obstacles
      ctx.fillRect(x - size, z - size, size * 2, size * 2);
    }
  }

  private renderChevron(ctx: CanvasRenderingContext2D, x: number, z: number, angle: number, color: string) {
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(angle);
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(-2, -3);
    ctx.lineTo(-2, 3);
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
  }

  private renderBodyTrail(ctx: CanvasRenderingContext2D, scale: number) {
    if (this.bodyPositions.length < 2) return;
    
    // Create gradient path
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw body segments with gradient
    for (let i = 0; i < this.bodyPositions.length - 1; i++) {
      const pos1 = this.bodyPositions[i];
      const pos2 = this.bodyPositions[i + 1];
      
      const x1 = (pos1.x - this.headPosition.x) * scale;
      const z1 = (pos1.z - this.headPosition.z) * scale;
      const x2 = (pos2.x - this.headPosition.x) * scale;
      const z2 = (pos2.z - this.headPosition.z) * scale;
      
      // Calculate color based on position in body (mint -> lavender -> pink)
      const t = i / this.bodyPositions.length;
      const r = Math.round(127 + t * (255 - 127));
      const g = Math.round(255 + t * (158 - 255));
      const b = Math.round(224 + t * (232 - 224));
      
      // Fade alpha towards tail
      const alpha = 1 - (t * 0.5);
      
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x1, z1);
      ctx.lineTo(x2, z2);
      ctx.stroke();
    }
    
    // Add glow effect
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = '#7fffe0';
    ctx.beginPath();
    for (let i = 0; i < this.bodyPositions.length; i++) {
      const pos = this.bodyPositions[i];
      const x = (pos.x - this.headPosition.x) * scale;
      const z = (pos.z - this.headPosition.z) * scale;
      
      if (i === 0) {
        ctx.moveTo(x, z);
      } else {
        ctx.lineTo(x, z);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private renderPlayerHead(ctx: CanvasRenderingContext2D) {
    // Glowing ring
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(127, 255, 224, 0.3)';
    ctx.fill();
    
    // Head triangle (pointing up)
    ctx.fillStyle = '#7fffe0';
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(-4, 4);
    ctx.lineTo(4, 4);
    ctx.closePath();
    ctx.fill();
    
    // Bright center
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  private renderEatPulse(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, mapRadius: number) {
    const progress = 1 - (this.eatPulseTime / 0.2);
    const radius = mapRadius * progress;
    const alpha = 1 - progress;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(127, 255, 224, ${alpha * 0.5})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private renderDangerPulse(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, mapRadius: number) {
    const pulse = Math.sin(this.dangerPulseTime * 4) * 0.5 + 0.5;
    const color = this.isDangerous ? 'rgba(255, 100, 150, ' : 'rgba(138, 255, 107, ';
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, mapRadius + 2, 0, Math.PI * 2);
    ctx.strokeStyle = color + (pulse * 0.6) + ')';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  public destroy() {
    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }
}
