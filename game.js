// NEON DRIFTER - Core Game Engine
// Movement is survival.

class NeonDrifter {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Game State
        this.state = 'menu'; // menu, playing, gameover
        this.lastTime = 0;
        this.deltaTime = 0;

        // Audio System
        this.audio = {
            context: null,
            masterGain: null,
            enabled: true
        };
        this.initAudio();

        // Player
        this.player = {
            lane: 2, // 0-4 (5 lanes)
            targetLane: 2,
            x: 0,
            y: 0,
            width: 40,
            height: 80,
            speed: 0,
            maxSpeed: 400,
            baseSpeed: 200,
            boostSpeed: 500,
            acceleration: 100,
            deceleration: 150,
            laneChangeSpeed: 8
        };

        // Boost System
        this.boost = {
            active: false,
            energy: 100,
            maxEnergy: 100,
            drainRate: 40,
            rechargeRate: 20
        };

        // Wanted Level
        this.wanted = {
            level: 0,
            maxLevel: 100,
            decayRate: 5
        };

        // World
        this.lanes = 5;
        this.laneWidth = 0;
        this.obstacles = [];
        this.particles = [];
        this.rainDrops = [];
        this.powerUps = [];
        this.roadOffset = 0;
        this.distance = 0;

        // Power-up system
        this.activePowerUps = {
            shield: { active: false, timer: 0, duration: 8 },
            slowmo: { active: false, timer: 0, duration: 5 },
            invincible: { active: false, timer: 0, duration: 6 }
        };
        this.powerUpSpawnTimer = 0;
        this.powerUpSpawnInterval = 15;

        // Initialize rain
        this.initRain();

        // Stats
        this.stats = {
            maxSpeed: 0,
            crashes: 0,
            distance: 0
        };

        // High scores
        this.loadHighScores();

        // Visual Effects
        this.shake = { x: 0, y: 0, intensity: 0 };
        this.flash = 0;
        this.lightning = {
            active: false,
            timer: 0,
            interval: Math.random() * 5 + 3,
            duration: 0.1,
            opacity: 0
        };
        this.weather = {
            intensity: 0.5,
            targetIntensity: 0.5,
            changeTimer: 0
        };

        // Input
        this.input = {
            left: false,
            right: false,
            boost: false,
            touchStartX: 0,
            touchStartY: 0,
            isTouching: false
        };

        this.setupInput();
        this.setupUI();

        // Spawn initial obstacles
        this.spawnTimer = 0;
        this.spawnInterval = 1.5;

        // Start game loop
        this.gameLoop = this.gameLoop.bind(this);
        requestAnimationFrame(this.gameLoop);
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.laneWidth = this.canvas.width / this.lanes;

