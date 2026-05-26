import { Prisma } from '@prisma/client';
import {
  ITimeActivitySummary,
  ITimeDailySummary,
  IUserLifeAnalysisReportListReq,
  IUserLifeAnalysisReportListRes,
  UserLifeAnalysisReportListItem,
} from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getUID } from '@libs/session';
import { formatDateInTimezone, formatDuration, minutesBetween, splitTimeRangeByDay } from '@utils/time';

const DAY_MS = 24 * 60 * 60 * 1000;

const LIFE_ANALYSIS_PROFILE = {
  gender: 'male',
  birthDate: '1996-05-04',
  lifeStage: 'preconception',
  workMode: 'remote_relaxed',
  constraints: ['偶尔去公司，约三个月一次，往返通勤约4小时'],
  goals: ['备孕调理', '提高睡眠', '减少熬夜', '增加运动', '减少屏幕时间'],
  changeIntensity: '循序渐进',
  idealRoutine: '早睡早起，但12点后容易睡不着',
  mustKeepActivities: ['钢琴', '学习', '运动', '工作'],
  body: { heightCm: 168, weightKg: 67 },
  healthNotes: ['近视600度以上', '眼睛经常胀', '无医生建议'],
  dietNotes: ['高蛋白', '低脂肪', '适量碳水', '不喝酒', '偶尔咖啡/茶', '每周约一次无糖可乐'],
  sleepNotes: ['睡眠主观质量不高', '醒来感觉没睡够', '常在7/8点醒一次后睡到9/10点', '午睡约30分钟'],
  moodNotes: ['情绪偏低', '人际交往后会恢复一些'],
  exerciseBase: '曾经身体状态极佳，热爱运动；当前以居家无氧为主，偶尔踢球',
};

const LIFE_ANALYSIS_PROMPT = `你是一名作息、时间分配与生活节律分析助手。请基于用户最近一段时间的时间记录，生成一篇中文分析文章，目标是帮助用户循序渐进地优化作息、睡眠、备孕状态、运动和屏幕使用。

重要边界：
1. 你不是医生，不做医学诊断，不替代医生建议。
2. 用户处于备孕状态，涉及备孕、睡眠、运动、饮食、情绪时要谨慎、温和、可执行。
3. 所有结论优先基于时间记录数据；不能从数据中证明的内容，要明确标注为“推测”或“需要确认”。
4. 不要制造焦虑，不要用极端建议。用户希望循序渐进调整。
5. 如果时间记录不完整，要说明不确定性。
6. “占位”记录不要当成真实活动解释，应视为未知时间或临时标记。
7. 建议必须具体到行为和时间窗口，避免空泛口号。

用户画像：
- 性别：男
- 出生日期：1996-05-04。分析时请根据当前日期自行计算年龄。
- 当前状态：备孕
- 职业状态：居家办公，工作较清闲
- 固定约束：基本无固定约束。偶尔去公司，频率约三个月一次，往返通勤总计约 4 小时
- 目标优先级：备孕调理、提高睡眠、减少熬夜、增加运动、减少屏幕时间
- 改变强度：循序渐进
- 理想作息：早睡早起。但用户晚上经常睡不着，尤其 12 点后更明显
- 必须保留活动：钢琴、学习、运动、工作
- 身高体重：168cm，67kg
- 医生建议：暂无明确医生建议
- 视力与眼睛：近视 600 度以上，眼睛经常有点胀
- 饮酒：不喝酒
- 熬夜：长期熬夜
- 咖啡因：咖啡和茶偶尔摄入，可以忽略
- 饮料：约一周一次无糖可乐
- 饮食偏好：比较重视高蛋白、低脂肪、适量碳水
- 主观睡眠质量：不太高，醒来经常感觉没睡够
- 早醒/赖床情况：早上一半情况下 7/8 点会醒一次，但仍然困，之后再睡到 9/10 点
- 情绪状态：情绪比较低沉；人际交往后会恢复一些
- 运动基础：曾经身体状态极佳，热爱运动；工作后运动减少
- 当前运动形式：主要是平板支撑、俯卧撑等居家无氧；偶尔踢球，约两个月一次
- 午睡习惯：有午睡习惯，一般午睡半小时左右

分析重点：睡眠节律、12点后活动、备孕友好度、运动恢复、眼睛负担、情绪与社交、必须保留活动的时间安排、午睡影响、占位/空白时间不确定性。

输出结构：一句话总评、最近周期的作息画像、时间分配结构、睡眠与恢复分析、熬夜与屏幕/刺激源分析、运动与备孕友好建议、工作学习钢琴安排、未来7天循序渐进计划、需要继续确认的问题。`;

