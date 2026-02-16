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
        this.roadOffset = 0;
        this.distance = 0;

        // Initialize rain
        this.initRain();

        // Stats
        this.stats = {
            maxSpeed: 0,
            crashes: 0,
            distance: 0
        };

        // Visual Effects
        this.shake = { x: 0, y: 0, intensity: 0 };
        this.flash = 0;

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

        // Touch
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.input.touchStartX = touch.clientX;
            this.input.touchStartY = touch.clientY;
            this.input.isTouching = true;
            this.input.boost = true; // Hold to boost
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!this.input.isTouching) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - this.input.touchStartX;

            // Lane switching based on swipe
            if (Math.abs(deltaX) > this.laneWidth * 0.3) {
                if (deltaX > 0 && this.player.targetLane < this.lanes - 1) {
                    this.player.targetLane++;
                    this.input.touchStartX = touch.clientX;
                } else if (deltaX < 0 && this.player.targetLane > 0) {
                    this.player.targetLane--;
                    this.input.touchStartX = touch.clientX;
                }
            }
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
        this.roadOffset = 0;
        this.distance = 0;
        this.stats = { maxSpeed: 0, crashes: 0, distance: 0 };
        this.spawnTimer = 0;

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
            this.player.lane += Math.sign(diff) * Math.min(Math.abs(diff), this.player.laneChangeSpeed * dt);

            // Snap to lane when close enough
            if (Math.abs(diff) < 0.1) {
                this.player.lane = this.player.targetLane;
            }
        }

        this.player.x = this.laneWidth * this.player.lane + this.laneWidth / 2;

        // Boost system
        if (this.input.boost && this.boost.energy > 0) {
            this.boost.active = true;
            this.boost.energy -= this.boost.drainRate * dt;
            if (this.boost.energy < 0) this.boost.energy = 0;

            // Screen shake during boost
            this.shake.intensity = 3;
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

        // Update obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.y += this.player.speed * dt;

            // Remove if off screen
            if (obs.y > this.canvas.height + 100) {
                this.obstacles.splice(i, 1);
                continue;
            }

            // Collision detection
            if (this.checkCollision(this.player, obs)) {
                this.crash(obs);
                this.obstacles.splice(i, 1);
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

        // Update UI
        this.updateHUD();
    }

    spawnObstacle() {
        const lane = Math.floor(Math.random() * this.lanes);
        const types = ['car', 'van', 'police'];
        const type = types[Math.floor(Math.random() * types.length)];

        // Increase police spawn with wanted level
        if (this.wanted.level > 50 && Math.random() < 0.3) {
            type = 'police';
        }

        const obstacle = {
            lane: lane,
            x: this.laneWidth * lane + this.laneWidth / 2,
            y: -100,
            width: this.laneWidth * 0.6,
            height: 80,
            type: type,
            color: type === 'police' ? '#ff0066' : (type === 'van' ? '#444' : '#666')
        };

        this.obstacles.push(obstacle);
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

    gameOver() {
        this.state = 'gameover';

        // Update stats UI
        document.getElementById('final-distance').textContent = Math.floor(this.stats.distance) + 'm';
        document.getElementById('final-speed').textContent = Math.floor(this.stats.maxSpeed) + ' km/h';
        document.getElementById('final-crashes').textContent = this.stats.crashes;

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
        // Rain
        ctx.strokeStyle = 'rgba(150, 200, 255, 0.3)';
        ctx.lineWidth = 1;
        for (const drop of this.rainDrops) {
            ctx.globalAlpha = drop.opacity;
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
