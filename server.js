const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

const MAX_PLAYERS = 5;
const TURNS_PER_PLAYER = 4;
const COLORS = ['#f36b50', '#f7b544', '#56cbb6', '#7d8cff', '#de76b7'];

const cards = [
  ['Construção das pirâmides de Gizé', -2560], ['Fundação de Roma', -753],
  ['Primeiros Jogos Olímpicos', -776], ['Júlio César é assassinado', -44],
  ['Erupção do Vesúvio em Pompeia', 79], ['Queda do Império Romano do Ocidente', 476],
  ['Chegada dos vikings à América do Norte', 1000], ['Invenção da imprensa por Gutenberg', 1440],
  ['Chegada portuguesa ao Brasil', 1500], ['Reforma Protestante', 1517],
  ['Primeira volta ao mundo', 1522], ['Publicação de Dom Quixote', 1605],
  ['Queda da Bastilha', 1789], ['Independência do Brasil', 1822],
  ['Primeira fotografia permanente', 1826], ['Abolição da escravidão no Brasil', 1888],
  ['Primeiro voo dos irmãos Wright', 1903], ['Fim da Primeira Guerra Mundial', 1918],
  ['Descoberta da penicilina', 1928], ['Primeira Copa do Mundo', 1930],
  ['Segunda Guerra Mundial termina', 1945], ['Declaração Universal dos Direitos Humanos', 1948],
  ['Chegada do homem à Lua', 1969], ['Criação do primeiro e-mail', 1971],
  ['Queda do Muro de Berlim', 1989], ['Fim da União Soviética', 1991],
  ['Primeira mensagem de texto (SMS)', 1992], ['Lançamento do Google', 1998],
  ['Wikipedia vai ao ar', 2001], ['Primeiro iPhone é lançado', 2007],
  ['Brasil sedia a Copa do Mundo', 2014], ['Primeiras imagens do telescópio James Webb', 2022]
].map(([title, year], id) => ({ id, title, year }));

const anchors = [
  { id: 'anchor-1', title: 'Brasil é descoberto pelos portugueses', year: 1500, anchor: true },
  { id: 'anchor-2', title: 'Independência do Brasil', year: 1822, anchor: true },
  { id: 'anchor-3', title: 'Chegada do homem à Lua', year: 1969, anchor: true }
];

const rooms = new Map();

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 18);
}

function cleanRoom(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  while (rooms.has(code));
  return code;
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function playerFor(room, socketId) {
  return room.players.find(player => player.socketId === socketId);
}

function publicPlayer(player) {
  return { id: player.id, name: player.name, color: player.color, score: player.score, connected: player.connected };
}

function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    players: room.players.map(publicPlayer),
    timeline: room.timeline.map(({ id, title, year, anchor }) => ({ id, title, year, anchor })),
    turnPlayerId: room.turnPlayerId,
    turnNumber: room.turnNumber,
    maxTurns: room.maxTurns,
    lastMove: room.lastMove,
    winnerIds: room.winnerIds || []
  };
}

function emitState(room) {
  io.to(room.code).emit('room:state', publicRoom(room));
  if (room.status === 'playing' && room.currentCard) {
    const player = room.players.find(item => item.id === room.turnPlayerId);
    if (player && player.connected) io.to(player.socketId).emit('turn:card', { id: room.currentCard.id, title: room.currentCard.title });
  }
}

function turnPlayer(room) {
  return room.players.find(player => player.id === room.turnPlayerId);
}

function advanceTurn(room) {
  room.currentCard = null;
  room.lastMove = null;
  room.turnNumber += 1;
  if (room.turnNumber >= room.maxTurns || !room.deck.length) {
    room.status = 'finished';
    const highScore = Math.max(...room.players.map(player => player.score));
    room.winnerIds = room.players.filter(player => player.score === highScore).map(player => player.id);
    emitState(room);
    return;
  }
  const start = room.players.findIndex(player => player.id === room.turnPlayerId);
  let next;
  for (let offset = 1; offset <= room.players.length; offset += 1) {
    const candidate = room.players[(start + offset) % room.players.length];
    if (candidate.connected) { next = candidate; break; }
  }
  if (!next) return;
  room.turnPlayerId = next.id;
  room.currentCard = room.deck.pop();
  emitState(room);
}

function roomForSocket(socket) {
  const code = socket.data.roomCode;
  return code && rooms.get(code);
}

