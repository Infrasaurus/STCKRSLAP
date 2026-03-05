// Unified pointer abstraction for mouse + touch
// Supports: single-finger drag, two-finger pan, pinch-to-zoom, mouse wheel zoom

class InputHandler {
    constructor(el) {
        this.el = el;
        this.pointers = new Map(); // trackingId -> {x, y, time}

        // Single-pointer drag state
        this._dragging = false;
        this._dragId = null;

        // Multi-touch state
        this._pinching = false;
        this._lastPinchDist = 0;
        this._lastPinchCenter = null;

        // Mouse events
        el.addEventListener('mousedown', (e) => this._onMouseDown(e));
        el.addEventListener('mousemove', (e) => this._onMouseMove(e));
        el.addEventListener('mouseup', (e) => this._onMouseUp(e));
        el.addEventListener('mouseleave', (e) => this._onMouseUp(e));

        // Touch events
        el.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
        el.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
        el.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: false });
        el.addEventListener('touchcancel', (e) => this._onTouchEnd(e), { passive: false });

        // Scroll: vertical wheel = zoom (dy), shift+wheel or horizontal wheel = horizontal scroll (dx)
        el.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (this.onScroll) {
                const dx = e.shiftKey ? e.deltaY : e.deltaX;
                const dy = e.shiftKey ? 0 : e.deltaY;
                this.onScroll(dx, dy, e.clientX, e.clientY);
            }
        }, { passive: false });

        // Callbacks — set by consumers
        this.onPanStart = null;
        this.onPanMove = null;
        this.onPanEnd = null;
        this.onScroll = null;
        this.onPinchZoom = null;
        this.onDragStart = null;
        this.onDragMove = null;
        this.onDragEnd = null;
    }

    // --- Mouse handling ---

    _onMouseDown(e) {
        if (e.button === 1) {
            // Middle click → pan
            this._startPan(e.clientX, e.clientY);
            return;
        }
        if (e.button === 0) {
            this._dragging = true;
            this._dragId = 'mouse';
            if (this.onDragStart) this.onDragStart(e.clientX, e.clientY, e);
        }
    }

    _onMouseMove(e) {
        if (this._isPanning) {
            this._movePan(e.clientX, e.clientY);
            return;
        }
        if (this._dragging && this._dragId === 'mouse') {
            if (this.onDragMove) this.onDragMove(e.clientX, e.clientY, e);
        }
    }

    _onMouseUp(e) {
        if (this._isPanning) {
            this._endPan(e.clientX, e.clientY);
            return;
        }
        if (this._dragging && this._dragId === 'mouse') {
            this._dragging = false;
            this._dragId = null;
            if (this.onDragEnd) this.onDragEnd(e.clientX, e.clientY, e);
        }
    }

    // --- Touch handling ---

    _onTouchStart(e) {
        e.preventDefault();
        for (const t of e.changedTouches) {
            this.pointers.set(t.identifier, { x: t.clientX, y: t.clientY });
        }

        if (this.pointers.size === 2) {
            // Entering pinch — cancel any in-progress single-finger drag
            if (this._dragging) {
                if (this.onDragEnd) {
                    const p = this.pointers.get(this._dragId);
                    if (p) this.onDragEnd(p.x, p.y, e);
                }
                this._dragging = false;
                this._dragId = null;
            }
            this._startPinch();
        } else if (this.pointers.size === 1 && !this._pinching) {
            // Single finger → drag
            const t = e.changedTouches[0];
            this._dragging = true;
            this._dragId = t.identifier;
            if (this.onDragStart) this.onDragStart(t.clientX, t.clientY, e);
        }
    }

    _onTouchMove(e) {
        e.preventDefault();
        for (const t of e.changedTouches) {
            this.pointers.set(t.identifier, { x: t.clientX, y: t.clientY });
        }

        if (this._pinching && this.pointers.size >= 2) {
            this._movePinch();
            return;
        }

        if (this._dragging && this._dragId !== null) {
            const p = this.pointers.get(this._dragId);
            if (p && this.onDragMove) this.onDragMove(p.x, p.y, e);
        }
    }

    _onTouchEnd(e) {
        for (const t of e.changedTouches) {
            this.pointers.delete(t.identifier);
        }

        if (this._pinching) {
            if (this.pointers.size < 2) {
                this._pinching = false;
                // Don't start a new drag from remaining finger
            }
            return;
        }

        if (this._dragging) {
            this._dragging = false;
            const t = e.changedTouches[0];
            if (this.onDragEnd) this.onDragEnd(t.clientX, t.clientY, e);
            this._dragId = null;
        }
    }

    // --- Pinch-to-zoom ---

    _startPinch() {
        this._pinching = true;
        const pts = Array.from(this.pointers.values());
        this._lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        this._lastPinchCenter = {
            x: (pts[0].x + pts[1].x) / 2,
            y: (pts[0].y + pts[1].y) / 2,
        };
    }

    _movePinch() {
        const pts = Array.from(this.pointers.values());
        if (pts.length < 2) return;

        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const center = {
            x: (pts[0].x + pts[1].x) / 2,
            y: (pts[0].y + pts[1].y) / 2,
        };

        // Pan by center movement
        if (this._lastPinchCenter) {
            const dx = center.x - this._lastPinchCenter.x;
            const dy = center.y - this._lastPinchCenter.y;
            if (this.onPanMove) this.onPanMove(dx, dy);
        }

        // Zoom by pinch distance change
        if (this._lastPinchDist > 0 && this.onPinchZoom) {
            const scale = dist / this._lastPinchDist;
            this.onPinchZoom(scale, center.x, center.y);
        }

        this._lastPinchDist = dist;
        this._lastPinchCenter = center;
    }

    // --- Pan (middle-click) ---

    _isPanning = false;
    _panLast = null;

    _startPan(x, y) {
        this._isPanning = true;
        this._panLast = { x, y };
        this.el.classList.add('panning');
        if (this.onPanStart) this.onPanStart(x, y);
    }

    _movePan(x, y) {
        if (!this._panLast) return;
        const dx = x - this._panLast.x;
        const dy = y - this._panLast.y;
        this._panLast = { x, y };
        if (this.onPanMove) this.onPanMove(dx, dy);
    }

    _endPan(x, y) {
        this._isPanning = false;
        this._panLast = null;
        this.el.classList.remove('panning');
        if (this.onPanEnd) this.onPanEnd(x, y);
    }
}
