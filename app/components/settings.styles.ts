// Static Tailwind recipes. nc-* tokens anchor descendant/state variants; they have no CSS of their own.
const styles: Record<string, string> = {
  settings: [
    "nc-settings-settings p-[20px] overflow-auto [&_.nc-settings-modelSelect]:w-auto",
    "[&_.nc-settings-modelSelect]:min-w-0",
  ].join(" "),
  modelSelect: "nc-settings-modelSelect",
  compressThresholdInput:
    "nc-settings-compressThresholdInput w-[140px] max-w-[40vw]",
  sendKeyActions: [
    "nc-settings-sendKeyActions inline-flex items-center gap-[2px] [&_.nc-settings-sendKeyInfo]:p-[3px]",
    "[&_.nc-settings-sendKeyInfo]:[flex-shrink:0] [&_.nc-settings-sendKeyInfo]:[align-self:center]",
  ].join(" "),
  sendKeyInfo: "nc-settings-sendKeyInfo",
  avatar: "nc-settings-avatar cursor-pointer relative [z-index:1]",
  "edit-prompt-modal": [
    "nc-settings-edit-prompt-modal flex flex-col [&_.nc-settings-edit-prompt-title]:max-w-[unset]",
    "[&_.nc-settings-edit-prompt-title]:mb-[20px] [&_.nc-settings-edit-prompt-title]:text-left",
    "[&_.nc-settings-edit-prompt-content]:max-w-[unset]",
  ].join(" "),
  "edit-prompt-title": "nc-settings-edit-prompt-title",
  "edit-prompt-content": "nc-settings-edit-prompt-content",
  "user-prompt-modal": [
    "nc-settings-user-prompt-modal min-h-[40vh] [&_.nc-settings-user-prompt-search]:w-full",
    "[&_.nc-settings-user-prompt-search]:max-w-full [&_.nc-settings-user-prompt-search]:mb-[10px]",
    "[&_.nc-settings-user-prompt-search]:[background-color:var(--gray)]",
    "[&_.nc-settings-user-prompt-list]:[border:var(--border-in-light)]",
    "[&_.nc-settings-user-prompt-list]:rounded-[10px]",
    "[&_.nc-settings-user-prompt-list_.nc-settings-user-prompt-item]:flex",
    "[&_.nc-settings-user-prompt-list_.nc-settings-user-prompt-item]:justify-between",
    "[&_.nc-settings-user-prompt-list_.nc-settings-user-prompt-item]:p-[10px]",
    "[&_.nc-settings-user-prompt-list_.nc-settings-user-prompt-item:not(:last-child)]:[border-bottom:var(--border-in-light)]",
    "[&_.nc-settings-user-prompt-list_.nc-settings-user-prompt-item_.nc-settings-user-prompt-header]:max-w-[calc(100%_-_100px)]",
    "[&_.nc-settings-user-prompt-list_.nc-settings-user-prompt-item_.nc-settings-user-prompt-header_.nc-settings-user-prompt-title]:[font-size:14px]",
    "[&_.nc-settings-user-prompt-list_.nc-settings-user-prompt-item_.nc-settings-user-prompt-header_.nc-settings-user-prompt-title]:[line-height:2]",
    "[&_.nc-settings-user-prompt-list_.nc-settings-user-prompt-item_.nc-settings-user-prompt-header_.nc-settings-user-prompt-title]:font-bold",
    "[&_.nc-settings-user-prompt-list_.nc-settings-user-prompt-item_.nc-settings-user-prompt-header_.nc-settings-user-prompt-content]:[font-size:12px]",
    "[&_.nc-settings-user-prompt-list_.nc-settings-user-prompt-item_.nc-settings-user-prompt-buttons]:flex",
    "[&_.nc-settings-user-prompt-list_.nc-settings-user-prompt-item_.nc-settings-user-prompt-buttons]:items-center",
    "[&_.nc-settings-user-prompt-list_.nc-settings-user-prompt-item_.nc-settings-user-prompt-buttons]:gap-x-[2px]",
    "[&_.nc-settings-user-prompt-list_.nc-settings-user-prompt-item_.nc-settings-user-prompt-buttons_.nc-settings-user-prompt-button]:p-[7px]",
  ].join(" "),
  "user-prompt-search": "nc-settings-user-prompt-search",
  "user-prompt-list": "nc-settings-user-prompt-list",
  "user-prompt-item": "nc-settings-user-prompt-item",
  "user-prompt-header": "nc-settings-user-prompt-header",
  "user-prompt-title": "nc-settings-user-prompt-title",
  "user-prompt-content": "nc-settings-user-prompt-content",
  "user-prompt-buttons": "nc-settings-user-prompt-buttons",
  "user-prompt-button": "nc-settings-user-prompt-button",
};

export default styles;
