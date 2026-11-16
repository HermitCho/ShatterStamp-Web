import type { SupabaseClient } from "@supabase/supabase-js";
import { simulateRun, type Replay } from "../core/replay.ts";
import { captchaToken } from "./captcha.ts";
import { getLang } from "./i18n.ts";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./online-config.ts";

/**
 * 온라인 랭킹: 손님 계정(로그인 없이), Google 로그인, 닉네임, 점수 등록, 전체/내 TOP 10.
 * 처음 온 사람은 보이지 않게 손님 계정이 생겨 첫 판부터 기록이 남는다. 닉네임을 정하면 랭킹에 보인다.
 * 손님이 Google로 로그인하면 손님 기록을 그 계정으로 옮긴다(높은 쪽이 남는다).
 * Supabase 라이브러리는 첫 화면을 가볍게 두려고 처음 쓸 때 따로 불러온다.
 * 디버그 주소 ?rankmock=1 이면 서버 없이 가짜 데이터로 화면만 확인할 수 있다.
 */

export interface LeaderRow {
  rank: number;
  nickname: string;
  score: number;
  maxCombo: number;
  at: Date;
  mine: boolean;
}

export interface MyRow {
  score: number;
  maxCombo: number;
  at: Date;
}

/** 서버가 판마다 내주는 표: 이 시드로 보드를 만들고, 판이 끝나면 이 번호로 기록을 올린다 */
export interface RunTicket {
  id: string;
  seed: number;
  /** 받은 시각(ms) */
  at: number;
}

export interface RunSubmit {
  run: string;
  replay: Replay;
  /** 게임이 계산한 점수(서버는 쓰지 않는다. 서버 계산과 다르면 로그로 남긴다) */
  score: number;
}

export type SubmitResult =
  | { ok: true; rank: number | null; best?: number | null }
  | { ok: false; reason: "guest" | "error" | "off" | "limit" | "rejected" | "outdated" };

export interface Online {
  /** Supabase 연결 정보가 있는지 (없으면 랭킹은 "준비 중") */
  readonly configured: boolean;
  /** 계정(손님 포함)이 있으면 닉네임(아직 안 정했으면 "") / 없으면 null */
  readonly nickname: string | null;
  /** 손님 계정인지 (Google 로그인 전) */
  readonly guest: boolean;
  /** 지금 계정을 구분하는 값(바뀌었는지 볼 때만 쓴다) / 계정이 없으면 null */
  readonly account: string | null;
  /** 손님도 랭킹에 보이는지 (서버 설정 스위치. 꺼져 있으면 손님은 Google 로그인해야 보인다) */
  readonly guestsRanked: boolean;
  /** 로그인·닉네임 상태가 바뀔 때 */
  onChange: () => void;
  init(): Promise<void>;
  /** 계정이 없으면 손님 계정을 만든다(사람 확인 포함). 이미 있거나 실패하면 그대로. */
  ensureGuest(): Promise<void>;
  /** Google 로그인. 손님이었으면 돌아온 뒤 손님 기록을 옮긴다. */
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** 성공하면 null, 실패하면 사용자에게 보여 줄 이유 키 */
  setNickname(name: string): Promise<NickError | null>;
  /** 다음 판의 표를 받는다. 받으면 그 전에 받은 표는 서버에서 무효가 된다. 못 받으면 null. */
  startRun(): Promise<RunTicket | null>;
  /** 한 판 기록을 올린다. 서버가 기록을 다시 돌려 점수를 계산하고 등록한다. */
  submitRun(s: RunSubmit): Promise<SubmitResult>;
  leaderboard(): Promise<LeaderRow[]>;
  myTop(): Promise<MyRow[]>;
  /** 닉네임이 없으면 rank 는 null(점수는 남아 있다) */
  myRank(): Promise<{ rank: number | null; best: number } | null>;
}

