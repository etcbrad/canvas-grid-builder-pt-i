# Canvas Grid Builder

## Project Overview
A React + TypeScript animation tool for building and editing character animations with IK/FK rigs, pose libraries, onion skinning, and timeline controls.

## Tech Stack
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS v4
- **Testing**: Vitest + Playwright
- **Language**: TypeScript

## Architecture
- `App.tsx` - Main application entry point
- `components/` - React UI components (CanvasGrid, CoreModuleGrid, OnionSkinControls, TimelineStrip)
- `adapters/` - Runtime/grid adapters
- `output/` - Exported animation snapshots
- `skills/` - Project-level skill references

## Key Files
- `vite.config.ts` - Vite configuration (port 5000, host 0.0.0.0, allowedHosts: true)
- `index.html` - Entry HTML
- `index.tsx` - React root
- `modelData.ts` - Character model definitions
- `ikSolver.ts`, `fkEngine.ts` - IK/FK solvers
- `animationIkTween.ts` - Animation tweening

## Workflow
- **Start application**: `npm run dev` on port 5000

## Deployment
- Target: Static site
- Build: `npm run build`
- Public dir: `dist`
