import { cn } from "@/lib/utils";

interface FamilyIconProps {
  className?: string;
}

export const FamilyIcon = ({ className }: FamilyIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("lucide", className)}
  >
    {/* left adult */}
    <circle cx="8" cy="7" r="2.5" />
    <path d="M4 21v-5c0-2 2-3 4-3s4 1 4 3v5" />
    {/* right adult */}
    <circle cx="16" cy="7" r="2.5" />
    <path d="M12 21v-5c0-2 2-3 4-3s4 1 4 3v5" />
    {/* child in front */}
    <circle cx="12" cy="13" r="2" />
    <path d="M9 21v-3c0-1.5 1.5-2 3-2s3 .5 3 2v3" />
  </svg>
);

export default FamilyIcon;
