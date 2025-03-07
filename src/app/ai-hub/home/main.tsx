'use client';
import { useState } from 'react';
import styles from './index.module.scss';
import { SideBar } from './side-bar';
import { Input, Space } from 'antd';
import { Card } from './card';
import { AI_Tool } from '@prisma/client';

export const Main: React.FC<{ tools: AI_Tool[] }> = (props) => {
  const { tools } = props;
  console.log('tools', tools);
  const [query, setQuery] = useState('');
  return (
    <div className={styles.wrap}>
      <aside className={styles.sideBarWrap}>
        <SideBar tools={tools} />
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
              {tools
                .filter((item) => !query || item.name.toLowerCase().indexOf(query.toLowerCase()) > -1)
                .map((item, index) => {
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
};
