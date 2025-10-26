// server/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// 🔹 Game State Memory
const rooms = {};

// 🔹 Word Bank
const WORDS = [
  "banana", "hotdog", "sausage", "pickle", "melons", "pizza", "sandwich", "cookie",
  "heart", "camera", "phone", "light", "tree", "car", "guitar", "rocket"
];

// 🌀 Move to next drawer
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

// 🕐 Start a round
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

    // Reveal hint every 15 seconds
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

// 🧩 Reveal one random letter
function revealLetter(room) {
  const word = room.currentWord;
  if (!word) return "";
  let revealed = room.hints.join("") || "_".repeat(word.length);

  const unrevealed = [];
  for (let i = 0; i < word.length; i++) {
    if (revealed[i] === "_") unrevealed.push(i);
  }
  if (unrevealed.length === 0) return revealed;

  const index = unrevealed[Math.floor(Math.random() * unrevealed.length)];
  revealed =
    revealed.substring(0, index) +
    word[index].toUpperCase() +
    revealed.substring(index + 1);
  room.hints = revealed.split("");
  return revealed;
}

// ✅ End check
function checkRoundEnd(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  if (room.guessedPlayers.size >= Object.keys(room.players).length - 1) {
    clearInterval(room.timer);
    io.to(roomCode).emit("roundOver", {
      message: `✅ Everyone guessed it! The word was "${room.currentWord.toUpperCase()}"`,
      correctWord: room.currentWord,
    });
    setTimeout(() => startNextTurn(roomCode), 3000);
  }
}

// ⚡ Socket IO
io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);
  let currentRoom = null;

  // Create Room
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

  // Join Room
  socket.on("joinRoom", ({ name, roomCode }) => {
    if (!rooms[roomCode]) return socket.emit("errorMessage", "Room not found!");
    const room = rooms[roomCode];
    room.players[socket.id] = { name, score: 0 };
    currentRoom = roomCode;
    socket.join(roomCode);

    io.to(roomCode).emit("updatePlayers", Object.values(room.players));

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

  // Draw
  socket.on("draw", (stroke) => {
    if (!currentRoom) return;
    rooms[currentRoom].strokes.push(stroke);
    socket.to(currentRoom).emit("draw", stroke);
  });

  // Undo
  socket.on("undoStroke", (updatedStrokes) => {
    if (!currentRoom) return;
    rooms[currentRoom].strokes = updatedStrokes;
    io.to(currentRoom).emit("undoStroke", updatedStrokes);
  });

  // Clear
  socket.on("clearCanvas", () => {
    if (!currentRoom) return;
    rooms[currentRoom].strokes = [];
    io.to(currentRoom).emit("clearCanvas");
  });

  // Start Game
  socket.on("startGame", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.currentDrawerIndex = -1;
    startNextTurn(roomCode);
  });

  // Choose Word
  socket.on("chooseWord", ({ roomCode, word }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.currentWord = word.toLowerCase();
    io.to(roomCode).emit("wordChosen", "A word has been chosen!");
    io.to(room.currentDrawer).emit("yourWord", word);
    startRound(roomCode, word);
  });

  // Chat Guess
  socket.on("chatMessage", (msg) => {
    const room = rooms[msg.room];
    if (!room || !room.currentWord)
      return io.to(msg.room).emit("chatMessage", msg);

    const guess = msg.text.trim().toLowerCase();
    const playerName = msg.sender;
    if (room.guessedPlayers.has(playerName)) return;

    if (guess === room.currentWord) {
      room.guessedPlayers.add(playerName);
      const guesser = Object.values(room.players).find((p) => p.name === playerName);
      const drawer = room.players[room.currentDrawer];
      const count = room.guessedPlayers.size;
      const points = count === 1 ? 100 : count === 2 ? 70 : count === 3 ? 50 : 30;

      if (guesser) guesser.score += points;
      if (drawer) drawer.score += 10;

      io.to(msg.room).emit("chatMessage", {
        sender: "SYSTEM",
        text: `🎯 ${playerName} guessed it! (+${points})`,
      });
      io.to(msg.room).emit("updateScores", Object.values(room.players));
      checkRoundEnd(msg.room);
    } else {
      io.to(msg.room).emit("chatMessage", msg);
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    if (currentRoom && rooms[currentRoom]) {
      const room = rooms[currentRoom];
      delete room.players[socket.id];
      io.to(currentRoom).emit("updatePlayers", Object.values(room.players));
      if (Object.keys(room.players).length === 0) delete rooms[currentRoom];
    }
  });
});

// ✅ Serve React Build (Render Compatible)
// ✅ Serve React Build (Render Compatible)
const clientPath = path.join(__dirname, "../client/build");
app.use(express.static(clientPath));

// ✅ Express v5 safe fallback
app.use((req, res) => {
  res.sendFile(path.join(clientPath, "index.html"));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
