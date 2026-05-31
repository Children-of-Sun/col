import React, { useState } from 'react';

/**
 * 图标组件，自动处理 SVG → PNG 降级
 * 当 SVG 图标加载失败时，自动尝试替换为 PNG 格式
 */
export const IconWithFallback: React.FC<{
  src: string;
  alt: string;
  style?: React.CSSProperties;
}> = ({ src, alt, style }) => {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [hasError, setHasError] = useState(false);

  const handleError = () => {
    if (!hasError) {
      const pngSrc = src.replace(/\.svg$/i, '.png');
      if (pngSrc !== src) {
        setCurrentSrc(pngSrc);
        setHasError(true);
      }
    }
  };

  return (
    <img
      src={currentSrc}
      alt={alt}
      style={style}
      onError={handleError}
      loading="lazy"
      decoding="async"
    />
  );
};
