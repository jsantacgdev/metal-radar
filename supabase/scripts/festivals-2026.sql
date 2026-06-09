-- ============================================================
-- FESTIVALES ESPAÑA 2026 - MetalRadar
-- Foco en rock, metal, alternativa, indie
-- ============================================================

-- Helper: función para insertar festival con bandas en una sola transacción
create or replace function add_festival(
  p_festival_name text,
  p_description text,
  p_start_date date,
  p_end_date date,
  p_venue_name text,
  p_city text,
  p_lat double precision,
  p_lng double precision,
  p_ticket_url text,
  p_official_url text,
  p_band_names text[]
) returns void as $$
declare
  v_venue_id uuid;
  v_festival_id uuid;
  v_band_id uuid;
  v_band_name text;
  v_venue_key text;
begin
  v_venue_key := 'manual_' || lower(regexp_replace(p_festival_name, '[^a-zA-Z0-9]', '_', 'g'));

  -- 1. Upsert venue
  insert into venues (name, city, country, lat, lng, ticketmaster_id)
  values (p_venue_name, p_city, 'España', p_lat, p_lng, v_venue_key)
  on conflict (ticketmaster_id) do update set name = excluded.name
  returning id into v_venue_id;

  -- 2. Upsert festival (delete previo para refrescar lineup)
  delete from festivals where name = p_festival_name;
  insert into festivals (name, description, start_date, end_date, venue_id, ticket_url, official_url, source)
  values (p_festival_name, p_description, p_start_date, p_end_date, v_venue_id, p_ticket_url, p_official_url, 'manual')
  returning id into v_festival_id;

  -- 3. Por cada banda, upsert y vincular
  foreach v_band_name in array p_band_names loop
    insert into bands (name) values (v_band_name)
    on conflict (spotify_id) do nothing;

    select id into v_band_id from bands where lower(name) = lower(v_band_name) limit 1;

    if v_band_id is not null then
      insert into festival_bands (festival_id, band_id, is_headliner)
      values (v_festival_id, v_band_id, true)
      on conflict do nothing;
    end if;
  end loop;
end;
$$ language plpgsql;

-- ============================================================
-- INSERCIÓN DE FESTIVALES
-- ============================================================

-- RESURRECTION FEST 2026
select add_festival(
  'Resurrection Fest 2026',
  'El festival de metal y rock más grande del sur de Europa',
  '2026-07-01', 
  '2026-07-04',
  'Estadio A Magdalena', 
  'Viveiro',
  43.6763, 
  -7.5915,
  'https://www.resurrectionfest.es/entradas/',
  'https://www.resurrectionfest.es/',
  array[
    -- Main Stage
    'Sabaton', 'A Day To Remember', 'Thrown', 'President', 'Man With A Mission', 'Annisokay',
    'Iron Maiden', 'Anthrax', 'Angelus Apatrida', 'Feuerschwanz', 'Caskets',
    'Limp Bizkit', 'Trivium', 'Bleed From Within', 'The Rasmus', 'Nevertel', 'Blaze The Trail',
    'Marilyn Manson', 'Mastodon', 'P.O.D.', 'Imminence', 'Hamlet', 'Iscream Never Ground',

    -- Ritual Stage
    'Testament', 'Self Deception', 'The Browning', 'The Pretty Wild', 'TSS', 'Aneuma',
    'Caliban', 'Witch Club Satan', 'The Funeral Portrait', 'Burning Witches', 'Fallen At Dawn', 'Her Anxiety',
    'Cavalera', 'Gaerea', 'Hulder', 'Not Yet', 'Okkultist', 'Nukore',
    'Blood Incantation', 'Dogma', 'Distant', 'Hand of Juno', 'Todomal', 'Stellvris',

    -- Chaos Stage
    'High Vis', 'Get The Shot', 'The Scratch', 'Immortal Disfigurement', 'God Complex', 'Crowded',
    'Lionheart', 'The Callous Daoboys', 'Authority Zero', 'Belvedere', 'Blood Command', 'Fuet!',
    'House of Protection', 'Dying Wish', 'End It', 'Initiate', 'Oslo Ovnies', 'Pants Off',
    'Converge', 'Harm''s Way', 'Gridiron', 'Frontierer', 'The Family Men', 'Donuts Hole',

    -- Desert Stage
    'Faetooth', 'Lampr3a', 'Last Train', 'Cardiac', 'Black Maracas',
    'Blues Pills', 'Psychonaut', 'Ciclonautas', 'Vulvarine', 'Silly Goose',
    'Borknagar', 'Rosalie Cunningham', 'Return To Dust', 'Madmess', 'Mourir',
    'The Vintage Caravan', 'A.A. Williams', 'Cwfen', 'The Gems', 'Kruddö'
  ]
);

