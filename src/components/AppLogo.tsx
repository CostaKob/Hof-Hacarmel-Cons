interface AppLogoProps {
  size?: "sm" | "lg";
  showTitle?: boolean;
}

const AppLogo = ({ size = "sm", showTitle = true }: AppLogoProps) => {
  const imgClass = size === "lg" ? "h-28 w-auto" : "h-10 w-auto";

  return (
    <div className={`flex items-center ${size === "lg" ? "flex-col gap-3" : "gap-2"}`}>
      <img
        src="/logo.png"
        alt="אולפן ומגמת המוסיקה חוף הכרמל"
        className={`${imgClass} object-contain`}
      />
      {showTitle && (
        <span className={size === "lg" ? "text-lg font-bold text-foreground text-center" : "text-sm font-semibold text-primary-foreground leading-tight"}>
          אולפן ומגמת המוסיקה
          {size === "lg" && <br />}
          {size === "lg" ? "חוף הכרמל" : ""}
        </span>
      )}
    </div>
  );
};

export default AppLogo;
