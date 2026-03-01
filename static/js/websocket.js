// WebSocket connection with auto-reconnect

class StckrSocket {
    constructor(url) {
        this.url = url;
        this.handlers = {};
        this.onConnect = null;
        this._wasConnected = false;
        this.connect();
    }

    connect() {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            const statusEl = document.getElementById('connection-status');
            statusEl.textContent = 'Connected';
            statusEl.className = 'connected';

            if (this.onConnect) this.onConnect(this._wasConnected);
            this._wasConnected = true;
        };

        this.ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                this.dispatch(msg);
            } catch (err) {
                console.error('Bad WS message:', err);
            }
        };

        this.ws.onclose = () => {
            const statusEl = document.getElementById('connection-status');
            statusEl.textContent = 'Disconnected';
            statusEl.className = 'disconnected';

            setTimeout(() => this.connect(), 2000);
        };

        this.ws.onerror = () => {
            // onclose will fire after this
        };
    }

    on(type, handler) {
        this.handlers[type] = handler;
    }

    dispatch(msg) {
        const handler = this.handlers[msg.type];
        if (handler) handler(msg);
    }

    send(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }
}
