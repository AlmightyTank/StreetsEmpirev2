/**
 * The supporter mark on a Signature Profile Card nameplate. It is part of the
 * card, so callers show it only while the card frame is equipped.
 */
export function SupporterMark() {
  return <img className="se-supporter-mark" src="/profile-frames/midnight-chrome-mark.svg" alt="Supporter" title="Supporter" draggable={false} />;
}

/** Name text ending in the supporter mark. The last word and the mark never split across two lines. */
export function NameWithSupporterMark({ text }: { text: string }) {
  const cut = text.trimEnd().lastIndexOf(' ') + 1;
  return <>{text.slice(0, cut)}<span className="se-supporter-nameend">{text.slice(cut)}<SupporterMark /></span></>;
}
