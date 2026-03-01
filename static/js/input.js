// Unified pointer abstraction for mouse + touch

class InputHandler {
    constructor(el) {
        this.el = el;
        this.pointers = new Map(); // trackingId -> {x, y, time}
        this.isPanning = false;
        this.panStart = null;
        this.lastPanPos = null;

        // Mouse events
        el.addEventListener('mousedown', (e) => this._onPointerDown(e, 'mouse', e.clientX, e.clientY, e.button));
        el.addEventListener('mousemove', (e) => this._onPointerMove(e, 'mouse', e.clientX, e.clientY));
        el.addEventListener('mouseup', (e) => this._onPointerUp(e, 'mouse', e.clientX, e.clientY));
        el.addEventListener('mouseleave', (e) => this._onPointerUp(e, 'mouse', e.clientX, e.clientY));

        // Touch events
        el.addEventListener('touchstart', (e) => {
            for (const t of e.changedTouches) {
                this._onPointerDown(e, `touch-${t.identifier}`, t.clientX, t.clientY, 0);
            }
        }, { passive: false });

        el.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (const t of e.changedTouches) {
                this._onPointerMove(e, `touch-${t.identifier}`, t.clientX, t.clientY);
            }
        }, { passive: false });

        el.addEventListener('touchend', (e) => {
            for (const t of e.changedTouches) {
                this._onPointerUp(e, `touch-${t.identifier}`, t.clientX, t.clientY);
            }
        });

        el.addEventListener('touchcancel', (e) => {
            for (const t of e.changedTouches) {
                this._onPointerUp(e, `touch-${t.identifier}`, t.clientX, t.clientY);
            }
        });

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
        this.onTap = null;
        this.onDragStart = null;
        this.onDragMove = null;
        this.onDragEnd = null;
    }

    _onPointerDown(e, id, x, y, button) {
        this.pointers.set(id, { x, y, time: performance.now() });

        // Middle mouse button or two-finger touch: pan
        if (button === 1 || this.pointers.size >= 2) {
            this.isPanning = true;
            this.lastPanPos = { x, y };
            this.el.classList.add('panning');
            if (this.onPanStart) this.onPanStart(x, y);
            return;
        }

        // Left click: could be drag start or tap
        if (button === 0) {
            if (this.onDragStart) this.onDragStart(x, y, e);
        }
    }

    _onPointerMove(e, id, x, y) {
        const prev = this.pointers.get(id);
        if (!prev) return;

        if (this.isPanning && this.lastPanPos) {
            const dx = x - this.lastPanPos.x;
            const dy = y - this.lastPanPos.y;
            this.lastPanPos = { x, y };
            if (this.onPanMove) this.onPanMove(dx, dy);
            return;
        }

        this.pointers.set(id, { x, y, time: performance.now() });
        if (this.onDragMove) this.onDragMove(x, y, e);
    }

    _onPointerUp(e, id, x, y) {
        if (this.isPanning) {
            this.isPanning = false;
            this.lastPanPos = null;
            this.el.classList.remove('panning');
            if (this.onPanEnd) this.onPanEnd(x, y);
            this.pointers.delete(id);
            return;
        }

        this.pointers.delete(id);
        if (this.onDragEnd) this.onDragEnd(x, y, e);
    }
}
