
import React, { useState, useRef, useCallback } from "react";

// ─── Bitruvius Data Interfaces (Copied from CanvasGrid.tsx for local use) ────────────────────────────────────────────────
interface JointDefinition {
  parent: string | null;
  pivot: [number, number];
  color: string;
  label: string;
}

interface SkeletonRotations {
  [jointId: string]: number;
}

interface IKChain {
  joints: string[];
  effector: string;
  priority: number;
  stretchRatio: number;
  curveStrength: number;
}

interface JointLimits {
  min: number;
  max: number;
}

interface Pose {
  [jointId: string]: number;
}

interface ShapeDefinition {
  type: string;
  len?: number;
  rPivot?: number;
  rTip?: number;
  dir?: number;
  rTop?: number;
  rBot?: number;
  r?: number;
}

interface WorldCoords {
  x: number;
  y: number;
  angle: number;
  parentAngle: number;
}

interface Point {
  x: number;
  y: number;
}

// ─── JOINT HIERARCHY  (Bitruvius Core Motion spec) ───────────────────────────
// root → waist → xiphoid → torso → collar → neck → head
//                                         ├─ l_shoulder → l_elbow → l_hand
//                                         └─ r_shoulder → r_elbow → r_hand
//        ├─ l_hip → l_knee → l_foot
//        └─ r_hip → r_knee → r_foot
// ─────────────────────────────────────────────────────────────────────────────

// Fix: Explicitly type JOINT_DEFS to ensure `pivot` is a [number, number] tuple.
const JOINT_DEFS: { [key: string]: JointDefinition } = {
  root:       { parent:null,          pivot:[0,0],    color:"#ffffff", label:"ROOT"       },
  waist:      { parent:"root",        pivot:[0,0],    color:"#D4C26A", label:"Waist"      },
  xiphoid:    { parent:"waist",       pivot:[0,-34],  color:"#C8A97A", label:"Xiphoid"    },
  torso:      { parent:"xiphoid",     pivot:[0,-34],  color:"#8B7355", label:"Torso"      },
  collar:     { parent:"torso",       pivot:[0,-28],  color:"#5D4037", label:"Collar"     },
  neck:       { parent:"collar",      pivot:[0,-14],  color:"#7B6F5E", label:"Neck"       },
  head:       { parent:"neck",        pivot:[0,-8],   color:"#9B59B6", label:"Head"       },
  l_shoulder: { parent:"collar",      pivot:[-34,0],  color:"#27AE60", label:"L.Shoulder" },
  l_elbow:    { parent:"l_shoulder",  pivot:[-106,0], color:"#2ECC71", label:"L.Elbow"   },
  l_hand:     { parent:"l_elbow",     pivot:[-75,0],  color:"#1A5276", label:"L.Hand"    },
  r_shoulder: { parent:"collar",      pivot:[34,0],   color:"#C0392B", label:"R.Shoulder" },
  r_elbow:    { parent:"r_shoulder",  pivot:[106,0],  color:"#E74C3C", label:"R.Elbow"   },
  r_hand:     { parent:"r_elbow",     pivot:[75,0],   color:"#922B21", label:"R.Hand"    },
  l_hip:      { parent:"waist",       pivot:[0,38],   color:"#1E8449", label:"L.Hip"     },
  l_knee:     { parent:"l_hip",       pivot:[0,110],  color:"#96281B", label:"L.Knee"    },
  l_foot:     { parent:"l_knee",      pivot:[0,95],   color:"#6C3483", label:"L.Foot"    },
  r_hip:      { parent:"waist",       pivot:[0,38],   color:"#239B56", label:"R.Hip"     },
  r_knee:     { parent:"r_hip",       pivot:[0,110],  color:"#B03A2E", label:"R.Knee"    },
  r_foot:     { parent:"r_knee",      pivot:[0,95],   color:"#4A235A", label:"R.Foot"    },
};

// ─── CHAIN TOPOLOGY (spec) ────────────────────────────────────────────────────
const IK_CHAINS: { [key: string]: IKChain } = {
  l_arm: { joints:["l_shoulder","l_elbow","l_hand"], effector:"l_hand", priority:40, stretchRatio:1.32, curveStrength:0.55 },
  r_arm: { joints:["r_shoulder","r_elbow","r_hand"], effector:"r_hand", priority:41, stretchRatio:1.32, curveStrength:0.55 },
  l_leg: { joints:["l_hip","l_knee","l_foot"],       effector:"l_foot", priority:20, stretchRatio:1.12, curveStrength:0.48 },
  r_leg: { joints:["r_hip","r_knee","r_foot"],       effector:"r_foot", priority:21, stretchRatio:1.12, curveStrength:0.48 },
  spine: { joints:["waist","xiphoid","torso","collar","neck"], effector:"neck", priority:30, stretchRatio:1.18, curveStrength:0.6 },
};
const CHAIN_LABELS: { [key: string]: string } = { l_arm:"Left Arm", r_arm:"Right Arm", l_leg:"Left Leg", r_leg:"Right Leg", spine:"Spine" };
const PRIORITY_ORDER = Object.entries(IK_CHAINS).sort((a,b)=>b[1].priority-a[1].priority).map(([k])=>k);

// ─── ANATOMICAL LIMITS (deg) ──────────────────────────────────────────────────
const JOINT_LIMITS: { [key: string]: JointLimits } = {
  l_shoulder:{ min:-170, max:50  }, r_shoulder:{ min:-50,  max:170 },
  l_elbow:   { min:-145, max:0   }, r_elbow:   { min:0,    max:145 },
  l_hip:     { min:-60,  max:120 }, r_hip:     { min:-120, max:60  },
  l_knee:    { min:0,    max:145 }, r_knee:    { min:-145, max:0   },
  torso:     { min:-45,  max:45  }, collar:    { min:-30,  max:30  },
  xiphoid:   { min:-30,  max:30  }, neck:      { min:-45,  max:45  },
};

