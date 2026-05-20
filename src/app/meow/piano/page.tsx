'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, List, NavBar, Selector, Toast } from 'antd-mobile';
import { DeleteOutline, RightOutline } from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';
import styles from './piano.module.scss';

type Clef = 'treble' | 'bass';
type ClefMode = Clef | 'random';
type Difficulty = 'basic' | 'weak' | 'high' | 'mixed';
type GamePhase = 'idle' | 'playing' | 'finished';
type NoteName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
type ScaleDegree = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface PianoNote {
  clef: Clef;
  name: NoteName;
  octave: number;
  degree: ScaleDegree;
  label: string;
}

interface PianoSessionRecord {
  id: string;
  createdAt: string;
  difficulty: Difficulty;
  clefMode: ClefMode;
  questionCount: number;
  totalTimeMs: number;
  avgTimeMs: number;
  wrongAttempts: number;
  accuracy: number;
}

interface Feedback {
  type: 'correct' | 'wrong';
  text: string;
}

const HISTORY_KEY = 'meow.piano.sessions';
const MAX_HISTORY = 50;
const QUESTION_COUNTS = Array.from({ length: 10 }, (_, index) => (index + 1) * 10);
const NOTE_NAMES: NoteName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ANSWER_OPTIONS = NOTE_NAMES.map((name, index) => ({
  name,
  degree: (index + 1) as ScaleDegree,
  label: `${index + 1}(${name})`,
}));
const NOTE_INDEX: Record<NoteName, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};
const DIFFICULTIES: Array<{ value: Difficulty; label: string; description: string }> = [
  { value: 'basic', label: '基础 1-5', description: '只出 1(C) 到 5(G)，先把熟悉区域刷快。' },
  { value: 'weak', label: '强化 6/7', description: '重点抽 6(A)、7(B)，少量混入 1-5。' },
  { value: 'high', label: '高音区 1-7', description: '练更高位置的完整 1-7。' },
  { value: 'mixed', label: '综合', description: '混合不同区域，适合测试整体反应。' },
];
const CLEF_MODES: Array<{ value: ClefMode; label: string }> = [
  { value: 'treble', label: '高音谱' },
  { value: 'bass', label: '低音谱' },
  { value: 'random', label: '随机' },
];

