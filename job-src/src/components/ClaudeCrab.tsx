/** The pixelated Claude Code lobster, as a tiny inline SVG (fills currentColor). */
export function ClaudeCrab({ className }: { className?: string }) {
  const px: [number, number][] = [
    // claw tips
    [2, 0], [8, 0],
    // claws
    [1, 1], [2, 1], [3, 1], [7, 1], [8, 1], [9, 1],
    // arms
    [2, 2], [8, 2],
    // body
    [3, 3], [4, 3], [5, 3], [6, 3], [7, 3],
    [2, 4], [3, 4], [5, 4], [7, 4], [8, 4], // gaps at (4,4)/(6,4) = eyes
    [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5],
    [3, 6], [4, 6], [5, 6], [6, 6], [7, 6],
    // legs
    [1, 7], [3, 7], [7, 7], [9, 7],
  ]
  return (
    <svg viewBox="0 0 11 8.5" className={className} aria-hidden="true">
      {px.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="1.02" height="1.02" fill="currentColor" />
      ))}
    </svg>
  )
}
