-- Shatter Stamp 랭킹 DB.
-- Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여 넣고 Run.
-- 여러 번 실행해도 된다(이미 있으면 건너뛰거나 새 규칙으로 바꾼다). 예전 버전 위에 실행해도 기록은 남는다.
--
-- 보안 원칙
--   1. 게임(브라우저)은 표를 직접 읽거나 쓰지 못한다. 아래 함수들로만 드나든다.
--   2. "누구인지"는 함수가 로그인 토큰(auth.uid())에서 직접 꺼낸다. 브라우저가 보낸 사용자 번호는 믿지 않는다.
--   3. 랭킹에는 닉네임·점수만 나간다. 내부 계정 번호(user_id)는 밖으로 나가지 않는다.
--   4. 값 검사(닉네임 규칙, 점수 범위, 등록 간격)는 모두 서버에서 한다. 브라우저 검사는 편의일 뿐이다.
--   5. 점수는 브라우저가 보낸 숫자를 믿지 않는다. 서버 함수(supabase/functions/submit-run)가 판 기록을
--      서버가 준 시드로 처음부터 다시 돌려 계산한 점수만 record_run 으로 넣는다(record_run 은 서버 함수만 부를 수 있다).

-- ------------------------------------------------------------------ 표

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null unique,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists nickname_changed_at timestamptz not null default now();

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  score integer not null check (score between 0 and 1000000),
  max_combo integer not null check (max_combo between 0 and 500),
  biggest integer not null check (biggest between 0 and 72),
  created_at timestamptz not null default now()
);
alter table public.scores alter column user_id drop default;

-- 판 표: 판을 시작할 때 서버가 내주는 시드. 한 번만 쓸 수 있고, 새 표를 받으면 쓰지 않은 이전 표는 닫힌다.
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  seed integer not null check (seed > 0),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists runs_user_time on public.runs (user_id, created_at desc);

-- 손님(익명 로그인)은 닉네임 없이도 판 표를 받고 점수를 남긴다. 그래서 점수·판 표는 닉네임 표가 아니라 계정에 붙인다.
-- (예전 버전은 닉네임 표에 붙어 있었다: 바꿔 단다. 닉네임이 없는 사람의 점수는 랭킹에 보이지 않는다.)
alter table public.scores drop constraint if exists scores_user_id_fkey;
alter table public.scores add constraint scores_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.runs drop constraint if exists runs_user_id_fkey;
alter table public.runs add constraint runs_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

-- 어떤 판 표로 올린 점수인지 (한 표로 한 번만)
alter table public.scores add column if not exists run_id uuid unique references public.runs (id) on delete set null;

create index if not exists scores_user_score on public.scores (user_id, score desc);
create index if not exists scores_score on public.scores (score desc);
create index if not exists scores_user_time on public.scores (user_id, created_at desc);

-- 랭킹 설정 (한 줄짜리 표). guests_ranked: 손님 계정도 랭킹에 보일지.
-- 손님 도배·봇이 문제가 되면 SQL Editor에서 한 줄로 끈다(손님 기록은 지워지지 않고, Google로 로그인하면 옮겨져 보인다):
--   update public.ranking_settings set guests_ranked = false;
-- 다시 켜기: update public.ranking_settings set guests_ranked = true;
create table if not exists public.ranking_settings (
  id boolean primary key default true check (id),
  guests_ranked boolean not null default true
);
insert into public.ranking_settings (id) values (true) on conflict (id) do nothing;

-- 닉네임 규칙: 2~12자, 앞뒤 공백 없음, 보이지 않는 글자·방향 바꾸는 글자·제어 문자 금지
-- (보이지 않는 글자를 섞으면 남과 똑같아 보이는 닉네임을 만들 수 있다)
alter table public.profiles drop constraint if exists profiles_nickname_check;
alter table public.profiles add constraint profiles_nickname_check check (
  char_length(nickname) between 2 and 12
  and nickname = btrim(nickname)
  and nickname !~ '[\x01-\x1f\x7f-\x9f\u00ad\u034f\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]'
);
-- 대소문자만 다른 닉네임 금지 (Admin / admin)
create unique index if not exists profiles_nickname_lower on public.profiles (lower(nickname));

-- ------------------------------------------------------------------ 문 닫기 (RLS + 권한 회수)
-- RLS를 켜고 허용 규칙을 하나도 두지 않으면, 함수 밖에서는 아무도 표를 읽거나 쓸 수 없다.

alter table public.profiles enable row level security;
alter table public.scores enable row level security;
alter table public.runs enable row level security;
alter table public.ranking_settings enable row level security;

