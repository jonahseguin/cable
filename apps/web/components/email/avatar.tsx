import * as React from 'react';
import { cn } from '@[removed]/ui/lib/utils';

export interface EmailAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: number;
}

export function EmailAvatar({
  src,
  alt,
  fallback,
  size = 40,
  className,
  ...props
}: EmailAvatarProps) {
  return (
    <div
      className={cn(
        'border-border/20 relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border',
        className,
      )}
      style={{ width: size, height: size }}
      {...props}
    >
      {src ? (
        <img src={src} alt={alt} className="aspect-square h-full w-full object-cover" />
      ) : (
        <div className="bg-primary/10 text-primary flex h-full w-full items-center justify-center">
          {fallback}
        </div>
      )}
    </div>
  );
}
