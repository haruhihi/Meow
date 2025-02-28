'use client';
import { useState } from 'react';
import styles from './index.module.scss';
import { SideBar } from './side-bar';
import { Input, Space } from 'antd';
import { Card } from './card';
import { data } from './mock';

export default function App() {
  const [query, setQuery] = useState('');

  return (
    <div className={styles.wrap}>
      <aside className={styles.sideBarWrap}>
        <SideBar />
      </aside>
      <div className={styles.mainWrap}>
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
                  onChange={(ev) => setQuery(ev.target.value)}
                  style={{ width: '100%' }}
                />
              </Space.Compact>
            </div>

            <div className={styles.cardsWrap}>
              {data.map((item, index) => {
                return (
                  <div className={styles.cardWrap} key={index}>
                    <Card item={item} />
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
