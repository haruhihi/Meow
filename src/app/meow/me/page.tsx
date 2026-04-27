'use client';
import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { Button, List, Toast, Dialog, Input, Modal, Form } from 'antd-mobile';
import {
  UserOutline,
  PayCircleOutline,
  DownlandOutline,
  AppstoreOutline,
  FileOutline,
  RightOutline,
} from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';
import { useUserInfo } from '@utils/user';
import { useMonthBudget, upsertMonthBudget } from '@utils/transaction';
import { post } from '@libs/fetch';
import { ITransactionAnalyzeReq, ITransactionAnalyzeRes } from '@dtos/meow';
import { formatMoney } from '@styles/theme';
import { TopLoading } from '@components/loading';
import styles from './me.module.scss';

export default function App() {
  const router = useRouter();
  const userInfo = useUserInfo();
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [month, setMonth] = useState(dayjs());
  const [refreshKey, setRefreshKey] = useState(0);
  const [budgetVisible, setBudgetVisible] = useState(false);
  const budget = useMonthBudget(month, refreshKey);

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

      <div className={styles.card}>
        <div className={styles.cardTitle}>
          <PayCircleOutline /> 本月预算
        </div>
        <div className={styles.budgetRow}>
          <div>
            <div className={styles.budgetLabel}>{month.format('YYYY 年 M 月')}</div>
            <div className={styles.budgetValue}>
              {budget ? formatMoney(budget.amount) : '未设置'}
            </div>
          </div>
          <Button
            color="primary"
            size="small"
            onClick={() => setBudgetVisible(true)}
          >
            {budget ? '修改' : '设置'}
          </Button>
        </div>
      </div>

      <List header="设置" className={styles.list}>
        <List.Item
          prefix={<FileOutline />}
          extra={<RightOutline />}
          onClick={() => router.push('/meow/articles')}
          description="浏览已同步文章列表"
        >
          文章
        </List.Item>
        <List.Item
          prefix={<DownlandOutline />}
          extra={<RightOutline />}
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

      <BudgetModal
        visible={budgetVisible}
        current={budget?.amount ?? 0}
        month={month}
        onClose={() => setBudgetVisible(false)}
        onMonthChange={setMonth}
        onSave={async (amt) => {
          try {
            await upsertMonthBudget(month.year(), month.month() + 1, amt);
            Toast.show({ content: amt > 0 ? '已保存' : '已清除预算' });
            setBudgetVisible(false);
            setRefreshKey((k) => k + 1);
          } catch (e) {
            Toast.show({ content: `保存失败: ${(e as any)?.result ?? e}` });
          }
        }}
      />
    </div>
  );
}

const BudgetModal: React.FC<{
  visible: boolean;
  current: number;
  month: dayjs.Dayjs;
  onClose: () => void;
  onMonthChange: (m: dayjs.Dayjs) => void;
  onSave: (amount: number) => Promise<void>;
}> = ({ visible, current, month, onClose, onSave }) => {
  return (
    <Modal
      visible={visible}
      title={`${month.format('YYYY 年 M 月')} 预算`}
      closeOnMaskClick
      showCloseButton
      onClose={onClose}
      content={
        <Form
          layout="horizontal"
          initialValues={{ amount: current || '' }}
          footer={
            <div style={{ display: 'flex', gap: 8 }}>
              <Button block type="submit" color="primary">
                保存
              </Button>
              <Button
                block
                color="default"
                onClick={() => onSave(0)}
              >
                清除
              </Button>
            </div>
          }
          onFinish={(v: { amount: string }) => onSave(Number(v.amount))}
        >
          <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入预算金额' }]}>
            <Input placeholder="如 3000" type="number" />
          </Form.Item>
        </Form>
      }
    />
  );
};
