const AV = ["#d9381e", "#2347c5", "#f2b705", "#1b7f5c", "#7a3fb0", "#e0607e"];

export function AvatarStack({ n = 5, size = 24, extra }: { n?: number; size?: number; extra?: string }) {
  return (
    <div className="flex items-center" aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <span
          key={i}
          className="border-paper text-paper grid place-items-center rounded-full border-2 font-sans text-[9px] font-black"
          style={{
            width: size,
            height: size,
            marginLeft: i ? -size * 0.32 : 0,
            background: AV[i % AV.length],
            zIndex: n - i,
          }}
        >
          {String.fromCharCode(65 + ((i * 7 + 3) % 26))}
        </span>
      ))}
      {extra && <span className="text-ink-2 ml-2 font-mono text-[11px] font-medium">{extra}</span>}
    </div>
  );
}
