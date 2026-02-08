-- Run this in Supabase Dashboard → SQL Editor to enable auth roles and storage.

-- 1. Profiles table (stores role per user; referenced by auth.js)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  role text not null default 'user' check (role in ('user', 'admin'))
);

-- Allow users to read/update their own profile; service role can manage all
alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Allow insert for new signups (anon can insert with id = auth.uid() from trigger or app)
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 2. Auto-create profile on signup (optional but recommended)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Orders table for storing user orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  items jsonb not null,
  total numeric(10,2) not null,
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "Users view own orders"
  on public.orders for select
  using (auth.uid() = user_id);

create policy "Users insert own orders"
  on public.orders for insert
  with check (auth.uid() = user_id);

create policy "Admins view all orders"
  on public.orders for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- 4. Storage bucket for uploads (e.g. avatars) – run in Dashboard → Storage if needed
-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
-- create policy "Public read" on storage.objects for select using (bucket_id = 'avatars');
-- create policy "Users upload own" on storage.objects for insert with check (auth.uid()::text = (storage.foldername(name))[1]);
