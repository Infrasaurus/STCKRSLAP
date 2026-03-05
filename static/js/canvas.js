// Canvas rendering, viewport, and horizontal wrapping

const CANVAS_W = 20000;
const CANVAS_H = 5000;

class CanvasRenderer {
    constructor(el) {
        this.el = el;
        this.ctx = el.getContext('2d');
        this.viewport = { x: 0, y: 0 };
        this.zoom = 1.0;
        this.maxZoom = 3.0;
        this.dirty = true;
        this.stickers = null; // set by main.js via APP

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this._frame();
    }

    // Minimum zoom: screen can show at most exactly canvas height
    get minZoom() {
        return this.screenH / CANVAS_H;
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.el.width = window.innerWidth * dpr;
        this.el.height = window.innerHeight * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.screenW = window.innerWidth;
        this.screenH = window.innerHeight;
        // Re-clamp zoom after resize in case minZoom changed
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
        this.dirty = true;
    }

    markDirty() {
        this.dirty = true;
    }

    pan(dx, dy) {
        // Pan in canvas-space (divide by zoom so dragging feels 1:1)
        this.viewport.x -= dx / this.zoom;
        this.viewport.y -= dy / this.zoom;

        this._clampY();
        this.dirty = true;
    }

    zoomAt(delta, screenX, screenY) {
        // Convert screen point to raw (unnormalized) canvas coords before zoom
        const rawCx = screenX / this.zoom + this.viewport.x;
        const rawCy = screenY / this.zoom + this.viewport.y;

        // Apply zoom
        const factor = delta > 0 ? 0.9 : 1.1;
        this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));

        // Adjust viewport so the point under the cursor stays fixed
        this.viewport.x = rawCx - screenX / this.zoom;
        this.viewport.y = rawCy - screenY / this.zoom;

        this._clampY();
        this.dirty = true;
    }

    pinchZoom(scale, screenX, screenY) {
        // Convert screen point to raw (unnormalized) canvas coords before zoom
        const rawCx = screenX / this.zoom + this.viewport.x;
        const rawCy = screenY / this.zoom + this.viewport.y;

        // Apply zoom by scale factor
        this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * scale));

        // Adjust viewport so the pinch center stays fixed
        this.viewport.x = rawCx - screenX / this.zoom;
        this.viewport.y = rawCy - screenY / this.zoom;

        this._clampY();
        this.dirty = true;
    }

    scrollX(delta) {
        this.viewport.x += delta / this.zoom;
        this.dirty = true;
    }

    _clampY() {
        const visibleH = this.screenH / this.zoom;
        if (visibleH >= CANVAS_H) {
            this.viewport.y = -(visibleH - CANVAS_H) / 2;
        } else {
            const maxY = CANVAS_H - visibleH;
            if (this.viewport.y < 0) this.viewport.y = 0;
            if (this.viewport.y > maxY) this.viewport.y = maxY;
        }
    }

    screenToCanvas(sx, sy) {
        const cx = sx / this.zoom + this.viewport.x;
        const cy = sy / this.zoom + this.viewport.y;
        return {
            x: ((cx % CANVAS_W) + CANVAS_W) % CANVAS_W,
            y: cy,
        };
    }

    _frame() {
        if (this.dirty) {
            this.dirty = false;
            this._render();
        }
        requestAnimationFrame(() => this._frame());
    }

    _render() {
        const ctx = this.ctx;
        const vx = this.viewport.x;
        const vy = this.viewport.y;
        const z = this.zoom;

        // Fill entire screen with canvas color
        ctx.fillStyle = '#141414';
        ctx.fillRect(0, 0, this.screenW, this.screenH);

        if (!this.stickers) {
            renderGhostSticker(ctx, this);
            return;
        }

        // Clip to canvas vertical extent
        const topScreen = -vy * z;
        const botScreen = (CANVAS_H - vy) * z;
        const clipTop = Math.max(0, topScreen);
        const clipBot = Math.min(this.screenH, botScreen);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, clipTop, this.screenW, clipBot - clipTop);
        ctx.clip();

        // Render stickers (static only — GIFs use DOM overlay)
        for (const sticker of this.stickers.values()) {
            if (sticker.gif) continue;
            this._renderSticker(ctx, sticker, vx, vy, z);
        }

        // Position GIF overlay elements to match viewport
        this._positionGifOverlays(vx, vy, z);

        ctx.restore();

        // Render ghost sticker (placement preview, not clipped)
        renderGhostSticker(ctx, this);
    }

    _renderSticker(ctx, sticker, vx, vy, z) {
        if (!sticker.canvas) return;

        const visibleW = this.screenW / z;
        const visibleH = this.screenH / z;

        // Normalize vx into [0, CANVAS_W) for offset math
        const normVx = ((vx % CANVAS_W) + CANVAS_W) % CANVAS_W;
        const offsets = [0, -CANVAS_W, CANVAS_W];
        for (const ox of offsets) {
            const canvasX = sticker.x + ox - normVx;
            const canvasY = sticker.y - vy;

            // Cull if off-screen (in canvas-space before zoom)
            if (canvasX + sticker.width < 0 || canvasX > visibleW) continue;
            if (canvasY + sticker.height < 0 || canvasY > visibleH) continue;

            ctx.save();
            ctx.scale(z, z);
            const cx = canvasX + sticker.width / 2;
            const cy = canvasY + sticker.height / 2;
            ctx.translate(cx, cy);
            ctx.rotate(sticker.rotation || 0);
            ctx.drawImage(sticker.canvas, -sticker.width / 2, -sticker.height / 2);

            ctx.restore();
        }
    }

    _positionGifOverlays(vx, vy, z) {
        if (!this.stickers) return;

        const normVx = ((vx % CANVAS_W) + CANVAS_W) % CANVAS_W;
        const visibleW = this.screenW / z;
        const visibleH = this.screenH / z;

        for (const sticker of this.stickers.values()) {
            if (!sticker.gif || !sticker.overlayEl) continue;

            // Find the best horizontal wrap offset that is on screen
            let bestOx = null;
            const offsets = [0, -CANVAS_W, CANVAS_W];
            for (const ox of offsets) {
                const canvasX = sticker.x + ox - normVx;
                const canvasY = sticker.y - vy;
                if (canvasX + sticker.width >= 0 && canvasX <= visibleW &&
                    canvasY + sticker.height >= 0 && canvasY <= visibleH) {
                    bestOx = ox;
                    break;
                }
            }

            if (bestOx === null) {
                // Off screen — hide
                sticker.overlayEl.style.display = 'none';
                continue;
            }

            const canvasX = sticker.x + bestOx - normVx;
            const canvasY = sticker.y - vy;

            // Screen-space center of sticker
            const screenCx = (canvasX + sticker.width / 2) * z;
            const screenCy = (canvasY + sticker.height / 2) * z;

            const el = sticker.overlayEl;
            el.style.display = '';
            el.style.width = (sticker.width * z) + 'px';
            el.style.height = (sticker.height * z) + 'px';
            el.style.transform = 'translate(' +
                (screenCx - sticker.width * z / 2) + 'px, ' +
                (screenCy - sticker.height * z / 2) + 'px) rotate(' +
                (sticker.rotation || 0) + 'rad)';
        }
    }
}

