// Scrape interaction with acceleration-based pressure

let scrapeState = null;
let scrapePositions = [];
let scrapeCooldownEnd = 0;
let cooldownInterval = null;

function startScrape(app, x, y) {
    const now = Date.now();
    if (now < scrapeCooldownEnd) {
        return; // On cooldown — ignore
    }

    scrapeState = { lastX: x, lastY: y };
    scrapePositions = [{ x, y, time: performance.now() }];
}

function continueScrape(app, x, y) {
    if (!scrapeState) return;

    scrapePositions.push({ x, y, time: performance.now() });

    if (scrapePositions.length > 1000) {
        scrapePositions = scrapePositions.slice(-500);
    }

    scrapeState.lastX = x;
    scrapeState.lastY = y;
}

function endScrape(app, x, y) {
    if (!scrapeState) return;

    // Only send if we have meaningful movement
    if (scrapePositions.length < 3) {
        scrapeState = null;
        scrapePositions = [];
        return;
    }

    // Convert screen positions to canvas coordinates and compute pressure
    const path = [];
    for (let i = 0; i < scrapePositions.length; i++) {
        const pos = scrapePositions[i];
        const canvasPos = app.renderer.screenToCanvas(pos.x, pos.y);
        const pressure = computePressure(scrapePositions, i);
        path.push({ x: canvasPos.x, y: canvasPos.y, pressure });
    }

    app.socket.send({
        type: 'scrape',
        path: path,
        brushRadius: 15,
    });

    // Start cooldown
    scrapeCooldownEnd = Date.now() + 60000;
    showCooldownTimer();

    scrapeState = null;
    scrapePositions = [];
}

function computePressure(positions, index) {
    if (index < 2) return 0.3;

    const p0 = positions[index - 2];
    const p1 = positions[index - 1];
    const p2 = positions[index];

    const dt1 = (p1.time - p0.time) / 1000;
    const dt2 = (p2.time - p1.time) / 1000;
    if (dt1 === 0 || dt2 === 0) return 0.3;

    const v1 = Math.hypot(p1.x - p0.x, p1.y - p0.y) / dt1;
    const v2 = Math.hypot(p2.x - p1.x, p2.y - p1.y) / dt2;

    const accel = Math.abs(v2 - v1) / ((dt1 + dt2) / 2);
    return Math.min(1.0, Math.max(0.1, accel / 2000));
}

function showCooldownTimer() {
    const el = document.getElementById('scrape-cooldown');
    el.hidden = false;

    if (cooldownInterval) clearInterval(cooldownInterval);

    cooldownInterval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((scrapeCooldownEnd - Date.now()) / 1000));
        if (remaining <= 0) {
            el.hidden = true;
            clearInterval(cooldownInterval);
            cooldownInterval = null;
        } else {
            el.textContent = `Scrape: ${remaining}s`;
        }
    }, 250);
}

function initScrape(app) {
    // Scrape is wired up via sticker.js drag handlers
}
