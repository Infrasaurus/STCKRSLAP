// Sticker upload, tray, and placement
//
// Flow:
//   1. User uploads or drops image file -> upload to server
//   2. Server returns {id, imageData, width, height}
//   3. Sticker appears in tray at bottom of screen
//   4. User drags sticker from tray onto canvas
//   5. On release, sticker is placed with random wobble (+-30 deg) and immediately finalized

// Interaction state machine
const MODE_NONE = 0;
const MODE_PLACING = 1;   // ghost sticker follows cursor (dragging from tray)

let interactionMode = MODE_NONE;
let ghostSticker = null;     // {id, image, canvas, width, height, trayItem} — follows cursor
let ghostScreenPos = null;   // {x, y} — current screen position of ghost

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
        if (!file.type.match(/^image\/(png|jpeg|webp|gif)$/)) {
            showToast('Unsupported file type', 2000);
            return;
        }

        uploadSticker(app, file);
    });

    // Prevent default on body to ensure drops always go to the canvas
    document.body.addEventListener('dragover', (e) => e.preventDefault());
    document.body.addEventListener('drop', (e) => e.preventDefault());

    // Click/drag interaction
    let isPanning = false;
    let panLast = null;

    app.input.onDragStart = (x, y, e) => {
        // PLACEMENT mode: start dragging the ghost to position it
        if (interactionMode === MODE_PLACING && ghostSticker) {
            ghostScreenPos = { x, y };
            app.renderer.markDirty();
            return;
        }

        isPanning = true;
        panLast = { x, y };
        app.renderer.el.classList.add('panning');
    };

    app.input.onDragMove = (x, y, e) => {
        // PLACEMENT mode: move ghost with finger/mouse
        if (interactionMode === MODE_PLACING && ghostSticker) {
            ghostScreenPos = { x, y };
            app.renderer.markDirty();
            return;
        }

        if (isPanning && panLast) {
            const dx = x - panLast.x;
            const dy = y - panLast.y;
            panLast = { x, y };
            app.renderer.pan(dx, dy);
        }
    };

    app.input.onDragEnd = (x, y, e) => {
        // PLACEMENT mode: release to place
        if (interactionMode === MODE_PLACING && ghostSticker) {
            placeGhostSticker(app, x, y);
            return;
        }

        if (isPanning) {
            isPanning = false;
            panLast = null;
            app.renderer.el.classList.remove('panning');
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

    // Pinch-to-zoom (touch)
    app.input.onPinchZoom = (scale, screenX, screenY) => {
        app.renderer.pinchZoom(scale, screenX, screenY);
    };

    // ESC cancels placement mode — return sticker to tray
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && interactionMode === MODE_PLACING) {
            cancelPlacement(app);
        }
    });

    // Document-level mousemove/touchmove for ghost tracking during tray drag
    document.addEventListener('mousemove', (e) => {
        if (interactionMode === MODE_PLACING && ghostSticker) {
            ghostScreenPos = { x: e.clientX, y: e.clientY };
            app.renderer.markDirty();
        }
    });
    document.addEventListener('touchmove', (e) => {
        if (interactionMode === MODE_PLACING && ghostSticker) {
            const t = e.touches[0];
            ghostScreenPos = { x: t.clientX, y: t.clientY };
            app.renderer.markDirty();
        }
    }, { passive: true });

    // Document-level mouseup/touchend to place from tray drag
    document.addEventListener('mouseup', (e) => {
        if (interactionMode === MODE_PLACING && ghostSticker) {
            placeGhostSticker(app, e.clientX, e.clientY);
        }
    });
    document.addEventListener('touchend', (e) => {
        if (interactionMode === MODE_PLACING && ghostSticker && ghostScreenPos) {
            placeGhostSticker(app, ghostScreenPos.x, ghostScreenPos.y);
        }
    });
}

function addToTray(app, data) {
    const tray = document.getElementById('sticker-tray');
    const img = new Image();
    img.onload = () => {
        const isGif = (data.mimeType === 'image/gif');
        let offscreen;
        if (isGif) {
            // For GIFs, use the <img> directly so animation is preserved
            offscreen = img;
        } else {
            offscreen = document.createElement('canvas');
            offscreen.width = data.width;
            offscreen.height = data.height;
            const octx = offscreen.getContext('2d');
            octx.drawImage(img, 0, 0);
        }

        const thumbEl = document.createElement('img');
        thumbEl.className = 'tray-sticker';
        thumbEl.src = img.src;
        thumbEl.draggable = false;

        const trayItem = {
            id: data.id,
            image: img,
            canvas: offscreen,
            width: data.width,
            height: data.height,
            gif: isGif,
            el: thumbEl,
        };

        app.tray.push(trayItem);
        tray.appendChild(thumbEl);

        // Start drag from tray on mousedown/touchstart
        const startDrag = (startX, startY) => {
            // Remove from tray
            const idx = app.tray.indexOf(trayItem);
            if (idx !== -1) app.tray.splice(idx, 1);
            thumbEl.remove();

            // Enter placement mode
            ghostSticker = {
                id: trayItem.id,
                image: trayItem.image,
                canvas: trayItem.canvas,
                width: trayItem.width,
                height: trayItem.height,
                gif: trayItem.gif,
                trayItem: trayItem,
            };
            ghostScreenPos = { x: startX, y: startY };
            interactionMode = MODE_PLACING;
            app.renderer.el.classList.add('placing');
            app.renderer.markDirty();
        };

        thumbEl.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startDrag(e.clientX, e.clientY);
        });
        thumbEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const t = e.touches[0];
            startDrag(t.clientX, t.clientY);
        });
    };
    img.onerror = () => {
        showToast('Failed to load sticker image', 3000);
    };
    const mime = data.mimeType || 'image/png';
    img.src = 'data:' + mime + ';base64,' + data.imageData;
}

function returnToTray(app, ghost) {
    if (!ghost || !ghost.trayItem) return;
    const tray = document.getElementById('sticker-tray');
    app.tray.push(ghost.trayItem);
    tray.appendChild(ghost.trayItem.el);
}

function uploadSticker(app, file) {
    // Don't allow upload before state is synced
    if (!app.socket._ready) {
        showToast('Syncing canvas, please wait...', 2000);
        return;
    }

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
                showToast('Sticker added to tray (resized)', 2000);
            } else {
                showToast('Sticker added to tray', 2000);
            }
            addToTray(app, data);
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

    // Random wobble: +-30 degrees
    const rotation = (Math.random() * 60 - 30) * Math.PI / 180;

    // Add locally immediately so it renders without waiting for broadcast
    addStickerLocally(app, ghostSticker.id, ghostSticker.image,
        ghostSticker.width, ghostSticker.height, placeX, placeY, rotation, true, ghostSticker.gif);

    // Tell server — place and immediately finalize
    app.socket.send({
        type: 'place',
        id: ghostSticker.id,
        x: placeX,
        y: placeY,
    });
    app.socket.send({
        type: 'finalize',
        id: ghostSticker.id,
        rotation: rotation,
    });

    // Exit placement mode
    ghostSticker = null;
    ghostScreenPos = null;
    interactionMode = MODE_NONE;
    app.renderer.el.classList.remove('placing');
}

function cancelPlacement(app) {
    // Return sticker to tray instead of discarding
    returnToTray(app, ghostSticker);
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