drop policy if exists "profiles readable" on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
drop policy if exists "scores readable" on public.scores;
drop policy if exists "own score insert" on public.scores;

revoke all on table public.profiles, public.scores, public.runs, public.ranking_settings from anon, authenticated, public;
revoke all on sequence public.scores_id_seq from anon, authenticated, public;
-- 서버 함수(service_role)는 판 표의 시드를 읽어 판을 다시 돌린다
grant select on table public.runs to service_role;

-- 예전 버전의 등록 간격 검사(표 직접 쓰기용)는 이제 submit_score 안에서 한다
drop trigger if exists scores_rate_limit on public.scores;
drop function if exists public.scores_rate_limit();

-- ------------------------------------------------------------------ 함수 (게임이 쓰는 유일한 입구)
-- security definer: 함수 주인 권한으로 표를 다룬다. 그래서 안에서 반드시 auth.uid()로 본인 확인을 한다.
-- search_path = '': 이름을 바꿔치기한 가짜 표·함수를 끼워 넣는 공격을 막는다(모든 이름을 public. 으로 적는다).

-- 내 닉네임 (로그인 안 했으면 null, 로그인했는데 아직 안 정했으면 null)
create or replace function public.my_profile()
returns text
language sql stable security definer set search_path = '' as $$
  select p.nickname from public.profiles p where p.id = auth.uid();
$$;

-- 닉네임에 쓸 수 없는 말인지. 여러 온라인 게임에서 막는 종류를 갈래별로 모았다.
-- 피해 가기를 막으려고 세 가지로 바꿔서 모두 본다.
--   1) 글자(한글·자모·영어)만 남기기: 띄어쓰기·숫자·기호 끼우기 (f u c k, 씨1발)
--   2) 숫자·기호를 비슷한 영어 글자로 바꾼 뒤 글자만: p0rn, $ex, b1tch
--   3) 한글·자모만 남기기: 한글 사이에 영어 끼우기 (씨x발)
-- 다른 말 안에 우연히 들어가는 짧은 영어(grape의 rape, peacock의 cock, crisis의 isis, heroine의 heroin 등)와
-- 이름·흔한 말과 겹치는 것(성기, 등신대, 호로록, 에미넴 등)은 넣지 않았다.
-- sex(?!y): sexy 는 허용한다(뒤에 y가 오지 않는 sex만 막는다).
-- 단어를 더하려면 아래 목록에 | 로 이어 붙이고 이 파일을 다시 실행한다(이미 정한 닉네임은 바뀌지 않는다).
create or replace function public.nick_blocked(name text)
returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  low text := lower(coalesce(name, ''));
  words text := '(' ||
    -- 욕설 (한국어)
    '시발|씨발|씨바|씨빨|시빨|씨팔|시팔|쓰발|ㅅㅂ|ㅆㅂ|ㅅㅍ|병신|븅신|빙신|병쉰|ㅂㅅ|ㅄ|좆|존나|졸라|ㅈㄴ|개새|개색|개세끼|새끼|섀끼|' ||
    '지랄|ㅈㄹ|염병|엿먹|엿같|느금|니미|애미|애비|씹|썅|쌍년|쌍놈|개년|개놈|후레자식|미친놈|미친년|미친새|또라이|돌아이|닥쳐|꺼져|' ||
    -- 욕설 (영어)
    'fuck|fck|phuck|shit|bitch|biatch|cunt|dick|pussy|asshole|bastard|motherf|wanker|twat|bollock|' ||
    -- 성적인 말 (한국어)
    '보지|자지|봊|잦|섹스|쎅스|섹파|야동|야설|포르노|자위|딸딸|딸치|오나홀|음경|음란|음부|질싸|질내|정액|펠라|애무|' ||
    '젖꼭지|젖가슴|유두|빨통|보빨|자빨|조건만남|원나잇|성매매|매춘|창녀|창년|걸레년|성폭|강간|윤간|몰카|도촬|변태|근친|수간|로리콘|쇼타콘|' ||
    -- 성적인 말 (영어)
    'sex(?!y)|porn|p0rn|penis|vagina|boob|tits|nipple|orgasm|horny|blowjob|handjob|dildo|jizz|milf|hentai|nude|naked|xxx|nsfw|' ||
    'slut|whore|hooker|incest|fetish|bdsm|onlyfans|pedophil|pedofil|cocksuck|' ||
    -- 혐오·차별
    '김치녀|된장녀|한남충|맘충|급식충|틀딱|노인충|똥꼬충|메갈|워마드|일베|홍어|짱깨|짱개|쪽바리|깜둥|흑형|애자|찐따|장애새|' ||
    'nigg|nigga|negro|chink|kike|faggot|fag|tranny|retard|' ||
    -- 극단주의·범죄·마약·자해
    '나치|히틀러|테러|학살|살인마|자살|자해|마약|필로폰|히로뽕|대마초|코카인|' ||
    'nazi|hitler|kkk|jihad|terror|suicide|killyourself|cocaine' ||
    ')';
