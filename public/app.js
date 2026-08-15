const socket = io();
const app = document.querySelector('#app');
let room = null;
let me = null;
let activeCard = null;
let busy = false;
let feedbackTimer = null;

const esc = value => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const year = value => value < 0 ? `${Math.abs(value)} a.C.` : String(value);

function toast(message) {
  const node = document.querySelector('#toast-template').content.firstElementChild.cloneNode(true);
  node.textContent = message;
  document.body.append(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => { node.classList.remove('show'); setTimeout(() => node.remove(), 250); }, 2800);
}

function welcome() {
  room = null; me = null; activeCard = null;
  app.innerHTML = `
    <section class="home-shell">
      <div class="orbit orbit-a"></div><div class="orbit orbit-b"></div>
      <div class="brand"><span class="brand-mark">↝</span><span>Linha Viva</span></div>
      <div class="hero-stamp">HISTÓRIA EM JOGO</div>
      <h1>Qual é o seu<br><em>lugar</em> no tempo?</h1>
      <p class="intro">Descubram juntos onde cada acontecimento se encaixa. Até 5 pessoas, um único código de sala.</p>
      <form id="entry-form" class="entry-card">
        <label for="name">Seu nome</label>
        <input id="name" name="name" maxlength="18" autocomplete="nickname" placeholder="Como te chamam?" required />
        <button class="button button-main" type="submit">Criar uma sala <span>→</span></button>
        <button class="button button-link" type="button" id="show-join">Tenho um código</button>
      </form>
      <form id="join-form" class="entry-card hidden">
        <button class="back" type="button" id="back-home">← Voltar</button>
        <label for="join-name">Seu nome</label>
        <input id="join-name" maxlength="18" autocomplete="nickname" placeholder="Como te chamam?" required />
        <label for="room-code">Código da sala</label>
        <input id="room-code" class="code-input" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="A1B2C" required />
        <button class="button button-main" type="submit">Entrar na sala <span>→</span></button>
      </form>
      <p class="footnote">2–5 pessoas · 4 rodadas por jogador · 2 pontos por acerto</p>
    </section>`;
  document.querySelector('#entry-form').addEventListener('submit', createRoom);
  document.querySelector('#show-join').addEventListener('click', () => { document.querySelector('#entry-form').classList.add('hidden'); document.querySelector('#join-form').classList.remove('hidden'); document.querySelector('#join-name').focus(); });
  document.querySelector('#back-home').addEventListener('click', welcome);
  document.querySelector('#join-form').addEventListener('submit', joinRoom);
}

function createRoom(event) {
  event.preventDefault();
  const name = new FormData(event.currentTarget).get('name');
  socket.emit('room:create', { name }, response => {
    if (!response.ok) return toast(response.message);
    me = response.playerId;
  });
}

function joinRoom(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  socket.emit('room:join', { name: form.get('join-name'), code: form.get('room-code') }, response => {
    if (!response.ok) return toast(response.message);
    me = response.playerId;
  });
}

function playersHtml(players) {
  return players.map(player => `<li class="player ${player.id === room.turnPlayerId ? 'turn-player' : ''} ${player.id === me ? 'is-me' : ''}">
    <span class="avatar" style="--avatar:${player.color}">${esc(player.name).slice(0, 1).toUpperCase()}</span>
    <span class="player-name">${esc(player.name)}${player.id === me ? '<small> você</small>' : ''}</span>
    <strong>${player.score}</strong>${!player.connected ? '<i title="Desconectado">·</i>' : ''}
  </li>`).join('');
}

function header() {
  return `<header class="game-header"><button class="brand small" id="leave" aria-label="Sair da sala"><span class="brand-mark">↝</span><span>Linha Viva</span></button><div class="room-pill">SALA <b>${room.code}</b><button id="copy-code" aria-label="Copiar código">⧉</button></div></header>`;
}

function lobby() {
  const amHost = room.hostId === me;
  app.innerHTML = `<section class="game-shell lobby-shell">${header()}
    <div class="lobby-copy"><span class="eyebrow">SUA SALA ESTÁ ABERTA</span><h1>Reúna a<br><em>tripulação.</em></h1><p>Envie este código para quem vai jogar com você.</p></div>
    <div class="room-code-big" id="copy-big" role="button" tabindex="0" aria-label="Copiar código da sala">${room.code}<span>toque para copiar</span></div>
    <section class="player-panel"><div class="panel-heading"><span>NO TEMPO</span><span>${room.players.length} / 5</span></div><ul class="players">${playersHtml(room.players)}</ul></section>
    <div class="lobby-actions">${amHost ? `<button class="button button-main" id="start-game" ${room.players.length < 2 ? 'disabled' : ''}>Começar a partida <span>→</span></button><p>${room.players.length < 2 ? 'Falta mais uma pessoa para começar.' : 'Tudo pronto. Cada pessoa terá 4 tentativas.'}</p>` : '<div class="waiting"><span class="pulse"></span>Aguardando quem criou a sala começar…</div>'}</div>
  </section>`;
  bindCommon();
  document.querySelector('#copy-big').addEventListener('click', copyCode);
  document.querySelector('#start-game')?.addEventListener('click', () => socket.emit('game:start', response => { if (!response.ok) toast(response.message); }));
}

function gapButton(index, label) {
  return `<button class="gap" data-index="${index}" aria-label="Colocar aqui: ${label}"><span>＋</span><small>${label}</small></button>`;
}

function timelineHtml() {
  const entries = room.timeline;
  let html = `<div class="timeline-scroll"><div class="timeline">${gapButton(0, 'antes de tudo')}`;
  entries.forEach((card, index) => {
    html += `<article class="time-card ${card.anchor ? 'anchor' : ''}"><div class="time-card-year">${year(card.year)}</div><div class="time-card-title">${esc(card.title)}</div></article>${gapButton(index + 1, index === entries.length - 1 ? 'depois de tudo' : 'entre estes eventos')}`;
  });
  return `${html}</div></div>`;
}

