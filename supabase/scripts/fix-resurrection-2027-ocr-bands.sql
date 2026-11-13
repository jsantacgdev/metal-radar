-- ============================================================
-- Resurrection Fest 2027: corregir bandas mal leídas por el OCR
-- ============================================================
-- La edición 2027 (6cd980f4-e2d3-44db-9501-bf09211d1ab4) se importó el 2026-11-13 con 72
-- bandas, algunas con el nombre mal leído del logo (en importaciones
-- anteriores salieron "Bilesa"/"Eblesa" por Kylesa, "Palm of Cindy" por
-- Pain of Truth, "Maris" por Maruja, "Arkam"/"Arkan" por el logo alado).
--
-- Cartel de referencia: transcripción manual del póster de 2027 (72 bandas).
-- El logo alado a la derecha de British Lion es Gwar (confirmado por el usuario).
--
-- EJECUTAR POR PARTES. PASO 1 es solo lectura.
--
-- Ejecutado el 2026-11-13 (pasos 1, 2, 3A y 3B).

-- ------------------------------------------------------------
-- PASO 1 — Comparar BD con el cartel (solo lectura)
--   "sobra"  = está en el festival pero no en el cartel → lectura errónea
--   "falta"  = está en el cartel pero no en el festival → nombre correcto
--              que hay que enlazar
-- ------------------------------------------------------------
with cartel_2027(nombre) as (
  select unnest(array[
      'Evanescence', 'Mötley Crüe', 'Parkway Drive', 'Lorna Shore', 'Helloween',
      'Dropkick Murphys', 'Motionless In White', 'Enter Shikari', 'Fever 333', 'Beartooth',
      'Fit For A King', 'Wage War', 'Kreator', 'Cradle Of Filth', 'Leprous',
      'Crisix', 'British Lion', 'Gwar', 'Coldrain', 'Blue Medusa', 'Daughtry',
      'Calva Louise', 'Paledusk', 'Aesthetic Perfection', 'Novelists', 'Samurai Pizza Cats',
      'Hokka', 'Cenobia', 'Master Boot Record', 'The Dark.fm', 'Nocturnal Bloodlust',
      'Any Given Day', 'Celestial Sanctuary', 'Windwaker', 'Seven Blood', 'Sunborn',
      'Prom Kinks', 'After Salem', 'Keepers', 'Blood For Blood', 'Speed',
      'Maruja', 'Currents', 'Pain Of Truth', 'Static Dress', 'Gideon',
      'Locked Shut', 'Punk Rave-STVW', 'EMNW', 'Unpeople', 'Damned',
      'Escuela Grind', 'Empty Shell Casing', 'Big Ass Truck I.E.', 'Crowquill', 'Lust',
      'Demenzia Sozial', 'Danko Jones', 'Twin Temple', 'King Buffalo', 'Kylesa',
      'Richie Kotzen', 'The Barbarians Of California', 'Persefone', 'Conjurer', 'Dead Meadow',
      'Wyatt E.', 'Ashes Of Billy', 'No Quiero', 'Plebeian Grandstand', 'Split Dogs',
      'The Photonics'
    ])
)
select 'sobra' as tipo, b.name, b.source, (b.spotify_id is not null) as en_spotify
from festival_bands fb
join bands b on b.id = fb.band_id
where fb.festival_id = '6cd980f4-e2d3-44db-9501-bf09211d1ab4'
  and lower(b.name) not in (select lower(nombre) from cartel_2027)
union all
select 'falta', c.nombre, null, null
from cartel_2027 c
where not exists (
  select 1
  from festival_bands fb
  join bands b on b.id = fb.band_id
  where fb.festival_id = '6cd980f4-e2d3-44db-9501-bf09211d1ab4'
    and lower(b.name) = lower(c.nombre)
)
order by 1, 2;

