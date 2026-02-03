import { useRef, useEffect, useState, useCallback } from 'react';
import { Eraser, X, Check } from 'lucide-react';

export default function SignaturePad({ onSave, onCancel }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  /* ── Setup canvas with high-DPI scaling ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Fill white/surface background so export isn't transparent
    const bg = getComputedStyle(canvas).backgroundColor;
    ctx.fillStyle = bg || '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    // Stroke color from CSS custom property
    const primary = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-primary').trim();
    ctx.strokeStyle = primary || '#1a1a1a';
    ctxRef.current = ctx;
  }, []);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = e.touches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = useCallback((e) => {
    e.preventDefault();
    drawing.current = true;
    const { x, y } = getPos(e);
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(x, y);
  }, []);

  const draw = useCallback((e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    ctxRef.current.lineTo(x, y);
    ctxRef.current.stroke();
    if (!hasStrokes) setHasStrokes(true);
  }, [hasStrokes]);

  const endDraw = useCallback((e) => {
    if (!drawing.current) return;
    e.preventDefault();
    drawing.current = false;
    ctxRef.current.closePath();
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const bg = getComputedStyle(canvas).backgroundColor;
    ctx.fillStyle = bg || '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    const primary = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-primary').trim();
    ctx.strokeStyle = primary || '#1a1a1a';
    setHasStrokes(false);
  };

  const handleAccept = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-tertiary text-center">Sign below using your finger or mouse</p>
      <canvas
        ref={canvasRef}
        className="w-full h-48 rounded-lg border border-border-strong bg-white dark:bg-surface-alt cursor-crosshair touch-none"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="flex items-center gap-3 justify-end">
        <button
          type="button"
          onClick={clearCanvas}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
        >
          <Eraser size={14} />
          Clear
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
        >
          <X size={14} />
          Cancel
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={!hasStrokes}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={14} />
          Accept
        </button>
      </div>
    </div>
  );
}
