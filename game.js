// NEON VOID — Arena Survivor
// Twin-stick shooter optimized for iPad touch controls

// ============================================================
// Utility helpers
// ============================================================
const TWO_PI = Math.PI * 2;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
function dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }
function angleBetween(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

// ============================================================
// Color palette
// ============================================================
const COLORS = {
    cyan:    '#00ffff',
    pink:    '#ff0066',
    purple:  '#9933ff',
    yellow:  '#ffcc00',
    green:   '#00ff88',
    orange:  '#ff8800',
    white:   '#ffffff',
    bg:      '#05050a',
};

// ============================================================
// Main Game Class
// ============================================================
class NeonVoid {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Retina / high-DPI support
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Core state
        this.state = 'menu'; // menu | playing | gameover | waveIntro
        this.lastTime = 0;
        this.dt = 0;
        this.elapsed = 0;

        // Player
        this.player = this.createPlayer();

        // Game objects
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        this.powerUps = [];
        this.stars = [];

        // Waves
        this.wave = 0;
        this.waveTimer = 0;
        this.waveEnemiesLeft = 0;
        this.waveSpawnTimer = 0;
        this.wavePaused = false;
        this.waveAnnounceTimer = 0;

        // Scoring
        this.score = 0;
        this.multiplier = 1;
        this.maxMultiplier = 1;
        this.multiplierTimer = 0;
        this.kills = 0;

        // Screen effects
        this.shake = { x: 0, y: 0, intensity: 0 };
        this.flash = { alpha: 0, color: '#fff' };
        this.slowMo = 1;
        this.slowMoTimer = 0;

        // Audio
        this.audio = { ctx: null, master: null, enabled: true };
        this.initAudio();

        // High score
        this.highScore = 0;
        this.loadHighScore();

        // Generate background stars
        this.initStars();

        // Input state
        this.input = {
            moveActive: false,
            moveId: null,
            moveOriginX: 0,
            moveOriginY: 0,
            moveDx: 0,
            moveDy: 0,

            aimActive: false,
            aimId: null,
            aimX: 0,
            aimY: 0,

            // Keyboard fallback
            keys: {},
            mouseX: 0,
            mouseY: 0,
            mouseDown: false,
        };

        this.setupInput();
        this.setupUI();

        // Bind and start loop
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    // --------------------------------------------------------
    // Setup
    // --------------------------------------------------------
    resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.canvas.width = w * this.dpr;
        this.canvas.height = h * this.dpr;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.w = w;
        this.h = h;

        // Arena bounds (with padding)
        this.arena = {
            x: 40,
            y: 40,
            w: w - 80,
            h: h - 80,
        };
    }

    createPlayer() {
        return {
            x: this.w ? this.w / 2 : 400,
            y: this.h ? this.h / 2 : 300,
            radius: 14,
            speed: 260,
            angle: 0,
            fireRate: 0.12,
            fireTimer: 0,
            lives: 3,
            invincible: 0,
            weapon: 'pulse', // pulse | spread | rapid | beam
            weaponTimer: 0,
        };
    }

    initStars() {
        this.stars = [];
        const count = Math.floor((this.w * this.h) / 3000);
        for (let i = 0; i < count; i++) {
            this.stars.push({
                x: rand(0, this.w),
                y: rand(0, this.h),
                size: rand(0.5, 2),
                brightness: rand(0.1, 0.4),
                twinkleSpeed: rand(0.5, 2),
            });
        }
    }

    initAudio() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            this.audio.ctx = new AC();
            this.audio.master = this.audio.ctx.createGain();
            this.audio.master.gain.value = 0.25;
            this.audio.master.connect(this.audio.ctx.destination);
        } catch {
            this.audio.enabled = false;
        }
    }

    resumeAudio() {
        if (this.audio.ctx && this.audio.ctx.state === 'suspended') {
            this.audio.ctx.resume();
        }
    }

    loadHighScore() {
        try {
            this.highScore = parseInt(localStorage.getItem('neonVoidHighScore')) || 0;
        } catch { this.highScore = 0; }
    }

    saveHighScore() {
        try {
            if (this.score > this.highScore) {
                this.highScore = this.score;
                localStorage.setItem('neonVoidHighScore', this.highScore.toString());
                return true;
            }
        } catch { /* ignore */ }
        return false;
    }

    // --------------------------------------------------------
    // Input (multi-touch + keyboard/mouse)
    // --------------------------------------------------------
    setupInput() {
        // --- Touch ---
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.resumeAudio();
            for (const t of e.changedTouches) {
                this.handleTouchStart(t);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (const t of e.changedTouches) {
                this.handleTouchMove(t);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            for (const t of e.changedTouches) {
                this.handleTouchEnd(t);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchcancel', (e) => {
            for (const t of e.changedTouches) {
                this.handleTouchEnd(t);
            }
        });

        // --- Keyboard ---
        window.addEventListener('keydown', (e) => {
            this.input.keys[e.key.toLowerCase()] = true;
            if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e) => {
            this.input.keys[e.key.toLowerCase()] = false;
        });

        // --- Mouse ---
        this.canvas.addEventListener('mousedown', (e) => {
            this.resumeAudio();
            this.input.mouseDown = true;
            this.input.mouseX = e.clientX;
            this.input.mouseY = e.clientY;
        });
        this.canvas.addEventListener('mouseup', () => { this.input.mouseDown = false; });
        this.canvas.addEventListener('mousemove', (e) => {
            this.input.mouseX = e.clientX;
            this.input.mouseY = e.clientY;
        });
    }

    handleTouchStart(t) {
        const x = t.clientX;
        const halfW = this.w / 2;

        if (x < halfW && !this.input.moveActive) {
            // Left half → movement joystick
            this.input.moveActive = true;
            this.input.moveId = t.identifier;
            this.input.moveOriginX = x;
            this.input.moveOriginY = t.clientY;
            this.input.moveDx = 0;
            this.input.moveDy = 0;
        } else if (x >= halfW && !this.input.aimActive) {
            // Right half → aim/shoot
            this.input.aimActive = true;
            this.input.aimId = t.identifier;
            this.input.aimX = x;
            this.input.aimY = t.clientY;
        }
    }

    handleTouchMove(t) {
        if (t.identifier === this.input.moveId) {
            this.input.moveDx = t.clientX - this.input.moveOriginX;
            this.input.moveDy = t.clientY - this.input.moveOriginY;
        }
        if (t.identifier === this.input.aimId) {
            this.input.aimX = t.clientX;
            this.input.aimY = t.clientY;
        }
    }

    handleTouchEnd(t) {
        if (t.identifier === this.input.moveId) {
            this.input.moveActive = false;
            this.input.moveId = null;
            this.input.moveDx = 0;
            this.input.moveDy = 0;
        }
        if (t.identifier === this.input.aimId) {
            this.input.aimActive = false;
            this.input.aimId = null;
        }
    }

    setupUI() {
        document.getElementById('start-btn').addEventListener('click', () => {
            this.resumeAudio();
            this.startGame();
        });
        document.getElementById('retry-btn').addEventListener('click', () => {
            this.resumeAudio();
            this.startGame();
        });
    }

    // --------------------------------------------------------
    // Game state management
    // --------------------------------------------------------
    startGame() {
        this.state = 'playing';
        this.player = this.createPlayer();
        this.player.x = this.w / 2;
        this.player.y = this.h / 2;
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        this.powerUps = [];
        this.wave = 0;
        this.waveTimer = 0;
        this.waveEnemiesLeft = 0;
        this.score = 0;
        this.multiplier = 1;
        this.maxMultiplier = 1;
        this.multiplierTimer = 0;
        this.kills = 0;
        this.elapsed = 0;
        this.slowMo = 1;

        this.initStars();

        // UI
        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('gameover-screen').classList.remove('active');
        document.getElementById('hud').classList.add('active');

        // Hide touch zone hints after first game
        const tz = document.getElementById('touch-zones');
        tz.classList.add('visible');
        setTimeout(() => tz.classList.remove('visible'), 3000);

        // Start first wave
        this.nextWave();
    }

    gameOver() {
        this.state = 'gameover';
        const isNew = this.saveHighScore();

        document.getElementById('final-score').textContent = this.score.toLocaleString();
        document.getElementById('final-wave').textContent = this.wave;
        document.getElementById('final-kills').textContent = this.kills;
        document.getElementById('final-multiplier').textContent = 'x' + this.maxMultiplier;

        const hsEl = document.getElementById('high-score-text');
        if (isNew) {
            hsEl.textContent = 'NEW HIGH SCORE!';
            hsEl.style.color = '#ffcc00';
        } else {
            hsEl.textContent = 'HIGH SCORE: ' + this.highScore.toLocaleString();
            hsEl.style.color = '#00ffff';
        }

        document.getElementById('hud').classList.remove('active');
        document.getElementById('gameover-screen').classList.add('active');

        // Death explosion
        for (let i = 0; i < 60; i++) {
            this.spawnParticle(this.player.x, this.player.y, rand(0, TWO_PI), rand(80, 300), COLORS.cyan, rand(0.8, 2), rand(2, 6));
        }
        for (let i = 0; i < 30; i++) {
            this.spawnParticle(this.player.x, this.player.y, rand(0, TWO_PI), rand(40, 200), COLORS.pink, rand(0.5, 1.5), rand(3, 8));
        }
        this.shake.intensity = 20;
        this.flash.alpha = 0.8;
        this.flash.color = COLORS.cyan;
    }

    nextWave() {
        this.wave++;
        this.waveTimer = 0;

        // Calculate enemies for this wave
        this.waveEnemiesLeft = 5 + this.wave * 3 + Math.floor(this.wave * this.wave * 0.3);
        this.waveSpawnTimer = 0;

        // Show wave announcement
        this.waveAnnounceTimer = 2;
        const announceEl = document.getElementById('wave-announce');
        const textEl = announceEl.querySelector('.wave-text');
        textEl.textContent = 'WAVE ' + this.wave;
        announceEl.classList.add('visible');
        setTimeout(() => announceEl.classList.remove('visible'), 1800);

        this.playSound('wave');
    }

    // --------------------------------------------------------
    // Main loop
    // --------------------------------------------------------
    loop(time) {
        const rawDt = (time - this.lastTime) / 1000;
        this.lastTime = time;
        this.dt = Math.min(rawDt, 0.1) * this.slowMo;

        if (this.state === 'playing') {
            this.elapsed += this.dt;
            this.update();
        }

        // Always update particles and effects (even on menus for ambiance)
        this.updateParticles();
        this.updateShake();

        this.render();
        requestAnimationFrame(this.loop);
    }

    // --------------------------------------------------------
    // Update
    // --------------------------------------------------------
    update() {
        const dt = this.dt;
        const p = this.player;

        // --- Movement (touch joystick or keyboard) ---
        let mx = 0, my = 0;

        if (this.input.moveActive) {
            const deadzone = 12;
            const maxDist = 80;
            const d = dist(0, 0, this.input.moveDx, this.input.moveDy);
            if (d > deadzone) {
                const factor = clamp((d - deadzone) / (maxDist - deadzone), 0, 1);
                mx = (this.input.moveDx / d) * factor;
                my = (this.input.moveDy / d) * factor;
            }
        }

        // Keyboard WASD / arrows
        const keys = this.input.keys;
        if (keys['w'] || keys['arrowup']) my -= 1;
        if (keys['s'] || keys['arrowdown']) my += 1;
        if (keys['a'] || keys['arrowleft']) mx -= 1;
        if (keys['d'] || keys['arrowright']) mx += 1;

        // Normalize keyboard input
        if (!this.input.moveActive && (mx !== 0 || my !== 0)) {
            const mag = Math.sqrt(mx * mx + my * my);
            if (mag > 1) { mx /= mag; my /= mag; }
        }

        p.x += mx * p.speed * dt;
        p.y += my * p.speed * dt;

        // Clamp to arena
        p.x = clamp(p.x, this.arena.x + p.radius, this.arena.x + this.arena.w - p.radius);
        p.y = clamp(p.y, this.arena.y + p.radius, this.arena.y + this.arena.h - p.radius);

        // --- Aim angle ---
        if (this.input.aimActive) {
            p.angle = angleBetween(p.x, p.y, this.input.aimX, this.input.aimY);
        } else if (this.input.mouseDown || (!this.input.moveActive && !this.input.aimActive)) {
            p.angle = angleBetween(p.x, p.y, this.input.mouseX, this.input.mouseY);
        }

        // --- Firing ---
        const isFiring = this.input.aimActive || this.input.mouseDown || keys[' '];
        p.fireTimer -= dt;
        if (isFiring && p.fireTimer <= 0) {
            this.fireBullet();
            p.fireTimer = this.getFireRate();
        }

        // --- Weapon timer ---
        if (p.weapon !== 'pulse') {
            p.weaponTimer -= dt;
            if (p.weaponTimer <= 0) {
                p.weapon = 'pulse';
                p.weaponTimer = 0;
            }
        }

        // --- Invincibility ---
        if (p.invincible > 0) {
            p.invincible -= dt;
        }

        // --- Multiplier decay ---
        this.multiplierTimer -= dt;
        if (this.multiplierTimer <= 0 && this.multiplier > 1) {
            this.multiplier = Math.max(1, this.multiplier - 1);
            this.multiplierTimer = 2;
        }

        // --- Slow motion decay ---
        if (this.slowMo < 1) {
            this.slowMoTimer -= rawDt;
            if (this.slowMoTimer <= 0) {
                this.slowMo = 1;
            }
        }

        // --- Update bullets ---
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += Math.cos(b.angle) * b.speed * dt;
            b.y += Math.sin(b.angle) * b.speed * dt;
            b.life -= dt;

            if (b.life <= 0 || b.x < -20 || b.x > this.w + 20 || b.y < -20 || b.y > this.h + 20) {
                this.bullets.splice(i, 1);
            }
        }

        // --- Update enemies ---
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            this.updateEnemy(e, dt);

            // Enemy-bullet collision
            for (let j = this.bullets.length - 1; j >= 0; j--) {
                const b = this.bullets[j];
                if (dist(e.x, e.y, b.x, b.y) < e.radius + b.radius) {
                    e.hp -= b.damage;
                    this.bullets.splice(j, 1);

                    // Hit particles
                    for (let k = 0; k < 4; k++) {
                        this.spawnParticle(b.x, b.y, rand(0, TWO_PI), rand(40, 120), e.color, rand(0.2, 0.5), rand(1, 3));
                    }
                    this.playSound('hit');

                    if (e.hp <= 0) {
                        this.killEnemy(e, i);
                        break;
                    }
                }
            }

            // Enemy-player collision
            if (e.hp > 0 && p.invincible <= 0 && dist(e.x, e.y, p.x, p.y) < e.radius + p.radius) {
                this.playerHit(e);
                // Destroy enemy on contact
                this.killEnemy(e, this.enemies.indexOf(e));
            }

            // Remove if dead
            if (e.hp <= 0 && this.enemies[i] === e) {
                this.enemies.splice(i, 1);
            }
        }

        // --- Update power-ups ---
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const pu = this.powerUps[i];
            pu.age += dt;
            pu.bobOffset = Math.sin(pu.age * 3) * 4;

            // Expire after 10 seconds
            if (pu.age > 10) {
                this.powerUps.splice(i, 1);
                continue;
            }

            // Collection
            if (dist(p.x, p.y, pu.x, pu.y) < p.radius + pu.radius) {
                this.collectPowerUp(pu);
                this.powerUps.splice(i, 1);
            }
        }

        // --- Wave spawning ---
        this.waveAnnounceTimer -= dt;

        if (this.waveEnemiesLeft > 0 && this.waveAnnounceTimer <= 0) {
            this.waveSpawnTimer -= dt;
            const spawnDelay = Math.max(0.3, 1.5 - this.wave * 0.05);
            if (this.waveSpawnTimer <= 0) {
                this.spawnEnemy();
                this.waveEnemiesLeft--;
                this.waveSpawnTimer = spawnDelay;
            }
        }

        // Check wave complete
        if (this.waveEnemiesLeft <= 0 && this.enemies.length === 0) {
            this.waveTimer += dt;
            if (this.waveTimer > 2) {
                this.nextWave();
            }
        }

        // --- Trail particles from player ---
        if (mx !== 0 || my !== 0) {
            if (Math.random() < 0.4) {
                const trailAngle = Math.atan2(-my, -mx) + rand(-0.3, 0.3);
                this.spawnParticle(
                    p.x + rand(-4, 4), p.y + rand(-4, 4),
                    trailAngle, rand(20, 60), COLORS.cyan, rand(0.2, 0.5), rand(1, 3)
                );
            }
        }

        // --- Update HUD ---
        this.updateHUD();
    }

    // --------------------------------------------------------
    // Player actions
    // --------------------------------------------------------
    getFireRate() {
        switch (this.player.weapon) {
            case 'rapid': return 0.06;
            case 'spread': return 0.2;
            case 'beam': return 0.04;
            default: return 0.12;
        }
    }

    fireBullet() {
        const p = this.player;
        const baseSpeed = 700;

        switch (p.weapon) {
            case 'spread': {
                const count = 5;
                const arc = 0.5; // radians
                for (let i = 0; i < count; i++) {
                    const angle = p.angle - arc / 2 + (arc / (count - 1)) * i;
                    this.bullets.push({
                        x: p.x + Math.cos(angle) * p.radius,
                        y: p.y + Math.sin(angle) * p.radius,
                        angle,
                        speed: baseSpeed,
                        radius: 3,
                        damage: 1,
                        life: 0.8,
                        color: COLORS.yellow,
                    });
                }
                this.playSound('shoot');
                break;
            }
            case 'rapid': {
                const angle = p.angle + rand(-0.08, 0.08);
                this.bullets.push({
                    x: p.x + Math.cos(angle) * p.radius,
                    y: p.y + Math.sin(angle) * p.radius,
                    angle,
                    speed: baseSpeed * 1.2,
                    radius: 2.5,
                    damage: 0.8,
                    life: 0.7,
                    color: COLORS.green,
                });
                this.playSound('shoot');
                break;
            }
            case 'beam': {
                this.bullets.push({
                    x: p.x + Math.cos(p.angle) * p.radius,
                    y: p.y + Math.sin(p.angle) * p.radius,
                    angle: p.angle,
                    speed: baseSpeed * 1.8,
                    radius: 4,
                    damage: 0.5,
                    life: 0.5,
                    color: COLORS.purple,
                });
                break;
            }
            default: { // pulse
                this.bullets.push({
                    x: p.x + Math.cos(p.angle) * p.radius,
                    y: p.y + Math.sin(p.angle) * p.radius,
                    angle: p.angle,
                    speed: baseSpeed,
                    radius: 3,
                    damage: 1,
                    life: 1,
                    color: COLORS.cyan,
                });
                this.playSound('shoot');
            }
        }
    }

    playerHit(source) {
        const p = this.player;
        if (p.invincible > 0) return;

        p.lives--;
        p.invincible = 2;
        this.multiplier = 1;
        this.multiplierTimer = 0;

        // Impact effects
        this.shake.intensity = 12;
        this.flash.alpha = 0.6;
        this.flash.color = COLORS.pink;

        // Slow-mo on hit
        this.slowMo = 0.3;
        this.slowMoTimer = 0.4;

        // Explosion particles
        for (let i = 0; i < 30; i++) {
            this.spawnParticle(p.x, p.y, rand(0, TWO_PI), rand(60, 200), COLORS.pink, rand(0.5, 1.2), rand(2, 5));
        }

        this.playSound('playerHit');

        if (p.lives <= 0) {
            this.gameOver();
        }
    }

    // --------------------------------------------------------
    // Enemies
    // --------------------------------------------------------
    spawnEnemy() {
        const types = this.getEnemyTypesForWave();
        const type = types[randInt(0, types.length - 1)];
        const edge = randInt(0, 3); // 0=top, 1=right, 2=bottom, 3=left

        let x, y;
        switch (edge) {
            case 0: x = rand(0, this.w); y = -30; break;
            case 1: x = this.w + 30; y = rand(0, this.h); break;
            case 2: x = rand(0, this.w); y = this.h + 30; break;
            default: x = -30; y = rand(0, this.h); break;
        }

        const templates = {
            drone:   { hp: 1, radius: 10, speed: 100, color: COLORS.pink, score: 10 },
            chaser:  { hp: 2, radius: 12, speed: 150, color: COLORS.orange, score: 25 },
            tank:    { hp: 6, radius: 20, speed: 60,  color: COLORS.purple, score: 50 },
            swift:   { hp: 1, radius: 8,  speed: 250, color: COLORS.yellow, score: 30 },
            orbiter: { hp: 3, radius: 14, speed: 120, color: COLORS.green, score: 40 },
        };

        const t = templates[type];
        // Scale HP with wave
        const hpScale = 1 + (this.wave - 1) * 0.15;
        const speedScale = 1 + (this.wave - 1) * 0.03;

        this.enemies.push({
            x, y,
            type,
            hp: Math.ceil(t.hp * hpScale),
            maxHp: Math.ceil(t.hp * hpScale),
            radius: t.radius,
            speed: t.speed * speedScale,
            color: t.color,
            score: t.score,
            angle: 0,
            age: 0,
            // For orbiter
            orbitAngle: rand(0, TWO_PI),
            orbitRadius: rand(150, 250),
        });
    }

    getEnemyTypesForWave() {
        const types = ['drone'];
        if (this.wave >= 2) types.push('chaser');
        if (this.wave >= 3) types.push('swift');
        if (this.wave >= 4) types.push('tank');
        if (this.wave >= 5) types.push('orbiter');
        return types;
    }

    updateEnemy(e, dt) {
        e.age += dt;
        const p = this.player;
        const angleToPlayer = angleBetween(e.x, e.y, p.x, p.y);

        switch (e.type) {
            case 'drone':
                // Simple chase
                e.x += Math.cos(angleToPlayer) * e.speed * dt;
                e.y += Math.sin(angleToPlayer) * e.speed * dt;
                e.angle = angleToPlayer;
                break;

            case 'chaser':
                // Faster, more aggressive chase with slight wobble
                e.angle = lerp(e.angle, angleToPlayer, 5 * dt);
                e.x += Math.cos(e.angle) * e.speed * dt;
                e.y += Math.sin(e.angle) * e.speed * dt;
                break;

            case 'tank':
                // Slow, deliberate movement
                e.angle = lerp(e.angle, angleToPlayer, 2 * dt);
                e.x += Math.cos(e.angle) * e.speed * dt;
                e.y += Math.sin(e.angle) * e.speed * dt;
                break;

            case 'swift':
                // Fast, erratic movement
                if (Math.sin(e.age * 5) > 0.7) {
                    // Dash toward player
                    e.x += Math.cos(angleToPlayer) * e.speed * 1.5 * dt;
                    e.y += Math.sin(angleToPlayer) * e.speed * 1.5 * dt;
                } else {
                    // Strafe
                    const strafeAngle = angleToPlayer + Math.PI / 2 * Math.sign(Math.sin(e.age * 3));
                    e.x += Math.cos(strafeAngle) * e.speed * 0.7 * dt;
                    e.y += Math.sin(strafeAngle) * e.speed * 0.7 * dt;
                }
                e.angle = angleToPlayer;
                break;

            case 'orbiter':
                // Orbits player at a distance, closing in
                e.orbitAngle += dt * 1.5;
                e.orbitRadius = Math.max(80, e.orbitRadius - 15 * dt);
                const targetX = p.x + Math.cos(e.orbitAngle) * e.orbitRadius;
                const targetY = p.y + Math.sin(e.orbitAngle) * e.orbitRadius;
                e.x = lerp(e.x, targetX, 3 * dt);
                e.y = lerp(e.y, targetY, 3 * dt);
                e.angle = angleBetween(e.x, e.y, p.x, p.y);
                break;
        }
    }

    killEnemy(e, idx) {
        // Score
        this.score += e.score * this.multiplier;
        this.kills++;
        this.multiplier = Math.min(this.multiplier + 1, 20);
        this.multiplierTimer = 3;
        if (this.multiplier > this.maxMultiplier) this.maxMultiplier = this.multiplier;

        // Death particles
        const particleCount = e.type === 'tank' ? 25 : 12;
        for (let i = 0; i < particleCount; i++) {
            this.spawnParticle(e.x, e.y, rand(0, TWO_PI), rand(40, 180), e.color, rand(0.3, 0.8), rand(1.5, 4));
        }

        // Small screen shake
        this.shake.intensity = Math.max(this.shake.intensity, e.type === 'tank' ? 6 : 3);

        // Drop power-up chance (10% base, higher for tanks)
        const dropChance = e.type === 'tank' ? 0.35 : 0.08;
        if (Math.random() < dropChance) {
            this.spawnPowerUp(e.x, e.y);
        }

        this.playSound('enemyDeath');

        // Remove
        if (idx >= 0 && idx < this.enemies.length && this.enemies[idx] === e) {
            this.enemies.splice(idx, 1);
        }
    }

    // --------------------------------------------------------
    // Power-ups
    // --------------------------------------------------------
    spawnPowerUp(x, y) {
        const types = ['spread', 'rapid', 'beam', 'heal', 'bomb'];
        const type = types[randInt(0, types.length - 1)];

        const colors = {
            spread: COLORS.yellow,
            rapid: COLORS.green,
            beam: COLORS.purple,
            heal: COLORS.pink,
            bomb: COLORS.orange,
        };

        this.powerUps.push({
            x, y,
            type,
            radius: 12,
            color: colors[type],
            age: 0,
            bobOffset: 0,
        });
    }

    collectPowerUp(pu) {
        this.playSound('powerup');

        // Collect particles
        for (let i = 0; i < 12; i++) {
            this.spawnParticle(pu.x, pu.y, rand(0, TWO_PI), rand(30, 100), pu.color, rand(0.3, 0.7), rand(1, 3));
        }

        switch (pu.type) {
            case 'spread':
                this.player.weapon = 'spread';
                this.player.weaponTimer = 8;
                break;
            case 'rapid':
                this.player.weapon = 'rapid';
                this.player.weaponTimer = 8;
                break;
            case 'beam':
                this.player.weapon = 'beam';
                this.player.weaponTimer = 6;
                break;
            case 'heal':
                this.player.lives = Math.min(this.player.lives + 1, 5);
                this.flash.alpha = 0.3;
                this.flash.color = COLORS.green;
                break;
            case 'bomb':
                // Kill all on-screen enemies
                for (let i = this.enemies.length - 1; i >= 0; i--) {
                    const e = this.enemies[i];
                    this.score += e.score * this.multiplier;
                    this.kills++;
                    for (let k = 0; k < 8; k++) {
                        this.spawnParticle(e.x, e.y, rand(0, TWO_PI), rand(40, 150), e.color, rand(0.3, 0.6), rand(1, 3));
                    }
                }
                this.enemies = [];
                this.shake.intensity = 15;
                this.flash.alpha = 0.7;
                this.flash.color = COLORS.orange;
                this.playSound('bomb');
                break;
        }
    }

    // --------------------------------------------------------
    // Particles
    // --------------------------------------------------------
    spawnParticle(x, y, angle, speed, color, life, size) {
        this.particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color,
            life,
            maxLife: life,
            size,
        });
    }

    updateParticles() {
        const dt = Math.min((performance.now() - (this._lastParticleTime || performance.now())) / 1000, 0.1);
        this._lastParticleTime = performance.now();

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.97;
            p.vy *= 0.97;
            p.life -= dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    updateShake() {
        if (this.shake.intensity > 0.1) {
            this.shake.x = (Math.random() - 0.5) * this.shake.intensity * 2;
            this.shake.y = (Math.random() - 0.5) * this.shake.intensity * 2;
            this.shake.intensity *= 0.9;
        } else {
            this.shake.x = 0;
            this.shake.y = 0;
            this.shake.intensity = 0;
        }

        if (this.flash.alpha > 0.01) {
            this.flash.alpha *= 0.92;
        } else {
            this.flash.alpha = 0;
        }
    }

    // --------------------------------------------------------
    // HUD update
    // --------------------------------------------------------
    updateHUD() {
        document.getElementById('score-value').textContent = this.score.toLocaleString();
        document.getElementById('multiplier-value').textContent = 'x' + this.multiplier;
        document.getElementById('wave-value').textContent = 'WAVE ' + this.wave;

        // Lives as diamonds
        let livesStr = '';
        for (let i = 0; i < this.player.lives; i++) livesStr += '\u25C6 ';
        document.getElementById('lives-value').textContent = livesStr.trim();

        // Weapon name
        const weaponNames = { pulse: 'PULSE', spread: 'SPREAD', rapid: 'RAPID', beam: 'BEAM' };
        const wn = weaponNames[this.player.weapon] || 'PULSE';
        const weaponEl = document.getElementById('weapon-value');
        weaponEl.textContent = this.player.weaponTimer > 0 ? wn + ' ' + Math.ceil(this.player.weaponTimer) + 's' : wn;
    }

    // --------------------------------------------------------
    // Rendering
    // --------------------------------------------------------
    render() {
        const ctx = this.ctx;
        const w = this.w;
        const h = this.h;

        ctx.save();
        ctx.translate(this.shake.x, this.shake.y);

        // Background
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(-10, -10, w + 20, h + 20);

        // Stars
        this.renderStars(ctx);

        // Arena border
        this.renderArena(ctx);

        if (this.state === 'playing' || this.state === 'gameover') {
            this.renderGame(ctx);
        }

        ctx.restore();

        // Flash overlay (outside shake)
        if (this.flash.alpha > 0) {
            ctx.fillStyle = this.flash.color;
            ctx.globalAlpha = this.flash.alpha * 0.3;
            ctx.fillRect(0, 0, w, h);
            ctx.globalAlpha = 1;
        }

        // Subtle vignette
        const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, w, h);
    }

    renderStars(ctx) {
        const time = this.elapsed || 0;
        for (const s of this.stars) {
            const twinkle = 0.5 + 0.5 * Math.sin(time * s.twinkleSpeed + s.x);
            const alpha = s.brightness * twinkle;
            ctx.fillStyle = `rgba(150, 180, 220, ${alpha})`;
            ctx.fillRect(s.x, s.y, s.size, s.size);
        }
    }

    renderArena(ctx) {
        const a = this.arena;
        if (!a) return;

        // Grid
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        const gridSize = 60;

        for (let x = a.x; x <= a.x + a.w; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, a.y);
            ctx.lineTo(x, a.y + a.h);
            ctx.stroke();
        }
        for (let y = a.y; y <= a.y + a.h; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(a.x, y);
            ctx.lineTo(a.x + a.w, y);
            ctx.stroke();
        }

        // Border glow
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(a.x, a.y, a.w, a.h);

        ctx.strokeStyle = 'rgba(0, 255, 255, 0.05)';
        ctx.lineWidth = 3;
        ctx.strokeRect(a.x - 2, a.y - 2, a.w + 4, a.h + 4);
    }

    renderGame(ctx) {
        // Particles (behind everything)
        this.renderParticles(ctx);

        // Power-ups
        for (const pu of this.powerUps) {
            this.renderPowerUp(ctx, pu);
        }

        // Bullets
        for (const b of this.bullets) {
            this.renderBullet(ctx, b);
        }

        // Enemies
        for (const e of this.enemies) {
            this.renderEnemy(ctx, e);
        }

        // Player (if alive)
        if (this.state === 'playing') {
            this.renderPlayer(ctx);
        }

        // Touch joystick indicator
        if (this.input.moveActive) {
            this.renderJoystick(ctx);
        }
    }

    renderPlayer(ctx) {
        const p = this.player;

        // Skip render every other frame during invincibility (blink)
        if (p.invincible > 0 && Math.sin(p.invincible * 20) > 0) return;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);

        // Glow
        ctx.shadowBlur = 20;
        ctx.shadowColor = COLORS.cyan;

        // Ship body (triangle)
        ctx.fillStyle = COLORS.cyan;
        ctx.beginPath();
        ctx.moveTo(p.radius + 4, 0);
        ctx.lineTo(-p.radius, -p.radius * 0.7);
        ctx.lineTo(-p.radius * 0.5, 0);
        ctx.lineTo(-p.radius, p.radius * 0.7);
        ctx.closePath();
        ctx.fill();

        // Inner highlight
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(p.radius * 0.5, 0);
        ctx.lineTo(-p.radius * 0.3, -p.radius * 0.3);
        ctx.lineTo(-p.radius * 0.1, 0);
        ctx.lineTo(-p.radius * 0.3, p.radius * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.shadowBlur = 0;
        ctx.restore();

        // Shield ring when invincible
        if (p.invincible > 0) {
            ctx.strokeStyle = `rgba(0, 255, 255, ${0.3 + 0.2 * Math.sin(this.elapsed * 15)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius + 8, 0, TWO_PI);
            ctx.stroke();
        }
    }

    renderBullet(ctx, b) {
        const alpha = clamp(b.life / 0.3, 0, 1);
        ctx.save();
        ctx.globalAlpha = alpha;

        // Glow
        ctx.shadowBlur = 8;
        ctx.shadowColor = b.color;

        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, TWO_PI);
        ctx.fill();

        // Trail
        const tx = b.x - Math.cos(b.angle) * b.radius * 4;
        const ty = b.y - Math.sin(b.angle) * b.radius * 4;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.radius * 0.8;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    renderEnemy(ctx, e) {
        ctx.save();
        ctx.translate(e.x, e.y);

        // Glow
        ctx.shadowBlur = 12;
        ctx.shadowColor = e.color;

        ctx.fillStyle = e.color;

        switch (e.type) {
            case 'drone':
                // Diamond
                ctx.rotate(e.angle);
                ctx.beginPath();
                ctx.moveTo(e.radius, 0);
                ctx.lineTo(0, -e.radius * 0.6);
                ctx.lineTo(-e.radius, 0);
                ctx.lineTo(0, e.radius * 0.6);
                ctx.closePath();
                ctx.fill();
                break;

            case 'chaser':
                // Pointed arrow
                ctx.rotate(e.angle);
                ctx.beginPath();
                ctx.moveTo(e.radius, 0);
                ctx.lineTo(-e.radius * 0.6, -e.radius * 0.8);
                ctx.lineTo(-e.radius * 0.3, 0);
                ctx.lineTo(-e.radius * 0.6, e.radius * 0.8);
                ctx.closePath();
                ctx.fill();
                break;

            case 'tank':
                // Hexagon
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * TWO_PI - Math.PI / 6;
                    const px = Math.cos(a) * e.radius;
                    const py = Math.sin(a) * e.radius;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();

                // HP indicator
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                ctx.fillRect(-e.radius * 0.7, -e.radius - 8, e.radius * 1.4, 4);
                ctx.fillStyle = e.color;
                ctx.fillRect(-e.radius * 0.7, -e.radius - 8, e.radius * 1.4 * (e.hp / e.maxHp), 4);
                break;

            case 'swift':
                // Small triangle
                ctx.rotate(e.angle + this.elapsed * 8);
                ctx.beginPath();
                ctx.moveTo(e.radius, 0);
                ctx.lineTo(-e.radius * 0.5, -e.radius * 0.8);
                ctx.lineTo(-e.radius * 0.5, e.radius * 0.8);
                ctx.closePath();
                ctx.fill();
                break;

            case 'orbiter':
                // Circle with ring
                ctx.beginPath();
                ctx.arc(0, 0, e.radius * 0.6, 0, TWO_PI);
                ctx.fill();

                ctx.strokeStyle = e.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, e.radius, 0, TWO_PI);
                ctx.stroke();

                // Rotating dots on ring
                for (let i = 0; i < 3; i++) {
                    const a = this.elapsed * 3 + (i / 3) * TWO_PI;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * e.radius, Math.sin(a) * e.radius, 3, 0, TWO_PI);
                    ctx.fill();
                }
                break;
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    renderPowerUp(ctx, pu) {
        ctx.save();
        ctx.translate(pu.x, pu.y + pu.bobOffset);

        // Pulse glow
        const pulse = 0.5 + 0.5 * Math.sin(pu.age * 4);
        ctx.shadowBlur = 15 + pulse * 10;
        ctx.shadowColor = pu.color;

        // Outer ring
        ctx.strokeStyle = pu.color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5 + pulse * 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, pu.radius + 4 + pulse * 3, 0, TWO_PI);
        ctx.stroke();

        // Inner shape based on type
        ctx.globalAlpha = 1;
        ctx.fillStyle = pu.color;

        switch (pu.type) {
            case 'spread':
                // Three lines fanning out
                ctx.lineWidth = 2.5;
                for (let i = -1; i <= 1; i++) {
                    const a = -Math.PI / 6 * i;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * pu.radius, Math.sin(a) * pu.radius);
                    ctx.stroke();
                }
                break;
            case 'rapid':
                // Two vertical bars
                ctx.fillRect(-5, -pu.radius * 0.6, 3, pu.radius * 1.2);
                ctx.fillRect(2, -pu.radius * 0.6, 3, pu.radius * 1.2);
                break;
            case 'beam':
                // Lightning bolt shape
                ctx.beginPath();
                ctx.moveTo(2, -pu.radius * 0.7);
                ctx.lineTo(-3, -1);
                ctx.lineTo(3, 1);
                ctx.lineTo(-2, pu.radius * 0.7);
                ctx.lineWidth = 2.5;
                ctx.stroke();
                break;
            case 'heal':
                // Plus sign
                ctx.fillRect(-2, -pu.radius * 0.5, 4, pu.radius);
                ctx.fillRect(-pu.radius * 0.5, -2, pu.radius, 4);
                break;
            case 'bomb':
                // Circle with lines
                ctx.beginPath();
                ctx.arc(0, 0, pu.radius * 0.5, 0, TWO_PI);
                ctx.fill();
                ctx.lineWidth = 2;
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * TWO_PI;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * pu.radius * 0.6, Math.sin(a) * pu.radius * 0.6);
                    ctx.lineTo(Math.cos(a) * pu.radius, Math.sin(a) * pu.radius);
                    ctx.stroke();
                }
                break;
        }

        // Expiry warning - blink when about to expire
        if (pu.age > 7) {
            ctx.globalAlpha = Math.sin(pu.age * 10) > 0 ? 1 : 0.2;
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    renderParticles(ctx) {
        for (const p of this.particles) {
            const alpha = clamp(p.life / p.maxLife, 0, 1);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            const s = p.size * alpha;
            ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
    }

    renderJoystick(ctx) {
        const ox = this.input.moveOriginX;
        const oy = this.input.moveOriginY;
        const maxDist = 80;

        // Outer ring
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ox, oy, maxDist, 0, TWO_PI);
        ctx.stroke();

        // Knob position (clamped)
        const d = dist(0, 0, this.input.moveDx, this.input.moveDy);
        const clamped = Math.min(d, maxDist);
        const angle = Math.atan2(this.input.moveDy, this.input.moveDx);
        const kx = ox + Math.cos(angle) * clamped;
        const ky = oy + Math.sin(angle) * clamped;

        // Knob
        ctx.fillStyle = 'rgba(0, 255, 255, 0.25)';
        ctx.beginPath();
        ctx.arc(kx, ky, 20, 0, TWO_PI);
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(kx, ky, 20, 0, TWO_PI);
        ctx.stroke();
    }

    // --------------------------------------------------------
    // Audio (Web Audio API synthesis)
    // --------------------------------------------------------
    playSound(type) {
        if (!this.audio.enabled || !this.audio.ctx) return;
        const ctx = this.audio.ctx;
        const now = ctx.currentTime;

        switch (type) {
            case 'shoot': {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.exponentialRampToValueAtTime(440, now + 0.05);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
                osc.connect(gain);
                gain.connect(this.audio.master);
                osc.start(now);
                osc.stop(now + 0.06);
                break;
            }
            case 'hit': {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                osc.connect(gain);
                gain.connect(this.audio.master);
                osc.start(now);
                osc.stop(now + 0.08);
                break;
            }
            case 'enemyDeath': {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                osc.connect(gain);
                gain.connect(this.audio.master);
                osc.start(now);
                osc.stop(now + 0.15);
                break;
            }
            case 'playerHit': {
                for (let i = 0; i < 3; i++) {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(150 - i * 30, now + i * 0.04);
                    osc.frequency.exponentialRampToValueAtTime(30, now + 0.2 + i * 0.04);
                    gain.gain.setValueAtTime(0.15, now + i * 0.04);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2 + i * 0.04);
                    osc.connect(gain);
                    gain.connect(this.audio.master);
                    osc.start(now + i * 0.04);
                    osc.stop(now + 0.25 + i * 0.04);
                }
                break;
            }
            case 'powerup': {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(500, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
                osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc.connect(gain);
                gain.connect(this.audio.master);
                osc.start(now);
                osc.stop(now + 0.25);
                break;
            }
            case 'bomb': {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const filter = ctx.createBiquadFilter();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(80, now);
                osc.frequency.exponentialRampToValueAtTime(20, now + 0.5);
                filter.type = 'lowpass';
                filter.frequency.value = 500;
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.audio.master);
                osc.start(now);
                osc.stop(now + 0.5);
                break;
            }
            case 'wave': {
                // Ascending tone
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(600, now + 0.3);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.setValueAtTime(0.1, now + 0.2);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                osc.connect(gain);
                gain.connect(this.audio.master);
                osc.start(now);
                osc.stop(now + 0.4);
                break;
            }
        }
    }
}

// ============================================================
// Boot
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
    new NeonVoid();
});
