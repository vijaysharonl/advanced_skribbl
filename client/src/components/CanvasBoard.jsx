import { useEffect, useRef, useState } from "react";

export default function CanvasBoard({ socket, isDrawer, color, size }) {
  const canvasRef = useRef(null);
  const cursorRef = useRef(null);
  const [drawing, setDrawing] = useState(false);

  // Keep the authoritative stroke list locally (drawer only draws, so this is safe)
  const [strokes, setStrokes] = useState([]);

  const preserveDrawing = useRef(true);
  const scaleRef = useRef(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const drawStroke = ({ x1, y1, x2, y2, color, size }) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    const redrawAll = (allStrokes) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of allStrokes) drawStroke(s);
    };

    const clearCanvas = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      const scale = window.devicePixelRatio || 1;
      scaleRef.current = scale;

      const width = parent.clientWidth;
      const height = Math.min(parent.clientHeight * 0.85, 500);

      // snapshot (optional)
      const imageData =
        preserveDrawing.current ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;

      canvas.width = width * scale;
      canvas.height = height * scale;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      // Prefer a clean redraw from strokes for correctness:
      if (strokes.length) {
        redrawAll(strokes);
      } else if (imageData && preserveDrawing.current) {
        ctx.putImageData(imageData, 0, 0);
      }
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // ----- SOCKET LISTENERS -----

    // incremental draw from other clients
    const onDraw = (stroke) => {
      drawStroke(stroke);
      // keep local list accurate even if this client is not the drawer (e.g., reconnect edge cases)
      setStrokes((prev) => [...prev, stroke]);
    };

    // full sync for a newly joined player
    const onSync = (arr) => {
      setStrokes(arr || []);
      redrawAll(arr || []);
    };

    // undo broadcast -> redraw exactly what server says
    const onUndo = (arr) => {
      setStrokes(arr || []);
      redrawAll(arr || []);
    };

    const onClear = () => {
      setStrokes([]);
      clearCanvas();
    };

    const onRoundOver = () => {
      setStrokes([]);
      clearCanvas();
    };

    socket.on("draw", onDraw);
    socket.on("syncStrokes", onSync);
    socket.on("undoStroke", onUndo);
    socket.on("clearCanvas", onClear);
    socket.on("roundOver", onRoundOver);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      socket.off("draw", onDraw);
      socket.off("syncStrokes", onSync);
      socket.off("undoStroke", onUndo);
      socket.off("clearCanvas", onClear);
      socket.off("roundOver", onRoundOver);
    };
    // include strokes in deps only for resize redraw; main listeners shouldn’t re-register
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, /* do not add strokes here to avoid re-binding listeners */]);

  // Proper coordinate normalization for mouse/touch with devicePixelRatio
  const getCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = scaleRef.current;

    // scale page coords to canvas pixels
    const toCanvas = (clientX, clientY) => ({
      offsetX: ((clientX - rect.left) * canvasRef.current.width) / rect.width / scale,
      offsetY: ((clientY - rect.top) * canvasRef.current.height) / rect.height / scale,
    });

    if (e.touches && e.touches[0]) {
      return toCanvas(e.touches[0].clientX, e.touches[0].clientY);
    }
    // mouse events have offsetX/offsetY already in CSS pixels; convert precisely:
    return toCanvas(e.clientX, e.clientY);
  };

  const startDraw = (e) => {
    if (!isDrawer) return;
    e.preventDefault();
    setDrawing(true);
    const { offsetX, offsetY } = getCoords(e.nativeEvent || e);
    canvasRef.current.lastX = offsetX;
    canvasRef.current.lastY = offsetY;
  };

  const draw = (e) => {
    if (!drawing || !isDrawer) return;
    e.preventDefault();

    const { offsetX, offsetY } = getCoords(e.nativeEvent || e);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const stroke = {
      x1: canvas.lastX,
      y1: canvas.lastY,
      x2: offsetX,
      y2: offsetY,
      color,
      size,
    };

    // local render
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.moveTo(stroke.x1, stroke.y1);
    ctx.lineTo(stroke.x2, stroke.y2);
    ctx.stroke();

    // update local list (needed for Undo)
    setStrokes((prev) => [...prev, stroke]);

    // send to others
    socket.emit("draw", stroke);

    canvas.lastX = offsetX;
    canvas.lastY = offsetY;
  };

  const stopDraw = (e) => {
    if (!isDrawer) return;
    e.preventDefault();
    setDrawing(false);
  };

  // 🔙 UNDO (drawer only)
  const undoLastStroke = () => {
    if (!isDrawer || strokes.length === 0) return;
    const updated = strokes.slice(0, -1);

    // Optimistic local redraw
    setStrokes(updated);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // redraw locally
    for (const s of updated) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }

    // tell server to broadcast the authoritative list
    socket.emit("undoStroke", updated);
  };

  // Brush cursor (visual only)
  const updateCursor = (e) => {
    const cursor = cursorRef.current;
    if (!cursor) return;
    const rect = canvasRef.current.getBoundingClientRect();

    let x, y;
    if (e.touches && e.touches[0]) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    cursor.style.left = `${x - size / 2}px`;
    cursor.style.top = `${y - size / 2}px`;
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="bg-white rounded-lg border border-gray-600 shadow-lg w-full h-full touch-none"
        onMouseDown={startDraw}
        onMouseMove={(e) => { updateCursor(e); draw(e); }}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={(e) => { updateCursor(e); draw(e); }}
        onTouchEnd={stopDraw}
      />

      {/* Undo Button (drawer only) */}
      {isDrawer && (
        <button
          onClick={undoLastStroke}
          className="absolute top-3 right-3 bg-red-500 hover:bg-red-400 text-white px-3 py-1 rounded shadow-lg text-sm font-semibold"
          title="Undo last stroke"
        >
          Undo
        </button>
      )}

      {/* Brush Cursor */}
      {isDrawer && (
        <div
          ref={cursorRef}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: `${size}px`,
            height: `${size}px`,
            backgroundColor: color + "80",
            border: `1px solid ${color}`,
            transform: "translate(-50%, -50%)",
          }}
        />
      )}
    </div>
  );
}
