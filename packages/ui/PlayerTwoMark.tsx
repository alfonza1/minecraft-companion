import React from 'react';

export default function PlayerTwoMark({ size = 26 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><path d="M2 5h11l3 3v9l-3 3H6v7H2V5Zm4 4v7h6V9H6Z" fill="currentColor" fillRule="evenodd"/><path d="M19 5h8l3 3v8l-7 7h7v4H18v-6l8-8V9h-7V5Z" fill="var(--wp-mint, #79b8ff)"/></svg>;
}
