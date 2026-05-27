CREATE OR REPLACE FUNCTION public.admin_sync_email_identity(_user_id uuid, _new_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.identities
  SET identity_data = jsonb_set(
        jsonb_set(identity_data, '{email}', to_jsonb(_new_email)),
        '{email_verified}', 'true'::jsonb
      ),
      updated_at = now()
  WHERE user_id = _user_id AND provider = 'email';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sync_email_identity(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sync_email_identity(uuid, text) TO service_role;