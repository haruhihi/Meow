'use client';

import { useMemo, useState } from 'react';
import { post } from '@libs/fetch';
import type { ArticleListItem } from '@libs/article-db';
import styles from './articles.module.scss';

const UNKNOWN_KEY = 'unknown';

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

const yearOf = (value: string | null) => {
  if (!value) return UNKNOWN_KEY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return UNKNOWN_KEY;
  return String(d.getFullYear());
};

interface Props {
  articles: ArticleListItem[];
}

export default function ArticlesList({ articles }: Props) {
  const [items, setItems] = useState(articles);
  const [activeYear, setActiveYear] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState('');
  const [saving, setSaving] = useState(false);

  const yearGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of items) {
      const key = yearOf(a.publishDate);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const known = Array.from(map.entries())
      .filter(([k]) => k !== UNKNOWN_KEY)
      .sort((a, b) => Number(b[0]) - Number(a[0]));
    const unknown = map.get(UNKNOWN_KEY);
    const result = [...known];
    if (unknown) {
      result.push([UNKNOWN_KEY, unknown]);
    }
    return result;
  }, [items]);

  const filtered = useMemo(() => {
    if (activeYear === 'all') return items;
    return items.filter((a) => yearOf(a.publishDate) === activeYear);
  }, [items, activeYear]);

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
      <nav className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeYear === 'all' ? styles.tabActive : ''}`}
          onClick={() => setActiveYear('all')}
        >
          全部 <em>{items.length}</em>
        </button>
        {yearGroups.map(([key, count]) => (
          <button
            key={key}
            type="button"
            className={`${styles.tab} ${activeYear === key ? styles.tabActive : ''}`}
            onClick={() => setActiveYear(key)}
          >
            {key === UNKNOWN_KEY ? '未知' : `${key} 年`} <em>{count}</em>
          </button>
        ))}
      </nav>

      <div className={styles.list}>
        {filtered.map((article) => {
          const isEditing = editingId === article.id;
          return (
            <a key={article.id} href={`/meow/articles/${article.id}`} className={styles.item}>
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
        {filtered.length === 0 && <div className={styles.empty}>该年份暂无文章</div>}
      </div>
    </>
  );
}
