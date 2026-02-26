// ─── TYPES (shared by modelData, CanvasGrid, ikSolver) ────────────────────────
export interface JointDefinition { parent: string | null; pivot: [number, number]; color: string; label: string; }
export type IKActivationStage = "arm" | "leg" | "spine_head";
export interface IKChain {
  joints: string[];
  effector: string;
  priority?: number;
  stretchRatio?: number;
  curveStrength?: number;
  poleAngle?: number;
  activationStage?: IKActivationStage;
  maxIterations?: number;
  epsilon?: number;
  damping?: number;
  convergenceThreshold?: number;
  poleWeight?: number;
  poleDirection?: -1 | 0 | 1;
}
export interface JointLimits { min: number; max: number; allow360?: boolean; }
export type Pose = { [jointId: string]: number };
export interface ShapeDefinition { type: string; len?: number; rPivot?: number; rTip?: number; r?: number; rt?: number; dir?: number; rTop?: number; rBot?: number; }
export type SkeletonRotations = { [jointId: string]: number };
export interface WorldCoords { x: number; y: number; angle: number; parentAngle?: number; }

// ─── JOINT HIERARCHY (Bitruvius Core Engine Spec: Production Mode) ───────────
export const JOINT_DEFS: { [key: string]: JointDefinition } = {
  root:       { parent:null,          pivot:[0,0],    color:"#000000", label:"Root"       },
  pelvis:     { parent:"root",        pivot:[0,0],    color:"#888888", label:"Pelvis"     },
  torso_base: { parent:"pelvis",      pivot:[0,0],    color:"#666666", label:"Torso Base" },
  xiphoid:    { parent:"torso_base",  pivot:[0,-20],  color:"#aaaaaa", label:"Spine_A"    },
  spine_b:    { parent:"xiphoid",     pivot:[0,-73],  color:"#999999", label:"Spine_B"    },
  collar:     { parent:"spine_b",     pivot:[0,-13],  color:"#333333", label:"Collar_Joint" },
  neck:       { parent:"collar",      pivot:[0,0],    color:"#777777", label:"Neck_A"      },
  nose:       { parent:"neck",        pivot:[0,-24],  color:"#444444", label:"Nose"        },
  head:       { parent:"nose",        pivot:[0,-10],  color:"#888888", label:"Cranium"    },

  l_shoulder: { parent:"collar",      pivot:[-34,0],  color:"#aaaaaa", label:"Arm_A_L"    },
  l_elbow:    { parent:"l_shoulder",  pivot:[-106,0], color:"#aaaaaa", label:"Arm_B_L"    },
  l_palm:     { parent:"l_elbow",     pivot:[-75,0],  color:"#777777", label:"Hand_A_L"   },

  r_shoulder: { parent:"collar",      pivot:[34,0],   color:"#aaaaaa", label:"Arm_A_R"    },
  r_elbow:    { parent:"r_shoulder",  pivot:[106,0],  color:"#aaaaaa", label:"Arm_B_R"    },
  r_palm:     { parent:"r_elbow",     pivot:[75,0],   color:"#777777", label:"Hand_A_R"   },

  l_hip:      { parent:"pelvis",      pivot:[-11,0],  color:"#aaaaaa", label:"Leg_A_L"    },
  l_knee:     { parent:"l_hip",       pivot:[0,148],  color:"#aaaaaa", label:"Leg_B_L"    },
  l_heel:     { parent:"l_knee",      pivot:[0,95],   color:"#777777", label:"Foot_A_L"   },

  r_hip:      { parent:"pelvis",      pivot:[11,0],   color:"#aaaaaa", label:"Leg_A_R"    },
  r_knee:     { parent:"r_hip",       pivot:[0,148],  color:"#aaaaaa", label:"Leg_B_R"    },
  r_heel:     { parent:"r_knee",      pivot:[0,95],   color:"#777777", label:"Foot_A_R"   },
};

const pivotLength = (jointId: string): number => {
  const def = JOINT_DEFS[jointId];
  if (!def) return 0;
  return Math.hypot(def.pivot[0], def.pivot[1]);
};

const ZERO_POSE = Object.keys(JOINT_DEFS).reduce((acc, jointId) => {
  acc[jointId] = 0;
  return acc;
}, {} as SkeletonRotations);

