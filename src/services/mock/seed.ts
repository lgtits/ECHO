// 示範資料：日期以「現在」為基準產生，任何時候打開都像正在聚會中。

import { nextSunday, toYmd } from '@/utils/time';
import type { DbPost, DbReply, DbSession, DbUpvote, MockDb } from './db';
import { DB_VERSION } from './db';

const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function genCode(taken: Set<string>): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!taken.has(c)) return c;
  }
}

/** 示範用的會友留言，也供「模擬會友活動」使用 */
export const SAMPLE_POSTS = [
  '「稱義」和「成聖」的差別是什麼？兩者是同時發生的嗎？',
  '如果信心軟弱的時候，還算是「因信稱義」嗎？',
  '保羅說「患難生忍耐」，實際生活中要怎麼操練？',
  '今天提到的「與神和好」，和一般人際的和好有什麼不同？',
  '想請牧師推薦一本關於羅馬書的入門書。',
  '「神的愛澆灌在我們心裡」，要怎麼經歷這份愛？',
  '我們還軟弱的時候基督就為我們死，這句話對我很有安慰。',
  '孩子問我「為什麼要禱告」，要怎麼跟他解釋比較好？',
  '小組可以怎麼延伸討論今天的經文？',
  '工作壓力很大的時候，要怎麼在患難中仍然歡喜？',
  '舊約的人也是因信稱義嗎？',
  '聽完很想重新讀一次羅馬書，謝謝牧師。',
];

const NICKNAMES = ['小明', '阿華', '恩恩', '小羊', '雅各', null, null, null];

const PAST = [
  ['信心的功課', '李牧師', '希伯來書 11:1–12'],
  ['在曠野中', '王牧師', '出埃及記 16:1–21'],
  ['愛的真諦', '王牧師', '哥林多前書 13:1–13'],
  ['安息的應許', '陳傳道', '希伯來書 4:1–11'],
  ['葡萄樹與枝子', '王牧師', '約翰福音 15:1–11'],
  ['浪子回家', '李牧師', '路加福音 15:11–32'],
  ['登山寶訓：八福', '王牧師', '馬太福音 5:1–12'],
  ['撒種的比喻', '陳傳道', '馬可福音 4:1–20'],
  ['大衛與歌利亞', '王牧師', '撒母耳記上 17:32–50'],
  ['以斯帖的勇氣', '李牧師', '以斯帖記 4:12–17'],
  ['好撒馬利亞人', '王牧師', '路加福音 10:25–37'],
  ['聖靈的果子', '王牧師', '加拉太書 5:16–26'],
  ['約拿的逃跑', '陳傳道', '約拿書 1:1–17'],
  ['主禱文', '王牧師', '馬太福音 6:9–13'],
  ['五餅二魚', '李牧師', '約翰福音 6:1–14'],
  ['尼希米重建城牆', '王牧師', '尼希米記 2:11–20'],
  ['馬大與馬利亞', '王牧師', '路加福音 10:38–42'],
  ['彼得三次不認主', '陳傳道', '路加福音 22:54–62'],
  ['以馬忤斯路上', '王牧師', '路加福音 24:13–35'],
  ['摩西的呼召', '李牧師', '出埃及記 3:1–12'],
  ['路得的忠誠', '王牧師', '路得記 1:6–18'],
  ['撒該的轉變', '王牧師', '路加福音 19:1–10'],
  ['挪亞方舟', '陳傳道', '創世記 6:9–22'],
  ['詩篇二十三篇', '王牧師', '詩篇 23'],
] as const;

const SAMPLE_REPLY =
  '稱義是一次性的、地位上的改變：神因著基督宣告我們為義。成聖是一生的過程，聖靈在我們裡面逐步更新生命。兩者都從信心開始，但稱義在信的那一刻就完成，成聖則持續到見主面的那一天。下週小組我們可以再多討論這一段。';

