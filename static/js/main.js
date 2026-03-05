// STCKRSLAP — Main application init

function timeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return seconds + 's ago';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    return days + 'd ago';
}

const APP = {
    canvas: null,
    renderer: null,
    socket: null,
    input: null,
    stickers: new Map(),
    tray: [],
    inviteKey: '',
};

(function init() {
    // Extract invite key from URL path
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (path) {
        APP.inviteKey = path;
        // Store in cookie for API/WS requests
        document.cookie = `stckrslap_key=${path};path=/;SameSite=Strict`;
    }

    // Init canvas renderer
    APP.renderer = new CanvasRenderer(document.getElementById('canvas'));

    // Init input handler
    APP.input = new InputHandler(APP.renderer.el);

    // Init WebSocket
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${proto}//${location.host}/ws`;
    if (APP.inviteKey) wsUrl += `?key=${APP.inviteKey}`;
    APP.socket = new StckrSocket(wsUrl);

    // Init sticker drag-and-drop
    initStickerDrop(APP);

    // Upload button — triggers file picker (useful on mobile)
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('file-input');
    uploadBtn.addEventListener('click', () => {
        if (!APP.socket._ready) {
            showToast('Syncing canvas, please wait...', 2000);
            return;
        }
        fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        uploadSticker(APP, file);
        // Reset so the same file can be selected again
        fileInput.value = '';
    });

    // Wire up WebSocket message handlers
    APP.socket.on('sticker_placed', (msg) => {
        addStickerFromServer(APP, msg);
    });

    APP.socket.on('sticker_finalized', (msg) => {
        const s = APP.stickers.get(msg.id);
        if (s) {
            s.rotation = msg.rotation;
            s.finalized = true;
            buildStickerCanvas(s);
            APP.renderer.markDirty();
        }
    });

    APP.socket.on('full_state', (msg) => {
        // Remove old GIF overlay elements before clearing stickers
        for (const s of APP.stickers.values()) {
            if (s.overlayEl && s.overlayEl.parentNode) {
                s.overlayEl.parentNode.removeChild(s.overlayEl);
            }
        }
        APP.stickers.clear();
        if (msg.stickers) {
            for (const s of msg.stickers) {
                addStickerFromServer(APP, s);
            }
        }
        APP.renderer.markDirty();
    });

    APP.socket.on('status', (msg) => {
        const statusEl = document.getElementById('connection-status');
        statusEl.textContent = msg.connected + ' online';
        const lastEl = document.getElementById('last-sticker');
        if (msg.lastStickerAt) {
            APP._lastStickerAt = new Date(msg.lastStickerAt);
            if (lastEl) lastEl.textContent = 'Last sticker ' + timeAgo(APP._lastStickerAt);
        } else {
            APP._lastStickerAt = null;
            if (lastEl) lastEl.textContent = '';
        }
    });

    APP.socket.on('error', (msg) => {
        console.error('Server error:', msg.message);
    });

    // Refresh the "last sticker" relative time every 15s
    setInterval(() => {
        if (APP._lastStickerAt) {
            const lastEl = document.getElementById('last-sticker');
            if (lastEl) lastEl.textContent = 'Last sticker ' + timeAgo(APP._lastStickerAt);
        }
    }, 15000);

    APP.socket.onConnect = (isReconnect) => {
        // Fetch full state on every connect (initial + reconnect)
        let stateUrl = '/api/state';
        if (APP.inviteKey) stateUrl += `?key=${APP.inviteKey}`;
        fetch(stateUrl)
            .then(r => r.json())
            .then(state => {
                // Remove old GIF overlay elements
                for (const s of APP.stickers.values()) {
                    if (s.overlayEl && s.overlayEl.parentNode) {
                        s.overlayEl.parentNode.removeChild(s.overlayEl);
                    }
                }
                APP.stickers.clear();
                if (state.stickers) {
                    for (const s of state.stickers) {
                        addStickerFromServer(APP, s);
                    }
                }
                APP.renderer.markDirty();
                // Now flush any WS messages that arrived during the fetch
                APP.socket.setReady();
            })
            .catch(err => {
                console.error('State fetch failed:', err);
                // Still mark as ready so the client isn't permanently stuck
                APP.socket.setReady();
            });
    };
})();