const pad = (value: number) => String(value).padStart(2, '0');

const getLocalDayStartMs = (timeMs: number, timezoneOffset: number) => {
  const shifted = new Date(timeMs - timezoneOffset * 60 * 1000);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) + timezoneOffset * 60 * 1000;
};

const formatPeriodKey = (date: Date, timezoneOffset: number) => formatDateInTimezone(date, timezoneOffset).replace(/-/g, '');

const formatClock = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;

const ensureProfile = async (userId: number) => prisma.userLifeAnalysisProfile.upsert({
  where: { userId },
  create: {
    userId,
    profile: LIFE_ANALYSIS_PROFILE,
    prompt: LIFE_ANALYSIS_PROMPT,
  },
  update: {
    profile: LIFE_ANALYSIS_PROFILE,
    prompt: LIFE_ANALYSIS_PROMPT,
  },
});

const toReportItem = (report: Awaited<ReturnType<typeof prisma.userLifeAnalysisReport.findMany>>[number]): UserLifeAnalysisReportListItem => ({
  id: report.id,
  userId: report.userId,
  reportKey: report.reportKey,
  title: report.title,
  summary: report.summary,
  prompt: report.prompt,
  inputSnapshot: report.inputSnapshot,
  content: report.content,
  periodStart: report.periodStart.toISOString(),
  periodEnd: report.periodEnd.toISOString(),
  createdAt: report.createdAt.toISOString(),
  updatedAt: report.updatedAt.toISOString(),
});

const buildSnapshot = async (userId: number, range: { start: Date; end: Date }, timezoneOffset: number) => {
  const entries = await prisma.timeEntry.findMany({
    where: {
      userId,
      startedAt: { lt: range.end },
      endedAt: { gt: range.start },
    },
    orderBy: { startedAt: 'asc' },
    include: { activityType: true },
  });

  const dailyMap = new Map<string, ITimeDailySummary>();
  for (let cursor = range.start.getTime(); cursor < range.end.getTime(); cursor += DAY_MS) {
    dailyMap.set(formatDateInTimezone(cursor, timezoneOffset), { date: formatDateInTimezone(cursor, timezoneOffset), minutes: 0, byActivity: {} });
  }

  const activityMap = new Map<number, ITimeActivitySummary>();
  const rhythmSegments: { date: string; name: string; startMinute: number; endMinute: number; minutes: number }[] = [];
  const sleepSamples: { date: string; startedAt: string; endedAt: string; minutes: number }[] = [];
  let placeholderMinutes = 0;
  let latestEndMinute = 0;

  entries.forEach((entry) => {
    const activity = entry.activityType;
    const segments = splitTimeRangeByDay({ startedAt: entry.startedAt, endedAt: entry.endedAt }, range, timezoneOffset);
    let entryMinutes = 0;

    segments.forEach((segment) => {
      entryMinutes += segment.minutes;
      const daily = dailyMap.get(segment.date) ?? { date: segment.date, minutes: 0, byActivity: {} };
      daily.minutes += segment.minutes;
      daily.byActivity[String(activity.id)] = (daily.byActivity[String(activity.id)] ?? 0) + segment.minutes;
      const startedAtIso = segment.startedAt.toISOString();
      const endedAtIso = segment.endedAt.toISOString();
      if (!daily.firstStartedAt || startedAtIso < daily.firstStartedAt) daily.firstStartedAt = startedAtIso;
      if (!daily.lastEndedAt || endedAtIso > daily.lastEndedAt) daily.lastEndedAt = endedAtIso;
      dailyMap.set(segment.date, daily);
      rhythmSegments.push({
        date: segment.date,
        name: activity.name,
        startMinute: segment.startMinute,
        endMinute: segment.endMinute,
        minutes: segment.minutes,
      });
      latestEndMinute = Math.max(latestEndMinute, segment.endMinute);
    });

    if (entryMinutes <= 0) return;
    if (activity.name === '占位') {
      placeholderMinutes += entryMinutes;
      return;
    }

    const current = activityMap.get(activity.id) ?? {
      activityTypeId: activity.id,
      name: activity.name,
      color: activity.color,
      icon: activity.icon,
      minutes: 0,
      count: 0,
    };
    current.minutes += entryMinutes;
    current.count += 1;
    activityMap.set(activity.id, current);

    if (activity.name === '睡眠') {
      sleepSamples.push({
        date: formatDateInTimezone(entry.endedAt, timezoneOffset),
        startedAt: entry.startedAt.toISOString(),
        endedAt: entry.endedAt.toISOString(),
        minutes: minutesBetween(entry.startedAt, entry.endedAt),
      });
    }
  });

  const activitySummaries = [...activityMap.values()]
    .map((item) => ({ ...item, minutes: Math.round(item.minutes) }))
    .sort((left, right) => right.minutes - left.minutes);
  const dailySummaries = [...dailyMap.values()].map((item) => ({ ...item, minutes: Math.round(item.minutes) }));
  const totalMinutes = activitySummaries.reduce((sum, item) => sum + item.minutes, 0);
  const recordedDays = dailySummaries.filter((item) => item.minutes > 0).length;
  const averageSleepMinutes = sleepSamples.length
    ? Math.round(sleepSamples.reduce((sum, item) => sum + item.minutes, 0) / sleepSamples.length)
    : 0;

  return {
    periodStart: range.start.toISOString(),
    periodEnd: range.end.toISOString(),
    totalMinutes,
    recordedDays,
    placeholderMinutes,
    latestEndMinute,
    averageSleepMinutes,
    activitySummaries,
    dailySummaries,
    rhythmSegments,
    sleepSamples,
    timeEntries: entries.map((entry) => ({
      id: entry.id,
      activity: entry.activityType.name,
      startedAt: entry.startedAt.toISOString(),
      endedAt: entry.endedAt.toISOString(),
      minutes: minutesBetween(entry.startedAt, entry.endedAt),
      note: entry.note,
    })),
  };
};

