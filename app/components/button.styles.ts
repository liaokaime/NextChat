// Static Tailwind recipes. nc-* tokens anchor descendant/state variants; they have no CSS of their own.
const styles: Record<string, string> = {
  "icon-button": [
    "nc-button-icon-button [background-color:var(--white)] rounded-[10px] flex items-center justify-center",
    "p-[10px] cursor-pointer [transition:all_0.3s_ease] overflow-hidden select-none outline-none",
    "[&:not(.nc-button-border)]:[border:none] [color:var(--black)] [&[disabled]]:cursor-not-allowed",
    "[&[disabled]]:[opacity:0.5] [&.nc-button-primary]:[background-color:var(--primary)]",
    "[&.nc-button-primary]:[color:white] [&.nc-button-primary_path]:[fill:white]!",
    "[&.nc-button-danger]:[color:rgba(255,_0,_0,_0.8)] [&.nc-button-danger]:[border-color:rgba(255,_0,_0,_0.5)]",
    "[&.nc-button-danger]:[background-color:rgba(255,_0,_0,_0.05)]",
    "[&.nc-button-danger:hover]:[border-color:red]",
    "[&.nc-button-danger:hover]:[background-color:rgba(255,_0,_0,_0.1)] [&.nc-button-danger_path]:[fill:red]!",
    "[&:hover]:[border-color:var(--primary)] [&:focus]:[border-color:var(--primary)]",
    "[@media_only_screen_and_(max-width:_600px)]:p-[16px]",
  ].join(" "),
  primary: "nc-button-primary",
  danger: "nc-button-danger",
  shadow: "nc-button-shadow [box-shadow:var(--card-shadow)]",
  border: "nc-button-border [border:var(--border-in-light)]",
  "icon-button-icon":
    "nc-button-icon-button-icon w-[16px] h-[16px] flex justify-center items-center",
  "icon-button-text": [
    "nc-button-icon-button-text [font-size:12px] overflow-hidden text-ellipsis whitespace-nowrap",
    "[&:not(:first-child)]:ml-[5px]",
  ].join(" "),
};

export default styles;