begin
  return regexp_replace(low, '[^a-z가-힣ㄱ-ㅎㅏ-ㅣ]', '', 'g') ~ words
      or regexp_replace(translate(low, '013457@$!', 'oieastasi'), '[^a-z가-힣ㄱ-ㅎㅏ-ㅣ]', '', 'g') ~ words
      or regexp_replace(low, '[^가-힣ㄱ-ㅎㅏ-ㅣ]', '', 'g') ~ words;
end $$;

-- 닉네임 정하기/바꾸기. 결과: ok | invalid | reserved | blocked | taken | too_soon | signed_out
create or replace function public.set_nickname(name text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  clean text := btrim(coalesce(name, ''));
  last_change timestamptz;
begin
  if uid is null then return 'signed_out'; end if;
  if char_length(clean) not between 2 and 12
     or clean ~ '[\x01-\x1f\x7f-\x9f\u00ad\u034f\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]' then
    return 'invalid';
  end if;
  -- 운영자·시스템으로 오해할 수 있는 이름
  if lower(replace(clean, ' ', '')) ~ '(admin|운영자|관리자|운영진|관리팀|supabase|system|시스템|official|공식|moderator)' then
    return 'reserved';
  end if;
  -- 욕설·성적인 말·혐오·차별·마약·자해·범죄 같은 부적절한 말 (nick_blocked)
  if public.nick_blocked(clean) then
    return 'blocked';
  end if;
  select p.nickname_changed_at into last_change from public.profiles p where p.id = uid;
  if last_change is not null and last_change > now() - interval '30 seconds' then
    return 'too_soon';
  end if;
  begin
    insert into public.profiles (id, nickname, nickname_changed_at) values (uid, clean, now())
    on conflict (id) do update set nickname = excluded.nickname, nickname_changed_at = now();
  exception when unique_violation then
    return 'taken';
  end;
  return 'ok';
end $$;

-- 예전 점수 등록 함수(브라우저가 점수를 직접 보냄)는 없앤다
drop function if exists public.submit_score(integer, integer, integer);

-- 판 표 받기. 로그인(손님 포함)만 하면 되고 닉네임은 없어도 된다. 2초에 한 번, 하루 1000번까지. 못 받으면 빈 결과.
-- 새 표를 받으면 아직 안 쓴 이전 표는 닫는다(여러 표를 받아 두고 좋은 판만 고르기 어렵게).
create or replace function public.start_run()
returns table (id uuid, seed integer)
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  new_seed integer;
begin
  if uid is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  if exists (select 1 from public.runs r where r.user_id = uid and r.created_at > now() - interval '2 seconds') then return; end if;
  if (select count(*) from public.runs r where r.user_id = uid and r.created_at > now() - interval '1 day') >= 1000 then return; end if;
  update public.runs r set closed_at = now() where r.user_id = uid and r.closed_at is null;
  delete from public.runs r where r.user_id = uid and r.created_at < now() - interval '2 days';
  -- 예측할 수 없는 난수(gen_random_uuid)에서 1 ~ 2^28 사이 시드를 만든다
  new_seed := ('x' || substr(md5(gen_random_uuid()::text), 1, 7))::bit(28)::integer + 1;
  insert into public.runs (user_id, seed) values (uid, new_seed) returning runs.id into new_id;
  return query select new_id, new_seed;
end $$;

-- 손님도 랭킹에 보이는지 (설정 스위치). 게임도 안내 문구를 고르려고 읽는다.
create or replace function public.guests_ranked()
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select r.guests_ranked from public.ranking_settings r where r.id), true);
$$;

-- 랭킹에 보이는 사람인지: 닉네임이 있고, 손님이면 스위치가 켜져 있어야 한다.
create or replace function public.on_board(p_user uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = p_user)
     and (public.guests_ranked() or not coalesce((select u.is_anonymous from auth.users u where u.id = p_user), false));
$$;