io.on('connection', socket => {
  socket.on('room:create', ({ name }, respond) => {
    const safeName = cleanName(name);
    if (!safeName) return respond({ ok: false, message: 'Escreva seu nome para criar a sala.' });
    const code = makeRoomCode();
    const player = { id: socket.id, socketId: socket.id, name: safeName, color: COLORS[0], score: 0, connected: true };
    const room = { code, hostId: player.id, players: [player], status: 'lobby', timeline: [], deck: [], turnPlayerId: null, turnNumber: 0, maxTurns: 0, currentCard: null, lastMove: null };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    respond({ ok: true, code, playerId: player.id });
    emitState(room);
  });

  socket.on('room:join', ({ name, code }, respond) => {
    const room = rooms.get(cleanRoom(code));
    const safeName = cleanName(name);
    if (!room) return respond({ ok: false, message: 'Não encontramos essa sala. Confira o código.' });
    if (room.status !== 'lobby') return respond({ ok: false, message: 'Essa partida já começou.' });
    if (!safeName) return respond({ ok: false, message: 'Escreva seu nome para entrar.' });
    if (room.players.length >= MAX_PLAYERS) return respond({ ok: false, message: 'A sala já chegou a cinco pessoas.' });
    if (room.players.some(player => player.name.toLowerCase() === safeName.toLowerCase())) return respond({ ok: false, message: 'Escolha outro nome nesta sala.' });
    const player = { id: socket.id, socketId: socket.id, name: safeName, color: COLORS[room.players.length], score: 0, connected: true };
    room.players.push(player);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    respond({ ok: true, code: room.code, playerId: player.id });
    emitState(room);
  });

  socket.on('game:start', (respond) => {
    const room = roomForSocket(socket);
    const player = room && playerFor(room, socket.id);
    if (!room || !player || room.hostId !== player.id) return respond?.({ ok: false, message: 'Só quem criou a sala pode iniciar.' });
    if (room.players.length < 2) return respond?.({ ok: false, message: 'Chame pelo menos mais uma pessoa.' });
    room.status = 'playing';
    room.timeline = anchors.map(card => ({ ...card }));
    room.deck = shuffle(cards.filter(card => !room.timeline.some(anchor => anchor.year === card.year)));
    room.turnPlayerId = room.players[0].id;
    room.turnNumber = 0;
    room.maxTurns = Math.min(room.deck.length, room.players.length * TURNS_PER_PLAYER);
    room.currentCard = room.deck.pop();
    room.lastMove = null;
    emitState(room);
    respond?.({ ok: true });
  });

  socket.on('turn:place', ({ index }, respond) => {
    const room = roomForSocket(socket);
    const player = room && playerFor(room, socket.id);
    if (!room || room.status !== 'playing' || !player || room.turnPlayerId !== player.id || !room.currentCard) return respond?.({ ok: false, message: 'Agora não é a sua vez.' });
    const safeIndex = Number(index);
    if (!Number.isInteger(safeIndex) || safeIndex < 0 || safeIndex > room.timeline.length) return respond?.({ ok: false, message: 'Posição inválida.' });
    const correctIndex = room.timeline.filter(card => card.year < room.currentCard.year).length;
    const correct = safeIndex === correctIndex;
    if (correct) {
      room.timeline.splice(safeIndex, 0, room.currentCard);
      player.score += 2;
    }
    room.lastMove = { playerId: player.id, playerName: player.name, card: room.currentCard, correct, correctIndex };
    emitState(room);
    setTimeout(() => { if (rooms.get(room.code) === room && room.status === 'playing') advanceTurn(room); }, 2300);
    respond?.({ ok: true, correct, year: room.currentCard.year });
  });

  socket.on('game:restart', (respond) => {
    const room = roomForSocket(socket);
    const player = room && playerFor(room, socket.id);
    if (!room || !player || room.hostId !== player.id) return respond?.({ ok: false, message: 'Só quem criou a sala pode reiniciar.' });
    room.status = 'lobby';
    room.players.forEach(item => { item.score = 0; });
    room.timeline = []; room.deck = []; room.currentCard = null; room.lastMove = null; room.turnPlayerId = null; room.turnNumber = 0; room.winnerIds = [];
    emitState(room);
    respond?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const room = roomForSocket(socket);
    if (!room) return;
    const player = playerFor(room, socket.id);
    if (!player) return;
    if (room.status === 'lobby') {
      room.players = room.players.filter(item => item.id !== player.id);
      if (!room.players.length) { rooms.delete(room.code); return; }
      if (room.hostId === player.id) room.hostId = room.players[0].id;
    } else {
      player.connected = false;
      if (room.turnPlayerId === player.id) advanceTurn(room);
    }
    emitState(room);
  });
});

server.listen(port, () => console.log(`Linha Viva em http://localhost:${port}`));
