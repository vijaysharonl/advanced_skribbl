import { useState, useEffect } from "react";
import io from "socket.io-client";
import CanvasBoard from "./components/CanvasBoard";
import ChatBox from "./components/Chatbox";
import Toolbar from "./components/Toolbar";
import Toast from "./components/Toast";
import PlayerList from "./components/PlayerList";
import { motion, AnimatePresence } from "framer-motion";

// ✅ Cross-browser Clipboard Helper
async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  } else {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const success = document.execCommand("copy");
      document.body.removeChild(ta);
      return success;
    } catch (err) {
      console.error("Copy failed", err);
      return false;
    }
  }
}

export default function App() {
  const [socket, setSocket] = useState(null);
  const [step, setStep] = useState("lobby");
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [players, setPlayers] = useState([]);
  const [drawer, setDrawer] = useState(null);
  const [isDrawer, setIsDrawer] = useState(false);
  const [wordOptions, setWordOptions] = useState([]);
  const [timer, setTimer] = useState(null);
  const [hint, setHint] = useState("");
  const [toast, setToast] = useState("");
  const [roundMessage, setRoundMessage] = useState(null);
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(3);
  const [myWord, setMyWord] = useState("");

  // ✅ Connect socket
  useEffect(() => {
    const newSocket = io()
    setSocket(newSocket);
    return () => newSocket.disconnect();
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // ✅ Socket listeners
  useEffect(() => {
    if (!socket) return;

    socket.on("updatePlayers", (playerList) => setPlayers(playerList));

    socket.on("drawerSelected", (drawerName) => {
      setDrawer(drawerName);
      setIsDrawer(drawerName === name);
      setMyWord("");
      setHint("");
      setRoundMessage(null);
      if (drawerName !== name) showToast(`${drawerName} is drawing now!`);
    });

    socket.on("wordOptions", (options) => setWordOptions(options));
    socket.on("timerUpdate", (time) => setTimer(time));
    socket.on("hintUpdate", (hintWord) => setHint(hintWord));
    socket.on("yourWord", (word) => setMyWord(word));

    socket.on("wordChosen", (msg) => {
      setHint("");
      showToast(msg);
    });

    socket.on("roundOver", (data) => {
      setRoundMessage(data.message || data);
      setTimer(null);
      setHint("");
      setMyWord("");
      setTimeout(() => setRoundMessage(null), 2500);
    });

    socket.on("updateScores", (playersWithScores) => {
      setPlayers((prev) =>
        prev.map((p) => {
          const updated = playersWithScores.find((u) => u.name === p.name);
          return updated ? { ...p, score: updated.score } : p;
        })
      );
    });

    socket.on("gameState", (data) => {
      setDrawer(data.drawer);
      setIsDrawer(data.drawer === name);
      setHint(data.hint || "");
      setTimer(data.timer || null);
      setPlayers(data.players || []);
      if (data.currentWord && data.drawer === name) setMyWord(data.currentWord);
    });

    return () => {
      socket.off("updatePlayers");
      socket.off("drawerSelected");
      socket.off("wordOptions");
      socket.off("timerUpdate");
      socket.off("wordChosen");
      socket.off("hintUpdate");
      socket.off("yourWord");
      socket.off("roundOver");
      socket.off("updateScores");
      socket.off("gameState");
    };
  }, [socket, name]);

  // ✅ Game actions
  const createRoom = () => {
    if (!name) return showToast("Enter your name");
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    socket.emit("createRoom", { name, roomCode: code });
    setRoom(code);
    setStep("game");
  };

  const joinRoom = () => {
    if (!name || !room) return showToast("Enter name & room");
    socket.emit("joinRoom", { name, roomCode: room });
    setStep("game");
  };

  const startGame = () => {
    if (players.length < 2) return showToast("Need at least 2 players!");
    socket.emit("startGame", { roomCode: room });
  };

  const chooseWord = (word) => {
    socket.emit("chooseWord", { roomCode: room, word });
    setWordOptions([]);
    showToast(`You chose: ${word}`);
  };

  if (!socket) return <div className="text-white text-center mt-10">Connecting...</div>;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900">
      {/* 🟢 Lobby */}
      {step === "lobby" && (
        <div className="p-8 bg-gray-800 rounded-xl shadow-lg w-80 text-center">
          <h1 className="text-3xl font-bold mb-4 text-green-400"> F.R.I.E.N.D.S Skribbl 🎨</h1>
          <input
            className="w-full p-2 mb-3 rounded bg-gray-700 outline-none text-white"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full p-2 mb-3 rounded bg-gray-700 outline-none text-white"
            placeholder="Room code (optional)"
            value={room}
            onChange={(e) => setRoom(e.target.value.toUpperCase())}
          />
          <div className="flex justify-between">
            <button onClick={createRoom} className="bg-green-500 px-3 py-2 rounded hover:bg-green-400 transition">
              Create
            </button>
            <button onClick={joinRoom} className="bg-blue-500 px-3 py-2 rounded hover:bg-blue-400 transition">
              Join
            </button>
          </div>
        </div>
      )}

      {/* 🎮 Game */}
      {step === "game" && (
        <div className="w-full h-screen flex flex-col bg-gray-900 overflow-hidden">
          {/* Header */}
          <header className="w-full text-center py-3 bg-gray-800 text-green-400 font-semibold text-lg shadow-md flex flex-col items-center justify-center">
            <div>
              Room Code: <span className="text-white font-bold">{room}</span>
              <button
                onClick={async () => {
                  const ok = await copyToClipboard(room);
                  if (ok) showToast(`Copied Room Code: ${room}`);
                  else showToast("Copy failed. Long-press to select & copy.");
                }}
                className="ml-3 text-sm bg-green-500 text-white px-2 py-1 rounded hover:bg-green-400 transition"
              >
                Copy
              </button>
            </div>

            {players.length > 1 && (
              <button
                onClick={startGame}
                className="mt-2 bg-yellow-500 hover:bg-yellow-400 px-3 py-1 rounded text-black font-semibold"
              >
                Start Game
              </button>
            )}

            {/* Timer + Word/Hint + Scores */}
            <div className="flex flex-wrap items-center justify-center gap-4 text-white mt-3">
              {timer !== null && (
                <div className="bg-gray-700 px-3 py-1 rounded text-yellow-400 font-semibold">⏱ {timer}s</div>
              )}
              {isDrawer && myWord ? (
                <div className="bg-gray-700 px-3 py-1 rounded text-pink-300 tracking-wider">
                  Your word: <span className="font-bold">{myWord}</span>
                </div>
              ) : hint ? (
                <div className="bg-gray-700 px-3 py-1 rounded text-blue-300 tracking-widest">{hint}</div>
              ) : null}
              {players.length > 0 && (
                <div className="bg-gray-700 px-3 py-1 rounded text-green-400 text-sm">
                  {players.map((p, i) => (
                    <span key={i} className="mx-2">
                      {p.name}: {p.score}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </header>

          {/* Layout */}
          <div className="flex flex-1 flex-col lg:flex-row relative min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 flex items-center justify-center w-full h-full overflow-hidden relative">
              <CanvasBoard socket={socket} isDrawer={isDrawer} color={color} size={size} />
            </div>

            <aside className="w-full lg:w-[350px] bg-gray-800 border-t lg:border-t-0 lg:border-l border-gray-700 shadow-inner flex flex-col flex-none h-[45vh] lg:h-auto">
              <div className="flex-none max-h-32 border-b border-gray-700 overflow-y-auto">
                <PlayerList players={players} drawer={drawer} />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <ChatBox socket={socket} name={name} room={room} />
              </div>
            </aside>

            {/* Word selection modal */}
            <AnimatePresence>
              {isDrawer && wordOptions.length > 0 && (
                <motion.div
                  className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    className="bg-gray-800 p-6 rounded-lg text-center shadow-lg"
                    initial={{ scale: 0.8, y: 50 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.8, y: 50 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h2 className="text-green-400 font-bold text-xl mb-4">Choose a word</h2>
                    <div className="flex gap-4 justify-center flex-wrap">
                      {wordOptions.map((word, i) => (
                        <button
                          key={i}
                          onClick={() => chooseWord(word)}
                          className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded text-white font-semibold"
                        >
                          {word}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Round Over */}
            <AnimatePresence>
              {roundMessage && (
                <motion.div
                  className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    className="bg-gray-800 p-6 rounded-lg text-white text-xl font-semibold"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.8 }}
                  >
                    {roundMessage}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Toolbar (Drawer Only) */}
          <Toolbar socket={socket} color={color} setColor={setColor} size={size} setSize={setSize} isDrawer={isDrawer} />
        </div>
      )}
      <Toast message={toast} onClose={() => setToast("")} />
    </div>
  );
}
