-- ============================================================
-- Reparación: Resurrection Fest 2026 sobrescrito por el cartel de 2027
-- ============================================================
-- El 2026-11-12 la importación del cartel de 2027 emparejó el festival solo
-- por nombre y ACTUALIZÓ el registro de 2026 (4c01519f-f17f-44f0-b21a-8dca914c8546):
-- fechas de 2027, venue nuevo sin coordenadas ("Celeiro"), póster de 2027 y
-- las bandas de 2027 mezcladas con las de 2026 (160 en total).
-- Corregido en código (parse-festival-poster / commit-festival-from-poster):
-- un cartel de otro año crea una edición nueva con el venue de la anterior.
--
-- Este script devuelve el registro a 2026. Después hay que volver a importar
-- el cartel de 2027 desde la app, que ya creará la edición 2027 aparte.
--
-- Cartel 2026 de referencia: el seed (supabase/scripts/festivals-2026.sql),
-- que enlazó las bandas por lower(name). Ninguna banda está en ambos carteles.
--
-- EJECUTAR POR PARTES: primero el PASO A solo (no modifica nada) y revisar.
--
-- Ejecutado el 2026-11-13 (PASO A: 76/84; PASO B aplicado). Después se
-- reimportó el cartel de 2027, que creó la edición 2027 aparte (72 bandas,
-- venue Estadio A Magdalena heredado de 2026). NO volver a ejecutar el PASO B.

-- ------------------------------------------------------------
-- PASO A — Revisión (solo lectura)
-- Revisado el 2026-11-13 con el detalle por banda: las 76 "false" son todas
-- del cartel de 2027 (Evanescence, Mötley Crüe, Parkway Drive...), incluidas
-- lecturas erróneas del OCR de las dos importaciones de ese día (Bilesa/Eblesa
-- por Kylesa, Arkam/Arkan, Maris, Palm of Cindy). Esperado: false = 76,
-- true = 84 (160 en total).
-- ------------------------------------------------------------
with cartel_2026(nombre) as (
  select unnest(array[
      'Sabaton', 'A Day To Remember', 'Thrown', 'President', 'Man With A Mission', 'Annisokay',
      'Iron Maiden', 'Anthrax', 'Angelus Apatrida', 'Feuerschwanz', 'Caskets', 'Limp Bizkit',
      'Trivium', 'Bleed From Within', 'The Rasmus', 'Nevertel', 'Blaze The Trail', 'Marilyn Manson',
      'Mastodon', 'P.O.D.', 'Imminence', 'Hamlet', 'Iscream Never Ground', 'Testament',
      'Self Deception', 'The Browning', 'The Pretty Wild', 'TSS', 'Aneuma', 'Caliban',
      'Witch Club Satan', 'The Funeral Portrait', 'Burning Witches', 'Fallen At Dawn', 'Her Anxiety', 'Cavalera',
      'Gaerea', 'Hulder', 'Not Yet', 'Okkultist', 'Nukore', 'Blood Incantation',
      'Dogma', 'Distant', 'Hand of Juno', 'Todomal', 'Stellvris', 'High Vis',
      'Get The Shot', 'The Scratch', 'Immortal Disfigurement', 'God Complex', 'Crowded', 'Lionheart',
      'The Callous Daoboys', 'Authority Zero', 'Belvedere', 'Blood Command', 'Fuet!', 'House of Protection',
      'Dying Wish', 'End It', 'Initiate', 'Oslo Ovnies', 'Pants Off', 'Converge',
      'Harm''s Way', 'Gridiron', 'Frontierer', 'The Family Men', 'Donuts Hole', 'Faetooth',
      'Lampr3a', 'Last Train', 'Cardiac', 'Black Maracas', 'Blues Pills', 'Psychonaut',
      'Ciclonautas', 'Vulvarine', 'Silly Goose', 'Borknagar', 'Rosalie Cunningham', 'Return To Dust',
      'Madmess', 'Mourir', 'The Vintage Caravan', 'A.A. Williams', 'Cwfen', 'The Gems',
      'Kruddö'
    ])
)
select exists (select 1 from cartel_2026 c where lower(c.nombre) = lower(b.name)) as es_de_2026,
       count(*) as bandas
from festival_bands fb
join bands b on b.id = fb.band_id
where fb.festival_id = '4c01519f-f17f-44f0-b21a-8dca914c8546'
group by 1
order by 1;

-- ------------------------------------------------------------
-- PASO B — Reparación (en una transacción)
-- ------------------------------------------------------------
begin;

-- 1) Quitar del festival de 2026 las bandas que añadió el cartel de 2027.
delete from festival_bands fb
using bands b
where fb.band_id = b.id
  and fb.festival_id = '4c01519f-f17f-44f0-b21a-8dca914c8546'
  and lower(b.name) not in (
    select lower(unnest(array[
        'Sabaton', 'A Day To Remember', 'Thrown', 'President', 'Man With A Mission', 'Annisokay',
        'Iron Maiden', 'Anthrax', 'Angelus Apatrida', 'Feuerschwanz', 'Caskets', 'Limp Bizkit',
        'Trivium', 'Bleed From Within', 'The Rasmus', 'Nevertel', 'Blaze The Trail', 'Marilyn Manson',
        'Mastodon', 'P.O.D.', 'Imminence', 'Hamlet', 'Iscream Never Ground', 'Testament',
        'Self Deception', 'The Browning', 'The Pretty Wild', 'TSS', 'Aneuma', 'Caliban',
        'Witch Club Satan', 'The Funeral Portrait', 'Burning Witches', 'Fallen At Dawn', 'Her Anxiety', 'Cavalera',
        'Gaerea', 'Hulder', 'Not Yet', 'Okkultist', 'Nukore', 'Blood Incantation',
        'Dogma', 'Distant', 'Hand of Juno', 'Todomal', 'Stellvris', 'High Vis',
        'Get The Shot', 'The Scratch', 'Immortal Disfigurement', 'God Complex', 'Crowded', 'Lionheart',
        'The Callous Daoboys', 'Authority Zero', 'Belvedere', 'Blood Command', 'Fuet!', 'House of Protection',
        'Dying Wish', 'End It', 'Initiate', 'Oslo Ovnies', 'Pants Off', 'Converge',
        'Harm''s Way', 'Gridiron', 'Frontierer', 'The Family Men', 'Donuts Hole', 'Faetooth',
        'Lampr3a', 'Last Train', 'Cardiac', 'Black Maracas', 'Blues Pills', 'Psychonaut',
        'Ciclonautas', 'Vulvarine', 'Silly Goose', 'Borknagar', 'Rosalie Cunningham', 'Return To Dust',
        'Madmess', 'Mourir', 'The Vintage Caravan', 'A.A. Williams', 'Cwfen', 'The Gems',
        'Kruddö'
      ]))
  );

