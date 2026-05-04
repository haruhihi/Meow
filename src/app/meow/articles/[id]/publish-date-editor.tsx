'use client';

import { useState } from 'react';
import { post } from '@libs/fetch';
import styles from '../articles.module.scss';

const formatDate = (value: string | null) => {
  if (!value) return '未标日期';
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
  id: string;
  publishDate: string | null;
}

export default function PublishDateEditor({ id, publishDate }: Props) {
  const [current, setCurrent] = useState<string | null>(publishDate);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(toInputDate(publishDate));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await post<{ id: string; publishDate: string | null }, { publishDate: string | null }>(
        '/api/article/update-date',
        { id, publishDate: draft ? draft : null },
      );
      setCurrent(result.publishDate);
      setDraft(toInputDate(result.publishDate));
      setEditing(false);
    } catch (err) {
      console.error(err);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <span className={styles.detailDate}>
        <span>{formatDate(current)}</span>
        <button type="button" className={styles.dateEditBtn} onClick={() => setEditing(true)}>
          {current ? '修改' : '设置'}
        </button>
      </span>
    );
  }

  return (
    <span className={styles.dateEditor}>
      <input type="date" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button type="button" onClick={save} disabled={saving}>
        保存
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setDraft(toInputDate(current));
        }}
        disabled={saving}
      >
        取消
      </button>
    </span>
  );
}
