'use client';
import { Button, List, Dialog } from 'antd-mobile';
import {
  UserOutline,
  PayCircleOutline,
  AppstoreOutline,
  FileOutline,
} from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';
import { useUserInfo } from '@utils/user';
import { TopLoading } from '@components/loading';
import styles from './me.module.scss';

export default function App() {
  const router = useRouter();
  const userInfo = useUserInfo();

  if (!userInfo?.user) return <TopLoading />;
  const { user } = userInfo;

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
          description="查看作息分析与基本面研报"
        >
          AI报告
        </List.Item>
        <List.Item
          prefix={<FileOutline />}
          onClick={() => router.push('/meow/life-reports')}
          description="查看作息分析文章列表"
        >
          作息报告
        </List.Item>
        <List.Item
          prefix={<FileOutline />}
          onClick={() => router.push('/meow/articles')}
          description="浏览已同步文章列表"
        >
          剑客文章
        </List.Item>
        <List.Item
          prefix={<AppstoreOutline />}
          onClick={() => router.push('/meow/piano')}
          description="高低音谱随机识别训练"
        >
          钢琴识谱
        </List.Item>
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