// ─── POSE PRESETS ─────────────────────────────────────────────────────────────
const POSES: { [key: string]: Pose } = {
  "T-Pose":  { l_hip:-20, r_hip:20 },
  "A-Pose":  { l_shoulder:-35, r_shoulder:35, l_hip:-25, r_hip:25 },
  "Idle":    { l_shoulder:-20, r_shoulder:20, l_elbow:-15, r_elbow:15, l_hip:-18, r_hip:18 },
  "Jump":    { l_shoulder:-80, r_shoulder:80, l_elbow:-30, r_elbow:30, l_hip:-40, r_hip:40, l_knee:20, r_knee:-20 },
  "Walk-L":  { l_hip:-35, r_hip:5, l_knee:10, r_knee:-20, l_shoulder:20, r_shoulder:-20 },
  "Crouch":  { l_hip:-15, r_hip:15, l_knee:60, r_knee:-60, torso:20 },
};

// ─── MATH ─────────────────────────────────────────────────────────────────────
const d2r = (d: number) => d * Math.PI / 180;
const r2d = (r: number) => r * 180 / Math.PI;
const clamp = (v: number, a: number, b: number) => Math.max(a,Math.min(b,v));
const normA = (a: number) => ((a % 360) + 540) % 360 - 180;
const hyp = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay);

// ─── WORLD TRANSFORM ─────────────────────────────────────────────────────────
function computeWorld(jointId: string, rotations: SkeletonRotations, origin: [number, number]): WorldCoords {
  const path: string[] = [];
  let cur: string | null = jointId;
  while (cur) { path.unshift(cur); cur = JOINT_DEFS[cur]?.parent; }
  let wx=origin[0], wy=origin[1], wa=0, pa=0;
  for (const j of path) {
    if (j==="root") continue;
    const [px,py] = JOINT_DEFS[j].pivot;
    const c=Math.cos(wa), s=Math.sin(wa);
    wx += px*c - py*s;
    wy += px*s + py*c;
    pa = wa;
    wa += d2r(rotations[j]||0);
  }
  return { x:wx, y:wy, angle:r2d(wa), parentAngle:r2d(pa) };
}

// ─── FABRIK SOLVE (world-space pts) ──────────────────────────────────────────
function fabrikSolve(pts: number[][], lens: number[], tx: number, ty: number, maxIter: number, eps: number): number[][] {
  const n=pts.length;
  const root=[pts[0][0],pts[0][1]];
  const total=lens.reduce((s,l)=>s+l,0);
  if (hyp(root[0],root[1],tx,ty)>=total) {
    // Fully extended
    let cx=root[0],cy=root[1];
    for (let i=0;i<n-1;i++){
      const dx=tx-cx,dy=ty-cy,d=Math.hypot(dx,dy)||1;
      pts[i]=[cx,cy]; cx+=dx/d*lens[i]; cy+=dy/d*lens[i];
    }
    pts[n-1]=[cx,cy]; return pts;
  }
  for (let it=0;it<maxIter;it++){
    pts[n-1]=[tx,ty];
    for (let i=n-2;i>=0;i--){const dx=pts[i][0]-pts[i+1][0],dy=pts[i][1]-pts[i+1][1],d=Math.hypot(dx,dy)||1;pts[i]=[pts[i+1][0]+dx/d*lens[i],pts[i+1][1]+dy/d*lens[i]];}
    pts[0]=[...root];
    for (let i=0;i<n-1;i++){const dx=pts[i+1][0]-pts[i][0],dy=pts[i+1][1]-pts[i][1],d=Math.hypot(dx,dy)||1;pts[i+1]=[pts[i][0]+dx/d*lens[i],pts[i][1]+dy/d*lens[i]];}
    if (hyp(pts[n-1][0],pts[n-1][1],tx,ty)<eps) break;
  }
  return pts;
}

// ─── CCD SOLVE ────────────────────────────────────────────────────────────────
function ccdSolve(pts: number[][], lens: number[], tx: number, ty: number, maxIter: number, eps: number): number[][] {
  const n=pts.length;
  for (let it=0;it<maxIter;it++){
    for (let i=n-2;i>=0;i--){
      const [jx,jy]=pts[i],[ex,ey]=pts[n-1];
      const a1=Math.atan2(ey-jy,ex-jx), a2=Math.atan2(ty-jy,tx-jx);
      const da=a2-a1; const c=Math.cos(da),s=Math.sin(da);
      for (let k=i+1;k<n;k++){const dx=pts[k][0]-jx,dy=pts[k][1]-jy;pts[k]=[jx+dx*c-dy*s,jy+dx*s+dy*c];}
    }
    if (hyp(pts[n-1][0],pts[n-1][1],tx,ty)<eps) break;
  }
  return pts;
}

// ─── WORLD PTS → LOCAL ROTATIONS ─────────────────────────────────────────────
function ptsToLocalRots(chainJoints: string[], pts: number[][], rotations: SkeletonRotations, origin: [number, number]): SkeletonRotations {
  const out={...rotations};
  // Accumulated parent world angle starting from root joint's parent
  const rootId=chainJoints[0];
  const rootParent=JOINT_DEFS[rootId]?.parent;
  let pwa = (rootParent && rootParent!=="root")
    ? d2r(computeWorld(rootParent, rotations, origin).angle)
    : 0;

  for (let i=0;i<chainJoints.length-1;i++){
    const jId=chainJoints[i];
    const dx=pts[i+1][0]-pts[i][0], dy=pts[i+1][1]-pts[i][1];
    const segAngle=Math.atan2(dy,dx);
    let local=normA(r2d(segAngle-pwa));
    const lim=JOINT_LIMITS[jId];
    if (lim) local=clamp(local,lim.min,lim.max);
    out[jId]=local;
    pwa+=d2r(local);
  }
  return out;
}

