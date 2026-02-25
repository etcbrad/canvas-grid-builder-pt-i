// Logic-Baked Export System
// Exports character with physics constants and tiny runtime script

export interface PhysicsConstants {
  // IK Solver Physics
  damping: number;              // Energy dissipation (0.0-1.0)
  stretchRatio: number;          // Joint elasticity factor (1.0-2.0)
  curveStrength: number;          // Natural bend tendency (0.0-1.0)
  poleWeight: number;            // Pole vector influence (0.0-1.0)
  convergenceThreshold: number;    // Solution tolerance (0.01-1.0)
  epsilon: number;               // Minimum movement threshold (0.01-1.0)
  maxIterations: number;         // Solver iteration limit (10-50)
  
  // Joint Physics
  friction: number;              // Joint resistance (0.0-1.0)
  restitution: number;           // Bounce factor (0.0-1.0)
  mass: number;                 // Joint mass (0.1-10.0)
  inertia: number;               // Rotational resistance (0.1-5.0)
  
  // Motion Dynamics
  velocityDamping: number;       // Velocity decay (0.0-1.0)
  acceleration: number;           // Force response (0.1-10.0)
  gravity: number;               // Downward force (0.0-20.0)
  groundFriction: number;         // Surface contact (0.0-1.0)
}

export interface LogicBakedJoint {
  id: string;
  parent: string | null;
  pivot: [number, number];
  limits: { min: number; max: number; allow360?: boolean };
  physics: PhysicsConstants;
  currentRotation: number;
  restRotation: number;
}

export interface LogicBakedChain {
  id: string;
  joints: string[];
  effector: string;
  priority: number;
  physics: PhysicsConstants;
  activationStage: 'arm' | 'leg' | 'spine_head';
}

export interface LogicBakedAnimation {
  frames: Array<{
    timestamp: number;
    rotations: Record<string, number>;
    velocities?: Record<string, number>;
    forces?: Record<string, number>;
  }>;
  fps: number;
  duration: number;
  easing?: string;
}

export interface LogicBakedCharacter {
  // Metadata
  name: string;
  version: string;
  timestamp: string;
  description?: string;
  
  // Skeleton Structure
  joints: Record<string, LogicBakedJoint>;
  chains: Record<string, LogicBakedChain>;
  hierarchy: [string, number][];
  
  // Current State
  rootTransform: {
    x: number;
    y: number;
    rotate: number;
  };
  
  // Animation Data
  animations?: Record<string, LogicBakedAnimation>;
  keyframes?: Record<number, Record<string, number>>;
  
  // Physics Profile (global defaults)
  physics: {
    global: PhysicsConstants;
    perChain: Record<string, Partial<PhysicsConstants>>;
    perJoint: Record<string, Partial<PhysicsConstants>>;
  };
  
  // Runtime Configuration
  runtime: {
    solver: 'fabrik' | 'ccd' | 'hybrid';
    mode: 'fk' | 'ik' | 'hybrid';
    updateRate: number;          // Hz
    interpolation: 'linear' | 'cubic' | 'ease';
  };
}

export interface LogicBakedExport {
  character: LogicBakedCharacter;
  runtime: string;              // Tiny runtime script (minified)
  size: {
    total: number;              // Total bytes
    runtime: number;            // Runtime script bytes
    data: number;              // Character data bytes
  };
}