// Neutral FK baseline used for FK-first validation and IK handoff seeding.
export const NEUTRAL_POSE: Pose = Object.freeze({
  ...ZERO_POSE,
});

// Locked model proportions used by FK + IK tests and runtime assertions.
export const MODEL_PROPORTIONS = Object.freeze({
  upperArm: pivotLength("l_elbow"),
  forearm: pivotLength("l_palm"),
  thigh: pivotLength("l_knee"),
  shin: pivotLength("l_heel"),
  neck: pivotLength("nose"),
  head: pivotLength("head"),
});

// IK chains: hands, feet, head; shoulders, knees, hips; arms, legs; spine; core
export const IK_CHAINS: { [key: string]: IKChain } = {
  l_hand:     { joints:["l_elbow","l_palm"], effector:"l_palm", priority:52, stretchRatio:1.1, curveStrength:0.4, poleAngle: 0, activationStage:"arm", maxIterations:18, epsilon:0.25, damping:0.12, convergenceThreshold:0.2, poleWeight:0.4, poleDirection:-1 },
  r_hand:     { joints:["r_elbow","r_palm"], effector:"r_palm", priority:53, stretchRatio:1.1, curveStrength:0.4, poleAngle: 0, activationStage:"arm", maxIterations:18, epsilon:0.25, damping:0.12, convergenceThreshold:0.2, poleWeight:0.4, poleDirection:1 },
  l_foot:     { joints:["l_knee","l_heel"], effector:"l_heel", priority:50, stretchRatio:1.05, curveStrength:0.3, poleAngle: 0, activationStage:"leg", maxIterations:20, epsilon:0.2, damping:0.1, convergenceThreshold:0.16, poleWeight:0.3, poleDirection:-1 },
  r_foot:     { joints:["r_knee","r_heel"], effector:"r_heel", priority:51, stretchRatio:1.05, curveStrength:0.3, poleAngle: 0, activationStage:"leg", maxIterations:20, epsilon:0.2, damping:0.1, convergenceThreshold:0.16, poleWeight:0.3, poleDirection:1 },
  head:       { joints:["spine_b","collar","neck","nose","head"], effector:"head", priority:55, stretchRatio:1.1, curveStrength:0.5, poleAngle: 0, activationStage:"spine_head", maxIterations:24, epsilon:0.22, damping:0.2, convergenceThreshold:0.18, poleWeight:0.18, poleDirection:0 },
  l_shoulder: { joints:["spine_b","collar","l_shoulder"], effector:"l_shoulder", priority:45, stretchRatio:1.05, curveStrength:0.3, poleAngle: 0, activationStage:"arm", maxIterations:18, epsilon:0.3, damping:0.14, convergenceThreshold:0.22, poleWeight:0.25, poleDirection:-1 },
  r_shoulder: { joints:["spine_b","collar","r_shoulder"], effector:"r_shoulder", priority:46, stretchRatio:1.05, curveStrength:0.3, poleAngle: 0, activationStage:"arm", maxIterations:18, epsilon:0.3, damping:0.14, convergenceThreshold:0.22, poleWeight:0.25, poleDirection:1 },
  l_knee:     { joints:["l_hip","l_knee"], effector:"l_knee", priority:25, stretchRatio:1.02, curveStrength:0.2, poleAngle: 0, activationStage:"leg", maxIterations:16, epsilon:0.2, damping:0.08, convergenceThreshold:0.16, poleWeight:0.2, poleDirection:-1 },
  r_knee:     { joints:["r_hip","r_knee"], effector:"r_knee", priority:26, stretchRatio:1.02, curveStrength:0.2, poleAngle: 0, activationStage:"leg", maxIterations:16, epsilon:0.2, damping:0.08, convergenceThreshold:0.16, poleWeight:0.2, poleDirection:1 },
  l_hip:      { joints:["pelvis","l_hip"], effector:"l_hip", priority:22, stretchRatio:1.02, curveStrength:0.2, poleAngle: 0, activationStage:"leg", maxIterations:14, epsilon:0.2, damping:0.08, convergenceThreshold:0.16, poleWeight:0.15, poleDirection:-1 },
  r_hip:      { joints:["pelvis","r_hip"], effector:"r_hip", priority:23, stretchRatio:1.02, curveStrength:0.2, poleAngle: 0, activationStage:"leg", maxIterations:14, epsilon:0.2, damping:0.08, convergenceThreshold:0.16, poleWeight:0.15, poleDirection:1 },
  l_arm:      { joints:["l_shoulder","l_elbow","l_palm"], effector:"l_palm", priority:40, stretchRatio:1.2, curveStrength:0.6, poleAngle: 0, activationStage:"arm", maxIterations:20, epsilon:0.25, damping:0.15, convergenceThreshold:0.2, poleWeight:0.45, poleDirection:-1 },
  r_arm:      { joints:["r_shoulder","r_elbow","r_palm"], effector:"r_palm", priority:41, stretchRatio:1.2, curveStrength:0.6, poleAngle: 0, activationStage:"arm", maxIterations:20, epsilon:0.25, damping:0.15, convergenceThreshold:0.2, poleWeight:0.45, poleDirection:1 },
  l_leg:      { joints:["l_hip","l_knee","l_heel"], effector:"l_heel", priority:20, stretchRatio:1.1, curveStrength:0.4, poleAngle: 0, activationStage:"leg", maxIterations:22, epsilon:0.2, damping:0.1, convergenceThreshold:0.16, poleWeight:0.35, poleDirection:-1 },
  r_leg:      { joints:["r_hip","r_knee","r_heel"], effector:"r_heel", priority:21, stretchRatio:1.1, curveStrength:0.4, poleAngle: 0, activationStage:"leg", maxIterations:22, epsilon:0.2, damping:0.1, convergenceThreshold:0.16, poleWeight:0.35, poleDirection:1 },
  spine:      { joints:["pelvis","torso_base","xiphoid","spine_b","collar","neck","head"], effector:"head", priority:30, stretchRatio:1.15, curveStrength:0.6, poleAngle: 0, activationStage:"spine_head", maxIterations:26, epsilon:0.24, damping:0.22, convergenceThreshold:0.2, poleWeight:0.2, poleDirection:0 },
  core:       { joints:["torso_base","xiphoid","spine_b","collar","nose","head"], effector:"head", priority:10, stretchRatio:1.1, curveStrength:0.3, poleAngle: 0, activationStage:"spine_head", maxIterations:12, epsilon:0.35, damping:0.25, convergenceThreshold:0.25, poleWeight:0.1, poleDirection:0 },
};

