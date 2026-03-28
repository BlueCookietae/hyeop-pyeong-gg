'use client';

export default function SafeImg({ src, className, alt }: { src: string; className?: string; alt?: string }) {
  return (
    <img
      src={src}
      className={className}
      alt={alt ?? ''}
      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}
