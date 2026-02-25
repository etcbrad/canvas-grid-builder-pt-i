import { BitruviusData, SkeletonRotations, IKChain } from './modelData';
import { LogicBakedCharacter, LogicBakedExport, LogicBakedJoint, LogicBakedChain, PhysicsConstants } from './logicBakedExport';

// Extract physics constants from IK chains
const extractPhysicsConstants = (chain: IKChain): PhysicsConstants => {
  return {
    // IK Solver Physics
    damping: chain.damping ?? 0.1,
    stretchRatio: chain.stretchRatio ?? 1.0,
    curveStrength: chain.curveStrength ?? 0.5,
    poleWeight: chain.poleWeight ?? 0.3,
    convergenceThreshold: chain.convergenceThreshold ?? 0.2,
    epsilon: chain.epsilon ?? 0.1,
    maxIterations: chain.maxIterations ?? 20,
    
    // Joint Physics (derived defaults)
    friction: 0.15,
    restitution: 0.05,
    mass: 1.0,
    inertia: 0.8,
    
    // Motion Dynamics
    velocityDamping: 0.1,
    acceleration: 2.0,
    gravity: 9.8,
    groundFriction: 0.3,
  };
};

// Export character with logic-baked physics
export const exportLogicBakedCharacter = (
  bitruviusData: BitruviusData,
  currentRotations: SkeletonRotations,
  rootTransform: { x: number; y: number; rotate: number } = { x: 0, y: 0, rotate: 0 },
  options: {
    name?: string;
    description?: string;
    includeAnimations?: boolean;
    keyframes?: Record<number, SkeletonRotations>;
    solver?: 'fabrik' | 'ccd' | 'hybrid';
    mode?: 'fk' | 'ik' | 'hybrid';
  } = {}
): LogicBakedExport => {
  
  const {
    name = 'Logic-Baked Character',
    description = 'Character with embedded physics constants',
    includeAnimations = true,
    keyframes = {},
    solver = 'fabrik',
    mode = 'hybrid'
  } = options;
  
  // Build joints with physics
  const joints: Record<string, LogicBakedJoint> = {};
  Object.entries(bitruviusData.JOINT_DEFS).forEach(([id, jointDef]) => {
    joints[id] = {
      id,
      parent: jointDef.parent,
      pivot: jointDef.pivot,
      limits: bitruviusData.JOINT_LIMITS[id] || { min: -180, max: 180 },
      physics: {
        // Default physics for each joint
        damping: 0.1,
        stretchRatio: 1.0,
        curveStrength: 0.5,
        poleWeight: 0.3,
        convergenceThreshold: 0.2,
        epsilon: 0.1,
        maxIterations: 20,
        friction: 0.15,
        restitution: 0.05,
        mass: 1.0,
        inertia: 0.8,
        velocityDamping: 0.1,
        acceleration: 2.0,
        gravity: 9.8,
        groundFriction: 0.3,
      },
      currentRotation: currentRotations[id] ?? 0,
      restRotation: bitruviusData.initialRotations[id] ?? 0,
    };
  });
  
  // Build chains with physics
  const chains: Record<string, LogicBakedChain> = {};
  Object.entries(bitruviusData.IK_CHAINS).forEach(([id, chainDef]) => {
    chains[id] = {
      id,
      joints: chainDef.joints,
      effector: chainDef.effector,
      priority: chainDef.priority ?? 50,
      physics: extractPhysicsConstants(chainDef),
      activationStage: chainDef.activationStage ?? 'arm',
    };
  });
  
  // Build character data
  const character: LogicBakedCharacter = {
    name,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    description,
    joints,
    chains,
    hierarchy: bitruviusData.HIERARCHY,
    rootTransform,
    keyframes: includeAnimations ? keyframes : undefined,
    physics: {
      global: {
        // Global physics defaults
        damping: 0.1,
        stretchRatio: 1.0,
        curveStrength: 0.5,
        poleWeight: 0.3,
        convergenceThreshold: 0.2,
        epsilon: 0.1,
        maxIterations: 20,
        friction: 0.15,
        restitution: 0.05,
        mass: 1.0,
        inertia: 0.8,
        velocityDamping: 0.1,
        acceleration: 2.0,
        gravity: 9.8,
        groundFriction: 0.3,
      },
      perChain: {},
      perJoint: {},
    },
    runtime: {
      solver,
      mode,
      updateRate: 60,
      interpolation: 'cubic',
    },
  };
  
  // Add chain-specific physics overrides
  Object.entries(chains).forEach(([id, chain]) => {
    character.physics.perChain[id] = chain.physics;
  });
  
  // Get runtime script content
  const runtimeScript = `
// Logic-Baked Runtime v1.0.0 - Character Physics Engine
class LogicBakedRuntime{constructor(t){this.data=t,this.joints={},this.chains={},this.time=0,this.dt=1/60,this.init()}init(){const e=this.data.character;Object.entries(e.joints).forEach(([t,s])=>{this.joints[t]={...s,angle:s.currentRotation,vel:0,acc:0,world:{x:0,y:0}}}),Object.entries(e.chains).forEach(([t,s])=>{this.chains[t]={...s,targets:{},solved:!1}}),this.updateWorldPositions()}updateWorldPositions(){const t=this.data.character.rootTransform;let e=t.x,s=t.y,i=t.rotate*Math.PI/180;const r=t=>{const s=this.joints[t];if(!s)return;const r=s.parent;if(r){const t=this.joints[r];t?(e=t.world.x,s=t.world.y,i=t.angle*Math.PI/180):(e=t.x,s=t.y,i=t.rotate*Math.PI/180)}else e=t.x,s=t.y,i=t.rotate*Math.PI/180;const[o,n]=s.pivot;s.world.x=e+o*Math.cos(i)-n*Math.sin(i),s.world.y=e+o*Math.sin(i)+n*Math.cos(i),Object.keys(this.joints).forEach(e=>{this.joints[e].parent===t&&r(e)})};Object.keys(this.joints).forEach(t=>{this.joints[t].parent||r(t)})}solveIK(t,e,s){const i=this.chains[t];if(!i)return;const r=i.physics,o=i.joints.map(t=>this.joints[t]).filter(Boolean);if(o.length<2)return;const n=Math.min(r.maxIterations||20,50),a=r.epsilon||.1,h=r.damping||.1,l=r.stretchRatio||1;const c=o.map(t=>({...t.world})),p={x:e,y:s};for(let t=0;t<n;t++){let e=p;for(let s=o.length-1;s>=0;s--){const t=o[s],i=s>0?o[s-1]:null;if(i){const s=e.x-i.world.x,r=e.y-i.world.y,o=Math.hypot(s,r);if(o>0){const e=t.pivot,n=Math.hypot(e[0],e[1])*l,a=Math.max(.5*n,Math.min(1.5*n,o)),h=a/o;t.world.x=e.x-s*h,t.world.y=e.y-r*h}}e=t.world}e=c[0];for(let t=0;t<o.length;t++){const s=o[t],i=t<o.length-1?o[t+1]:null;if(i){const t=i.world.x-e.x,r=i.world.y-e.y,o=Math.hypot(t,r);if(o>0){const e=i.pivot,n=Math.hypot(e[0],e[1])*l,a=Math.max(.5*n,Math.min(1.5*n,o)),h=a/o;i.world.x=e.x+t*h,i.world.y=e.y+r*h}}e=o.world}const u=o[o.length-1],g=Math.hypot(u.world.x-e,u.world.y-s);if(g<a)break}o.forEach((t,e)=>{const s=c[e],i=t.world.x-s.x,r=t.world.y-s.y;const n=t.parent?this.joints[t.parent]:null;if(n){const e=Math.atan2(s.y-n.world.y,s.x-n.world.x),o=Math.atan2(t.world.y-n.world.y,t.world.x-n.world.x);let a=(o-e)*180/Math.PI;for(;a>180;)a-=360;for(;a<-180;)a+=360;a*=1-h;let l=t.angle+a;const c=t.limits;c&&(l=Math.max(c.min,Math.min(c.max,l))),t.angle=l}}),i.solved=!0,this.updateWorldPositions()}applyPhysics(){const t=this.data.character.physics.global,e=t.gravity||9.8,s=t.velocityDamping||.1,i=t.groundFriction||.3;Object.values(this.joints).forEach(t=>{const r=t.physics||e;t.acc+=e*r.mass*.01,t.vel*=1-s*this.dt,t.vel+=t.acc*this.dt;const e=t.vel*this.dt;let o=t.angle+e,n=t.limits;n&&(o=Math.max(n.min,Math.min(n.max,o)),(o===n.min||o===n.max)&&(t.vel*=1-i)),t.angle=o,t.acc=0}),this.updateWorldPositions()}setTarget(t,e,s){const i=this.chains[t];i&&(i.targets={x:e,y:s},i.solved=!1)}update(t){this.dt=Math.max(.001,Math.min(.1,t)),this.time+=this.dt,Object.entries(this.chains).forEach(([t,e])=>{e.targets.x!==void 0&&e.targets.y!==void 0&&!e.solved&&this.solveIK(t,e.targets.x,e.targets.y)}),this.applyPhysics()}getJointPositions(){const t={};return Object.entries(this.joints).forEach(([e,s])=>{t[e]={x:s.world.x,y:s.world.y}}),t}getJointRotations(){const t={};return Object.entries(this.joints).forEach(([e,s])=>{t[e]=s.angle}),t}}if("undefined"!=typeof module&&module.exports)module.exports=LogicBakedRuntime;else if("undefined"!=typeof window)window.LogicBakedRuntime=LogicBakedRuntime;
  `.trim();
  
  // Calculate sizes
  const dataSize = JSON.stringify(character).length;
  const runtimeSize = runtimeScript.length;
  
  const exportData: LogicBakedExport = {
    character,
    runtime: runtimeScript,
    size: {
      total: dataSize + runtimeSize,
      runtime: runtimeSize,
      data: dataSize,
    },
  };
  
  return exportData;
};