export default function PianoPage() {
  const router = useRouter();
  const [difficulty, setDifficulty] = useState<Difficulty>('basic');
  const [clefMode, setClefMode] = useState<ClefMode>('random');
  const [questionCount, setQuestionCount] = useState(20);
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [questions, setQuestions] = useState<PianoNote[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState(0);
  const [questionStartedAt, setQuestionStartedAt] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [currentMistakes, setCurrentMistakes] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [history, setHistory] = useState<PianoSessionRecord[]>([]);
  const [result, setResult] = useState<PianoSessionRecord | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const timer = window.setInterval(() => setNowMs(performance.now()), 100);
    return () => window.clearInterval(timer);
  }, [phase]);

  const currentNote = questions[currentIndex];
  const elapsedMs = phase === 'playing' && sessionStartedAt > 0 ? nowMs - sessionStartedAt : result?.totalTimeMs ?? 0;
  const currentElapsedMs = phase === 'playing' && questionStartedAt > 0 ? nowMs - questionStartedAt : 0;
  const difficultyMeta = DIFFICULTIES.find((item) => item.value === difficulty) ?? DIFFICULTIES[0];
  const bestSession = useMemo(() => getBestSession(history), [history]);

  const startGame = () => {
    const nextQuestions = Array.from({ length: questionCount }, () => generateQuestion(difficulty, clefMode));
    const startedAt = performance.now();
    setQuestions(nextQuestions);
    setCurrentIndex(0);
    setWrongAttempts(0);
    setCurrentMistakes(0);
    setFeedback(null);
    setResult(null);
    setIsAdvancing(false);
    setSessionStartedAt(startedAt);
    setQuestionStartedAt(startedAt);
    setNowMs(startedAt);
    setPhase('playing');
  };

  const resetGame = () => {
    setPhase('idle');
    setQuestions([]);
    setCurrentIndex(0);
    setFeedback(null);
    setResult(null);
    setWrongAttempts(0);
    setCurrentMistakes(0);
    setIsAdvancing(false);
  };

  const finishGame = (finishedAt: number) => {
    const totalTimeMs = Math.max(1, Math.round(finishedAt - sessionStartedAt));
    const accuracy = questionCount / (questionCount + wrongAttempts);
    const record: PianoSessionRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      difficulty,
      clefMode,
      questionCount,
      totalTimeMs,
      avgTimeMs: Math.round(totalTimeMs / questionCount),
      wrongAttempts,
      accuracy,
    };
    const nextHistory = [record, ...history].slice(0, MAX_HISTORY);
    setHistory(nextHistory);
    saveHistory(nextHistory);
    setResult(record);
    setPhase('finished');
    setFeedback(null);
    Toast.show({ content: `完成：${formatTime(totalTimeMs)}` });
  };

  const answer = (degree: ScaleDegree) => {
    if (phase !== 'playing' || !currentNote || isAdvancing) return;

    if (degree !== currentNote.degree) {
      const nextMistakes = currentMistakes + 1;
      setWrongAttempts((count) => count + 1);
      setCurrentMistakes(nextMistakes);
      setFeedback({ type: 'wrong', text: `再看一下，当前不是 ${formatAnswer(degree)}` });
      return;
    }

    const answeredAt = performance.now();
    setFeedback({
      type: 'correct',
      text: currentMistakes > 0 ? `答对了：${currentNote.label}` : `很好：${currentNote.label}`,
    });

    if (currentIndex >= questions.length - 1) {
      finishGame(answeredAt);
      return;
    }

    setIsAdvancing(true);
    window.setTimeout(() => {
      const nextStartedAt = performance.now();
      setCurrentIndex((index) => index + 1);
      setCurrentMistakes(0);
      setFeedback(null);
      setQuestionStartedAt(nextStartedAt);
      setNowMs(nextStartedAt);
      setIsAdvancing(false);
    }, 260);
  };

  const clearHistory = async () => {
    const ok = await Dialog.confirm({ title: '清除历史记录', content: '本地成绩记录会被删除，无法恢复。' });
    if (!ok) return;
    setHistory([]);
    saveHistory([]);
    Toast.show({ content: '已清除历史记录' });
  };

  return (
    <div className={styles.page}>
      <NavBar onBack={() => router.back()} className={styles.nav}>钢琴识谱</NavBar>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Sight Reading</div>
          <h1>看谱，按下正确的音</h1>
          <p>高音谱和低音谱随机出题，记录完成整组练习的总时间。</p>
        </div>
        <div className={styles.heroMark}>♪</div>
      </section>

      {phase !== 'playing' && (
        <section className={styles.panel}>
          <div className={styles.panelTitle}>练习设置</div>

          <div className={styles.settingBlock}>
            <div className={styles.settingLabel}>难度</div>
            <Selector
              options={DIFFICULTIES.map((item) => ({ label: item.label, value: item.value }))}
              value={[difficulty]}
              onChange={(value) => {
                if (value[0]) setDifficulty(value[0] as Difficulty);
              }}
            />
            <div className={styles.settingHint}>{difficultyMeta.description}</div>
          </div>

          <div className={styles.settingBlock}>
            <div className={styles.settingLabel}>谱号</div>
            <Selector
              options={CLEF_MODES}
              value={[clefMode]}
              onChange={(value) => {
                if (value[0]) setClefMode(value[0] as ClefMode);
              }}
            />
          </div>

          <div className={styles.settingBlock}>
            <div className={styles.settingLabel}>题目数量</div>
            <Selector
              options={QUESTION_COUNTS.map((count) => ({ label: `${count}`, value: `${count}` }))}
              value={[String(questionCount)]}
              onChange={(value) => {
                const nextCount = Number(value[0]);
                if (QUESTION_COUNTS.includes(nextCount)) setQuestionCount(nextCount);
              }}
              className={styles.countSelector}
            />
          </div>

          <Button block color="primary" size="large" onClick={startGame}>
            开始练习
          </Button>
        </section>
      )}

      {phase === 'playing' && currentNote && (
        <section className={styles.playPanel}>
          <div className={styles.progressRow}>
            <div>
              <div className={styles.progressText}>第 {currentIndex + 1} / {questions.length} 题</div>
              <div className={styles.progressSub}>{getClefLabel(currentNote.clef)} · {difficultyMeta.label}</div>
            </div>
            <div className={styles.timerBox}>
              <span>{formatTime(elapsedMs)}</span>
              <small>本题 {formatTime(currentElapsedMs)}</small>
            </div>
          </div>

          <div className={styles.staffCard}>
            <Staff note={currentNote} />
          </div>

          <div className={styles.answerGrid}>
            {ANSWER_OPTIONS.map((option) => (
              <button
                key={option.degree}
                type="button"
                className={styles.answerButton}
                disabled={isAdvancing}
                onClick={() => answer(option.degree)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className={styles.feedbackWrap}>
            {feedback ? (
              <div className={feedback.type === 'correct' ? styles.feedbackCorrect : styles.feedbackWrong}>
                {feedback.text}
              </div>
            ) : (
              <div className={styles.feedbackIdle}>选择你看到的音</div>
            )}
          </div>

          <Button block fill="outline" onClick={resetGame}>结束本局</Button>
        </section>
      )}

      {phase === 'finished' && result && (
        <section className={styles.panel}>
          <div className={styles.panelTitle}>本局成绩</div>
          <div className={styles.resultGrid}>
            <ScoreItem label="总时间" value={formatTime(result.totalTimeMs)} strong />
            <ScoreItem label="平均" value={formatTime(result.avgTimeMs)} />
            <ScoreItem label="错答" value={`${result.wrongAttempts} 次`} />
            <ScoreItem label="正确率" value={formatPercent(result.accuracy)} />
          </div>
          <div className={styles.resultActions}>
            <Button color="primary" onClick={startGame}>再来一局</Button>
            <Button fill="outline" onClick={resetGame}>回到设置</Button>
          </div>
        </section>
      )}

      <section className={styles.panel}>
        <div className={styles.historyHeader}>
          <div>
            <div className={styles.panelTitle}>本地成绩</div>
            <div className={styles.settingHint}>历史只保存在当前浏览器</div>
          </div>
          {history.length > 0 && (
            <Button size="small" fill="none" color="danger" onClick={clearHistory}>
              <DeleteOutline /> 清除
            </Button>
          )}
        </div>

        {bestSession ? (
          <div className={styles.bestBox}>
            <span>最佳平均</span>
            <strong>{formatTime(bestSession.avgTimeMs)}</strong>
            <em>{bestSession.questionCount} 题 · {getDifficultyLabel(bestSession.difficulty)}</em>
          </div>
        ) : (
          <div className={styles.emptyHistory}>完成一局后，这里会记录成绩。</div>
        )}

        {history.length > 0 && (
          <List className={styles.historyList}>
            {history.slice(0, 5).map((item) => (
              <List.Item
                key={item.id}
                extra={<RightOutline />}
                description={`${item.questionCount} 题 · ${getDifficultyLabel(item.difficulty)} · ${getClefModeLabel(item.clefMode)}`}
              >
                <div className={styles.historyItemTitle}>
                  <span>{formatDate(item.createdAt)}</span>
                  <strong>{formatTime(item.totalTimeMs)}</strong>
                </div>
                <div className={styles.historyMeta}>
                  平均 {formatTime(item.avgTimeMs)} · 错 {item.wrongAttempts} · 正确率 {formatPercent(item.accuracy)}
                </div>
              </List.Item>
            ))}
          </List>
        )}
      </section>
    </div>
  );
}

const ScoreItem = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => (
  <div className={strong ? styles.scoreItemStrong : styles.scoreItem}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const Staff = ({ note }: { note: PianoNote }) => {
  const width = 340;
  const height = 160;
  const lineGap = 14;
  const topY = 42;
  const bottomY = topY + lineGap * 4;
  const noteY = getStaffY(note, bottomY, lineGap);
  const noteX = 210;
  const ledgerLines = getLedgerLines(noteY, topY, bottomY, lineGap);
  const stemUp = noteY > topY + lineGap * 2;

  return (
    <svg
      role="img"
      aria-label={`${getClefLabel(note.clef)} ${note.label}`}
      className={styles.staffSvg}
      viewBox={`0 0 ${width} ${height}`}
    >
      <rect width={width} height={height} rx="12" fill="transparent" />
      {[0, 1, 2, 3, 4].map((index) => {
        const y = topY + index * lineGap;
        return <line key={index} x1="74" x2="306" y1={y} y2={y} className={styles.staffLine} />;
      })}
      <text x="36" y="88" className={styles.clefMark}>{note.clef === 'treble' ? '𝄞' : '𝄢'}</text>
      {ledgerLines.map((y) => (
        <line key={y} x1={noteX - 19} x2={noteX + 19} y1={y} y2={y} className={styles.staffLine} />
      ))}
      <ellipse
        cx={noteX}
        cy={noteY}
        rx="12"
        ry="8"
        transform={`rotate(-18 ${noteX} ${noteY})`}
        className={styles.noteHead}
      />
      <line
        x1={noteX + 10}
        x2={noteX + 10}
        y1={noteY}
        y2={stemUp ? noteY - 46 : noteY + 46}
        className={styles.noteStem}
      />
      <text x="170" y="142" className={styles.staffHint}>{getClefLabel(note.clef)}</text>
    </svg>
  );
};

const generateQuestion = (difficulty: Difficulty, clefMode: ClefMode): PianoNote => {
  const clef: Clef = clefMode === 'random' ? randomItem(['treble', 'bass']) : clefMode;
  const pool = buildNotePool(difficulty, clef);
  return randomItem(pool);
};

const buildNotePool = (difficulty: Difficulty, clef: Clef): PianoNote[] => {
  if (difficulty === 'basic') {
    return buildNotes(['C', 'D', 'E', 'F', 'G'], clef, clef === 'treble' ? 4 : 3);
  }

  if (difficulty === 'weak') {
    return buildNotes(['A', 'B', 'A', 'B', 'A', 'B', 'C', 'D', 'E', 'F', 'G'], clef, clef === 'treble' ? 4 : 3);
  }

  if (difficulty === 'high') {
    return buildNotes(NOTE_NAMES, clef, clef === 'treble' ? 5 : 3);
  }

  if (clef === 'treble') {
    return [
      ...buildNotes(NOTE_NAMES, clef, 4),
      ...buildNotes(NOTE_NAMES, clef, 5),
      ...buildNotes(['A', 'B', 'A', 'B'], clef, 4),
    ];
  }

  return [
    ...buildNotes(NOTE_NAMES, clef, 2),
    ...buildNotes(NOTE_NAMES, clef, 3),
    ...buildNotes(['A', 'B', 'A', 'B'], clef, 3),
  ];
};

const buildNotes = (names: NoteName[], clef: Clef, octave: number): PianoNote[] =>
  names.map((name) => ({
    clef,
    name,
    octave,
    degree: (NOTE_INDEX[name] + 1) as ScaleDegree,
    label: `${NOTE_INDEX[name] + 1}(${name})`,
  }));

const getStaffY = (note: PianoNote, bottomY: number, lineGap: number) => {
  const reference = note.clef === 'treble' ? diatonicIndex('E', 4) : diatonicIndex('G', 2);
  return bottomY - (diatonicIndex(note.name, note.octave) - reference) * (lineGap / 2);
};

const getLedgerLines = (noteY: number, topY: number, bottomY: number, lineGap: number) => {
  const lines: number[] = [];
  if (noteY > bottomY + lineGap / 2) {
    for (let y = bottomY + lineGap; y <= noteY + 1; y += lineGap) lines.push(y);
  }
  if (noteY < topY - lineGap / 2) {
    for (let y = topY - lineGap; y >= noteY - 1; y -= lineGap) lines.push(y);
  }
  return lines;
};

const diatonicIndex = (name: NoteName, octave: number) => octave * 7 + NOTE_INDEX[name];

const randomItem = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

const loadHistory = (): PianoSessionRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
};

const saveHistory = (records: PianoSessionRecord[]) => {
  if (typeof window === 'undefined') return;
  try {
    if (records.length === 0) {
      window.localStorage.removeItem(HISTORY_KEY);
      return;
    }
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, MAX_HISTORY)));
  } catch {
    // Ignore localStorage quota or privacy-mode failures.
  }
};

const getBestSession = (records: PianoSessionRecord[]) => {
  if (records.length === 0) return null;
  return records.reduce((best, current) => (current.avgTimeMs < best.avgTimeMs ? current : best), records[0]);
};

const getDifficultyLabel = (difficulty: Difficulty) =>
  DIFFICULTIES.find((item) => item.value === difficulty)?.label ?? difficulty;

const getClefModeLabel = (clefMode: ClefMode) => CLEF_MODES.find((item) => item.value === clefMode)?.label ?? clefMode;

const getClefLabel = (clef: Clef) => (clef === 'treble' ? '高音谱' : '低音谱');

const formatAnswer = (degree: ScaleDegree) => ANSWER_OPTIONS.find((item) => item.degree === degree)?.label ?? `${degree}`;

const formatTime = (ms: number) => {
  const totalSeconds = Math.max(0, ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
};

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知时间';
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
