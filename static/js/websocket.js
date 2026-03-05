// WebSocket connection with auto-reconnect

class StckrSocket {
    constructor(url) {
        this.url = url;
        this.handlers = {};
        this.onConnect = null;
        this._wasConnected = false;
        this._ready = false;       // true after initial state is loaded
        this._messageBuffer = [];  // buffer messages until ready
        this.connect();
    }

    connect() {
        this._ready = false;
        this._messageBuffer = [];
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            const statusEl = document.getElementById('connection-status');
            statusEl.textContent = 'Connected';
            statusEl.className = 'connected';
            // Clear last-sticker line until first status arrives
            const lastEl = document.getElementById('last-sticker');
            if (lastEl) lastEl.textContent = '';

            if (this.onConnect) this.onConnect(this._wasConnected);
            this._wasConnected = true;
        };

        this.ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (this._ready) {
                    this.dispatch(msg);
                } else {
                    this._messageBuffer.push(msg);
                }
            } catch (err) {
                console.error('Bad WS message:', err);
            }
        };

        this.ws.onclose = () => {
            const statusEl = document.getElementById('connection-status');
            statusEl.textContent = 'Disconnected';
            statusEl.className = 'disconnected';
            this._ready = false;

            setTimeout(() => this.connect(), 2000);
        };

        this.ws.onerror = () => {
            // onclose will fire after this
        };
    }

    // Called after state fetch completes to flush buffered messages
    setReady() {
        this._ready = true;
        for (const msg of this._messageBuffer) {
            this.dispatch(msg);
        }
        this._messageBuffer = [];
    }

    on(type, handler) {
        this.handlers[type] = handler;
    }

    dispatch(msg) {
        const handler = this.handlers[msg.type];
        if (handler) handler(msg);
    }

    send(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this._ready) {
            this.ws.send(JSON.stringify(msg));
        }
    }
}