const generateContent = (snapshot: Awaited<ReturnType<typeof buildSnapshot>>) => {
  const topActivities = snapshot.activitySummaries.slice(0, 6);
  const topActivityText = topActivities.length
    ? topActivities.map((item) => `- ${item.name}：${formatDuration(item.minutes)}，${item.count} 次`).join('\n')
    : '- 暂无足够活动记录';
  const sleepText = snapshot.averageSleepMinutes > 0
    ? `近一周有 ${snapshot.sleepSamples.length} 条睡眠样本，平均约 ${formatDuration(snapshot.averageSleepMinutes)}。`
    : '近一周没有明确的“睡眠”样本，睡眠判断需要继续补充记录。';
  const lateText = snapshot.latestEndMinute >= 24 * 60
    ? '记录中存在跨过午夜的活动，需要重点观察 12 点后的活动类型。'
    : `记录中最晚活动结束约在 ${formatClock(snapshot.latestEndMinute)}，仍建议继续观察 23:30 后的活动。`;

  return `## 一句话总评

这一周的记录适合先把目标放在“稳定睡眠锚点 + 温和恢复运动 + 减少 12 点后刺激源”，不要一次性重排生活。

## 最近周期的作息画像

本报告覆盖 ${snapshot.recordedDays} 个有记录日，总记录时长 ${formatDuration(snapshot.totalMinutes)}。如果你最近一周记录不完整，下面的判断应视为初步画像，而不是定论。

${sleepText}

${lateText}

## 时间分配结构

${topActivityText}

占位或未知时间约 ${formatDuration(snapshot.placeholderMinutes)}。这部分不应被解释成真实活动，只能提示记录完整度还有提升空间。

## 睡眠与恢复分析

你的主观反馈是睡眠质量不高、早上 7/8 点会醒但仍困，之后再睡到 9/10 点。结合备孕目标，第一优先级不是强迫早起，而是先把夜间入睡前 60 分钟做得更稳定：降低屏幕刺激、避免临睡前高强度学习或情绪波动、让身体形成固定的关机流程。

午睡可以保留，但建议先稳定在 20-30 分钟，并尽量放在 15:30 前。如果夜里更难睡，再考虑缩短午睡或提前午睡。

## 熬夜与屏幕/刺激源分析

12 点后睡不着通常不只是不困，也可能是屏幕、学习兴奋、情绪低沉后的补偿性拖延共同作用。建议接下来一周只做一个实验：23:30 后不安排新的学习/钢琴/工作任务，只允许收尾、洗漱、放松和低刺激阅读。

眼睛经常胀且近视 600 度以上，晚间屏幕和长时间近距离用眼需要单独标记。建议每晚记录一次“23:30 后是否还在看屏幕”，后续报告才能判断它和入睡困难的关系。

## 运动与备孕友好建议

你有较好的运动基础，不需要从零开始，但工作后运动减少，适合用低门槛恢复节律。未来一周建议 3 次居家力量，每次 15-25 分钟，以俯卧撑、平板支撑、深蹲或拉伸为主，不追求练爆。备孕阶段更重要的是规律、恢复和睡眠，不是短期强度。

## 工作、学习、钢琴安排

钢琴、学习、运动、工作都保留。建议把最需要脑力的学习放在白天或傍晚，把钢琴放在晚饭后到 22:30 前，把运动放在下午或傍晚。23:30 后不新增必须完成的任务，减少“越晚越清醒”的惯性。

## 未来 7 天循序渐进计划

1. 设一个睡前锚点：23:30 后只做低刺激收尾。
2. 午睡保留，但控制在 20-30 分钟，尽量不晚于 15:30。
3. 做 3 次 15-25 分钟居家力量，不追求强度，只追求完成。
4. 每天补一条睡眠记录，尽量包含开始和结束时间。
5. 标记 23:30 后屏幕使用，方便下次分析。

## 需要继续确认的问题

- 最近一周时间记录完整度大约是多少？
- “睡眠”“午睡”“学习”“屏幕/娱乐”这些活动类型是否已经稳定区分？
- 12 点后最常见的活动到底是学习、娱乐、刷手机、还是躺着睡不着？
- 眼睛胀更常出现在白天工作后，还是夜间屏幕后？`;
};