        // Update player position
        this.player.x = this.laneWidth * this.player.lane + this.laneWidth / 2;
        this.player.y = this.canvas.height * 0.75;
    }

    initRain() {
        // Create initial rain drops
        for (let i = 0; i < 100; i++) {
            this.rainDrops.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                length: Math.random() * 15 + 10,
                speed: Math.random() * 300 + 200,
                opacity: Math.random() * 0.3 + 0.2
            });
        }
    }

    initAudio() {
        try {
            this.audio.context = new (window.AudioContext || window.webkitAudioContext)();
            this.audio.masterGain = this.audio.context.createGain();
            this.audio.masterGain.gain.value = 0.3;
            this.audio.masterGain.connect(this.audio.context.destination);
        } catch (e) {
            console.warn('Web Audio API not supported', e);
            this.audio.enabled = false;
        }
    }

    playSound(type) {
        if (!this.audio.enabled || !this.audio.context) return;

        const ctx = this.audio.context;
        const now = ctx.currentTime;

        switch(type) {
            case 'boost':
                this.playBoostSound(ctx, now);
                break;
            case 'crash':
                this.playCrashSound(ctx, now);
                break;
            case 'powerup':
                this.playPowerupSound(ctx, now);
                break;
            case 'lane':
                this.playLaneChangeSound(ctx, now);
                break;
        }
    }

    playBoostSound(ctx, now) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc.connect(gain);
        gain.connect(this.audio.masterGain);

        osc.start(now);
        osc.stop(now + 0.3);
    }

    playCrashSound(ctx, now) {
        // Create multiple noise bursts for impact
        for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100 - i * 20, now + i * 0.05);
            osc.frequency.exponentialRampToValueAtTime(20, now + 0.2 + i * 0.05);

            filter.type = 'lowpass';
            filter.frequency.value = 800;

            gain.gain.setValueAtTime(0.3, now + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3 + i * 0.05);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.audio.masterGain);

            osc.start(now + i * 0.05);
            osc.stop(now + 0.3 + i * 0.05);
        }
    }

    playPowerupSound(ctx, now) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.2);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc.connect(gain);
        gain.connect(this.audio.masterGain);

        osc.start(now);
        osc.stop(now + 0.3);
    }

    playLaneChangeSound(ctx, now) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.value = 300;

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc.connect(gain);
        gain.connect(this.audio.masterGain);

        osc.start(now);
        osc.stop(now + 0.1);
    }

    setupInput() {
        // Keyboard
        window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') this.input.left = true;
            if (e.key === 'ArrowRight') this.input.right = true;
            if (e.key === ' ' || e.key === 'Shift') {
                this.input.boost = true;
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowLeft') this.input.left = false;
            if (e.key === 'ArrowRight') this.input.right = false;
            if (e.key === ' ' || e.key === 'Shift') this.input.boost = false;
        });

        // Touch - improved responsiveness
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.input.touchStartX = touch.clientX;
            this.input.touchStartY = touch.clientY;
            this.input.isTouching = true;
            this.input.boost = true; // Hold to boost

            // Immediately determine lane from touch position
            if (this.state === 'playing') {
                const targetLane = Math.floor(touch.clientX / this.laneWidth);
                if (targetLane >= 0 && targetLane < this.lanes) {
                    this.player.targetLane = targetLane;
                }
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!this.input.isTouching || this.state !== 'playing') return;

            const touch = e.touches[0];

            // Continuous lane tracking based on touch position
            const targetLane = Math.floor(touch.clientX / this.laneWidth);
            if (targetLane >= 0 && targetLane < this.lanes) {
                this.player.targetLane = targetLane;
            }

            // Alternative: swipe-based lane switching (commented out in favor of direct control)
            /*
            const deltaX = touch.clientX - this.input.touchStartX;
            if (Math.abs(deltaX) > this.laneWidth * 0.3) {
                if (deltaX > 0 && this.player.targetLane < this.lanes - 1) {
                    this.player.targetLane++;
                    this.input.touchStartX = touch.clientX;
                } else if (deltaX < 0 && this.player.targetLane > 0) {
                    this.player.targetLane--;
                    this.input.touchStartX = touch.clientX;
                }
            }
            */
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.input.isTouching = false;
            this.input.boost = false;
        });

        // Mouse (for desktop testing)
        this.canvas.addEventListener('mousedown', (e) => {
            this.input.boost = true;
        });

        this.canvas.addEventListener('mouseup', (e) => {
            this.input.boost = false;
        });

        this.canvas.addEventListener('mousemove', (e) => {
            // Determine lane from mouse position
            const targetLane = Math.floor(e.clientX / this.laneWidth);
            if (targetLane >= 0 && targetLane < this.lanes) {
                this.player.targetLane = targetLane;
            }
        });
    }

    setupUI() {
        document.getElementById('start-btn').addEventListener('click', () => {
            this.startGame();
        });

        document.getElementById('retry-btn').addEventListener('click', () => {
            this.startGame();
        });
    }

    startGame() {
        this.state = 'playing';

        // Reset everything
        this.player.lane = 2;
        this.player.targetLane = 2;
        this.player.speed = this.player.baseSpeed;
        this.boost.energy = this.boost.maxEnergy;
        this.wanted.level = 0;
        this.obstacles = [];
        this.particles = [];
        this.powerUps = [];
        this.roadOffset = 0;
        this.distance = 0;
        this.stats = { maxSpeed: 0, crashes: 0, distance: 0 };
        this.spawnTimer = 0;
        this.powerUpSpawnTimer = 0;

        // Reset power-ups
        for (let key in this.activePowerUps) {
            this.activePowerUps[key].active = false;
            this.activePowerUps[key].timer = 0;
        }

        // Hide menus, show HUD
        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('gameover-screen').classList.remove('active');
        document.getElementById('hud').classList.add('active');
    }

    gameLoop(currentTime) {
        this.deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Cap delta time to prevent huge jumps
        if (this.deltaTime > 0.1) this.deltaTime = 0.1;

        if (this.state === 'playing') {
            this.update();
        }

        this.render();

        requestAnimationFrame(this.gameLoop);
    }

    update() {
        const dt = this.deltaTime;

        // Input processing
        if (this.input.left && this.player.targetLane > 0) {
            this.player.targetLane--;
            this.input.left = false; // Single press
        }
        if (this.input.right && this.player.targetLane < this.lanes - 1) {
            this.player.targetLane++;
            this.input.right = false; // Single press
        }

        // Lane interpolation
        if (this.player.lane !== this.player.targetLane) {
            const diff = this.player.targetLane - this.player.lane;
            const wasChanging = Math.abs(diff) > 0.1;
            this.player.lane += Math.sign(diff) * Math.min(Math.abs(diff), this.player.laneChangeSpeed * dt);

            // Snap to lane when close enough
            if (Math.abs(diff) < 0.1) {
                if (wasChanging) {
                    this.playSound('lane');
                }
                this.player.lane = this.player.targetLane;
            }
        }

        this.player.x = this.laneWidth * this.player.lane + this.laneWidth / 2;

        // Boost system
        if (this.input.boost && this.boost.energy > 0) {
            const wasActive = this.boost.active;
            this.boost.active = true;
            this.boost.energy -= this.boost.drainRate * dt;
            if (this.boost.energy < 0) this.boost.energy = 0;

            // Screen shake during boost
            this.shake.intensity = 3;

            // Play boost sound when first activated
            if (!wasActive) {
                this.playSound('boost');
            }
        } else {
            this.boost.active = false;
            this.boost.energy += this.boost.rechargeRate * dt;
            if (this.boost.energy > this.boost.maxEnergy) {
                this.boost.energy = this.boost.maxEnergy;
            }
        }

        // Speed control
        const targetSpeed = this.boost.active ? this.player.boostSpeed : this.player.baseSpeed;

        if (this.player.speed < targetSpeed) {
            this.player.speed += this.player.acceleration * dt;
            if (this.player.speed > targetSpeed) this.player.speed = targetSpeed;
        } else if (this.player.speed > targetSpeed) {
            this.player.speed -= this.player.deceleration * dt;
            if (this.player.speed < targetSpeed) this.player.speed = targetSpeed;
        }

        // Track max speed
        if (this.player.speed > this.stats.maxSpeed) {
            this.stats.maxSpeed = this.player.speed;
        }

        // Update distance
        this.distance += this.player.speed * dt;
        this.stats.distance = Math.floor(this.distance);

        // Road scrolling
        this.roadOffset += this.player.speed * dt;

        // Spawn obstacles
        this.spawnTimer += dt;
        if (this.spawnTimer > this.spawnInterval) {
            this.spawnObstacle();
            this.spawnTimer = 0;

            // Gradually increase difficulty
            this.spawnInterval = Math.max(0.6, 1.5 - this.distance / 5000);
        }

        // Spawn power-ups
        this.powerUpSpawnTimer += dt;
        if (this.powerUpSpawnTimer > this.powerUpSpawnInterval) {
            this.spawnPowerUp();
            this.powerUpSpawnTimer = 0;
            this.powerUpSpawnInterval = Math.random() * 10 + 10;
        }

        // Update obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            // Some obstacles have their own speed (relative to player)
            obs.y += (this.player.speed - obs.speed) * dt;

            // Remove if off screen
            if (obs.y > this.canvas.height + 100) {
                this.obstacles.splice(i, 1);
                continue;
            }

            // Collision detection (check for shields/invincibility)
            if (this.checkCollision(this.player, obs)) {
                if (this.activePowerUps.shield.active || this.activePowerUps.invincible.active) {
                    // Destroy obstacle instead of crashing
                    this.obstacles.splice(i, 1);
                    this.spawnParticle(obs.x, obs.y, '#ffff00', 2);
                } else {
                    this.crash(obs);
                    this.obstacles.splice(i, 1);
                }
            }
        }

        // Update power-ups
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const pu = this.powerUps[i];
            pu.y += this.player.speed * dt;
            pu.rotation += dt * 3;

            // Remove if off screen
            if (pu.y > this.canvas.height + 100) {
                this.powerUps.splice(i, 1);
                continue;
            }

            // Collection detection
            if (this.checkCollision(this.player, pu)) {
                this.collectPowerUp(pu);
                this.powerUps.splice(i, 1);
            }
        }

        // Update active power-ups timers
        for (let key in this.activePowerUps) {
            const powerUp = this.activePowerUps[key];
            if (powerUp.active) {
                powerUp.timer -= dt;
                if (powerUp.timer <= 0) {
                    powerUp.active = false;
                    powerUp.timer = 0;
                }
            }
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.y += p.vy * dt;
            p.x += p.vx * dt;
            p.life -= dt;
            p.alpha = p.life / p.maxLife;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Update rain
        for (const drop of this.rainDrops) {
            drop.y += (drop.speed + this.player.speed) * dt;

            // Wrap around
            if (drop.y > this.canvas.height) {
                drop.y = -drop.length;
                drop.x = Math.random() * this.canvas.width;
            }
        }

        // Spawn trail particles
        if (Math.random() < 0.3) {
            this.spawnParticle(
                this.player.x + (Math.random() - 0.5) * this.player.width,
                this.player.y + this.player.height / 2,
                '#00ffff'
            );
        }

        // Wanted level decay
        this.wanted.level -= this.wanted.decayRate * dt;
        if (this.wanted.level < 0) this.wanted.level = 0;

        // Screen shake decay
        this.shake.intensity *= 0.9;
        if (this.shake.intensity < 0.1) this.shake.intensity = 0;
        this.shake.x = (Math.random() - 0.5) * this.shake.intensity;
        this.shake.y = (Math.random() - 0.5) * this.shake.intensity;

        // Flash decay
        this.flash *= 0.9;

        // Lightning effects
        this.lightning.timer += dt;
        if (this.lightning.timer > this.lightning.interval) {
            this.lightning.active = true;
            this.lightning.opacity = 1;
            this.lightning.timer = 0;
            this.lightning.interval = Math.random() * 8 + 4;
        }

        if (this.lightning.active) {
            this.lightning.opacity -= dt / this.lightning.duration;
            if (this.lightning.opacity <= 0) {
                this.lightning.active = false;
                this.lightning.opacity = 0;
            }
        }

        // Dynamic weather intensity
        this.weather.changeTimer += dt;
        if (this.weather.changeTimer > 10) {
            this.weather.targetIntensity = Math.random() * 0.6 + 0.4;
            this.weather.changeTimer = 0;
        }

        // Smoothly transition weather
        const weatherDiff = this.weather.targetIntensity - this.weather.intensity;
        this.weather.intensity += weatherDiff * dt * 0.2;

        // Update UI
        this.updateHUD();
    }

    spawnObstacle() {
        const lane = Math.floor(Math.random() * this.lanes);
        const types = ['car', 'van', 'police', 'truck', 'sports'];
        let type = types[Math.floor(Math.random() * types.length)];

        // Increase police spawn with wanted level
        if (this.wanted.level > 50 && Math.random() < 0.3) {
            type = 'police';
        }

        const sizes = {
            car: { width: 0.6, height: 80 },
            van: { width: 0.65, height: 90 },
            police: { width: 0.6, height: 80 },
            truck: { width: 0.7, height: 100 },
            sports: { width: 0.55, height: 70 }
        };

        const colors = {
            car: '#666',
            van: '#444',
            police: '#ff0066',
            truck: '#333',
            sports: '#9900ff'
        };

        const size = sizes[type];
        const obstacle = {
            lane: lane,
            x: this.laneWidth * lane + this.laneWidth / 2,
            y: -100,
            width: this.laneWidth * size.width,
            height: size.height,
            type: type,
            color: colors[type],
            speed: type === 'sports' ? 100 : 0 // Sports cars move
        };

        this.obstacles.push(obstacle);
    }

    spawnPowerUp() {
        const lane = Math.floor(Math.random() * this.lanes);
        const types = ['shield', 'slowmo', 'invincible'];
        const type = types[Math.floor(Math.random() * types.length)];

        const powerUp = {
            lane: lane,
            x: this.laneWidth * lane + this.laneWidth / 2,
            y: -100,
            width: 40,
            height: 40,
            type: type,
            rotation: 0,
            color: type === 'shield' ? '#00ff00' : (type === 'slowmo' ? '#ffff00' : '#ff00ff')
        };

        this.powerUps.push(powerUp);
    }

    collectPowerUp(powerUp) {
        this.playSound('powerup');

        // Activate the power-up
        const pu = this.activePowerUps[powerUp.type];
        if (pu) {
            pu.active = true;
            pu.timer = pu.duration;
        }

        // Visual feedback
        for (let i = 0; i < 15; i++) {
            this.spawnParticle(
                powerUp.x + (Math.random() - 0.5) * 40,
                powerUp.y + (Math.random() - 0.5) * 40,
                powerUp.color,
                2
            );
        }
    }

    checkCollision(a, b) {
        return Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
               Math.abs(a.y - b.y) < (a.height + b.height) / 2;
    }

    crash(obstacle) {
        this.stats.crashes++;
        this.wanted.level += 15;
        if (this.wanted.level > this.wanted.maxLevel) {
            this.wanted.level = this.wanted.maxLevel;
        }

        // Play crash sound
        this.playSound('crash');

        // Slow down
        this.player.speed *= 0.5;

        // Screen effects
        this.shake.intensity = 15;
        this.flash = 1;

        // Spawn crash particles
        for (let i = 0; i < 20; i++) {
            this.spawnParticle(
                obstacle.x + (Math.random() - 0.5) * 50,
                obstacle.y + (Math.random() - 0.5) * 50,
                '#ff6600',
                3
            );
        }

        // Check for game over (too many crashes)
        if (this.stats.crashes >= 5) {
            this.gameOver();
        }
    }

    spawnParticle(x, y, color, lifetime = 1) {
        this.particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 100,
            vy: Math.random() * 50 + 50,
            color: color,
            life: lifetime,
            maxLife: lifetime,
            alpha: 1,
            size: Math.random() * 3 + 2
        });
    }

    loadHighScores() {
        try {
            const saved = localStorage.getItem('neonDrifterHighScore');
            this.highScore = saved ? parseInt(saved) : 0;
        } catch (e) {
            this.highScore = 0;
        }
    }

    saveHighScore() {
        try {
            if (this.stats.distance > this.highScore) {
                this.highScore = this.stats.distance;
                localStorage.setItem('neonDrifterHighScore', this.highScore.toString());
                return true; // New high score!
            }
        } catch (e) {
            console.warn('Could not save high score', e);
        }
        return false;
    }

    gameOver() {
        this.state = 'gameover';

        // Check for new high score
        const isNewHighScore = this.saveHighScore();

        // Update stats UI
        document.getElementById('final-distance').textContent = Math.floor(this.stats.distance) + 'm';
        document.getElementById('final-speed').textContent = Math.floor(this.stats.maxSpeed) + ' km/h';
        document.getElementById('final-crashes').textContent = this.stats.crashes;

        // Show high score
        const highScoreEl = document.getElementById('high-score');
        if (highScoreEl) {
            highScoreEl.textContent = `High Score: ${this.highScore}m${isNewHighScore ? ' 🌟 NEW!' : ''}`;
            highScoreEl.style.color = isNewHighScore ? '#ffff00' : '#00ffff';
        }

        // Show game over screen
        document.getElementById('hud').classList.remove('active');
        document.getElementById('gameover-screen').classList.add('active');
    }

    updateHUD() {
        // Speed
        document.getElementById('speed-indicator').textContent =
            Math.floor(this.player.speed) + ' KM/H';

        // Boost bar
        const boostFill = document.querySelector('.boost-fill');
        boostFill.style.width = (this.boost.energy / this.boost.maxEnergy * 100) + '%';

        // Wanted level
        const heatFill = document.querySelector('.heat-fill');
        heatFill.style.width = (this.wanted.level / this.wanted.maxLevel * 100) + '%';

        // Power-up indicators
        const indicatorsEl = document.getElementById('powerup-indicators');
        if (indicatorsEl) {
            let html = '';
            for (let key in this.activePowerUps) {
                const pu = this.activePowerUps[key];
                if (pu.active) {
                    const timeLeft = Math.ceil(pu.timer);
                    const icons = { shield: '🛡️', slowmo: '⏱️', invincible: '✨' };
                    const colors = { shield: '#00ff00', slowmo: '#ffff00', invincible: '#ff00ff' };
                    html += `<div class="powerup-indicator" style="border-color: ${colors[key]}">
                        <span class="powerup-icon">${icons[key]}</span>
                        <span class="powerup-timer">${timeLeft}s</span>
                    </div>`;
                }
            }
            indicatorsEl.innerHTML = html;
        }
    }

    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Apply screen shake
        ctx.save();
        ctx.translate(this.shake.x, this.shake.y);

        // Clear with dark background
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, w, h);

        if (this.state === 'playing') {
            this.renderGame(ctx, w, h);
        }

        ctx.restore();

        // Flash effect (no shake)
        if (this.flash > 0) {
            ctx.fillStyle = `rgba(255, 100, 100, ${this.flash * 0.3})`;
            ctx.fillRect(0, 0, w, h);
        }
    }

    renderGame(ctx, w, h) {
        // Lightning flash
        if (this.lightning.active && this.lightning.opacity > 0) {
            ctx.fillStyle = `rgba(200, 220, 255, ${this.lightning.opacity * 0.3})`;
            ctx.fillRect(0, 0, w, h);

            // Lightning bolts
            ctx.strokeStyle = `rgba(255, 255, 255, ${this.lightning.opacity})`;
            ctx.lineWidth = 3;
            const boltX = Math.random() * w;
            let boltY = 0;
            ctx.beginPath();
            ctx.moveTo(boltX, 0);
            for (let i = 0; i < 10; i++) {
                boltY += h / 10;
                const offsetX = (Math.random() - 0.5) * 40;
                ctx.lineTo(boltX + offsetX, boltY);
            }
            ctx.stroke();
        }

        // Rain (intensity based on weather)
        const rainAlpha = 0.3 * this.weather.intensity;
        ctx.strokeStyle = `rgba(150, 200, 255, ${rainAlpha})`;
        ctx.lineWidth = 1;
        for (const drop of this.rainDrops) {
            ctx.globalAlpha = drop.opacity * this.weather.intensity;
            ctx.beginPath();
            ctx.moveTo(drop.x, drop.y);
            ctx.lineTo(drop.x, drop.y + drop.length);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Road lines
        const lineSpacing = 100;
        const numLines = Math.ceil(h / lineSpacing) + 1;
        const offset = this.roadOffset % lineSpacing;

        ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
        ctx.lineWidth = 2;

        for (let i = 0; i < numLines; i++) {
            const y = i * lineSpacing - offset;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Lane dividers
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
        ctx.setLineDash([20, 20]);

        for (let i = 1; i < this.lanes; i++) {
            const x = i * this.laneWidth;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }

        ctx.setLineDash([]);

        // Particles
        for (const p of this.particles) {
            ctx.fillStyle = p.color + Math.floor(p.alpha * 255).toString(16).padStart(2, '0');
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }

        // Power-ups
        for (const pu of this.powerUps) {
            ctx.save();
            ctx.translate(pu.x, pu.y);
            ctx.rotate(pu.rotation);

            // Glow effect
            ctx.shadowBlur = 20;
            ctx.shadowColor = pu.color;

            // Draw rotating star/diamond
            ctx.fillStyle = pu.color;
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI / 2);
                const radius = i % 2 === 0 ? pu.width / 2 : pu.width / 4;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.restore();

            // Pulse effect
            ctx.strokeStyle = pu.color + '66';
            ctx.lineWidth = 2;
            const pulseSize = Math.sin(Date.now() / 200) * 5 + pu.width / 2 + 5;
            ctx.beginPath();
            ctx.arc(pu.x, pu.y, pulseSize, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Obstacles
        for (const obs of this.obstacles) {
            ctx.fillStyle = obs.color;
            ctx.fillRect(
                obs.x - obs.width / 2,
                obs.y - obs.height / 2,
                obs.width,
                obs.height
            );

            // Glow effect
            ctx.shadowBlur = 10;
            ctx.shadowColor = obs.color;

            // Police lights
            if (obs.type === 'police') {
                const time = Date.now() / 100;
                const lightColor = Math.sin(time) > 0 ? '#ff0000' : '#0000ff';
                ctx.fillStyle = lightColor;
                ctx.fillRect(obs.x - 10, obs.y - obs.height / 2, 5, 5);
                ctx.fillRect(obs.x + 5, obs.y - obs.height / 2, 5, 5);
            }

            ctx.shadowBlur = 0;
        }

        // Shield effect
        if (this.activePowerUps.shield.active) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            const shieldSize = 50 + Math.sin(Date.now() / 100) * 5;
            ctx.beginPath();
            ctx.arc(this.player.x, this.player.y, shieldSize, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = '#00ff0066';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(this.player.x, this.player.y, shieldSize + 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Invincibility effect
        if (this.activePowerUps.invincible.active) {
            const pulse = Math.sin(Date.now() / 50);
            ctx.fillStyle = pulse > 0 ? '#ff00ff44' : '#ff00ff22';
            ctx.fillRect(
                this.player.x - this.player.width,
                this.player.y - this.player.height,
                this.player.width * 2,
                this.player.height * 2
            );
        }

        // Player vehicle
        ctx.fillStyle = this.boost.active ? '#00ffff' : '#0099ff';
        ctx.fillRect(
            this.player.x - this.player.width / 2,
            this.player.y - this.player.height / 2,
            this.player.width,
            this.player.height
        );

        // Player glow
        ctx.shadowBlur = this.boost.active ? 30 : 15;
        ctx.shadowColor = '#00ffff';
        ctx.fillStyle = this.boost.active ? '#00ffff' : '#0099ff';
        ctx.fillRect(
            this.player.x - this.player.width / 2,
            this.player.y - this.player.height / 2,
            this.player.width,
            this.player.height
        );
        ctx.shadowBlur = 0;

        // Boost trail
        if (this.boost.active) {
            const gradient = ctx.createLinearGradient(0, this.player.y, 0, this.player.y + 100);
            gradient.addColorStop(0, 'rgba(0, 255, 255, 0.3)');
            gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(
                this.player.x - this.player.width / 2,
                this.player.y + this.player.height / 2,
                this.player.width,
                100
            );
        }

        // Speed lines for motion blur effect
        if (this.player.speed > 250) {
            const intensity = (this.player.speed - 250) / 250;
            ctx.strokeStyle = `rgba(0, 255, 255, ${intensity * 0.1})`;
            ctx.lineWidth = 2;
            for (let i = 0; i < 20; i++) {
                const x = Math.random() * w;
                const y = Math.random() * h;
                const length = 50 + intensity * 100;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + length);
                ctx.stroke();
            }
        }

        // Vignette effect
        const vignetteGradient = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.8);
        vignetteGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignetteGradient.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
        ctx.fillStyle = vignetteGradient;
        ctx.fillRect(0, 0, w, h);

        // Subtle scanline effect
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        for (let i = 0; i < h; i += 4) {
            ctx.fillRect(0, i, w, 2);
        }
    }
}

// Initialize game when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    new NeonDrifter();
});
