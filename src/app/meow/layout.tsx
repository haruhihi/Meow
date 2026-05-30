'use client';
import { useRouter, usePathname } from 'next/navigation';
import React, { useEffect } from 'react';
import type { FC } from 'react';
import { TabBar } from 'antd-mobile';
import { ClockCircleOutline, HistogramOutline, PayCircleOutline, UserOutline } from 'antd-mobile-icons';
import { StockStoreProvider } from '@stores/stock-store-context';
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
  const pathname = usePathname();
  const isStocksDocumentScrollRoute = pathname === '/meow/stocks' || /^\/meow\/stocks\/(?!snapshots$)[^/]+$/.test(pathname);

  useEffect(() => {
    if (!isStocksDocumentScrollRoute) return;

    const root = document.documentElement;
    const body = document.body;
    const previousBodyHeight = body.style.height;

    root.classList.add('meow-document-scroll');
    body.classList.add('meow-document-scroll');
    body.style.height = 'auto';

    return () => {
      root.classList.remove('meow-document-scroll');
      body.classList.remove('meow-document-scroll');
      body.style.height = previousBodyHeight;
    };
  }, [isStocksDocumentScrollRoute]);

  return (
    <div className={`${styles.app} ${isStocksDocumentScrollRoute ? styles.documentScrollApp : ''}`}>
      {/* <div className={styles.top}>
        <NavBar>Meow</NavBar>
      </div> */}
      <div className={styles.body}>
        <StockStoreProvider>{props.children}</StockStoreProvider>
      </div>
      <div className={styles.bottom}>
        <Bottom />
      </div>
    </div>
  );
};

export default App;
