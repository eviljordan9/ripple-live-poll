import { useMemo } from "react";
import { encode } from "uqr";
import { cn } from "@/lib/utils";

export function QrMark({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const qr = useMemo(() => encode(value, { ecc: "M", border: 2 }), [value]);
  const path = useMemo(() => {
    let d = "";
    for (let y = 0; y < qr.size; y += 1) {
      for (let x = 0; x < qr.size; x += 1) {
        if (qr.data[y][x]) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return d;
  }, [qr]);

  return (
    <svg
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      className={cn("size-full", className)}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label ?? "QR code"}
    >
      <rect width={qr.size} height={qr.size} className="fill-fg" />
      <path d={path} className="fill-bg" />
    </svg>
  );
}
