// server/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const rooms = {};

const WORDS = ['banana', 'hotdog', 'sausage', 'pickle', 'melons', 'peaches', 'eggplant', 'donut', 'taco', 'bun', 'muffin', 'cream', 'popsicle', 'burrito', 'sandwich', 'nacho', 'cookie', 'lollipop', 'kiss', 'bed', 'shower', 'undies', 'bra', 'boxer', 'heels', 'lipstick', 'selfie', 'wink', 'bikini', 'blush', 'pillow', 'mirror', 'perfume', 'handcuffs', 'blanket', 'candle', 'chocolate', 'whip', 'massage', 'belly', 'tongue', 'beard', 'eyebrow', 'icecube', 'lotion', 'towel', 'pajamas', 'diary', 'poop', 'fart', 'toilet', 'underwear', 'hairbrush', 'sneeze', 'pussycat', 'rooster', 'monkey', 'donkey', 'duck', 'cow', 'pig', 'disco', 'wine', 'shot', 'champagne', 'cocktail', 'straw', 'couch', 'belt', 'tie', 'boots', 'necklace', 'sunglasses', 'wet', 'hot', 'sticky', 'sweaty', 'juicy', 'spicy', 'rough', 'smooth', 'clown', 'slipper', 'remote', 'balloon', 'soap', 'bathtub', 'rubberduck', 'bubbles', 'steam', 'sponge', 'naughty', 'secret', 'spy', 'kissmark', 'whisper', 'dare', 'truth', 'flirt', 'filter', 'emoji', 'hashtag', 'like', 'meme', 'honey', 'sugar', 'candy', 'icecream', 'milkshake', 'date', 'rose', 'heart', 'cupid', 'valentine', 'couple', 'hug', 'wink', 'lick', 'bite', 'chase', 'drool', 'sock', 'wig', 'sweat', 'dance', 'twerk', 'karaoke', 'pizza', 'toast', 'popcorn', 'burger', 'fries', 'onion', 'cheese', 'potato', 'chips', 'marshmallow', 'coffee', 'beer', 'milk', 'fork', 'spoon', 'knife', 'lunchbox', 'basket', 'lipgloss', 'bracelet', 'watch', 'charger', 'laptop', 'keyboard', 'backpack', 'wallet', 'ribbon', 'balloon', 'confetti', 'cake', 'candle', 'guitar', 'drum', 'violin', 'piano', 'microphone', 'speaker', 'heartbeat', 'devil', 'fire', 'moon', 'star', 'rocket', 'alien', 'mermaid', 'unicorn', 'dragon', 'genie', 'witch', 'vampire', 'ghost', 'angel', 'halo', 'seduce', 'cuddle', 'tickle', 'dance', 'jump', 'slide', 'spin', 'chase', 'hide', 'peek', 'spy', 'sneak', 'snap', 'stretch', 'pose', 'laugh', 'scream', 'sleep', 'dream', 'jump', 'crawl', 'run', 'fly', 'swim', 'surf', 'float', 'dive', 'twirl', 'shake', 'bounce', 'climb', 'fall', 'chase', 'grab', 'tug', 'poke', 'tap', 'pull', 'push', 'kick', 'punch', 'smack', 'slap', 'sniff', 'snore', 'yawn', 'stretch', 'blink', 'sweat', 'shiver', 'chill', 'heat', 'steam', 'splash', 'smoke', 'fire', 'rain', 'thunder', 'lightning', 'shadow', 'glow', 'spark', 'flame', 'cloud', 'wave', 'breeze', 'storm', 'tornado', 'volcano', 'earth', 'ocean', 'island', 'beach', 'cave', 'forest', 'jungle', 'desert', 'mountain', 'valley', 'river', 'lake', 'waterfall', 'rope', 'chain', 'mask', 'shorts', 'shirt', 'jacket', 'crown', 'tattoo', 'phone', 'camera', 'charger', 'laptop', 'keyboard', 'mouse', 'chair', 'couch', 'door', 'window', 'curtain', 'closet', 'key', 'lock', 'bell', 'alarm', 'fan', 'light', 'switch', 'battery', 'knife', 'scissors', 'razor', 'toothbrush', 'hairdryer', 'ribbon', 'string', 'paper', 'book', 'pen', 'pencil', 'marker', 'note', 'card', 'coin', 'ticket', 'map', 'bag', 'backpack', 'bottle', 'calendar', 'clock', 'speaker', 'guitar', 'drum', 'piano', 'disco', 'stage', 'curtain', 'shadow', 'moonlight', 'heart'];

// 🌀 Next player's turn
function startNextTurn(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const ids = Object.keys(room.players);
  if (ids.length === 0) return;

  room.strokes = [];
  room.hints = [];
  room.guessedPlayers = new Set();
  room.currentDrawerIndex = (room.currentDrawerIndex + 1) % ids.length;
  const drawerId = ids[room.currentDrawerIndex];
  room.currentDrawer = drawerId;
  room.currentWord = null;

  const wordOptions = WORDS.sort(() => 0.5 - Math.random()).slice(0, 3);

  io.to(drawerId).emit("wordOptions", wordOptions);
  io.to(roomCode).emit("drawerSelected", room.players[drawerId].name);
}

// 🕐 Start round
function startRound(roomCode, word) {
  const room = rooms[roomCode];
  if (!room) return;

  room.currentWord = word.toLowerCase();
  room.guessedPlayers = new Set();
  room.timeLeft = 60;

  io.to(roomCode).emit("wordChosen", "A word has been chosen!");
  io.to(room.currentDrawer).emit("yourWord", word);

  room.timer = setInterval(() => {
    room.timeLeft -= 1;

    if (room.timeLeft % 15 === 0 && room.timeLeft > 0) {
      const revealHint = revealLetter(room);
      io.to(roomCode).emit("hintUpdate", revealHint);
    }

    io.to(roomCode).emit("timerUpdate", room.timeLeft);

    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      io.to(roomCode).emit("roundOver", {
        message: `⏱ Time’s up! The word was "${room.currentWord.toUpperCase()}"`,
        correctWord: room.currentWord,
      });
      setTimeout(() => startNextTurn(roomCode), 3000);
    }
  }, 1000);
}