export const CHAIN_LABELS: { [key: string]: string } = {
  l_hand:"Left Hand (IK)", r_hand:"Right Hand (IK)", l_foot:"Left Foot (IK)", r_foot:"Right Foot (IK)",
  head:"Head (IK)", l_shoulder:"L Shoulder (IK)", r_shoulder:"R Shoulder (IK)",
  l_knee:"L Knee (IK)", r_knee:"R Knee (IK)", l_hip:"L Hip (IK)", r_hip:"R Hip (IK)",
  l_arm:"Left Arm (IK)", r_arm:"Right Arm (IK)", l_leg:"Left Leg (IK)", r_leg:"Right Leg (IK)",
  spine:"Full Spine (IK)", core:"Core (IK)"
};

// Descriptive labels for mask menu - more human-friendly names
export const MASK_MENU_LABELS: { [key: string]: string } = {
  root: "Root Base",
  pelvis: "Pelvis/Hips",
  torso_base: "Lower Torso",
  xiphoid: "Upper Spine",
  spine_b: "Mid Spine", 
  collar: "Collar/Shoulders",
  neck: "Neck",
  nose: "Nose Tip",
  head: "Head/Skull",
  l_shoulder: "Left Shoulder",
  l_elbow: "Left Elbow",
  l_palm: "Left Hand",
  r_shoulder: "Right Shoulder", 
  r_elbow: "Right Elbow",
  r_palm: "Right Hand",
  l_hip: "Left Hip",
  l_knee: "Left Knee",
  l_heel: "Left Foot",
  r_hip: "Right Hip",
  r_knee: "Right Knee", 
  r_heel: "Right Foot",
};

