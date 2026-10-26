// Static Tailwind recipes. nc-* tokens anchor descendant/state variants; they have no CSS of their own.
const styles: Record<string, string> = {
  "auth-page": [
    "nc-auth-auth-page flex justify-start items-center h-full w-full flex-col [&_.nc-auth-auth-header]:flex",
    "[&_.nc-auth-auth-header]:justify-between [&_.nc-auth-auth-header]:w-full [&_.nc-auth-auth-header]:p-[10px]",
    "[&_.nc-auth-auth-header]:box-border [&_.nc-auth-auth-header]:[animation:slide-in-from-top_ease_0.3s]",
    "[&_.nc-auth-auth-logo]:mt-[10vh] [&_.nc-auth-auth-logo]:[transform:scale(1.4)]",
    "[&_.nc-auth-auth-title]:[font-size:24px] [&_.nc-auth-auth-title]:font-bold",
    "[&_.nc-auth-auth-title]:[line-height:2] [&_.nc-auth-auth-title]:mb-[1vh]",
    "[&_.nc-auth-auth-tips]:[font-size:14px] [&_.nc-auth-auth-input]:[margin:3vh_0]",
    "[&_.nc-auth-auth-input-second]:[margin:0_0_3vh_0] [&_.nc-auth-auth-actions]:flex",
    "[&_.nc-auth-auth-actions]:justify-center [&_.nc-auth-auth-actions]:flex-col",
    "[&_.nc-auth-auth-actions_button:not(:last-child)]:mb-[10px]",
  ].join(" "),
  "auth-header": "nc-auth-auth-header",
  "auth-logo": "nc-auth-auth-logo",
  "auth-title": "nc-auth-auth-title",
  "auth-tips": "nc-auth-auth-tips",
  "auth-input": "nc-auth-auth-input",
  "auth-input-second": "nc-auth-auth-input-second",
  "auth-actions": "nc-auth-auth-actions",
};

export default styles;