function buildStickerCanvas(sticker) {
    // Animated GIFs use DOM overlay — no offscreen canvas needed.
    if (sticker.gif) {
        sticker.canvas = null;
        // Create a DOM <img> for the overlay if not already present.
        if (!sticker.overlayEl) {
            const el = document.createElement('img');
            el.src = sticker.image.src;
            el.width = sticker.width;
            el.height = sticker.height;
            sticker.overlayEl = el;
            document.getElementById('gif-overlay').appendChild(el);
        }
        return;
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = sticker.width;
    offscreen.height = sticker.height;
    const octx = offscreen.getContext('2d');

    octx.drawImage(sticker.image, 0, 0);

    sticker.canvas = offscreen;
}

function addStickerFromServer(app, msg) {
    // If we already have this sticker (placed locally), update position from server
    const existing = app.stickers.get(msg.id);
    if (existing) {
        existing.x = msg.x;
        existing.y = msg.y;
        existing.rotation = msg.rotation || existing.rotation;
        existing.finalized = msg.finalized || false;
        buildStickerCanvas(existing);
        app.renderer.markDirty();
        return;
    }

    const img = new Image();
    img.onload = () => {
        const sticker = {
            id: msg.id,
            x: msg.x,
            y: msg.y,
            width: msg.width,
            height: msg.height,
            rotation: msg.rotation || 0,
            finalized: msg.finalized || false,
            gif: (msg.mimeType === 'image/gif'),
            image: img,
            canvas: null,
            placedAt: msg.placedAt ? new Date(msg.placedAt) : new Date(),
        };

        buildStickerCanvas(sticker);
        app.stickers.set(sticker.id, sticker);
        app.renderer.stickers = app.stickers;
        app.renderer.markDirty();
    };

    if (msg.imageData) {
        const mime = msg.mimeType || 'image/png';
        img.src = 'data:' + mime + ';base64,' + msg.imageData;
    }
}

// Add sticker locally (optimistic) using an already-loaded Image.
// Used by the placing client so the sticker appears immediately.
function addStickerLocally(app, id, img, width, height, x, y, rotation, finalized, isGif) {
    if (rotation === undefined) rotation = 0;
    if (finalized === undefined) finalized = true;
    const sticker = {
        id: id,
        x: x,
        y: y,
        width: width,
        height: height,
        rotation: rotation,
        finalized: finalized,
        gif: !!isGif,
        image: img,
        canvas: null,
        placedAt: new Date(),
    };
    buildStickerCanvas(sticker);
    app.stickers.set(id, sticker);
    app.renderer.stickers = app.stickers;
    app.renderer.markDirty();
    return sticker;
}

