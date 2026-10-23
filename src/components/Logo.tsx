import { useState } from 'react';

export function Logo({
  src,
  name,
  className = 'logo',
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  return (
    <span className={className} aria-hidden="true">
      <LogoContents key={src ?? ''} src={src} name={name} />
    </span>
  );
}
function LogoContents({ src, name }: { src: string | null; name: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {src && (
        <img
          className="logo-image"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          data-loaded={loaded}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
        />
      )}
      <span className="logo-initials">{name.slice(0, 2).toLocaleUpperCase()}</span>
    </>
  );
}