-- 한 사람의 순위와 최고 점수. 순위는 랭킹에 보이는 사람끼리만 센다(보이지 않으면 rank 는 null).
-- 다른 함수 안에서만 쓴다(밖에서는 못 부른다).
create or replace function public.rank_of(p_user uuid)
returns table (rank bigint, best integer)
language sql stable security definer set search_path = '' as $$
  with me as (select max(s.score) as best from public.scores s where s.user_id = p_user),
       b as (select x.user_id, x.best
             from (select s.user_id, max(s.score) as best from public.scores s group by s.user_id) x
             where public.on_board(x.user_id))
  select case when public.on_board(p_user) then (select count(*) from b where b.best > me.best) + 1 end,
         me.best
  from me where me.best is not null;
$$;

-- 검증된 한 판 등록. 서버 함수(service_role)만 부를 수 있다. p_duration: 다시 돌려 본 판의 게임 시간(초).
-- 결과 status: ok | no_user | invalid | bad_run | too_fast | daily_limit (+ rank, best)
-- 닉네임이 없어도 점수는 남긴다(rank 는 null). 닉네임을 정하는 순간 랭킹에 보인다.
create or replace function public.record_run(p_user uuid, p_run uuid, p_score integer, p_max_combo integer,
                                             p_biggest integer, p_duration double precision)
returns table (status text, rank bigint, best integer)
language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
begin
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    return query select 'no_user'::text, null::bigint, null::integer; return;
  end if;
  if p_score is null or p_max_combo is null or p_biggest is null or p_duration is null
     or p_score not between 0 and 1000000 or p_max_combo not between 0 and 500 or p_biggest not between 0 and 72
     or p_duration not between 0 and 3600 then
    return query select 'invalid'::text, null::bigint, null::integer; return;
  end if;
  -- 같은 사람이 동시에 여러 번 보내도 한 번에 하나씩 검사하도록 줄 세운다
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  select * into r from public.runs x where x.id = p_run and x.user_id = p_user for update;
  -- 남의 표, 이미 쓴 표, 닫힌 표, 6시간 지난 표는 못 쓴다
  if not found or r.closed_at is not null or r.created_at < now() - interval '6 hours' then
    return query select 'bad_run'::text, null::bigint, null::integer; return;
  end if;
  -- 게임 시간은 실제로 흐른 시간보다 길 수 없다(표를 받은 뒤 그만큼 시간이 지나야 한다)
  if r.created_at > now() - make_interval(secs => greatest(p_duration - 1, 0)) then
    return query select 'too_fast'::text, null::bigint, null::integer; return;
  end if;
  if (select count(*) from public.scores s where s.user_id = p_user and s.created_at > now() - interval '1 day') >= 300 then
    return query select 'daily_limit'::text, null::bigint, null::integer; return;
  end if;
  update public.runs x set closed_at = now() where x.id = p_run;
  insert into public.scores (user_id, run_id, score, max_combo, biggest) values (p_user, p_run, p_score, p_max_combo, p_biggest);
  return query select 'ok'::text, m.rank, m.best from public.rank_of(p_user) m;
end $$;

