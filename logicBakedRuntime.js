// Logic-Baked Runtime - Tiny Physics Engine (~5kb)
// Self-contained character physics simulation

class LogicBakedRuntime {
  constructor(data) {
    this.data = data;
    this.joints = {};
    this.chains = {};
    this.time = 0;
    this.dt = 1/60;
    this.init();
  }
  
  init() {
    const c = this.data.character;
    
    // Initialize joints
    Object.entries(c.joints).forEach(([id, j]) => {
      this.joints[id] = {
        ...j,
        angle: j.currentRotation,
        vel: 0,
        acc: 0,
        world: { x: 0, y: 0 }
      };
    });
    
    // Initialize chains
    Object.entries(c.chains).forEach(([id, chain]) => {
      this.chains[id] = {
        ...chain,
        targets: {},
        solved: false
      };
    });
    
    this.updateWorldPositions();
  }
  
  updateWorldPositions() {
    const root = this.data.character.rootTransform;
    let x = root.x, y = root.y, angle = root.rotate * Math.PI/180;
    
    const traverse = (jointId) => {
      const joint = this.joints[jointId];
      if (!joint) return;
      
      const parent = joint.parent;
      if (parent) {
        const parentJoint = this.joints[parent];
        if (parentJoint) {
          x = parentJoint.world.x;
          y = parentJoint.world.y;
          angle = parentJoint.angle * Math.PI/180;
        }
      } else {
        x = root.x;
        y = root.y;
        angle = root.rotate * Math.PI/180;
      }
      
      const [px, py] = joint.pivot;
      joint.world.x = x + px * Math.cos(angle) - py * Math.sin(angle);
      joint.world.y = y + px * Math.sin(angle) + py * Math.cos(angle);
      
      // Recursively update children
      Object.keys(this.joints).forEach(id => {
        if (this.joints[id].parent === jointId) {
          traverse(id);
        }
      });
    };
    
    // Start from root
    Object.keys(this.joints).forEach(id => {
      if (!this.joints[id].parent) {
        traverse(id);
      }
    });
  }
  
  solveIK(chainId, targetX, targetY) {
    const chain = this.chains[chainId];
    if (!chain) return;
    
    const physics = chain.physics;
    const joints = chain.joints.map(id => this.joints[id]).filter(Boolean);
    if (joints.length < 2) return;
    
    // FABRIK solver with physics
    const iterations = Math.min(physics.maxIterations || 20, 50);
    const epsilon = physics.epsilon || 0.1;
    const damping = physics.damping || 0.1;
    const stretchRatio = physics.stretchRatio || 1.0;
    
    // Get original positions
    const originalPositions = joints.map(j => ({ ...j.world }));
    const target = { x: targetX, y: targetY };
    
    for (let iter = 0; iter < iterations; iter++) {
      // Backward pass
      let current = target;
      for (let i = joints.length - 1; i >= 0; i--) {
        const joint = joints[i];
        const prev = i > 0 ? joints[i - 1] : null;
        
        if (prev) {
          const dx = current.x - prev.world.x;
          const dy = current.y - prev.world.y;
          const dist = Math.hypot(dx, dy);
          
          if (dist > 0) {
            const pivot = joint.pivot;
            const originalLength = Math.hypot(pivot[0], pivot[1]) * stretchRatio;
            const constrainedLength = Math.max(originalLength * 0.5, Math.min(originalLength * 1.5, dist));
            
            const ratio = constrainedLength / dist;
            joint.world.x = current.x - dx * ratio;
            joint.world.y = current.y - dy * ratio;
          }
        }
        current = joint.world;
      }
      
      // Forward pass
      current = originalPositions[0];
      for (let i = 0; i < joints.length; i++) {
        const joint = joints[i];
        const next = i < joints.length - 1 ? joints[i + 1] : null;
        
        if (next) {
          const dx = next.world.x - current.x;
          const dy = next.world.y - current.y;
          const dist = Math.hypot(dx, dy);
          
          if (dist > 0) {
            const pivot = next.pivot;
            const originalLength = Math.hypot(pivot[0], pivot[1]) * stretchRatio;
            const constrainedLength = Math.max(originalLength * 0.5, Math.min(originalLength * 1.5, dist));
            
            const ratio = constrainedLength / dist;
            next.world.x = current.x + dx * ratio;
            next.world.y = current.y + dy * ratio;
          }
        }
        current = joint.world;
      }
      
      // Check convergence
      const endEffector = joints[joints.length - 1];
      const error = Math.hypot(endEffector.world.x - targetX, endEffector.world.y - targetY);
      if (error < epsilon) break;
    }
    
    // Apply damping and update angles
    joints.forEach((joint, i) => {
      const original = originalPositions[i];
      const dx = joint.world.x - original.x;
      const dy = joint.world.y - original.y;
      
      // Calculate angle change
      const parent = joint.parent ? this.joints[joint.parent] : null;
      if (parent) {
        const angle1 = Math.atan2(original.y - parent.world.y, original.x - parent.world.x);
        const angle2 = Math.atan2(joint.world.y - parent.world.y, joint.world.x - parent.world.x);
        let deltaAngle = (angle2 - angle1) * 180 / Math.PI;
        
        // Normalize angle
        while (deltaAngle > 180) deltaAngle -= 360;
        while (deltaAngle < -180) deltaAngle += 360;
        
        // Apply damping
        deltaAngle *= (1 - damping);
        
        // Update angle with limits
        const newAngle = joint.angle + deltaAngle;
        const limits = joint.limits;
        if (limits) {
          joint.angle = Math.max(limits.min, Math.min(limits.max, newAngle));
        } else {
          joint.angle = newAngle;
        }
      }
    });
    
    chain.solved = true;
    this.updateWorldPositions();
  }
  
