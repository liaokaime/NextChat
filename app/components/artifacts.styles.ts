// Static Tailwind recipes. nc-* tokens anchor descendant/state variants; they have no CSS of their own.
const styles: Record<string, string> = {
  artifacts: "nc-artifacts-artifacts flex w-full h-full flex-col",
  "artifacts-iframe": [
    "nc-artifacts-artifacts-iframe w-full [border:var(--border-in-light)] rounded-[6px]",
    "[background-color:var(--gray)]",
  ].join(" "),
  "artifacts-header":
    "nc-artifacts-artifacts-header flex items-center h-[36px] p-[20px] [background:var(--second)]",
  "artifacts-title":
    "nc-artifacts-artifacts-title [flex:1] text-center font-bold [font-size:24px]",
  "artifacts-content":
    "nc-artifacts-artifacts-content [flex-grow:1] [padding:0_20px_20px_20px] [background-color:var(--second)]",
};

export default styles;
