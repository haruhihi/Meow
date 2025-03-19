'use client';
import { useState, useEffect } from 'react';
import styles from './index.module.scss';
import { SideBar } from './side-bar';
import { Input, message, Space, Spin } from 'antd';
import { AI_Tool } from '@prisma/client';
import { items } from './side-bar/config';
import { ArrowUpOutlined, SendOutlined } from '@ant-design/icons';
import Markdown from 'react-markdown';
export const Main: React.FC<{ markdown: string }> = (props) => {
  const [query, setQuery] = useState('');
  const [tools, setTools] = useState<AI_Tool[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [isShowItems, setIsShowItems] = useState(false);

  const { markdown } = props;

  const fetchTools = async () => {
    try {
    } catch (error) {
      message.error('Failed to fetch tools');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, [page, categories, query]);

  useEffect(() => {
    setIsShowItems(true);
  }, []);

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
          <div className={styles.chat}>
            <div className={styles.chatContent}>
              <div className={styles.bubble}>I want to thank person for reason, draft a warm email for me.</div>
              <div
                className={
                  styles.bubble + ' ' + styles.bubbleLeft + ' prose prose-base prose-blue max-w-none space-y-1'
                }
              >
                <Markdown>{markdown}</Markdown>
              </div>
            </div>
            <div className={styles.inputWrap}>
              I want to thank{' '}
              <span id="cs-custom-input-1" contentEditable="true" className={styles.inputCustom}>
                person
              </span>{' '}
              for
              <span id="cs-custom-input-1" contentEditable="true" className={styles.inputCustom}>
                reason
              </span>
              , draft a warm email for me.
              <div className={styles.send} onClick={() => {}}>
                {/* <SendOutlined /> */}
                <ArrowUpOutlined />
              </div>
            </div>
            <div
              className={styles.items}
              style={{ opacity: isShowItems ? 1 : 0, pointerEvents: isShowItems ? 'auto' : 'none' }}
              onClick={() => setIsShowItems(false)}
            >
              {items.map((item) => (
                <div key={item.key} className={styles.item}>
                  <div className={styles.icon}>{item.icon}</div>
                  <div className={styles.name}>{item.label}</div>
                  <div className={styles.extra}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