// ─── SOLVE ONE CHAIN ──────────────────────────────────────────────────────────
interface SolveChainOptions {
  solver?: "fabrik" | "ccd" | "hybrid";
  stretch?: boolean;
  maxIter?: number;
  eps?: number;
}
function solveChain(chainKey: string, tx: number, ty: number, rotations: SkeletonRotations, origin: [number, number], opts: SolveChainOptions = {}) {
  const ch=IK_CHAINS[chainKey];
  const {solver="fabrik", stretch=false, maxIter=20, eps=0.5}=opts;
  const sr=stretch?ch.stretchRatio:1.0;

  const pts=ch.joints.map(j=>{const w=computeWorld(j,rotations,origin);return[w.x,w.y];});
  const lens=ch.joints.slice(1).map(j=>{const [px,py]=JOINT_DEFS[j].pivot;return Math.hypot(px,py)*sr;});

  let solved;
  if (solver==="ccd") solved=ccdSolve(pts.map(p=>[...p]),lens,tx,ty,maxIter,eps);
  else if (solver==="hybrid") solved=ccdSolve(fabrikSolve(pts.map(p=>[...p]),lens,tx,ty,maxIter,eps),lens,tx,ty,5,eps);
  else solved=fabrikSolve(pts.map(p=>[...p]),lens,tx,ty,maxIter,eps);

  return ptsToLocalRots(ch.joints,solved,rotations,origin);
}

// ─── SHAPES ───────────────────────────────────────────────────────────────────
const torsoHeart  = () => `M 0,58 C -41,30 -44,-12 -11,-28 C -5,-31 0,-32 0,-32 C 0,-32 5,-31 11,-28 C 44,-12 41,30 0,58 Z`;
const waistHeart  = () => `M 0,0 C 38,18 40,52 10,72 C 5,77 0,80 0,80 C 0,80 -5,77 -10,72 C -40,52 -38,18 0,0 Z`;
const collarShape = () => `M -32,-13 C -46,-13 -46,13 -32,13 L -10,9 C -4,9 4,9 10,9 L 32,13 C 46,13 46,-13 32,-13 L 10,-9 C 4,-9 -4,-9 -10,-9 Z`;
const xiphoidShape= () => `M 0,-14 C 9,-10 12,10 0,14 C -12,10 -9,-10 0,-14 Z`;
const neckShape   = () => `M -7,0 C -8,-5 -8,-14 0,-16 C 8,-14 8,-5 7,0 Z`;
const headTri     = () => `M 0,0 L -20,-29 L 20,-29 Z`;
const headSemi    = () => `M -20,-29 A 20,20 0 0 1 20,-29 Z`;
const armBlade    = (len: number,rP: number,rT: number,dir: number) => { const ex=dir*len,c1=dir*len*0.25,c2=dir*len*0.7; return `M 0,${-rP} C ${c1},${-rP} ${c2},${-rT} ${ex},0 C ${c2},${rT} ${c1},${rP} 0,${rP} Z`; };
const handShape   = (dir: number) => { const l=22,r=7,rt=1.5; return `M 0,${-r} C ${dir*l*0.35},${-r} ${dir*l},${-rt} ${dir*l},0 C ${dir*l},${rt} ${dir*l*0.35},${r} 0,${r} Z`; };
const legCapsule  = (len: number,rT: number,rB: number) => `M ${-rT},0 C ${-rT},${len*0.28} ${-rB},${len*0.72} 0,${len} C ${rB},${len*0.72} ${rT},${len*0.28} ${rT},0 Z`;
const footSpike   = (len: number,r: number) => `M ${-r},0 C ${-r},${len*0.38} ${-r*0.25},${len*0.8} 0,${len} C ${r*0.25},${len*0.8} ${r},${len*0.38} ${r},0 Z`;

const SHAPES: { [key: string]: ShapeDefinition } = {
  torso:     {type:"torso"},   waist:     {type:"waist"},
  xiphoid:   {type:"xiphoid"}, collar:    {type:"collar"},
  neck:      {type:"neck"},    head:      {type:"head"},
  l_shoulder:{type:"arm",len:106,rPivot:15,rTip:4,dir:-1}, l_elbow:{type:"arm",len:75,rPivot:11,rTip:2,dir:-1}, l_hand:{type:"hand",dir:-1},
  r_shoulder:{type:"arm",len:106,rPivot:15,rTip:4,dir:1},  r_elbow:{type:"arm",len:75,rPivot:11,rTip:2,dir:1},  r_hand:{type:"hand",dir:1},
  l_hip: {type:"leg",len:110,rTop:18,rBot:8}, l_knee:{type:"leg",len:95,rTop:11,rBot:4}, l_foot:{type:"foot",len:48,r:9},
  r_hip: {type:"leg",len:110,rTop:18,rBot:8}, r_knee:{type:"leg",len:95,rTop:11,rBot:4}, r_foot:{type:"foot",len:48,r:9},
};

const RENDER_ORDER = ["l_hip","r_hip","l_knee","r_knee","l_foot","r_foot","waist","xiphoid","torso","collar","neck","l_shoulder","r_shoulder","l_elbow","r_elbow","l_hand","r_hand","head"];
const HIERARCHY: [string, number][] = [["waist",0],["xiphoid",1],["torso",2],["collar",3],["neck",4],["head",5],["l_shoulder",4],["l_elbow",5],["l_hand",6],["r_shoulder",4],["r_elbow",5],["r_hand",6],["l_hip",1],["l_knee",2],["l_foot",3],["r_hip",1],["r_knee",2],["r_foot",3]];

