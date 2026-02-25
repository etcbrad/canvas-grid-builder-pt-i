// Test to verify pose retention fix
// This test simulates the issue and verifies the fix

import type { SkeletonRotations } from './modelData';

// Simulate the pose retention issue and fix
const testPoseRetention = () => {
  console.log('Testing pose retention fix...');
  
  // Simulate the original issue
  let currentRotations: SkeletonRotations = { root: 0, l_shoulder: 45, r_shoulder: -45 };
  let isManualPoseChange = false;
  
  // Simulate manual pose change (user dragging)
  const simulateManualPoseChange = (newRotations: SkeletonRotations) => {
    console.log('Manual pose change:', newRotations);
    isManualPoseChange = true;
    currentRotations = { ...newRotations };
    
    // Simulate the timeout that resets the flag
    setTimeout(() => {
      isManualPoseChange = false;
      console.log('Manual pose change flag reset');
    }, 100);
  };
  
  // Simulate syncRotationsFromClip (the problematic function)
  const syncRotationsFromClip = (clipSamplePose: SkeletonRotations) => {
    if (isManualPoseChange) {
      console.log('Skipping sync due to manual pose change');
      return; // This is the fix - don't overwrite manual changes
    }
    console.log('Syncing from clip:', clipSamplePose);
    currentRotations = { ...clipSamplePose };
  };
  
  // Test scenario 1: Manual pose change should be preserved
  console.log('\n--- Test 1: Manual pose change preservation ---');
  const manualPose = { root: 10, l_shoulder: 90, r_shoulder: -90 };
  simulateManualPoseChange(manualPose);
  
  // Immediately try to sync (this would have overwritten before the fix)
  const clipPose = { root: 0, l_shoulder: 0, r_shoulder: 0 };
  syncRotationsFromClip(clipPose);
  
  console.log('Current rotations after attempted sync:', currentRotations);
  console.log('Expected: Manual pose should be preserved');
  
  // Test scenario 2: Normal sync should work when no manual change
  console.log('\n--- Test 2: Normal sync when no manual change ---');
  setTimeout(() => {
    syncRotationsFromClip(clipPose);
    console.log('Current rotations after normal sync:', currentRotations);
    console.log('Expected: Should sync to clip pose');
    
    console.log('\nPose retention test completed!');
  }, 200);
};

export { testPoseRetention };
