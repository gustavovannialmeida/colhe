-- ============================================================
-- Colhe — Patch v4
-- Frete por item (frete/unidade) + frete extra na cotação
-- ============================================================

-- 1. Adicionar frete por unidade no item
alter table quotation_items
  add column if not exists unit_freight numeric(12,4) not null default 0;

-- 2. Renomear o campo de frete da cotação para frete_extra
-- (mantém compatibilidade — agora representa frete adicional/fixo)
-- O campo "freight" existente passa a ser o frete extra/adicional.
-- Nenhuma alteração de nome necessária — só mudamos a semântica no front.

-- 3. Recriar view com frete por item incluso no custo e na margem
drop view if exists v_quotation_summary;

create or replace view v_quotation_summary as
select
  q.id,
  q.code,
  q.status,
  q.created_at,
  q.closed_at,
  q.sent_at,
  q.freight                                        as freight_extra,
  q.commission_pct,
  q.notes,
  q.lost_notes,
  q.seller_id,
  coalesce(c.name, q.client_name_free)             as client_name,
  c.city,
  c.state,
  s.name                                           as seller_name,
  lr.label                                         as lost_reason,
  count(distinct qi.id)                            as item_count,

  -- Frete total dos itens
  coalesce(sum(qi.quantity * coalesce(qi.unit_freight,0)), 0) as freight_items,

  -- Frete total = itens + extra
  coalesce(sum(qi.quantity * coalesce(qi.unit_freight,0)), 0)
  + coalesce(q.freight, 0)                         as freight_total,

  -- Receita: itens + TSI
  coalesce(sum(qi.quantity * qi.final_price), 0)
  + coalesce((
      select sum(t.quantity * t.unit_price)
      from quotation_item_tsi t
      join quotation_items qi2 on qi2.id = t.quotation_item_id
      where qi2.quotation_id = q.id
    ), 0)                                          as total_revenue,

  -- Custo: itens + TSI (SEM frete — frete é separado)
  coalesce(sum(qi.quantity * qi.unit_cost), 0)
  + coalesce((
      select sum(t.quantity * t.unit_cost)
      from quotation_item_tsi t
      join quotation_items qi2 on qi2.id = t.quotation_item_id
      where qi2.quotation_id = q.id
    ), 0)                                          as total_cost,

  -- Margem bruta (sem frete)
  case
    when coalesce(sum(qi.quantity * qi.final_price), 0)
       + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0) = 0
    then 0
    else round((
      (coalesce(sum(qi.quantity * qi.final_price), 0) + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0))
      - (coalesce(sum(qi.quantity * qi.unit_cost), 0) + coalesce((select sum(t.quantity * t.unit_cost) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0))
    ) / nullif(
      coalesce(sum(qi.quantity * qi.final_price), 0) + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0)
    , 0) * 100, 2)
  end                                              as gross_margin_pct,

  -- Margem líquida (desconta frete total + comissão)
  case
    when coalesce(sum(qi.quantity * qi.final_price), 0)
       + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0) = 0
    then 0
    else round((
      (coalesce(sum(qi.quantity * qi.final_price), 0) + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0))
      - (coalesce(sum(qi.quantity * qi.unit_cost), 0) + coalesce((select sum(t.quantity * t.unit_cost) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0))
      -- frete dos itens
      - coalesce(sum(qi.quantity * coalesce(qi.unit_freight,0)), 0)
      -- frete extra
      - coalesce(q.freight, 0)
      -- comissão
      - (coalesce(sum(qi.quantity * qi.final_price), 0) + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0)) * coalesce(q.commission_pct, 0) / 100
    ) / nullif(
      coalesce(sum(qi.quantity * qi.final_price), 0) + coalesce((select sum(t.quantity * t.unit_price) from quotation_item_tsi t join quotation_items qi2 on qi2.id = t.quotation_item_id where qi2.quotation_id = q.id), 0)
    , 0) * 100, 2)
  end                                              as net_margin_pct

from quotations q
left join clients  c  on c.id = q.client_id
join      sellers  s  on s.id = q.seller_id
left join lost_reasons lr on lr.id = q.lost_reason_id
left join quotation_items qi on qi.quotation_id = q.id
group by q.id, c.name, c.city, c.state, s.name, s.id, lr.label, q.client_name_free;