// Download logic-baked character as JSON file
export const downloadLogicBakedCharacter = (
  exportData: LogicBakedExport,
  filename?: string
): void => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const finalFilename = filename || `logic-baked-${exportData.character.name}-${timestamp}.json`;
  
  // Create download package
  const packageData = {
    ...exportData,
    metadata: {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      runtime: 'Logic-Baked Runtime v1.0.0',
      description: 'Character with embedded physics constants and runtime engine',
    },
  };
  
  const blob = new Blob([JSON.stringify(packageData, null, 2)], {
    type: 'application/json',
  });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = finalFilename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Cleanup
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

// Generate standalone HTML with embedded runtime
export const generateLogicBakedHTML = (
  exportData: LogicBakedExport,
  options: {
    width?: number;
    height?: number;
    showControls?: boolean;
  } = {}
): string => {
  const { width = 800, height = 600, showControls = true } = options;
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${exportData.character.name} - Logic-Baked Character</title>
    <style>
        body { margin: 0; padding: 20px; font-family: Arial, sans-serif; background: #1a1a1a; color: #fff; }
        canvas { border: 1px solid #444; background: #000; }
        .controls { margin-top: 20px; padding: 15px; background: #2a2a2a; border-radius: 8px; }
        .control-group { margin-bottom: 10px; }
        label { display: inline-block; width: 120px; }
        input { margin: 0 10px; }
        button { margin: 5px; padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #005a9e; }
    </style>
</head>
<body>
    <h1>${exportData.character.name}</h1>
    <p>${exportData.character.description}</p>
    <canvas id="canvas" width="${width}" height="${height}"></canvas>
    
    ${showControls ? `
    <div class="controls">
        <div class="control-group">
            <label>Target X:</label>
            <input type="range" id="targetX" min="-200" max="200" value="0">
            <span id="targetXValue">0</span>
        </div>
        <div class="control-group">
            <label>Target Y:</label>
            <input type="range" id="targetY" min="-200" max="200" value="0">
            <span id="targetYValue">0</span>
        </div>
        <div class="control-group">
            <button onclick="resetPose()">Reset Pose</button>
            <button onclick="toggleAnimation()">Toggle Animation</button>
        </div>
        <div class="control-group">
            <small>Runtime: ${exportData.size.runtime} bytes | Data: ${exportData.size.data} bytes</small>
        </div>
    </div>
    ` : ''}
    
    <script>
        // Embedded runtime
        ${exportData.runtime}
        
        // Character data
        const characterData = ${JSON.stringify(exportData.character)};
        
        // Initialize runtime
        const runtime = new LogicBakedRuntime(characterData);
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        
        let animationId = null;
        let isAnimating = true;
        
        // Mouse interaction
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left - canvas.width/2;
            const y = e.clientY - rect.top - canvas.height/2;
            
            // Set IK target for right hand
            runtime.setTarget('r_arm', x, y);
        });
        
        // Update controls
        if (showControls) {
            const targetXSlider = document.getElementById('targetX');
            const targetYSlider = document.getElementById('targetY');
            const targetXValue = document.getElementById('targetXValue');
            const targetYValue = document.getElementById('targetYValue');
            
            targetXSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                targetXValue.textContent = value;
                runtime.setTarget('r_arm', value, parseFloat(targetYSlider.value));
            });
            
            targetYSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                targetYValue.textContent = value;
                runtime.setTarget('r_arm', parseFloat(targetXSlider.value), value);
            });
        }
        
        function resetPose() {
            Object.keys(runtime.joints).forEach(id => {
                const joint = runtime.joints[id];
                joint.angle = joint.restRotation;
                joint.vel = 0;
                joint.acc = 0;
            });
            runtime.updateWorldPositions();
        }
        
        function toggleAnimation() {
            isAnimating = !isAnimating;
        }
        
        function render() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Save context
            ctx.save();
            
            // Move to center
            ctx.translate(canvas.width/2, canvas.height/2);
            
            // Draw skeleton
            const positions = runtime.getJointPositions();
            const rotations = runtime.getJointRotations();
            
            // Draw bones
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 2;
            Object.entries(characterData.joints).forEach(([id, joint]) => {
                if (joint.parent) {
                    const parent = positions[joint.parent];
                    const current = positions[id];
                    if (parent && current) {
                        ctx.beginPath();
                        ctx.moveTo(parent.x, parent.y);
                        ctx.lineTo(current.x, current.y);
                        ctx.stroke();
                    }
                }
            });
            
            // Draw joints
            ctx.fillStyle = '#ff6b6b';
            Object.entries(positions).forEach(([id, pos]) => {
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
                ctx.fill();
            });
            
            // Draw target
            if (runtime.chains.r_arm && runtime.chains.r_arm.targets.x !== undefined) {
                ctx.fillStyle = '#ffff00';
                ctx.beginPath();
                ctx.arc(runtime.chains.r_arm.targets.x, runtime.chains.r_arm.targets.y, 8, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Restore context
            ctx.restore();
            
            // Update physics
            if (isAnimating) {
                runtime.update(1/60);
            }
            
            animationId = requestAnimationFrame(render);
        }
        
        // Start rendering
        render();
    </script>
</body>
</html>
  `.trim();
};

// Download standalone HTML
export const downloadLogicBakedHTML = (
  exportData: LogicBakedExport,
  options?: { width?: number; height?: number; showControls?: boolean }
): void => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `logic-baked-${exportData.character.name}-${timestamp}.html`;
  
  const html = generateLogicBakedHTML(exportData, options);
  const blob = new Blob([html], { type: 'text/html' });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Cleanup
  setTimeout(() => URL.revokeObjectURL(url), 100);
};
