interface AppLogoProps {
  size?: "sm" | "lg";
}

const AppLogo = ({ size = "sm" }: AppLogoProps) => {
  const imgClass = size === "lg" ? "h-32 w-auto" : "h-10 w-auto";

  return (
    <img
      src="/logo.png"
      alt="אולפן ומגמת המוסיקה חוף הכרמל"
      className={`${imgClass} object-contain`}
    />
  );
};

export default AppLogo;
