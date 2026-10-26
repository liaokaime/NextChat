// Static Tailwind recipes. nc-* tokens anchor descendant/state variants; they have no CSS of their own.
const styles: Record<string, string> = {
  "input-range": [
    "nc-input-range-input-range [border:var(--border-in-light)] rounded-[10px] [padding:5px_10px_5px_10px]",
    "[font-size:12px] flex justify-between max-w-[40%] [&_input[type=range]]:max-w-[calc(100%_-_34px)]",
  ].join(" "),
};

export default styles;