/** Google 로그인하러 가는 동안 손님 갱신 토큰을 맡겨 두는 곳(sessionStorage) */
const GUEST_KEY = "ss.guestRefresh";

/** 닉네임을 못 정한 이유 (화면 문구 키) */
export type NickError = "NICK_TAKEN" | "NICK_INVALID" | "NICK_RESERVED" | "NICK_BLOCKED" | "NICK_TOO_SOON" | "NET_ERROR";

/** 보이지 않는 글자·방향 바꾸는 글자·제어 문자 (서버 규칙과 같다. 최종 검사는 서버가 한다) */
const NICK_HIDDEN = /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/u;

/** 2~12자, 앞뒤 공백 없음, 보이지 않는 글자 없음 */
export function nickLooksValid(name: string): boolean {
  const n = [...name];
  return n.length >= 2 && n.length <= 12 && name === name.trim() && !NICK_HIDDEN.test(name);
}

export function createOnline(): Online {
  if (new URLSearchParams(location.search).has("rankmock")) return new MockOnline();
  return new SupabaseOnline();
}

// ---------------------------------------------------------------- Supabase

class SupabaseOnline implements Online {
  readonly configured = SUPABASE_URL !== "" && SUPABASE_ANON_KEY !== "";
  nickname: string | null = null;
  guest = false;
  guestsRanked = true;
  onChange = (): void => {};
  private client: SupabaseClient | null = null;
  private loading: Promise<SupabaseClient> | null = null;
  private userId: string | null = null;
  private guesting: Promise<void> | null = null;
  /** 처음 연결(로그인 복귀 처리 포함)이 끝났는지 */
  private ready = false;

  get account(): string | null {
    return this.userId;
  }

