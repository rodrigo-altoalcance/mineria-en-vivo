-- ============================================================
-- MINERÍA EN VIVO — Setup inicial Supabase
-- Ejecutar en: https://supabase.com → SQL Editor
-- ============================================================

-- 1. Tabla de perfiles de usuario
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  full_name       text,
  role            text not null default 'user' check (role in ('user', 'admin')),
  plan            text not null default 'free' check (plan in ('free', 'pro', 'enterprise')),
  plan_expires_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 2. RLS (Row Level Security)
alter table public.profiles enable row level security;

-- Usuarios solo ven su propio perfil
create policy "Usuarios ven su perfil"
  on public.profiles for select
  using (auth.uid() = id);

-- Usuarios pueden actualizar su propio perfil (solo nombre)
create policy "Usuarios actualizan su perfil"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admins ven todos los perfiles
create policy "Admins ven todos"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 3. Función: crear perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

-- 4. Trigger que llama a la función en cada nuevo usuario
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5. Índice para búsquedas por email
create index if not exists profiles_email_idx on public.profiles(email);

-- 6. (Opcional) Hacer admin a un usuario específico:
-- update public.profiles set role = 'admin' where email = 'tu@email.com';
