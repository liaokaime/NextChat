// Static Tailwind recipes. nc-* tokens anchor descendant/state variants; they have no CSS of their own.
const styles: Record<string, string> = {
  "select-compress-model":
    "nc-model-config-select-compress-model w-[60%] [&_select]:max-w-full [&_select]:[white-space:normal]",
};

export default styles;
