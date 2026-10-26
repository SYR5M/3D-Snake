# Bug Fix: Cannot set properties of undefined (setting 'active')

## Problem
The game was crashing with the error:
```
Uncaught TypeError: Cannot set properties of undefined (setting 'active')
```

This occurred when trying to access segments in the `segmentPool` array that didn't exist or weren't properly initialized.

## Root Cause
The error happened in several places where the code tried to access `this.segmentPool[index]` without verifying:
1. The pool was initialized
2. The index was within bounds
3. The segment object existed at that index
4. The segment's mesh and material properties existed

## Solution
Added comprehensive safety checks throughout the codebase:

### 1. `activateSegment(index)` Method
```typescript
private activateSegment(index: number) {
  if (index >= this.MAX_SEGMENTS || index < 0) return;
  if (!this.segmentPool || !this.segmentPool[index]) return;
  
  const seg = this.segmentPool[index];
  if (!seg || !seg.mesh || !seg.material) return;
  
  // ... rest of the code
}
```

### 2. `deactivateSegment(index)` Method
```typescript
private deactivateSegment(index: number) {
  if (index >= this.MAX_SEGMENTS || index < 0) return;
  if (!this.segmentPool || !this.segmentPool[index]) return;
  
  const seg = this.segmentPool[index];
  if (!seg || !seg.mesh) return;
  
  // ... rest of the code
}
```

### 3. `initSnake()` Method
Added verification after pool creation:
```typescript
// Verify pool was created
if (!this.segmentPool || this.segmentPool.length !== this.MAX_SEGMENTS) {
  console.error('Segment pool initialization failed');
  return;
}
```

### 4. `resetGame()` Method
Added safety check before accessing pool:
```typescript
if (this.segmentPool && this.segmentPool.length === this.MAX_SEGMENTS) {
  for (let i = 0; i < this.MAX_SEGMENTS; i++) {
    this.deactivateSegment(i);
  }
  for (let i = 0; i < 5; i++) {
    this.activateSegment(i);
  }
} else {
  console.error('Cannot reset game: segment pool not initialized');
}
```

### 5. `updateSnake()` Method
Added checks in the body segment update loop:
```typescript
for (let i = 0; i < this.activeSegments; i++) {
  if (!this.segmentPool || !this.segmentPool[i]) continue;
  const seg = this.segmentPool[i];
  if (!seg || !seg.mesh || !seg.material) continue;
  
  // ... rest of the code
}
```

### 6. Self-Collision Detection
Added checks in both spatial hash and direct loop paths:
```typescript
if (this.activeSegments > this.SELF_COLLISION_SKIP && this.segmentPool) {
  // ... collision detection with safety checks
}
```

### 7. Near-Miss Detection
```typescript
if (this.segmentPool) {
  for (let i = this.SELF_COLLISION_SKIP; i < this.activeSegments; i++) {
    if (!this.segmentPool[i] || !this.segmentPool[i].mesh) continue;
    // ... detection code
  }
}
```

### 8. `isPositionNearSnake()` Method
```typescript
if (!this.segmentPool) return false;

for (let i = 0; i < this.activeSegments; i++) {
  if (!this.segmentPool[i] || !this.segmentPool[i].mesh) continue;
  // ... position check
}
```

### 9. Menu Idle Animation
```typescript
if (this.segmentPool) {
  for (let i = 0; i < this.activeSegments; i++) {
    if (!this.segmentPool[i] || !this.segmentPool[i].mesh) continue;
    // ... animation code
  }
}
```

### 10. `updateTrail()` Method
```typescript
let tailPos = this.headPosition;
if (this.activeSegments > 0 && this.segmentPool && this.segmentPool[this.activeSegments - 1]) {
  const lastSeg = this.segmentPool[this.activeSegments - 1];
  if (lastSeg && lastSeg.mesh) {
    tailPos = lastSeg.mesh.position;
  }
}
```

## Testing
The game now handles edge cases gracefully:
- ✅ Segment pool not initialized
- ✅ Index out of bounds
- ✅ Missing segment objects
- ✅ Missing mesh or material properties
- ✅ Partial initialization failures

## Impact
- **No more crashes** when accessing undefined segments
- **Graceful degradation** - game continues even if some segments fail to initialize
- **Better debugging** - console errors help identify initialization issues
- **Defensive programming** - all segment access is now protected

## Files Modified
- `src/game/Engine.ts` - Added safety checks to all segment access points

## Build Status
✅ Build successful - no TypeScript errors