-- 2) Restaurar fechas, venue (Estadio A Magdalena, con coordenadas) y póster de 2026.
update festivals
set start_date = '2026-07-01',
    end_date   = '2026-07-04',
    venue_id   = 'f80c87c9-ece1-4576-8378-31a2ee565b4a',
    image_url  = 'https://vzghxgfrxqwuxwmnretm.supabase.co/storage/v1/object/public/festival-posters/resurrection-fest.jpg'
where id = '4c01519f-f17f-44f0-b21a-8dca914c8546';

-- 3) Borrar los venues sin coordenadas que crearon las importaciones fallidas
--    del 2026-11-12 ("TBD" y "Celeiro"), solo si ya nadie los usa.
delete from venues v
where v.id in ('9b927fef-9039-45b4-a8c1-be5d6cf1a952', '338d084a-194a-483e-b523-bfa16892cd61')
  and not exists (select 1 from festivals f where f.venue_id = v.id)
  and not exists (select 1 from concerts c where c.venue_id = v.id);

commit;

-- Comprobación: debe salir 2026-07-01 / 2026-07-04, Estadio A Magdalena con
-- coordenadas y 84 bandas.
select f.name, f.start_date, f.end_date, v.name as venue, v.lat, v.lng,
       (select count(*) from festival_bands fb where fb.festival_id = f.id) as bandas
from festivals f
left join venues v on v.id = f.venue_id
where f.id = '4c01519f-f17f-44f0-b21a-8dca914c8546';

-- ------------------------------------------------------------
-- PASO C — Comprobación final (solo lectura), tras reimportar el cartel 2027
-- Esperado: dos filas.
--   * 4c01519f-f17f-44f0-b21a-8dca914c8546: 2026-07-01, Estadio A Magdalena,
--     bandas = de_2026 = 84
--   * edición 2027 nueva (created_at de hoy): 2027-06-30, Estadio A Magdalena,
--     de_2026 = 0
-- ------------------------------------------------------------
with cartel_2026(nombre) as (
  select lower(unnest(array[
      'Sabaton', 'A Day To Remember', 'Thrown', 'President', 'Man With A Mission', 'Annisokay',
      'Iron Maiden', 'Anthrax', 'Angelus Apatrida', 'Feuerschwanz', 'Caskets', 'Limp Bizkit',
      'Trivium', 'Bleed From Within', 'The Rasmus', 'Nevertel', 'Blaze The Trail', 'Marilyn Manson',
      'Mastodon', 'P.O.D.', 'Imminence', 'Hamlet', 'Iscream Never Ground', 'Testament',
      'Self Deception', 'The Browning', 'The Pretty Wild', 'TSS', 'Aneuma', 'Caliban',
      'Witch Club Satan', 'The Funeral Portrait', 'Burning Witches', 'Fallen At Dawn', 'Her Anxiety', 'Cavalera',
      'Gaerea', 'Hulder', 'Not Yet', 'Okkultist', 'Nukore', 'Blood Incantation',
      'Dogma', 'Distant', 'Hand of Juno', 'Todomal', 'Stellvris', 'High Vis',
      'Get The Shot', 'The Scratch', 'Immortal Disfigurement', 'God Complex', 'Crowded', 'Lionheart',
      'The Callous Daoboys', 'Authority Zero', 'Belvedere', 'Blood Command', 'Fuet!', 'House of Protection',
      'Dying Wish', 'End It', 'Initiate', 'Oslo Ovnies', 'Pants Off', 'Converge',
      'Harm''s Way', 'Gridiron', 'Frontierer', 'The Family Men', 'Donuts Hole', 'Faetooth',
      'Lampr3a', 'Last Train', 'Cardiac', 'Black Maracas', 'Blues Pills', 'Psychonaut',
      'Ciclonautas', 'Vulvarine', 'Silly Goose', 'Borknagar', 'Rosalie Cunningham', 'Return To Dust',
      'Madmess', 'Mourir', 'The Vintage Caravan', 'A.A. Williams', 'Cwfen', 'The Gems',
      'Kruddö'
    ]))
)
select f.id, f.start_date, f.end_date, v.name as venue, v.lat,
       f.created_at, f.updated_at,
       count(fb.band_id) as bandas,
       count(c.nombre)   as de_2026
from festivals f
left join venues v          on v.id = f.venue_id
left join festival_bands fb on fb.festival_id = f.id
left join bands b           on b.id = fb.band_id
left join cartel_2026 c     on c.nombre = lower(b.name)
where f.name ilike '%resurrection%'
group by f.id, v.name, v.lat
order by f.created_at;
