# Three.js Instrumentation Patterns — buurt-check

## Dev-only render counter (Task 0 review, 2026-02-17)

### Correct pattern
```tsx
// In component function scope:
const renderCountRef = useRef<number>(0);
const lastResetRef = useRef<number>(performance.now());

// Inside useEffect init block, after renderer is created:
let overlayEl: HTMLDivElement | null = null;
if (import.meta.env.DEV) {
  overlayEl = document.createElement('div');
  overlayEl.style.cssText = 'position:absolute;bottom:8px;left:8px;' +
    'background:rgba(0,0,0,0.5);color:#fff;font:10px monospace;' +
    'padding:2px 6px;border-radius:4px;pointer-events:none;z-index:10;';
  container.appendChild(overlayEl);
}

// Inside animate() closure:
const animate = () => {
  const id = requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  sceneRef.current!.animId = id;

  if (import.meta.env.DEV && overlayEl) {
    renderCountRef.current += 1;
    const now = performance.now();
    if (now - lastResetRef.current >= 1000) {
      overlayEl.textContent = `${renderCountRef.current} r/s`;
      renderCountRef.current = 0;
      lastResetRef.current = now;
    }
  }
};

// In cleanup return:
return () => {
  window.removeEventListener('resize', onResize);
  cancelAnimationFrame(sceneRef.current?.animId ?? 0);
  controls.dispose();
  renderer.dispose();
  if (container.contains(renderer.domElement)) {
    container.removeChild(renderer.domElement);
  }
  // Must also remove dev overlay:
  if (overlayEl && container.contains(overlayEl)) {
    container.removeChild(overlayEl);
  }
  sceneRef.current = null;
};
```

### Key invariants
1. `overlayEl` is a local variable in the effect closure — not a ref. This is intentional: it lives and dies with the effect instance.
2. `renderCountRef` and `lastResetRef` are component-scope refs — stable across remounts.
3. `import.meta.env.DEV` used as literal, never stored in a variable at call-site.
4. `textContent` update only at 1-second boundary — not every frame.
5. Cleanup removes both `renderer.domElement` AND `overlayEl`.

## Backend structured log placement (three_d_bag.py)

Insert between line 737 (end of message block) and line 739 (return statement):

```python
    message = " ".join(message_parts) if message_parts else None

    logger.info(
        "neighborhood3d result: buildings=%d target_found=%s partial=%s "
        "bbox_partial=%s near_partial=%s immediate_partial=%s enrich_partial=%s message=%s",
        len(buildings),
        target_found,
        bbox_partial or near_partial or immediate_partial or enrich_partial,
        bbox_partial,
        near_partial,
        immediate_partial,
        enrich_partial,
        message,
    )

    return Neighborhood3DResponse(
```

Note: indentation must be at the function body level (4 spaces), NOT inside the `if not buildings:` or `else:` blocks that precede it.
