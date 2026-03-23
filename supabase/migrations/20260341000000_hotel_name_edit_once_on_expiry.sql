alter table public.hotels
add column if not exists hotel_name_edit_used boolean not null default false;

comment on column public.hotels.hotel_name_edit_used is
'Tracks whether a hotel has already used its one-time hotel-name edit while permit is expired.';
