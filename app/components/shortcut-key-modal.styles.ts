// Static Tailwind recipes. nc-* tokens anchor descendant/state variants; they have no CSS of their own.
const styles: Record<string, string> = {
  "shortcut-key-container":
    "nc-shortcut-key-modal-shortcut-key-container p-[10px] overflow-y-auto flex flex-col",
  "shortcut-key-grid": [
    "nc-shortcut-key-modal-shortcut-key-grid grid",
    "[grid-template-columns:repeat(auto-fit,_minmax(min(350px,_100%),_1fr))] gap-[16px]",
  ].join(" "),
  "shortcut-key-item": [
    "nc-shortcut-key-modal-shortcut-key-item flex justify-between items-center overflow-hidden p-[10px]",
    "[background-color:var(--white)]",
  ].join(" "),
  "shortcut-key-title":
    "nc-shortcut-key-modal-shortcut-key-title [font-size:14px] [color:var(--black)]",
  "shortcut-key-keys": "nc-shortcut-key-modal-shortcut-key-keys flex gap-[8px]",
  "shortcut-key": [
    "nc-shortcut-key-modal-shortcut-key flex items-center justify-center [border:var(--border-in-light)]",
    "rounded-[8px] p-[4px] [background-color:var(--gray)] min-w-[32px] [&_span]:[font-size:12px]",
    "[&_span]:[color:var(--black)]",
  ].join(" "),
};

export default styles;