function revealLetter(room) {
  const word = room.currentWord;
  if (!word) return "";
  let revealed = room.hints.join("") || "_".repeat(word.length);

  const unrevealedIndexes = [];
  for (let i = 0; i < word.length; i++) {
    if (revealed[i] === "_") unrevealedIndexes.push(i);
  }
  if (unrevealedIndexes.length === 0) return revealed;

  const randomIndex = unrevealedIndexes[Math.floor(Math.random() * unrevealedIndexes.length)];
  revealed =
    revealed.substring(0, randomIndex) +
    word[randomIndex].toUpperCase() +
    revealed.substring(randomIndex + 1);
  room.hints = revealed.split("");
  return revealed;
}

function checkRoundEnd(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const totalPlayers = Object.keys(room.players).length;
  const totalGuessers = room.guessedPlayers.size;

  if (totalGuessers >= totalPlayers - 1) {
    clearInterval(room.timer);
    io.to(roomCode).emit("roundOver", {
      message: `✅ Everyone guessed it! The word was "${room.currentWord.toUpperCase()}"`,
      correctWord: room.currentWord,
    });
    setTimeout(() => startNextTurn(roomCode), 3000);
  }
}

io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);
  let currentRoom = null;

  socket.on("createRoom", ({ name, roomCode }) => {
    rooms[roomCode] = rooms[roomCode] || {
      players: {},
      strokes: [],
      currentDrawerIndex: -1,
    };
    rooms[roomCode].players[socket.id] = { name, score: 0 };
    currentRoom = roomCode;
    socket.join(roomCode);
    io.to(roomCode).emit("updatePlayers", Object.values(rooms[roomCode].players));
  });

socket.on("joinRoom", ({ name, roomCode }) => {
  if (!rooms[roomCode]) return socket.emit("errorMessage", "Room not found!");

  const room = rooms[roomCode];
  room.players[socket.id] = { name, score: 0 };
  currentRoom = roomCode;
  socket.join(roomCode);

  io.to(roomCode).emit("updatePlayers", Object.values(room.players));

  // 🧠 Safe drawer check
  let currentDrawerName = null;
  if (room.currentDrawer && room.players[room.currentDrawer]) {
    currentDrawerName = room.players[room.currentDrawer].name;
  }

  const currentState = {
    players: Object.values(room.players),
    drawer: currentDrawerName,
    hint: room.hints ? room.hints.join("") : "",
    timer: room.timeLeft || null,
    currentWord: room.currentWord || null,
  };

  socket.emit("gameState", currentState);
  socket.emit("syncStrokes", room.strokes || []);
});


  socket.on("draw", (stroke) => {
    if (!currentRoom) return;
    rooms[currentRoom].strokes.push(stroke);
    socket.to(currentRoom).emit("draw", stroke);
  });

  // 🔙 Undo
  socket.on("undoStroke", (updatedStrokes) => {
    if (!currentRoom) return;
    rooms[currentRoom].strokes = updatedStrokes;
    io.to(currentRoom).emit("undoStroke", updatedStrokes);
  });

  socket.on("clearCanvas", () => {
    if (!currentRoom) return;
    rooms[currentRoom].strokes = [];
    io.to(currentRoom).emit("clearCanvas");
  });

  socket.on("startGame", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.currentDrawerIndex = -1;
    startNextTurn(roomCode);
  });

  socket.on("chooseWord", ({ roomCode, word }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.currentWord = word.toLowerCase();
    io.to(roomCode).emit("wordChosen", "A word has been chosen!");
    io.to(room.currentDrawer).emit("yourWord", word);
    startRound(roomCode, word);
  });

  socket.on("chatMessage", (msg) => {
    const room = rooms[msg.room];
    if (!room || !room.currentWord) return io.to(msg.room).emit("chatMessage", msg);

    const guess = msg.text.trim().toLowerCase();
    const playerName = msg.sender;
    if (room.guessedPlayers.has(playerName)) return;

    if (guess === room.currentWord) {
      room.guessedPlayers.add(playerName);
      const guesser = Object.values(room.players).find((p) => p.name === playerName);
      const drawer = room.players[room.currentDrawer];
      const correctCount = room.guessedPlayers.size;

      const points =
        correctCount === 1 ? 100 : correctCount === 2 ? 70 : correctCount === 3 ? 50 : 30;

      if (guesser) guesser.score += points;
      if (drawer) drawer.score += 10;

      io.to(msg.room).emit("chatMessage", {
        sender: "SYSTEM",
        text: `🎯 ${playerName} guessed it first! (+${points})`,
      });
      io.to(msg.room).emit("updateScores", Object.values(room.players));
      checkRoundEnd(msg.room);
    } else {
      io.to(msg.room).emit("chatMessage", msg);
    }
  });

  socket.on("disconnect", () => {
    if (currentRoom && rooms[currentRoom]) {
      const room = rooms[currentRoom];
      delete room.players[socket.id];
      io.to(currentRoom).emit("updatePlayers", Object.values(room.players));
      if (Object.keys(room.players).length === 0) delete rooms[currentRoom];
    }
  });
});

import path from "path";
import { fileURLToPath } from "url";

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Serve React build
const clientPath = path.join(__dirname, "../client/build");
app.use(express.static(clientPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(clientPath, "index.html"));
});

// ✅ Dynamic PORT for Render
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