select add_festival(
  'Leyendas del Rock 2026',
  'Edición XX Aniversario de uno de los festivales más míticos de heavy metal en España',
  '2026-08-05', 
  '2026-08-08',
  'Polideportivo Municipal de Villena', 
  'Villena',
  38.6318,
  -0.8463,
  'https://www.ticketmaster.es/artist/leyendas-del-rock-entradas/970054',
  'https://www.leyendasdelrockfestival.com/',
  array[
    'Savatage', 'Slaughter to Prevail', 'Sepultura', 'Black Label Society', 'Orbit Culture', 
    'Thundermother', 'Jordi Wild', 'Tailgunner', 'Signs of the Swarm', 'Killus', 'Salduie', 
    'Chained Saint', 'Hadadanza', 'Prom Kinks', 'Heleven',

    'Godsmack', 'Arch Enemy', 'Of Mice & Men', 'Dark Tranquillity', 'dArtagnan', 'Northlane', 
    'Mushroomhead', 'Lèpoka', 'Evo', 'Bolu2 Death', 'Lándevir', 'Celtibeerian', 'Injector', 
    'Ekyrian', 'Aneuma',

    'Stratovarius', 'In Flames', 'Saurom', 'Saratoga', 'Future Palace', 'The Baboon Show', 
    'Dark Moor', 'Blaze Out', 'Chez Kane', 'Employed To Serve', 'Mind Driller', 'Wings of Steel', 
    'Against Myself', 'Daeria', 'Xeria',

    'WarCry', 'Helloween', 'Heaven Shall Burn', 'Deicide', 'Chelsea Grin', 'Eihwar', 'Ankhara', 
    'Hardline', 'Guilt Trip', 'Latzen', 'Ten56.', 'Cabal', 'Death and Legacy', 'Fallen At Dawn'
  ]
);

select add_festival(
  'Barcelona Rock Fest 2026',
  'Edición X del gran festival de rock y metal en Cataluña',
  '2026-07-03', 
  '2026-07-05',
  'Parc de Can Zam', 
  'Santa Coloma de Gramenet',
  41.4546, 
  2.1993,
  'https://www.barcelonarockfest.com/entradas/',
  'https://www.barcelonarockfest.com/',
  array[
    -- Viernes 3 de julio
    'Megadeth', 'Sex Pistols', 'Loudness', 'Gotthard', 'Tyketto', 'Blues Pills', 'Pretty Maids', 
    'Latzen', 'Starace', 'Machete Law', 'Motörhits',

    -- Sábado 4 de julio
    'Helloween', 'Accept', 'Sabaton', 'Testament', 'Primal Fear', 'Napalm Death', 'Bleed From Within', 
    'Tankard', 'Los Barones', 'Hiraes', 'Chino Banzai', 'Dünedain', 'T.N.T.',

    -- Domingo 5 de julio
    'The Offspring', 'Powerwolf', 'Bad Religion', 'Evaristo', 'Breaking Benjamin', 'Steel Panther', 'Cavalera', 
    'Chevelle', 'Orden Ogan', 'Rienda Suelta', 'Rat-Zinger', 'Stingers'
  ]
);

select add_festival(
  'Rock Imperium Festival 2026',
  'Gran evento de rock y heavy metal en el recinto del Parque de la Cuesta del Batel en Cartagena',
  '2026-07-03', 
  '2026-07-05',
  'Parque de la Cuesta del Batel', 
  'Cartagena',
  37.7013, 
  -0.9773,
  'https://www.rockimperiumfestival.es/entradas/',
  'https://www.rockimperiumfestival.es/',
  array[
    -- Viernes 3 de julio
    'Within Temptation', 'Mastodon', 'The Gathering', 'Lacuna Coil', 'Crimson Glory', 'Grand Magus', 'Avulsed', 
    'Triskel', 'Rockin'' Ladies', 'Heleven', 'Evilact',

    -- Sábado 4 de julio
    'Iron Maiden', 'Anthrax', 'H.E.A.T', 'Blues Pills', 'Wings of Steel', '4 Bajo Zero', 'Presa',

    -- Domingo 5 de julio
    'Sabaton', 'Trivium', 'Testament', 'Queensrÿche', 'Crazy Lixx', 'Dogma', 'Uada', 
    'Hagane', 'Latzen', 'Doble Esfera', 'Estrella Negra'
  ]
);