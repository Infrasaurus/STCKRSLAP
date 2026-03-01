// Sticker upload, placement, and rotation
//
// Flow:
//   1. User drops image file → upload to server
//   2. Server returns {id, imageData, width, height}
//   3. Client preloads image, enters PLACEMENT mode (sticker follows cursor)
//   4. User clicks to place → sends WS "place", enters ROTATION mode
//   5. User click-and-holds to rotate → live preview
//   6. User releases → sends WS "finalize", sticker is locked
//   7. 60s timeout auto-finalizes if user doesn't rotate

// Interaction state machine
const MODE_NONE = 0;
const MODE_PLACING = 1;   // ghost sticker follows cursor
const MODE_ROTATING = 2;  // click-and-hold to rotate a placed sticker

let interactionMode = MODE_NONE;
let ghostSticker = null;     // {id, image, canvas, width, height} — follows cursor
let ghostScreenPos = null;   // {x, y} — current screen position of ghost
let rotatingSticker = null;  // sticker being rotated

function initStickerDrop(app) {
    const el = app.renderer.el;

    // Track mouse position for ghost sticker
    el.addEventListener('mousemove', (e) => {
        if (interactionMode === MODE_PLACING && ghostSticker) {
            ghostScreenPos = { x: e.clientX, y: e.clientY };
            app.renderer.markDirty();
        }
    });

    // Drag-and-drop from desktop
    el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        document.body.classList.add('drag-over');
    });

    el.addEventListener('dragleave', (e) => {
        document.body.classList.remove('drag-over');
    });

    el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.body.classList.remove('drag-over');

        const files = e.dataTransfer ? e.dataTransfer.files : null;
        if (!files || files.length === 0) return;

        const file = files[0];
        if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
            showToast('Unsupported file type', 2000);
            return;
        }

        ghostScreenPos = { x: e.clientX, y: e.clientY };
        uploadSticker(app, file);
    });

    // Prevent default on body to ensure drops always go to the canvas
    document.body.addEventListener('dragover', (e) => e.preventDefault());
    document.body.addEventListener('drop', (e) => e.preventDefault());

    // Click/drag interaction
    let isPanning = false;
    let panLast = null;
    let rotDragStarted = false;

    app.input.onDragStart = (x, y, e) => {
        // PLACEMENT mode: click to place the ghost sticker
        if (interactionMode === MODE_PLACING && ghostSticker) {
            placeGhostSticker(app, x, y);
            return;
        }

        // Check if clicking on a sticker awaiting rotation
        const canvasPos = app.renderer.screenToCanvas(x, y);
        const unfinalizedHit = findUnfinalizedStickerAt(app, canvasPos.x, canvasPos.y);

        if (unfinalizedHit) {
            interactionMode = MODE_ROTATING;
            rotatingSticker = unfinalizedHit;
            rotDragStarted = false;
            return;
        }

        if (app.scrapeMode) {
            startScrape(app, x, y);
        } else {
            isPanning = true;
            panLast = { x, y };
            app.renderer.el.classList.add('panning');
        }
    };

    app.input.onDragMove = (x, y, e) => {
        if (interactionMode === MODE_ROTATING && rotatingSticker) {
            rotDragStarted = true;
            const canvasPos = app.renderer.screenToCanvas(x, y);
            const cx = rotatingSticker.x + rotatingSticker.width / 2;
            const cy = rotatingSticker.y + rotatingSticker.height / 2;
            rotatingSticker.rotation = Math.atan2(canvasPos.y - cy, canvasPos.x - cx);
            buildStickerCanvas(rotatingSticker);
            app.renderer.markDirty();
            return;
        }

        if (isPanning && panLast) {
            const dx = x - panLast.x;
            const dy = y - panLast.y;
            panLast = { x, y };
            app.renderer.pan(dx, dy);
            return;
        }

        if (app.scrapeMode) {
            continueScrape(app, x, y);
        }
    };

    app.input.onDragEnd = (x, y, e) => {
        if (interactionMode === MODE_ROTATING && rotatingSticker) {
            // Finalize rotation (even if they didn't drag — finalizes at current angle)
            app.socket.send({
                type: 'finalize',
                id: rotatingSticker.id,
                rotation: rotatingSticker.rotation,
            });
            rotatingSticker = null;
            interactionMode = MODE_NONE;
            return;
        }

        if (isPanning) {
            isPanning = false;
            panLast = null;
            app.renderer.el.classList.remove('panning');
            return;
        }

        if (app.scrapeMode) {
            endScrape(app, x, y);
        }
    };

    // Scroll handling: vertical = zoom, horizontal = scroll left/right
    app.input.onScroll = (dx, dy, mouseX, mouseY) => {
        if (dx !== 0) app.renderer.scrollX(dx);
        if (dy !== 0) app.renderer.zoomAt(dy, mouseX, mouseY);
    };

    // Pan handling (middle-click / two-finger)
    app.input.onPanMove = (dx, dy) => {
        app.renderer.pan(dx, dy);
    };

    // ESC cancels placement mode
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && interactionMode === MODE_PLACING) {
            cancelPlacement(app);
        }
    });
}