function playing() {
  const currentPlayer = room.players.find(player => player.id === room.turnPlayerId);
  const isMyTurn = room.turnPlayerId === me;
  const turnText = isMyTurn ? 'Sua vez de decidir.' : `${currentPlayer?.name || 'Alguém'} está pensando…`;
  const progress = Math.min(100, (room.turnNumber / room.maxTurns) * 100);
  app.innerHTML = `<section class="game-shell play-shell">${header()}
    <div class="progress"><span>RODADA ${Math.min(room.turnNumber + 1, room.maxTurns)} DE ${room.maxTurns}</span><div><i style="width:${progress}%"></i></div></div>
    <section class="turn-banner ${isMyTurn ? 'my-turn' : ''}"><div class="turn-avatar" style="--avatar:${currentPlayer?.color || '#fff'}">${esc(currentPlayer?.name || '?').slice(0,1)}</div><div><span>${isMyTurn ? 'É COM VOCÊ' : 'VEZ DE ' + esc(currentPlayer?.name || '').toUpperCase()}</span><strong>${turnText}</strong></div></section>
    <section class="card-stage ${isMyTurn ? '' : 'card-hidden'}">${isMyTurn && activeCard ? `<span class="eyebrow">ONDE ISSO ACONTECEU?</span><article class="mystery-card"><span class="card-index">ARQUIVO ${String(room.turnNumber + 1).padStart(2, '0')}</span><h2>${esc(activeCard.title)}</h2><p>Toque no intervalo correto da linha do tempo.</p></article>` : `<div class="think-card"><div class="hourglass">⌛</div><strong>${currentPlayer?.name || 'O jogador'} está com uma carta</strong><span>Aguarde a decisão.</span></div>`}</section>
    <section class="board-section"><div class="board-label"><span>LIGAÇÕES NO TEMPO</span><small>toque no + para posicionar</small></div>${timelineHtml()}</section>
    <section class="score-strip"><span>PLACAR</span><ul class="players compact">${playersHtml(room.players)}</ul></section>
    <div id="move-feedback"></div>
  </section>`;
  bindCommon();
  if (isMyTurn && activeCard && !room.lastMove) document.querySelectorAll('.gap').forEach(button => button.addEventListener('click', placeCard));
  if (room.lastMove) showMoveFeedback();
}

function placeCard(event) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('.gap').forEach(button => button.disabled = true);
  socket.emit('turn:place', { index: Number(event.currentTarget.dataset.index) }, response => {
    if (!response.ok) { busy = false; toast(response.message); }
  });
}

function showMoveFeedback() {
  const move = room.lastMove;
  const target = document.querySelector('#move-feedback');
  if (!target || !move) return;
  target.innerHTML = `<div class="move-feedback ${move.correct ? 'correct' : 'wrong'}"><span>${move.correct ? '✓' : '×'}</span><div><strong>${move.correct ? 'No lugar certo!' : 'Quase lá.'}</strong><p>${esc(move.playerName)} · ${esc(move.card.title)} <b>${year(move.card.year)}</b>${move.correct ? ' · +2 pontos' : ''}</p></div></div>`;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => { if (target) target.innerHTML = ''; }, 2250);
}

function finished() {
  const winners = room.players.filter(player => room.winnerIds.includes(player.id));
  const winnerText = winners.map(player => player.name).join(' e ');
  const amHost = room.hostId === me;
  const ordered = [...room.players].sort((a,b) => b.score - a.score);
  app.innerHTML = `<section class="game-shell finish-shell">${header()}
    <div class="finish-star">✦</div><span class="eyebrow">A LINHA ESTÁ COMPLETA</span><h1>${esc(winnerText)}<br><em>${winners.length > 1 ? 'empataram!' : 'venceu!'}</em></h1><p class="finish-copy">Vocês deram novos lugares a ${room.timeline.length - 3} acontecimentos.</p>
    <ol class="ranking">${ordered.map((player,index) => `<li class="rank-${index + 1}"><span class="place">${index + 1}</span><span class="avatar" style="--avatar:${player.color}">${esc(player.name).slice(0,1)}</span><strong>${esc(player.name)}${player.id === me ? '<small> você</small>' : ''}</strong><b>${player.score} <small>pts</small></b></li>`).join('')}</ol>
    ${amHost ? '<button class="button button-main" id="restart">Jogar de novo <span>↻</span></button>' : '<div class="waiting"><span class="pulse"></span>Aguardando uma nova partida…</div>'}
  </section>`;
  bindCommon();
  document.querySelector('#restart')?.addEventListener('click', () => socket.emit('game:restart', response => { if (!response.ok) toast(response.message); }));
}

function bindCommon() {
  document.querySelector('#copy-code')?.addEventListener('click', copyCode);
  document.querySelector('#leave')?.addEventListener('click', () => { if (confirm('Sair desta sala?')) { socket.disconnect(); location.reload(); } });
}

async function copyCode() {
  try { await navigator.clipboard.writeText(room.code); toast('Código copiado.'); }
  catch { toast(`Código da sala: ${room.code}`); }
}

socket.on('room:state', nextRoom => {
  room = nextRoom;
  busy = false;
  if (room.status !== 'playing') activeCard = null;
  if (room.status === 'lobby') lobby();
  if (room.status === 'playing') playing();
  if (room.status === 'finished') finished();
});
socket.on('turn:card', card => { activeCard = card; if (room?.status === 'playing') playing(); });
socket.on('connect_error', () => toast('Não foi possível conectar ao jogo. Tente recarregar.'));
welcome();
