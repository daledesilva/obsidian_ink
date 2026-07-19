# Pen vs. Finger Input Handling

This document describes the strategy used in `FingerBlocker` to differentiate between Pen (drawing) and Finger (scrolling) inputs. This allows users to naturally scroll the page with their fingers while using a stylus or pen for precision drawing without triggering unintended gestures.

## The Challenge

On many touch devices, the operating system and browser treat Pen input similarly to Touch input for the purpose of scrolling (panning). This creates a conflict when a user wants to:
1.  **Draw** with the Pen (without scrolling).
2.  **Scroll** with their Finger (without drawing).

Standard solutions like `touch-action: none` disable scrolling for *all* touch inputs (Pen and Finger), which breaks the user's ability to scroll the page naturally. Conversely, `touch-action: auto` allows scrolling but often causes the Pen to drag the page instead of drawing lines.

## The Solution: Multi-Layered Defense

We employ a robust, multi-layered approach to isolate Pen input from browser gestures while preserving native scrolling for fingers.

### 1. Native Event Listeners & Capture Phase
Instead of React's synthetic events (which can be passive or late), we attach **native** event listeners to the container using `addEventListener` with `{ passive: false, capture: true }`.
*   **Capture Phase:** Allows us to intercept events *before* they reach children or bubble up.
*   **Passive False:** Crucial for being able to call `preventDefault()` to stop browser handling.

**Note:** The initial implementation used React's synthetic event system. While this was sufficient for iPadOS, it failed to block native gestures on Windows Surface devices due to timing issues and the aggressive nature of Windows Ink gesture recognition.

### 2. Dynamic `touch-action` Toggling
We dynamically toggle the CSS `touch-action` property on the element based on the input type detected at the very start of an interaction (`pointerdown`).
*   **On Pen Down:** We set `touch-action: none`. This tells the browser *not* to treat subsequent movements as scroll gestures.
*   **On Finger Down:** We explicitly set `touch-action: pan-x pan-y`. This tells the browser *to* allow native scrolling.
*   **On Up/Cancel:** We reset the property.

### 3. Scroll Pinning (The "Brute Force" Fix)
To address stubborn behaviors where browsers ignore standard prevention (common on Windows), we implemented **Scroll Pinning** as a failsafe:
*   **Lock:** When the Pen touches down, we record the current `scrollTop` / `scrollLeft` positions.
*   **Freeze:** We immediately set `overflow: hidden` on the scrolling container to attempt to disable its scroll capability.
*   **Enforce:** We attach a capture-phase `scroll` listener to the container. If a scroll event fires while the Pen is down (meaning the browser ignored our locks), we **forcefully scroll back** to the recorded position (`scrollTo(x, y)`). This effectively "pins" the canvas in place frame-by-frame, fighting the native gesture.

### 4. Gesture Prevention
To prevent other side effects (like "Swipe Back" history navigation or zooming):
*   **Stop Propagation:** We aggressively call `e.stopPropagation()` and `e.stopImmediatePropagation()` on Pen events.
*   **Block Gestures:** We attach non-passive listeners for `wheel` and `touchmove` that block these events entirely when the Pen is active.

## Windows Specific Quirks

Windows devices (specifically Surface) present a unique challenge due to the timing of input events and gesture recognition.

### Why the Previous Approach Failed
Our previous implementation relied on `pointerenter` (hover) to lock scrolling by setting `overflow: hidden`. This failed on Windows Surface devices because:
*   **Timing:** `pointerenter` often doesn't fire before `pointerdown`, especially on quick taps without hovering.
*   **Gesture Latching:** Even when it does fire, the browser's gesture recognition logic is faster than the React state update or DOM reflow. The browser "latches" onto the scroll gesture before the CSS lock (`overflow: hidden`) can take effect.

## Not Pursued

### Hover Detection
We explored using `pointerenter` (hover) to lock scrolling before the pen touches down. This approach was discarded because not all styluses support hover detection, and as noted above, it is prone to race conditions on Windows.

## Implementation Details

The core logic resides in the FingerBlocker component.