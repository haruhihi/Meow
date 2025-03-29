'use client';
import { useState, useEffect } from 'react';
import styles from './index.module.scss';
import { SideBar } from './side-bar';
import { Input, message, Space, Spin } from 'antd';
import { Card } from './card';
import { AI_Tool } from '@prisma/client';

export const Main: React.FC<{ tools: AI_Tool[] }> = (props) => {
  const [query, setQuery] = useState('');
  const [tools, setTools] = useState<AI_Tool[]>([...props.tools]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);

  const fetchTools = async () => {
    try {
      setLoading(true);
      // 模拟请求后端数据
      let category = {};
      if (categories.length > 1) {
        category = { category2: categories[0], category1: categories[1] };
      }
      const res = await window
        .fetch('https://aitoolstest-fwbqd0hwcsepd9bs.eastasia-01.azurewebsites.net/search', {
          method: 'POST',
          body: JSON.stringify({ query, page, pageSize: 24, ...category }),
          headers: {
            'Content-Type': 'application/json',
          }
        })
        .then((res) => res.json());
      if (res && res.success) {
        setTools((prev) => [...prev, ...res.result]);
        setLoading(false);
      }
    } catch (error) {
      message.error('Failed to fetch tools');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, [page, categories, query]);

  return (
    <div className={styles.wrap}>
      <aside className={styles.sideBarWrap}>
        <SideBar
          onClickItem={(v) => {
            setTools([]);
            setPage(0);
            setCategories(v);
          }}
        />
      </aside>
      <div
        className={styles.mainWrap}
        onScroll={(ev) => {
          const container = ev.target as HTMLDivElement;
          if (container.scrollTop + container.clientHeight >= container.scrollHeight && !loading) {
            setPage((prev) => prev + 1);
          }
        }}
      >
        <main className={styles.main}>
          <h1 className={styles.title}>Tools</h1>
          <h2 className={styles.subTitle}>Discover and use our powerful AI tools to enhance your workflow</h2>
          <div className={styles.content}>
            <div className={styles.searchBoxWrap}>
              <Space.Compact size="large" style={{ width: '100%' }}>
                <Input.Search
                  placeholder="Search tools..."
                  allowClear
                  className={styles.searchBox}
                  value={query}
                  onChange={(ev) => {
                    setTools([]);
                    setPage(0);
                    setQuery(ev.target.value);
                  }}
                  style={{ width: '100%' }}
                />
              </Space.Compact>
            </div>

            <div className={styles.cardsWrap}>
              {tools.map((item, index) => {
                return (
                  <div className={styles.cardWrap} key={index}>
                    <Card item={item} />
                  </div>
                );
              })}
            </div>
            {loading && (
              <div className={styles.loadingWrap}>
                <Spin />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
