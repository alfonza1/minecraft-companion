import React from 'react';

export default function WaypointMark({ size = 26 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><path d="M3 8h7l6 16 6-16h7L19 30h-6Z" fill="currentColor"/><path d="m16 2 4 7-4 7-4-7Z" fill="#68d4cc"/></svg>;
}

