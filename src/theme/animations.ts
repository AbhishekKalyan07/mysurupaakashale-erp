export const animations = {
  transition: {
    base: '150ms ease-in-out',
    sidebar: '250ms ease-in-out',
    fade: '400ms ease-in-out',
  },
  motion: {
    pageFade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.4 } },
    heroSlideUp: { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: 'easeOut' } },
    cardStagger: { initial: { opacity: 0, y: 15 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4 } },
    hoverScale: { scale: 1.02, transition: { duration: 0.2 } },
  },
};