-- 전체 TOP N: 사람마다 최고 점수 1개. is_me 는 서버가 로그인 토큰으로 판단한다(user_id는 내보내지 않는다).
drop function if exists public.leaderboard(integer);
create or replace function public.leaderboard(lim integer default 10)
returns table (rank bigint, nickname text, score integer, max_combo integer, created_at timestamptz, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with best as (
    select distinct on (s.user_id) s.user_id, s.score, s.max_combo, s.created_at
    from public.scores s
    order by s.user_id, s.score desc, s.created_at
  )
  select row_number() over (order by b.score desc, b.created_at), p.nickname, b.score, b.max_combo, b.created_at,
         b.user_id = auth.uid()
  from best b join public.profiles p on p.id = b.user_id
  join auth.users u on u.id = b.user_id
  where public.guests_ranked() or not u.is_anonymous
  order by b.score desc, b.created_at
  limit least(greatest(coalesce(lim, 10), 1), 50);
$$;

-- 내 기록 TOP 10 (로그인한 본인 것만)
create or replace function public.my_top()
returns table (score integer, max_combo integer, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.score, s.max_combo, s.created_at from public.scores s
  where s.user_id = auth.uid()
  order by s.score desc, s.created_at
  limit 10;
$$;

-- 내 전체 순위와 최고 점수 (기록이 없거나 로그인 안 했으면 빈 결과, 닉네임이 없으면 rank 는 null)
create or replace function public.my_rank()
returns table (rank bigint, best integer)
language sql stable security definer set search_path = '' as $$
  select m.rank, m.best from public.rank_of(auth.uid()) m;
$$;

-- 손님 기록을 Google 계정으로 옮기기. 서버 함수(merge-guest)만 부른다. 그 함수가 두 로그인 토큰으로
-- "이 손님 계정을 가진 사람"이 "이 Google 계정으로 막 로그인한 사람"과 같은 브라우저임을 확인한 뒤에 부른다.
--   - Google 계정에 닉네임이 없으면(처음 로그인): 손님의 닉네임과 기록을 통째로 넘긴다.
--   - 이미 닉네임이 있으면: 손님 최고 기록이 더 높을 때만 그 한 판을 옮긴다(높은 쪽이 남는다).
-- 손님 쪽 나머지(닉네임, 남은 점수, 판 표)는 지운다. 손님 계정 자체는 서버 함수가 지운다.
-- 결과: ok | not_guest | not_user
create or replace function public.merge_guest(p_guest uuid, p_user uuid)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  g_nick text;
  g_best_id bigint;
  g_best integer;
  u_best integer;
begin
  if p_guest is null or p_user is null or p_guest = p_user
     or not exists (select 1 from auth.users u where u.id = p_guest and u.is_anonymous) then
    return 'not_guest';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user and not u.is_anonymous) then
    return 'not_user';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_guest::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  select p.nickname into g_nick from public.profiles p where p.id = p_guest;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    delete from public.profiles p where p.id = p_guest;
    if g_nick is not null then
      -- 닉네임 변경 간격(30초)에 걸리지 않게 조금 전에 바꾼 것으로 둔다
      insert into public.profiles (id, nickname, nickname_changed_at) values (p_user, g_nick, now() - interval '1 minute');
    end if;
    update public.scores s set user_id = p_user where s.user_id = p_guest;
  else
    select s.id, s.score into g_best_id, g_best from public.scores s
      where s.user_id = p_guest order by s.score desc, s.created_at limit 1;
    select max(s.score) into u_best from public.scores s where s.user_id = p_user;
    if g_best_id is not null and g_best > coalesce(u_best, -1) then
      update public.scores s set user_id = p_user where s.id = g_best_id;
    end if;
  end if;
  delete from public.scores s where s.user_id = p_guest;
  delete from public.runs r where r.user_id = p_guest;
  delete from public.profiles p where p.id = p_guest;
  return 'ok';
end $$;

-- 오래된 빈 손님 계정 정리: 기록이 하나도 없고 30일 동안 접속하지 않은 손님 계정을 지운다.
-- 기록이 있는 손님 계정은 지우지 않는다(랭킹에서 이름이 갑자기 사라지지 않게). 매일 한 번 자동 실행(맨 아래 pg_cron).
create or replace function public.cleanup_guests()
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  n integer;
begin
  delete from auth.users u
  where u.is_anonymous
    and u.created_at < now() - interval '30 days'
    and not exists (select 1 from public.scores s where s.user_id = u.id)
    and not exists (select 1 from auth.sessions x where x.user_id = u.id
                    and coalesce(x.updated_at, x.created_at) > now() - interval '30 days');
  get diagnostics n = row_count;
  return n;
end $$;

-- 실행 권한: 기본으로 모두에게 열려 있으므로 먼저 전부 닫고 필요한 만큼만 연다
revoke all on function public.my_profile(), public.set_nickname(text), public.start_run(),
  public.record_run(uuid, uuid, integer, integer, integer, double precision), public.rank_of(uuid),
  public.merge_guest(uuid, uuid), public.cleanup_guests(), public.nick_blocked(text),
  public.guests_ranked(), public.on_board(uuid),
  public.leaderboard(integer), public.my_top(), public.my_rank() from public, anon, authenticated;
grant execute on function public.leaderboard(integer), public.guests_ranked() to anon, authenticated;
grant execute on function public.my_profile(), public.set_nickname(text), public.start_run(),
  public.my_top(), public.my_rank() to authenticated;
-- 점수 넣기는 판을 다시 돌려 확인한 서버 함수만 (브라우저의 로그인 사용자도 못 부른다)
grant execute on function public.record_run(uuid, uuid, integer, integer, integer, double precision) to service_role;
-- 손님 기록 옮기기도 두 계정을 확인한 서버 함수만
grant execute on function public.merge_guest(uuid, uuid) to service_role;

-- ------------------------------------------------------------------ 매일 정리 (pg_cron)
-- 이름이 같은 작업은 덮어쓴다. 매일 04:17(UTC)에 빈 손님 계정을 지운다.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('ss-cleanup-guests', '17 4 * * *', 'select public.cleanup_guests()');
