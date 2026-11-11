-- Shatter Stamp 보안 자체 점검.
-- schema.sql 을 실행한 뒤, SQL Editor → New query 에 이 파일 전체를 붙여 넣고 Run.
-- 로그인 안 한 방문자와 가짜 사용자 3명(A, B, C)이 되어 해킹·조작을 시도해 보고, 결과를 표로 보여 준다.
-- 시험 중에 만든 사용자·닉네임·점수는 마지막에 모두 되돌린다(실제 데이터는 바뀌지 않는다).
-- 모든 줄의 pass 가 true 여야 한다.

create or replace function pg_temp.ss_security_test()
returns table (no int, test text, expected text, got text, pass boolean)
language plpgsql as $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  names text[] := '{}';
  wants text[] := '{}';
  gots text[] := '{}';
  v text;
  ra1 uuid;
  ra2 uuid;
  ra3 uuid;
begin
  begin
    -- 시험용 사용자 (끝에서 되돌린다)
    insert into auth.users (id, aud, role, email) values
      (a, 'authenticated', 'authenticated', 'ss-test-a@example.invalid'),
      (b, 'authenticated', 'authenticated', 'ss-test-b@example.invalid'),
      (c, 'authenticated', 'authenticated', 'ss-test-c@example.invalid');

    -- ---------------------------------------------------------- 로그인 안 한 방문자(anon)
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    execute 'set local role anon';

    begin perform count(*) from public.scores; v := 'read'; exception when others then v := 'denied'; end;
    names := names || text '방문자: 점수 표 직접 읽기'; wants := wants || text 'denied'; gots := gots || v;
    begin perform count(*) from public.profiles; v := 'read'; exception when others then v := 'denied'; end;
    names := names || text '방문자: 닉네임 표 직접 읽기'; wants := wants || text 'denied'; gots := gots || v;
    begin perform count(*) from public.leaderboard(10); v := 'ok'; exception when others then v := 'denied'; end;
    names := names || text '방문자: 전체 랭킹 보기'; wants := wants || text 'ok'; gots := gots || v;
    begin perform public.start_run(); v := 'called'; exception when others then v := 'denied'; end;
    names := names || text '방문자: 판 표 받기'; wants := wants || text 'denied'; gots := gots || v;
    begin perform public.record_run(a, gen_random_uuid(), 999999, 1, 1, 60); v := 'called'; exception when others then v := 'denied'; end;
    names := names || text '방문자: 점수 넣기 함수 직접 부르기'; wants := wants || text 'denied'; gots := gots || v;
    begin perform public.set_nickname('해커'); v := 'called'; exception when others then v := 'denied'; end;
    names := names || text '방문자: 닉네임 만들기'; wants := wants || text 'denied'; gots := gots || v;
    begin insert into public.scores (user_id, score, max_combo, biggest) values (a, 999999, 1, 1); v := 'inserted'; exception when others then v := 'denied'; end;
    names := names || text '방문자: 남의 이름으로 점수 직접 넣기'; wants := wants || text 'denied'; gots := gots || v;
    execute 'reset role';

    -- ---------------------------------------------------------- 사용자 A
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', a::text, true);
    execute 'set local role authenticated';

    v := public.set_nickname('테스트에이');
    names := names || text 'A: 닉네임 정하기'; wants := wants || text 'ok'; gots := gots || v;
    select r.id into ra1 from public.start_run() r;
    names := names || text 'A: 판 표 받기'; wants := wants || text 'ok'; gots := gots || case when ra1 is null then 'none' else 'ok' end;
    select count(*)::text into v from public.start_run();
    names := names || text 'A: 2초 안에 표 또 받기(좋은 판 고르기)'; wants := wants || text '0'; gots := gots || v;
    begin perform public.record_run(a, ra1, 999999, 1, 1, 60); v := 'called'; exception when others then v := 'denied'; end;
    names := names || text 'A: 점수 넣기 함수 직접 부르기(검증 건너뛰기)'; wants := wants || text 'denied'; gots := gots || v;
    begin perform count(*) from public.runs; v := 'read'; exception when others then v := 'denied'; end;
    names := names || text 'A: 판 표(시드) 표 직접 읽기'; wants := wants || text 'denied'; gots := gots || v;
    execute 'reset role';

    -- ---------------------------------------------------------- 서버 함수(service_role)가 검증한 판을 넣는 경우
    execute 'set local role service_role';
    select r.status into v from public.record_run(a, ra1, 5000, 10, 10, 60) r;
    names := names || text '서버: 표 받자마자 60초짜리 판 등록'; wants := wants || text 'too_fast'; gots := gots || v;
    execute 'reset role';
    update public.runs set created_at = now() - interval '2 minutes' where id = ra1;  -- 2분 전에 받은 표로 만든다
    execute 'set local role service_role';
    select r.status into v from public.record_run(a, ra1, 5000, 10, 10, 60) r;
    names := names || text '서버: 정상 등록'; wants := wants || text 'ok'; gots := gots || v;
    select r.status into v from public.record_run(a, ra1, 9000, 10, 10, 60) r;
    names := names || text '서버: 같은 표로 또 등록'; wants := wants || text 'bad_run'; gots := gots || v;
    select r.status into v from public.record_run(a, gen_random_uuid(), 9000, 10, 10, 60) r;
    names := names || text '서버: 없는 표'; wants := wants || text 'bad_run'; gots := gots || v;
    select r.status into v from public.record_run(a, ra1, 5000000, 10, 10, 60) r;
    names := names || text '서버: 말도 안 되는 점수(500만)'; wants := wants || text 'invalid'; gots := gots || v;
    execute 'reset role';

    -- 새 표를 받으면 안 쓴 이전 표는 닫힌다
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', a::text, true);
    execute 'set local role authenticated';
    select r.id into ra2 from public.start_run() r;
    execute 'reset role';
    update public.runs set created_at = now() - interval '2 minutes' where id = ra2;
    execute 'set local role authenticated';
    select r.id into ra3 from public.start_run() r;
    execute 'reset role';
    update public.runs set created_at = now() - interval '2 minutes' where id = ra3;
    execute 'set local role service_role';
    select r.status into v from public.record_run(a, ra2, 5000, 10, 10, 60) r;
    names := names || text '서버: 새 표를 받은 뒤 이전 표로 등록'; wants := wants || text 'bad_run'; gots := gots || v;
    execute 'reset role';
    execute 'set local role authenticated';
    begin insert into public.scores (user_id, score, max_combo, biggest) values (a, 999999, 1, 1); v := 'inserted'; exception when others then v := 'denied'; end;
    names := names || text 'A: 점수 표에 직접 넣기'; wants := wants || text 'denied'; gots := gots || v;
    begin update public.scores set score = 999999; v := 'updated'; exception when others then v := 'denied'; end;
    names := names || text 'A: 점수 직접 고치기'; wants := wants || text 'denied'; gots := gots || v;
    begin delete from public.scores; v := 'deleted'; exception when others then v := 'denied'; end;
    names := names || text 'A: 점수 지우기'; wants := wants || text 'denied'; gots := gots || v;
    begin update public.profiles set nickname = '바꿔치기'; v := 'updated'; exception when others then v := 'denied'; end;
    names := names || text 'A: 닉네임 표 직접 고치기(남의 것 포함)'; wants := wants || text 'denied'; gots := gots || v;
    select count(*)::text into v from public.my_top();
    names := names || text 'A: 내 기록 보기'; wants := wants || text '1'; gots := gots || v;
    select count(*)::text into v from public.leaderboard(10) l where l.is_me;
    names := names || text 'A: 랭킹에서 내 줄 표시'; wants := wants || text '1'; gots := gots || v;
    v := public.set_nickname('바로또바꿈');
    names := names || text 'A: 30초 안에 닉네임 또 바꾸기'; wants := wants || text 'too_soon'; gots := gots || v;
    execute 'reset role';

    -- ---------------------------------------------------------- 사용자 B (A를 노린다)
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', b::text, true);
    execute 'set local role authenticated';

    v := public.set_nickname('테스트에이');
    names := names || text 'B: A와 같은 닉네임'; wants := wants || text 'taken'; gots := gots || v;
    v := public.set_nickname('테스트' || chr(8203) || '에이');
    names := names || text 'B: 보이지 않는 글자 섞어 A 흉내'; wants := wants || text 'invalid'; gots := gots || v;
    v := public.set_nickname('관리자짱');
    names := names || text 'B: 운영자 사칭 닉네임'; wants := wants || text 'reserved'; gots := gots || v;
    v := public.set_nickname(chr(12644) || chr(12644));  -- U+3164 한글 채움 문자 두 개
    names := names || text 'B: 빈칸처럼 보이는 글자만'; wants := wants || text 'invalid'; gots := gots || v;
    v := public.set_nickname('a');
    names := names || text 'B: 1글자'; wants := wants || text 'invalid'; gots := gots || v;
    select count(*)::text into v from public.start_run();
    names := names || text 'B: 닉네임 없이 판 표 받기'; wants := wants || text '0'; gots := gots || v;
    v := public.set_nickname('Tester');
    names := names || text 'B: 정상 닉네임'; wants := wants || text 'ok'; gots := gots || v;
    select count(*)::text into v from public.my_top();
    names := names || text 'B: 내 기록 보기에 A 기록이 섞이나'; wants := wants || text '0'; gots := gots || v;
    select count(*)::text into v from public.leaderboard(10) l where l.is_me;
    names := names || text 'B: 랭킹에서 A 줄을 내 것으로 보나'; wants := wants || text '0'; gots := gots || v;
    execute 'reset role';
    execute 'set local role service_role';
    select r.status into v from public.record_run(b, ra3, 9000, 10, 10, 60) r;
    names := names || text '서버: B 이름으로 A의 표 쓰기'; wants := wants || text 'bad_run'; gots := gots || v;
    execute 'reset role';

    -- ---------------------------------------------------------- 사용자 C
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', c::text, true);
    execute 'set local role authenticated';
    v := public.set_nickname('tester');
    names := names || text 'C: B와 대소문자만 다른 닉네임'; wants := wants || text 'taken'; gots := gots || v;
    execute 'reset role';

    -- 랭킹 결과에 내부 계정 번호가 나가는지 (함수가 돌려주는 칸 이름 검사)
    select string_agg(p.parameter_name, ',' order by p.ordinal_position) into v
    from information_schema.parameters p join information_schema.routines r on r.specific_name = p.specific_name
    where r.routine_schema = 'public' and r.routine_name = 'leaderboard' and p.parameter_mode = 'OUT';
    names := names || text '랭킹에 user_id 가 나가나'; wants := wants || text 'no user_id';
    gots := gots || case when v like '%user_id%' then 'user_id exposed' else 'no user_id' end;

    -- 시험 데이터 되돌리기
    raise exception using errcode = 'P0099', message = 'rollback test data';
  exception when sqlstate 'P0099' then
    null;
  end;

  return query
    select i, names[i], wants[i], gots[i], wants[i] = gots[i]
    from generate_subscripts(names, 1) as i;
end $$;

select * from pg_temp.ss_security_test();
