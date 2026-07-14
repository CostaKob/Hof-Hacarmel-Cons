import { Helmet } from "react-helmet-async";

interface PageTitleProps {
  title: string;
  suffix?: string;
}

export const PageTitle = ({ title, suffix = "אולפן המוסיקה חוף הכרמל" }: PageTitleProps) => {
  return (
    <Helmet>
      <title>{suffix ? `${title} — ${suffix}` : title}</title>
    </Helmet>
  );
};

export default PageTitle;