function uploadSticker(app, file) {
    // Don't allow new upload while placing
    if (interactionMode === MODE_PLACING) return;

    const formData = new FormData();
    formData.append('sticker', file);

    let uploadUrl = '/api/upload';
    if (app.inviteKey) uploadUrl += `?key=${app.inviteKey}`;

    showToast('Uploading sticker...');

    fetch(uploadUrl, { method: 'POST', body: formData })
        .then(r => {
            if (!r.ok) return r.text().then(t => { throw new Error(t); });
            return r.json();
        })
        .then(data => {
            if (data.resized) {
                showToast('Sticker resized — click to place', 2000);
            } else {
                showToast('Click to place sticker', 2000);
            }

            // Preload the image, then enter placement mode
            const img = new Image();
            img.onload = () => {
                const offscreen = document.createElement('canvas');
                offscreen.width = data.width;
                offscreen.height = data.height;
                const octx = offscreen.getContext('2d');
                octx.drawImage(img, 0, 0);

                ghostSticker = {
                    id: data.id,
                    image: img,
                    canvas: offscreen,
                    width: data.width,
                    height: data.height,
                };

                interactionMode = MODE_PLACING;
                app.renderer.el.classList.add('placing');
                app.renderer.markDirty();
            };
            img.onerror = () => {
                showToast('Failed to load sticker image', 3000);
            };
            img.src = 'data:image/png;base64,' + data.imageData;
        })
        .catch(err => {
            showToast('Upload failed: ' + err.message, 3000);
        });
}

function placeGhostSticker(app, screenX, screenY) {
    if (!ghostSticker) return;

    const canvasPos = app.renderer.screenToCanvas(screenX, screenY);
    const placeX = ((Math.round(canvasPos.x) - Math.floor(ghostSticker.width / 2)) % CANVAS_W + CANVAS_W) % CANVAS_W;
    const placeY = Math.max(0, Math.round(canvasPos.y) - Math.floor(ghostSticker.height / 2));

    // Add locally immediately so it renders without waiting for broadcast
    addStickerLocally(app, ghostSticker.id, ghostSticker.image,
        ghostSticker.width, ghostSticker.height, placeX, placeY);

    // Tell server
    app.socket.send({
        type: 'place',
        id: ghostSticker.id,
        x: placeX,
        y: placeY,
    });

    // Exit placement mode
    ghostSticker = null;
    ghostScreenPos = null;
    interactionMode = MODE_NONE;
    app.renderer.el.classList.remove('placing');

    showToast('Click and drag sticker to rotate, or click to lock', 3000);
}

function cancelPlacement(app) {
    ghostSticker = null;
    ghostScreenPos = null;
    interactionMode = MODE_NONE;
    app.renderer.el.classList.remove('placing');
    hideToast();
    app.renderer.markDirty();
}

// Called by the renderer to draw the ghost sticker
function renderGhostSticker(ctx, renderer) {
    if (interactionMode !== MODE_PLACING || !ghostSticker || !ghostScreenPos) return;

    const z = renderer.zoom;
    const screenX = ghostScreenPos.x - (ghostSticker.width * z) / 2;
    const screenY = ghostScreenPos.y - (ghostSticker.height * z) / 2;

    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.drawImage(ghostSticker.canvas, screenX, screenY, ghostSticker.width * z, ghostSticker.height * z);

    // Dashed border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(screenX, screenY, ghostSticker.width * z, ghostSticker.height * z);
    ctx.setLineDash([]);
    ctx.restore();
}

function findUnfinalizedStickerAt(app, cx, cy) {
    const arr = Array.from(app.stickers.values());
    for (let i = arr.length - 1; i >= 0; i--) {
        const s = arr[i];
        if (s.finalized) continue;
        if (cx >= s.x && cx <= s.x + s.width && cy >= s.y && cy <= s.y + s.height) {
            return s;
        }
        // Check wrapped positions
        if (cx + CANVAS_W >= s.x && cx + CANVAS_W <= s.x + s.width) return s;
        if (cx - CANVAS_W >= s.x && cx - CANVAS_W <= s.x + s.width) return s;
    }
    return null;
}

function showToast(message, autoDismissMs) {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.hidden = false;

    if (el._timer) clearTimeout(el._timer);
    if (autoDismissMs) {
        el._timer = setTimeout(() => { el.hidden = true; }, autoDismissMs);
    }
}

function hideToast() {
    const el = document.getElementById('toast');
    if (el) {
        if (el._timer) clearTimeout(el._timer);
        el.hidden = true;
    }
}
