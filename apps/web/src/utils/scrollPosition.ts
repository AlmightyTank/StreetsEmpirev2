export function restoreScrollPosition(top: number): void {
  // Casino result panels can change height after the state update commits.
  let frames = 0;
  const restore = () => {
    window.scrollTo({ top, left: window.scrollX, behavior: 'auto' });
    if (frames++ < 2) window.requestAnimationFrame(restore);
  };
  window.requestAnimationFrame(restore);
}

export function preserveScrollDuring(update: () => void): void {
  const top = window.scrollY;
  update();
  restoreScrollPosition(top);
}
