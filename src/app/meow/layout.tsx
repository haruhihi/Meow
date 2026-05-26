'use client';
import { useRouter, usePathname } from 'next/navigation';
import React, { useEffect } from 'react';
import type { FC } from 'react';
import { TabBar } from 'antd-mobile';
import { ClockCircleOutline, HistogramOutline, PayCircleOutline, UserOutline } from 'antd-mobile-icons';
import styles from './index.module.scss';

const Bottom: FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const tabs = [
    {
      key: '/meow/stocks',
      title: '股票',
      icon: <PayCircleOutline />,
    },
    {
      key: '/meow/bill',
      title: '账单',
      icon: <HistogramOutline />,
    },
    {
      key: '/meow/time',
      title: '时间',
      icon: <ClockCircleOutline />,
    },
    {
      key: '/meow/me',
      title: '我的',
      icon: <UserOutline />,
    },
  ];

  useEffect(() => {
    if ((window as any).eruda) {
      (window as any).eruda.init();
    }
  }, []);
  if (pathname === '/meow/analyze') {
    return null;
  }
  return (
    <TabBar activeKey={pathname} onChange={(value) => router.push(value)} safeArea className={styles.tabBarWrap}>
      {tabs.map((item) => (
        <TabBar.Item key={item.key} icon={item.icon} title={item.title} />
      ))}
    </TabBar>
  );
};

const App: React.FC<{ children: React.ReactNode }> = (props) => {
  return (
    <div className={styles.app}>
      {/* <div className={styles.top}>
        <NavBar>Meow</NavBar>
      </div> */}
      <div className={styles.body}>{props.children}</div>
      <div className={styles.bottom}>
        <Bottom />
      </div>
    </div>
  );
};

export default App;
