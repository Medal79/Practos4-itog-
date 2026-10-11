import { useState, useEffect } from 'react';

/**
 * Картинка с запасным вариантом: если ссылки нет или она не загрузилась,
 * вместо картинки показывается аккуратная заглушка.
 */
function Img({ src, alt, className = '', fallback = '📦' }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className={`img-fallback ${className}`} role="img" aria-label={alt}>
        {fallback}
      </div>
    );
  }
  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} />;
}

export default Img;
