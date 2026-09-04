INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'owner'::public.app_role
FROM auth.users u
WHERE lower(u.email) IN ('amirstoler@gmail.com', 'korinpeer7711@gmail.com', 'costakob@gmail.com', 'betrey@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;