  applyPhysics() {
    const global = this.data.character.physics.global;
    const gravity = global.gravity || 9.8;
    const velocityDamping = global.velocityDamping || 0.1;
    const groundFriction = global.groundFriction || 0.3;
    
    Object.values(this.joints).forEach(joint => {
      const physics = joint.physics || global;
      
      // Apply gravity
      joint.acc += gravity * physics.mass * 0.01;
      
      // Apply velocity damping
      joint.vel *= (1 - velocityDamping * this.dt);
      
      // Update velocity and position
      joint.vel += joint.acc * this.dt;
      const angleChange = joint.vel * this.dt;
      
      // Apply joint limits
      let newAngle = joint.angle + angleChange;
      const limits = joint.limits;
      if (limits) {
        newAngle = Math.max(limits.min, Math.min(limits.max, newAngle));
        
        // Apply ground friction at limits
        if (newAngle === limits.min || newAngle === limits.max) {
          joint.vel *= (1 - groundFriction);
        }
      }
      
      joint.angle = newAngle;
      joint.acc = 0;
    });
    
    this.updateWorldPositions();
  }
  
  setTarget(chainId, x, y) {
    const chain = this.chains[chainId];
    if (chain) {
      chain.targets = { x, y };
      chain.solved = false;
    }
  }
  
  update(deltaTime) {
    this.dt = Math.max(0.001, Math.min(0.1, deltaTime));
    this.time += this.dt;
    
    // Solve IK for active chains
    Object.entries(this.chains).forEach(([id, chain]) => {
      if (chain.targets.x !== undefined && chain.targets.y !== undefined && !chain.solved) {
        this.solveIK(id, chain.targets.x, chain.targets.y);
      }
    });
    
    // Apply physics
    this.applyPhysics();
  }
  
  getJointPositions() {
    const positions = {};
    Object.entries(this.joints).forEach(([id, joint]) => {
      positions[id] = { x: joint.world.x, y: joint.world.y };
    });
    return positions;
  }
  
  getJointRotations() {
    const rotations = {};
    Object.entries(this.joints).forEach(([id, joint]) => {
      rotations[id] = joint.angle;
    });
    return rotations;
  }
}

// Export for global use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LogicBakedRuntime;
} else if (typeof window !== 'undefined') {
  window.LogicBakedRuntime = LogicBakedRuntime;
}