-- ------------------------------------------------------------
-- PASO 2 — Corregir la lista del festival 2027 (en una transacción)
-- Ejecutar solo si el PASO 1 tiene sentido: todo lo que "sobra" son
-- lecturas erróneas y lo que "falta" son sus nombres correctos.
-- ------------------------------------------------------------
begin;

-- 1) Quitar del festival las lecturas erróneas (lo que "sobra").
delete from festival_bands fb
using bands b
where fb.band_id = b.id
  and fb.festival_id = '6cd980f4-e2d3-44db-9501-bf09211d1ab4'
  and lower(b.name) not in (select lower(unnest(array[
      'Evanescence', 'Mötley Crüe', 'Parkway Drive', 'Lorna Shore', 'Helloween',
      'Dropkick Murphys', 'Motionless In White', 'Enter Shikari', 'Fever 333', 'Beartooth',
      'Fit For A King', 'Wage War', 'Kreator', 'Cradle Of Filth', 'Leprous',
      'Crisix', 'British Lion', 'Gwar', 'Coldrain', 'Blue Medusa', 'Daughtry',
      'Calva Louise', 'Paledusk', 'Aesthetic Perfection', 'Novelists', 'Samurai Pizza Cats',
      'Hokka', 'Cenobia', 'Master Boot Record', 'The Dark.fm', 'Nocturnal Bloodlust',
      'Any Given Day', 'Celestial Sanctuary', 'Windwaker', 'Seven Blood', 'Sunborn',
      'Prom Kinks', 'After Salem', 'Keepers', 'Blood For Blood', 'Speed',
      'Maruja', 'Currents', 'Pain Of Truth', 'Static Dress', 'Gideon',
      'Locked Shut', 'Punk Rave-STVW', 'EMNW', 'Unpeople', 'Damned',
      'Escuela Grind', 'Empty Shell Casing', 'Big Ass Truck I.E.', 'Crowquill', 'Lust',
      'Demenzia Sozial', 'Danko Jones', 'Twin Temple', 'King Buffalo', 'Kylesa',
      'Richie Kotzen', 'The Barbarians Of California', 'Persefone', 'Conjurer', 'Dead Meadow',
      'Wyatt E.', 'Ashes Of Billy', 'No Quiero', 'Plebeian Grandstand', 'Split Dogs',
      'The Photonics'
    ])));

-- 2) Crear las bandas del cartel que no existan todavía (comparando sin
--    mayúsculas, igual que la importación).
insert into bands (name)
select c.nombre
from unnest(array[
      'Evanescence', 'Mötley Crüe', 'Parkway Drive', 'Lorna Shore', 'Helloween',
      'Dropkick Murphys', 'Motionless In White', 'Enter Shikari', 'Fever 333', 'Beartooth',
      'Fit For A King', 'Wage War', 'Kreator', 'Cradle Of Filth', 'Leprous',
      'Crisix', 'British Lion', 'Gwar', 'Coldrain', 'Blue Medusa', 'Daughtry',
      'Calva Louise', 'Paledusk', 'Aesthetic Perfection', 'Novelists', 'Samurai Pizza Cats',
      'Hokka', 'Cenobia', 'Master Boot Record', 'The Dark.fm', 'Nocturnal Bloodlust',
      'Any Given Day', 'Celestial Sanctuary', 'Windwaker', 'Seven Blood', 'Sunborn',
      'Prom Kinks', 'After Salem', 'Keepers', 'Blood For Blood', 'Speed',
      'Maruja', 'Currents', 'Pain Of Truth', 'Static Dress', 'Gideon',
      'Locked Shut', 'Punk Rave-STVW', 'EMNW', 'Unpeople', 'Damned',
      'Escuela Grind', 'Empty Shell Casing', 'Big Ass Truck I.E.', 'Crowquill', 'Lust',
      'Demenzia Sozial', 'Danko Jones', 'Twin Temple', 'King Buffalo', 'Kylesa',
      'Richie Kotzen', 'The Barbarians Of California', 'Persefone', 'Conjurer', 'Dead Meadow',
      'Wyatt E.', 'Ashes Of Billy', 'No Quiero', 'Plebeian Grandstand', 'Split Dogs',
      'The Photonics'
    ]) as c(nombre)
