import { animationCaptureManager, type AnimationCaptureData } from './animationCapture';
import type { SkeletonRotations } from './modelData';

// Simple test to verify animation capture functionality
const testCapture = () => {
  console.log('Testing animation capture functionality...');
  
  // Create test data
  const testFrames: AnimationCaptureData[] = [
    {
      frame: 0,
      rotations: { root: 0, l_shoulder: 45, r_shoulder: -45 } as SkeletonRotations,
      worldPositions: {
        root: { x: 100, y: 100, angle: 0 },
        l_shoulder: { x: 80, y: 80, angle: 45 },
        r_shoulder: { x: 120, y: 80, angle: -45 }
      },
      rootTransform: { x: 0, y: 0, rotate: 0 }
    },
    {
      frame: 10,
      rotations: { root: 5, l_shoulder: 90, r_shoulder: -90 } as SkeletonRotations,
      worldPositions: {
        root: { x: 105, y: 100, angle: 5 },
        l_shoulder: { x: 70, y: 70, angle: 90 },
        r_shoulder: { x: 130, y: 70, angle: -90 }
      },
      rootTransform: { x: 5, y: 0, rotate: 5 }
    }
  ];

  // Test capture creation
  const capture = animationCaptureManager.createCapture('Test Animation', testFrames);
  console.log('Created capture:', capture);
  
  // Test capture retrieval
  const retrieved = animationCaptureManager.getCapture(capture.id);
  console.log('Retrieved capture:', retrieved);
  
  // Test export
  const exported = animationCaptureManager.exportCapture(capture.id);
  console.log('Exported data length:', exported?.length);
  
  // Test capture list
  const allCaptures = animationCaptureManager.getAllCaptures();
  console.log('All captures:', allCaptures.length);
  
  console.log('Animation capture test completed successfully!');
};

// Export for manual testing
export { testCapture };
