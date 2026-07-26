-- Run this in the Supabase SQL Editor

create table if not exists public.favoritos (
  id                  uuid        default gen_random_uuid() primary key,
  user_id             uuid        references auth.users(id) on delete cascade not null,
  numero_rol          text        not null,
  dv_rol              text,
  nombre              text,
  tipo_concesion      text,
  situacion_concesion text,
  titular_nombre      text,
  comuna              text,
  created_at          timestamptz default now() not null,
  unique(user_id, numero_rol)
);

alter table public.favoritos enable row level security;

create policy "Users manage own favoritos"
  on public.favoritos for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