// Mask mirroring mappings for arm and leg parts
export const MASK_MIRROR_MAPPINGS: { [key: string]: string } = {
  // Arm mirroring (left <-> right)
  'l_shoulder': 'r_shoulder',
  'l_elbow': 'r_elbow', 
  'l_palm': 'r_palm',
  'r_shoulder': 'l_shoulder',
  'r_elbow': 'l_elbow',
  'r_palm': 'l_palm',
  
  // Leg mirroring (left <-> right)
  'l_hip': 'r_hip',
  'l_knee': 'r_knee',
  'l_heel': 'r_heel',
  'r_hip': 'l_hip',
  'r_knee': 'l_knee',
  'r_heel': 'l_heel',
};

export const JOINT_LIMITS: { [key: string]: JointLimits } = {
  root:      { min:-180, max:180, allow360: true },
  pelvis:    { min:-45,  max:45  },
  torso_base:{ min:-35,  max:35  },
  l_shoulder:{ min:-170, max:50  }, r_shoulder:{ min:-50,  max:170 },
  l_elbow:   { min:-145, max:0   }, r_elbow:   { min:0,    max:145 },
  l_palm:    { min:-90,  max:90  }, r_palm:    { min:-90,  max:90  },
  l_hip:     { min:-90,  max:120 }, r_hip:     { min:-120, max:90  },
  l_knee:    { min:0,    max:145 }, r_knee:    { min:-145, max:0   },
  l_heel:    { min:-45,  max:45  }, r_heel:    { min:-45,  max:45  },
  xiphoid:   { min:-30,  max:30  }, spine_b:   { min:-30,  max:30  }, collar:    { min:-30,  max:30  },
  neck:      { min:-45,  max:45  },
  nose:      { min:-45,  max:45  }, head:      { min:-30,  max:30  },
};

export const POSES: { [key: string]: Pose } = {
  "Neutral":   { ...NEUTRAL_POSE },
  "T-Pose":    { ...NEUTRAL_POSE, head:0, l_shoulder:-10, l_elbow:5, r_shoulder:10, r_elbow:-5, l_heel:90, r_heel:-90 },
  "A-Pose":    { l_shoulder:-35, r_shoulder:35, l_hip:-15, r_hip:15 },
  "Idle":      { l_shoulder:-20, r_shoulder:20, l_elbow:-15, r_elbow:15, l_hip:-10, r_hip:10 },
  "Walk-L":    { l_hip:-25, r_hip:15, l_knee:10, r_knee:-20, l_shoulder:20, r_shoulder:-20 },
  "Walk-R":    { l_hip:15, r_hip:-25, l_knee:20, r_knee:-10, l_shoulder:-20, r_shoulder:20 },
  "Run-L":     { l_hip:-42, r_hip:26, l_knee:32, r_knee:-42, l_heel:18, r_heel:-10, l_shoulder:40, r_shoulder:-40, xiphoid:-8 },
  "Run-R":     { l_hip:26, r_hip:-42, l_knee:42, r_knee:-32, l_heel:-10, r_heel:18, l_shoulder:-40, r_shoulder:40, xiphoid:-8 },
  "Crouch":    { l_hip:-15, r_hip:15, l_knee:60, r_knee:-60, xiphoid:20 },
  "Sit":       { l_hip:-58, r_hip:58, l_knee:95, r_knee:-95, xiphoid:14, spine_b:10, l_shoulder:-18, r_shoulder:18 },
  "Jump":      { l_hip:-24, r_hip:24, l_knee:30, r_knee:-30, l_shoulder:-118, r_shoulder:118, neck:-8, head:-5 },
  "Reach-Up":  { l_shoulder:-145, r_shoulder:145, l_elbow:-22, r_elbow:22, xiphoid:-10, neck:6 },
  "Victory":   { l_shoulder:-130, r_shoulder:130, l_elbow:-35, r_elbow:35, l_palm:30, r_palm:-30, neck:-6, head:-4 },
  "Guard":     { l_shoulder:-38, r_shoulder:38, l_elbow:-95, r_elbow:95, l_palm:25, r_palm:-25, xiphoid:-4 },
  "Bow":       { xiphoid:26, spine_b:22, neck:18, head:14, l_hip:14, r_hip:-14, l_knee:10, r_knee:-10, l_shoulder:-20, r_shoulder:20 },
  "Lean-L":    { pelvis:-12, xiphoid:-14, spine_b:-8, collar:-6, l_hip:8, r_hip:18, l_shoulder:-25, r_shoulder:12 },
  "Lean-R":    { pelvis:12, xiphoid:14, spine_b:8, collar:6, l_hip:-18, r_hip:-8, l_shoulder:-12, r_shoulder:25 },
  "Kick-L":    { l_hip:-62, r_hip:20, l_knee:18, r_knee:-36, l_heel:22, r_heel:-8, l_shoulder:28, r_shoulder:-32 },
  "Kick-R":    { l_hip:20, r_hip:-62, l_knee:36, r_knee:-18, l_heel:-8, r_heel:22, l_shoulder:-32, r_shoulder:28 },
  "Handshake": { l_shoulder:0, r_shoulder:0, l_elbow:-45, r_elbow:-45, l_palm:0, r_palm:0 },
};

