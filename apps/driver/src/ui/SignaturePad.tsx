import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './kit';

/** Firma con el dedo. Devuelve un PNG en base64 (o null si está vacía). */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [inked, setInked] = useState(false);

  const setup = useCallback(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#161a15';
  }, []);

  useEffect(() => {
    setup();
  }, [setup]);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    const ctx = canvas.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#161a15';
    ctx.fill();
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = pos(e);
    const ctx = canvas.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!inked) setInked(true);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setInked(true);
    // fondo blanco para que la imagen se vea igual en cualquier visor
    const c = canvas.current!;
    const out = document.createElement('canvas');
    out.width = c.width;
    out.height = c.height;
    const o = out.getContext('2d')!;
    o.fillStyle = '#fff';
    o.fillRect(0, 0, out.width, out.height);
    o.drawImage(c, 0, 0);
    onChange(out.toDataURL('image/png'));
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setInked(false);
    onChange(null);
  };

  return (
    <div className="col gap8">
      <div className="row between">
        <span className="overline">Firma del cliente</span>
        <button type="button" className="link row gap4 small" onClick={clear}>
          <Icon name="x" size={13} color="var(--ink)" />
          Limpiar
        </button>
      </div>
      <div className="sig">
        <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        <div className="base" />
        {!inked && <div className="hint">Firme aquí con el dedo</div>}
      </div>
    </div>
  );
}
