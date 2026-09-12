import { useEffect, useState } from 'react';

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 80);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-14 right-2 z-50 w-7 h-7 rounded-full bg-blueStrong text-white flex items-center justify-center shadow-md hover:opacity-80 transition-opacity"
      aria-label="Scroll to top"
    >
      ↑
    </button>
  );
}
