'use client';
import { useRouter, usePathname } from 'next/navigation';
import React, { useEffect } from 'react';
import type { FC } from 'react';
import { TabBar } from 'antd-mobile';
import { HistogramOutline, EditSOutline, UnorderedListOutline, UserOutline } from 'antd-mobile-icons';
import styles from './index.module.scss';
import { useUserInfo } from '@utils/user';

const Bottom: FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUserInfo();
  const tabs = [
    {
      key: '/meow/trek',
      title: '打卡',
      icon: <EditSOutline />,
    },
    {
      key: '/meow/bill',
      title: '账单',
      icon: <HistogramOutline />,
    },
    {
      key: '/meow/me',
      title: '我的',
      icon: <UserOutline />,
    },
  ];

  if (user && [1, 2].includes(user.id)) {
    tabs.unshift({
      key: '/meow/category',
      title: '类别',
      icon: <UnorderedListOutline />,
    });
  }

  useEffect(() => {
    console.log('window as any).eruda', (window as any).eruda);
    if ((window as any).eruda) {
      (window as any).eruda.init();
    }
  }, []);
  if (pathname === '/meow/texas') {
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
