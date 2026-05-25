'use client';
import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { Button, List, Toast, Dialog } from 'antd-mobile';
import {
  UserOutline,
  PayCircleOutline,
  DownlandOutline,
  AppstoreOutline,
  FileOutline,
} from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';
import { useUserInfo } from '@utils/user';
import { post } from '@libs/fetch';
import { ITransactionAnalyzeReq, ITransactionAnalyzeRes } from '@dtos/meow';
import { TopLoading } from '@components/loading';
import styles from './me.module.scss';

export default function App() {
  const router = useRouter();
  const userInfo = useUserInfo();
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [month] = useState(dayjs());

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream);
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);
  }, []);

  if (!userInfo?.user) return <TopLoading />;
  const { user } = userInfo;

  const onExport = async () => {
    try {
      const res = await post<ITransactionAnalyzeReq, ITransactionAnalyzeRes>('/api/transaction/analyze', {
        year: month.year(),
        month: month.month() + 1,
        granularity: 'month',
      });
      const header = ['date', 'amount', 'category', 'description'];
      const rows = res.transactions.map((t) => [
        dayjs(t.date).format('YYYY-MM-DD HH:mm'),
        t.amount,
        t.category.name,
        (t.description ?? '').replace(/,/g, ' '),
      ]);
      const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
      const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meow-${month.format('YYYY-MM')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      Toast.show({ content: `已导出 ${res.transactions.length} 条记录` });
    } catch (e) {
      Toast.show({ content: `导出失败: ${(e as any)?.result ?? e}` });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.avatar}>
          <UserOutline />
        </div>
        <div className={styles.who}>
          <div className={styles.nickname}>{user.nickname || user.account}</div>
          <div className={styles.sub}>
            @{user.account} · ID {user.id}
          </div>
        </div>
      </div>

      <List header="设置" className={styles.list}>
        <List.Item
          prefix={<PayCircleOutline />}
          onClick={() => router.push('/meow/coupons')}
          description="管理共享券，生成默认月度券"
        >
          券管理
        </List.Item>
        <List.Item
          prefix={<PayCircleOutline />}
          onClick={() => router.push('/meow/stocks')}
          description="查看账户持仓和仓位占比"
        >
          股票持仓
        </List.Item>
        <List.Item
          prefix={<FileOutline />}
          onClick={() => router.push('/meow/ai-reports')}
          description="查看基本面与事件跟踪文章"
        >
          AI研报
        </List.Item>
        <List.Item
          prefix={<FileOutline />}
          onClick={() => router.push('/meow/articles')}
          description="浏览已同步文章列表"
        >
          文章
        </List.Item>
        <List.Item
          prefix={<AppstoreOutline />}
          onClick={() => router.push('/meow/piano')}
          description="高低音谱随机识别训练"
        >
          钢琴识谱
        </List.Item>
        <List.Item
          prefix={<DownlandOutline />}
          onClick={onExport}
          description={`导出 ${month.format('YYYY-MM')} 所有账单为 CSV`}
        >
          导出当月账单
        </List.Item>
        {!isStandalone && (
          <List.Item prefix={<AppstoreOutline />} description={isIOS ? '点击右上角分享 → 添加到主屏幕' : '从浏览器菜单选择 "添加到主屏幕"'}>
            安装到桌面
          </List.Item>
        )}
      </List>

      <div className={styles.danger}>
        <Button
          block
          color="danger"
          fill="outline"
          onClick={async () => {
            const ok = await Dialog.confirm({ title: '切换账号', content: '将退出当前账号并跳转登录页。' });
            if (ok) router.push('/user/sign');
          }}
        >
          切换账号
        </Button>
      </div>
    </div>
  );
}