  /** 처음 부를 때 라이브러리를 받아 연결하고, 저장된 로그인(또는 로그인에서 돌아온 주소)을 읽는다 */
  private async db(): Promise<SupabaseClient> {
    if (this.client) return this.client;
    this.loading ??= import("@supabase/supabase-js").then(async ({ createClient }) => {
      const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true },
      });
      db.auth.onAuthStateChange((_event, session) => {
        const id = session?.user.id ?? null;
        this.guest = session?.user.is_anonymous === true;
        if (id === this.userId) return;
        this.userId = id;
        // 처음 연결하는 중이면(로그인에서 돌아와 손님 기록을 옮기는 중일 수 있다) 끝난 뒤 한 번에 읽는다
        if (!this.ready) return;
        // 콜백 안에서 다시 Supabase를 부르면 막힐 수 있어 다음 틱으로 미룬다
        setTimeout(() => void this.loadProfile(), 0);
      });
      const { data } = await db.auth.getSession();
      this.userId = data.session?.user.id ?? null;
      this.guest = data.session?.user.is_anonymous === true;
      this.client = db;
      // 로그인에서 돌아온 주소(?code=...)를 깨끗하게 되돌린다
      const url = new URL(location.href);
      if (url.searchParams.has("code")) {
        url.searchParams.delete("code");
        history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
      await this.mergeGuest(db);
      this.ready = true;
      await this.loadProfile();
      return db;
    });
    return this.loading;
  }

  /**
   * Google 로그인에서 막 돌아왔고 로그인 전에 손님이었으면, 손님 기록을 이 계정으로 옮긴다.
   * 손님 갱신 토큰은 로그인 직전에 이 탭에만(sessionStorage) 잠깐 맡겨 두고, 꺼내자마자 지운다.
   */
  private async mergeGuest(db: SupabaseClient): Promise<void> {
    let refresh: string | null = null;
    try {
      refresh = sessionStorage.getItem(GUEST_KEY);
      if (refresh) sessionStorage.removeItem(GUEST_KEY);
    } catch {
      return;
    }
    if (!refresh || !this.userId || this.guest) return;
    try {
      // 손님 토큰은 그사이 만료됐을 수 있어 맡겨 둔 갱신 토큰으로 새로 받는다(지금 로그인 상태는 건드리지 않는다)
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      const guestToken = res.ok ? ((await res.json()) as { access_token?: string }).access_token : undefined;
      if (!guestToken) return;
      const { error } = await db.functions.invoke("merge-guest", { body: { guest: guestToken } });
      if (error) console.warn("merge-guest failed", error);
    } catch {
      /* 못 옮겨도 로그인은 그대로 */
    }
  }

  /** 로그인 흔적이 있을 때만 바로 연결한다. 없으면 손님 계정을 만들 때까지 라이브러리를 받지 않는다(첫 화면을 가볍게). */
  async init(): Promise<void> {
    if (!this.configured) return;
    let stored = false;
    try {
      stored = Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    } catch {
      /* 저장소를 못 쓰면 로그인 유지도 안 된다 */
    }
    if (stored || new URLSearchParams(location.search).has("code")) await this.db();
  }

  private async loadProfile(): Promise<void> {
    if (!this.userId) {
      this.nickname = null;
    } else {
      const db = await this.db();
      // 표를 직접 읽지 않고 서버 함수가 로그인 토큰으로 내 닉네임만 돌려준다
      const [{ data }, rules] = await Promise.all([db.rpc("my_profile"), db.rpc("guests_ranked")]);
      this.nickname = typeof data === "string" ? data : "";
      if (typeof rules.data === "boolean") this.guestsRanked = rules.data;
    }
    this.onChange();
  }

  async ensureGuest(): Promise<void> {
    if (!this.configured) return;
    this.guesting ??= (async () => {
      const db = await this.db();
      if (this.userId) return;
      const token = await captchaToken(getLang());
      if (token === null || this.userId) return;
      const { error } = await db.auth.signInAnonymously(token ? { options: { captchaToken: token } } : undefined);
      if (error) console.warn("guest sign-in failed", error.message);
    })().catch(() => {
      /* 손님 계정 없이도 게임은 그대로 */
    }).finally(() => {
      this.guesting = null;
    });
    return this.guesting;
  }

  async signIn(): Promise<void> {
    if (!this.configured) return;
    const db = await this.db();
    try {
      sessionStorage.setItem("ss.afterLogin", "1");
      // 손님이었으면 돌아와서 기록을 옮길 수 있게 손님 갱신 토큰을 이 탭에 잠깐 맡긴다
      const { data } = await db.auth.getSession();
      if (data.session?.user.is_anonymous) sessionStorage.setItem(GUEST_KEY, data.session.refresh_token);
      else sessionStorage.removeItem(GUEST_KEY);
    } catch {
      /* 없어도 진행 */
    }
    await db.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    await this.client.auth.signOut();
    this.userId = null;
    this.guest = false;
    this.nickname = null;
    this.onChange();
  }

  async setNickname(name: string): Promise<NickError | null> {
    name = name.trim();
    if (!nickLooksValid(name)) return "NICK_INVALID";
    if (!this.userId) return "NET_ERROR";
    const db = await this.db();
    // 규칙·중복(대소문자 무시)·사칭·변경 간격 검사와 본인 확인은 서버 함수가 한다
    const { data, error } = await db.rpc("set_nickname", { name });
    if (error) return "NET_ERROR";
    if (data !== "ok") {
      const why: Record<string, NickError> = {
        invalid: "NICK_INVALID", reserved: "NICK_RESERVED", blocked: "NICK_BLOCKED", taken: "NICK_TAKEN", too_soon: "NICK_TOO_SOON",
      };
      return why[data as string] ?? "NET_ERROR";
    }
    this.nickname = name;
    this.onChange();
    return null;
  }

  async startRun(): Promise<RunTicket | null> {
    if (!this.configured || !this.userId) return null;
    try {
      const db = await this.db();
      const { data, error } = await db.rpc("start_run");
      const row = (data as { id: string; seed: number }[] | null)?.[0];
      if (error || !row) return null;
      return { id: row.id, seed: row.seed, at: Date.now() };
    } catch {
      return null;
    }
  }

  async submitRun(s: RunSubmit): Promise<SubmitResult> {
    if (!this.configured) return { ok: false, reason: "off" };
    if (!this.userId) return { ok: false, reason: "guest" };
    try {
      const db = await this.db();
      // 서버 함수가 로그인 토큰으로 누구인지 정하고, 표의 시드로 판을 다시 돌려 점수를 직접 계산한다
      const { data, error } = await db.functions.invoke("submit-run", { body: s });
      const res = data as { status?: string; rank?: number | null; best?: number | null } | null;
      if (error || !res?.status) return { ok: false, reason: "error" };
      if (res.status === "ok") return { ok: true, rank: res.rank == null ? null : Number(res.rank), best: res.best == null ? null : Number(res.best) };
      const reason = res.status === "signed_out" || res.status === "no_user" ? "guest"
        : res.status === "daily_limit" ? "limit" : res.status === "version" ? "outdated"
        : res.status === "rejected" || res.status === "bad_run" || res.status === "too_fast" || res.status === "invalid" ? "rejected"
        : "error";
      return { ok: false, reason };
    } catch {
      return { ok: false, reason: "error" };
    }
  }

  async leaderboard(): Promise<LeaderRow[]> {
    if (!this.configured) return [];
    const db = await this.db();
    const { data, error } = await db.rpc("leaderboard", { lim: 10 });
    if (error) throw error;
    // 내 줄인지(is_me)는 서버가 로그인 토큰으로 판단한다. 랭킹에는 내부 계정 번호가 오지 않는다.
    return (data as { rank: number; nickname: string; score: number; max_combo: number; created_at: string; is_me: boolean }[]).map((r) => ({
      rank: Number(r.rank), nickname: r.nickname, score: r.score, maxCombo: r.max_combo, at: new Date(r.created_at),
      mine: r.is_me === true,
    }));
  }

  async myTop(): Promise<MyRow[]> {
    if (!this.configured || !this.userId) return [];
    const db = await this.db();
    const { data, error } = await db.rpc("my_top");
    if (error) throw error;
    return (data as { score: number; max_combo: number; created_at: string }[]).map((r) => ({
      score: r.score, maxCombo: r.max_combo, at: new Date(r.created_at),
    }));
  }

  async myRank(): Promise<{ rank: number | null; best: number } | null> {
    if (!this.configured || !this.userId) return null;
    const db = await this.db();
    const { data, error } = await db.rpc("my_rank");
    if (error || !data?.length) return null;
    return { rank: data[0].rank == null ? null : Number(data[0].rank), best: data[0].best };
  }
}

