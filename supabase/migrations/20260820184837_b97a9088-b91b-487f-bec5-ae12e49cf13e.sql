-- לוח שנה שנתי — מסלולים, סניפים, אנשים ופריטי יומן

create table public.tracks (
    id uuid primary key default gen_random_uuid(),
    key text not null unique,
    label_he text not null,
    sort_order int not null default 0,
    is_continuous bool not null default false,
    created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.tracks to authenticated;
grant all on public.tracks to service_role;

alter table public.tracks enable row level security;

create policy "Allow authenticated full access to tracks"
    on public.tracks
    for all
    to authenticated
    using (true)
    with check (true);


create table public.branches (
    id uuid primary key default gen_random_uuid(),
    name_he text not null unique,
    created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.branches to authenticated;
grant all on public.branches to service_role;

alter table public.branches enable row level security;

create policy "Allow authenticated full access to branches"
    on public.branches
    for all
    to authenticated
    using (true)
    with check (true);


create table public.people (
    id uuid primary key default gen_random_uuid(),
    name_he text not null unique,
    created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.people to authenticated;
grant all on public.people to service_role;

alter table public.people enable row level security;

create policy "Allow authenticated full access to people"
    on public.people
    for all
    to authenticated
    using (true)
    with check (true);


create table public.calendar_items (
    id uuid primary key default gen_random_uuid(),
    title_he text not null,
    description_he text,
    track_id uuid not null references public.tracks(id) on delete cascade,
    branch_id uuid references public.branches(id) on delete set null,
    person_id uuid references public.people(id) on delete set null,
    availability_state text check (availability_state in ('reserves', 'at_work', 'home')),
    start_date date not null,
    end_date date not null,
    status text not null default 'confirmed' check (status in ('confirmed', 'tentative', 'cancelled')),
    google_event_id text,
    google_etag text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint valid_dates check (start_date <= end_date)
);

grant select, insert, update, delete on public.calendar_items to authenticated;
grant all on public.calendar_items to service_role;

alter table public.calendar_items enable row level security;

create policy "Allow authenticated full access to calendar_items"
    on public.calendar_items
    for all
    to authenticated
    using (true)
    with check (true);


-- ערכי בסיס
insert into public.tracks (key, label_he, sort_order, is_continuous)
values
    ('availability', 'זמינות', 1, true),
    ('holidays', 'חגים ומועדים', 2, true),
    ('branch_events', 'אירועי סניפים', 3, false),
    ('notes', 'הערות', 4, false)
on conflict (key) do nothing;

insert into public.branches (name_he)
values
    ('העמר'),
    ('כרמל ים'),
    ('קיסריה'),
    ('מעגנים')
on conflict (name_he) do nothing;

insert into public.people (name_he)
values
    ('קוסטה')
on conflict (name_he) do nothing;


-- נתוני אוקטובר 2026
with
    t_availability as (select id from public.tracks where key = 'availability'),
    t_holidays as (select id from public.tracks where key = 'holidays'),
    t_branch_events as (select id from public.tracks where key = 'branch_events'),
    b_carmel as (select id from public.branches where name_he = 'כרמל ים'),
    b_kisriya as (select id from public.branches where name_he = 'קיסריה'),
    p_kosta as (select id from public.people where name_he = 'קוסטה')
insert into public.calendar_items (
    title_he, description_he, track_id, branch_id, person_id, availability_state, start_date, end_date, status
)
values
    ('קוסטה מילואים', null, (select id from t_availability), null, (select id from p_kosta), 'reserves', '2026-10-01', '2026-10-08', 'confirmed'),
    ('חייב להיות בעבודה', null, (select id from t_availability), null, (select id from p_kosta), 'at_work', '2026-10-09', '2026-10-25', 'confirmed'),
    ('סוכות', null, (select id from t_holidays), null, null, null, '2026-10-05', '2026-10-12', 'confirmed'),
    ('יום הזיכרון', null, (select id from t_holidays), null, null, null, '2026-10-20', '2026-10-20', 'confirmed'),
    ('כרמל ים', 'חלוקת כלים', (select id from t_branch_events), (select id from b_carmel), null, null, '2026-10-14', '2026-10-14', 'confirmed'),
    ('קיסריה', 'חלוקת כלים', (select id from t_branch_events), (select id from b_kisriya), null, null, '2026-10-16', '2026-10-16', 'confirmed');
