import { Helmet } from "react-helmet-async";

interface PageTitleProps {
  title: string;
  suffix?: string;
}

export const PageTitle = ({ title, suffix = "אולפן המוסיקה חוף הכרמל" }: PageTitleProps) => {
  return (
    <Helmet>
      <title>{`${title} — ${suffix}`}</title>
    </Helmet>
  );
};

export default PageTitle;