export const SHAPES_DEFS: { [key: string]: ShapeDefinition } = {
  pelvis:    {type:"waist", r:22},
  xiphoid:   {type:"torsoWaistPivot"}, spine_b:   {type:"none"}, collar:    {type:"collar"},
  neck:      {type:"neck"},    head:      {type:"customTorsoHead"},
  nose:      {type:"none"},
  l_shoulder:{type:"arm",len:106,rPivot:15,rTip:4,dir:-1}, l_elbow:{type:"arm",len:75,rPivot:5.5,rTip:1,dir:-1},
  l_palm:    {type:"hand",r:7,rt:1.5,dir:-1},
  r_shoulder:{type:"arm",len:106,rPivot:15,rTip:4,dir:1},  r_elbow:{type:"arm",len:75,rPivot:5.5,rTip:1,dir:1},
  r_palm:    {type:"hand",r:7,rt:1.5,dir:1},
  l_hip: {type:"leg",len:148,rTop:7,rBot:4}, l_knee:{type:"leg",len:95,rTop:8,rBot:3}, l_heel:{type:"foot",len:48,r:9},
  r_hip: {type:"leg",len:148,rTop:7,rBot:4}, r_knee:{type:"leg",len:95,rTop:8,rBot:3}, r_heel:{type:"foot",len:48,r:9},
};

export const RENDER_ORDER = [
  "l_hip","r_hip", "l_knee","r_knee", "l_heel","r_heel",
  "root", "pelvis", "torso_base", "xiphoid","spine_b","collar", "neck","nose","head",
  "l_shoulder","r_shoulder", "l_elbow","r_elbow", "l_palm","r_palm"
];

export const HIERARCHY: [string, number][] = [
  ["root",0], ["pelvis",1], ["torso_base",2], ["xiphoid",3], ["spine_b",4], ["collar",5], ["neck",6], ["nose",7], ["head",8],
  ["l_shoulder",6], ["l_elbow",7], ["l_palm",8],
  ["r_shoulder",6], ["r_elbow",7], ["r_palm",8],
  ["l_hip",2], ["l_knee",3], ["l_heel",4],
  ["r_hip",2], ["r_knee",3], ["r_heel",4]
];

export interface BitruviusData {
  JOINT_DEFS: { [id: string]: JointDefinition };
  IK_CHAINS: { [id: string]: IKChain };
  CHAIN_LABELS: { [id: string]: string };
  MASK_MENU_LABELS: { [id: string]: string };
  MASK_MIRROR_MAPPINGS: { [id: string]: string };
  PRIORITY_ORDER: string[];
  JOINT_LIMITS: { [id: string]: JointLimits };
  POSES: { [id: string]: Pose };
  SHAPES: { [id: string]: ShapeDefinition };
  RENDER_ORDER: string[];
  HIERARCHY: [string, number][];
  initialRotations: SkeletonRotations;
}

export const bitruviusData: BitruviusData = {
  JOINT_DEFS, IK_CHAINS, CHAIN_LABELS, MASK_MENU_LABELS, MASK_MIRROR_MAPPINGS, PRIORITY_ORDER: Object.keys(IK_CHAINS),
  JOINT_LIMITS, POSES, SHAPES: SHAPES_DEFS, RENDER_ORDER, HIERARCHY,
  initialRotations: POSES["T-Pose"]
};