// ---------------------------------------------------------------- 가짜 (화면 확인용)

class MockOnline implements Online {
  readonly configured = true;
  nickname: string | null = null;
  guest = false;
  /** ?rankmock=1&guestsoff 이면 손님 랭킹이 꺼진 서버처럼 */
  readonly guestsRanked = !new URLSearchParams(location.search).has("guestsoff");
  onChange = (): void => {};

  get account(): string | null {
    return this.nickname === null ? null : this.guest ? "mock-guest" : "mock-google";
  }
  private mine: MyRow[] = [];
  private others = [
    ["네온러너", 224180, 91], ["도장장인", 198340, 88], ["콤보왕", 176920, 74], ["mint", 151200, 63],
    ["파편수집가", 133870, 58], ["별빛", 120450, 52], ["STAMPER", 98760, 41], ["ggomi", 87300, 37],
    ["초보탈출", 64210, 22], ["kim", 51020, 19], ["zz", 40100, 12],
  ] as const;

  async init(): Promise<void> {
    if (new URLSearchParams(location.search).get("rankmock") === "in") {
      this.nickname = "나야나";
      const now = Date.now();
      this.mine = [142300, 118900, 97100, 88050, 61200, 59990, 43000, 31220, 20100, 9800, 5000]
        .map((score, i) => ({ score, maxCombo: Math.round(score / 2100), at: new Date(now - i * 86400000 * 0.7) }));
    }
    this.onChange();
  }

