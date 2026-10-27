import { useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import "./Art.css";

/**
 * A picture that fades in once it has loaded (M385), over the empty tone of the box it sits in.
 *
 * Until the image has loaded it is not drawn (`opacity: 0`), so a slow picture never swaps in hard
 * and a half-decoded one never shows; once loaded it carries `data-loaded`, which the fade keys on
 * (motion on) or which simply shows it (motion off). A picture already in the cache when it mounts
 * counts as loaded at once. A new `src` starts over. One component for every artwork: the Library
 * cell, Track details, Clean's candidate covers and Discover's cards.
 */
export function Art({ className = "", src, onLoad, alt = "", ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState<string | undefined>(undefined);

  // A cached picture can finish before React listens for `load`: read it off the element.
  useLayoutEffect(() => {
    const image = ref.current;
    if (image && image.complete && image.naturalWidth > 0) setLoaded(src);
  }, [src]);

  const shown = loaded !== undefined && loaded === src;

  return (
    <img
      {...rest}
      ref={ref}
      src={src}
      alt={alt}
      className={`cp-art ${className}`.trim()}
      data-loaded={shown ? "" : undefined}
      onLoad={(event) => {
        setLoaded(src);
        onLoad?.(event);
      }}
    />
  );
}