const ORIGIN: [number, number] = [420, 290];

// ── UI MICRO-COMPONENTS ───────────────────────────────────────────────────────
// Fix: children must be optional to satisfy TypeScript JSX checking when used between tags.
interface SProps {
  label: string;
  children?: React.ReactNode;
  noBorder?: boolean;
}
function S({label,children,noBorder}: SProps){
  return <div style={{padding:"7px 10px",borderBottom:noBorder?"none":"1px solid #161b28",flexShrink:0}}>
    <div style={{fontSize:6.5,color:"#242c3a",letterSpacing:2,marginBottom:5}}>{label}</div>
    {children}
  </div>;
}

interface BProps {
  active: boolean;
  onClick: () => void;
  children?: React.ReactNode;
  sz?: number;
  acc?: string;
  flex?: boolean;
  key?: React.Key;
}
function B({active,onClick,children,sz=9.5,acc="#FFD700",flex}: BProps){
  const rgb={"#FFD700":"255,215,0","#4FC3F7":"79,195,247","#66BB6A":"102,187,106"}[acc]||"255,215,0";
  return <button onClick={onClick} style={{
    display:"block",width:flex?undefined:"100%",flex:flex?1:undefined,
    padding:"4px 7px",marginBottom:2,
    background:active?`rgba(${rgb},0.07)`:"#0e1016",
    color:active?acc:"#333d4a",
    border:`1px solid ${active?acc:"#161b28"}`,
    borderRadius:3,cursor:"pointer",fontSize:sz,textAlign:"left",letterSpacing:1
  }}>{children}</button>;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function BitruviusRig() {
  const [rotations, setRotations] = useState<SkeletonRotations>({l_hip:-20,r_hip:20});
  const [selected, setSelected]   = useState<string | null>(null);
  const [mode, setMode]           = useState<"FK" | "IK" | "PIN">("FK");
  const [ikSolver, setIkSolver]   = useState<"fabrik" | "ccd" | "hybrid">("fabrik");
  const [solveMode, setSolveMode] = useState<"single_chain" | "limbs_only" | "whole_body_graph">("limbs_only");
  const [stretch, setStretch]     = useState(false);
  const [pins, setPins]           = useState<{[key: string]: boolean}>({});
  const [activeChain, setActive]  = useState<string>("l_arm");
  const [ikTargets, setTargets]   = useState<{[key: string]: Point}>({});
  const [showAnchors, setAnchors] = useState(true);
  const [showLabels, setLabels]   = useState(true);
  const [showLimits, setLimits]   = useState(false);
  const [showSkel, setSkel]       = useState(true);
  const [pose, setPose]           = useState<string>("T-Pose");
  const [diag, setDiag]           = useState<{solver: string; mode: string; chains: number; ms: string; residual: string} | null>(null);

  const svgRef  = useRef<SVGSVGElement | null>(null);
  const drag    = useRef<{type:"fk" | "ik", id:string} | null>(null);
  const rotsRef = useRef(rotations);
  rotsRef.current = rotations;
  const tgtsRef = useRef(ikTargets);
  tgtsRef.current = ikTargets;

  const W = (id: string): WorldCoords => computeWorld(id, rotsRef.current, ORIGIN);

  const svgPt = (e: React.MouseEvent<SVGSVGElement>): Point => {
    const svg = svgRef.current;
    if (!svg) return {x: 0, y: 0};
    const rect=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal;
    return { x:(e.clientX-rect.left)*(vb.width/rect.width), y:(e.clientY-rect.top)*(vb.height/rect.height) };
  };

  const runIK = useCallback((activeKey: string, tx: number, ty: number, baseRots: SkeletonRotations) => {
    let keys: string[] = [];
    if (solveMode==="single_chain") keys=[activeKey];
    else if (solveMode==="limbs_only") keys=["l_arm","r_arm","l_leg","r_leg"];
    else keys=PRIORITY_ORDER;

    const t0=performance.now();
    let rots={...baseRots}; let solved=0; let residual=0;

    for (const k of keys) {
      const tgt=k===activeKey?{x:tx,y:ty}:tgtsRef.current[k];
      if (!tgt) continue;
      rots=solveChain(k,tgt.x,tgt.y,rots,ORIGIN,{solver:ikSolver,stretch,maxIter:20,eps:0.5});
      solved++;
    }
    const ch=IK_CHAINS[activeKey];
    if (ch) { const ew=computeWorld(ch.effector,rots,ORIGIN); residual=hyp(ew.x,ew.y,tx,ty); }
    setDiag({solver:ikSolver,mode:solveMode,chains:solved,ms:(performance.now()-t0).toFixed(1),residual:residual.toFixed(1)});
    return rots;
  }, [ikSolver, solveMode, stretch]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const {x:mx,y:my}=svgPt(e);
    if (drag.current.type==="ik") {
      const k=drag.current.id;
      setTargets(t=>({...t,[k]:{x:mx,y:my}}));
      setRotations(runIK(k,mx,my,rotsRef.current));
    } else if (drag.current.type==="fk" && mode==="FK") {
      const id=drag.current.id;
      const w=W(id);
      const pdef=JOINT_DEFS[id]?.parent;
      const pw: WorldCoords = pdef && pdef!=="root" ? computeWorld(pdef,rotsRef.current,ORIGIN) : {x: ORIGIN[0], y: ORIGIN[1], angle:0, parentAngle:0};
      let local=normA(r2d(Math.atan2(my-w.y,mx-w.x))-pw.angle);
      const lim=JOINT_LIMITS[id];
      if(lim) local=clamp(local,lim.min,lim.max);
      setRotations(r=>({...r,[id]:local}));
    }
  },[mode,runIK]);

  const onUp = () => { drag.current=null; };

  const activateIK = (k: string) => {
    const ch=IK_CHAINS[k]; if(!ch) return;
    const w=computeWorld(ch.effector,rotsRef.current,ORIGIN);
    setTargets(t=>({...t,[k]:{x:w.x,y:w.y}}));
    setActive(k); setMode("IK");
  };

  const applyPose = (p: string) => { setRotations({...(POSES[p]||{})}); setPose(p); setDiag(null); };

  const jointIds=Object.keys(JOINT_DEFS).filter(k=>k!=="root");

  const renderJoint = (id: string) => {
    const def=JOINT_DEFS[id], shape=SHAPES[id];
    if (!shape) return null;
    const t=computeWorld(id,rotations,ORIGIN);
    const isSel=selected===id, isPinned=pins[id];
    const stroke=isSel?"#FFD700":isPinned?"#FF6B6B":"rgba(255,255,255,0.1)";
    const sw=isSel?2.5:isPinned?1.5:0.6;
    const fill=def.color;

    let body;
    switch(shape.type){
      case "torso":   body=<path d={torsoHeart()}  fill={fill} stroke={stroke} strokeWidth={sw}/>;break;
      case "waist":   body=<path d={waistHeart()}  fill={fill} stroke={stroke} strokeWidth={sw}/>;break;
      case "xiphoid": body=<path d={xiphoidShape()} fill={fill} stroke={stroke} strokeWidth={sw}/>;break;
      case "collar":  body=<path d={collarShape()} fill={fill} stroke={stroke} strokeWidth={sw}/>;break;
      case "neck":    body=<path d={neckShape()}   fill={fill} stroke={stroke} strokeWidth={sw}/>;break;
      case "head":    body=<g><path d={headTri()}  fill={fill} stroke={stroke} strokeWidth={sw}/><path d={headSemi()} fill={fill} stroke={stroke} strokeWidth={sw}/></g>;break;
      case "arm":     body=<path d={armBlade(shape.len!,shape.rPivot!,shape.rTip!,shape.dir!)} fill={fill} stroke={stroke} strokeWidth={sw}/>;break;
      case "hand":    body=<path d={handShape(shape.dir!)}  fill={fill} stroke={stroke} strokeWidth={sw}/>;break;
      case "leg":     body=<path d={legCapsule(shape.len!,shape.rTop!,shape.rBot!)} fill={fill} stroke={stroke} strokeWidth={sw}/>;break;
      case "foot":    body=<path d={footSpike(shape.len!,shape.r!)} fill={fill} stroke={stroke} strokeWidth={sw}/>;break;
      default: body=null;
    }

    const limArc = showLimits && JOINT_LIMITS[id] ? (()=>{
      const lim=JOINT_LIMITS[id],r=26;
      const a1=d2r(lim.min),a2=d2r(lim.max);
      const x1=r*Math.cos(a1),y1=r*Math.sin(a1),x2=r*Math.cos(a2),y2=r*Math.sin(a2);
      return <path d={`M 0,0 L ${x1},${y1} A ${r},${r} 0 ${lim.max-lim.min>180?1:0} 1 ${x2},${y2} Z`} fill="rgba(255,215,0,0.05)" stroke="rgba(255,215,0,0.18)" strokeWidth={0.5}/>;
    })() : null;

    return (
      <g key={id} transform={`translate(${t.x},${t.y}) rotate(${t.angle})`}
        onClick={(e)=>{e.stopPropagation();if(mode==="PIN"){setPins(p=>({...p,[id]:!p[id]}));return;}setSelected(s=>s===id?null:id);}}
        onMouseDown={(e)=>{e.stopPropagation();if(mode==="FK")drag.current={type:"fk",id};}}
        style={{cursor:mode==="FK"?"grab":"pointer"}}
      >
        {body}{limArc}
        {showAnchors&&<circle cx={0} cy={0} r={3.5} fill={isPinned?"#FF6B6B":"#00FFFF"} stroke="#000" strokeWidth={0.7} opacity={0.9}/>}
        {showLabels&&<text x={0} y={-7} textAnchor="middle" fontSize={6.5} fill="rgba(255,255,255,0.6)" style={{pointerEvents:"none",fontFamily:"monospace"}}>{def.label}</text>}
      </g>
    );
  };

  return (
    <div style={{display:"flex",height:"100vh",background:"#08090d",fontFamily:"'Courier New',monospace",color:"#8a90a0",overflow:"hidden",userSelect:"none"}}>

      {/* LEFT PANEL */}
      <div style={{width:188,background:"#0b0d14",borderRight:"1px solid #161b28",display:"flex",flexDirection:"column",overflowY:"auto",flexShrink:0}}>
        <div style={{padding:"9px 12px 8px",fontSize:9,letterSpacing:4,color:"#FFD700",borderBottom:"1px solid #161b28",background:"#090b11"}}>BITRUVIUS RIG</div>

        <S label="MODE" noBorder={true}>
          <>
            {[["FK","Forward Kinematics"],["IK","Inverse Kinematics"],["PIN","Pin Joints"]].map(([m,desc])=>(
              <B key={m} active={mode===m} acc="#FFD700" onClick={()=>setMode(m as "FK" | "IK" | "PIN")}>
                <b style={{fontSize:10}}>{m}</b><span style={{color:"#333",fontSize:7,marginLeft:5}}>{desc}</span>
              </B>
            ))}
          </>
        </S>

        {mode==="IK"&&<>
          <S label="IK SOLVER" noBorder={true}>
            <>
              {[["fabrik","FABRIK"],["ccd","CCD"],["hybrid","Hybrid"]].map(([k,l])=>(
                <B key={k} active={ikSolver===k} acc="#4FC3F7" onClick={()=>setIkSolver(k as "fabrik" | "ccd" | "hybrid")} sz={9}>{l}</B>
              ))}
            </>
          </S>
          <S label="SOLVE MODE" noBorder={true}>
            <>
              {[["single_chain","Single Chain"],["limbs_only","Limbs Only"],["whole_body_graph","Whole Body"]].map(([k,l])=>(
                <B key={k} active={solveMode===k} acc="#4FC3F7" onClick={()=>setSolveMode(k as "single_chain" | "limbs_only" | "whole_body_graph")} sz={8}>{l}</B>
              ))}
            </>
          </S>
          <S label="CHAINS" noBorder={true}>
            <>
              {Object.entries(IK_CHAINS).map(([k,ch])=>(
                <div key={k} style={{display:"flex",gap:3,marginBottom:2}}>
                  <B key={`btn-${k}`} active={activeChain===k} acc="#4FC3F7" onClick={()=>setActive(k)} sz={9} flex={true}>{CHAIN_LABELS[k]}</B>
                  <button onClick={()=>activateIK(k)} title="Place target at effector" style={{padding:"3px 6px",background:ikTargets[k]?"#0d2a18":"#0f1118",color:ikTargets[k]?"#4ade80":"#333",border:"1px solid "+(ikTargets[k]?"#4ade80":"#161b28"),borderRadius:3,cursor:"pointer",fontSize:9,flexShrink:0}}>{ikTargets[k]?"✓":"+"}</button>
                </div>
              ))}
              <button onClick={()=>setTargets({})} style={{width:"100%",padding:"3px 0",marginTop:2,background:"#130909",color:"#FF6B6B",border:"1px solid #261010",borderRadius:3,cursor:"pointer",fontSize:8,letterSpacing:1}}>✕ Clear Targets</button>
            </>
          </S>
          <S label="OPTIONS" noBorder={true}>
            <>
              <label style={{display:"flex",alignItems:"center",gap:6,fontSize:8,cursor:"pointer"}}>
                <input type="checkbox" checked={stretch} onChange={e=>setStretch(e.target.checked)} style={{accentColor:"#4FC3F7"}}/>
                <span style={{color:"#666"}}>Soft Stretch</span>
              </label>
            </>
          </S>
        </>}

        <S label="POSE PRESETS" noBorder={true}>
          <>
            {Object.keys(POSES).map(p=>(
              <B key={p} active={pose===p} acc="#66BB6A" onClick={()=>applyPose(p)} sz={9}>{p}</B>
            ))}
          </>
        </S>

        <S label="VIEW" noBorder={true}>
          <>
            {([
              ["Anchors",showAnchors,setAnchors],
              ["Labels",showLabels,setLabels],
              ["Joint Limits",showLimits,setLimits],
              ["Skeleton Lines",showSkel,setSkel]
            ] as [string, boolean, React.Dispatch<React.SetStateAction<boolean>>][]).map(([l,v,s])=>(
              <label key={l} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,cursor:"pointer",fontSize:8}}>
                <input type="checkbox" checked={v} onChange={e=>s(e.target.checked)} style={{accentColor:"#FFD700"}}/>
                <span style={{color:"#555"}}>{l}</span>
              </label>
            ))}
          </>
        </S>

        <S label="HIERARCHY" noBorder={true}>
          <>
            {HIERARCHY.map(([id,depth])=>(
              <div key={id} onClick={()=>setSelected(s=>s===id?null:id)} style={{display:"flex",alignItems:"center",gap:3,padding:`1px 0 1px ${depth*7}px`,cursor:"pointer",color:selected===id?"#FFD700":pins[id]?"#FF6B6B":"#4a5060",fontSize:8,background:selected===id?"rgba(255,215,0,0.05)":"transparent",borderRadius:2}}>
                <span style={{color:JOINT_DEFS[id]?.color||"#fff",fontSize:5}}>◆</span><span>{id}</span>
                {pins[id]&&<span style={{color:"#FF6B6B",fontSize:7,marginLeft:"auto",paddingRight:3}}>📌</span>}
              </div>
            ))}
          </>
        </S>
      </div>

      {/* VIEWPORT */}
      <div style={{flex:1,position:"relative",overflow:"hidden"}}>
        <svg ref={svgRef} width="100%" height="100%" viewBox="0 0 840 620" style={{display:"block"}} onMouseLeave={onUp} onMouseMove={onMouseMove} onMouseUp={onUp}>
          <defs>
            <pattern id="g1" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0L0 0 0 40" fill="none" stroke="#0d0f1a" strokeWidth={0.6}/></pattern>
            <pattern id="g2" width="200" height="200" patternUnits="userSpaceOnUse"><path d="M200 0L0 0 0 200" fill="none" stroke="#111428" strokeWidth={1}/></pattern>
          </defs>
          <rect width={840} height={620} fill="#08090d"/>
          <rect width={840} height={620} fill="url(#g1)"/>
          <rect width={840} height={620} fill="url(#g2)"/>
          <line x1={0} y1={568} x2={840} y2={568} stroke="#111828" strokeWidth={1} strokeDasharray="6,10"/>
          <text x={6} y={565} fontSize={7} fontFamily="monospace" fill="#191f32">GROUND</text>
          <line x1={ORIGIN[0]-18} y1={ORIGIN[1]} x2={ORIGIN[0]+18} y2={ORIGIN[1]} stroke="#181e30" strokeWidth={1}/>
          <line x1={ORIGIN[0]} y1={ORIGIN[1]-18} x2={ORIGIN[0]} y2={ORIGIN[1]+18} stroke="#181e30" strokeWidth={1}/>
          <circle cx={ORIGIN[0]} cy={ORIGIN[1]} r={2} fill="#181e30"/>

          {/* Skeleton lines */}
          {showSkel&&jointIds.map(id=>{
            const def=JOINT_DEFS[id]; if(!def.parent||def.parent==="root") return null;
            const wA=computeWorld(def.parent,rotations,ORIGIN), wB=computeWorld(id,rotations,ORIGIN);
            return <line key={id+"-sk"} x1={wA.x} y1={wA.y} x2={wB.x} y2={wB.y} stroke="#0e1322" strokeWidth={0.8} strokeDasharray="4,5" opacity={0.9}/>;
          })}

          {/* IK reach lines */}
          {/* Fix: Explicitly type ikTargets entries to avoid 'unknown' type issues with x and y properties. */}
          {mode==="IK"&&(Object.entries(ikTargets) as [string, Point][]).map(([k,tgt])=>{
            const ch=IK_CHAINS[k]; if(!ch) return null;
            const w=computeWorld(ch.effector,rotations,ORIGIN);
            return <line key={k+"-rl"} x1={w.x} y1={w.y} x2={tgt.x} y2={tgt.y} stroke="#4FC3F7" strokeWidth={0.5} strokeDasharray="3,5" opacity={0.3}/>;
          })}

          {RENDER_ORDER.map(id=>renderJoint(id))}

          {/* IK target crosshairs */}
          {/* Fix: Explicitly type ikTargets entries to avoid 'unknown' type issues with x and y properties. */}
          {mode==="IK"&&(Object.entries(ikTargets) as [string, Point][]).map(([k,tgt])=>{
            const isAct=activeChain===k, col=isAct?"#FF6B6B":"#4FC3F7";
            return (
              <g key={k+"-tgt"} transform={`translate(${tgt.x},${tgt.y})`}
                onMouseDown={(e)=>{e.stopPropagation();drag.current={type:"ik",id:k};}}
                style={{cursor:"crosshair"}}
              >
                <circle r={10} fill="none" stroke={col} strokeWidth={1.5} opacity={0.7}/>
                <circle r={2.5} fill={col} opacity={0.9}/>
                <line x1={-16} y1={0} x2={16} y2={0} stroke={col} strokeWidth={0.8} opacity={0.6}/>
                <line x1={0} y1={-16} x2={0} y2={16} stroke={col} strokeWidth={0.8} opacity={0.6}/>
                <text x={14} y={4} fill={col} fontSize={7.5} fontFamily="monospace" opacity={0.85}>{CHAIN_LABELS[k]}</text>
              </g>
            );
          })}

          {/* Solver diagnostics */}
          {diag&&mode==="IK"&&(
            <g>
              <rect x={8} y={8} width={168} height={82} rx={3} fill="rgba(5,7,14,0.88)" stroke="#161b28" strokeWidth={1}/>
              {[["solver",diag.solver],["mode",diag.mode.replace(/_/g," ")],["chains",diag.chains],["residual",`${diag.residual}px`],["solve",`${diag.ms}ms`]].map(([k,v],i)=>(
                <text key={k} x={14} y={22+i*13} fontSize={8.5} fontFamily="monospace">
                  <tspan fill="#2a3555">{k}: </tspan><tspan fill="#4FC3F7">{v}</tspan>
                </text>
              ))}
            </g>
          )}
          <text x={833} y={616} textAnchor="end" fontSize={7} fontFamily="monospace" fill="#111828" letterSpacing={2}>BITRUVIUS · CORE MOTION</text>
        </svg>
      </div>

      {/* RIGHT PANEL */}
      <div style={{width:218,background:"#0b0d14",borderLeft:"1px solid #161b28",padding:"10px",overflowY:"auto",display:"flex",flexDirection:"column",gap:8,flexShrink:0}}>
        <div style={{color:"#FFD700",fontSize:9,letterSpacing:3,borderBottom:"1px solid #161b28",paddingBottom:6}}>INSPECTOR</div>

        {selected?(<>
          <div>
            <div style={{fontSize:7,color:"#2a3040",letterSpacing:1}}>JOINT</div>
            <div style={{fontSize:13,color:JOINT_DEFS[selected]?.color,fontWeight:"bold",marginTop:2}}>{JOINT_DEFS[selected]?.label}</div>
            <div style={{fontSize:7,color:"#222b3a",marginTop:2}}><span style={{color:"#303a50"}}>id:</span> {selected} · <span style={{color:"#303a50"}}>parent:</span> {JOINT_DEFS[selected]?.parent}</div>
          </div>

          <div>
            <div style={{fontSize:7,color:"#3a4050",letterSpacing:1,marginBottom:4}}>ROTATION</div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <input type="range" min={JOINT_LIMITS[selected]?.min??-180} max={JOINT_LIMITS[selected]?.max??180}
                value={rotations[selected]||0}
                onChange={e=>setRotations(r=>({...r,[selected]:+e.target.value}))}
                style={{flex:1,accentColor:"#FFD700"}}/>
              <span style={{width:36,fontSize:10,color:"#FFD700",textAlign:"right"}}>{Math.round(rotations[selected]||0)}°</span>
            </div>
            {JOINT_LIMITS[selected]&&<div style={{fontSize:7,color:"#222b3a",marginTop:2}}>[{JOINT_LIMITS[selected].min}°, {JOINT_LIMITS[selected].max}°]</div>}
          </div>

          {(()=>{const w=computeWorld(selected,rotations,ORIGIN);return(
            <div style={{background:"#080910",borderRadius:3,padding:8,border:"1px solid #161b28"}}>
              <div style={{fontSize:7,color:"#2a3040",marginBottom:4,letterSpacing:1}}>WORLD TRANSFORM</div>
              <div style={{fontSize:9,lineHeight:2,fontFamily:"monospace",color:"#556"}}>
                <div>x <span style={{color:"#4FC3F7"}}>{Math.round(w.x)}</span></div>
                <div>y <span style={{color:"#66BB6A"}}>{Math.round(w.y)}</span></div>
                <div>∠ <span style={{color:"#FFD700"}}>{Math.round(w.angle)}°</span></div>
                <div>∠p <span style={{color:"#7788aa"}}>{Math.round(w.parentAngle)}°</span></div>
              </div>
            </div>
          );})()}

          {Object.entries(IK_CHAINS).filter(([,ch])=>ch.joints.includes(selected)||ch.effector===selected).map(([k])=>(
            <button key={k} onClick={()=>activateIK(k)} style={{padding:"4px 8px",background:"#0c1828",color:"#4FC3F7",border:"1px solid #1a2f48",borderRadius:3,cursor:"pointer",fontSize:8,letterSpacing:1,textAlign:"left"}}>
              ⊙ IK target · {CHAIN_LABELS[k]}
            </button>
          ))}

          <button onClick={()=>setPins(p=>({...p,[selected]:!p[selected]}))} style={{padding:"5px 8px",background:pins[selected]?"#280f0f":"#0f1118",color:pins[selected]?"#FF6B6B":"#3a4050",border:"1px solid "+(pins[selected]?"#FF6B6B":"#161b28"),borderRadius:3,cursor:"pointer",fontSize:9,letterSpacing:1}}>
            {pins[selected]?"📌 Unpin":"📌 Pin Joint"}
          </button>
          <button onClick={()=>setRotations(r=>{const n={...r};delete n[selected];return n;})} style={{padding:"5px 8px",background:"#0e1016",color:"#2a3040",border:"1px solid #161b28",borderRadius:3,cursor:"pointer",fontSize:9,letterSpacing:1}}>
            ↺ Reset Rotation
          </button>
        </>) : (
          <div style={{color:"#242c3a",fontSize:8,marginTop:8,lineHeight:2}}>
            Click a joint to inspect.<br/>
            {mode==="FK"&&"Drag to rotate in FK."}
            {mode==="IK"&&"Activate chains · drag crosshairs."}
            {mode==="PIN"&&"Click to pin / unpin."}
          </div>
        )}

        {/* IK chains */}
        <div style={{borderTop:"1px solid #161b28",paddingTop:8,marginTop:2}}>
          <div style={{fontSize:7,color:"#2a3040",letterSpacing:1,marginBottom:5}}>IK CHAINS</div>
          {Object.entries(IK_CHAINS).map(([k,ch])=>(
            <div key={k} style={{background:"#08090e",borderRadius:3,padding:"5px 7px",marginBottom:3,border:`1px solid ${activeChain===k&&mode==="IK"?"#4FC3F7":"#10141e"}`,cursor:"pointer"}}
              onClick={()=>activateIK(k)}>
              <div style={{fontSize:8,marginBottom:1,display:"flex",justifyContent:"space-between",color:activeChain===k&&mode==="IK"?"#4FC3F7":"#384050"}}>
                <span>{CHAIN_LABELS[k]}</span><span style={{fontSize:7,color:"#242c3a"}}>p:{ch.priority}</span>
              </div>
              <div style={{fontSize:6.5,color:"#1e2535",lineHeight:1.7}}>
                {ch.joints.join("→")}<br/>
                <span style={{color:"#5a2535"}}>eff: {ch.effector}</span>
                {/* Changed text label to avoid potential label/variable confusion */}
                <span style={{color:"#242c3a",marginLeft:6}}>ratio:{ch.stretchRatio}</span>
                {ikTargets[k]&&<span style={{color:"#4ade80",marginLeft:6}}>● live</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Pinned */}
        {Object.entries(pins).filter(([,v])=>v).length>0&&(
          <div style={{borderTop:"1px solid #161b28",paddingTop:8}}>
            <div style={{fontSize:7,color:"#2a3040",letterSpacing:1,marginBottom:4}}>PINNED</div>
            {Object.entries(pins).filter(([,v])=>v).map(([k])=>{
              const w=computeWorld(k,rotations,ORIGIN);
              return <div key={k} style={{background:"#120909",borderRadius:3,padding:"3px 6px",marginBottom:2,border:"1px solid #221010",fontSize:7.5,display:"flex",justifyContent:"space-between"}}>
                <span style={{color:"#FF6B6B"}}>📌 {k}</span>
                <span style={{color:"#1e1010",fontSize:7}}>{Math.round(w.x)},{Math.round(w.y)}</span>
              </div>;
            })}
          </div>
        )}

        <div style={{borderTop:"1px solid #161b28",paddingTop:8,marginTop:"auto"}}>
          <div style={{fontSize:7.5,color:"#1a2030",lineHeight:2.2}}>
            <div><span style={{color:"#00FFFF"}}>●</span> Free joint</div>
            <div><span style={{color:"#FF6B6B"}}>●</span> Pinned joint</div>
            <div><span style={{color:"#FFD700"}}>outline</span> Selected</div>
            <div><span style={{color:"#4FC3F7"}}>✕</span> IK target · drag</div>
            <div><span style={{color:"#4ade80"}}>●</span> Chain active</div>
          </div>
        </div>
      </div>
    </div>
  );
}
