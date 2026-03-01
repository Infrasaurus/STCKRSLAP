// STCKRSLAP — Main application init

const APP = {
    canvas: null,
    renderer: null,
    socket: null,
    input: null,
    stickers: new Map(),
    inviteKey: '',
    scrapeMode: false,
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

    // Init scrape interaction
    initScrape(APP);

    // Scrape mode toggle
    const scrapeBtn = document.getElementById('scrape-toggle');
    scrapeBtn.addEventListener('click', () => {
        APP.scrapeMode = !APP.scrapeMode;
        scrapeBtn.classList.toggle('active', APP.scrapeMode);
        APP.renderer.el.classList.toggle('scrape-mode', APP.scrapeMode);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 's' || e.key === 'S') {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            APP.scrapeMode = !APP.scrapeMode;
            scrapeBtn.classList.toggle('active', APP.scrapeMode);
            APP.renderer.el.classList.toggle('scrape-mode', APP.scrapeMode);
        }
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

    APP.socket.on('scrape_applied', (msg) => {
        applyScrapeUpdates(APP, msg.updates);
    });

    APP.socket.on('full_state', (msg) => {
        APP.stickers.clear();
        if (msg.stickers) {
            for (const s of msg.stickers) {
                addStickerFromServer(APP, s);
            }
        }
        APP.renderer.markDirty();
    });

    APP.socket.on('error', (msg) => {
        console.error('Server error:', msg.message);
    });

    APP.socket.onConnect = (isReconnect) => {
        // Fetch full state on every connect (initial + reconnect)
        let stateUrl = '/api/state';
        if (APP.inviteKey) stateUrl += `?key=${APP.inviteKey}`;
        fetch(stateUrl)
            .then(r => r.json())
            .then(state => {
                APP.stickers.clear();
                if (state.stickers) {
                    for (const s of state.stickers) {
                        addStickerFromServer(APP, s);
                    }
                }
                APP.renderer.markDirty();
            })
            .catch(err => console.error('State fetch failed:', err));
    };
})();