  async ensureGuest(): Promise<void> {
    if (this.nickname !== null) return;
    this.nickname = "";
    this.guest = true;
    this.onChange();
  }

  async signIn(): Promise<void> {
    // 손님이었으면 닉네임과 기록을 그대로 이어받는 것처럼 둔다
    if (!this.guest) this.nickname = "";
    this.guest = false;
    this.onChange();
  }

  async signOut(): Promise<void> {
    this.nickname = null;
    this.guest = false;
    this.mine = [];
    this.onChange();
  }

  async setNickname(name: string): Promise<NickError | null> {
    name = name.trim();
    if (!nickLooksValid(name)) return "NICK_INVALID";
    if (/admin|관리자|운영자/i.test(name)) return "NICK_RESERVED";
    if (/fuck|shit|sex(?!y)|porn|시발|씨발|병신|섹스|야동/i.test(name)) return "NICK_BLOCKED";
    if (this.others.some((o) => o[0].toLowerCase() === name.toLowerCase())) return "NICK_TAKEN";
    this.nickname = name;
    this.onChange();
    return null;
  }

  async startRun(): Promise<RunTicket | null> {
    if (this.nickname === null) return null;
    const id = `mock-${this.seeds.size}-${Date.now()}`;
    const seed = (Math.floor(Math.random() * 0x7ffffffe) + 1) | 0;
    // 진짜 서버처럼 새 표를 받으면 이전 표는 못 쓴다
    this.seeds.clear();
    this.seeds.set(id, seed);
    return { id, seed, at: Date.now() };
  }

  /** 가짜 서버도 진짜처럼 기록을 다시 돌려 점수를 계산한다(브라우저에서 리플레이 검증을 확인하는 용도) */
  lastSim: ReturnType<typeof simulateRun> | null = null;
  private seeds = new Map<string, number>();

  async submitRun(s: RunSubmit): Promise<SubmitResult> {
    if (this.nickname === null) return { ok: false, reason: "guest" };
    const seed = this.seeds.get(s.run);
    if (seed === undefined) return { ok: false, reason: "rejected" };
    this.seeds.delete(s.run);
    const sim = (this.lastSim = simulateRun(seed, s.replay));
    if (!sim.ok) return { ok: false, reason: sim.reason === "version" ? "outdated" : "rejected" };
    this.mine.push({ score: sim.score, maxCombo: sim.maxCombo, at: new Date() });
    const me = await this.myRank();
    return { ok: true, rank: me?.rank ?? null, best: me?.best ?? null };
  }

  async leaderboard(): Promise<LeaderRow[]> {
    const best = this.mine.length ? Math.max(...this.mine.map((m) => m.score)) : -1;
    const rows: { nickname: string; score: number; maxCombo: number; mine: boolean }[] =
      this.others.map(([nickname, score, maxCombo]) => ({ nickname, score, maxCombo, mine: false }));
    if (this.nickname && (this.guestsRanked || !this.guest) && best >= 0) rows.push({ nickname: this.nickname, score: best, maxCombo: Math.round(best / 2100), mine: true });
    rows.sort((a, b) => b.score - a.score);
    return rows.slice(0, 10).map((r, i) => ({ ...r, rank: i + 1, at: new Date() }));
  }

  async myTop(): Promise<MyRow[]> {
    return [...this.mine].sort((a, b) => b.score - a.score).slice(0, 10);
  }

  async myRank(): Promise<{ rank: number | null; best: number } | null> {
    if (!this.mine.length) return null;
    const best = Math.max(...this.mine.map((m) => m.score));
    const shown = this.nickname && (this.guestsRanked || !this.guest);
    return { rank: shown ? this.others.filter((o) => o[1] > best).length + 1 : null, best };
  }
}
