-- ============================================================
-- Colhe — Patch v3
-- Libera cliente e produto como texto livre na cotação
-- ============================================================

-- 1. Tornar client_id opcional na cotação
alter table quotations
  alter column client_id drop not null;

-- 2. Adicionar campo de nome livre do cliente
alter table quotations
  add column if not exists client_name_free text;

-- 3. Tornar product_id opcional no item
alter table quotation_items
  alter column product_id drop not null;

-- 4. Adicionar campo de nome livre do produto e categoria livre
alter table quotation_items
  add column if not exists product_name_free text,
  add column if not exists product_category_free text;

-- 5. Recriar view para usar nome livre quando não houver cadastro
drop view if exists v_quotation_summary;

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
  coalesce(c.name, q.client_name_free)   as client_name,
  c.city,
  c.state,
  s.name                                  as seller_name,
  lr.label                                as lost_reason,
  count(distinct qi.id)                   as item_count,
  coalesce(sum(qi.quantity * qi.final_price), 0)
  + coalesce((
      select sum(t.quantity * t.unit_price)
      from quotation_item_tsi t
      join quotation_items qi2 on qi2.id = t.quotation_item_id
      where qi2.quotation_id = q.id
    ), 0)                                 as total_revenue,
  coalesce(sum(qi.quantity * qi.unit_cost), 0)
  + coalesce((
      select sum(t.quantity * t.unit_cost)
      from quotation_item_tsi t
      join quotation_items qi2 on qi2.id = t.quotation_item_id
      where qi2.quotation_id = q.id
    ), 0)                                 as total_cost,
  case
    when coalesce(sum(qi.quantity * qi.final_price), 0)
       + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0) = 0
    then 0
    else round((
      (coalesce(sum(qi.quantity * qi.final_price), 0) + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0))
      - (coalesce(sum(qi.quantity * qi.unit_cost), 0)  + coalesce((select sum(t.quantity * t.unit_cost)  from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0))
    ) / (
      coalesce(sum(qi.quantity * qi.final_price), 0) + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0)
    ) * 100, 2)
  end                                     as gross_margin_pct,
  case
    when coalesce(sum(qi.quantity * qi.final_price), 0)
       + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0) = 0
    then 0
    else round((
      (coalesce(sum(qi.quantity * qi.final_price), 0) + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0))
      - (coalesce(sum(qi.quantity * qi.unit_cost), 0)  + coalesce((select sum(t.quantity * t.unit_cost)  from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0))
      - coalesce(q.freight, 0)
      - (coalesce(sum(qi.quantity * qi.final_price), 0) + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0)) * coalesce(q.commission_pct, 0) / 100
    ) / (
      coalesce(sum(qi.quantity * qi.final_price), 0) + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0)
    ) * 100, 2)
  end                                     as net_margin_pct
from quotations q
left join clients  c  on c.id = q.client_id
join  sellers  s  on s.id = q.seller_id
left join lost_reasons lr on lr.id = q.lost_reason_id
left join quotation_items qi on qi.quotation_id = q.id
group by q.id, c.name, c.city, c.state, s.name, s.id, lr.label, q.client_name_free;
