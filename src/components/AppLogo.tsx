import { useAppLogo } from "@/hooks/useAppLogo";

interface AppLogoProps {
  size?: "sm" | "lg";
}

const AppLogo = ({ size = "sm" }: AppLogoProps) => {
  const imgClass = size === "lg" ? "h-32 w-auto" : "h-10 w-auto";
  const { logoUrl } = useAppLogo();

  return (
    <img
      src={logoUrl}
      alt="אולפן ומגמת המוסיקה חוף הכרמל"
      className={`${imgClass} object-contain`}
    />
  );
};

export default AppLogo;
