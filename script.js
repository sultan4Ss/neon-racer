(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const startOverlay = document.getElementById("startOverlay");
  const crashOverlay = document.getElementById("crashOverlay");
  const startBtn = document.getElementById("startBtn");
  const restartBtn = document.getElementById("restartBtn");
  const speedValue = document.getElementById("speedValue");
  const scoreValue = document.getElementById("scoreValue");
  const coinValue = document.getElementById("coinValue");
  const bestScoreEl = document.getElementById("bestScore");
  const gameStatus = document.getElementById("gameStatus");
  const footerMessage = document.getElementById("footerMessage");
  const soundBtn = document.getElementById("soundBtn");
  const finalScore = document.getElementById("finalScore");
  const finalCoins = document.getElementById("finalCoins");

  const W = canvas.width;
  const H = canvas.height;
  const road = { x: 60, width: 360, lanes: 3 };
  const laneWidth = road.width / road.lanes;
  const keys = { left: false, right: false };
  let running = false;
  let lastTime = 0;
  let animationId = 0;
  let roadOffset = 0;
  let spawnTimer = 0;
  let coinTimer = 0;
  let score = 0;
  let coins = 0;
  let speed = 0;
  let best = Number(localStorage.getItem("neonRacerBest") || 0);
  let traffic = [];
  let pickups = [];
  let particles = [];
  let soundOn = false;
  let audioContext = null;

  const player = { lane: 1, x: laneCenter(1), y: H - 155, width: 52, height: 92, targetX: laneCenter(1), invulnerable: 0 };
  const enemyColors = ["#ff5d8f", "#9274ff", "#f5b94f", "#58a6ff", "#f0f4ff"];

  function laneCenter(lane) { return road.x + laneWidth * lane + laneWidth / 2; }
  function formatScore(value) { return Math.floor(value).toString().padStart(5, "0"); }

  function roundedRect(c, x, y, w, h, r) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
  }

  function drawCar(x, y, w, h, color, isPlayer = false) {
    ctx.save();
    ctx.translate(x, y);
    // Soft neon shadow
    ctx.shadowColor = color;
    ctx.shadowBlur = isPlayer ? 18 : 9;
    roundedRect(ctx, -w / 2, -h / 2, w, h, 12);
    const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    body.addColorStop(0, shade(color, -35));
    body.addColorStop(.48, color);
    body.addColorStop(1, shade(color, -18));
    ctx.fillStyle = body;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Front and rear glass
    roundedRect(ctx, -w * .32, -h * .28, w * .64, h * .25, 6);
    ctx.fillStyle = "#12243a";
    ctx.fill();
    ctx.strokeStyle = "#ffffff35";
    ctx.lineWidth = 1;
    ctx.stroke();

    roundedRect(ctx, -w * .31, h * .07, w * .62, h * .19, 5);
    ctx.fillStyle = "#1a2b43";
    ctx.fill();

    // Centre racing stripe
    ctx.fillStyle = isPlayer ? "#dffffa" : "#ffffff30";
    ctx.globalAlpha = isPlayer ? .8 : .3;
    ctx.fillRect(-2, -h * .43, 4, h * .85);
    ctx.globalAlpha = 1;

    // Wheels
    ctx.fillStyle = "#060a11";
    roundedRect(ctx, -w * .56, -h * .28, w * .14, h * .25, 3); ctx.fill();
    roundedRect(ctx, w * .42, -h * .28, w * .14, h * .25, 3); ctx.fill();
    roundedRect(ctx, -w * .56, h * .17, w * .14, h * .25, 3); ctx.fill();
    roundedRect(ctx, w * .42, h * .17, w * .14, h * .25, 3); ctx.fill();

    // Lights: player faces up, traffic faces down
    ctx.fillStyle = isPlayer ? "#52f2d0" : "#ff5d8f";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    roundedRect(ctx, -w * .31, -h * .43, w * .2, 5, 2); ctx.fill();
    roundedRect(ctx, w * .11, -h * .43, w * .2, 5, 2); ctx.fill();
    ctx.restore();
  }

  function shade(hex, amount) {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (num & 255) + amount));
    return `rgb(${r},${g},${b})`;
  }

  function drawRoad(dt) {
    ctx.fillStyle = "#0a1420";
    ctx.fillRect(0, 0, W, H);

    // Roadside grid and glow
    ctx.fillStyle = "#0e1d2a";
    ctx.fillRect(0, 0, road.x, H);
    ctx.fillRect(road.x + road.width, 0, W - road.x - road.width, H);
    for (let y = -30 + (roadOffset * .45 % 42); y < H; y += 42) {
      ctx.fillStyle = "#1a3542";
      ctx.fillRect(14, y, 28, 2);
      ctx.fillRect(W - 42, y, 28, 2);
    }

    // Asphalt gradient
    const asphalt = ctx.createLinearGradient(road.x, 0, road.x + road.width, 0);
    asphalt.addColorStop(0, "#182433");
    asphalt.addColorStop(.5, "#202b3a");
    asphalt.addColorStop(1, "#182433");
    ctx.fillStyle = asphalt;
    ctx.fillRect(road.x, 0, road.width, H);

    // Edge strips
    ctx.fillStyle = "#52f2d0";
    ctx.fillRect(road.x, 0, 3, H);
    ctx.fillRect(road.x + road.width - 3, 0, 3, H);
    ctx.fillStyle = "#52f2d033";
    ctx.fillRect(road.x + 3, 0, 4, H);
    ctx.fillRect(road.x + road.width - 7, 0, 4, H);

    // Lane markings
    const dashHeight = 42;
    const gap = 30;
    roadOffset = (roadOffset + dt * (running ? (150 + speed * 1.5) : 55)) % (dashHeight + gap);
    ctx.fillStyle = "#b9c9dc55";
    for (let lane = 1; lane < road.lanes; lane++) {
      const x = road.x + laneWidth * lane - 2;
      for (let y = -dashHeight + roadOffset; y < H; y += dashHeight + gap) {
        roundedRect(ctx, x, y, 4, dashHeight, 2);
        ctx.fill();
      }
    }

    // Perspective lights at roadside
    for (let i = 0; i < 7; i++) {
      const y = (i * 125 + roadOffset * 1.8) % (H + 80) - 40;
      ctx.fillStyle = "#52f2d0";
      ctx.globalAlpha = .15 + (i % 3) * .08;
      ctx.fillRect(road.x - 9, y, 3, 17);
      ctx.fillRect(road.x + road.width + 6, y, 3, 17);
    }
    ctx.globalAlpha = 1;
  }

  function drawCoin(coin) {
    ctx.save();
    ctx.translate(coin.x, coin.y);
    ctx.shadowColor = "#f6c75b";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#f6c75b";
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#fff0b3";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#7d5312";
    ctx.font = "bold 12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", 0, 1);
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function update(dt) {
    speed = Math.min(280, 100 + score / 20);
    score += dt * (speed * .19);
    player.targetX = laneCenter(player.lane);
    player.x += (player.targetX - player.x) * Math.min(1, dt * 12);
    player.invulnerable = Math.max(0, player.invulnerable - dt);

    spawnTimer += dt;
    const spawnEvery = Math.max(.48, 1.12 - score / 18000);
    if (spawnTimer >= spawnEvery) {
      spawnTimer = 0;
      spawnTraffic();
    }
    coinTimer += dt;
    if (coinTimer > 1.35) {
      coinTimer = 0;
      if (Math.random() < .8) {
        const lane = Math.floor(Math.random() * 3);
        pickups.push({ x: laneCenter(lane), y: -25, lane, r: 12 });
      }
    }

    const worldSpeed = 220 + speed * 1.25;
    for (const car of traffic) car.y += worldSpeed * car.speedFactor * dt;
    traffic = traffic.filter(car => car.y < H + 130);
    for (const coin of pickups) coin.y += worldSpeed * dt;
    pickups = pickups.filter(coin => coin.y < H + 30);

    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);

    checkCollisions();
    updateHud();
  }

  function spawnTraffic() {
    const available = [0, 1, 2].filter(lane => !traffic.some(car => car.lane === lane && car.y < 155));
    if (!available.length) return;
    const lane = available[Math.floor(Math.random() * available.length)];
    traffic.push({
      lane, x: laneCenter(lane), y: -100,
      width: 48, height: 84,
      color: enemyColors[Math.floor(Math.random() * enemyColors.length)],
      speedFactor: .72 + Math.random() * .38
    });
  }

  function checkCollisions() {
    if (player.invulnerable > 0) return;
    for (const car of traffic) {
      const hitX = Math.abs(player.x - car.x) < (player.width + car.width) * .39;
      const hitY = Math.abs(player.y - car.y) < (player.height + car.height) * .38;
      if (hitX && hitY) {
        endGame();
        return;
      }
    }
    pickups = pickups.filter(coin => {
      if (Math.abs(player.x - coin.x) < 34 && Math.abs(player.y - coin.y) < 48) {
        coins++;
        score += 250;
        burst(coin.x, coin.y, "#f6c75b", 12);
        playTone(760, .07);
        return false;
      }
      return true;
    });
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const force = 45 + Math.random() * 150;
      particles.push({
        x, y, vx: Math.cos(angle) * force, vy: Math.sin(angle) * force,
        size: 1.5 + Math.random() * 3, color, life: .35 + Math.random() * .5, maxLife: .85
      });
    }
  }

  function draw(dt) {
    drawRoad(dt);
    pickups.forEach(drawCoin);
    traffic.forEach(car => drawCar(car.x, car.y, car.width, car.height, car.color));
    if (player.invulnerable <= 0 || Math.floor(performance.now() / 90) % 2 === 0) {
      drawCar(player.x, player.y, player.width, player.height, "#27d9c1", true);
    }
    drawParticles();
  }

  function loop(timestamp) {
    if (!running) return;
    const dt = Math.min((timestamp - (lastTime || timestamp)) / 1000, .04);
    lastTime = timestamp;
    update(dt);
    draw(dt);
    animationId = requestAnimationFrame(loop);
  }

  function startGame() {
    cancelAnimationFrame(animationId);
    running = true;
    lastTime = 0;
    spawnTimer = .4;
    coinTimer = 0;
    score = 0;
    coins = 0;
    speed = 0;
    traffic = [];
    pickups = [];
    particles = [];
    roadOffset = 0;
    player.lane = 1;
    player.x = laneCenter(1);
    player.targetX = player.x;
    player.invulnerable = 1;
    startOverlay.classList.add("hidden");
    crashOverlay.classList.add("hidden");
    gameStatus.className = "status-pill playing";
    gameStatus.innerHTML = "<span></span> В ЗАЕЗДЕ";
    footerMessage.textContent = "Заезд начался — держи курс!";
    playTone(440, .08);
    animationId = requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    cancelAnimationFrame(animationId);
    burst(player.x, player.y, "#ff5d8f", 28);
    draw(0);
    finalScore.textContent = formatScore(score);
    finalCoins.textContent = coins;
    if (score > best) {
      best = Math.floor(score);
      localStorage.setItem("neonRacerBest", String(best));
      bestScoreEl.textContent = formatScore(best);
      footerMessage.textContent = "Новый рекорд! Отличный заезд.";
    } else {
      footerMessage.textContent = "Заезд завершён. Попробуй улучшить результат.";
    }
    gameStatus.className = "status-pill crashed";
    gameStatus.innerHTML = "<span></span> ФИНИШ";
    crashOverlay.classList.remove("hidden");
    playTone(150, .2);
    updateHud();
  }

  function updateHud() {
    speedValue.innerHTML = `${String(Math.round(speed)).padStart(3, "0")} <small>км/ч</small>`;
    scoreValue.textContent = formatScore(score);
    coinValue.textContent = coins;
    bestScoreEl.textContent = formatScore(best);
  }

  function movePlayer(direction) {
    if (!running) return;
    player.lane = Math.max(0, Math.min(2, player.lane + direction));
    playTone(direction < 0 ? 330 : 370, .035);
  }

  function playTone(frequency, duration) {
    if (!soundOn) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(.045, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_) { /* Sound is optional on unsupported browsers. */ }
  }

  document.addEventListener("keydown", event => {
    if (["ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
    if ((event.key === "ArrowLeft" || event.key.toLowerCase() === "a") && !keys.left) {
      keys.left = true; movePlayer(-1);
    }
    if ((event.key === "ArrowRight" || event.key.toLowerCase() === "d") && !keys.right) {
      keys.right = true; movePlayer(1);
    }
    if (event.key === " " && !running) startGame();
  });
  document.addEventListener("keyup", event => {
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keys.left = false;
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keys.right = false;
  });

  function bindTouchButton(id, direction) {
    const button = document.getElementById(id);
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      movePlayer(direction);
    });
  }
  bindTouchButton("leftBtn", -1);
  bindTouchButton("rightBtn", 1);

  startBtn.addEventListener("click", startGame);
  restartBtn.addEventListener("click", startGame);
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? "♫" : "♪";
    soundBtn.style.color = soundOn ? "var(--cyan)" : "#8c9ab5";
    soundBtn.title = soundOn ? "Выключить звук" : "Включить звук";
    if (soundOn) playTone(520, .08);
  });

  bestScoreEl.textContent = formatScore(best);
  draw(0);
  updateHud();
})();