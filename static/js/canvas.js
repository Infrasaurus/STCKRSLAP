// Canvas rendering, viewport, and horizontal wrapping

const CANVAS_W = 5000;
const CANVAS_H = 20000;

class CanvasRenderer {
    constructor(el) {
        this.el = el;
        this.ctx = el.getContext('2d');
        this.viewport = { x: 0, y: 0 };
        this.zoom = 1.0;
        this.minZoom = 0.1;
        this.maxZoom = 3.0;
        this.dirty = true;
        this.stickers = null; // set by main.js via APP

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this._frame();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.el.width = window.innerWidth * dpr;
        this.el.height = window.innerHeight * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.screenW = window.innerWidth;
        this.screenH = window.innerHeight;
        this.dirty = true;
    }

    markDirty() {
        this.dirty = true;
    }

    pan(dx, dy) {
        // Pan in canvas-space (divide by zoom so dragging feels 1:1)
        this.viewport.x -= dx / this.zoom;
        this.viewport.y -= dy / this.zoom;

        // Wrap horizontal
        this.viewport.x = ((this.viewport.x % CANVAS_W) + CANVAS_W) % CANVAS_W;

        // Clamp vertical
        this._clampY();
        this.dirty = true;
    }

    zoomAt(delta, screenX, screenY) {
        // Convert screen point to canvas coords before zoom
        const beforeCanvas = this.screenToCanvas(screenX, screenY);

        // Apply zoom
        const factor = delta > 0 ? 0.9 : 1.1;
        this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));

        // Adjust viewport so the point under the cursor stays fixed
        this.viewport.x = beforeCanvas.x - screenX / this.zoom;
        this.viewport.y = beforeCanvas.y - screenY / this.zoom;

        // Wrap horizontal
        this.viewport.x = ((this.viewport.x % CANVAS_W) + CANVAS_W) % CANVAS_W;

        this._clampY();
        this.dirty = true;
    }

    scrollX(delta) {
        this.viewport.x += delta / this.zoom;
        this.viewport.x = ((this.viewport.x % CANVAS_W) + CANVAS_W) % CANVAS_W;
        this.dirty = true;
    }

    _clampY() {
        const visibleH = this.screenH / this.zoom;
        const maxY = Math.max(0, CANVAS_H - visibleH);
        if (this.viewport.y < 0) this.viewport.y = 0;
        if (this.viewport.y > maxY) this.viewport.y = maxY;
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

        // Background — subtle pole texture
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, this.screenW, this.screenH);

        // Draw vertical stripe pattern for pole feel
        ctx.save();
        ctx.scale(z, z);
        ctx.fillStyle = '#262626';
        const stripeW = 40;
        const startX = -((vx % stripeW) + stripeW) % stripeW;
        const visibleW = this.screenW / z;
        for (let x = startX; x < visibleW; x += stripeW) {
            ctx.fillRect(x, 0, stripeW / 2, this.screenH / z);
        }
        ctx.restore();

        if (!this.stickers) return;

        // Render stickers with zoom applied
        for (const sticker of this.stickers.values()) {
            this._renderSticker(ctx, sticker, vx, vy, z);
        }

        // Render ghost sticker (placement preview)
        renderGhostSticker(ctx, this);
    }

    _renderSticker(ctx, sticker, vx, vy, z) {
        if (!sticker.canvas) return;

        const visibleW = this.screenW / z;
        const visibleH = this.screenH / z;

        // Draw at actual position + wrapped copies
        const offsets = [0, -CANVAS_W, CANVAS_W];
        for (const ox of offsets) {
            const canvasX = sticker.x + ox - vx;
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

            // Rotation handle for unfinalized stickers
            if (!sticker.finalized) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.lineWidth = 2 / z;
                ctx.setLineDash([4 / z, 4 / z]);
                ctx.strokeRect(
                    -sticker.width / 2 - 4,
                    -sticker.height / 2 - 4,
                    sticker.width + 8,
                    sticker.height + 8
                );
                ctx.setLineDash([]);
            }

            ctx.restore();
        }
    }
}

function buildStickerCanvas(sticker) {
    const offscreen = document.createElement('canvas');
    offscreen.width = sticker.width;
    offscreen.height = sticker.height;
    const octx = offscreen.getContext('2d');

    octx.drawImage(sticker.image, 0, 0);

    if (sticker.scrapeMask) {
        const imageData = octx.getImageData(0, 0, sticker.width, sticker.height);
        const pixels = imageData.data;
        for (let i = 0; i < sticker.scrapeMask.length; i++) {
            pixels[i * 4 + 3] = Math.min(pixels[i * 4 + 3], sticker.scrapeMask[i]);
        }
        octx.putImageData(imageData, 0, 0);
    }

    sticker.canvas = offscreen;
}

function decodeRLEMask(rle, width, height) {
    const mask = new Uint8Array(width * height);
    let idx = 0;
    for (const run of rle) {
        for (let i = 0; i < run.count; i++) {
            if (idx < mask.length) mask[idx++] = run.value;
        }
    }
    return mask;
}

function applyMaskDelta(sticker, deltaRLE) {
    if (!sticker.scrapeMask) {
        sticker.scrapeMask = new Uint8Array(sticker.width * sticker.height).fill(255);
    }
    // Delta contains the new absolute mask values via RLE
    const newMask = decodeRLEMask(deltaRLE, sticker.width, sticker.height);
    sticker.scrapeMask = newMask;
    buildStickerCanvas(sticker);
}

function addStickerFromServer(app, msg) {
    // If we already have this sticker (placed locally), update position from server
    const existing = app.stickers.get(msg.id);
    if (existing) {
        existing.x = msg.x;
        existing.y = msg.y;
        existing.rotation = msg.rotation || existing.rotation;
        existing.finalized = msg.finalized || false;
        if (msg.scrapeMask && msg.scrapeMask.length > 0) {
            existing.scrapeMask = decodeRLEMask(msg.scrapeMask, existing.width, existing.height);
        }
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
            image: img,
            canvas: null,
            scrapeMask: null,
            placedAt: msg.placedAt ? new Date(msg.placedAt) : new Date(),
        };

        if (msg.scrapeMask && msg.scrapeMask.length > 0) {
            sticker.scrapeMask = decodeRLEMask(msg.scrapeMask, sticker.width, sticker.height);
        }

        buildStickerCanvas(sticker);
        app.stickers.set(sticker.id, sticker);
        app.renderer.stickers = app.stickers;
        app.renderer.markDirty();
    };

    if (msg.imageData) {
        img.src = 'data:image/png;base64,' + msg.imageData;
    }
}

// Add sticker locally (optimistic) using an already-loaded Image.
// Used by the placing client so the sticker appears immediately.
function addStickerLocally(app, id, img, width, height, x, y) {
    const sticker = {
        id: id,
        x: x,
        y: y,
        width: width,
        height: height,
        rotation: 0,
        finalized: false,
        image: img,
        canvas: null,
        scrapeMask: null,
        placedAt: new Date(),
    };
    buildStickerCanvas(sticker);
    app.stickers.set(id, sticker);
    app.renderer.stickers = app.stickers;
    app.renderer.markDirty();
    return sticker;
}

function applyScrapeUpdates(app, updates) {
    if (!updates) return;
    for (const u of updates) {
        const sticker = app.stickers.get(u.stickerId);
        if (sticker && u.mask) {
            applyMaskDelta(sticker, u.mask);
            app.renderer.markDirty();
        }
    }
}
