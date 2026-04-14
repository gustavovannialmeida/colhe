-- ============================================================
-- Colhe — Patch v2
-- Rodar no SQL Editor do projeto colhe no Supabase
-- ============================================================

-- ── 1. Corrigir RLS de produtos (sellers também gerenciam) ──
drop policy if exists "admin_manage_products" on products;
drop policy if exists "auth_read_products"    on products;

create policy "auth_manage_products" on products
  for all
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ── 2. Tabela: catálogo de tratamentos TSI ───────────────────
create table if not exists tsi_catalog (
  id         serial primary key,
  name       text not null unique,
  category   text,                -- Ex: Fungicida, Inseticida, Inoculante, Micronutriente
  unit       text not null default 'L',
  base_cost  numeric(12,4),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

insert into tsi_catalog (name, category, unit) values
  ('Carboxina + Thiram',    'Fungicida',      'L'),
  ('Fludioxonil + Metalaxil-M', 'Fungicida',  'L'),
  ('Thiabendazol + Thiram', 'Fungicida',      'L'),
  ('Imidacloprido + Tiodicarbe', 'Inseticida','L'),
  ('Clotianidina',          'Inseticida',     'L'),
  ('Bradyrhizobium sp.',    'Inoculante',     'doses'),
  ('Azospirillum brasilense','Inoculante',    'doses'),
  ('Cobalto + Molibdênio',  'Micronutriente', 'L'),
  ('Zinco',                 'Micronutriente', 'L'),
  ('Polímero de revestimento','Outros',       'L')
on conflict (name) do nothing;

-- ── 3. Tabela: TSI por item de cotação ───────────────────────
create table if not exists quotation_item_tsi (
  id               uuid primary key default uuid_generate_v4(),
  quotation_item_id uuid not null references quotation_items(id) on delete cascade,
  tsi_name         text not null,
  quantity         numeric(12,4) not null default 1,
  unit             text not null default 'L',
  unit_cost        numeric(12,4) not null default 0,
  unit_price       numeric(12,4) not null default 0,
  created_at       timestamptz not null default now()
);

alter table quotation_item_tsi enable row level security;

create policy "tsi_follow_item" on quotation_item_tsi
  for all using (
    exists (
      select 1
      from quotation_items qi
      join quotations q on q.id = qi.quotation_id
      where qi.id = quotation_item_id
        and (q.seller_id = auth.uid()
             or exists (select 1 from sellers where id = auth.uid() and role = 'admin'))
    )
  );

-- ── 4. RLS catálogo TSI (leitura para todos autenticados) ────
alter table tsi_catalog enable row level security;

create policy "auth_read_tsi_catalog" on tsi_catalog
  for select using (auth.uid() is not null);

create policy "auth_manage_tsi_catalog" on tsi_catalog
  for all
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ── 5. Atualizar view v_quotation_summary com TSI ────────────
create or replace view v_quotation_summary as
select
  q.id,
  q.code,
  q.status,
  q.created_at,
  q.closed_at,
  q.sent_at,
  q.freight,
  q.commission_pct,
  q.notes,
  q.lost_notes,
  q.seller_id,
  c.name                          as client_name,
  c.city,
  c.state,
  s.name                          as seller_name,
  lr.label                        as lost_reason,
  count(distinct qi.id)           as item_count,
  -- Receita: itens + TSI
  coalesce(sum(qi.quantity * qi.final_price), 0)
  + coalesce((
      select sum(t.quantity * t.unit_price)
      from quotation_item_tsi t
      join quotation_items qi2 on qi2.id = t.quotation_item_id
      where qi2.quotation_id = q.id
    ), 0)                         as total_revenue,
  -- Custo: itens + TSI
  coalesce(sum(qi.quantity * qi.unit_cost), 0)
  + coalesce((
      select sum(t.quantity * t.unit_cost)
      from quotation_item_tsi t
      join quotation_items qi2 on qi2.id = t.quotation_item_id
      where qi2.quotation_id = q.id
    ), 0)                         as total_cost,
  -- Margem bruta
  case
    when coalesce(sum(qi.quantity * qi.final_price), 0)
       + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0) = 0
    then 0
    else round((
      (coalesce(sum(qi.quantity * qi.final_price), 0) + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0))
      - (coalesce(sum(qi.quantity * qi.unit_cost), 0) + coalesce((select sum(t.quantity * t.unit_cost) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0))
    ) / (
      coalesce(sum(qi.quantity * qi.final_price), 0) + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0)
    ) * 100, 2)
  end                             as gross_margin_pct,
  -- Margem líquida
  case
    when coalesce(sum(qi.quantity * qi.final_price), 0)
       + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0) = 0
    then 0
    else round((
      (coalesce(sum(qi.quantity * qi.final_price), 0) + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0))
      - (coalesce(sum(qi.quantity * qi.unit_cost), 0) + coalesce((select sum(t.quantity * t.unit_cost) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0))
      - coalesce(q.freight, 0)
      - (coalesce(sum(qi.quantity * qi.final_price), 0) + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0)) * coalesce(q.commission_pct, 0) / 100
    ) / (
      coalesce(sum(qi.quantity * qi.final_price), 0) + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0)
    ) * 100, 2)
  end                             as net_margin_pct
from quotations q
join clients  c  on c.id = q.client_id
join sellers  s  on s.id = q.seller_id
left join lost_reasons lr on lr.id = q.lost_reason_id
left join quotation_items qi on qi.quotation_id = q.id
group by q.id, c.name, c.city, c.state, s.name, s.id, lr.label;
