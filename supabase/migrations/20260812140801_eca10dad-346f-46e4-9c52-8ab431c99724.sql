REVOKE EXECUTE ON FUNCTION public.create_notification(text, text, text, text, uuid, uuid) FROM anon, authenticated;

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;