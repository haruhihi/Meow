'use client';

import { useEffect, useRef, useState } from 'react';
import { post } from '@libs/fetch';
import type { ArticleListItem, ArticleYearCount } from '@libs/article-db';
import styles from './articles.module.scss';

const UNKNOWN_KEY = 'unknown';
const HISTORY_KEY = 'meow.articles.searchHistory';
const SCROLL_KEY = 'meow.articles.scrollY';
const HISTORY_MAX = 10;

const formatDate = (value: string | null) => {
  if (!value) {
    return '未标日期';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
};

const toInputDate = (value: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

interface Props {
  initialArticles: ArticleListItem[];
  yearCounts: ArticleYearCount[];
  total: number;
  pageSize: number;
}

type YearFilter = 'all' | typeof UNKNOWN_KEY | string;

const yearFilterToParam = (filter: YearFilter): number | null | undefined => {
  if (filter === 'all') return undefined;
  if (filter === UNKNOWN_KEY) return null;
  return Number(filter);
};

const loadHistory = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const saveHistory = (list: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
};

export default function ArticlesList({ initialArticles, yearCounts, total, pageSize }: Props) {
  const [items, setItems] = useState<ArticleListItem[]>(initialArticles);
  const [activeYear, setActiveYear] = useState<YearFilter>('all');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialArticles.length >= pageSize);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    const value = window.sessionStorage.getItem(SCROLL_KEY);
    if (!value) return;
    window.sessionStorage.removeItem(SCROLL_KEY);
    requestAnimationFrame(() => window.scrollTo(0, Number(value) || 0));
  }, [items.length]);

  useEffect(() => {
    if (!historyOpen) return;
    const handler = (e: MouseEvent) => {
      if (!searchBoxRef.current) return;
      if (!searchBoxRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [historyOpen]);

  const yearGroups: [string, number][] = [
    ...yearCounts
      .filter((y) => y.year !== null)
      .map((y) => [String(y.year), y.count] as [string, number]),
  ];
  const unknownCount = yearCounts.find((y) => y.year === null)?.count ?? 0;
  if (unknownCount > 0) {
    yearGroups.push([UNKNOWN_KEY, unknownCount]);
  }

  const filterCount =
    activeYear === 'all'
      ? total
      : activeYear === UNKNOWN_KEY
        ? unknownCount
        : (yearCounts.find((y) => String(y.year) === activeYear)?.count ?? 0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await post<
          { year?: number | null; offset: number; limit: number; keyword?: string },
          { articles: ArticleListItem[] }
        >('/api/article/list', {
          year: yearFilterToParam(activeYear),
          offset: 0,
          limit: pageSize,
          keyword: keyword || undefined,
        });
        if (cancelled) return;
        setItems(res.articles);
        setHasMore(res.articles.length >= pageSize);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (activeYear === 'all' && !keyword) {
      // Already have initial first page from server.
      setItems(initialArticles);
      setHasMore(initialArticles.length >= pageSize);
      return () => {
        cancelled = true;
      };
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeYear, keyword]);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await post<
        { year?: number | null; offset: number; limit: number; keyword?: string },
        { articles: ArticleListItem[] }
      >('/api/article/list', {
        year: yearFilterToParam(activeYear),
        offset: items.length,
        limit: pageSize,
        keyword: keyword || undefined,
      });
      setItems((prev) => [...prev, ...res.articles]);
      setHasMore(res.articles.length >= pageSize);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const pushHistory = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setHistory((prev) => {
      const next = [trimmed, ...prev.filter((x) => x !== trimmed)].slice(0, HISTORY_MAX);
      saveHistory(next);
      return next;
    });
  };

  const submitSearch = (q: string) => {
    const trimmed = q.trim();
    setSearchInput(trimmed);
    setKeyword(trimmed);
    setHistoryOpen(false);
    if (trimmed) pushHistory(trimmed);
  };

  const clearSearch = () => {
    setSearchInput('');
    setKeyword('');
    setHistoryOpen(false);
  };

  const removeHistory = (q: string) => {
    setHistory((prev) => {
      const next = prev.filter((x) => x !== q);
      saveHistory(next);
      return next;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  const startEdit = (e: React.MouseEvent, item: ArticleListItem) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(item.id);
    setDraftDate(toInputDate(item.publishDate));
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(null);
    setDraftDate('');
  };

  const saveEdit = async (e: React.MouseEvent, item: ArticleListItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (saving) return;
    setSaving(true);
    try {
      const result = await post<{ id: string; publishDate: string | null }, { publishDate: string | null }>(
        '/api/article/update-date',
        { id: item.id, publishDate: draftDate ? draftDate : null },
      );
      setItems((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, publishDate: result.publishDate } : a)),
      );
      setEditingId(null);
      setDraftDate('');
    } catch (err) {
      console.error(err);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div ref={searchBoxRef} className={styles.searchBox}>
        <form
          className={styles.searchForm}
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch(searchInput);
          }}
        >
          <input
            type="search"
            value={searchInput}
            placeholder="搜索标题 / 作者 / 正文"
            onChange={(e) => setSearchInput(e.target.value)}
            onFocus={() => setHistoryOpen(true)}
          />
          {searchInput && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => {
                setSearchInput('');
                if (keyword) clearSearch();
              }}
              aria-label="清空"
            >
              ×
            </button>
          )}
          <button type="submit" className={styles.searchSubmit}>
            搜索
          </button>
        </form>
        {historyOpen && history.length > 0 && (
          <div className={styles.historyPanel}>
            <div className={styles.historyHeader}>
              <span>搜索历史</span>
              <button type="button" onClick={clearHistory}>
                清空
              </button>
            </div>
            <ul className={styles.historyList}>
              {history.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    className={styles.historyItem}
                    onClick={() => {
                      setSearchInput(q);
                      submitSearch(q);
                    }}
                  >
                    {q}
                  </button>
                  <button
                    type="button"
                    className={styles.historyRemove}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeHistory(q);
                    }}
                    aria-label="删除"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {keyword && (
          <div className={styles.searchInfo}>
            搜索：<strong>{keyword}</strong>
            <button type="button" onClick={clearSearch}>
              清除
            </button>
          </div>
        )}
      </div>

      <nav className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeYear === 'all' ? styles.tabActive : ''}`}
          onClick={() => setActiveYear('all')}
        >
          全部 <em>{total}</em>
        </button>
        {yearGroups.map(([key, count]) => (
          <button
            key={key}
            type="button"
            className={`${styles.tab} ${activeYear === key ? styles.tabActive : ''}`}
            onClick={() => setActiveYear(key as YearFilter)}
          >
            {key === UNKNOWN_KEY ? '未知' : `${key} 年`} <em>{count}</em>
          </button>
        ))}
      </nav>

      <div className={styles.list}>
        {items.map((article) => {
          const isEditing = editingId === article.id;
          return (
            <a
              key={article.id}
              href={`/meow/articles/${article.id}`}
              className={styles.item}
              onClick={() => window.sessionStorage.setItem(SCROLL_KEY, String(window.scrollY))}
            >
              <div className={styles.itemMeta}>
                <span>{formatDate(article.publishDate)}</span>
                <span>{article.author}</span>
                <span>{article.source}</span>
                {!isEditing && (
                  <button type="button" className={styles.dateEditBtn} onClick={(e) => startEdit(e, article)}>
                    {article.publishDate ? '修改日期' : '设置日期'}
                  </button>
                )}
              </div>
              {isEditing && (
                <div className={styles.dateEditor} onClick={(e) => e.preventDefault()}>
                  <input
                    type="date"
                    value={draftDate}
                    onChange={(e) => setDraftDate(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button type="button" onClick={(e) => saveEdit(e, article)} disabled={saving}>
                    保存
                  </button>
                  <button type="button" onClick={cancelEdit} disabled={saving}>
                    取消
                  </button>
                </div>
              )}
              <h2>{article.title}</h2>
              <p>{article.excerpt}</p>
              {article.tags.length > 0 && (
                <div className={styles.tags}>
                  {article.tags.slice(0, 4).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              )}
            </a>
          );
        })}
        {items.length === 0 && !loading && (
          <div className={styles.empty}>{keyword ? '未找到匹配的文章' : '该年份暂无文章'}</div>
        )}
      </div>

      <div className={styles.loadMore}>
        {hasMore ? (
          <button type="button" onClick={loadMore} disabled={loading}>
            {loading ? '加载中...' : '加载更多'}
          </button>
        ) : (
          items.length > 0 && (
            <span className={styles.loadMoreEnd}>
              已加载 {items.length} / {filterCount}
            </span>
          )
        )}
      </div>
    </>
  );
}