where not exists (select 1 from bands b where lower(b.name) = lower(c.nombre));

-- 3) Enlazar al festival las que falten. Si hay varias bandas con el mismo
--    nombre, se prefiere la enriquecida (con spotify_id).
insert into festival_bands (festival_id, band_id, is_headliner)
select '6cd980f4-e2d3-44db-9501-bf09211d1ab4',
       (select b.id from bands b
         where lower(b.name) = lower(c.nombre)
         order by b.spotify_id nulls last
         limit 1),
       false
from unnest(array[
      'Evanescence', 'Mötley Crüe', 'Parkway Drive', 'Lorna Shore', 'Helloween',
      'Dropkick Murphys', 'Motionless In White', 'Enter Shikari', 'Fever 333', 'Beartooth',
      'Fit For A King', 'Wage War', 'Kreator', 'Cradle Of Filth', 'Leprous',
      'Crisix', 'British Lion', 'Gwar', 'Coldrain', 'Blue Medusa', 'Daughtry',
      'Calva Louise', 'Paledusk', 'Aesthetic Perfection', 'Novelists', 'Samurai Pizza Cats',
      'Hokka', 'Cenobia', 'Master Boot Record', 'The Dark.fm', 'Nocturnal Bloodlust',
      'Any Given Day', 'Celestial Sanctuary', 'Windwaker', 'Seven Blood', 'Sunborn',
      'Prom Kinks', 'After Salem', 'Keepers', 'Blood For Blood', 'Speed',
      'Maruja', 'Currents', 'Pain Of Truth', 'Static Dress', 'Gideon',
      'Locked Shut', 'Punk Rave-STVW', 'EMNW', 'Unpeople', 'Damned',
      'Escuela Grind', 'Empty Shell Casing', 'Big Ass Truck I.E.', 'Crowquill', 'Lust',
      'Demenzia Sozial', 'Danko Jones', 'Twin Temple', 'King Buffalo', 'Kylesa',
      'Richie Kotzen', 'The Barbarians Of California', 'Persefone', 'Conjurer', 'Dead Meadow',
      'Wyatt E.', 'Ashes Of Billy', 'No Quiero', 'Plebeian Grandstand', 'Split Dogs',
      'The Photonics'
    ]) as c(nombre)
where not exists (
  select 1
  from festival_bands fb
  join bands b on b.id = fb.band_id
  where fb.festival_id = '6cd980f4-e2d3-44db-9501-bf09211d1ab4'
    and lower(b.name) = lower(c.nombre)
)
on conflict do nothing;

commit;

-- Comprobación: debe dar 72. Volver a ejecutar el PASO 1 debe dar 0 filas.
select count(*) as bandas from festival_bands where festival_id = '6cd980f4-e2d3-44db-9501-bf09211d1ab4';

-- ------------------------------------------------------------
-- PASO 3 — Bandas basura del OCR que han quedado sueltas
-- 3A (solo lectura): bandas creadas por el OCR que ya no están en ningún
-- festival ni concierto y que nadie sigue. Revisar la lista.
-- ------------------------------------------------------------
select b.id, b.name
from bands b
where b.source = 'ocr'
  and not exists (select 1 from festival_bands fb where fb.band_id = b.id)
  and not exists (select 1 from concert_bands cb where cb.band_id = b.id)
  and not exists (select 1 from user_bands ub where ub.band_id = b.id)
order by b.name;

-- 3B: borrarlas (mismas condiciones que 3A). Si otra tabla las referencia,
-- el delete falla y la transacción no aplica nada.
begin;
delete from bands b
where b.source = 'ocr'
  and not exists (select 1 from festival_bands fb where fb.band_id = b.id)
  and not exists (select 1 from concert_bands cb where cb.band_id = b.id)
  and not exists (select 1 from user_bands ub where ub.band_id = b.id);
commit;