const ensureLatestReport = async (userId: number, prompt: string, timezoneOffset: number) => {
  const endMs = getLocalDayStartMs(Date.now(), timezoneOffset) + DAY_MS;
  const startMs = endMs - 7 * DAY_MS;
  const range = { start: new Date(startMs), end: new Date(endMs) };
  const reportKey = `life-week-${formatPeriodKey(range.start, timezoneOffset)}-${formatPeriodKey(new Date(range.end.getTime() - 1), timezoneOffset)}`;
  const existingReport = await prisma.userLifeAnalysisReport.findFirst({
    where: {
      userId,
      periodStart: { lt: range.end },
      periodEnd: { gt: range.start },
    },
  });
  if (existingReport) return;

  const snapshot = await buildSnapshot(userId, range, timezoneOffset);
  const title = `近 7 天作息与时间分配分析`;
  const summary = `覆盖 ${snapshot.recordedDays} 个有记录日，记录 ${formatDuration(snapshot.totalMinutes)}；重点观察睡眠、熬夜、运动恢复和屏幕刺激。`;
  const content = generateContent(snapshot);

  await prisma.userLifeAnalysisReport.upsert({
    where: { userId_reportKey: { userId, reportKey } },
    create: {
      userId,
      reportKey,
      title,
      summary,
      periodStart: range.start,
      periodEnd: range.end,
      prompt,
      inputSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      content,
    },
    update: {},
  });
};

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const profile = await ensureProfile(uid);
    const body = (await req.json().catch(() => ({}))) as IUserLifeAnalysisReportListReq;
    const timezoneOffset = Number.isFinite(body.timezoneOffsetMinutes)
      ? Number(body.timezoneOffsetMinutes)
      : new Date().getTimezoneOffset();

    if (body.ensureLatest !== false) {
      await ensureLatestReport(uid, profile.prompt, timezoneOffset);
    }

    const reports = await prisma.userLifeAnalysisReport.findMany({
      where: { userId: uid },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return success<IUserLifeAnalysisReportListRes>({ reports: reports.map(toReportItem) });
  } catch (error) {
    return fail(error);
  }
}