let scrollLocks = 0;

let originalOverflow = "";

export function lockBodyScroll() {
  if (scrollLocks++ === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  return () => {
    if (--scrollLocks === 0) document.body.style.overflow = originalOverflow;
  };
}
