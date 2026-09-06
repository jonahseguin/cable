import { LucideIcon } from 'lucide-react';
import React from 'react';
import { createHash } from 'crypto';
import { put, head } from '@vercel/blob';

type EmailIconProps = {
  className?: string;
  style?: React.CSSProperties;
} & (
  | {
      icon: LucideIcon;
    }
  | {
      svg: React.ReactNode;
      alt: string;
    }
);

export default async function EmailIcon({ className, style, ...props }: EmailIconProps) {
  let svg: string;
  let alt: string;
  let width: string | number | undefined;
  let height: string | number | undefined;

  if (typeof window !== 'undefined') {
    return 'icon' in props ? <props.icon className={className} style={style} /> : props.svg;
  }

  const renderToStaticMarkup = await import('react-dom/server').then(
    (module) => module.renderToStaticMarkup,
  );

  if ('icon' in props) {
    svg = renderToStaticMarkup(<props.icon className={className} style={style} />);
    alt = props.icon.name;
    const Icon = props.icon;
    if (React.isValidElement(Icon)) {
      const props = Icon.props as React.SVGProps<SVGSVGElement>;
      width = props.width;
      height = props.height;
    }
  } else {
    svg = renderToStaticMarkup(props.svg);
    alt = props.alt;

    const Icon = props.svg;
    if (React.isValidElement(Icon)) {
      const props = Icon.props as React.SVGProps<SVGSVGElement>;
      width = props.width;
      height = props.height;
    }
  }

  // compute hash of the svg, will use to avoid re-rendering the same icon with sharp
  const hash = createHash('sha256').update(svg).digest('hex');

  try {
    const blob = await head(`icons/${hash}.png`);
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={blob.url}
        alt={alt}
        className={className}
        style={style}
        width={width}
        height={height}
      />
    );
  } catch {
    // if the blob doesn't exist, we need to upload it
  }

  const convertSvgToPng = await import('@/lib/email-server-utils').then(
    (module) => module.convertSvgToPng,
  );
  const buffer = await convertSvgToPng(svg);
  const blob = await put(`icons/${hash}.png`, buffer, {
    access: 'public',
    addRandomSuffix: false,
  });

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={blob.url}
      alt={alt}
      className={className}
      style={style}
      width={width}
      height={height}
    />
  );
}