export function buildSeed(myUid: string): MockDb {
  const now = Date.now();
  const minAgo = (m: number) => new Date(now - m * 60000).toISOString();
  const sessions: DbSession[] = [];
  const posts: DbPost[] = [];
  const upvotes: DbUpvote[] = [];
  const replies: DbReply[] = [];
  const codes = new Set<string>(['K7PM2X']);
  let n = 0;
  const id = (p: string) => `${p}-${(++n).toString(36)}`;

  const addVotes = (postId: string, count: number, includeMe = false) => {
    for (let i = 0; i < count; i++)
      upvotes.push({ postId, userId: i === 0 && includeMe ? myUid : `fake-${postId}-${i}` });
  };

  // ── 進行中的場次
  const open: DbSession = {
    id: 'session-open',
    code: 'K7PM2X',
    title: '恩典的記號',
    speaker: '王牧師',
    scripture: '羅馬書 5:1–11',
    sermonDate: toYmd(new Date(now)),
    status: 'open',
    autoCloseAt: null,
    createdAt: minAgo(90),
  };
  sessions.push(open);

  const openPosts: Array<
    [
      string | null,
      number,
      number,
      string,
      { mine?: boolean; votedByMe?: boolean; hidden?: boolean; reply?: boolean }?,
    ]
  > = [
    ['小明', 3, 12, SAMPLE_POSTS[0]!, { reply: true, votedByMe: true }],
    [null, 5, 3, '今天的信息很受激勵，謝謝牧師分享自己軟弱時的經歷。', { mine: true }],
    [null, 6, 8, SAMPLE_POSTS[1]!],
    ['阿華', 8, 5, SAMPLE_POSTS[2]!],
    ['恩恩', 10, 2, SAMPLE_POSTS[3]!],
    ['小羊', 14, 0, '團購營養品有需要的私訊我，教會價打八折！', { hidden: true }],
    ['雅各', 18, 1, SAMPLE_POSTS[4]!],
    [null, 22, 0, SAMPLE_POSTS[6]!],
  ];
  for (const [nickname, ago, votes, body, o = {}] of openPosts) {
    const p: DbPost = {
      id: id('post'),
      sessionId: open.id,
      authorId: o.mine ? myUid : id('fake-author'),
      nickname,
      body,
      isHidden: !!o.hidden,
      hiddenByName: o.hidden ? '同工小華' : null,
      hiddenAt: o.hidden ? minAgo(ago - 1) : null,
      createdAt: minAgo(ago),
    };
    posts.push(p);
    addVotes(p.id, votes, o.votedByMe);
    if (o.reply) {
      replies.push({
        id: id('reply'),
        postId: p.id,
        sessionId: open.id,
        authorId: 'staff-pastor',
        authorName: '王牧師',
        body: SAMPLE_REPLY,
        createdAt: minAgo(1),
        updatedAt: minAgo(1),
      });
    }
  }

  // ── 草稿（下一個主日）
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const draftCode = genCode(codes);
  codes.add(draftCode);
  sessions.push({
    id: 'session-draft',
    code: draftCode,
    title: '盼望的根基',
    speaker: '王牧師',
    scripture: '彼得前書 1:3–9',
    sermonDate: nextSunday(nextWeek),
    status: 'draft',
    autoCloseAt: null,
    createdAt: minAgo(60 * 24),
  });

  // ── 過去的場次：每週一場，往回 24 週（測「載入更多」）
  const lastSunday = new Date(now);
  lastSunday.setDate(lastSunday.getDate() - (lastSunday.getDay() || 7));
  PAST.forEach(([title, speaker, scripture], i) => {
    const date = new Date(lastSunday);
    date.setDate(date.getDate() - i * 7);
    const code = genCode(codes);
    codes.add(code);
    const s: DbSession = {
      id: `session-past-${i}`,
      code,
      title,
      speaker,
      scripture,
      sermonDate: toYmd(date),
      status: 'closed',
      autoCloseAt: null,
      createdAt: new Date(date.getTime() + 9 * 3600000).toISOString(),
    };
    sessions.push(s);
    const count = i === 0 ? 6 : (i * 7) % 9;
    for (let k = 0; k < count; k++) {
      const created = new Date(date.getTime() + (11 * 60 + 5 + k * 4) * 60000).toISOString();
      const p: DbPost = {
        id: id('post'),
        sessionId: s.id,
        authorId: id('fake-author'),
        nickname: NICKNAMES[(i + k) % NICKNAMES.length] ?? null,
        body: SAMPLE_POSTS[(i * 3 + k) % SAMPLE_POSTS.length]!,
        isHidden: false,
        hiddenByName: null,
        hiddenAt: null,
        createdAt: created,
      };
      posts.push(p);
      addVotes(p.id, (k * 5 + i) % 9);
      if (k % 3 === 0) {
        replies.push({
          id: id('reply'),
          postId: p.id,
          sessionId: s.id,
          authorId: 'staff-pastor',
          authorName: speaker === '王牧師' ? '王牧師' : speaker,
          body: '謝謝你的提問。這段經文的重點在於神主動的恩典，我們的回應是信靠與順服。歡迎在小組中繼續分享。',
          createdAt: new Date(new Date(created).getTime() + 3600000).toISOString(),
          updatedAt: new Date(new Date(created).getTime() + 3600000).toISOString(),
        });
      }
    }
  });

  return { version: DB_VERSION, sessions, posts, upvotes, replies };
}
