import type { SkeletonRotations, WorldCoords } from './modelData';
import type { RootTransform } from './fkEngine';

export interface AnimationCaptureData {
  frame: number;
  rotations: SkeletonRotations;
  worldPositions: Record<string, { x: number; y: number; angle: number }>;
  rootTransform?: RootTransform;
}

export interface AnimationCapture {
  id: string;
  name: string;
  frames: AnimationCaptureData[];
  duration: number;
  createdAt: number;
}

export interface AnimationCaptureOptions {
  includeRootTransform?: boolean;
  includeWorldPositions?: boolean;
  jointIds?: string[];
  frameRate?: number;
}

const DEFAULT_CAPTURE_OPTIONS: AnimationCaptureOptions = {
  includeRootTransform: true,
  includeWorldPositions: true,
  frameRate: 24,
};

export class AnimationCaptureManager {
  private captures: Map<string, AnimationCapture> = new Map();
  private captureCounter = 0;

  createCapture(
    name: string,
    frames: AnimationCaptureData[],
    options: AnimationCaptureOptions = {}
  ): AnimationCapture {
    const id = `capture_${++this.captureCounter}_${Date.now()}`;
    const capture: AnimationCapture = {
      id,
      name: name.trim() || `Capture ${this.captureCounter}`,
      frames: frames.filter(frame => this.validateFrame(frame, options)),
      duration: frames.length > 0 ? Math.max(...frames.map(f => f.frame)) : 0,
      createdAt: Date.now(),
    };
    
    this.captures.set(id, capture);
    return capture;
  }

  getCapture(id: string): AnimationCapture | undefined {
    return this.captures.get(id);
  }

  getAllCaptures(): AnimationCapture[] {
    return Array.from(this.captures.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  deleteCapture(id: string): boolean {
    return this.captures.delete(id);
  }

  exportCapture(id: string): string | null {
    const capture = this.captures.get(id);
    if (!capture) return null;
    
    return JSON.stringify(capture, null, 2);
  }

  importCapture(jsonData: string): AnimationCapture | null {
    try {
      const data = JSON.parse(jsonData) as Partial<AnimationCapture>;
      if (!data.name || !Array.isArray(data.frames)) {
        throw new Error('Invalid capture data format');
      }
      
      const capture = this.createCapture(data.name, data.frames);
      return capture;
    } catch (error) {
      console.error('Failed to import capture:', error);
      return null;
    }
  }

  private validateFrame(frame: AnimationCaptureData, options: AnimationCaptureOptions): boolean {
    if (!Number.isFinite(frame.frame) || frame.frame < 0) {
      return false;
    }
    
    if (!frame.rotations || typeof frame.rotations !== 'object') {
      return false;
    }
    
    if (options.includeWorldPositions && (!frame.worldPositions || typeof frame.worldPositions !== 'object')) {
      return false;
    }
    
    return true;
  }
}

export const animationCaptureManager = new AnimationCaptureManager();
